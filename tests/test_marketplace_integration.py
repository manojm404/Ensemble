"""
tests/test_marketplace_integration.py
Integration tests for the marketplace auto-update system.
Tests namespace isolation, conflict detection, remote sync, and model overrides.
"""
import pytest
import os
import json
import tempfile
import shutil
from pathlib import Path

# Add project root to path
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.skill_registry import skill_registry, SkillSource
from core.marketplace_sync import MarketplaceSource, MarketplaceSync
from core.github_pack_builder import GitHubPackBuilder
from core.pack_eval import PackEvaluator, QualityBadge, AntiPattern
from core.auto_update_service import AutoUpdateService


class TestNamespaceIsolation:
    """Test namespace isolation system."""
    
    def test_namespace_enum_exists(self):
        """Verify SkillSource enum has all required namespaces."""
        assert hasattr(SkillSource, 'NATIVE')
        assert hasattr(SkillSource, 'CORE')
        assert hasattr(SkillSource, 'PACK')
        assert hasattr(SkillSource, 'CUSTOM')
        assert hasattr(SkillSource, 'INTEGRATION')
    
    def test_skill_registry_loads(self):
        """Verify skill registry initializes without errors."""
        count = skill_registry.sync_all()
        assert count > 0, "Should load at least one skill"
    
    def test_namespace_stats(self):
        """Verify namespace statistics are generated."""
        stats = skill_registry.get_namespace_stats()
        assert isinstance(stats, dict)
        assert sum(stats.values()) > 0
    
    def test_skill_has_namespace_field(self):
        """Verify all skills have namespace field."""
        skills = skill_registry.list_skills()
        for skill in skills:
            assert 'namespace' in skill, f"Skill {skill['id']} missing namespace"
    
    def test_pack_agents_method(self):
        """Verify pack agents can be queried."""
        # Should not raise error even if pack doesn't exist
        agents = skill_registry.get_pack_agents("nonexistent-pack")
        assert isinstance(agents, list)


class TestConflictDetection:
    """Test conflict detection system."""
    
    def test_detect_conflicts_empty(self):
        """Verify conflict detection works with empty input."""
        conflicts = skill_registry.detect_conflicts([])
        assert conflicts['has_conflicts'] == False
        assert conflicts['safe_to_install'] == True
    
    def test_find_by_filename(self):
        """Verify find_by_filename method works."""
        # Should return list (may be empty)
        results = skill_registry.find_by_filename("test.md")
        assert isinstance(results, list)
    
    def test_similar_agents_threshold(self):
        """Verify similarity detection uses threshold."""
        test_agent = {
            "filepath": "/tmp/test.md",
            "name": "Code Reviewer",
            "description": "Reviews code for quality"
        }
        similar = skill_registry._find_similar_agents(test_agent, threshold=0.8)
        assert isinstance(similar, list)
        # All results should have similarity >= 0.8
        for s in similar:
            assert s['similarity'] >= 0.8


class TestMarketplaceSync:
    """Test marketplace synchronization."""
    
    def test_marketplace_sync_initializes(self):
        """Verify MarketplaceSync initializes."""
        sync = MarketplaceSync()
        assert sync is not None
    
    def test_marketplace_sync_config(self):
        """Verify config file exists and is valid."""
        config_path = "config/marketplace_sources.json"
        if os.path.exists(config_path):
            with open(config_path) as f:
                config = json.load(f)
            assert 'sources' in config
            assert len(config['sources']) > 0
    
    def test_marketplace_source_status(self):
        """Verify source status can be retrieved."""
        sync = MarketplaceSync()
        status = sync.get_source_status()
        assert isinstance(status, list)


class TestPackEval:
    """Test pack evaluation system."""
    
    def test_evaluator_initializes(self):
        """Verify PackEvaluator initializes."""
        evaluator = PackEvaluator()
        assert evaluator is not None
    
    def test_score_to_badge(self):
        """Verify badge assignment logic."""
        evaluator = PackEvaluator()
        assert evaluator._score_to_badge(95).value == "Platinum"
        assert evaluator._score_to_badge(85).value == "Gold"
        assert evaluator._score_to_badge(75).value == "Silver"
        assert evaluator._score_to_badge(65).value == "Bronze"
        assert evaluator._score_to_badge(50).value == "Fail"
    
    def test_evaluate_nonExistentPack(self):
        """Verify evaluation handles non-existent pack."""
        evaluator = PackEvaluator()
        result = evaluator.evaluate_pack("/nonexistent/path")
        assert 'error' in result


class TestModelOverride:
    """Test model override system."""
    
    def test_get_model_override_method_exists(self):
        """Verify get_model_override method exists."""
        assert hasattr(skill_registry, 'get_model_override')
    
    def test_get_model_override_returns_none_for_missing(self):
        """Verify returns None for non-existent agent."""
        result = skill_registry.get_model_override("nonexistent-agent")
        assert result is None
    
    def test_model_override_format(self):
        """Verify model override structure when present."""
        # This tests the format, not specific values
        skills = skill_registry.list_skills()
        for skill in skills:
            if skill.get('model_override'):
                override = skill['model_override']
                assert 'provider' in override or 'model' in override


class TestAutoUpdateService:
    """Test auto-update service."""
    
    def test_service_initializes(self):
        """Verify AutoUpdateService initializes."""
        service = AutoUpdateService()
        assert service is not None
    
    def test_service_status(self):
        """Verify service status can be retrieved."""
        service = AutoUpdateService()
        status = service.get_status()
        assert 'running' in status
        assert 'sources' in status


class TestIntegration:
    """Integration tests for complete workflows."""
    
    def test_full_install_workflow(self):
        """Test complete install workflow (without actual download)."""
        # 1. Check namespace isolation
        skill_registry.sync_all()
        
        # 2. Check conflict detection
        conflicts = skill_registry.detect_conflicts([])
        assert conflicts['safe_to_install'] == True
        
        # 3. Check marketplace sync
        sync = MarketplaceSync()
        sources = sync.get_source_status()
        assert isinstance(sources, list)
        
        # 4. Check pack eval
        evaluator = PackEvaluator()
        assert evaluator._score_to_badge(90).value == "Platinum"
        
        # 5. Check model override
        override = skill_registry.get_model_override("nonexistent")
        assert override is None
    
    def test_all_components_importable(self):
        """Verify all components can be imported."""
        from core.skill_registry import SkillSource
        from core.marketplace_sync import MarketplaceSource
        from core.github_pack_builder import GitHubPackBuilder
        from core.pack_eval import PackEvaluator, QualityBadge
        from core.auto_update_service import AutoUpdateService
        
        assert all([SkillSource, MarketplaceSource, GitHubPackBuilder, 
                   PackEvaluator, QualityBadge, AutoUpdateService])


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
