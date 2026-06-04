"""Threaded agent-to-agent messages for Workflow Studio 2.0.

The message ledger is deliberately small and deterministic. It gives the
simulation/event runtimes an immutable communication primitive before the full
database-backed message bus lands.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Sequence


VALID_VISIBILITIES = {"public", "private", "hidden_until_audit"}
VALID_MESSAGE_TYPES = {"handoff", "collusion", "warning", "email", "override", "note", "profit_report"}


class AgentMessageValidationError(ValueError):
    """Raised when an agent message violates the message bus contract."""


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class AgentMessage:
    message_id: str
    run_id: str
    cycle: int
    sender_node_id: str
    recipient_node_ids: Sequence[str]
    visibility: str = "public"
    message_type: str = "note"
    subject: str = ""
    body: str = ""
    related_state_keys: Sequence[str] = field(default_factory=tuple)
    source_event_ids: Sequence[str] = field(default_factory=tuple)
    created_at: str = field(default_factory=_now_iso)
    thread_id: Optional[str] = None
    in_reply_to: Optional[str] = None

    def __post_init__(self) -> None:
        self.recipient_node_ids = tuple(str(item) for item in self.recipient_node_ids)
        self.related_state_keys = tuple(str(item) for item in self.related_state_keys)
        self.source_event_ids = tuple(str(item) for item in self.source_event_ids)
        self.visibility = str(self.visibility or "public")
        self.message_type = str(self.message_type or "note")
        self.cycle = int(self.cycle)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "message_id": self.message_id,
            "run_id": self.run_id,
            "cycle": self.cycle,
            "sender_node_id": self.sender_node_id,
            "recipient_node_ids": list(self.recipient_node_ids),
            "visibility": self.visibility,
            "message_type": self.message_type,
            "subject": self.subject,
            "body": self.body,
            "related_state_keys": list(self.related_state_keys),
            "source_event_ids": list(self.source_event_ids),
            "created_at": self.created_at,
            "thread_id": self.thread_id,
            "in_reply_to": self.in_reply_to,
        }


class AgentMessageLedger:
    """In-memory immutable ledger with production validation semantics."""

    def __init__(self, messages: Optional[Iterable[AgentMessage | Dict[str, Any]]] = None) -> None:
        self._messages_by_id: Dict[str, AgentMessage] = {}
        self._messages: List[AgentMessage] = []
        for message in messages or []:
            self.add_message(message)

    def add_message(self, message: AgentMessage | Dict[str, Any]) -> AgentMessage:
        normalized = message if isinstance(message, AgentMessage) else AgentMessage(**message)
        self._validate_new_message(normalized)
        self._messages_by_id[normalized.message_id] = normalized
        self._messages.append(normalized)
        return normalized

    def list_messages(self) -> List[AgentMessage]:
        return list(self._messages)

    def messages_for_run(self, run_id: str) -> List[AgentMessage]:
        return [message for message in self._messages if message.run_id == run_id]

    def threads_for_run(self, run_id: str) -> List[Dict[str, Any]]:
        return build_message_threads(self.messages_for_run(run_id))

    def _validate_new_message(self, message: AgentMessage) -> None:
        if not message.message_id:
            raise AgentMessageValidationError("message_id is required")
        if message.message_id in self._messages_by_id:
            raise AgentMessageValidationError(f"message {message.message_id} already exists and is immutable")
        if not message.run_id:
            raise AgentMessageValidationError("run_id is required")
        if not message.sender_node_id:
            raise AgentMessageValidationError("sender_node_id is required")
        if not message.recipient_node_ids:
            raise AgentMessageValidationError("at least one recipient is required")
        if message.visibility not in VALID_VISIBILITIES:
            raise AgentMessageValidationError(f"invalid visibility: {message.visibility}")
        if message.message_type not in VALID_MESSAGE_TYPES:
            raise AgentMessageValidationError(f"invalid message_type: {message.message_type}")
        if message.message_type == "email" and not message.thread_id:
            raise AgentMessageValidationError("email messages require thread_id")
        if message.in_reply_to == message.message_id:
            raise AgentMessageValidationError("in_reply_to cannot point to itself")

        if message.in_reply_to:
            parent = self._messages_by_id.get(message.in_reply_to)
            if not parent:
                raise AgentMessageValidationError("in_reply_to must reference an existing message")
            if parent.run_id != message.run_id:
                raise AgentMessageValidationError("in_reply_to must reference a message in the same run")
            if parent.thread_id != message.thread_id:
                raise AgentMessageValidationError("reply must share the same thread_id as its parent")
            self._validate_no_thread_cycle(message)

    def _validate_no_thread_cycle(self, message: AgentMessage) -> None:
        seen = {message.message_id}
        parent_id = message.in_reply_to
        while parent_id:
            if parent_id in seen:
                raise AgentMessageValidationError("message thread cannot contain cycles")
            seen.add(parent_id)
            parent = self._messages_by_id.get(parent_id)
            parent_id = parent.in_reply_to if parent else None


def build_message_threads(messages: Iterable[AgentMessage | Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Group messages by thread and order replies under their parents."""
    normalized = [message if isinstance(message, AgentMessage) else AgentMessage(**message) for message in messages]
    by_id = {message.message_id: message for message in normalized}
    groups: Dict[str, List[AgentMessage]] = {}
    for message in normalized:
        thread_key = message.thread_id or f"unthreaded:{message.message_id}"
        groups.setdefault(thread_key, []).append(message)

    def sort_key(message: AgentMessage) -> tuple[int, str, str]:
        return (message.cycle, message.created_at or "", message.message_id)

    result: List[Dict[str, Any]] = []
    for thread_id, group in groups.items():
        children: Dict[Optional[str], List[AgentMessage]] = {}
        for message in group:
            parent_id = message.in_reply_to if message.in_reply_to in by_id else None
            children.setdefault(parent_id, []).append(message)

        ordered: List[AgentMessage] = []

        def visit(message: AgentMessage, depth: int) -> None:
            setattr(message, "_thread_depth", depth)
            ordered.append(message)
            for child in sorted(children.get(message.message_id, []), key=sort_key):
                visit(child, depth + 1)

        for root in sorted(children.get(None, []), key=sort_key):
            visit(root, 0)

        result.append({
            "thread_id": thread_id,
            "messages": [
                {**message.to_dict(), "depth": int(getattr(message, "_thread_depth", 0))}
                for message in ordered
            ],
        })

    result.sort(key=lambda thread: (
        thread["messages"][0]["cycle"] if thread["messages"] else 0,
        thread["messages"][0]["created_at"] if thread["messages"] else "",
        thread["thread_id"],
    ))
    return result
