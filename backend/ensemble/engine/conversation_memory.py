"""
core/conversation_memory.py
Conversation buffer memory for agents.
Phase 3: Added Supabase persistence for multi-tenant conversation storage.
"""

import logging
import os
from dataclasses import dataclass, field
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


@dataclass
class Message:
    role: str  # "system" | "user" | "assistant"
    content: str
    metadata: Dict[str, Any] = field(default_factory=dict)


class ConversationBufferMemory:
    """
    Simple rolling conversation buffer with optional Supabase persistence.

    In multi-tenant mode (Supabase configured), conversations are persisted
    and can be loaded across server restarts.
    """

    def __init__(
        self, max_messages: int = 100, user_id: str = None, session_id: str = None
    ):
        self._messages: List[Message] = []
        self.max_messages = max_messages
        self.user_id = user_id  # Phase 3: Multi-tenant user scoping
        self.session_id = session_id or "default"
        self.use_supabase = bool(os.getenv("SUPABASE_URL")) and user_id

        # Load persisted conversation if available
        if self.use_supabase:
            self._load_from_supabase()

    def add_message(self, role: str, content: str, **metadata):
        """Add a message to the buffer and persist if using Supabase."""
        msg = Message(role=role, content=content, metadata=metadata)
        self._messages.append(msg)
        if len(self._messages) > self.max_messages:
            system = [m for m in self._messages if m.role == "system"]
            non_system = [m for m in self._messages if m.role != "system"]
            non_system = non_system[-(self.max_messages - len(system)) :]
            self._messages = system + non_system

        # Persist to Supabase
        if self.use_supabase:
            self._save_to_supabase()

    def get_messages(self) -> List[Message]:
        return list(self._messages)

    def get_history_text(self) -> str:
        return "\n".join(f"[{m.role.upper()}]: {m.content}" for m in self._messages)

    def clear(self):
        self._messages = []
        if self.use_supabase:
            self._save_to_supabase()

    def __len__(self):
        return len(self._messages)

    # ============================================================
    # Supabase Persistence
    # ============================================================

    def _load_from_supabase(self):
        """Load conversation from Supabase on initialization."""
        try:
            from backend.ensemble.supabase_client import supabase_admin

            client = supabase_admin.client

            result = (
                client.table("conversations")
                .select("*")
                .eq("user_id", self.user_id)
                .eq("session_id", self.session_id)
                .execute()
            )

            if result.data:
                row = result.data[0]
                messages_data = row.get("messages", [])
                if messages_data:
                    self._messages = [
                        Message(
                            role=m["role"],
                            content=m["content"],
                            metadata=m.get("metadata", {}),
                        )
                        for m in messages_data
                    ]
                    logger.debug(
                        "📥 [ConversationMemory] Loaded %d messages from Supabase (user: %s)",
                        len(self._messages),
                        self.user_id,
                    )

        except Exception as e:
            logger.warning(
                "⚠️ [ConversationMemory] Failed to load from Supabase: %s", e
            )

    def _save_to_supabase(self):
        """Persist conversation to Supabase."""
        try:
            from backend.ensemble.supabase_client import supabase_admin

            client = supabase_admin.client

            messages_data = [
                {"role": m.role, "content": m.content, "metadata": m.metadata}
                for m in self._messages
            ]

            total_tokens = sum(
                len(m.content.split()) * 1.3 for m in self._messages
            )  # Rough estimate

            conv_data = {
                "user_id": self.user_id,
                "session_id": self.session_id,
                "messages": messages_data,
                "token_count": int(total_tokens),
            }

            client.table("conversations").upsert(
                conv_data, on_conflict="user_id,session_id"
            ).execute()

        except Exception as e:
            logger.warning("⚠️ [ConversationMemory] Failed to save to Supabase: %s", e)
