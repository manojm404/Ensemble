import pytest

from core.workflows.messages import (
    AgentMessage,
    AgentMessageLedger,
    AgentMessageValidationError,
    build_message_threads,
)


def _message(message_id: str, **overrides):
    payload = {
        "message_id": message_id,
        "run_id": "run_banana",
        "cycle": 1,
        "sender_node_id": "agent_8",
        "recipient_node_ids": ["agent_15"],
        "visibility": "public",
        "message_type": "email",
        "subject": "Per my last banana",
        "body": "Please reconcile the missing bananas.",
        "thread_id": "thread_banana_complaint",
    }
    payload.update(overrides)
    return AgentMessage(**payload)


def test_email_messages_require_thread_id():
    ledger = AgentMessageLedger()

    with pytest.raises(AgentMessageValidationError, match="email messages require thread_id"):
        ledger.add_message(_message("msg_001", thread_id=None))


def test_reply_must_reference_existing_message_in_same_thread_and_run():
    ledger = AgentMessageLedger()
    ledger.add_message(_message("msg_001"))

    with pytest.raises(AgentMessageValidationError, match="existing message"):
        ledger.add_message(_message("msg_002", in_reply_to="missing"))

    with pytest.raises(AgentMessageValidationError, match="same run"):
        other = AgentMessage(
            message_id="msg_other",
            run_id="other_run",
            cycle=1,
            sender_node_id="agent_x",
            recipient_node_ids=["agent_15"],
            message_type="email",
            thread_id="thread_other",
        )
        ledger.add_message(other)
        ledger.add_message(_message("msg_003", in_reply_to="msg_other", thread_id="thread_other"))

    with pytest.raises(AgentMessageValidationError, match="same thread_id"):
        ledger.add_message(_message("msg_004", in_reply_to="msg_001", thread_id="thread_wrong"))


def test_in_reply_to_cannot_point_to_self_and_messages_are_immutable():
    ledger = AgentMessageLedger()

    with pytest.raises(AgentMessageValidationError, match="itself"):
        ledger.add_message(_message("msg_001", in_reply_to="msg_001"))

    ledger.add_message(_message("msg_002"))
    with pytest.raises(AgentMessageValidationError, match="immutable"):
        ledger.add_message(_message("msg_002", body="Changed body"))


def test_message_threads_preserve_reply_order_and_depth():
    messages = [
        _message("msg_001", cycle=1, sender_node_id="agent_8", body="Per my last banana."),
        _message("msg_002", cycle=2, sender_node_id="agent_12", in_reply_to="msg_001", body="Threat noted."),
        _message("msg_004", cycle=4, sender_node_id="agent_5", in_reply_to="msg_001", body="I deny everything."),
        _message("msg_003", cycle=3, sender_node_id="agent_14", in_reply_to="msg_002", body="AUDIT COMPLETE."),
    ]

    ledger = AgentMessageLedger(messages)
    threads = ledger.threads_for_run("run_banana")

    assert len(threads) == 1
    assert threads[0]["thread_id"] == "thread_banana_complaint"
    assert [msg["message_id"] for msg in threads[0]["messages"]] == ["msg_001", "msg_002", "msg_003", "msg_004"]
    assert [msg["depth"] for msg in threads[0]["messages"]] == [0, 1, 2, 1]


def test_build_message_threads_falls_back_to_chronological_unthreaded_groups():
    messages = [
        AgentMessage(
            message_id="msg_note",
            run_id="run_banana",
            cycle=2,
            sender_node_id="agent_10",
            recipient_node_ids=["agent_15"],
            message_type="note",
            body="Guilt score is rising.",
        )
    ]

    threads = build_message_threads(messages)

    assert threads[0]["thread_id"] == "unthreaded:msg_note"
    assert threads[0]["messages"][0]["message_id"] == "msg_note"
