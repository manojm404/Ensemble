"""
core/parsers/markdown_parser.py
Parser for Markdown files with YAML frontmatter.

Extracts agent specifications from Markdown files in the format:
---
name: Agent Name
description: Agent description
category: development
emoji: 💻
tools:
  - read_artifact
  - write_artifact
---

# Agent Instructions
Body prompt content here...
"""
import os
import re
import logging
from typing import List, Dict, Any, Optional, Tuple

import yaml

from core.parsers.agent_data import AgentData, AgentFormat, AgentCategory

logger = logging.getLogger(__name__)

# Frontmatter regex: matches --- ... --- at the start of file
FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n(.*)", re.DOTALL)

# Valid frontmatter keys
VALID_KEYS = {
    "name", "description", "category", "emoji", "tools", "version",
    "author", "model", "temperature", "max_tokens", "role", "tags",
    "priority", "format",
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

        # Extract metadata from frontmatter
        metadata = {}
        if frontmatter:
            metadata = frontmatter

        # Build AgentData
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

        # The body is the prompt content
        body_prompt = body.strip()

        # Use the full content as raw_content for reference
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
            return False, None, content

        try:
            parsed = yaml.safe_load(match.group(1))
            if isinstance(parsed, dict):
                return True, parsed, match.group(2)
        except yaml.YAMLError as e:
            logger.warning(f"Failed to parse frontmatter YAML: {e}")
            self.parse_errors.append(f"YAML parse error: {e}")

        # Has frontmatter but couldn't parse it - return body anyway
        return True, None, match.group(2)

    def _parse_category(self, category_str: str) -> AgentCategory:
        """Parse category string into AgentCategory enum."""
        if not category_str:
            return AgentCategory.GENERAL

        # Normalize: lowercase, replace spaces/hyphens with underscores
        normalized = category_str.lower().replace(" ", "_").replace("-", "_")

        try:
            return AgentCategory(normalized)
        except ValueError:
            # Map common variations
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
            # Comma-separated string
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
