import os
import pytest
import shutil
from backend.ensemble.storage.ensemble_space import EnsembleSpace

def test_space_cas_write_read():
    base_dir = "/tmp/test_space/"
    if os.path.exists(base_dir):
        shutil.rmtree(base_dir)
        
    space = EnsembleSpace(base_dir)
    content = b"test artifact content"
    symbolic_name = "test.txt"
    
    # Write
    content_hash = space.write(content, symbolic_name, state_name="state1", company_id="comp1")
    assert content_hash is not None
    assert space.exists(symbolic_name)
    
    # Read
    read_content = space.read(symbolic_name)
    assert read_content == content
    
    # List
    artifacts = space.list_artifacts(state_name="state1")
    assert symbolic_name in artifacts
    
    if os.path.exists(base_dir):
        shutil.rmtree(base_dir)
