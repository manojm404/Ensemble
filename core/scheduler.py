import asyncio
import json
import logging
import sqlite3
import time
from datetime import datetime
from typing import List, Dict, Any, Optional

from core.audit import audit_logger

logger = logging.getLogger(__name__)

class SovereignScheduler:
    """
    Background scheduler for Ensemble.
    Polled-based execution of workflows stored in the scheduled_jobs table.
    """
    
    def __init__(self, check_interval: int = 60):
        self.check_interval = check_interval
        self.is_running = False
        self._task = None
        self.db_path = audit_logger.db_path

    async def start(self):
        """Start the background scheduler loop."""
        if self.is_running:
            return
        
        self.is_running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("🕒 [Scheduler] Sovereign Scheduler started (interval: %ds)", self.check_interval)

    async def stop(self):
        """Stop the background scheduler loop."""
        self.is_running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("🕒 [Scheduler] Sovereign Scheduler stopped")

    async def _loop(self):
        """Main execution loop."""
        while self.is_running:
            try:
                await self.check_and_run_jobs()
            except Exception as e:
                logger.error("🕒 [Scheduler] Error in check_and_run_jobs: %s", e)
            
            await asyncio.sleep(self.check_interval)

    async def check_and_run_jobs(self):
        """Query database for jobs that need execution."""
        now = datetime.utcnow().isoformat()
        
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute("""
                SELECT * FROM scheduled_jobs 
                WHERE next_run <= ? AND status != 'paused'
            """, (now,))
            
            jobs = cursor.fetchall()
            
            for job in jobs:
                await self._execute_job(dict(job))

    async def _execute_job(self, job: Dict[str, Any]):
        """Trigger a workflow run for a scheduled job."""
        job_id = job['id']
        workflow_id = job['workflow_id']
        name = job['name']
        
        logger.info("🚀 [Scheduler] Triggering scheduled job: %s (workflow: %s)", name, workflow_id)
        
        # Update last run/next run first to avoid double-triggering
        # (Very basic cron logic: just push next_run by 24h if it's daily, 
        # or remove if it's a one-off)
        last_run = datetime.utcnow().isoformat()
        
        # Simple interval logic for MVP
        next_run = None
        if job['cron_pattern'] == 'daily':
            # Add 24 hours
            from datetime import timedelta
            next_run = (datetime.utcnow() + timedelta(days=1)).isoformat()
        elif job['cron_pattern'] == 'hourly':
             # Add 1 hour
            from datetime import timedelta
            next_run = (datetime.utcnow() + timedelta(hours=1)).isoformat()
        
        with sqlite3.connect(self.db_path) as conn:
            if next_run:
                conn.execute("""
                    UPDATE scheduled_jobs 
                    SET last_run = ?, next_run = ?
                    WHERE id = ?
                """, (last_run, next_run, job_id))
            else:
                conn.execute("""
                    UPDATE scheduled_jobs 
                    SET last_run = ?, status = 'completed'
                    WHERE id = ?
                """, (last_run, job_id))

        # Actually run the workflow
        # Note: We import here to avoid circular dependencies
        try:
            # This is a placeholder for the actual workflow trigger logic
            # In a real implementation, we'd call the engine
             logger.info("🕒 [Scheduler] Running workflow %s...", workflow_id)
             
             # Notify user
             audit_logger.notify(
                 user_id="dev_user",
                 company_id="company_alpha",
                 title="Scheduled Job Started",
                 preview=f"Workflow '{name}' is now running automatically.",
                 content=f"The scheduled execution of {workflow_id} has commenced.",
                 category="automation"
             )
             
        except Exception as e:
            logger.error("🕒 [Scheduler] Failed to execute job %s: %s", job_id, e)

    def schedule_job(self, name: str, workflow_id: str, next_run: str, cron_pattern: str = None, payload: Dict = None):
        """Add a new job to the schedule."""
        payload_json = json.dumps(payload or {})
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT INTO scheduled_jobs (name, workflow_id, cron_pattern, next_run, payload_json)
                VALUES (?, ?, ?, ?, ?)
            """, (name, workflow_id, cron_pattern, next_run, payload_json))
        logger.info("🕒 [Scheduler] Job '%s' scheduled for %s", name, next_run)

# Singleton
scheduler = SovereignScheduler()
