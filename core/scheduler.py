"""
core/scheduler.py - Persistent background scheduler for Ensemble Sovereign workflows.

Polls the 'scheduled_jobs' table in audit.db and executes workflows via DAGWorkflowEngine.
Supports cron-like behavior (hourly, daily) and one-off tasks.
"""

import asyncio
import json
import logging
import sqlite3
import time
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

class SovereignScheduler:
    def __init__(self, audit_logger, dag_engine):
        self.audit = audit_logger
        self.dag_engine = dag_engine
        self.is_running = False
        self._task = None

    async def start(self):
        """Start the background polling loop."""
        if self.is_running:
            return
        
        self.is_running = True
        self._task = asyncio.create_task(self._poll_loop())
        logger.info("🚀 [SovereignScheduler] Background loop started")

    async def stop(self):
        """Stop the background polling loop."""
        self.is_running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("🛑 [SovereignScheduler] Background loop stopped")

    async def _poll_loop(self):
        """Poll the database every 60 seconds for due jobs."""
        while self.is_running:
            try:
                await self.check_and_run_jobs()
            except Exception as e:
                logger.error(f"⚠️ [SovereignScheduler] Error in poll loop: {e}")
            
            await asyncio.sleep(60)

    async def check_and_run_jobs(self):
        """Query DB for pending jobs that are due for execution."""
        now = datetime.utcnow().isoformat()
        
        with sqlite3.connect(self.audit.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                "SELECT * FROM scheduled_jobs WHERE status = 'pending' AND next_run <= ?",
                (now,)
            )
            jobs = cursor.fetchall()

        for job in jobs:
            await self._run_job(job)

    async def _run_job(self, job: sqlite3.Row):
        """Execute a single job and update its next run time."""
        job_id = job['id']
        name = job['name']
        workflow_id = job['workflow_id']
        cron = job['cron_pattern']
        payload = json.loads(job['payload_json'] or '{}')

        logger.info(f"🕒 [SovereignScheduler] Executing job '{name}' (WF: {workflow_id})")

        # 1. Update status to 'running'
        with sqlite3.connect(self.audit.db_path) as conn:
            conn.execute("UPDATE scheduled_jobs SET status = 'running', last_run = ? WHERE id = ?", 
                         (datetime.utcnow().isoformat(), job_id))

        # 2. Trigger Workflow (Mocking the fetch for now)
        try:
            # We need the full graph JSON for the DAG engine
            # In a real scenario, fetch this from the workflows table
            from core.governance import governance_manager
            wf_data = governance_manager.get_workflow(workflow_id)
            
            if wf_data and wf_data.get("graph"):
                # Run in background
                asyncio.create_task(self.dag_engine.execute_workflow(
                    workflow_id=workflow_id,
                    graph_json=wf_data["graph"],
                    initial_input=payload.get("input", f"Scheduled run: {name}"),
                    company_id=payload.get("company_id", "company_alpha")
                ))
                
                # Notify Inbox
                self.audit.notify(
                    user_id=payload.get("user_id", "dev_user"),
                    company_id=payload.get("company_id", "company_alpha"),
                    title=f"🕒 Scheduled Job Started: {name}",
                    preview=f"Workflow {workflow_id} is now executing in the background.",
                    content=f"Your scheduled Sovereign task '{name}' was triggered successfully at {datetime.utcnow().isoformat()}.",
                    category="system"
                )
            else:
                logger.error(f"❌ [SovereignScheduler] Workflow {workflow_id} not found for job {name}")

        except Exception as e:
            logger.error(f"❌ [SovereignScheduler] Failed to trigger job {name}: {e}")

        # 3. Calculate next run or mark complete
        next_run = None
        if cron == 'hourly':
            next_run = (datetime.utcnow() + timedelta(hours=1)).isoformat()
        elif cron == 'daily':
            next_run = (datetime.utcnow() + timedelta(days=1)).isoformat()
        
        status = 'pending' if next_run else 'completed'

        with sqlite3.connect(self.audit.db_path) as conn:
            conn.execute(
                "UPDATE scheduled_jobs SET status = ?, next_run = ? WHERE id = ?",
                (status, next_run, job_id)
            )

    def schedule_job(self, name: str, workflow_id: str, next_run: str, cron: Optional[str] = None, payload: Dict = None):
        """Insert a new job into the database."""
        payload_json = json.dumps(payload or {})
        with sqlite3.connect(self.audit.db_path) as conn:
            conn.execute(
                "INSERT INTO scheduled_jobs (name, workflow_id, next_run, cron_pattern, payload_json) VALUES (?, ?, ?, ?, ?)",
                (name, workflow_id, next_run, cron, payload_json)
            )
        logger.info(f"📅 [SovereignScheduler] Scheduled new job: {name}")

# Global singleton
scheduler = None

def init_scheduler(audit_logger, dag_engine):
    global scheduler
    scheduler = SovereignScheduler(audit_logger, dag_engine)
    return scheduler
