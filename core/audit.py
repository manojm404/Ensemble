import asyncio
import sqlite3
import time
import json
from typing import Dict, Any, Optional, List
from core.ws_manager import ws_manager

class AuditLogger:
    def __init__(self, db_path: str = "data/ensemble_audit.db"):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
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

    def log(self, company_id: str, agent_id: str, action_type: str, details_dict: Dict[str, Any], cost_usd: float = 0.0, cas_hash: str = None, broadcast: bool = True):
        """Log an event to the audit record and optionally broadcast it."""
        timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        details_json = json.dumps(details_dict)
        event_id = None
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("""
                INSERT INTO events (timestamp, company_id, agent_id, action_type, details_json, cost_usd, cas_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (timestamp, company_id, agent_id, action_type, details_json, cost_usd, cas_hash))
            event_id = cursor.lastrowid
            
        if broadcast:
            # Safely broadcast from sync to async if loop is running
            event_data = {
                "id": event_id,
                "timestamp": timestamp,
                "agent_id": agent_id,
                "action_type": action_type,
                "details": details_dict,
                "cost_usd": cost_usd
            }
            print(f"📡 [AuditLogger] Broadcasting {action_type} event {event_id} to {company_id}", flush=True)
            try:
                # Try to get the running event loop (Python 3.10+ compatible)
                try:
                    loop = asyncio.get_running_loop()
                except RuntimeError:
                    loop = asyncio.get_event_loop()
                
                if loop and loop.is_running():
                    print(f"📡 [AuditLogger] Using run_coroutine_threadsafe for event {event_id}", flush=True)
                    asyncio.run_coroutine_threadsafe(
                        ws_manager.broadcast(company_id, action_type, event_data),
                        loop
                    )
                else:
                    # Fallback: create new event loop to broadcast
                    print(f"📡 [AuditLogger] Using asyncio.run for event {event_id}", flush=True)
                    asyncio.run(ws_manager.broadcast(company_id, action_type, event_data))
            except Exception as e:
                print(f"⚠️  [AuditLogger] Broadcast failed: {e}", flush=True)

    def get_history(self, company_id: str, limit: int = 20, offset: int = 0, order: str = "DESC") -> List[Dict[str, Any]]:
        """Retrieve events for a given company with pagination and ordering."""
        # Sanitize order input
        sort_order = "ASC" if order.upper() == "ASC" else "DESC"
        
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
                "cas_hash": r[7]
            } for r in rows]
