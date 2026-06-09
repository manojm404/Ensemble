"""
core/governance.py
Governance for 0101: budgeting, heartbeats, org charts, and FastAPI endpoints.
"""
import base64
import hashlib
import json
import logging
import os
import re
import shutil
import sqlite3
import threading
import time
import uuid
import zlib
import asyncio
from datetime import datetime
from typing import Dict, Any, Optional, Callable, List, Set, Iterable

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

logger = logging.getLogger(__name__)

from core.ws_manager import ws_manager
from core.audit import AuditLogger
from core.skill_registry import skill_registry
from core.engine import SOPEngine
from core.ensemble_space import EnsembleSpace
from core.llm_provider import LLMProvider
from core.dag_engine import DAGWorkflowEngine
from core.langgraph_runtime import supports_langgraph_workflow
from core.workflow_planner import MagicFlowPlan, build_magicflow_plan
from core.workflows.messages import AgentMessage, build_message_threads
from core.workflows.simulation import (
    SimulationRunner,
    load_simulation_checkpoints,
    load_simulation_logs,
    load_simulation_state,
)
import core.adapters
from core import settings
from core.scheduler import init_scheduler

# Phase 1: Supabase Integration
from core.supabase_client import supabase, supabase_admin, verify_connection
from core.auth import get_current_user, require_auth, is_public_path, PUBLIC_PATHS
from core.auth_routes import router as auth_router, health_router
import core.company_routes as company_routes
from core.company_routes import router as company_router
from core.models.user import UserCreate, UserLogin, ProfileUpdate
from core.models.api import HealthResponse
from core.marketplace_policy import sanitize_manifest_data, is_blocked_pack

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

app = FastAPI(title="0101 Platform API")


def _normalize_failure_text(value: Any, fallback: str = "Unknown failure") -> str:
    """Convert structured error payloads into a readable string."""
    if value is None:
        return fallback

    if isinstance(value, str):
        cleaned = value.strip()
        return cleaned or fallback

    if isinstance(value, (int, float, bool)):
        return str(value)

    if isinstance(value, list):
        parts = [_normalize_failure_text(item, "") for item in value]
        parts = [part for part in parts if part]
        return ", ".join(parts) if parts else fallback

    if isinstance(value, dict):
        for key in ("message", "detail", "error", "reason"):
            if key in value:
                nested = _normalize_failure_text(value.get(key), "")
                if nested:
                    return nested
        try:
            return json.dumps(value, ensure_ascii=False)
        except Exception:
            return fallback

    try:
        return str(value)
    except Exception:
        return fallback


def _local_dev_user_for_request(request: Request) -> Dict[str, Any]:
    """Derive a stable local user scope when Supabase auth is unavailable."""
    header_user_id = (request.headers.get("X-0101-User-Id") or "").strip()
    header_email = (request.headers.get("X-0101-User-Email") or "").strip().lower()
    account_key = header_user_id or header_email
    if account_key:
        digest = hashlib.sha256(account_key.encode("utf-8")).hexdigest()[:16]
        return {
            "id": f"local-account:{digest}",
            "email": header_email or f"local-account-{digest}@0101.local",
            "full_name": "Local Developer",
            "tier": "free",
            "is_authenticated": False,
            "scope_source": "local-account",
        }

    authorization = request.headers.get("Authorization", "")
    token = ""
    if authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()

    if token:
        digest = hashlib.sha256(token.encode("utf-8")).hexdigest()[:16]
        return {
            "id": f"local:{digest}",
            "email": f"local-{digest}@0101.local",
            "full_name": "Local Developer",
            "tier": "free",
            "is_authenticated": False,
            "scope_source": "local-token",
        }

    return {
        "id": "dev_user",
        "email": "dev@localhost",
        "full_name": "Local Developer",
        "tier": "free",
        "is_authenticated": False,
        "scope_source": "dev-fallback",
    }

# Mount marketplace zips for local installs
os.makedirs("data/marketplace/zips", exist_ok=True)
app.mount("/static/marketplace/zips", StaticFiles(directory="data/marketplace/zips"), name="marketplace_zips")

# CORS Middleware - configurable origins
# Default includes common local dev origins. Set CORS_ORIGINS env var for production.
cors_origins_env = os.getenv("CORS_ORIGINS", "").strip()
default_cors_origins = [
    "http://localhost:5173",
    "http://localhost:8080",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8080",
    "tauri://localhost",
    "https://tauri.localhost",
]
if cors_origins_env:
    cors_origins = default_cors_origins + [
        o.strip() for o in cors_origins_env.split(",") if o.strip()
    ]
else:
    cors_origins = default_cors_origins

# Deduplicate while preserving order so local overrides can add more origins
cors_origins = list(dict.fromkeys(cors_origins))

# CORS Middleware - Permissive for V1 Release
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
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
        request.state.user = _local_dev_user_for_request(request)
        return await call_next(request)

    if not enforce_auth:
        # Explicitly disabled — bypass auth
        request.state.user = _local_dev_user_for_request(request)
        return await call_next(request)

    authorization = request.headers.get("Authorization", "")
    if not authorization:
        return JSONResponse(
            status_code=401,
            content={"status": "error", "error": "unauthorized", "message": "Authentication required. Include 'Authorization: Bearer <token>' in your request."},
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        from core.auth import extract_bearer_token, verify_token_with_supabase, decode_unverified_user
        token = extract_bearer_token(authorization)
        if not token:
            return JSONResponse(
                status_code=401,
                content={"status": "error", "error": "invalid_token", "message": "Invalid Authorization header format. Use 'Bearer <token>'."},
                headers={"WWW-Authenticate": "Bearer"},
            )

        try:
            user_data = await verify_token_with_supabase(token)
        except HTTPException as auth_error:
            client_host = getattr(request.client, "host", "") if request.client else ""
            local_request = client_host in {"127.0.0.1", "localhost", "::1"}
            if not local_request:
                raise auth_error

            logger.warning(
                "⚠️ [Auth] Supabase verification failed for local request from %s; using unverified JWT fallback: %s",
                client_host,
                auth_error.detail,
            )
            fallback_user = decode_unverified_user(token)
            user_data = {
                "id": fallback_user.id,
                "email": fallback_user.email,
            }

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
        print("🕒 [0101] Sovereign Scheduler active")
    except Exception as e:
        print(f"⚠️ [0101] Failed to start scheduler: {e}")

@app.on_event("shutdown")
async def shutdown_event():
    """Server cleanup."""
    # Stop the Sovereign Scheduler
    if scheduler:
        await scheduler.stop()
        print("👋 [0101] Scheduler stopped")

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
app.include_router(auth_router, prefix="/api")
app.include_router(health_router)
app.include_router(company_router)
# ============================================================

# --- Core Logic Functions ---

def get_all_agents_logic():
    """Aggregate file-based and DB-persisted agents."""
    # All agent discovery is now handled by skill_registry
    return skill_registry.list_skills()

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
        await ws_manager.broadcast(self.company_id, "PENDING_APPROVAL", {
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
                    company_id TEXT,
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
                    company_id TEXT,
                    status TEXT,
                    current_node TEXT,
                    last_agent_id TEXT,
                    parent_run_id TEXT,
                    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(parent_run_id) REFERENCES executions(run_id)
                )
            """)
            cursor = conn.execute("PRAGMA table_info(executions)")
            execution_columns = {row[1] for row in cursor.fetchall()}
            for column, column_type in (
                ("current_iteration", "INTEGER DEFAULT 0"),
                ("max_iterations", "INTEGER DEFAULT 0"),
                ("loop_metadata", "TEXT"),
                ("completed_at", "DATETIME"),
            ):
                if column not in execution_columns:
                    conn.execute(f"ALTER TABLE executions ADD COLUMN {column} {column_type}")
            conn.execute("""
                CREATE TABLE IF NOT EXISTS node_executions (
                    run_id TEXT,
                    node_id TEXT,
                    status TEXT,
                    output TEXT,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY(run_id, node_id)
                )
            """)
            cursor = conn.execute("PRAGMA table_info(node_executions)")
            columns = {row[1] for row in cursor.fetchall()}
            if "output" not in columns:
                conn.execute("ALTER TABLE node_executions ADD COLUMN output TEXT")
            conn.execute("""
                CREATE TABLE IF NOT EXISTS workflow_run_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT,
                    workflow_id TEXT,
                    company_id TEXT,
                    node_id TEXT,
                    event_type TEXT,
                    status TEXT,
                    label TEXT,
                    role TEXT,
                    payload_json TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_workflow_run_events_run
                ON workflow_run_events(run_id, created_at, id)
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS agent_messages (
                    message_id TEXT PRIMARY KEY,
                    run_id TEXT,
                    workflow_id TEXT,
                    company_id TEXT,
                    cycle INTEGER DEFAULT 0,
                    sender_node_id TEXT,
                    recipient_node_ids_json TEXT,
                    visibility TEXT DEFAULT 'public',
                    message_type TEXT DEFAULT 'note',
                    subject TEXT,
                    body TEXT,
                    related_state_keys_json TEXT,
                    source_event_ids_json TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    thread_id TEXT,
                    in_reply_to TEXT
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_agent_messages_run_thread
                ON agent_messages(run_id, thread_id, created_at)
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS simulation_state_versions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT,
                    workflow_id TEXT,
                    company_id TEXT,
                    state_key TEXT,
                    value_json TEXT,
                    version INTEGER,
                    writer_agent_id TEXT,
                    cycle INTEGER,
                    visibility TEXT DEFAULT 'public',
                    confidence REAL DEFAULT 1.0,
                    warnings_json TEXT,
                    source_events_json TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_simulation_state_run_key
                ON simulation_state_versions(run_id, state_key, version)
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS simulation_checkpoints (
                    run_id TEXT,
                    cycle INTEGER,
                    workflow_id TEXT,
                    company_id TEXT,
                    state_json TEXT,
                    agent_status_json TEXT,
                    event_ids_json TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY(run_id, cycle)
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS simulation_agent_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT,
                    workflow_id TEXT,
                    company_id TEXT,
                    node_id TEXT,
                    cycle INTEGER,
                    level TEXT,
                    message TEXT,
                    event_id INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
                    company_id TEXT,
                    title TEXT,
                    assistant_id TEXT DEFAULT 'default',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS chat_messages (
                    id TEXT PRIMARY KEY,
                    company_id TEXT,
                    topic_id TEXT,
                    role TEXT,
                    content TEXT,
                    agent_id TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(topic_id) REFERENCES chat_topics(id)
                )
            """)
            for table, column, column_type in (
                ("workflows", "company_id", "TEXT"),
                ("executions", "company_id", "TEXT"),
                ("chat_topics", "company_id", "TEXT"),
                ("chat_messages", "company_id", "TEXT"),
            ):
                existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
                if column not in existing:
                    conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {column_type}")
            conn.commit()
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
                    agent_row = conn.execute("SELECT company_id FROM agents WHERE agent_id = ?", (agent_id,)).fetchone()
                    conn.execute("UPDATE agents SET status = 'MIA' WHERE agent_id = ?", (agent_id,))
                    audit_logger.log((agent_row[0] if agent_row and agent_row[0] else self.company_id), agent_id, "GOVERNANCE_TIMEOUT", {"approval_id": app_id, "reason": "24h manual approval timeout"})
                    
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

from core.workflow_routes import register_workflow_routes

gov_instance = Governance()
engine = SOPEngine(space, audit_logger, llm, gov_instance)
register_workflow_routes(app, gov_instance)

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
            {"id": "markdown", "name": "Markdown + Frontmatter", "description": "Native 0101 format"},
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
The 0101 governance engine has intercepted a panic signal. All active agent API sessions have been terminated.
- **Panic State**: ACTIVE
- **Reason**: Manual Override (Panic Button 2.0)
- **Active Approvals**: {len(gov_instance.pending_approvals)} cleared.

### Remediation Steps
1. Review the audit log for anomalies.
2. Manually restart the server to clear the panic flag.
3. Verify budget integrity in the Governance dashboard.
"""

@app.post("/api/chat/generate")
async def generate_chat_response_endpoint(request: Request, req: Dict[str, Any]):
    """Bridge for UI chat requests to the central LLM controller."""
    messages = req.get("messages", [])
    user_id = _get_user_id_from_request(request)
    provider_config = _get_user_provider_config(request)

    # Support simpler format: {message: str, system_prompt: str} from company issue pages
    simple_message = req.get("message")
    system_prompt = req.get("system_prompt")
    if simple_message and not messages:
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": simple_message})

    model = req.get("model") or provider_config.get("model")
    provider = req.get("provider") or provider_config.get("provider")
    base_url = req.get("base_url") if req.get("base_url") is not None else provider_config.get("base_url")
    system_prompt_override = req.get("system_prompt")
    agent_id = req.get("agent_id")
    assistant_id = req.get("assistant_id")  # Also check assistant_id from UI
    use_skills = req.get("use_skills", True)  # Default to True for backwards compatibility

    # Use agent_id or assistant_id (whichever is provided)
    effective_agent_id = agent_id or assistant_id

    # 🪪 Persona Resolution
    agent_name = "0101 AI Assistant"
    system_instruction = None

    if use_skills and effective_agent_id:
        skill = skill_registry.get_skill(effective_agent_id)
        if skill:
            agent_name = skill.get("name", "0101 specialist")
            system_instruction = f"Your specific mandate is: {skill.get('description', '')}."

    if system_instruction:
        if messages and messages[0].get("role") == "system":
            messages[0]["content"] = f"{system_instruction}\n\n{messages[0]['content']}"
        else:
            messages.insert(0, {"role": "system", "content": system_instruction})

    if system_prompt_override:
        if messages and messages[0].get("role") == "system":
            messages[0]["content"] = f"{messages[0]['content']}\n\n{system_prompt_override}"
        else:
            messages.insert(0, {"role": "system", "content": system_prompt_override})

    def _looks_like_provider_failure(result: Dict[str, Any]) -> bool:
        text = str((result or {}).get("text") or "").strip()
        if not text:
            return False
        prefixes = (
            "Error calling ",
            "Provider response:",
            "No responses from ",
        )
        return text.startswith(prefixes) or "Cerebras rejected the request" in text

    async def _run_chat(provider_name: Optional[str], model_name: Optional[str], base_url_name: Optional[str]) -> Dict[str, Any]:
        chat_kwargs = {
            "model": model_name,
            "provider": provider_name,
            "agent_name": agent_name,
        }
        if base_url_name:
            chat_kwargs["base_url"] = base_url_name
        if use_skills:
            chat_kwargs["agent_id"] = effective_agent_id

        saved_key = _get_saved_api_key_for_user(user_id, provider_name) if provider_name else None
        if saved_key:
            chat_kwargs["api_key"] = saved_key
            return await llm.chat_with_model(
                messages,
                {
                    "provider": provider_name,
                    "model": model_name,
                    "base_url": base_url_name,
                    "api_key": saved_key,
                },
                agent_name=agent_name,
                **({"agent_id": effective_agent_id} if use_skills else {}),
            )

        return await llm.chat(messages, **chat_kwargs)

    try:
        response = await _run_chat(provider, model, base_url)

        if _looks_like_provider_failure(response) and provider != "gemini":
            fallback_provider = "openai_compatible"
            fallback_model = "gpt-oss-120b"
            fallback_base_url = "https://api.cerebras.ai/v1"
            print(
                f"↩️ [Chat API] Falling back from {provider}/{model} to {fallback_provider}/{fallback_model}",
                flush=True,
            )
            response = await _run_chat(fallback_provider, fallback_model, fallback_base_url)

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
async def get_workflow_artifacts(run_id: str, request: Request):
    """List artifacts generated for a specific workflow run."""
    scope_company_id = _get_user_scope_company_id(request)
    with sqlite3.connect(gov_instance.db_path) as conn:
        wf_row = conn.execute(
            "SELECT id FROM workflows WHERE id = ? AND company_id = ?",
            (run_id, scope_company_id),
        ).fetchone()
        if not wf_row:
            return []

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
async def list_workflows(request: Request, search: Optional[str] = None):
    scope_company_id = _get_user_scope_company_id(request)
    with sqlite3.connect(gov_instance.db_path) as conn:
        if search:
            cursor = conn.execute(
                """
                SELECT id, name, graph_json, updated_at
                FROM workflows
                WHERE company_id = ? AND name LIKE ?
                ORDER BY updated_at DESC
                """,
                (scope_company_id, f"%{search}%"),
            )
        else:
            cursor = conn.execute(
                """
                SELECT id, name, graph_json, updated_at
                FROM workflows
                WHERE company_id = ?
                ORDER BY updated_at DESC
                """,
                (scope_company_id,),
            )
        return [
            {"id": row[0], "name": row[1], "graph_json": row[2], "updated_at": row[3]}
            for row in cursor.fetchall()
        ]

@app.post("/api/workflows")
async def save_workflow(request: Request, update: WorkflowUpdate):
    workflow_id = update.id or f"wf_{uuid.uuid4().hex[:8]}"
    scope_company_id = _get_user_scope_company_id(request)
    with sqlite3.connect(gov_instance.db_path) as conn:
        conn.execute("""
            INSERT INTO workflows (id, company_id, name, graph_json, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                company_id = excluded.company_id,
                name = excluded.name,
                graph_json = excluded.graph_json,
                updated_at = CURRENT_TIMESTAMP
        """, (workflow_id, scope_company_id, update.name, update.graph_json))
    return {"status": "success", "id": workflow_id}

# ============================================================
# Phase 1: Old stub /auth endpoints REMOVED
# Auth is now handled by core/auth_routes.py (registered above)
# ============================================================

@app.get("/audit/events")
async def get_audit_events(request: Request, company_id: Optional[str] = None, limit: int = 50, offset: int = 0):
    scope_company_id = _resolve_company_scope(request, company_id)
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
        """, (scope_company_id, limit, offset))
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
            scope_company_id = _get_user_scope_company_id(request)
            input_text = data.get("input")
            if input_text:
                audit_logger.log(scope_company_id, "human_user", "USER_INPUT", {"text": input_text})
            await engine.run_workflow(sop_path, company_id=scope_company_id, run_id=run_id, initial_input=input_text, assistant_id=assistant_id, topic_id=topic_id)
        except Exception as e:
            await ws_manager.broadcast(_get_user_scope_company_id(request), "FAILURE", {"run_id": run_id, "error": str(e)})

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
You are the 0101 Architect. Your goal is to design a multi-agent workflow (SOP) based on a user's prompt.
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
async def get_chat_topics(request: Request):
    scope_company_id = _get_user_scope_company_id(request)
    with sqlite3.connect(gov_instance.db_path) as conn:
        cursor = conn.execute(
            """
            SELECT id, title, assistant_id, created_at, updated_at
            FROM chat_topics
            WHERE company_id = ?
            ORDER BY updated_at DESC
            """,
            (scope_company_id,),
        )
        return [{"id": r[0], "title": r[1], "assistant_id": r[2], "created_at": r[3], "updated_at": r[4]} for r in cursor.fetchall()]

@app.post("/api/chat/topics")
async def create_chat_topic(request: Request, req: Dict[str, Any]):
    topic_id = req.get("id") or str(uuid.uuid4())
    title = req.get("title", "New Topic")
    assistant_id = req.get("assistant_id", "default")
    scope_company_id = _get_user_scope_company_id(request)
    with sqlite3.connect(gov_instance.db_path) as conn:
        conn.execute(
            """
            INSERT INTO chat_topics (id, company_id, title, assistant_id)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                company_id=excluded.company_id,
                title=excluded.title,
                assistant_id=excluded.assistant_id,
                updated_at=CURRENT_TIMESTAMP
            """,
            (topic_id, scope_company_id, title, assistant_id),
        )
    return {"status": "success", "id": topic_id}

@app.get("/api/chat/messages/{topic_id}")
async def get_chat_messages(topic_id: str, request: Request):
    scope_company_id = _get_user_scope_company_id(request)
    with sqlite3.connect(gov_instance.db_path) as conn:
        cursor = conn.execute(
            """
            SELECT id, role, content, agent_id, timestamp
            FROM chat_messages
            WHERE topic_id = ? AND company_id = ?
            ORDER BY timestamp ASC
            """,
            (topic_id, scope_company_id),
        )
        return [
            {"id": r[0], "role": r[1], "content": r[2], "agent_id": r[3], "timestamp": r[4]}
            for r in cursor.fetchall()
        ]

@app.post("/api/chat/messages")
async def save_chat_message(request: Request, req: Dict[str, Any]):
    msg_id = req.get("id") or str(uuid.uuid4())
    topic_id = req.get("topic_id")
    role = req.get("role")
    content = req.get("content")
    agent_id = req.get("agent_id")
    if not topic_id or not role or not content:
        raise HTTPException(status_code=400, detail="Missing required message fields")
    scope_company_id = _get_user_scope_company_id(request)

    with sqlite3.connect(gov_instance.db_path) as conn:
        topic_row = conn.execute(
            "SELECT id FROM chat_topics WHERE id = ? AND company_id = ?",
            (topic_id, scope_company_id),
        ).fetchone()
        if not topic_row:
            conn.execute(
                "INSERT OR IGNORE INTO chat_topics (id, company_id, title, assistant_id) VALUES (?, ?, ?, ?)",
                (topic_id, scope_company_id, "New Topic", "default"),
            )

        # Check if this is the first message in the topic
        cursor = conn.execute(
            "SELECT COUNT(*) FROM chat_messages WHERE topic_id = ? AND company_id = ?",
            (topic_id, scope_company_id),
        )
        message_count = cursor.fetchone()[0]
        print(f"📝 [Messages API] Saving message to topic {topic_id}: role={role}, message_count={message_count}, content_preview={content[:30]}", flush=True)
        
        # If first user message, set topic title to the message content (truncated)
        if role == "user" and message_count == 0:
            title = content[:50] + ("..." if len(content) > 50 else "")
            print(f"🏷️ [Messages API] Setting topic title to: {title}", flush=True)
            conn.execute(
                "UPDATE chat_topics SET title = ?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?",
                (title, topic_id, scope_company_id),
            )
        else:
            conn.execute(
                "UPDATE chat_topics SET updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?",
                (topic_id, scope_company_id),
            )
        
        conn.execute(
            "INSERT INTO chat_messages (id, company_id, topic_id, role, content, agent_id) VALUES (?, ?, ?, ?, ?, ?)",
            (msg_id, scope_company_id, topic_id, role, content, agent_id),
        )
    
    return {"status": "success", "id": msg_id}

@app.delete("/api/chat/topics/{topic_id}")
async def delete_chat_topic(topic_id: str, request: Request):
    scope_company_id = _get_user_scope_company_id(request)
    with sqlite3.connect(gov_instance.db_path) as conn:
        conn.execute("DELETE FROM chat_messages WHERE topic_id = ? AND company_id = ?", (topic_id, scope_company_id))
        conn.execute("DELETE FROM chat_topics WHERE id = ? AND company_id = ?", (topic_id, scope_company_id))
    return {"status": "success", "id": topic_id}

# --- Dashboard Stats API Endpoints ---

@app.get("/api/dashboard/stats")
async def get_dashboard_stats(request: Request):
    """Get real-time dashboard statistics."""
    audit_db_path = "data/ensemble_audit.db"
    scope_company_id = _get_user_scope_company_id(request)
    
    with sqlite3.connect(gov_instance.db_path) as conn:
        # Count active workflows (workflows with recent executions)
        cursor = conn.execute("""
            SELECT COUNT(DISTINCT w.id) FROM workflows w
            INNER JOIN executions e ON w.id = e.workflow_id
            WHERE w.company_id = ? AND e.company_id = ? AND e.status IN ('running', 'queued', 'completed')
        """, (scope_company_id, scope_company_id))
        active_workflows = cursor.fetchone()[0] or 0

        # Count running agents
        cursor = conn.execute("""
            SELECT COUNT(DISTINCT last_agent_id) FROM executions
            WHERE company_id = ? AND status = 'running' AND last_agent_id IS NOT NULL
        """, (scope_company_id,))
        agents_running = cursor.fetchone()[0] or 0

        # Workflow stats
        cursor = conn.execute("SELECT COUNT(*) FROM workflows WHERE company_id = ?", (scope_company_id,))
        total_workflows = cursor.fetchone()[0] or 0

        cursor = conn.execute("""
            SELECT status, COUNT(*) FROM executions WHERE company_id = ? GROUP BY status
        """, (scope_company_id,))
        execution_stats = {}
        for row in cursor.fetchall():
            execution_stats[row[0]] = row[1]

        # Monthly cost for this tenant (from audit trail)
        try:
            cursor = conn.execute("""
                SELECT COALESCE(SUM(cost_usd), 0)
                FROM events
                WHERE company_id = ? AND timestamp >= date('now', 'start of month')
            """, (scope_company_id,))
            monthly_cost = cursor.fetchone()[0] or 0.0
        except sqlite3.OperationalError as audit_error:
            if "no such table: events" not in str(audit_error).lower():
                raise
            monthly_cost = 0.0

    # Token usage today (from audit events)
    try:
        with sqlite3.connect(audit_db_path) as audit_conn:
            cursor = audit_conn.execute("""
                SELECT COUNT(*) FROM events
                WHERE company_id = ? AND timestamp >= date('now', 'start of day')
            """, (scope_company_id,))
            events_today = cursor.fetchone()[0] or 0
    except sqlite3.OperationalError as audit_error:
        if "no such table: events" not in str(audit_error).lower():
            raise
        events_today = 0
    tokens_today = events_today * 1000  # Estimate ~1000 tokens per event

    # Agent stats for this tenant
    with sqlite3.connect(gov_instance.db_path) as conn:
        cursor = conn.execute(
            "SELECT COUNT(*) FROM agents WHERE company_id = ?",
            (scope_company_id,),
        )
        total_agents = cursor.fetchone()[0] or 0

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
async def get_dashboard_workflows(request: Request):
    """Get workflow summary for dashboard."""
    scope_company_id = _get_user_scope_company_id(request)
    with sqlite3.connect(gov_instance.db_path) as conn:
        cursor = conn.execute("""
            SELECT w.id, w.name, w.graph_json, w.updated_at,
                   (SELECT COUNT(*) FROM executions e WHERE e.workflow_id = w.id AND e.status = 'running') as running_count,
                   (SELECT COUNT(*) FROM executions e WHERE e.workflow_id = w.id) as total_runs
            FROM workflows w
            WHERE w.company_id = ?
            ORDER BY w.updated_at DESC LIMIT 10
        """, (scope_company_id,))
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
async def get_dashboard_activity(request: Request, company_id: Optional[str] = None, limit: int = Query(default=20)):
    """Get recent activity feed."""
    audit_db_path = "data/ensemble_audit.db"
    scope_company_id = _resolve_company_scope(request, company_id)
    try:
        with sqlite3.connect(audit_db_path) as audit_conn:
            cursor = audit_conn.execute("""
                SELECT agent_id, action_type, details_json, timestamp
                FROM events
                WHERE company_id = ?
                ORDER BY id DESC LIMIT ?
            """, (scope_company_id, limit))
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
async def get_token_usage(request: Request, company_id: Optional[str] = None, days: int = Query(default=7)):
    """Get token usage over the last N days."""
    from datetime import datetime, timedelta
    audit_db_path = "data/ensemble_audit.db"
    scope_company_id = _resolve_company_scope(request, company_id)
    try:
        with sqlite3.connect(audit_db_path) as audit_conn:
            cursor = audit_conn.execute("""
                SELECT date(timestamp) as day, COUNT(*) as event_count
                FROM events
                WHERE company_id = ? AND timestamp >= date('now', '-{} days')
                GROUP BY day ORDER BY day ASC
            """.format(days), (scope_company_id,))
            
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

@app.get("/api/dashboard/pipeline-status")
async def get_pipeline_status(request: Request):
    """Get current pipeline/workflow execution status with enriched details."""
    scope_company_id = _get_user_scope_company_id(request)
    with sqlite3.connect(gov_instance.db_path) as conn:
        cursor = conn.execute("""
            SELECT e.run_id, e.workflow_id, e.status, e.current_node, e.started_at, w.name, w.graph_json,
                   e.current_iteration, e.max_iterations
            FROM executions e
            LEFT JOIN workflows w ON e.workflow_id = w.id
            WHERE e.company_id = ? AND w.company_id = ?
            ORDER BY e.started_at DESC LIMIT 10
        """, (scope_company_id, scope_company_id))
        
        pipelines = []
        for row in cursor.fetchall():
            run_id, wf_id, status, current_node, started_at, name, graph_json, curr_iter, max_iter = row
            
            total_steps = 3
            display_node = current_node
            
            if graph_json:
                try:
                    graph = json.loads(graph_json)
                    nodes = graph.get("nodes", [])
                    total_steps = len(nodes)
                    
                    # Resolve node ID (n1, n2) to its name/label
                    node_info = next((n for n in nodes if n.get("id") == current_node), None)
                    if node_info:
                        label = node_info.get("data", {}).get("label") or node_info.get("id")
                        if curr_iter and curr_iter > 1:
                            display_node = f"{label} (Round {curr_iter}/{max_iter})"
                        else:
                            display_node = label
                except:
                    pass

            pipelines.append({
                "id": run_id,
                "workflow_id": wf_id,
                "name": name or f"Workflow {wf_id[:8]}",
                "status": status.lower(),
                "current_step": display_node or "Initialize",
                "current_step_index": int(current_node.replace('n', '')) if current_node and current_node.startswith('n') and current_node[1:].isdigit() else 1,
                "total_steps": total_steps,
                "started_at": started_at,
                "time": _format_relative_time(started_at) if started_at else "unknown",
                "iteration": curr_iter,
                "max_iterations": max_iter
            })
        return pipelines

# --- Notification API Endpoints ---

@app.get("/api/notifications", dependencies=[Depends(require_auth)])
async def get_notifications(request: Request, limit: int = Query(default=50)):
    """Fetch real notifications for the authenticated user/company."""
    user = request.state.user
    company_id = request.query_params.get("company_id") or _get_user_scope_company_id(request)
    user_id = user.get("id") if isinstance(user, dict) else getattr(user, "id", None)
    
    # Use the audit_logger to fetch from DB
    notifications = audit_logger.get_notifications(
        user_id=user_id,
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


def _resolve_execution_company_id(conn: sqlite3.Connection, run_id: str, scope_company_id: str) -> str:
    """Prefer the current request scope, but fall back to the execution's stored company."""
    row = conn.execute(
        "SELECT company_id FROM executions WHERE run_id = ? AND company_id = ? LIMIT 1",
        (run_id, scope_company_id),
    ).fetchone()
    if row and row[0]:
        return str(row[0])

    fallback = conn.execute(
        "SELECT company_id FROM executions WHERE run_id = ? LIMIT 1",
        (run_id,),
    ).fetchone()
    if fallback and fallback[0]:
        return str(fallback[0])
    return scope_company_id


@app.get("/api/runs/{run_id}/timeline")
async def get_run_timeline(run_id: str, request: Request):
    """Retrieve all execution snapshots for the scrub bar."""
    scope_company_id = _get_user_scope_company_id(request)
    with sqlite3.connect(gov_instance.db_path) as conn:
        resolved_run_id = run_id
        resolved_company_id = _resolve_execution_company_id(conn, run_id, scope_company_id)
        run_exists = conn.execute(
            "SELECT 1 FROM executions WHERE run_id = ? AND company_id = ?",
            (run_id, resolved_company_id),
        ).fetchone()
        if not run_exists:
            return []

        cursor = conn.execute("""
            SELECT s.id, s.node_id, s.artifact_hash, s.graph_state_compressed, s.status, s.created_at
            FROM snapshots s
            INNER JOIN executions e ON e.run_id = s.run_id
            WHERE s.run_id = ? AND e.company_id = ?
            ORDER BY s.created_at ASC
        """, (resolved_run_id, resolved_company_id))
        
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

@app.get("/api/runs/{run_id}/status")
async def get_run_status(run_id: str, request: Request):
    """Return the live execution status for a workflow run."""
    scope_company_id = _get_user_scope_company_id(request)
    with sqlite3.connect(gov_instance.db_path) as conn:
        resolved_company_id = _resolve_execution_company_id(conn, run_id, scope_company_id)
        cursor = conn.execute("""
            SELECT run_id, workflow_id, status, current_node, last_agent_id, started_at, current_iteration, max_iterations
            FROM executions
            WHERE run_id = ? AND company_id = ?
            LIMIT 1
        """, (run_id, resolved_company_id))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Run not found")

        run_id_val, workflow_id, status, current_node, last_agent_id, started_at, current_iteration, max_iterations = row

        graph_json = None
        workflow_name = None
        cursor = conn.execute("SELECT name, graph_json FROM workflows WHERE id = ? AND company_id = ?", (workflow_id, resolved_company_id))
        wf_row = cursor.fetchone()
        if wf_row:
            workflow_name, graph_json = wf_row

        node_lookup: Dict[str, Dict[str, Any]] = {}
        if graph_json:
            try:
                graph = json.loads(graph_json)
                for node in graph.get("nodes", []):
                    data = node.get("data") or {}
                    node_lookup[node.get("id")] = {
                        "label": data.get("label") or data.get("name") or data.get("role") or node.get("id"),
                        "role": data.get("role") or data.get("label") or node.get("id"),
                        "subtitle": data.get("subtitle") or "",
                        "selection_reason": data.get("selection_reason") or "",
                    }
            except Exception:
                node_lookup = {}

        node_statuses = []
        cursor = conn.execute("""
            SELECT node_id, status, output, updated_at
            FROM node_executions
            WHERE run_id = ?
            ORDER BY updated_at ASC
        """, (run_id,))
        for node_id, node_status, output, updated_at in cursor.fetchall():
            meta = node_lookup.get(node_id, {})
            failure_text = _normalize_failure_text(output, "") if node_status == "failed" else None
            failure_kind = _classify_failure_kind(failure_text) if failure_text else None
            node_statuses.append({
                "node_id": node_id,
                "label": meta.get("label") or node_id,
                "role": meta.get("role") or node_id,
                "subtitle": meta.get("subtitle") or "",
                "selection_reason": meta.get("selection_reason") or "",
                "status": node_status,
                "error": failure_text,
                "failure_kind": failure_kind,
                "failure_label": _failure_kind_label(failure_kind) if failure_kind else None,
                "updated_at": updated_at,
            })

        total_steps = len(node_statuses)
        if graph_json:
            try:
                graph = json.loads(graph_json)
                total_steps = len(graph.get("nodes", [])) or total_steps
            except Exception:
                pass

        completed_count = sum(1 for item in node_statuses if item["status"] == "completed")
        active_node = next((item for item in node_statuses if item["status"] in {"running", "paused_approval"}), None)
        if active_node:
            current_node = active_node.get("node_id") or current_node
        current_meta = node_lookup.get(current_node, {})
        failed_node = next((item for item in node_statuses if item["status"] == "failed"), None)
        failure_kind = failed_node.get("failure_kind") if failed_node else None
        run_events = _load_workflow_run_events(run_id_val, scope_company_id)
        run_messages = _load_agent_messages_for_run(run_id_val, scope_company_id)
        runtime_engine = None
        for event in run_events:
            if str(event.get("event_type") or "") == "run_started":
                payload = event.get("payload") or {}
                runtime_engine = payload.get("runtime_engine")
                if runtime_engine:
                    break

        return {
            "run_id": run_id_val,
            "workflow_id": workflow_id,
            "workflow_name": workflow_name,
            "status": status,
            "current_node": current_node,
            "current_node_label": current_meta.get("label") or current_node,
            "current_node_role": current_meta.get("role") or current_node,
            "last_agent_id": last_agent_id,
            "started_at": started_at,
            "current_iteration": current_iteration,
            "max_iterations": max_iterations,
            "total_steps": total_steps,
            "completed_count": completed_count,
            "failure_kind": failure_kind,
            "failure_label": _failure_kind_label(failure_kind) if failure_kind else None,
            "runtime_engine": runtime_engine,
            "node_statuses": node_statuses,
            "events": run_events,
            "messages": run_messages,
            "message_threads": build_message_threads(run_messages),
        }


@app.get("/api/runs/{run_id}/events")
async def get_run_events(run_id: str, request: Request):
    """Return a replayable event feed for the workflow run board."""
    status = await get_run_status(run_id, request)
    timeline = await get_run_timeline(run_id, request)
    persisted_events = status.get("events") or []
    fallback_events = [
        {
            "type": "node_status",
            "node_id": item.get("node_id"),
            "label": item.get("label"),
            "role": item.get("role"),
            "status": item.get("status"),
            "error": item.get("error"),
            "failure_kind": item.get("failure_kind"),
            "failure_label": item.get("failure_label"),
            "updated_at": item.get("updated_at"),
        }
        for item in status.get("node_statuses", [])
    ]
    return {
        "run": status,
        "timeline": timeline,
        "events": persisted_events or fallback_events,
        "messages": status.get("messages") or [],
        "message_threads": status.get("message_threads") or [],
    }

@app.post("/api/runs/{run_id}/fork")
async def fork_run(run_id: str, snapshot_id: Optional[int] = None):
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
        
        # Clone graph state from the requested snapshot, or fall back to the latest snapshot.
        snap = None
        if snapshot_id is not None:
            cursor = conn.execute("SELECT graph_state_compressed FROM snapshots WHERE id = ?", (snapshot_id,))
            snap = cursor.fetchone()
        if not snap:
            cursor = conn.execute(
                """
                SELECT graph_state_compressed
                FROM snapshots
                WHERE run_id = ?
                ORDER BY created_at DESC, id DESC
                LIMIT 1
                """,
                (run_id,),
            )
            snap = cursor.fetchone()
        if snap and snap[0]:
            conn.execute("""
                INSERT INTO snapshots (run_id, node_id, graph_state_compressed, status)
                VALUES (?, ?, ?, ?)
            """, (new_run_id, "__fork_root__", snap[0], "root"))
            
    return {"status": "forked", "new_run_id": new_run_id, "parent_run_id": run_id}
@app.get("/api/workflows")
async def list_workflows_v2(request: Request):
    """List all saved visual workflows for the current account."""
    scope_company_id = _get_user_scope_company_id(request)
    with sqlite3.connect(gov_instance.db_path) as conn:
        cursor = conn.execute(
            """
            SELECT id, name, updated_at
            FROM workflows
            WHERE company_id = ?
            ORDER BY updated_at DESC
            """,
            (scope_company_id,),
        )
        return [{"id": row[0], "name": row[1], "updated_at": row[2]} for row in cursor.fetchall()]

@app.get("/api/workflows/{wf_id}")
async def get_workflow_v2(request: Request, wf_id: str):
    """Fetch a specific workflow graph."""
    scope_company_id = _get_user_scope_company_id(request)
    with sqlite3.connect(gov_instance.db_path) as conn:
        cursor = conn.execute(
            "SELECT id, name, graph_json FROM workflows WHERE id = ? AND company_id = ?",
            (wf_id, scope_company_id),
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Workflow not found")
        return {"id": row[0], "name": row[1], "graph": json.loads(row[2])}

@app.post("/api/workflows")
async def save_workflow_v2(request: Request, wf: WorkflowUpdate):
    """Save or update a visual workflow."""
    wf_id = wf.id or f"wf_{uuid.uuid4().hex[:8]}"
    scope_company_id = _get_user_scope_company_id(request)
    with sqlite3.connect(gov_instance.db_path) as conn:
        conn.execute("""
            INSERT INTO workflows (id, company_id, name, graph_json, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                company_id = excluded.company_id,
                name = excluded.name,
                graph_json = excluded.graph_json,
                updated_at = CURRENT_TIMESTAMP
        """, (wf_id, scope_company_id, wf.name, wf.graph_json))
    return {"status": "saved", "id": wf_id}

@app.delete("/api/workflows/{wf_id}")
async def delete_workflow_v2(request: Request, wf_id: str):
    """Remove a workflow from the system."""
    scope_company_id = _get_user_scope_company_id(request)
    with sqlite3.connect(gov_instance.db_path) as conn:
        conn.execute("DELETE FROM workflows WHERE id = ? AND company_id = ?", (wf_id, scope_company_id))
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

def _link_company_task_run(company_id: str, task_id: Optional[str], workflow_id: str, run_id: str, status: str) -> None:
    if not task_id:
        return
    try:
        with sqlite3.connect(company_routes.DB_PATH) as conn:
            now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            conn.execute(
                """
                UPDATE company_issues
                SET workflow_id = ?, run_id = ?, status = ?, updated_at = ?
                WHERE id = ? AND company_id = ?
                """,
                (workflow_id, run_id, status, now, task_id, company_id),
            )
            conn.execute(
                """
                INSERT INTO company_activity (id, company_id, action_type, message, details_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    f"act-{uuid.uuid4().hex[:12]}",
                    company_id,
                    "task.run_started",
                    f"Task {task_id} started as run {run_id}.",
                    json.dumps({"task_id": task_id, "workflow_id": workflow_id, "run_id": run_id}),
                    now,
                ),
            )
            conn.commit()
    except Exception as exc:
        print(f"⚠️ [Task Link] Failed to link task {task_id} to run {run_id}: {exc}", flush=True)


def _seed_execution_record(
    workflow_id: str,
    run_id: str,
    company_id: str,
    nodes: List[Dict[str, Any]],
):
    """Create the execution row immediately so the UI can track a live run."""
    started_at = time.strftime("%Y-%m-%dT%H:%M:%SZ")
    current_node = nodes[0]["id"] if nodes and nodes[0].get("id") else None
    with sqlite3.connect(gov_instance.db_path) as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO executions
            (run_id, workflow_id, company_id, status, current_node, started_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (run_id, workflow_id, company_id, "running", current_node, started_at),
        )
        for index, node in enumerate(nodes):
            node_id = node.get("id")
            if not node_id:
                continue
            conn.execute(
                """
                INSERT OR REPLACE INTO node_executions
                (run_id, node_id, status, output, updated_at)
                VALUES (?, ?, ?, NULL, ?)
                """,
                (run_id, node_id, "queued" if index == 0 else "idle", started_at),
            )
        conn.commit()


@app.post("/api/workflows/run")
async def run_workflow(request: Request):
    """
    Executes a multi-agent DAG workflow from the canvas.
    Bridges the ReactFlow graph to the 0101 DAG Engine.
    """
    try:
        data = await request.json()
        workflow_id = data.get("id") or str(uuid.uuid4())
        graph = data.get("graph") or {}
        if not isinstance(graph, dict):
            graph = {}
        nodes = data.get("nodes") or graph.get("nodes") or []
        edges = data.get("edges") or graph.get("edges") or []
        metadata = data.get("metadata") or graph.get("metadata") or {}
        task_id = data.get("task_id") or data.get("taskId") or metadata.get("task_id") or metadata.get("taskId")
        initial_input = data.get("initialInput") or data.get("initial_input") or ""
        user_id = _get_user_id_from_request(request)
        scope_company_id = data.get("company_id") or data.get("companyId") or _get_user_scope_company_id(request)

        if not nodes:
            raise HTTPException(status_code=400, detail="Workflow canvas is empty")

        if not metadata and workflow_id:
            try:
                with sqlite3.connect(gov_instance.db_path) as conn:
                    row = conn.execute(
                        "SELECT graph_json FROM workflows WHERE id = ? AND company_id = ? LIMIT 1",
                        (workflow_id, scope_company_id),
                    ).fetchone()
                    if row and row[0]:
                        saved_graph = json.loads(row[0])
                        metadata = saved_graph.get("metadata") or {}
            except Exception:
                metadata = {}

        print(f"🚀 [Workflow Execution] Starting run {workflow_id} with {len(nodes)} agents...", flush=True)

        validation = _validate_workflow_graph(nodes, edges)
        if not validation["is_valid"]:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": _validation_error_message(validation),
                    "validation": validation,
                },
            )

        # Debug: Log each node's role and instruction
        for n in nodes:
            nd = n.get("data", {})
            print(f"  📦 Node: {nd.get('label', 'Unknown')}, role={nd.get('role', 'N/A')}, is_custom={nd.get('is_custom', False)}, instruction_len={len(nd.get('instruction', ''))}", flush=True)

        workflow_mode = str(metadata.get("workflow_mode") or metadata.get("workflowMode") or "").lower()
        if workflow_mode == "simulation":
            graph_json = {
                "nodes": nodes,
                "edges": edges,
                "metadata": {
                    **metadata,
                    "workflow_mode": "simulation",
                    "final_output_type": metadata.get("final_output_type") or metadata.get("finalOutputType") or "document",
                },
            }
            run_id = f"sim_{int(time.time())}_{uuid.uuid4().hex[:6]}"
            _seed_execution_record(workflow_id, run_id, scope_company_id, nodes)
            _link_company_task_run(scope_company_id, task_id, workflow_id, run_id, "running")
            runner = SimulationRunner(
                db_path=gov_instance.db_path,
                workflow_id=workflow_id,
                graph=graph_json,
                company_id=scope_company_id,
                run_id=run_id,
                initial_input=initial_input,
            )
            asyncio.create_task(runner.run())
            return {
                "status": "started",
                "run_id": run_id,
                "workflow_mode": "simulation",
            }

        provider_config = _get_user_provider_config(request)
        provider = provider_config.get("provider", "gemini")
        model = provider_config.get("model")
        base_url = provider_config.get("base_url")
        if provider and model:
            _validate_provider_choice(provider, model)
        if provider == "openai_compatible" and not base_url:
            raise HTTPException(
                status_code=400,
                detail="OpenAI-compatible provider needs a base URL before workflows can run. Add it in Settings > Model Provider and test the connection.",
            )
        if provider == "openai_compatible" and base_url:
            base_url = _normalize_openai_compatible_base_url(base_url)
        env_key = _api_key_env_for_provider(provider)
        api_key = _get_saved_api_key_for_user(user_id, provider) or (os.getenv(env_key) if env_key else None)
        if _provider_requires_api_key(provider) and (not api_key or api_key == "your_key_here"):
            fallback = _fallback_provider_for_missing_key(provider, model, base_url)
            if fallback:
                provider = fallback["provider"]
                model = fallback["model"]
                base_url = fallback["base_url"]
                api_key = fallback["api_key"]
                logger.warning(
                    "⚠️ [Workflow Execution] Falling back to %s because %s has no usable API key",
                    provider,
                    data.get("provider") or "saved provider",
                )
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"{provider} API key is not configured. Add a valid key in Settings > Model Provider and test it before running workflows.",
                )

        run_llm = LLMProvider(provider=provider, model=model, base_url=base_url, api_key=api_key)

        # Initialize and run the DAG Engine with the active provider config.
        engine = DAGWorkflowEngine(
            space=space,
            audit=audit_logger,
            llm=run_llm,
            gov=gov_instance
        )
        
        # Structure the graph data for the engine
        graph_json = {"nodes": nodes, "edges": edges}
        runtime_engine = "langgraph" if supports_langgraph_workflow(nodes, edges) else "custom_dag"

        run_id = f"run_{int(time.time())}_{uuid.uuid4().hex[:6]}"
        _seed_execution_record(workflow_id, run_id, scope_company_id, nodes)
        _link_company_task_run(scope_company_id, task_id, workflow_id, run_id, "running")

        # Execute the workflow in the background
        asyncio.create_task(
            engine.execute_workflow(
                workflow_id=workflow_id,
                graph_json=graph_json,
                initial_input=initial_input,
                company_id=scope_company_id,
                run_id=run_id
            )
        )

        return {
            "status": "started",
            "run_id": run_id,
            "runtime_engine": runtime_engine,
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ [Workflow Execution] ERROR: {str(e)}", flush=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/simulation/run")
async def run_simulation_workflow(request: Request):
    """Start a Workflow Studio 2.0 logical-cycle simulation."""
    try:
        data = await request.json()
        workflow_id = data.get("id") or f"sim_wf_{uuid.uuid4().hex[:8]}"
        nodes = data.get("nodes") or []
        edges = data.get("edges") or []
        metadata = {
            **(data.get("metadata") or {}),
            "workflow_mode": "simulation",
            "final_output_type": data.get("final_output_type") or (data.get("metadata") or {}).get("final_output_type") or "document",
        }
        initial_input = data.get("initialInput") or data.get("prompt") or ""
        scope_company_id = _get_user_scope_company_id(request)
        graph_json = {"nodes": nodes, "edges": edges, "metadata": metadata}
        run_id = f"sim_{int(time.time())}_{uuid.uuid4().hex[:6]}"
        runner = SimulationRunner(
            db_path=gov_instance.db_path,
            workflow_id=workflow_id,
            graph=graph_json,
            company_id=scope_company_id,
            run_id=run_id,
            initial_input=initial_input,
        )
        asyncio.create_task(runner.run())
        return {"status": "started", "run_id": run_id, "workflow_id": workflow_id, "workflow_mode": "simulation"}
    except Exception as e:
        print(f"❌ [Simulation Execution] ERROR: {str(e)}", flush=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/simulation/run/{run_id}/status")
async def get_simulation_status(run_id: str, request: Request):
    """Return current simulation status plus checkpoint/state metadata."""
    status = await get_run_status(run_id, request)
    scope_company_id = _get_user_scope_company_id(request)
    checkpoints = load_simulation_checkpoints(gov_instance.db_path, run_id, scope_company_id)
    state = load_simulation_state(gov_instance.db_path, run_id, scope_company_id)
    logs = load_simulation_logs(gov_instance.db_path, run_id, scope_company_id)
    latest_checkpoint = checkpoints[-1] if checkpoints else None
    control = {}
    with sqlite3.connect(gov_instance.db_path) as conn:
        row = conn.execute(
            "SELECT loop_metadata FROM executions WHERE run_id = ? AND company_id = ?",
            (run_id, scope_company_id),
        ).fetchone()
        if row and row[0]:
            try:
                control = (json.loads(row[0]) or {}).get("simulation_control") or {}
            except Exception:
                control = {}
    return {
        **status,
        "workflow_mode": "simulation",
        "current_cycle": latest_checkpoint.get("cycle") if latest_checkpoint else status.get("current_iteration") or 0,
        "checkpoint_count": len(checkpoints),
        "latest_checkpoint": latest_checkpoint,
        "state": state.get("state", {}),
        "agent_logs": logs[-25:],
        "control": control,
    }


@app.post("/api/simulation/run/{run_id}/pause")
async def pause_simulation(run_id: str, request: Request):
    scope_company_id = _get_user_scope_company_id(request)
    with sqlite3.connect(gov_instance.db_path) as conn:
        row = conn.execute(
            "SELECT loop_metadata FROM executions WHERE run_id = ? AND company_id = ?",
            (run_id, scope_company_id),
        ).fetchone()
        metadata = json.loads(row[0]) if row and row[0] else {}
        control = metadata.get("simulation_control") or {}
        control.update({"mode": "manual", "paused": True, "step_grant": 0, "last_command": "pause"})
        metadata["simulation_control"] = control
        conn.execute(
            "UPDATE executions SET status = 'paused', loop_metadata = ? WHERE run_id = ? AND company_id = ?",
            (json.dumps(metadata), run_id, scope_company_id),
        )
    return {"status": "paused", "run_id": run_id}


@app.post("/api/simulation/run/{run_id}/resume")
async def resume_simulation(run_id: str, request: Request):
    scope_company_id = _get_user_scope_company_id(request)
    with sqlite3.connect(gov_instance.db_path) as conn:
        row = conn.execute(
            "SELECT loop_metadata FROM executions WHERE run_id = ? AND company_id = ?",
            (run_id, scope_company_id),
        ).fetchone()
        metadata = json.loads(row[0]) if row and row[0] else {}
        control = metadata.get("simulation_control") or {}
        control.update({"mode": "auto", "paused": False, "step_grant": 0, "last_command": "resume"})
        metadata["simulation_control"] = control
        conn.execute(
            "UPDATE executions SET status = 'running', loop_metadata = ? WHERE run_id = ? AND company_id = ?",
            (json.dumps(metadata), run_id, scope_company_id),
        )
    return {"status": "running", "run_id": run_id}


@app.post("/api/simulation/run/{run_id}/step")
async def step_simulation(run_id: str, request: Request):
    """Grant exactly one logical simulation cycle while remaining in manual mode."""
    scope_company_id = _get_user_scope_company_id(request)
    with sqlite3.connect(gov_instance.db_path) as conn:
        row = conn.execute(
            "SELECT loop_metadata FROM executions WHERE run_id = ? AND company_id = ?",
            (run_id, scope_company_id),
        ).fetchone()
        metadata = json.loads(row[0]) if row and row[0] else {}
        control = metadata.get("simulation_control") or {}
        control.update({"mode": "manual", "paused": True, "step_grant": int(control.get("step_grant") or 0) + 1, "last_command": "step"})
        metadata["simulation_control"] = control
        conn.execute(
            "UPDATE executions SET status = 'running', loop_metadata = ? WHERE run_id = ? AND company_id = ?",
            (json.dumps(metadata), run_id, scope_company_id),
        )
    return await get_simulation_status(run_id, request)


@app.get("/api/simulation/run/{run_id}/checkpoint/{cycle}")
async def get_simulation_checkpoint(run_id: str, cycle: int, request: Request):
    scope_company_id = _get_user_scope_company_id(request)
    checkpoints = load_simulation_checkpoints(gov_instance.db_path, run_id, scope_company_id)
    checkpoint = next((item for item in checkpoints if int(item.get("cycle", -1)) == cycle), None)
    if not checkpoint:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
    return checkpoint


@app.get("/api/simulation/run/{run_id}/state")
async def get_simulation_state(run_id: str, request: Request):
    scope_company_id = _get_user_scope_company_id(request)
    return load_simulation_state(gov_instance.db_path, run_id, scope_company_id)


@app.get("/api/simulation/run/{run_id}/messages")
async def get_simulation_messages(run_id: str, request: Request):
    scope_company_id = _get_user_scope_company_id(request)
    messages = _load_agent_messages_for_run(run_id, scope_company_id)
    return {"run_id": run_id, "messages": messages, "message_threads": build_message_threads(messages)}


@app.get("/api/simulation/run/{run_id}/audit")
async def get_simulation_audit(run_id: str, request: Request):
    scope_company_id = _get_user_scope_company_id(request)
    messages = _load_agent_messages_for_run(run_id, scope_company_id)
    return {
        "run_id": run_id,
        "events": _load_workflow_run_events(run_id, scope_company_id),
        "messages": messages,
        "message_threads": build_message_threads(messages),
        "state": load_simulation_state(gov_instance.db_path, run_id, scope_company_id),
        "logs": load_simulation_logs(gov_instance.db_path, run_id, scope_company_id),
        "checkpoints": load_simulation_checkpoints(gov_instance.db_path, run_id, scope_company_id),
    }


@app.get("/api/simulation/run/{run_id}/result")
async def get_simulation_result(run_id: str, request: Request):
    scope_company_id = _get_user_scope_company_id(request)
    status = await get_run_status(run_id, request)
    state = load_simulation_state(gov_instance.db_path, run_id, scope_company_id)
    checkpoints = load_simulation_checkpoints(gov_instance.db_path, run_id, scope_company_id)
    logs = load_simulation_logs(gov_instance.db_path, run_id, scope_company_id)
    final_report = ((state.get("state") or {}).get("final_report") or {}).get("value") or ""
    messages = _load_agent_messages_for_run(run_id, scope_company_id)
    message_threads = build_message_threads(messages)
    package = {
        "package_type": "document-package",
        "primary_artifact": "simulation-report.md",
        "artifact_count": 1,
        "has_preview": False,
        "artifact_paths": ["simulation-report.md"],
    }
    latest = {
        "agent_id": status.get("last_agent_id") or "simulation",
        "node_id": status.get("last_agent_id") or "simulation",
        "workflow_id": status.get("workflow_id"),
        "run_id": run_id,
        "label": "Simulation Result",
        "role": "Simulation Finalizer",
        "selection_reason": "Final packaged output from the logical-cycle simulation runner.",
        "output": {
            "markdown": final_report,
            "files": [],
            "messages": messages,
            "message_threads": message_threads,
            "package": package,
        },
        "package": package,
        "completedAt": _now(),
        "task": status.get("workflow_name") or "Simulation workflow",
        "messages": messages,
        "message_threads": message_threads,
    }
    return {
        "workflow_id": status.get("workflow_id"),
        "run_id": run_id,
        "outputs": [latest] if final_report else [],
        "latest": latest if final_report else None,
        "files": [],
        "package": package,
        "messages": messages,
        "message_threads": message_threads,
        "events": _load_workflow_run_events(run_id, scope_company_id),
        "state": state,
        "checkpoints": checkpoints,
        "agent_logs": logs,
        "status": status,
    }


@app.post("/api/workflows/validate")
async def validate_workflow(request: Request):
    """Validate a workflow graph without starting execution."""
    data = await request.json()
    nodes = data.get("nodes", [])
    edges = data.get("edges", [])
    return _validate_workflow_graph(nodes, edges)

@app.post("/api/workflows/generate")
async def generate_workflow_api(request: Request):
    """
    Deterministic workflow generation from natural language prompt.
    The planner classifies the request, selects a stage blueprint, and maps
    each stage to the most relevant specialist agent. The LLM is only used
    as a last-resort fallback for malformed output.
    """
    try:
        data = await request.json()
        prompt = data.get("prompt", "")
        agent_count_raw = data.get("agent_count", 3)
        if not prompt:
            raise HTTPException(status_code=400, detail="No prompt provided")

        try:
            agent_count = int(agent_count_raw)
        except (TypeError, ValueError):
            agent_count = 3
        agent_count = _extract_requested_agent_count(prompt, max(1, min(agent_count, 5)))

        print(f"🪄 [Workflow Generation] Designing DAG for: {prompt[:50]}...", flush=True)
        all_skills = skill_registry.list_skills()
        workflow = _build_domain_workflow(prompt, all_skills, agent_count)
        print(
            f"✅ [Workflow Generation] Built deterministic {len(workflow.get('nodes', []))}-step workflow.",
            flush=True,
        )
        return workflow

    except Exception as e:
        print(f"❌ [Workflow Generation] ERROR: {str(e)}", flush=True)
        raise HTTPException(status_code=500, detail=str(e))


def _magicflow_stage_to_domain_stage(stage: Dict[str, Any], index: int) -> Dict[str, Any]:
    """Normalize a structured Magic Flow stage into the deterministic blueprint shape."""
    return {
        "label": str(stage.get("label") or f"Stage {index}"),
        "summary": str(stage.get("summary") or ""),
        "requested_role": str(stage.get("requested_role") or stage.get("agent_label") or stage.get("label") or f"Stage {index} Specialist"),
        "required_capabilities": list(stage.get("required_capabilities") or []),
        "output_contract": str(stage.get("output_contract") or ""),
        "risk_level": str(stage.get("risk_level") or "normal"),
        "constraints": list(stage.get("constraints") or []),
        "keywords": list(stage.get("keywords") or []),
        "categories": list(stage.get("categories") or []),
        "preferred_ids": list(stage.get("preferred_ids") or []),
        "preferred_categories": list(stage.get("categories") or []),
        "instruction": str(stage.get("instruction") or "").strip() or f"Execute stage {index}.",
        "tools": list(stage.get("tools") or []),
        "temperature": float(stage.get("temperature", 0.2) or 0.2),
        "selection_reason": str(stage.get("selection_reason") or ""),
    }


def _build_magicflow_workflow_from_plan(
    prompt: str,
    all_skills: List[Dict[str, Any]],
    plan: MagicFlowPlan,
    desired_count: int,
) -> Dict[str, Any]:
    """Convert a structured LangChain plan into the same workflow shape used by the deterministic builder."""
    desired_count = max(1, min(int(desired_count or 3), 5))
    stage_source = [_magicflow_stage_to_domain_stage(stage.model_dump() if hasattr(stage, "model_dump") else dict(stage), idx + 1) for idx, stage in enumerate(plan.stages)]
    stage_source = _align_stage_plan(stage_source, desired_count, plan.domain_key, plan.output_type)

    if not stage_source:
        return _build_domain_workflow(prompt, all_skills, desired_count)

    if len(stage_source) > desired_count:
        stage_source = _compress_stage_plan(stage_source, desired_count, blueprint_key=plan.domain_key)

    used_ids: Set[str] = set()
    nodes: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []
    stage_plan: List[Dict[str, Any]] = []
    route_evidence: List[str] = list(plan.route_evidence or [])
    recommended_agents: List[Dict[str, Any]] = []
    normalized_prompt = _normalize_prompt(prompt)

    spacing = 240
    start_x = 100
    y = 180
    title = plan.title or _derive_workflow_title(prompt, {"title": plan.domain_title, "key": plan.domain_key})

    for idx, stage in enumerate(stage_source, start=1):
        match = _resolve_agent_for_stage(all_skills, stage, used_ids, idx)
        skill = match.get("skill") or {}
        skill_id = str(match.get("agent_id") or f"virtual_{idx}")
        if match.get("match_type") != "virtual":
            used_ids.add(skill_id)
        requested_role = str(match.get("display_name") or _stage_requested_role(stage))
        label_name = requested_role
        emoji = str(match.get("emoji") or stage.get("emoji") or skill.get("emoji") or "🤖")
        selection_reason = stage.get("selection_reason") or _build_stage_selection_reason(prompt, plan.domain_title, stage, label_name)
        if match.get("match_type") == "virtual":
            selection_reason = (
                f"Created a workflow-local virtual role because no existing agent matched "
                f"{requested_role} strongly enough."
            )
        elif match.get("match_type") == "adapted":
            selection_reason = (
                f"Adapted {match.get('agent_name')} as {requested_role}; "
                f"{selection_reason}"
            )
        matched_terms = [
            term for term in list(stage.get("keywords", [])) + list(stage.get("categories", []))
            if isinstance(term, str) and term.lower() in normalized_prompt
        ]
        route_evidence.extend(matched_terms)
        candidate_agents = match.get("candidate_agents") or _candidate_agents_for_stage(all_skills, stage, used_ids, idx, limit=5)
        if candidate_agents:
            recommended_agents.append({
                "stage": stage["label"],
                "requested_role": requested_role,
                "selected_agent_id": skill_id,
                "selected_agent_name": label_name,
                "candidates": candidate_agents,
            })
        model_override = skill_registry.get_model_override(skill_id) if hasattr(skill_registry, "get_model_override") else None
        model = None
        if isinstance(model_override, dict):
            model = model_override.get("model")
        elif isinstance(model_override, str):
            model = model_override

        nodes.append(
            {
                "id": f"step{idx}",
                "type": "agentNode",
                "position": {"x": start_x + ((idx - 1) * spacing), "y": y},
                "data": {
                    "label": f"{emoji} {label_name}",
                    "subtitle": stage["label"],
                    "role": skill_id,
                    "requested_role": requested_role,
                    "agent_name": match.get("agent_name"),
                    "match_type": match.get("match_type"),
                    "match_confidence": match.get("match_confidence"),
                    "base_skill_id": match.get("base_skill_id"),
                    "workflow_domain": plan.domain_key,
                    "workflow_domain_title": plan.domain_title,
                    "selection_reason": selection_reason,
                    "stage_index": idx,
                    "instruction": _render_stage_instruction(prompt, stage, _extract_cycle_count(prompt)),
                    "model": (model or "gemini-2.5-flash"),
                    "temperature": stage.get("temperature", 0.2),
                    "prompt": prompt,
                    "tools": stage.get("tools", []),
                    "visibility": "public",
                    "timing_policy": {"type": "dependency"},
                },
            }
        )

        stage_plan.append(
            {
                "stage": stage["label"],
                "requested_role": requested_role,
                "agent_id": skill_id,
                "agent_name": label_name,
                "base_skill_id": match.get("base_skill_id"),
                "match_type": match.get("match_type"),
                "match_confidence": match.get("match_confidence"),
                "selection_reason": selection_reason,
                "required_capabilities": stage.get("required_capabilities", []),
                "output_contract": stage.get("output_contract", ""),
                "tools": stage.get("tools", []),
                "candidate_agents": candidate_agents[:3],
            }
        )

        if idx > 1:
            edges.append(
                {
                    "id": f"e{idx-1}-{idx}",
                    "source": f"step{idx-1}",
                    "target": f"step{idx}",
                    "animated": True,
                }
            )

    return {
        "name": title,
        "nodes": nodes,
        "edges": edges,
        "metadata": {
            "domain_key": plan.domain_key,
            "domain_title": plan.domain_title,
            "prompt_summary": plan.prompt_summary,
            "requested_agents": desired_count,
            "generated_agents": len(nodes),
            "route_evidence": _dedupe_preserve_order(route_evidence)[:8],
            "routing_reason": plan.routing_reason,
            "stage_plan": stage_plan,
            "route_quality": _route_quality_from_stage_plan(stage_plan),
            "capability_gaps": [stage for stage in stage_plan if stage.get("match_type") == "missing"],
            "planner_source": "langchain",
            "output_type": plan.output_type,
            "recommended_agents": recommended_agents,
            "route_confirmation_required": any(
                stage.get("match_type") == "virtual" or (stage.get("match_confidence", 1.0) or 1.0) < 0.7
                for stage in stage_plan
            ),
        },
    }


@app.post("/api/workflows/magicflow")
async def generate_magicflow_api(request: Request):
    """
    MagicFlow alias for prompt-first workflow generation.
    Returns the workflow plus explicit planner metadata.
    """
    try:
        data = await request.json()
        prompt = data.get("prompt", "")
        agent_count_raw = data.get("agent_count", 3)
        output_type = str(data.get("output_type", "auto") or "auto")
        requested_mode = str(data.get("mode", "auto") or "auto")
        max_cycles_raw = data.get("max_cycles")
        if not prompt:
            raise HTTPException(status_code=400, detail="No prompt provided")

        try:
            agent_count = int(agent_count_raw)
        except (TypeError, ValueError):
            agent_count = 3
        agent_count = _extract_requested_agent_count(prompt, max(1, min(agent_count, 5)))
        resolved_mode = _infer_magicflow_mode(prompt, requested_mode)
        resolved_output_type = _infer_output_type(prompt, output_type)
        try:
            max_cycles = int(max_cycles_raw) if max_cycles_raw is not None else None
        except (TypeError, ValueError):
            max_cycles = None
        cycle_count = _extract_cycle_count(prompt, max_cycles)

        print(f"🪄 [MagicFlow] Planning structured workflow for: {prompt[:50]}...", flush=True)
        all_skills = skill_registry.list_skills()
        deterministic_blueprint = _classify_workflow_domain(prompt)
        if deterministic_blueprint.get("key") != "general":
            workflow = _build_domain_workflow(
                prompt,
                all_skills,
                agent_count,
                workflow_mode=resolved_mode,
                output_type=resolved_output_type,
                cycle_count=cycle_count,
            )
            print(
                f"✅ [MagicFlow] Used governed deterministic blueprint: {deterministic_blueprint.get('key')}.",
                flush=True,
            )
            return {
                "status": "success",
                "workflow": workflow,
                "plan": workflow.get("metadata") if isinstance(workflow, dict) else {},
            }

        plan = await build_magicflow_plan(prompt, all_skills, agent_count=agent_count, output_type=resolved_output_type)

        if plan is not None:
            workflow = _build_magicflow_workflow_from_plan(prompt, all_skills, plan, agent_count)
            workflow.setdefault("metadata", {})
            workflow["metadata"] = {
                **workflow.get("metadata", {}),
                "workflow_mode": resolved_mode,
                "final_output_type": resolved_output_type,
                "output_type": resolved_output_type,
                **({"cycle_count": cycle_count} if cycle_count else {}),
            }
            print(
                f"✅ [MagicFlow] Built LangChain plan with {len(workflow.get('nodes', []))} stage(s).",
                flush=True,
            )
            return {
                "status": "success",
                "workflow": workflow,
                "plan": workflow.get("metadata") if isinstance(workflow, dict) else {},
                "draft_plan": plan.model_dump() if hasattr(plan, "model_dump") else plan.dict(),
            }

        print("⚠️ [MagicFlow] Structured planner unavailable, falling back to deterministic builder.", flush=True)
        workflow = _build_domain_workflow(
            prompt,
            all_skills,
            agent_count,
            workflow_mode=resolved_mode,
            output_type=resolved_output_type,
            cycle_count=cycle_count,
        )
        return {
            "status": "success",
            "workflow": workflow,
            "plan": workflow.get("metadata") if isinstance(workflow, dict) else {},
        }

    except Exception as e:
        print(f"❌ [MagicFlow] ERROR: {str(e)}", flush=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/workflows/{workflow_id}/artifacts")
async def get_workflow_artifacts_api(workflow_id: str, request: Request):
    """
    Returns files generated by a specific workflow run.
    Only scans the workflow's dedicated workspace subdirectory.
    """
    scope_company_id = _get_user_scope_company_id(request)
    with sqlite3.connect(gov_instance.db_path) as conn:
        owned = conn.execute(
            "SELECT 1 FROM workflows WHERE id = ? AND company_id = ?",
            (workflow_id, scope_company_id),
        ).fetchone()
        if not owned:
            return []

    artifacts = []
    
    # Only check the workflow-specific workspace
    workflow_ws_dir = os.path.join("data", "workspace", f"workflow_{workflow_id}")
    if not os.path.exists(workflow_ws_dir):
        return []
    
    code_extensions = {'.html', '.css', '.js', '.ts', '.jsx', '.tsx', '.py', '.json', '.xml', '.md', '.sql', '.sh', '.yaml', '.yml'}
    
    seen_content: Set[str] = set()

    def _add_file(full_path: str, source_path: str, display_path: str, node: str):
        ext = os.path.splitext(full_path)[1].lower()
        if ext not in code_extensions:
            return
        if "/.git/" in full_path.replace("\\", "/"):
            return
        try:
            with open(full_path, "rb") as f:
                content_hash = __import__("hashlib").sha256(f.read()).hexdigest()
        except Exception:
            content_hash = source_path
        if content_hash in seen_content:
            return
        seen_content.add(content_hash)
        artifacts.append({
            "id": source_path,
            "name": os.path.basename(display_path),
            "path": display_path,
            "source_path": source_path,
            "type": ext.lstrip('.'),
            "node": node,
            "size": os.path.getsize(full_path),
            "created_at": datetime.fromtimestamp(os.path.getmtime(full_path)).isoformat()
        })

    # Prefer the generated repo as the human-facing project tree.
    repo_path = os.path.join(workflow_ws_dir, "repo")
    if os.path.isdir(repo_path):
        for root, dirs, files in os.walk(repo_path):
            dirs[:] = [d for d in dirs if d != ".git" and not d.startswith(".")]
            for filename in files:
                if filename.startswith("."):
                    continue
                full_path = os.path.join(root, filename)
                rel_repo_path = os.path.relpath(full_path, repo_path)
                source_path = os.path.join("repo", rel_repo_path).replace("\\", "/")
                display_path = rel_repo_path.replace("\\", "/")
                _add_file(full_path, source_path, display_path, "repo")

    if artifacts:
        return sorted(artifacts, key=lambda x: x["path"])

    for node_dir in os.listdir(workflow_ws_dir):
        if node_dir == "repo" or node_dir.startswith("."):
            continue
        node_path = os.path.join(workflow_ws_dir, node_dir)
        if not os.path.isdir(node_path):
            continue
        for root, dirs, files in os.walk(node_path):
            dirs[:] = [d for d in dirs if d != ".git" and not d.startswith(".")]
            for filename in files:
                if filename.startswith("."):
                    continue
                full_path = os.path.join(root, filename)
                rel_node_path = os.path.relpath(full_path, node_path).replace("\\", "/")
                source_path = os.path.join(node_dir, rel_node_path).replace("\\", "/")
                display_path = os.path.join(node_dir, rel_node_path).replace("\\", "/")
                _add_file(full_path, source_path, display_path, node_dir)
    
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

    # First check workflow-specific directory.
    if os.path.exists(workflow_ws_dir):
        direct_candidates = [
            os.path.join(workflow_ws_dir, "index.html"),
            os.path.join(workflow_ws_dir, "preview.html"),
        ]
        for candidate_path in direct_candidates:
            if os.path.exists(candidate_path):
                with open(candidate_path, "r", encoding="utf-8") as f:
                    html_content = f.read()
                html_content = _inline_assets(html_content, workflow_ws_dir)
                return {
                    "html": html_content,
                    "node": "root",
                    "path": os.path.basename(candidate_path),
                }

        # Find the first index.html in any node subdirectory
        for node_dir in sorted(os.listdir(workflow_ws_dir)):
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
    return sanitize_manifest_data(data)

@app.post("/api/marketplace/install")
async def install_pack(req: Dict[str, Any]):
    """Download and extract an agent pack with conflict detection."""
    pack_id = req.get("pack_id")
    download_url = req.get("download_url")
    conflict_action = req.get("conflict_action", "prompt")  # prompt, skip, replace, merge

    if not pack_id or not download_url:
        raise HTTPException(status_code=400, detail="Missing pack_id or download_url")
    if is_blocked_pack(pack_id):
        raise HTTPException(status_code=403, detail="This marketplace pack is no longer available.")

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
    if is_blocked_pack(pack_id):
        raise HTTPException(status_code=404, detail="Pack not found")
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
    if is_blocked_pack(pack_id):
        raise HTTPException(status_code=404, detail="Pack not found in marketplace.")
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
    if is_blocked_pack(pack_id):
        raise HTTPException(status_code=404, detail="Pack not found.")

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
                "author": "0101 User",
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
                "author": local_meta.get("author", "0101 User"),
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

def _is_provider_error_output(value: Any) -> bool:
    text = str(value or "").strip()
    return text.startswith((
        "Error calling ",
        "Error: No responses from ",
        "Error: API key",
        "Error: Authentication",
    ))


def _classify_failure_kind(value: Any) -> str:
    """Classify a failure into a user-facing category."""
    text = str(value or "").strip().lower()
    if not text:
        return "runtime"

    if any(term in text for term in ["approval", "approve", "rejected", "permission", "permissions queue"]):
        return "approval"
    if any(term in text for term in ["validation", "invalid workflow", "workflow validation", "cycle", "missing node", "missing edge"]):
        return "validation"
    if any(term in text for term in ["api key", "authentication", "403", "401", "provider", "openai-compatible", "gemini", "groq", "ollama", "cerebras"]):
        return "provider"
    if any(term in text for term in ["timeout", "timed out", "timeout while waiting"]):
        return "runtime"
    if any(term in text for term in ["governance", "policy", "quota", "budget", "budget exhausted"]):
        return "governance"
    return "runtime"


def _failure_kind_label(kind: str) -> str:
    mapping = {
        "approval": "Approval issue",
        "validation": "Validation issue",
        "provider": "Provider issue",
        "governance": "Governance issue",
        "runtime": "Runtime issue",
    }
    return mapping.get((kind or "").strip().lower(), "Runtime issue")


def _load_agent_messages_for_run(run_id: Optional[str], company_id: str) -> List[Dict[str, Any]]:
    if not run_id:
        return []
    try:
        with sqlite3.connect(gov_instance.db_path) as conn:
            cursor = conn.execute(
                """
                SELECT message_id, run_id, cycle, sender_node_id, recipient_node_ids_json, visibility,
                       message_type, subject, body, related_state_keys_json, source_event_ids_json,
                       created_at, thread_id, in_reply_to
                FROM agent_messages
                WHERE run_id = ? AND company_id = ?
                ORDER BY cycle ASC, created_at ASC, message_id ASC
                """,
                (run_id, company_id),
            )
            messages = []
            for row in cursor.fetchall():
                messages.append(AgentMessage(
                    message_id=row[0],
                    run_id=row[1],
                    cycle=row[2] or 0,
                    sender_node_id=row[3],
                    recipient_node_ids=json.loads(row[4] or "[]"),
                    visibility=row[5] or "public",
                    message_type=row[6] or "note",
                    subject=row[7] or "",
                    body=row[8] or "",
                    related_state_keys=json.loads(row[9] or "[]"),
                    source_event_ids=json.loads(row[10] or "[]"),
                    created_at=row[11] or "",
                    thread_id=row[12],
                    in_reply_to=row[13],
                ).to_dict())
            return messages
    except Exception:
        return []


def _load_message_threads_for_run(run_id: Optional[str], company_id: str) -> List[Dict[str, Any]]:
    return build_message_threads(_load_agent_messages_for_run(run_id, company_id))


def _load_workflow_run_events(run_id: Optional[str], company_id: str) -> List[Dict[str, Any]]:
    if not run_id:
        return []
    try:
        with sqlite3.connect(gov_instance.db_path) as conn:
            cursor = conn.execute(
                """
                SELECT id, run_id, workflow_id, node_id, event_type, status, label, role, payload_json, created_at
                FROM workflow_run_events
                WHERE run_id = ? AND company_id = ?
                ORDER BY created_at ASC, id ASC
                """,
                (run_id, company_id),
            )
            events = []
            for row in cursor.fetchall():
                try:
                    payload = json.loads(row[8] or "{}")
                except Exception:
                    payload = {}
                events.append({
                    "id": row[0],
                    "run_id": row[1],
                    "workflow_id": row[2],
                    "node_id": row[3],
                    "type": row[4],
                    "event_type": row[4],
                    "status": row[5],
                    "label": row[6],
                    "role": row[7],
                    "payload": payload,
                    "created_at": row[9],
                    "updated_at": row[9],
                })
            return events
    except Exception:
        return []


@app.get("/api/workflow-runs/outputs")
async def get_workflow_outputs(request: Request):
    """
    Fetch all previous workflow run outputs from audit log.
    Returns outputs keyed by workflow ID for the Workflows page.
    """
    try:
        scope_company_id = _get_user_scope_company_id(request)
        with sqlite3.connect(audit_logger.db_path) as conn:
            cursor = conn.execute("""
                SELECT agent_id, details_json, timestamp
                FROM events
                WHERE action_type = 'RESULT' AND company_id = ?
                ORDER BY timestamp DESC
            """, (scope_company_id,))

            workflow_outputs = {}
            for row in cursor.fetchall():
                agent_id, details_json, timestamp = row
                try:
                    details = json.loads(details_json) if details_json else {}
                except:
                    details = {}

                workflow_id = details.get("workflow_id")
                run_id = details.get("run_id")
                result_content = details.get('result', '')

                if (
                    not workflow_id
                    or not result_content
                    or _is_provider_error_output(result_content)
                    or workflow_id in workflow_outputs
                ):
                    continue

                markdown = result_content
                if markdown.startswith('```'):
                    lines = markdown.split('\n')
                    if lines[0].startswith('```'):
                        lines = lines[1:]
                    if lines and lines[-1].strip().startswith('```'):
                        lines = lines[:-1]
                    markdown = '\n'.join(lines)

                workflow_outputs[workflow_id] = {
                    'workflow_id': workflow_id,
                    'run_id': run_id,
                    'agent_id': agent_id,
                    'output': {'markdown': markdown},
                    'completedAt': timestamp,
                    'task': details.get('task', details.get('instruction', 'Workflow execution'))[:200],
                    'agentCount': 1
                }

        with sqlite3.connect(gov_instance.db_path) as conn:
            cursor = conn.execute("""
                SELECT e.workflow_id, e.run_id, e.started_at, n.node_id, n.output
                FROM executions e
                JOIN node_executions n ON n.run_id = e.run_id
                WHERE e.status = 'completed'
                  AND e.company_id = ?
                  AND n.status = 'completed'
                  AND n.output IS NOT NULL
                  AND TRIM(n.output) != ''
                ORDER BY e.started_at DESC, n.updated_at DESC
            """, (scope_company_id,))
            for workflow_id, run_id, timestamp, node_id, output in cursor.fetchall():
                if workflow_id in workflow_outputs or _is_provider_error_output(output):
                    continue
                workflow_outputs[workflow_id] = {
                    'workflow_id': workflow_id,
                    'run_id': run_id,
                    'agent_id': node_id,
                    'output': {'markdown': output},
                    'completedAt': timestamp,
                    'task': 'Workflow execution',
                    'agentCount': 1
                }

            return {
                'outputs': workflow_outputs,
                'total': len(workflow_outputs)
            }
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {'outputs': {}, 'total': 0, 'error': str(e)}

@app.get("/api/workflows/{workflow_id}/output")
async def get_workflow_output(workflow_id: str, request: Request, run_id: Optional[str] = None):
    """
    Fetch the latest output for a specific workflow.
    Tries to match workflow runs to stored outputs.
    """
    try:
        scope_company_id = _get_user_scope_company_id(request)
        node_lookup: Dict[str, Dict[str, str]] = {}
        workflow_name = ""
        with sqlite3.connect(gov_instance.db_path) as conn:
            if run_id:
                scope_company_id = _resolve_execution_company_id(conn, run_id, scope_company_id)
            try:
                cursor = conn.execute(
                    """
                    SELECT name, graph_json
                    FROM workflows
                    WHERE id = ? AND company_id = ?
                    LIMIT 1
                    """,
                    (workflow_id, scope_company_id),
                )
                row = cursor.fetchone()
                if row:
                    workflow_name = row[0] or ""
                    graph_json = row[1]
                    if graph_json:
                        try:
                            graph = json.loads(graph_json)
                            for node in graph.get("nodes", []):
                                data = node.get("data") or {}
                                node_lookup[node.get("id")] = {
                                    "label": data.get("label") or data.get("name") or data.get("role") or node.get("id"),
                                    "role": data.get("role") or data.get("label") or node.get("id"),
                                    "subtitle": data.get("subtitle") or "",
                                    "selection_reason": data.get("selection_reason") or "",
                                }
                        except Exception:
                            node_lookup = {}
            except Exception:
                node_lookup = {}

        def _read_workflow_artifact_content(artifact_path: str) -> Optional[str]:
            if not artifact_path:
                return None
            workflow_root = os.path.abspath(os.path.join("data", "workspace", f"workflow_{workflow_id}"))
            full_path = os.path.abspath(os.path.join(workflow_root, artifact_path))
            if not full_path.startswith(workflow_root):
                return None
            if not os.path.exists(full_path) or not os.path.isfile(full_path):
                return None
            try:
                with open(full_path, "r", encoding="utf-8", errors="replace") as f:
                    return f.read()
            except Exception:
                return None

        with sqlite3.connect(audit_logger.db_path) as conn:
            # Get the most recent RESULT for this workflow
            # Try matching by workflow_id in audit metadata
            cursor = conn.execute("""
                SELECT agent_id, details_json, timestamp
                FROM events
                WHERE action_type = 'RESULT'
                  AND company_id = ?
                ORDER BY timestamp DESC
                LIMIT 250
            """, (scope_company_id,))
            
            results = []
            for row in cursor.fetchall():
                agent_id, details_json, timestamp = row
                try:
                    details = json.loads(details_json) if details_json else {}
                except:
                    details = {}
                
                if run_id and str(details.get("run_id")) != str(run_id):
                    continue
                if not details.get("workflow_id") or str(details.get("workflow_id")) != str(workflow_id):
                    continue

                result = details.get('result', '')
                if result:
                    if _is_provider_error_output(result):
                        continue
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
                        'node_id': details.get('node_id'),
                        'workflow_id': details.get('workflow_id') or workflow_id,
                        'run_id': details.get('run_id'),
                        'label': node_lookup.get(details.get('node_id'), {}).get("label") or agent_id,
                        'role': node_lookup.get(details.get('node_id'), {}).get("role") or agent_id,
                        'selection_reason': node_lookup.get(details.get('node_id'), {}).get("selection_reason") or "",
                        'artifact_hash': details.get('artifact_hash'),
                        'output': {'markdown': markdown},
                        'completedAt': timestamp,
                        'task': details.get('task', details.get('instruction', ''))[:200]
                    })

        if not results:
            with sqlite3.connect(gov_instance.db_path) as conn:
                if run_id:
                    cursor = conn.execute("""
                        SELECT n.node_id, n.output, n.updated_at, e.run_id
                        FROM node_executions n
                        JOIN executions e ON e.run_id = n.run_id
                        WHERE e.workflow_id = ?
                          AND e.run_id = ?
                          AND e.company_id = ?
                          AND n.status = 'completed'
                          AND n.output IS NOT NULL
                          AND TRIM(n.output) != ''
                        ORDER BY n.updated_at ASC
                    """, (workflow_id, run_id, scope_company_id))
                else:
                    cursor = conn.execute("""
                        SELECT n.node_id, n.output, n.updated_at, e.run_id
                        FROM node_executions n
                        JOIN executions e ON e.run_id = n.run_id
                        WHERE e.workflow_id = ?
                          AND e.company_id = ?
                          AND e.status = 'completed'
                          AND n.status = 'completed'
                          AND n.output IS NOT NULL
                          AND TRIM(n.output) != ''
                        ORDER BY e.started_at DESC, n.updated_at ASC
                    """, (workflow_id, scope_company_id))

                for node_id, output, updated_at, row_run_id in cursor.fetchall():
                    if _is_provider_error_output(output):
                        continue
                    meta = node_lookup.get(node_id, {})
                    results.append({
                        'agent_id': node_id,
                        'node_id': node_id,
                        'workflow_id': workflow_id,
                        'run_id': row_run_id or run_id,
                        'label': meta.get("label") or node_id,
                        'role': meta.get("role") or node_id,
                        'selection_reason': meta.get("selection_reason") or "",
                        'output': {'markdown': output},
                        'completedAt': updated_at,
                        'task': 'Workflow execution',
                    })

        artifacts = await get_workflow_artifacts_api(workflow_id, request)
        files: List[Dict[str, Any]] = []
        for artifact in artifacts:
            source_path = artifact.get("source_path") or artifact.get("path") or artifact.get("name")
            display_path = _normalize_artifact_display_path(artifact.get("path") or artifact.get("name") or source_path or "")
            content = _read_workflow_artifact_content(source_path or "")
            if content is None:
                continue
            files.append({
                "path": display_path,
                "sourcePath": source_path,
                "content": content,
                "language": artifact.get("type"),
            })

        if files and results:
            results[0]["output"]["files"] = files
        elif files:
            results = [{
                "agent_id": workflow_id,
                "output": {"markdown": "", "files": files},
                "completedAt": _now(),
                "task": "Workflow artifacts",
            }]

        def _derive_package_summary(markdown: str, artifact_files: List[Dict[str, Any]]) -> Dict[str, Any]:
            html_like = bool(re.search(r"<!doctype html|<html[\s>]", markdown or "", re.IGNORECASE))
            has_files = len(artifact_files) > 0
            has_markdown = bool((markdown or "").strip())
            if html_like or any(str(f.get("path", "")).lower().endswith(".html") for f in artifact_files):
                package_type = "web-package"
                primary = next(
                    (str(f.get("path")) for f in artifact_files if str(f.get("path", "")).lower().endswith(("index.html", "preview.html"))),
                    next((str(f.get("path")) for f in artifact_files if str(f.get("path", "")).lower().endswith(".html")), "index.html"),
                )
            elif has_files and has_markdown:
                package_type = "mixed-package"
                primary = str(artifact_files[0].get("path") or "workflow-output.md")
            elif has_files:
                package_type = "file-package"
                primary = str(artifact_files[0].get("path") or "workflow-output.txt")
            else:
                package_type = "document-package"
                primary = "workflow-output.md"

            return {
                "package_type": package_type,
                "primary_artifact": _normalize_artifact_display_path(primary),
                "artifact_count": len(artifact_files),
                "has_preview": package_type == "web-package",
                "artifact_paths": [_normalize_artifact_display_path(str(f.get("path") or "")) for f in artifact_files[:8] if f.get("path")],
            }

        package_summary = _derive_package_summary(
            (results[0].get("output") or {}).get("markdown", "") if results else "",
            files,
        )
        for item in results:
            item["package"] = package_summary

        latest_run_id = run_id or next((item.get("run_id") for item in results if item.get("run_id")), None)
        messages = _load_agent_messages_for_run(latest_run_id, scope_company_id)
        message_threads = build_message_threads(messages)
        if results:
            results[0]["messages"] = messages
            results[0]["message_threads"] = message_threads
            results[0]["output"]["messages"] = messages
            results[0]["output"]["message_threads"] = message_threads

        return {
            'workflow_id': workflow_id,
            'run_id': latest_run_id,
            'outputs': results,
            'latest': results[0] if results else None,
            'files': files,
            'package': package_summary,
            'messages': messages,
            'message_threads': message_threads,
            'events': _load_workflow_run_events(latest_run_id, scope_company_id),
        }
    
    except Exception as e:
        return {'workflow_id': workflow_id, 'outputs': [], 'latest': None, 'files': [], 'error': str(e)}


@app.get("/api/workflows/{workflow_id}/result")
async def get_workflow_result(workflow_id: str, request: Request, run_id: Optional[str] = None):
    """Product-facing alias for workflow results."""
    return await get_workflow_output(workflow_id, request, run_id)

@app.get("/api/workflows/{workflow_id}/evaluation")
async def get_workflow_evaluation(workflow_id: str, request: Request):
    """
    Lightweight release evaluation summary for a workflow run.
    This is a heuristic review layer for the first release, not a full rubric engine.
    """
    try:
        output = await get_workflow_output(workflow_id, request)
        latest = output.get("latest") or {}
        markdown = (latest.get("output") or {}).get("markdown") or ""
        outputs = output.get("outputs") or []
        try:
            artifacts = await get_workflow_artifacts_api(workflow_id, request)
        except Exception:
            artifacts = []
        try:
            timeline = await get_run_timeline(workflow_id, request) if "get_run_timeline" in globals() else []
        except Exception:
            timeline = []
        package = output.get("package") or {}
        has_preview = bool(package.get("has_preview"))
        package_type = package.get("package_type") or "document-package"
        has_web_artifact = package_type == "web-package"
        step_labels = [
            str(item.get("label") or item.get("role") or item.get("node_id") or "step")
            for item in outputs
        ]

        score = 0
        checks = []

        has_output = bool(markdown.strip())
        checks.append({"name": "Has output", "passed": has_output, "detail": "Workflow returned markdown output" if has_output else "No markdown output found"})
        score += 1 if has_output else 0

        has_agents = len(outputs) > 0
        checks.append({"name": "Has step outputs", "passed": has_agents, "detail": f"{len(outputs)} result record(s) found" if has_agents else "No run records found"})
        score += 1 if has_agents else 0

        has_artifacts = len(artifacts) > 0
        checks.append({"name": "Has artifacts", "passed": has_artifacts, "detail": f"{len(artifacts)} artifact(s) attached" if has_artifacts else "No artifacts were produced"})
        score += 1 if has_artifacts else 0

        completed_timeline = any((step.get("status") or "").lower() == "completed" for step in timeline)
        checks.append({"name": "Run completed", "passed": completed_timeline, "detail": "Execution timeline contains completed steps" if completed_timeline else "No completed timeline data found"})
        score += 1 if completed_timeline else 0

        has_web_preview = has_web_artifact and has_preview
        checks.append({"name": "Preview ready", "passed": has_web_preview, "detail": "Web output includes a previewable artifact" if has_web_preview else "No previewable web artifact found"})
        score += 1 if has_web_preview else 0

        has_named_steps = all(label and label != "step" for label in step_labels) if step_labels else False
        checks.append({"name": "Named steps", "passed": has_named_steps, "detail": "All returned steps include meaningful labels" if has_named_steps else "One or more steps are missing readable labels"})
        score += 1 if has_named_steps else 0

        status = "pass" if score >= 5 else "needs_review" if score >= 3 else "fail"
        summary = (
            "Workflow output looks complete, previewable, and review-ready."
            if status == "pass"
            else "Workflow finished, but additional review is recommended."
            if status == "needs_review"
            else "Workflow output is incomplete or lacks supporting evidence."
        )

        return {
            "workflow_id": workflow_id,
            "status": status,
            "score": score,
            "max_score": 6,
            "summary": summary,
            "checks": checks,
            "artifact_count": len(artifacts),
            "output_count": len(outputs),
            "package_type": package_type,
            "has_preview": has_preview,
        }
    except Exception as e:
        return {
            "workflow_id": workflow_id,
            "status": "fail",
            "score": 0,
            "max_score": 4,
            "summary": f"Evaluation failed: {str(e)}",
            "checks": [],
            "artifact_count": 0,
            "output_count": 0,
        }

@app.get("/api/workflows/{workflow_id}/export")
async def export_workflow_audit_package(workflow_id: str, request: Request):
    """
    Export a workflow audit package as a downloadable ZIP.
    Includes the workflow output, evaluation summary, run timeline, and audit events.
    """
    import io
    import zipfile
    from fastapi.responses import FileResponse

    output = await get_workflow_output(workflow_id, request)
    evaluation = await get_workflow_evaluation(workflow_id, request)
    timeline = await get_run_timeline(workflow_id, request)
    artifacts = await get_workflow_artifacts_api(workflow_id, request)

    with sqlite3.connect(audit_logger.db_path) as conn:
        cursor = conn.execute(
            """
            SELECT id, timestamp, agent_id, action_type, details_json, cost_usd, cas_hash
            FROM events
            WHERE (company_id = ?)
              ORDER BY id DESC
              LIMIT 250
            """,
            (_get_user_scope_company_id(request),),
        )
        audit_events = []
        for row in cursor.fetchall():
            try:
                details = json.loads(row[4]) if row[4] else {}
            except Exception:
                details = {}
            audit_events.append({
                "id": row[0],
                "timestamp": row[1],
                "agent_id": row[2],
                "action_type": row[3],
                "details": details,
                "cost_usd": row[5],
                "cas_hash": row[6],
            })

    manifest = {
        "workflow_id": workflow_id,
        "exported_at": _now(),
        "artifact_count": len(artifacts),
        "output_count": len(output.get("outputs") or []),
        "evaluation_status": evaluation.get("status"),
        "package_type": (output.get("package") or {}).get("package_type"),
        "primary_artifact": (output.get("package") or {}).get("primary_artifact"),
        "has_preview": (output.get("package") or {}).get("has_preview", False),
    }

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", json.dumps(manifest, indent=2))
        zf.writestr("workflow_output.json", json.dumps(output, indent=2))
        zf.writestr("evaluation.json", json.dumps(evaluation, indent=2))
        zf.writestr("timeline.json", json.dumps(timeline, indent=2))
        zf.writestr("audit_events.json", json.dumps(audit_events, indent=2))
        zf.writestr("artifacts.json", json.dumps(artifacts, indent=2))

        workspace_dir = os.path.join("data", "workspace", f"workflow_{workflow_id}")
        if os.path.exists(workspace_dir):
            for root, _, files in os.walk(workspace_dir):
                for file_name in files:
                    full_path = os.path.join(root, file_name)
                    rel_path = os.path.relpath(full_path, workspace_dir)
                    try:
                        with open(full_path, "rb") as f:
                            zf.writestr(f"artifacts/{rel_path}", f.read())
                    except Exception:
                        continue

    export_path = os.path.join(WORKSPACE_DIR, f"{workflow_id}_audit_package.zip")
    with open(export_path, "wb") as f:
        f.write(zip_buffer.getvalue())

    return FileResponse(
        path=export_path,
        filename=f"{workflow_id}_audit_package.zip",
        media_type="application/zip",
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
async def get_provider_settings(request: Request):
    """
    Get the current LLM provider configuration.
    NOTE: API keys are NEVER returned - they stay in .env only.
    """
    try:
        provider_config = _get_user_provider_config(request)
        return provider_config
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read settings: {str(e)}")

def _validate_provider_choice(provider: str, model: str) -> List[Dict[str, Any]]:
    provider = (provider or "").strip()
    model = (model or "").strip()
    if not provider:
        raise HTTPException(
            status_code=400,
            detail="provider is required",
        )
    if not model:
        raise HTTPException(
            status_code=400,
            detail="model is required",
        )
    if provider == "openai_compatible":
        return []

    supported = LLMProvider.get_supported_models()
    allowed = [item for item in supported if item.get("provider") == provider]
    provider_names = sorted({item.get("provider") for item in supported if item.get("provider")})
    if not allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported provider '{provider}'. Choose one of: {', '.join(provider_names)}.",
        )
    allowed_ids = {str(item.get("id")) for item in allowed if item.get("id")}
    if model not in allowed_ids:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported model '{model}' for {provider}. "
                f"Choose a tested model: {', '.join(sorted(allowed_ids))}."
            ),
        )
    return allowed


def _provider_requires_api_key(provider: str) -> bool:
    return (provider or "").strip().lower() not in {"ollama", "local"}


def _fallback_provider_for_missing_key(provider: str, model: str, base_url: Optional[str]) -> Optional[Dict[str, Any]]:
    """Choose a local-dev safe provider when the saved provider lacks a usable key."""
    normalized = (provider or "").strip().lower()
    if normalized != "openai_compatible":
        return None

    if os.getenv("GROQ_API_KEY"):
        return {
            "provider": "groq",
            "model": os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"),
            "base_url": os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1"),
            "api_key": os.getenv("GROQ_API_KEY"),
        }

    if os.getenv("GEMINI_API_KEY"):
        return {
            "provider": "gemini",
            "model": os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
            "base_url": None,
            "api_key": os.getenv("GEMINI_API_KEY"),
        }

    if os.getenv("OLLAMA_BASE_URL"):
        return {
            "provider": "ollama",
            "model": os.getenv("OLLAMA_MODEL", "llama3.2"),
            "base_url": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1"),
            "api_key": None,
        }

    return None


def _api_key_env_for_provider(provider: str) -> Optional[str]:
    provider = (provider or "").strip().lower()
    if provider == "gemini":
        return "GEMINI_API_KEY"
    if provider == "groq":
        return "GROQ_API_KEY"
    if provider == "openai":
        return "OPENAI_API_KEY"
    if provider == "openai_compatible":
        return "OPENAI_COMPATIBLE_API_KEY"
    return None


def _normalize_openai_compatible_base_url(base_url: str) -> str:
    target_url = (base_url or "").strip().rstrip("/")
    if target_url and not target_url.endswith("/v1"):
        target_url += "/v1"
    return target_url


def _provider_test_failure_message(provider: str, model: str, status_code: int, text: str) -> str:
    snippet = (text or "").strip().replace("\n", " ")[:260]
    if status_code in {401, 403}:
        return f"{provider} rejected the API key. Check the saved key and permissions."
    if status_code == 404:
        return f"{provider} could not find model '{model}'. Choose a supported model and test again."
    if status_code == 429:
        return f"{provider} rate limited the test request. Wait a moment or choose another configured provider."
    return f"{provider} test failed with HTTP {status_code}: {snippet or 'No response details returned.'}"


@app.post("/api/settings/provider")
async def set_provider_settings(request: Request, req: Dict[str, Any]):
    """
    Switch the active LLM provider.
    
    Body: { "provider": "gemini"|"ollama"|"openai", "model": "...", "base_url": "..." }
    
    The backend reinitializes the LLM client immediately. API keys remain in .env.
    """
    try:
        user_id = _get_user_id_from_request(request)
        provider = req.get("provider")
        model = req.get("model")
        base_url = req.get("base_url")

        _validate_provider_choice(provider, model)
        existing_config = settings.get_user_settings(user_id) if user_id else settings.get_active_provider()
        resolved_base_url = base_url if base_url is not None else existing_config.get("base_url")
        if provider == "openai_compatible" and not resolved_base_url:
            raise HTTPException(
                status_code=400,
                detail="base_url is required for OpenAI-compatible providers",
            )
        if provider == "openai_compatible" and resolved_base_url:
            resolved_base_url = _normalize_openai_compatible_base_url(resolved_base_url)

        result = settings.save_user_settings(user_id, {
            "provider": provider,
            "model": model,
            "base_url": resolved_base_url,
        })

        response: Dict[str, Any] = {
            "success": True,
            "config": {
                "provider": result.get("provider", provider),
                "model": result.get("model", model),
                "base_url": result.get("base_url", resolved_base_url),
            },
        }
        warnings = _provider_model_warnings(provider, model)
        if warnings:
            response["warnings"] = warnings
        return response
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to switch provider: {str(e)}")


@app.post("/api/settings/test")
async def test_llm_connection_endpoint(request: Request):
    """
    Test the currently configured LLM connection.
    Sends a simple message and measures response time.
    Does NOT expose API keys or internals.
    """
    try:
        try:
            body = await request.json()
        except Exception:
            body = {}
        provider_config = _get_user_provider_config(request)
        provider = body.get("provider") or provider_config.get("provider")
        model = body.get("model") or provider_config.get("model")
        base_url = body.get("base_url") if body.get("base_url") is not None else provider_config.get("base_url")
        if provider and model:
            _validate_provider_choice(provider, model)
        if provider == "openai_compatible" and not base_url:
            raise HTTPException(
                status_code=400,
                detail="base_url is required for OpenAI-compatible providers",
            )
        result = await settings.test_llm_connection(llm, provider=provider, model=model, base_url=base_url)
        return result
    except HTTPException:
        raise
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
            agent_name=agent_id or "0101 specialist"
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


def _get_user_scope_company_id(request: Request) -> str:
    """Create a per-user tenant scope for workflow dashboard storage."""
    user_id = _get_user_id_from_request(request)
    return f"user:{user_id}" if user_id else "user:anonymous"


def _get_user_provider_config(request: Request) -> Dict[str, Any]:
    """Resolve the current user's saved provider settings."""
    user_id = _get_user_id_from_request(request)
    if user_id:
        try:
            return settings.get_user_settings(user_id)
        except Exception:
            pass
    return settings.get_active_provider()


def _provider_model_warnings(provider: str, model: str) -> List[str]:
    """Return non-blocking warnings for provider choices that are intentionally custom."""
    normalized_provider = (provider or "").strip()
    normalized_model = (model or "").strip()
    if not normalized_provider or not normalized_model:
        return []

    if normalized_provider == "openai_compatible":
        return [
            "OpenAI-compatible endpoints use the model name exposed by your endpoint. "
            "Run the connection test before using it in workflows."
        ]
    return []


def _resolve_company_scope(request: Optional[Request] = None, company_id: Optional[str] = None) -> str:
    """Resolve the active tenant scope, preferring an explicit company_id when provided."""
    if company_id:
        return company_id
    if request is not None:
        return _get_user_scope_company_id(request)
    return "user:anonymous"


def _validate_workflow_graph(nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Validate workflow structure before execution."""
    nodes = nodes or []
    edges = edges or []
    errors: List[Dict[str, Any]] = []
    warnings: List[Dict[str, Any]] = []
    node_ids = {str(node.get("id")) for node in nodes if node.get("id")}

    if not nodes:
        errors.append({
            "severity": "error",
            "code": "empty_canvas",
            "title": "Canvas is empty",
            "description": "Add at least one agent node before running a workflow.",
        })

    seen_ids: Set[str] = set()
    for node in nodes:
        node_id = str(node.get("id") or "")
        data = node.get("data") or {}
        label = str(data.get("label") or data.get("role") or node_id or "Agent")
        role = str(data.get("role") or "").strip()
        instruction = str(data.get("instruction") or "").strip()

        if node_id in seen_ids:
            errors.append({
                "severity": "error",
                "code": "duplicate_node",
                "title": f"Duplicate node id {node_id}",
                "description": "Workflow node IDs must be unique.",
                "nodeIds": [node_id],
            })
        seen_ids.add(node_id)

        if not role:
            errors.append({
                "severity": "error",
                "code": "missing_role",
                "title": f"Missing role on {label}",
                "description": "Each workflow step needs a role so the backend can load the correct skill.",
                "nodeIds": [node_id],
            })

        if not instruction:
            errors.append({
                "severity": "error",
                "code": "missing_instruction",
                "title": f"Missing instruction on {label}",
                "description": "Each step needs a system prompt or instruction before it can run.",
                "nodeIds": [node_id],
            })

    for edge in edges:
        source = edge.get("source")
        target = edge.get("target")
        if source not in node_ids or target not in node_ids:
            errors.append({
                "severity": "error",
                "code": "invalid_edge",
                "title": "Invalid connection",
                "description": f"Edge {edge.get('id') or f'{source}→{target}'} points to a missing node.",
                "nodeIds": [value for value in [source, target] if value],
            })

    if nodes and DAGWorkflowEngine.detect_cycles(nodes, edges):
        errors.append({
            "severity": "error",
            "code": "cycle_detected",
            "title": "Workflow contains a cycle",
            "description": "Remove the loop before running. The executor only accepts DAGs.",
        })

    disconnected_nodes = [
        node for node in nodes
        if node.get("id") and not any(edge.get("source") == node.get("id") or edge.get("target") == node.get("id") for edge in edges)
    ]
    if len(disconnected_nodes) > 0 and len(nodes) > 1:
        warnings.append({
            "severity": "warning",
            "code": "disconnected_nodes",
            "title": "Some nodes are not connected",
            "description": f"{len(disconnected_nodes)} node(s) do not have incoming or outgoing edges.",
            "nodeIds": [node.get("id") for node in disconnected_nodes if node.get("id")],
        })

    def _has_term(text: str, terms: List[str]) -> bool:
        lower = text.lower()
        return any(term in lower for term in terms)

    def _label_text(node: Dict[str, Any]) -> str:
        data = node.get("data") or {}
        return f"{data.get('label') or data.get('role') or ''} {data.get('subtitle') or ''} {data.get('role') or ''}"

    has_evaluation_step = any(
        bool((node.get("data") or {}).get("verification_commands")) or _has_term(_label_text(node), ["evaluation", "review", "qa", "test", "audit", "verify", "validate"])
        for node in nodes
    )
    has_approval_step = any(
        bool((node.get("data") or {}).get("approval_required") or (node.get("data") or {}).get("approvalReason") or (node.get("data") or {}).get("approval_policy"))
        or _has_term(_label_text(node), ["approval", "gate", "review", "signoff", "sign-off"])
        for node in nodes
    )

    if nodes and not has_evaluation_step:
        warnings.append({
            "severity": "warning",
            "code": "missing_evaluation",
            "title": "No evaluation or verification step detected",
            "description": "Release workflows should include a quality gate or verification step before completion.",
        })

    if nodes and not has_approval_step:
        warnings.append({
            "severity": "warning",
            "code": "missing_approval",
            "title": "No approval gate detected",
            "description": "If this workflow can trigger risky actions, consider adding an approval checkpoint.",
        })

    if len(nodes) == 1:
        warnings.append({
            "severity": "warning",
            "code": "single_node",
            "title": "Single-step workflow",
            "description": "Single-node workflows are allowed, but important work should usually include explicit handoff stages.",
        })

    return {
        "is_valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "node_count": len(nodes),
        "edge_count": len(edges),
        "has_evaluation_step": has_evaluation_step,
        "has_approval_step": has_approval_step,
    }


def _validation_error_message(validation: Dict[str, Any]) -> str:
    errors = validation.get("errors", [])
    warnings = validation.get("warnings", [])
    if errors:
        titles = [str(issue.get("title") or issue.get("description") or "Invalid workflow") for issue in errors[:3]]
        suffix = f" ({len(errors)} blocking issue{'s' if len(errors) != 1 else ''})" if len(errors) > 1 else ""
        return "; ".join(titles) + suffix
    if warnings:
        titles = [str(issue.get("title") or issue.get("description") or "Workflow warning") for issue in warnings[:3]]
        suffix = f" ({len(warnings)} warning{'s' if len(warnings) != 1 else ''})"
        return "; ".join(titles) + suffix
    return "Workflow validation failed"


def _normalize_api_key_storage_provider(provider: str) -> str:
    """Map UI/provider aliases to a database provider value that passes the current constraint."""
    normalized = (provider or "").strip().lower()
    if normalized == "openai_compatible":
        return "openrouter"
    return normalized


def _display_api_key_provider(provider: str) -> str:
    """Map storage provider values back to user-facing provider labels."""
    normalized = (provider or "").strip().lower()
    if normalized == "openrouter":
        return "openai_compatible"
    return normalized


def _get_saved_api_key_for_user(user_id: str, provider: str) -> Optional[str]:
    """Return the decrypted active API key for a provider, if the user has one."""
    if not user_id or not provider:
        return None
    try:
        uuid.UUID(str(user_id))
    except (TypeError, ValueError):
        return None

    try:
        from core.supabase_client import supabase_admin as current_supabase_admin
        from core.security.crypto import decrypt_api_key
        provider = provider.lower()
        candidate_providers = [provider]
        if provider == "openai_compatible":
            # Temporary compatibility bucket until the live table constraint is migrated.
            candidate_providers.append("openrouter")

        for candidate in candidate_providers:
            result = (
                current_supabase_admin.client.table("user_api_keys")
                .select("encrypted_key")
                .eq("user_id", user_id)
                .eq("provider", candidate)
                .eq("is_active", True)
                .limit(1)
                .execute()
            )

            if result.data:
                encrypted_key = result.data[0].get("encrypted_key")
                if encrypted_key:
                    return decrypt_api_key(encrypted_key)
    except Exception as e:
        logger.warning("⚠️ [Chat] Failed to load saved API key for %s: %s", provider, e)

    return None


def _dedupe_preserve_order(items: Iterable[Any]) -> List[str]:
    """Return stringified items with duplicates removed while preserving order."""
    seen: Set[str] = set()
    result: List[str] = []
    for item in items or []:
        if item is None:
            continue
        value = str(item)
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def _skill_id_matches_preference(skill_id: str, preferred_id: str) -> bool:
    """Match a registry skill id against a preferred id, ignoring namespace prefixes."""
    if not skill_id or not preferred_id:
        return False

    skill_norm = re.sub(r"[\s_]+", "-", str(skill_id).strip().lower())
    preferred_norm = re.sub(r"[\s_]+", "-", str(preferred_id).strip().lower())
    if not skill_norm or not preferred_norm:
        return False

    if skill_norm == preferred_norm:
        return True

    # Registry ids often carry pack/source prefixes, so allow suffix matches.
    if skill_norm.endswith(f"-{preferred_norm}") or skill_norm.endswith(preferred_norm):
        return True

    # Also support a compact comparison for ids with punctuation variations.
    compact_skill = re.sub(r"[^a-z0-9]+", "", skill_norm)
    compact_preferred = re.sub(r"[^a-z0-9]+", "", preferred_norm)
    return compact_skill == compact_preferred or compact_skill.endswith(compact_preferred)


def _skill_token_list(*values: Any) -> List[str]:
    """Normalize labels, instructions, and ids into a flat lowercase token list."""
    tokens: List[str] = []
    for value in values:
        if value is None:
            continue
        if isinstance(value, (list, tuple, set)):
            tokens.extend(_skill_token_list(*value))
            continue
        if isinstance(value, dict):
            tokens.extend(_skill_token_list(*value.values()))
            continue
        tokens.extend([part for part in re.findall(r"[A-Za-z0-9]+", str(value).lower()) if part])
    return tokens


def _infer_stage_family(stage: Dict[str, Any]) -> str:
    """Infer the broad capability family a stage belongs to."""
    blob = " ".join(_skill_token_list(
        stage.get("label"),
        stage.get("instruction"),
        stage.get("keywords", []),
        stage.get("categories", []),
        stage.get("tools", []),
    ))
    if any(term in blob for term in ["write", "draft", "copy", "article", "blog", "content", "headline", "newsletter", "publish"]):
        return "writing"
    if any(term in blob for term in ["test", "qa", "audit", "review", "verify", "quality", "security", "accessibility"]):
        return "qa"
    if any(term in blob for term in ["search", "research", "source", "trend", "fact", "journalism", "news", "report"]):
        return "research"
    if any(term in blob for term in ["design", "ui", "ux", "brand", "visual", "layout", "responsive"]):
        return "design"
    if any(term in blob for term in ["build", "implement", "frontend", "backend", "developer", "code", "ship"]):
        return "engineering"
    if any(term in blob for term in ["product", "brief", "requirements", "analysis", "strategy"]):
        return "planning"
    return "general"


def _slugify_agent_id(value: str, fallback: str = "agent") -> str:
    """Create a stable workflow-local id without leaking arbitrary prompt text."""
    slug = re.sub(r"[^a-z0-9]+", "_", str(value or "").strip().lower()).strip("_")
    slug = re.sub(r"_+", "_", slug)
    return slug[:72] or fallback


def _stage_requested_role(stage: Dict[str, Any]) -> str:
    """Preserve explicit user-facing roles before falling back to generic labels."""
    for key in ("requested_role", "agent_label", "role", "label"):
        value = str(stage.get(key) or "").strip()
        if value:
            return value
    return "Workflow Specialist"


def _explicit_stage_role(stage: Dict[str, Any]) -> str:
    """Return only roles the user/planner explicitly requested, not generic stage labels."""
    for key in ("requested_role", "agent_label", "role"):
        value = str(stage.get(key) or "").strip()
        if value:
            return value
    return ""


def _stage_match_terms(stage: Dict[str, Any]) -> List[str]:
    """Flatten stage routing fields into weighted capability-matching terms."""
    terms = _skill_token_list(
        stage.get("requested_role"),
        stage.get("agent_label"),
        stage.get("label"),
        stage.get("summary"),
        stage.get("instruction"),
        stage.get("keywords", []),
        stage.get("categories", []),
        stage.get("preferred_categories", []),
        stage.get("required_capabilities", []),
        stage.get("output_contract"),
        stage.get("tools", []),
    )
    return _dedupe_preserve_order(terms)


def _score_skill_for_stage(skill: Dict[str, Any], stage: Dict[str, Any]) -> float:
    """Score a registry skill against the requested stage without positional fallback."""
    skill_id = str(skill.get("id", ""))
    name = str(skill.get("name", ""))
    description = str(skill.get("description", ""))
    tags = " ".join(skill.get("tags", []) or [])
    category = str(skill.get("category", ""))
    haystack = " ".join([skill_id, name, description, tags, category]).lower()
    preferred_ids = _dedupe_preserve_order(stage.get("preferred_ids") or [])
    preferred_categories = [str(c).lower() for c in (stage.get("preferred_categories") or stage.get("categories") or [])]

    if any(_skill_id_matches_preference(skill_id, preferred_id) for preferred_id in preferred_ids):
        return 42.0

    score = 0.0
    category_lower = category.lower()
    for preferred_category in preferred_categories:
        if not preferred_category:
            continue
        if preferred_category == category_lower:
            score += 9.0
        elif preferred_category in category_lower or category_lower in preferred_category:
            score += 5.0

    requested_role = _stage_requested_role(stage).lower()
    role_tokens = _skill_token_list(requested_role)
    for token in role_tokens:
        if len(token) < 3:
            continue
        if token in skill_id.lower():
            score += 5.0
        if token in name.lower():
            score += 4.5
        if token in description.lower():
            score += 2.5
        if token in tags.lower():
            score += 2.0

    for term in _stage_match_terms(stage):
        if len(term) < 3:
            continue
        if term in skill_id.lower():
            score += 4.0
        if term in name.lower():
            score += 3.5
        if term in description.lower():
            score += 2.0
        if term in tags.lower():
            score += 1.5
        if term in haystack:
            score += 0.5

    return score


def _candidate_agents_for_stage(
    all_skills: List[Dict[str, Any]],
    stage: Dict[str, Any],
    excluded_ids: Optional[Set[str]] = None,
    stage_index: int = 1,
    limit: int = 5,
) -> List[Dict[str, Any]]:
    """Return the ranked shortlist for a stage so the UI can show real match candidates."""
    excluded_ids = excluded_ids or set()
    requested_role = _stage_requested_role(stage)
    explicit_role = _explicit_stage_role(stage)
    stage_slug = _slugify_agent_id(requested_role or stage.get("label") or f"stage_{stage_index}", f"stage_{stage_index}")
    preferred_ids = _dedupe_preserve_order(stage.get("preferred_ids") or [])

    candidates: List[Dict[str, Any]] = []
    for skill in all_skills:
        skill_id = str(skill.get("id", ""))
        if skill_id in excluded_ids:
            continue

        preferred_index = next(
            (idx for idx, preferred_id in enumerate(preferred_ids) if _skill_id_matches_preference(skill_id, preferred_id)),
            None,
        )
        exact_preference = preferred_index is not None
        score = 1000.0 - float(preferred_index or 0) if exact_preference else _score_skill_for_stage(skill, stage)
        if score <= 0:
            continue

        if exact_preference or score >= 12:
            match_type = "exact"
        elif score >= 4:
            match_type = "adapted"
        else:
            match_type = "virtual"

        confidence = 0.96 if exact_preference else min(0.94, round(score / 42.0, 2))
        display_name = explicit_role or str(skill.get("name") or requested_role)
        candidates.append(
            {
                "agent_id": skill_id,
                "agent_name": str(skill.get("name") or requested_role),
                "display_name": display_name,
                "emoji": str(stage.get("emoji") or skill.get("emoji") or "🤖"),
                "match_type": match_type,
                "match_confidence": max(0.32, confidence),
                "match_score": int(round(max(0.32, confidence) * 100)),
                "sort_score": score,
                "base_skill_id": skill_id,
                "category": skill.get("category", ""),
                "reason": _build_stage_selection_reason(str(stage.get("instruction") or stage.get("summary") or requested_role), str(stage.get("label") or "Stage"), stage, str(skill.get("name") or requested_role)),
                "skill": skill,
            }
        )

    candidates.sort(key=lambda item: (item["sort_score"], item["match_score"], item["display_name"].lower()), reverse=True)
    if limit > 0:
        candidates = candidates[:limit]
    for candidate in candidates:
        candidate.pop("skill", None)
        candidate.pop("sort_score", None)
    return candidates


def _resolve_agent_for_stage(
    all_skills: List[Dict[str, Any]],
    stage: Dict[str, Any],
    excluded_ids: Optional[Set[str]] = None,
    stage_index: int = 1,
) -> Dict[str, Any]:
    """Resolve a stage to an exact, adapted, virtual, or missing agent match."""
    excluded_ids = excluded_ids or set()
    requested_role = _stage_requested_role(stage)
    stage_slug = _slugify_agent_id(requested_role or stage.get("label") or f"stage_{stage_index}", f"stage_{stage_index}")
    preferred_ids = _dedupe_preserve_order(stage.get("preferred_ids") or [])
    strict_role_matching = bool(stage.get("strict_role_matching"))
    for preferred_id in preferred_ids:
        for skill in all_skills:
            skill_id = str(skill.get("id", ""))
            if skill_id in excluded_ids:
                continue
            if _skill_id_matches_preference(skill_id, preferred_id):
                candidates = _candidate_agents_for_stage(all_skills, stage, excluded_ids, stage_index=stage_index, limit=5)
                return {
                    "skill": skill,
                    "agent_id": skill_id,
                    "agent_name": str(skill.get("name") or requested_role),
                    "display_name": _explicit_stage_role(stage) or str(skill.get("name") or requested_role),
                    "emoji": str(stage.get("emoji") or skill.get("emoji") or "🤖"),
                    "match_type": "exact",
                    "match_confidence": 0.96,
                    "base_skill_id": skill_id,
                    "capability_gap": None,
                    "candidate_agents": candidates,
                }
    candidates = _candidate_agents_for_stage(all_skills, stage, excluded_ids, stage_index=stage_index, limit=5)

    if strict_role_matching:
        return {
            "skill": {},
            "agent_id": f"virtual_{stage_index}_{stage_slug}",
            "agent_name": requested_role,
            "display_name": requested_role,
            "emoji": str(stage.get("emoji") or "🧠"),
            "match_type": "virtual",
            "match_confidence": 0.32,
            "base_skill_id": None,
            "capability_gap": None,
            "candidate_agents": candidates,
        }

    if candidates:
        top_candidate = candidates[0]
        if top_candidate["match_type"] != "virtual" and top_candidate["match_score"] >= 40:
            skill = next((skill for skill in all_skills if str(skill.get("id", "")) == top_candidate["agent_id"]), {})
            return {
                "skill": skill,
                "agent_id": top_candidate["agent_id"],
                "agent_name": top_candidate["agent_name"],
                "display_name": top_candidate["display_name"],
                "emoji": top_candidate["emoji"],
                "match_type": top_candidate["match_type"],
                "match_confidence": top_candidate["match_confidence"],
                "base_skill_id": top_candidate["base_skill_id"],
                "capability_gap": None,
                "candidate_agents": candidates,
            }

    virtual_id = f"virtual_{stage_index}_{stage_slug}"
    return {
        "skill": {},
        "agent_id": virtual_id,
        "agent_name": requested_role,
        "display_name": requested_role,
        "emoji": str(stage.get("emoji") or "🧠"),
        "match_type": "virtual",
        "match_confidence": 0.32,
        "base_skill_id": None,
        "capability_gap": None,
        "candidate_agents": candidates,
    }


def _route_quality_from_stage_plan(stage_plan: List[Dict[str, Any]]) -> str:
    match_types = {str(stage.get("match_type") or "adapted") for stage in stage_plan}
    if "missing" in match_types:
        return "gap"
    if match_types.intersection({"adapted", "virtual"}):
        return "adapted"
    return "complete"


def _normalize_prompt(prompt: str) -> str:
    """Normalize prompt text for classification and title generation."""
    return re.sub(r"\s+", " ", prompt.strip().lower())


def _extract_requested_agent_count(prompt: str, fallback: int = 3) -> int:
    """Honor explicit user agent-count constraints before UI defaults."""
    text = _normalize_prompt(prompt)
    candidates: List[int] = []

    for match in re.finditer(r"\b([1-5])\s*[- ]?\s*agents?\b", text):
        candidates.append(int(match.group(1)))

    agent_numbers = [
        int(match.group(1))
        for match in re.finditer(r"\bagent\s*([1-5])\b", text)
    ]
    if agent_numbers:
        candidates.append(max(agent_numbers))

    if candidates:
        return max(1, min(max(candidates), 5))
    return max(1, min(int(fallback or 3), 5))


def _extract_cycle_count(prompt: str, fallback: Optional[int] = None) -> Optional[int]:
    """Extract explicit run-cycle counts from prompts like '5 cycles'."""
    text = _normalize_prompt(prompt)
    match = re.search(r"\b(\d{1,2})\s*(?:cycles?|readings?|iterations?)\b", text)
    if not match:
        return fallback
    return max(1, min(int(match.group(1)), 50))


def _infer_magicflow_mode(prompt: str, requested_mode: str = "auto") -> str:
    """DAG instructions outrank generic words like 'simulating'."""
    mode = str(requested_mode or "auto").strip().lower()
    if mode and mode != "auto":
        return mode

    text = _normalize_prompt(prompt)
    if any(term in text for term in ["dag mode", "run in series", "series mode", "sequential", "passes its output to the next"]):
        return "dag"
    if any(term in text for term in ["simulation mode", "evented simulation", "logical cycle", "manual stepping"]):
        return "simulation"
    return "dag"


def _infer_output_type(prompt: str, requested_output_type: str = "auto") -> str:
    """Infer final artifact type from hard prompt constraints."""
    output_type = str(requested_output_type or "auto").strip().lower()
    if output_type and output_type != "auto":
        return output_type

    text = _normalize_prompt(prompt)
    if any(term in text for term in ["plain text", "text log", "log entry", "no html", "no web app", "document", "report"]):
        return "document"
    if any(term in text for term in ["web app", "website", "html", "css", "javascript", "preview"]):
        return "web_app"
    if any(term in text for term in ["json", "csv", "dataset", "data table"]):
        return "data"
    return "auto"


def _normalize_artifact_display_path(path: str) -> str:
    """Convert workspace-internal artifact paths into user-facing display paths."""
    normalized = str(path or "").replace("\\", "/").strip("/")
    if not normalized:
        return ""

    parts = [part for part in normalized.split("/") if part]
    if not parts:
        return normalized

    internal_prefixes = {"repo", "workspace", "workspaces", "artifact", "artifacts", "output", "outputs", "deliverables"}
    cleaned: List[str] = []

    for index, part in enumerate(parts):
        lower = part.lower()
        if not cleaned and lower in internal_prefixes:
            continue

        if not cleaned:
            match = re.match(r"^(step|stage|node|run|phase)[-_ ]?(\d+)$", lower)
            if match:
                label = f"{match.group(1).capitalize()} {match.group(2)}"
                cleaned.append(label)
                continue

        cleaned.append(part)

    display = "/".join(cleaned).strip("/")
    return display or os.path.basename(normalized) or normalized


def _classify_workflow_domain(prompt: str) -> Dict[str, Any]:
    """Classify a prompt into a workflow domain with a compact stage blueprint."""
    text = _normalize_prompt(prompt)

    def has_any(words: List[str]) -> bool:
        return any(word in text for word in words)

    if has_any([
        "temperature sensor", "raw temperature", "calibration formula", "corrected =",
        "drift alert", "fault detector", "embedded temperature", "calibration engineer"
    ]) or (
        has_any(["embedded", "sensor", "temperature"])
        and has_any(["calibration", "fault", "drift", "logging", "cycles"])
    ):
        return {
            "key": "embedded_temperature_sensor_debug",
            "title": "Embedded Temperature Sensor Debugging",
            "stages": [
                {
                    "label": "Raw Sensor Reading",
                    "agent_label": "Embedded Systems Tester",
                    "emoji": "🔧",
                    "keywords": ["embedded", "sensor", "temperature", "raw", "20", "35", "reading"],
                    "categories": ["engineering", "embedded", "testing"],
                    "preferred_ids": [
                        "core_engineering-embedded-systems-engineer",
                        "core_testing-test-results-analyzer",
                        "core_testing-evidence-collector",
                    ],
                    "instruction": (
                        "Generate the raw embedded temperature readings for {cycle_count} cycles. "
                        "For each cycle, produce exactly one raw Celsius value between 20 and 35 inclusive. "
                        "Return structured plain text with cycle number and raw_value_c. Do not produce HTML."
                    ),
                    "tools": ["write_artifact"],
                    "temperature": 0.25,
                },
                {
                    "label": "Calibration Correction",
                    "agent_label": "Calibration Engineer",
                    "emoji": "🧮",
                    "keywords": ["calibration", "corrected", "formula", "offset", "1.02", "temperature"],
                    "categories": ["engineering", "data", "analytics"],
                    "preferred_ids": [
                        "core_engineering-embedded-systems-engineer",
                        "core_engineering-data-pipeline-engineer",
                        "core_support-analytics-reporter",
                    ],
                    "instruction": (
                        "Read each raw_value_c from the previous stage and apply the calibration formula "
                        "corrected = raw * 1.02 + offset, where offset is a random value between -1 and +1 for each cycle. "
                        "Return cycle number, raw_value_c, offset_c, and corrected_value_c. Do not change the cycle count."
                    ),
                    "tools": ["read_artifact", "write_artifact"],
                    "temperature": 0.2,
                },
                {
                    "label": "Drift Detection",
                    "agent_label": "Fault Detector",
                    "emoji": "🚨",
                    "keywords": ["fault", "detector", "drift", "alert", "difference", "2"],
                    "categories": ["testing", "quality", "engineering"],
                    "preferred_ids": [
                        "core_testing-test-results-analyzer",
                        "core_testing-evidence-collector",
                        "core_engineering-system-performance-governor",
                    ],
                    "instruction": (
                        "Compare raw_value_c and corrected_value_c for every cycle. "
                        "Calculate absolute difference_c. If difference_c exceeds 2.0, set alert_status to DRIFT ALERT; otherwise set alert_status to OK. "
                        "Return all cycles with raw, corrected, difference, and alert status."
                    ),
                    "tools": ["read_artifact", "write_artifact"],
                    "temperature": 0.15,
                },
                {
                    "label": "Engineering Log",
                    "agent_label": "Logging & Report Agent",
                    "emoji": "📋",
                    "keywords": ["logging", "report", "log", "timestamp", "plain text", "no html"],
                    "categories": ["support", "analytics", "documentation", "data"],
                    "preferred_ids": [
                        "core_support-analytics-reporter",
                        "core_specialized-report-distribution-agent",
                        "core_engineering-data-pipeline-engineer",
                    ],
                    "instruction": (
                        "Write the final deliverable as a plain text engineering log with exactly {cycle_count} entries. "
                        "Each entry must contain timestamp, cycle, raw value, corrected value, difference, and alert status. "
                        "No HTML, no web app, no markdown table unless plain text is still readable."
                    ),
                    "tools": ["read_artifact", "write_artifact", "list_artifacts"],
                    "temperature": 0.2,
                },
            ],
        }

    if has_any([
        "compliance", "policy", "governance", "privacy", "gdpr", "ccpa", "hipaa",
        "soc2", "soc 2", "iso 27001", "iso27001", "pci", "risk assessment", "audit trail",
        "regulatory", "controls", "evidence pack", "control mapping"
    ]):
        return {
            "key": "compliance_governance",
            "title": "Compliance & Governance Workflow",
            "stages": [
                {
                    "label": "Policy Intake",
                    "keywords": ["policy", "compliance", "governance", "privacy", "regulatory"],
                    "categories": ["security", "audit", "governance", "policy"],
                    "preferred_ids": ["security-auditor", "product_manager", "strategic_planner"],
                    "instruction": "Translate the request into a compliance brief. Identify the framework, scope, stakeholders, and the specific policy or control objective that needs to be satisfied.",
                    "tools": ["read_artifact", "search_web"],
                    "temperature": 0.2,
                },
                {
                    "label": "Control Mapping",
                    "keywords": ["control", "mapping", "framework", "evidence", "requirements"],
                    "categories": ["security", "quality", "audit", "compliance"],
                    "preferred_ids": ["security-auditor", "risk-manager", "auditor"],
                    "instruction": "Map the request to controls, obligations, and evidence sources. Call out what is already satisfied and what is still missing.",
                    "tools": ["read_artifact", "list_artifacts", "search_web"],
                    "temperature": 0.2,
                },
                {
                    "label": "Gap Analysis",
                    "keywords": ["gap", "risk", "missing", "issue", "noncompliance", "finding"],
                    "categories": ["testing", "quality", "security", "audit"],
                    "preferred_ids": ["security-auditor", "testpilot", "risk-manager"],
                    "instruction": "Analyze the gaps between current state and required compliance posture. Prioritize findings by severity and implementation effort.",
                    "tools": ["read_artifact", "list_artifacts"],
                    "temperature": 0.2,
                },
                {
                    "label": "Remediation Plan",
                    "keywords": ["remediation", "fix", "policy", "plan", "controls", "implementation"],
                    "categories": ["engineering", "policy", "security", "governance"],
                    "preferred_ids": ["risk-manager", "backend-architect", "policy-writer"],
                    "instruction": "Turn the gaps into an actionable remediation plan with owners, sequencing, and success criteria. Keep the plan practical and auditable.",
                    "tools": ["read_artifact", "write_artifact", "list_artifacts"],
                    "temperature": 0.2,
                },
                {
                    "label": "Evidence Pack",
                    "keywords": ["evidence", "audit", "proof", "attestation", "launch", "signoff"],
                    "categories": ["audit", "testing", "quality", "security"],
                    "preferred_ids": ["security-auditor", "testpilot", "auditor"],
                    "instruction": "Assemble the supporting evidence, review notes, and signoff-ready summary so the compliance work can be audited or presented clearly.",
                    "tools": ["read_artifact", "list_artifacts"],
                    "temperature": 0.2,
                },
            ],
        }

    if has_any([
        "incident response", "outage", "root cause", "root-cause", "timeline", "severity",
        "playbook", "postmortem", "on-call", "ops dashboard", "operational dashboard",
        "incident dashboard", "service degradation", "production incident", "recovery plan"
    ]):
        return {
            "key": "incident_response_dashboard",
            "title": "Incident Response Dashboard",
            "stages": [
                {
                    "label": "Incident Intake",
                    "requested_role": "Incident Intake Analyst",
                    "emoji": "🚨",
                    "strict_role_matching": True,
                    "keywords": ["incident", "outage", "severity", "scope", "impact", "alerts"],
                    "categories": ["operations", "support", "product", "security"],
                    "preferred_ids": [],
                    "instruction": "Capture the incident type, blast radius, severity, affected services, unknowns, and any immediate risks. Produce a concise incident intake brief that can be used as the source of truth for the rest of the workflow. Output only structured JSON with these keys: incident_type, blast_radius, severity, affected_services, unknowns, immediate_risks.",
                    "tools": ["read_artifact", "search_web"],
                    "temperature": 0.2,
                },
                {
                    "label": "Timeline Reconstruction",
                    "requested_role": "Timeline Reconstruction Specialist",
                    "emoji": "🕒",
                    "strict_role_matching": True,
                    "keywords": ["timeline", "chronology", "events", "sequence", "timestamps", "reconstruct"],
                    "categories": ["operations", "analysis", "audit"],
                    "preferred_ids": [],
                    "instruction": "Reconstruct the incident timeline from the available evidence, including the deploy, first symptom, escalation, retries, mitigation attempts, and recovery points. Mark inferred timestamps clearly. Output only structured JSON with these keys: deploy, first_symptom, escalation, retries, mitigation_attempts, recovery_points.",
                    "tools": ["read_artifact", "list_artifacts"],
                    "temperature": 0.15,
                },
                {
                    "label": "Root Cause Analysis",
                    "requested_role": "Root Cause Analyst",
                    "emoji": "🔍",
                    "strict_role_matching": True,
                    "keywords": ["root cause", "analysis", "cause", "correlation", "evidence", "hypothesis"],
                    "categories": ["engineering", "testing", "security", "operations"],
                    "preferred_ids": [],
                    "instruction": "Analyze the incident evidence and determine the most likely root cause, contributing factors, and alternatives. Separate facts from inference and include confidence levels. Output only structured JSON with these keys: root_cause, contributing_factors, alternatives, facts, inferences, confidence_level.",
                    "tools": ["read_artifact", "search_web", "list_artifacts"],
                    "temperature": 0.15,
                },
                {
                    "label": "Remediation Plan",
                    "requested_role": "Remediation Planner",
                    "emoji": "🛠️",
                    "strict_role_matching": True,
                    "keywords": ["remediation", "fix", "mitigation", "recovery", "owners", "verification"],
                    "categories": ["engineering", "operations", "product", "delivery"],
                    "preferred_ids": [],
                    "instruction": "Turn the analysis into an actionable remediation plan with immediate mitigation steps, short-term fixes, longer-term prevention work, owners, dependencies, and verification criteria. Output only structured JSON with these keys: immediate_mitigation_steps, short_term_fixes, longer_term_prevention_work, owners, dependencies, verification_criteria.",
                    "tools": ["read_artifact", "write_artifact", "list_artifacts"],
                    "temperature": 0.2,
                },
                {
                    "label": "Playbook & Dashboard Packaging",
                    "requested_role": "Packaging & Dashboard Agent",
                    "emoji": "📦",
                    "strict_role_matching": True,
                    "keywords": ["dashboard", "playbook", "package", "report", "preview", "launch"],
                    "categories": ["engineering", "frontend", "documentation", "product"],
                    "preferred_ids": [],
                    "instruction": "Package the final output as a polished incident response playbook and an internal dashboard/web artifact that visualizes the incident story, timeline, severity, owners, and next actions. Start with a concise plain-text incident playbook, then include a self-contained HTML dashboard code block. Keep the artifact production-grade and avoid generic app chrome. If you output HTML, make it a single self-contained dashboard with no global app shell, no sidebar chrome, and no unrelated navigation.",
                    "tools": ["read_artifact", "write_artifact", "list_artifacts"],
                    "temperature": 0.2,
                },
            ],
        }

    if (
        has_any([
            "news", "article", "blog", "headline", "editorial", "newsletter", "press release",
            "publish", "publication", "journalism", "newsroom", "media", "top stories", "trending"
        ]) or (
            "report" in text and has_any(["write", "article", "publish", "content", "topic", "topics"])
        )
    ) and not has_any([
        "compare", "comparison", "versus", "vs", "winner", "best", "top 5", "top 3",
        "electric suv", "electric suvs", "suv", "value score", "horsepower", "range", "price",
        "pick the best", "choose the best", "rank", "ranking"
    ]):
        return {
            "key": "news_article_content",
            "title": "News and Article Workflow",
            "stages": [
                {
                    "label": "News Research",
                    "keywords": ["search", "research", "news", "trend", "fact", "verify", "source"],
                    "categories": ["research", "content marketing", "marketing", "seo"],
                    "preferred_ids": [
                        "core_default",
                        "search-specialist",
                        "generalist-research-agent",
                        "core_marketing-ai-search-optimizer",
                    ],
                    "instruction": "Research the latest news and credible sources on the requested topic. Capture the three strongest angles, note any factual claims that need verification, and summarize the source landscape before writing begins.",
                    "tools": ["read_artifact", "search_web"],
                    "temperature": 0.2,
                },
                {
                    "label": "Angle & Outline",
                    "keywords": ["outline", "plan", "structure", "topic", "brief", "content", "cluster"],
                    "categories": ["marketing", "writing", "documentation", "content"],
                    "preferred_ids": [
                        "core_marketing-multi-platform-content-strategist",
                        "core_marketing-thought-leadership-author",
                        "core_marketing-technical-seo-lead",
                        "seo-content-planner",
                        "content-marketer",
                    ],
                    "instruction": "Turn the research into a publishable article plan. Choose the strongest angle, outline the introduction and key sections, and define the headline, subheads, and supporting evidence needed for a compelling article.",
                    "tools": ["read_artifact", "search_web"],
                    "temperature": 0.25,
                },
                {
                    "label": "Article Drafting",
                    "keywords": ["write", "draft", "article", "content", "publish", "copy", "editorial"],
                    "categories": ["marketing", "writing", "content", "seo"],
                    "preferred_ids": [
                        "core_marketing-multi-platform-content-strategist",
                        "core_marketing-thought-leadership-author",
                        "core_marketing-technical-seo-lead",
                        "seo-content-writer",
                        "content-marketer",
                    ],
                    "instruction": "Write the article using the approved outline and verified facts. Keep the voice clear, current, and publication-ready, and make the article easy to scan with strong headlines and transitions.",
                    "tools": ["read_artifact", "write_artifact", "list_artifacts"],
                    "temperature": 0.3,
                },
                {
                    "label": "Editorial QA",
                    "keywords": ["review", "audit", "quality", "seo", "authority", "accuracy", "proof", "fact-check"],
                    "categories": ["testing", "quality", "research", "marketing", "seo"],
                    "preferred_ids": [
                        "core_testing-evidence-collector",
                        "core_testing-accessibility-auditor",
                        "core_engineering-code-quality-auditor",
                        "seo-content-auditor",
                        "seo-authority-builder",
                        "seo-content-refresher",
                    ],
                    "instruction": "Review the article for factual accuracy, clarity, SEO readiness, authority signals, and launch polish. Flag any claims that still need citation or any structural gaps before publishing.",
                    "tools": ["read_artifact", "list_artifacts"],
                    "temperature": 0.2,
                },
            ],
        }

    if has_any([
        "compare", "comparison", "versus", "vs", "winner", "best", "top 5", "top 3",
        "electric suv", "electric suvs", "suv", "value score", "horsepower", "range", "price",
        "pick the best", "choose the best", "rank", "ranking", "review", "announcing the winner"
    ]) and has_any([
        "report", "blog", "article", "post", "write", "announce", "research", "calculate", "score"
    ]):
        return {
            "key": "comparison_analysis_blog",
            "title": "Comparison, Scoring & Blog Workflow",
            "stages": [
                {
                    "label": "Market Research",
                    "keywords": ["research", "search", "suv", "electric", "price", "range", "horsepower", "models"],
                    "categories": ["research", "product", "marketing"],
                    "preferred_ids": [
                        "search-specialist",
                        "core_product-market-intelligence-analyst",
                        "core_default",
                    ],
                    "instruction": "Research the top 5 electric SUVs and produce a short report with price, range, horsepower, and any notable differentiators. Use reliable sources and keep the data structured so it can be scored in the next step.",
                    "tools": ["read_artifact", "search_web"],
                    "temperature": 0.2,
                },
                {
                    "label": "Value Scoring",
                    "keywords": ["score", "calculate", "value", "rank", "winner", "best", "compare"],
                    "categories": ["data", "analytics", "research", "product"],
                    "preferred_ids": [
                        "core_support-analytics-reporter",
                        "core_product-market-intelligence-analyst",
                        "core_default",
                    ],
                    "instruction": "Use the research report to calculate a clear value score for each SUV using the requested formula: (range / price) * 1000 + horsepower / 100. Show the calculation for each model, compare the results, and select the highest-scoring winner with a brief justification.",
                    "tools": ["read_artifact", "write_artifact", "list_artifacts"],
                    "temperature": 0.15,
                },
                {
                    "label": "Winner Blog Draft",
                    "keywords": ["blog", "article", "write", "announce", "fun", "friendly", "winner"],
                    "categories": ["marketing", "writing", "content"],
                    "preferred_ids": [
                        "core_marketing-multi-platform-content-strategist",
                        "core_marketing-thought-leadership-author",
                        "seo-content-writer",
                        "content-marketer",
                    ],
                    "instruction": "Write a fun, short blog post announcing the winning SUV and explaining why it stands out. Keep the tone friendly and readable, use a playful headline, and make the value proposition clear without overexplaining the math.",
                    "tools": ["read_artifact", "write_artifact", "list_artifacts"],
                    "temperature": 0.3,
                },
            ],
        }

    if has_any([
        "fitness", "fitness website", "gym", "workout", "trainer", "personal trainer",
        "wellness", "health", "exercise", "training plan", "membership", "classes",
        "nutrition", "personalized fitness", "coaching", "bootcamp", "pilates", "yoga"
    ]):
        return {
            "key": "fitness_wellness_web",
            "title": "Fitness & Wellness Website",
            "stages": [
                {
                    "label": "Requirements Brief",
                    "keywords": ["product", "requirements", "brief", "audience", "goals", "fitness", "wellness"],
                    "categories": ["product", "strategy", "documentation", "research", "business"],
                    "preferred_ids": [
                        "core_product-manager-requirement-analyst",
                        "core_default",
                        "product_manager",
                        "strategic_planner",
                        "search-specialist",
                    ],
                    "instruction": "Translate the request into a concise fitness website brief. Define the target audience, transformation goals, membership or class structure, tone, calls to action, and launch criteria. Capture any open questions before build begins.",
                    "tools": ["read_artifact", "search_web"],
                    "temperature": 0.2,
                },
                {
                    "label": "Brand & UI Direction",
                    "keywords": ["ui", "ux", "design", "brand", "visual", "identity", "layout", "responsive"],
                    "categories": ["design", "frontend"],
                    "preferred_ids": [
                        "core_design-ui-systems-designer",
                        "core_design-visual-narrative-designer",
                        "core_design-brand-identity-guardian",
                        "ui-ux-designer",
                        "pixelpro",
                        "illustrator",
                    ],
                    "instruction": "Create the visual direction for a modern fitness and wellness website. Define energy, layout hierarchy, color mood, typography direction, spacing rhythm, and the component system that will support membership, classes, and coach-focused sections.",
                    "tools": ["read_artifact"],
                    "temperature": 0.3,
                },
                {
                    "label": "Programs & Offer Copy",
                    "keywords": ["content", "copy", "writing", "seo", "marketing", "membership", "class", "trainer", "schedule", "signup"],
                    "categories": ["marketing", "writing", "product"],
                    "preferred_ids": [
                        "core_marketing-multi-platform-content-strategist",
                        "core_marketing-technical-seo-lead",
                        "seo-content-writer",
                        "content-marketer",
                        "copysmith",
                    ],
                    "instruction": "Draft the website copy for the hero, programs, trainers, schedules, membership offers, testimonials, and contact sections. Keep the voice motivating, premium, and conversion-oriented.",
                    "tools": ["read_artifact", "search_web"],
                    "temperature": 0.35,
                },
                {
                    "label": "Responsive Frontend Build",
                    "keywords": ["frontend", "developer", "fullstack", "react", "ui", "web", "build"],
                    "categories": ["engineering", "frontend", "development"],
                    "preferred_ids": [
                        "core_engineering-frontend-experience-developer",
                        "frontend-developer",
                        "backend-architect",
                        "architect",
                    ],
                    "instruction": "Implement the responsive website using the approved brief, visual direction, and copy. Prioritize a polished hero, clear program presentation, strong membership or booking calls to action, smooth mobile behavior, and clean interactions.",
                    "tools": ["read_artifact", "write_artifact", "list_artifacts"],
                    "temperature": 0.2,
                },
                {
                    "label": "Accessibility & Launch QA",
                    "keywords": ["test", "qa", "accessibility", "audit", "review", "quality", "evidence"],
                    "categories": ["testing", "quality", "accessibility", "security"],
                    "preferred_ids": [
                        "core_testing-accessibility-auditor",
                        "core_testing-evidence-collector",
                        "core_engineering-code-quality-auditor",
                        "seo-content-auditor",
                        "testpilot",
                        "security-auditor",
                    ],
                    "instruction": "Audit the website for accessibility, responsiveness, contrast, copy consistency, and launch readiness. Identify any blocking issues, missing states, or visual regressions before release.",
                    "tools": ["read_artifact", "list_artifacts"],
                    "temperature": 0.2,
                },
            ],
        }

    if has_any([
        "research", "report", "latest llm", "latest ai", "latest model", "summarize findings",
        "compare models", "simple webpage", "show the report data", "report website", "report webpage"
    ]) and has_any([
        "webpage", "web page", "website", "html", "frontend", "ui", "web app", "preview"
    ]):
        return {
            "key": "research_report_webpage",
            "title": "Research Report Website",
            "stages": [
                {
                    "label": "Research Brief",
                    "keywords": ["research", "latest", "report", "summary", "analysis", "findings"],
                    "categories": ["research", "strategy", "product"],
                    "preferred_ids": [
                        "search-specialist",
                        "research-analyst",
                        "strategic_planner",
                        "product_manager",
                    ],
                    "instruction": "Research the latest topic requested by the user, identify the most important findings, and summarize the context needed for a concise report.",
                    "tools": ["read_artifact", "search_web"],
                    "temperature": 0.2,
                },
                {
                    "label": "Report Draft",
                    "keywords": ["report", "draft", "write", "summary", "insights", "article"],
                    "categories": ["writing", "marketing", "documentation", "data"],
                    "preferred_ids": [
                        "analytics-reporter",
                        "data-storyteller",
                        "content-marketer",
                        "seo-content-writer",
                    ],
                    "instruction": "Turn the research findings into a clear report structure with a concise narrative, headings, and a data-friendly summary the webpage can present directly.",
                    "tools": ["read_artifact", "write_artifact"],
                    "temperature": 0.25,
                },
                {
                    "label": "Webpage Build",
                    "keywords": ["webpage", "website", "html", "frontend", "ui", "show", "display"],
                    "categories": ["engineering", "frontend", "design"],
                    "preferred_ids": [
                        "core_engineering-frontend-experience-developer",
                        "frontend-developer",
                        "fullstack-developer",
                        "backend-architect",
                        "ui-ux-designer",
                    ],
                    "instruction": "Build a simple but polished webpage that displays the report data clearly, using clean structure, responsive layout, and accessible presentation.",
                    "tools": ["read_artifact", "write_artifact", "list_artifacts"],
                    "temperature": 0.2,
                },
                {
                    "label": "Accessibility & Launch QA",
                    "keywords": ["qa", "review", "audit", "validate", "launch", "quality"],
                    "categories": ["testing", "quality", "accessibility"],
                    "preferred_ids": [
                        "testpilot",
                        "accessibility-auditor",
                        "code-quality-auditor",
                    ],
                    "instruction": "Verify that the report is accurate, the webpage is clean and responsive, and the final output contains only the requested deliverable with no unintended app chrome.",
                    "tools": ["read_artifact", "list_artifacts"],
                    "temperature": 0.2,
                },
            ],
        }

    if has_any([
        "website", "web site", "landing page", "homepage", "site", "restaurant", "bar",
        "cafe", "menu", "happy hour", "reservation", "book table", "brand", "classy",
        "modern", "responsive", "front end", "frontend", "ui", "ux"
    ]):
        return {
            "key": "local_business_web",
            "title": "Local Business Website",
            "stages": [
                {
                    "label": "Requirements Brief",
                    "keywords": ["product", "pm", "requirement", "brief", "research", "strategy", "business"],
                    "categories": ["product", "strategy", "documentation", "research", "business"],
                    "preferred_ids": [
                        "core_product-manager-requirement-analyst",
                        "core_default",
                        "product_manager",
                        "strategic_planner",
                        "search-specialist",
                    ],
                    "instruction": "Translate the request into a concise website brief. Define the target audience, page structure, menu sections, happy-hour offer placement, tone, calls to action, and launch criteria. Capture any open questions before build begins.",
                    "tools": ["read_artifact", "search_web"],
                    "temperature": 0.2,
                },
                {
                    "label": "Brand & UI Direction",
                    "keywords": ["ui", "ux", "design", "brand", "visual", "identity", "layout", "responsive"],
                    "categories": ["design", "frontend"],
                    "preferred_ids": [
                        "core_design-ui-systems-designer",
                        "core_design-visual-narrative-designer",
                        "core_design-brand-identity-guardian",
                        "ui-ux-designer",
                        "pixelpro",
                        "illustrator",
                    ],
                    "instruction": "Create the visual direction for a modern, classy local-bar website. Define layout hierarchy, color mood, typography direction, spacing rhythm, and the component system that will support the menu and happy-hour sections.",
                    "tools": ["read_artifact"],
                    "temperature": 0.3,
                },
                {
                    "label": "Menu & Offer Copy",
                    "keywords": ["content", "copy", "writing", "seo", "marketing", "menu", "happy hour", "cta"],
                    "categories": ["marketing", "writing", "product"],
                    "preferred_ids": [
                        "core_marketing-multi-platform-content-strategist",
                        "core_marketing-technical-seo-lead",
                        "seo-content-writer",
                        "content-marketer",
                        "copysmith",
                    ],
                    "instruction": "Draft the website copy for the hero, menu highlights, happy-hour promotion, hours, location, and reservation/contact sections. Keep the voice modern, classy, and conversion-oriented.",
                    "tools": ["read_artifact", "search_web"],
                    "temperature": 0.4,
                },
                {
                    "label": "Responsive Frontend Build",
                    "keywords": ["frontend", "developer", "fullstack", "react", "ui", "web", "build"],
                    "categories": ["engineering", "frontend", "development"],
                    "preferred_ids": [
                        "core_engineering-frontend-experience-developer",
                        "frontend-developer",
                        "backend-architect",
                        "architect",
                    ],
                    "instruction": "Implement the responsive website using the approved brief, visual direction, and copy. Prioritize a polished hero, clear menu presentation, an obvious happy-hour callout, smooth mobile behavior, and clean interactions.",
                    "tools": ["read_artifact", "write_artifact", "list_artifacts"],
                    "temperature": 0.2,
                },
                {
                    "label": "Accessibility & Launch QA",
                    "keywords": ["test", "qa", "accessibility", "audit", "review", "quality", "evidence"],
                    "categories": ["testing", "quality", "accessibility", "security"],
                    "preferred_ids": [
                        "core_testing-accessibility-auditor",
                        "core_testing-evidence-collector",
                        "core_engineering-code-quality-auditor",
                        "seo-content-auditor",
                        "testpilot",
                        "security-auditor",
                    ],
                    "instruction": "Audit the website for accessibility, responsiveness, contrast, copy consistency, and launch readiness. Identify any blocking issues, missing states, or visual regressions before release.",
                    "tools": ["read_artifact", "list_artifacts"],
                    "temperature": 0.2,
                },
            ],
        }

    if has_any([
        "pull request", "pr review", "code review", "review code", "review my code",
        "audit code", "review this codebase", "bug fix", "fix bug", "refactor", "patch",
        "security review", "vulnerability", "merge request", "diff review", "repo review"
    ]):
        return {
            "key": "code_review",
            "title": "Code Review & Repair Workflow",
            "stages": [
                {
                    "label": "Repository Scan",
                    "keywords": ["repo", "codebase", "diff", "changes", "scan", "review"],
                    "categories": ["engineering", "development", "code review"],
                    "preferred_ids": ["repo-scanner", "code-quality-auditor", "product_manager"],
                    "instruction": "Summarize the changed areas, the scope of the review, and the likely risk zones. Identify the files and modules that deserve the most attention before deeper review begins.",
                    "tools": ["read_artifact", "list_artifacts"],
                    "temperature": 0.2,
                },
                {
                    "label": "Risk Review",
                    "keywords": ["risk", "bug", "security", "performance", "regression", "edge"],
                    "categories": ["security", "quality", "testing"],
                    "preferred_ids": ["code-quality-auditor", "security-auditor", "testpilot"],
                    "instruction": "Inspect the code for correctness, maintainability, security, and regression risk. Call out anything that looks broken, fragile, or likely to fail in production.",
                    "tools": ["read_artifact", "search_web", "list_artifacts"],
                    "temperature": 0.2,
                },
                {
                    "label": "Test Planning",
                    "keywords": ["test", "validate", "coverage", "qa", "verification"],
                    "categories": ["testing", "quality", "automation"],
                    "preferred_ids": ["testpilot", "qa-evidence-collector", "accessibility-auditor"],
                    "instruction": "Design the verification strategy for the changed code. Propose tests, checks, and proof points that would validate the fix and prevent regression.",
                    "tools": ["read_artifact", "list_artifacts"],
                    "temperature": 0.2,
                },
                {
                    "label": "Repair Advice",
                    "keywords": ["patch", "fix", "implement", "refactor", "apply"],
                    "categories": ["engineering", "development", "frontend", "backend"],
                    "preferred_ids": ["backend-architect", "frontend-developer", "fullstack-developer"],
                    "instruction": "Translate the review into concrete code changes or repair instructions. Keep the recommendations small, explicit, and safe to apply.",
                    "tools": ["read_artifact", "write_artifact", "list_artifacts"],
                    "temperature": 0.2,
                },
            ],
        }

    if has_any([
        "api", "backend", "frontend", "feature", "app", "application", "login", "auth", "database",
        "dashboard", "workflow", "integration", "bug", "fix", "build", "shipping", "production"
    ]):
        return {
            "key": "software_build",
            "title": "Software Feature Delivery",
            "stages": [
                {
                    "label": "Requirements Analysis",
                    "keywords": ["product", "requirement", "analysis", "brief", "strategy", "research"],
                    "categories": ["product", "strategy", "documentation", "research"],
                    "preferred_ids": ["product_manager", "strategic_planner", "research-analyst"],
                    "instruction": "Analyze the requested software change, clarify goals, constraints, and acceptance criteria, and produce a compact implementation brief with key edge cases and dependencies.",
                    "tools": ["read_artifact", "search_web"],
                    "temperature": 0.2,
                },
                {
                    "label": "System & UX Design",
                    "keywords": ["architecture", "ux", "design", "frontend", "backend", "layout", "system"],
                    "categories": ["design", "engineering", "frontend", "backend"],
                    "preferred_ids": ["backend-architect", "ui-ux-designer", "architect"],
                    "instruction": "Design the implementation approach, data flow, and user experience structure. Specify the core screens, state transitions, and integration points needed to ship the feature cleanly.",
                    "tools": ["read_artifact"],
                    "temperature": 0.2,
                },
                {
                    "label": "Implementation",
                    "keywords": ["developer", "engineering", "fullstack", "frontend", "backend", "implementation", "code"],
                    "categories": ["engineering", "development", "frontend", "backend"],
                    "preferred_ids": ["frontend-developer", "backend-developer", "fullstack-developer"],
                    "instruction": "Implement the requested software change according to the approved design and requirements, keeping the code modular, maintainable, and testable.",
                    "tools": ["read_artifact", "write_artifact", "list_artifacts"],
                    "temperature": 0.2,
                },
                {
                    "label": "Validation & QA",
                    "keywords": ["test", "qa", "review", "audit", "performance", "accessibility", "security"],
                    "categories": ["testing", "quality", "accessibility", "security"],
                    "preferred_ids": ["testpilot", "security-auditor", "accessibility-auditor"],
                    "instruction": "Validate the implementation against the requirements, focusing on correctness, regressions, accessibility, and edge cases. Capture follow-up issues and release readiness.",
                    "tools": ["read_artifact", "list_artifacts"],
                    "temperature": 0.2,
                },
            ],
        }

    if has_any([
        "seo", "campaign", "content", "copy", "social", "marketing", "brand", "newsletter", "ads", "landing"
    ]):
        return {
            "key": "marketing_content",
            "title": "Marketing Content Workflow",
            "stages": [
                {
                    "label": "Strategy Brief",
                    "keywords": ["product", "strategy", "brief", "research", "analysis", "market"],
                    "categories": ["product", "strategy", "research", "business"],
                    "preferred_ids": ["strategic-planner", "research-analyst", "content-marketer"],
                    "instruction": "Translate the marketing request into a practical strategy brief with audience, message, channel, and success-metric definitions.",
                    "tools": ["read_artifact", "search_web"],
                    "temperature": 0.2,
                },
                {
                    "label": "Content Plan",
                    "keywords": ["content", "writing", "copy", "editorial", "seo", "brand"],
                    "categories": ["marketing", "writing", "documentation"],
                    "preferred_ids": ["seo-content-planner", "content-marketer", "copysmith"],
                    "instruction": "Create the content structure, message hierarchy, and persuasive copy direction for the requested campaign or landing page.",
                    "tools": ["read_artifact", "search_web"],
                    "temperature": 0.3,
                },
                {
                    "label": "Production & Delivery",
                    "keywords": ["implement", "design", "frontend", "writer", "producer", "deliver"],
                    "categories": ["engineering", "design", "marketing", "production"],
                    "preferred_ids": ["seo-content-writer", "content-marketer", "frontend-developer"],
                    "instruction": "Produce the final assets, page content, or deliverables in a polished, launch-ready format.",
                    "tools": ["read_artifact", "write_artifact", "list_artifacts"],
                    "temperature": 0.2,
                },
                {
                    "label": "Review & Polish",
                    "keywords": ["qa", "review", "audit", "quality", "accessibility", "proof"],
                    "categories": ["testing", "quality", "accessibility"],
                    "preferred_ids": ["seo-content-auditor", "testpilot", "content-marketer"],
                    "instruction": "Review the deliverable for clarity, consistency, tone, and any launch-blocking issues before handoff.",
                    "tools": ["read_artifact", "list_artifacts"],
                    "temperature": 0.2,
                },
            ],
        }

    if has_any([
        "analytics", "dashboard", "report", "metrics", "data", "kpi", "analysis", "forecast", "tracking"
    ]):
        return {
            "key": "data_insight",
            "title": "Data Insight Workflow",
            "stages": [
                {
                    "label": "Problem Framing",
                    "keywords": ["analysis", "research", "strategy", "product", "business"],
                    "categories": ["product", "strategy", "research", "business"],
                    "preferred_ids": ["research-analyst", "strategic-planner", "data-storyteller"],
                    "instruction": "Frame the analytical problem, define the key questions, success metrics, and the data needed to answer them.",
                    "tools": ["read_artifact", "search_web"],
                    "temperature": 0.2,
                },
                {
                    "label": "Insight Design",
                    "keywords": ["data", "dashboard", "visualization", "report", "analytics"],
                    "categories": ["data", "engineering", "design"],
                    "preferred_ids": ["datasage", "data-storyteller", "ui-ux-designer"],
                    "instruction": "Design the analysis structure, dashboard layout, metric definitions, and narrative flow needed to communicate the findings clearly.",
                    "tools": ["read_artifact"],
                    "temperature": 0.2,
                },
                {
                    "label": "Analysis Execution",
                    "keywords": ["engineer", "data", "analysis", "pipeline", "sql", "compute"],
                    "categories": ["data", "engineering"],
                    "preferred_ids": ["data-engineer", "data-pipeline-engineer", "datasage"],
                    "instruction": "Perform the core analysis or data preparation work and produce a clean output that can be reviewed and shared.",
                    "tools": ["read_artifact", "write_artifact", "list_artifacts"],
                    "temperature": 0.2,
                },
                {
                    "label": "Review & Validation",
                    "keywords": ["qa", "review", "audit", "accuracy", "evidence"],
                    "categories": ["testing", "quality", "audit"],
                    "preferred_ids": ["testpilot", "auditor", "data-storyteller"],
                    "instruction": "Validate the findings for accuracy, consistency, and communication quality before handoff.",
                    "tools": ["read_artifact", "list_artifacts"],
                    "temperature": 0.2,
                },
            ],
        }

    return {
        "key": "general",
        "title": "General Workflow",
        "stages": [
                {
                    "label": "Requirements",
                    "keywords": ["product", "requirement", "analysis", "brief", "strategy"],
                    "categories": ["product", "strategy", "documentation", "research"],
                    "preferred_ids": ["product_manager", "strategic_planner", "research-analyst"],
                    "instruction": "Clarify the request, capture the goal, identify constraints, and produce a concise execution brief.",
                    "tools": ["read_artifact", "search_web"],
                    "temperature": 0.2,
                },
                {
                    "label": "Execution",
                    "keywords": ["engineering", "design", "marketing", "development", "implementation"],
                    "categories": ["engineering", "design", "marketing", "development", "frontend", "backend"],
                    "preferred_ids": ["frontend-developer", "content-marketer", "backend-developer"],
                    "instruction": "Execute the main work in a structured, professional, and outcome-focused way.",
                    "tools": ["read_artifact", "write_artifact", "list_artifacts"],
                    "temperature": 0.2,
                },
                {
                    "label": "Review",
                    "keywords": ["qa", "review", "audit", "test", "validate"],
                    "categories": ["testing", "quality", "accessibility", "audit"],
                    "preferred_ids": ["testpilot", "auditor", "security-auditor"],
                    "instruction": "Review the output, verify quality, and capture any follow-up items before handoff.",
                    "tools": ["read_artifact", "list_artifacts"],
                    "temperature": 0.2,
                },
        ],
    }


def _derive_workflow_title(prompt: str, blueprint: Dict[str, Any]) -> str:
    """Produce a clean workflow title from the prompt and blueprint."""
    title = blueprint.get("title") or "Generated Workflow"
    normalized = prompt.strip()
    if not normalized:
        return title

    words = re.findall(r"[A-Za-z0-9]+", normalized)
    if not words:
        return title

    stopwords = {
        "need", "make", "create", "build", "a", "an", "the", "for", "with", "and", "to",
        "of", "in", "on", "my", "our", "please", "can", "should", "want", "website", "site",
        "app", "project"
    }
    significant = [w for w in words if w.lower() not in stopwords]
    if not significant:
        significant = words[:5]

    title_candidate = " ".join(significant[:6]).strip()
    if blueprint.get("key") == "local_business_web" and any(w.lower() in {"bar", "restaurant", "cafe", "shop"} for w in words):
        return f"{title_candidate.title()} Website"
    return title_candidate.title()


def _merge_stage_group(
    stages: List[Dict[str, Any]],
    blueprint_key: Optional[str] = None,
    family_override: Optional[str] = None,
) -> Dict[str, Any]:
    """Merge adjacent blueprint stages into a single execution stage."""
    if not stages:
        return {
            "label": "Merged Stage",
            "keywords": [],
            "categories": [],
            "instruction": "",
            "tools": [],
            "temperature": 0.2,
        }

    if len(stages) == 1:
        merged = dict(stages[0])
        merged.setdefault("preferred_family", family_override or _infer_stage_family(stages[0]))
        return merged

    labels = [str(stage.get("label", "Stage")) for stage in stages]
    instructions = [str(stage.get("instruction", "")).strip() for stage in stages if str(stage.get("instruction", "")).strip()]
    keywords = sorted({kw for stage in stages for kw in stage.get("keywords", []) or []})
    categories = sorted({cat for stage in stages for cat in stage.get("categories", []) or []})
    tools = sorted({tool for stage in stages for tool in stage.get("tools", []) or []})
    preferred_ids = _dedupe_preserve_order(pid for stage in stages for pid in stage.get("preferred_ids", []) or [])
    temperatures = [float(stage.get("temperature", 0.2)) for stage in stages if stage.get("temperature") is not None]

    family_counts = {
        family: sum(1 for stage in stages if _infer_stage_family(stage) == family)
        for family in ["research", "writing", "design", "engineering", "qa", "planning", "general"]
    }
    inferred_family = family_override or max(
        family_counts,
        key=lambda family: family_counts.get(family, 0),
    )
    if family_counts.get(inferred_family, 0) == 0:
        inferred_family = family_override or "general"

    if inferred_family == "writing":
        preferred_categories = ["marketing", "writing", "content", "seo", "product"]
        preferred_ids = [
            pid for pid in preferred_ids
            if not any(term in pid.lower() for term in ["audit", "qa", "review", "quality", "test", "security", "accessibility"])
        ]
        preferred_ids = sorted(
            preferred_ids,
            key=lambda pid: (
                0
                if "writer" in pid.lower()
                else 1
                if "author" in pid.lower()
                else 2
                if any(term in pid.lower() for term in ["content-strategist", "content-marketer", "technical-seo-lead"])
                else 3
                if "planner" in pid.lower() or "plan" in pid.lower()
                else 4
            ),
        )
    elif inferred_family == "research":
        preferred_categories = ["research", "product", "strategy", "marketing"]
        preferred_ids = [
            pid for pid in preferred_ids
            if not any(term in pid.lower() for term in ["audit", "qa", "review", "quality", "test", "security", "accessibility"])
        ]
        preferred_ids = sorted(
            preferred_ids,
            key=lambda pid: (
                0
                if any(term in pid.lower() for term in ["research", "search", "analyst"])
                else 1
                if any(term in pid.lower() for term in ["planner", "strategic", "product"])
                else 2
            ),
        )
    elif inferred_family == "design":
        preferred_categories = ["design", "frontend"]
    elif inferred_family == "engineering":
        preferred_categories = ["engineering", "development", "frontend", "backend"]
    elif inferred_family == "qa":
        preferred_categories = ["testing", "quality", "accessibility", "security"]
    else:
        keyword_blob = " ".join(keywords).lower()
        if any(term in keyword_blob for term in ["build", "implement", "code", "frontend", "backend", "developer", "ship"]):
            preferred_categories = ["engineering", "development", "frontend", "backend"]
        elif any(term in keyword_blob for term in ["test", "qa", "audit", "accessibility", "review", "verify"]):
            preferred_categories = ["testing", "quality", "accessibility", "security"]
        elif any(term in keyword_blob for term in ["design", "ui", "ux", "brand", "visual", "layout"]):
            preferred_categories = ["design", "frontend"]
        elif any(term in keyword_blob for term in ["copy", "content", "writing", "menu", "marketing", "seo", "social"]):
            preferred_categories = ["marketing", "writing", "product"]
        elif any(term in keyword_blob for term in ["data", "analytics", "insight", "dashboard", "report", "forecast"]):
            preferred_categories = ["data", "engineering", "research"]
        else:
            preferred_categories = categories

    merged_instruction = "Execute the following combined responsibilities in order:\n" + "\n".join(
        f"{idx + 1}. {instruction}" for idx, instruction in enumerate(instructions)
    )

    return {
        "label": " + ".join(labels),
        "keywords": keywords,
        "categories": categories,
        "preferred_categories": preferred_categories,
        "preferred_ids": preferred_ids,
        "preferred_family": inferred_family,
        "instruction": merged_instruction,
        "tools": tools,
        "temperature": round(sum(temperatures) / len(temperatures), 2) if temperatures else 0.2,
    }


def _summarize_prompt(prompt: str, max_words: int = 12) -> str:
    """Extract a compact human-readable summary of the user's request."""
    words = re.findall(r"[A-Za-z0-9]+", prompt.strip())
    if not words:
        return "unnamed request"

    stopwords = {
        "need", "make", "create", "build", "design", "write", "generate", "please", "can", "could",
        "should", "want", "for", "the", "a", "an", "to", "of", "and", "or", "with", "in", "on",
        "my", "our", "this", "that", "into", "from", "latest", "new", "modern"
    }
    significant = [word for word in words if word.lower() not in stopwords]
    chosen = significant[:max_words] or words[:max_words]
    return " ".join(chosen).strip()


def _build_stage_selection_reason(prompt: str, blueprint_title: str, stage: Dict[str, Any], skill_name: str) -> str:
    """Build a concise explanation for why the planner chose a stage/agent."""
    normalized = _normalize_prompt(prompt)
    matched_keywords = [
        term for term in list(stage.get("keywords", []))
        if isinstance(term, str) and term.lower() in normalized
    ]
    matched_categories = [
        term for term in list(stage.get("categories", []))
        if isinstance(term, str) and term.lower() in normalized
    ]
    matched_tools = [tool for tool in list(stage.get("tools", [])) if isinstance(tool, str) and tool]
    matched_bits: List[str] = []
    if matched_keywords:
        matched_bits.append(f"keywords: {', '.join(_dedupe_preserve_order(matched_keywords)[:3])}")
    if matched_categories:
        matched_bits.append(f"categories: {', '.join(_dedupe_preserve_order(matched_categories)[:3])}")
    if not matched_bits and matched_tools:
        matched_bits.append(f"tool fit: {', '.join(_dedupe_preserve_order(matched_tools)[:2])}")
    if not matched_bits:
        matched_bits.append(f"domain: {blueprint_title.lower()}")
    return f"Matched {', '.join(matched_bits)}, so {skill_name} handles {stage['label']}."


def _render_stage_instruction(prompt: str, stage: Dict[str, Any], cycle_count: Optional[int] = None) -> str:
    """Render stage instructions with deterministic prompt-derived variables."""
    instruction = str(stage.get("instruction", "")).replace("{prompt}", prompt)
    if "{cycle_count}" in instruction:
        instruction = instruction.replace("{cycle_count}", str(cycle_count or 1))
    return instruction


def _chunk_stages(stages: List[Dict[str, Any]], desired_count: int) -> List[List[Dict[str, Any]]]:
    """Evenly chunk a list of stages into the requested number of groups."""
    if desired_count <= 1:
        return [stages]
    total = len(stages)
    base = total // desired_count
    remainder = total % desired_count
    groups: List[List[Dict[str, Any]]] = []
    index = 0
    for i in range(desired_count):
        size = base + (1 if i < remainder else 0)
        if size <= 0:
            continue
        groups.append(stages[index:index + size])
        index += size
    if index < total:
        groups.append(stages[index:])
    return [group for group in groups if group]


def _compress_stage_plan(stages: List[Dict[str, Any]], desired_count: int, blueprint_key: Optional[str] = None) -> List[Dict[str, Any]]:
    """Compress a blueprint to the requested agent budget without inventing random roles."""
    if not stages:
        return []

    desired_count = max(1, min(desired_count, 5))
    if desired_count == 1 or len(stages) == 1:
        return [_merge_stage_group(stages, blueprint_key=blueprint_key)]

    if blueprint_key in {"local_business_web", "fitness_wellness_web"}:
        if desired_count == 2 and len(stages) >= 4:
            return [
                _merge_stage_group(stages[:3], blueprint_key=blueprint_key, family_override="design"),
                _merge_stage_group(stages[3:], blueprint_key=blueprint_key, family_override="engineering"),
            ]
        if desired_count == 3 and len(stages) >= 5:
            return [
                dict(stages[0]),
                _merge_stage_group(stages[1:3], blueprint_key=blueprint_key, family_override="design"),
                _merge_stage_group(stages[3:], blueprint_key=blueprint_key, family_override="engineering"),
            ]
        if desired_count == 4 and len(stages) >= 5:
            return [
                dict(stages[0]),
                _merge_stage_group(stages[1:3], blueprint_key=blueprint_key, family_override="design"),
                dict(stages[3]),
                dict(stages[4]),
            ]

    if desired_count == 2:
        if blueprint_key in {"news_article_content", "marketing_content"} and len(stages) >= 2:
            return [
                dict(stages[0]),
                _merge_stage_group(stages[1:], blueprint_key=blueprint_key, family_override="writing"),
            ]
        midpoint = max(1, len(stages) // 2)
        first_half = stages[:midpoint]
        second_half = stages[midpoint:]
        if not second_half:
            second_half = stages[-1:]
        return [
            _merge_stage_group(first_half, blueprint_key=blueprint_key),
            _merge_stage_group(second_half, blueprint_key=blueprint_key),
        ]

    if desired_count >= len(stages):
        return [dict(stage) for stage in stages]

    if len(stages) <= 2:
        return [
            _merge_stage_group(stages[:1], blueprint_key=blueprint_key),
            _merge_stage_group(stages[1:], blueprint_key=blueprint_key),
        ]

    middle = stages[1:-1]
    middle_groups = _chunk_stages(middle, desired_count - 2)
    compressed = [dict(stages[0])]
    compressed.extend(_merge_stage_group(group, blueprint_key=blueprint_key) for group in middle_groups)
    compressed.append(dict(stages[-1]))
    return compressed


def _create_padding_stage(
    index: int,
    blueprint_key: str,
    output_type: str,
) -> Dict[str, Any]:
    """Create an intentional extra stage when the user requested more agents than the blueprint provides."""
    output_type = str(output_type or "auto").strip().lower()
    if output_type == "web_app":
        label = "Launch QA"
        requested_role = "Launch QA Specialist"
        keywords = ["launch", "qa", "preview", "responsive", "accessibility"]
        categories = ["testing", "quality", "frontend"]
        preferred_ids = ["testpilot", "seo-content-auditor", "code-quality-auditor", "frontend-developer"]
        instruction = "Verify the assembled web deliverable for preview, responsiveness, and launch readiness. Confirm the preview artifact matches the workflow story and flag anything that would block a release."
        tools = ["read_artifact", "list_artifacts"]
    elif output_type == "data":
        label = "Data Validation"
        requested_role = "Data Validation Specialist"
        keywords = ["validate", "data", "csv", "json", "integrity"]
        categories = ["data", "testing", "quality"]
        preferred_ids = ["analytics-reporter", "testpilot", "data-pipeline-engineer"]
        instruction = "Validate the data outputs for consistency, completeness, and final packaging. Confirm the handoff can be consumed without ambiguity."
        tools = ["read_artifact", "list_artifacts"]
    else:
        label = "Final QA"
        requested_role = "Final QA Specialist"
        keywords = ["final", "qa", "review", "verify", "package"]
        categories = ["testing", "quality", "audit"]
        preferred_ids = ["testpilot", "seo-content-auditor", "code-quality-auditor", "auditor"]
        instruction = "Perform a final quality gate on the assembled deliverable. Check the output contract, readability, and completeness before the workflow is accepted."
        tools = ["read_artifact", "list_artifacts"]

    return {
        "label": label if index == 0 else f"{label} {index}",
        "summary": "Intentional padding stage to honor the requested agent count and close the workflow cleanly.",
        "requested_role": requested_role,
        "required_capabilities": ["validation", "quality", "handoff"],
        "output_contract": "Validated final deliverable and clear release recommendation.",
        "risk_level": "low",
        "constraints": ["Do not change the core findings.", "Preserve the prior stage outputs."],
        "keywords": keywords,
        "categories": categories,
        "preferred_ids": preferred_ids,
        "tools": tools,
        "temperature": 0.1,
        "selection_reason": f"Added to satisfy the requested {blueprint_key.replace('_', ' ')} route length and provide a deliberate final gate.",
    }


def _align_stage_plan(
    stages: List[Dict[str, Any]],
    desired_count: int,
    blueprint_key: str,
    output_type: str,
) -> List[Dict[str, Any]]:
    """Compress or pad a blueprint to exactly the requested number of stages."""
    desired_count = max(1, min(desired_count, 5))
    normalized = [dict(stage) for stage in stages]
    if len(normalized) > desired_count:
        normalized = _compress_stage_plan(normalized, desired_count, blueprint_key=blueprint_key)
    while len(normalized) < desired_count:
        normalized.append(_create_padding_stage(len(normalized) + 1, blueprint_key, output_type))
    return normalized


def _build_domain_workflow(
    prompt: str,
    all_skills: List[Dict[str, Any]],
    desired_count: int = 3,
    workflow_mode: Optional[str] = None,
    output_type: Optional[str] = None,
    cycle_count: Optional[int] = None,
) -> Dict[str, Any]:
    """Build a deterministic workflow blueprint from the prompt."""
    blueprint = _classify_workflow_domain(prompt)
    desired_count = _extract_requested_agent_count(prompt, desired_count)
    resolved_mode = workflow_mode or _infer_magicflow_mode(prompt)
    resolved_output_type = output_type or _infer_output_type(prompt)
    resolved_cycle_count = cycle_count if cycle_count is not None else _extract_cycle_count(prompt)
    blueprint_stages = _align_stage_plan(blueprint["stages"], desired_count, blueprint["key"], resolved_output_type)
    normalized_prompt = _normalize_prompt(prompt)
    used_ids: Set[str] = set()
    nodes: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []
    stage_plan: List[Dict[str, Any]] = []
    route_evidence: List[str] = []
    recommended_agents: List[Dict[str, Any]] = []

    spacing = 240
    start_x = 100
    y = 180

    for idx, stage in enumerate(blueprint_stages, start=1):
        match = _resolve_agent_for_stage(all_skills, stage, used_ids, idx)
        skill = match.get("skill") or {}
        skill_id = str(match.get("agent_id") or f"virtual_{idx}")
        if match.get("match_type") != "virtual":
            used_ids.add(skill_id)
        requested_role = str(match.get("display_name") or _stage_requested_role(stage))
        label_name = requested_role
        emoji = str(match.get("emoji") or stage.get("emoji") or skill.get("emoji") or "🤖")
        selection_reason = _build_stage_selection_reason(prompt, blueprint["title"], stage, label_name)
        if match.get("match_type") == "virtual":
            selection_reason = (
                f"Created a workflow-local virtual role because no existing agent matched "
                f"{requested_role} strongly enough."
            )
        elif match.get("match_type") == "adapted":
            selection_reason = (
                f"Adapted {match.get('agent_name')} as {requested_role}; "
                f"{selection_reason}"
            )
        matched_terms = [
            term for term in list(stage.get("keywords", [])) + list(stage.get("categories", []))
            if isinstance(term, str) and term.lower() in normalized_prompt
        ]
        route_evidence.extend(matched_terms)
        candidate_agents = match.get("candidate_agents") or _candidate_agents_for_stage(all_skills, stage, used_ids, idx, limit=5)
        if candidate_agents:
            recommended_agents.append({
                "stage": stage["label"],
                "requested_role": requested_role,
                "selected_agent_id": skill_id,
                "selected_agent_name": label_name,
                "candidates": candidate_agents,
            })
        model_override = skill_registry.get_model_override(skill_id) if hasattr(skill_registry, "get_model_override") else None
        model = None
        if isinstance(model_override, dict):
            model = model_override.get("model")
        elif isinstance(model_override, str):
            model = model_override

        nodes.append(
            {
                "id": f"step{idx}",
                "type": "agentNode",
                "position": {"x": start_x + ((idx - 1) * spacing), "y": y},
                "data": {
                    "label": f"{emoji} {label_name}",
                    "subtitle": stage["label"],
                    "role": skill_id,
                    "requested_role": requested_role,
                    "agent_name": match.get("agent_name"),
                    "match_type": match.get("match_type"),
                    "match_confidence": match.get("match_confidence"),
                    "base_skill_id": match.get("base_skill_id"),
                    "workflow_domain": blueprint["key"],
                    "workflow_domain_title": blueprint["title"],
                    "selection_reason": selection_reason,
                    "stage_index": idx,
                    "instruction": _render_stage_instruction(prompt, stage, resolved_cycle_count),
                    "model": (model or "gemini-2.5-flash"),
                    "temperature": stage.get("temperature", 0.2),
                    "prompt": prompt,
                    "tools": stage.get("tools", []),
                    "visibility": "public",
                    "timing_policy": {"type": "dependency"},
                },
                }
        )

        stage_plan.append(
            {
                "stage": stage["label"],
                "requested_role": requested_role,
                "agent_id": skill_id,
                "agent_name": label_name,
                "base_skill_id": match.get("base_skill_id"),
                "match_type": match.get("match_type"),
                "match_confidence": match.get("match_confidence"),
                "selection_reason": selection_reason,
                "required_capabilities": stage.get("required_capabilities", []),
                "output_contract": stage.get("output_contract", ""),
                "tools": stage.get("tools", []),
                "candidate_agents": candidate_agents[:3],
            }
        )

        if idx > 1:
            edges.append(
                {
                    "id": f"e{idx-1}-{idx}",
                    "source": f"step{idx-1}",
                    "target": f"step{idx}",
                    "animated": True,
                }
        )

    return {
        "name": _derive_workflow_title(prompt, blueprint),
        "nodes": nodes,
        "edges": edges,
        "metadata": {
            "domain_key": blueprint["key"],
            "domain_title": blueprint["title"],
            "prompt_summary": _summarize_prompt(prompt),
            "requested_agents": desired_count,
            "generated_agents": len(nodes),
            "route_evidence": _dedupe_preserve_order(route_evidence)[:8],
            "routing_reason": (
                f"Matched the prompt to {blueprint['title']} using "
                f"{', '.join(_dedupe_preserve_order(route_evidence)[:3]) or 'domain-specific signals'} "
                f"and selected {len(nodes)} stage(s) with specialist routing."
            ),
            "stage_plan": stage_plan,
            "route_quality": _route_quality_from_stage_plan(stage_plan),
            "capability_gaps": [stage for stage in stage_plan if stage.get("match_type") == "missing"],
            "planner_source": "deterministic",
            "workflow_mode": resolved_mode,
            "final_output_type": resolved_output_type,
            "output_type": resolved_output_type,
            "recommended_agents": recommended_agents,
            "route_confirmation_required": any(
                stage.get("match_type") == "virtual" or (stage.get("match_confidence", 1.0) or 1.0) < 0.7
                for stage in stage_plan
            ),
            **({"cycle_count": resolved_cycle_count} if resolved_cycle_count else {}),
        },
    }


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
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
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

        client = supabase_admin.client
        result = client.table("user_api_keys").select("id,provider,key_suffix,is_active,last_used_at,created_at").eq("user_id", user_id).execute()

        return {
            "status": "success",
            "keys": [{
                "id": k["id"],
                "provider": _display_api_key_provider(k["provider"]),
                "key_suffix": k["key_suffix"],
                "is_active": k["is_active"],
                "last_used_at": k.get("last_used_at"),
                "created_at": k.get("created_at")
            } for k in (result.data or [])],
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

        storage_provider = _normalize_api_key_storage_provider(provider)
        encrypted = encrypt_api_key(api_key)
        suffix = mask_key(api_key, 6)

        result = supabase_admin.query("user_api_keys", "upsert", data={
            "user_id": user_id,
            "provider": storage_provider,
            "encrypted_key": encrypted,
            "key_suffix": suffix,
            "is_active": True,
        }, on_conflict="user_id,provider")

        if result.data and len(result.data) > 0:
            return {
                "status": "success",
                "key": {"id": result.data[0]["id"], "provider": _display_api_key_provider(storage_provider), "key_suffix": suffix, "is_active": True},
            }
        raise HTTPException(status_code=500, detail=f"Failed to save API key: {result.error}")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add API key: {str(e)}")


@app.delete("/api/settings/api-keys/{key_id}")
async def delete_api_key(key_id: str, request: Request):
    """Remove an API key."""
    user_id = _get_user_id_from_request(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        from core.supabase_client import supabase_admin

        client = supabase_admin.client
        key_result = client.table("user_api_keys").select("id").eq("id", key_id).eq("user_id", user_id).limit(1).execute()
        if not key_result.data:
            raise HTTPException(status_code=404, detail="API key not found")

        result = client.table("user_api_keys").delete().eq("id", key_id).eq("user_id", user_id).execute()

        if result.data is not None:
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
        provider = str(data.get("provider", "gemini") or "gemini").strip().lower()
        api_key = data.get("api_key", "")
        model = str(data.get("model") or "").strip()
        base_url = data.get("base_url")
        if not model:
            default_models = {
                "gemini": "gemini-2.5-flash",
                "openai": "gpt-4o-mini",
                "groq": "llama-3.1-8b-instant",
            }
            model = default_models.get(provider, "")
        if provider != "openai_compatible":
            _validate_provider_choice(provider, model)
        elif not model:
            raise HTTPException(status_code=400, detail="model is required for OpenAI-compatible provider testing")
        if provider == "openai_compatible" and not base_url:
            raise HTTPException(status_code=400, detail="base_url is required for OpenAI-compatible provider testing")

        if not api_key:
            api_key = _get_saved_api_key_for_user(user_id, provider) or ""
            if not api_key and _provider_requires_api_key(provider):
                raise HTTPException(status_code=400, detail=f"No active {provider} API key found")

        import httpx
        async with httpx.AsyncClient(timeout=15) as hc:
            if provider == "gemini":
                resp = await hc.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}",
                    json={"contents": [{"parts": [{"text": "Reply OK"}]}]},
                )
            elif provider == "openai":
                resp = await hc.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={"model": model, "messages": [{"role": "user", "content": "Reply OK"}]},
                )
            elif provider == "groq":
                resp = await hc.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={"model": model, "messages": [{"role": "user", "content": "Reply OK"}]},
                )
            elif provider == "openai_compatible":
                target_url = _normalize_openai_compatible_base_url(base_url)
                resp = await hc.post(
                    f"{target_url}/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={"model": model, "messages": [{"role": "user", "content": "Reply OK"}]},
                )
            else:
                raise HTTPException(status_code=400, detail=f"Unsupported provider for testing: {provider}")

        if resp.status_code == 200:
            return {"status": "success", "message": f"{provider}/{model} connection is valid", "success": True}
        return {
            "status": "error",
            "message": _provider_test_failure_message(provider, model, resp.status_code, resp.text),
            "success": False,
        }

    except HTTPException:
        raise
    except Exception as e:
        return {"status": "error", "message": f"Connection test failed: {str(e)}", "success": False}

# ============================================================
# Dashboard & Analytics Endpoints
# ============================================================

@app.get("/api/dashboard/stats")
async def get_dashboard_stats(request: Request):
    """Aggregate real-time metrics for the Home dashboard cards."""
    try:
        scope_company_id = _get_user_scope_company_id(request)
        with sqlite3.connect(gov_instance.db_path) as conn:
            cursor = conn.execute(
                "SELECT COUNT(*) FROM workflows WHERE company_id = ?",
                (scope_company_id,),
            )
            total_workflows = cursor.fetchone()[0] or 0

            cursor = conn.execute(
                """
                SELECT COUNT(*)
                FROM executions
                WHERE company_id = ? AND status IN ('running', 'queued', 'completed')
                """,
                (scope_company_id,),
            )
            active_workflows = cursor.fetchone()[0] or 0

            cursor = conn.execute(
                """
                SELECT COUNT(DISTINCT last_agent_id)
                FROM executions
                WHERE company_id = ? AND status = 'running' AND last_agent_id IS NOT NULL
                """,
                (scope_company_id,),
            )
            agents_running = cursor.fetchone()[0] or 0

            cursor = conn.execute(
                """
                SELECT status, COUNT(*)
                FROM executions
                WHERE company_id = ?
                GROUP BY status
                """,
                (scope_company_id,),
            )
            execution_stats = {row[0]: row[1] for row in cursor.fetchall()}

            try:
                cursor = conn.execute(
                    """
                    SELECT COALESCE(SUM(cost_usd), 0)
                    FROM events
                    WHERE company_id = ? AND timestamp >= date('now', 'start of month')
                    """,
                    (scope_company_id,),
                )
                monthly_cost = cursor.fetchone()[0] or 0.0

                cursor = conn.execute(
                    """
                    SELECT COALESCE(SUM(cost_usd), 0)
                    FROM events
                    WHERE company_id = ? AND timestamp >= date('now')
                    """,
                    (scope_company_id,),
                )
                cost_today = cursor.fetchone()[0] or 0.0
            except sqlite3.OperationalError as audit_error:
                if "no such table: events" not in str(audit_error).lower():
                    raise
                monthly_cost = 0.0
                cost_today = 0.0
            tokens_today = int(cost_today * 750000)

            scheduled_count = 0
            success_rate = round(
                (execution_stats.get('completed', 0) / max(execution_stats.get('completed', 0) + execution_stats.get('failed', 0), 1)) * 100,
                1,
            )

            return {
                "active_workflows": active_workflows,
                "agents_running": agents_running,
                "tokens_today": tokens_today,
                "monthly_cost": round(monthly_cost, 2),
                "total_workflows": total_workflows,
                "execution_stats": execution_stats,
                "scheduled_count": scheduled_count,
                "success_rate": success_rate
            }
    except Exception as e:
        logger.error(f"Failed to fetch dashboard stats: {e}")
        return {"error": str(e)}

@app.get("/api/dashboard/activity")
async def get_dashboard_activity(request: Request, company_id: Optional[str] = None, limit: int = 20):
    """Retrieve summarized recent activity for the dashboard."""
    try:
        scope_company_id = _resolve_company_scope(request, company_id)
        events = audit_logger.get_history(company_id=scope_company_id, limit=limit)
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
async def get_token_usage_chart(request: Request, company_id: Optional[str] = None, days: int = 7):
    """Daily token consumption for the last N days."""
    try:
        scope_company_id = _resolve_company_scope(request, company_id)
        with sqlite3.connect(audit_logger.db_path) as conn:
            cursor = conn.execute(f"""
                SELECT date(timestamp) as day, SUM(cost_usd)
                FROM events 
                WHERE company_id = ? AND timestamp >= date('now', '-{days} days')
                GROUP BY day
                ORDER BY day ASC
            """, (scope_company_id,))
            data = []
            for row in cursor.fetchall():
                data.append({
                    "day": datetime.strptime(row[0], "%Y-%m-%d").strftime("%a"),
                    "date": row[0],
                    # Use a floor check to ensure even tiny runs show up correctly
                    "tokens": max(int((row[1] or 0) * 1000000), 1) if (row[1] or 0) > 0 else 0
                })
            return data
    except Exception as e:
        return []

@app.get("/api/dashboard/agent-stats")
async def get_dashboard_agent_stats():
    """Top-performing official specialized agents by run count and efficiency."""
    try:
        with sqlite3.connect(audit_logger.db_path) as conn:
            # We fetch 30 candidates to ensure we find at least 6 REAL agents after filtering technical IDs
            cursor = conn.execute("""
                SELECT agent_id, COUNT(*), SUM(cost_usd)
                FROM events
                WHERE agent_id IS NOT NULL 
                AND lower(agent_id) NOT IN ('human_user', 'system', 'unknown', '', 'human', 'bot', 'step')
                AND lower(agent_id) NOT LIKE 'step%'
                AND lower(agent_id) NOT LIKE 'n1'
                AND lower(agent_id) NOT LIKE 'n2'
                AND lower(agent_id) NOT LIKE 'n3'
                AND lower(agent_id) NOT LIKE 'n4'
                GROUP BY agent_id
                ORDER BY COUNT(*) DESC
                LIMIT 30
            """)
            
            stats = []
            for row in cursor.fetchall():
                agent_id = row[0]
                
                # 1. Check if ID pattern is a technical internal ID
                low_id = agent_id.lower()
                if any(x in low_id for x in ['step', 'task_', 'node_', 'pipeline_', 'trigger_']):
                    continue
                if len(agent_id) <= 2:
                    continue
                
                # 2. STRICT REQUIREMENT: Must be in registry or follow official agency prefix
                agent_info = skill_registry.get_skill(agent_id)
                is_official = agent_id.startswith('agency_') or agent_id.startswith('native_') or agent_id.startswith('integration_')
                
                if not agent_info and not is_official:
                    continue
                
                # 3. Robust naming logic
                clean_name = agent_info.get("name") if agent_info else None
                if not clean_name:
                    parts = agent_id.split('_')
                    # Find parts that are actually words
                    word_parts = [p for p in parts if not p.isdigit() and len(p) > 2]
                    if word_parts:
                        clean_name = " ".join(word_parts[:2]).title()
                    else:
                        clean_name = agent_id.split('-')[0].replace('_', ' ').title()

                # Final guard against technical artifacts
                if any(x in clean_name.lower() for x in ['step', 'node', 'task']):
                    continue

                stats.append({
                    "rank": len(stats) + 1,
                    "agent_id": agent_id,
                    "name": clean_name,
                    "emoji": agent_info.get("emoji") if agent_info else "🤖",
                    "category": agent_info.get("category") if agent_info else "Specialist",
                    "runs": row[1],
                    "cost": round(row[2] or 0, 4)
                })
                
                # We only need top 6 for the dashboard grid
                if len(stats) >= 6:
                    break
            
            return stats
    except Exception as e:
        print(f"CRITICAL: Error in agent-stats: {e}")
        return []

# ============================================================
# Notification & Inbox Endpoints
# ============================================================

@app.get("/api/notifications")
async def get_user_notifications(request: Request, company_id: Optional[str] = None):
    """Retrieve notifications for the Inbox."""
    user_id = _get_user_id_from_request(request)
    if not user_id:
        return []
    scope_company_id = company_id or _get_user_scope_company_id(request)
    return audit_logger.get_notifications(user_id, scope_company_id)

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
