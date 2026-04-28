import pytest
from unittest.mock import MagicMock
from backend.ensemble.engine.managed_agent import ManagedAgent

def test_agent_stuck_detection():
    gov = MagicMock()
    audit = MagicMock()
    llm = MagicMock()
    
    gov.request_token_grant.return_value = True
    llm.generate.return_value = ("Same output.", 10, 0.001)
    
    agent = ManagedAgent("agent1", "comp1", "system", gov, audit, llm)
    
    # First output
    agent.run("input1")
    assert len(agent.last_outputs) == 1
    
    # Second output
    agent.run("input2")
    assert len(agent.last_outputs) == 2
    
    # Third output (same) should trigger stuck detection warning injection
    agent.run("input3")
    assert len(agent.last_outputs) == 3
    
    # Check if system message was added (warning about being stuck)
    history = agent.memory.get_messages()
    system_messages = [m.content for m in history if m.role == "system"]
    assert any("You seem stuck" in msg for msg in system_messages)

def test_agent_budget_exhaustion():
    gov = MagicMock()
    audit = MagicMock()
    llm = MagicMock()
    
    gov.request_token_grant.return_value = False
    
    agent = ManagedAgent("agent1", "comp1", "system", gov, audit, llm)
    response = agent.run("input1")
    
    assert response == "Budget exhausted"
    audit.log.assert_called_with("comp1", "agent1", "BUDGET_DENIED", {"estimated_cost": 0.002})
