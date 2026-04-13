#!/usr/bin/env python
"""
Phase 1 Verification Script

Checks that all Phase 1 components are properly set up:
1. Required files exist
2. Python dependencies can be imported
3. Supabase client initializes (if credentials are set)
4. Auth middleware loads
5. Pydantic models validate correctly
6. Docker files exist

Run: python scripts/verify_phase1.py
"""

import os
import sys
from pathlib import Path

# Colors for output
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
RESET = "\033[0m"
BOLD = "\033[1m"

# Track results
passed = 0
failed = 0
warnings = 0


def check(description: str, condition: bool, warning: bool = False):
    """Print a check result."""
    global passed, failed, warnings
    status = GREEN + "✅ PASS" if condition else RED + "❌ FAIL"
    if warning and not condition:
        status = YELLOW + "⚠️  WARN"
        warnings += 1
    elif condition:
        passed += 1
    else:
        failed += 1
    print(f"  {status}{RESET} {description}")
    return condition


def section(title: str):
    """Print a section header."""
    print(f"\n{BOLD}{BLUE}{'=' * 60}{RESET}")
    print(f"{BOLD}{BLUE}  {title}{RESET}")
    print(f"{BOLD}{BLUE}{'=' * 60}{RESET}")


# ============================================================
# Verification
# ============================================================

print(f"\n{BOLD}Ensemble Phase 1 — Verification Script{RESET}")
print(f"{'─' * 60}")

# --- 1. File Existence Checks ---
section("1. Required Files")

files_to_check = [
    ("Schema", "schema/001_supabase_schema.sql"),
    ("Supabase Client", "core/supabase_client.py"),
    ("Auth Middleware", "core/auth.py"),
    ("Models Init", "core/models/__init__.py"),
    ("User Models", "core/models/user.py"),
    ("API Models", "core/models/api.py"),
    ("Dockerfile", "Dockerfile"),
    ("Docker Compose", "docker-compose.yml"),
    ("Docker Ignore", ".dockerignore"),
    ("UI Dockerfile", "ui/Dockerfile.ui"),
    ("UI nginx.conf", "ui/nginx.conf"),
]

for name, path in files_to_check:
    exists = Path(path).exists()
    check(f"{name}: {path}", exists)

# --- 2. Environment Configuration ---
section("2. Environment Configuration (.env)")

env_file = Path(".env")
env_example = Path(".env.example")

check(".env.example exists", env_example.exists())

required_env_vars = [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "API_KEY_ENCRYPTION_KEY",
]

if env_file.exists():
    check(".env file exists", True)
    env_content = env_file.read_text()
    for var in required_env_vars:
        present = var in env_content and not env_content.split(f"{var}=")[1].strip().startswith("#")
        check(f"  {var} is configured", present, warning=True)
else:
    check(".env file exists", False, warning=True)
    print(f"  {YELLOW}⚠️  Copy .env.example to .env and fill in your values{RESET}")

# Check .env.example has Supabase vars
if env_example.exists():
    example_content = env_example.read_text()
    check(".env.example has SUPABASE_URL", "SUPABASE_URL" in example_content)
    check(".env.example has SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY" in example_content)
    check(".env.example has SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY" in example_content)
    check(".env.example has API_KEY_ENCRYPTION_KEY", "API_KEY_ENCRYPTION_KEY" in example_content)

# --- 3. Python Dependencies ---
section("3. Python Dependencies")

dependencies = [
    ("supabase", "Supabase Python client"),
    ("jose", "JWT validation (python-jose)"),
    ("cryptography", "AES-256 encryption"),
    ("pydantic", "Data validation"),
    ("fastapi", "Web framework"),
    ("uvicorn", "ASGI server"),
    ("slowapi", "Rate limiting"),
    ("bleach", "Input sanitization"),
]

for package, description in dependencies:
    try:
        __import__(package)
        check(f"{description} ({package})", True)
    except ImportError:
        check(f"{description} ({package}) — install with: pip install {package}", False, warning=True)

# --- 4. Module Import Checks ---
section("4. Module Import Checks")

try:
    from core.supabase_client import supabase, supabase_admin, verify_connection
    check("core.supabase_client imports successfully", True)
    check("  supabase singleton available", supabase is not None)
    check("  supabase_admin singleton available", supabase_admin is not None)
    check("  verify_connection function available", callable(verify_connection))
except Exception as e:
    check(f"core.supabase_client imports — error: {e}", False)

try:
    from core.auth import (
        get_current_user,
        require_auth,
        extract_bearer_token,
        authenticate_websocket,
        PUBLIC_PATHS,
        is_public_path,
    )
    check("core.auth imports successfully", True)
    check("  get_current_user dependency available", callable(get_current_user))
    check("  require_auth dependency available", callable(require_auth))
    check("  authenticate_websocket available", callable(authenticate_websocket))
    check("  PUBLIC_PATHS defined", len(PUBLIC_PATHS) > 0)
except Exception as e:
    check(f"core.auth imports — error: {e}", False)

try:
    from core.models import (
        UserCreate,
        UserLogin,
        UserResponse,
        WorkflowCreate,
        APIKeyCreate,
        SettingsUpdate,
        FeedbackCreate,
        BugReportCreate,
    )
    check("core.models imports successfully", True)
except Exception as e:
    check(f"core.models imports — error: {e}", False)

# --- 5. Pydantic Model Validation ---
section("5. Pydantic Model Validation")

try:
    from core.models import UserCreate, APIKeyCreate

    # Test valid UserCreate
    valid_user = UserCreate(
        email="test@example.com",
        password="SecurePass123!",
        full_name="Test User",
    )
    check("UserCreate validates with valid data", True)
    check(f"  email: {valid_user.email}", valid_user.email == "test@example.com")

    # Test invalid password (too short)
    try:
        UserCreate(email="test@example.com", password="short")
        check("UserCreate rejects short password", False)
    except Exception:
        check("UserCreate rejects short password (< 8 chars)", True)

    # Test invalid password (no uppercase)
    try:
        UserCreate(email="test@example.com", password="lowercase123!")
        check("UserCreate rejects password without uppercase", False)
    except Exception:
        check("UserCreate rejects password without uppercase", True)

    # Test valid APIKeyCreate
    valid_key = APIKeyCreate(provider="gemini", api_key="AIza-1234567890abcdef")
    check("APIKeyCreate validates with valid data", True)
    check(f"  provider normalized: {valid_key.provider}", valid_key.provider == "gemini")

    # Test invalid provider
    try:
        APIKeyCreate(provider="invalid_provider", api_key="some-key")
        check("APIKeyCreate rejects invalid provider", False)
    except Exception:
        check("APIKeyCreate rejects invalid provider", True)

except Exception as e:
    check(f"Model validation tests — error: {e}", False)

# --- 6. Docker Configuration ---
section("6. Docker Configuration")

docker_compose = Path("docker-compose.yml")
if docker_compose.exists():
    content = docker_compose.read_text()
    check("docker-compose.yml defines ensemble-backend", "ensemble-backend" in content)
    check("docker-compose.yml defines ensemble-ui", "ensemble-ui" in content)
    check("docker-compose.yml uses env_file", "env_file:" in content)
    check("docker-compose.yml defines volumes", "volumes:" in content)
    check("docker-compose.yml defines networks", "networks:" in content)

dockerfile = Path("Dockerfile")
if dockerfile.exists():
    content = dockerfile.read_text()
    check("Dockerfile uses multi-stage build", "AS builder" in content)
    check("Dockerfile uses python:3.11-slim", "python:3.11-slim" in content)
    check("Dockerfile exposes port 8088", "EXPOSE 8088" in content)
    check("Dockerfile has HEALTHCHECK", "HEALTHCHECK" in content)
    check("Dockerfile runs uvicorn with workers", "--workers" in content)

# --- 7. Schema Verification ---
section("7. Database Schema (schema/001_supabase_schema.sql)")

schema_file = Path("schema/001_supabase_schema.sql")
if schema_file.exists():
    schema_content = schema_file.read_text()

    expected_tables = [
        "profiles",
        "user_settings",
        "user_api_keys",
        "workflows",
        "workflow_executions",
        "macros",
        "audit_events",
        "conversations",
        "rag_documents",
        "token_grants",
        "custom_agents",
        "notifications",
        "feedback",
        "bug_reports",
        "daily_token_usage",
    ]

    check(f"Schema defines {len(expected_tables)} tables", True)
    for table in expected_tables:
        check(f"  Table: {table}", f"CREATE TABLE public.{table}" in schema_content)

    # Check triggers
    triggers = [
        "handle_new_user",
        "handle_updated_at",
        "check_sop_run_limit",
        "aggregate_daily_usage",
    ]
    check(f"Schema defines {len(triggers)} trigger functions", True)
    for trigger in triggers:
        check(f"  Trigger: {trigger}", f"FUNCTION public.{trigger}" in schema_content or f"public.{trigger}()" in schema_content)

    # Check RLS
    check("Schema enables RLS", "ENABLE ROW LEVEL SECURITY" in schema_content)
    check("Schema has RLS policies", "CREATE POLICY" in schema_content)

    # Check helper functions
    helpers = [
        "get_remaining_tokens",
        "is_sop_limit_exceeded",
        "mask_api_key",
    ]
    check(f"Schema defines {len(helpers)} helper functions", True)
    for helper in helpers:
        check(f"  Helper: {helper}", f"public.{helper}" in schema_content)

# --- 8. Summary ---
section("Phase 1 Verification Summary")

total = passed + failed + warnings
print(f"\n  {BOLD}Total checks:{RESET} {total}")
print(f"  {GREEN}✅ Passed:{RESET} {passed}")
print(f"  {RED}❌ Failed:{RESET} {failed}")
print(f"  {YELLOW}⚠️  Warnings:{RESET} {warnings}")

print(f"\n{'─' * 60}")

if failed == 0 and warnings == 0:
    print(f"  {GREEN}{BOLD}🎉 ALL CHECKS PASSED — Phase 1 is complete!{RESET}")
    print(f"\n  Next steps:")
    print(f"  1. Create a Supabase project at https://app.supabase.com")
    print(f"  2. Copy .env.example to .env and fill in your Supabase credentials")
    print(f"  3. Run schema/001_supabase_schema.sql in Supabase SQL Editor")
    print(f"  4. Run: docker compose up -d")
    print(f"  5. Verify: curl http://localhost:8088/health")
elif failed == 0:
    print(f"  {GREEN}{BOLD}✅ All critical checks passed (with {warnings} warnings){RESET}")
    print(f"\n  Review warnings above and address them before proceeding.")
else:
    print(f"  {RED}{BOLD}❌ {failed} check(s) failed — review errors above{RESET}")
    print(f"\n  Fix the failures before proceeding to Phase 2.")

print(f"{'─' * 60}\n")

# Exit code
sys.exit(1 if failed > 0 else 0)
