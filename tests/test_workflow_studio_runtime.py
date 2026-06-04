import json
import sqlite3

from core.dag_engine import DAGWorkflowEngine


class _Gov:
    def __init__(self, db_path):
        self.db_path = str(db_path)


def _prepare_runtime_db(db_path):
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE executions (
                run_id TEXT PRIMARY KEY,
                workflow_id TEXT,
                company_id TEXT,
                status TEXT,
                current_node TEXT,
                last_agent_id TEXT,
                parent_run_id TEXT,
                started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                current_iteration INTEGER DEFAULT 0,
                max_iterations INTEGER DEFAULT 0,
                loop_metadata TEXT,
                completed_at DATETIME
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE node_executions (
                run_id TEXT,
                node_id TEXT,
                status TEXT,
                output TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(run_id, node_id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE workflow_run_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT,
                workflow_id TEXT,
                company_id TEXT,
                node_id TEXT,
                event_type TEXT,
                status TEXT,
                label TEXT,
                role TEXT,
                payload_json TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE agent_messages (
                message_id TEXT PRIMARY KEY,
                run_id TEXT,
                workflow_id TEXT,
                company_id TEXT,
                cycle INTEGER DEFAULT 0,
                sender_node_id TEXT,
                recipient_node_ids_json TEXT,
                visibility TEXT DEFAULT 'public',
                message_type TEXT DEFAULT 'note',
                subject TEXT,
                body TEXT,
                related_state_keys_json TEXT,
                source_event_ids_json TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                thread_id TEXT,
                in_reply_to TEXT
            )
            """
        )


def test_workflow_studio_run_state_initializes_all_nodes_and_events(tmp_path):
    db_path = tmp_path / "runtime.db"
    _prepare_runtime_db(db_path)
    engine = DAGWorkflowEngine(space=None, audit=None, llm=None, gov=_Gov(db_path))
    engine.company_id = "company_1"
    nodes = [
        {"id": "research", "data": {"label": "Research Agent", "role": "Researcher"}},
        {"id": "writer", "data": {"label": "Writer Agent", "role": "Writer"}},
    ]

    engine._init_run("wf_1", "run_1", nodes)
    engine._record_run_event("run_1", "wf_1", "run_started", status="running")
    engine._update_node_status("run_1", "research", "running")
    engine._update_node_status("run_1", "research", "completed", "Research complete")

    with sqlite3.connect(db_path) as conn:
        rows = conn.execute(
            "SELECT node_id, status, output FROM node_executions WHERE run_id = ? ORDER BY node_id",
            ("run_1",),
        ).fetchall()
        events = conn.execute(
            "SELECT event_type, node_id, status, label FROM workflow_run_events WHERE run_id = ? ORDER BY id",
            ("run_1",),
        ).fetchall()

    assert rows == [
        ("research", "completed", "Research complete"),
        ("writer", "idle", None),
    ]
    assert events[0][0] == "run_started"
    assert ("node_status", "research", "running", "Research Agent") in events
    assert ("node_status", "research", "completed", "Research Agent") in events


def test_workflow_studio_records_valid_handoff_message(tmp_path):
    db_path = tmp_path / "runtime.db"
    _prepare_runtime_db(db_path)
    engine = DAGWorkflowEngine(space=None, audit=None, llm=None, gov=_Gov(db_path))
    engine.company_id = "company_1"
    nodes = [
        {"id": "agent_a", "data": {"label": "Agent A", "role": "Researcher"}},
        {"id": "agent_b", "data": {"label": "Agent B", "role": "Writer"}},
    ]
    edges = [{"source": "agent_a", "target": "agent_b"}]

    engine._init_run("wf_1", "run_1", nodes)
    engine._record_handoff_message("run_1", "wf_1", "agent_a", "Researcher", "Findings go here", edges)

    with sqlite3.connect(db_path) as conn:
        row = conn.execute(
            """
            SELECT message_id, sender_node_id, recipient_node_ids_json, message_type, subject, body, thread_id
            FROM agent_messages
            WHERE run_id = ?
            """,
            ("run_1",),
        ).fetchone()

    assert row[0] == "msg_run_1_agent_a_handoff"
    assert row[1] == "agent_a"
    assert json.loads(row[2]) == ["agent_b"]
    assert row[3] == "handoff"
    assert row[4] == "Agent A handoff"
    assert row[5] == "Findings go here"
    assert row[6] == "thread_run_1_handoff"
