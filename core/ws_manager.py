"""
core/ws_manager.py
WebSocket manager for real-time broadcasting of agent events.
"""
import asyncio
import json
from typing import Dict, List, Any
from fastapi import WebSocket

class WSManager:
    def __init__(self):
        # company_id -> list of active WebSockets
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, company_id: str):
        """Connect a new WebSocket to a company's broadcast channel."""
        await websocket.accept()
        if company_id not in self.active_connections:
            self.active_connections[company_id] = []
        self.active_connections[company_id].append(websocket)
        print(f"WS connected: {company_id} (Total: {len(self.active_connections[company_id])})")

    async def disconnect(self, websocket: WebSocket, company_id: str):
        """Disconnect a WebSocket."""
        if company_id in self.active_connections:
            self.active_connections[company_id].remove(websocket)
            if not self.active_connections[company_id]:
                del self.active_connections[company_id]
        print(f"WS disconnected: {company_id}")

    async def broadcast(self, company_id: str, event_type: str, data: Any):
        """Send a JSON event to all connected clients for a company."""
        if company_id not in self.active_connections:
            return
            
        message = json.dumps({
            "type": event_type,
            "data": data,
            "timestamp": asyncio.get_event_loop().time()
        })
        
        # Broadcast to all active connections
        to_remove = []
        for connection in self.active_connections[company_id]:
            try:
                await connection.send_text(message)
            except Exception as e:
                print(f"WS broadcast error: {e}")
                to_remove.append(connection)
                
        # Bulk remove dead connections
        for dead_conn in to_remove:
            self.active_connections[company_id].remove(dead_conn)

# Single global instance
ws_manager = WSManager()
