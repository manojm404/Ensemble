"""
scripts/migrate_agency_agents.py
Migration script to convert agency-agents repository to Ensemble format.
Maps Anthropic model tiers to Ensemble providers and adds model overrides.
"""
import os
import yaml
import json
from pathlib import Path
from typing import Dict, Any, List

# Model tier mapping from agency-agents to Ensemble
TIER_MAPPING = {
    # Tier 1: Opus 4.6 (Critical tasks) -> Gemini 2.5 Pro or GPT-4
    "opus": {
        "provider": "gemini",
        "model": "gemini-2.5-pro",
        "temperature": 0.1,
        "reason": "Critical architecture, security, code review"
    },
    # Tier 2: Inherit -> Use global settings (no override)
    "inherit": None,
    # Tier 3: Sonnet 4.6 (Intelligence-heavy) -> Gemini 2.5 Flash
    "sonnet": {
        "provider": "gemini",
        "model": "gemini-2.5-flash",
        "temperature": 0.7,
        "reason": "Documentation, testing, debugging"
    },
    # Tier 4: Haiku 4.5 (Fast operations) -> Gemini Flash Lite or small model
    "haiku": {
        "provider": "gemini",
        "model": "gemini-2.5-flash",  # Flash is fast enough
        "temperature": 0.3,
        "reason": "SEO, deployment, content generation"
    }
}

# Category-based tier assignment (if not specified in agent)
CATEGORY_TIER_MAP = {
    # Tier 1 candidates (critical/code review)
    "code-review": "opus",
    "security": "opus",
    "architecture": "opus",
    "engineering": "opus",
    
    # Tier 3 candidates (documentation/testing)
    "documentation": "sonnet",
    "testing": "sonnet",
    "debugging": "sonnet",
    
    # Tier 4 candidates (fast/content)
    "seo": "haiku",
    "marketing": "haiku",
    "content": "haiku",
    
    # Default: inherit
    "default": "inherit"
}


def detect_tier_from_category(category: str, name: str) -> str:
    """Detect appropriate tier from agent category and name."""
    category_lower = category.lower()
    name_lower = name.lower()
    
    # Check for tier 1 indicators
    if any(keyword in category_lower or keyword in name_lower 
           for keyword in ['review', 'security', 'architect', 'senior', 'expert']):
        return "opus"
    
    # Check for tier 3 indicators
    if any(keyword in category_lower or keyword in name_lower 
           for keyword in ['doc', 'test', 'debug', 'write', 'research']):
        return "sonnet"
    
    # Check for tier 4 indicators
    if any(keyword in category_lower or keyword in name_lower 
           for keyword in ['seo', 'content', 'marketing', 'deploy', 'script']):
        return "haiku"
    
    return "inherit"


def add_model_override_to_agent(file_path: str, tier: str) -> Dict[str, Any]:
    """
    Add model override to an agent file based on tier.
    
    Returns:
        Dict with migration info
    """
    try:
        # Read file
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Parse frontmatter
        if not content.startswith('---'):
            return {"status": "skipped", "reason": "No frontmatter"}
        
        parts = content.split('---', 2)
        if len(parts) < 3:
            return {"status": "skipped", "reason": "Invalid frontmatter"}
        
        # Parse YAML
        frontmatter = yaml.safe_load(parts[1]) or {}
        body = parts[2]
        
        # Get tier
        tier_name = tier or frontmatter.get('tier', 'inherit')
        
        # Skip if inherit (use global settings)
        if tier_name == 'inherit':
            return {"status": "skipped", "reason": "Using global settings (inherit)"}
        
        # Get model config
        model_config = TIER_MAPPING.get(tier_name)
        if not model_config:
            return {"status": "skipped", "reason": f"Unknown tier: {tier_name}"}
        
        # Add model override to frontmatter
        frontmatter['model_override'] = {
            'provider': model_config['provider'],
            'model': model_config['model'],
            'temperature': model_config['temperature']
        }
        
        # Add tier metadata
        frontmatter['migration'] = {
            'migrated_from': 'agency-agents',
            'original_tier': tier_name,
            'migration_date': '2026-04-10'
        }
        
        # Reconstruct file
        new_content = f"---\n{yaml.dump(frontmatter, default_flow_style=False, sort_keys=False)}---{body}"
        
        # Write back
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        
        return {
            "status": "migrated",
            "tier": tier_name,
            "model": model_config['model'],
            "provider": model_config['provider']
        }
    
    except Exception as e:
        return {"status": "error", "error": str(e)}


def migrate_agency_agents_repo(repo_path: str, tier_override: str = None) -> Dict[str, Any]:
    """
    Migrate an entire agency-agents repository.
    
    Args:
        repo_path: Path to the cloned agency-agents repository
        tier_override: Force all agents to use specific tier (optional)
    
    Returns:
        Migration summary
    """
    results = {
        "total_agents": 0,
        "migrated": 0,
        "skipped": 0,
        "errors": 0,
        "agents": []
    }
    
    agents_dir = os.path.join(repo_path, "plugins")
    if not os.path.exists(agents_dir):
        return {"error": f"Agents directory not found: {agents_dir}"}
    
    # Walk through all plugins
    for plugin_name in os.listdir(agents_dir):
        plugin_path = os.path.join(agents_dir, plugin_name)
        if not os.path.isdir(plugin_path):
            continue
        
        # Look for agents subdirectory
        plugin_agents_dir = os.path.join(plugin_path, "agents")
        if not os.path.exists(plugin_agents_dir):
            continue
        
        # Process each agent file
        for agent_file in os.listdir(plugin_agents_dir):
            if not agent_file.endswith('.md'):
                continue
            
            file_path = os.path.join(plugin_agents_dir, agent_file)
            results["total_agents"] += 1
            
            # Detect tier
            if tier_override:
                tier = tier_override
            else:
                # Try to detect from plugin name
                tier = detect_tier_from_category(plugin_name, agent_file)
            
            # Add model override
            result = add_model_override_to_agent(file_path, tier)
            results["agents"].append({
                "file": agent_file,
                "plugin": plugin_name,
                **result
            })
            
            if result["status"] == "migrated":
                results["migrated"] += 1
            elif result["status"] == "skipped":
                results["skipped"] += 1
            else:
                results["errors"] += 1
    
    return results


def create_tier_summary(results: Dict[str, Any]) -> str:
    """Create a human-readable migration summary."""
    summary = f"""
# Agency-Agents Migration Summary

## Overview
- **Total Agents Processed**: {results['total_agents']}
- **Migrated with Model Override**: {results['migrated']}
- **Using Global Settings (Inherit)**: {results['skipped']}
- **Errors**: {results['errors']}

## Tier Distribution
"""
    
    # Count by tier
    tier_counts = {"opus": 0, "sonnet": 0, "haiku": 0, "inherit": 0}
    for agent in results['agents']:
        if agent['status'] == 'migrated':
            tier_counts[agent['tier']] = tier_counts.get(agent['tier'], 0) + 1
        else:
            tier_counts['inherit'] += 1
    
    summary += f"""
| Tier | Model | Count | Use Case |
|------|-------|-------|----------|
| Opus | Gemini 2.5 Pro | {tier_counts.get('opus', 0)} | Critical architecture, security |
| Sonnet | Gemini 2.5 Flash | {tier_counts.get('sonnet', 0)} | Documentation, testing |
| Haiku | Gemini Flash | {tier_counts.get('haiku', 0)} | Fast operations, content |
| Inherit | Global settings | {tier_counts.get('inherit', 0)} | Variable-cost tasks |
"""
    
    return summary


def main():
    """Run migration on agency-agents repository."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Migrate agency-agents to Ensemble format")
    parser.add_argument("repo_path", help="Path to agency-agents repository")
    parser.add_argument("--tier", choices=["opus", "sonnet", "haiku", "inherit"],
                       help="Force all agents to use specific tier")
    parser.add_argument("--output", help="Save summary to file")
    
    args = parser.parse_args()
    
    print(f"🔄 Migrating agency-agents from: {args.repo_path}")
    if args.tier:
        print(f"⚠️  Forcing tier: {args.tier}")
    
    results = migrate_agency_agents_repo(args.repo_path, args.tier)
    
    if "error" in results:
        print(f"❌ {results['error']}")
        return
    
    summary = create_tier_summary(results)
    print(summary)
    
    if args.output:
        with open(args.output, 'w') as f:
            f.write(summary)
        print(f"📄 Summary saved to: {args.output}")


if __name__ == "__main__":
    main()
