"""
core/models/ - Pydantic Models for Ensemble API

Request and response schemas for all API endpoints.
Using Pydantic models ensures consistent validation and OpenAPI docs.
"""

from core.models.user import (
    UserCreate,
    UserLogin,
    UserResponse,
    ProfileUpdate,
    PasswordResetRequest,
    PasswordResetConfirm,
)
from core.models.api import (
    ApiResponse,
    PaginatedResponse,
    ErrorResponse,
    WorkflowCreate,
    WorkflowUpdate,
    WorkflowResponse,
    WorkflowExecutionResponse,
    AgentCreate,
    AgentResponse,
    SettingsUpdate,
    SettingsResponse,
    APIKeyCreate,
    APIKeyResponse,
    APIKeyMaskedResponse,
    TokenGrantRequest,
    TokenGrantResponse,
    FeedbackCreate,
    FeedbackResponse,
    BugReportCreate,
    BugReportResponse,
    HealthResponse,
    StatsResponse,
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
