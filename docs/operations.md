# Esemble Operations Guide

This guide covers local setup, self-hosting, and release smoke tests.

## Local Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- npm
- One model option:
  - Gemini/OpenAI-compatible API key, or
  - Ollama running locally

### Backend

```bash
pip install -r requirements.txt
```

Create `.env`:

```env
ENFORCE_AUTH=false
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-key
APPROVAL_COST_THRESHOLD=0.01
APPROVAL_TIMEOUT_SECONDS=300
RATE_LIMIT_ENABLED=true
RATE_LIMIT_PER_MINUTE=100
```

For local Ollama:

```env
ENFORCE_AUTH=false
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1
```

Start backend:

```bash
uvicorn core.governance:app --reload --port 8088
```

Verify:

```bash
curl http://localhost:8088/health
```

### UI

```bash
cd ui
npm install
npm run dev
```

Open the URL printed by Vite.

## Release Demo Flow

1. Open Templates.
2. Choose Governed Research Report.
3. Enter a research question.
4. Run the workflow.
5. Watch the step timeline.
6. Review final output.
7. Review evaluation result.
8. Export the audit package.

Expected completed run:

- workflow name and version,
- agent step timeline,
- artifacts produced,
- cost/token usage,
- approval decisions if any,
- evaluation result,
- audit export action.

## Self-Hosting

### Deployment Modes

Local Team Mode:

- Backend: FastAPI
- UI: static/Vite build
- Storage: SQLite + local CAS artifacts
- Models: Ollama or configured cloud provider

Managed Database Mode:

- Backend: FastAPI
- UI: static/Vite build
- Storage: Supabase/Postgres
- Artifacts: local CAS or mounted storage
- Models: user-configured providers

### Production Architecture

```text
Browser / Desktop
  -> HTTPS reverse proxy
  -> Esemble FastAPI backend
  -> SQLite or Supabase metadata
  -> CAS artifact storage
  -> Model provider or local Ollama
```

### Docker Compose

```bash
cp .env.example .env
docker compose up -d
docker compose logs -f
```

Required environment:

```env
ENFORCE_AUTH=true
CORS_ORIGINS=https://ensemble.yourdomain.com
API_KEY_ENCRYPTION_KEY=generated-fernet-key
APPROVAL_COST_THRESHOLD=0.01
APPROVAL_TIMEOUT_SECONDS=300
RATE_LIMIT_ENABLED=true
RATE_LIMIT_PER_MINUTE=100
```

For Supabase mode:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
JWT_SECRET=...
```

For local model mode:

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=llama3.1
```

### Manual Backend Deployment

```bash
python3.11 -m venv /opt/ensemble/venv
source /opt/ensemble/venv/bin/activate
pip install -r requirements.txt
gunicorn core.governance:app \
  --bind 0.0.0.0:8088 \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --timeout 120
```

### Reverse Proxy

```nginx
server {
    listen 443 ssl;
    server_name ensemble.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/ensemble.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ensemble.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:8088;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Security Checklist

- [ ] HTTPS enabled
- [ ] `ENFORCE_AUTH=true` outside local development
- [ ] API key encryption key configured
- [ ] CORS restricted to known origins
- [ ] Rate limiting enabled
- [ ] Supabase RLS migrations applied if using Supabase
- [ ] Artifact storage backed up
- [ ] Audit database backed up
- [ ] Provider keys rotated periodically
- [ ] Approval threshold configured
- [ ] Sensitive tools require approval

## Operational Checklist

- [ ] Health check monitored
- [ ] Backend logs collected
- [ ] Disk usage monitored for CAS artifacts
- [ ] Failed run alerting configured
- [ ] Audit export tested
- [ ] Restore from backup tested
- [ ] Provider connection tested
- [ ] Template workflow smoke test passes

## Troubleshooting

| Problem | Likely fix |
| --- | --- |
| Backend returns 401 | Set `ENFORCE_AUTH=false` for local development or configure Supabase auth |
| Provider call fails | Check API key or Ollama model name |
| UI cannot reach backend | Confirm backend is on port `8088` and CORS allows the UI origin |
| Workflow runs but no output appears | Check backend logs and audit events |
| Approval is stuck | Open Approval Center or lower approval threshold for local testing |

## Data Retention

Recommended defaults:

- Audit events: keep indefinitely unless customer policy requires deletion.
- CAS artifacts: retain at least 90 days.
- Failed run artifacts: retain at least 30 days.
- Approval decisions: retain with audit events.
- Provider API keys: encrypted, never exported in audit packages.

## Backup Targets

- SQLite database or Supabase database
- `data/ensemble_space`
- `data/workspace`
- `.env` stored securely outside repo
- generated audit exports if stored on disk
