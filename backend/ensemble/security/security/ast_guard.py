"""
core/security/ast_guard.py
Python AST-based security analyzer for untrusted LLM-generated code.

Blocks dangerous imports, dangerous builtins, and obfuscation patterns.
Returns a SecurityReport with a list of SecurityViolation objects.
Designed to run as a pre-execution gate in the Ensemble sandbox pipeline.

Usage:
    from backend.ensemble.security.ast_guard import ASTSecurityAnalyzer, SecurityViolation

    analyzer = ASTSecurityAnalyzer()
    report = analyzer.analyze("import os; os.system('rm -rf /')")
    if report.violations:
        for v in report.violations:
            print(f"[{v.severity}] {v.rule}: {v.message}")

Docstring examples (doctest-style):
    >>> from backend.ensemble.security.ast_guard import ASTSecurityAnalyzer
    >>> analyzer = ASTSecurityAnalyzer()
    >>> report = analyzer.analyze("import os")
    >>> len(report.violations) > 0
    True
    >>> report.is_safe
    False

    >>> report = analyzer.analyze("x = 1 + 2")
    >>> report.is_safe
    True
    >>> len(report.violations) == 0
    True

    >>> report = analyzer.analyze("import subprocess; subprocess.call(['ls'])")
    >>> any(v.rule == 'DANGEROUS_IMPORT' for v in report.violations)
    True

    >>> report = analyzer.analyze("getattr(__builtins__, 'eval')('1+1')")
    >>> any(v.rule == 'OBFUSCATION' for v in report.violations)
    True
"""

import ast
import hashlib
import logging
from dataclasses import dataclass, field
from typing import List, Optional, Set, Tuple

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Domain constants
# ---------------------------------------------------------------------------

DANGEROUS_MODULES: Set[str] = {
    "os",
    "sys",
    "subprocess",
    "socket",
    "shutil",
    "ctypes",
    # Additional dangerous modules
    "pickle",
    "marshal",
    "shelve",
    "pty",
    "popen2",
    "commands",
    "resource",
    "fcntl",
    "pwd",
    "grp",
    "signal",
}

DANGEROUS_BUILTINS: Set[str] = {
    "open",
    "eval",
    "exec",
    "compile",
    "__import__",
    "input",
    "breakpoint",
    # Additional dangerous builtins
    "globals",
    "locals",
    "vars",
    "dir",
    "getattr",
    "setattr",
    "delattr",
}

OBFUSCATION_PATTERNS: List[Tuple[str, str]] = [
    # getattr(__builtins__, 'eval')
    ("getattr_on_builtins", "getattr(__builtins__, ...)"),
    # __builtins__['eval']
    ("subscript_on_builtins", "__builtins__[...]"),
    # globals()['__builtins__']
    ("globals_builtins_access", "globals()['__builtins__']"),
    # chr() / ord() chains used to build function names
    ("chr_obfusc", "chr() chains likely building dangerous names"),
    # importlib.import_module with string concatenation
    ("importlib_dynamic_import", "importlib.import_module(...)"),
]


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SecurityViolation:
    """Represents a single security violation detected by the analyzer."""

    rule: str
    severity: str  # "CRITICAL", "HIGH", "MEDIUM", "LOW"
    message: str
    line: int
    col: int
    code_snippet: str
    source_hash: str = ""

    def to_dict(self) -> dict:
        return {
            "rule": self.rule,
            "severity": self.severity,
            "message": self.message,
            "line": self.line,
            "col": self.col,
            "code_snippet": self.code_snippet,
            "source_hash": self.source_hash,
        }


@dataclass
class SecurityReport:
    """Aggregated result of a security analysis pass."""

    source_code: str
    source_hash: str
    violations: List[SecurityViolation] = field(default_factory=list)
    analysis_duration_ms: float = 0.0

    @property
    def is_safe(self) -> bool:
        return len(self.violations) == 0

    @property
    def critical_count(self) -> int:
        return sum(1 for v in self.violations if v.severity == "CRITICAL")

    @property
    def high_count(self) -> int:
        return sum(1 for v in self.violations if v.severity == "HIGH")

    def summary(self) -> str:
        parts = [
            f"SecurityReport: {'SAFE' if self.is_safe else 'BLOCKED'}",
            f"  violations={len(self.violations)}",
            f"  critical={self.critical_count}",
            f"  high={self.high_count}",
            f"  hash={self.source_hash[:12]}",
        ]
        return "\n".join(parts)

    def to_dict(self) -> dict:
        return {
            "source_hash": self.source_hash,
            "is_safe": self.is_safe,
            "violation_count": len(self.violations),
            "critical_count": self.critical_count,
            "high_count": self.high_count,
            "violations": [v.to_dict() for v in self.violations],
            "analysis_duration_ms": self.analysis_duration_ms,
        }


class SecurityViolationError(Exception):
    """Raised when a security violation is detected during analysis."""

    def __init__(self, report: SecurityReport):
        self.report = report
        summary = "; ".join(
            f"[{v.severity}] {v.rule} at line {v.line}: {v.message}"
            for v in report.violations
        )
        super().__init__(f"Security violation(s): {summary}")


# ---------------------------------------------------------------------------
# Analyzer
# ---------------------------------------------------------------------------


class ASTSecurityAnalyzer:
    """Walks Python AST to detect dangerous imports, builtins, and obfuscation.

    The analyzer performs three independent checks:
    1. Dangerous import detection (modules like os, subprocess, socket, etc.)
    2. Dangerous builtin usage (eval, exec, open, etc.)
    3. Obfuscation pattern detection (getattr on __builtins__, chr chains, etc.)

    All checks are deterministic and stateless per invocation.
    """

    def __init__(
        self,
        dangerous_modules: Optional[Set[str]] = None,
        dangerous_builtins: Optional[Set[str]] = None,
        strict_mode: bool = True,
    ):
        self.dangerous_modules = dangerous_modules or DANGEROUS_MODULES
        self.dangerous_builtins = dangerous_builtins or DANGEROUS_BUILTINS
        self.strict_mode = strict_mode

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def analyze(self, source: str, filename: str = "<dynamic>") -> SecurityReport:
        """Analyze *source* code and return a SecurityReport.

        Parameters
        ----------
        source : str
            Python source code to analyze.
        filename : str
            Symbolic filename used in violation messages.

        Returns
        -------
        SecurityReport
            Report containing any violations found.

        Raises
        ------
        SyntaxError
            If the source code cannot be parsed as valid Python.
        """
        source_hash = hashlib.sha256(source.encode("utf-8")).hexdigest()
        violations: List[SecurityViolation] = []
        source_lines = source.splitlines()

        try:
            tree = ast.parse(source, filename=filename)
        except SyntaxError as exc:
            logger.error("AST parse failed for %s: %s", filename, exc)
            raise

        # Run each check
        violations.extend(self._check_imports(tree, source_lines, source_hash))
        violations.extend(self._check_builtins(tree, source_lines, source_hash))
        violations.extend(self._check_obfuscation(tree, source_lines, source_hash))

        report = SecurityReport(
            source_code=source,
            source_hash=source_hash,
            violations=violations,
        )

        if not report.is_safe:
            logger.warning(
                "AST guard blocked code (hash %s): %d violations",
                source_hash[:12],
                len(violations),
            )
        else:
            logger.debug("AST guard passed code (hash %s)", source_hash[:12])

        return report

    def validate(self, source: str, filename: str = "<dynamic>") -> SecurityReport:
        """Like analyze(), but raises SecurityViolationError on any violation.

        This is the preferred entry point when the caller wants exceptions
        instead of inspecting the report manually.
        """
        report = self.analyze(source, filename)
        if not report.is_safe:
            raise SecurityViolationError(report)
        return report

    # ------------------------------------------------------------------
    # Check: Dangerous imports
    # ------------------------------------------------------------------

    def _check_imports(
        self,
        tree: ast.AST,
        lines: List[str],
        source_hash: str,
    ) -> List[SecurityViolation]:
        violations: List[SecurityViolation] = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name in self.dangerous_modules:
                        violations.append(
                            SecurityViolation(
                                rule="DANGEROUS_IMPORT",
                                severity="CRITICAL",
                                message=f"Dangerous module '{alias.name}' imported",
                                line=node.lineno or 0,
                                col=node.col_offset or 0,
                                code_snippet=self._get_line(lines, node),
                                source_hash=source_hash,
                            )
                        )
            elif isinstance(node, ast.ImportFrom):
                module = node.module or ""
                # Check if the top-level module is dangerous
                top_level = module.split(".")[0]
                if top_level in self.dangerous_modules:
                    names = ", ".join(a.name for a in (node.names or []))
                    violations.append(
                        SecurityViolation(
                            rule="DANGEROUS_IMPORT",
                            severity="CRITICAL",
                            message=f"Dangerous import from '{module}': {names}",
                            line=node.lineno or 0,
                            col=node.col_offset or 0,
                            code_snippet=self._get_line(lines, node),
                            source_hash=source_hash,
                        )
                    )
        return violations

    # ------------------------------------------------------------------
    # Check: Dangerous builtin calls
    # ------------------------------------------------------------------

    def _check_builtins(
        self,
        tree: ast.AST,
        lines: List[str],
        source_hash: str,
    ) -> List[SecurityViolation]:
        violations: List[SecurityViolation] = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                func_name = self._resolve_call_name(node)
                if func_name in self.dangerous_builtins:
                    severity = self._builtin_severity(func_name)
                    violations.append(
                        SecurityViolation(
                            rule="DANGEROUS_BUILTIN",
                            severity=severity,
                            message=f"Dangerous builtin '{func_name}' called",
                            line=node.lineno or 0,
                            col=node.col_offset or 0,
                            code_snippet=self._get_line(lines, node),
                            source_hash=source_hash,
                        )
                    )
        return violations

    def _resolve_call_name(self, node: ast.Call) -> Optional[str]:
        """Extract the function name from a Call node."""
        if isinstance(node.func, ast.Name):
            return node.func.id
        if isinstance(node.func, ast.Attribute):
            return node.func.attr
        return None

    def _builtin_severity(self, builtin_name: str) -> str:
        """Return severity level for a dangerous builtin."""
        critical_builtins = {"eval", "exec", "__import__", "compile"}
        if builtin_name in critical_builtins:
            return "CRITICAL"
        return "HIGH"

    # ------------------------------------------------------------------
    # Check: Obfuscation patterns
    # ------------------------------------------------------------------

    def _check_obfuscation(
        self,
        tree: ast.AST,
        lines: List[str],
        source_hash: str,
    ) -> List[SecurityViolation]:
        violations: List[SecurityViolation] = []

        for node in ast.walk(tree):
            # Pattern 1: getattr(__builtins__, 'eval')
            if self._is_getattr_builtins(node):
                violations.append(
                    SecurityViolation(
                        rule="OBFUSCATION",
                        severity="CRITICAL",
                        message="getattr() used to access __builtins__ (obfuscation)",
                        line=node.lineno or 0,
                        col=node.col_offset or 0,
                        code_snippet=self._get_line(lines, node),
                        source_hash=source_hash,
                    )
                )

            # Pattern 2: __builtins__['eval']
            if self._is_subscript_builtins(node):
                violations.append(
                    SecurityViolation(
                        rule="OBFUSCATION",
                        severity="CRITICAL",
                        message="__builtins__ subscript access (obfuscation)",
                        line=node.lineno or 0,
                        col=node.col_offset or 0,
                        code_snippet=self._get_line(lines, node),
                        source_hash=source_hash,
                    )
                )

            # Pattern 3: globals()['__builtins__']
            if self._is_globals_builtins(node):
                violations.append(
                    SecurityViolation(
                        rule="OBFUSCATION",
                        severity="CRITICAL",
                        message="globals()['__builtins__'] access (obfuscation)",
                        line=node.lineno or 0,
                        col=node.col_offset or 0,
                        code_snippet=self._get_line(lines, node),
                        source_hash=source_hash,
                    )
                )

            # Pattern 4: importlib.import_module(...)
            if self._is_importlib_import(node):
                violations.append(
                    SecurityViolation(
                        rule="OBFUSCATION",
                        severity="HIGH",
                        message="Dynamic import via importlib.import_module()",
                        line=node.lineno or 0,
                        col=node.col_offset or 0,
                        code_snippet=self._get_line(lines, node),
                        source_hash=source_hash,
                    )
                )

        # Pattern 5: chr() chains (detected via consecutive chr() calls in source)
        if self.strict_mode:
            chr_violations = self._detect_chr_obfuscation(lines, source_hash)
            violations.extend(chr_violations)

        return violations

    def _is_getattr_builtins(self, node: ast.AST) -> bool:
        """Detect getattr(__builtins__, ...)."""
        if not isinstance(node, ast.Call):
            return False
        if not isinstance(node.func, ast.Name) or node.func.id != "getattr":
            return False
        if len(node.args) < 2:
            return False
        first_arg = node.args[0]
        return isinstance(first_arg, ast.Name) and first_arg.id == "__builtins__"

    def _is_subscript_builtins(self, node: ast.AST) -> bool:
        """Detect __builtins__['eval'] or __builtins__.get('eval')."""
        if isinstance(node, ast.Subscript):
            return isinstance(node.value, ast.Name) and node.value.id == "__builtins__"
        if isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Attribute) and func.attr == "get":
                if isinstance(func.value, ast.Name) and func.value.id == "__builtins__":
                    return True
        return False

    def _is_globals_builtins(self, node: ast.AST) -> bool:
        """Detect globals()['__builtins__']."""
        if not isinstance(node, ast.Subscript):
            return False
        if not isinstance(node.value, ast.Call):
            return False
        if not isinstance(node.value.func, ast.Name):
            return False
        if node.value.func.id != "globals":
            return False
        return (
            isinstance(node.slice, ast.Constant) and node.slice.value == "__builtins__"
        )

    def _is_importlib_import(self, node: ast.AST) -> bool:
        """Detect importlib.import_module(...) calls."""
        if not isinstance(node, ast.Call):
            return False
        func = node.func
        if isinstance(func, ast.Attribute) and func.attr == "import_module":
            if isinstance(func.value, ast.Name) and func.value.id == "importlib":
                return True
        # Also detect: from importlib import import_module; import_module('os')
        if isinstance(func, ast.Name) and func.id == "import_module":
            return True
        return False

    def _detect_chr_obfuscation(
        self, lines: List[str], source_hash: str
    ) -> List[SecurityViolation]:
        """Detect chr() chains used to construct dangerous function names.

        Heuristic: 3+ chr() calls on the same line suggests obfuscation.
        """
        import re

        violations: List[SecurityViolation] = []
        chr_pattern = re.compile(r"chr\s*\(\s*\d+\s*\)")

        for lineno, line in enumerate(lines, start=1):
            matches = chr_pattern.findall(line)
            if len(matches) >= 3:
                violations.append(
                    SecurityViolation(
                        rule="OBFUSCATION",
                        severity="HIGH",
                        message=f"chr() chain detected ({len(matches)} occurrences, likely obfuscation)",
                        line=lineno,
                        col=0,
                        code_snippet=line.strip(),
                        source_hash=source_hash,
                    )
                )
        return violations

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _get_line(lines: List[str], node: ast.AST) -> str:
        """Safely extract a source line for a given AST node."""
        lineno = getattr(node, "lineno", None)
        if lineno is not None and 1 <= lineno <= len(lines):
            return lines[lineno - 1].strip()
        return "<line unavailable>"
