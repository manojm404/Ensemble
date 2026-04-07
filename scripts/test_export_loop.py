import os
import sys
import asyncio
import json
import shutil
from unittest.mock import patch, MagicMock

# Add project root to path
sys.path.append(os.getcwd())

from core.governance import export_to_zip, install_pack
from core.skill_registry import skill_registry

async def test_export_import_loop():
    print("--- 🏁 PHASE 1: EXPORT ---")
    
    # 1. Export a CUSTOM agent (.md)
    # Based on our previous test, this should exist
    agent_id = "custom_game-dev-pack_unity-architect"
    export_req = {"agent_id": agent_id}
    response = await export_to_zip(export_req)
    
    zip_path = response.path
    print(f"✅ Exported to: {zip_path}")
    
    print("\n--- 🏁 PHASE 2: IMPORT (Loopback) ---")
    
    with open(zip_path, "rb") as f:
        zip_content = f.read()
    
    mock_response = MagicMock()
    mock_response.content = zip_content
    mock_response.status_code = 200
    mock_response.raise_for_status = MagicMock()
    
    with patch("requests.get", return_value=mock_response):
        install_req = {
            "pack_id": "loopback-unity-pack",
            "download_url": "http://mock-loopback/unity.zip",
            "version": "1.0.0"
        }
        install_result = await install_pack(install_req)
        print(f"Install Result: {install_result}")
        
    # 3. Verify in Registry
    # Re-sync ensures the new file is detected
    skill_registry.sync_all()
    skills = skill_registry.list_skills()
    new_agent = next((s for s in skills if "loopback-unity-pack" in s["id"]), None)
    
    if new_agent:
        print(f"✅ Successfully re-imported: {new_agent['name']} ({new_agent['id']})")
    else:
        print("❌ Re-import failed.")

if __name__ == "__main__":
    asyncio.run(test_export_import_loop())
