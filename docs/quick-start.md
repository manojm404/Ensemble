# Ensemble Quick Start Guide

Get up and running with Ensemble in 5 minutes.

---

## 🚀 What is Ensemble?

Ensemble is an AI agent orchestration platform. Build, manage, and monitor teams of AI agents that collaborate to solve complex workflows.

---

## Prerequisites

- **Python 3.11+** — [Download](https://www.python.org/downloads/)
- **Supabase Account** — [Free signup](https://app.supabase.com)
- **LLM API Key** — Gemini, OpenAI, or any OpenAI-compatible provider

---

## Step 1: Clone & Install

```bash
git clone https://github.com/your-org/ensemble.git
cd ensemble

# Install Python dependencies
pip install -r requirements.txt
```

---

## Step 2: Set Up Supabase

1. Create a project at [app.supabase.com](https://app.supabase.com)
2. Go to **SQL Editor** and run these migrations in order:
   - `schema/001_supabase_schema.sql` — Creates all tables and RLS policies
   - `schema/002_service_role_bypass.sql` — Allows backend to manage user data
   - `schema/003_fix_rls_policies.sql` — Fixes service_role bypass

3. Copy your credentials from **Project Settings → API**:
   - Project URL
   - `anon` public key
   - `service_role` key (keep secret!)
   - JWT Secret (at bottom of API page)

---

## Step 3: Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in your Supabase credentials:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
JWT_SECRET=your-jwt-secret
API_KEY_ENCRYPTION_KEY=generate-with-python-command
```

Generate the encryption key:
```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

---

## Step 4: Start the Backend

```bash
uvicorn core.governance:app --host 0.0.0.0 --port 8088 --reload
```

Verify it's running:
```bash
curl http://localhost:8088/health
# Should return: {"status": "ok", "supabase_connected": true}
```

---

## Step 5: Create Your Account

```bash
# Sign up
curl -X POST http://localhost:8088/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"SecurePass123!","full_name":"Your Name"}'

# Login
curl -X POST http://localhost:8088/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"SecurePass123!"}'
```

Save the returned `token` for authenticated requests.

---

## Step 6: Add Your LLM API Key

```bash
TOKEN="your-jwt-token-from-login"

curl -X POST http://localhost:8088/api/settings/api-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"provider":"gemini","api_key":"your-gemini-api-key"}'
```

---

## Step 7: Configure Your Settings

```bash
curl -X PUT http://localhost:8088/api/settings \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"provider":"gemini","model":"gemini-2.5-flash","theme":"dark"}'
```

---

## Next Steps

- **Build your first SOP workflow** — See [SOP Designer Guide](./sop-designer.md)
- **Set up the UI** — See [UI Setup Guide](./ui-setup.md)
- **Explore the API** — Open `http://localhost:8088/docs` for Swagger docs

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `SUPABASE_URL not configured` | Check `.env` file exists and has Supabase credentials |
| `401 Unauthorized` | Make sure you're including `Authorization: Bearer <token>` header |
| `RLS policy violation` | Run the schema migrations in order (001 → 002 → 003) |
| `Rate limited (429)` | Default limit is 100 requests/min. Adjust `RATE_LIMIT_PER_MINUTE` in `.env` |

---

*Need help? Check our [full documentation](../README.md) or open an issue on GitHub.*
