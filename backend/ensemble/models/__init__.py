"""
core/models/ - Pydantic Models for Ensemble API

Request and response schemas for all API endpoints.
Using Pydantic models ensures consistent validation and OpenAPI docs.
"""

from backend.ensemble.models.api import (
    AgentCreate,
    AgentResponse,
    APIKeyCreate,
    APIKeyMaskedResponse,
    APIKeyResponse,
    ApiResponse,
    BugReportCreate,
    BugReportResponse,
    ErrorResponse,
    FeedbackCreate,
    FeedbackResponse,
    HealthResponse,
    PaginatedResponse,
    SettingsResponse,
    SettingsUpdate,
    StatsResponse,
    TokenGrantRequest,
    TokenGrantResponse,
    WorkflowCreate,
    WorkflowExecutionResponse,
    WorkflowResponse,
    WorkflowUpdate,
)
from backend.ensemble.models.user import (
    PasswordResetConfirm,
    PasswordResetRequest,
    ProfileUpdate,
    UserCreate,
    UserLogin,
    UserResponse,
)

__all__ = [
    # Auth models
    "UserCreate",
    "UserLogin",
    "UserResponse",
    "ProfileUpdate",
    "PasswordResetRequest",
    "PasswordResetConfirm",
    # API models
    "ApiResponse",
    "PaginatedResponse",
    "ErrorResponse",
    "WorkflowCreate",
    "WorkflowUpdate",
    "WorkflowResponse",
    "WorkflowExecutionResponse",
    "AgentCreate",
    "AgentResponse",
    "SettingsUpdate",
    "SettingsResponse",
    "APIKeyCreate",
    "APIKeyResponse",
    "APIKeyMaskedResponse",
    "TokenGrantRequest",
    "TokenGrantResponse",
    "FeedbackCreate",
    "FeedbackResponse",
    "BugReportCreate",
    "BugReportResponse",
    "HealthResponse",
    "StatsResponse",
]
