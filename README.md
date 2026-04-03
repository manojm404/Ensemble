# Ensemble – Autonomous AI Company Platform

Build, orchestrate, and govern teams of AI agents with a no-code visual studio, local LLMs, and human-in-the-loop controls.

---

### 📊 Project Status (Milestone v1.5)
- **✅ Phase 1: Ensemble Core (Complete)**: SOP Engine, FSM State Transitions, SQLite Governance, and Basic LLM Integration.
- **✅ Phase 1.5: Agentic OS Bridge (Complete)**: 20+ Persona Specialist Directory, Searchable Agent UI, Advanced Command Input, and WebSocket streaming.
- **🏗️ Phase 2: Visual Workflow Canvas (Active)**: Transitioning to the DAG-based visual SOP editor with React Flow integration.

---

## 🏢 What is Ensemble?

**Ensemble** is a desktop application and backend ecosystem designed to transform how businesses interact with AI. Instead of managing single chatbots, Ensemble allows you to architect entire **Specialised AI Departments** (Groups of Agents) that collaborate to solve complex business objectives.

With a drag-and-drop canvas, you can define Standard Operating Procedures (SOPs), assign roles to specialized agents, and monitor their execution in real-time through a dedicated governance dashboard.

## ⚖️ Why Ensemble?

Ensemble solves the four biggest challenges in agentic AI today:

- 🏗️ **Zero-Code Orchestration**: Architect complex multi-agent workflows without writing a single line of code.
- 💰 **Economic Governance**: Prevent runaway costs with real-time budget tracking, approval thresholds, and escrow systems.
- 🔒 **Privacy-First**: Keep your data on-premises. Ensemble supports local LLMs (Ollama, LM Studio) and local vector databases for RAG.
- 🔓 **No Vendor Lock-in**: Seamlessly switch between Gemini 2.0/3.0, OpenAI, or 100% local models as your needs evolve.

## ✨ Key Features

- 🎨 **Visual SOP Designer**: A React Flow-powered canvas for building agentic logic visually.
- 🪄 **Magic Generate**: Transform natural language descriptions into fully functional visual workflows instantly.
- 📊 **Governance Dashboard**: Monitor "Org Charts" of running agents, total costs, and detailed audit logs.
- ⏸️ **Hibernation & Resume**: Agents can "hibernate" while waiting for human approval, surviving server restarts.
- 📚 **Skill Library**: A registry of specialized capabilities (SEO, Research, Coding) that any agent can adopt.
- 🧠 **Integrated RAG**: Semantic search over your local documents to give agents business-specific context.

## 🚀 Quick Start

Ensure you have Python 3.11+ and Node.js 18+ installed.

1. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   cd ui && npm install
   ```
2. **Launch Ensemble**:
   Refer to [LOCAL_RUN.md](LOCAL_RUN.md) for detailed step-by-step instructions on setting up your API keys and running the platform.

---

## 🛠️ For Developers

The codebase is organized into several key modules:
- `core/`: The Ensemble engine, governance service, and agent logic.
- `ui/`: The Tauri-based desktop user interface.
- `skills/`: Specialized instructions and tools for AI agents.
- `roles/`: [Reference] Templates for defining new agent personas.

---
*Ensemble is built for the era of autonomous work. Be autonomous. Be Auditable. Be Ensemble.*
