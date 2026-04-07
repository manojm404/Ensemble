import os
import sys

# Add project root to path
sys.path.append(os.getcwd())

from core.skill_registry import skill_registry

print("--- 🔍 All Agent IDs ---")
skills = skill_registry.list_skills()
for s in skills:
    print(f"ID: {s['id']} | Source: {s['source']}")
