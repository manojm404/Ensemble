"""
core/universal_importer.py
Main orchestrator for the Universal Agent Importer.

Handles the complete import pipeline:
1. Clone GitHub repo to temp directory
2. Run format detection on cloned repo
3. Parse each file using appropriate parser
4. Convert to Ensemble internal format (AgentData)
5. Group into packs by category
6. Create ZIP files for each pack
7. Update marketplace manifest
8. Clean up temp directory

Supports background job processing with progress tracking.
"""
import os
import sys
import json
import uuid
import time
import shutil
import tempfile
import logging
import threading
from typing import List, Dict, Any, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from enum import Enum

import requests

from core.format_detector import (
    detect_repo_clone, scan_directory, get_format_summary,
    FormatType, DetectedFile,
)
from core.parsers.agent_data import AgentData, AgentFormat, AgentCategory
from core.parsers.markdown_parser import MarkdownParser
from core.parsers.python_parser import PythonParser
from core.parsers.yaml_parser import YAMLParser
from core.parsers.json_parser import JSONParser
from core.parsers.text_parser import TextParser
from core.pack_builder import PackBuilder

logger = logging.getLogger(__name__)


class JobStatus(str, Enum):
    """Status values for import jobs."""
    PENDING = "pending"
    CLONING = "cloning"
    DETECTING = "detecting"
    PARSING = "parsing"
    BUILDING_PACKS = "building_packs"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class ImportJobStatus:
    """
    Status object for an import job.

    Tracks progress, packs created, errors, and timing.
    """
    job_id: str
    status: JobStatus
    progress: float = 0.0
    message: str = ""
    source_url: str = ""
    source_branch: str = "main"
    started_at: str = ""
    completed_at: str = ""
    total_files: int = 0
    processed_files: int = 0
    agents_found: int = 0
    packs_created: List[Dict[str, Any]] = field(default_factory=list)
    errors: List[Dict[str, Any]] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    result: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "job_id": self.job_id,
            "status": self.status.value if isinstance(self.status, JobStatus) else self.status,
            "progress": self.progress,
            "message": self.message,
            "source_url": self.source_url,
            "source_branch": self.source_branch,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "total_files": self.total_files,
            "processed_files": self.processed_files,
            "agents_found": self.agents_found,
            "packs_created": self.packs_created,
            "errors": self.errors,
            "warnings": self.warnings,
            "result": self.result,
        }

    @classmethod
    def create(
        cls,
        source_url: str,
        source_branch: str = "main",
        job_id: Optional[str] = None,
    ) -> "ImportJobStatus":
        """Create a new pending job."""
        return cls(
            job_id=job_id or str(uuid.uuid4()),
            status=JobStatus.PENDING,
            progress=0.0,
            message="Job queued",
            source_url=source_url,
            source_branch=source_branch,
            started_at=datetime.utcnow().isoformat() + "Z",
        )


class UniversalImporter:
    """
    Main orchestrator for importing agents from external sources.

    Manages the complete import pipeline with background job processing,
    progress tracking, and error handling.
    """

    def __init__(
        self,
        marketplace_dir: Optional[str] = None,
        temp_dir: Optional[str] = None,
        github_token: Optional[str] = None,
    ):
        """
        Initialize the Universal Importer.

        Args:
            marketplace_dir: Directory for marketplace packs (default: data/marketplace).
            temp_dir: Directory for temp files (default: system temp).
            github_token: GitHub token for authenticated requests.
        """
        self.marketplace_dir = marketplace_dir or "data/marketplace"
        self.temp_dir = temp_dir or tempfile.gettempdir()
        self.github_token = github_token or os.getenv("GITHUB_TOKEN", "")

        # Ensure marketplace directories exist
        os.makedirs(os.path.join(self.marketplace_dir, "zips"), exist_ok=True)

        # Job management
        self._jobs: Dict[str, ImportJobStatus] = {}
        self._job_threads: Dict[str, threading.Thread] = {}
        self._lock = threading.Lock()

        # Initialize parsers
        self._markdown_parser = MarkdownParser()
        self._python_parser = PythonParser()
        self._yaml_parser = YAMLParser()
        self._json_parser = JSONParser()
        self._text_parser = TextParser()

        logger.info(
            f"UniversalImporter initialized: marketplace={self.marketplace_dir}"
        )

    # -------------------------------------------------------------------------
    # Job Management
    # -------------------------------------------------------------------------

    def start_job(
        self,
        repo_url: str,
        branch: str = "main",
        job_id: Optional[str] = None,
        callback: Optional[Callable] = None,
    ) -> ImportJobStatus:
        """
        Start a background import job.

        Args:
            repo_url: GitHub repository URL or owner/repo string.
            branch: Branch to clone (default: main).
            job_id: Optional custom job ID.
            callback: Optional callback function(job_status) on completion.

        Returns:
            ImportJobStatus with job ID.
        """
        # Normalize repo URL
        normalized_url = self._normalize_repo_url(repo_url)

        job = ImportJobStatus.create(
            source_url=normalized_url,
            source_branch=branch,
            job_id=job_id,
        )

        with self._lock:
            self._jobs[job.job_id] = job

        # Start background thread
        thread = threading.Thread(
            target=self._run_import,
            args=(job, callback),
            daemon=True,
            name=f"import-{job.job_id[:8]}",
        )
        with self._lock:
            self._job_threads[job.job_id] = thread
        thread.start()

        logger.info(f"Started import job {job.job_id} for {normalized_url}")
        return job

    def check_status(self, job_id: str) -> Optional[ImportJobStatus]:
        """
        Check the status of an import job.

        Args:
            job_id: The job ID to check.

        Returns:
            ImportJobStatus or None if not found.
        """
        with self._lock:
            return self._jobs.get(job_id)

    def get_result(self, job_id: str) -> Optional[Dict[str, Any]]:
        """
        Get the result of a completed import job.

        Args:
            job_id: The job ID.

        Returns:
            Result dictionary or None if job not found/not completed.
        """
        job = self.check_status(job_id)
        if job and job.status == JobStatus.COMPLETED:
            return job.result
        return None

    def list_jobs(self) -> List[Dict[str, Any]]:
        """List all import jobs."""
        with self._lock:
            return [job.to_dict() for job in self._jobs.values()]

    def cancel_job(self, job_id: str) -> bool:
        """
        Cancel a running import job.

        Args:
            job_id: The job ID to cancel.

        Returns:
            True if job was cancelled, False if not found or already done.
        """
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return False

            if job.status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED):
                return False

            job.status = JobStatus.CANCELLED
            job.message = "Job cancelled by user"
            job.completed_at = datetime.utcnow().isoformat() + "Z"
            return True

    def clear_completed_jobs(self, older_than_seconds: float = 3600) -> int:
        """
        Remove completed/failed jobs older than the specified time.

        Args:
            older_than_seconds: Age threshold in seconds.

        Returns:
            Number of jobs cleared.
        """
        cutoff = time.time() - older_than_seconds
        cleared = 0

        with self._lock:
            to_remove = []
            for job_id, job in self._jobs.items():
                if job.status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED):
                    # Check age
                    if job.completed_at:
                        try:
                            completed_time = datetime.fromisoformat(
                                job.completed_at.replace("Z", "+00:00")
                            ).timestamp()
                            if completed_time < cutoff:
                                to_remove.append(job_id)
                        except (ValueError, AttributeError):
                            to_remove.append(job_id)

            for job_id in to_remove:
                del self._jobs[job_id]
                if job_id in self._job_threads:
                    del self._job_threads[job_id]
                cleared += 1

        return cleared

    # -------------------------------------------------------------------------
    # Import Pipeline
    # -------------------------------------------------------------------------

    def _run_import(
        self, job: ImportJobStatus, callback: Optional[Callable]
    ):
        """
        Run the import pipeline in a background thread.

        Args:
            job: The job status object to update.
            callback: Optional completion callback.
        """
        clone_path = None
        try:
            # Step 1: Clone repository
            job.status = JobStatus.CLONING
            job.progress = 5.0
            job.message = "Cloning repository..."
            logger.info(f"[{job.job_id}] Cloning {job.source_url}")

            # Ensure temp directory exists
            if not os.path.exists(self.temp_dir):
                os.makedirs(self.temp_dir, exist_ok=True)

            clone_path = self._clone_repo(job.source_url, job.source_branch, job)

            # Step 2: Detect formats
            job.status = JobStatus.DETECTING
            job.progress = 20.0
            job.message = "Detecting agent file formats..."
            logger.info(f"[{job.job_id}] Detecting formats in {clone_path}")

            detection_result = detect_repo_clone(clone_path, min_confidence=0.3)
            detected_files = detection_result["detected_files"]
            job.total_files = detection_result["total_detected"]
            job.progress = 30.0

            if job.total_files == 0:
                job.warnings.append("No agent files detected in repository")
                job.status = JobStatus.COMPLETED
                job.progress = 100.0
                job.message = "No agent files found"
                job.result = {"agents": [], "packs": [], "summary": detection_result.get("summary", {})}
                self._finalize_job(job, callback)
                return

            # Step 3: Parse files
            job.status = JobStatus.PARSING
            job.progress = 35.0
            job.message = "Parsing agent files..."

            all_agents = self._parse_files(detected_files, job)
            job.agents_found = len(all_agents)
            job.progress = 60.0

            if not all_agents:
                job.warnings.append("No agents could be parsed from detected files")

            # Update source info on all agents
            for agent in all_agents:
                agent.source_repo = job.source_url
                agent.source_branch = job.source_branch

            # Step 4: Build packs
            job.status = JobStatus.BUILDING_PACKS
            job.progress = 65.0
            job.message = "Building category packs..."

            pack_builder = PackBuilder(marketplace_dir=self.marketplace_dir)
            packs = pack_builder.build_from_agents(all_agents, job.job_id)
            job.packs_created = packs
            job.progress = 90.0

            # Step 5: Update marketplace manifest
            self._update_marketplace_manifest(packs)

            # Complete
            job.status = JobStatus.COMPLETED
            job.progress = 100.0
            job.message = f"Import complete: {len(all_agents)} agents, {len(packs)} packs"
            job.completed_at = datetime.utcnow().isoformat() + "Z"

            job.result = {
                "agents": [a.to_dict() for a in all_agents],
                "packs": packs,
                "summary": detection_result.get("summary", {}),
                "total_agents": len(all_agents),
                "total_packs": len(packs),
            }

            logger.info(
                f"[{job.job_id}] Import complete: {len(all_agents)} agents, "
                f"{len(packs)} packs"
            )

        except Exception as e:
            job.status = JobStatus.FAILED
            job.message = f"Import failed: {str(e)}"
            job.completed_at = datetime.utcnow().isoformat() + "Z"
            job.errors.append({
                "error": str(e),
                "stage": job.status.value,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            })
            logger.error(f"[{job.job_id}] Import failed: {e}", exc_info=True)

        finally:
            # Cleanup temp directory
            if clone_path and os.path.exists(clone_path):
                try:
                    shutil.rmtree(clone_path)
                    logger.debug(f"[{job.job_id}] Cleaned up temp dir: {clone_path}")
                except OSError as e:
                    logger.warning(f"[{job.job_id}] Failed to cleanup: {e}")

            self._finalize_job(job, callback)

    def _finalize_job(
        self, job: ImportJobStatus, callback: Optional[Callable]
    ):
        """Finalize a job and call callback if provided."""
        if callback:
            try:
                callback(job)
            except Exception as e:
                logger.error(f"Job callback failed: {e}")

    # -------------------------------------------------------------------------
    # Pipeline Steps
    # -------------------------------------------------------------------------

    def _clone_repo(
        self, repo_url: str, branch: str, job: ImportJobStatus
    ) -> str:
        """
        Clone a GitHub repository to a temp directory.
        """
        # Normalize to standard github web URL for cloning
        if "api.github.com/repos/" in repo_url:
            parts = repo_url.split("/")
            clone_url = f"https://github.com/{parts[-2]}/{parts[-1]}"
        elif "github.com" in repo_url:
            clone_url = repo_url
        elif "/" in repo_url and not repo_url.startswith("http"):
            clone_url = f"https://github.com/{repo_url}"
        else:
            clone_url = repo_url

        # Create temp directory
        clone_dir = tempfile.mkdtemp(
            prefix=f"ensemble_import_{job.job_id[:8]}_",
            dir=self.temp_dir,
        )

        try:
            import subprocess
            logger.info(f"[{job.job_id}] Running git clone for {clone_url}")
            cmd = ["git", "clone", "--depth", "1"]
            if branch and branch != "main":
                cmd.extend(["-b", branch])
            cmd.extend([clone_url, clone_dir])
            
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            logger.info(f"[{job.job_id}] Git clone output: {result.stdout}")
        except subprocess.CalledProcessError as e:
            logger.error(f"Git clone failed: {e.stderr}")
            raise RuntimeError(f"Failed to clone repository from {clone_url}: {e.stderr}")

        job.progress = 15.0
        logger.info(f"[{job.job_id}] Cloned to {clone_dir}")
        return clone_dir

    def _get_api_url(self, repo_url: str) -> str:
        """Convert repo URL or owner/repo to GitHub API URL."""
        # If it's already an API URL
        if "api.github.com" in repo_url:
            return repo_url

        # If it's a web URL
        if "github.com" in repo_url:
            # Extract owner/repo from URL
            parts = repo_url.rstrip("/").split("/")
            if len(parts) >= 2:
                owner = parts[-2]
                repo = parts[-1]
                return f"https://api.github.com/repos/{owner}/{repo}"

        # If it's owner/repo format
        if "/" in repo_url and not repo_url.startswith("http"):
            owner, repo = repo_url.split("/", 1)
            return f"https://api.github.com/repos/{owner}/{repo}"

        # Try as-is
        return repo_url

    def _fetch_repo_contents(
        self, api_url: str, branch: str, job: ImportJobStatus
    ) -> List[tuple]:
        """
        Fetch all files from a GitHub repository.

        Returns:
            List of (relative_path, content) tuples.
        """
        headers = {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "Ensemble-Universal-Importer",
        }
        if self.github_token:
            headers["Authorization"] = f"token {self.github_token}"

        files: List[tuple] = []
        self._fetch_directory(api_url, branch, "", headers, files, job)
        return files

    def _fetch_directory(
        self,
        api_url: str,
        branch: str,
        path: str,
        headers: Dict[str, str],
        files: List[tuple],
        job: ImportJobStatus,
        max_depth: int = 10,
    ):
        """Recursively fetch all files from a GitHub directory."""
        if max_depth <= 0:
            return

        url = f"{api_url}/contents/{path}" if path else f"{api_url}/contents"
        params = {"ref": branch}

        try:
            resp = requests.get(url, headers=headers, params=params, timeout=30)
            resp.raise_for_status()
            items = resp.json()

            if not isinstance(items, list):
                return

            for item in items:
                item_type = item.get("type", "")
                item_path = item.get("path", "")
                item_name = item.get("name", "")

                if item_type == "file":
                    # Fetch file content
                    download_url = item.get("download_url", "")
                    if download_url:
                        try:
                            file_resp = requests.get(download_url, headers=headers, timeout=30)
                            file_resp.raise_for_status()
                            files.append((item_path, file_resp.text))
                        except requests.RequestException as e:
                            job.warnings.append(f"Failed to fetch {item_path}: {e}")
                elif item_type == "dir":
                    self._fetch_directory(
                        api_url, branch, item_path, headers, files, job, max_depth - 1
                    )

        except requests.RequestException as e:
            job.warnings.append(f"Failed to fetch directory {path}: {e}")

    def _parse_files(
        self, detected_files: List[Dict[str, Any]], job: ImportJobStatus
    ) -> List[AgentData]:
        """
        Parse detected files using appropriate parsers.

        Args:
            detected_files: List of detected file dictionaries.
            job: Job status for progress updates.

        Returns:
            List of AgentData objects.
        """
        all_agents: List[AgentData] = []
        total = len(detected_files)

        for i, df_dict in enumerate(detected_files):
            filepath = df_dict["path"]
            fmt = df_dict.get("format", "unknown")

            # Update progress
            job.processed_files = i + 1
            job.progress = 35.0 + (25.0 * (i + 1) / max(total, 1))
            job.message = f"Parsing file {i + 1}/{total}: {os.path.basename(filepath)}"

            try:
                agents = self._parse_single_file(filepath, fmt, job.source_url)
                all_agents.extend(agents)
            except Exception as e:
                job.errors.append({
                    "file": filepath,
                    "error": str(e),
                    "format": fmt,
                })
                job.warnings.append(f"Failed to parse {filepath}: {e}")

        return all_agents

    def _parse_single_file(
        self, filepath: str, fmt: str, source_url: str
    ) -> List[AgentData]:
        """Parse a single file using the appropriate parser."""
        if fmt == FormatType.MARKDOWN.value:
            return self._markdown_parser.parse(filepath)
        elif fmt == FormatType.PYTHON.value:
            return self._python_parser.parse(filepath)
        elif fmt == FormatType.YAML.value:
            return self._yaml_parser.parse(filepath)
        elif fmt == FormatType.JSON.value:
            return self._json_parser.parse(filepath)
        elif fmt == FormatType.TEXT.value:
            return self._text_parser.parse(filepath)
        else:
            return []

    def _update_marketplace_manifest(self, packs: List[Dict[str, Any]]):
        """
        Update the marketplace manifest with new packs.

        Appends or updates pack entries in packs.json.
        """
        manifest_path = os.path.join(self.marketplace_dir, "packs.json")

        # Load existing manifest
        existing_packs = []
        if os.path.exists(manifest_path):
            try:
                with open(manifest_path, "r", encoding="utf-8") as f:
                    manifest = json.load(f)
                    existing_packs = manifest.get("packs", [])
            except (json.JSONDecodeError, IOError) as e:
                logger.warning(f"Failed to load existing manifest: {e}")
                existing_packs = []

        # Create a lookup of existing packs by ID for updating
        pack_lookup = {p.get("id", ""): p for p in existing_packs if p.get("id")}

        # Add/update new packs
        for pack in packs:
            pack_id = pack.get("id", "")
            if pack_id and pack_id in pack_lookup:
                # Update existing
                existing = pack_lookup[pack_id]
                existing.update(pack)
            else:
                # Add new
                existing_packs.append(pack)

        # Write updated manifest
        manifest_data = {
            "packs": existing_packs,
            "total_packs": len(existing_packs),
            "last_updated": datetime.utcnow().isoformat() + "Z",
            "version": "2.0",
        }

        os.makedirs(os.path.dirname(manifest_path), exist_ok=True)
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest_data, f, indent=2, ensure_ascii=False)

        logger.info(f"Updated marketplace manifest: {len(existing_packs)} packs")

    # -------------------------------------------------------------------------
    # Utility Methods
    # -------------------------------------------------------------------------

    @staticmethod
    def _normalize_repo_url(repo_url: str) -> str:
        """Normalize a repository URL or owner/repo string."""
        repo_url = repo_url.strip().rstrip("/")

        # Remove .git suffix
        if repo_url.endswith(".git"):
            repo_url = repo_url[:-4]

        # If it's already a proper URL
        if repo_url.startswith("http"):
            return repo_url

        # If it's owner/repo format
        if "/" in repo_url:
            return f"https://github.com/{repo_url}"

        return repo_url

    @staticmethod
    def _guess_category_from_path(path: str) -> AgentCategory:
        """Guess agent category from file path."""
        path_lower = path.lower()

        category_map = {
            "agent": AgentCategory.DEVELOPMENT,
            "code": AgentCategory.DEVELOPMENT,
            "dev": AgentCategory.DEVELOPMENT,
            "engineer": AgentCategory.DEVELOPMENT,
            "review": AgentCategory.TESTING,
            "test": AgentCategory.TESTING,
            "security": AgentCategory.SECURITY,
            "data": AgentCategory.DATA,
            "ml": AgentCategory.AI_ML,
            "ai": AgentCategory.AI_ML,
            "research": AgentCategory.RESEARCH,
            "write": AgentCategory.WRITING,
            "doc": AgentCategory.DOCUMENTATION,
            "deploy": AgentCategory.DEVOPS,
            "infra": AgentCategory.INFRASTRUCTURE,
            "cloud": AgentCategory.CLOUD,
            "business": AgentCategory.BUSINESS,
            "auto": AgentCategory.AUTOMATION,
        }

        for keyword, category in category_map.items():
            if keyword in path_lower:
                return category

        return AgentCategory.GENERAL

    def get_stats(self) -> Dict[str, Any]:
        """Get importer statistics."""
        with self._lock:
            jobs_by_status = {}
            for job in self._jobs.values():
                status = job.status.value if isinstance(job.status, JobStatus) else job.status
                jobs_by_status[status] = jobs_by_status.get(status, 0) + 1

            return {
                "total_jobs": len(self._jobs),
                "jobs_by_status": jobs_by_status,
                "marketplace_dir": self.marketplace_dir,
            }


# -------------------------------------------------------------------------
# Module-level convenience functions
# -------------------------------------------------------------------------

_global_importer: Optional[UniversalImporter] = None


def get_importer(
    marketplace_dir: Optional[str] = None,
    github_token: Optional[str] = None,
) -> UniversalImporter:
    """
    Get or create the global UniversalImporter instance.

    Args:
        marketplace_dir: Directory for marketplace packs.
        github_token: GitHub token for authenticated requests.

    Returns:
        UniversalImporter instance.
    """
    global _global_importer
    if _global_importer is None:
        _global_importer = UniversalImporter(
            marketplace_dir=marketplace_dir,
            github_token=github_token,
        )
    return _global_importer


def import_repo(
    repo_url: str,
    branch: str = "main",
    wait: bool = False,
) -> ImportJobStatus:
    """
    Convenience function to import a repository.

    Args:
        repo_url: GitHub repository URL or owner/repo string.
        branch: Branch to import.
        wait: If True, wait for completion before returning.

    Returns:
        ImportJobStatus object.
    """
    importer = get_importer()
    job = importer.start_job(repo_url, branch)

    if wait:
        # Poll until complete
        while job.status in (
            JobStatus.PENDING, JobStatus.CLONING, JobStatus.DETECTING,
            JobStatus.PARSING, JobStatus.BUILDING_PACKS,
        ):
            time.sleep(1)
            job = importer.check_status(job.job_id) or job

    return job

# Global instance
universal_importer = UniversalImporter()
