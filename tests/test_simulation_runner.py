import asyncio
import json
import sqlite3

from core.workflows.simulation import (
    SimulationRunner,
    load_simulation_checkpoints,
    load_simulation_logs,
    load_simulation_state,
)


def test_quantum_banana_simulation_generates_state_messages_and_report(tmp_path):
    db_path = tmp_path / "simulation.db"
    graph = {
        "nodes": [],
        "edges": [],
        "metadata": {
            "workflow_mode": "simulation",
            "final_output_type": "document",
            "simulation_defaults": {
                "soft_max_cycles": 4,
                "hard_max_cycles": 20,
                "random_seed": "banana-test",
            },
        },
    }
    runner = SimulationRunner(
        db_path=str(db_path),
        workflow_id="wf_banana",
        graph=graph,
        company_id="company_test",
        run_id="sim_test",
        initial_input="Simulate Quantum Banana inventory fraud and write the final report.",
    )

    result = asyncio.run(runner.run())

    assert result["status"] == "completed"
    assert "The Great Quantum Banana Heist" in result["markdown"]

    state = load_simulation_state(str(db_path), "sim_test", "company_test")
    assert "inventory_primary" in state["state"]
    assert "final_report" in state["state"]

    checkpoints = load_simulation_checkpoints(str(db_path), "sim_test", "company_test")
    assert checkpoints[0]["cycle"] == 0
    assert checkpoints[-1]["cycle"] >= 1

    logs = load_simulation_logs(str(db_path), "sim_test", "company_test")
    assert any(log["node_id"] == "agent_1" for log in logs)

    with sqlite3.connect(db_path) as conn:
        message_count = conn.execute("SELECT COUNT(*) FROM agent_messages WHERE run_id = ?", ("sim_test",)).fetchone()[0]
        email_count = conn.execute(
            "SELECT COUNT(*) FROM agent_messages WHERE run_id = ? AND message_type = 'email' AND thread_id = ?",
            ("sim_test", "thread_banana_complaint"),
        ).fetchone()[0]
        package_mode = conn.execute("SELECT status, current_iteration FROM executions WHERE run_id = ?", ("sim_test",)).fetchone()

    assert message_count >= 5
    assert email_count >= 3
    assert package_mode[0] == "completed"
    assert package_mode[1] >= 1


def test_generic_simulation_records_handoff_thread(tmp_path):
    db_path = tmp_path / "generic.db"
    graph = {
        "nodes": [
            {"id": "a", "data": {"label": "Research Agent", "timing_policy": {"type": "every_cycle"}}},
            {"id": "b", "data": {"label": "Writer Agent", "timing_policy": {"type": "on_finalization"}}},
        ],
        "edges": [{"source": "a", "target": "b"}],
        "metadata": {"workflow_mode": "simulation", "simulation_defaults": {"soft_max_cycles": 2}},
    }
    runner = SimulationRunner(
        db_path=str(db_path),
        workflow_id="wf_generic",
        graph=graph,
        company_id="company_test",
        run_id="sim_generic",
        initial_input="Run a two-agent simulation.",
    )

    asyncio.run(runner.run())

    with sqlite3.connect(db_path) as conn:
        rows = conn.execute(
            "SELECT thread_id, message_type FROM agent_messages WHERE run_id = ? ORDER BY cycle ASC",
            ("sim_generic",),
        ).fetchall()

    assert rows
    assert all(row[0] == "thread_sim_generic_simulation" for row in rows)
    assert all(row[1] == "handoff" for row in rows)


def test_manual_simulation_pause_step_resume_controls(tmp_path):
    db_path = tmp_path / "manual.db"
    graph = {
        "nodes": [
            {"id": "a", "data": {"label": "Cycle Agent", "timing_policy": {"type": "every_cycle"}}},
        ],
        "edges": [],
        "metadata": {
            "workflow_mode": "simulation",
            "simulation_defaults": {
                "soft_max_cycles": 3,
                "hard_max_cycles": 20,
                "manual_control": True,
                "random_seed": "manual-test",
            },
        },
    }

    async def wait_for(predicate, timeout=3.0):
        deadline = asyncio.get_event_loop().time() + timeout
        while asyncio.get_event_loop().time() < deadline:
            if predicate():
                return True
            await asyncio.sleep(0.05)
        return False

    def checkpoint_count():
        return len(load_simulation_checkpoints(str(db_path), "sim_manual", "company_test"))

    def execution_row():
        with sqlite3.connect(db_path) as conn:
            return conn.execute(
                "SELECT status, current_iteration, loop_metadata FROM executions WHERE run_id = ?",
                ("sim_manual",),
            ).fetchone()

    def write_control(*, status: str, step_grant: int, paused: bool, mode: str):
        row = execution_row()
        metadata = json.loads(row[2]) if row and row[2] else {}
        metadata["simulation_control"] = {
            **(metadata.get("simulation_control") or {}),
            "mode": mode,
            "paused": paused,
            "step_grant": step_grant,
            "last_command": "test",
        }
        with sqlite3.connect(db_path) as conn:
            conn.execute(
                "UPDATE executions SET status = ?, loop_metadata = ? WHERE run_id = ?",
                (status, json.dumps(metadata), "sim_manual"),
            )

    async def scenario():
        runner = SimulationRunner(
            db_path=str(db_path),
            workflow_id="wf_manual",
            graph=graph,
            company_id="company_test",
            run_id="sim_manual",
            initial_input="Run manual simulation.",
        )
        task = asyncio.create_task(runner.run())

        assert await wait_for(lambda: checkpoint_count() >= 2)
        assert await wait_for(lambda: (execution_row() or [""])[0] == "paused")
        first_row = execution_row()
        assert first_row[1] == 1

        await asyncio.sleep(0.15)
        assert execution_row()[1] == 1

        write_control(status="running", step_grant=1, paused=True, mode="manual")
        assert await wait_for(lambda: checkpoint_count() >= 3)
        assert await wait_for(lambda: (execution_row() or ["", 0])[1] == 2)

        write_control(status="running", step_grant=0, paused=False, mode="auto")
        result = await asyncio.wait_for(task, timeout=3)
        assert result["status"] == "completed"
        assert execution_row()[0] == "completed"
        assert execution_row()[1] == 3

    asyncio.run(scenario())
