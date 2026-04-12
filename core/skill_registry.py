"""
core/skill_registry.py
Skill Registry for Ensemble — discovers, parses, and manages agent definitions.

Supports multiple formats: .md (primary), .py, .yaml, .json, .txt
All marketplace packs are normalized to .md during import for consistency.
"""
import os
import json
import re
from enum import Enum
from pathlib import Path
from typing import List, Dict, Any, Optional
from difflib import SequenceMatcher

try:
    import yaml
except ImportError:
    yaml = None

from core.parsers.agent_data import AgentFormat


class SkillSource(Enum):
    """Namespace isolation for skill agents."""
    NATIVE = "native"           # Core system agents (data/agents/native/)
    CORE = "core"              # Legacy registry (skills/)
    PACK = "pack"              # Marketplace packs (data/agents/custom/{pack_id}/)
    CUSTOM = "custom"          # User-created agents (data/agents/custom/)
    INTEGRATION = "integration" # External repos (integrations/)

class SkillRegistry:
    def __init__(self):
        self.root = os.getcwd()
        self.native_dir = os.path.join(self.root, "data/agents/native")
        self.custom_dir = os.path.join(self.root, "data/agents/custom")
        self.legacy_skills_dir = os.path.join(self.root, "skills")
        self.integrations_dir = os.path.join(self.root, "integrations")
        self.state_file = os.path.join(self.root, "data/agents/manifest.json")
        self.skills = {}
        self.status_map = self._load_status()
        
        # 🆕 Conflict detection cache
        self._conflict_cache = {}

        # 🚀 Boot-Time Discovery:
        # Populate the registry immediately on initialization to prevent 'Ghost Agent' issues.
        # This ensures all specialists are available on the first UI mount or refresh.
        self.sync_all()

    def _load_status(self):
        if os.path.exists(self.state_file):
            try:
                with open(self.state_file, 'r') as f: return json.load(f)
            except: return {}
        return {}

    def save_status(self, agent_id: str, enabled: bool):
        self.status_map[agent_id] = enabled
        os.makedirs(os.path.dirname(self.state_file), exist_ok=True)
        with open(self.state_file, 'w') as f: json.dump(self.status_map, f, indent=2)

    def sync_all(self):
        self.skills = {}
        self._conflict_cache = {}
        # 1. Load Native Core (High-fidelity, categorized)
        self._load_from_path(self.native_dir, source=SkillSource.NATIVE)
        # 2. Load Legacy Registry (The 170+ specialists)
        self._load_from_path(self.legacy_skills_dir, source=SkillSource.CORE)
        # 3. Load Custom User Agents (split into packs and custom)
        self._load_custom_agents()
        # 4. Load External Integrations
        self._load_integrations()
        print(f"✅ [SkillRegistry] Successfully loaded {len(self.skills)} specialist agents.")
        return len(self.skills)

    def _load_from_path(self, path: str, source: SkillSource):
        if not os.path.exists(path): return
        for root, dirs, files in os.walk(path):
            for f in files:
                # For packs, ONLY load .md files (all agents are converted to .md during import)
                if source == SkillSource.PACK:
                    if f.startswith('.') or f in ['pack.json', '.ensemble_pack', '.pack_meta.json']:
                        continue
                    # Skip non-.md files in packs - they should all be .md now
                    if not f.endswith(".md"):
                        continue

                filepath = os.path.join(root, f)
                if f.endswith(".md"):
                    self._parse_md_agent(filepath, source)
                elif f.endswith(".py"):
                    self._parse_native_agent(filepath, source, AgentFormat.PYTHON)
                elif f.endswith(".yaml") or f.endswith(".yml"):
                    self._parse_native_agent(filepath, source, AgentFormat.YAML)
                elif f.endswith(".json"):
                    self._parse_native_agent(filepath, source, AgentFormat.JSON)
                elif f.endswith(".txt") or f.endswith(".prompt"):
                    self._parse_native_agent(filepath, source, AgentFormat.TEXT)

    def _parse_native_agent(self, filepath: str, source: SkillSource, format: AgentFormat):
        """Parse an agent in its native format without conversion."""
        full_id = self._generate_skill_id(filepath, source)
        pack_id = self._extract_pack_id(filepath, source)
        category = self._determine_category(source, pack_id, filepath, {})

        self.skills[full_id] = {
            "id": full_id,
            "name": self._filename_to_name(filepath),
            "source": source.value,
            "namespace": source.value,
            "category": category,
            "enabled": self.status_map.get(full_id, True),
            "tools": ["search_web", "read_url"],
            "emoji": self._get_emoji_for_format(format),
            "description": f"Native {format.value} agent",
            "filepath": filepath,
            "pack_id": pack_id,
            "format": format.value,
            "version": "1.0.0",
        }

    def _get_emoji_for_format(self, format: AgentFormat) -> str:
        if format == AgentFormat.PYTHON: return "🐍"
        if format == AgentFormat.YAML: return "📄"
        if format == AgentFormat.JSON: return "📋"
        if format == AgentFormat.TEXT: return "📝"
        return "🤖"

    def _parse_md_agent(self, filepath: str, source: SkillSource):
        """Parse a markdown agent file with YAML frontmatter."""
        # Skip non-agent files (metadata, config, etc.)
        filename = Path(filepath).name
        if filename.startswith('.') or filename in ['pack.json', '.ensemble_pack']:
            return

        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        meta = {}
        body = content
        if content.startswith("---"):
            parts = content.split("---", 2)
            if len(parts) >= 3:
                try:
                    meta = yaml.safe_load(parts[1]) or {} if yaml else {}
                    body = parts[2]
                except Exception:
                    pass

        full_id = self._generate_skill_id(filepath, source)
        pack_id = self._extract_pack_id(filepath, source)
        category = self._determine_category(source, pack_id, filepath, meta)

        self.skills[full_id] = {
            "id": full_id,
            "name": meta.get("name") or self._filename_to_name(filepath),
            "source": source.value,
            "namespace": source.value,
            "category": category,
            "enabled": self.status_map.get(full_id, True),
            "tools": meta.get("tools", ["search_web", "read_url"]),
            "emoji": meta.get("emoji", "🤖"),
            "color": meta.get("color", "#6366f1"),
            "description": meta.get("description", "Ensemble Agent"),
            "prompt_text": body.strip(),
            "filepath": filepath,
            "pack_id": pack_id,
            "format": AgentFormat.MARKDOWN.value,
            "model_override": meta.get("model_override"),
            "tags": meta.get("tags", []),
            "version": meta.get("version", "1.0.0"),
        }

    def _determine_category(self, source: SkillSource, pack_id: Optional[str],
                           filepath: str, meta: Dict[str, Any]) -> str:
        """Determine human-readable category based on source and metadata."""
        if source == SkillSource.PACK and pack_id:
            return pack_id.replace("-", " ").replace("_", " ").title()
        elif source == SkillSource.INTEGRATION:
            rel_path = os.path.relpath(filepath, self.integrations_dir)
            parts = Path(rel_path).parts
            return parts[0].replace("-", " ").replace("_", " ").title() if parts else "Integration"
        return meta.get("category", "General")
    
    def _generate_skill_id(self, filepath: str, source: SkillSource) -> str:
        """Generate unique skill ID with namespace isolation."""
        rel_path = os.path.relpath(filepath)

        if source == SkillSource.NATIVE:
            rel_to_native = os.path.relpath(filepath, self.native_dir)
            clean_id = rel_to_native.replace("/", "_").replace(".md", "").replace("\\", "_")
            return f"native_{clean_id}"

        elif source == SkillSource.CORE:
            rel_to_legacy = os.path.relpath(filepath, self.legacy_skills_dir)
            clean_id = rel_to_legacy.replace("/", "_").replace(".md", "").replace("\\", "_")
            return f"core_{clean_id}"

        elif source in [SkillSource.PACK, SkillSource.CUSTOM]:
            # Check if file is inside a pack subdirectory
            rel_to_custom = os.path.relpath(filepath, self.custom_dir)
            parts = Path(rel_to_custom).parts

            if len(parts) > 1 and self._is_pack_directory(parts[0]):
                # This is a marketplace pack agent
                # ID format: pack_{pack_id}_{agent_filename}
                pack_id = parts[0]
                filename = Path(parts[-1]).stem  # Just the filename without .md
                # Clean up the filename: remove subdirectory info
                return f"pack_{pack_id}_{filename}"
            else:
                # This is a user-created custom agent
                filename = rel_to_custom.replace("/", "_").replace(".md", "").replace("\\", "_")
                return f"custom_{filename}"

        elif source == SkillSource.INTEGRATION:
            rel_to_int = os.path.relpath(filepath, self.integrations_dir)
            clean_id = rel_to_int.replace("/", "_").replace(".md", "").replace("\\", "_")
            return f"integration_{clean_id}"

        # Fallback
        clean_id = rel_path.replace("/", "_").replace(".md", "").replace("\\", "_")
        return f"{source.value}_{clean_id}"
    
    def _is_pack_directory(self, dirname: str) -> bool:
        """Check if a directory is a marketplace pack."""
        pack_path = os.path.join(self.custom_dir, dirname)
        if not os.path.exists(pack_path):
            return False
        
        # Definitive indicators of a marketplace pack
        if os.path.exists(os.path.join(pack_path, ".pack_meta.json")):
            return True
        if os.path.exists(os.path.join(pack_path, ".ensemble_pack")):
            return True
        
        # Check for agent files (directly or in agents/ subdirectory)
        has_md = any(f.endswith(".md") for f in os.listdir(pack_path) 
                     if os.path.isfile(os.path.join(pack_path, f)))
        agents_dir = os.path.join(pack_path, "agents")
        has_agents = (os.path.isdir(agents_dir) and 
                      any(f.endswith(".md") for f in os.listdir(agents_dir)))
        return has_md or has_agents
    
    def _extract_pack_id(self, filepath: str, source: SkillSource) -> Optional[str]:
        """Extract pack_id from filepath if this is a pack agent."""
        if source not in [SkillSource.PACK, SkillSource.CUSTOM]:
            return None
        
        rel_to_custom = os.path.relpath(filepath, self.custom_dir)
        parts = Path(rel_to_custom).parts
        
        if len(parts) > 1 and self._is_pack_directory(parts[0]):
            return parts[0]
        return None
    
    def _filename_to_name(self, filepath: str) -> str:
        """Convert filename to human-readable name."""
        filename = Path(filepath).stem
        return filename.replace("-", " ").replace("_", " ").title()

    def _load_custom_agents(self):
        """Load custom agents, distinguishing packs from user-created agents."""
        if not os.path.exists(self.custom_dir):
            return
        
        for item in os.listdir(self.custom_dir):
            item_path = os.path.join(self.custom_dir, item)
            if not os.path.isdir(item_path):
                continue
            
            if self._is_pack_directory(item):
                # This is a marketplace pack
                self._load_from_path(item_path, source=SkillSource.PACK)
            else:
                # This might be a category folder or standalone files
                # Check if it has .md files directly
                has_md = any(f.endswith(".md") for f in os.listdir(item_path) if os.path.isfile(os.path.join(item_path, f)))
                if has_md:
                    self._load_from_path(item_path, source=SkillSource.CUSTOM)
                else:
                    # Subdirectories - load each subdirectory
                    for sub in os.listdir(item_path):
                        sub_path = os.path.join(item_path, sub)
                        if os.path.isdir(sub_path):
                            self._load_from_path(sub_path, source=SkillSource.CUSTOM)

    def _load_integrations(self):
        if not os.path.exists(self.integrations_dir): return
        for repo in os.listdir(self.integrations_dir):
            repo_path = os.path.join(self.integrations_dir, repo)
            if not os.path.isdir(repo_path): continue

            # Detect source/brand
            has_superagi = os.path.exists(os.path.join(repo_path, "manifest.json"))
            has_metagpt = os.path.exists(os.path.join(repo_path, "config/config.yaml")) or \
                          os.path.exists(os.path.join(repo_path, "config/config2.yaml"))

            if has_superagi: self._hydrate_superagi(repo_path, repo)
            elif has_metagpt: self._hydrate_metagpt(repo_path, repo)
            else: self._hydrate_generic(repo_path, repo)

    def _hydrate_generic(self, path: str, repo_name: str):
        agent_id = f"integration_generic_{repo_name.lower().replace('-', '_')}"
        desc = "Experimental External Integration"
        readme = os.path.join(path, "README.md")
        if os.path.exists(readme):
            try:
                with open(readme, 'r') as f:
                    first_lines = "".join(f.readlines()[:10])
                    m = re.search(r'\n([^#\n][^\n]+)', first_lines)
                    if m: desc = m.group(1).strip()[:100] + "..."
            except: pass

        self.skills[agent_id] = {
            "id": agent_id,
            "name": f"Core: {repo_name.replace('-', ' ').title()}",
            "source": SkillSource.INTEGRATION.value, "namespace": SkillSource.INTEGRATION.value, "category": repo_name.title(),
            "enabled": self.status_map.get(agent_id, True),
            "emoji": "🧪", "color": "#9CA3AF",
            "description": desc,
            "filepath": path,
            "pack_id": None, "model_override": None, "tags": [], "version": "1.0.0"
        }

    def _hydrate_metagpt(self, repo_path: str, repo_name: str):
        # 1. Register the Core Hub Agent
        main_id = f"integration_metagpt_{repo_name.lower().replace('-', '_')}_hub"
        self.skills[main_id] = {
            "id": main_id, "name": f"MetaGPT: Main Hub",
            "source": SkillSource.INTEGRATION.value, "namespace": SkillSource.INTEGRATION.value, "category": repo_name.title(),
            "enabled": self.status_map.get(main_id, True),
            "emoji": "🐍", "color": "#4B5563",
            "description": f"Enables the complete {repo_name} framework.",
            "filepath": repo_path,
            "pack_id": None, "model_override": None, "tags": [], "version": "1.0.0"
        }

        # 2. Deep Hydration: Scan for Roles
        roles_dir = os.path.join(repo_path, "metagpt/roles")
        if os.path.exists(roles_dir):
            for root, _, files in os.walk(roles_dir):
                for f in files:
                    if f.endswith(".py") and f != "__init__.py" and f != "role.py":
                        role_name = f.replace(".py", "").replace("_", " ").title()
                        role_id = f"integration_metagpt_{repo_name.lower()}_{f.replace('.py', '')}"
                        self.skills[role_id] = {
                            "id": role_id, "name": f"MetaGPT: {role_name}",
                            "source": SkillSource.INTEGRATION.value, "namespace": SkillSource.INTEGRATION.value, "category": repo_name.title(),
                            "enabled": self.status_map.get(role_id, True),
                            "emoji": "🔧", "color": "#2563EB",
                            "description": f"Specialized {role_name} from the MetaGPT ecosystem.",
                            "filepath": os.path.join(root, f),
                            "pack_id": None, "model_override": None, "tags": [], "version": "1.0.0"
                        }

    def _hydrate_superagi(self, path: str, repo_name: str):
        agent_id = f"integration_superagi_{repo_name.lower().replace('-', '_')}"
        self.skills[agent_id] = {
            "id": agent_id, "name": f"SuperAGI: {repo_name}",
            "source": SkillSource.INTEGRATION.value, "namespace": SkillSource.INTEGRATION.value, "category": repo_name.title(),
            "enabled": self.status_map.get(agent_id, True),
            "emoji": "🔧", "color": "#1F2937",
            "description": "Ported SuperAGI Marketplace Integration",
            "filepath": path,
            "pack_id": None, "model_override": None, "tags": [], "version": "1.0.0"
        }

    def delete_skill(self, agent_id: str):
        """Hard delete a custom or external agent."""
        skill = self.skills.get(agent_id)
        if not skill: return False
        if skill["source"] == SkillSource.NATIVE.value:
            raise Exception("Cannot delete Sovereign Native Core agents.")
        if skill["source"] == SkillSource.PACK.value:
            raise Exception("Cannot delete individual pack agents. Uninstall the entire pack instead.")

        path = skill.get("filepath")
        if not path or not os.path.exists(path): return False

        import shutil
        if os.path.isdir(path):
            shutil.rmtree(path)
        else:
            os.remove(path)
        self.sync_all()
        return True

    def fork_skill(self, agent_id: str):
        """Clones a native agent into the custom folder for modification."""
        skill = self.skills.get(agent_id)
        if not skill: return None
        
        category = skill.get("category", "General").lower()
        name = skill.get("name", "forked_agent").lower().replace(" ", "_")
        target_dir = os.path.join(self.custom_dir, category)
        os.makedirs(target_dir, exist_ok=True)
        target_file = os.path.join(target_dir, f"{name}_fork.md")
        
        header = {
            "name": f"{skill['name']} (Fork)",
            "emoji": skill["emoji"],
            "category": skill["category"],
            "description": skill["description"],
            "forked_from": agent_id
        }
        content = f"---\n{yaml.dump(header)}---\n\n{skill.get('prompt_text', '')}"
        with open(target_file, "w", encoding='utf-8') as f:
            f.write(content)
        self.sync_all()
        return target_file

    def get_skill(self, name: str):
        return self.skills.get(name)
    
    def get_model_override(self, agent_id: str) -> Optional[Dict[str, Any]]:
        """
        Get model override configuration for a specific agent.
        
        Returns:
            Dict with 'provider', 'model', 'temperature' if override exists, else None
        """
        skill = self.skills.get(agent_id)
        if not skill:
            return None
        
        return skill.get('model_override')
    
    def list_skills(self):
        return [
            {
                "id": k, "name": v["name"], "description": v["description"],
                "emoji": v.get("emoji", "🤖"), "color": v.get("color", "blue"), "category": v.get("category", "General"),
                "source": v["source"], "namespace": v.get("namespace", v["source"]),
                "enabled": v["enabled"], "is_native": v["source"] == SkillSource.NATIVE.value,
                "pack_id": v.get("pack_id"), "tags": v.get("tags", []),
                "version": v.get("version", "1.0.0")
            }
            for k, v in self.skills.items()
        ]
    
    # 🆕 Conflict Detection & Resolution Methods
    
    def find_by_filename(self, filename: str) -> List[Dict[str, Any]]:
        """Find all skills with the same filename across namespaces."""
        matches = []
        target_name = filename.replace(".md", "")
        
        for skill_id, skill in self.skills.items():
            skill_filename = Path(skill["filepath"]).stem
            if skill_filename == target_name:
                matches.append(skill)
        
        return matches
    
    def detect_conflicts(self, new_agents: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Detect conflicts between new agents and existing registry.
        
        Args:
            new_agents: List of agent metadata dicts (with 'filepath', 'name', etc.)
        
        Returns:
            Dict with 'exact_matches', 'similar_agents', and 'safe_to_install'
        """
        exact_matches = []
        similar_agents = []
        
        for new_agent in new_agents:
            filepath = new_agent.get("filepath")
            if not filepath:
                continue
            
            filename = Path(filepath).name
            existing = self.find_by_filename(filename)
            
            if existing:
                exact_matches.append({
                    "file": filename,
                    "new_agent": new_agent,
                    "existing_agents": existing,
                    "resolution": "replace" if new_agent.get("force_replace") else "conflict"
                })
            else:
                # Check for similar agents (>80% name/description similarity)
                similarities = self._find_similar_agents(new_agent)
                if similarities:
                    similar_agents.extend(similarities)
        
        return {
            "has_conflicts": len(exact_matches) > 0,
            "exact_matches": exact_matches,
            "similar_agents": similar_agents,
            "safe_to_install": len(exact_matches) == 0
        }
    
    def _find_similar_agents(self, new_agent: Dict[str, Any], threshold: float = 0.8) -> List[Dict[str, Any]]:
        """Find agents with similar names or descriptions."""
        similar = []
        new_name = new_agent.get("name", "").lower()
        new_desc = new_agent.get("description", "").lower()
        
        for skill_id, skill in self.skills.items():
            existing_name = skill.get("name", "").lower()
            existing_desc = skill.get("description", "").lower()
            
            # Calculate similarity
            name_sim = SequenceMatcher(None, new_name, existing_name).ratio()
            desc_sim = SequenceMatcher(None, new_desc, existing_desc).ratio()
            max_sim = max(name_sim, desc_sim)
            
            if max_sim >= threshold:
                similar.append({
                    "new_agent": new_agent,
                    "existing_agent": skill,
                    "similarity": round(max_sim, 2),
                    "name_similarity": round(name_sim, 2),
                    "desc_similarity": round(desc_sim, 2),
                    "recommendation": "review" if max_sim < 0.9 else "likely_duplicate"
                })
        
        return similar
    
    def get_namespace_stats(self) -> Dict[str, int]:
        """Get count of agents per namespace."""
        stats = {}
        for skill in self.skills.values():
            ns = skill.get("namespace", "unknown")
            stats[ns] = stats.get(ns, 0) + 1
        return stats
    
    def get_pack_agents(self, pack_id: str) -> List[Dict[str, Any]]:
        """Get all agents belonging to a specific pack."""
        return [
            skill for skill in self.skills.values()
            if skill.get("pack_id") == pack_id
        ]
    
    def get_agents_by_namespace(self, namespace: str) -> List[Dict[str, Any]]:
        """Get all agents in a specific namespace."""
        return [
            skill for skill in self.skills.values()
            if skill.get("namespace") == namespace
        ]

# Global instance
skill_registry = SkillRegistry()
