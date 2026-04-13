#!/usr/bin/env python
"""
Phase 2 Auth Endpoint Test Script

Tests the full authentication flow against a running backend server.
Run the backend first: uvicorn core.governance:app --reload --port 8088

Then run this script: python scripts/test_auth_flow.py

Tests:
1. GET /health — Supabase connection
2. POST /auth/signup — Create new user
3. POST /auth/login — Login with credentials
4. GET /auth/me — Get profile (JWT-protected)
5. PUT /auth/me — Update profile (JWT-protected)
6. GET /api/agents — Protected endpoint (requires JWT)
7. GET /api/agents without token — Should return 401
"""

import os
import sys
import json
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# Configuration
BASE_URL = os.getenv("ENSEMBLE_API_URL", "http://127.0.0.1:8088")

# Test user (unique email to avoid conflicts)
TEST_EMAIL = f"test_{int(time.time())}@test.localdomain"
TEST_PASSWORD = "TestPass123!"
TEST_NAME = "Test User"

# Colors
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
BOLD = "\033[1m"
RESET = "\033[0m"

passed = 0
failed = 0
token = ""


def section(title):
    print(f"\n{BOLD}{BLUE}{'=' * 60}{RESET}")
    print(f"{BOLD}{BLUE}  {title}{RESET}")
    print(f"{BOLD}{BLUE}{'=' * 60}{RESET}")


def check(description, condition):
    global passed, failed
    if condition:
        print(f"  {GREEN}✅ PASS{RESET} {description}")
        passed += 1
    else:
        print(f"  {RED}❌ FAIL{RESET} {description}")
        failed += 1
    return condition


def api(method: str, path: str, data: dict = None, use_token: bool = False) -> tuple:
    """Make an API request and return (status_code, response_dict)."""
    url = f"{BASE_URL}{path}"
    body = json.dumps(data).encode() if data else None

    headers = {"Content-Type": "application/json"}
    if use_token and token:
        headers["Authorization"] = f"Bearer {token}"

    req = Request(url, data=body, headers=headers, method=method)

    try:
        with urlopen(req, timeout=10) as resp:
            return resp.status, json.loads(resp.read().decode())
    except HTTPError as e:
        try:
            body = json.loads(e.read().decode())
        except Exception:
            body = {"error": e.reason}
        return e.code, body
    except URLError as e:
        return 0, {"error": f"Connection failed: {e.reason}"}


# ============================================================
# Tests
# ============================================================

print(f"\n{BOLD}Ensemble Phase 2 — Auth Flow Tests{RESET}")
print(f"{'─' * 60}")
print(f"  Target: {BASE_URL}")
print(f"  Test user: {TEST_EMAIL}")

# --- 1. Health Check ---
section("1. Health Check")
status, data = api("GET", "/health")
check(f"GET /health returns 200", status == 200)
check(f"  status is 'ok' or 'degraded'", data.get("status") in ("ok", "degraded"))
check(f"  version is 2.0.0", data.get("version") == "2.0.0")
check(f"  supabase_connected is true", data.get("supabase_connected") is True)
if data.get("status") == "degraded":
    print(f"  {YELLOW}⚠️  Supabase not fully connected — check your .env credentials{RESET}")

# --- 2. Signup ---
section("2. User Signup")
status, data = api("POST", "/auth/signup", {
    "email": TEST_EMAIL,
    "password": TEST_PASSWORD,
    "full_name": TEST_NAME,
})
check(f"POST /auth/signup returns 201", status == 201)
check(f"  status is 'success'", data.get("status") == "success")
check(f"  token is returned", "token" in data and len(data.get("token", "")) > 10)
check(f"  token_type is 'bearer'", data.get("token_type") == "bearer")

user_data = data.get("user", {})
check(f"  user.id is returned", "id" in user_data and len(user_data.get("id", "")) > 10)
check(f"  user.email matches", user_data.get("email") == TEST_EMAIL)
check(f"  user.full_name matches", user_data.get("full_name") == TEST_NAME)
check(f"  user.tier is 'free'", user_data.get("tier") == "free")

if data.get("token"):
    token = data["token"]
    print(f"  {GREEN}🔑 Token saved for subsequent tests{RESET}")

# --- 3. Login ---
section("3. User Login")
status, data = api("POST", "/auth/login", {
    "email": TEST_EMAIL,
    "password": TEST_PASSWORD,
})
check(f"POST /auth/login returns 200", status == 200)
check(f"  status is 'success'", data.get("status") == "success")
check(f"  token is returned", "token" in data and len(data.get("token", "")) > 10)

if data.get("token"):
    token = data["token"]  # Refresh token from login

# --- 4. Login with wrong password ---
section("4. Login with Wrong Password")
status, data = api("POST", "/auth/login", {
    "email": TEST_EMAIL,
    "password": "WrongPassword123!",
})
check(f"POST /auth/login with wrong password returns 401", status == 401)
check(f"  error message mentions invalid credentials",
      "invalid" in json.dumps(data).lower() or "detail" in json.dumps(data).lower())

# --- 5. Get Profile (JWT-protected) ---
section("5. Get Current User Profile")
status, data = api("GET", "/auth/me", use_token=True)
check(f"GET /auth/me with token returns 200", status == 200)
check(f"  user.id matches", data.get("id") == user_data.get("id"))
check(f"  user.email matches", data.get("email") == TEST_EMAIL)
check(f"  user.tier is 'free'", data.get("tier") == "free")

# --- 6. Get Profile without token (should 401) ---
section("6. Get Profile without Token")
status, data = api("GET", "/auth/me", use_token=False)
check(f"GET /auth/me without token returns 401", status == 401)
check(f"  error mentions unauthorized",
      "unauthorized" in json.dumps(data).lower() or "error" in data)

# --- 7. Update Profile ---
section("7. Update User Profile")
status, data = api("PUT", "/auth/me", {
    "full_name": "Updated Test User",
}, use_token=True)
check(f"PUT /auth/me returns 200", status == 200)
check(f"  full_name is updated", data.get("full_name") == "Updated Test User")

# Verify the update persisted
status, data = api("GET", "/auth/me", use_token=True)
check(f"GET /auth/me reflects updated name", data.get("full_name") == "Updated Test User")

# --- 8. Protected endpoint without token ---
section("8. Protected Endpoint without Token")
status, data = api("GET", "/api/agents", use_token=False)
check(f"GET /api/agents without token returns 401", status == 401)

# --- 9. Protected endpoint with token ---
section("9. Protected Endpoint with Token")
status, data = api("GET", "/api/agents", use_token=True)
check(f"GET /api/agents with token returns 200", status == 200)
check(f"  response has agents list or status", "agents" in data or "status" in data)

# --- 10. Forgot Password ---
section("10. Forgot Password")
status, data = api("POST", "/auth/forgot-password", {
    "email": TEST_EMAIL,
})
check(f"POST /auth/forgot-password returns 200", status == 200)
check(f"  status is 'success'", data.get("status") == "success")
print(f"  {YELLOW}ℹ️  Check {TEST_EMAIL} inbox for reset link (if email is real){RESET}")

# --- 11. Invalid Token ---
section("11. Invalid Token")
saved_token = token
token = "invalid_token_here"
status, data = api("GET", "/auth/me", use_token=True)
check(f"GET /auth/me with invalid token returns 401", status == 401)
token = saved_token  # Restore

# --- Summary ---
section("Phase 2 Auth Flow Test Summary")

total = passed + failed
print(f"\n  {BOLD}Total tests:{RESET} {total}")
print(f"  {GREEN}✅ Passed:{RESET} {passed}")
print(f"  {RED}❌ Failed:{RESET} {failed}")

print(f"\n{'─' * 60}")

if failed == 0:
    print(f"  {GREEN}{BOLD}🎉 ALL AUTH TESTS PASSED — Phase 2 is complete!{RESET}")
    print(f"\n  Auth flow is fully functional:")
    print(f"  ✅ Signup creates real Supabase users")
    print(f"  ✅ Login returns valid JWT tokens")
    print(f"  ✅ JWT middleware protects all endpoints")
    print(f"  ✅ Profile CRUD works")
    print(f"  ✅ Wrong credentials rejected")
    print(f"  ✅ Invalid tokens rejected")
elif failed <= 2:
    print(f"  {GREEN}{BOLD}✅ Most tests passed ({failed} minor failures){RESET}")
    print(f"  Review failures above and check your Supabase credentials.")
else:
    print(f"  {RED}{BOLD}❌ {failed} test(s) failed{RESET}")
    print(f"\n  Common causes:")
    print(f"  1. Backend not running: uvicorn core.governance:app --port 8088")
    print(f"  2. Supabase credentials not in .env file")
    print(f"  3. Schema not applied in Supabase SQL Editor")
    print(f"  4. Email already in use (change TEST_EMAIL in the script)")

print(f"{'─' * 60}\n")

sys.exit(1 if failed > 0 else 0)
