import requests
import json
import time

def test_mgx_generation():
    url = "http://localhost:8000/sop/generate"
    payload = {
        "prompt": "Create a 2-step workflow for a news article: First, a researcher finds facts, then a writer drafts the article.",
        "agent_count": 2
    }
    
    print(f"🚀 Sending generation request to {url}...")
    try:
        start_time = time.time()
        response = requests.post(url, json=payload)
        duration = time.time() - start_time
        
        if response.status_code != 200:
            print(f"❌ Request failed with status {response.status_code}: {response.text}")
            return False
            
        data = response.json()
        print(f"✅ Received response in {duration:.2f}s")
        
        # Validation checks
        if "nodes" not in data or "edges" not in data:
            print("❌ Missing nodes or edges in response")
            return False
            
        print(f"Found {len(data['nodes'])} nodes and {len(data['edges'])} edges.")
        
        for node in data['nodes']:
            node_data = node.get('data', node)
            print(f"  - Node {node['id']}: {node_data.get('label')} (Role: {node_data.get('role')})")
            required = ["id", "type"]
            for field in required:
                if field not in node:
                    print(f"    ❌ Missing required field: {field}")
                    return False
            required_data = ["label", "role", "instruction"]
            for field in required_data:
                if field not in node_data:
                    print(f"    ❌ Missing required data field: {field}")
                    return False
        
        for edge in data['edges']:
            print(f"  - Edge {edge['id']}: {edge['source']} -> {edge['target']}")
            if "source" not in edge or "target" not in edge:
                print("    ❌ Malformed edge")
                return False
                
        print("\n🎉 MGX Generation Verification Successful!")
        return True
        
    except Exception as e:
        print(f"❌ Error during test: {e}")
        return False

if __name__ == "__main__":
    # Note: This requires the governance server to be running on localhost:8000
    # In a real environment, I would start the server first.
    test_mgx_generation()
