"""
core/pack_eval.py
Quality evaluation system for marketplace packs.
Inspired by PluginEval - validates pack quality, detects anti-patterns, assigns badges.
"""

import os
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Tuple

import yaml


class QualityBadge(Enum):
    """Quality rating badges."""

    PLATINUM = "Platinum"  # ★★★★★ 90-100%
    GOLD = "Gold"  # ★★★★  80-89%
    SILVER = "Silver"  # ★★★   70-79%
    BRONZE = "Bronze"  # ★★    60-69%
    FAIL = "Fail"  # ★     <60%


class AntiPattern(Enum):
    """Detected anti-patterns."""

    BLOATED_SKILL = "Bloated skill: Prompt text exceeds 5000 tokens"
    MISSING_TRIGGER = "Missing trigger: No activation criteria defined"
    DEAD_CROSS_REF = "Dead cross-reference: References non-existent tool or agent"
    NO_DESCRIPTION = "No description: Agent lacks meaningful description"
    GENERIC_NAME = "Generic name: Name is too vague or generic"
    MISSING_TOOLS = "Missing tools: No tools defined"
    INVALID_YAML = "Invalid YAML: Frontmatter parsing failed"
    NO_CATEGORIZATION = "No categorization: Category is 'General' or undefined"
    REDUNDANT_CONTENT = "Redundant content: >70% similarity to existing agent"


@dataclass
class EvaluationResult:
    """Result of pack/agent evaluation."""

    agent_id: str
    overall_score: float  # 0-100
    badge: QualityBadge
    scores: Dict[str, float]  # Dimension scores
    anti_patterns: List[AntiPattern]
    recommendations: List[str]
    passed: bool  # True if score >= 60


class PackEvaluator:
    """Evaluates marketplace packs and agents for quality."""

    def __init__(self, skill_registry=None):
        self.skill_registry = skill_registry
        self._existing_agents = []
        if skill_registry:
            self._existing_agents = list(skill_registry.skills.values())

    def evaluate_pack(self, pack_path: str) -> Dict[str, Any]:
        """
        Evaluate an entire marketplace pack.

        Args:
            pack_path: Path to pack directory

        Returns:
            Evaluation summary for all agents in pack
        """
        if not os.path.exists(pack_path):
            return {"error": "Pack path not found"}

        # Find all agent .md files
        agent_files = []
        for root, dirs, files in os.walk(pack_path):
            for f in files:
                if f.endswith(".md") and f != ".pack_meta.json":
                    agent_files.append(os.path.join(root, f))

        if not agent_files:
            return {
                "error": "No agent files found",
                "score": 0,
                "badge": QualityBadge.FAIL.value,
            }

        # Evaluate each agent
        results = []
        total_score = 0

        for agent_file in agent_files:
            result = self.evaluate_agent(agent_file)
            results.append(
                {
                    "file": os.path.basename(agent_file),
                    "score": result.overall_score,
                    "badge": result.badge.value,
                    "anti_patterns": [ap.value for ap in result.anti_patterns],
                    "passed": result.passed,
                }
            )
            total_score += result.overall_score

        # Calculate pack-level score
        avg_score = total_score / len(results) if results else 0
        pass_rate = (
            sum(1 for r in results if r["passed"]) / len(results) if results else 0
        )

        # Pack passes if avg score >= 60 AND >= 80% of agents pass
        pack_passed = avg_score >= 60 and pass_rate >= 0.8

        return {
            "pack_path": pack_path,
            "agent_count": len(results),
            "average_score": round(avg_score, 2),
            "pass_rate": round(pass_rate * 100, 2),
            "pack_passed": pack_passed,
            "badge": self._score_to_badge(avg_score).value,
            "agents": results,
            "recommendations": self._generate_pack_recommendations(results),
        }

    def evaluate_agent(self, filepath: str) -> EvaluationResult:
        """
        Evaluate a single agent file.

        Args:
            filepath: Path to agent .md file

        Returns:
            EvaluationResult with scores and recommendations
        """
        scores = {}
        anti_patterns = []
        recommendations = []

        # Read and parse agent file
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()

            frontmatter, body = self._parse_frontmatter(content)
        except Exception as e:
            return EvaluationResult(
                agent_id=filepath,
                overall_score=0,
                badge=QualityBadge.FAIL,
                scores={},
                anti_patterns=[AntiPattern.INVALID_YAML],
                recommendations=["Fix YAML frontmatter syntax"],
                passed=False,
            )

        # 1. Syntax & Structure (0-100)
        scores["syntax_valid"] = self._check_syntax(frontmatter, body)

        # 2. Description Quality (0-100)
        scores["description_quality"] = self._check_description(frontmatter, body)

        # 3. Tool Configuration (0-100)
        scores["tool_usage_valid"] = self._check_tools(frontmatter)

        # 4. Token Efficiency (0-100)
        scores["token_efficiency"] = self._check_token_efficiency(body)

        # 5. Role Clarity (0-100)
        scores["role_clarity"] = self._check_role_clarity(frontmatter, body)

        # 6. Naming Quality (0-100)
        scores["naming_quality"] = self._check_naming(frontmatter, filepath)

        # 7. Categorization (0-100)
        scores["categorization"] = self._check_categorization(frontmatter)

        # 8. Uniqueness (0-100)
        scores["uniqueness"] = self._check_uniqueness(frontmatter, body)

        # Detect anti-patterns
        anti_patterns = self._detect_anti_patterns(frontmatter, body, filepath)

        # Calculate weighted overall score
        weights = {
            "syntax_valid": 0.10,
            "description_quality": 0.15,
            "tool_usage_valid": 0.10,
            "token_efficiency": 0.15,
            "role_clarity": 0.20,
            "naming_quality": 0.10,
            "categorization": 0.05,
            "uniqueness": 0.15,
        }

        overall_score = sum(scores.get(k, 0) * v for k, v in weights.items())

        # Penalize for anti-patterns (-5 per anti-pattern, max -20)
        penalty = min(len(anti_patterns) * 5, 20)
        overall_score = max(0, overall_score - penalty)

        # Generate recommendations
        recommendations = self._generate_recommendations(scores, anti_patterns)

        # Determine badge
        badge = self._score_to_badge(overall_score)

        return EvaluationResult(
            agent_id=os.path.basename(filepath),
            overall_score=round(overall_score, 2),
            badge=badge,
            scores=scores,
            anti_patterns=anti_patterns,
            recommendations=recommendations,
            passed=overall_score >= 60,
        )

    def _parse_frontmatter(self, content: str) -> Tuple[Dict[str, Any], str]:
        """Parse YAML frontmatter from agent file."""
        if not content.startswith("---"):
            return {}, content

        parts = content.split("---", 2)
        if len(parts) < 3:
            return {}, content

        frontmatter = yaml.safe_load(parts[1]) or {}
        body = parts[2].strip()

        return frontmatter, body

    def _check_syntax(self, frontmatter: Dict, body: str) -> float:
        """Check syntax and structure validity."""
        score = 100.0

        # Must have frontmatter
        if not frontmatter:
            score -= 40

        # Must have body content
        if not body or len(body.strip()) < 50:
            score -= 40

        # Check for basic structure
        if frontmatter and body:
            score += 0  # Already good

        return max(0, score)

    def _check_description(self, frontmatter: Dict, body: str) -> float:
        """Check description quality."""
        description = frontmatter.get("description", "")

        if not description:
            return 20

        # Good description is 20-200 characters
        length = len(description)
        if 50 <= length <= 200:
            return 100
        elif 20 <= length < 50:
            return 70
        elif 200 < length <= 500:
            return 80
        else:
            return 50

    def _check_tools(self, frontmatter: Dict) -> float:
        """Check tool configuration."""
        tools = frontmatter.get("tools", [])

        if not tools:
            return 40

        # Has tools defined
        if len(tools) >= 2:
            return 100
        elif len(tools) == 1:
            return 70
        else:
            return 50

    def _check_token_efficiency(self, body: str) -> float:
        """Check token efficiency (prefer concise prompts)."""
        # Rough token count: ~4 chars per token
        token_count = len(body) / 4

        if token_count < 500:
            return 100  # Very efficient
        elif token_count < 1000:
            return 90  # Good
        elif token_count < 2000:
            return 75  # Acceptable
        elif token_count < 5000:
            return 50  # Getting bloated
        else:
            return 20  # Way too long

    def _check_role_clarity(self, frontmatter: Dict, body: str) -> float:
        """Check if role and mission are clearly defined."""
        score = 0

        # Has name
        if frontmatter.get("name"):
            score += 20

        # Has clear identity markers
        body_lower = body.lower()
        identity_markers = [
            "you are",
            "your role",
            "your mission",
            "identity",
            "expert in",
        ]
        if any(marker in body_lower for marker in identity_markers):
            score += 30

        # Has structured sections
        sections = ["#", "##", "Mission", "Rules", "Guidelines", "Instructions"]
        if any(section in body for section in sections):
            score += 30

        # Has actionable content (not just description)
        action_words = ["must", "should", "will", "ensure", "verify", "check"]
        if any(word in body_lower for word in action_words):
            score += 20

        return score

    def _check_naming(self, frontmatter: Dict, filepath: str) -> float:
        """Check naming quality."""
        name = frontmatter.get("name", "")

        if not name:
            return 20

        # Not too generic
        generic_names = ["agent", "assistant", "helper", "bot", "ai"]
        if name.lower() in generic_names:
            return 30

        # Descriptive (2+ words)
        word_count = len(name.split())
        if word_count >= 2:
            return 100
        elif word_count == 1:
            return 60
        else:
            return 40

    def _check_categorization(self, frontmatter: Dict) -> float:
        """Check categorization quality."""
        category = frontmatter.get("category", "")

        if not category or category.lower() == "general":
            return 30

        # Specific category is good
        return 100

    def _check_uniqueness(self, frontmatter: Dict, body: str) -> float:
        """Check uniqueness compared to existing agents."""
        if not self._existing_agents or len(self._existing_agents) == 0:
            return 100  # Can't check, assume unique

        from difflib import SequenceMatcher

        name = frontmatter.get("name", "").lower()
        description = frontmatter.get("description", "").lower()

        max_similarity = 0

        for existing in self._existing_agents:
            existing_name = existing.get("name", "").lower()
            existing_desc = existing.get("description", "").lower()

            # Check name similarity
            name_sim = SequenceMatcher(None, name, existing_name).ratio()
            desc_sim = SequenceMatcher(None, description, existing_desc).ratio()

            max_similarity = max(max_similarity, name_sim, desc_sim)

        # Convert similarity to uniqueness score (inverse)
        uniqueness = max(0, 100 - (max_similarity * 100))
        return uniqueness

    def _detect_anti_patterns(
        self, frontmatter: Dict, body: str, filepath: str
    ) -> List[AntiPattern]:
        """Detect common anti-patterns."""
        anti_patterns = []

        # BLOATED_SKILL
        token_count = len(body) / 4
        if token_count > 5000:
            anti_patterns.append(AntiPattern.BLOATED_SKILL)

        # NO_DESCRIPTION
        if not frontmatter.get("description"):
            anti_patterns.append(AntiPattern.NO_DESCRIPTION)

        # GENERIC_NAME
        name = frontmatter.get("name", "").lower()
        if name in ["agent", "assistant", "helper", "bot"]:
            anti_patterns.append(AntiPattern.GENERIC_NAME)

        # MISSING_TOOLS
        if not frontmatter.get("tools"):
            anti_patterns.append(AntiPattern.MISSING_TOOLS)

        # NO_CATEGORIZATION
        category = frontmatter.get("category", "").lower()
        if not category or category == "general":
            anti_patterns.append(AntiPattern.NO_CATEGORIZATION)

        # Check for dead cross-references (tools that don't exist)
        # This would require access to tool registry - simplified check
        if "tool_name" in body.lower() and "example" in body.lower():
            anti_patterns.append(AntiPattern.DEAD_CROSS_REF)

        return anti_patterns

    def _generate_recommendations(
        self, scores: Dict[str, float], anti_patterns: List[AntiPattern]
    ) -> List[str]:
        """Generate actionable recommendations."""
        recommendations = []

        if scores.get("token_efficiency", 100) < 70:
            recommendations.append(
                "Consider condensing prompt to improve token efficiency"
            )

        if scores.get("role_clarity", 100) < 70:
            recommendations.append(
                "Add clearer role definition with identity, mission, and rules sections"
            )

        if scores.get("description_quality", 100) < 70:
            recommendations.append("Improve description to be 50-200 characters")

        if scores.get("naming_quality", 100) < 70:
            recommendations.append("Use more descriptive name (2+ words)")

        if scores.get("categorization", 100) < 70:
            recommendations.append("Assign specific category instead of 'General'")

        if scores.get("uniqueness", 100) < 70:
            recommendations.append(
                "Agent appears similar to existing agents - differentiate or merge"
            )

        for ap in anti_patterns:
            recommendations.append(f"Fix: {ap.value}")

        return recommendations

    def _generate_pack_recommendations(self, agent_results: List[Dict]) -> List[str]:
        """Generate pack-level recommendations."""
        recommendations = []

        failed_agents = [r for r in agent_results if not r["passed"]]
        if failed_agents:
            recommendations.append(
                f"{len(failed_agents)} agent(s) failed quality check: {', '.join(r['file'] for r in failed_agents)}"
            )

        low_scores = [r for r in agent_results if r["score"] < 70]
        if low_scores:
            recommendations.append(
                f"{len(low_scores)} agent(s) have low scores - review and improve"
            )

        return recommendations

    def _score_to_badge(self, score: float) -> QualityBadge:
        """Convert score to quality badge."""
        if score >= 90:
            return QualityBadge.PLATINUM
        elif score >= 80:
            return QualityBadge.GOLD
        elif score >= 70:
            return QualityBadge.SILVER
        elif score >= 60:
            return QualityBadge.BRONZE
        else:
            return QualityBadge.FAIL

    def certify_pack(self, pack_path: str, threshold: float = 60.0) -> Dict[str, Any]:
        """
        Certify a pack if it meets quality threshold.

        Args:
            pack_path: Path to pack
            threshold: Minimum score to pass

        Returns:
            Certification result
        """
        result = self.evaluate_pack(pack_path)

        if result.get("error"):
            return {"certified": False, "reason": result["error"], **result}

        certified = result["average_score"] >= threshold and result["pack_passed"]

        return {"certified": certified, "threshold": threshold, **result}


# Convenience function
def evaluate_pack_quick(pack_path: str) -> Dict[str, Any]:
    """Quick evaluation without registry comparison."""
    evaluator = PackEvaluator()
    return evaluator.evaluate_pack(pack_path)
