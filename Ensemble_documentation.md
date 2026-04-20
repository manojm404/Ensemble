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

### **The Philosophical Edge: Code = SOP**
Ensemble stands on the shoulders of giants (MetaGPT, CrewAI, AutoGen) but takes the philosophy further: **Every workflow is a Standard Operating Procedure (SOP).** Our architecture ensures that probabilistic AI behavior is constrained by deterministic business logic.

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

### **The Governance "Sidecar"**
Every action in the architecture above is intercepted by an **Audit Sidecar**. Before a tool (Layer 3) is allowed to run, the **Governance Engine** checks:
1.  **Budget**: Does the current project have remaining tokens?
2.  **Permission**: Is the agent authorized for this specific tool?
3.  **Approvals**: Does this action (e.g., deleting a file) require a human approval gate?

---

## 🛡️ 2. Security & Economic Guardrails
Ensemble implements a **Five-Layer Defense-in-Depth** for running agentic code:

1.  **Docker Sandboxing**: Ephemeral, hardened containers for execution.
2.  **AST Guard**: Blocks dangerous Python builtins (`eval`, `exec`, `__import__`) at the source level.
3.  **Network Policy**: Domain whitelisting to prevent data exfiltration.
4.  **Recursion Guard**: Prevents infinite agent loops (Hard limit: 3 levels).
5.  **Economic Governance**:
    *   **Per-Agent Caps**: Monthly spend limits per role.
    *   **Human Approval Gates**: Triggered for sensitive actions and shell commands.
    *   **Token Grant System**: Pre-allocates budget before a workflow begins.

---

## 💻 3. The Tech Stack: What & Why

### **Frontend: The Command Center**
*   **Tauri 2.0 (Rust/Desktop)**: Native performance and high security.
*   **React + Tailwind CSS**: Premium, "Glassmorphic" interface.
*   **React Flow**: The engine for visual DAG (Directed Acyclic Graph) orchestration.

### **Backend: The Intelligence Engine**
*   **FastAPI (Python)**: High-performance asynchronous API bridge.
*   **PyInstaller**: Environment-free distribution via a single binary.
*   **Universal Agent Importer**: Natively supports Markdown, Python, YAML, and JSON agent formats.

---

## 🧠 4. Core Concept: RAG Activation
**RAG (Retrieval-Augmented Generation)** is how Ensemble gives agents "Long-Term Memory." 

### **The Technical Implementation:**
*   **Embedding Model**: `sentence_transformers` (`all-MiniLM-L6-v2`) generates 384-dimensional semantic vectors.
*   **Storage**: SQLite vector-blobs in `data/ensemble_memory.db`.
*   **Search Engine**: NumPy-powered **Cosine Similarity** search for O(1) retrieval speed on local hardware.

---

## 🔍 5. The Bulletproof Search Fallback
To prevent agent failure in production, our search tool in `core/tools/__init__.py` uses a **Recursive Fallback Strategy**:
1.  **Stage 1: Standard DDG** (General Web).
2.  **Stage 2: News Fallback** (Direct endpoint switch for 403 bypass).
3.  **Stage 3: Broad Semantic Fallback** (Query simplification to find high-level projections).

---

## 🛠️ 6. Quick Start & Setup

### **Prerequisites**
*   Python 3.11+
*   Node.js 18+
*   Gemini API Key or Ollama (for full local sovereignty)

### **Developer Setup**
```bash
# 1. Install Dependencies
pip install -r requirements.txt

# 2. Launch Backend
uvicorn core.governance:app --reload --port 8088

# 3. Launch Frontend (UI)
cd ui && npm install && npm run dev
```

---

## 📅 7. Project Information
**Document Status**: Immutable Master Record
**Project Version**: 1.0.0 "Sovereign"
**Release Philosophy**: Be autonomous. Be auditable. Be Ensemble. 🎼
