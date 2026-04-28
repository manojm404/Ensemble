"""
core/ws_manager.py — WebSocket Manager for Ensemble (Phase 5: Auth + Multi-Tenant)

Manages WebSocket connections with JWT authentication, user-scoped rooms,
and real-time event broadcasting.

Changes from V1:
- Requires JWT authentication on connect
- Connections scoped to user_id (not just company_id)
- Supports per-user event broadcasting
- Automatic cleanup of dead connections
"""

import json
import logging
from typing import Any, Dict, List

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WSConnection:
    """Represents a single authenticated WebSocket connection."""

    def __init__(
        self, websocket: WebSocket, user_id: str, email: str, tier: str = "free"
    ):
        self.websocket = websocket
        self.user_id = user_id
        self.email = email
        self.tier = tier
        self.active = True


class WSManager:
    """
    WebSocket manager with JWT authentication and user-scoped rooms.

    Usage:
        # In FastAPI WebSocket endpoint:
        @app.websocket("/ws")
        async def websocket_endpoint(websocket: WebSocket):
            from backend.ensemble.auth import authenticate_websocket
            user = await authenticate_websocket(websocket)
            await ws_manager.connect(websocket, user)
    """

    def __init__(self):
        # user_id -> list of WSConnection objects
        self._connections: Dict[str, List[WSConnection]] = {}
        # Track all connections for broadcast stats
        self._total_connections = 0

    async def connect(self, websocket: WebSocket, user: dict):
        """
        Connect an authenticated user's WebSocket.

        Args:
            websocket: The accepted WebSocket connection
            user: Dict with id, email, tier from JWT validation
        """
        user_id = user["id"]
        conn = WSConnection(
            websocket=websocket,
            user_id=user_id,
            email=user.get("email", ""),
            tier=user.get("tier", "free"),
        )

        if user_id not in self._connections:
            self._connections[user_id] = []

        self._connections[user_id].append(conn)
        self._total_connections += 1

        logger.info(
            "🔌 [WS] Connected: user=%s email=%s (Total: %d connections, %d users)",
            user_id[:8],
            user.get("email", "?"),
            self._total_connections,
            len(self._connections),
        )

        # Send welcome message
        try:
            await websocket.send_json(
                {
                    "type": "connected",
                    "data": {
                        "user_id": user_id,
                        "email": user.get("email"),
                        "tier": user.get("tier", "free"),
                        "message": "Connected to Ensemble real-time feed",
                    },
                }
            )
        except Exception as e:
            logger.warning("⚠️ [WS] Failed to send welcome message: %s", e)

    async def disconnect(self, websocket: WebSocket, user_id: str = None):
        """
        Disconnect a WebSocket.

        Args:
            websocket: The WebSocket to disconnect
            user_id: Optional user_id for faster lookup
        """
        # Find and remove the connection
        if user_id and user_id in self._connections:
            self._connections[user_id] = [
                c for c in self._connections[user_id] if c.websocket != websocket
            ]
            if not self._connections[user_id]:
                del self._connections[user_id]
            self._total_connections = max(0, self._total_connections - 1)
            logger.info(
                "🔌 [WS] Disconnected: user=%s (Remaining: %d connections, %d users)",
                user_id[:8],
                self._total_connections,
                len(self._connections),
            )
        else:
            # Slow path: search all users
            for uid, conns in list(self._connections.items()):
                for i, conn in enumerate(conns):
                    if conn.websocket == websocket:
                        conns.pop(i)
                        if not conns:
                            del self._connections[uid]
                        self._total_connections = max(0, self._total_connections - 1)
                        logger.info("🔌 [WS] Disconnected: user=%s", uid[:8])
                        return

    async def send_to_user(self, user_id: str, event_type: str, data: Any):
        """Send an event to all WebSocket connections for a specific user."""
        if user_id not in self._connections:
            return

        message = json.dumps(
            {
                "type": event_type,
                "data": data,
            }
        )

        dead_connections = []
        for conn in self._connections[user_id]:
            if conn.active:
                try:
                    await conn.websocket.send_text(message)
                except Exception as e:
                    logger.warning(
                        "⚠️ [WS] Send failed for user %s: %s", user_id[:8], e
                    )
                    dead_connections.append(conn)

        # Clean up dead connections
        for dead in dead_connections:
            await self.disconnect(dead.websocket, user_id)

    async def broadcast(self, company_id: str, event_type: str, data: Any):
        """
        Legacy broadcast: send to all connections for a company_id.
        In multi-tenant mode, this broadcasts to ALL connected users.
        """
        message = json.dumps(
            {
                "type": event_type,
                "data": data,
            }
        )

        dead_connections = []
        for user_id, conns in self._connections.items():
            for conn in conns:
                if conn.active:
                    try:
                        await conn.websocket.send_text(message)
                    except Exception:
                        dead_connections.append((conn, user_id))

        for conn, user_id in dead_connections:
            await self.disconnect(conn.websocket, user_id)

    async def broadcast_to_all(self, event_type: str, data: Any):
        """Broadcast an event to ALL connected users."""
        message = json.dumps(
            {
                "type": event_type,
                "data": data,
            }
        )

        for user_id in list(self._connections.keys()):
            await self.send_to_user(user_id, event_type, data)

    def get_stats(self) -> dict:
        """Get WebSocket connection statistics."""
        return {
            "total_connections": self._total_connections,
            "total_users": len(self._connections),
            "users": {
                uid: {
                    "connections": len(conns),
                    "emails": list(set(c.email for c in conns)),
                }
                for uid, conns in self._connections.items()
            },
        }


# Singleton instance
ws_manager = WSManager()
