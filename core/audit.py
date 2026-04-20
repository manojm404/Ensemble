"""
core/audit.py - Audit Logging for Ensemble (Phase 3: Multi-Tenant)

Supports both SQLite (backward compatible) and Supabase (multi-tenant).
When Supabase is configured, all audit events are written to the
`audit_events` table with user_id for RLS isolation.

Usage:
    from core.audit import audit_logger

    # Log an event (user_id is extracted from request context)
    audit_logger.log(
        user_id="user-uuid",
        company_id="org-123",
        agent_id="agent-456",
        action_type="TOOL_CALL",
        details_dict={"tool": "search_web", "query": "something"},
        cost_usd=0.001,
    )

    # Get history (filtered by user_id automatically via RLS in Supabase)
    events = audit_logger.get_history(user_id="user-uuid", limit=20)
"""

import asyncio
import json
import logging
import os
import sqlite3
import time
from typing import Dict, Any, Optional, List

from core.ws_manager import ws_manager

logger = logging.getLogger(__name__)


class AuditLogger:
    """
    Audit logger with dual backend support:
    - SQLite: backward compatible, single-user mode
    - Supabase: multi-tenant with RLS user isolation

    The backend is auto-detected based on SUPABASE_URL env var.
    """

    def __init__(self, db_path: str = "data/ensemble_audit.db"):
        self.db_path = db_path
        self.use_supabase = bool(os.getenv("SUPABASE_URL"))

        if self.use_supabase:
            logger.info("✅ [AuditLogger] Using Supabase backend (multi-tenant)")
        else:
            logger.info("ℹ️  [AuditLogger] Using SQLite backend (single-user mode)")
            self._init_sqlite()

    def _init_sqlite(self):
        """Initialize SQLite schema (only used when Supabase is not configured)."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT,
                    company_id TEXT,
                    agent_id TEXT,
                    action_type TEXT,
                    details_json TEXT,
                    cost_usd REAL,
                    cas_hash TEXT
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS notifications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT,
                    user_id TEXT,
                    company_id TEXT,
                    from_name TEXT,
                    from_avatar TEXT,
                    title TEXT,
                    preview TEXT,
                    content TEXT,
                    is_unread INTEGER DEFAULT 1,
                    is_starred INTEGER DEFAULT 0,
                    is_archived INTEGER DEFAULT 0,
                    category TEXT
                )
            """)

    def log(
        self,
        company_id: str,
        agent_id: str,
        action_type: str,
        details_dict: Dict[str, Any],
        cost_usd: float = 0.0,
        cas_hash: str = None,
        broadcast: bool = True,
        user_id: str = None,
    ):
        """
        Log an event to the audit record.

        Args:
            user_id: The user who owns this event (required for Supabase mode)
            company_id: Organization/project identifier
            agent_id: The agent that performed the action
            action_type: Type of action (e.g., "TOOL_CALL", "THOUGHT", "STATE_CHANGE")
            details_dict: Additional context about the action
            cost_usd: Cost of this action in USD
            cas_hash: Content-addressable storage hash
            broadcast: Whether to broadcast via WebSocket
        """
        timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        details_json = json.dumps(details_dict)

        if self.use_supabase:
            self._log_supabase(user_id, company_id, agent_id, action_type, details_json, cost_usd, cas_hash, timestamp, broadcast)
        else:
            self._log_sqlite(company_id, agent_id, action_type, details_json, cost_usd, cas_hash, timestamp, broadcast)

    def _log_sqlite(self, company_id, agent_id, action_type, details_json, cost_usd, cas_hash, timestamp, broadcast):
        """Write to SQLite."""
        event_id = None
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("""
                INSERT INTO events (timestamp, company_id, agent_id, action_type, details_json, cost_usd, cas_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (timestamp, company_id, agent_id, action_type, details_json, cost_usd, cas_hash))
            event_id = cursor.lastrowid

        self._broadcast(event_id, company_id, agent_id, action_type, details_json, cost_usd, broadcast)

    def _log_supabase(self, user_id, company_id, agent_id, action_type, details_json, cost_usd, cas_hash, timestamp, broadcast):
        """Write to Supabase audit_events table."""
        try:
            from core.supabase_client import supabase_admin

            client = supabase_admin.client
            event_data = {
                "user_id": user_id,
                "company_id": company_id,
                "agent_id": agent_id,
                "action_type": action_type,
                "details_json": json.loads(details_json) if isinstance(details_json, str) else details_json,
                "cost_usd": cost_usd,
                "cas_hash": cas_hash,
            }

            result = client.table("audit_events").insert(event_data).execute()

            event_id = result.data[0]["id"] if result.data else None
            logger.debug("📝 [AuditLogger] Logged %s event to Supabase (user: %s)", action_type, user_id)

        except Exception as e:
            logger.warning("⚠️ [AuditLogger] Failed to write to Supabase: %s — falling back to SQLite", e)
            # Fallback to SQLite if Supabase fails
            self._log_sqlite(company_id, agent_id, action_type, details_json, cost_usd, cas_hash, timestamp, broadcast)
            return

        self._broadcast(event_id, company_id, agent_id, action_type, details_json, cost_usd, broadcast)

    def _broadcast(self, event_id, company_id, agent_id, action_type, details_json, cost_usd, broadcast):
        """Broadcast event via WebSocket."""
        if not broadcast:
            return

        event_data = {
            "id": event_id,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "agent_id": agent_id,
            "action_type": action_type,
            "details": json.loads(details_json) if isinstance(details_json, str) else details_json,
            "cost_usd": cost_usd,
        }
        logger.debug("📡 [AuditLogger] Broadcasting %s event %s to %s", action_type, event_id, company_id)

        try:
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                loop = asyncio.get_event_loop()

            if loop and loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    ws_manager.broadcast(company_id, action_type, event_data),
                    loop,
                )
            else:
                asyncio.run(ws_manager.broadcast(company_id, action_type, event_data))
        except Exception as e:
            logger.warning("⚠️  [AuditLogger] Broadcast failed: %s", e)

    def get_history(
        self,
        company_id: str,
        limit: int = 20,
        offset: int = 0,
        order: str = "DESC",
        user_id: str = None,
    ) -> List[Dict[str, Any]]:
        """
        Retrieve audit events with pagination.

        In Supabase mode, results are automatically filtered by user_id via RLS.
        In SQLite mode, user_id is ignored (single-user mode).
        """
        sort_order = "ASC" if order.upper() == "ASC" else "DESC"

        if self.use_supabase:
            return self._get_history_supabase(company_id, limit, offset, sort_order)
        else:
            return self._get_history_sqlite(company_id, limit, offset, sort_order)

    def _get_history_sqlite(self, company_id, limit, offset, sort_order):
        """Read from SQLite."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(f"""
                SELECT id, timestamp, company_id, agent_id, action_type, details_json, cost_usd, cas_hash
                FROM events
                WHERE company_id = ?
                ORDER BY id {sort_order}
                LIMIT ? OFFSET ?
            """, (company_id, limit, offset))

            rows = cursor.fetchall()
            return [{
                "id": r[0],
                "timestamp": r[1],
                "company_id": r[2],
                "agent_id": r[3],
                "action_type": r[4],
                "details": json.loads(r[5]),
                "cost_usd": r[6],
                "cas_hash": r[7],
            } for r in rows]

    def _get_history_supabase(self, company_id, limit, offset, sort_order):
        """Read from Supabase (RLS filters by user_id automatically)."""
        try:
            from core.supabase_client import supabase_admin

            client = supabase_admin.client
            query = client.table("audit_events").select("*").order("id", desc=(sort_order == "DESC"))

            if company_id:
                query = query.eq("company_id", company_id)

            result = query.range(offset, offset + limit - 1).execute()

            return [{
                "id": r.get("id"),
                "timestamp": r.get("created_at", r.get("timestamp")),
                "company_id": r.get("company_id"),
                "agent_id": r.get("agent_id"),
                "action_type": r.get("action_type"),
                "details": r.get("details_json", {}),
                "cost_usd": float(r.get("cost_usd", 0)),
                "cas_hash": r.get("cas_hash"),
            } for r in (result.data or [])]

        except Exception as e:
            logger.warning("⚠️ [AuditLogger] Failed to read from Supabase: %s", e)
            return []

    def replay(self, event_id: int) -> Optional[Dict[str, Any]]:
        """Retrieve a single event by ID for replay."""
        if self.use_supabase:
            return self._replay_supabase(event_id)
        else:
            return self._replay_sqlite(event_id)

    def _replay_sqlite(self, event_id):
        """Read single event from SQLite."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("""
                SELECT id, timestamp, company_id, agent_id, action_type, details_json, cost_usd, cas_hash
                FROM events WHERE id = ?
            """, (event_id,))
            row = cursor.fetchone()
            if not row:
                return None
            return {
                "id": row[0],
                "timestamp": row[1],
                "company_id": row[2],
                "agent_id": row[3],
                "action_type": row[4],
                "details": json.loads(row[5]),
                "cost_usd": row[6],
                "cas_hash": row[7],
            }

    def _replay_supabase(self, event_id):
        """Read single event from Supabase."""
        try:
            from core.supabase_client import supabase_admin
            client = supabase_admin.client
            result = client.table("audit_events").select("*").eq("id", event_id).execute()
            if not result.data:
                return None
            r = result.data[0]
            return {
                "id": r.get("id"),
                "timestamp": r.get("created_at"),
                "company_id": r.get("company_id"),
                "agent_id": r.get("agent_id"),
                "action_type": r.get("action_type"),
                "details": r.get("details_json", {}),
                "cost_usd": float(r.get("cost_usd", 0)),
                "cas_hash": r.get("cas_hash"),
            }
        except Exception as e:
            logger.warning("⚠️ [AuditLogger] Replay failed: %s", e)
            return None

    def notify(
        self,
        user_id: str,
        company_id: str,
        title: str,
        preview: str,
        content: str,
        from_name: str = "Ensemble",
        from_avatar: str = "🤖",
        category: str = "system",
        broadcast: bool = True
    ):
        """Persistent notification for the Inbox."""
        timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        
        # SQLite storage
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT INTO notifications (
                    timestamp, user_id, company_id, from_name, from_avatar,
                    title, preview, content, category, is_unread
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            """, (timestamp, user_id, company_id, from_name, from_avatar, title, preview, content, category))
        
        if broadcast:
            # Broadcast to UI for live badge updates
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    asyncio.run_coroutine_threadsafe(
                        ws_manager.broadcast(company_id, "NOTIFICATION", {
                            "title": title,
                            "preview": preview,
                            "category": category
                        }),
                        loop
                    )
                else:
                    asyncio.run(ws_manager.broadcast(company_id, "NOTIFICATION", {
                        "title": title,
                        "preview": preview,
                        "category": category
                    }))
            except Exception as e:
                logger.warning("⚠️  [AuditLogger] Notification broadcast failed: %s", e)

    def get_notifications(self, user_id: str, company_id: str = None, limit: int = 50) -> List[Dict[str, Any]]:
        """Fetch notifications for the Inbox."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            query = "SELECT * FROM notifications WHERE (user_id = ? OR user_id = 'dev_user' OR user_id IS NULL)"
            params = [user_id]
            
            if company_id:
                query += " AND company_id = ?"
                params.append(company_id)
                
            query += " ORDER BY timestamp DESC LIMIT ?"
            params.append(limit)
            
            cursor = conn.execute(query, params)
            return [dict(row) for row in cursor.fetchall()]

    def mark_notification_read(self, notification_id: int):
        """Mark a notification as read."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("UPDATE notifications SET is_unread = 0 WHERE id = ?", (notification_id,))


# Export singleton
audit_logger = AuditLogger()
