# 🚀 Ensemble V1.0: Crystal Deep Documentation
## The Sovereign Agent Workflow Platform

---

## 🌟 0. The Vision: What is Ensemble?

### **The "What"**
Ensemble is an **Autonomous Multi-Agent Orchestration Platform**. Unlike standard AI chat interfaces that require constant hand-holding, Ensemble allows you to define a team of specialized agents (Researchers, Analysts, Writers, etc.) and give them a single high-level mission. 

It handles the complex logic of:
*   **Planning**: Breaking a mission into a Directed Acyclic Graph (DAG) of tasks.
*   **Collaboration**: Passing data accurately between agents.
*   **Execution**: Automating tool usage (Web Search, RAG, File creation) without user intervention.

### **The "Why"**
We created Ensemble to solve the **"Context Gap"** in modern AI work.
1.  **Sovereignty**: Most AI tools send your data to the cloud. Ensemble is **Local-First**, keeping your thoughts, files, and vectors on your machine.
2.  **Beyond the Chatbox**: Professional work isn't a single prompt; it's a workflow. Ensemble replaces back-and-forth chatting with **durable, reproducible pipelines**.
3.  **Specialization**: A single LLM tries to be everything. Ensemble uses **specialized personas** (Skills) that are better at their specific tasks than a general-purpose model.

---

Welcome to the **Ensemble** technical core. This document serves as the absolute source of truth for the architecture, engineering decisions, and operational logic of the Ensemble V1.0 platform.

---

## 🏛️ 1. Orchestration Architecture
Ensemble operates on a **3-Layer Neural Architecture** that separates high-level strategy from deterministic execution.

```mermaid
graph TD
    subgraph Layer 1: Directive (The DNA)
        A[SOP YAML / directives/] --> B(Rule Enforcement)
        B --> C{State Machine}
    end

    subgraph Layer 2: Orchestration (The Brain)
        C --> D[SOPEngine]
        D --> E[ManagedAgent]
        E --> F[Context Assembly]
    end

    subgraph Layer 3: Execution (The Tools)
        F --> G[core/tools/]
        G --> H(Bulletproof Search)
        G --> I(FileSystem Ops)
        G --> J(API Integrations)
    end

    subgraph Memory: The Knowledge Core
        E <--> K[(RAG: SQLite + NumPy)]
    end
```

---

## 💻 2. The Tech Stack: What & Why

### **Frontend: The Command Center**
*   **Tauri 2.0 (Rust/Desktop)**: Chosen for security and native performance. Unlike Electron, Tauri uses the system's native Webview, resulting in a ~80% smaller binary footprint.
*   **React + Tailwind CSS**: Used for the UI layer to provide a premium, "Glassmorphic" interface that feels alive.
*   **React Flow**: The engine behind the Workflow Designer. It treats the agent team as a **DAG (Directed Acyclic Graph)**, allowing for complex data-pass-through between roles.

### **Backend: The Intelligence Engine**
*   **FastAPI (Python)**: Acts as the bridge between the desktop UI and the AI agents. We chose FastAPI for its high-performance asynchronous capabilities.
*   **PyInstaller**: Used to bundle the Python environment into a single `ensemble-backend` binary. This ensures that a new user doesn't need to install Python or Pip to run Ensemble.

---

## 🧠 3. Core Concept: RAG Activation
**RAG (Retrieval-Augmented Generation)** is how Ensemble gives agents "Long-Term Memory." 

### **How we did it (Deep Dive):**
We implemented a **Local-First Vector Store** in `core/rag.py`:
1.  **Embedding Model**: We use `sentence_transformers` (specifically the `all-MiniLM-L6-v2` model). This model transforms human text into a 384-dimensional vector (a list of numbers representing the "meaning" of the text).
2.  **Storage**: These vectors are stored as `BLOB`s (Binary Large Objects) in a local `SQLite` database (`data/ensemble_memory.db`).
3.  **Search**: When an agent needs to remember something, we use **NumPy** to calculate the **Cosine Similarity** between the current task and all stored memories.
    *   *Analogy*: Instead of searching for the word "Apple," RAG looks for everything "Fruit-like" or "Tech-company-like" based on mathematical distance.

---

## 🔍 4. The Bulletproof Search Fallback
A common failure in AI agents is "Search Blindsiding"—where a primary search tool gets blocked, causing the agent to give up. 

**Ensemble's Solution:**
In `core/tools/__init__.py`, we implemented a **Multi-Stage Fallback Engine**:
1.  **Stage 1: Standard DDG**: Top-level web search.
2.  **Stage 2: News Fallback**: If standard is blocked, it switches to `news.search` which uses different endpoints.
3.  **Stage 3: Broad Fallback**: If specific queries fail, it recursively simplifies the query to find "Market Trends" or "Projections" to ensure the agent always has a foundation to build on.

---

## 🛠️ 5. Developer Guide: How to Extend

### **Adding a New Agent Specialist**
1.  Create a new directory in `skills/`.
2.  Add a `SKILL.md` file following the SOP format.
3.  Ensemble's `SkillRegistry` will automatically detect, categorize, and enable the agent on the next sync.

### **Building & Bundling**
To create a fresh production binary after making core changes:
```bash
# 1. Update the backend binary
python3 scripts/bundle_backend.py

# 2. Build the desktop app
npm run tauri build
```

---

## 🛡️ 6. Governance & Safety
Every action taken by an agent is intercepted by the **Governance Dashboard**. 
*   **Budget Enforcement**: Agents have a strict "Token Grant" limit. 
*   **Auditing**: Every thought, tool call, and output is saved to `data/ensemble_audit.db`, making the platform 100% auditable for enterprise compliance.

---
**Document Status**: Immutable Master Record
**Project Version**: 1.0.0 "Sovereign"
