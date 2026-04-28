"""
Module: security_policy.py
Description: Part of the Ensemble backend system.
"""

import json
import logging
import os
import time

PERMISSIONS_FILE = "data/permissions.json"
SECURITY_LOG = "data/security_audit.jsonl"


class SecurityGovernor:
    def __init__(self):
        self.permissions = {}
        self.last_loaded = 0
        self.dry_run = False
        self._ensure_files()
        self._load_policy()

    def _ensure_files(self):
        os.makedirs("data", exist_ok=True)
        if not os.path.exists(PERMISSIONS_FILE):
            # Default: DENY ALL
            with open(PERMISSIONS_FILE, "w") as f:
                json.dump({"default_policy": "deny", "agents": {}}, f, indent=2)

    def _load_policy(self):
        """Hot-reload policy if file timestamp has changed."""
        try:
            mtime = os.path.getmtime(PERMISSIONS_FILE)
            if mtime > self.last_loaded:
                with open(PERMISSIONS_FILE, "r") as f:
                    self.permissions = json.load(f)
                self.last_loaded = mtime
                self.dry_run = self.permissions.get("dry_run", False)
                logging.info(
                    f"🛡️ SecurityGovernor: Policy reloaded. Dry Run: {self.dry_run}"
                )
        except Exception as e:
            logging.error(f"❌ SecurityGovernor: Reload failed: {e}")

    def log_decision(self, agent_id: str, action: str, target: str, decision: bool):
        """Append-only structured security audit log."""
        entry = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "agent_id": agent_id,
            "action": action,
            "target": target,
            "decision": "ALLOW" if decision else "DENY",
            "dry_run": self.dry_run,
        }
        with open(SECURITY_LOG, "a") as f:
            f.write(json.dumps(entry) + "\n")

    def eval_permission(self, agent_id: str, action: str, target: str = "") -> bool:
        """
        Evaluate if an agent is allowed to perform an action.
        Deny-by-default logic applies.
        """
        self._load_policy()

        # Check specific agent overrides
        agent_rules = self.permissions.get("agents", {}).get(agent_id, {})
        allowed_actions = agent_rules.get("allow", [])

        # Simple string-match permission for Phase 3.1
        decision = action in allowed_actions

        self.log_decision(agent_id, action, target, decision)

        if self.dry_run:
            return True  # In dry run, we log but ALWAYS permit.

        return decision


# Global Instance
security_governor = SecurityGovernor()
