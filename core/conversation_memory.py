"""
core/memory.py
Conversation buffer memory for agents.
Written from scratch (agency-agents source repo contains no Python code).
"""
from dataclasses import dataclass, field
from typing import List, Dict, Any


@dataclass
class Message:
    role: str          # "system" | "user" | "assistant"
    content: str
    metadata: Dict[str, Any] = field(default_factory=dict)


class ConversationBufferMemory:
    """Simple rolling conversation buffer."""

    def __init__(self, max_messages: int = 100):
        self._messages: List[Message] = []
        self.max_messages = max_messages

    def add_message(self, role: str, content: str, **metadata):
        msg = Message(role=role, content=content, metadata=metadata)
        self._messages.append(msg)
        if len(self._messages) > self.max_messages:
            # Keep system message + trim oldest non-system messages
            system = [m for m in self._messages if m.role == "system"]
            non_system = [m for m in self._messages if m.role != "system"]
            non_system = non_system[-(self.max_messages - len(system)):]
            self._messages = system + non_system

    def get_messages(self) -> List[Message]:
        return list(self._messages)

    def get_history_text(self) -> str:
        return "\n".join(f"[{m.role.upper()}]: {m.content}" for m in self._messages)

    def clear(self):
        self._messages = []

    def __len__(self):
        return len(self._messages)
