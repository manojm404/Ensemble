# 📖 Ensemble — Complete Documentation

> **Build, orchestrate, and govern teams of AI agents with a no-code visual studio, local LLMs, and human-in-the-loop controls.**

---

## 🏢 What is Ensemble?

**Ensemble** is a desktop application and backend platform that lets you architect entire **Specialized AI Departments** — groups of AI agents that collaborate to solve complex business objectives. Instead of managing a single chatbot, you build multi-agent workflows with drag-and-drop, monitor their execution in real-time, and enforce budget controls with human approval checkpoints.

### 🎯 Core Philosophy

> **Code = SOP (Team)** — Every workflow is a Standard Operating Procedure executed by a team of agents. Each agent has a specific role, and together they accomplish complex tasks that no single agent could handle alone.

---

## 🏗️ Architecture

Ensemble operates on a **3-Layer Architecture**:

### Layer 1: Directive (The DNA)
- **Component:** SOP YAML files / `directives/`
- **Purpose:** Define Standard Operating Procedures as Finite State Machines (FSM)
- **Function:** Roles, state transitions, required inputs, and expected artifacts

### Layer 2: Orchestration (The Brain)
- **Component:** `SOPEngine` & `ManagedAgent`
- **Purpose:** Intelligent routing and decision-making
- **Function:** Reads SOPs, manages budgets (Token Grants), communicates via EnsembleSpace

### Layer 3: Execution (The Tools)
- **Component:** Python scripts in `execution/` and `core/tools/`
- **Purpose:** Deterministic doing — API calls, file operations, data processing
- **Function:** Every execution is intercepted by the AuditLogger for transparency

---

## ✨ Working Features

### 1. 🏠 Personal Dashboard
**What it does:** The central hub showing real-time system status.

| Section | Data Source | Status |
|---|---|---|
| **Stats Cards** (Active Workflows, Agents Running, Tokens Today, Monthly Cost) | Real backend queries (`/api/dashboard/stats`) | ✅ Working |
| **Live Pipelines** | Execution table (`/api/dashboard/pipeline-status`) | ✅ Working |
| **Recent Activity Feed** | Audit events from SQLite (`/api/dashboard/activity`) | ✅ Working |
| **Top Agents Leaderboard** | Agent performance stats (`/api/dashboard/agent-stats`) | ✅ Working |
| **Token Usage Chart** (7-day bar chart) | Historical event data (`/api/dashboard/token-usage`) | ✅ Working |
| **Recent Workflows Table** | Workflows + executions join (`/api/dashboard/workflows`) | ✅ Working |

**Smart behavior:**
- Auto-refreshes every 30 seconds
- Shows professional empty states when no data exists
- Loading skeletons during data fetch
- Trend indicators (up/down arrows with color coding)

---

### 2. 🎨 Visual Workflow Canvas (Workflow Studio)
**What it does:** A React Flow-powered drag-and-drop canvas for building multi-agent workflows.

#### Features:
- **Add Agents** — Choose from 186+ pre-built specialist agents (code reviewer, architect, PM, etc.)
- **Connect Nodes** — Draw directed edges between agents to define execution order
- **Node Inspector** — Click any node to edit its model, temperature, and prompt
- **Save/Load** — Persist workflows to SQLite database
- **Delete Nodes** — Remove agents with one click (red ✕ button on hover)
- **Auto-layout** — Nodes are positioned intelligently on the canvas

#### AI Workflow Generator ("AI Generate"):
- **How it works:** Describe what you need in natural language → the system generates a complete workflow graph
- **Fallback:** If the LLM generation fails, it falls back to keyword matching with 186+ agent templates
- **Auto-execution:** After generation, the execution panel opens with your prompt pre-filled

---

### 3. ▶️ Workflow Execution Engine
**What it does:** Runs multi-agent DAGs (Directed Acyclic Graphs) sequentially through the backend.

#### How execution works:
1. **User types task** → Clicks "Run Workflow"
2. **Auto-save** → The workflow graph is saved to the database and gets a real ID
3. **Backend execution** → `DAGWorkflowEngine` processes each node in topological order
4. **Agent creation** → Each node spawns a `ManagedAgent` with its role-specific skill file
5. **LLM calls** → Agents execute their tasks via Gemini (or local Ollama)
6. **Artifacts** → Output, code blocks, and handover summaries are committed to CAS storage
7. **Results** → Markdown output + extracted files (HTML, CSS, JS, etc.) returned to frontend

#### Execution Panel States:
| State | Description |
|---|---|
| **Input** | User enters task description, optionally attaches files |
| **Running** | Agent step tracker shows each agent's progress in real-time |
| **Complete** | Shows markdown output, generated files, and live HTML preview |

---

### 4. 📊 Workflow List Page
**What it does:** Gallery view of all saved workflows with status indicators.

| Feature | Description | Status |
|---|---|---|
| **Correct Agent Count** | Parses `graph_json` to count actual nodes per workflow | ✅ Working |
| **Re-run Button** | ↻ icon — opens workflow editor with execution panel ready | ✅ Working |
| **Delete Button** | 🗑️ icon — removes workflow from database (with toast confirmation) | ✅ Working |
| **Green Glow** | Border ring + shadow for workflows with successful output | ✅ Working |
| **Red Glow** | Border ring + shadow for failed workflows | ✅ Working |
| **Status Badges** | "✓ Completed" or "✗ Failed" shown alongside agent count | ✅ Working |
| **Search** | Filter workflows by name | ✅ Working |
| **Uniform Card Size** | All cards are the same height (180px minimum) | ✅ Working |

---

### 5. 💾 Workflow Output Persistence
**What it does:** Workflow results survive tab switches and page refreshes.

#### How it works:
1. **On completion** → Output is saved to `localStorage` under the workflow's real ID
2. **On tab switch** → Execution state (phase, task, output, steps) is persisted
3. **On return** → Panel re-opens with the same state restored
4. **On page refresh** → Output page reloads from `localStorage` fallback

#### What's restored:
- Phase (input / running / complete)
- Original task/prompt
- Markdown output from all agents
- Generated files list
- Step history (agent names and statuses)

---

### 6. 🔍 Web Search Tool (DuckDuckGo)
**What it does:** Agents can search the web for real-time information.

- **Provider:** DuckDuckGo (via `duckduckgo_search` Python library)
- **Cost:** Free, unlimited queries
- **Setup:** No API key required — works out of the box
- **Format:** Returns Title, URL, and Snippet for each result
- **Fallback:** Returns friendly error message if search fails

**Note:** Previously used Google Custom Search API and Tavily, both replaced with DuckDuckGo for simplicity.

---

### 7. 🏛️ Governance System
**What it does:** Enforces budget controls, human approvals, and audit logging.

| Feature | Description |
|---|---|
| **Cost Thresholds** | Configurable cost limits per approval (set in `.env`) |
| **Human Approval** | Sensitive actions (shell commands, file deletion, email, deploy) require manual approval |
| **Budget Tracking** | Per-agent monthly spend tracking with escrow system |
| **Audit Log** | Every action recorded to SQLite with timestamps, costs, and CAS hashes |
| **Panic Button** | Universal abort — snapshots state, kills sessions, generates forensics report |
| **Timeout Monitor** | Approval requests expire after configurable timeout (default: 300s) |

---

### 8. 🗂️ Tab System
**What it does:** Browser-like tab navigation for the entire app.

| Feature | Status |
|---|---|
| Open apps as tabs | ✅ Working |
| Close tabs (non-essential) | ✅ Working |
| Persist tabs across sessions | ✅ Working |
| Tab URL updates (workflow-specific) | ✅ Working — tab shows current workflow name when editing |
| Re-open closed workflow on tab click | ✅ Working — tab navigates to last-opened workflow |

---

### 9. 📁 Skill Registry (186+ Specialist Agents)
**What it does:** A directory of pre-built AI agents organized by category.

| Category | Examples |
|---|---|
| **Engineering** | Code Reviewer, Test Analyzer, Security Engineer, Frontend Developer, DevOps Automator |
| **Design** | UI Designer, Visual Storyteller, UX Researcher |
| **Marketing** | Content Creator, SEO Specialist, Social Media Manager |
| **Product** | Product Manager, Trend Researcher, Business Analyst |
| **Game Dev** | Narrative Designer, Level Designer |
| **Support** | Analytics Reporter, Customer Support Specialist |

Each agent has:
- A markdown skill file with role description and system prompt
- Assigned tools (search_web, read_url, write_artifact, etc.)
- Category and emoji for visual identification

---

### 10. 📤 Output Viewer (3 Tabs)
**What it does:** Displays workflow execution results in three viewing modes.

| Tab | Description |
|---|---|
| **Document** | Rendered markdown with copy-to-clipboard and download buttons |
| **Files** | VS Code-style file tree with expandable folders, content viewer, and per-file download |
| **Preview** | Live HTML rendering in iframe with "Open in tab" button |

**Smart behavior:**
- Auto-selects the best tab based on available output types
- HTML files go to Preview tab, markdown to Document tab
- Non-HTML code files appear in Files tab with syntax coloring

---

### 11. 🔐 Security & Privacy
**What it does:** Keep your data on-premises with no vendor lock-in.

| Feature | Details |
|---|---|
| **Local LLMs** | Supports Ollama (qwen, llama3, mistral, etc.) for 100% offline operation |
| **Cloud LLMs** | Google Gemini (configurable model via `.env`) |
| **Data Storage** | SQLite databases — no cloud dependencies |
| **No Telemetry** | Zero external tracking or analytics |
| **File Sandboxing** | All file operations restricted to `data/workspace/` directory |
| **CSP Protection** | Content Security Policy headers prevent unauthorized external connections |

---

## 🗃️ File Structure

```
Ensemble/
├── core/                          # Backend engine
│   ├── governance.py              # FastAPI server + governance logic (2300+ lines)
│   ├── dag_engine.py              # DAG workflow execution engine (850+ lines)
│   ├── managed_agent.py           # Agent lifecycle and LLM routing
│   ├── llm_provider.py            # Multi-provider LLM abstraction
│   ├── skill_registry.py          # 186+ specialist agent registry
│   ├── tools/__init__.py          # Agent tools (search, file I/O, etc.)
│   ├── ws_manager.py              # WebSocket connection management
│   ├── audit.py                   # Forensic audit logging
│   └── ensemble_space.py          # Content-Addressable Storage (CAS)
├── ui/                            # Frontend (React + Tauri)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Index.tsx          # Personal Dashboard
│   │   │   ├── Workflows.tsx      # Workflow list/gallery
│   │   │   ├── WorkflowEditor.tsx # Visual canvas (React Flow)
│   │   │   ├── WorkflowOutput.tsx # Full-width output viewer
│   │   │   └── OrgReports.tsx     # Reports & Analytics
│   │   ├── components/workflow/
│   │   │   ├── WorkflowExecutionPanel.tsx  # Run panel with step tracker
│   │   │   ├── OutputViewer.tsx   # Document/Files/Preview tabs
│   │   │   ├── MagicWandDialog.tsx # AI generation dialog
│   │   │   └── AgentStepTracker.tsx # Vertical timeline
│   │   └── lib/
│   │       ├── api.ts             # API client (fetch wrapper)
│   │       ├── workflow-generator.ts # AI→workflow logic
│   │       ├── workflow-output-context.tsx # Output persistence
│   │       └── tab-context.tsx    # Tab management system
│   └── src-tauri/                 # Tauri desktop config
├── skills/                        # Agent skill markdown files (186+)
├── directives/                    # SOP YAML definitions
├── execution/                     # Deterministic Python tool scripts
├── data/                          # Runtime data (git-ignored)
├── deliverables/                  # Generated artifacts
└── .env                           # Configuration (git-ignored)
```

---

## 🚀 How to Run

### Prerequisites
- Python 3.11+
- Node.js 18+
- Rust & Cargo (for Tauri desktop app)
- Gemini API key (free from [Google AI Studio](https://aistudio.google.com/))

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

---

## ⚙️ Configuration (`.env`)

| Variable | Purpose | Default |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini API key (required for cloud LLM) | *your key* |
| `GEMINI_MODEL` | Gemini model to use | `gemini-2.5-flash` |
| `LLM_PROVIDER` | LLM backend (`gemini` or `ollama`) | `gemini` |
| `OLLAMA_MODEL` | Local model name (when provider=ollama) | `qwen2.5:1.5b` |
| `OLLAMA_BASE_URL` | Ollama server URL | `http://localhost:11434/v1` |
| `APPROVAL_COST_THRESHOLD` | Dollar amount triggering human approval | `1.0` |
| `APPROVAL_TOOLS` | Comma-separated tools requiring approval | `shell_cmd,python_interpreter,...` |
| `APPROVAL_TIMEOUT_SECONDS` | How long to wait for human approval | `300` |

**Web Search:** DuckDuckGo is used by default — no API key needed.

---

## 📊 Database Schema

### `ensemble_governance.db` (SQLite)
| Table | Purpose |
|---|---|
| `workflows` | Saved workflow graphs (JSON) |
| `executions` | Workflow run history with status |
| `node_executions` | Per-node execution status |
| `budgets` | Per-agent spending limits and tracking |
| `agents` | Agent hierarchy and org chart |
| `pending_approvals` | Human approval queue |
| `chat_topics` / `chat_messages` | Chat conversation history |
| `custom_agents` | User-defined agent definitions |

### `ensemble_audit.db` (SQLite)
| Table | Purpose |
|---|---|
| `events` | Forensic audit log (every action, cost, and artifact hash) |

---

## 🔑 API Endpoints (Backend)

### Dashboard
| Endpoint | Purpose |
|---|---|
| `GET /api/dashboard/stats` | Real-time stats (workflows, agents, tokens, costs) |
| `GET /api/dashboard/workflows` | Recent workflows with run counts |
| `GET /api/dashboard/activity` | Recent audit events |
| `GET /api/dashboard/token-usage` | 7-day token usage data |
| `GET /api/dashboard/agent-stats` | Agent leaderboard |
| `GET /api/dashboard/pipeline-status` | Live pipeline statuses |

### Workflows
| Endpoint | Purpose |
|---|---|
| `GET /api/workflows` | List all workflows |
| `GET /api/workflows/{id}` | Get workflow by ID |
| `POST /api/workflows` | Create/update workflow |
| `DELETE /api/workflows/{id}` | Delete workflow |
| `POST /api/workflows/run` | Execute a workflow DAG |
| `POST /api/workflows/generate` | AI-generate workflow from prompt |
| `GET /api/workflows/{id}/artifacts` | List generated files |
| `GET /api/workflows/{id}/preview` | Get HTML preview |

### Agents & Skills
| Endpoint | Purpose |
|---|---|
| `GET /skills` | List all 186+ specialist agents |
| `GET /api/agents/stats` | Agent usage statistics |

### Chat
| Endpoint | Purpose |
|---|---|
| `GET /api/chat/topics` | List chat conversations |
| `POST /api/chat/topics` | Create new chat topic |
| `POST /api/chat/generate` | Generate LLM response |
| `DELETE /api/chat/topics/{id}` | Delete conversation |

### Governance
| Endpoint | Purpose |
|---|---|
| `GET /governance/pending` | List pending human approvals |
| `POST /governance/decision/{id}` | Submit approval decision |
| `GET /governance/config` | Get governance settings |
| `POST /governance/config` | Update governance settings |

---

## 🛡️ Security

- **No secrets in source code** — All API keys in `.env` (git-ignored)
- **File sandboxing** — All reads/writes restricted to `data/workspace/`
- **Path traversal protection** — Absolute path validation on file operations
- **CORS configured** — Allows local frontend, blocks external requests
- **Audit trail** — Every action logged with timestamp, agent, and cost

---

## 📝 Glossary

| Term | Definition |
|---|---|
| **SOP** | Standard Operating Procedure — a multi-agent workflow definition |
| **DAG** | Directed Acyclic Graph — the mathematical structure of workflows |
| **CAS** | Content-Addressable Storage — immutable, versioned artifact storage |
| **ManagedAgent** | A single AI agent with a specific role and skill file |
| **Handover Summary** | Condensed context passed between agents in a workflow |
| **Governance** | The system of budget controls and human approvals |
| **Tauri** | Framework for building desktop apps with web technologies |
| **React Flow** | Library for building node-based visual editors |

---

*Last updated: April 2026 — Ensemble v1.5 Milestone*
