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
from typing import Dict, Any, Optional, Callable
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

from core.ws_manager import ws_manager
from core.audit import AuditLogger
from core.engine import SOPEngine
from core.ensemble_space import EnsembleSpace
from core.llm_provider import LLMProvider
from core.skill_registry import skill_registry

# Load Governance Config from .env (V1 with defaults)
GOV_CONFIG = {
    "cost_threshold": float(os.getenv("APPROVAL_COST_THRESHOLD", 0.01)),
    "sensitive_tools": os.getenv("APPROVAL_TOOLS", "shell_cmd,python_interpreter,delete_file,send_email,deploy").split(","),
    "timeout": int(os.getenv("APPROVAL_TIMEOUT_SECONDS", 300)),
    "memory_turns": int(os.getenv("MEMORY_TURNS", 20))
}

app = FastAPI(title="Ensemble Platform API")

# Add CORS Middleware to allow requests from the UI (localhost:1420)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For V1 dev, allow all. In production, restrict this.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Setup backend service singletons for endpoints
audit_logger = AuditLogger()
space = EnsembleSpace()
llm = LLMProvider()

# dict to track background SOP runs: run_id -> status
sop_runs: Dict[str, Dict[str, Any]] = {}

# Global LLM instance for generation (Premium Model)
llm = LLMProvider(provider="gemini", model="gemini-2.5-flash")

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

gov_instance = Governance()
engine = SOPEngine(space, audit_logger, llm, gov_instance)

# --- FastAPI REST Endpoints ---

@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": time.time()}

@app.get("/skills")
async def get_available_skills():
    return skill_registry.list_skills()

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8088)
