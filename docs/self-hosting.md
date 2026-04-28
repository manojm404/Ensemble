# Ensemble Self-Hosting Guide

Deploy Ensemble on your own infrastructure with Docker Compose.

---

## Overview

Ensemble consists of two services:
- **Backend** — FastAPI + Python (port 8088)
- **Frontend** — React + Vite (port 3000, optional)

Both connect to a Supabase database (cloud or self-hosted).

---

## Option 1: Quick Start with Docker Compose

### Prerequisites
- Docker + Docker Compose installed
- Supabase project set up (see [Quick Start](./quick-start.md))

### Deploy

```bash
# Clone the repo
git clone https://github.com/your-org/ensemble.git
cd ensemble

# Configure environment
cp .env.example .env
# Edit .env with your Supabase credentials

# Start all services
docker compose up -d

# Check status
docker compose ps
docker compose logs -f ensemble-backend
```

### Access
- Backend API: `http://localhost:8088`
- Health check: `http://localhost:8088/health`
- API docs: `http://localhost:8088/docs`

### Stop
```bash
docker compose down
```

---

## Option 2: Manual Deployment

### Backend Setup

```bash
# Install system dependencies
apt update && apt install -y python3.11 python3-pip python3-venv

# Create virtual environment
python3.11 -m venv /opt/ensemble/venv
source /opt/ensemble/venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Start with Gunicorn (production)
pip install gunicorn
gunicorn backend.ensemble.api.governance:app \
  --bind 0.0.0.0:8088 \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --timeout 120
```

### Systemd Service

Create `/etc/systemd/system/ensemble.service`:

```ini
[Unit]
Description=Ensemble AI Platform
After=network.target

[Service]
Type=notify
User=ensemble
Group=ensemble
WorkingDirectory=/opt/ensemble
EnvironmentFile=/opt/ensemble/.env
ExecStart=/opt/ensemble/venv/bin/gunicorn backend.ensemble.api.governance:app \
  --bind 0.0.0.0:8088 \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --timeout 120
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable ensemble
sudo systemctl start ensemble
sudo systemctl status ensemble
```

---

## Option 3: Self-Hosted Supabase

For data sovereignty requirements, you can self-host Supabase:

```bash
# Clone Supabase
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker

# Copy env template
cp .env.example .env

# Start Supabase stack
docker compose up -d
```

Then point Ensemble to your local Supabase:
```env
SUPABASE_URL=http://localhost:8000
SUPABASE_ANON_KEY=your-local-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-local-service-key
```

---

## Production Checklist

- [ ] **HTTPS**: Configure SSL/TLS (Let's Encrypt or your CA)
- [ ] **Domain**: Point DNS to your server
- [ ] **Backups**: Enable Supabase daily backups (Pro tier: $25/mo)
- [ ] **Monitoring**: Set up health check alerts
- [ ] **Logging**: Configure log aggregation (optional)
- [ ] **Firewall**: Only expose ports 80/443, block direct DB access
- [ ] **API Keys**: Rotate `API_KEY_ENCRYPTION_KEY` periodically
- [ ] **Updates**: Set up automated dependency updates

---

## Nginx Reverse Proxy (Optional)

For production, put Nginx in front of Ensemble:

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

        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | ✅ | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | ✅ | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key (secret!) |
| `JWT_SECRET` | ✅ | JWT signing secret from Supabase |
| `API_KEY_ENCRYPTION_KEY` | ✅ | Fernet key for encrypting API keys |
| `CORS_ORIGINS` | No | Comma-separated allowed origins (default: `*`) |
| `RATE_LIMIT_PER_MINUTE` | No | Max requests per user per minute (default: `100`) |
| `APPROVAL_COST_THRESHOLD` | No | Cost threshold requiring human approval (default: `0.0001`) |
| `APPROVAL_TIMEOUT_SECONDS` | No | Approval timeout (default: `300`) |
| `LLM_PROVIDER` | No | Default provider: `gemini`, `openai`, `ollama` (default: `gemini`) |
| `WORKSPACE_DIR` | No | Directory for user workspaces (default: `data/workspace`) |
| `LOG_LEVEL` | No | Log level: `DEBUG`, `INFO`, `WARNING`, `ERROR` (default: `INFO`) |

---

*For troubleshooting, check the [Quick Start Guide](./quick-start.md) or open an issue.*
