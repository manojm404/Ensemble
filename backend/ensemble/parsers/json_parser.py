"""
core/parsers/json_parser.py
Parser for JSON agent manifest files.

Supports SuperAGI and generic JSON agent formats.
Extracts agent name, description, tools, and configuration.
"""
import os
import json
import logging
from typing import List, Dict, Any, Optional

from core.parsers.agent_data import AgentData, AgentFormat, AgentCategory

logger = logging.getLogger(__name__)

# Keys that indicate this JSON is an agent configuration
AGENT_INDICATOR_KEYS = {
    "name", "agent_name", "role", "description", "prompt",
    "system_prompt", "instructions", "agent_type", "tools",
    "model", "category",
}

# Keys that contain arrays of agents
AGENT_ARRAY_KEYS = {"agents", "roles", "participants", "members", "items"}

# Config keys to exclude from the config dict
CONFIG_KEYS = {
    "name", "agent_name", "role", "description", "category", "emoji",
    "version", "author", "model", "temperature", "max_tokens",
    "prompt", "system_prompt", "instructions", "tools", "agent_type",
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
        # Check if this dict contains an array of agents
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

        # Check if this dict itself is an agent config
        if self._is_agent_config(data):
            return [self._create_agent_data(data, source_path, raw_content)]

        # Check nested "agent" or "config" keys
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
                results.append(AgentData(
                    name=item.strip(),
                    format=AgentFormat.JSON,
                    source_path=source_path or "",
                    description=f"Agent from JSON array entry {i}",
                ))
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

        # Extract name
        name = str(
            data.get("name")
            or data.get("agent_name")
            or data.get("role")
            or os.path.splitext(os.path.basename(source_path))[0]
        )

        # Extract description
        description = str(
            data.get("description")
            or data.get("desc")
            or data.get("summary")
            or ""
        )

        # Extract category
        category = self._parse_category(data.get("category", ""))

        # Extract emoji
        emoji = str(data.get("emoji", self._guess_emoji(category)))

        # Extract version and author
        version = str(data.get("version", "1.0.0"))
        author = str(data.get("author", data.get("creator", "")))

        # Extract model config
        model = str(data.get("model", data.get("model_name", data.get("llm", ""))))
        temperature = self._safe_float(data.get("temperature", data.get("temp")))
        max_tokens = self._safe_int(data.get("max_tokens", data.get("max_length")))

        # Extract prompts
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

        # Extract tools
        tools = self._extract_tools(data.get("tools", []))

        # Extract config (remaining keys)
        config = {
            k: v for k, v in data.items()
            if k not in CONFIG_KEYS and not k.startswith("_")
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
