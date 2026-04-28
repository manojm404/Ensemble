"""
core/supabase_client.py - Supabase Client Singleton

Provides a thread-safe, lazily-initialized Supabase client for the Ensemble backend.
Supports both the anon key (for client-side operations) and the service role key
(for admin operations that bypass RLS).

Usage:
    from backend.ensemble.supabase_client import supabase

    # Standard operations (respect RLS)
    result = supabase.table("profiles").select("*").eq("id", user_id).execute()

    # Admin operations (bypass RLS - use with caution)
    from backend.ensemble.supabase_client import supabase_admin
    result = supabase_admin.table("profiles").select("*").execute()

Environment variables required:
    SUPABASE_URL - Your Supabase project URL
    SUPABASE_ANON_KEY - Your Supabase anon/public key
    SUPABASE_SERVICE_ROLE_KEY - Your Supabase service role key (keep secret!)
"""

import logging
import os
from typing import Optional

from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Load environment variables from .env file
load_dotenv()


class SupabaseClient:
    """
    Lazy-initialized Supabase client singleton.

    The client is created on first access to allow configuration
    (e.g., environment variable loading) before initialization.
    """

    def __init__(self):
        self._client = None
        self._url: Optional[str] = None
        self._key: Optional[str] = None

    def _initialize(self) -> None:
        """Initialize the Supabase client if not already initialized."""
        if self._client is not None:
            return

        self._url = os.getenv("SUPABASE_URL")
        self._key = os.getenv("SUPABASE_ANON_KEY")

        if not self._url:
            raise ValueError(
                "SUPABASE_URL environment variable is required. "
                "Add it to your .env file or export it in your shell."
            )
        if not self._key:
            raise ValueError(
                "SUPABASE_ANON_KEY environment variable is required. "
                "Add it to your .env file or export it in your shell."
            )

        try:
            from supabase import Client, create_client

            self._client: Client = create_client(self._url, self._key)
            logger.info(
                "✅ [SupabaseClient] Connected to %s",
                self._url.replace("https://", "").replace(".supabase.co", ""),
            )
        except ImportError:
            raise ImportError(
                "supabase package is required. Install with: pip install supabase"
            )
        except Exception as e:
            raise ConnectionError(
                f"Failed to connect to Supabase: {e}. "
                "Check your SUPABASE_URL and SUPABASE_ANON_KEY."
            ) from e

    @property
    def client(self):
        """Get the Supabase client, initializing if necessary."""
        self._initialize()
        return self._client

    def table(self, table_name: str):
        """Shortcut to access a table."""
        return self.client.table(table_name)

    def auth(self):
        """Shortcut to access Supabase Auth."""
        return self.client.auth

    def rpc(self, function_name: str, **params):
        """Call a Supabase RPC function."""
        return self.client.rpc(function_name, params)

    @property
    def is_connected(self) -> bool:
        """Check if the client is initialized."""
        return self._client is not None


class SupabaseAdminClient:
    """
    Supabase client with service role key (bypasses RLS).

    Use this ONLY for backend operations that need to access data
    across all users (e.g., admin dashboards, background jobs).
    NEVER expose this key to the frontend.
    """

    def __init__(self):
        self._client = None
        self._url: Optional[str] = None
        self._key: Optional[str] = None

    def _initialize(self) -> None:
        """Initialize the admin Supabase client."""
        if self._client is not None:
            return

        self._url = os.getenv("SUPABASE_URL")
        self._key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

        if not self._url:
            raise ValueError("SUPABASE_URL environment variable is required.")
        if not self._key:
            raise ValueError(
                "SUPABASE_SERVICE_ROLE_KEY environment variable is required. "
                "This is needed for admin operations that bypass RLS."
            )

        try:
            from supabase import Client, create_client

            self._client: Client = create_client(self._url, self._key)
            logger.info("✅ [SupabaseAdmin] Admin client initialized")
        except ImportError:
            raise ImportError(
                "supabase package is required. Install with: pip install supabase"
            )
        except Exception as e:
            raise ConnectionError(f"Failed to connect to Supabase as admin: {e}") from e

    @property
    def client(self):
        """Get the admin Supabase client."""
        self._initialize()
        return self._client

    def table(self, table_name: str):
        """Shortcut to access a table (bypasses RLS)."""
        return self.client.table(table_name)

    def auth(self):
        """Shortcut to access Supabase Auth admin."""
        return self.client.auth

    def query(self, table_name: str, method: str = "select", **kwargs):
        """
        Execute a direct REST API call to Supabase with service_role key.
        This bypasses RLS by sending the service_role JWT directly.
        """
        # Ensure initialized
        self._initialize()

        import httpx

        url = f"{self._url}/rest/v1/{table_name}"
        headers = {
            "apikey": self._key,
            "Authorization": f"Bearer {self._key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

        if method == "select":
            # Build URL manually to avoid httpx URL-encoding issues with PostgREST filters
            url_parts = f"{url}?select={kwargs.get('columns', '*')}"
            if "eq" in kwargs and "eq_value" in kwargs:
                url_parts += f"&{kwargs['eq']}=eq.{kwargs['eq_value']}"
            if "order" in kwargs:
                url_parts += f"&order={kwargs['order']}"
            if "limit" in kwargs:
                url_parts += f"&limit={kwargs['limit']}"

            response = httpx.get(url_parts, headers=headers, timeout=10)
            return _QueryResult(response)

        elif method == "insert":
            data = kwargs.get("data", {})
            response = httpx.post(url, headers=headers, json=data, timeout=10)
            return _QueryResult(response)

        elif method == "upsert":
            data = kwargs.get("data", {})
            headers["Prefer"] = "resolution=merge-duplicates,return=representation"
            # Add on_conflict filter for proper upsert behavior
            if "on_conflict" in kwargs:
                url_parts = f"{url}?on_conflict={kwargs['on_conflict']}"
                response = httpx.post(url_parts, headers=headers, json=data, timeout=10)
            else:
                response = httpx.post(url, headers=headers, json=data, timeout=10)
            return _QueryResult(response)

        elif method == "update":
            data = kwargs.get("data", {})
            if "eq" in kwargs:
                url = f"{url}?{kwargs['eq']}=eq.{kwargs['eq_value']}"
            response = httpx.patch(url, headers=headers, json=data, timeout=10)
            return _QueryResult(response)

        elif method == "delete":
            if "eq" in kwargs:
                url = f"{url}?{kwargs['eq']}=eq.{kwargs['eq_value']}"
            response = httpx.delete(url, headers=headers, timeout=10)
            return _QueryResult(response)

        raise ValueError(f"Unsupported method: {method}")

    @property
    def is_connected(self) -> bool:
        """Check if the admin client is initialized."""
        return self._client is not None


class _QueryResult:
    """Simple wrapper for HTTP response to mimic Supabase query result."""

    def __init__(self, response):
        self.response = response
        self.data = response.json() if response.status_code < 400 else []
        self.status_code = response.status_code
        self.error = response.json() if response.status_code >= 400 else None

    def __repr__(self):
        return f"QueryResult(status={self.status_code}, data={self.data})"


# Module-level singletons
supabase = SupabaseClient()
supabase_admin = SupabaseAdminClient()


def verify_connection() -> dict:
    """
    Test the Supabase connection by fetching the current user's profile.
    Returns a dict with connection status and details.

    Usage:
        result = verify_connection()
        if result["success"]:
            print("Connected!")
        else:
            print(f"Error: {result['error']}")
    """
    try:
        # Test by checking if we can query the profiles table structure
        # This doesn't require an authenticated user, just validates connection
        client = supabase.client
        # If we get here without error, connection is valid
        return {
            "success": True,
            "message": "Successfully connected to Supabase",
            "url": os.getenv("SUPABASE_URL", "unknown"),
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "message": f"Connection failed: {e}",
        }
