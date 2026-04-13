"""
core/models/user.py - User Authentication Models

Pydantic models for user registration, login, profile management,
and password reset operations.
"""

from typing import Optional
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, validator


# ============================================================
# Authentication Request Models
# ============================================================

class UserCreate(BaseModel):
    """User registration request."""

    email: EmailStr = Field(
        ...,
        description="User's email address",
        example="user@example.com",
    )
    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="Password (min 8 characters, must include uppercase, number)",
        example="SecurePass123!",
    )
    full_name: Optional[str] = Field(
        None,
        max_length=255,
        description="User's full name",
        example="Jane Doe",
    )

    @validator("password")
    def password_complexity(cls, v):
        """Validate password has minimum complexity."""
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one number")
        return v


class UserLogin(BaseModel):
    """User login request."""

    email: EmailStr = Field(
        ...,
        description="User's email address",
        example="user@example.com",
    )
    password: str = Field(
        ...,
        description="User's password",
    )


class PasswordResetRequest(BaseModel):
    """Request password reset email."""

    email: EmailStr = Field(
        ...,
        description="Email address to send reset link to",
        example="user@example.com",
    )


class PasswordResetConfirm(BaseModel):
    """Confirm password reset with token."""

    token: str = Field(
        ...,
        description="Reset token from the email link",
    )
    new_password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="New password",
    )

    @validator("new_password")
    def password_complexity(cls, v):
        """Validate password complexity."""
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one number")
        return v


# ============================================================
# Authentication Response Models
# ============================================================

class UserResponse(BaseModel):
    """User data returned after login/registration."""

    id: str = Field(..., description="User's unique ID (UUID)")
    email: str = Field(..., description="User's email address")
    full_name: Optional[str] = Field(None, description="User's full name")
    avatar_url: Optional[str] = Field(None, description="URL to user's avatar image")
    tier: str = Field(default="free", description="Subscription tier")
    created_at: Optional[datetime] = Field(None, description="Account creation timestamp")


class AuthTokenResponse(BaseModel):
    """Complete authentication response with token."""

    status: str = Field(default="success")
    token: str = Field(..., description="JWT access token")
    token_type: str = Field(default="bearer", description="Token type")
    expires_in: int = Field(default=3600, description="Token expiration in seconds")
    user: UserResponse = Field(..., description="User profile data")


# ============================================================
# Profile Management Models
# ============================================================

class ProfileUpdate(BaseModel):
    """Fields a user can update on their profile."""

    full_name: Optional[str] = Field(
        None,
        max_length=255,
        description="User's full name",
        example="Jane Doe",
    )
    avatar_url: Optional[str] = Field(
        None,
        description="URL to user's avatar image",
        example="https://example.com/avatar.jpg",
    )


class ProfileResponse(BaseModel):
    """Complete user profile data."""

    id: str
    email: str
    full_name: Optional[str]
    avatar_url: Optional[str]
    tier: str
    sop_run_count: int = Field(default=0, description="Total SOP runs this month")
    total_cost_usd: float = Field(default=0.0, description="Cumulative LLM cost")
    last_run_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
