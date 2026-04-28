"""
core/parsers/text_parser.py
Parser for plain text prompt files.

Extracts content from .txt and .prompt files.
Uses filename as agent name.
"""
import os
import logging
from typing import List

from core.parsers.agent_data import AgentData, AgentFormat, AgentCategory

logger = logging.getLogger(__name__)

# Maximum content to store as body prompt
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

        # Use filename stem as agent name
        if source_path:
            name = os.path.splitext(os.path.basename(source_path))[0]
        else:
            name = "text_agent"

        # Clean up name
        name = name.replace("_", " ").replace("-", " ").strip()
        if not name:
            name = "text_agent"

        # Use content as body prompt
        body_prompt = content.strip()

        # Try to extract a title from first line if it looks like one
        system_prompt = ""
        if body_prompt:
            first_line = body_prompt.split("\n")[0].strip()
            # If first line is short and title-like, use as system prompt
            if len(first_line) < 100 and not first_line.endswith((".", ",", ":", ";")):
                system_prompt = f"You are {first_line}."
                # Remove title line from body
                body_prompt = "\n".join(body_prompt.split("\n")[1:]).strip()

        # Truncate if very long
        if len(body_prompt) > MAX_BODY_LENGTH:
            body_prompt = body_prompt[:MAX_BODY_LENGTH] + "\n\n[Content truncated...]"

        # Try to infer category from filename
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
