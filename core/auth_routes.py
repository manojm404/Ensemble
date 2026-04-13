"""
core/auth_routes.py - Authentication Endpoints for Ensemble

Registers all auth-related routes on the FastAPI app.
Import and call `register_auth_routes(app)` during app initialization.

Endpoints:
    POST /auth/signup              — Create account with Supabase Auth
    POST /auth/login               — Sign in, return JWT + user profile
    POST /auth/logout              — Sign out (client-side token discard)
    POST /auth/forgot-password     — Request password reset email
    POST /auth/reset-password      — Update password with reset token
    GET  /auth/me                  — Get current user profile (JWT-protected)
    PUT  /auth/me                  — Update user profile (JWT-protected)
    GET  /health                   — Health check with Supabase connection test
"""

import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field

from core.supabase_client import supabase, supabase_admin, verify_connection
from core.auth import get_current_user, UserInToken, require_auth

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])


# ============================================================
# Request Models
# ============================================================

class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    full_name: Optional[str] = Field(None, max_length=255)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str  # From the reset link (Supabase handles this via hash params)
    new_password: str = Field(..., min_length=8, max_length=128)


class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = Field(None, max_length=255)
    avatar_url: Optional[str] = None


# ============================================================
# Response Models
# ============================================================

class UserProfileResponse(BaseModel):
    id: str
    email: str
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    tier: str = "free"
    sop_run_count: int = 0
    total_cost_usd: float = 0.0


class AuthResponse(BaseModel):
    status: str = "success"
    token: str
    token_type: str = "bearer"
    expires_in: int = 3600
    refresh_token: str = ""
    user: UserProfileResponse


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class MessageResponse(BaseModel):
    status: str
    message: str


# ============================================================
# Helper Functions
# ============================================================

def _build_user_profile(user_data: dict, profile_data: dict) -> UserProfileResponse:
    """Combine Supabase auth user data with profile table data."""
    return UserProfileResponse(
        id=user_data.get("id", ""),
        email=user_data.get("email", ""),
        full_name=profile_data.get("full_name"),
        avatar_url=profile_data.get("avatar_url"),
        tier=profile_data.get("tier", "free"),
        sop_run_count=profile_data.get("sop_run_count", 0),
        total_cost_usd=float(profile_data.get("total_cost_usd", 0)),
    )


# ============================================================
# Auth Endpoints
# ============================================================

@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def signup(req: SignupRequest):
    """
    Create a new user account.

    - Creates user in Supabase Auth
    - Trigger auto-creates: profile, settings, welcome bonus tokens (10,000)
    - Returns JWT access token + user profile

    Note: If Supabase email confirmation is enabled, the user must verify
    their email before they can login. The JWT is still returned for preview.
    """
    try:
        client = supabase_admin.client
        response = client.auth.sign_up(
            {
                "email": req.email,
                "password": req.password,
                "options": {
                    "data": {"full_name": req.full_name or ""},
                },
            }
        )

        if not response.user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to create user. Email may already be in use.",
            )

        # Fetch the auto-created profile
        profile_result = client.table("profiles").select("*").eq("id", response.user.id).execute()
        profile = profile_result.data[0] if profile_result.data else {}

        # Get the session token (access_token) and refresh_token
        access_token = response.session.access_token if response.session else ""
        refresh_token = response.session.refresh_token if response.session else ""
        expires_in = response.session.expires_in if response.session else 3600

        logger.info("✅ [Auth] New user signed up: %s", req.email)

        return AuthResponse(
            status="success",
            token=access_token,
            token_type="bearer",
            expires_in=expires_in,
            refresh_token=refresh_token,
            user=_build_user_profile(
                {"id": response.user.id, "email": response.user.email},
                profile,
            ),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("❌ [Auth] Signup failed: %s", e)
        error_msg = str(e).lower()
        if "already" in error_msg and "registered" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists.",
            )
        if "password" in error_msg and "short" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password must be at least 8 characters.",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Signup failed: {str(e)}",
        )


@router.post("/login", response_model=AuthResponse)
async def login(req: LoginRequest):
    """
    Sign in with email and password.

    Returns JWT access token + user profile.
    """
    try:
        client = supabase_admin.client
        response = client.auth.sign_in_with_password(
            {
                "email": req.email,
                "password": req.password,
            }
        )

        if not response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
            )

        # Fetch user profile
        profile_result = client.table("profiles").select("*").eq("id", response.user.id).execute()
        profile = profile_result.data[0] if profile_result.data else {}

        access_token = response.session.access_token
        refresh_token = response.session.refresh_token
        expires_in = response.session.expires_in

        logger.info("✅ [Auth] User logged in: %s", req.email)

        return AuthResponse(
            status="success",
            token=access_token,
            token_type="bearer",
            expires_in=expires_in,
            refresh_token=refresh_token,
            user=_build_user_profile(
                {"id": response.user.id, "email": response.user.email},
                profile,
            ),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.warning("❌ [Auth] Login failed for %s: %s", req.email, e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )


@router.post("/logout", response_model=MessageResponse)
async def logout(user: UserInToken = Depends(get_current_user)):
    """
    Sign out the current user.

    Invalidates the Supabase session server-side.
    The client should also discard the stored JWT token.
    """
    try:
        client = supabase_admin.client
        client.auth.sign_out({"scope": "global"})
        logger.info("✅ [Auth] User logged out: %s", user.email)
        return MessageResponse(status="success", message="Logged out successfully")
    except Exception as e:
        logger.warning("⚠️ [Auth] Logout warning: %s", e)
        # Even if server-side signout fails, tell client success
        # (client should discard token anyway)
        return MessageResponse(status="success", message="Logged out successfully")


@router.post("/refresh", response_model=AuthResponse)
async def refresh_token(req: RefreshTokenRequest):
    """
    Refresh an expired access token using a valid refresh token.

    Uses Supabase's token endpoint directly for reliability.
    This allows the frontend to get a new access token without
    requiring the user to log in again.
    """
    import httpx
    import os

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_anon_key = os.getenv("SUPABASE_ANON_KEY")

    if not supabase_url or not supabase_anon_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase not configured.",
        )

    try:
        # Call Supabase's token endpoint directly
        async with httpx.AsyncClient() as http_client:
            token_response = await http_client.post(
                f"{supabase_url}/auth/v1/token?grant_type=refresh_token",
                headers={
                    "apikey": supabase_anon_key,
                    "Content-Type": "application/json",
                },
                json={"refresh_token": req.refresh_token},
                timeout=10,
            )

        if token_response.status_code != 200:
            logger.warning("⚠️ [Auth] Refresh token rejected by Supabase: %s", token_response.text)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired refresh token.",
            )

        session_data = token_response.json()
        access_token = session_data.get("access_token", "")
        new_refresh_token = session_data.get("refresh_token", "")
        expires_in = session_data.get("expires_in", 3600)

        # Get user info from the access token
        async with httpx.AsyncClient() as http_client:
            user_response = await http_client.get(
                f"{supabase_url}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "apikey": supabase_anon_key,
                },
                timeout=10,
            )

        if user_response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Failed to verify refreshed token.",
            )

        user_data = user_response.json()
        user_id = user_data.get("id", "")
        user_email = user_data.get("email", "")

        # Fetch updated user profile
        client = supabase_admin.client
        profile_result = client.table("profiles").select("*").eq("id", user_id).execute()
        profile = profile_result.data[0] if profile_result.data else {}

        return AuthResponse(
            status="success",
            token=access_token,
            token_type="bearer",
            expires_in=expires_in,
            refresh_token=new_refresh_token,
            user=_build_user_profile(
                {"id": user_id, "email": user_email},
                profile,
            ),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.warning("⚠️ [Auth] Token refresh failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token refresh failed. Please log in again.",
        )


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(req: ForgotPasswordRequest):
    """
    Request a password reset email.

    Sends a reset link to the user's email address.
    Always returns success (even if email doesn't exist) to prevent email enumeration.
    """
    try:
        client = supabase_admin.client
        redirect_url = os.getenv("SUPABASE_PASSWORD_RESET_URL", "http://localhost:3000/auth/reset-password")
        client.auth.reset_password_for_email(
            req.email,
            {"email_redirect_to": redirect_url},
        )
        logger.info("✅ [Auth] Password reset email sent to: %s", req.email)
    except Exception as e:
        logger.warning("⚠️ [Auth] Password reset request for non-existent email: %s", req.email)
        # Don't reveal whether email exists (security best practice)

    return MessageResponse(
        status="success",
        message="If an account with that email exists, a password reset link has been sent.",
    )


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(req: ResetPasswordRequest):
    """
    Reset password using the token from the reset email.

    Note: Supabase handles the token validation via the reset link hash params.
    This endpoint is called after the user clicks the reset link and is redirected
    to the password reset page with an access token in the URL hash.

    For programmatic reset, the client should:
    1. Extract the access_token from the URL hash after redirect
    2. Call this endpoint with that token + new password
    """
    try:
        client = supabase_admin.client

        # Use the token to update the password
        response = client.auth.update_user(
            {"password": req.new_password},
            jwt=req.token,
        )

        if response.user:
            logger.info("✅ [Auth] Password reset successful for user: %s", response.user.email)
            return MessageResponse(
                status="success",
                message="Password has been reset successfully. You can now login with your new password.",
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired reset token.",
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("❌ [Auth] Password reset failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Password reset failed: {str(e)}",
        )


@router.get("/me", response_model=UserProfileResponse)
async def get_current_user_profile(user: UserInToken = Depends(get_current_user)):
    """
    Get the current user's profile.

    Requires valid JWT token in Authorization header.
    """
    try:
        from core.supabase_client import supabase_admin
        result = supabase_admin.query("profiles", "select", columns="*", eq="id", eq_value=user.id)

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User profile not found.",
            )

        profile = result.data[0]

        return UserProfileResponse(
            id=profile["id"],
            email=user.email,
            full_name=profile.get("full_name"),
            avatar_url=profile.get("avatar_url"),
            tier=profile.get("tier", "free"),
            sop_run_count=profile.get("sop_run_count", 0),
            total_cost_usd=float(profile.get("total_cost_usd", 0)),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("❌ [Auth] Failed to fetch profile: %s — %s", type(e).__name__, e)
        import traceback
        logger.error("Traceback: %s", traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch user profile: {type(e).__name__}: {e}",
        )


@router.put("/me", response_model=UserProfileResponse)
async def update_current_user_profile(
    req: ProfileUpdateRequest,
    user: UserInToken = Depends(get_current_user),
):
    """
    Update the current user's profile.

    Updatable fields: full_name, avatar_url
    Requires valid JWT token in Authorization header.
    """
    try:
        from core.supabase_client import supabase_admin
        update_data = {}

        if req.full_name is not None:
            update_data["full_name"] = req.full_name
        if req.avatar_url is not None:
            update_data["avatar_url"] = req.avatar_url

        if not update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields to update.",
            )

        result = supabase_admin.query("profiles", "update", data=update_data, eq="id", eq_value=user.id)

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User profile not found.",
            )

        profile = result.data[0]

        logger.info("✅ [Auth] User profile updated: %s", user.email)

        return UserProfileResponse(
            id=profile["id"],
            email=user.email,
            full_name=profile.get("full_name"),
            avatar_url=profile.get("avatar_url"),
            tier=profile.get("tier", "free"),
            sop_run_count=profile.get("sop_run_count", 0),
            total_cost_usd=float(profile.get("total_cost_usd", 0)),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("❌ [Auth] Profile update failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update user profile.",
        )


# ============================================================
# Health Check Endpoint (not under /auth prefix)
# ============================================================

health_router = APIRouter(tags=["System"])


@health_router.get("/health")
async def health_check():
    """
    Health check endpoint.

    Returns service status, Supabase connection, and version.
    This endpoint does NOT require authentication.
    """
    conn_result = verify_connection()

    return {
        "status": "ok" if conn_result["success"] else "degraded",
        "version": "2.0.0",
        "supabase_connected": conn_result["success"],
        "supabase_url": os.getenv("SUPABASE_URL", "not configured")[:30] + "...",
        "timestamp": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    }
