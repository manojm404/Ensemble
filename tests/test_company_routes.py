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
