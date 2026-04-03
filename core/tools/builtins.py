"""
core/tools/builtins.py
Built-in tools for Ensemble agents, decorated for registration.
"""
import os
import subprocess
import requests
from typing import str
from core.tool_decorator import tool

WORKSPACE_DIR = "data/workspace/"

@tool
def web_search(query: str) -> str:
    """Uses DuckDuckGo API to search the web for information."""
    # Simple GET to duckduckgo for information retrieval
    try:
        response = requests.get(f"https://api.duckduckgo.com/?q={query}&format=json")
        response.raise_for_status()
        data = response.json()
        return data.get("AbstractText", "No search results found.")
    except Exception as e:
        return f"Web search error: {e}"

@tool
def file_writer(path: str, content: str) -> str:
    """Writes content to a file in the workspace directory."""
    full_path = os.path.join(WORKSPACE_DIR, path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    try:
        with open(full_path, "w") as f:
            f.write(content)
        return f"Successfully wrote to {path}"
    except Exception as e:
        return f"File write error: {e}"

@tool
def file_reader(path: str) -> str:
    """Reads content from a file in the workspace directory."""
    full_path = os.path.join(WORKSPACE_DIR, path)
    if not os.path.exists(full_path):
        return f"File {path} does not exist."
    try:
        with open(full_path, "r") as f:
            return f.read()
    except Exception as e:
        return f"File read error: {e}"

@tool
def python_interpreter(code: str) -> str:
    """Runs Python code in a subprocess with a timeout."""
    try:
        # Avoid destructive file operations and network (minimal safety)
        result = subprocess.run(
            ["python3", "-c", code],
            capture_output=True,
            text=True,
            timeout=10
        )
        return result.stdout if result.returncode == 0 else f"Error: {result.stderr}"
    except subprocess.TimeoutExpired:
        return "Error: Python execution timed out."
    except Exception as e:
        return f"Execution error: {e}"

@tool
def shell_cmd(command: str) -> str:
    """Runs restricted shell commands in a workspace directory."""
    whitelist = ["ls", "cat", "echo", "mkdir"]
    base_cmd = command.split()[0] if command.split() else ""
    
    if base_cmd not in whitelist:
        return f"Error: Command '{base_cmd}' is NOT in the whitelist ({whitelist})."
    
    try:
        result = subprocess.run(
            command,
            cwd=WORKSPACE_DIR,
            shell=True,
            capture_output=True,
            text=True,
            timeout=10
        )
        return result.stdout if result.returncode == 0 else f"Error: {result.stderr}"
    except Exception as e:
        return f"Shell error: {e}"
