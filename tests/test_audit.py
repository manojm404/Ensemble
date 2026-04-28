import sys
import os
import pytest
from backend.ensemble.security.audit import AuditLogger

def test_audit_log_and_replay():
    db_path = "/tmp/test_audit.db"
    if os.path.exists(db_path):
        os.remove(db_path)
    
    logger = AuditLogger(db_path)
    details = {"thought": "test_thought"}
    logger.log("comp1", "agent1", "THOUGHT", details, cost_usd=0.001)
    
    # Replay first event
    event = logger.replay(1)
    assert event is not None
    assert event["company_id"] == "comp1"
    assert event["agent_id"] == "agent1"
    assert event["action_type"] == "THOUGHT"
    assert event["details"]["thought"] == "test_thought"
    assert event["cost_usd"] == 0.001
    
    if os.path.exists(db_path):
        os.remove(db_path)
