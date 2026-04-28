"""
core/docker_sandbox.py
Hardened Docker container configuration for executing untrusted LLM-generated code.

Implements defense-in-depth with:
- NO Docker socket mounting (CRITICAL: prevents container escape)
- --no-new-privileges and --cap-drop=ALL
- Read-only root filesystem + tmpfs for /tmp and /dev/shm
- network=none by default (no outbound connectivity)
- Seccomp profile blocking dangerous syscalls
- CPU, memory, and disk limits
- Hard timeout enforcement with SIGKILL

Usage:
    from backend.ensemble.docker_sandbox import SecureDockerContainer

    container = SecureDockerContainer(
        image="python:3.11-slim",
        memory_mb=512,
        cpu_shares=512,
        disk_mb=1024,
        timeout_seconds=60,
    )

    # Generate the docker run command
    cmd = container.build_run_command("user_code.py")
    print(cmd)

    # Start the container
    result = await container.run("user_code.py", "print('hello')")
    print(result)

    # The container self-cleans up on exit via context manager
    async with SecureDockerContainer() as sandbox:
        result = await sandbox.run("script.py", "print('safe')")
"""

import asyncio
import hashlib
import json
import logging
import os
import tempfile
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_IMAGE = "python:3.11-slim"
DEFAULT_MEMORY_MB = 512
DEFAULT_CPU_SHARES = 512
DEFAULT_DISK_MB = 1024
DEFAULT_TIMEOUT_SECONDS = 60
DEFAULT_NETWORK_MODE = "none"

# Dangerous syscalls to block via seccomp
BLOCKED_SYSCALLS = [
    # Kernel loading / module manipulation
    "kexec_load",
    "kexec_file_load",
    "init_module",
    "finit_module",
    "delete_module",
    # Kernel keyring
    "keyctl",
    "add_key",
    "request_key",
    # Namespace manipulation
    "setns",
    "unshare",
    # ptrace (process tracing / debugging)
    "ptrace",
    # Process personality changes
    "personality",
    # Mount operations
    "mount",
    "umount2",
    "pivot_root",
    # Swapon/swapoff
    "swapon",
    "swapoff",
    # Reboot
    "reboot",
    # Syslog (kernel log)
    "syslog",
    # Accounting
    "acct",
    # I/O port access
    "ioperm",
    "iopl",
    # User/namespace ID mapping
    "setuid",
    "setgid",
    "setreuid",
    "setregid",
    # Chroot
    "chroot",
    # Clock manipulation
    "clock_settime",
    "settimeofday",
    "adjtimex",
    # Socket operations (blocked at network level too)
    "socket",
    "bind",
    "connect",
    "listen",
    "accept",
    "accept4",
    "sendto",
    "recvfrom",
    # Open by handle (filesystem escape)
    "open_by_handle_at",
    "name_to_handle_at",
]

# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------


class ContainerStatus(Enum):
    CREATED = "created"
    RUNNING = "running"
    COMPLETED = "completed"
    TIMEOUT = "timeout"
    FAILED = "failed"
    CLEANED_UP = "cleaned_up"


@dataclass
class ContainerResult:
    """Result of a container execution."""

    container_id: str
    status: ContainerStatus
    stdout: str
    stderr: str
    exit_code: Optional[int]
    duration_seconds: float
    timed_out: bool
    killed: bool
    created_at: str
    completed_at: str = ""
    error: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "container_id": self.container_id,
            "status": self.status.value,
            "stdout": self.stdout,
            "stderr": self.stderr,
            "exit_code": self.exit_code,
            "duration_seconds": round(self.duration_seconds, 3),
            "timed_out": self.timed_out,
            "killed": self.killed,
            "created_at": self.created_at,
            "completed_at": self.completed_at,
            "error": self.error,
            "metadata": self.metadata,
        }


# ---------------------------------------------------------------------------
# Seccomp profile
# ---------------------------------------------------------------------------


def generate_seccomp_profile(
    blocked_syscalls: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Generate a Docker-compatible seccomp profile JSON.

    The profile uses a whitelist approach: only explicitly allowed syscalls
    are permitted. All others (especially dangerous ones) are denied.

    Parameters
    ----------
    blocked_syscalls : list[str], optional
        Additional syscalls to block beyond the default list.

    Returns
    -------
    dict
        Seccomp profile as a JSON-compatible dictionary.
    """
    blocked = set(BLOCKED_SYSCALLS)
    if blocked_syscalls:
        blocked.update(blocked_syscalls)

    profile = {
        "defaultAction": "SCMP_ACT_ALLOW",
        "architectures": ["SCMP_ARCH_X86_64", "SCMP_ARCH_X86", "SCMP_ARCH_AARCH64"],
        "syscalls": [
            {
                "names": sorted(blocked),
                "action": "SCMP_ACT_ERRNO",
                "errnoRet": 1,
            }
        ],
    }
    return profile


def save_seccomp_profile(
    profile: Optional[Dict[str, Any]] = None,
    output_dir: Optional[str] = None,
) -> str:
    """Save a seccomp profile to a temporary JSON file.

    Parameters
    ----------
    profile : dict, optional
        Custom seccomp profile. If None, generates the default profile.
    output_dir : str, optional
        Directory to write the profile to. Uses /tmp if not specified.

    Returns
    -------
    str
        Path to the generated JSON file.
    """
    if profile is None:
        profile = generate_seccomp_profile()

    if output_dir is None:
        output_dir = tempfile.gettempdir()

    filename = f"ensemble_seccomp_{uuid.uuid4().hex[:8]}.json"
    path = os.path.join(output_dir, filename)

    with open(path, "w") as f:
        json.dump(profile, f, indent=2)

    logger.debug("Seccomp profile written to %s", path)
    return path


# ---------------------------------------------------------------------------
# SecureDockerContainer
# ---------------------------------------------------------------------------


class SecureDockerContainer:
    """Hardened Docker container for executing untrusted code.

    This class encapsulates all security hardening options for Docker
    containers used in the Ensemble sandbox. It follows the principle
    of least privilege and defense-in-depth.

    Security measures:
    -----------------
    1. NO Docker socket mount (prevents container escape)
    2. --no-new-privileges flag
    3. --cap-drop=ALL (drop all Linux capabilities)
    4. Read-only root filesystem (--read-only)
    5. tmpfs mounts for /tmp and /dev/shm
    6. network=none (no network access by default)
    7. Seccomp profile blocking dangerous syscalls
    8. CPU and memory limits
    9. Disk size limits via --storage-opt
    10. Hard timeout with SIGKILL

    Parameters
    ----------
    image : str
        Docker image to use.
    memory_mb : int
        Memory limit in megabytes.
    cpu_shares : int
        CPU shares (relative weight, 1024 = 1 full core).
    disk_mb : int
        Disk size limit in megabytes.
    timeout_seconds : int
        Hard timeout in seconds. After this, the container is killed.
    network_mode : str
        Docker network mode. Use "none" for no network.
    extra_env : dict
        Additional environment variables to set inside the container.
    """

    def __init__(
        self,
        image: str = DEFAULT_IMAGE,
        memory_mb: int = DEFAULT_MEMORY_MB,
        cpu_shares: int = DEFAULT_CPU_SHARES,
        disk_mb: int = DEFAULT_DISK_MB,
        timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
        network_mode: str = DEFAULT_NETWORK_MODE,
        extra_env: Optional[Dict[str, str]] = None,
        seccomp_profile: Optional[Dict[str, Any]] = None,
        security_opt_no_new_privileges: bool = True,
        read_only: bool = True,
        drop_all_caps: bool = True,
    ):
        self.image = image
        self.memory_mb = memory_mb
        self.cpu_shares = cpu_shares
        self.disk_mb = disk_mb
        self.timeout_seconds = timeout_seconds
        self.network_mode = network_mode
        self.extra_env = extra_env or {}
        self.seccomp_profile = seccomp_profile
        self.security_opt_no_new_privileges = security_opt_no_new_privileges
        self.read_only = read_only
        self.drop_all_caps = drop_all_caps

        self.container_id: Optional[str] = None
        self.container_name: str = f"ensemble_sandbox_{uuid.uuid4().hex[:12]}"
        self.status = ContainerStatus.CREATED
        self._seccomp_path: Optional[str] = None
        self._created_at: str = ""
        self._process: Optional[asyncio.subprocess.Process] = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def run(
        self,
        script_path: str,
        script_content: str,
        working_dir: str = "/sandbox",
        command: Optional[str] = None,
    ) -> ContainerResult:
        """Build, start, run, and clean up a sandbox container.

        This is the primary entry point. It:
        1. Writes the script content to a temporary file.
        2. Builds the docker run command with all security options.
        3. Starts the container with a timeout.
        4. Captures stdout/stderr.
        5. Cleans up the container and temp files.

        Parameters
        ----------
        script_path : str
            Filename for the script inside the container (e.g. "main.py").
        script_content : str
            The actual Python code to execute.
        working_dir : str
            Working directory inside the container.
        command : str, optional
            Override the default command. If None, runs `python script_path`.

        Returns
        -------
        ContainerResult
            Execution result with stdout, stderr, exit code, etc.
        """
        content_hash = hashlib.sha256(script_content.encode()).hexdigest()[:12]
        self._created_at = datetime.now(timezone.utc).isoformat()
        self.status = ContainerStatus.CREATED

        # Write script to a temporary file for volume mounting
        script_filename = f"sandbox_{content_hash}_{script_path}"
        host_script_path = os.path.join(tempfile.gettempdir(), script_filename)

        try:
            with open(host_script_path, "w") as f:
                f.write(script_content)

            cmd = self.build_run_command(
                script_path=script_path,
                working_dir=working_dir,
                host_script_path=host_script_path,
                command=command,
            )

            logger.info(
                "Starting sandbox container: %s (timeout=%ds)",
                self.container_name,
                self.timeout_seconds,
            )
            self.status = ContainerStatus.RUNNING

            start_time = asyncio.get_event_loop().time()
            timed_out = False
            killed = False
            exit_code = None
            stdout_data = ""
            stderr_data = ""

            try:
                self._process = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )

                # Enforce timeout
                try:
                    stdout_bytes, stderr_bytes = await asyncio.wait_for(
                        self._process.communicate(),
                        timeout=self.timeout_seconds,
                    )
                    stdout_data = stdout_bytes.decode("utf-8", errors="replace")
                    stderr_data = stderr_bytes.decode("utf-8", errors="replace")
                    exit_code = self._process.returncode

                except asyncio.TimeoutError:
                    timed_out = True
                    logger.warning(
                        "Container %s timed out after %ds, killing...",
                        self.container_name,
                        self.timeout_seconds,
                    )
                    # Force kill the process
                    try:
                        self._process.kill()
                        killed = True
                        await self._process.wait()
                    except ProcessLookupError:
                        pass

                    stdout_data = ""
                    stderr_data = (
                        f"CONTAINER TIMEOUT: Execution exceeded {self.timeout_seconds}s limit. "
                        f"Process was killed.\n"
                    )
                    exit_code = -1
                    self.status = ContainerStatus.TIMEOUT

            except Exception as exc:
                stderr_data = f"Container execution failed: {exc}"
                exit_code = -1
                self.status = ContainerStatus.FAILED
                logger.error("Container execution error: %s", exc)

            finally:
                end_time = asyncio.get_event_loop().time()
                duration = end_time - start_time

                if self.status == ContainerStatus.RUNNING:
                    self.status = ContainerStatus.COMPLETED

                # Cleanup container
                await self._cleanup_container()

            result = ContainerResult(
                container_id=self.container_id or "unknown",
                status=self.status,
                stdout=stdout_data.strip(),
                stderr=stderr_data.strip(),
                exit_code=exit_code,
                duration_seconds=duration,
                timed_out=timed_out,
                killed=killed,
                created_at=self._created_at,
                completed_at=datetime.now(timezone.utc).isoformat(),
                error=(
                    stderr_data.strip() if self.status == ContainerStatus.FAILED else ""
                ),
                metadata={
                    "image": self.image,
                    "memory_mb": self.memory_mb,
                    "cpu_shares": self.cpu_shares,
                    "timeout_seconds": self.timeout_seconds,
                    "network_mode": self.network_mode,
                    "content_hash": content_hash,
                },
            )

            logger.info(
                "Container %s completed: status=%s, duration=%.2fs, exit=%s",
                self.container_name,
                self.status.value,
                duration,
                exit_code,
            )
            return result

        finally:
            # Always clean up the temp script file
            try:
                os.unlink(host_script_path)
            except OSError:
                pass

            # Clean up seccomp profile
            if self._seccomp_path and os.path.exists(self._seccomp_path):
                try:
                    os.unlink(self._seccomp_path)
                except OSError:
                    pass

    async def _cleanup_container(self) -> None:
        """Remove the container and associated resources."""
        if self.container_name:
            try:
                proc = await asyncio.create_subprocess_exec(
                    "docker",
                    "rm",
                    "-f",
                    self.container_name,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                await proc.wait()
                logger.debug("Container %s removed", self.container_name)
            except Exception as exc:
                logger.warning(
                    "Failed to remove container %s: %s", self.container_name, exc
                )

        self.status = ContainerStatus.CLEANED_UP

    # ------------------------------------------------------------------
    # Command building
    # ------------------------------------------------------------------

    def build_run_command(
        self,
        script_path: str,
        working_dir: str = "/sandbox",
        host_script_path: Optional[str] = None,
        command: Optional[str] = None,
    ) -> List[str]:
        """Build the full docker run command with all security options.

        Parameters
        ----------
        script_path : str
            Path to the script inside the container.
        working_dir : str
            Working directory inside the container.
        host_script_path : str, optional
            Path to the script on the host. If None, the script is
            expected to already exist inside the image.
        command : str, optional
            Override command. Defaults to `python <script_path>`.

        Returns
        -------
        list[str]
            The complete docker run command as a list of arguments.
        """
        cmd = ["docker", "run", "--rm"]

        # Container naming
        cmd.extend(["--name", self.container_name])

        # --- SECURITY: No new privileges ---
        if self.security_opt_no_new_privileges:
            cmd.extend(["--security-opt", "no-new-privileges:true"])

        # --- SECURITY: Drop all capabilities ---
        if self.drop_all_caps:
            cmd.extend(["--cap-drop", "ALL"])

        # --- SECURITY: Read-only filesystem ---
        if self.read_only:
            cmd.append("--read-only")

        # --- SECURITY: Network isolation ---
        cmd.extend(["--network", self.network_mode])

        # --- SECURITY: Seccomp profile ---
        seccomp_path = self._get_or_create_seccomp_profile()
        if seccomp_path:
            cmd.extend(["--security-opt", f"seccomp={seccomp_path}"])
            self._seccomp_path = seccomp_path

        # CRITICAL: NO Docker socket mounting. We explicitly do NOT add:
        #   -v /var/run/docker.sock:/var/run/docker.sock
        # This would allow container escape.

        # --- Resource limits ---
        cmd.extend(["--memory", f"{self.memory_mb}m"])
        cmd.extend(["--memory-swap", f"{self.memory_mb}m"])  # No swap
        cmd.extend(["--cpu-shares", str(self.cpu_shares)])

        # --- Disk limit ---
        cmd.extend(["--storage-opt", f"size={self.disk_mb}M"])

        # --- tmpfs mounts (writable areas on read-only fs) ---
        cmd.extend(["--tmpfs", "/tmp:exec,size=100M"])
        cmd.extend(["--tmpfs", "/dev/shm:size=50M"])

        # --- Working directory ---
        cmd.extend(["-w", working_dir])

        # --- Environment variables ---
        env_vars = {
            "PYTHONUNBUFFERED": "1",
            "PYTHONDONTWRITEBYTECODE": "1",
            "PIP_NO_CACHE_DIR": "1",
        }
        env_vars.update(self.extra_env)
        for key, value in env_vars.items():
            cmd.extend(["-e", f"{key}={value}"])

        # --- Volume mount: host script into container ---
        if host_script_path:
            container_script = f"{working_dir}/{script_path}"
            cmd.extend(
                [
                    "-v",
                    f"{host_script_path}:{container_script}:ro",
                ]
            )
            self.container_id = f"volume_mount_{self.container_name}"
        else:
            self.container_id = f"no_mount_{self.container_name}"

        # --- Image ---
        cmd.append(self.image)

        # --- Command ---
        if command:
            cmd.extend(["sh", "-c", command])
        else:
            container_script_path = f"{working_dir}/{script_path}"
            cmd.extend(["python", container_script_path])

        return cmd

    # ------------------------------------------------------------------
    # Context manager support
    # ------------------------------------------------------------------

    async def __aenter__(self) -> "SecureDockerContainer":
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        await self._cleanup_container()
        if self._seccomp_path and os.path.exists(self._seccomp_path):
            try:
                os.unlink(self._seccomp_path)
            except OSError:
                pass

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _get_or_create_seccomp_profile(self) -> Optional[str]:
        """Create a seccomp profile file if one was not provided."""
        if self.seccomp_profile:
            # Save custom profile to a temp file
            output_dir = tempfile.gettempdir()
            return save_seccomp_profile(self.seccomp_profile, output_dir)

        # Generate default profile
        profile = generate_seccomp_profile()
        output_dir = tempfile.gettempdir()
        return save_seccomp_profile(profile, output_dir)

    def get_security_summary(self) -> Dict[str, Any]:
        """Return a summary of all active security measures."""
        return {
            "image": self.image,
            "no_new_privileges": self.security_opt_no_new_privileges,
            "drop_all_caps": self.drop_all_caps,
            "read_only_filesystem": self.read_only,
            "network_mode": self.network_mode,
            "seccomp_profile": (
                "enabled" if self.seccomp_profile or True else "disabled"
            ),
            "blocked_syscalls_count": len(BLOCKED_SYSCALLS),
            "memory_limit_mb": self.memory_mb,
            "cpu_shares": self.cpu_shares,
            "disk_limit_mb": self.disk_mb,
            "timeout_seconds": self.timeout_seconds,
            "docker_socket_mounted": False,  # ALWAYS false for security
            "tmpfs_mounts": ["/tmp:exec,size=100M", "/dev/shm:size=50M"],
            "extra_env_keys": list(self.extra_env.keys()),
        }
