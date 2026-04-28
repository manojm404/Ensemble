"""
Module: metagpt_adapter.py
Description: Part of the Ensemble backend system.
"""

import os

import yaml


class MetaGPTAdapter:
    @staticmethod
    def transform(repo_path: str):
        repo_name = os.path.basename(repo_path)
        config_path = os.path.join(repo_path, "config/config.yaml")

        meta = {}
        if os.path.exists(config_path):
            try:
                with open(config_path, "r") as f:
                    meta = yaml.safe_load(f) or {}
            except:
                pass

        # Heuristic: Name comes from repo or config
        name = meta.get("app_name") or repo_name.replace("-", " ").title()

        return {
            "id": f"metagpt_{repo_name.lower().replace('-', '_')}",
            "name": f"MetaGPT: {name}",
            "source": "MetaGPT",
            "category": "External",
            "enabled": True,
            "tools": ["search_web", "read_url", "run_python"],
            "emoji": "🐍",
            "description": "Ported MetaGPT Integration",
            "is_external": True,
            "sandbox": "docker",
        }
