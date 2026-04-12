"""
core/pack_builder.py
Pack builder for the Universal Agent Importer.

Groups converted agents by category, creates ZIP files for each pack,
generates pack manifests, and updates the marketplace manifest.
"""
import os
import io
import json
import zipfile
import logging
import hashlib
from typing import List, Dict, Any, Optional
from datetime import datetime
from collections import defaultdict
from pathlib import Path

from core.parsers.agent_data import AgentData, AgentFormat, AgentCategory

logger = logging.getLogger(__name__)

# Category display metadata
CATEGORY_DISPLAY = {
    AgentCategory.DEVELOPMENT: {"label": "Development", "emoji": "💻", "priority": 1},
    AgentCategory.AI_ML: {"label": "AI & ML", "emoji": "🤖", "priority": 2},
    AgentCategory.SECURITY: {"label": "Security", "emoji": "🔒", "priority": 3},
    AgentCategory.INFRASTRUCTURE: {"label": "Infrastructure", "emoji": "🏗️", "priority": 4},
    AgentCategory.DATA: {"label": "Data", "emoji": "📊", "priority": 5},
    AgentCategory.DEVOPS: {"label": "DevOps", "emoji": "⚙️", "priority": 6},
    AgentCategory.MOBILE: {"label": "Mobile", "emoji": "📱", "priority": 7},
    AgentCategory.CLOUD: {"label": "Cloud", "emoji": "☁️", "priority": 8},
    AgentCategory.BUSINESS: {"label": "Business", "emoji": "💼", "priority": 9},
    AgentCategory.DOCUMENTATION: {"label": "Documentation", "emoji": "📝", "priority": 10},
    AgentCategory.TESTING: {"label": "Testing", "emoji": "🧪", "priority": 11},
    AgentCategory.DATABASE: {"label": "Database", "emoji": "🗄️", "priority": 12},
    AgentCategory.FRONTEND: {"label": "Frontend", "emoji": "🎨", "priority": 13},
    AgentCategory.BACKEND: {"label": "Backend", "emoji": "🔧", "priority": 14},
    AgentCategory.RESEARCH: {"label": "Research", "emoji": "🔬", "priority": 15},
    AgentCategory.WRITING: {"label": "Writing", "emoji": "✍️", "priority": 16},
    AgentCategory.AUTOMATION: {"label": "Automation", "emoji": "🔄", "priority": 17},
    AgentCategory.GENERAL: {"label": "General", "emoji": "📦", "priority": 99},
}


class PackBuilder:
    """
    Builds marketplace packs from AgentData objects.

    Groups agents by category, creates ZIP files, generates manifests,
    and updates the marketplace index.
    """

    def __init__(self, marketplace_dir: Optional[str] = None):
        """
        Initialize the Pack Builder.

        Args:
            marketplace_dir: Root directory for marketplace files.
                            Contains 'zips/' subdirectory for ZIP files.
        """
        self.marketplace_dir = marketplace_dir or "data/marketplace"
        self.zips_dir = os.path.join(self.marketplace_dir, "zips")

        # Ensure directories exist
        os.makedirs(self.zips_dir, exist_ok=True)

        logger.info(f"PackBuilder initialized: {self.marketplace_dir}")

    def build_from_agents(
        self, agents: List[AgentData], job_id: str = ""
    ) -> List[Dict[str, Any]]:
        """
        Build marketplace packs from a list of AgentData objects.

        Groups agents by category, creates a ZIP for each category,
        and returns pack manifests.

        Args:
            agents: List of parsed AgentData objects.
            job_id: Optional job ID for tracking.

        Returns:
            List of pack manifest dictionaries.
        """
        if not agents:
            logger.warning("No agents to build into packs")
            return []

        # Group agents by category
        grouped = self._group_by_category(agents)

        # Build a pack for each category
        packs = []
        for category, category_agents in grouped.items():
            try:
                pack_manifest = self._build_pack(category, category_agents, job_id)
                packs.append(pack_manifest)
                logger.info(
                    f"Built pack: {pack_manifest['id']} "
                    f"({len(category_agents)} agents)"
                )
            except Exception as e:
                logger.error(
                    f"Failed to build pack for {category.value}: {e}", exc_info=True
                )

        # Also build a combined pack with all agents
        if len(grouped) > 1:
            try:
                combined_pack = self._build_combined_pack(agents, job_id)
                if combined_pack:
                    packs.append(combined_pack)
                    logger.info(
                        f"Built combined pack: {combined_pack['id']} "
                        f"({len(agents)} agents)"
                    )
            except Exception as e:
                logger.error(f"Failed to build combined pack: {e}", exc_info=True)

        return packs

    def build_single_pack(
        self, agents: List[AgentData], pack_id: str = None
    ) -> Dict[str, Any]:
        """
        Build a single pack containing all given agents.

        Args:
            agents: List of AgentData objects.
            pack_id: Optional custom pack ID.

        Returns:
            Pack manifest dictionary.
        """
        if not agents:
            return {}

        pack_id = pack_id or "custom_pack"
        now = datetime.utcnow().isoformat() + "Z"

        # Create ZIP
        zip_filename = f"{pack_id}.zip"
        zip_path = os.path.join(self.zips_dir, zip_filename)
        zip_size = self._create_zip(agents, zip_path, pack_id)

        # Build manifest
        manifest = {
            "id": pack_id,
            "name": pack_id.replace("_", " ").replace("-", " ").title(),
            "description": f"Custom pack with {len(agents)} agents",
            "version": "1.0.0",
            "category": "mixed",
            "agent_count": len(agents),
            "agents": [self._agent_summary(a) for a in agents],
            "formats": self._format_summary(agents),
            "zip_path": zip_path,
            "zip_filename": zip_filename,
            "zip_size_bytes": zip_size,
            "created_at": now,
            "source": "custom",
        }

        return manifest

    def _group_by_category(
        self, agents: List[AgentData]
    ) -> Dict[AgentCategory, List[AgentData]]:
        """Group agents by their category."""
        grouped: Dict[AgentCategory, List[AgentData]] = defaultdict(list)

        for agent in agents:
            grouped[agent.category].append(agent)

        return dict(grouped)

    def _build_pack(
        self,
        category: AgentCategory,
        agents: List[AgentData],
        job_id: str,
    ) -> Dict[str, Any]:
        """
        Build a single category pack.

        Args:
            category: The agent category.
            agents: Agents in this category.
            job_id: Import job ID for tracking.

        Returns:
            Pack manifest dictionary.
        """
        display = CATEGORY_DISPLAY.get(category, CATEGORY_DISPLAY[AgentCategory.GENERAL])
        pack_id = f"pack_{category.value}"
        now = datetime.utcnow().isoformat() + "Z"

        # Create ZIP
        zip_filename = f"{pack_id}.zip"
        zip_path = os.path.join(self.zips_dir, zip_filename)
        zip_size = self._create_zip(agents, zip_path, pack_id)

        # Build pack.json content
        pack_json = {
            "pack_id": pack_id,
            "name": f"{display['emoji']} {display['label']} Pack",
            "description": f"Collection of {len(agents)} {display['label'].lower()} agents",
            "category": category.value,
            "version": "1.0.0",
            "agent_count": len(agents),
            "created_at": now,
            "source": "universal_importer",
            "job_id": job_id,
        }

        # Build manifest
        manifest = {
            "id": pack_id,
            "name": f"{display['emoji']} {display['label']} Pack",
            "description": f"Collection of {len(agents)} {display['label'].lower()} agents",
            "emoji": display["emoji"],
            "category": category.value,
            "version": "1.0.0",
            "agent_count": len(agents),
            "agents": [self._agent_summary(a) for a in agents],
            "formats": self._format_summary(agents),
            "source_repos": list(set(a.source_repo for a in agents if a.source_repo)),
            "zip_path": zip_path,
            "zip_filename": zip_filename,
            "zip_size_bytes": zip_size,
            "created_at": now,
            "source": "universal_importer",
            "job_id": job_id,
            "priority": display["priority"],
        }

        return manifest

    def _build_combined_pack(
        self, agents: List[AgentData], job_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Build a combined pack with all agents.

        Args:
            agents: All agents.
            job_id: Import job ID.

        Returns:
            Combined pack manifest or None.
        """
        if len(agents) < 2:
            return None

        pack_id = "pack_all_agents"
        now = datetime.utcnow().isoformat() + "Z"

        zip_filename = f"{pack_id}.zip"
        zip_path = os.path.join(self.zips_dir, zip_filename)
        zip_size = self._create_zip(agents, zip_path, pack_id)

        # Collect unique categories
        categories = list(set(a.category.value for a in agents))

        manifest = {
            "id": pack_id,
            "name": "All Agents Pack",
            "description": f"Complete collection of {len(agents)} imported agents",
            "emoji": "📚",
            "category": "mixed",
            "version": "1.0.0",
            "agent_count": len(agents),
            "categories": categories,
            "agents": [self._agent_summary(a) for a in agents],
            "formats": self._format_summary(agents),
            "source_repos": list(set(a.source_repo for a in agents if a.source_repo)),
            "zip_path": zip_path,
            "zip_filename": zip_filename,
            "zip_size_bytes": zip_size,
            "created_at": now,
            "source": "universal_importer",
            "job_id": job_id,
            "priority": 100,
        }

        return manifest

    def _create_zip(
        self, agents: List[AgentData], zip_path: str, pack_id: str
    ) -> int:
        """
        Create ZIP file with all agents converted to .md format.
        Ensures consistent, chat-ready agents in every pack.
        """
        now = datetime.utcnow().isoformat() + "Z"

        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for agent in agents:
                # Convert agent to .md format
                md_content = agent.to_markdown()
                filename = self._agent_filename(agent, force_md=True)
                zf.writestr(filename, md_content)

                # Metadata file
                meta = agent.to_dict()
                meta["pack_id"] = pack_id
                meta["imported_at"] = now
                zf.writestr(
                    f"metadata/{agent.agent_id}.json",
                    json.dumps(meta, indent=2, ensure_ascii=False),
                )

            # Pack manifest
            pack_json = {
                "pack_id": pack_id,
                "created_at": now,
                "agent_count": len(agents),
                "agents": [self._agent_summary(a) for a in agents],
            }
            zf.writestr("pack.json", json.dumps(pack_json, indent=2, ensure_ascii=False))

            # Format marker
            zf.writestr(
                ".ensemble_pack",
                json.dumps({
                    "format": "ensemble_pack_v1",
                    "pack_id": pack_id,
                    "created_at": now,
                }, indent=2),
            )

        return os.path.getsize(zip_path)

    def _agent_filename(self, agent: AgentData, force_md: bool = False) -> str:
        """Generate safe filename for agent within ZIP."""
        name = agent.name.lower().replace(" ", "_").replace("-", "_")
        name = "".join(c for c in name if c.isalnum() or c == "_")
        ext = ".md" if force_md else {
            AgentFormat.MARKDOWN: ".md",
            AgentFormat.PYTHON: ".py",
            AgentFormat.YAML: ".yaml",
            AgentFormat.JSON: ".json",
            AgentFormat.TEXT: ".txt",
        }.get(agent.format, ".txt")
        return f"{name}{ext}"

    def _agent_summary(self, agent: AgentData) -> Dict[str, Any]:
        """Create a summary dict for an agent."""
        return {
            "agent_id": agent.agent_id,
            "name": agent.name,
            "description": agent.description[:100] if agent.description else "",
            "category": agent.category.value if isinstance(agent.category, AgentCategory) else str(agent.category),
            "format": agent.format.value if isinstance(agent.format, AgentFormat) else str(agent.format),
            "version": agent.version,
            "author": agent.author,
            "emoji": agent.emoji,
            "source_path": agent.source_path,
            "tools_count": len(agent.tools),
            "has_system_prompt": bool(agent.system_prompt),
            "has_body_prompt": bool(agent.body_prompt),
        }

    def _format_summary(self, agents: List[AgentData]) -> Dict[str, int]:
        """Count agents by format type."""
        counts: Dict[str, int] = defaultdict(int)
        for agent in agents:
            fmt = agent.format.value if isinstance(agent.format, AgentFormat) else str(agent.format)
            counts[fmt] += 1
        return dict(counts)

    def load_pack_from_zip(self, zip_path: str) -> Optional[Dict[str, Any]]:
        """
        Load and parse a pack ZIP file's manifest.

        Args:
            zip_path: Path to the ZIP file.

        Returns:
            Pack manifest data or None.
        """
        if not os.path.exists(zip_path):
            logger.warning(f"ZIP file not found: {zip_path}")
            return None

        try:
            with zipfile.ZipFile(zip_path, "r") as zf:
                # Try to read pack.json
                if "pack.json" in zf.namelist():
                    content = zf.read("pack.json").decode("utf-8")
                    return json.loads(content)
        except (zipfile.BadZipFile, json.JSONDecodeError, KeyError) as e:
            logger.error(f"Failed to read pack ZIP {zip_path}: {e}")

        return None

    def list_available_packs(self) -> List[Dict[str, Any]]:
        """
        List all available packs in the marketplace.

        Reads from the packs.json manifest.
        """
        manifest_path = os.path.join(self.marketplace_dir, "packs.json")

        if not os.path.exists(manifest_path):
            return []

        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("packs", [])
        except (json.JSONDecodeError, IOError) as e:
            logger.error(f"Failed to read packs manifest: {e}")
            return []

    def get_pack_details(self, pack_id: str) -> Optional[Dict[str, Any]]:
        """
        Get detailed information about a specific pack.

        Args:
            pack_id: The pack ID to look up.

        Returns:
            Pack details or None.
        """
        packs = self.list_available_packs()
        for pack in packs:
            if pack.get("id") == pack_id:
                return pack
        return None

    def remove_pack(self, pack_id: str) -> bool:
        """
        Remove a pack from the marketplace.

        Args:
            pack_id: The pack ID to remove.

        Returns:
            True if pack was removed.
        """
        manifest_path = os.path.join(self.marketplace_dir, "packs.json")

        if not os.path.exists(manifest_path):
            return False

        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            original_count = len(data.get("packs", []))
            data["packs"] = [p for p in data.get("packs", []) if p.get("id") != pack_id]
            removed_count = original_count - len(data["packs"])

            if removed_count > 0:
                data["total_packs"] = len(data["packs"])
                data["last_updated"] = datetime.utcnow().isoformat() + "Z"

                with open(manifest_path, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)

                logger.info(f"Removed pack {pack_id} from manifest")
                return True

            return False

        except (json.JSONDecodeError, IOError) as e:
            logger.error(f"Failed to update manifest: {e}")
            return False

# Global instance
pack_builder = PackBuilder()
