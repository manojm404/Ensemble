import os
import sqlite3

from fastapi import FastAPI
from fastapi.testclient import TestClient

import core.company_routes as company_routes


def test_company_workspace_persists_core_entities(tmp_path):
    company_routes.DB_PATH = str(tmp_path / "companies.db")
    company_routes.GOVERNANCE_DB_PATH = str(tmp_path / "governance.db")

    app = FastAPI()
    app.include_router(company_routes.router)
    client = TestClient(app)

    created = client.post(
        "/api/companies/auto-build",
        json={"name": "Research Ops", "mission": "Research market trends and verify sources"},
    )
    assert created.status_code == 200
    company = created.json()
    assert company["name"] == "Research Ops"
    assert company["team_count"] >= 1
    assert company["agent_count"] >= 1

    listed = client.get("/api/companies")
    assert listed.status_code == 200
    assert any(row["id"] == company["id"] for row in listed.json())

    teams = client.get(f"/api/companies/{company['id']}/teams")
    agents = client.get(f"/api/companies/{company['id']}/agents")
    assert teams.status_code == 200
    assert agents.status_code == 200
    assert len(teams.json()) == company["team_count"]
    assert len(agents.json()) == company["agent_count"]

    issue = client.post(
        f"/api/companies/{company['id']}/issues",
        json={"title": "Create weekly trend report", "priority": "high"},
    )
    assert issue.status_code == 200
    assert issue.json()["status"] == "queued"

    refreshed = client.get(f"/api/companies/{company['id']}")
    assert refreshed.status_code == 200
    assert refreshed.json()["issue_count"] == 1

    activity = client.get(f"/api/companies/{company['id']}/activity")
    assert activity.status_code == 200
    assert len(activity.json()) >= 2


def test_company_operations_derives_real_workspace_signals(tmp_path):
    company_routes.DB_PATH = str(tmp_path / "companies.db")
    company_routes.GOVERNANCE_DB_PATH = str(tmp_path / "governance.db")

    app = FastAPI()
    app.include_router(company_routes.router)
    client = TestClient(app)

    created = client.post(
        "/api/companies/auto-build",
        json={"name": "Launch Ops", "mission": "Build and verify launch workflows"},
    )
    assert created.status_code == 200
    company = created.json()

    with sqlite3.connect(company_routes.GOVERNANCE_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE executions (
                run_id TEXT,
                workflow_id TEXT,
                company_id TEXT,
                status TEXT,
                current_node TEXT,
                last_agent_id TEXT,
                started_at TEXT,
                completed_at TEXT
            )
            """
        )
        conn.execute(
            """
            INSERT INTO executions (
                run_id, workflow_id, company_id, status, current_node, last_agent_id, started_at, completed_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            ("run-1", "wf-launch", company["id"], "completed", "package", "agent-writer", "2026-06-01T00:00:00Z", "2026-06-01T00:02:00Z"),
        )
        conn.execute(
            """
            INSERT INTO executions (
                run_id, workflow_id, company_id, status, current_node, last_agent_id, started_at, completed_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            ("run-2", "wf-launch", company["id"], "paused_approval", "approval", "agent-reviewer", "2026-06-01T00:03:00Z", None),
        )
        conn.commit()

    issue = client.post(
        f"/api/companies/{company['id']}/issues",
        json={"title": "Review launch package", "priority": "critical", "workflowId": "wf-launch"},
    )
    assert issue.status_code == 200

    operations = client.get(f"/api/companies/{company['id']}/operations")
    assert operations.status_code == 200
    payload = operations.json()

    assert payload["counts"]["teams"] == company["team_count"]
    assert payload["counts"]["agents"] == company["agent_count"]
    assert payload["counts"]["open_issues"] == 1
    assert payload["counts"]["workflows"]["completed"] == 1
    assert payload["counts"]["workflows"]["paused"] == 1
    assert payload["counts"]["approvals_waiting"] == 1
    assert payload["recent"]["runs"][0]["run_id"] == "run-2"


def test_company_can_hire_fire_and_route_ceo_tasks(tmp_path, monkeypatch):
    monkeypatch.delenv("ENSEMBLE_SMTP_HOST", raising=False)
    monkeypatch.delenv("SMTP_HOST", raising=False)
    company_routes.DB_PATH = str(tmp_path / "companies.db")
    company_routes.GOVERNANCE_DB_PATH = str(tmp_path / "governance.db")

    app = FastAPI()
    app.include_router(company_routes.router)
    client = TestClient(app)

    created = client.post(
        "/api/companies",
        json={"name": "CEO Ops", "mission": "Build websites and review compliance evidence", "teams": []},
    )
    assert created.status_code == 200
    company = created.json()

    departments = client.get(f"/api/companies/{company['id']}/departments")
    assert departments.status_code == 200

    skills = company_routes.skill_registry.list_skills()
    assert skills
    skill_id = skills[0]["id"]

    hired = client.post(
        f"/api/companies/{company['id']}/agents/hire",
        json={"skill_id": skill_id, "display_name": "First Hire", "role": "Workflow Architect"},
    )
    assert hired.status_code == 200
    agent = hired.json()
    assert agent["skill_id"] == skill_id
    assert agent["status"] == "idle"

    task = client.post(
        f"/api/companies/{company['id']}/tasks",
        json={
            "prompt": "Build a local business website",
            "agent_ids": [agent["id"]],
            "report_recipient_email": "ceo@example.com",
            "report_on_completion": True,
        },
    )
    assert task.status_code == 200
    task_payload = task.json()
    assert task_payload["status"] == "ready"
    assert task_payload["agent_id"] == agent["id"]
    assert task_payload["report_recipient_email"] == "ceo@example.com"
    assert task_payload["report_on_completion"] is True
    assert task_payload["route"]["selected_agents"][0]["company_agent_id"] == agent["id"]

    prepared = client.post(f"/api/companies/{company['id']}/tasks/{task_payload['id']}/run", json={})
    assert prepared.status_code == 200
    prepared_payload = prepared.json()
    assert prepared_payload["workflow_id"]
    assert prepared_payload["graph"]["nodes"]
    running_agents = client.get(f"/api/companies/{company['id']}/agents")
    assert running_agents.status_code == 200
    running_agent = next(item for item in running_agents.json() if item["id"] == agent["id"])
    assert running_agent["status"] == "running"

    with sqlite3.connect(company_routes.GOVERNANCE_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS node_executions (
                run_id TEXT,
                node_id TEXT,
                status TEXT,
                output TEXT,
                updated_at TEXT
            )
            """
        )
        conn.execute(
            """
            INSERT INTO node_executions (run_id, node_id, status, output, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            ("run-report", "task_agent_1", "completed", "Finished the website task.", "2026-06-05T00:00:00Z"),
        )
        conn.commit()
    with sqlite3.connect(company_routes.DB_PATH) as conn:
        conn.execute(
            """
            UPDATE company_issues
            SET status = 'completed', run_id = ?, workflow_id = ?
            WHERE id = ?
            """,
            ("run-report", prepared_payload["workflow_id"], task_payload["id"]),
        )
        conn.commit()

    dispatched = company_routes.dispatch_task_report_for_run(
        "run-report",
        company_routes.GOVERNANCE_DB_PATH,
    )
    assert dispatched
    assert dispatched[0]["recipient_email"] == "ceo@example.com"
    assert dispatched[0]["delivery_status"] == "logged"
    assert "Finished the website task." in dispatched[0]["report_markdown"]

    report_response = client.post(
        f"/api/companies/{company['id']}/tasks/{task_payload['id']}/report-email",
        json={"recipient_email": "board@example.com"},
    )
    assert report_response.status_code == 200
    assert report_response.json()["recipient_email"] == "board@example.com"

    all_agents = client.get(f"/api/companies/{company['id']}/agents")
    assert all_agents.status_code == 200
    for active_agent in all_agents.json():
        fired = client.post(f"/api/companies/{company['id']}/agents/{active_agent['id']}/fire")
        assert fired.status_code == 200
        assert fired.json()["status"] == "fired"

    missing = client.post(
        f"/api/companies/{company['id']}/tasks",
        json={"prompt": "Write a SOC2 evidence review"},
    )
    assert missing.status_code == 200
    assert missing.json()["status"] == "needs_hiring"
    assert missing.json()["route"]["missing_roles"]
