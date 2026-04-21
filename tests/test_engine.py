import os
import shutil
import yaml
import pytest
from unittest.mock import MagicMock
from core.engine import SOPEngine

@pytest.mark.asyncio
async def test_engine_workflow_execution():
    space = MagicMock()
    audit = MagicMock()
    llm = MagicMock()
    
    # Mock LLM generation
    llm.generate.return_value = ("Generated output.", 10, 0.001)
    
    # Mock Space read/write
    space.read.return_value = None
    space.exists.return_value = True # Forces transition to next state
    
    gov = MagicMock()
    gov.db_path = ":memory:" # Use in-memory for tests
    engine = SOPEngine(space, audit, llm, gov)
    
    # Create temporary SOP file
    sop_data = {
        "workflow": {
            "initial_state": "Start",
            "states": {
                "Start": {
                    "role": "pm",
                    "instruction": "Initial step",
                    "output_artifacts": [{"name": "art1"}],
                    "transitions": [{"if_exists": "art1", "next_state": "End"}]
                },
                "End": {"type": "end"}
            }
        }
    }
    sop_path = "/tmp/test_sop.yaml"
    with open(sop_path, "w") as f:
        yaml.dump(sop_data, f)
    
    await engine.run_workflow(sop_path)
    
    # Verify transitions happen correctly
    assert space.write.called
    assert audit.log.called

    if os.path.exists(sop_path):
        os.remove(sop_path)
