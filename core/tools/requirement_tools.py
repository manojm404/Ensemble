import json
from typing import Dict
from core.llm_provider import LLMProvider
from core.models.requirements import RequirementAnalysisResult # Import the new models

async def analyse_text_for_requirements(text: str, analysis_type: str = "all") -> str:
    """
    Analyzes raw text input to extract structured product requirements (user stories, functional, non-functional,
    and ambiguities) using an LLM. The output is a JSON string conforming to the RequirementAnalysisResult Pydantic model.

    Args:
        text: The raw text containing product ideas, problem statements, or informal requirements.
        analysis_type: Optional. Specifies the type of analysis to perform. "all" (default) for comprehensive analysis.
                       Other options could be "user_stories", "functional", "non_functional", "ambiguities" for focused analysis.

    Returns:
        A JSON string representing the RequirementAnalysisResult. Returns an error message if analysis fails.
    """
    llm_provider = LLMProvider() # Initialize with default provider and model

    prompt = f"""
    You are an expert Product Manager and Business Analyst AI. Your task is to meticulously analyze the provided text
    and extract structured product requirements. Ensure the output is a valid JSON string that strictly adheres to the
    RequirementAnalysisResult Pydantic model schema. Do not include any additional text or formatting outside the JSON.

    The analysis should cover:
    1.  **Executive Summary**: A concise high-level summary of the product idea.
    2.  **User Stories**: Extract user stories in the format 'As a [type of user], I want [some goal] so that [some reason]'.
    3.  **Functional Requirements**: Identify specific features and functions the system must perform. Assign unique IDs (e.g., FR-001).
    4.  **Non-Functional Requirements**: Detail quality attributes like performance, security, usability, etc. Assign unique IDs (e.g., NFR-001).
    5.  **Identified Ambiguities**: Point out any vague, contradictory, or missing information in the input that requires clarification. Suggest clarifying questions and potential impact.
    6.  **Suggested Solutions**: Briefly propose initial thoughts or solutions for key requirements, if obvious from the context.

    Strictly follow the JSON schema for RequirementAnalysisResult, including all nested objects (UserStory, FunctionalRequirement, etc.).
    If a category has no items, return an empty list for that field.

    Raw input text to analyze:
    """
    {text}
    """

    Focus on generating {analysis_type} requirements.

    Output JSON:
    """

    messages = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": "Please generate the structured requirements for the provided text."}
    ]

    print(f"\n--- DEBUG: repr(LLM Prompt) for analyse_text_for_requirements ---\n{repr(prompt)}\n---") # TEMPORARY DEBUG PRINT

    try:
        # Ensure we're using a model capable of strong JSON output and reasoning
        response = await llm_provider.chat(
            messages=messages,
            model_override={
                "model": "gemini-2.5-pro", # Using a more capable model for this task
                "provider": "gemini"
            },
            temperature=0.2 # Lower temperature for more deterministic, structured output
        )
        
        json_output = response.get("text", "").strip()

        # Attempt to parse and validate the JSON output against the Pydantic model
        parsed_result = RequirementAnalysisResult.parse_raw(json_output)
        return parsed_result.json(indent=2) # Return pretty-printed JSON

    except json.JSONDecodeError as e:
        return f"Error: LLM did not return valid JSON. Details: {e}. Raw response: {json_output}"
    except Exception as e:
        return f"Error during requirement analysis: {e}"


# NOTE: This file should also include an `execute_tool` function if it's meant to be a standalone tool module
# but for now, we'll integrate `analyse_text_for_requirements` directly into the main `core/tools/__init__.py`
# and its schema will be added to LLMProvider.TOOLS_DEFINITIONS.