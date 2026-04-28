"""
Consolidated Parsers.
Contains JSON, YAML, Markdown, Python, and Text parsers.
"""

import ast
import json
import logging
import os
import re
from typing import Any, Dict, List, Optional, Tuple

import yaml

from backend.ensemble.parsers.agent_data import AgentCategory, AgentData, AgentFormat

"\ncore/parsers/markdown_parser.py\nParser for Markdown files with YAML frontmatter.\n\nExtracts agent specifications from Markdown files in the format:\n---\nname: Agent Name\ndescription: Agent description\ncategory: development\nemoji: 💻\ntools:\n  - read_artifact\n  - write_artifact\n---\n\n# Agent Instructions\nBody prompt content here...\n"

logger = logging.getLogger(__name__)

FRONTMATTER_RE = re.compile("^---\\s*\\n(.*?)\\n---\\s*\\n(.*)", re.DOTALL)

VALID_KEYS = {
    "name",
    "description",
    "category",
    "emoji",
    "tools",
    "version",
    "author",
    "model",
    "temperature",
    "max_tokens",
    "role",
    "tags",
    "priority",
    "format",
}


class MarkdownParser:
    """
    Parser for Markdown agent specification files.

    Handles Markdown files with optional YAML frontmatter.
    Extracts agent metadata and body prompt.
    """

    def __init__(self):
        """Initialize the Markdown parser."""
        self.parse_errors: List[str] = []

    def parse(self, filepath: str) -> AgentData:
        """
        Parse a Markdown file into AgentData.

        Args:
            filepath: Absolute path to the Markdown file.

        Returns:
            AgentData object with extracted metadata and content.
        """
        try:
            with open(filepath, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
        except (OSError, IOError) as e:
            logger.error(f"Cannot read Markdown file {filepath}: {e}")
            self.parse_errors.append(f"Read error: {e}")
            return AgentData(
                name=os.path.splitext(os.path.basename(filepath))[0],
                format=AgentFormat.MARKDOWN,
                source_path=filepath,
                description=f"Error reading file: {e}",
            )
        return self.parse_content(content, filepath)

    def parse_content(self, content: str, source_path: str = "") -> AgentData:
        """
        Parse Markdown content string into AgentData.

        Args:
            content: Markdown content string.
            source_path: Optional source path for tracking.

        Returns:
            AgentData object with extracted metadata and content.
        """
        has_frontmatter, frontmatter, body = self._split_frontmatter(content)
        metadata = {}
        if frontmatter:
            metadata = frontmatter
        name = metadata.get("name", "")
        if not name and source_path:
            name = os.path.splitext(os.path.basename(source_path))[0]
        if not name:
            name = "unknown_agent"
        description = metadata.get("description", "")
        category = self._parse_category(metadata.get("category", ""))
        emoji = metadata.get("emoji", self._guess_emoji(category))
        tools = self._parse_tools(metadata.get("tools", []))
        version = str(metadata.get("version", "1.0.0"))
        author = metadata.get("author", "")
        model = str(metadata.get("model", ""))
        temperature = self._safe_float(metadata.get("temperature"))
        max_tokens = self._safe_int(metadata.get("max_tokens"))
        body_prompt = body.strip()
        raw_content = content
        return AgentData(
            name=name,
            format=AgentFormat.MARKDOWN,
            source_path=source_path or "",
            description=description,
            category=category,
            emoji=emoji,
            version=version,
            author=author,
            system_prompt=self._extract_system_prompt(metadata),
            body_prompt=body_prompt,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            tools=tools,
            config=self._extract_config(metadata),
            raw_content=raw_content,
        )

    def _split_frontmatter(
        self, content: str
    ) -> Tuple[bool, Optional[Dict[str, Any]], str]:
        """
        Split content into frontmatter and body.

        Returns:
            Tuple of (has_frontmatter, parsed_frontmatter_or_None, body_content).
        """
        match = FRONTMATTER_RE.match(content)
        if not match:
            return (False, None, content)
        try:
            parsed = yaml.safe_load(match.group(1))
            if isinstance(parsed, dict):
                return (True, parsed, match.group(2))
        except yaml.YAMLError as e:
            logger.warning(f"Failed to parse frontmatter YAML: {e}")
            self.parse_errors.append(f"YAML parse error: {e}")
        return (True, None, match.group(2))

    def _parse_category(self, category_str: str) -> AgentCategory:
        """Parse category string into AgentCategory enum."""
        if not category_str:
            return AgentCategory.GENERAL
        normalized = category_str.lower().replace(" ", "_").replace("-", "_")
        try:
            return AgentCategory(normalized)
        except ValueError:
            category_map = {
                "ai_ml": AgentCategory.AI_ML,
                "ai-ml": AgentCategory.AI_ML,
                "aiml": AgentCategory.AI_ML,
                "devops": AgentCategory.DEVOPS,
                "dev_ops": AgentCategory.DEVOPS,
            }
            return category_map.get(normalized, AgentCategory.GENERAL)

    def _guess_emoji(self, category: AgentCategory) -> str:
        """Guess an appropriate emoji for the category."""
        emoji_map = {
            AgentCategory.DEVELOPMENT: "💻",
            AgentCategory.AI_ML: "🤖",
            AgentCategory.SECURITY: "🔒",
            AgentCategory.INFRASTRUCTURE: "🏗️",
            AgentCategory.DATA: "📊",
            AgentCategory.DEVOPS: "⚙️",
            AgentCategory.MOBILE: "📱",
            AgentCategory.CLOUD: "☁️",
            AgentCategory.BUSINESS: "💼",
            AgentCategory.DOCUMENTATION: "📝",
            AgentCategory.TESTING: "🧪",
            AgentCategory.DATABASE: "🗄️",
            AgentCategory.FRONTEND: "🎨",
            AgentCategory.BACKEND: "🔧",
            AgentCategory.RESEARCH: "🔬",
            AgentCategory.WRITING: "✍️",
            AgentCategory.AUTOMATION: "🔄",
        }
        return emoji_map.get(category, "📦")

    def _parse_tools(self, tools_data: Any) -> List[str]:
        """Parse tools field into a list of tool name strings."""
        if isinstance(tools_data, list):
            return [str(t).strip() for t in tools_data if str(t).strip()]
        if isinstance(tools_data, str):
            return [t.strip() for t in tools_data.split(",") if t.strip()]
        return []

    def _extract_system_prompt(self, metadata: Dict[str, Any]) -> str:
        """
        Extract system prompt from metadata.

        Builds a system prompt from role/name/description if available.
        """
        parts = []
        name = metadata.get("name", "")
        description = metadata.get("description", "")
        role = metadata.get("role", "")
        if role:
            parts.append(f"You are {role}.")
        elif name:
            parts.append(f"You are {name}.")
        if description:
            parts.append(description)
        return "\n".join(parts) if parts else ""

    def _extract_config(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Extract non-standard configuration keys from metadata."""
        config = {}
        for key, value in metadata.items():
            if key not in VALID_KEYS:
                config[key] = value
        return config

    def _safe_float(self, value: Any) -> Optional[float]:
        """Safely convert value to float."""
        if value is None:
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None

    def _safe_int(self, value: Any) -> Optional[int]:
        """Safely convert value to int."""
        if value is None:
            return None
        try:
            return int(value)
        except (ValueError, TypeError):
            return None


"\ncore/parsers/python_parser.py\nParser for Python agent files using AST analysis.\n\nDetects agent classes (subclasses of Role, Action, Agent, BaseAgent, etc.),\nextracts class metadata, system prompts, and method information.\n\nSafe parsing: uses AST only, never executes code.\n"

logger = logging.getLogger(__name__)

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
    "BaseNode",
    "BaseState",
    "BaseTask",
}

EXECUTION_METHODS = {"run", "execute", "act", "process", "call", "invoke", "forward"}

INIT_METHODS = {"__init__", "setup", "configure"}

SYSTEM_PROMOT_PATTERNS = [
    re.compile("system_prompt\\s*=\\s*[\"'](.+?)[\"']", re.DOTALL),
    re.compile("SYSTEM_PROMPT\\s*=\\s*[\"'](.+?)[\"']", re.DOTALL),
    re.compile("prompt\\s*=\\s*[\"'](.+?)[\"']", re.DOTALL),
    re.compile("instruction\\s*=\\s*[\"'](.+?)[\"']", re.DOTALL),
    re.compile("role\\s*=\\s*[\"'](.+?)[\"']", re.DOTALL),
]

TRIPLE_QUOTE_PATTERN = re.compile(
    "(system_prompt|SYSTEM_PROMPT|prompt|instruction|role)\\s*=\\s*([\"']{3})(.*?)\\2",
    re.DOTALL,
)


class PythonParser:
    """
    Parser for Python agent files using AST analysis.

    Detects agent classes, extracts metadata, system prompts, and
    method information. Uses AST parsing only - never executes code.
    """

    def __init__(self):
        """Initialize the Python parser."""
        self.parse_errors: List[str] = []

    def parse(self, filepath: str) -> List[AgentData]:
        """
        Parse a Python file into AgentData objects.

        May return multiple AgentData objects if the file contains
        multiple agent classes.

        Args:
            filepath: Absolute path to the Python file.

        Returns:
            List of AgentData objects (may be empty if no agents found).
        """
        try:
            with open(filepath, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
        except (OSError, IOError) as e:
            logger.error(f"Cannot read Python file {filepath}: {e}")
            self.parse_errors.append(f"Read error: {e}")
            return []
        return self.parse_content(content, filepath)

    def parse_content(self, content: str, source_path: str = "") -> List[AgentData]:
        """
        Parse Python content string into AgentData objects.

        Args:
            content: Python source code string.
            source_path: Optional source path for tracking.

        Returns:
            List of AgentData objects (may be empty if no agents found).
        """
        try:
            tree = ast.parse(content, filename=source_path or "<string>")
        except SyntaxError as e:
            logger.warning(f"Syntax error in {source_path}: {e}")
            self.parse_errors.append(f"Syntax error: {e}")
            return [self._create_fallback_agent(source_path, content)]
        imports = self._extract_imports(tree)
        global_prompts = self._extract_global_prompts(content)
        agent_classes = self._find_agent_classes(tree)
        if not agent_classes:
            if self._is_likely_agent_file(tree, content):
                return [self._create_from_module(tree, content, source_path, imports)]
            return []
        results = []
        for class_info in agent_classes:
            agent_data = self._create_from_class(
                class_info, content, source_path, imports, global_prompts
            )
            results.append(agent_data)
        return results

    def _extract_imports(self, tree: ast.Module) -> List[str]:
        """Extract import statements from AST."""
        imports = []
        for node in ast.iter_child_nodes(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imports.append(f"import {alias.name}")
            elif isinstance(node, ast.ImportFrom):
                module = node.module or ""
                names = ", ".join((alias.name for alias in node.names))
                imports.append(f"from {module} import {names}")
        return imports

    def _extract_global_prompts(self, content: str) -> Dict[str, str]:
        """
        Extract system prompt strings from global assignments.

        Searches for patterns like system_prompt = "..." at module level.
        """
        prompts = {}
        for match in TRIPLE_QUOTE_PATTERN.finditer(content):
            key = match.group(1).lower()
            value = match.group(3).strip()
            prompts[key] = value
        for pattern in SYSTEM_PROMOT_PATTERNS:
            for match in pattern.finditer(content):
                for p in SYSTEM_PROMOT_PATTERNS:
                    m = p.match(match.group(0))
                    if m:
                        key = p.pattern.split("\\s*=\\s*")[0].lower()
                        if "system" in key:
                            key = "system_prompt"
                        elif "prompt" in key:
                            key = "prompt"
                        elif "instruction" in key:
                            key = "instruction"
                        elif "role" in key:
                            key = "role"
                        break
                else:
                    key = "system_prompt"
                if key not in prompts:
                    prompts[key] = match.group(1).strip()
        return prompts

    def _find_agent_classes(self, tree: ast.Module) -> List[Dict[str, Any]]:
        """
        Find classes that inherit from agent base classes.

        Returns list of class info dicts.
        """
        agent_classes = []
        for node in ast.iter_child_nodes(tree):
            if not isinstance(node, ast.ClassDef):
                continue
            bases = self._get_base_names(node)
            is_agent = any((b in AGENT_BASE_CLASSES for b in bases))
            if not is_agent:
                continue
            docstring = ast.get_docstring(node)
            methods = []
            execution_methods = []
            init_method = None
            for item in node.body:
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    method_name = item.name
                    methods.append(method_name)
                    if method_name in EXECUTION_METHODS:
                        execution_methods.append(method_name)
                    elif method_name in INIT_METHODS:
                        init_method = method_name
            class_prompts = self._extract_class_prompts(node)
            agent_classes.append(
                {
                    "name": node.name,
                    "bases": bases,
                    "docstring": docstring,
                    "methods": methods,
                    "execution_methods": execution_methods,
                    "init_method": init_method,
                    "class_prompts": class_prompts,
                    "line_number": node.lineno,
                    "end_line": getattr(node, "end_lineno", None),
                }
            )
        return agent_classes

    def _get_base_names(self, class_node: ast.ClassDef) -> List[str]:
        """Extract base class names from a ClassDef node."""
        names = []
        for base in class_node.bases:
            name = self._ast_node_name(base)
            if name:
                names.append(name)
        return names

    def _ast_node_name(self, node: ast.AST) -> Optional[str]:
        """Extract a name string from an AST node."""
        if isinstance(node, ast.Name):
            return node.id
        if isinstance(node, ast.Attribute):
            return node.attr
        if isinstance(node, ast.Subscript):
            return self._ast_node_name(node.value)
        return None

    def _extract_class_prompts(self, class_node: ast.ClassDef) -> Dict[str, str]:
        """Extract string assignments from class body."""
        prompts = {}
        for item in class_node.body:
            if isinstance(item, ast.Assign):
                for target in item.targets:
                    if isinstance(target, ast.Name):
                        name = target.id.lower()
                        if any(
                            (
                                kw in name
                                for kw in ("prompt", "system", "instruction", "role")
                            )
                        ):
                            if isinstance(item.value, ast.Constant) and isinstance(
                                item.value.value, str
                            ):
                                prompts[name] = item.value.value
        return prompts

    def _is_likely_agent_file(self, tree: ast.Module, content: str) -> bool:
        """
        Heuristic check: is this file likely an agent module even without
        explicit agent base class inheritance?
        """
        content_lower = content.lower()
        agent_indicators = 0
        indicators = [
            "system_prompt",
            "agent",
            "llm",
            "chat",
            "model",
            "prompt",
            "tool_call",
            "function_call",
        ]
        for indicator in indicators:
            if indicator in content_lower:
                agent_indicators += 1
        has_executing_class = False
        for node in ast.iter_child_nodes(tree):
            if isinstance(node, ast.ClassDef):
                for item in node.body:
                    if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        if item.name in EXECUTION_METHODS:
                            has_executing_class = True
                            break
        if has_executing_class:
            agent_indicators += 2
        has_prompt_function = False
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                func_content = ast.get_docstring(node) or ""
                for child in ast.walk(node):
                    if isinstance(child, ast.Constant) and isinstance(child.value, str):
                        val = child.value
                        if len(val) > 200 and any(
                            (
                                kw in val.lower()
                                for kw in [
                                    "you are",
                                    "your task",
                                    "act as",
                                    "role:",
                                    "persona:",
                                    "prompt:",
                                ]
                            )
                        ):
                            has_prompt_function = True
                            break
        if has_prompt_function:
            agent_indicators += 3
        return agent_indicators >= 3

    def _create_from_class(
        self,
        class_info: Dict[str, Any],
        content: str,
        source_path: str,
        imports: List[str],
        global_prompts: Dict[str, str],
    ) -> AgentData:
        """Create AgentData from a single class definition."""
        name = class_info["name"]
        system_prompt = ""
        class_prompts = class_info.get("class_prompts", {})
        if "system_prompt" in class_prompts:
            system_prompt = class_prompts["system_prompt"]
        elif "prompt" in class_prompts:
            system_prompt = class_prompts["prompt"]
        elif "instruction" in class_prompts:
            system_prompt = class_prompts["instruction"]
        elif "system_prompt" in global_prompts:
            system_prompt = global_prompts["system_prompt"]
        elif "prompt" in global_prompts:
            system_prompt = global_prompts["prompt"]
        docstring = class_info.get("docstring", "")
        description = ""
        body_prompt = ""
        if docstring:
            lines = docstring.strip().split("\n")
            description = lines[0].strip()
            if len(lines) > 1:
                body_prompt = "\n".join(lines[1:]).strip()
        if not body_prompt and class_info.get("line_number"):
            body_prompt = self._extract_class_source(content, class_info)
        category = self._infer_category(name, class_info["bases"])
        if not description:
            bases_str = ", ".join(class_info["bases"])
            description = f"Agent class inheriting from {bases_str}"
        import hashlib

        content_hash = hashlib.sha256(content.encode()).hexdigest()
        return AgentData(
            name=name,
            format=AgentFormat.PYTHON,
            source_path=source_path or "",
            description=description,
            category=category,
            emoji=self._guess_emoji(category),
            system_prompt=system_prompt,
            body_prompt=body_prompt,
            class_name=name,
            methods=class_info["methods"],
            imports=imports,
            config={
                "bases": class_info["bases"],
                "line_number": class_info["line_number"],
            },
            content_hash=content_hash,
            raw_content=content,
        )

    def _extract_class_source(self, content: str, class_info: Dict[str, Any]) -> str:
        """Extract the source code for a class definition."""
        start_line = class_info.get("line_number", 1)
        end_line = class_info.get("end_line")
        lines = content.split("\n")
        if end_line and end_line <= len(lines):
            return "\n".join(lines[start_line - 1 : end_line])
        elif start_line <= len(lines):
            return "\n".join(lines[start_line - 1 :])
        return ""

    def _create_from_module(
        self, tree: ast.Module, content: str, source_path: str, imports: List[str]
    ) -> AgentData:
        """
        Create AgentData from a module that looks like an agent but
        has no explicit agent base classes.
        Extracts prompts from functions (TradingAgents style).
        """
        filename = os.path.basename(source_path) if source_path else "module"
        name = os.path.splitext(filename)[0]
        module_docstring = ast.get_docstring(tree) or ""
        global_prompts = self._extract_global_prompts(content)
        system_prompt = (
            global_prompts.get("system_prompt", "")
            or global_prompts.get("prompt", "")
            or global_prompts.get("instruction", "")
        )
        if not system_prompt:
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    for child in ast.walk(node):
                        if isinstance(child, ast.Constant) and isinstance(
                            child.value, str
                        ):
                            val = child.value
                            if len(val) > 200 and any(
                                (
                                    kw in val.lower()
                                    for kw in ["you are", "your task", "act as"]
                                )
                            ):
                                system_prompt = val
                                break
                    if system_prompt:
                        break
        description = module_docstring.split("\n")[0] if module_docstring else ""
        body_prompt = (
            system_prompt if system_prompt else module_docstring or content[:2000]
        )
        classes = []
        for node in ast.iter_child_nodes(tree):
            if isinstance(node, ast.ClassDef):
                classes.append(node.name)
        import hashlib

        content_hash = hashlib.sha256(content.encode()).hexdigest()
        return AgentData(
            name=name.replace("_", " ").title(),
            format=AgentFormat.PYTHON,
            source_path=source_path or "",
            description=description or f"Python agent: {name}",
            category=AgentCategory.GENERAL,
            system_prompt=system_prompt,
            body_prompt=body_prompt,
            methods=classes,
            imports=imports,
            content_hash=content_hash,
            raw_content=content,
        )

    def _create_fallback_agent(self, source_path: str, content: str) -> AgentData:
        """Create a minimal AgentData when parsing fails."""
        filename = os.path.basename(source_path) if source_path else "unknown"
        name = os.path.splitext(filename)[0]
        import hashlib

        content_hash = hashlib.sha256(content.encode()).hexdigest()
        return AgentData(
            name=name,
            format=AgentFormat.PYTHON,
            source_path=source_path or "",
            description=f"Python file (parse fallback): {filename}",
            category=AgentCategory.GENERAL,
            body_prompt=content[:2000],
            content_hash=content_hash,
            raw_content=content,
        )

    def _infer_category(self, name: str, bases: List[str]) -> AgentCategory:
        """Infer agent category from name and base classes."""
        name_lower = name.lower()
        bases_lower = [b.lower() for b in bases]
        combined = f"{name_lower} {' '.join(bases_lower)}"
        category_map = {
            "code": AgentCategory.DEVELOPMENT,
            "dev": AgentCategory.DEVELOPMENT,
            "engineer": AgentCategory.DEVELOPMENT,
            "review": AgentCategory.TESTING,
            "test": AgentCategory.TESTING,
            "security": AgentCategory.SECURITY,
            "data": AgentCategory.DATA,
            "database": AgentCategory.DATABASE,
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
            if keyword in combined:
                return category
        return AgentCategory.GENERAL

    def _guess_emoji(self, category: AgentCategory) -> str:
        """Guess an appropriate emoji for the category."""
        emoji_map = {
            AgentCategory.DEVELOPMENT: "💻",
            AgentCategory.AI_ML: "🤖",
            AgentCategory.SECURITY: "🔒",
            AgentCategory.INFRASTRUCTURE: "🏗️",
            AgentCategory.DATA: "📊",
            AgentCategory.DEVOPS: "⚙️",
            AgentCategory.MOBILE: "📱",
            AgentCategory.CLOUD: "☁️",
            AgentCategory.BUSINESS: "💼",
            AgentCategory.DOCUMENTATION: "📝",
            AgentCategory.TESTING: "🧪",
            AgentCategory.DATABASE: "🗄️",
            AgentCategory.FRONTEND: "🎨",
            AgentCategory.BACKEND: "🔧",
            AgentCategory.RESEARCH: "🔬",
            AgentCategory.WRITING: "✍️",
            AgentCategory.AUTOMATION: "🔄",
        }
        return emoji_map.get(category, "🐍")


"\ncore/parsers/text_parser.py\nParser for plain text prompt files.\n\nExtracts content from .txt and .prompt files.\nUses filename as agent name.\n"

logger = logging.getLogger(__name__)

MAX_BODY_LENGTH = 10000


class TextParser:
    """
    Parser for plain text prompt files.

    Handles .txt and .prompt files, using the filename as the agent name
    and the file content as the prompt body.
    """

    def __init__(self):
        """Initialize the text parser."""
        self.parse_errors: List[str] = []

    def parse(self, filepath: str) -> List[AgentData]:
        """
        Parse a text file into an AgentData object.

        Args:
            filepath: Absolute path to the text file.

        Returns:
            List with a single AgentData object (or empty on error).
        """
        try:
            with open(filepath, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
        except (OSError, IOError) as e:
            logger.error(f"Cannot read text file {filepath}: {e}")
            self.parse_errors.append(f"Read error: {e}")
            return []
        return [self.parse_content(content, filepath)]

    def parse_content(self, content: str, source_path: str = "") -> AgentData:
        """
        Parse text content string into an AgentData object.

        Args:
            content: Text content string.
            source_path: Optional source path for tracking.

        Returns:
            AgentData object with the text as body prompt.
        """
        import hashlib

        if source_path:
            name = os.path.splitext(os.path.basename(source_path))[0]
        else:
            name = "text_agent"
        name = name.replace("_", " ").replace("-", " ").strip()
        if not name:
            name = "text_agent"
        body_prompt = content.strip()
        system_prompt = ""
        if body_prompt:
            first_line = body_prompt.split("\n")[0].strip()
            if len(first_line) < 100 and (
                not first_line.endswith((".", ",", ":", ";"))
            ):
                system_prompt = f"You are {first_line}."
                body_prompt = "\n".join(body_prompt.split("\n")[1:]).strip()
        if len(body_prompt) > MAX_BODY_LENGTH:
            body_prompt = body_prompt[:MAX_BODY_LENGTH] + "\n\n[Content truncated...]"
        category = self._infer_category(name)
        content_hash = hashlib.sha256(content.encode()).hexdigest()
        return AgentData(
            name=name.title(),
            format=AgentFormat.TEXT,
            source_path=source_path or "",
            description=f"Text prompt agent: {name}",
            category=category,
            emoji=self._guess_emoji(category),
            system_prompt=system_prompt,
            body_prompt=body_prompt,
            content_hash=content_hash,
            raw_content=content,
        )

    def _infer_category(self, name: str) -> AgentCategory:
        """Infer agent category from name."""
        name_lower = name.lower()
        category_map = {
            "code": AgentCategory.DEVELOPMENT,
            "dev": AgentCategory.DEVELOPMENT,
            "program": AgentCategory.DEVELOPMENT,
            "engineer": AgentCategory.DEVELOPMENT,
            "review": AgentCategory.TESTING,
            "test": AgentCategory.TESTING,
            "security": AgentCategory.SECURITY,
            "data": AgentCategory.DATA,
            "analysis": AgentCategory.DATA,
            "ml": AgentCategory.AI_ML,
            "ai": AgentCategory.AI_ML,
            "research": AgentCategory.RESEARCH,
            "write": AgentCategory.WRITING,
            "doc": AgentCategory.DOCUMENTATION,
            "deploy": AgentCategory.DEVOPS,
            "cloud": AgentCategory.CLOUD,
            "business": AgentCategory.BUSINESS,
            "auto": AgentCategory.AUTOMATION,
        }
        for keyword, category in category_map.items():
            if keyword in name_lower:
                return category
        return AgentCategory.GENERAL

    def _guess_emoji(self, category: AgentCategory) -> str:
        """Guess an appropriate emoji for the category."""
        emoji_map = {
            AgentCategory.DEVELOPMENT: "💻",
            AgentCategory.AI_ML: "🤖",
            AgentCategory.SECURITY: "🔒",
            AgentCategory.INFRASTRUCTURE: "🏗️",
            AgentCategory.DATA: "📊",
            AgentCategory.DEVOPS: "⚙️",
            AgentCategory.MOBILE: "📱",
            AgentCategory.CLOUD: "☁️",
            AgentCategory.BUSINESS: "💼",
            AgentCategory.DOCUMENTATION: "📝",
            AgentCategory.TESTING: "🧪",
            AgentCategory.DATABASE: "🗄️",
            AgentCategory.FRONTEND: "🎨",
            AgentCategory.BACKEND: "🔧",
            AgentCategory.RESEARCH: "🔬",
            AgentCategory.WRITING: "✍️",
            AgentCategory.AUTOMATION: "🔄",
        }
        return emoji_map.get(category, "📄")


"\ncore/parsers/yaml_parser.py\nParser for YAML agent configuration files.\n\nSupports LangChain, AutoGen, and generic YAML agent formats.\nExtracts agent name, model, prompts, tools, and configuration.\n"

logger = logging.getLogger(__name__)

AGENT_INDICATOR_KEYS = {
    "name",
    "role",
    "agent_type",
    "agent_name",
    "model",
    "prompt",
    "system_prompt",
    "instructions",
    "system_message",
}

AGENT_LIST_KEYS = {"agents", "roles", "participants", "members"}

CONFIG_KEYS = {
    "name",
    "description",
    "category",
    "emoji",
    "version",
    "author",
    "model",
    "temperature",
    "max_tokens",
    "prompt",
    "system_prompt",
    "instructions",
    "tools",
    "agent_type",
    "role",
}


class YAMLParser:
    """
    Parser for YAML agent configuration files.

    Supports multiple YAML agent formats including LangChain, AutoGen,
    and generic YAML-based agent configurations.
    """

    def __init__(self):
        """Initialize the YAML parser."""
        self.parse_errors: List[str] = []

    def parse(self, filepath: str) -> List[AgentData]:
        """
        Parse a YAML file into AgentData objects.

        May return multiple AgentData objects if the file contains
        a list of agent configurations.

        Args:
            filepath: Absolute path to the YAML file.

        Returns:
            List of AgentData objects.
        """
        try:
            with open(filepath, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
        except (OSError, IOError) as e:
            logger.error(f"Cannot read YAML file {filepath}: {e}")
            self.parse_errors.append(f"Read error: {e}")
            return []
        return self.parse_content(content, filepath)

    def parse_content(self, content: str, source_path: str = "") -> List[AgentData]:
        """
        Parse YAML content string into AgentData objects.

        Args:
            content: YAML content string.
            source_path: Optional source path for tracking.

        Returns:
            List of AgentData objects.
        """
        try:
            data = yaml.safe_load(content)
        except yaml.YAMLError as e:
            logger.warning(f"YAML parse error in {source_path}: {e}")
            self.parse_errors.append(f"YAML parse error: {e}")
            return []
        if data is None:
            return []
        if isinstance(data, dict):
            return self._parse_dict(data, source_path, content)
        elif isinstance(data, list):
            return self._parse_list(data, source_path, content)
        else:
            logger.warning(f"Unexpected YAML type in {source_path}: {type(data)}")
            return []

    def _parse_dict(
        self, data: Dict[str, Any], source_path: str, raw_content: str
    ) -> List[AgentData]:
        """Parse a YAML dictionary - either single agent or container."""
        list_key = self._find_agent_list_key(data)
        if list_key:
            agents_data = data[list_key]
            if isinstance(agents_data, list):
                return self._parse_list(agents_data, source_path, raw_content)
        if self._is_agent_config(data):
            return [self._create_agent_data(data, source_path, raw_content)]
        for key in ("agent", "role", "participant", "member"):
            if key in data and isinstance(data[key], dict):
                nested = data[key].copy()
                for k, v in data.items():
                    if k != key and k not in nested:
                        nested[k] = v
                return [self._create_agent_data(nested, source_path, raw_content)]
        return []

    def _parse_list(
        self, data: List[Any], source_path: str, raw_content: str
    ) -> List[AgentData]:
        """Parse a YAML list - each item may be an agent config."""
        results = []
        for i, item in enumerate(data):
            if isinstance(item, dict):
                if self._is_agent_config(item):
                    results.append(
                        self._create_agent_data(item, source_path, raw_content)
                    )
            elif isinstance(item, str) and item.strip():
                results.append(
                    AgentData(
                        name=item.strip(),
                        format=AgentFormat.YAML,
                        source_path=source_path or "",
                        description=f"Agent from YAML list entry {i}",
                    )
                )
        return results

    def _find_agent_list_key(self, data: Dict[str, Any]) -> Optional[str]:
        """Find a key that contains a list of agent configurations."""
        for key in AGENT_LIST_KEYS:
            if key in data and isinstance(data[key], list):
                return key
        for key, value in data.items():
            if isinstance(value, list) and value:
                if isinstance(value[0], dict) and self._is_agent_config(value[0]):
                    return key
        return None

    def _is_agent_config(self, data: Dict[str, Any]) -> bool:
        """Check if a dictionary looks like an agent configuration."""
        found_indicators = set(data.keys()) & AGENT_INDICATOR_KEYS
        return len(found_indicators) >= 1

    def _create_agent_data(
        self, data: Dict[str, Any], source_path: str, raw_content: str
    ) -> AgentData:
        """Create AgentData from a YAML dictionary."""
        import hashlib

        name = str(
            data.get("name")
            or data.get("agent_name")
            or data.get("role")
            or data.get("agent_type")
            or os.path.splitext(os.path.basename(source_path))[0]
        )
        description = str(
            data.get("description") or data.get("desc") or data.get("summary") or ""
        )
        category = self._parse_category(data.get("category", ""))
        emoji = str(data.get("emoji", self._guess_emoji(category)))
        version = str(data.get("version", "1.0.0"))
        author = str(data.get("author", data.get("creator", "")))
        model = str(data.get("model", data.get("model_name", data.get("llm", ""))))
        temperature = self._safe_float(data.get("temperature", data.get("temp")))
        max_tokens = self._safe_int(data.get("max_tokens", data.get("max_length")))
        system_prompt = str(
            data.get("system_prompt")
            or data.get("system_message")
            or data.get("instructions")
            or data.get("instruction")
            or ""
        )
        body_prompt = str(
            data.get("prompt")
            or data.get("user_prompt")
            or data.get("task")
            or data.get("context")
            or ""
        )
        tools = self._extract_tools(data.get("tools", []))
        config = {
            k: v
            for k, v in data.items()
            if k not in CONFIG_KEYS and (not k.startswith("_"))
        }
        content_hash = hashlib.sha256(raw_content.encode()).hexdigest()
        return AgentData(
            name=name,
            format=AgentFormat.YAML,
            source_path=source_path or "",
            description=description,
            category=category,
            emoji=emoji,
            version=version,
            author=author,
            system_prompt=system_prompt,
            body_prompt=body_prompt,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            tools=tools,
            config=config,
            content_hash=content_hash,
            raw_content=raw_content,
        )

    def _extract_tools(self, tools_data: Any) -> List[str]:
        """Extract tool names from various formats."""
        if isinstance(tools_data, list):
            result = []
            for tool in tools_data:
                if isinstance(tool, str):
                    result.append(tool.strip())
                elif isinstance(tool, dict):
                    name = tool.get("name", tool.get("function", tool.get("tool", "")))
                    if name:
                        result.append(str(name).strip())
                elif tool is not None:
                    result.append(str(tool).strip())
            return [t for t in result if t]
        elif isinstance(tools_data, str):
            return [t.strip() for t in tools_data.split(",") if t.strip()]
        return []

    def _parse_category(self, category_str: Any) -> AgentCategory:
        """Parse category string into AgentCategory enum."""
        if not category_str:
            return AgentCategory.GENERAL
        normalized = str(category_str).lower().replace(" ", "_").replace("-", "_")
        try:
            return AgentCategory(normalized)
        except ValueError:
            return AgentCategory.GENERAL

    def _guess_emoji(self, category: AgentCategory) -> str:
        """Guess an appropriate emoji for the category."""
        emoji_map = {
            AgentCategory.DEVELOPMENT: "💻",
            AgentCategory.AI_ML: "🤖",
            AgentCategory.SECURITY: "🔒",
            AgentCategory.INFRASTRUCTURE: "🏗️",
            AgentCategory.DATA: "📊",
            AgentCategory.DEVOPS: "⚙️",
            AgentCategory.MOBILE: "📱",
            AgentCategory.CLOUD: "☁️",
            AgentCategory.BUSINESS: "💼",
            AgentCategory.DOCUMENTATION: "📝",
            AgentCategory.TESTING: "🧪",
            AgentCategory.DATABASE: "🗄️",
            AgentCategory.FRONTEND: "🎨",
            AgentCategory.BACKEND: "🔧",
            AgentCategory.RESEARCH: "🔬",
            AgentCategory.WRITING: "✍️",
            AgentCategory.AUTOMATION: "🔄",
        }
        return emoji_map.get(category, "📋")

    def _safe_float(self, value: Any) -> Optional[float]:
        """Safely convert value to float."""
        if value is None:
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None

    def _safe_int(self, value: Any) -> Optional[int]:
        """Safely convert value to int."""
        if value is None:
            return None
        try:
            return int(value)
        except (ValueError, TypeError):
            return None


"\ncore/parsers/json_parser.py\nParser for JSON agent manifest files.\n\nSupports SuperAGI and generic JSON agent formats.\nExtracts agent name, description, tools, and configuration.\n"

logger = logging.getLogger(__name__)

AGENT_INDICATOR_KEYS = {
    "name",
    "agent_name",
    "role",
    "description",
    "prompt",
    "system_prompt",
    "instructions",
    "agent_type",
    "tools",
    "model",
    "category",
}

AGENT_ARRAY_KEYS = {"agents", "roles", "participants", "members", "items"}

CONFIG_KEYS = {
    "name",
    "agent_name",
    "role",
    "description",
    "category",
    "emoji",
    "version",
    "author",
    "model",
    "temperature",
    "max_tokens",
    "prompt",
    "system_prompt",
    "instructions",
    "tools",
    "agent_type",
}


class JSONParser:
    """
    Parser for JSON agent manifest files.

    Supports SuperAGI format and generic JSON-based agent configurations.
    Can handle single agent objects or arrays of agents.
    """

    def __init__(self):
        """Initialize the JSON parser."""
        self.parse_errors: List[str] = []

    def parse(self, filepath: str) -> List[AgentData]:
        """
        Parse a JSON file into AgentData objects.

        May return multiple AgentData objects if the file contains
        an array of agent configurations.

        Args:
            filepath: Absolute path to the JSON file.

        Returns:
            List of AgentData objects.
        """
        try:
            with open(filepath, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
        except (OSError, IOError) as e:
            logger.error(f"Cannot read JSON file {filepath}: {e}")
            self.parse_errors.append(f"Read error: {e}")
            return []
        return self.parse_content(content, filepath)

    def parse_content(self, content: str, source_path: str = "") -> List[AgentData]:
        """
        Parse JSON content string into AgentData objects.

        Args:
            content: JSON content string.
            source_path: Optional source path for tracking.

        Returns:
            List of AgentData objects.
        """
        try:
            data = json.loads(content)
        except json.JSONDecodeError as e:
            logger.warning(f"JSON parse error in {source_path}: {e}")
            self.parse_errors.append(f"JSON parse error: {e}")
            return []
        if isinstance(data, dict):
            return self._parse_dict(data, source_path, content)
        elif isinstance(data, list):
            return self._parse_list(data, source_path, content)
        else:
            logger.warning(f"Unexpected JSON type in {source_path}: {type(data)}")
            return []

    def _parse_dict(
        self, data: Dict[str, Any], source_path: str, raw_content: str
    ) -> List[AgentData]:
        """Parse a JSON dictionary - either single agent or container."""
        for key in AGENT_ARRAY_KEYS:
            if key in data and isinstance(data[key], list):
                results = []
                for item in data[key]:
                    if isinstance(item, dict) and self._is_agent_config(item):
                        results.append(
                            self._create_agent_data(item, source_path, raw_content)
                        )
                if results:
                    return results
        if self._is_agent_config(data):
            return [self._create_agent_data(data, source_path, raw_content)]
        for key in ("agent", "config", "settings", "spec"):
            if key in data and isinstance(data[key], dict):
                nested = data[key].copy()
                for k, v in data.items():
                    if k != key and k not in nested:
                        nested[k] = v
                if self._is_agent_config(nested):
                    return [self._create_agent_data(nested, source_path, raw_content)]
        return []

    def _parse_list(
        self, data: List[Any], source_path: str, raw_content: str
    ) -> List[AgentData]:
        """Parse a JSON array - each item may be an agent config."""
        results = []
        for i, item in enumerate(data):
            if isinstance(item, dict):
                if self._is_agent_config(item):
                    results.append(
                        self._create_agent_data(item, source_path, raw_content)
                    )
            elif isinstance(item, str) and item.strip():
                results.append(
                    AgentData(
                        name=item.strip(),
                        format=AgentFormat.JSON,
                        source_path=source_path or "",
                        description=f"Agent from JSON array entry {i}",
                    )
                )
        return results

    def _is_agent_config(self, data: Dict[str, Any]) -> bool:
        """Check if a dictionary looks like an agent configuration."""
        found_indicators = set(data.keys()) & AGENT_INDICATOR_KEYS
        return len(found_indicators) >= 1

    def _create_agent_data(
        self, data: Dict[str, Any], source_path: str, raw_content: str
    ) -> AgentData:
        """Create AgentData from a JSON dictionary."""
        import hashlib

        name = str(
            data.get("name")
            or data.get("agent_name")
            or data.get("role")
            or os.path.splitext(os.path.basename(source_path))[0]
        )
        description = str(
            data.get("description") or data.get("desc") or data.get("summary") or ""
        )
        category = self._parse_category(data.get("category", ""))
        emoji = str(data.get("emoji", self._guess_emoji(category)))
        version = str(data.get("version", "1.0.0"))
        author = str(data.get("author", data.get("creator", "")))
        model = str(data.get("model", data.get("model_name", data.get("llm", ""))))
        temperature = self._safe_float(data.get("temperature", data.get("temp")))
        max_tokens = self._safe_int(data.get("max_tokens", data.get("max_length")))
        system_prompt = str(
            data.get("system_prompt")
            or data.get("system_message")
            or data.get("instructions")
            or data.get("instruction")
            or ""
        )
        body_prompt = str(
            data.get("prompt")
            or data.get("user_prompt")
            or data.get("task")
            or data.get("context")
            or ""
        )
        tools = self._extract_tools(data.get("tools", []))
        config = {
            k: v
            for k, v in data.items()
            if k not in CONFIG_KEYS and (not k.startswith("_"))
        }
        content_hash = hashlib.sha256(raw_content.encode()).hexdigest()
        return AgentData(
            name=name,
            format=AgentFormat.JSON,
            source_path=source_path or "",
            description=description,
            category=category,
            emoji=emoji,
            version=version,
            author=author,
            system_prompt=system_prompt,
            body_prompt=body_prompt,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            tools=tools,
            config=config,
            content_hash=content_hash,
            raw_content=raw_content,
        )

    def _extract_tools(self, tools_data: Any) -> List[str]:
        """Extract tool names from various formats."""
        if isinstance(tools_data, list):
            result = []
            for tool in tools_data:
                if isinstance(tool, str):
                    result.append(tool.strip())
                elif isinstance(tool, dict):
                    name = tool.get("name", tool.get("function", tool.get("tool", "")))
                    if name:
                        result.append(str(name).strip())
                elif tool is not None:
                    result.append(str(tool).strip())
            return [t for t in result if t]
        elif isinstance(tools_data, str):
            return [t.strip() for t in tools_data.split(",") if t.strip()]
        return []

    def _parse_category(self, category_str: Any) -> AgentCategory:
        """Parse category string into AgentCategory enum."""
        if not category_str:
            return AgentCategory.GENERAL
        normalized = str(category_str).lower().replace(" ", "_").replace("-", "_")
        try:
            return AgentCategory(normalized)
        except ValueError:
            return AgentCategory.GENERAL

    def _guess_emoji(self, category: AgentCategory) -> str:
        """Guess an appropriate emoji for the category."""
        emoji_map = {
            AgentCategory.DEVELOPMENT: "💻",
            AgentCategory.AI_ML: "🤖",
            AgentCategory.SECURITY: "🔒",
            AgentCategory.INFRASTRUCTURE: "🏗️",
            AgentCategory.DATA: "📊",
            AgentCategory.DEVOPS: "⚙️",
            AgentCategory.MOBILE: "📱",
            AgentCategory.CLOUD: "☁️",
            AgentCategory.BUSINESS: "💼",
            AgentCategory.DOCUMENTATION: "📝",
            AgentCategory.TESTING: "🧪",
            AgentCategory.DATABASE: "🗄️",
            AgentCategory.FRONTEND: "🎨",
            AgentCategory.BACKEND: "🔧",
            AgentCategory.RESEARCH: "🔬",
            AgentCategory.WRITING: "✍️",
            AgentCategory.AUTOMATION: "🔄",
        }
        return emoji_map.get(category, "📄")

    def _safe_float(self, value: Any) -> Optional[float]:
        """Safely convert value to float."""
        if value is None:
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None

    def _safe_int(self, value: Any) -> Optional[int]:
        """Safely convert value to int."""
        if value is None:
            return None
        try:
            return int(value)
        except (ValueError, TypeError):
            return None
