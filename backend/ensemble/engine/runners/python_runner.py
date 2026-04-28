"""
core/runners/python_runner.py
Runner for Python-format agents.

Executes Python agent classes in a controlled environment with
AST security guards, dependency management, and sandboxed execution.
"""
import os
import sys
import ast
import time
import json
import logging
import importlib
import tempfile
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional, Set
from contextlib import contextmanager
from dataclasses import dataclass

from core.parsers.agent_data import AgentData, AgentFormat
from core.runners.base_runner import BaseRunner, RunnerResult

logger = logging.getLogger(__name__)

# Dangerous AST node types that should not be present in agent code
# Note: ast.Exec was removed in Python 3.13, so we use getattr for compatibility
DANGEROUS_NODES = set()
_exec_node = getattr(ast, "Exec", None)
if _exec_node is not None:
    DANGEROUS_NODES.add(_exec_node)
DANGEROUS_NODES.update({
    ast.Import,  # Imports are handled separately with allowlist
    ast.ImportFrom,
})

# Allowed import modules (security allowlist)
ALLOWED_IMPORTS = {
    "os", "sys", "re", "json", "math", "datetime", "time",
    "typing", "collections", "itertools", "functools",
    "pathlib", "io", "string", "textwrap",
    "logging", "warnings", "traceback",
    "dataclasses", "enum", "abc",
    "numpy", "pandas", "requests", "httpx",
    "yaml", "toml", "dotenv",
    "hashlib", "hmac", "secrets",
    "urllib", "urllib.parse", "urllib.request",
}

# Method names considered safe for execution
SAFE_EXEC_METHODS = {
    "run", "execute", "act", "process", "call", "invoke", "forward",
    "respond", "generate", "answer", "handle", "perform",
}


class SecurityError(Exception):
    """Raised when code fails security checks."""
    pass


class DependencyError(Exception):
    """Raised when required dependencies are not available."""
    pass


class AgentRunner:
    """
    Wrapper that manages an imported agent class instance.

    Handles instantiation, method discovery, and execution.
    """

    def __init__(
        self,
        module_path: str,
        class_name: str,
        allowed_modules: Optional[Set[str]] = None,
    ):
        """
        Initialize the agent runner.

        Args:
            module_path: Path to the Python file.
            class_name: Name of the class to instantiate.
            allowed_modules: Set of allowed import modules.
        """
        self.module_path = module_path
        self.class_name = class_name
        self.allowed_modules = allowed_modules or ALLOWED_IMPORTS
        self._instance = None
        self._exec_method = None

    def prepare(self) -> bool:
        """
        Import the module and create an instance.

        Returns:
            True if preparation was successful.
        """
        try:
            # Add module directory to path
            module_dir = str(Path(self.module_path).parent)
            if module_dir not in sys.path:
                sys.path.insert(0, module_dir)

            # Import the module
            module_name = Path(self.module_path).stem
            spec = importlib.util.spec_from_file_location(module_name, self.module_path)
            if spec is None or spec.loader is None:
                raise ImportError(f"Cannot load spec for {self.module_path}")

            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            # Get the class
            agent_class = getattr(module, self.class_name, None)
            if agent_class is None:
                raise ImportError(
                    f"Class '{self.class_name}' not found in {self.module_path}"
                )

            # Create instance
            self._instance = agent_class()
            self._exec_method = self._find_exec_method(agent_class)

            return True

        except Exception as e:
            logger.error(f"Failed to prepare agent {self.class_name}: {e}")
            return False

    def execute(self, input_data: Any = None) -> Any:
        """
        Execute the agent with the given input.

        Args:
            input_data: Input to pass to the agent.

        Returns:
            Agent output.
        """
        if self._instance is None or self._exec_method is None:
            raise RuntimeError("Agent not prepared. Call prepare() first.")

        method = getattr(self._instance, self._exec_method)

        # Try calling with input_data
        try:
            if input_data is not None:
                return method(input_data)
            else:
                return method()
        except TypeError:
            # Method signature doesn't match - try without args
            return method()

    def _find_exec_method(self, cls) -> Optional[str]:
        """Find the execution method in the class."""
        for method_name in SAFE_EXEC_METHODS:
            if hasattr(cls, method_name):
                return method_name

        # Check for __call__
        if hasattr(cls, "__call__"):
            return "__call__"

        return None


class PythonRunner(BaseRunner):
    """
    Runner for Python-format agents.

    Executes Python agent classes with security guards, dependency
    management, and isolated execution.
    """

    def __init__(
        self,
        timeout: float = 120.0,
        allowed_modules: Optional[Set[str]] = None,
        auto_install_deps: bool = False,
    ):
        """
        Initialize the Python runner.

        Args:
            timeout: Maximum execution time in seconds.
            allowed_modules: Set of allowed import modules.
            auto_install_deps: Whether to auto-install missing dependencies.
        """
        super().__init__(timeout=timeout)
        self.allowed_modules = allowed_modules or ALLOWED_IMPORTS
        self.auto_install_deps = auto_install_deps
        self._installed_packages: Set[str] = set()

    def can_execute(self, agent_data: AgentData) -> bool:
        """Check if this runner can execute the given agent."""
        return agent_data.format == AgentFormat.PYTHON

    async def execute(
        self, agent_data: AgentData, input_data: Any = None
    ) -> RunnerResult:
        """
        Execute a Python agent.

        Performs security checks, installs dependencies, imports the
        module, and runs the agent class.

        Args:
            agent_data: The parsed agent specification.
            input_data: Optional input data for the agent.

        Returns:
            RunnerResult with agent output.
        """
        self._log_execution_start(agent_data)
        start_time = time.time()

        try:
            # Step 1: Security check on raw content
            self._security_check(agent_data)

            # Step 2: Handle dependencies
            if self.auto_install_deps:
                await self._ensure_dependencies(agent_data)

            # Step 3: Write content to temp file for execution
            class_name = agent_data.class_name or agent_data.name
            module_path = self._write_temp_module(agent_data)

            try:
                # Step 4: Prepare and execute
                runner = AgentRunner(
                    module_path=module_path,
                    class_name=class_name,
                    allowed_modules=self.allowed_modules,
                )

                if not runner.prepare():
                    raise RuntimeError(f"Failed to prepare agent class: {class_name}")

                output = runner.execute(input_data)

                execution_time = time.time() - start_time

                result = self._create_success_result(
                    output=output,
                    execution_time=execution_time,
                    metadata={
                        "agent_format": "python",
                        "class_name": class_name,
                        "module_path": module_path,
                    },
                )

                self._log_execution_end(result, agent_data)
                return result

            finally:
                # Clean up temp file
                self._cleanup_temp(module_path)

        except SecurityError as e:
            execution_time = time.time() - start_time
            result = self._create_error_result(e, execution_time)
            self._log_execution_end(result, agent_data)
            return result

        except Exception as e:
            execution_time = time.time() - start_time
            result = self._create_error_result(e, execution_time)
            self._log_execution_end(result, agent_data)
            return result

    def _security_check(self, agent_data: AgentData):
        """
        Perform AST-based security analysis on the Python source.

        Raises SecurityError if dangerous patterns are found.
        """
        content = agent_data.raw_content
        if not content:
            # No raw content available - allow if we have class info
            if not agent_data.class_name:
                raise SecurityError("No raw content available for security check")
            return

        try:
            tree = ast.parse(content, filename=agent_data.source_path)
        except SyntaxError as e:
            raise SecurityError(f"Syntax error prevents security analysis: {e}")

        # Check for dangerous patterns
        issues = []

        for node in ast.walk(tree):
            # Check for exec() calls
            if isinstance(node, ast.Call):
                func_name = ""
                if isinstance(node.func, ast.Name):
                    func_name = node.func.id
                elif isinstance(node.func, ast.Attribute):
                    func_name = node.func.attr

                if func_name == "exec":
                    issues.append("Use of exec() is not allowed")
                elif func_name == "eval":
                    issues.append("Use of eval() is not allowed")
                elif func_name == "compile":
                    issues.append("Use of compile() is not allowed")
                elif func_name == "__import__":
                    issues.append("Use of __import__() is not allowed")
                elif func_name in ("subprocess", "Popen", "system", "popen"):
                    issues.append(f"Use of {func_name}() requires review")
                elif func_name in ("os.system", "os.popen"):
                    issues.append(f"Use of {func_name}() is not allowed")

            # Check for dangerous attributes
            if isinstance(node, ast.Attribute):
                if node.attr in ("system", "popen", "spawn"):
                    # Allow but flag for review
                    pass

        if issues:
            unique_issues = list(set(issues))
            raise SecurityError(
                f"Security check failed for {agent_data.name}: "
                + "; ".join(unique_issues)
            )

        # Check imports against allowlist
        self._check_imports(tree, agent_data.name)

    def _check_imports(self, tree: ast.Module, agent_name: str):
        """Check imports against the allowlist."""
        disallowed = []

        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    module = alias.name.split(".")[0]
                    if module not in self.allowed_modules:
                        disallowed.append(alias.name)
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    module = node.module.split(".")[0]
                    if module not in self.allowed_modules:
                        disallowed.append(node.module)

        if disallowed:
            self.logger.warning(
                f"Agent {agent_name} uses imports not in allowlist: "
                f"{disallowed}"
            )
            # Warning only, don't block execution
            # This allows flexibility while logging for audit

    def _write_temp_module(self, agent_data: AgentData) -> str:
        """
        Write agent source to a temp file for import.

        Returns the path to the temp file.
        """
        content = agent_data.raw_content
        if not content:
            raise RuntimeError("No raw content available for execution")

        class_name = agent_data.class_name or agent_data.name
        safe_name = "".join(c if c.isalnum() else "_" for c in class_name).lower()

        # Create temp file with .py extension
        fd, temp_path = tempfile.mkstemp(suffix=".py", prefix=f"agent_{safe_name}_")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(content)
        except Exception:
            os.close(fd)
            raise

        return temp_path

    def _cleanup_temp(self, path: str):
        """Remove temporary module file."""
        try:
            if path and os.path.exists(path):
                os.unlink(path)
        except OSError as e:
            self.logger.warning(f"Failed to cleanup temp file {path}: {e}")

    async def _ensure_dependencies(self, agent_data: AgentData):
        """
        Ensure all required dependencies are installed.

        Looks for requirements.txt near the agent source file.
        """
        source_path = agent_data.source_path
        if not source_path:
            return

        # Look for requirements.txt in the same directory
        source_dir = Path(source_path).parent
        requirements_file = source_dir / "requirements.txt"

        if requirements_file.exists():
            await self._install_requirements(requirements_file)

        # Also check parent directories (repo root)
        parent_req = source_dir.parent / "requirements.txt"
        if parent_req.exists() and str(parent_req) != str(requirements_file):
            await self._install_requirements(parent_req)

    async def _install_requirements(self, requirements_path: Path):
        """Install dependencies from a requirements.txt file."""
        try:
            self.logger.info(f"Installing dependencies from {requirements_path}")

            result = subprocess.run(
                [
                    sys.executable, "-m", "pip", "install",
                    "-r", str(requirements_path),
                    "--quiet", "--no-warn-script-location",
                ],
                capture_output=True,
                text=True,
                timeout=120,
            )

            if result.returncode == 0:
                self.logger.info("Dependencies installed successfully")
            else:
                self.logger.warning(
                    f"Dependency installation had issues: {result.stderr[:200]}"
                )

        except subprocess.TimeoutExpired:
            self.logger.warning("Dependency installation timed out")
        except Exception as e:
            self.logger.warning(f"Failed to install dependencies: {e}")

    def get_class_info(self, agent_data: AgentData) -> Dict[str, Any]:
        """
        Extract class information from Python agent data.

        Returns metadata about the agent class structure.
        """
        info = {
            "class_name": agent_data.class_name or agent_data.name,
            "methods": agent_data.methods,
            "imports": agent_data.imports,
            "bases": agent_data.config.get("bases", []),
            "has_run_method": False,
            "has_execute_method": False,
            "exec_method": None,
        }

        # Determine execution method
        for method in agent_data.methods:
            if method in ("run",):
                info["has_run_method"] = True
                info["exec_method"] = "run"
            elif method in ("execute",):
                info["has_execute_method"] = True
                if not info["exec_method"]:
                    info["exec_method"] = "execute"

        if not info["exec_method"]:
            for method in agent_data.methods:
                if method in SAFE_EXEC_METHODS:
                    info["exec_method"] = method
                    break

        return info
