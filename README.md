<p align="center">
  <h1 align="center">🎼 Ensemble</h1>
  <p align="center"><strong>Autonomous AI Company Platform</strong></p>
  <p align="center">Build, orchestrate, and govern teams of AI agents with a no-code visual studio, local LLMs, and human-in-the-loop controls.</p>
</p>

<p align="center">
  <a href="#-what-is-ensemble">What is Ensemble</a> •
  <a href="#-why-ensemble">Why Ensemble</a> •
  <a href="#-key-features">Features</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-acknowledgments">Acknowledgments</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue.svg" alt="Version 1.0.0"/>
  <img src="https://img.shields.io/badge/python-3.11+-green.svg" alt="Python 3.11+"/>
  <img src="https://img.shields.io/badge/license-MIT-orange.svg" alt="License MIT"/>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg" alt="Cross-platform"/>
</p>

---

## 🌟 Inspiration & Acknowledgments

> **Ensemble stands on the shoulders of giants.** This project was inspired by and learned from some of the most innovative work in the AI agent space:

- **[MetaGPT](https://github.com/geekan/MetaGPT)** — Pioneered the idea of agents as software companies with structured roles and SOPs. Ensemble adopted and extended this philosophy.
- **[Paperclip Agency / agency-agents](https://github.com/paperclip-ai/agency-agents)** — Showcased the power of tool-wielding agents with clean architecture. Many execution patterns were learned from here.
- **[CrewAI](https://github.com/crewAIInc/crewAI)** — Demonstrated elegant multi-agent collaboration and role-based task delegation.
- **[LangChain](https://github.com/langchain-ai/langchain)** — Provided the foundation for composable AI chains and agent configurations.
- **[AutoGen](https://github.com/microsoft/autogen)** — Advanced the concept of conversable agents that work together autonomously.

**Ensemble** takes these ideas further by adding a **no-code visual studio**, **deterministic governance**, **budget enforcement**, and **universal agent format support** — making it production-ready for real businesses.

**Thank you to all these amazing open-source projects!** 🙏

---

## 🏢 What is Ensemble?

**Ensemble** is a desktop application and backend platform that transforms how businesses interact with AI. Instead of managing a single chatbot, you can architect entire **Specialized AI Departments** — groups of AI agents that collaborate to solve complex business objectives.

### The Core Philosophy

> **Code = SOP (Standard Operating Procedure)**

Every workflow in Ensemble is a Standard Operating Procedure executed by a team of agents. Each agent has a specific role, defined skill set, and budget constraints. Together, they accomplish complex tasks that no single agent could handle alone.

### What Makes Ensemble Different

| Traditional AI Tools | Ensemble |
|---|---|
| Single chatbot, limited context | **Multi-agent teams** with specialized roles |
| No cost controls, runaway spending | **Budget enforcement** with human approval gates |
| Black-box execution, no transparency | **Full audit trail** — every action, cost, and artifact tracked |
| Vendor lock-in, cloud-only | **Local-first** — runs 100% offline with Ollama |
| Code-heavy, complex setup | **No-code visual builder** — drag, drop, run |

---

## ⚖️ Why Ensemble?

Ensemble solves the four biggest challenges in agentic AI today:

<table>
<tr>
<td>
<h3>🏗️ Zero-Code Orchestration</h3>
<p>Architect complex multi-agent workflows without writing a single line of code. Visual drag-and-drop canvas makes it accessible to everyone.</p>
</td>
<td>
<h3>💰 Economic Governance</h3>
<p>Prevent runaway costs with real-time budget tracking, approval thresholds, and escrow systems. Know exactly what you're spending before it happens.</p>
</td>
</tr>
<tr>
<td>
<h3>🔒 Privacy-First</h3>
<p>Keep your data on-premises. Ensemble supports local LLMs (Ollama, LM Studio) and local vector databases for RAG. Zero telemetry, zero tracking.</p>
</td>
<td>
<h3>🔓 No Vendor Lock-in</h3>
<p>Seamlessly switch between Gemini, OpenAI, Claude, or 100% local models. Import agents from any framework (MetaGPT, CrewAI, LangChain, AutoGen).</p>
</td>
</tr>
</table>

---

## ✨ Key Features

### 🎨 Visual Workflow Studio
Build multi-agent workflows visually with **React Flow-powered** drag-and-drop canvas:
- **186+ Pre-built Specialist Agents** — Choose from PMs, architects, developers, designers, marketers, and more
- **AI Workflow Generator** — Describe what you need in natural language, get a complete workflow instantly
- **Real-time Node Inspector** — Edit model, temperature, and prompts for each agent
- **Auto-layout & Smart Connections** — Intelligent positioning and directed edge drawing

### ▶️ Execution Engine
Run complex DAG (Directed Acyclic Graph) workflows with full transparency:
- **Sequential & Parallel Execution** — Topological ordering for optimal performance
- **Real-time Progress Tracking** — Watch each agent work with live step indicators
- **Content-Addressable Storage (CAS)** — Every artifact is versioned with SHA-256 hashes
- **Multi-LLM Support** — Gemini, Ollama (local), OpenAI-compatible endpoints

### 📊 Governance Dashboard
Complete visibility and control over your AI operations:
- **Live Stats Cards** — Active workflows, agents running, tokens used, monthly cost
- **Agent Leaderboard** — Top-performing agents by success rate and efficiency
- **7-Day Token Usage Charts** — Visual spending tracking and forecasting
- **Audit Trail** — Every action, cost, and artifact hash logged to SQLite
- **Panic Button** — Universal abort with forensic report generation

### 🔐 Security & Compliance
Five-layer defense-in-depth for running untrusted agent code:
1. **Docker Sandboxing** — Ephemeral, hardened containers
2. **AST Guard** — Blocks dangerous Python builtins (`eval`, `exec`, `__import__`)
3. **Network Policy** — Domain whitelisting via iptables
4. **Recursion Guard** — Prevents infinite agent loops (hard limit: 3 levels)
5. **Storage Quotas** — Per-user disk limits, blocks expensive dependencies

### 💰 Budget Control
Deterministic limits on AI spending:
- **Per-Agent Caps** — Set monthly spend limits per agent
- **Human Approval Gates** — Sensitive actions (shell commands, file deletion, email) require manual approval
- **Token Grant System** — Pre-allocate budgets before execution
- **Escrow System** — High-complexity tasks lock funds at start
- **Input Limiter** — Auto-truncates at 8,000 tokens with smart summarization

### 🌍 Universal Agent Platform
Import and run agents in **ANY** format natively:
- **Markdown (.md)** — Traditional prompt-based agents
- **Python (.py)** — Complex agents with custom logic (MetaGPT/CrewAI style)
- **YAML/JSON** — Configuration-driven agents (LangChain/AutoGen style)
- **GitHub Import** — Paste any repo URL to auto-discover and import agent packs

### 📤 Rich Output Viewer
Three viewing modes for workflow results:
- **Document Tab** — Rendered markdown with copy-to-clipboard and download
- **Files Tab** — VS Code-style file tree with syntax coloring
- **Preview Tab** — Live HTML rendering in iframe with "Open in tab" button

### 🧠 186+ Specialist Agents
Pre-built agents organized by category:

| Category | Examples |
|---|---|
| **Engineering** | Code Reviewer, Test Analyzer, Security Engineer, Frontend Developer, DevOps Automator |
| **Design** | UI Designer, Visual Storyteller, UX Researcher, Brand Identity Guardian |
| **Marketing** | Content Creator, SEO Specialist, Social Media Manager |
| **Product** | Product Manager, Trend Researcher, Business Analyst |
| **Support** | Analytics Reporter, Customer Support Specialist |
| **Game Dev** | Narrative Designer, Level Designer |
| **Academic** | Historical Analyst, Cultural Anthropologist, Human Geographer |

---

## 🏗️ Architecture

Ensemble operates on a **3-Layer Architecture**:

```
┌─────────────────────────────────────────────────┐
│  Layer 1: Directive (The DNA)                   │
│  SOP YAML files define Finite State Machines    │
│  Roles, transitions, inputs, artifacts          │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  Layer 2: Orchestration (The Brain)             │
│  SOPEngine & ManagedAgent                       │
│  Intelligent routing, budget management         │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  Layer 3: Execution (The Tools)                 │
│  Python scripts for API calls, file ops, etc.   │
│  Every action intercepted by AuditLogger        │
└─────────────────────────────────────────────────┘
```

### Key Design Principles

- **CAS (Content-Addressable Storage)** — Every deliverable is immutable and versioned
- **Handover Protocol** — Max 500-token summaries between agents to avoid "Context Cliff"
- **Audit Sidecar** — Every action written to SQLite before execution ("Black Box" logging)
- **Token Grants** — Budget-managed execution prevents runaway costs

---

## 🗂️ File Structure

```
Ensemble/
├── core/                          # Backend engine
│   ├── security/                  # 🛡️ 5-layer security (AST, Network, Sandbox)
│   ├── cost_control/              # 💰 Budget, timeout, input limiter
│   ├── parsers/                   # 🌍 Multi-format parsers (MD, PY, YAML, JSON)
│   ├── runners/                   # 🚀 Native runners for each format
│   ├── governance.py              # FastAPI server + governance API
│   ├── dag_engine.py              # DAG workflow executor
│   ├── managed_agent.py           # Agent lifecycle manager
│   ├── llm_provider.py            # Multi-provider LLM (Gemini, Ollama, OpenAI)
│   ├── skill_registry.py          # 186+ specialist agent registry
│   ├── universal_importer.py      # GitHub repo importer
│   └── ensemble_space.py          # Content-Addressable Storage (CAS)
├── ui/                            # Frontend (React + Tauri)
│   ├── src/
│   │   ├── pages/                 # Dashboard, Workflows, Editor, Chat, etc.
│   │   ├── components/workflow/   # Execution panel, output viewer
│   │   └── lib/                   # API client, workflow generator
│   └── src-tauri/                 # Tauri desktop config
├── skills/                        # 186+ agent skill markdown files
├── directives/                    # SOP YAML workflow definitions
├── execution/                     # Deterministic Python tool scripts
├── schema/                        # Database schemas (Supabase)
└── docs/                          # Quick start, self-hosting guides
```

---

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- Rust & Cargo (for Tauri desktop app)
- Gemini API key (free from [Google AI Studio](https://aistudio.google.com/)) or Ollama for local LLMs

### Option 1: Browser (Development)
```bash
# Terminal 1 — Backend
pip install -r requirements.txt
uvicorn core.governance:app --reload --port 8088

# Terminal 2 — Frontend
cd ui && npm install && npm run dev
# Open http://localhost:8080 in your browser
```

### Option 2: Desktop App (Production)
```bash
# Terminal 1 — Backend
uvicorn core.governance:app --reload --port 8088

# Terminal 2 — Desktop App
cd ui && npm run tauri dev
```

### Option 3: Docker (Full Stack)
```bash
docker-compose up -d
# Backend: http://localhost:8088
# Frontend: http://localhost:8080
```

See [LOCAL_RUN.md](LOCAL_RUN.md) for detailed setup instructions.

---

## ⚙️ Configuration

| Variable | Purpose | Default |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini API key | *your key* |
| `LLM_PROVIDER` | LLM backend (`gemini` or `ollama`) | `gemini` |
| `OLLAMA_MODEL` | Local model name | `llama3.1:8b` |
| `APPROVAL_COST_THRESHOLD` | Dollar amount triggering human approval | `1.0` |
| `APPROVAL_TIMEOUT_SECONDS` | How long to wait for human approval | `300` |

**Web Search:** DuckDuckGo is used by default — no API key needed.

---

## 📚 Documentation

- [📖 Complete Documentation](DOCUMENTATION.md) — Full feature guide and API reference
- [🚀 Quick Start Guide](docs/quick-start.md) — 5-minute setup tutorial
- [🏠 Self-Hosting Guide](docs/self-hosting.md) — Docker deployment guide
- [💻 Local Run Instructions](LOCAL_RUN.md) — Development environment setup

---

## 🤝 Contributing

Ensemble is built for the era of autonomous work. We welcome contributions!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <strong>Be autonomous. Be auditable. Be Ensemble.</strong> 🎼
</p>
