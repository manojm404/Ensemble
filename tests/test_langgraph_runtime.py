import asyncio

from fastapi.testclient import TestClient

from core.dag_engine import DAGWorkflowEngine
from core.governance import app
from core.langgraph_runtime import supports_langgraph_workflow


def test_supports_langgraph_workflow_for_simple_dag():
    nodes = [
        {"id": "step1", "type": "agentNode", "data": {"label": "Research", "role": "Researcher"}},
        {"id": "step2", "type": "agentNode", "data": {"label": "Write", "role": "Writer"}},
    ]
    edges = [{"source": "step1", "target": "step2"}]

    assert supports_langgraph_workflow(nodes, edges) is True


def test_supports_langgraph_workflow_rejects_switch_and_loopback():
    nodes = [
        {"id": "step1", "type": "switchNode", "data": {"label": "Route", "role": "Router"}},
        {"id": "step2", "type": "agentNode", "data": {"label": "Follow-up", "role": "Writer"}},
    ]
    edges = [
        {"source": "step1", "target": "step2"},
        {"source": "step2", "target": "step1", "data": {"isLoopBack": True}},
    ]

    assert supports_langgraph_workflow(nodes, edges) is False


def test_workflow_run_response_exposes_runtime_engine(monkeypatch):
    async def _fake_execute_workflow(self, *args, **kwargs):
        return {"status": "completed", "run_id": kwargs.get("run_id"), "runtime_engine": "langgraph"}

    monkeypatch.setenv("ENFORCE_AUTH", "false")
    monkeypatch.setattr("core.governance._get_user_provider_config", lambda request: {
        "provider": "gemini",
        "model": "gemini-2.5-flash",
        "base_url": None,
    })
    monkeypatch.setattr("core.governance._provider_requires_api_key", lambda provider: False)
    monkeypatch.setattr(DAGWorkflowEngine, "execute_workflow", _fake_execute_workflow)

    client = TestClient(app)
    response = client.post(
        "/api/workflows/run",
        json={
            "id": "wf_test",
            "nodes": [
                {"id": "step1", "type": "agentNode", "data": {"label": "Research", "role": "Researcher", "instruction": "Research"}},
                {"id": "step2", "type": "agentNode", "data": {"label": "Write", "role": "Writer", "instruction": "Write"}},
            ],
            "edges": [{"source": "step1", "target": "step2"}],
            "metadata": {"workflow_mode": "dag"},
            "initialInput": "Research and write a report.",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["runtime_engine"] == "langgraph"
