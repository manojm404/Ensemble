# Ensemble – V1 Blueprint
## Unified Autonomous AI Company Platform
Built on agency-agents · Inspired by AutoGPT, MetaGPT, Cherry Studio, Paperclip

**Version:** 1.0  
**Status:** Completed

---

## Table of Contents
1. [Vision & Philosophy](#vision--philosophy)
2. [Layered Architecture](#layered-architecture)
   - [Layer 0: Core Agent Engine](#layer-0-core-agent-engine)
   - [Layer 1: Role & Workflow Orchestration](#layer-1-role--workflow-orchestration)
   - [Layer 2: Governance & Company Management](#layer-2-governance--company-management)
   - [Layer 3: User Interface](#layer-3-user-interface)
   - [Layer 4: Integration & Extras](#layer-4-integration--extras)
3. [Edge Cases & Nightmare Scenarios](#edge-cases--nightmare-scenarios)
4. [SOP YAML Schema (v1.0)](#sop-yaml-schema-v10)
5. [Artifact CAS & Handover Protocol](#artifact-cas--handover-protocol)
6. [Context Pruning Logic](#context-pruning-logic)
7. [Governance Dashboard Specification](#governance-dashboard-specification)
8. [Technical Stack](#technical-stack)
9. [Phased Roadmap](#phased-roadmap)
10. [Open Questions (Resolved)](#open-questions-resolved)
11. [Next Steps](#next-steps)
12. [Appendix A: Governance Dashboard ASCII Mockup](#appendix-a-governance-dashboard-ascii-mockup)

---

## Vision & Philosophy
Ensemble is a complete operating system for running autonomous AI‑driven companies. It combines:

- **Lightweight, hackable agent core** – agency-agents  
- **Role‑based software team workflows** – MetaGPT  
- **Governance, budgeting, and multi‑company management** – Paperclip  
- **Beautiful cross‑platform desktop UI with chat and visual builder** – Cherry Studio + AutoGPT  
- **Integration extras** – plugins, dry‑run, importers, no‑code  

*Excluded:* Benchmarking (agbenchmark) – not needed for V1.

---

## Layered Architecture

| Layer | Name | Primary Source | Key Features |
|-------|------|----------------|--------------|
| 0 | Core Agent Engine | agency-agents | Agent class, Space, tool decorator, planners, memory, LLM abstraction, streaming, async |
| 1 | Role & Workflow Orchestration | MetaGPT | Role‑based agents, SOPs (FSM), artifact passing, actions, shared environment |
| 2 | Governance & Company Management | Paperclip | Org charts, budgets, audit logs, approvals, heartbeat, BYO agent, multi‑company |
| 3 | User Interface | Cherry Studio + AutoGPT | Desktop app (Tauri), chat UI, visual block builder, RAG, prompt library, local models, marketplace, real‑time monitoring, Telegram bot |
| 4 | Integration & Extras | AutoGPT & others | Plugin system, dry‑run, agent folders, import from n8n/Make/Zapier, no‑code MGX, mobile dashboard |

### Layer 0: Core Agent Engine (agency-agents)
**What we take unchanged:**

- **Agent class** – system prompt, tools, memory, `run()`/`arun()`
- **Space** – shared message bus and global memory (for agent‑agent comms)
- **Tool decorator** – auto‑generates OpenAI function‑calling schema
- **Pluggable planners** – ReAct, ZeroShot, TreeOfThoughts
- **Memory** – ConversationBufferMemory, VectorMemory (Chroma)
- **LLM abstraction** – OpenAI, Anthropic, Groq, local endpoints
- **Streaming & async**
- **Observability logging**

**Extensions (via ManagedAgent wrapper):**
- Budget & audit hooks – every action requests a token grant
- Max steps, timeouts, cost limits – enforced by governance
- State serialisation – for pause/resume and recovery

### Layer 1: Role & Workflow Orchestration (MetaGPT)
**Key components:**
- **Role‑based agents** – factory function `create_role_agent(role_name, tools, memory)`
- **SOP Engine** – finite state machine (FSM) defined in YAML (see schema below)
- **Artifact‑driven transitions** – states change when a required artifact appears in the Space
- **Shared virtual file system** – content‑addressable storage (CAS) with immutable versions
- **Actions** – reusable atomic tasks (e.g., WritePRD, WriteCode) implemented as tools

**Handover protocol:**
Each state writes a `handover_summary.md` – a short (≤500 token) summary of decisions, trade‑offs, and open questions. The next state reads this summary first, then the required artifacts.

### Layer 2: Governance & Company Management (Paperclip)
**Organisational framework:**
- Org charts, roles (CEO, CTO, etc.), reporting lines
- Hierarchical goal alignment – every task ties to company mission
- Per‑agent budgeting – monthly limits, real‑time cost tracking
- Immutable audit log – every action, tool call, approval stored
- Approval workflows – human or supervisor agent
- Heartbeat orchestration – monitor agents (every 30s); mark MIA after 3 missed
- BYO agent support – external agents register via OpenAPI
- Multi‑company isolation – single database with `company_id` foreign key

**Budget enforcement:**
- Soft warning at 80%, hard stop at 100%
- Escrow for tasks – funds locked at start, released on completion
- Budget cascade – child agents spend from parent’s budget

**Recursive sprawl prevention:**
- Max depth: 3 (configurable per SOP)
- Max concurrency: 10 heartbeats per company (default)
- Parent budget shared with children

### Layer 3: User Interface (Cherry Studio + AutoGPT)
**Desktop app (Tauri + React):**
- **Chat mode** – multi‑model side‑by‑side, threaded conversations, markdown, tool calling panel, RAG UI
- **Studio mode** – visual block builder (React Flow) for drag‑drop SOP design
- **Local model inference** – built‑in llama.cpp (GGUF downloads from Hugging Face)
- **Knowledge base** – LanceDB for embedded RAG
- **Prompt library** – save, version, template prompts
- **Marketplace** – GitHub‑based registry of agents/blocks
- **Real‑time monitoring** – WebSocket streaming of agent thoughts and logs
- **Scheduler UI** – cron/interval tasks
- **Telegram bot** – separate microservice
- **Governance Dashboard (Mission Control)** – see full spec below

### Layer 4: Integration & Extras (AutoGPT & others)
- **Plugin system** – Python packages with `ensemble.tools` entry point; loaded via importlib
- **Dry‑run mode** – mocks LLM and tools; logs only
- **Agent folders** – organise agents in UI
- **Import from n8n, Make, Zapier** – JSON → SOP YAML translators (CLI or UI)
- **No‑code MGX** – natural language → SOP YAML using LLM
- **Mobile dashboard** – PWA (same React code)

---

## Edge Cases & Nightmare Scenarios

| Nightmare | Ensemble Fix |
|-----------|--------------|
| **Hallucination loop** | Semantic similarity check on last 3 outputs; if >90% similar, inject “You seem stuck” message and escalate. Also detect repeated identical tool calls. |
| **Budget midnight** | Escrow – task locks budget on start; release only on completion/cancellation. No midnight release. |
| **Ghost agent (BYO crash)** | Heartbeat (30s). After 3 misses, mark MIA; CEO agent reassigns task. Log heartbeat failures. |
| **Recursive sprawl (agent Ponzi)** | Max depth (3), max concurrency (10), budget cascade (child spends parent’s budget). |
| **Context cliff** | Explicit include/exclude in YAML + automatic summarisation of long artifacts (local Llama 3). |

---

## SOP YAML Schema (v1.0)
```yaml
name: "Standard Web Feature Development"
version: "1.0.0"
description: "From natural language requirement to tested PR"

governance:
  max_depth: 2
  default_step_timeout: 300s
  require_approval_on:
    - "deployment"
    - "budget_increase"

roles:
  product_manager:
    agent_config: "roles/pm_gpt4.yaml"
    tools: ["web_search", "file_writer"]
  architect:
    agent_config: "roles/arch_claude.yaml"
    tools: ["diagram_gen", "file_reader"]
  engineer:
    agent_config: "roles/eng_local.yaml"
    tools: ["python_interpreter", "shell_cmd"]

workflow:
  initial_state: "Discovery"
  states:
    Discovery:
      role: product_manager
      instruction: "Analyze user request and produce a PRD."
      output_artifacts:
        - name: "requirement.md"
        - name: "handover_summary.md"
      on_failure:
        max_retries: 2
        fallback_state: "HumanHelp"
      transitions:
        - if_exists: "artifacts/docs/requirement.md"
          next_state: "Architecture"

    Architecture:
      role: architect
      instruction: "Design the system based on requirement.md and handover_summary.md."
      input_artifacts:
        include: ["requirement.md", "handover_summary.md"]
        exclude: []
      output_artifacts:
        - name: "api_spec.json"
        - name: "handover_summary.md"
      transitions:
        - if_exists: "artifacts/specs/api_spec.json"
          next_state: "Implementation"

    Implementation:
      role: engineer
      instruction: "Write the code according to api_spec.json."
      input_artifacts:
        include: ["api_spec.json", "handover_summary.md"]
        exclude: ["requirement.md"]
      breakpoint_after: true
      output_artifacts:
        - name: "source_code"
          path: "artifacts/src/"
      transitions:
        - if_exists: "artifacts/src/main.py"
          next_state: "Completed"

    Completed:
      type: "end"
      message: "Feature developed and ready for review."
```

---

## Artifact CAS & Handover Protocol
### CAS Basics
- Each artifact stored as `sha256(content)` – immutable.
- Space maintains a manifest: `(symbolic_name, hash, state, timestamp)`.
- Symbolic names (e.g., `requirement.md`) point to latest hash.

### Handover Summary Generation
- Outgoing agent writes `handover_summary.md` at state completion.
- Summary contains: key decisions, trade‑offs, open questions, warnings.
- Stored as regular artifact; next state reads it first.

### Transition Logic
- `if_exists` triggers when symbolic name points to a new hash created after state start.
- Next agent receives both requested input artifacts and the handover summary.

### Failure Recovery
- On crash, system loads last committed artifact for the state.
- Resumes by reloading agent’s pickled memory (if saved) and re‑sending input artifacts.

### Agent API for CAS
```python
space.read(symbolic_name: str) -> bytes
space.write(content: bytes, symbolic_name: str) -> str  # returns hash
space.list_artifacts(state_name: str) -> List[str]
```

---

## Context Pruning Logic
Two mechanisms:
1. **Explicit include/exclude** in SOP YAML (see `input_artifacts` in schema)
2. **Automatic summarisation pruning** – any artifact longer than 8000 tokens is summarised by a local Llama 3 8B model. The summary replaces the full artifact in the LLM context; the original remains in CAS.

**Result:** The agent receives exactly the information it needs, never exceeding context limits.

---

## Governance Dashboard Specification
The dashboard is part of the Tauri desktop app (Studio mode). It provides five views:

### 1. Company Health Command Center
- **Burn rate monitor** – gauge showing escrowed, spent, remaining budget.
- **Active agent map** – tree diagram (org chart) with status icons: 🟢 (thinking), 🔄 (executing tool), ⚪ (idle), ⚫ (MIA). Depth indicator warns when approaching `max_depth`.

### 2. SOP Run Inspector (FSM View)
- **State ribbon** – horizontal flow of states (Discovery → Architecture → …).
- **Active state card** – role, current instruction, inner monologue (filtered stream from agent).
- **Artifact sidecar** – file browser showing CAS symbolic names; click to see version history and SHA‑256.

### 3. Handover Spotlight
- Displayed between state transitions.
- Shows the handover summary (3‑paragraph max) written by the outgoing agent.

### 4. Breakpoint & HITL Center
- **Pending approvals** – flashing list. Each shows action, agent, and buttons: Approve, Deny, Edit Command.
- **Global kill switch** – “Freeze All” serialises all agents to DB and severs LLM connections.

### 5. Forensic Audit Log
- Searchable, filterable table: `Timestamp | Agent | Action | Result | Cost | CAS Hash`.
- **Replay button** – shows the exact prompt + system message + tools at that moment.

*ASCII mockup (as previously shared) – see Appendix A.*

---

## Technical Stack
| Component | Choice | Reason |
|-----------|--------|--------|
| Backend | Python 3.11+ | Native for agency-agents and ML libs |
| Frontend | Tauri + React | Desktop native, small binary, Rust security |
| Inter‑process | WebSockets + tRPC | Real‑time streaming + typed API |
| Database | PostgreSQL + pgvector | Audit logs, RAG, pg_cron for scheduling |
| Task queue | Redis / BullMQ | Heartbeats, background jobs |
| Vector DB (local) | LanceDB | Embedded, no extra service |
| Local inference | llama.cpp (Rust bindings) | Embedded in Tauri backend |
| Object storage | Local filesystem (CAS) | S3 optional for cloud |

---

## Phased Roadmap
### Phase 1 (MVP – 4 weeks)
- agency-agents + ManagedAgent wrapper
- Basic governance: budget tracking, audit log (SQLite)
- CLI only – single agent, single company

### Phase 2 (Desktop UI – 6 weeks)
- Tauri app with Chat mode (Cherry‑style)
- RAG UI (LanceDB), local model inference
- Basic agent management

### Phase 3 (Visual Builder & SOPs – 8 weeks)
- React Flow block builder
- SOP engine (YAML + FSM executor)
- Marketplace (GitHub registry)

### Phase 4 (Governance & Extras – 6 weeks)
- Multi‑company, org charts, approvals, heartbeat
- BYO agent support, importers, dry‑run, plugins

### Phase 5 (Polish & Scale – ongoing)
- Mobile PWA, Telegram bot, no‑code MGX
- Performance tuning, sandboxing, cloud deployment

---

## Open Questions (Resolved)
| Question | Resolution |
|----------|------------|
| Should we extend Agent for budgeting? | Yes – via ManagedAgent wrapper with hooks. |
| How to handle infinite loops? | Max steps, timeouts, cost limits, semantic similarity detection. |
| SOP definition – hardcoded or YAML? | YAML + visual builder (both). |
| Artifact passing – full chat or summary? | Handover summary (Option C). |
| Local vs cloud LLM? | Hybrid – per‑role configuration. |
| Multi‑company isolation? | Single DB with `company_id`. |
| Budget enforcement – soft or hard? | Hard stop at limit, escrow for tasks. |
| BYO agent heartbeat interval? | 30s, 3 misses → MIA. |
| Context pruning? | Include/exclude + automatic summarisation. |

---

## Next Steps
1. Review this document – confirm no missing sections.
2. Begin Phase 1 – set up agency-agents, implement ManagedAgent, basic audit.
3. Use this document as the single source of truth – no changes without updating the blueprint.

---

## Appendix A: Governance Dashboard ASCII Mockup
```
________________________________________________________________________________
| [ ENSEMBLE ]  Company: AlphaCorp   |  Budget: $42.50 / $100.00 [|||||     ] |
|____________________________________|_________________________________________|
|  ORG CHART         |  SOP RUN: "Feature_Web_Login" (Active)                  |
|                    |  [Discovery] -- [Architecture] -- {Implementation}      |
|  (CEO)             |_________________________________________________________|
|   |-- (PM)         |  AGENT: Engineer_Local (Llama-3)                        |
|   |   |-- (ENG)* |  THOUGHT: "Implementing JWT logic. Need local storage." |
|                    |  ACTION: write_file("auth.py")                          |
|____________________|_________________________________________________________|
|  PENDING APPROVALS |  ARTIFACTS (CAS)                  |  HANDOVER SUMMARY   |
|                    |  > requirement.md (v2) [3a2b..]   | "PM finalized docs. |
| [!] Eng: sudo pip  |  > api_spec.json  (v1) [ff91..]   | Architecture focuses|
|     install flask  |  > auth.py        (v1) [4c2e..]   | on security first." |
|____________________|___________________________________|_____________________|
```
--- 
*End of Ensemble V1 Blueprint*
