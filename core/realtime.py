"""
core/realtime.py - Supabase Realtime Subscriptions for Ensemble

Subscribes to Supabase Realtime events and broadcasts them
to connected WebSocket clients. This provides live dashboard updates
for audit events, budget changes, and workflow status.

Usage:
    from core.realtime import realtime_subscriptions

    # Called during app startup
    await realtime_subscriptions.start()

    # Called during app shutdown
    await realtime_subscriptions.stop()
"""

import asyncio
import json
import logging
import os
from typing import Callable, Dict, Any, Optional

logger = logging.getLogger(__name__)


class RealtimeSubscriptions:
    """
    Manages Supabase Realtime subscriptions and broadcasts
    to WebSocket clients.
    """

    def __init__(self):
        self.running = False
        self._tasks: Dict[str, asyncio.Task] = {}
        self._user_callbacks: Dict[str, list] = {}  # user_id -> list of callbacks

    async def start(self):
        """Start all realtime subscriptions."""
        if not os.getenv("SUPABASE_URL"):
            logger.info("ℹ️  [Realtime] Supabase not configured — skipping realtime subscriptions")
            return

        self.running = True
        logger.info("🚀 [Realtime] Starting Supabase Realtime subscriptions")

        # Note: The Python supabase library doesn't support Realtime subscriptions
        # directly. We'll use HTTP polling as a fallback for now.
        # For production, consider using the Supabase JS client via a Node.js
        # sidecar or switching to a WebSocket-based pub/sub like Redis.
        logger.info("ℹ️  [Realtime] Using HTTP polling for audit events (Python limitation)")
        self._tasks["audit_poll"] = asyncio.create_task(self._poll_audit_events())

    async def stop(self):
        """Stop all realtime subscriptions."""
        self.running = False
        for name, task in self._tasks.items():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        logger.info("🛑 [Realtime] All subscriptions stopped")

    async def _poll_audit_events(self):
        """Poll for new audit events and broadcast to connected clients."""
        import time
        last_id = 0

        while self.running:
            try:
                from core.supabase_client import supabase_admin

                # Get recent audit events
                result = supabase_admin.query(
                    "audit_events",
                    "select",
                    columns="*",
                    order="id.desc",
                    limit="10",
                )

                if result.data:
                    for event in reversed(result.data):
                        event_id = event.get("id", 0)
                        if event_id > last_id:
                            last_id = event_id
                            user_id = event.get("user_id")
                            if user_id and user_id in self._user_callbacks:
                                for callback in self._user_callbacks[user_id]:
                                    try:
                                        await callback(event)
                                    except Exception as e:
                                        logger.warning(
                                            "⚠️ [Realtime] Callback failed: %s", e
                                        )

            except Exception as e:
                logger.warning("⚠️ [Realtime] Audit poll error: %s", e)

            await asyncio.sleep(2)  # Poll every 2 seconds

    def register_user(self, user_id: str, callback: Callable):
        """Register a callback for a user's realtime events."""
        if user_id not in self._user_callbacks:
            self._user_callbacks[user_id] = []
        self._user_callbacks[user_id].append(callback)
        logger.debug("📡 [Realtime] Registered callback for user %s", user_id)

    def unregister_user(self, user_id: str, callback: Callable = None):
        """Unregister a user's callbacks."""
        if user_id in self._user_callbacks:
            if callback:
                self._user_callbacks[user_id] = [
                    cb for cb in self._user_callbacks[user_id] if cb != callback
                ]
            else:
                del self._user_callbacks[user_id]


# Module-level singleton
realtime_subscriptions = RealtimeSubscriptions()
