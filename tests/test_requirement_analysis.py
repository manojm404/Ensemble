import pytest
from unittest.mock import AsyncMock, patch
import json
from core.tools.requirement_tools import analyse_text_for_requirements
from core.models.requirements import (
    UserStory,
    FunctionalRequirement,
    NonFunctionalRequirement,
    Ambiguity,
    RequirementAnalysisResult
)

def test_user_story_model():
    story = UserStory(as_a="user", i_want="to log in", so_that="I can access my profile")
    assert story.as_a == "user"
    assert story.i_want == "to log in"
    assert story.so_that == "I can access my profile"

def test_functional_requirement_model():
    req = FunctionalRequirement(
        id="FR-001",
        description="System shall allow users to register with email and password",
        priority="high",
        acceptance_criteria=["Valid email is used", "Password meets complexity rules"]
    )
    assert req.id == "FR-001"
    assert req.description == "System shall allow users to register with email and password"
    assert req.priority == "high"
    assert req.acceptance_criteria == ["Valid email is used", "Password meets complexity rules"]

def test_non_functional_requirement_model():
    nfr = NonFunctionalRequirement(
        id="NFR-001",
        type="performance",
        description="API response time for login shall be under 200ms",
        metric="<200ms"
    )
    assert nfr.id == "NFR-001"
    assert nfr.type == "performance"
    assert nfr.description == "API response time for login shall be under 200ms"
    assert nfr.metric == "<200ms"

def test_ambiguity_model():
    amb = Ambiguity(
        description="What defines 'fast loading'?",
        clarifying_questions=["What is the acceptable load time for critical pages?"],
        impact="User dissatisfaction, potential abandonment"
    )
    assert amb.description == "What defines 'fast loading'?"
    assert amb.clarifying_questions == ["What is the acceptable load time for critical pages?"]
    assert amb.impact == "User dissatisfaction, potential abandonment"

def test_requirement_analysis_result_model():
    result = RequirementAnalysisResult(
        executive_summary="A new social media app for gardeners.",
        user_stories=[
            UserStory(as_a="gardener", i_want="to share plant tips", so_that="I can help others")
        ],
        functional_requirements=[
            FunctionalRequirement(id="FR-001", description="User registration"),
        ],
        non_functional_requirements=[
            NonFunctionalRequirement(id="NFR-001", type="security", description="Data encryption"),
        ],
        identified_ambiguities=[
            Ambiguity(description="Pricing model is unclear")
        ],
        suggested_solutions="Implement a freemium model."
    )
    assert result.executive_summary == "A new social media app for gardeners."
    assert len(result.user_stories) == 1
    assert len(result.functional_requirements) == 1
    assert len(result.non_functional_requirements) == 1
    assert len(result.identified_ambiguities) == 1
    assert result.suggested_solutions == "Implement a freemium model."

def test_requirement_analysis_result_empty_lists():
    result = RequirementAnalysisResult(
        executive_summary="Basic summary."
    )
    assert result.executive_summary == "Basic summary."
    assert result.user_stories == []
    assert result.functional_requirements == []
    assert result.non_functional_requirements == []
    assert result.identified_ambiguities == []
    assert result.suggested_solutions is None

@pytest.mark.asyncio
async def test_analyse_text_for_requirements_invalid_json_from_llm():
    mock_llm_response = {"text": "This is not valid JSON"}

    with patch('core.llm_provider.LLMProvider.chat', new_callable=AsyncMock) as mock_chat:
        mock_chat.return_value = mock_llm_response

        input_text = "Some input."
        result = await analyse_text_for_requirements(input_text)

        assert "Error during requirement analysis: 1 validation error for RequirementAnalysisResult" in result
        mock_chat.assert_called_once()

@pytest.mark.asyncio
async def test_analyse_text_for_requirements_llm_exception():
    with patch('core.llm_provider.LLMProvider.chat', new_callable=AsyncMock) as mock_chat:
        mock_chat.side_effect = Exception("LLM API error")

        input_text = "Some input."
        result = await analyse_text_for_requirements(input_text)

        assert "Error during requirement analysis: LLM API error" in result
        mock_chat.assert_called_once()
