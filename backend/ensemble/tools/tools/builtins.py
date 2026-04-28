"""
core/tools/builtins.py
Built-in tools for Ensemble agents, secured via DockerExecutor and SecurityGovernor.
"""

import logging
import os

from backend.ensemble.docker_executor import DOCKER_AVAILABLE, docker_executor
from backend.ensemble.security_policy import security_governor
from backend.ensemble.tool_decorator import tool

WORKSPACE_DIR = os.path.abspath("data/workspace/")


@tool
def python_interpreter(code: str, agent_id: str = "default_agent") -> str:
    """Runs Python code in a hardened Docker container."""
    if not security_governor.eval_permission(agent_id, "python_interpreter", code):
        return "Error: Permission Denied by SecurityGovernor."

    if DOCKER_AVAILABLE:
        logging.info(f"�� Executing Python for {agent_id} in Docker...")
        result = docker_executor.run_container(
            image="python:3.10-slim", command=f'python3 -c "{code}"'
        )
        if result["status"] == "success":
            return result["output"]
        else:
            return f"Docker Error: {result.get('message', result.get('output'))}"
    else:
        # Fallback to subprocess with DANGER log
        logging.warning(
            f"⚠️ DANGER: Scaling back to UNPROTECTED subprocess for {agent_id}"
        )
        import subprocess

        try:
            res = subprocess.run(
                ["python3", "-c", code], capture_output=True, text=True, timeout=10
            )
            return (
                res.stdout if res.returncode == 0 else f"Subprocess Error: {res.stderr}"
            )
        except Exception as e:
            return f"Subprocess Fatal: {e}"


@tool
def shell_cmd(command: str, agent_id: str = "default_agent") -> str:
    """Runs shell commands in a hardened Docker container."""
    if not security_governor.eval_permission(agent_id, "shell_cmd", command):
        return "Error: Permission Denied by SecurityGovernor."

    if DOCKER_AVAILABLE:
        logging.info(f"🐳 Executing Shell for {agent_id} in Docker...")
        result = docker_executor.run_container(
            image="alpine:latest", command=f'sh -c "{command}"'
        )
        if result["status"] == "success":
            return result["output"]
        else:
            return f"Docker Error: {result.get('message', result.get('output'))}"
    else:
        logging.warning(f"⚠️ DANGER: Scaling back to UNPROTECTED shell for {agent_id}")
        import subprocess

        try:
            res = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=10,
                cwd=WORKSPACE_DIR,
            )
            return (
                res.stdout if res.returncode == 0 else f"Subprocess Error: {res.stderr}"
            )
        except Exception as e:
            return f"Subprocess Fatal: {e}"


@tool
def file_writer(path: str, content: str, agent_id: str = "default_agent") -> str:
    """Writes content to a file, subject to path-based security."""
    if not security_governor.eval_permission(agent_id, "file_writer", path):
        return "Error: Permission Denied by SecurityGovernor."

    full_path = os.path.join(WORKSPACE_DIR, path)
    if not full_path.startswith(WORKSPACE_DIR):
        return "Error: Path Traversal Detected. Access Denied."

    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    try:
        with open(full_path, "w") as f:
            f.write(content)
        return f"Successfully wrote to {path}"
    except Exception as e:
        return f"File write error: {e}"
