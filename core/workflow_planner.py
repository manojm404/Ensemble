"""
core/workflow_planner.py

LangChain-backed Magic Flow planner.

This module turns a user prompt into a structured workflow plan, then lets
0101's deterministic runtime map that plan onto the actual specialist
registry and artifact/runtime contract.
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, Sequence

from pydantic import BaseModel, Field

from core.llm_provider import LLMProvider

try:
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_core.output_parsers import PydanticOutputParser

    LANGCHAIN_PROMPTS_AVAILABLE = True
except Exception:  # pragma: no cover - import guard
    ChatPromptTemplate = None  # type: ignore[assignment]
    PydanticOutputParser = None  # type: ignore[assignment]
    LANGCHAIN_PROMPTS_AVAILABLE = False


class MagicFlowStagePlan(BaseModel):
    label: str = Field(..., description="Readable stage label")
    summary: str = Field(..., description="One-line summary of the stage")
    instruction: str = Field(..., description="Instruction for the executor agent")
    requested_role: str = Field(default="", description="User-facing role this stage needs, preserving explicit roles from the prompt")
    required_capabilities: List[str] = Field(default_factory=list, description="Capabilities the selected or virtual agent must cover")
    output_contract: str = Field(default="", description="Expected output shape for this stage")
    risk_level: str = Field(default="normal", description="low, normal, high, or critical")
    constraints: List[str] = Field(default_factory=list, description="Hard constraints that the selected agent must honor")
    keywords: List[str] = Field(default_factory=list, description="Prompt keywords that justify the stage")
    categories: List[str] = Field(default_factory=list, description="High-level routing categories")
    preferred_ids: List[str] = Field(default_factory=list, description="Best-fit skill ids or partial ids")
    tools: List[str] = Field(default_factory=list, description="Required tools for the stage")
    temperature: float = Field(default=0.2, ge=0.0, le=1.0)
    selection_reason: str = Field(default="", description="Why this stage belongs in the route")


class MagicFlowPlan(BaseModel):
    title: str = Field(..., description="Human-readable workflow title")
    domain_key: str = Field(..., description="Stable domain classifier key")
    domain_title: str = Field(..., description="Friendly domain title")
    prompt_summary: str = Field(..., description="Short summary of the original request")
    requested_agents: int = Field(..., ge=1, le=5)
    generated_agents: int = Field(..., ge=1, le=5)
    output_type: str = Field(default="auto", description="document, web_app, code_package, data, or auto")
    route_evidence: List[str] = Field(default_factory=list)
    routing_reason: str = Field(...)
    stages: List[MagicFlowStagePlan] = Field(default_factory=list)


def _normalize_prompt(prompt: str) -> str:
    return re.sub(r"\s+", " ", (prompt or "").strip().lower())


def _score_skill(skill: Dict[str, Any], prompt: str) -> float:
    prompt_text = _normalize_prompt(prompt)
    tokens = set(re.findall(r"[a-z0-9]+", prompt_text))

    score = 0.0
    fields = " ".join([
        str(skill.get("id", "")),
        str(skill.get("name", "")),
        str(skill.get("category", "")),
        str(skill.get("description", "")),
        " ".join(skill.get("tags", []) or []),
    ]).lower()

    for token in tokens:
        if not token:
            continue
        if token in fields:
            score += 1.0
        if token in str(skill.get("id", "")).lower():
            score += 2.5
        if token in str(skill.get("name", "")).lower():
            score += 2.0
        if token in str(skill.get("category", "")).lower():
            score += 1.5

    return score


def _candidate_skills(prompt: str, all_skills: Sequence[Dict[str, Any]], limit: int = 28) -> List[Dict[str, Any]]:
    ranked = sorted(
        (dict(skill) for skill in all_skills),
        key=lambda skill: (_score_skill(skill, prompt), str(skill.get("name", "")).lower()),
        reverse=True,
    )
    return ranked[: max(10, min(limit, len(ranked)))]


def _skill_catalog_for_prompt(prompt: str, all_skills: Sequence[Dict[str, Any]]) -> str:
    catalog = []
    for skill in _candidate_skills(prompt, all_skills):
        catalog.append({
            "id": skill.get("id"),
            "name": skill.get("name"),
            "category": skill.get("category"),
            "description": skill.get("description"),
            "emoji": skill.get("emoji", "🤖"),
            "tags": skill.get("tags", []) or [],
        })
    return json.dumps(catalog, ensure_ascii=False, indent=2)


async def build_magicflow_plan(
    prompt: str,
    all_skills: Sequence[Dict[str, Any]],
    agent_count: int = 3,
    output_type: str = "auto",
) -> Optional[MagicFlowPlan]:
    """
    Ask a LangChain model to produce a structured workflow plan.
    Returns None if planning is unavailable or the model fails validation.
    """
    if not LANGCHAIN_PROMPTS_AVAILABLE:
        return None

    try:
        llm = LLMProvider()
        model = llm.get_langchain_model(temperature=0.2)

        system_prompt = (
            "You are the 0101 Magic Flow planner.\n"
            "Your job is to turn a user request into a clean, minimal, production-grade workflow plan.\n"
            "Rules:\n"
            "- Choose the minimum number of stages that still fully covers the request.\n"
            "- Prefer specialist stages over generic ones.\n"
            "- Never invent random roles; only use the skill catalog as guidance.\n"
            "- Keep stage labels short and readable.\n"
            "- Preserve explicit user-requested roles in requested_role when the prompt names agents or specialists.\n"
            "- Describe required_capabilities and output_contract for deterministic capability matching.\n"
            "- Each stage must have an executor instruction, tools, keywords, categories, and preferred_ids.\n"
            "- Set output_type based on the deliverable, using one of: auto, document, web_app, code_package, data.\n"
            "- Return only structured output that satisfies the schema instructions.\n"
        )

        prompt_template = ChatPromptTemplate.from_messages([
            ("system", system_prompt + "\n\n{format_instructions}"),
            (
                "user",
                "User request:\n{prompt}\n\n"
                "Target agent count: {agent_count}\n"
                "Preferred output type: {output_type}\n\n"
                "Skill catalog:\n{skill_catalog}\n"
            ),
        ])

        prompt_inputs = {
            "prompt": prompt.strip(),
            "agent_count": max(1, min(int(agent_count or 3), 5)),
            "output_type": output_type or "auto",
            "skill_catalog": _skill_catalog_for_prompt(prompt, all_skills),
        }

        if hasattr(model, "with_structured_output"):
            try:
                structured_model = model.with_structured_output(MagicFlowPlan)
                chain = prompt_template | structured_model
                return await chain.ainvoke(prompt_inputs)
            except Exception as structured_exc:
                print(f"⚠️ [MagicFlowPlanner] Native structured output failed, falling back to parser: {structured_exc}", flush=True)

        parser = PydanticOutputParser(pydantic_object=MagicFlowPlan)
        chain = prompt_template | model | parser
        result = await chain.ainvoke({**prompt_inputs, "format_instructions": parser.get_format_instructions()})
        return result
    except Exception as exc:
        print(f"⚠️ [MagicFlowPlanner] Structured planning failed: {exc}", flush=True)
        return None
