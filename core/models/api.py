"""
core/models/api.py - API Request/Response Models

Pydantic models for workflows, agents, settings, API keys,
budget management, feedback, and system endpoints.
"""

from typing import Optional, Any, List, Dict
from datetime import datetime
from pydantic import BaseModel, Field, validator


# ============================================================
# Generic Response Models
# ============================================================

class ApiResponse(BaseModel):
    """Generic API response envelope."""

    status: str = Field(default="success", description="Response status")
    message: Optional[str] = Field(None, description="Optional message")
    data: Optional[Any] = Field(None, description="Response payload")


class PaginatedResponse(BaseModel):
    """Paginated list response."""

    status: str = Field(default="success")
    items: List[Any] = Field(..., description="List of items")
    total: int = Field(..., description="Total number of items")
    page: int = Field(default=1, description="Current page number")
    page_size: int = Field(default=20, description="Items per page")
    has_more: bool = Field(..., description="Whether there are more pages")


class ErrorResponse(BaseModel):
    """Error response model."""

    status: str = Field(default="error")
    error: str = Field(..., description="Error type/code")
    message: str = Field(..., description="Human-readable error message")
    details: Optional[Dict[str, Any]] = Field(None, description="Additional error details")


# ============================================================
# Workflow Models
# ============================================================

class WorkflowCreate(BaseModel):
    """Create a new workflow."""

    id: Optional[str] = Field(
        None,
        description="Workflow ID (auto-generated if not provided)",
        pattern=r"^[a-zA-Z0-9_-]+$",
    )
    name: str = Field(..., min_length=1, max_length=255, description="Workflow name")
    description: Optional[str] = Field(None, description="Workflow description")
    graph_json: Optional[Dict[str, Any]] = Field(
        None,
        description="Workflow graph definition (nodes and edges)",
    )


class WorkflowUpdate(BaseModel):
    """Update an existing workflow."""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    graph_json: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


class WorkflowResponse(BaseModel):
    """Workflow data returned from API."""

    id: str
    user_id: str
    name: str
    description: Optional[str] = None
    graph_json: Optional[Dict[str, Any]] = None
    version: int = Field(default=1)
    is_active: bool = Field(default=True)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class WorkflowExecutionResponse(BaseModel):
    """Workflow execution result."""

    id: str
    workflow_id: Optional[str] = None
    status: str = Field(
        ...,
        description="Execution status: pending, running, completed, failed, cancelled, hibernated",
    )
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_ms: Optional[int] = None
    total_cost_usd: float = Field(default=0.0)
    total_tokens: int = Field(default=0)
    error_message: Optional[str] = None
    result_json: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None


# ============================================================
# Agent Models
# ============================================================

class AgentCreate(BaseModel):
    """Create a custom agent."""

    name: str = Field(..., min_length=1, max_length=255, description="Agent name")
    category: Optional[str] = Field(None, max_length=100, description="Agent category")
    description: Optional[str] = Field(None, description="Agent description")
    instruction: Optional[str] = Field(None, description="Agent system prompt/instructions")
    model: Optional[str] = Field("gemini-2.5-flash", description="Default LLM model")
    temperature: float = Field(
        default=0.7,
        ge=0.0,
        le=1.0,
        description="Temperature for LLM (0.0-1.0)",
    )
    tools: Optional[List[str]] = Field(
        default_factory=list,
        description="List of allowed tools",
    )


class AgentResponse(BaseModel):
    """Agent data returned from API."""

    id: str
    user_id: str
    name: str
    category: Optional[str] = None
    description: Optional[str] = None
    instruction: Optional[str] = None
    model: Optional[str] = None
    temperature: float = Field(default=0.7)
    tools: List[str] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ============================================================
# Settings Models
# ============================================================

class SettingsUpdate(BaseModel):
    """Update user settings."""

    default_llm_provider: Optional[str] = Field(
        None,
        description="Default LLM provider (gemini, openai, anthropic, etc.)",
    )
    default_model: Optional[str] = Field(None, description="Default model name")
    base_url: Optional[str] = Field(None, description="Base URL for local LLMs")
    approval_cost_threshold: Optional[float] = Field(
        None,
        ge=0,
        description="Cost threshold requiring approval",
    )
    approval_timeout_seconds: Optional[int] = Field(
        None,
        ge=0,
        description="Timeout for approval requests",
    )
    theme: Optional[str] = Field(None, description="UI theme: dark, light, system")

    @validator("theme")
    def validate_theme(cls, v):
        if v and v not in ("dark", "light", "system"):
            raise ValueError("Theme must be 'dark', 'light', or 'system'")
        return v


class SettingsResponse(BaseModel):
    """User settings returned from API."""

    id: Optional[str] = None
    user_id: str
    default_llm_provider: str = Field(default="gemini")
    default_model: str = Field(default="gemini-2.5-flash")
    base_url: Optional[str] = None
    approval_cost_threshold: float = Field(default=0.0001)
    approval_timeout_seconds: int = Field(default=300)
    theme: str = Field(default="dark")
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ============================================================
# API Key Models
# ============================================================

class APIKeyCreate(BaseModel):
    """Add a new API key."""

    provider: str = Field(
        ...,
        description="LLM provider name",
        example="gemini",
    )
    api_key: str = Field(
        ...,
        min_length=10,
        description="The API key value (will be encrypted before storage)",
    )

    @validator("provider")
    def validate_provider(cls, v):
        valid_providers = {
            "gemini", "openai", "anthropic", "deepseek", "groq",
            "openrouter", "ollama", "lm-studio", "localai",
            "llama-cpp", "vllm", "cherryin", "siliconflow", "aihubmix",
        }
        if v.lower() not in valid_providers:
            raise ValueError(
                f"Invalid provider. Must be one of: {', '.join(sorted(valid_providers))}"
            )
        return v.lower()


class APIKeyResponse(BaseModel):
    """API key creation response (includes full key on creation only)."""

    id: str
    provider: str
    key_suffix: str = Field(..., description="Last characters of the key for display")
    is_active: bool = Field(default=True)
    created_at: Optional[datetime] = None


class APIKeyMaskedResponse(BaseModel):
    """API key with masked value (for listing)."""

    id: str
    provider: str
    key_suffix: str = Field(..., description="Last characters of the key")
    is_active: bool = Field(default=True)
    last_used_at: Optional[datetime] = None
    created_at: Optional[datetime] = None


class APIKeyTestRequest(BaseModel):
    """Test an API key connection."""

    provider: str = Field(..., description="LLM provider name")
    api_key: str = Field(..., description="The API key to test")


class APIKeyTestResponse(BaseModel):
    """API key test result."""

    success: bool = Field(..., description="Whether the key is valid")
    message: str = Field(..., description="Result message")
    response_time_ms: Optional[int] = Field(None, description="Test response time")
    model_tested: Optional[str] = Field(None, description="Model used for testing")


# ============================================================
# Token Grant / Budget Models
# ============================================================

class TokenGrantRequest(BaseModel):
    """Request a token grant for a task."""

    amount: float = Field(
        ...,
        gt=0,
        description="Number of tokens to grant",
    )
    task_description: Optional[str] = Field(
        None,
        description="Description of the task requiring tokens",
    )
    agent_id: Optional[str] = Field(None, description="Agent ID this grant is for")
    workflow_id: Optional[str] = Field(None, description="Workflow ID this grant is for")
    expires_at: Optional[datetime] = Field(
        None,
        description="Grant expiration time (optional)",
    )


class TokenGrantResponse(BaseModel):
    """Token grant data."""

    id: str
    user_id: str
    grant_amount: float
    spent: float = Field(default=0)
    remaining: float
    status: str = Field(..., description="active, expired, exhausted, or revoked")
    task_description: Optional[str] = None
    agent_id: Optional[str] = None
    workflow_id: Optional[str] = None
    created_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None


class BudgetSummary(BaseModel):
    """User's budget summary."""

    total_granted: float = Field(..., description="Total tokens ever granted")
    total_spent: float = Field(..., description="Total tokens spent")
    total_remaining: float = Field(..., description="Total tokens remaining")
    total_cost_usd: float = Field(..., description="Total LLM cost in USD")
    sop_runs_this_month: int = Field(..., description="SOP runs this month")
    sop_run_limit: int = Field(..., description="Monthly SOP run limit (100 for free tier)")


# ============================================================
# Feedback Models
# ============================================================

class FeedbackCreate(BaseModel):
    """Submit user feedback."""

    type: str = Field(
        default="feedback",
        description="Feedback type: feedback, feature_request, bug_report, question, praise",
    )
    rating: Optional[int] = Field(
        None,
        ge=1,
        le=5,
        description="Rating (1-5, optional)",
    )
    title: Optional[str] = Field(None, max_length=255, description="Feedback title")
    message: str = Field(..., min_length=1, max_length=5000, description="Feedback text")
    category: Optional[str] = Field(None, max_length=100, description="Feedback category")


class FeedbackResponse(BaseModel):
    """Feedback data returned from API."""

    id: str
    user_id: str
    type: str
    rating: Optional[int] = None
    title: Optional[str] = None
    message: str
    category: Optional[str] = None
    status: str = Field(default="new", description="new, acknowledged, in_progress, resolved, rejected, planned")
    admin_response: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ============================================================
# Bug Report Models
# ============================================================

class BugReportCreate(BaseModel):
    """Submit a bug report."""

    title: str = Field(..., min_length=1, max_length=255, description="Bug title")
    description: str = Field(..., min_length=1, max_length=10000, description="Detailed bug description")
    steps_to_reproduce: Optional[str] = Field(None, description="Steps to reproduce the bug")
    expected_behavior: Optional[str] = Field(None, description="What should have happened")
    actual_behavior: Optional[str] = Field(None, description="What actually happened")
    severity: str = Field(
        default="medium",
        description="Bug severity: critical, high, medium, low",
    )
    browser_info: Optional[str] = Field(None, description="Browser name and version")
    os_info: Optional[str] = Field(None, description="Operating system info")
    screenshot_url: Optional[str] = Field(None, description="URL to screenshot of the bug")

    @validator("severity")
    def validate_severity(cls, v):
        valid = {"critical", "high", "medium", "low"}
        if v.lower() not in valid:
            raise ValueError(f"Severity must be one of: {', '.join(valid)}")
        return v.lower()


class BugReportResponse(BaseModel):
    """Bug report data returned from API."""

    id: str
    user_id: str
    feedback_id: Optional[str] = None
    title: str
    description: str
    steps_to_reproduce: Optional[str] = None
    expected_behavior: Optional[str] = None
    actual_behavior: Optional[str] = None
    severity: str
    browser_info: Optional[str] = None
    os_info: Optional[str] = None
    screenshot_url: Optional[str] = None
    status: str = Field(
        default="new",
        description="new, confirmed, in_progress, fixed, wont_fix, duplicate, cannot_reproduce",
    )
    resolved_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ============================================================
# System/Health Models
# ============================================================

class HealthResponse(BaseModel):
    """Health check endpoint response."""

    status: str = Field(default="ok", description="Service health status")
    version: str = Field(default="2.0.0", description="Ensemble version")
    supabase_connected: bool = Field(..., description="Whether Supabase connection is working")
    timestamp: datetime = Field(..., description="Current server time")


class StatsResponse(BaseModel):
    """Platform usage statistics."""

    total_workflows: int = Field(..., description="Total workflows created by user")
    total_executions: int = Field(..., description="Total workflow executions")
    total_cost_usd: float = Field(..., description="Total LLM cost")
    total_tokens_used: int = Field(..., description="Total tokens consumed")
    active_agents: int = Field(..., description="Number of custom agents created")
    sop_runs_this_month: int = Field(..., description="SOP runs this month")
    created_at: Optional[datetime] = None
