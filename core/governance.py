"""
core/governance.py
Governance for Ensemble: budgeting, heartbeats, org charts, and FastAPI endpoints.
"""
import sqlite3
import threading
import time
import requests
import json
import os
import yaml
import uuid
import asyncio
import zlib
import base64
from typing import Dict, Any, Optional, Callable, List
from datetime import datetime
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
# ... (rest of imports)
from pydantic import BaseModel
from dotenv import load_dotenv
import shutil
from fastapi.staticfiles import StaticFiles
from fastapi import UploadFile, File

load_dotenv()

from core.ws_manager import ws_manager
from core.audit import AuditLogger
from core.skill_registry import skill_registry
from core.engine import SOPEngine
from core.ensemble_space import EnsembleSpace
from core.llm_provider import LLMProvider
from core.skill_registry import skill_registry
from core.dag_engine import DAGWorkflowEngine
# Ensure adapters are initialized
import core.adapters
from core import settings  # Import settings management module

# Load Governance Config from .env (V1 with defaults)
GOV_CONFIG = {
    "cost_threshold": float(os.getenv("APPROVAL_COST_THRESHOLD", 0.01)),
    "sensitive_tools": os.getenv("APPROVAL_TOOLS", "shell_cmd,python_interpreter,delete_file,send_email,deploy").split(","),
    "timeout": int(os.getenv("APPROVAL_TIMEOUT_SECONDS", 300)),
    "memory_turns": int(os.getenv("MEMORY_TURNS", 20))
}

app = FastAPI(title="Ensemble Platform API")

# Mount marketplace zips for local installs
os.makedirs("data/marketplace/zips", exist_ok=True)
app.mount("/static/marketplace/zips", StaticFiles(directory="data/marketplace/zips"), name="marketplace_zips")

# Add CORS Middleware to allow requests from the UI (localhost:1420)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For V1 dev, allow all. In production, restrict this.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

WORKSPACE_DIR = "data/workspace/"
os.makedirs(WORKSPACE_DIR, exist_ok=True)

# Setup backend service singletons for endpoints
audit_logger = AuditLogger()
space = EnsembleSpace()
llm = LLMProvider()

# dict to track background SOP runs: run_id -> status
sop_runs: Dict[str, Dict[str, Any]] = {}

# Initialize LLM from settings (loads provider/model from data/settings.json)
settings.initialize_llm_from_settings(llm)

# Ensure workspace directory exists for uploads
WORKSPACE_DIR = os.getenv("WORKSPACE_DIR", "data/workspace")
os.makedirs(WORKSPACE_DIR, exist_ok=True)

# Mount the workspace directory for static asset previews (images/files)
app.mount("/api/assets", StaticFiles(directory=WORKSPACE_DIR), name="workspace_assets")

# Mount workflow workspaces for HTML preview
workflow_ws_dir = os.path.join("data", "workspace")
os.makedirs(workflow_ws_dir, exist_ok=True)
app.mount("/api/workspace", StaticFiles(directory=workflow_ws_dir), name="workflow_workspace")

@app.post("/api/upload")
async def upload_file_endpoint(file: UploadFile = File(...)):
    """Ingest documents/images from UI into the agentic workspace."""
    try:
        file_id = f"{int(time.time())}_{file.filename}"
        file_path = os.path.join(WORKSPACE_DIR, file.filename)
        
        # Save file to disk
        # We use shutil for fast buffered copying to the persistent storage
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        print(f"📁 [Upload API] Saved: {file.filename} -> {file_path}")
        
        return {
            "id": file_id,
            "name": file.filename,
            "url": f"/api/assets/{file.filename}",
            "type": file.content_type,
            "path": file_path,
            "size": os.path.getsize(file_path)
        }
    except Exception as e:
        print(f"❌ [Upload API] Failure: {str(e)}", flush=True)
        raise HTTPException(status_code=500, detail=str(e))

class GenerateRequest(BaseModel):
    prompt: str

class ConfigUpdate(BaseModel):
    memory_turns: Optional[int] = None
    cost_threshold: Optional[float] = None
    timeout: Optional[int] = None

class LLMConfigUpdate(BaseModel):
    provider: str
    model: str
    base_url: Optional[str] = None

class WorkflowUpdate(BaseModel):
    id: Optional[str] = None
    name: str
    graph_json: str

def update_env_file(updates: Dict[str, str]):
    """Update or append key=value pairs in the .env file."""
    env_path = ".env"
    if not os.path.exists(env_path):
        with open(env_path, "w") as f:
            f.write("")
            
    with open(env_path, "r") as f:
        lines = f.readlines()
        
    for key, value in updates.items():
        found = False
        for i, line in enumerate(lines):
            if line.strip().startswith(f"{key}="):
                lines[i] = f"{key}={value}\n"
                found = True
                break
        if not found:
            lines.append(f"{key}={value}\n")
            
    with open(env_path, "w") as f:
        f.writelines(lines)

class Governance:
    def __init__(self, db_path: str = "data/ensemble_governance.db"):
        self.db_path = db_path
        self._init_db()
        self.mia_callback: Optional[Callable[[str], None]] = None
        self._ping_threads = {}
        self._heartbeats = {} # agent_id -> timestamp
        
        # Human approval state: approval_id -> asyncio.Event
        self.pending_approvals: Dict[str, asyncio.Event] = {}
        # Result store: approval_id -> bool (Approved/Denied)
        self.approval_results: Dict[str, bool] = {}
        self.approval_data: Dict[str, Dict] = {}
        self.is_panic = False
        
        self._load_pending_from_db()
        self.start_timeout_monitor()

    def _load_pending_from_db(self):
        """Reload any unfinished approvals from SQLite into memory on startup."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("SELECT approval_id, agent_id, action, details_json, reason, timestamp FROM pending_approvals WHERE status = 'PENDING'")
            for row in cursor.fetchall():
                app_id, agent_id, action, details_json, reason, ts = row
                self.pending_approvals[app_id] = asyncio.Event()
                self.approval_data[app_id] = {
                    "agent_id": agent_id,
                    "action": action,
                    "details": json.loads(details_json),
                    "reason": reason,
                    "timestamp": ts
                }
                print(f"⚖️ Governance: Reloaded PENDING approval {app_id} for {agent_id}")

    async def request_human_approval(self, agent_id: str, action: str, details: Dict[str, Any], reason: str) -> bool:
        """
        Pauses the agent and waits for human intervention via UI.
        Returns True if approved, False if denied/timed out.
        """
        approval_id = f"appr_{uuid.uuid4().hex[:8]}"
        event = asyncio.Event()
        
        self.pending_approvals[approval_id] = event
        details_json = json.dumps(details)
        self.approval_data[approval_id] = {
            "agent_id": agent_id,
            "action": action,
            "details": details,
            "reason": reason,
            "timestamp": time.time()
        }
        
        # Persist to DB
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT INTO pending_approvals (approval_id, agent_id, action, details_json, reason, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (approval_id, agent_id, action, details_json, reason, self.approval_data[approval_id]["timestamp"]))
        
        print(f"⚖️ Governance: Pending Approval {approval_id} for {agent_id} ({reason})")
        
        # Broadcast to UI
        await ws_manager.broadcast("company_alpha", "PENDING_APPROVAL", {
            "approval_id": approval_id,
            "agent_id": agent_id,
            "action": action,
            "details": details,
            "reason": reason,
            "timeout": GOV_CONFIG["timeout"]
        })
        
        # Wait for event with timeout
        try:
            await asyncio.wait_for(event.wait(), timeout=GOV_CONFIG["timeout"])
            result = self.approval_results.get(approval_id, False)
            print(f"⚖️ Governance: Decision received for {approval_id}: {'APPROVED' if result else 'DENIED'}")
        except asyncio.TimeoutError:
            print(f"⚖️ Governance: Approval {approval_id} TIMED OUT after {GOV_CONFIG['timeout']}s")
            result = False
            
        # Cleanup
        del self.pending_approvals[approval_id]
        if approval_id in self.approval_results:
            del self.approval_results[approval_id]
        return result

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS budgets (
                    agent_id TEXT PRIMARY KEY,
                    monthly_limit REAL,
                    spent REAL,
                    escrowed REAL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS agents (
                    agent_id TEXT PRIMARY KEY,
                    company_id TEXT,
                    role TEXT,
                    parent_id TEXT,
                    depth INTEGER,
                    status TEXT,
                    endpoint TEXT
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS pending_approvals (
                    approval_id TEXT PRIMARY KEY,
                    agent_id TEXT,
                    action TEXT,
                    details_json TEXT,
                    reason TEXT,
                    status TEXT DEFAULT 'PENDING',
                    timestamp REAL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS sop_runs (
                    run_id TEXT PRIMARY KEY,
                    sop_path TEXT,
                    current_state TEXT,
                    last_agent_id TEXT,
                    status TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS workflows (
                    id TEXT PRIMARY KEY,
                    name TEXT,
                    graph_json TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS executions (
                    run_id TEXT PRIMARY KEY,
                    workflow_id TEXT,
                    status TEXT,
                    current_node TEXT,
                    last_agent_id TEXT,
                    parent_run_id TEXT,
                    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(parent_run_id) REFERENCES executions(run_id)
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS node_executions (
                    run_id TEXT,
                    node_id TEXT,
                    status TEXT,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY(run_id, node_id)
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT,
                    node_id TEXT,
                    artifact_hash TEXT,
                    graph_state_compressed BLOB,
                    status TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(run_id) REFERENCES executions(run_id)
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS macros (
                    macro_id TEXT PRIMARY KEY,
                    name TEXT,
                    graph_json TEXT,
                    author_id TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS chat_topics (
                    id TEXT PRIMARY KEY,
                    title TEXT,
                    assistant_id TEXT DEFAULT 'default',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS chat_messages (
                    id TEXT PRIMARY KEY,
                    topic_id TEXT,
                    role TEXT,
                    content TEXT,
                    agent_id TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(topic_id) REFERENCES chat_topics(id)
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS custom_agents (
                    id TEXT PRIMARY KEY,
                    name TEXT,
                    emoji TEXT DEFAULT '🤖',
                    description TEXT,
                    instruction TEXT,
                    category TEXT DEFAULT 'General',
                    model TEXT DEFAULT 'gemini-2.5-flash',
                    temperature REAL DEFAULT 0.7,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)

    def request_token_grant(self, agent_id: str, estimated_cost: float) -> bool:
        """Check if an agent has enough budget."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("SELECT spent, escrowed, monthly_limit FROM budgets WHERE agent_id = ?", (agent_id,))
            row = cursor.fetchone()
            if row:
                spent, escrowed, limit = row
                if spent + escrowed + estimated_cost <= limit:
                    conn.execute("UPDATE budgets SET escrowed = escrowed + ? WHERE agent_id = ?", (estimated_cost, agent_id))
                    return True
        return False

    def confirm_cost(self, agent_id: str, actual_cost: float):
        """Finalize cost and release escrow."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                UPDATE budgets SET spent = spent + ?, escrowed = MAX(0, escrowed - ?) 
                WHERE agent_id = ?
            """, (actual_cost, actual_cost, agent_id))

    def get_budget_status(self, agent_id: str) -> dict:
        """Retrieve current spent and monthly_limit for an agent."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("SELECT spent, monthly_limit FROM budgets WHERE agent_id = ?", (agent_id,))
            row = cursor.fetchone()
            if row:
                return {"spent": row[0], "limit": row[1]}
        return {"spent": 0.0, "limit": 0.0}

    def get_company_budget_status(self, company_id: str) -> dict:
        """Aggregate spent and limit for the entire company."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("""
                SELECT SUM(b.spent), SUM(b.monthly_limit) 
                FROM budgets b 
                JOIN agents a ON b.agent_id = a.agent_id 
                WHERE a.company_id = ?
            """, (company_id,))
            row = cursor.fetchone()
            if row and row[0] is not None:
                return {"spent": row[0], "limit": row[1]}
        return {"spent": 0.0, "limit": 5.0} # Default limit if no agents found

    def validate_spawn(self, parent_id: str, company_id: str, depth: int) -> bool:
        """Enforce max depth and concurrency."""
        MAX_DEPTH = 3
        MAX_CONCURRENT = 10
        if depth > MAX_DEPTH:
            raise ValueError(f"Max depth {MAX_DEPTH} exceeded.")
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("SELECT COUNT(*) FROM agents WHERE company_id = ? AND status = 'ACTIVE'", (company_id,))
            count = cursor.fetchone()[0]
            if count >= MAX_CONCURRENT:
                raise ValueError(f"Max concurrent agents {MAX_CONCURRENT} reached for company.")
        return True

    def register_agent(self, agent_id: str, company_id: str, role: str, parent_id: str = None, depth: int = 0, endpoint: str = None):
        """Register an agent in the org chart."""
        self.validate_spawn(parent_id, company_id, depth)
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT OR REPLACE INTO agents (agent_id, company_id, role, parent_id, depth, status, endpoint)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (agent_id, company_id, role, parent_id, depth, "ACTIVE", endpoint))
            if endpoint:
                self._heartbeats[agent_id] = time.time()
            conn.execute("""
                INSERT OR IGNORE INTO budgets (agent_id, monthly_limit, spent, escrowed)
                VALUES (?, 5.0, 0.0, 0.0)
            """, (agent_id,))
        
    def deregister_agent(self, agent_id: str):
        """Mark an agent as INACTIVE or remove it."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("UPDATE agents SET status = 'INACTIVE' WHERE agent_id = ?", (agent_id,))
        if agent_id in self._heartbeats:
            del self._heartbeats[agent_id]

    def start_timeout_monitor(self):
        """Start a background task to auto-MIA approvals older than 24h."""
        def monitor():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(self._timeout_monitor_task())

        thread = threading.Thread(target=monitor, daemon=True)
        thread.start()

    async def _timeout_monitor_task(self):
        while True:
            await asyncio.sleep(3600) # Check every hour
            now = time.time()
            timeout_threshold = 24 * 3600 # 24 hours
            
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.execute("""
                    SELECT approval_id, agent_id FROM pending_approvals 
                    WHERE status = 'PENDING' AND (timestamp + ?) < ?
                """, (timeout_threshold, now))
                
                for app_id, agent_id in cursor.fetchall():
                    print(f"⚠️ Governance: Approval {app_id} for {agent_id} TIMED OUT after 24h.")
                    conn.execute("UPDATE pending_approvals SET status = 'TIMEOUT' WHERE approval_id = ?", (app_id,))
                    conn.execute("UPDATE agents SET status = 'MIA' WHERE agent_id = ?", (agent_id,))
                    
                    audit_logger.log("company_alpha", agent_id, "GOVERNANCE_TIMEOUT", {"approval_id": app_id, "reason": "24h manual approval timeout"})
                    
                    if app_id in self.pending_approvals:
                        self.approval_results[app_id] = False
                        self.pending_approvals[app_id].set()

    def start_heartbeat_monitor(self):
        """Start a background monitor to ping agents."""
        def monitor():
            while True:
                time.sleep(30)
                now = time.time()
                with sqlite3.connect(self.db_path) as conn:
                    cursor = conn.execute("SELECT agent_id, endpoint FROM agents WHERE endpoint IS NOT NULL")
                    for agent_id, endpoint in cursor.fetchall():
                        if now - self._heartbeats.get(agent_id, 0) > 90:
                            print(f"Agent {agent_id} is MIA.")
                            conn.execute("UPDATE agents SET status = 'MIA' WHERE agent_id = ?", (agent_id,))
                            if self.mia_callback:
                                self.mia_callback(agent_id)

        thread = threading.Thread(target=monitor, daemon=True)
        thread.start()

    def get_macro(self, macro_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a macro sub-graph from SQLite."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("SELECT graph_json FROM macros WHERE macro_id = ?", (macro_id,))
            row = cursor.fetchone()
            if row:
                return json.loads(row[0])
        return None

gov_instance = Governance()
engine = SOPEngine(space, audit_logger, llm, gov_instance)

# --- FastAPI REST Endpoints ---

@app.get("/api/models")
async def get_models():
    """List supported models for the UI registry."""
    return LLMProvider.get_supported_models()


@app.post("/api/agents")
async def create_custom_agent(req: Dict[str, Any]):
    """Persistently save a custom agent definition as a .md file."""
    name = req.get("name", "Unnamed Agent")
    category = req.get("category", "General")
    safe_name = name.lower().replace(" ", "_").replace("-", "_")
    
    # Path: data/agents/custom/{category}/{safe_name}.md
    custom_path = os.path.join("data/agents/custom", category.lower())
    os.makedirs(custom_path, exist_ok=True)
    file_path = os.path.join(custom_path, f"{safe_name}.md")
    
    yaml_header = {
        "name": name,
        "emoji": req.get("emoji", "🤖"),
        "category": category,
        "description": req.get("description", ""),
        "model": req.get("model", "gemini-2.5-flash"),
        "temperature": req.get("temperature", 0.7),
        "tools": req.get("tools", ["search_web", "read_url"])
    }
    
    content = f"---\n{yaml.dump(yaml_header)}---\n\n{req.get('instruction', '')}"
    
    with open(file_path, "w", encoding='utf-8') as f:
        f.write(content)
        
    # Re-sync registry to pick up the new file
    skill_registry.sync_all()
    
    # 🔍 Fetch the newly created skill to return full metadata to UI
    # The ID is generated by SkillRegistry during sync: custom_{relative_path}
    rel_path = os.path.relpath(file_path, skill_registry.custom_dir).replace("/", "_").replace(".md", "").replace("\\", "_")
    agent_id = f"custom_{rel_path}"
    
    new_agent = skill_registry.get_skill(agent_id)
    return {
        "status": "success",
        "agent_id": agent_id,
        "agent": new_agent,
        "path": file_path
    }

@app.post("/api/registry/import")
async def import_external_repo(data: Dict[str, str]):
    """Clones an external GitHub repo into the integrations folder."""
    repo_url = data.get("url")
    if not repo_url:
        raise HTTPException(status_code=400, detail="Missing repository URL")
    
    repo_name = repo_url.split("/")[-1].replace(".git", "")
    target_path = os.path.join("integrations", repo_name)
    
    if os.path.exists(target_path):
        raise HTTPException(status_code=400, detail="Repository already integrated")
        
    import subprocess
    try:
        subprocess.run(["git", "clone", repo_url, target_path], check=True)
        count = skill_registry.sync_all()
        return {"status": "success", "repo": repo_name, "total_agents": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Git Clone Failed: {str(e)}")

@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": time.time()}

@app.get("/skills")
async def get_available_skills():
    return skill_registry.list_skills()

@app.post("/api/panic")
async def trigger_panic():
    """Universal Abort: Snapshots state, kills sessions, and generates forensics."""
    gov_instance.is_panic = True
    
    # Forensics Report (v3 spec)
    report = f"""# Forensic Report: System Panic
## Timestamp: {time.strftime('%Y-%m-%dT%H:%M:%SZ')}
## Status: SYSTEM_HALTED

### Snapshot Details
The Ensemble governance engine has intercepted a panic signal. All active agent API sessions have been terminated.
- **Panic State**: ACTIVE
- **Reason**: Manual Override (Panic Button 2.0)
- **Active Approvals**: {len(gov_instance.pending_approvals)} cleared.

### Remediation Steps
1. Review the audit log for anomalies.
2. Manually restart the server to clear the panic flag.
3. Verify budget integrity in the Governance dashboard.
"""

@app.post("/api/chat/generate")
async def generate_chat_response_endpoint(req: Dict[str, Any]):
    """Bridge for UI chat requests to the central LLM controller."""
    messages = req.get("messages", [])
    model = req.get("model")
    provider = req.get("provider")
    agent_id = req.get("agent_id")
    assistant_id = req.get("assistant_id")  # Also check assistant_id from UI
    use_skills = req.get("use_skills", True)  # Default to True for backwards compatibility

    # Use agent_id or assistant_id (whichever is provided)
    effective_agent_id = agent_id or assistant_id

    # 🪪 Persona Resolution
    agent_name = "Ensemble AI Assistant"
    system_instruction = None

    if use_skills and effective_agent_id:
        skill = skill_registry.get_skill(effective_agent_id)
        if skill:
            agent_name = skill.get("name", "Ensemble specialist")
            system_instruction = f"Your specific mandate is: {skill.get('description', '')}."

    if system_instruction:
        if messages and messages[0].get("role") == "system":
            messages[0]["content"] = f"{system_instruction}\n\n{messages[0]['content']}"
        else:
            messages.insert(0, {"role": "system", "content": system_instruction})

    try:
        # Only pass agent_id for skill file loading if use_skills is enabled
        chat_kwargs = {
            "model": model,
            "provider": provider,
            "agent_name": agent_name,
        }
        if use_skills:
            chat_kwargs["agent_id"] = effective_agent_id  # Triggers skill file loading

        response = await llm.chat(messages, **chat_kwargs)
        return response
    except Exception as e:
        print(f"❌ [Chat API] Failure: {str(e)}", flush=True)
        raise HTTPException(status_code=500, detail=str(e))
    
@app.delete("/api/registry/agents/{agent_id}")
async def delete_agent(agent_id: str):
    """Hard delete a custom or external agent from the system."""
    try:
        success = skill_registry.delete_skill(agent_id)
        if not success:
            raise HTTPException(status_code=404, detail="Agent not found or path invalid.")
        return {"status": "deleted", "agent_id": agent_id}
    except Exception as e:
        raise HTTPException(status_code=403, detail=str(e))

@app.post("/api/registry/agents/{agent_id}/fork")
async def fork_agent_endpoint(agent_id: str):
    """Clones a native agent into the custom folder."""
    path = skill_registry.fork_skill(agent_id)
    if not path:
        raise HTTPException(status_code=404, detail="Original agent not found.")
    return {"status": "forked", "path": path}

@app.get("/api/workspace/tree")
async def get_workspace_tree():
    """Recursively list files in the workspace directory."""
    tree = []
    for root, dirs, files in os.walk(WORKSPACE_DIR):
        relative_root = os.path.relpath(root, WORKSPACE_DIR)
        if relative_root == ".":
            relative_root = ""
        
        for name in files:
            file_path = os.path.join(relative_root, name)
            tree.append({
                "name": name,
                "path": file_path,
                "type": "file",
                "size": os.path.getsize(os.path.join(root, name))
            })
    return tree

@app.get("/api/workspace/file")
async def get_workspace_file(path: str):
    """Retrieve content of a workspace file."""
    full_path = os.path.join(WORKSPACE_DIR, path)
    
    # Simple security check to stay within workspace
    if not os.path.abspath(full_path).startswith(os.path.abspath(WORKSPACE_DIR)):
        raise HTTPException(status_code=403, detail="Access denied")
        
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    try:
        with open(full_path, "r") as f:
            return {"path": path, "content": f.read()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/workspace/preview")
async def get_workspace_preview():
    """Returns the generated preview.html as a raw HTML Response for the UI iframe."""
    from fastapi.responses import HTMLResponse
    preview_path = os.path.join(WORKSPACE_DIR, "preview.html")
    if not os.path.exists(preview_path):
        return HTMLResponse(content="<div style='color:#666;text-align:center;padding:40px;font-family:sans-serif;'>No web deliverable generated for this run. Check the 'Files' tab for Word/Excel/PDF artifacts.</div>")
    
    with open(preview_path, "r") as f:
        return HTMLResponse(content=f.read())

@app.get("/api/workflows/{run_id}/artifacts")
async def get_workflow_artifacts(run_id: str):
    """List artifacts generated for a specific workflow run."""
    # Check workflow-specific workspace first
    wf_workspace = os.path.join("data", "workspace", f"workflow_{run_id}")

    tree = []
    if os.path.exists(wf_workspace):
        for root, dirs, files in os.walk(wf_workspace):
            for name in files:
                if name.startswith("."):
                    continue
                full_path = os.path.join(root, name)
                rel_path = os.path.relpath(full_path, wf_workspace)
                tree.append({
                    "name": name,
                    "path": rel_path,
                    "type": os.path.splitext(name)[1][1:] or "file",
                    "size": os.path.getsize(full_path)
                })
        return tree

    # Fallback: return empty list if no workflow-specific workspace exists
    # (files from global workspace belong to other runs)
    return []

@app.get("/api/workspace/download")
async def download_workspace_file(path: str):
    """Securely download a file from the workspace sandbox."""
    from fastapi.responses import FileResponse
    import mimetypes
    
    full_path = os.path.abspath(os.path.join(WORKSPACE_DIR, path))
    sandbox_path = os.path.abspath(WORKSPACE_DIR)
    
    # Path traversal protection
    if not full_path.startswith(sandbox_path):
        raise HTTPException(status_code=403, detail="Access denied")
        
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    mime_type, _ = mimetypes.guess_type(full_path)
    return FileResponse(full_path, media_type=mime_type or "application/octet-stream", filename=os.path.basename(full_path))

@app.get("/governance/pending")
async def get_pending_approvals():
    return [{"approval_id": k, **v} for k, v in gov_instance.approval_data.items()]

@app.post("/governance/decision/{approval_id}")
async def submit_decision(approval_id: str, request: Request):
    data = await request.json()
    approved = data.get("approved", False)
    
    if approval_id not in gov_instance.pending_approvals:
        raise HTTPException(status_code=404, detail="Approval ID not found or already processed.")
    
    gov_instance.approval_results[approval_id] = approved
    with sqlite3.connect(gov_instance.db_path) as conn:
        status = 'APPROVED' if approved else 'DENIED'
        conn.execute("UPDATE pending_approvals SET status = ? WHERE approval_id = ?", (status, approval_id))
    
    if approval_id in gov_instance.pending_approvals:
        gov_instance.pending_approvals[approval_id].set()
    
    if approval_id in gov_instance.approval_data:
        del gov_instance.approval_data[approval_id]
        
    return {"status": "success", "decision": "approved" if approved else "denied"}

@app.get("/governance/config")
async def get_gov_config():
    return GOV_CONFIG

@app.post("/governance/config")
async def update_gov_config(update: ConfigUpdate):
    if update.memory_turns is not None:
        GOV_CONFIG["memory_turns"] = update.memory_turns
    if update.cost_threshold is not None:
        GOV_CONFIG["cost_threshold"] = update.cost_threshold
    if update.timeout is not None:
        GOV_CONFIG["timeout"] = update.timeout
    return {"status": "success", "config": GOV_CONFIG}

@app.post("/governance/llm")
async def update_llm_config(update: LLMConfigUpdate):
    updates = {"LLM_PROVIDER": update.provider}
    if update.provider == "ollama":
        updates["OLLAMA_MODEL"] = update.model
        if update.base_url:
            updates["OLLAMA_BASE_URL"] = update.base_url
    else:
        updates["GEMINI_MODEL"] = update.model
        
    update_env_file(updates)
    llm.reinitialize()
    return {"status": "success", "provider": update.provider, "model": update.model}

@app.get("/api/workflows")
async def list_workflows(search: Optional[str] = None):
    with sqlite3.connect(gov_instance.db_path) as conn:
        if search:
            cursor = conn.execute("SELECT id, name, graph_json, updated_at FROM workflows WHERE name LIKE ? ORDER BY updated_at DESC", (f"%{search}%",))
        else:
            cursor = conn.execute("SELECT id, name, graph_json, updated_at FROM workflows ORDER BY updated_at DESC")
        return [
            {"id": row[0], "name": row[1], "graph_json": row[2], "updated_at": row[3]}
            for row in cursor.fetchall()
        ]

@app.post("/api/workflows")
async def save_workflow(update: WorkflowUpdate):
    workflow_id = update.id or f"wf_{uuid.uuid4().hex[:8]}"
    with sqlite3.connect(gov_instance.db_path) as conn:
        conn.execute("""
            INSERT INTO workflows (id, name, graph_json, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                graph_json = excluded.graph_json,
                updated_at = CURRENT_TIMESTAMP
        """, (workflow_id, update.name, update.graph_json))
    return {"status": "success", "id": workflow_id}

@app.post("/auth/signup")
async def signup(request: Request):
    return {"status": "success", "message": "User created successfully", "user_id": "user_dev_123"}

@app.post("/auth/login")
async def login(request: Request):
    data = await request.json()
    return {"status": "success", "token": "dev_token_ensemble_v1", "user": {"id": "user_dev_123", "email": data.get("email")}}

@app.get("/audit/events")
async def get_audit_events(company_id: str = "company_alpha", limit: int = 50, offset: int = 0):
    def delete_skill(self, agent_id: str):
        """Hard delete a custom or external agent."""
        skill = self.skills.get(agent_id)
        if not skill: return False
        
        if skill["source"] == "Native":
            raise Exception("Cannot delete Sovereign Native Core agents.")
            
        path = skill.get("filepath")
        if not path: return False
        
        import shutil
        if os.path.isdir(path):
            shutil.rmtree(path)
        else:
            os.remove(path)
            
        self.sync_all()
        return True

    def fork_skill(self, agent_id: str):
        """Clones a native agent into the custom folder for modification."""
        skill = self.skills.get(agent_id)
        if not skill: return None
        
        # Determine paths
        category = skill.get("category", "General").lower()
        name = skill.get("name", "forked_agent").lower().replace(" ", "_")
        target_path = os.path.join(self.custom_dir, category)
        os.makedirs(target_path, exist_ok=True)
        
        target_file = os.path.join(target_path, f"{name}_fork.md")
        
        # Write to disk
        import yaml
        yaml_header = {
            "name": f"{skill['name']} (Fork)",
            "emoji": skill["emoji"],
            "category": skill["category"],
            "description": skill["description"],
            "forked_from": agent_id
        }
        
        content = f"---\n{yaml.dump(yaml_header)}---\n\n{skill.get('prompt_text', '')}"
        with open(target_file, "w", encoding='utf-8') as f:
            f.write(content)
            
        self.sync_all()
        return target_file

    def get_skill(self, name: str):
        return self.skills.get(name)

    def list_skills(self):
        return [
            {
                "id": k, "name": v["name"], "description": v["description"],
                "emoji": v["emoji"], "color": v["color"], "category": v["category"],
                "source": v["source"], "enabled": v["enabled"], "is_native": v["source"] == "Native"
            }
            for k, v in self.skills.items()
        ]
    with sqlite3.connect(audit_logger.db_path) as conn:
        cursor = conn.execute("""
            SELECT id, timestamp, agent_id, action_type, details_json, cost_usd 
            FROM events WHERE company_id = ? 
            ORDER BY id DESC LIMIT ? OFFSET ?
        """, (company_id, limit, offset))
        return [
            {
                "id": r[0], "timestamp": r[1], "agent_id": r[2], 
                "action_type": r[3], "details": json.loads(r[4]), "cost_usd": r[5]
            } for r in cursor.fetchall()
        ]

@app.post("/sop/run")
async def run_sop(request: Request):
    data = await request.json()
    sop_path = data.get("sop_path")
    yaml_content = data.get("yaml")

    # Provider overrides from UI
    provider = data.get("provider")
    model = data.get("model")
    assistant_id = data.get("assistant_id")
    topic_id = data.get("topic_id")

    if yaml_content:
        try:
            with open(sop_path, "w") as f:
                f.write(yaml_content)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to write visual SOP: {e}")

    if not sop_path or not os.path.exists(sop_path):
        raise HTTPException(status_code=400, detail="Invalid SOP path.")

    run_id = f"run_{int(time.time())}"

    async def exec_sop():
        try:
            input_text = data.get("input")
            if input_text:
                audit_logger.log("company_alpha", "human_user", "USER_INPUT", {"text": input_text})
            await engine.run_workflow(sop_path, company_id="company_alpha", run_id=run_id, initial_input=input_text, assistant_id=assistant_id, topic_id=topic_id)
        except Exception as e:
            await ws_manager.broadcast("company_alpha", "FAILURE", {"run_id": run_id, "error": str(e)})

    asyncio.create_task(exec_sop())
    return {"status": "started", "run_id": run_id}

@app.get("/sop/status/{run_id}")
async def get_sop_status(run_id: str):
    run = sop_runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run ID not found")
    return run

@app.post("/sop/resume/{run_id}")
async def resume_sop(run_id: str):
    with sqlite3.connect(gov_instance.db_path) as conn:
        cursor = conn.execute("SELECT sop_path FROM sop_runs WHERE run_id = ?", (run_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Run ID not found")
        sop_path = row[0]

    async def exec_resume():
        await engine.run_workflow(sop_path, run_id=run_id)

    asyncio.create_task(exec_resume())
    return {"status": "resuming", "run_id": run_id}

@app.post("/sop/generate")
async def generate_sop(request: GenerateRequest):
    skills = skill_registry.list_skills()
    skills_text = "\n".join([f"- {s['name']}: {s['description']} (Role: {s['id']})" for s in skills])
    
    system_prompt = f"""
You are the Ensemble Architect. Your goal is to design a multi-agent workflow (SOP) based on a user's prompt.
You MUST respond with a raw JSON object only. No markdown, no triple backticks.

AVAILABLE SKILLS (Roles):
{skills_text}

JSON SCHEMA:
{{
  "nodes": [
    {{ 
      "id": "1", 
      "label": "State Name", 
      "role": "Role from skills list (e.g. pm, architect)", 
      "instruction": "Detailed task for agent",
      "x": 100, "y": 100
    }}
  ],
  "edges": [
    {{ "id": "e1-2", "source": "1", "target": "2" }}
  ]
}}

RULES:
1. Map each state to the most appropriate ROLE from the skills list.
2. If no role fits perfectly, use 'default_agent'.
3. Space out nodes logically (x, y coordinates).
4. Each node must have a clear instruction.
5. Provide a sequential flow or simple branching as requested.
"""
    
    async def try_generate(attempt=1):
        response = await llm.chat([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Generate SOP for: {request.prompt}"}
        ])
        try:
            clean_text = response["text"].strip()
            if "```json" in clean_text:
                clean_text = clean_text.split("```json")[1].split("```")[0].strip()
            elif "```" in clean_text:
                clean_text = clean_text.split("```")[1].strip()
            data = json.loads(clean_text)
            if "nodes" not in data or "edges" not in data:
                raise ValueError("Incomplete schema")
            return data
        except Exception as e:
            if attempt < 2:
                return await try_generate(attempt + 1)
            else:
                raise HTTPException(status_code=500, detail=f"Failed to generate valid SOP: {str(e)}")

    result = await try_generate()
    return result

@app.get("/governance/config")
async def get_gov_config():
    return GOV_CONFIG

@app.post("/governance/config")
async def update_gov_config(config: ConfigUpdate):
    if config.memory_turns is not None: GOV_CONFIG["memory_turns"] = config.memory_turns
    if config.cost_threshold is not None: GOV_CONFIG["cost_threshold"] = config.cost_threshold
    if config.timeout is not None: GOV_CONFIG["timeout"] = config.timeout
    return {"status": "success", "config": GOV_CONFIG}

@app.get("/governance/pending")
async def get_pending_approvals():
    return [
        {"id": k, **v} for k, v in gov_instance.approval_data.items()
        if k in gov_instance.pending_approvals
    ]

@app.post("/sop/validate")
async def validate_sop(request: Request):
    try:
        data = await request.json()
        yaml_str = data.get("yaml")
        if not yaml_str:
            return {"valid": False, "errors": ["No YAML content provided"]}
        sop = yaml.safe_load(yaml_str)
        errors = []
        if not sop.get("name"): errors.append("Missing 'name' field")
        if not sop.get("states"): errors.append("Missing 'states' block")
        if sop.get("states"):
            for state_name, state_config in sop["states"].items():
                if not state_config.get("role"):
                    errors.append(f"State '{state_name}' is missing a 'role'")
                if not state_config.get("instruction"):
                    errors.append(f"State '{state_name}' is missing an 'instruction'")
        return {"valid": len(errors) == 0, "errors": errors}
    except Exception as e:
        return {"valid": False, "errors": [f"YAML Parse Error: {str(e)}"]}

@app.websocket("/ws/{company_id}")
async def websocket_endpoint(websocket: WebSocket, company_id: str):
    await ws_manager.connect(websocket, company_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket, company_id)

# --- Chat Management Endpoints ---
@app.get("/api/chat/topics")
async def get_chat_topics():
    with sqlite3.connect(gov_instance.db_path) as conn:
        cursor = conn.execute("SELECT id, title, assistant_id, created_at, updated_at FROM chat_topics ORDER BY updated_at DESC")
        return [{"id": r[0], "title": r[1], "assistant_id": r[2], "created_at": r[3], "updated_at": r[4]} for r in cursor.fetchall()]

@app.post("/api/chat/topics")
async def create_chat_topic(req: Dict[str, Any]):
    topic_id = req.get("id") or str(uuid.uuid4())
    title = req.get("title", "New Topic")
    assistant_id = req.get("assistant_id", "default")
    with sqlite3.connect(gov_instance.db_path) as conn:
        conn.execute("INSERT INTO chat_topics (id, title, assistant_id) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, assistant_id=excluded.assistant_id, updated_at=CURRENT_TIMESTAMP", (topic_id, title, assistant_id))
    return {"status": "success", "id": topic_id}

@app.get("/api/chat/messages/{topic_id}")
async def get_chat_messages(topic_id: str):
    with sqlite3.connect(gov_instance.db_path) as conn:
        cursor = conn.execute("SELECT id, role, content, agent_id, timestamp FROM chat_messages WHERE topic_id = ? ORDER BY timestamp ASC", (topic_id,))
        return [
            {"id": r[0], "role": r[1], "content": r[2], "agent_id": r[3], "timestamp": r[4]}
            for r in cursor.fetchall()
        ]

@app.post("/api/chat/messages")
async def save_chat_message(req: Dict[str, Any]):
    msg_id = req.get("id") or str(uuid.uuid4())
    topic_id = req.get("topic_id")
    role = req.get("role")
    content = req.get("content")
    agent_id = req.get("agent_id")
    if not topic_id or not role or not content:
        raise HTTPException(status_code=400, detail="Missing required message fields")
    
    with sqlite3.connect(gov_instance.db_path) as conn:
        # Check if this is the first message in the topic
        cursor = conn.execute("SELECT COUNT(*) FROM chat_messages WHERE topic_id = ?", (topic_id,))
        message_count = cursor.fetchone()[0]
        print(f"📝 [Messages API] Saving message to topic {topic_id}: role={role}, message_count={message_count}, content_preview={content[:30]}", flush=True)
        
        # If first user message, set topic title to the message content (truncated)
        if role == "user" and message_count == 0:
            title = content[:50] + ("..." if len(content) > 50 else "")
            print(f"🏷️ [Messages API] Setting topic title to: {title}", flush=True)
            conn.execute("UPDATE chat_topics SET title = ?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (title, topic_id))
        else:
            conn.execute("UPDATE chat_topics SET updated_at=CURRENT_TIMESTAMP WHERE id=?", (topic_id,))
        
        conn.execute("INSERT INTO chat_messages (id, topic_id, role, content, agent_id) VALUES (?, ?, ?, ?, ?)", (msg_id, topic_id, role, content, agent_id))
    
    return {"status": "success", "id": msg_id}

@app.delete("/api/chat/topics/{topic_id}")
async def delete_chat_topic(topic_id: str):
    with sqlite3.connect(gov_instance.db_path) as conn:
        conn.execute("DELETE FROM chat_messages WHERE topic_id = ?", (topic_id,))
        conn.execute("DELETE FROM chat_topics WHERE id = ?", (topic_id,))
    return {"status": "success", "id": topic_id}

# --- Dashboard Stats API Endpoints ---

@app.get("/api/dashboard/stats")
async def get_dashboard_stats():
    """Get real-time dashboard statistics."""
    audit_db_path = "data/ensemble_audit.db"
    
    with sqlite3.connect(gov_instance.db_path) as conn:
        # Count active workflows (workflows with recent executions)
        cursor = conn.execute("""
            SELECT COUNT(DISTINCT w.id) FROM workflows w
            INNER JOIN executions e ON w.id = e.workflow_id
            WHERE e.status IN ('running', 'queued', 'completed')
        """)
        active_workflows = cursor.fetchone()[0] or 0

        # Count running agents
        cursor = conn.execute("""
            SELECT COUNT(DISTINCT last_agent_id) FROM executions
            WHERE status = 'running' AND last_agent_id IS NOT NULL
        """)
        agents_running = cursor.fetchone()[0] or 0

        # Workflow stats
        cursor = conn.execute("SELECT COUNT(*) FROM workflows")
        total_workflows = cursor.fetchone()[0] or 0

        cursor = conn.execute("""
            SELECT status, COUNT(*) FROM executions GROUP BY status
        """)
        execution_stats = {}
        for row in cursor.fetchall():
            execution_stats[row[0]] = row[1]

        # Monthly cost (from budgets)
        cursor = conn.execute("SELECT COALESCE(SUM(spent), 0) FROM budgets")
        monthly_cost = cursor.fetchone()[0] or 0.0

    # Token usage today (from audit events)
    try:
        with sqlite3.connect(audit_db_path) as audit_conn:
            cursor = audit_conn.execute("""
                SELECT COUNT(*) FROM events
                WHERE timestamp >= date('now', 'start of day')
            """)
            events_today = cursor.fetchone()[0] or 0
    except:
        events_today = 0
    tokens_today = events_today * 1000  # Estimate ~1000 tokens per event

    # Agent stats from registry
    skills = skill_registry.list_skills()
    total_agents = len(skills)

    return {
        "active_workflows": active_workflows,
        "agents_running": agents_running,
        "tokens_today": tokens_today,
        "monthly_cost": monthly_cost,
        "total_workflows": total_workflows,
        "total_agents": total_agents,
        "execution_stats": execution_stats
    }

@app.get("/api/dashboard/workflows")
async def get_dashboard_workflows():
    """Get workflow summary for dashboard."""
    with sqlite3.connect(gov_instance.db_path) as conn:
        cursor = conn.execute("""
            SELECT w.id, w.name, w.graph_json, w.updated_at,
                   (SELECT COUNT(*) FROM executions e WHERE e.workflow_id = w.id AND e.status = 'running') as running_count,
                   (SELECT COUNT(*) FROM executions e WHERE e.workflow_id = w.id) as total_runs
            FROM workflows w ORDER BY w.updated_at DESC LIMIT 10
        """)
        workflows = []
        for row in cursor.fetchall():
            wf_id, name, graph_json, updated_at, running_count, total_runs = row
            try:
                graph = json.loads(graph_json) if graph_json else {}
                agent_count = len(graph.get("nodes", [])) if isinstance(graph, dict) else 2
            except:
                agent_count = 2

            status = "active" if running_count > 0 else "idle"
            workflows.append({
                "id": wf_id,
                "name": name,
                "agents": agent_count,
                "runs": total_runs,
                "status": status,
                "lastRun": _format_relative_time(updated_at) if updated_at else "unknown"
            })
        return workflows

@app.get("/api/dashboard/activity")
async def get_dashboard_activity(limit: int = Query(default=20)):
    """Get recent activity feed."""
    audit_db_path = "data/ensemble_audit.db"
    try:
        with sqlite3.connect(audit_db_path) as audit_conn:
            cursor = audit_conn.execute("""
                SELECT agent_id, action_type, details_json, timestamp
                FROM events ORDER BY id DESC LIMIT ?
            """, (limit,))
            activity = []
            for row in cursor.fetchall():
                agent_id, action_type, details_json, timestamp = row
                try:
                    details = json.loads(details_json) if details_json else {}
                except:
                    details = {}
                activity.append({
                    "agent_id": agent_id,
                    "action_type": action_type,
                    "details": details,
                    "timestamp": timestamp,
                    "message": _format_activity_message(action_type, details, agent_id)
                })
            return activity
    except:
        return []

@app.get("/api/dashboard/token-usage")
async def get_token_usage(days: int = Query(default=7)):
    """Get token usage over the last N days."""
    from datetime import datetime, timedelta
    audit_db_path = "data/ensemble_audit.db"
    try:
        with sqlite3.connect(audit_db_path) as audit_conn:
            cursor = audit_conn.execute("""
                SELECT date(timestamp) as day, COUNT(*) as event_count
                FROM events
                WHERE timestamp >= date('now', '-{} days')
                GROUP BY day ORDER BY day ASC
            """.format(days))
            
            usage_data = {}
            for row in cursor.fetchall():
                usage_data[row[0]] = row[1] * 1000
    except:
        usage_data = {}

    result = []
    day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    for i in range(days):
        target_date = datetime.now() - timedelta(days=days-1-i)
        target_str = target_date.strftime('%Y-%m-%d')
        tokens = usage_data.get(target_str, 0)
        result.append({
            "day": day_names[target_date.weekday()],
            "date": target_str,
            "tokens": round(tokens / 1000, 1)
        })
    
    return result

@app.get("/api/dashboard/agent-stats")
async def get_dashboard_agent_stats():
    """Get agent performance stats for leaderboard."""
    audit_db_path = "data/ensemble_audit.db"
    try:
        with sqlite3.connect(audit_db_path) as audit_conn:
            cursor = audit_conn.execute("""
                SELECT agent_id, COUNT(*) as run_count, COALESCE(SUM(cost_usd), 0) as total_cost
                FROM events WHERE agent_id IS NOT NULL AND agent_id != 'human_user'
                GROUP BY agent_id ORDER BY run_count DESC LIMIT 10
            """)
            
            rows_data = cursor.fetchall()
    except:
        rows_data = []
    
    skills = skill_registry.list_skills()
    skill_map = {s["id"]: s for s in skills}
    
    agent_stats = []
    rank = 1
    for row in rows_data:
        agent_id, run_count, total_cost = row
        skill = skill_map.get(agent_id, {})
        agent_stats.append({
            "rank": rank,
            "agent_id": agent_id,
            "name": skill.get("name", agent_id),
            "emoji": skill.get("emoji", "🤖"),
            "category": skill.get("category", "General"),
            "runs": run_count,
            "cost": total_cost
        })
        rank += 1
    
    return agent_stats

@app.get("/api/dashboard/pipeline-status")
async def get_pipeline_status():
    """Get current pipeline/workflow execution status."""
    with sqlite3.connect(gov_instance.db_path) as conn:
        cursor = conn.execute("""
            SELECT e.run_id, e.workflow_id, e.status, e.current_node, e.started_at, w.name
            FROM executions e
            LEFT JOIN workflows w ON e.workflow_id = w.id
            ORDER BY e.started_at DESC LIMIT 10
        """)
        
        pipelines = []
        for row in cursor.fetchall():
            run_id, wf_id, status, current_node, started_at, name = row
            try:
                graph = json.loads(wf_id) if wf_id else {}
            except:
                graph = {}
            
            pipelines.append({
                "id": run_id,
                "workflow_id": wf_id,
                "name": name or f"Workflow {wf_id[:8]}",
                "status": status,
                "current_step": current_node or "1",
                "total_steps": "3",
                "started_at": started_at,
                "time": _format_relative_time(started_at) if started_at else "unknown"
            })
        
        return pipelines

def _format_relative_time(timestamp):
    """Format a timestamp as relative time (e.g. '2m ago')."""
    if not timestamp:
        return "unknown"
    try:
        if isinstance(timestamp, str):
            timestamp = timestamp.replace("T", " ").replace("Z", "")
            dt = datetime.strptime(timestamp[:19], "%Y-%m-%d %H:%M:%S")
        else:
            dt = datetime.fromtimestamp(timestamp)
        
        diff = (datetime.now() - dt).total_seconds()
        if diff < 60:
            return f"{int(diff)}s ago"
        elif diff < 3600:
            return f"{int(diff // 60)}m ago"
        elif diff < 86400:
            return f"{int(diff // 3600)}h ago"
        else:
            return f"{int(diff // 86400)}d ago"
    except:
        return "unknown"

def _format_activity_message(action_type, details, agent_id):
    """Format an activity message for display."""
    messages = {
        "SOP_START": "SOP execution started",
        "SOP_COMPLETE": "SOP execution completed",
        "SOP_ERROR": f"SOP execution error: {details.get('error', 'unknown')}",
        "APPROVAL_REQUEST": f"Approval requested: {details.get('reason', 'action')}",
        "APPROVAL_DECISION": f"Approval {'approved' if details.get('approved') else 'denied'}",
        "COST_CHECK": f"Cost check: ${details.get('cost', 0):.4f}",
        "USER_INPUT": "User input received",
        "TASK_START": f"Task started: {details.get('task', 'unknown')}",
        "TASK_COMPLETE": f"Task completed: {details.get('task', 'unknown')}",
        "WORKFLOW_START": "Workflow execution started",
        "WORKFLOW_COMPLETE": "Workflow execution completed",
    }
    return messages.get(action_type, f"{action_type} by {agent_id or 'system'}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8088)

@app.get("/api/runs/{run_id}/timeline")
async def get_run_timeline(run_id: str):
    """Retrieve all execution snapshots for the scrub bar."""
    with sqlite3.connect(gov_instance.db_path) as conn:
        cursor = conn.execute("""
            SELECT id, node_id, artifact_hash, graph_state_compressed, status, created_at 
            FROM snapshots WHERE run_id = ? ORDER BY created_at ASC
        """, (run_id,))
        
        timeline = []
        for row in cursor.fetchall():
            # Decompress graph state if exists
            graph_state = None
            if row[3]:
                try:
                    graph_state = json.loads(zlib.decompress(row[3]).decode())
                except:
                    graph_state = {}

            timeline.append({
                "id": row[0],
                "node_id": row[1],
                "artifact_hash": row[2],
                "graph_state": graph_state,
                "status": row[4],
                "timestamp": row[5]
            })
        return timeline

@app.post("/api/runs/{run_id}/fork")
async def fork_run(run_id: str, snapshot_id: int):
    """Create a lineage-linked fork from a specific snapshot point."""
    new_run_id = f"fork_{uuid.uuid4().hex[:8]}"
    
    with sqlite3.connect(gov_instance.db_path) as conn:
        # Verify if run_id exists
        cursor = conn.execute("SELECT workflow_id FROM executions WHERE run_id = ?", (run_id,))
        orig = cursor.fetchone()
        if not orig:
            raise HTTPException(status_code=404, detail="Original run not found")
        
        workflow_id = orig[0]
        
        # Insert new run with lineage
        conn.execute("""
            INSERT INTO executions (run_id, workflow_id, status, parent_run_id)
            VALUES (?, ?, ?, ?)
        """, (new_run_id, workflow_id, "idle", run_id))
        
        # Clone graph state from snapshot to the new run's starting point
        cursor = conn.execute("SELECT graph_state_compressed FROM snapshots WHERE id = ?", (snapshot_id,))
        snap = cursor.fetchone()
        if snap and snap[0]:
            conn.execute("""
                INSERT INTO snapshots (run_id, node_id, graph_state_compressed, status)
                VALUES (?, ?, ?, ?)
            """, (new_run_id, "__fork_root__", snap[0], "root"))
            
    return {"status": "forked", "new_run_id": new_run_id, "parent_run_id": run_id}
@app.get("/api/workflows")
async def list_workflows():
    """List all saved visual workflows."""
    with sqlite3.connect(gov_instance.db_path) as conn:
        cursor = conn.execute("SELECT id, name, updated_at FROM workflows ORDER BY updated_at DESC")
        return [{"id": row[0], "name": row[1], "updated_at": row[2]} for row in cursor.fetchall()]

@app.get("/api/workflows/{wf_id}")
async def get_workflow(wf_id: str):
    """Fetch a specific workflow graph."""
    with sqlite3.connect(gov_instance.db_path) as conn:
        cursor = conn.execute("SELECT id, name, graph_json FROM workflows WHERE id = ?", (wf_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Workflow not found")
        return {"id": row[0], "name": row[1], "graph": json.loads(row[2])}

@app.post("/api/workflows")
async def save_workflow(wf: WorkflowUpdate):
    """Save or update a visual workflow."""
    wf_id = wf.id or f"wf_{uuid.uuid4().hex[:8]}"
    with sqlite3.connect(gov_instance.db_path) as conn:
        conn.execute("""
            INSERT INTO workflows (id, name, graph_json, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                graph_json = excluded.graph_json,
                updated_at = CURRENT_TIMESTAMP
        """, (wf_id, wf.name, wf.graph_json))
    return {"status": "saved", "id": wf_id}

@app.delete("/api/workflows/{wf_id}")
async def delete_workflow(wf_id: str):
    """Remove a workflow from the system."""
    with sqlite3.connect(gov_instance.db_path) as conn:
        conn.execute("DELETE FROM workflows WHERE id = ?", (wf_id,))
    return {"status": "deleted"}
@app.get("/api/macros")
async def list_macros():
    """List all community-created Macros."""
    with sqlite3.connect(gov_instance.db_path) as conn:
        cursor = conn.execute("SELECT macro_id, name, author_id, created_at FROM macros")
        return [{"id": row[0], "name": row[1], "author": row[2], "created_at": row[3]} for row in cursor.fetchall()]

@app.post("/api/macros")
async def create_macro(macro: Dict[str, Any]):
    """Register a new Macro sub-graph."""
    macro_id = macro.get("id") or f"macro_{uuid.uuid4().hex[:8]}"
    with sqlite3.connect(gov_instance.db_path) as conn:
        conn.execute("""
            INSERT INTO macros (macro_id, name, graph_json, author_id, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(macro_id) DO UPDATE SET
                name = excluded.name,
                graph_json = excluded.graph_json,
                author_id = excluded.author_id
        """, (macro_id, macro["name"], json.dumps(macro["graph_json"]), macro.get("author", "anonymous"), time.strftime("%Y-%m-%dT%H:%M:%SZ")))
    return {"status": "registered", "macro_id": macro_id}

@app.get("/api/macros/{macro_id}")
async def get_macro_endpoint(macro_id: str):
    """Fetch a specific Macro for previewing."""
    macro = gov_instance.get_macro(macro_id)
    if not macro:
        raise HTTPException(status_code=404, detail="Macro not found")
    return macro

@app.get("/api/governance/policy")
async def get_security_policy():
    """Retrieve the current zero-trust security policy."""
    from core.security_policy import PERMISSIONS_FILE
    if os.path.exists(PERMISSIONS_FILE):
        with open(PERMISSIONS_FILE, "r") as f:
            return json.load(f)
    return {"agents": {}, "dry_run": False}

@app.post("/api/governance/policy")
async def update_security_policy(policy: Dict[str, Any]):
    """Update the global security policy (Agent permissions, Egress, Dry-run)."""
    from core.security_policy import PERMISSIONS_FILE
    os.makedirs(os.path.dirname(PERMISSIONS_FILE), exist_ok=True)
    with open(PERMISSIONS_FILE, "w") as f:
        json.dump(policy, f, indent=2)
    return {"status": "success"}

# --- Workflow Execution Registry ---

@app.post("/api/workflows/run")
async def run_workflow(request: Request):
    """
    Executes a multi-agent DAG workflow from the canvas.
    Bridges the ReactFlow graph to the Ensemble DAG Engine.
    """
    try:
        data = await request.json()
        workflow_id = data.get("id") or str(uuid.uuid4())
        nodes = data.get("nodes", [])
        edges = data.get("edges", [])
        initial_input = data.get("initialInput", "")

        if not nodes:
            raise HTTPException(status_code=400, detail="Workflow canvas is empty")

        print(f"🚀 [Workflow Execution] Starting run {workflow_id} with {len(nodes)} agents...", flush=True)

        # Initialize and Run the DAG Engine with global singletons
        engine = DAGWorkflowEngine(
            space=space,
            audit=audit_logger,
            llm=llm,
            gov=gov_instance
        )
        
        # Structure the graph data for the engine
        graph_json = {"nodes": nodes, "edges": edges}
        
        # Execute the workflow
        result = await engine.execute_workflow(
            workflow_id=workflow_id,
            graph_json=graph_json,
            initial_input=initial_input,
            company_id="ensemble_prod"
        )

        if result.get("status") == "failed":
            raise Exception(f"Workflow failed at node: {result.get('failed_node')}")

        run_id = result.get("run_id")

        # Structure the results for the frontend step tracker
        with sqlite3.connect(gov_instance.db_path) as conn:
            cursor = conn.execute("SELECT node_id, status FROM node_executions WHERE run_id = ?", (run_id,))
            steps_meta = {row[0]: row[1] for row in cursor.fetchall()}

        final_steps = []
        all_files = []
        for node in nodes:
            node_id = node["id"]
            agent_name = node.get("data", {}).get("label", "Agent")
            
            # Fetch output from CAS
            output = "Execution complete."
            artifact_name = f"{node_id}_output"
            if space.exists(artifact_name):
                output = space.read(artifact_name).decode("utf-8", errors="ignore")

            # Check for extracted code blocks
            node_files = []
            for fname in ['index.html', 'style.css', 'script.js', 'main.py', 'data.json', 'config.xml', 'schema.sql', 'run.sh']:
                artifact_key = f"{node_id}_{fname}"
                if space.exists(artifact_key):
                    node_files.append({
                        "path": f"{agent_name.split()[-1]}/{fname}",  # e.g., "Development/index.html"
                        "name": fname,
                        "node_id": node_id,
                        "language": fname.split('.')[-1]
                    })
            
            if node_files:
                all_files.extend(node_files)

            final_steps.append({
                "id": node_id,
                "agent_name": agent_name,
                "status": steps_meta.get(node_id, "completed"),
                "output": output,
                "duration": 2,
                "files": node_files  # Include per-node files
            })

        return {
            "status": "success",
            "workflowId": workflow_id,
            "run_id": run_id,
            "steps": final_steps,
            "completedAt": datetime.now().isoformat()
        }
    except Exception as e:
        print(f"❌ [Workflow Execution] ERROR: {str(e)}", flush=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/workflows/generate")
async def generate_workflow_api(request: Request):
    """
    AI-driven workflow generation from natural language prompt.
    Uses the Architect agent to design the multi-agent graph.
    """
    try:
        data = await request.json()
        prompt = data.get("prompt", "")
        if not prompt:
            raise HTTPException(status_code=400, detail="No prompt provided")

        print(f"🪄 [Workflow Generation] Designing DAG for: {prompt[:50]}...", flush=True)
        
        # Get available skills to help the architect select agents
        all_skills = skill_registry.list_skills()
        skills_context = "\n".join([f"- {s['id']}: {s['description']}" for s in all_skills])

        system_prompt = f"""
You are the Ensemble Workflow Architect. Convert the user's requirement into a professional multi-agent DAG.

AVAILABLE AGENTS:
{skills_context}

OUTPUT RULES:
- Return ONLY strict JSON. No markdown fences.
- Create 3-5 nodes representing a logical automated mission.
- 'data.role' MUST match an Agent ID from the list above.
- 'data.model' should be 'gemini-2.5-flash'.
- Position nodes logically in a pipeline (node 1 at x:100, y:100, node 2 at x:400, y:100 etc).

JSON SCHEMA:
{{
  "name": "Mission Title",
  "nodes": [
    {{ 
      "id": "step1", 
      "type": "agentNode", 
      "position": {{ "x": 100, "y": 100 }},
      "data": {{ 
        "label": "Step Name", 
        "role": "pm", 
        "instruction": "Agent Mission",
        "model": "gemini-2.5-flash",
        "temperature": 0.7
      }} 
    }}
  ],
  "edges": [
    {{ "id": "e1-2", "source": "step1", "target": "step2", "animated": true }}
  ]
}}
"""
        response = await llm.chat([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ])

        # Extract and parse JSON
        clean_text = response["text"].strip()
        if "```json" in clean_text:
            clean_text = clean_text.split("```json")[1].split("```")[0].strip()
        elif "```" in clean_text:
            clean_text = clean_text.split("```")[1].split("```")[0].strip()
        
        return json.loads(clean_text)
    except Exception as e:
        print(f"❌ [Workflow Generation] ERROR: {str(e)}", flush=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/workflows/{workflow_id}/artifacts")
async def get_workflow_artifacts_api(workflow_id: str):
    """
    Returns files generated by a specific workflow run.
    Only scans the workflow's dedicated workspace subdirectory.
    """
    artifacts = []
    
    # Only check the workflow-specific workspace
    workflow_ws_dir = os.path.join("data", "workspace", f"workflow_{workflow_id}")
    if not os.path.exists(workflow_ws_dir):
        return []
    
    code_extensions = {'.html', '.css', '.js', '.ts', '.jsx', '.tsx', '.py', '.json', '.xml', '.md', '.sql', '.sh', '.yaml', '.yml'}
    
    for node_dir in os.listdir(workflow_ws_dir):
        node_path = os.path.join(workflow_ws_dir, node_dir)
        if not os.path.isdir(node_path):
            continue
        for f in os.listdir(node_path):
            ext = os.path.splitext(f)[1].lower()
            if ext in code_extensions:
                full_path = os.path.join(node_path, f)
                artifacts.append({
                    "id": f"{node_dir}/{f}",
                    "name": f,
                    "path": f"{node_dir}/{f}",
                    "type": ext.lstrip('.'),
                    "node": node_dir,
                    "size": os.path.getsize(full_path),
                    "created_at": datetime.fromtimestamp(os.path.getmtime(full_path)).isoformat()
                })
    
    return sorted(artifacts, key=lambda x: x["created_at"], reverse=True)


@app.get("/api/workflows/{workflow_id}/preview")
async def get_workflow_preview(workflow_id: str):
    """
    Serves the index.html or preview.html from the workflow's workspace for preview.
    Returns the actual HTML content so the frontend can render it in an iframe via srcdoc.
    """
    workflow_ws_dir = os.path.join("data", "workspace", f"workflow_{workflow_id}")

    # First check workflow-specific directory
    if os.path.exists(workflow_ws_dir):
        # Find the first index.html in any node subdirectory
        for node_dir in os.listdir(workflow_ws_dir):
            node_path = os.path.join(workflow_ws_dir, node_dir)
            if os.path.isdir(node_path):
                index_path = os.path.join(node_path, "index.html")
                if os.path.exists(index_path):
                    with open(index_path, "r", encoding="utf-8") as f:
                        html_content = f.read()
                    return {
                        "html": html_content,
                        "node": node_dir,
                        "path": f"workflow_{workflow_id}/{node_dir}/index.html"
                    }

        # Check for preview.html in workflow workspace as fallback
        preview_path = os.path.join(workflow_ws_dir, "preview.html")
        if os.path.exists(preview_path):
            with open(preview_path, "r", encoding="utf-8") as f:
                html_content = f.read()
            return {"html": html_content, "node": "legacy", "path": "preview.html"}

    # Fallback: look for HTML files in the global workspace that may have been generated
    # during this run (sorted by most recent first, but only if modified within 10 min)
    global_ws = os.path.join("data", "workspace")
    if os.path.exists(global_ws):
        import time
        now = time.time()
        html_files = []
        for f in os.listdir(global_ws):
            if f.lower().endswith(('.html', '.htm')):
                full_path = os.path.join(global_ws, f)
                mtime = os.path.getmtime(full_path)
                if now - mtime < 600:  # Only files modified within last 10 minutes
                    html_files.append((full_path, mtime, f))
        html_files.sort(key=lambda x: x[1], reverse=True)
        if html_files:
            latest_path, _, latest_name = html_files[0]
            with open(latest_path, "r", encoding="utf-8") as f:
                html_content = f.read()
            return {"html": html_content, "node": "global", "path": latest_name}

    raise HTTPException(status_code=404, detail="No HTML preview found for this workflow")

def get_all_agents_logic():
    """Shared logic to aggregate file-based and DB-based agents."""
    # 1. Get discovery agents from folders
    discovery = skill_registry.list_skills()
    
    # 2. Get custom agents from database
    custom = []
    try:
        with sqlite3.connect(gov_instance.db_path) as conn:
            cursor = conn.execute("SELECT id, name, emoji, description, instruction, category, model, temperature FROM custom_agents")
            for r in cursor.fetchall():
                custom.append({
                    "id": r[0],
                    "name": r[1],
                    "emoji": r[2],
                    "description": r[3],
                    "instruction": r[4],
                    "category": r[5],
                    "model": r[6],
                    "temperature": r[7],
                    "source": "custom"
                })
    except Exception as e:
        print(f"⚠️ [Governance] Failed to read custom agents from DB: {e}")
    
    return discovery + custom

@app.get("/api/skills")
async def get_skills():
    """List all agents (File-based + DB-persisted)."""
    return get_all_agents_logic()

@app.get("/api/registry/sync")
async def sync_registry_api():
    """Manually trigger a scan of all agent sources and return UNIFIED list."""
    count = skill_registry.sync_all()
    all_agents = get_all_agents_logic()
    return {"status": "success", "total": count, "agents": all_agents}

@app.patch("/api/registry/agents/{agent_id}/status")
async def toggle_agent_status(agent_id: str, data: Dict[str, bool]):
    """Enable or disable a specific agent in the manifest."""
    enabled = data.get("enabled", True)
    skill_registry.save_status(agent_id, enabled)
    skill_registry.sync_all()
    return {"status": "success", "agent_id": agent_id, "enabled": enabled}

# --- 🛒 Marketplace Endpoints (Phase 1) ---

MARKETPLACE_MANIFEST = "data/marketplace/packs.json"

@app.get("/api/marketplace/packs")
async def list_marketplace_packs():
    """Fetch the curated list of marketplace packs."""
    if not os.path.exists(MARKETPLACE_MANIFEST):
        # Fallback empty for now
        return {"packs": []}
    
    with open(MARKETPLACE_MANIFEST, "r") as f:
        data = json.load(f)
    return data

@app.post("/api/marketplace/install")
async def install_pack(req: Dict[str, str]):
    """Download and extract an agent pack to data/agents/custom/."""
    pack_id = req.get("pack_id")
    download_url = req.get("download_url")
    
    if not pack_id or not download_url:
        raise HTTPException(status_code=400, detail="Missing pack_id or download_url")

    pack_dir = os.path.join("data/agents/custom", pack_id)
    os.makedirs(pack_dir, exist_ok=True)
    
    # 1. Get ZIP content (Handle local loopback or real URL)
    try:
        import zipfile
        import io
        import requests
        
        print(f"📦 [Marketplace] Installing {pack_id} from {download_url}...")
        
        content = None
        # DEADLOCK PROTECTION: If it's a local static URL, read from disk directly
        if "127.0.0.1:8089/static/marketplace/zips/" in download_url:
            zip_name = download_url.split("/")[-1]
            local_path = os.path.join("data/marketplace/zips", zip_name)
            if os.path.exists(local_path):
                print(f"🔗 [Marketplace] Local source detected. Reading from disk: {local_path}")
                with open(local_path, "rb") as f:
                    content = f.read()
            else:
                raise FileNotFoundError(f"Local pack ZIP missing at {local_path}")
        
        if content is None:
            # Fallback to real HTTP request for external URLs
            # Using timeout to avoid hanging the app
            response = requests.get(download_url, timeout=10)
            response.raise_for_status()
            content = response.content
        
        # 2. Extract
        with zipfile.ZipFile(io.BytesIO(content)) as z:
            z.extractall(pack_dir)
            
        # 3. Store Pack Metadata
        meta = {
            "pack_id": pack_id,
            "installed_at": str(datetime.now()),
            "version": req.get("version", "1.0.0"),
            "url": download_url
        }
        with open(os.path.join(pack_dir, ".pack_meta.json"), "w") as f:
            json.dump(meta, f, indent=2)
            
        # 4. Sync Registry
        skill_registry.sync_all()
        
        return {"status": "success", "pack_id": pack_id, "message": f"Pack '{pack_id}' installed successfully."}
        
    except Exception as e:
        # Cleanup on failure
        if os.path.exists(pack_dir):
            shutil.rmtree(pack_dir)
        raise HTTPException(status_code=500, detail=f"Installation failed: {str(e)}")

@app.post("/api/marketplace/uninstall")
async def uninstall_pack(req: Dict[str, str]):
    """Remove a pack and sync registry."""
    pack_id = req.get("pack_id")
    if not pack_id:
        raise HTTPException(status_code=400, detail="Missing pack_id")
    
    pack_dir = os.path.join("data/agents/custom", pack_id)
    if os.path.exists(pack_dir):
        shutil.rmtree(pack_dir)
        skill_registry.sync_all()
        return {"status": "success", "message": f"Pack '{pack_id}' removed."}
    else:
        raise HTTPException(status_code=404, detail="Pack not found localy.")

@app.delete("/api/registry/agents/{agent_id}")
async def delete_agent(agent_id: str):
    """Expose delete_skill to remove custom/external agents."""
    try:
        success = skill_registry.delete_skill(agent_id)
        if success:
            return {"status": "success", "message": f"Agent {agent_id} deleted."}
        else:
            raise HTTPException(status_code=404, detail="Agent not found or not deletable.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/marketplace/update/{pack_id}")
async def update_pack(pack_id: str):
    """Check remote for new version, archive old, and install new."""
    # 1. Fetch remote manifest
    if not os.path.exists(MARKETPLACE_MANIFEST):
        raise HTTPException(status_code=404, detail="Marketplace manifest not found.")
    
    with open(MARKETPLACE_MANIFEST, "r") as f:
        manifest = json.load(f)
    
    remote_pack = next((p for p in manifest["packs"] if p["id"] == pack_id), None)
    if not remote_pack:
        raise HTTPException(status_code=404, detail="Pack not found in marketplace.")
    
    # 2. Check local version
    pack_dir = os.path.join("data/agents/custom", pack_id)
    meta_path = os.path.join(pack_dir, ".pack_meta.json")
    if not os.path.exists(meta_path):
        raise HTTPException(status_code=404, detail="Installed pack metadata not found.")
        
    with open(meta_path, "r") as f:
        local_meta = json.load(f)
    
    if local_meta["version"] == remote_pack["version"]:
        return {"status": "up-to-date", "version": local_meta["version"]}
    
    # 3. Archive old version
    archive_dir = os.path.join("data/agents/archive", pack_id, f"v{local_meta['version']}")
    os.makedirs(archive_dir, exist_ok=True)
    
    print(f"📦 [Marketplace] Archiving v{local_meta['version']} to {archive_dir}...")
    # Safe move: Copy all except the archive folder itself
    for item in os.listdir(pack_dir):
        if item == ".pack_meta.json": continue
        shutil.move(os.path.join(pack_dir, item), os.path.join(archive_dir, item))
        
    # 4. Install New Version
    # Resuse install logic (Simplified for this atomic op)
    await install_pack({"pack_id": pack_id, "download_url": remote_pack["download_url"], "version": remote_pack["version"]})
    
    return {"status": "success", "old_version": local_meta["version"], "new_version": remote_pack["version"]}

@app.post("/api/marketplace/rollback/{pack_id}")
async def rollback_pack(pack_id: str, data: Dict[str, str]):
    """Restore an archived version for a pack."""
    version = data.get("version")
    if not version:
        raise HTTPException(status_code=400, detail="Missing version to rollback to.")
        
    archive_dir = os.path.join("data/agents/archive", pack_id, f"v{version}")
    pack_dir = os.path.join("data/agents/custom", pack_id)
    
    if not os.path.exists(archive_dir):
        raise HTTPException(status_code=404, detail=f"Archive for version {version} not found.")
        
    # 1. Clear current pack files
    for item in os.listdir(pack_dir):
        if item == ".pack_meta.json": continue
        path = os.path.join(pack_dir, item)
        if os.path.isdir(path): shutil.rmtree(path)
        else: os.remove(path)
        
    # 2. Restore from archive
    for item in os.listdir(archive_dir):
        shutil.copy(os.path.join(archive_dir, item), os.path.join(pack_dir, item))
        
    # 3. Update Meta
    with open(os.path.join(pack_dir, ".pack_meta.json"), "r") as f:
        meta = json.load(f)
    meta["version"] = version
    meta["restored_at"] = str(datetime.now())
    with open(os.path.join(pack_dir, ".pack_meta.json"), "w") as f:
        json.dump(meta, f, indent=2)
        
    skill_registry.sync_all()
    return {"status": "success", "restored_version": version}

@app.post("/api/marketplace/export")
async def export_to_zip(req: Dict[str, Any]):
    """Export a single agent or an entire pack as a downloadable ZIP."""
    agent_id = req.get("agent_id")
    pack_id = req.get("pack_id")
    
    if not agent_id and not pack_id:
        raise HTTPException(status_code=400, detail="Missing agent_id or pack_id")

    import zipfile
    import io
    
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as z:
        if agent_id:
            # 1. Single Agent Export
            skill = skill_registry.get_skill(agent_id)
            if not skill:
                raise HTTPException(status_code=404, detail="Agent not found.")
            
            filepath = skill["filepath"]
            filename = os.path.basename(filepath)
            
            # Create manifest for single agent
            manifest = {
                "id": agent_id.replace("custom_", "").replace("native_", "exported_"),
                "name": skill["name"],
                "version": "1.0.0",
                "author": "Ensemble User",
                "description": skill["description"],
                "agent_files": [filename]
            }
            z.writestr("pack.json", json.dumps(manifest, indent=2))
            with open(filepath, "rb") as f:
                z.writestr(filename, f.read())
            
            download_name = f"{manifest['id']}.zip"
            
        elif pack_id:
            # 2. Entire Pack Export
            pack_dir = os.path.join("data/agents/custom", pack_id)
            if not os.path.exists(pack_dir):
                raise HTTPException(status_code=404, detail="Pack folder not found locally.")
            
            # Read existing meta or build one
            meta_path = os.path.join(pack_dir, ".pack_meta.json")
            if os.path.exists(meta_path):
                with open(meta_path, "r") as f:
                    local_meta = json.load(f)
            else:
                local_meta = {"pack_id": pack_id, "version": "1.0.0", "name": pack_id}
            
            # Build final manifest
            manifest = {
                "id": pack_id,
                "name": local_meta.get("name", pack_id),
                "version": local_meta.get("version", "1.0.0"),
                "author": local_meta.get("author", "Ensemble User"),
                "description": local_meta.get("description", ""),
                "agent_files": []
            }
            
            for item in os.listdir(pack_dir):
                if item.endswith(".md"):
                    manifest["agent_files"].append(item)
                    with open(os.path.join(pack_dir, item), "rb") as f:
                        z.writestr(item, f.read())
                elif item == "pack.json": # Already has one
                     with open(os.path.join(pack_dir, item), "rb") as f:
                        z.writestr(item, f.read())
                        continue
            
            if "pack.json" not in z.namelist():
                z.writestr("pack.json", json.dumps(manifest, indent=2))
            
            download_name = f"{pack_id}.zip"

    # Save to a temp file or workspace for returning FileResponse
    export_path = os.path.join(WORKSPACE_DIR, download_name)
    with open(export_path, "wb") as f:
        f.write(zip_buffer.getvalue())
        
    return FileResponse(
        path=export_path,
        filename=download_name,
        media_type='application/zip'
    )

@app.get("/api/agents/stats")
async def get_agent_stats():
    """Query audit database for usage statistics."""
    try:
        with sqlite3.connect(audit_logger.db_path) as conn:
            # Frequency count per agent
            cursor = conn.execute("""
                SELECT agent_id, COUNT(*) as usage_count, SUM(cost_usd) as total_cost, MAX(timestamp) as last_used 
                FROM events 
                WHERE action_type = 'RESULT' 
                GROUP BY agent_id 
                ORDER BY usage_count DESC
            """)
            stats = [
                {
                    "agent_id": r[0],
                    "usage_count": r[1],
                    "total_cost": r[2],
                    "last_used": r[3]
                } for r in cursor.fetchall()
            ]
            return {"stats": stats}
    except Exception as e:
        return {"stats": [], "error": str(e)}


# ============================================================
# LLM Provider Settings Endpoints
# ============================================================

@app.get("/api/settings/provider")
async def get_provider_settings():
    """
    Get the current LLM provider configuration.
    NOTE: API keys are NEVER returned - they stay in .env only.
    """
    try:
        provider_config = settings.get_active_provider()
        return provider_config
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read settings: {str(e)}")


@app.post("/api/settings/provider")
async def set_provider_settings(req: Dict[str, Any]):
    """
    Switch the active LLM provider.
    
    Body: { "provider": "gemini"|"ollama"|"openai", "model": "...", "base_url": "..." }
    
    The backend reinitializes the LLM client immediately. API keys remain in .env.
    """
    try:
        provider = req.get("provider")
        model = req.get("model")
        base_url = req.get("base_url")
        
        if not provider or not model:
            raise HTTPException(
                status_code=400,
                detail="provider and model are required"
            )
        
        result = settings.switch_provider(
            provider=provider,
            model=model,
            base_url=base_url,
            llm_instance=llm
        )
        
        return {
            "success": True,
            "config": result
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to switch provider: {str(e)}")


@app.post("/api/settings/test")
async def test_llm_connection_endpoint():
    """
    Test the currently configured LLM connection.
    Sends a simple message and measures response time.
    Does NOT expose API keys or internals.
    """
    try:
        result = await settings.test_llm_connection(llm)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Test failed: {str(e)}")


# ============================================================
# Organization Management Endpoints
# ============================================================

# In-memory org store (will be replaced with DB in production)
_org_store: Dict[str, Dict[str, Any]] = {}

@app.get("/api/orgs")
async def list_orgs():
    """List all organizations."""
    return list(_org_store.values())

@app.post("/api/orgs")
async def create_org(request: Request):
    """Create a new organization with auto-provisioning."""
    try:
        data = await request.json()
        org_id = data.get("id") or data.get("name", "org").lower().replace(" ", "-") + "-" + str(uuid.uuid4())[:8]
        
        org = {
            "id": org_id,
            "name": data.get("name", "New Organization"),
            "description": data.get("description", ""),
            "tier": data.get("tier", "Starter"),
            "status": "Setup",
            "industry": data.get("industry", ""),
            "website": data.get("website", ""),
            "contact_email": data.get("contact_email", ""),
            "location": data.get("location", ""),
            "memberCount": 1,
            "agentCount": 0,
            "departmentCount": 0,
            "created_at": datetime.now().isoformat()
        }
        
        _org_store[org_id] = org
        return {"success": True, "id": org_id, **org}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create org: {str(e)}")

@app.get("/api/orgs/{org_id}")
async def get_org(org_id: str):
    """Get a specific organization."""
    org = _org_store.get(org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org

@app.delete("/api/orgs/{org_id}")
async def delete_org(org_id: str):
    """Delete an organization."""
    if org_id not in _org_store:
        raise HTTPException(status_code=404, detail="Organization not found")
    del _org_store[org_id]
    return {"success": True, "message": f"Organization {org_id} deleted"}

@app.post("/api/orgs/{org_id}/tasks/{task_id}/run")
async def run_org_task(org_id: str, task_id: str, request: Request):
    """
    Execute a task via LLM.
    The task is sent to the chat API with the agent's role as context.
    """
    try:
        data = await request.json()
        task_title = data.get("title", "Task")
        task_desc = data.get("description", "")
        agent_id = data.get("agent_id", "")
        
        # Call the LLM with the task
        response = await llm.chat(
            messages=[{"role": "user", "content": f"{task_title}\n\n{task_desc}\n\nPlease complete this task."}],
            model=data.get("model", "gemini-2.5-flash"),
            provider=data.get("provider", "gemini"),
            agent_name=agent_id or "Ensemble specialist"
        )
        
        return {
            "success": True,
            "task_id": task_id,
            "output": response.get("text", ""),
            "usage": response.get("usage", {})
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Task execution failed: {str(e)}")
