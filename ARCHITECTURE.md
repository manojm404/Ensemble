# Ensemble 3-Layer Architecture

This document answers the question: **"Where are my actual agents?"**

The Ensemble platform follows a strict 3-layer architecture that separates high-level strategy (SOPs) from intelligent orchestration and deterministic execution.

## 🏢 The 3-Layer Breakdown

### Layer 1: Directive (The DNA)
**Location:** `/directives/*.yaml` and `/ui/src/utils/toSopYaml.ts`
- **What it is:** These are the "Standard Operating Procedures" or Finite State Machines (FSM).
- **Function:** They define the roles, instructions, and transitions for a workflow. They are the "blueprints" for the agents.
- **Example:** `directives/chat_proxy.yaml` defines how the direct chat agent should behave.

### Layer 2: Orchestration (The Brain)
**Location:** `/core/engine.py` and `/core/managed_agent.py`
- **What it is:** This is the intelligent engine that "breathes life" into the directives.
- **ManagedAgent Class:** This is the base class for every agent in the system. Agents don't exist as static files; they are **instantiated dynamically** as the `SOPEngine` moves through the directive's states.
- **Specialization:** When a `ManagedAgent` is created, it pulls specialized knowledge (Prompts) from the `/core/skill_registry.py` based on the role assigned in the directive.

### Layer 3: Execution (The Tools)
**Location:** `/execution/` and `/core/agent_base.py`
- **What it is:** This layer handles the deterministic "doing". It contains Python scripts and tools that agents can call.
- **Auditing:** Every time an agent (Layer 2) uses a tool (Layer 3), it is intercepted by the `AuditLogger` (`core/audit.py`) and governed by the `Governance` system (`core/governance.py`).

---

## 🔄 Agent Lifecycle
1. **Trigger:** A user sends a message or clicks "Run" in the Studio.
2. **Initialization:** The `SOPEngine` loads the Directive (Layer 1).
3. **Instantiation:** For the first state, a `ManagedAgent` (Layer 2) is created and assigned a Role.
4. **Cognition:** The Agent thinks, uses memory (`core/conversation_memory.py`), and decides if it needs Tools (Layer 3).
5. **Governance:** If a tool is sensitive, the Agent pauses and waits for human approval in the Dashboard.
6. **Persistence:** Agent state is serialized and saved if the workflow pauses (Human-in-the-loop).

---

## 📂 Key Files to Explore
- **`core/managed_agent.py`**: The heart of every digital employee.
- **`core/engine.py`**: The "Central Nervous System" that moves agents between tasks.
- **`core/governance.py`**: The "Legal/Ethical" layer that enforces budgets and approvals.
- **`core/skill_registry.py`**: The "HR Department" that knows how to train agents for specific roles.
