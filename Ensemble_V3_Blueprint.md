# Ensemble v3 Blueprint: Sovereign Orchestration Protocol
**Status**: Final Specification for Implementation
**Target**: Enterprise‑Grade Autonomous Agent Orchestration
**Core Promise**: Model‑agnostic, zero‑trust, collaborative, and extensible.

This document defines the complete, non‑negotiable feature set for Ensemble v3. Every section is a requirement. An AI agent (Antigravity) must decompose these phases into concrete tasks, files, and code changes. No ambiguity.

## 1. Core Philosophy & Pillars
### 1.1 The Four Pillars (Must be visible in UI)
| Pillar | User‑Facing Manifestation |
| :--- | :--- |
| **Model‑Agnosticism** | A “Model Registry” page where any OpenAI‑compatible endpoint or local Ollama server can be added. A dropdown in every node and in the chat header to select the model. |
| **Zero‑Trust Security** | An “Agent Permissions” tab in the Agent Library. A matrix of allowed actions (read files, write files, network, shell) with scoping rules. |
| **Sharing Economy** | A “Marketplace” sidebar section. Buttons to “Collapse to Macro” on selected canvas nodes. A gallery of installed macros / sub‑workflows. |
| **Hybrid Edge Runtime** | A “Run Location” selector on each node: Cloud, Edge, Any. A “Edge Runtimes” dashboard showing discovered local runners. |

### 1.2 Non‑Negotiable User Experience Principles
*   **Transparency is Trust** – Every agent thought, tool call, and state change is visible in the Viewer’s “Logs” tab (Developer Mode toggle).
*   **Control is Safety** – No action is irreversible. The Panic Button (2.0) snapshots, kills, and reports.
*   **Speed is Default** – Auto‑save, predictive costing, and parallel DAG execution happen without extra clicks.

## 2. Technical Stack (Locked)
All implementation must use the following stack. No deviation.

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend Framework** | React 18+ (with TypeScript) | UI components |
| **State Management** | Zustand + TanStack Query + Yjs | Global store, server state, CRDT sync |
| **Canvas** | React Flow Pro (or latest community) | Node graph editor |
| **Real‑time Communication** | SSE for logs + WebSockets for UI control | Bidirectional, low‑latency |
| **Backend API** | Python FastAPI (existing) | Expose /api/skills, /api/models, /api/workflows, etc. |
| **Sandboxed Execution** | WebContainers (StackBlitz) / Docker | Isolated code runtime |
| **Security Policies** | Open Policy Agent (OPA) | Evaluate agent permissions |
| **Persistence** | SQLite (backend) + IndexedDB (frontend) | Workflow snapshots, artifacts |

## 3. UI Structure & Layout
The application has four main tabs (visible in a top navigation bar):
1.  **Studio** – Canvas + Agent Library + Viewer Pane (collapsible right panel)
2.  **Chat** – Dedicated conversation with selected agent
3.  **Governance** – Budget, approvals, audit log, panic button, edge runtimes
4.  **Marketplace** – Browse / install macros, agents, sub‑workflows

### 3.1 Studio Tab Layout
*   **Agent Library** – Draggable cards showing agent name, description, and permission badge.
*   **Canvas** – Nodes (agents, macros, switch). directed edges.
*   **Viewer Pane** – Updates on node click. Contains:
    *   **Preview**: Sandboxed iframe (WebContainers or HTML).
    *   **Document**: Markdown / plain text.
    *   **Data**: JSON / table.
    *   **Logs**: Raw agent thought stream (color‑coded).
    *   **Developer Mode toggle**: (Top‑right) Reveals internal reasoning if ON.

### 3.2 Chat Tab Layout
*   **Header**: Agent selector, model selector, “Clear conversation”.
*   **Message area**: Bubbles for user and agent. “View in Studio” buttons on agent messages.
*   **Input area**: Multiline text, send button, file attachment (future).

### 3.3 Governance Tab Layout
*   **Budget Card**: Monthly limit, current spend, predictive costing.
*   **Approval Queue**: Pending human‑in‑the‑loop requests.
*   **Audit Log**: Searchable/filterable event table.
*   **Panic Button**: Red button → confirm → snapshot → kill → forensic report.
*   **Edge Runtimes**: Discovered local runners status.

## 4. Phase 1 – Hardened Core
### 4.1 Model Registry & Selection
*   **Backend**: `GET /api/models` returns model metadata and capabilities.
*   **UI**: Global selector in top bar; per‑node override dropdown.
*   **Fallback**: Auto‑retry with next cheapest model on failure.

### 4.2 Real Agents from SkillRegistry
*   **Backend**: `GET /api/skills` returns official skill set.
*   **UI**: Agent Library populated from registry (no mocks).

### 4.3 Workflow Persistence
*   **Backend**: RESTful endpoints for Save/Load.
*   **UI**: Auto‑save (3s debounce) to IndexedDB + sync. Load gallery with thumbnails.

### 4.4 Conditional Branching (Switch Node)
*   **Node**: `Switch`. Inspector: define conditions (regex, string match).
*   **Engine**: Evaluate artifact output and follow matching branch.

### 4.5 Predictive Costing
*   **Backend**: `POST /api/workflows/:id/cost-estimate`.
*   **UI**: Min/max/likely cost tooltip on "Run".

### 4.6 Panic 2.0 (Forensic)
*   **Backend**: `POST /api/panic` snapshots and generates forensics markdown report.
*   **UI**: Forensic report view on success.

### 4.7 Basic Parallel DAG Execution
*   **Engine**: Parallelize nodes without dependencies.
*   **UI**: Concurrent "Running" status viz.

## 5. Phase 2 – Collaborative OS
*   **Neural Mirror**: Live AST/Trace panel next to Viewer.
*   **Time‑Travel Debugging**: Execution scrub bar + "Fork from here".
*   **Collaborative Canvas**: Yjs-based CRDT sync with remote cursors.
*   **Marketplace & Macros**: "Collapse to Macro" right-click tool + Marketplace publish/install.

## 6. Phase 3 – Sovereign Edge
*   **Edge Runner**: Docker-based local execution.
*   **WebContainers Sandbox**: Browser-based Node.js runtime via StackBlitz SDK.
*   **Artifact Diffing**: Visual/Textual diffing in audit logs.

## 7. Security & Data Model
*   **Zero‑Trust Permission Matrix**: Agent-level resource grants (fs, net, shell).
*   **Workflow Graph JSON**: React Flow compatible structure with custom model/placement data.
*   **Artifact CAS**: Content‑Addressable Storage with SHA-256 integrity.

## 8. Glossary of UI Components
*   `AgentLibrary.tsx`: Draggable skills.
*   `Canvas.tsx`: React Flow wrapper.
*   `ViewerPane.tsx`: Tabs + Dev Mode.
*   `NeuralMirror.tsx`: AST / trace panel.
*   `ChatInterface.tsx`: Agent‑locked chat.
*   `GovernanceDashboard.tsx`: Budget, panic, approvals.
*   `Marketplace.tsx`: Macro browser.
*   `PermissionEditor.tsx`: Capability matrix.
