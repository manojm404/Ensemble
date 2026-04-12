"""
core/parsers/python_parser.py
Parser for Python agent files using AST analysis.

Detects agent classes (subclasses of Role, Action, Agent, BaseAgent, etc.),
extracts class metadata, system prompts, and method information.

Safe parsing: uses AST only, never executes code.
"""
import os
import ast
import re
import logging
from typing import List, Dict, Any, Optional, Tuple

from core.parsers.agent_data import AgentData, AgentFormat, AgentCategory

logger = logging.getLogger(__name__)

# Known agent base classes
AGENT_BASE_CLASSES = {
    "Role", "Action", "Agent", "BaseAgent", "BaseRole", "BaseAction",
    "BaseAgentClass", "Task", "Tool", "BaseTool", "State", "Node",
    "BaseNode", "BaseState", "BaseTask",
}

# Common method names that suggest agent roles
EXECUTION_METHODS = {"run", "execute", "act", "process", "call", "invoke", "forward"}
INIT_METHODS = {"__init__", "setup", "configure"}

# Patterns for extracting system prompts from code
SYSTEM_PROMOT_PATTERNS = [
    # system_prompt = "..." or system_prompt = '...'
    re.compile(r"""system_prompt\s*=\s*["'](.+?)["']""", re.DOTALL),
    # SYSTEM_PROMPT = "..."
    re.compile(r"""SYSTEM_PROMPT\s*=\s*["'](.+?)["']""", re.DOTALL),
    # prompt = "..."
    re.compile(r"""prompt\s*=\s*["'](.+?)["']""", re.DOTALL),
    # instruction = "..."
    re.compile(r"""instruction\s*=\s*["'](.+?)["']""", re.DOTALL),
    # role = "..."
    re.compile(r"""role\s*=\s*["'](.+?)["']""", re.DOTALL),
]

# Patterns for multi-line string assignments (triple-quoted)
TRIPLE_QUOTE_PATTERN = re.compile(
    r"""(system_prompt|SYSTEM_PROMPT|prompt|instruction|role)\s*=\s*"""
    r"""(["']{3})(.*?)\2""",
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
        # Parse AST
        try:
            tree = ast.parse(content, filename=source_path or "<string>")
        except SyntaxError as e:
            logger.warning(f"Syntax error in {source_path}: {e}")
            self.parse_errors.append(f"Syntax error: {e}")
            # Fallback: create minimal AgentData from file
            return [self._create_fallback_agent(source_path, content)]

        # Extract top-level information
        imports = self._extract_imports(tree)
        global_prompts = self._extract_global_prompts(content)

        # Find agent classes
        agent_classes = self._find_agent_classes(tree)

        if not agent_classes:
            # No agent classes found - check if the file itself might be an agent
            if self._is_likely_agent_file(tree, content):
                return [self._create_from_module(tree, content, source_path, imports)]
            return []

        # Create AgentData for each agent class
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
                names = ", ".join(alias.name for alias in node.names)
                imports.append(f"from {module} import {names}")
        return imports

    def _extract_global_prompts(self, content: str) -> Dict[str, str]:
        """
        Extract system prompt strings from global assignments.

        Searches for patterns like system_prompt = "..." at module level.
        """
        prompts = {}

        # Try multi-line patterns first (triple-quoted)
        for match in TRIPLE_QUOTE_PATTERN.finditer(content):
            key = match.group(1).lower()
            value = match.group(3).strip()
            prompts[key] = value

        # Try single-line patterns for any not yet found
        for pattern in SYSTEM_PROMOT_PATTERNS:
            for match in pattern.finditer(content):
                # Determine the key from the pattern
                for p in SYSTEM_PROMOT_PATTERNS:
                    m = p.match(match.group(0))
                    if m:
                        key = p.pattern.split(r"\s*=\s*")[0].lower()
                        # Simplified key extraction
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
            is_agent = any(b in AGENT_BASE_CLASSES for b in bases)

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

            # Extract class-level string assignments as potential prompts
            class_prompts = self._extract_class_prompts(node)

            agent_classes.append({
                "name": node.name,
                "bases": bases,
                "docstring": docstring,
                "methods": methods,
                "execution_methods": execution_methods,
                "init_method": init_method,
                "class_prompts": class_prompts,
                "line_number": node.lineno,
                "end_line": getattr(node, "end_lineno", None),
            })

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
                        if any(kw in name for kw in ("prompt", "system", "instruction", "role")):
                            if isinstance(item.value, ast.Constant) and isinstance(item.value.value, str):
                                prompts[name] = item.value.value
        return prompts

    def _is_likely_agent_file(self, tree: ast.Module, content: str) -> bool:
        """
        Heuristic check: is this file likely an agent module even without
        explicit agent base class inheritance?
        """
        # Check for agent-related keywords in the file
        content_lower = content.lower()
        agent_indicators = 0

        indicators = [
            "system_prompt", "agent", "llm", "chat", "model",
            "prompt", "tool_call", "function_call",
        ]
        for indicator in indicators:
            if indicator in content_lower:
                agent_indicators += 1

        # Check for classes with run/execute methods
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

        # Extract system prompt (prefer class-level, fall back to global)
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

        # Use docstring as description or body prompt
        docstring = class_info.get("docstring", "")
        description = ""
        body_prompt = ""

        if docstring:
            # Use first paragraph as description, rest as body
            lines = docstring.strip().split("\n")
            description = lines[0].strip()
            if len(lines) > 1:
                body_prompt = "\n".join(lines[1:]).strip()

        # Extract the class source code as body_prompt if no docstring
        if not body_prompt and class_info.get("line_number"):
            body_prompt = self._extract_class_source(content, class_info)

        # Determine category from name and bases
        category = self._infer_category(name, class_info["bases"])

        # Build description from bases if empty
        if not description:
            bases_str = ", ".join(class_info["bases"])
            description = f"Agent class inheriting from {bases_str}"

        # Compute content hash
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
            config={"bases": class_info["bases"], "line_number": class_info["line_number"]},
            content_hash=content_hash,
            raw_content=content,
        )

    def _extract_class_source(self, content: str, class_info: Dict[str, Any]) -> str:
        """Extract the source code for a class definition."""
        start_line = class_info.get("line_number", 1)
        end_line = class_info.get("end_line")

        lines = content.split("\n")

        if end_line and end_line <= len(lines):
            return "\n".join(lines[start_line - 1:end_line])
        elif start_line <= len(lines):
            return "\n".join(lines[start_line - 1:])
        return ""

    def _create_from_module(
        self,
        tree: ast.Module,
        content: str,
        source_path: str,
        imports: List[str],
    ) -> AgentData:
        """
        Create AgentData from a module that looks like an agent but
        has no explicit agent base classes.
        """
        # Use filename as name
        filename = os.path.basename(source_path) if source_path else "module"
        name = os.path.splitext(filename)[0]

        # Extract any docstring from the module
        module_docstring = ast.get_docstring(tree) or ""

        # Extract system prompts from content
        global_prompts = self._extract_global_prompts(content)
        system_prompt = (
            global_prompts.get("system_prompt", "")
            or global_prompts.get("prompt", "")
            or global_prompts.get("instruction", "")
        )

        description = module_docstring.split("\n")[0] if module_docstring else ""
        body_prompt = module_docstring if module_docstring else content[:2000]

        # Find any classes for metadata
        classes = []
        for node in ast.iter_child_nodes(tree):
            if isinstance(node, ast.ClassDef):
                classes.append(node.name)

        import hashlib
        content_hash = hashlib.sha256(content.encode()).hexdigest()

        return AgentData(
            name=name,
            format=AgentFormat.PYTHON,
            source_path=source_path or "",
            description=description or f"Python module: {name}",
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
