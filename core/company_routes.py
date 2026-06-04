"""Company workspace routes for Esemble.

Companies are durable operational workspaces. They own teams, agent
assignments, issues, budgets, approvals, workflow runs, and audit history.
This module starts with SQLite-backed persistence so local mode behaves like
the eventual Supabase-backed team mode.
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
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


@router.get("/companies/{company_id}/agents")
async def list_company_agents(company_id: str, request: Request):
    user_id = _request_user_id(request)
    with _connect() as conn:
        _ensure_company_access(conn, company_id, user_id)
        return [dict(r) for r in conn.execute("SELECT * FROM company_agents WHERE company_id = ? ORDER BY created_at ASC", (company_id,)).fetchall()]


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
