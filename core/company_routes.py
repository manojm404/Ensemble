"""Company workspace routes for 0101.

Companies are durable operational workspaces. They own teams, agent
assignments, issues, budgets, approvals, workflow runs, and audit history.
This module starts with SQLite-backed persistence so local mode behaves like
the eventual Supabase-backed team mode.
"""

from __future__ import annotations

import json
import os
import re
import smtplib
import sqlite3
import time
import uuid
from email.message import EmailMessage
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from core.skill_registry import skill_registry

router = APIRouter(prefix="/api", tags=["companies"])

DB_PATH = os.getenv("ENSEMBLE_COMPANIES_DB", "data/ensemble_companies.db")
GOVERNANCE_DB_PATH = os.getenv("ENSEMBLE_GOVERNANCE_DB", "data/ensemble_governance.db")


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _connect() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    _init_db(conn)
    return conn


def _init_db(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS companies (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            name TEXT NOT NULL,
            mission TEXT NOT NULL DEFAULT '',
            emoji TEXT NOT NULL DEFAULT '🏢',
            industry TEXT,
            status TEXT NOT NULL DEFAULT 'Active',
            default_provider TEXT,
            budget_policy_json TEXT,
            security_policy_json TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS company_teams (
            id TEXT PRIMARY KEY,
            company_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            emoji TEXT NOT NULL DEFAULT '👥',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS company_agents (
            id TEXT PRIMARY KEY,
            company_id TEXT NOT NULL,
            team_id TEXT,
            skill_id TEXT,
            display_name TEXT NOT NULL,
            role TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'idle',
            emoji TEXT NOT NULL DEFAULT '🤖',
            model_provider TEXT,
            model_name TEXT,
            tool_policy_json TEXT,
            is_lead INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
            FOREIGN KEY(team_id) REFERENCES company_teams(id) ON DELETE SET NULL
        )
        """
    )
    agent_columns = {row[1] for row in conn.execute("PRAGMA table_info(company_agents)").fetchall()}
    for column, column_type in (
        ("description", "TEXT"),
        ("capabilities_json", "TEXT"),
        ("fired_at", "TEXT"),
        ("last_activity_at", "TEXT"),
    ):
        if column not in agent_columns:
            conn.execute(f"ALTER TABLE company_agents ADD COLUMN {column} {column_type}")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS company_issues (
            id TEXT PRIMARY KEY,
            company_id TEXT NOT NULL,
            team_id TEXT,
            assigned_agent_id TEXT,
            workflow_id TEXT,
            run_id TEXT,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            priority TEXT NOT NULL DEFAULT 'medium',
            status TEXT NOT NULL DEFAULT 'draft',
            result_artifact_hash TEXT,
            evaluation_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
            FOREIGN KEY(team_id) REFERENCES company_teams(id) ON DELETE SET NULL,
            FOREIGN KEY(assigned_agent_id) REFERENCES company_agents(id) ON DELETE SET NULL
        )
        """
    )
    issue_columns = {row[1] for row in conn.execute("PRAGMA table_info(company_issues)").fetchall()}
    for column, column_type in (
        ("prompt", "TEXT"),
        ("route_json", "TEXT"),
        ("output_type", "TEXT"),
        ("task_type", "TEXT"),
        ("schedule_json", "TEXT"),
        ("approval_state", "TEXT"),
        ("report_recipient_email", "TEXT"),
        ("report_on_completion", "INTEGER NOT NULL DEFAULT 0"),
        ("report_sent_at", "TEXT"),
        ("report_delivery_status", "TEXT"),
        ("report_delivery_details", "TEXT"),
    ):
        if column not in issue_columns:
            conn.execute(f"ALTER TABLE company_issues ADD COLUMN {column} {column_type}")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS company_activity (
            id TEXT PRIMARY KEY,
            company_id TEXT NOT NULL,
            action_type TEXT NOT NULL,
            message TEXT NOT NULL,
            details_json TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
        )
        """
    )
    conn.commit()


def _request_user_id(request: Request) -> Optional[str]:
    user = getattr(request.state, "user", None)
    if isinstance(user, dict):
        user_id = user.get("id")
        if user_id:
            return user_id
    else:
        user_id = getattr(user, "id", None)
        if user_id:
            return user_id

    header_user_id = (request.headers.get("X-0101-User-Id") or "").strip()
    header_email = (request.headers.get("X-0101-User-Email") or "").strip().lower()
    account_key = header_user_id or header_email
    if account_key:
        import hashlib

        digest = hashlib.sha256(account_key.encode("utf-8")).hexdigest()[:16]
        return f"local-account:{digest}"

    authorization = request.headers.get("Authorization", "")
    if authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
        if token:
            import hashlib

            digest = hashlib.sha256(token.encode("utf-8")).hexdigest()[:16]
            return f"local:{digest}"

    return None


def _ensure_company_access(conn: sqlite3.Connection, company_id: str, user_id: Optional[str]) -> None:
    row = conn.execute("SELECT user_id FROM companies WHERE id = ?", (company_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Company not found")

    owner_id = row["user_id"]
    if not owner_id and not user_id:
        return
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    if (
        isinstance(owner_id, str)
        and owner_id.startswith("local:")
        and isinstance(user_id, str)
        and user_id.startswith("local-account:")
    ):
        conn.execute(
            "UPDATE companies SET user_id = ?, updated_at = ? WHERE id = ?",
            (user_id, _now(), company_id),
        )
        return
    local_prefixes = ("local:", "local-account:", "dev")
    if (
        os.getenv("ENFORCE_AUTH", "true").lower() in {"false", "0", "no"}
        and isinstance(owner_id, str)
        and isinstance(user_id, str)
        and owner_id.startswith(local_prefixes)
        and user_id.startswith(local_prefixes)
    ):
        return
    if owner_id != user_id:
        raise HTTPException(status_code=403, detail="Company does not belong to the current user")


def _row_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return dict(row)


def _company_summary(conn: sqlite3.Connection, company_id: str) -> Dict[str, Any]:
    row = conn.execute("SELECT * FROM companies WHERE id = ?", (company_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Company not found")

    team_count = conn.execute(
        "SELECT COUNT(*) FROM company_teams WHERE company_id = ?", (company_id,)
    ).fetchone()[0]
    agent_count = conn.execute(
        "SELECT COUNT(*) FROM company_agents WHERE company_id = ?", (company_id,)
    ).fetchone()[0]
    issue_count = conn.execute(
        "SELECT COUNT(*) FROM company_issues WHERE company_id = ?", (company_id,)
    ).fetchone()[0]

    company = _row_dict(row)
    company.update(
        {
            "team_count": team_count,
            "agent_count": agent_count,
            "issue_count": issue_count,
            "teams": team_count,
            "agents": agent_count,
            "projects": issue_count,
        }
    )
    return company


def _activity(conn: sqlite3.Connection, company_id: str, action_type: str, message: str, details: Dict[str, Any] | None = None) -> None:
    conn.execute(
        """
        INSERT INTO company_activity (id, company_id, action_type, message, details_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            f"act-{uuid.uuid4().hex[:12]}",
            company_id,
            action_type,
            message,
            json.dumps(details or {}),
            _now(),
        ),
    )


def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone()
    return bool(row)


def _workflow_operations(company_id: str, issue_run_ids: List[str], issue_workflow_ids: List[str]) -> Dict[str, Any]:
    if not os.path.exists(GOVERNANCE_DB_PATH):
        return {"runs": [], "counts": {"total": 0, "running": 0, "completed": 0, "failed": 0, "paused": 0}}

    try:
        with sqlite3.connect(GOVERNANCE_DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            if not _table_exists(conn, "executions"):
                return {"runs": [], "counts": {"total": 0, "running": 0, "completed": 0, "failed": 0, "paused": 0}}

            clauses = ["company_id = ?"]
            params: List[Any] = [company_id]
            if issue_run_ids:
                placeholders = ",".join("?" for _ in issue_run_ids)
                clauses.append(f"run_id IN ({placeholders})")
                params.extend(issue_run_ids)
            if issue_workflow_ids:
                placeholders = ",".join("?" for _ in issue_workflow_ids)
                clauses.append(f"workflow_id IN ({placeholders})")
                params.extend(issue_workflow_ids)

            rows = conn.execute(
                f"""
                SELECT run_id, workflow_id, status, current_node, last_agent_id, started_at, completed_at
                FROM executions
                WHERE {" OR ".join(f"({clause})" for clause in clauses)}
                ORDER BY COALESCE(completed_at, started_at) DESC
                LIMIT 20
                """,
                params,
            ).fetchall()

            runs = [dict(row) for row in rows]
            counts = {
                "total": len(runs),
                "running": sum(1 for row in runs if row.get("status") in {"running", "queued"}),
                "completed": sum(1 for row in runs if row.get("status") == "completed"),
                "failed": sum(1 for row in runs if row.get("status") == "failed"),
                "paused": sum(1 for row in runs if str(row.get("status") or "").startswith("paused") or row.get("status") == "paused"),
            }
            return {"runs": runs, "counts": counts}
    except Exception:
        return {"runs": [], "counts": {"total": 0, "running": 0, "completed": 0, "failed": 0, "paused": 0}}


def _company_operations(conn: sqlite3.Connection, company_id: str) -> Dict[str, Any]:
    company = _company_summary(conn, company_id)
    teams = [dict(row) for row in conn.execute("SELECT * FROM company_teams WHERE company_id = ? ORDER BY created_at ASC", (company_id,)).fetchall()]
    agents = [dict(row) for row in conn.execute("SELECT * FROM company_agents WHERE company_id = ? ORDER BY created_at ASC", (company_id,)).fetchall()]
    issues = [dict(row) for row in conn.execute("SELECT * FROM company_issues WHERE company_id = ? ORDER BY created_at DESC", (company_id,)).fetchall()]
    activity = [dict(row) for row in conn.execute("SELECT * FROM company_activity WHERE company_id = ? ORDER BY created_at DESC LIMIT 20", (company_id,)).fetchall()]

    issue_counts = {
        "total": len(issues),
        "queued": sum(1 for issue in issues if issue.get("status") == "queued"),
        "running": sum(1 for issue in issues if issue.get("status") in {"running", "in_progress"}),
        "completed": sum(1 for issue in issues if issue.get("status") in {"completed", "completed_passed"}),
        "failed": sum(1 for issue in issues if issue.get("status") == "failed"),
        "blocked": sum(1 for issue in issues if issue.get("status") == "blocked"),
    }
    open_issues = issue_counts["queued"] + issue_counts["running"] + issue_counts["blocked"]
    issue_run_ids = [str(issue.get("run_id")) for issue in issues if issue.get("run_id")]
    issue_workflow_ids = [str(issue.get("workflow_id")) for issue in issues if issue.get("workflow_id")]
    workflow_ops = _workflow_operations(company_id, issue_run_ids, issue_workflow_ids)
    workflow_counts = workflow_ops["counts"]
    failed_signals = issue_counts["failed"] + workflow_counts.get("failed", 0)
    blocked_signals = issue_counts["blocked"] + workflow_counts.get("paused", 0)
    running_signals = issue_counts["running"] + workflow_counts.get("running", 0)
    total_signals = max(1, issue_counts["total"] + workflow_counts.get("total", 0))
    evaluation_pass_rate = round(((issue_counts["completed"] + workflow_counts.get("completed", 0)) / total_signals) * 100)
    health_score = max(35, min(100, 100 - failed_signals * 18 - blocked_signals * 10 - running_signals * 3))

    return {
        "company": company,
        "counts": {
            "teams": len(teams),
            "agents": len(agents),
            "issues": issue_counts,
            "workflows": workflow_counts,
            "open_issues": open_issues,
            "approvals_waiting": workflow_counts.get("paused", 0),
            "blocked_items": blocked_signals,
            "failed_runs": workflow_counts.get("failed", 0),
            "agent_health": {
                "idle": sum(1 for agent in agents if agent.get("status") == "idle"),
                "running": sum(1 for agent in agents if agent.get("status") == "running"),
                "paused": sum(1 for agent in agents if agent.get("status") == "paused"),
            },
            "evaluation_pass_rate": evaluation_pass_rate,
            "health_score": health_score,
        },
        "recent": {
            "issues": issues[:8],
            "activity": activity[:10],
            "runs": workflow_ops["runs"][:8],
            "artifacts": [
                {
                    "issue_id": issue.get("id"),
                    "title": issue.get("title"),
                    "workflow_id": issue.get("workflow_id"),
                    "run_id": issue.get("run_id"),
                    "artifact_hash": issue.get("result_artifact_hash"),
                }
                for issue in issues
                if issue.get("result_artifact_hash") or issue.get("workflow_id") or issue.get("run_id")
            ][:8],
        },
        "generated_at": _now(),
    }


def _skill_label(skill_id: str) -> str:
    return skill_id.replace("-", " ").replace("_", " ").title()


def _skill_map() -> Dict[str, Dict[str, Any]]:
    return {str(skill.get("id")): dict(skill) for skill in skill_registry.list_skills()}


def _normalize_lookup(value: Optional[str]) -> str:
    return re.sub(r"[^a-z0-9]+", "", (value or "").lower())


def _resolve_skill(skill_id: str, skill_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
    skills = _skill_map()
    if skill_id in skills:
        return skills[skill_id]

    targets = {_normalize_lookup(skill_id), _normalize_lookup(skill_name)}
    targets.discard("")
    if not targets:
        return None

    for skill in skills.values():
        candidates = {
            _normalize_lookup(str(skill.get("id") or "")),
            _normalize_lookup(str(skill.get("name") or "")),
            _normalize_lookup(str(skill.get("category") or "")),
            _normalize_lookup(str(skill.get("role") or "")),
        }
        if targets & candidates:
            return skill
    return None


def _active_agent_clause() -> str:
    return "LOWER(COALESCE(status, 'idle')) NOT IN ('fired', 'disabled', 'terminated')"


def _agent_payload(row: sqlite3.Row, skill: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    data = dict(row)
    skill = skill or _skill_map().get(str(data.get("skill_id") or ""), {})
    capabilities = []
    try:
        capabilities = json.loads(data.get("capabilities_json") or "[]")
    except Exception:
        capabilities = []
    if not capabilities:
        capabilities = skill.get("capabilities") or skill.get("tags") or []

    return {
        **data,
        "name": data.get("display_name") or skill.get("name") or _skill_label(str(data.get("skill_id") or "agent")),
        "display_name": data.get("display_name") or skill.get("name") or _skill_label(str(data.get("skill_id") or "agent")),
        "skill_source": data.get("skill_id"),
        "description": data.get("description") or skill.get("description") or "",
        "capabilities": capabilities,
        "category": skill.get("category"),
        "tags": skill.get("tags") or [],
    }


def _score_agent_for_prompt(agent: Dict[str, Any], prompt: str) -> float:
    prompt_tokens = set(re.findall(r"[a-z0-9]+", (prompt or "").lower()))
    fields = " ".join(
        [
            str(agent.get("display_name", "")),
            str(agent.get("name", "")),
            str(agent.get("role", "")),
            str(agent.get("skill_id", "")),
            str(agent.get("description", "")),
            " ".join(str(item) for item in agent.get("capabilities", []) or []),
            " ".join(str(item) for item in agent.get("tags", []) or []),
        ]
    ).lower()

    score = 0.0
    for token in prompt_tokens:
        if not token:
            continue
        if token in fields:
            score += 1.0
        if token in str(agent.get("role", "")).lower():
            score += 2.0
        if token in str(agent.get("skill_id", "")).lower():
            score += 2.5
        if token in str(agent.get("display_name", "")).lower():
            score += 1.5
    return score


def _missing_roles_for_prompt(prompt: str) -> List[Dict[str, str]]:
    text = (prompt or "").lower()
    recommendations: List[Dict[str, str]] = []
    role_sets = [
        (("website", "web", "landing", "frontend", "ui"), "Frontend Experience Developer"),
        (("design", "brand", "ui", "ux"), "UI Systems Designer"),
        (("soc2", "compliance", "audit", "evidence", "security"), "Compliance Evidence Reviewer"),
        (("research", "market", "competitor", "analysis"), "Research Analyst"),
        (("email", "inbox", "reply", "support"), "Support Operations Agent"),
    ]
    for keywords, role in role_sets:
        if any(keyword in text for keyword in keywords):
            recommendations.append({"role": role, "reason": f"Needed for prompts mentioning {', '.join(keywords[:2])}."})
    return recommendations[:3] or [{"role": "Workflow Architect", "reason": "Needed to plan and coordinate this task."}]


def _route_company_task(
    conn: sqlite3.Connection,
    company_id: str,
    prompt: str,
    department_id: Optional[str] = None,
    agent_ids: Optional[List[str]] = None,
    output_type: str = "auto",
) -> Dict[str, Any]:
    skills = _skill_map()
    params: List[Any] = [company_id]
    filters = ["company_id = ?", _active_agent_clause()]
    if department_id:
        filters.append("team_id = ?")
        params.append(department_id)
    if agent_ids:
        placeholders = ",".join("?" for _ in agent_ids)
        filters.append(f"id IN ({placeholders})")
        params.extend(agent_ids)

    rows = conn.execute(
        f"""
        SELECT * FROM company_agents
        WHERE {" AND ".join(filters)}
        ORDER BY is_lead DESC, created_at ASC
        """,
        params,
    ).fetchall()
    agents = [_agent_payload(row, skills.get(str(row["skill_id"]))) for row in rows]
    ranked = sorted(
        [(agent, _score_agent_for_prompt(agent, prompt)) for agent in agents],
        key=lambda item: (item[1], item[0].get("is_lead") or 0, item[0].get("display_name") or ""),
        reverse=True,
    )
    selected = [agent for agent, score in ranked if score > 0][:5]
    if not selected and agent_ids:
        selected = agents[:5]
    if not selected and agents:
        selected = agents[: min(3, len(agents))]

    stages = []
    for index, agent in enumerate(selected):
        stages.append(
            {
                "stage": f"stage_{index + 1}",
                "agent_id": agent["id"],
                "company_agent_id": agent["id"],
                "skill_id": agent.get("skill_id"),
                "agent_name": agent.get("display_name") or agent.get("name"),
                "requested_role": agent.get("role"),
                "department_id": agent.get("team_id"),
                "selection_reason": (
                    "Explicitly selected by the CEO."
                    if agent_ids and agent["id"] in agent_ids
                    else "Best active company hire for this task based on role, skill, and capability match."
                ),
                "match_confidence": min(0.98, max(0.55, _score_agent_for_prompt(agent, prompt) / 8)),
                "output_contract": "Complete your assigned role, hand off useful context, and keep the CEO result concise.",
                "approval_gates": ["external_send", "publish", "budget_threshold", "final_review"],
            }
        )

    missing_roles = [] if selected else _missing_roles_for_prompt(prompt)
    return {
        "company_id": company_id,
        "prompt": prompt,
        "output_type": output_type,
        "selected_agents": stages,
        "missing_roles": missing_roles,
        "route_quality": "ready" if stages else "needs_hiring",
        "routing_reason": (
            "Routed through the active hired workforce for this company."
            if stages
            else "No active hired agents matched this CEO task. Hire the missing roles first."
        ),
    }


def _workflow_from_task(task: Dict[str, Any]) -> Dict[str, Any]:
    route = json.loads(task.get("route_json") or "{}")
    stages = route.get("selected_agents") or []
    nodes = []
    edges = []
    for index, stage in enumerate(stages):
        node_id = f"task_agent_{index + 1}"
        nodes.append(
            {
                "id": node_id,
                "type": "agentNode",
                "position": {"x": 120 + index * 260, "y": 180},
                "data": {
                    "label": stage.get("agent_name") or stage.get("requested_role") or f"Agent {index + 1}",
                    "role": stage.get("requested_role") or "Agent",
                    "agent_id": stage.get("skill_id") or stage.get("agent_id"),
                    "company_agent_id": stage.get("company_agent_id") or stage.get("agent_id"),
                    "instruction": (
                        f"CEO task: {task.get('prompt') or task.get('description') or task.get('title')}\n\n"
                        f"Your role: {stage.get('requested_role') or 'Agent'}.\n"
                        "Do only your role, use prior handoff context, and produce a clear handoff/result."
                    ),
                    "selection_reason": stage.get("selection_reason"),
                    "output_contract": stage.get("output_contract"),
                },
            }
        )
        if index:
            edges.append({"id": f"edge_{index}", "source": f"task_agent_{index}", "target": node_id})

    metadata = {
        "internal_task": True,
        "task_id": task.get("id"),
        "workflow_mode": "execution",
        "stage_plan": stages,
        "routing_reason": route.get("routing_reason"),
        "route_quality": route.get("route_quality"),
        "final_output_type": task.get("output_type") or "auto",
        "schedule": json.loads(task.get("schedule_json") or "{}"),
    }
    return {"nodes": nodes, "edges": edges, "metadata": metadata}


def _valid_email(value: Optional[str]) -> bool:
    if not value:
        return False
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", value.strip()))


def _selected_agent_name(task: Dict[str, Any]) -> str:
    route = task.get("route") or {}
    selected = route.get("selected_agents") or []
    assigned_agent_id = task.get("assigned_agent_id") or task.get("agent_id")
    for agent in selected:
        if assigned_agent_id and agent.get("company_agent_id") == assigned_agent_id:
            return agent.get("agent_name") or agent.get("requested_role") or "Assigned agent"
    if selected:
        first = selected[0]
        return first.get("agent_name") or first.get("requested_role") or "Assigned agent"
    return "Assigned agent"


def _load_run_outputs(run_id: Optional[str], governance_db_path: Optional[str]) -> List[Dict[str, Any]]:
    if not run_id or not governance_db_path or not os.path.exists(governance_db_path):
        return []
    try:
        with sqlite3.connect(governance_db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """
                SELECT node_id, status, output, updated_at
                FROM node_executions
                WHERE run_id = ?
                ORDER BY updated_at ASC
                """,
                (run_id,),
            ).fetchall()
            return [dict(row) for row in rows]
    except Exception:
        return []


def _build_task_report(task: Dict[str, Any], governance_db_path: Optional[str] = None) -> str:
    route = task.get("route") or {}
    outputs = _load_run_outputs(task.get("run_id"), governance_db_path)
    selected = route.get("selected_agents") or []
    agent_name = _selected_agent_name(task)
    lines = [
        f"# CEO Task Report: {task.get('title') or 'CEO task'}",
        "",
        f"- Status: {task.get('status') or 'completed'}",
        f"- Assigned agent: {agent_name}",
        f"- Workflow: {task.get('workflow_id') or 'not linked'}",
        f"- Run: {task.get('run_id') or 'not linked'}",
        f"- Completed at: {task.get('updated_at') or _now()}",
        "",
        "## Assignment",
        "",
        task.get("prompt") or task.get("description") or task.get("title") or "",
        "",
    ]
    if selected:
        lines.extend(["## Agent Route", ""])
        for agent in selected:
            lines.append(
                f"- {agent.get('agent_name') or agent.get('requested_role')}: "
                f"{agent.get('selection_reason') or 'Selected for this task.'}"
            )
        lines.append("")

    completed_outputs = [
        item for item in outputs if item.get("status") == "completed" and (item.get("output") or "").strip()
    ]
    if completed_outputs:
        lines.extend(["## Agent Report", ""])
        for item in completed_outputs:
            output = str(item.get("output") or "").strip()
            if len(output) > 4000:
                output = f"{output[:4000].rstrip()}\n\n[Report truncated in email. Open the run output for the full artifact.]"
            lines.extend([f"### {item.get('node_id') or 'Agent'}", "", output, ""])
    else:
        lines.extend(
            [
                "## Agent Report",
                "",
                "The task is marked complete, but no node output was available in the local run ledger.",
                "",
            ]
        )

    return "\n".join(lines).strip() + "\n"


def _send_report_email(recipient: str, subject: str, report_markdown: str) -> Dict[str, str]:
    smtp_host = os.getenv("ENSEMBLE_SMTP_HOST") or os.getenv("SMTP_HOST")
    sender = os.getenv("ENSEMBLE_SMTP_FROM") or os.getenv("SMTP_FROM") or "reports@0101.local"
    if not smtp_host:
        return {
            "status": "logged",
            "details": "SMTP is not configured; report email was logged for local delivery review.",
        }

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["To"] = recipient
    message.set_content(report_markdown)

    smtp_port = int(os.getenv("ENSEMBLE_SMTP_PORT") or os.getenv("SMTP_PORT") or "587")
    username = os.getenv("ENSEMBLE_SMTP_USERNAME") or os.getenv("SMTP_USERNAME")
    password = os.getenv("ENSEMBLE_SMTP_PASSWORD") or os.getenv("SMTP_PASSWORD")
    use_tls = (os.getenv("ENSEMBLE_SMTP_USE_TLS") or os.getenv("SMTP_USE_TLS") or "true").lower() != "false"

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as smtp:
            if use_tls:
                smtp.starttls()
            if username and password:
                smtp.login(username, password)
            smtp.send_message(message)
        return {"status": "sent", "details": f"Report emailed to {recipient}."}
    except Exception as exc:
        return {"status": "failed", "details": str(exc)}


def _dispatch_task_report(
    conn: sqlite3.Connection,
    task: Dict[str, Any],
    governance_db_path: Optional[str] = None,
    recipient_email: Optional[str] = None,
) -> Dict[str, Any]:
    recipient = (recipient_email or task.get("report_recipient_email") or "").strip()
    if not _valid_email(recipient):
        raise HTTPException(status_code=400, detail="A valid report recipient email is required.")

    report = _build_task_report(task, governance_db_path)
    subject = f"0101 task report: {task.get('title') or task.get('id')}"
    delivery = _send_report_email(recipient, subject, report)
    now = _now()
    conn.execute(
        """
        UPDATE company_issues
        SET report_recipient_email = ?, report_on_completion = 1, report_sent_at = ?,
            report_delivery_status = ?, report_delivery_details = ?, updated_at = ?
        WHERE id = ? AND company_id = ?
        """,
        (
            recipient,
            now,
            delivery["status"],
            delivery["details"],
            now,
            task["id"],
            task["company_id"],
        ),
    )
    _activity(
        conn,
        task["company_id"],
        "task.report_email",
        f"Report email {delivery['status']} for task '{task.get('title')}'.",
        {
            "task_id": task["id"],
            "run_id": task.get("run_id"),
            "recipient": recipient,
            "delivery_status": delivery["status"],
        },
    )
    return {
        "task_id": task["id"],
        "recipient_email": recipient,
        "delivery_status": delivery["status"],
        "delivery_details": delivery["details"],
        "report_markdown": report,
        "sent_at": now,
    }


def dispatch_task_report_for_run(run_id: str, governance_db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """Send or log completion reports for CEO tasks tied to a finished run."""
    if not run_id:
        return []
    dispatched: List[Dict[str, Any]] = []
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM company_issues
            WHERE run_id = ?
              AND status IN ('completed', 'completed_passed')
              AND COALESCE(report_on_completion, 0) = 1
              AND COALESCE(report_recipient_email, '') != ''
              AND report_sent_at IS NULL
            """,
            (run_id,),
        ).fetchall()
        for row in rows:
            task = _task_payload(row)
            dispatched.append(_dispatch_task_report(conn, task, governance_db_path))
        conn.commit()
    return dispatched


def _fallback_structure(name: str, mission: str) -> Dict[str, Any]:
    lower = mission.lower()
    teams: List[Dict[str, Any]]

    if any(k in lower for k in ["research", "report", "market", "analysis"]):
        teams = [
            {
                "name": "Research",
                "emoji": "🔎",
                "description": "Find, verify, and synthesize evidence.",
                "agents": [
                    {"skill_id": "product-market-intelligence-analyst", "display_name": "Market Analyst", "role": "Market Intelligence Analyst"},
                    {"skill_id": "testing-evidence-collector", "display_name": "Evidence Collector", "role": "Evidence Collector"},
                ],
            },
            {
                "name": "Review",
                "emoji": "✅",
                "description": "Check quality, risks, and final readiness.",
                "agents": [
                    {"skill_id": "testing-reality-checker", "display_name": "Reality Checker", "role": "Quality Reviewer"},
                ],
            },
        ]
    elif any(k in lower for k in ["code", "software", "app", "platform", "saas"]):
        teams = [
            {
                "name": "Engineering",
                "emoji": "⚙️",
                "description": "Build, review, and verify software work.",
                "agents": [
                    {"skill_id": "engineering-senior-fullstack-developer", "display_name": "Full-Stack Developer", "role": "Senior Full-Stack Developer"},
                    {"skill_id": "engineering-code-quality-auditor", "display_name": "Code Quality Auditor", "role": "Code Quality Auditor"},
                ],
            },
            {
                "name": "Product",
                "emoji": "📋",
                "description": "Translate requests into scoped work.",
                "agents": [
                    {"skill_id": "product-manager-requirement-analyst", "display_name": "Requirement Analyst", "role": "Requirement Analyst"},
                ],
            },
        ]
    else:
        teams = [
            {
                "name": "Operations",
                "emoji": "📌",
                "description": "Route work and coordinate agent execution.",
                "agents": [
                    {"skill_id": "specialized-workflow-architect", "display_name": "Workflow Architect", "role": "Workflow Architect"},
                    {"skill_id": "support-executive-summary-generator", "display_name": "Executive Reporter", "role": "Executive Summary Generator"},
                ],
            }
        ]

    return {
        "company_name": name,
        "company_emoji": "🏢",
        "mission": mission,
        "teams": teams,
        "budget_policy": {"monthly_cap": 50.0, "per_run_cap": 5.0, "approval_threshold": 1.0},
        "security_policy": {"allowed_tools": ["read_artifact", "write_artifact", "search_web"], "allowed_domains": []},
    }


class CompanyProposalRequest(BaseModel):
    name: str = Field(..., min_length=1)
    mission: str = Field(..., min_length=1)


class CompanyCreateRequest(BaseModel):
    name: str = Field(..., min_length=1)
    mission: str = ""
    emoji: str = "🏢"
    industry: Optional[str] = None
    status: str = "Active"
    teams: List[Dict[str, Any]] = Field(default_factory=list)
    budget_policy: Dict[str, Any] = Field(default_factory=dict)
    security_policy: Dict[str, Any] = Field(default_factory=dict)


class IssueCreateRequest(BaseModel):
    title: str = Field(..., min_length=1)
    description: str = ""
    priority: str = "medium"
    teamId: Optional[str] = None
    agentId: Optional[str] = None
    workflowId: Optional[str] = None


class AgentHireRequest(BaseModel):
    skill_id: str = Field(..., min_length=1)
    skill_name: Optional[str] = None
    team_id: Optional[str] = None
    display_name: Optional[str] = None
    role: Optional[str] = None
    model_provider: Optional[str] = None
    model_name: Optional[str] = None
    tool_policy: Dict[str, Any] = Field(default_factory=dict)


class AgentUpdateRequest(BaseModel):
    team_id: Optional[str] = None
    display_name: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None
    model_provider: Optional[str] = None
    model_name: Optional[str] = None
    tool_policy: Optional[Dict[str, Any]] = None


class TaskCreateRequest(BaseModel):
    title: Optional[str] = None
    prompt: str = Field(..., min_length=1)
    department_id: Optional[str] = None
    agent_ids: List[str] = Field(default_factory=list)
    output_type: str = "auto"
    task_type: str = "one_time"
    schedule: Dict[str, Any] = Field(default_factory=dict)
    report_recipient_email: Optional[str] = None
    report_on_completion: bool = False


class TaskRunRequest(BaseModel):
    approved: bool = True


class TaskDecisionRequest(BaseModel):
    note: str = ""


class TaskReportEmailRequest(BaseModel):
    recipient_email: Optional[str] = None


@router.get("/companies")
async def list_companies(request: Request):
    user_id = _request_user_id(request)
    with _connect() as conn:
        if user_id:
            rows = conn.execute(
                "SELECT id FROM companies WHERE user_id = ? ORDER BY created_at DESC",
                (user_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id FROM companies WHERE user_id IS NULL ORDER BY created_at DESC",
            ).fetchall()
        return [_company_summary(conn, row["id"]) for row in rows]


@router.post("/companies/propose")
async def propose_company(req: CompanyProposalRequest):
    proposal = _fallback_structure(req.name, req.mission)
    available_ids = {s.get("id") for s in skill_registry.list_skills()}
    for team in proposal["teams"]:
        for agent in team.get("agents", []):
            if agent.get("skill_id") not in available_ids:
                agent["display_name"] = agent.get("display_name") or _skill_label(agent.get("skill_id", "agent"))
    return proposal


@router.post("/companies")
async def create_company(req: CompanyCreateRequest, request: Request):
    company_id = f"comp-{uuid.uuid4().hex[:10]}"
    user_id = _request_user_id(request)
    now = _now()
    teams = req.teams or _fallback_structure(req.name, req.mission)["teams"]

    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO companies (
                id, user_id, name, mission, emoji, industry, status, budget_policy_json,
                security_policy_json, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                company_id,
                user_id,
                req.name,
                req.mission,
                req.emoji,
                req.industry,
                req.status,
                json.dumps(req.budget_policy or {}),
                json.dumps(req.security_policy or {}),
                now,
                now,
            ),
        )

        for team in teams:
            team_id = team.get("id") or f"team-{uuid.uuid4().hex[:10]}"
            conn.execute(
                """
                INSERT INTO company_teams (id, company_id, name, description, emoji, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    team_id,
                    company_id,
                    team.get("name", "Team"),
                    team.get("description", ""),
                    team.get("emoji", "👥"),
                    now,
                    now,
                ),
            )
            for agent in team.get("agents", []):
                skill_id = agent.get("skill_id") or agent.get("id") or agent.get("role", "agent")
                conn.execute(
                    """
                    INSERT INTO company_agents (
                        id, company_id, team_id, skill_id, display_name, role, status, emoji,
                        model_provider, model_name, tool_policy_json, is_lead, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        agent.get("id") or f"agent-{uuid.uuid4().hex[:10]}",
                        company_id,
                        team_id,
                        skill_id,
                        agent.get("display_name") or agent.get("name") or _skill_label(skill_id),
                        agent.get("role") or _skill_label(skill_id),
                        agent.get("status", "idle"),
                        agent.get("emoji", "🤖"),
                        agent.get("model_provider"),
                        agent.get("model") or agent.get("model_name"),
                        json.dumps(agent.get("tool_policy", {})),
                        1 if agent.get("is_lead") else 0,
                        now,
                        now,
                    ),
                )

        _activity(conn, company_id, "company.created", f"Company '{req.name}' was created.", {"mission": req.mission})
        conn.commit()
        return _company_summary(conn, company_id)


@router.post("/companies/auto-build")
async def auto_build_company(req: CompanyProposalRequest, request: Request):
    """Compatibility endpoint: propose and create in one step for the current UI."""
    proposal = await propose_company(req)
    created = await create_company(
        CompanyCreateRequest(
            name=proposal["company_name"],
            mission=req.mission,
            emoji=proposal.get("company_emoji", "🏢"),
            teams=proposal.get("teams", []),
            budget_policy=proposal.get("budget_policy", {}),
            security_policy=proposal.get("security_policy", {}),
        ),
        request,
    )
    return created


@router.get("/companies/{company_id}")
async def get_company(company_id: str, request: Request):
    user_id = _request_user_id(request)
    with _connect() as conn:
        _ensure_company_access(conn, company_id, user_id)
        company = _company_summary(conn, company_id)
        company["teams_detail"] = [dict(r) for r in conn.execute("SELECT * FROM company_teams WHERE company_id = ? ORDER BY created_at ASC", (company_id,)).fetchall()]
        company["agents_detail"] = [dict(r) for r in conn.execute("SELECT * FROM company_agents WHERE company_id = ? ORDER BY created_at ASC", (company_id,)).fetchall()]
        return company


@router.get("/companies/{company_id}/operations")
async def get_company_operations(company_id: str, request: Request):
    """Return a tenant-scoped operational command-center summary."""
    user_id = _request_user_id(request)
    with _connect() as conn:
        _ensure_company_access(conn, company_id, user_id)
        return _company_operations(conn, company_id)


@router.delete("/companies/{company_id}")
async def delete_company(company_id: str, request: Request):
    user_id = _request_user_id(request)
    with _connect() as conn:
        _ensure_company_access(conn, company_id, user_id)
        conn.execute("DELETE FROM companies WHERE id = ?", (company_id,))
        conn.commit()
    return {"success": True}


@router.get("/companies/{company_id}/teams")
async def list_company_teams(company_id: str, request: Request):
    user_id = _request_user_id(request)
    with _connect() as conn:
        _ensure_company_access(conn, company_id, user_id)
        return [dict(r) for r in conn.execute("SELECT * FROM company_teams WHERE company_id = ? ORDER BY created_at ASC", (company_id,)).fetchall()]


@router.get("/companies/{company_id}/departments")
async def list_company_departments(company_id: str, request: Request):
    return await list_company_teams(company_id, request)


@router.get("/companies/{company_id}/agents")
async def list_company_agents(company_id: str, request: Request):
    user_id = _request_user_id(request)
    with _connect() as conn:
        _ensure_company_access(conn, company_id, user_id)
        skills = _skill_map()
        return [
            _agent_payload(row, skills.get(str(row["skill_id"])))
            for row in conn.execute(
                "SELECT * FROM company_agents WHERE company_id = ? ORDER BY created_at ASC",
                (company_id,),
            ).fetchall()
        ]


@router.post("/companies/{company_id}/agents/hire")
async def hire_company_agent(company_id: str, req: AgentHireRequest, request: Request):
    user_id = _request_user_id(request)
    now = _now()
    skill = _resolve_skill(req.skill_id, req.skill_name)
    if not skill:
        attempted = req.skill_name or req.skill_id
        raise HTTPException(
            status_code=404,
            detail=f"Skill '{attempted}' is not available in the hiring catalog. Refresh the catalog and try again.",
        )

    with _connect() as conn:
        _ensure_company_access(conn, company_id, user_id)
        team_id = req.team_id
        if team_id:
            team = conn.execute(
                "SELECT id FROM company_teams WHERE id = ? AND company_id = ?",
                (team_id, company_id),
            ).fetchone()
            if not team:
                raise HTTPException(status_code=404, detail="Department not found")
        else:
            team = conn.execute(
                "SELECT id FROM company_teams WHERE company_id = ? ORDER BY created_at ASC LIMIT 1",
                (company_id,),
            ).fetchone()
            if team:
                team_id = team["id"]
            else:
                team_id = f"team-{uuid.uuid4().hex[:10]}"
                conn.execute(
                    """
                    INSERT INTO company_teams (id, company_id, name, description, emoji, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (team_id, company_id, "Operations", "Default department for hired agents.", "📌", now, now),
                )

        agent_id = f"agent-{uuid.uuid4().hex[:10]}"
        resolved_skill_id = str(skill.get("id") or req.skill_id)
        capabilities = skill.get("capabilities") or skill.get("tags") or []
        conn.execute(
            """
            INSERT INTO company_agents (
                id, company_id, team_id, skill_id, display_name, role, status, emoji,
                model_provider, model_name, tool_policy_json, is_lead, description,
                capabilities_json, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                agent_id,
                company_id,
                team_id,
                resolved_skill_id,
                req.display_name or skill.get("name") or _skill_label(resolved_skill_id),
                req.role or skill.get("role") or skill.get("category") or _skill_label(resolved_skill_id),
                "idle",
                skill.get("emoji", "🤖"),
                req.model_provider,
                req.model_name,
                json.dumps(req.tool_policy or {}),
                0,
                skill.get("description", ""),
                json.dumps(capabilities),
                now,
                now,
            ),
        )
        _activity(
            conn,
            company_id,
            "agent.hired",
            f"Hired {req.display_name or skill.get('name') or resolved_skill_id}.",
            {"agent_id": agent_id, "skill_id": resolved_skill_id, "team_id": team_id},
        )
        conn.commit()
        row = conn.execute("SELECT * FROM company_agents WHERE id = ?", (agent_id,)).fetchone()
        return _agent_payload(row, skill)


@router.post("/companies/{company_id}/agents")
async def hire_company_agent_compat(company_id: str, req: AgentHireRequest, request: Request):
    return await hire_company_agent(company_id, req, request)


@router.patch("/companies/{company_id}/agents/{agent_id}")
async def update_company_agent(company_id: str, agent_id: str, req: AgentUpdateRequest, request: Request):
    user_id = _request_user_id(request)
    allowed_statuses = {"idle", "active", "running", "paused", "waiting_approval", "disabled", "fired"}
    now = _now()
    with _connect() as conn:
        _ensure_company_access(conn, company_id, user_id)
        row = conn.execute(
            "SELECT * FROM company_agents WHERE id = ? AND company_id = ?",
            (agent_id, company_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Agent not found")
        if req.status and req.status not in allowed_statuses:
            raise HTTPException(status_code=400, detail="Invalid agent status")

        updates = []
        params: List[Any] = []
        for field, column in (
            ("team_id", "team_id"),
            ("display_name", "display_name"),
            ("role", "role"),
            ("status", "status"),
            ("model_provider", "model_provider"),
            ("model_name", "model_name"),
        ):
            value = getattr(req, field)
            if value is not None:
                updates.append(f"{column} = ?")
                params.append(value)
        if req.tool_policy is not None:
            updates.append("tool_policy_json = ?")
            params.append(json.dumps(req.tool_policy))
        if updates:
            updates.append("updated_at = ?")
            params.append(now)
            params.extend([agent_id, company_id])
            conn.execute(
                f"UPDATE company_agents SET {', '.join(updates)} WHERE id = ? AND company_id = ?",
                params,
            )
            _activity(conn, company_id, "agent.updated", f"Updated agent {agent_id}.", {"agent_id": agent_id})
            conn.commit()
        updated = conn.execute(
            "SELECT * FROM company_agents WHERE id = ? AND company_id = ?",
            (agent_id, company_id),
        ).fetchone()
        return _agent_payload(updated)


@router.post("/companies/{company_id}/agents/{agent_id}/fire")
async def fire_company_agent(company_id: str, agent_id: str, request: Request):
    user_id = _request_user_id(request)
    now = _now()
    with _connect() as conn:
        _ensure_company_access(conn, company_id, user_id)
        row = conn.execute(
            "SELECT * FROM company_agents WHERE id = ? AND company_id = ?",
            (agent_id, company_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Agent not found")
        conn.execute(
            """
            UPDATE company_agents
            SET status = 'fired', fired_at = ?, updated_at = ?
            WHERE id = ? AND company_id = ?
            """,
            (now, now, agent_id, company_id),
        )
        _activity(conn, company_id, "agent.fired", f"Fired {row['display_name']}.", {"agent_id": agent_id})
        conn.commit()
        fired = conn.execute(
            "SELECT * FROM company_agents WHERE id = ? AND company_id = ?",
            (agent_id, company_id),
        ).fetchone()
        return _agent_payload(fired)


@router.get("/companies/{company_id}/issues")
async def list_company_issues(company_id: str, request: Request):
    user_id = _request_user_id(request)
    with _connect() as conn:
        _ensure_company_access(conn, company_id, user_id)
        return [dict(r) for r in conn.execute("SELECT * FROM company_issues WHERE company_id = ? ORDER BY created_at DESC", (company_id,)).fetchall()]


@router.post("/companies/{company_id}/issues")
async def create_company_issue(company_id: str, req: IssueCreateRequest, request: Request):
    now = _now()
    user_id = _request_user_id(request)
    with _connect() as conn:
        _ensure_company_access(conn, company_id, user_id)
        issue_id = f"issue-{uuid.uuid4().hex[:10]}"
        conn.execute(
            """
            INSERT INTO company_issues (
                id, company_id, team_id, assigned_agent_id, workflow_id, title, description,
                priority, status, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                issue_id,
                company_id,
                req.teamId,
                req.agentId,
                req.workflowId,
                req.title,
                req.description,
                req.priority,
                "queued",
                now,
                now,
            ),
        )
        _activity(conn, company_id, "issue.created", f"Issue '{req.title}' was created.", {"issue_id": issue_id})
        conn.commit()
        return dict(conn.execute("SELECT * FROM company_issues WHERE id = ?", (issue_id,)).fetchone())


def _task_payload(row: sqlite3.Row) -> Dict[str, Any]:
    task = dict(row)
    task["department_id"] = task.get("department_id") or task.get("team_id")
    task["agent_id"] = task.get("agent_id") or task.get("assigned_agent_id")
    task["prompt"] = task.get("prompt") or task.get("description") or task.get("title") or ""
    try:
        task["route"] = json.loads(task.get("route_json") or "{}")
    except Exception:
        task["route"] = {}
    try:
        task["schedule"] = json.loads(task.get("schedule_json") or "{}")
    except Exception:
        task["schedule"] = {}
    task["type"] = task.get("task_type") or "one_time"
    task["report_on_completion"] = bool(task.get("report_on_completion"))
    task["report"] = {
        "recipient_email": task.get("report_recipient_email"),
        "on_completion": bool(task.get("report_on_completion")),
        "sent_at": task.get("report_sent_at"),
        "delivery_status": task.get("report_delivery_status"),
        "delivery_details": task.get("report_delivery_details"),
    }
    return task


@router.get("/companies/{company_id}/tasks")
async def list_company_tasks(company_id: str, request: Request):
    user_id = _request_user_id(request)
    with _connect() as conn:
        _ensure_company_access(conn, company_id, user_id)
        rows = conn.execute(
            """
            SELECT * FROM company_issues
            WHERE company_id = ?
            ORDER BY created_at DESC
            """,
            (company_id,),
        ).fetchall()
        return [_task_payload(row) for row in rows]


@router.post("/companies/{company_id}/tasks")
async def create_company_task(company_id: str, req: TaskCreateRequest, request: Request):
    now = _now()
    user_id = _request_user_id(request)
    title = req.title or req.prompt.strip()[:80] or "CEO task"
    report_recipient = (req.report_recipient_email or "").strip() or None
    if report_recipient and not _valid_email(report_recipient):
        raise HTTPException(status_code=400, detail="Report recipient email is invalid")
    with _connect() as conn:
        _ensure_company_access(conn, company_id, user_id)
        route = _route_company_task(
            conn,
            company_id=company_id,
            prompt=req.prompt,
            department_id=req.department_id,
            agent_ids=req.agent_ids,
            output_type=req.output_type,
        )
        task_id = f"task-{uuid.uuid4().hex[:10]}"
        conn.execute(
            """
            INSERT INTO company_issues (
                id, company_id, team_id, assigned_agent_id, title, description, prompt,
                priority, status, route_json, output_type, task_type, schedule_json,
                approval_state, report_recipient_email, report_on_completion, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                task_id,
                company_id,
                req.department_id,
                req.agent_ids[0] if req.agent_ids else None,
                title,
                req.prompt,
                req.prompt,
                "medium",
                "ready" if route["selected_agents"] else "needs_hiring",
                json.dumps(route),
                req.output_type,
                "workflow" if req.task_type == "workflow" else "one_time",
                json.dumps(req.schedule or {}),
                "approved",
                report_recipient,
                1 if (req.report_on_completion and report_recipient) else 0,
                now,
                now,
            ),
        )
        _activity(
            conn,
            company_id,
            "task.created",
            f"CEO assigned task '{title}'.",
            {
                "task_id": task_id,
                "route_quality": route["route_quality"],
                "report_on_completion": bool(req.report_on_completion and report_recipient),
                "report_recipient_email": report_recipient,
            },
        )
        conn.commit()
        return _task_payload(conn.execute("SELECT * FROM company_issues WHERE id = ?", (task_id,)).fetchone())


@router.get("/companies/{company_id}/tasks/{task_id}")
async def get_company_task(company_id: str, task_id: str, request: Request):
    user_id = _request_user_id(request)
    with _connect() as conn:
        _ensure_company_access(conn, company_id, user_id)
        row = conn.execute(
            "SELECT * FROM company_issues WHERE id = ? AND company_id = ?",
            (task_id, company_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Task not found")
        return _task_payload(row)


@router.post("/companies/{company_id}/tasks/{task_id}/run")
async def prepare_company_task_run(company_id: str, task_id: str, req: TaskRunRequest, request: Request):
    user_id = _request_user_id(request)
    now = _now()
    with _connect() as conn:
        _ensure_company_access(conn, company_id, user_id)
        row = conn.execute(
            "SELECT * FROM company_issues WHERE id = ? AND company_id = ?",
            (task_id, company_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Task not found")
        task = _task_payload(row)
        route = task.get("route") or {}
        if not route.get("selected_agents"):
            raise HTTPException(status_code=409, detail={"message": "Hire matching agents before running this task.", "missing_roles": route.get("missing_roles", [])})

        workflow_id = task.get("workflow_id") or f"task_wf_{uuid.uuid4().hex[:10]}"
        graph = _workflow_from_task(task)
        os.makedirs(os.path.dirname(GOVERNANCE_DB_PATH), exist_ok=True)
        with sqlite3.connect(GOVERNANCE_DB_PATH) as gov_conn:
            gov_conn.execute(
                """
                CREATE TABLE IF NOT EXISTS workflows (
                    id TEXT PRIMARY KEY,
                    company_id TEXT,
                    name TEXT,
                    graph_json TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            gov_conn.execute(
                """
                INSERT INTO workflows (id, company_id, name, graph_json, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    company_id = excluded.company_id,
                    name = excluded.name,
                    graph_json = excluded.graph_json,
                    updated_at = excluded.updated_at
                """,
                (
                    workflow_id,
                    company_id,
                    task.get("title") or "CEO task",
                    json.dumps(graph),
                    now,
                ),
            )
            gov_conn.commit()

        conn.execute(
            """
            UPDATE company_issues
            SET workflow_id = ?, status = 'running', updated_at = ?
            WHERE id = ? AND company_id = ?
            """,
            (workflow_id, now, task_id, company_id),
        )
        selected_agent_ids = [
            stage.get("company_agent_id") or stage.get("agent_id")
            for stage in route.get("selected_agents", [])
            if stage.get("company_agent_id") or stage.get("agent_id")
        ]
        if selected_agent_ids:
            placeholders = ",".join("?" for _ in selected_agent_ids)
            conn.execute(
                f"""
                UPDATE company_agents
                SET status = 'running', last_activity_at = ?, updated_at = ?
                WHERE company_id = ?
                  AND id IN ({placeholders})
                  AND {_active_agent_clause()}
                """,
                [now, now, company_id, *selected_agent_ids],
            )
        _activity(
            conn,
            company_id,
            "task.run_prepared",
            f"Prepared task '{task.get('title')}' for execution.",
            {"task_id": task_id, "workflow_id": workflow_id, "agent_ids": selected_agent_ids},
        )
        conn.commit()
        return {
            "task_id": task_id,
            "workflow_id": workflow_id,
            "graph": graph,
            "initial_input": task.get("prompt") or task.get("description") or task.get("title"),
            "approved": req.approved,
        }


@router.post("/companies/{company_id}/tasks/{task_id}/approve")
async def approve_company_task(company_id: str, task_id: str, req: TaskDecisionRequest, request: Request):
    return await _set_task_decision(company_id, task_id, "approved", req.note, request)


@router.post("/companies/{company_id}/tasks/{task_id}/cancel")
async def cancel_company_task(company_id: str, task_id: str, req: TaskDecisionRequest, request: Request):
    return await _set_task_decision(company_id, task_id, "cancelled", req.note, request)


@router.post("/companies/{company_id}/tasks/{task_id}/report-email")
async def email_company_task_report(company_id: str, task_id: str, req: TaskReportEmailRequest, request: Request):
    user_id = _request_user_id(request)
    with _connect() as conn:
        _ensure_company_access(conn, company_id, user_id)
        row = conn.execute(
            "SELECT * FROM company_issues WHERE id = ? AND company_id = ?",
            (task_id, company_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Task not found")
        task = _task_payload(row)
        if task.get("status") not in {"completed", "completed_passed"}:
            raise HTTPException(status_code=409, detail="Task must be completed before emailing the report.")
        result = _dispatch_task_report(conn, task, GOVERNANCE_DB_PATH, req.recipient_email)
        conn.commit()
        return result


async def _set_task_decision(company_id: str, task_id: str, status: str, note: str, request: Request):
    user_id = _request_user_id(request)
    now = _now()
    with _connect() as conn:
        _ensure_company_access(conn, company_id, user_id)
        row = conn.execute(
            "SELECT * FROM company_issues WHERE id = ? AND company_id = ?",
            (task_id, company_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Task not found")
        conn.execute(
            """
            UPDATE company_issues
            SET status = ?, approval_state = ?, updated_at = ?
            WHERE id = ? AND company_id = ?
            """,
            (status, status, now, task_id, company_id),
        )
        _activity(conn, company_id, f"task.{status}", f"Task '{row['title']}' was {status}.", {"task_id": task_id, "note": note})
        conn.commit()
        return _task_payload(conn.execute("SELECT * FROM company_issues WHERE id = ?", (task_id,)).fetchone())


@router.get("/companies/{company_id}/activity")
async def list_company_activity(company_id: str, request: Request, limit: int = 50):
    user_id = _request_user_id(request)
    with _connect() as conn:
        _ensure_company_access(conn, company_id, user_id)
        return [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM company_activity WHERE company_id = ? ORDER BY created_at DESC LIMIT ?",
                (company_id, limit),
            ).fetchall()
        ]
