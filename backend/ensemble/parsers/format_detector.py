"""
core/format_detector.py
Directory scanner that identifies agent file formats with confidence scores.

Scans a directory tree and detects:
- Markdown (.md) with optional YAML frontmatter
- Python (.py) with agent class detection via AST
- YAML (.yaml/.yml) configuration files
- JSON (.json) manifest files
- Text (.txt/.prompt) plain prompt files

Uses file extensions and content sniffing for fast, safe scanning.
"""

import ast
import hashlib
import json
import logging
import os
import re
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


class FormatType(str, Enum):
    """Supported agent file format types."""

    MARKDOWN = "markdown"
    PYTHON = "python"
    YAML = "yaml"
    JSON = "json"
    TEXT = "text"
    UNKNOWN = "unknown"


@dataclass
class DetectedFile:
    """Represents a detected agent file with format metadata."""

    path: str
    format: FormatType
    confidence: float
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def filename(self) -> str:
        """Return the base filename."""
        return os.path.basename(self.path)

    @property
    def extension(self) -> str:
        """Return the file extension (lowercase, without dot)."""
        return Path(self.path).suffix.lstrip(".").lower()

    @property
    def content_hash(self) -> str:
        """Return SHA-256 hash of file content if available in metadata."""
        return self.metadata.get("content_hash", "")

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "path": self.path,
            "format": self.format.value,
            "confidence": self.confidence,
            "metadata": self.metadata,
        }


# Extension-to-format mapping
EXTENSION_FORMAT_MAP: Dict[str, FormatType] = {
    "md": FormatType.MARKDOWN,
    "markdown": FormatType.MARKDOWN,
    "py": FormatType.PYTHON,
    "yaml": FormatType.YAML,
    "yml": FormatType.YAML,
    "json": FormatType.JSON,
    "txt": FormatType.TEXT,
    "prompt": FormatType.TEXT,
}

# Maximum file size for scanning (1 MB)
MAX_SCAN_SIZE = 1_048_576

# Python base classes that indicate agent definitions
AGENT_BASE_CLASSES = {
    "Role",
    "Action",
    "Agent",
    "BaseAgent",
    "BaseRole",
    "BaseAction",
    "BaseAgentClass",
    "Task",
    "Tool",
    "BaseTool",
    "State",
    "Node",
}

# Directories to skip during scanning
IGNORED_DIRS = {
    ".git",
    ".svn",
    ".hg",
    "__pycache__",
    "node_modules",
    ".venv",
    "venv",
    "env",
    ".tox",
    ".mypy_cache",
    ".pytest_cache",
    ".eggs",
    "dist",
    "build",
    ".cache",
}

# Filename patterns that suggest non-agent files
IGNORED_FILENAME_PATTERNS = [
    r"^test_",
    r"_test\.py$",
    r"^conftest\.py$",
    r"^setup\.py$",
    r"^requirements.*\.txt$",
    r"^Makefile$",
    r"^Dockerfile$",
    r"^\.env",
    r"^pyproject\.toml$",
    r"^setup\.cfg$",
]

# Markdown frontmatter regex
FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n(.*)", re.DOTALL)

# Common agent-like JSON keys
AGENT_JSON_KEYS = {
    "name",
    "description",
    "role",
    "prompt",
    "system_prompt",
    "instructions",
    "tools",
    "model",
    "agent_type",
    "category",
}


def _should_ignore_file(filename: str) -> bool:
    """Check if a filename matches ignore patterns."""
    for pattern in IGNORED_FILENAME_PATTERNS:
        if re.match(pattern, filename, re.IGNORECASE):
            return True
    return False


def _is_agent_candidate_python(content: str) -> bool:
    """
    Check if Python content contains agent-related class definitions.

    Uses AST parsing to detect classes that inherit from known agent base classes.
    Safe: does not execute any code.
    """
    try:
        tree = ast.parse(content, filename="<detector>")
    except SyntaxError:
        return False

    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            for base in node.bases:
                base_name = _get_node_name(base)
                if base_name in AGENT_BASE_CLASSES:
                    return True
    return False


def _get_node_name(node: ast.AST) -> str:
    """Extract a name string from an AST node (for base class detection)."""
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    if isinstance(node, ast.Subscript):
        return _get_node_name(node.value)
    return ""


def _extract_python_classes(content: str) -> List[Dict[str, Any]]:
    """
    Extract class information from Python source using AST.

    Returns list of dicts with class name, docstring, methods, and base classes.
    """
    classes_info: List[Dict[str, Any]] = []
    try:
        tree = ast.parse(content, filename="<detector>")
    except SyntaxError:
        return classes_info

    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            bases = [_get_node_name(b) for b in node.bases]
            docstring = ast.get_docstring(node)
            methods = []
            for item in node.body:
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    methods.append(item.name)

            is_agent = any(b in AGENT_BASE_CLASSES for b in bases)

            classes_info.append(
                {
                    "name": node.name,
                    "bases": bases,
                    "docstring": docstring,
                    "methods": methods,
                    "is_agent_class": is_agent,
                    "line_number": node.lineno,
                }
            )

    return classes_info


def _has_yaml_frontmatter(content: str) -> Tuple[bool, Optional[Dict[str, Any]]]:
    """
    Check if content starts with YAML frontmatter.

    Returns (has_frontmatter, parsed_yaml_or_None).
    """
    match = FRONTMATTER_RE.match(content)
    if not match:
        return False, None

    import yaml

    try:
        parsed = yaml.safe_load(match.group(1))
        if isinstance(parsed, dict):
            return True, parsed
    except yaml.YAMLError:
        pass

    return True, None  # Has frontmatter but couldn't parse it


def _is_agent_json(data: Any) -> bool:
    """
    Check if parsed JSON data has agent-like structure.

    Looks for common agent configuration keys.
    """
    if isinstance(data, dict):
        found_keys = set(data.keys()) & AGENT_JSON_KEYS
        return len(found_keys) >= 2
    return False


def _compute_file_hash(filepath: str) -> str:
    """Compute SHA-256 hash of a file's content."""
    sha256 = hashlib.sha256()
    try:
        with open(filepath, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha256.update(chunk)
    except (OSError, IOError) as e:
        logger.warning(f"Cannot compute hash for {filepath}: {e}")
        return ""
    return sha256.hexdigest()


def _read_file_head(filepath: str, max_bytes: int = 8192) -> str:
    """Read the first N bytes of a file safely."""
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            return f.read(max_bytes)
    except (OSError, IOError) as e:
        logger.warning(f"Cannot read {filepath}: {e}")
        return ""


def detect_single_file(filepath: str) -> DetectedFile:
    """
    Detect the format of a single file.

    Args:
        filepath: Absolute path to the file.

    Returns:
        DetectedFile object with format, confidence, and metadata.
    """
    path_obj = Path(filepath)
    extension = path_obj.suffix.lstrip(".").lower()
    filename = path_obj.name

    # Map extension to format type
    format_type = EXTENSION_FORMAT_MAP.get(extension, FormatType.UNKNOWN)

    if format_type == FormatType.UNKNOWN:
        # Try to detect by content sniffing
        head = _read_file_head(filepath)
        if head.startswith("{"):
            format_type = FormatType.JSON
        elif head.startswith("---\n") or head.startswith("--- \n"):
            format_type = FormatType.MARKDOWN
        elif any(kw in head for kw in ("import ", "def ", "class ")):
            format_type = FormatType.PYTHON
        else:
            return DetectedFile(
                path=filepath,
                format=FormatType.UNKNOWN,
                confidence=0.0,
                metadata={"filename": filename, "reason": "unknown_format"},
            )

    content_hash = _compute_file_hash(filepath)
    metadata: Dict[str, Any] = {
        "filename": filename,
        "content_hash": content_hash,
        "file_size": path_obj.stat().st_size if path_obj.exists() else 0,
    }

    # Format-specific detection
    if format_type == FormatType.MARKDOWN:
        return _detect_markdown(filepath, filename, content_hash, metadata)
    elif format_type == FormatType.PYTHON:
        return _detect_python(filepath, filename, content_hash, metadata)
    elif format_type == FormatType.YAML:
        return _detect_yaml(filepath, filename, content_hash, metadata)
    elif format_type == FormatType.JSON:
        return _detect_json(filepath, filename, content_hash, metadata)
    elif format_type == FormatType.TEXT:
        return _detect_text(filepath, filename, content_hash, metadata)

    # Fallback
    return DetectedFile(
        path=filepath,
        format=format_type,
        confidence=0.5,
        metadata=metadata,
    )


def _detect_markdown(
    filepath: str, filename: str, content_hash: str, metadata: Dict[str, Any]
) -> DetectedFile:
    """Detect Markdown format and check for YAML frontmatter."""
    head = _read_file_head(filepath, max_bytes=16384)
    has_frontmatter, frontmatter = _has_yaml_frontmatter(head)

    metadata["has_frontmatter"] = has_frontmatter
    if frontmatter:
        metadata["frontmatter_keys"] = list(frontmatter.keys())
        metadata["name"] = frontmatter.get("name", "")
        metadata["description"] = frontmatter.get("description", "")
        metadata["category"] = frontmatter.get("category", "")

    # Confidence: higher if it has frontmatter (more likely a proper agent spec)
    confidence = 0.9 if has_frontmatter else 0.7

    return DetectedFile(
        path=filepath,
        format=FormatType.MARKDOWN,
        confidence=confidence,
        metadata=metadata,
    )


def _detect_python(
    filepath: str, filename: str, content_hash: str, metadata: Dict[str, Any]
) -> DetectedFile:
    """Detect Python format and identify agent classes."""
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except (OSError, IOError) as e:
        logger.warning(f"Cannot read Python file {filepath}: {e}")
        return DetectedFile(
            path=filepath,
            format=FormatType.PYTHON,
            confidence=0.3,
            metadata={**metadata, "error": str(e)},
        )

    # Check file size - skip very large files
    if len(content) > MAX_SCAN_SIZE:
        metadata["truncated"] = True
        metadata["reason"] = "file_too_large"
        return DetectedFile(
            path=filepath,
            format=FormatType.PYTHON,
            confidence=0.2,
            metadata=metadata,
        )

    classes = _extract_python_classes(content)
    agent_classes = [c for c in classes if c["is_agent_class"]]

    metadata["class_count"] = len(classes)
    metadata["agent_class_count"] = len(agent_classes)

    if agent_classes:
        metadata["agent_classes"] = [c["name"] for c in agent_classes]
        metadata["has_agent_classes"] = True
        # High confidence: has classes inheriting from agent bases
        confidence = 0.95
    elif classes:
        metadata["classes"] = [c["name"] for c in classes]
        metadata["has_agent_classes"] = False
        # Medium confidence: has classes but not agent-specific
        confidence = 0.6
    else:
        # Check for agent-related imports or keywords
        agent_keywords = {"agent", "role", "action", "tool", "llm", "chat", "prompt"}
        content_lower = content.lower()
        found_keywords = agent_keywords & set(content_lower.split())
        metadata["agent_keywords"] = list(found_keywords)

        if found_keywords:
            confidence = 0.5
        else:
            confidence = 0.3  # Just a Python file, not obviously agent-related

    return DetectedFile(
        path=filepath,
        format=FormatType.PYTHON,
        confidence=confidence,
        metadata=metadata,
    )


def _detect_yaml(
    filepath: str, filename: str, content_hash: str, metadata: Dict[str, Any]
) -> DetectedFile:
    """Detect YAML format and check for agent-like structure."""
    import yaml

    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except (OSError, IOError) as e:
        logger.warning(f"Cannot read YAML file {filepath}: {e}")
        return DetectedFile(
            path=filepath,
            format=FormatType.YAML,
            confidence=0.3,
            metadata={**metadata, "error": str(e)},
        )

    if len(content) > MAX_SCAN_SIZE:
        metadata["truncated"] = True
        return DetectedFile(
            path=filepath,
            format=FormatType.YAML,
            confidence=0.2,
            metadata=metadata,
        )

    try:
        data = yaml.safe_load(content)
    except yaml.YAMLError:
        metadata["parse_error"] = True
        return DetectedFile(
            path=filepath,
            format=FormatType.YAML,
            confidence=0.3,
            metadata=metadata,
        )

    if isinstance(data, dict):
        metadata["top_level_keys"] = list(data.keys())
        metadata["name"] = data.get("name", "")

        # Check for agent-like structure
        agent_indicators = 0
        for key in AGENT_JSON_KEYS:
            if key in data:
                agent_indicators += 1

        if agent_indicators >= 3:
            metadata["is_agent_config"] = True
            confidence = 0.9
        elif agent_indicators >= 1:
            metadata["is_agent_config"] = True
            confidence = 0.7
        else:
            metadata["is_agent_config"] = False
            confidence = 0.5
    elif isinstance(data, list):
        metadata["item_count"] = len(data)
        # Check if list items look like agent configs
        if data and isinstance(data[0], dict):
            agent_items = sum(
                1
                for item in data[:5]
                if isinstance(item, dict) and set(item.keys()) & AGENT_JSON_KEYS
            )
            metadata["agent_like_items"] = agent_items
            confidence = 0.6 if agent_items > 0 else 0.4
        else:
            confidence = 0.3
    else:
        confidence = 0.3

    return DetectedFile(
        path=filepath,
        format=FormatType.YAML,
        confidence=confidence,
        metadata=metadata,
    )


def _detect_json(
    filepath: str, filename: str, content_hash: str, metadata: Dict[str, Any]
) -> DetectedFile:
    """Detect JSON format and check for agent-like structure."""
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except (OSError, IOError) as e:
        logger.warning(f"Cannot read JSON file {filepath}: {e}")
        return DetectedFile(
            path=filepath,
            format=FormatType.JSON,
            confidence=0.3,
            metadata={**metadata, "error": str(e)},
        )

    if len(content) > MAX_SCAN_SIZE:
        metadata["truncated"] = True
        return DetectedFile(
            path=filepath,
            format=FormatType.JSON,
            confidence=0.2,
            metadata=metadata,
        )

    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        metadata["parse_error"] = True
        return DetectedFile(
            path=filepath,
            format=FormatType.JSON,
            confidence=0.3,
            metadata=metadata,
        )

    if isinstance(data, dict):
        metadata["top_level_keys"] = list(data.keys())
        metadata["name"] = data.get("name", data.get("agent_name", ""))

        if _is_agent_json(data):
            metadata["is_agent_manifest"] = True
            confidence = 0.9
        else:
            metadata["is_agent_manifest"] = False
            confidence = 0.5
    elif isinstance(data, list):
        metadata["item_count"] = len(data)
        agent_items = sum(1 for item in data[:10] if _is_agent_json(item))
        metadata["agent_like_items"] = agent_items
        confidence = 0.7 if agent_items > 0 else 0.4
    else:
        confidence = 0.3

    return DetectedFile(
        path=filepath,
        format=FormatType.JSON,
        confidence=confidence,
        metadata=metadata,
    )


def _detect_text(
    filepath: str, filename: str, content_hash: str, metadata: Dict[str, Any]
) -> DetectedFile:
    """Detect plain text/prompt format."""
    head = _read_file_head(filepath, max_bytes=4096)
    metadata["head_preview"] = head[:200]
    metadata["name"] = Path(filename).stem  # Use filename stem as name

    # Confidence: text files are basic prompts, moderate confidence
    if len(head.strip()) > 50:
        confidence = 0.6
    else:
        confidence = 0.3  # Very short file, likely not a full prompt

    return DetectedFile(
        path=filepath,
        format=FormatType.TEXT,
        confidence=confidence,
        metadata=metadata,
    )


def scan_directory(
    directory: str,
    min_confidence: float = 0.0,
    max_files: Optional[int] = None,
    formats: Optional[List[FormatType]] = None,
) -> List[DetectedFile]:
    """
    Scan a directory tree and detect agent file formats.

    Walks the directory recursively, identifies files by extension and content,
    and returns a list of DetectedFile objects sorted by confidence (descending).

    Args:
        directory: Root directory to scan.
        min_confidence: Minimum confidence threshold (0.0 to 1.0).
        max_files: Maximum number of files to process (None for unlimited).
        formats: Optional list of formats to include (None for all).

    Returns:
        List of DetectedFile objects sorted by confidence descending.
    """
    directory = os.path.abspath(directory)
    if not os.path.isdir(directory):
        logger.error(f"Directory does not exist: {directory}")
        return []

    detected: List[DetectedFile] = []
    count = 0

    logger.info(f"Scanning directory: {directory}")

    for root, dirs, files in os.walk(directory):
        # Prune ignored directories in-place
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRS]

        for filename in sorted(files):
            if _should_ignore_file(filename):
                continue

            filepath = os.path.join(root, filename)

            # Skip non-files and symlinks to non-files
            if not os.path.isfile(filepath) or os.path.islink(filepath):
                if os.path.islink(filepath) and not os.path.exists(filepath):
                    continue

            detected_file = detect_single_file(filepath)

            # Apply format filter
            if formats and detected_file.format not in formats:
                continue

            # Apply confidence filter
            if detected_file.confidence < min_confidence:
                continue

            detected.append(detected_file)
            count += 1

            if max_files and count >= max_files:
                logger.info(f"Reached max_files limit: {max_files}")
                break

        if max_files and count >= max_files:
            break

    # Sort by confidence descending, then by path
    detected.sort(key=lambda d: (-d.confidence, d.path))

    logger.info(f"Scan complete: found {len(detected)} files")
    return detected


def get_format_summary(detected_files: List[DetectedFile]) -> Dict[str, Any]:
    """
    Generate a summary of detected file formats.

    Args:
        detected_files: List of DetectedFile objects.

    Returns:
        Dictionary with format counts, average confidence, and file lists.
    """
    summary: Dict[str, Any] = {
        "total_files": len(detected_files),
        "by_format": {},
        "average_confidence": 0.0,
        "formats_detected": [],
    }

    if not detected_files:
        return summary

    format_groups: Dict[str, List[DetectedFile]] = {}
    total_confidence = 0.0

    for df in detected_files:
        fmt = df.format.value
        if fmt not in format_groups:
            format_groups[fmt] = []
        format_groups[fmt].append(df)
        total_confidence += df.confidence

    summary["average_confidence"] = round(total_confidence / len(detected_files), 3)

    for fmt, files in format_groups.items():
        summary["by_format"][fmt] = {
            "count": len(files),
            "average_confidence": round(
                sum(f.confidence for f in files) / len(files), 3
            ),
            "files": [f.path for f in files],
        }

    summary["formats_detected"] = list(format_groups.keys())
    return summary


def detect_repo_clone(
    repo_path: str,
    min_confidence: float = 0.3,
) -> Dict[str, Any]:
    """
    Convenience function to detect agent files in a cloned repository.

    Args:
        repo_path: Path to the cloned repository.
        min_confidence: Minimum confidence threshold.

    Returns:
        Dictionary with detected files and summary.
    """
    detected = scan_directory(
        repo_path,
        min_confidence=min_confidence,
    )

    summary = get_format_summary(detected)

    return {
        "repo_path": repo_path,
        "detected_files": [df.to_dict() for df in detected],
        "summary": summary,
        "total_detected": len(detected),
    }
