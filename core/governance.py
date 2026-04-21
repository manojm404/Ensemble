"""
core/governance.py
Governance for Ensemble: budgeting, heartbeats, org charts, and FastAPI endpoints.
"""
import base64
import json
import os
import shutil
import sqlite3
import threading
import time
import uuid
import zlib
import asyncio
from datetime import datetime
from typing import Dict, Any, Optional, Callable, List

import requests
import yaml
from dotenv import load_dotenv
from fastapi import (
    FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect, Query,
    UploadFile, File, Depends
)
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

load_dotenv()

from core.ws_manager import ws_manager
from core.audit import AuditLogger
from core.skill_registry import skill_registry
from core.engine import SOPEngine
from core.ensemble_space import EnsembleSpace
from core.llm_provider import LLMProvider
from core.dag_engine import DAGWorkflowEngine
import core.adapters
from core import settings
from core.scheduler import init_scheduler

# Phase 1: Supabase Integration
from core.supabase_client import supabase, supabase_admin, verify_connection
from core.auth import get_current_user, require_auth, is_public_path, PUBLIC_PATHS
from core.auth_routes import router as auth_router, health_router
from core.models.user import UserCreate, UserLogin, ProfileUpdate
from core.models.api import HealthResponse

# Universal importer and pack builder
from core.universal_importer import universal_importer
from core.pack_builder import pack_builder

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

# CORS Middleware - configurable origins
# Default includes common local dev origins. Set CORS_ORIGINS env var for production.
cors_origins_env = os.getenv("CORS_ORIGINS", "").strip()
if cors_origins_env:
    cors_origins = [o.strip() for o in cors_origins_env.split(",") if o.strip()]
else:
    cors_origins = [
        "http://localhost:5173",
        "http://localhost:8080",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8080",
        "tauri://localhost",
        "https://tauri.localhost",
    ]

# CORS Middleware - Permissive for V1 Release
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Phase 1: JWT Authentication Middleware
@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    # Allow CORS preflight requests to bypass everything
    if request.method == "OPTIONS":
        return await call_next(request)

    if is_public_path(request.url.path):
        return await call_next(request)

    # Dev mode bypass: check if Supabase is configured and auth enforcement is enabled
    import os
    supabase_url = os.environ.get("SUPABASE_URL", "").strip()
    enforce_auth = os.environ.get("ENFORCE_AUTH", "true").lower() in ("true", "1", "yes")

    if enforce_auth and (not supabase_url or supabase_url == ""):
        # Supabase not configured — bypass auth for local development
        request.state.user = {
            "id": "dev_user",
            "email": "dev@localhost",
            "full_name": "Local Developer",
            "tier": "free",
        }
        return await call_next(request)

    if not enforce_auth:
        # Explicitly disabled — bypass auth
        request.state.user = {
            "id": "dev_user",
            "email": "dev@localhost",
            "full_name": "Local Developer",
            "tier": "free",
        }
        return await call_next(request)

    authorization = request.headers.get("Authorization", "")
    if not authorization:
        return JSONResponse(
            status_code=401,
            content={"status": "error", "error": "unauthorized", "message": "Authentication required. Include 'Authorization: Bearer <token>' in your request."},
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        from core.auth import extract_bearer_token, verify_token_with_supabase
        token = extract_bearer_token(authorization)
        if not token:
            return JSONResponse(
                status_code=401,
                content={"status": "error", "error": "invalid_token", "message": "Invalid Authorization header format. Use 'Bearer <token>'."},
                headers={"WWW-Authenticate": "Bearer"},
            )

        user_data = await verify_token_with_supabase(token)

        # Fetch user profile for tier info
        try:
            profile_result = supabase_admin.client.table("profiles").select("*").eq("id", user_data["id"]).execute()
            profile = profile_result.data[0] if profile_result.data else {}
        except Exception:
            profile = {}

        request.state.user = {
            "id": user_data["id"],
            "email": user_data.get("email", ""),
            "full_name": profile.get("full_name"),
            "tier": profile.get("tier", "free"),
        }
    except HTTPException as e:
        return JSONResponse(
            status_code=e.status_code,
            content={"status": "error", "error": "unauthorized", "message": e.detail},
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        return JSONResponse(
            status_code=401,
            content={"status": "error", "error": "unauthorized", "message": f"Authentication failed: {str(e)}"},
            headers={"WWW-Authenticate": "Bearer"},
        )

    return await call_next(request)


# Phase 7: Security Headers Middleware
@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    """Add security headers to all responses."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    # Only add CSP for non-API responses (APIs return JSON, not HTML)
    if not request.url.path.startswith("/api/"):
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
    return response


# Phase 1/7: Rate Limiting (enabled by default for security)
rate_limit_enabled = os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "true"
rate_limit_per_minute = int(os.getenv("RATE_LIMIT_PER_MINUTE", "100"))

limiter = Limiter(key_func=get_remote_address, default_limits=[f"{rate_limit_per_minute}/minute"])
app.state.limiter = limiter

# Setup backend service singletons for global access
audit_logger = AuditLogger()
space = EnsembleSpace()
llm = LLMProvider()
dag_engine = DAGWorkflowEngine(
    space=space,
    audit=audit_logger,
    llm=llm,
    gov=None # Will be set via gov_instance
)
scheduler = None # Global singleton placeholder
gov_instance = None # Placeholder for circular ref if needed

@app.on_event("startup")
async def startup_event():
    """Server initialization."""
    # Initialize and Start the Sovereign Scheduler background task
    global scheduler
    try:
        from core.scheduler import init_scheduler
        scheduler = init_scheduler(audit_logger, dag_engine)
        await scheduler.start()
        print("🕒 [Ensemble] Sovereign Scheduler active")
    except Exception as e:
        print(f"⚠️ [Ensemble] Failed to start scheduler: {e}")

@app.on_event("shutdown")
async def shutdown_event():
    """Server cleanup."""
    # Stop the Sovereign Scheduler
    if scheduler:
        await scheduler.stop()
        print("👋 [Ensemble] Scheduler stopped")

    @app.exception_handler(RateLimitExceeded)
    async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
        return JSONResponse(
            status_code=429,
            content={"status": "error", "error": "rate_limited", "message": "Too many requests. Please slow down and try again in a moment."},
        )

# Ensure CORS headers on ALL responses (FastAPI exceptions don't always get CORS headers)
@app.middleware("http")
async def ensure_cors_headers(request: Request, call_next):
    response = await call_next(request)
    origin = request.headers.get("origin", "")
    if origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Methods"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "*"
        response.headers["Access-Control-Allow-Credentials"] = "true"
    else:
        response.headers["Access-Control-Allow-Origin"] = "*"
    return response

# Background SOP run tracking
sop_runs: Dict[str, Dict[str, Any]] = {}

# Initialize LLM from settings
settings.initialize_llm_from_settings(llm)

# Workspace directory and static mounts
WORKSPACE_DIR = os.getenv("WORKSPACE_DIR", "data/workspace")
os.makedirs(WORKSPACE_DIR, exist_ok=True)
app.mount("/api/assets", StaticFiles(directory=WORKSPACE_DIR), name="workspace_assets")
app.mount("/api/workspace", StaticFiles(directory=WORKSPACE_DIR), name="workflow_workspace")

# ============================================================
# Phase 1: Register Auth Routes & Health Check
# ============================================================
# These replace the stub /auth/* endpoints and add /health
app.include_router(auth_router)
app.include_router(health_router)
# ============================================================

# --- Core Logic Functions ---

def get_all_agents_logic():
    """Aggregate file-based and DB-persisted agents."""
    discovery = skill_registry.list_skills()
    custom = []
    try:
        if gov_instance:
            with sqlite3.connect(gov_instance.db_path) as conn:
                cursor = conn.execute("SELECT id, name, emoji, description, instruction, category, model, temperature FROM custom_agents")
                for r in cursor.fetchall():
                    custom.append({
                        "id": r[0], "name": r[1], "emoji": r[2], "description": r[3],
                        "instruction": r[4], "category": r[5], "model": r[6],
                        "temperature": r[7], "source": "custom"
                    })
    except Exception as e:
        print(f"⚠️ [Governance] Failed to read custom agents: {e}")
    return discovery + custom

# --- API Endpoints ---

@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": time.time()}

@app.get("/api/skills")
async def get_skills():
    return get_all_agents_logic()

@app.get("/api/registry/sync")
async def sync_registry_api():
    count = skill_registry.sync_all()
    return {"status": "success", "total": count, "agents": get_all_agents_logic()}

@app.post("/api/upload")
async def upload_file_endpoint(file: UploadFile = File(...)):
    """Ingest documents/images from UI into the agentic workspace."""
    try:
        file_id = f"{int(time.time())}_{file.filename}"
        file_path = os.path.join(WORKSPACE_DIR, file.filename)

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

# Phase 3: Set engine user_id from request context at runtime (per-request)
# This is done in the SOP execution endpoints below

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
    """
    Deprecated endpoint. Redirects to Universal Importer.
    """
    repo_url = data.get("url")
    if not repo_url:
        raise HTTPException(status_code=400, detail="Missing repository URL")
    
    try:
        job = universal_importer.start_job(repo_url)
        return {"status": "success", "message": "Import started via Universal Importer", "job_id": job.job_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")
# --- UNIVERSAL AGENT IMPORTER ENDPOINTS ---

class ImportRepoRequest(BaseModel):
    url: str

@app.post("/api/marketplace/import-repo")
async def import_repo_endpoint(req: ImportRepoRequest):
    """Start a background job to import and analyze a GitHub repository."""
    try:
        job = universal_importer.start_job(req.url)
        return {"status": "started", "job_id": job.job_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")

@app.get("/api/marketplace/import-status/{job_id}")
async def get_import_status(job_id: str):
    """Check the status of a background import job."""
    status = universal_importer.check_status(job_id)
    if not status:
        raise HTTPException(status_code=404, detail="Import job not found")
    return status

@app.get("/api/marketplace/import-result/{job_id}")
async def get_import_result(job_id: str):
    """Get the result of a completed import job."""
    result = universal_importer.get_result(job_id)
    if not result:
        raise HTTPException(status_code=404, detail="Import result not found or job still running")
    return result

@app.post("/api/marketplace/import-install/{pack_id}")
async def install_imported_pack(pack_id: str, job_id: str = Query(...)):
    """Install a pack generated from an import job by extracting it to agents/custom/."""
    try:
        import zipfile

        # Find the ZIP file for this pack
        zip_path = os.path.join("data/marketplace/zips", f"{pack_id}.zip")
        print(f"📦 [Install] Looking for ZIP at: {zip_path}", flush=True)
        
        if not os.path.exists(zip_path):
            # List available ZIPs for debugging
            zips_dir = os.path.join("data/marketplace/zips")
            available_zips = []
            if os.path.exists(zips_dir):
                available_zips = [f for f in os.listdir(zips_dir) if f.endswith('.zip')]
            print(f"❌ [Install] ZIP not found: {pack_id}.zip. Available ZIPs: {available_zips}", flush=True)
            raise HTTPException(status_code=404, detail=f"Pack ZIP not found: {pack_id}. Available: {', '.join(available_zips)}")

        # Extract to agents/custom/{pack_id}/
        install_dir = os.path.join("data/agents/custom", pack_id)
        os.makedirs(install_dir, exist_ok=True)

        extracted_count = 0
        with zipfile.ZipFile(zip_path, 'r') as zf:
            # Extract all files from the ZIP
            for member in zf.namelist():
                # Skip directories
                if member.endswith('/'):
                    continue
                # Skip non-agent files (we only want .md, .py, .yaml, .json, .txt files)
                if not any(member.endswith(ext) for ext in ['.md', '.py', '.yaml', '.json', '.txt']):
                    continue
                # Extract to install dir, preserving subdirectory structure
                target_path = os.path.join(install_dir, member)
                os.makedirs(os.path.dirname(target_path), exist_ok=True)
                with zf.open(member) as src, open(target_path, 'wb') as dst:
                    dst.write(src.read())
                extracted_count += 1

        print(f"✅ [Install] Extracted {extracted_count} files to {install_dir}", flush=True)

        # Create pack metadata
        md_files = [f for f in os.listdir(install_dir) if f.endswith(".md")]
        meta = {
            "pack_id": pack_id,
            "installed_at": str(datetime.now()),
            "version": "1.0.0",
            "source": "universal_importer",
            "job_id": job_id,
            "agent_count": len(md_files)
        }
        with open(os.path.join(install_dir, ".pack_meta.json"), "w") as f:
            json.dump(meta, f, indent=2)

        # Sync registry to pick up new agents
        count = skill_registry.sync_all()
        print(f"🔄 [Install] Registry synced. Total agents: {count}", flush=True)

        return {"status": "success", "message": f"Pack {pack_id} installed", "total_agents": count, "extracted_files": extracted_count}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"❌ [Install] Installation failed: {str(e)}\n{traceback.format_exc()}", flush=True)
        raise HTTPException(status_code=500, detail=f"Installation failed: {str(e)}")

@app.get("/api/marketplace/import-formats")
async def get_supported_formats():
    """List all supported agent formats for the Universal Importer."""
    return {
        "formats": [
            {"id": "markdown", "name": "Markdown + Frontmatter", "description": "Native Ensemble format"},
            {"id": "python", "name": "Python Classes", "description": "MetaGPT/CrewAI roles"},
            {"id": "yaml", "name": "YAML Configs", "description": "LangChain/AutoGen configurations"},
            {"id": "json", "name": "JSON Manifests", "description": "SuperAGI/OpenAI manifests"},
            {"id": "text", "name": "Plain Text", "description": "Simple prompt files"}
        ]
    }

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

    # Support simpler format: {message: str, system_prompt: str} from company issue pages
    simple_message = req.get("message")
    system_prompt = req.get("system_prompt")
    if simple_message and not messages:
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": simple_message})

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

# ============================================================
# Phase 1: Old stub /auth endpoints REMOVED
# Auth is now handled by core/auth_routes.py (registered above)
# ============================================================

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
    # Phase 7: Free tier SOP run limit enforcement
    user_id = _get_user_id_from_request(request)
    if user_id:
        from core.supabase_client import supabase_admin
        # Check monthly SOP run limit for free tier
        profile_result = supabase_admin.query("profiles", "select", columns="tier,sop_run_count", eq="id", eq_value=user_id)
        if profile_result.data and profile_result.data[0].get("tier") == "free":
            # Check monthly run count from daily_token_usage
            usage_result = supabase_admin.query(
                "daily_token_usage", "select",
                columns="sop_runs",
                eq="user_id", eq_value=user_id,
            )
            total_runs = sum(r.get("sop_runs", 0) for r in (usage_result.data or []))
            if total_runs >= 100:
                raise HTTPException(
                    status_code=429,
                    detail="Free tier limit exceeded: 100 SOP runs per month. Upgrade to Pro for unlimited runs.",
                )

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
    """
    WebSocket endpoint with JWT authentication.

    Connect with: ws://host/ws/{company_id}?token=YOUR_JWT_TOKEN
    The token is validated against Supabase Auth.
    """
    from core.auth import verify_token_with_supabase
    from fastapi import status as ws_status

    # Extract token from query params
    token = websocket.query_params.get("token", "")
    if not token:
        await websocket.close(code=ws_status.WS_1008_POLICY_VIOLATION, reason="Missing token. Connect with: ws://host/ws/{company_id}?token=JWT_TOKEN")
        return

    # Validate JWT
    try:
        user_data = await verify_token_with_supabase(token)
        user = {
            "id": user_data["id"],
            "email": user_data.get("email", ""),
            "tier": "free",  # Default, will be overridden if profile exists
        }

        # Fetch user's tier from profile
        try:
            from core.supabase_client import supabase_admin
            profile_result = supabase_admin.client.table("profiles").select("tier").eq("id", user_data["id"]).execute()
            if profile_result.data:
                user["tier"] = profile_result.data[0].get("tier", "free")
        except Exception:
            pass

        await websocket.accept()
        await ws_manager.connect(websocket, user)
        logger.info("🔌 [WS] User %s connected to company %s", user["id"][:8], company_id)
    except HTTPException:
        await websocket.close(code=ws_status.WS_1008_POLICY_VIOLATION, reason="Invalid or expired token")
        return
    except Exception as e:
        logger.warning("⚠️ [WS] Connection failed: %s", e)
        await websocket.close(code=ws_status.WS_1011_INTERNAL_ERROR, reason="Authentication failed")
        return

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket, user.get("id"))
    except Exception as e:
        logger.warning("⚠️ [WS] Connection error: %s", e)
        await ws_manager.disconnect(websocket, user.get("id"))


@app.get("/api/ws/stats")
async def get_ws_stats():
    """Get WebSocket connection statistics."""
    return ws_manager.get_stats()


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
        
        # Clean name logic
        clean_name = skill.get("name")
        if not clean_name:
            parts = agent_id.split('_')
            name_parts = [p for p in parts if not p.isdigit()]
            clean_name = " ".join(name_parts).title() if name_parts else agent_id
            
        agent_stats.append({
            "rank": rank,
            "agent_id": agent_id,
            "name": clean_name,
            "emoji": skill.get("emoji", "🤖"),
            "category": skill.get("category", "General"),
            "runs": run_count,
            "cost": float(total_cost)
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

# --- Notification API Endpoints ---

@app.get("/api/notifications", dependencies=[Depends(require_auth)])
async def get_notifications(request: Request, limit: int = Query(default=50)):
    """Fetch real notifications for the authenticated user/company."""
    user = request.state.user
    company_id = request.query_params.get("company_id")
    
    # Use the audit_logger to fetch from DB
    notifications = audit_logger.get_notifications(
        user_id=user["id"],
        company_id=company_id,
        limit=limit
    )
    
    # Format for the UI
    formatted = []
    for n in notifications:
        # notification model logic
        formatted.append({
            "id": str(n["id"]),
            "from": n["from_name"],
            "fromAvatar": n["from_avatar"],
            "title": n["title"],
            "preview": n["preview"],
            "content": n["content"],
            "time": _format_relative_time(n["timestamp"]),
            "unread": bool(n["is_unread"]),
            "starred": bool(n["is_starred"]),
            "category": n["category"]
        })
    return formatted

@app.post("/api/notifications/{notification_id}/read", dependencies=[Depends(require_auth)])
async def mark_notification_read(notification_id: int):
    """Mark a specific notification as viewed."""
    audit_logger.mark_notification_read(notification_id)
    return {"status": "success"}

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

        # Debug: Log each node's role and instruction
        for n in nodes:
            nd = n.get("data", {})
            print(f"  📦 Node: {nd.get('label', 'Unknown')}, role={nd.get('role', 'N/A')}, is_custom={nd.get('is_custom', False)}, instruction_len={len(nd.get('instruction', ''))}", flush=True)

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
        
        # Group agents by category for a more compact and organized context
        categories = {}
        for s in all_skills:
            cat = s.get('category', 'General')
            if cat not in categories:
                categories[cat] = []
            categories[cat].append(f"{s['id']} ({s['name']})")
        
        skills_context = ""
        for cat, agents in sorted(categories.items()):
            skills_context += f"### {cat}\n" + ", ".join(agents) + "\n\n"

        system_prompt = f"""
You are the Ensemble Workflow Architect. Convert the user's requirement into a professional multi-agent DAG.

AVAILABLE AGENTS (grouped by category):
{skills_context}

OUTPUT RULES:
- Return ONLY strict JSON. No markdown fences.
- Create 1-5 nodes representing a logical automated mission. Be minimalistic — do NOT add agents that don't add value.
- CRITICAL: Use a logical pipeline order: RESEARCH -> DRAFTING -> EDITING/REVIEW. Never put a researcher at the end of a chain.
- 'data.role' should be a matching Agent ID from the list above.
- If the user's prompt defines specific roles NOT in the list, create custom nodes with 'data.is_custom': true and 'data.instruction' describing their specialized role.
- 'data.model' should be 'gemini-2.5-flash'.
- Position nodes logically in a pipeline (node 1 at x:100, y:100, node 2 at x:400, y:100 etc).
- CRITICAL: The graph MUST be a Directed Acyclic Graph (DAG). There can be NO CYCLES or loops.
- Avoid redundant agents. If one agent can do the task perfectly, use ONLY that agent.

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
        "role": "native_ceo",
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

EXAMPLE - Custom Agents from User Prompt:
If user defines "Research Agent: search web for data", create:
{{
  "id": "step1",
  "type": "agentNode",
  "position": {{ "x": 100, "y": 100 }},
  "data": {{
    "label": "Research Agent",
    "role": "research_agent",
    "is_custom": true,
    "instruction": "Search web for data on the assigned topic. Gather statistics, expert opinions, case studies, and recent developments. Output a structured research brief with verified findings and source URLs.",
    "model": "gemini-2.5-flash",
    "temperature": 0.7
  }}
}}
"""
        response = await llm.chat([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ], temperature=0.1)  # Lower temperature for more stable JSON

        # Extract and parse JSON
        text = response["text"].strip()
        
        # Robust JSON extraction
        json_str = text
        if "```" in text:
            # Try to find JSON block
            import re
            match = re.search(r'```(?:json)?\s*(\{[\s\S]*?\})\s*```', text)
            if match:
                json_str = match.group(1)
            else:
                # Fallback to simple split
                try:
                    json_str = text.split("```")[-2].strip()
                    if json_str.startswith("json"):
                        json_str = json_str[4:].strip()
                except:
                    pass
        
        # Final cleanup: ensure it starts with { and ends with }
        start_idx = json_str.find('{')
        end_idx = json_str.rfind('}')
        if start_idx != -1 and end_idx != -1:
            json_str = json_str[start_idx:end_idx+1]

        try:
            return json.loads(json_str)
        except json.JSONDecodeError as e:
            print(f"❌ [Workflow Generation] JSON Parse Error: {e}\nRaw Text: {text[:500]}...", flush=True)
            raise Exception(f"AI returned invalid workflow JSON: {str(e)}")

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
    Automatically inlines style.css and script.js into the HTML so they work in srcdoc.
    """
    workflow_ws_dir = os.path.join("data", "workspace", f"workflow_{workflow_id}")

    def _inline_assets(html_content: str, base_dir: str) -> str:
        """Inline style.css and script.js into the HTML so srcdoc works."""
        # Inline CSS: replace <link rel="stylesheet" href="style.css"> with <style>...</style>
        css_path = os.path.join(base_dir, "style.css")
        if os.path.exists(css_path):
            with open(css_path, "r", encoding="utf-8") as f:
                css_content = f.read()
            # Replace the link tag
            import re
            html_content = re.sub(
                r'<link[^>]*href=["\']style\.css["\'][^>]*/?>',
                f'<style>{css_content}</style>',
                html_content,
                flags=re.IGNORECASE
            )

        # Inline JS: replace <script src="script.js"></script> with <script>...</script>
        js_path = os.path.join(base_dir, "script.js")
        if os.path.exists(js_path):
            with open(js_path, "r", encoding="utf-8") as f:
                js_content = f.read()
            import re
            html_content = re.sub(
                r'<script\s+src=["\']script\.js["\'][^>]*></script>',
                f'<script>{js_content}</script>',
                html_content,
                flags=re.IGNORECASE
            )

        return html_content

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
                    # Inline CSS and JS from the same directory
                    html_content = _inline_assets(html_content, node_path)
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
            html_content = _inline_assets(html_content, workflow_ws_dir)
            return {"html": html_content, "node": "combined", "path": "preview.html"}

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
            html_content = _inline_assets(html_content, os.path.dirname(latest_path))
            return {"html": html_content, "node": "global", "path": latest_name}

    raise HTTPException(status_code=404, detail="No HTML preview found for this workflow")

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
async def install_pack(req: Dict[str, Any]):
    """Download and extract an agent pack with conflict detection."""
    pack_id = req.get("pack_id")
    download_url = req.get("download_url")
    conflict_action = req.get("conflict_action", "prompt")  # prompt, skip, replace, merge

    if not pack_id or not download_url:
        raise HTTPException(status_code=400, detail="Missing pack_id or download_url")

    pack_dir = os.path.join("data/agents/custom", pack_id)

    # 🆕 Step 0: Extract to temp dir first for conflict checking
    import zipfile
    import io
    import requests
    from pathlib import Path

    temp_dir = f"data/agents/temp/{pack_id}"
    os.makedirs(temp_dir, exist_ok=True)

    try:
        print(f"📦 [Marketplace] Preparing to install {pack_id} from {download_url}...")

        content = None
        # DEADLOCK PROTECTION: If it's a local static URL, read from disk directly
        # Handle both port 8089 (legacy) and 8088 (current)
        is_local_url = any(p in download_url for p in [
            "127.0.0.1:8089/static/marketplace/zips/",
            "127.0.0.1:8088/static/marketplace/zips/",
            "localhost:8089/static/marketplace/zips/",
            "localhost:8088/static/marketplace/zips/"
        ])
        
        if is_local_url:
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
            response = requests.get(download_url, timeout=10)
            response.raise_for_status()
            content = response.content

        # 🆕 Step 1: Extract to temp directory
        with zipfile.ZipFile(io.BytesIO(content)) as z:
            z.extractall(temp_dir)

        # 🆕 Step 2: Scan for conflicts
        new_agents = []
        for root, dirs, files in os.walk(temp_dir):
            for f in files:
                if f.endswith(".md"):
                    filepath = os.path.join(root, f)
                    # Parse minimal metadata
                    with open(filepath, 'r', encoding='utf-8') as mf:
                        content = mf.read()
                        meta = {}
                        if content.startswith("---"):
                            parts = content.split("---", 2)
                            if len(parts) >= 3:
                                try:
                                    meta = yaml.safe_load(parts[1]) or {}
                                except:
                                    pass

                    new_agents.append({
                        "filepath": filepath,
                        "name": meta.get("name", Path(f).stem),
                        "description": meta.get("description", ""),
                        "tags": meta.get("tags", []),
                        "force_replace": conflict_action == "replace"
                    })

        conflicts = skill_registry.detect_conflicts(new_agents)
        
        # 🆕 Step 3: If conflicts exist and action is 'prompt', return conflict info
        if conflicts["has_conflicts"] and conflict_action == "prompt":
            # Clean up temp
            shutil.rmtree(temp_dir, ignore_errors=True)
            
            return {
                "status": "conflict",
                "pack_id": pack_id,
                "conflicts": {
                    "exact_matches": [
                        {
                            "file": m["file"],
                            "existing_agents": [
                                {"id": e["id"], "name": e["name"], "namespace": e.get("namespace", e["source"])}
                                for e in m["existing_agents"]
                            ]
                        }
                        for m in conflicts["exact_matches"]
                    ],
                    "similar_agents": [
                        {
                            "new_name": s["new_agent"]["name"],
                            "existing_id": s["existing_agent"]["id"],
                            "existing_name": s["existing_agent"]["name"],
                            "similarity": s["similarity"],
                            "recommendation": s["recommendation"]
                        }
                        for s in conflicts["similar_agents"]
                    ]
                },
                "resolution_options": ["skip", "replace", "merge", "cancel"]
            }

        # 🆕 Step 4: Apply conflict resolution
        if conflicts["has_conflicts"]:
            if conflict_action == "skip":
                # Remove conflicting files from temp
                for match in conflicts["exact_matches"]:
                    conflict_file = match["file"]
                    conflict_path = os.path.join(temp_dir, conflict_file)
                    if os.path.exists(conflict_path):
                        os.remove(conflict_path)
                        print(f"⊘ [Marketplace] Skipping conflicting file: {conflict_file}")
            
            elif conflict_action == "replace":
                # Archive existing agents
                for match in conflicts["exact_matches"]:
                    for existing in match["existing_agents"]:
                        existing_path = existing.get("filepath")
                        if existing_path and os.path.exists(existing_path):
                            archive_dir = f"data/agents/archive/{pack_id}/pre_replace"
                            os.makedirs(archive_dir, exist_ok=True)
                            shutil.copy2(existing_path, archive_dir)
                            os.remove(existing_path)
                            print(f"🔄 [Marketplace] Replacing existing agent: {existing['id']}")

        # 🆕 Step 5: Move from temp to final location
        if os.path.exists(pack_dir):
            shutil.rmtree(pack_dir)
        shutil.move(temp_dir, pack_dir)

        # 6. Store Pack Metadata (enhanced)
        meta = {
            "pack_id": pack_id,
            "installed_at": str(datetime.now()),
            "version": req.get("version", "1.0.0"),
            "url": download_url,
            "source": req.get("source", "local"),  # 🆕 Track source (local, github, etc.)
            "repo": req.get("repo"),  # 🆕 GitHub repo if applicable
            "conflict_action": conflict_action,  # 🆕 Record resolution strategy
            "agent_count": len([f for f in os.listdir(pack_dir) if f.endswith(".md")])
        }
        with open(os.path.join(pack_dir, ".pack_meta.json"), "w") as f:
            json.dump(meta, f, indent=2)

        # 7. Sync Registry
        skill_registry.sync_all()

        # 🆕 Build summary
        installed_count = meta["agent_count"]
        skipped_count = len(conflicts["exact_matches"]) if conflict_action == "skip" else 0
        
        return {
            "status": "success",
            "pack_id": pack_id,
            "message": f"Pack '{pack_id}' installed successfully ({installed_count} agents).",
            "installed_count": installed_count,
            "skipped_count": skipped_count,
            "similar_agents_found": len(conflicts["similar_agents"])
        }

    except Exception as e:
        # Cleanup on failure
        if os.path.exists(pack_dir):
            shutil.rmtree(pack_dir)
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
        raise HTTPException(status_code=500, detail=f"Installation failed: {str(e)}")

@app.get("/api/marketplace/installed")
async def list_installed_packs():
    """List all packs actually installed in data/agents/custom/"""
    custom_dir = "data/agents/custom"
    if not os.path.exists(custom_dir):
        return {"installed_packs": []}
    
    installed = []
    for item in os.listdir(custom_dir):
        item_path = os.path.join(custom_dir, item)
        if os.path.isdir(item_path):
            # Check if it has pack metadata or .md files
            meta_path = os.path.join(item_path, ".pack_meta.json")
            md_files = [f for f in os.listdir(item_path) if f.endswith(".md")]
            if os.path.exists(meta_path) or md_files:
                agent_count = len(md_files)
                meta = {}
                if os.path.exists(meta_path):
                    with open(meta_path) as f:
                        meta = json.load(f)
                installed.append({
                    "pack_id": item,
                    "agent_count": agent_count,
                    "installed_at": meta.get("installed_at", "unknown"),
                    "source": meta.get("source", "unknown")
                })
    
    return {"installed_packs": installed}

@app.post("/api/marketplace/uninstall")
async def uninstall_pack(req: Dict[str, str]):
    """Remove a pack and sync registry."""
    pack_id = req.get("pack_id")
    if not pack_id:
        raise HTTPException(status_code=400, detail="Missing pack_id")

    pack_dir = os.path.join("data/agents/custom", pack_id)
    if os.path.exists(pack_dir):
        # 🆕 Archive before uninstall for safety
        archive_dir = f"data/agents/archive/{pack_id}/uninstalled"
        os.makedirs(archive_dir, exist_ok=True)

        # Copy pack to archive (handles both files and subdirectories)
        for item in os.listdir(pack_dir):
            if item == ".pack_meta.json":
                continue
            src = os.path.join(pack_dir, item)
            dst = os.path.join(archive_dir, item)
            if os.path.isdir(src):
                shutil.copytree(src, dst, dirs_exist_ok=True)
            else:
                shutil.copy2(src, dst)

        shutil.rmtree(pack_dir)
        skill_registry.sync_all()
        return {"status": "success", "message": f"Pack '{pack_id}' removed and archived.", "archive_path": archive_dir}
    else:
        raise HTTPException(status_code=404, detail=f"Pack '{pack_id}' is not installed.")

@app.get("/api/marketplace/packs/{pack_id}/agents")
async def get_pack_agents(pack_id: str):
    """Get all agents in a specific pack."""
    agents = skill_registry.get_pack_agents(pack_id)
    if not agents:
        # Check if pack is installed at all
        pack_dir = os.path.join("data/agents/custom", pack_id)
        if not os.path.exists(pack_dir):
            raise HTTPException(status_code=404, detail="Pack not installed")
    
    return {
        "pack_id": pack_id,
        "agent_count": len(agents),
        "agents": agents
    }

@app.get("/api/agents/namespace-stats")
async def get_namespace_stats():
    """Get statistics about agents per namespace."""
    stats = skill_registry.get_namespace_stats()
    return {
        "stats": stats,
        "total_agents": sum(stats.values())
    }

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

# --- 🌐 Phase 2: Remote Marketplace Integration ---

from core.marketplace_sync import marketplace_sync, MarketplaceSource
from core.github_pack_builder import GitHubPackBuilder
from core.auto_update_service import auto_update_service

@app.get("/api/marketplace/remote/packs")
async def list_remote_packs(source_id: Optional[str] = None):
    """Fetch packs from remote marketplace sources."""
    try:
        if source_id:
            # Fetch from specific source
            source = next((s for s in marketplace_sync.sources if s.id == source_id), None)
            if not source:
                raise HTTPException(status_code=404, detail=f"Source not found: {source_id}")
            packs = source.fetch_available_packs()
        else:
            # Fetch from all sources
            packs = marketplace_sync.fetch_all_packs()
        
        return {
            "packs": packs,
            "total": len(packs),
            "sources": [s.name for s in marketplace_sync.sources if s.enabled]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch remote packs: {str(e)}")

@app.get("/api/marketplace/remote/packs/{pack_id}/updates")
async def check_pack_updates(pack_id: str):
    """Check for updates to a specific pack."""
    # Get local version
    pack_dir = f"data/agents/custom/{pack_id}"
    meta_path = f"{pack_dir}/.pack_meta.json"
    
    if not os.path.exists(meta_path):
        raise HTTPException(status_code=404, detail="Pack not installed")
    
    with open(meta_path) as f:
        local_meta = json.load(f)
    
    # Check remote sources
    updates = []
    for source in marketplace_sync.sources:
        if not source.enabled:
            continue
        
        try:
            update_info = source.check_for_updates(pack_id, local_meta.get('version', '1.0.0'))
            if update_info.get('has_update'):
                updates.append({
                    'source': source.name,
                    **update_info
                })
        except Exception as e:
            print(f"⚠️ [Marketplace] Failed to check updates from {source.name}: {e}")
    
    return {
        "pack_id": pack_id,
        "local_version": local_meta.get('version', '1.0.0'),
        "updates_available": len(updates) > 0,
        "updates": updates
    }

@app.post("/api/marketplace/remote/sync")
async def sync_remote_packs(req: Dict[str, Any] = {}):
    """Manually trigger remote pack synchronization."""
    try:
        # Fetch all remote packs
        remote_packs = marketplace_sync.fetch_all_packs()
        
        # Merge with local manifest
        local_manifest = {"packs": []}
        if os.path.exists(MARKETPLACE_MANIFEST):
            with open(MARKETPLACE_MANIFEST, "r") as f:
                local_manifest = json.load(f)
        
        # Add remote packs (avoid duplicates)
        local_ids = {p['id'] for p in local_manifest.get('packs', [])}
        new_packs = [p for p in remote_packs if p['id'] not in local_ids]
        local_manifest['packs'].extend(new_packs)
        
        # Save updated manifest
        os.makedirs(os.path.dirname(MARKETPLACE_MANIFEST), exist_ok=True)
        with open(MARKETPLACE_MANIFEST, "w") as f:
            json.dump(local_manifest, f, indent=2)
        
        return {
            "status": "success",
            "synced_packs": len(new_packs),
            "total_packs": len(local_manifest['packs']),
            "new_packs": [p['name'] for p in new_packs]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")

@app.get("/api/marketplace/download/{source_id}/{plugin_name}")
async def download_pack_from_github(source_id: str, plugin_name: str):
    """Download a pack ZIP directly from GitHub."""
    from fastapi.responses import StreamingResponse
    
    # Find source
    source = next((s for s in marketplace_sync.sources if s.id == source_id), None)
    if not source:
        raise HTTPException(status_code=404, detail=f"Source not found: {source_id}")
    
    # Download pack
    zip_data = source.download_pack_zip(plugin_name)
    if not zip_data:
        raise HTTPException(status_code=404, detail=f"Pack not found: {plugin_name}")
    
    # Return as file download
    return StreamingResponse(
        io.BytesIO(zip_data),
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={plugin_name}.zip"}
    )

@app.get("/api/marketplace/sources")
async def list_marketplace_sources():
    """List all configured marketplace sources."""
    return {
        "sources": marketplace_sync.get_source_status()
    }

@app.post("/api/marketplace/sources")
async def add_marketplace_source(req: Dict[str, Any]):
    """Add a new marketplace source."""
    try:
        marketplace_sync.add_source(req)
        return {
            "status": "success",
            "message": f"Source added: {req.get('name', req.get('id'))}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add source: {str(e)}")

@app.delete("/api/marketplace/sources/{source_id}")
async def remove_marketplace_source(source_id: str):
    """Remove a marketplace source."""
    try:
        marketplace_sync.remove_source(source_id)
        return {
            "status": "success",
            "message": f"Source removed: {source_id}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to remove source: {str(e)}")

@app.post("/api/marketplace/auto-update/check")
async def check_auto_updates():
    """Manually trigger update check."""
    try:
        updates = auto_update_service.check_now()
        return {
            "updates_available": len(updates),
            "updates": updates
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Update check failed: {str(e)}")

@app.get("/api/marketplace/auto-update/status")
async def get_auto_update_status():
    """Get auto-update service status."""
    return auto_update_service.get_status()

@app.post("/api/marketplace/github/plugins")
async def list_github_plugins(req: Dict[str, str] = {}):
    """List all plugins from a GitHub repository."""
    repo = req.get('repo', 'wshobson/agents')
    branch = req.get('branch', 'main')
    
    try:
        builder = GitHubPackBuilder(repo, branch)
        plugins = builder.list_all_plugins()
        
        return {
            "repo": repo,
            "branch": branch,
            "plugins": plugins,
            "total": len(plugins)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list plugins: {str(e)}")

@app.get("/api/marketplace/github/plugins/{plugin_name}/info")
async def get_plugin_info(plugin_name: str, repo: str = "wshobson/agents"):
    """Get information about a specific plugin."""
    try:
        builder = GitHubPackBuilder(repo)
        info = builder.get_plugin_info(plugin_name)
        
        if not info:
            raise HTTPException(status_code=404, detail=f"Plugin not found: {plugin_name}")
        
        return info
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get plugin info: {str(e)}")

@app.get("/api/workflow-runs/outputs")
async def get_workflow_outputs():
    """
    Fetch all previous workflow run outputs from audit log.
    Returns outputs keyed by workflow ID for the Workflows page.
    """
    try:
        import re
        
        with sqlite3.connect(audit_logger.db_path) as conn:
            # Get all RESULT events with their run context
            cursor = conn.execute("""
                SELECT agent_id, action_type, details_json, timestamp, cas_hash
                FROM events
                WHERE action_type IN ('RESULT', 'DELIVERABLE_EXPORTED')
                ORDER BY timestamp DESC
            """)
            
            # Group by workflow run to find completed workflows
            workflow_outputs = {}
            
            for row in cursor.fetchall():
                agent_id, action_type, details_json, timestamp, cas_hash = row
                
                try:
                    details = json.loads(details_json) if details_json else {}
                except:
                    details = {}
                
                # Extract result content
                result_content = details.get('result', '')
                
                # Try to extract workflow context from agent_id or details
                # Agent IDs look like: core_.._.._.._skills_xxx_step1_timestamp
                # or workflow step IDs
                if action_type == 'RESULT' and result_content:
                    # Store the latest result per potential workflow key
                    # Use agent_id as a key for now
                    if agent_id not in workflow_outputs:
                        # Clean up markdown code blocks
                        markdown = result_content
                        # Remove leading/trailing code fences if present
                        if markdown.startswith('```'):
                            lines = markdown.split('\n')
                            # Remove first line if it's a code fence
                            if lines[0].startswith('```'):
                                lines = lines[1:]
                            # Remove last line if it's a code fence  
                            if lines and lines[-1].strip().startswith('```'):
                                lines = lines[:-1]
                            markdown = '\n'.join(lines)
                        
                        workflow_outputs[agent_id] = {
                            'agent_id': agent_id,
                            'output': {'markdown': markdown},
                            'completedAt': timestamp,
                            'task': details.get('task', details.get('instruction', 'Workflow execution'))[:200],
                            'agentCount': 1
                        }
            
            # Now try to map agent outputs to workflows by checking graph_json
            # This is a best-effort mapping since the audit log doesn't store workflow IDs directly
            
            return {
                'outputs': workflow_outputs,
                'total': len(workflow_outputs)
            }
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {'outputs': {}, 'total': 0, 'error': str(e)}

@app.get("/api/workflows/{workflow_id}/output")
async def get_workflow_output(workflow_id: str):
    """
    Fetch the latest output for a specific workflow.
    Tries to match workflow runs to stored outputs.
    """
    try:
        with sqlite3.connect(audit_logger.db_path) as conn:
            # Get the most recent RESULT for this workflow
            # Try matching by workflow_id in various ways
            cursor = conn.execute("""
                SELECT agent_id, details_json, timestamp
                FROM events
                WHERE action_type = 'RESULT'
                ORDER BY timestamp DESC
                LIMIT 10
            """)
            
            results = []
            for row in cursor.fetchall():
                agent_id, details_json, timestamp = row
                try:
                    details = json.loads(details_json) if details_json else {}
                except:
                    details = {}
                
                result = details.get('result', '')
                if result:
                    # Clean markdown
                    markdown = result
                    if markdown.startswith('```'):
                        lines = markdown.split('\n')
                        if lines[0].startswith('```'):
                            lines = lines[1:]
                        if lines and lines[-1].strip().startswith('```'):
                            lines = lines[:-1]
                        markdown = '\n'.join(lines)
                    
                    results.append({
                        'agent_id': agent_id,
                        'output': {'markdown': markdown},
                        'completedAt': timestamp,
                        'task': details.get('task', details.get('instruction', ''))[:200]
                    })
            
            return {
                'workflow_id': workflow_id,
                'outputs': results,
                'latest': results[0] if results else None
            }
    
    except Exception as e:
        return {'workflow_id': workflow_id, 'outputs': [], 'latest': None, 'error': str(e)}

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


# ============================================================
# Companies — Mission-Based Company Generation & Issue Routing
# ============================================================

_company_store: Dict[str, Dict[str, Any]] = {}

# Keyword → company structure mapping for mission decoding
_MISSION_PATTERNS = [
    {
        "keywords": ["saas", "platform", "web app", "analytics", "dashboard"],
        "structure": {
            "name": "SaaS Platform",
            "emoji": "☁️",
            "teams": [
                {"name": "Engineering", "emoji": "⚙️", "description": "Build and maintain the platform", "agents": [
                    {"name": "Backend Architect", "role": "Backend Systems Architect", "emoji": "🏗️", "model": "gemini-2.5-flash", "skills": ["API Design", "System Architecture"]},
                    {"name": "Frontend Developer", "role": "Frontend Experience Developer", "emoji": "🖥️", "model": "gemini-2.5-flash", "skills": ["React", "TypeScript"]},
                ]},
                {"name": "Design", "emoji": "🎨", "description": "UI/UX and brand identity", "agents": [
                    {"name": "UI Designer", "role": "UI Systems Designer", "emoji": "🎨", "model": "gemini-2.5-flash", "skills": ["Design Systems", "Visual Design"]},
                ]},
                {"name": "Marketing", "emoji": "📣", "description": "Growth and content", "agents": [
                    {"name": "Content Strategist", "role": "Multi-Platform Content Strategist", "emoji": "✍️", "model": "gemini-2.5-flash", "skills": ["Content Strategy", "SEO"]},
                ]},
            ],
        },
    },
    {
        "keywords": ["ecommerce", "e-commerce", "shop", "store", "retail"],
        "structure": {
            "name": "E-Commerce Company",
            "emoji": "🛒",
            "teams": [
                {"name": "Engineering", "emoji": "⚙️", "description": "Platform and integrations", "agents": [
                    {"name": "Full-Stack Developer", "role": "Senior Full-Stack Developer", "emoji": "💎", "model": "gemini-2.5-flash", "skills": ["E-Commerce", "Payment Integration"]},
                ]},
                {"name": "Marketing", "emoji": "📣", "description": "Customer acquisition", "agents": [
                    {"name": "SEO Lead", "role": "Technical SEO Lead", "emoji": "🔍", "model": "gemini-2.5-flash", "skills": ["SEO", "Analytics"]},
                ]},
            ],
        },
    },
    {
        "keywords": ["game", "gaming", "unity", "unreal", "gamedev"],
        "structure": {
            "name": "Game Studio",
            "emoji": "🎮",
            "teams": [
                {"name": "Engineering", "emoji": "⚙️", "description": "Game engine and systems", "agents": [
                    {"name": "Gameplay Programmer", "role": "Godot Gameplay Programmer", "emoji": "🎯", "model": "gemini-2.5-flash", "skills": ["GDScript", "Game Architecture"]},
                ]},
                {"name": "Game Design", "emoji": "🎮", "description": "Mechanics and narrative", "agents": [
                    {"name": "Game Designer", "role": "Game Systems Designer", "emoji": "🎮", "model": "gemini-2.5-flash", "skills": ["Mechanics Design", "Level Design"]},
                    {"name": "Narrative Architect", "role": "Game Narrative Architect", "emoji": "📖", "model": "gemini-2.5-flash", "skills": ["Story Design", "Dialogue"]},
                ]},
            ],
        },
    },
    {
        "keywords": ["mobile", "ios", "android", "app"],
        "structure": {
            "name": "Mobile App Studio",
            "emoji": "📱",
            "teams": [
                {"name": "Engineering", "emoji": "⚙️", "description": "Mobile development", "agents": [
                    {"name": "Mobile Developer", "role": "Cross-Platform Mobile Developer", "emoji": "📲", "model": "gemini-2.5-flash", "skills": ["React Native", "Flutter"]},
                ]},
            ],
        },
    },
]


def _build_company_from_mission(mission: str) -> Dict[str, Any]:
    """Match a mission statement to a company structure using keyword scoring."""
    lower = mission.lower()
    best_match = _MISSION_PATTERNS[0]["structure"]
    best_score = 0

    for pattern in _MISSION_PATTERNS:
        score = sum(1 for k in pattern["keywords"] if k in lower)
        if score > best_score:
            best_score = score
            best_match = pattern["structure"]

    if best_score == 0:
        words = " ".join(w.capitalize() for w in mission.split()[:4])
        best_match = {
            "name": f"{words} Co.",
            "emoji": "🏢",
            "teams": [
                {"name": "Engineering", "emoji": "⚙️", "description": "Build and ship the product", "agents": [
                    {"name": "Senior Developer", "role": "Senior Full-Stack Developer", "emoji": "💎", "model": "gemini-2.5-flash", "skills": ["Full-Stack Development", "Architecture"]},
                ]},
            ],
        }
    return best_match


@app.get("/api/companies")
async def list_companies():
    """List all companies."""
    return list(_company_store.values())


@app.post("/api/companies")
async def create_company(request: Request):
    """Create a company manually or from mission."""
    try:
        data = await request.json()
        company_id = data.get("id") or f"comp-{uuid.uuid4().hex[:10]}"
        company = {
            "id": company_id,
            "name": data.get("name", "New Company"),
            "mission": data.get("mission", ""),
            "emoji": data.get("emoji", "🏢"),
            "status": data.get("status", "Active"),
            "created_at": datetime.now().isoformat(),
        }
        _company_store[company_id] = company
        return {"success": True, **company}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create company: {str(e)}")


@app.post("/api/companies/generate")
async def generate_company(request: Request):
    """
    Generate a company from a mission statement.
    Returns the full structure: CEO + teams + agents.
    """
    try:
        data = await request.json()
        mission = data.get("mission", "")
        if not mission:
            raise HTTPException(status_code=400, detail="Mission is required")

        structure = _build_company_from_mission(mission)
        # Always include CEO at the top
        return {
            "name": structure["name"],
            "emoji": structure["emoji"],
            "teams": structure["teams"],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate company: {str(e)}")


@app.get("/api/companies/{company_id}")
async def get_company(company_id: str):
    """Get a specific company."""
    company = _company_store.get(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


@app.delete("/api/companies/{company_id}")
async def delete_company(company_id: str):
    """Delete a company."""
    if company_id not in _company_store:
        raise HTTPException(status_code=404, detail="Company not found")
    del _company_store[company_id]
    return {"success": True, "message": f"Company {company_id} deleted"}


@app.post("/api/companies/{company_id}/issues")
async def create_company_issue(company_id: str, request: Request):
    """Create and auto-route an issue within a company."""
    if company_id not in _company_store:
        raise HTTPException(status_code=404, detail="Company not found")
    try:
        data = await request.json()
        return {
            "success": True,
            "company_id": company_id,
            "issue": {
                "title": data.get("title"),
                "team_id": data.get("teamId"),
                "agent_id": data.get("agentId"),
                "priority": data.get("priority", "medium"),
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create issue: {str(e)}")


# ============================================================
# Phase 3: Multi-Tenant Settings & API Key Management
# ============================================================

def _get_user_id_from_request(request: Request) -> Optional[str]:
    """Extract user_id from request state (set by auth middleware)."""
    if hasattr(request.state, "user") and request.state.user:
        user_data = request.state.user
        if isinstance(user_data, dict):
            return user_data.get("id")
        return getattr(user_data, "id", None)
    return None


@app.get("/api/settings")
async def get_user_settings_endpoint(request: Request):
    """Get the current user's settings from Supabase."""
    user_id = _get_user_id_from_request(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        from core.settings import get_user_settings
        settings_data = get_user_settings(user_id)
        return {"status": "success", "settings": settings_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load settings: {str(e)}")


@app.put("/api/settings")
async def save_user_settings_endpoint(request: Request):
    """Save the current user's settings to Supabase."""
    user_id = _get_user_id_from_request(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        data = await request.json()
        from core.settings import save_user_settings
        saved = save_user_settings(user_id, data)
        return {"status": "success", "settings": saved}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save settings: {str(e)}")


@app.get("/api/settings/api-keys")
async def list_api_keys(request: Request):
    """List user's API keys (masked, never show full key)."""
    user_id = _get_user_id_from_request(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        from core.supabase_client import supabase_admin
        from core.security.crypto import mask_key

        client = supabase_admin.client
        result = client.table("user_api_keys").select("id,provider,key_suffix,is_active,last_used_at,created_at").eq("user_id", user_id).execute()

        return {
            "status": "success",
            "keys": [{"id": k["id"], "provider": k["provider"], "key_suffix": k["key_suffix"], "is_active": k["is_active"], "last_used_at": k.get("last_used_at"), "created_at": k.get("created_at")} for k in (result.data or [])],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list API keys: {str(e)}")


@app.post("/api/settings/api-keys")
async def add_api_key(request: Request):
    """Add a new API key (encrypted before storage)."""
    user_id = _get_user_id_from_request(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        data = await request.json()
        provider = data.get("provider", "").lower()
        api_key = data.get("api_key", "")

        if not provider or not api_key:
            raise HTTPException(status_code=400, detail="provider and api_key are required")

        from core.supabase_client import supabase_admin
        from core.security.crypto import encrypt_api_key, mask_key

        encrypted = encrypt_api_key(api_key)
        suffix = mask_key(api_key, 6)

        result = supabase_admin.query("user_api_keys", "upsert", data={
            "user_id": user_id,
            "provider": provider,
            "encrypted_key": encrypted,
            "key_suffix": suffix,
            "is_active": True,
        }, on_conflict="user_id,provider")

        if result.data and len(result.data) > 0:
            return {
                "status": "success",
                "key": {"id": result.data[0]["id"], "provider": provider, "key_suffix": suffix, "is_active": True},
            }
        raise HTTPException(status_code=500, detail=f"Failed to save API key: {result.error}")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add API key: {str(e)}")


@app.get("/api/settings/api-keys")
async def list_api_keys(request: Request):
    """List user's API keys (masked, never show full key)."""
    user_id = _get_user_id_from_request(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        from core.supabase_client import supabase_admin

        result = supabase_admin.query("user_api_keys", "select", columns="id,provider,key_suffix,is_active,last_used_at,created_at", eq="user_id", eq_value=user_id)

        return {
            "status": "success",
            "keys": [{"id": k["id"], "provider": k["provider"], "key_suffix": k["key_suffix"], "is_active": k["is_active"], "last_used_at": k.get("last_used_at"), "created_at": k.get("created_at")} for k in (result.data or [])],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list API keys: {str(e)}")


@app.delete("/api/settings/api-keys/{key_id}")
async def delete_api_key(key_id: str, request: Request):
    """Remove an API key."""
    user_id = _get_user_id_from_request(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        from core.supabase_client import supabase_admin

        result = supabase_admin.query("user_api_keys", "delete", eq="id", eq_value=key_id)

        if result.data and len(result.data) > 0:
            return {"status": "success", "message": "API key removed"}
        raise HTTPException(status_code=404, detail="API key not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete API key: {str(e)}")


@app.post("/api/settings/api-keys/test")
async def test_api_key(request: Request):
    """Test an API key by sending a simple prompt."""
    user_id = _get_user_id_from_request(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        data = await request.json()
        provider = data.get("provider", "gemini")
        api_key = data.get("api_key", "")

        if not api_key:
            # Try to use stored key
            from core.supabase_client import supabase_admin
            from core.security.crypto import decrypt_api_key

            client = supabase_admin.client
            result = client.table("user_api_keys").select("encrypted_key").eq("user_id", user_id).eq("provider", provider).eq("is_active", True).execute()

            if result.data:
                api_key = decrypt_api_key(result.data[0]["encrypted_key"])
            else:
                raise HTTPException(status_code=400, detail=f"No active {provider} API key found")

        # Test the key
        import httpx
        async with httpx.AsyncClient(timeout=15) as hc:
            if provider == "gemini":
                resp = await hc.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}",
                    json={"contents": [{"parts": [{"text": "Reply OK"}]}]},
                )
            elif provider == "openai":
                resp = await hc.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "Reply OK"}]},
                )
            else:
                raise HTTPException(status_code=400, detail=f"Unsupported provider for testing: {provider}")

        if resp.status_code == 200:
            return {"status": "success", "message": f"{provider} API key is valid", "success": True}
        else:
            return {"status": "error", "message": f"API key test failed: {resp.text[:200]}", "success": False}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Test failed: {str(e)}")

# ============================================================
# Dashboard & Analytics Endpoints
# ============================================================

@app.get("/api/dashboard/stats")
async def get_dashboard_stats(request: Request):
    """Aggregate real-time metrics for the Home dashboard cards."""
    try:
        user_id = _get_user_id_from_request(request)
        with sqlite3.connect(audit_logger.db_path) as conn:
            # Active Workflows (status = 'active')
            cursor = conn.execute("SELECT COUNT(*) FROM executions WHERE status = 'active'")
            active_workflows = cursor.fetchone()[0]

            # Agents Running (status = 'ACTIVE')
            cursor = conn.execute("SELECT COUNT(*) FROM agents WHERE status = 'ACTIVE'")
            agents_running = cursor.fetchone()[0]

            # Scheduled Jobs
            cursor = conn.execute("SELECT COUNT(*) FROM scheduled_jobs WHERE status = 'pending' AND next_run >= date('now')")
            scheduled_count = cursor.fetchone()[0]

            # Tokens Today (Sum of cost_usd * 1000000 approx)
            # Actually audit_logger can calculate this
            cursor = conn.execute("SELECT SUM(cost_usd) FROM events WHERE timestamp >= date('now')")
            cost_today = cursor.fetchone()[0] or 0.0
            tokens_today = int(cost_today * 750000) # Rough estimate tokens per dollar

            # Monthly Cost
            cursor = conn.execute("SELECT SUM(cost_usd) FROM events WHERE timestamp >= date('now', 'start of month')")
            monthly_cost = cursor.fetchone()[0] or 0.0

            # Execution stats (grouped by status)
            cursor = conn.execute("SELECT status, COUNT(*) FROM executions GROUP BY status")
            execution_stats = {row[0]: row[1] for row in cursor.fetchall()}

            # Success Rate
            total_runs = execution_stats.get('completed', 0) + execution_stats.get('failed', 0)
            success_rate = round((execution_stats.get('completed', 0) / max(total_runs, 1)) * 100, 1)

            return {
                "active_workflows": active_workflows,
                "agents_running": agents_running,
                "tokens_today": tokens_today,
                "monthly_cost": round(monthly_cost, 2),
                "total_workflows": execution_stats.get('completed', 0) + active_workflows,
                "execution_stats": execution_stats,
                "scheduled_count": scheduled_count,
                "success_rate": success_rate
            }
    except Exception as e:
        logger.error(f"Failed to fetch dashboard stats: {e}")
        return {"error": str(e)}

@app.get("/api/dashboard/activity")
async def get_dashboard_activity(limit: int = 20):
    """Retrieve summarized recent activity for the dashboard."""
    try:
        events = audit_logger.get_history(company_id="company_alpha", limit=limit)
        activity = []
        for e in events:
            # Create a more user-friendly message based on action_type
            action = e['action_type']
            agent_id = e['agent_id']
            
            # Extract readable name from ID (e.g. "research_agent_123" -> "Research Agent")
            if agent_id == 'system':
                agent = "System"
            elif agent_id == 'human_user':
                agent = "User"
            else:
                parts = agent_id.split('_')
                # Filter out numeric timestamps from parts
                name_parts = [p for p in parts if not p.isdigit()]
                agent = " ".join(name_parts).title() if name_parts else agent_id
            
            details = e['details']
            
            message = f"{agent} performed {action}"
            if action == 'TOOL_CALL':
                tool_name = details.get('tool', 'a tool')
                message = f"{agent} is using {tool_name} to fulfill the objective"
            elif action == 'RESULT':
                message = f"{agent} successfully completed the assigned task"
            elif action == 'THOUGHT':
                thought = details.get('thought', 'strategizing')
                # Truncate thought
                summary = (thought[:60] + '...') if len(thought) > 60 else thought
                message = f"{agent} reasoned: {summary}"
            elif action == 'SOP_START':
                message = f"{agent} initiated a new workflow sequence"
            
            activity.append({
                "agent_id": e['agent_id'],
                "action_type": action,
                "timestamp": e['timestamp'],
                "message": message,
                "details": details
            })
        return activity
    except Exception as e:
        return []

@app.get("/api/dashboard/token-usage")
async def get_token_usage_chart(days: int = 7):
    """Daily token consumption for the last N days."""
    try:
        with sqlite3.connect(audit_logger.db_path) as conn:
            cursor = conn.execute(f"""
                SELECT date(timestamp) as day, SUM(cost_usd)
                FROM events 
                WHERE timestamp >= date('now', '-{days} days')
                GROUP BY day
                ORDER BY day ASC
            """)
            data = []
            for row in cursor.fetchall():
                data.append({
                    "day": datetime.strptime(row[0], "%Y-%m-%d").strftime("%a"),
                    "date": row[0],
                    # Use a floor check to ensure even tiny runs show up as at least 100 tokens
                    "tokens": max(int((row[1] or 0) * 1000000), 1) if (row[1] or 0) > 0 else 0
                })
            return data
    except Exception as e:
        return []

@app.get("/api/dashboard/agent-stats")
async def get_dashboard_agent_stats():
    """Top-performing agents by run count and efficiency."""
    try:
        with sqlite3.connect(audit_logger.db_path) as conn:
            cursor = conn.execute("""
                SELECT agent_id, COUNT(*), SUM(cost_usd)
                FROM events
                WHERE action_type = 'RESULT'
                GROUP BY agent_id
                ORDER BY COUNT(*) DESC
                LIMIT 5
            """)
            stats = []
            for i, row in enumerate(cursor.fetchall()):
                agent_id = row[0]
                # Look up agent name in registry
                agent_info = skill_registry.get_skill(agent_id) or {"name": agent_id, "emoji": "🤖", "category": "General"}
                stats.append({
                    "rank": i + 1,
                    "agent_id": agent_id,
                    "name": agent_info.get("name"),
                    "emoji": agent_info.get("emoji"),
                    "category": agent_info.get("category"),
                    "runs": row[1],
                    "cost": round(row[2] or 0, 4)
                })
            return stats
    except Exception as e:
        return []

# ============================================================
# Notification & Inbox Endpoints
# ============================================================

@app.get("/api/notifications")
async def get_user_notifications(request: Request, company_id: Optional[str] = None):
    """Retrieve notifications for the Inbox."""
    user_id = _get_user_id_from_request(request) or "dev_user"
    return audit_logger.get_notifications(user_id, company_id)

@app.post("/api/notifications/{id}/read")
async def mark_notification_as_read(id: int):
    """Mark a notification as read via ID."""
    audit_logger.mark_notification_read(id)
    return {"status": "success"}

# ============================================================
# Scheduler & Automation Endpoints (V1 Implementation)
# ============================================================

@app.get("/api/scheduler/jobs")
async def list_scheduled_jobs():
    """List all scheduled workflow tasks from DB."""
    try:
        with sqlite3.connect(audit_logger.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute("SELECT * FROM scheduled_jobs ORDER BY next_run ASC")
            return [dict(row) for row in cursor.fetchall()]
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/scheduler/jobs")
async def create_scheduled_job(req: Dict[str, Any]):
    """Schedule a workflow to run at a specific time (Cron/Once)."""
    try:
        name = req.get("name", "Untitled Job")
        workflow_id = req.get("workflow_id")
        next_run = req.get("next_run") # ISO string
        cron_pattern = req.get("cron_pattern") # 'hourly', 'daily', or None for once
        
        if not workflow_id or not next_run:
            raise HTTPException(status_code=400, detail="workflow_id and next_run are required")
            
        scheduler.schedule_job(name, workflow_id, next_run, cron_pattern, req.get("payload"))
        return {"status": "scheduled", "message": f"Job '{name}' queued for execution"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8088)
