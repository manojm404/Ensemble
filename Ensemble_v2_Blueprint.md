# Ensemble v2 Blueprint: Visual Agentic OS (Final – 100% Shippable)

## 1. Vision Statement
Ensemble v2 is a platform where users assemble teams of AI agents (like a digital staff) and run them visually. The user provides intent and oversight; the platform handles execution, governance, and real‑time visibility.

### Key shifts from v1:
- **Interaction**: From “chatbot” to visual agent orchestration.
- **Trigger**: From “run on command” to run on trigger (cron, webhook – v2.0/v2.1).
- **Interface**: From “text logs” to split‑view: Chat (conversation) + Viewer (clean artifacts).
- **Resilience**: From “no recovery” to resume from failure with state persistence.

## 2. Core Concepts (Glossary)
| Term | Definition |
|------|------------|
| **Agent** | A configured AI worker with a role, system prompt, capabilities, and optional schedule. |
| **Workflow** | A directed acyclic graph (DAG) of agents connected on the canvas. |
| **Trigger** | What starts a workflow: user message, cron schedule, or (v2.1) webhook. |
| **Artifact** | Any output from an agent (HTML, JSON, Markdown, image, etc.) stored immutably. |
| **Viewer Pane** | Read‑only panel showing the artifact of the currently selected agent. |
| **Daemon** | A background agent that runs on a cron schedule (e.g., every 5 minutes). |
| **Time Machine** | Step‑based scrub bar that lets users rewind to any past execution snapshot. |
| **Governance** | Budget caps, rate limits, approval queues, heartbeat monitoring, and global panic button. |

## 3. User Interface (v2.0 Minimum)

### 3.1 Main Layout
- **Left sidebar**: Agent Library (pre‑built roles + custom agent creator).
- **Center**: Canvas (React Flow) – shows the current workflow graph.
- **Right side**: Split view – Chat (bottom‑left), Viewer Pane (right panel).
- **Global Panic Button**: Red, prominent button in sidebar to stop all executions and disable schedules.

### 3.2 Canvas Features (v2.0)
Display agents as nodes with:
- Agent name & Status icon (idle, running, done, error, paused).
- “View output” button (opens Viewer Pane).
- Topological connectivity (simple success flow edges).
- Free node positioning.

### 3.3 Chat + Viewer Pane
- **Chat**: User messages, agent summaries, approval requests, system notifications.
- **Viewer Pane Tabs**: Preview (sandboxed iframe), Document (Markdown), Data (JSON/Table), Logs.
- **Developer Mode Toggle**:
    - **ON**: Shows "Neural Process" logs (thoughts, raw tool calls) in both chat and Viewer.
    - **OFF**: Shows only clean artifacts and user summaries.

### 3.4 Timeline & Time Machine
- **Timeline Panel**: Chronological list of agent executions.
- **Time Machine (Step-based)**:
    - A scrub bar with ticks at every artifact commit.
    - Ticks rewind the canvas and viewer to that exact execution snapshot.

### 3.5 Daemon Management UI
- Mark agents as "Daemon".
- Cron schedule input (e.g., `*/5 * * * *`).
- **Dry-run mode**: First 5 executions require manual approval before becoming autonomous.

## 4. Workflow Engine (Backend)

### 4.1 Workflow States
```python
class WorkflowState(Enum):
    IDLE = "idle"
    RUNNING = "running"
    PAUSED_FOR_APPROVAL = "paused_approval"
    COMPLETED = "completed"
    FAILED = "failed"
```

### 4.2 Execution Flow
1. **Mutex Lock**: Acquire lock for workflow ID to prevent overlapping runs.
2. **Topological Sort**: Determine execution order from canvas graph.
3. **Agent Node Cycle**:
   - Check budget/rate limits.
   - **Prism Filter**: Inject only previous agent’s output artifact + handover summary (no raw chat).
   - Commit artifact to CAS (Content-Addressable Store).
   - If approval required -> PAUSE and notify.

### 4.3 Resume from Failure
- Users can choose to resume from a failed node.
- Engine pulls the last successful artifact from CAS and injects it as input.
- No re-execution of earlier nodes (token/time efficiency).

## 5. Data Models (SQLite / PostgreSQL)
- **Agents**: configuration, role prompts, capabilities, cron settings.
- **Workflows**: stored as graph_json (nodes & edges).
- **Executions**: trigger types, status, timing, last successful node.
- **Artifacts**: immutable outputs linked to execution and agent.
- **Snapshots**: execution snapshots for Time Machine playback.

## 6. Security & Governance
- **Viewer Pane Sandbox**: Iframe with `sandbox` attribute; no parent access.
- **Budget Enforcement**: Real-time deduction for LLM and tool calls.
- **Global Panic Button**: Sets all running tasks to FAILED and disables all cron schedules (persists across restarts).

## 7. Implementation Roadmap

### Phase 1 – Engine & Viewer (Week 1‑2)
- WorkflowEngine with linear execution, CAS storage, snapshot model.
- Viewer Pane components + Chat split.

### Phase 2 – Triggers & Daemons (Week 3‑4)
- Cron scheduling (APScheduler).
- OS notifications (Tauri).
- Global Panic Button implementation.

### Phase 3 – Time Machine & Polish (Week 5‑6)
- Scrub bar + Timeline snapshots.
- Developer Mode toggle.
- HITL Approval nodes.
