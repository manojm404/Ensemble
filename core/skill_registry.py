import os, yaml, json, re
from typing import List, Dict, Any, Optional

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
        # 1. Load Native Core (High-fidelity, categorized)
        self._load_from_path(self.native_dir, source="Native")
        # 2. Load Legacy Registry (The 170+ specialists)
        self._load_from_path(self.legacy_skills_dir, source="Core")
        # 3. Load Custom User Agents
        self._load_from_path(self.custom_dir, source="Custom")
        # 4. Load External Integrations
        self._load_integrations()
        print(f"✅ [SkillRegistry] Successfully loaded {len(self.skills)} specialist agents.")
        return len(self.skills)

    def _load_from_path(self, path: str, source: str):
        if not os.path.exists(path): return
        for root, dirs, files in os.walk(path):
            for f in files:
                if f.endswith(".md"):
                    self._parse_md_agent(os.path.join(root, f), source)

    def _parse_md_agent(self, filepath: str, source: str):
        with open(filepath, 'r', encoding='utf-8') as f: content = f.read()
        meta = {}
        body = content
        if content.startswith("---"):
            parts = content.split("---", 2)
            if len(parts) >= 3:
                try: 
                    meta = yaml.safe_load(parts[1]) or {}
                    body = parts[2]
                except: pass
        
        # Build logical ID based on folder category + filename
        # e.g. Native -> support/executive_summary.md -> native_support_executive_summary
        rel_path = os.path.relpath(filepath, self.native_dir if source == "Native" else self.custom_dir)
        clean_id = rel_path.replace("/", "_").replace(".md", "").replace("\\", "_")
        full_id = f"{source.lower()}_{clean_id}"
        
        self.skills[full_id] = {
            "id": full_id, 
            "name": meta.get("name") or clean_id.replace("_", " ").title(),
            "source": source,
            "category": meta.get("category", "General"),
            "enabled": self.status_map.get(full_id, True),
            "tools": meta.get("tools", ["search_web", "read_url"]),
            "emoji": meta.get("emoji", "🤖"),
            "color": meta.get("color", "#6366f1"),
            "description": meta.get("description", "Ensemble Agent"),
            "prompt_text": body.strip(),
            "filepath": filepath
        }

    def _load_integrations(self):
        if not os.path.exists(self.integrations_dir): return
        for repo in os.listdir(self.integrations_dir):
            repo_path = os.path.join(self.integrations_dir, repo)
            if not os.path.isdir(repo_path): continue
            
            # Detect source/brand
            source = "External"
            has_superagi = os.path.exists(os.path.join(repo_path, "manifest.json"))
            has_metagpt = os.path.exists(os.path.join(repo_path, "config/config.yaml")) or \
                          os.path.exists(os.path.join(repo_path, "config/config2.yaml"))
            
            if has_superagi: self._hydrate_superagi(repo_path, repo)
            elif has_metagpt: self._hydrate_metagpt(repo_path, repo)
            else: self._hydrate_generic(repo_path, repo)

    def _hydrate_generic(self, path: str, repo_name: str):
        agent_id = f"external_generic_{repo_name.lower().replace('-', '_')}"
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
            "source": "External", "category": repo_name.title(),
            "enabled": self.status_map.get(agent_id, True),
            "emoji": "🧪", "color": "#9CA3AF",
            "description": desc, "sandbox": "docker",
            "filepath": path
        }

    def _hydrate_metagpt(self, repo_path: str, repo_name: str):
        # 1. Register the Core Hub Agent
        main_id = f"metagpt_{repo_name.lower().replace('-', '_')}_hub"
        self.skills[main_id] = {
            "id": main_id, "name": f"MetaGPT: Main Hub",
            "source": "MetaGPT", "category": repo_name.title(),
            "enabled": self.status_map.get(main_id, True),
            "emoji": "🐍", "color": "#4B5563",
            "description": f"Enables the complete {repo_name} framework.",
            "sandbox": "docker", "filepath": repo_path
        }
        
        # 2. Deep Hydration: Scan for Roles
        roles_dir = os.path.join(repo_path, "metagpt/roles")
        if os.path.exists(roles_dir):
            for root, _, files in os.walk(roles_dir):
                for f in files:
                    if f.endswith(".py") and f != "__init__.py" and f != "role.py":
                        role_name = f.replace(".py", "").replace("_", " ").title()
                        role_id = f"metagpt_{repo_name.lower()}_{f.replace('.py', '')}"
                        self.skills[role_id] = {
                            "id": role_id, "name": f"MetaGPT: {role_name}",
                            "source": "MetaGPT", "category": repo_name.title(),
                            "enabled": self.status_map.get(role_id, True),
                            "emoji": "🔧", "color": "#2563EB",
                            "description": f"Specialized {role_name} from the MetaGPT ecosystem.",
                            "sandbox": "docker", "filepath": os.path.join(root, f)
                        }

    def _hydrate_superagi(self, path: str, repo_name: str):
        agent_id = f"superagi_{repo_name.lower().replace('-', '_')}"
        self.skills[agent_id] = {
            "id": agent_id, "name": f"SuperAGI: {repo_name}",
            "source": "SuperAGI", "category": repo_name.title(),
            "enabled": self.status_map.get(agent_id, True),
            "emoji": "🔧", "color": "#1F2937",
            "description": "Ported SuperAGI Marketplace Integration",
            "sandbox": "docker", "filepath": path
        }

    def delete_skill(self, agent_id: str):
        """Hard delete a custom or external agent."""
        skill = self.skills.get(agent_id)
        if not skill: return False
        if skill["source"] == "Native":
            raise Exception("Cannot delete Sovereign Native Core agents.")
        
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

    def list_skills(self):
        return [
            {
                "id": k, "name": v["name"], "description": v["description"],
                "emoji": v["emoji"], "color": v["color"], "category": v["category"],
                "source": v["source"], "enabled": v["enabled"], "is_native": v["source"] == "Native"
            }
            for k, v in self.skills.items()
        ]

# Global instance
skill_registry = SkillRegistry()
