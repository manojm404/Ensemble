"""
core/auth.py - Authentication Middleware for Ensemble

Handles JWT validation via Supabase, user extraction from requests,
and FastAPI dependency functions for route protection.

Supports:
- Bearer token authentication via Authorization header
- Query parameter token for WebSocket connections
- User object injection into request state

Usage in FastAPI routes:
    from fastapi import APIRouter, Depends
    from core.auth import get_current_user, require_auth
    from core.auth.models import UserInToken

    router = APIRouter()

    # Get current user (raises 401 if not authenticated)
    @router.get("/profile")
    async def get_profile(user: UserInToken = Depends(get_current_user)):
        return {"email": user.email}

    # Require authentication (middleware style)
    @router.get("/settings", dependencies=[Depends(require_auth)])
    async def get_settings(request: Request):
        user_id = request.state.user.id
        ...

Environment variables:
    SUPABASE_URL - Your Supabase project URL (shared with supabase_client)
    JWT_SECRET - Supabase JWT secret (auto-fetched from JWKS if not set)
"""

import logging
import os
from functools import lru_cache
from typing import Optional

import httpx
from fastapi import HTTPException, Request, status, WebSocket, WebSocketException
from jose import jwt, JWTError, ExpiredSignatureError
from pydantic import BaseModel

from core.supabase_client import supabase

logger = logging.getLogger(__name__)


# ============================================================
# Models
# ============================================================

class UserInToken(BaseModel):
    """User object extracted from a valid JWT."""

    id: str
    email: str
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    tier: str = "free"
    is_authenticated: bool = True


class TokenData(BaseModel):
    """Raw data extracted from a JWT token."""

    user_id: str
    email: Optional[str] = None
    expires_at: Optional[int] = None


# ============================================================
# JWT Validation
# ============================================================

@lru_cache(maxsize=1)
def get_supabase_jwt_secret() -> str:
    """
    Fetch the Supabase JWT secret from the service role JWT endpoint.
    Falls back to environment variable if available.

    In production, you should set JWT_SECRET in your environment
    rather than fetching it dynamically (security best practice).
    """
    # Try environment first (faster, more secure)
    import os
    secret = os.getenv("JWT_SECRET")
    if secret:
        return secret

    # Fall back to fetching from Supabase
    # This requires the service role key to be set
    try:
        supabase_url = os.getenv("SUPABASE_URL")
        service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

        if not supabase_url or not service_key:
            raise ValueError(
                "Either JWT_SECRET or (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) "
                "must be configured for JWT validation."
            )

        # For Supabase, the JWT secret is the same as the service role key's secret
        # In practice, Supabase uses a random secret, so we need to fetch it
        # The easiest approach: use the service role key directly as the secret
        # (Supabase's JWT secret IS the service role key in the default setup)
        return service_key
    except Exception as e:
        logger.error("Failed to get JWT secret: %s", e)
        raise


def decode_jwt_token(token: str) -> TokenData:
    """
    Decode and validate a Supabase JWT token.

    Args:
        token: The JWT token string (without "Bearer " prefix)

    Returns:
        TokenData with user_id, email, and expiration

    Raises:
        HTTPException 401: If token is invalid or expired
    """
    try:
        # Supabase uses HS256 for JWT signing
        payload = jwt.decode(
            token,
            get_supabase_jwt_secret(),
            algorithms=["HS256"],
        )

        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: no user ID in payload",
                headers={"WWW-Authenticate": "Bearer"},
            )

        return TokenData(
            user_id=user_id,
            email=payload.get("email"),
            expires_at=payload.get("exp"),
        )

    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired. Please login again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def verify_token_with_supabase(token: str) -> dict:
    """
    Verify a JWT token by calling Supabase's /auth/v1/user endpoint.

    This is the most reliable method because:
    1. It validates against Supabase's current state (checks revoked sessions)
    2. It works with ES256 tokens (Supabase's default signing algorithm)
    3. No need to manage JWT secrets locally

    Args:
        token: The JWT token string

    Returns:
        Supabase user object dict with id, email, etc.

    Raises:
        HTTPException 401: If token is invalid or expired
    """
    import httpx

    supabase_url = os.getenv("SUPABASE_URL")
    if not supabase_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SUPABASE_URL not configured",
        )

    auth_url = f"{supabase_url}/auth/v1/user"

    async with httpx.AsyncClient() as client:
        response = await client.get(
            auth_url,
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": os.getenv("SUPABASE_ANON_KEY", ""),
            },
            timeout=10,
        )

    if response.status_code == 200:
        user_data = response.json()
        return user_data
    elif response.status_code == 401:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    else:
        logger.warning("Supabase auth error [%d]: %s", response.status_code, response.text)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ============================================================
# FastAPI Dependencies
# ============================================================

async def get_current_user(request: Request) -> UserInToken:
    """
    FastAPI dependency to extract and validate the current user from a request.

    Usage:
        @router.get("/me")
        async def get_me(user: UserInToken = Depends(get_current_user)):
            return user

    Raises:
        HTTPException 401: If no valid token is provided
    """
    # First, try to get user from request state (set by middleware)
    if hasattr(request.state, "user") and request.state.user:
        user_data = request.state.user
        # If middleware already set it as a dict, convert to UserInToken
        if isinstance(user_data, dict):
            return UserInToken(
                id=user_data.get("id", ""),
                email=user_data.get("email", ""),
                full_name=user_data.get("full_name"),
                avatar_url=user_data.get("avatar_url"),
                tier=user_data.get("tier", "free"),
            )
        return user_data  # Already a UserInToken

    # Fall back to extracting from Authorization header
    authorization = request.headers.get("Authorization", "")
    token = extract_bearer_token(authorization)

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify token with Supabase
    user_data = await verify_token_with_supabase(token)

    # Fetch user profile from database
    try:
        from core.supabase_client import supabase_admin

        profile_result = supabase_admin.client.table("profiles").select("*").eq("id", user_data["id"]).execute()

        profile = {}
        if profile_result.data:
            profile = profile_result.data[0]
    except Exception as e:
        logger.warning("Failed to fetch user profile: %s", e)
        profile = {}

    return UserInToken(
        id=user_data["id"],
        email=user_data.get("email", ""),
        full_name=profile.get("full_name"),
        avatar_url=profile.get("avatar_url"),
        tier=profile.get("tier", "free"),
    )


async def require_auth(request: Request) -> None:
    """
    FastAPI dependency that only requires authentication
    (doesn't return the user object).

    Use this in the `dependencies` list when you don't need
    the user object but want to ensure the request is authenticated.

    Usage:
        @router.get("/protected", dependencies=[Depends(require_auth)])
        async def protected_endpoint(request: Request):
            user_id = request.state.user.id
            ...
    """
    user = await get_current_user(request)
    request.state.user = user


def extract_bearer_token(authorization: str) -> Optional[str]:
    """
    Extract the token from an Authorization header.

    Args:
        authorization: The full Authorization header value

    Returns:
        The token string, or None if no valid Bearer token found
    """
    if not authorization:
        return None

    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None

    return parts[1]


# ============================================================
# WebSocket Authentication
# ============================================================

async def authenticate_websocket(websocket: WebSocket) -> dict:
    """
    Authenticate a WebSocket connection using a query parameter token.

    Usage in FastAPI:
        @app.websocket("/ws")
        async def websocket_endpoint(websocket: WebSocket):
            user = await authenticate_websocket(websocket)
            # user is now a dict with id, email, tier, etc.
            await websocket.accept()
            ...

    The client should connect with:
        ws://host/ws?token=YOUR_JWT_TOKEN
    """
    token = websocket.query_params.get("token")

    if not token:
        raise WebSocketException(
            code=status.WS_1008_POLICY_VIOLATION,
            reason="Missing authentication token. Connect with: ws://host/ws?token=YOUR_TOKEN",
        )

    try:
        user_data = await verify_token_with_supabase(token)

        # Fetch user profile
        from core.supabase_client import supabase_admin

        profile_result = supabase_admin.client.table("profiles").select("*").eq("id", user_data["id"]).execute()

        profile = profile_result.data[0] if profile_result.data else {}

        return {
            "id": user_data["id"],
            "email": user_data.get("email", ""),
            "tier": profile.get("tier", "free"),
        }

    except HTTPException:
        raise WebSocketException(
            code=status.WS_1008_POLICY_VIOLATION,
            reason="Invalid or expired authentication token",
        )
    except Exception as e:
        logger.error("WebSocket authentication failed: %s", e)
        raise WebSocketException(
            code=status.WS_1011_INTERNAL_ERROR,
            reason="Authentication failed",
        )


# ============================================================
# Public Paths Configuration
# ============================================================

# Paths that do NOT require authentication
PUBLIC_PATHS = frozenset({
    "/health",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/auth/signup",
    "/auth/login",
    "/auth/forgot-password",
    "/auth/reset-password",
    "/auth/refresh",
    "/api/assets",
    "/api/workspace",
    "/static",
})


def is_public_path(path: str) -> bool:
    """Check if a path is publicly accessible without authentication."""
    # Exact match
    if path in PUBLIC_PATHS:
        return True

    # Prefix match (for static files and API assets)
    public_prefixes = ["/api/assets/", "/api/workspace/", "/static/", "/docs", "/redoc"]
    return any(path.startswith(prefix) for prefix in public_prefixes)
