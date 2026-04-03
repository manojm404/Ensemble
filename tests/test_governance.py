import os
import sqlite3
import pytest
from core.governance import Governance

def test_governance_budget_tracking():
    db_path = "/tmp/test_gov.db"
    if os.path.exists(db_path):
        os.remove(db_path)
        
    gov = Governance(db_path)
    gov.register_agent("agent1", "comp1", "role1")
    
    # Initialize budget: monthly_limit=5.0, spent=0.0, escrowed=0.0
    # Request grant
    granted = gov.request_token_grant("agent1", 1.0)
    assert granted is True
    
    # Check escrowed
    with sqlite3.connect(db_path) as conn:
        cursor = conn.execute("SELECT escrowed FROM budgets WHERE agent_id = 'agent1'")
        assert cursor.fetchone()[0] == 1.0
    
    # Confirm cost
    gov.confirm_cost("agent1", 0.5)
    with sqlite3.connect(db_path) as conn:
        cursor = conn.execute("SELECT spent, escrowed FROM budgets WHERE agent_id = 'agent1'")
        row = cursor.fetchone()
        assert row[0] == 0.5  # spent
        assert row[1] == 0.5  # escrowed remaining (MAX(0, 1.0-0.5))

    if os.path.exists(db_path):
        os.remove(db_path)
