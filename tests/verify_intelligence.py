import asyncio
import json
import httpx
import websockets
import sys

async def run_e2e_test():
    company_id = "company_alpha"
    base_url = "http://127.0.0.1:8088"
    ws_url = f"ws://127.0.0.1:8088/ws/{company_id}"
    
    print(f"📡 E2E Test: Connecting to WebSocket {ws_url}...")
    
    try:
        async with websockets.connect(ws_url) as websocket:
            print("✅ WebSocket Connected!")
            
            # 1. Trigger the SOP run via POST
            print(f"🚀 E2E Test: Triggering SOP Run at {base_url}/sop/run...")
            async with httpx.AsyncClient() as client:
                payload = {
                    "sop_path": "directives/chat_proxy.yaml",
                    "input": "Hello agent, tell me a short joke about AI.",
                    "company_id": company_id
                }
                resp = await client.post(f"{base_url}/sop/run", json=payload)
                if resp.status_code != 200:
                    print(f"❌ API Error: {resp.status_code} - {resp.text}")
                    return
                run_data = resp.json()
                print(f"⚙️ SOP Started: {run_data.get('run_id')}")

            # 2. Listen for events
            print("\n--- 🧠 Agent Neural Process Feed ---")
            while True:
                try:
                    message = await asyncio.wait_for(websocket.recv(), timeout=60.0)
                    event = json.loads(message)
                    e_type = event.get("type")
                    e_data = event.get("data", {})
                    
                    if e_type == "THOUGHT":
                        print(f"  💭 [THOUGHT]: {e_data.get('thought')}")
                    elif e_type == "ACTION":
                        print(f"  🎬 [ACTION]: {e_data.get('action')} - {e_data.get('input')}")
                    elif e_type == "RESULT":
                        print(f"  ✅ [RESULT]: {e_data.get('result') or e_data.get('text')}")
                        print("\n✨ E2E Test SUCCESS: Agent responded successfully!")
                        break
                    elif e_type == "FAILURE":
                        print(f"  ❌ [FAILURE]: {e_data.get('error')}")
                        break
                    else:
                        print(f"  🔹 [EVENT {e_type}]: {json.dumps(e_data)}")
                        
                except asyncio.TimeoutError:
                    print("⌛ Timeout: No events received for 60 seconds.")
                    break
                    
    except Exception as e:
        print(f"❌ Connection Error: {e}")

if __name__ == "__main__":
    asyncio.run(run_e2e_test())
