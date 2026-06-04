from unittest.mock import MagicMock

from core.dag_engine import DAGWorkflowEngine


def test_dependency_nodes_receive_predecessor_output_even_when_role_resets_context():
    mock_space = MagicMock()
    mock_audit = MagicMock()
    mock_llm = MagicMock()
    mock_gov = MagicMock()
    engine = DAGWorkflowEngine(mock_space, mock_audit, mock_llm, mock_gov)

    def space_exists(name: str) -> bool:
        return name in {"user_initial_input", "step1_handover", "step1_output"}

    def space_read(name: str) -> bytes:
        payloads = {
            "user_initial_input": b"Research latest LLMs and publish a report webpage.",
            "step1_handover": b'{"node_id":"step1","summary":"Raw report data ready"}',
        }
        return payloads.get(name, b"")

    mock_space.exists.side_effect = space_exists
    mock_space.read.side_effect = space_read
    mock_space.read_all_versions.return_value = [
        b"Raw output from upstream agent: model comparison data, summary, and notes."
    ]

    node_map = {
        "step2": {
            "data": {
                "role": "Calibration Engineer",
                "timing_policy": {"type": "dependency"},
            }
        }
    }
    edges = [{"source": "step1", "target": "step2"}]

    context = engine._assemble_node_context("run_1", "step2", node_map, edges)

    assert "PROJECT GOAL / TASK" in context
    assert "Handover Summary (step1)" in context
    assert "Outcome of step1" in context
    assert "Raw output from upstream agent" in context
