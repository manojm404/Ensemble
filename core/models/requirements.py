from pydantic import BaseModel, Field
from typing import List, Optional

class UserStory(BaseModel):
    as_a: str = Field(..., description="Type of user")
    i_want: str = Field(..., description="User's goal or desired action")
    so_that: Optional[str] = Field(None, description="Reason for the goal or desired outcome")

class FunctionalRequirement(BaseModel):
    id: str = Field(..., description="Unique ID for the functional requirement (e.g., FR-001)")
    description: str = Field(..., description="Detailed description of what the system must do")
    priority: Optional[str] = Field("medium", description="Priority level (e.g., high, medium, low)")
    acceptance_criteria: Optional[List[str]] = Field(None, description="List of criteria to verify implementation")

class NonFunctionalRequirement(BaseModel):
    id: str = Field(..., description="Unique ID for the non-functional requirement (e.g., NFR-001)")
    type: str = Field(..., description="Type of non-functional requirement (e.g., performance, security, usability)")
    description: str = Field(..., description="Detailed description of the non-functional aspect")
    metric: Optional[str] = Field(None, description="Measurable metric (e.g., 'response time < 2s')")

class Ambiguity(BaseModel):
    description: str = Field(..., description="Description of the ambiguity or unclear area")
    clarifying_questions: Optional[List[str]] = Field(None, description="Questions to resolve the ambiguity")
    impact: Optional[str] = Field(None, description="Potential impact if unresolved")

class RequirementAnalysisResult(BaseModel):
    executive_summary: str = Field(..., description="High-level summary of the product idea and key requirements.")
    user_stories: List[UserStory] = Field(default_factory=list)
    functional_requirements: List[FunctionalRequirement] = Field(default_factory=list)
    non_functional_requirements: List[NonFunctionalRequirement] = Field(default_factory=list)
    identified_ambiguities: List[Ambiguity] = Field(default_factory=list)
    suggested_solutions: Optional[str] = Field(None, description="Initial thoughts or proposed solutions for key requirements.")
