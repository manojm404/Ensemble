"""
core/skill_registry.py
Manages specialized agent templates and tool mapping.
"""
import os
import yaml
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

@dataclass
class Skill:
    name: str
    description: str
    prompt_text: str = ""
    tools: List[str] = None
    emoji: str = "🤖"
    color: str = "#6366f1"
    vibe: str = "Professional"
    category: str = "General"

# Mapping abstract tools in agency-agents to Ensemble's concrete tools
TOOL_MAPPING = {
    "WebSearch": "search_web",
    "WebFetch": "read_url",
    "Read": "read_artifact",
    "Write": "write_artifact",
    "Edit": "write_artifact", # Map edit to write for now
    "Search": "search_memory"
}

class SkillRegistry:
    def __init__(self, skills_dir: str = "skills"):
        self.skills_dir = skills_dir
        self.skills: Dict[str, Skill] = {}
        self._load_all()

    def _load_all(self):
        """Scan skills_dir and Load all .md files."""
        if not os.path.exists(self.skills_dir):
            os.makedirs(self.skills_dir)
            return

        for filename in os.listdir(self.skills_dir):
            if filename.endswith(".md"):
                self._load_skill_file(os.path.join(self.skills_dir, filename))

    def _load_skill_file(self, filepath: str):
        """Parse a single skill Markdown file."""
        with open(filepath, "r") as f:
            content = f.read()

        # Split YAML frontmatter from Markdown
        # Format: --- \n YAML \n --- \n CONTENT
        parts = content.split("---")
        if len(parts) >= 3:
            try:
                metadata = yaml.safe_load(parts[1])
                prompt_text = "---".join(parts[2:]).strip()
                
                # Normalize tools
                raw_tools = metadata.get("tools", "")
                if isinstance(raw_tools, str):
                    raw_tools = [t.strip() for t in raw_tools.split(",")]
                
                mapped_tools = [TOOL_MAPPING.get(t, t) for t in raw_tools]

                # Derived category from filepath (e.g., engineering-backend.md)
                basename = os.path.basename(filepath)
                category = "General"
                if "-" in basename:
                    category = basename.split("-")[0].capitalize()

                skill = Skill(
                    name=metadata.get("name", "Unknown Agent"),
                    description=metadata.get("description", ""),
                    prompt_text=prompt_text,
                    tools=mapped_tools or [],
                    emoji=metadata.get("emoji", "🤖"),
                    color=metadata.get("color", "#6366f1"),
                    vibe=metadata.get("vibe", "Professional"),
                    category=category
                )
                
                # Key by name (slugified or simple)
                skill_id = metadata.get("name", "default").lower().replace(" ", "_")
                self.skills[skill_id] = skill
            except Exception as e:
                print(f"Error loading skill {filepath}: {e}")

    def get_skill(self, name: str) -> Skill:
        """Get a skill by name (case-insensitive). Defaults to 'default'."""
        skill_id = name.lower().replace(" ", "_").strip()
        return self.skills.get(skill_id, self.skills.get("default_agent"))

    def list_skills(self) -> List[Dict[str, str]]:
        """Return a list of available skill metadata for the UI."""
        return [
            {
                "id": skill_id,
                "name": skill.name,
                "description": skill.description,
                "emoji": skill.emoji,
                "color": skill.color,
                "category": getattr(skill, "category", "General")
            }
            for skill_id, skill in self.skills.items()
        ]

# Global instance
skill_registry = SkillRegistry()
