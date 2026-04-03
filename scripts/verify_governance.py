import sys
import os
import asyncio
import sqlite3
import json
import time

# Add workdir to sys.path to import core
sys.path.append(os.getcwd())

from core.governance import Governance
from core.audit import AuditLogger
from core.ensemble_space import EnsembleSpace
from core.llm_provider import LLMProvider
from core.engine import SOPEngine

def setup_test_db(db_path):
    if os.path.exists(db_path):
        os.remove(db_path)
    
    with sqlite3.connect(db_path) as conn:
        conn.execute("CREATE TABLE IF NOT EXISTS pending_approvals (approval_id TEXT PRIMARY KEY, agent_id TEXT, action TEXT, details_json TEXT, reason TEXT, status TEXT DEFAULT 'PENDING', timestamp REAL)")
        conn.execute("CREATE TABLE IF NOT EXISTS sop_runs (run_id TEXT PRIMARY KEY, sop_path TEXT, current_state TEXT, last_agent_id TEXT, status TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)")
        conn.execute("CREATE TABLE IF NOT EXISTS agents (agent_id TEXT PRIMARY KEY, company_id TEXT, role TEXT, parent_id TEXT, depth INTEGER, status TEXT, endpoint TEXT)")
        conn.execute("CREATE TABLE IF NOT EXISTS budgets (agent_id TEXT PRIMARY KEY, monthly_limit REAL, spent REAL, escrowed REAL)")

        # Seed data for a "Restarted" scenario
        conn.execute("INSERT INTO pending_approvals (approval_id, agent_id, action, details_json, reason, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)",
                     ("appr_test_123", "test_agent", "shell_cmd", json.dumps({"cmd": "rm -rf /"}), "Test destructive command", "PENDING", time.time() - 100))
        
        conn.execute("INSERT INTO sop_runs (run_id, sop_path, current_state, last_agent_id, status) VALUES (?, ?, ?, ?, ?)",
                     ("run_hibernated_001", "directives/test_sop.yaml", "Implementation", "test_agent", "HIBERNATING"))

async def test_governance_reload():
    print("--- Testing Governance Restart & Reload ---")
    db_path = "data/ensemble_governance_test.db"
    setup_test_db(db_path)
    
    # Initialize Governance with the test DB
    gov = Governance(db_path=db_path)
    
    # Check if pending approval was reloaded into memory
    if "appr_test_123" in gov.pending_approvals:
        print("✅ Success: Pending approval reloaded into memory registry.")
        assert gov.approval_data["appr_test_123"]["agent_id"] == "test_agent"
    else:
        print("❌ Failed: Pending approval missing from memory registry.")
        exit(1)

    # Check if event was created
    event = gov.pending_approvals["appr_test_123"]
    if isinstance(event, asyncio.Event):
        print("✅ Success: Async Event initialized for pending approval.")
    
    print("--- Testing 24h Timeout Escalation (Fast Forward) ---")
    # Manually update DB timestamp to be 25 hours ago
    with sqlite3.connect(db_path) as conn:
        conn.execute("UPDATE pending_approvals SET timestamp = ? WHERE approval_id = ?", (time.time() - (25 * 3600), "appr_test_123"))
    
    # Trigger a manual timeout check (without waiting an hour)
    # We call the internal task logic directly
    await gov._timeout_monitor_task() # This will run once and check (the while loop will be awaited once)
    
    with sqlite3.connect(db_path) as conn:
        cursor = conn.execute("SELECT status FROM pending_approvals WHERE approval_id = ?", ("appr_test_123",))
        result = cursor.fetchone()[0]
        if result == 'TIMEOUT':
            print("✅ Success: Approval auto-timed out after 24h simulation.")
        else:
            print(f"❌ Failed: Approval status is {result}, expected TIMEOUT.")
            exit(1)

if __name__ == "__main__":
    if not os.path.exists("data"):
        os.makedirs("data")
    asyncio.run(test_governance_reload())
