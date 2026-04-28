"""
core/parsers/agent_data.py
Shared data model for parsed agents.

AgentData is the universal intermediate representation used by all parsers
and consumed by the pack builder and runners.
"""

import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

try:
    import yaml
except ImportError:
    yaml = None


class AgentCategory(str, Enum):
    """Standard agent categories for marketplace organization."""

    DEVELOPMENT = "development"
    AI_ML = "ai_ml"
    SECURITY = "security"
    INFRASTRUCTURE = "infrastructure"
    DATA = "data"
    DEVOPS = "devops"
    MOBILE = "mobile"
    CLOUD = "cloud"
    BUSINESS = "business"
    DOCUMENTATION = "documentation"
    TESTING = "testing"
    DATABASE = "database"
    FRONTEND = "frontend"
    BACKEND = "backend"
    GENERAL = "general"
    RESEARCH = "research"
    WRITING = "writing"
    AUTOMATION = "automation"


class AgentFormat(str, Enum):
    """Source format of the agent."""

    MARKDOWN = "markdown"
    PYTHON = "python"
    YAML = "yaml"
    JSON = "json"
    TEXT = "text"


@dataclass
class AgentData:
    """
    Universal agent data model for the Ensemble platform.

    This is the canonical representation of an agent, regardless of source format.
    All parsers produce AgentData objects.
    """

    # Required fields
    name: str
    format: AgentFormat
    source_path: str

    # Optional metadata
    description: str = ""
    category: AgentCategory = AgentCategory.GENERAL
    emoji: str = ""
    version: str = "1.0.0"
    author: str = ""

    # Agent configuration
    system_prompt: str = ""
    body_prompt: str = ""
    model: str = ""
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None

    # Tools and capabilities
    tools: List[str] = field(default_factory=list)
    config: Dict[str, Any] = field(default_factory=dict)

    # Python-specific
    class_name: Optional[str] = None
    methods: List[str] = field(default_factory=list)
    imports: List[str] = field(default_factory=list)

    # Source tracking
    source_repo: str = ""
    source_branch: str = ""
    content_hash: str = ""
    raw_content: str = ""

    # Internal metadata
    agent_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = field(
        default_factory=lambda: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    )

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "agent_id": self.agent_id,
            "name": self.name,
            "description": self.description,
            "category": (
                self.category.value
                if isinstance(self.category, AgentCategory)
                else self.category
            ),
            "emoji": self.emoji,
            "version": self.version,
            "author": self.author,
            "format": (
                self.format.value
                if isinstance(self.format, AgentFormat)
                else self.format
            ),
            "source_path": self.source_path,
            "system_prompt": self.system_prompt,
            "body_prompt": self.body_prompt,
            "model": self.model,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "tools": self.tools,
            "config": self.config,
            "class_name": self.class_name,
            "methods": self.methods,
            "imports": self.imports,
            "source_repo": self.source_repo,
            "source_branch": self.source_branch,
            "content_hash": self.content_hash,
            "created_at": self.created_at,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AgentData":
        """Deserialize from dictionary."""
        category = data.get("category", "general")
        if isinstance(category, str):
            try:
                category = AgentCategory(category)
            except ValueError:
                category = AgentCategory.GENERAL

        fmt = data.get("format", "text")
        if isinstance(fmt, str):
            try:
                fmt = AgentFormat(fmt)
            except ValueError:
                fmt = AgentFormat.TEXT

        return cls(
            name=data.get("name", "unknown"),
            format=fmt,
            source_path=data.get("source_path", ""),
            description=data.get("description", ""),
            category=category,
            emoji=data.get("emoji", ""),
            version=data.get("version", "1.0.0"),
            author=data.get("author", ""),
            system_prompt=data.get("system_prompt", ""),
            body_prompt=data.get("body_prompt", ""),
            model=data.get("model", ""),
            temperature=data.get("temperature"),
            max_tokens=data.get("max_tokens"),
            tools=data.get("tools", []),
            config=data.get("config", {}),
            class_name=data.get("class_name"),
            methods=data.get("methods", []),
            imports=data.get("imports", []),
            source_repo=data.get("source_repo", ""),
            source_branch=data.get("source_branch", ""),
            content_hash=data.get("content_hash", ""),
            raw_content=data.get("raw_content", ""),
            agent_id=data.get("agent_id", str(uuid.uuid4())),
            created_at=data.get(
                "created_at", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            ),
        )

    def get_full_prompt(self) -> str:
        """Get the complete prompt (system + body) for execution."""
        parts = []
        if self.system_prompt:
            parts.append(self.system_prompt)
        if self.body_prompt:
            parts.append(self.body_prompt)
        return "\n\n".join(parts) if parts else self.system_prompt

    def to_markdown(self) -> str:
        """
        Convert agent to Ensemble .md format with YAML frontmatter.
        Ensures ALL agents can be chatted with regardless of source format.
        """
        if not yaml:
            # Fallback without YAML if yaml not available
            return f"# {self.name}\n\n{self.description}\n\n{self.get_full_prompt()}"

        # Build frontmatter
        frontmatter = {
            "name": self.name,
            "description": self.description,
            "category": (
                self.category.value
                if isinstance(self.category, AgentCategory)
                else self.category
            ),
            "emoji": self.emoji or "🤖",
            "tools": self.tools,
            "model": self.model or "gemini-2.5-flash",
        }
        if self.temperature is not None:
            frontmatter["temperature"] = self.temperature
        if self.max_tokens:
            frontmatter["max_tokens"] = self.max_tokens
        if self.author:
            frontmatter["author"] = self.author
        if self.version and self.version != "1.0.0":
            frontmatter["version"] = self.version

        # Build the markdown content
        yaml_content = yaml.dump(frontmatter, default_flow_style=False, sort_keys=False)
        body = self.get_full_prompt()
        if not body:
            body = (
                f"# {self.name}\n\n"
                f"{self.description}\n\n"
                f"## Instructions\n\n"
                f"Act as a {self.name.lower()} specialist. "
                f"Follow best practices and provide expert-level assistance."
            )

        return f"---\n{yaml_content}---\n\n{body}"

    def get_execution_name(self) -> str:
        """Get the name to use for execution (class_name or name)."""
        return self.class_name or self.name
