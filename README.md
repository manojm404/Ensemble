# Esemble

**Governed agent workflows for teams that need AI work to be repeatable, auditable, and controlled.**

Esemble is a local-first product for designing, running, evaluating, and auditing AI agent workflows. It is not positioned as another generic chatbot, agent playground, or "autonomous company" simulation. The release-ready product is a control plane for agentic work: every workflow has a standard operating procedure, every action is logged, every important artifact is versioned, every risky step can require approval, and every run can be evaluated against clear acceptance criteria.

## Product Promise

Run AI agents like controlled business processes, not one-off chat experiments.

Esemble helps teams answer five practical questions:

1. What workflow did the agents follow?
2. Which model, tool, data source, and prompt produced each result?
3. What did it cost?
4. Who approved sensitive actions?
5. Did the final output meet the required quality bar?

## Primary Use Cases

The first release should focus on governance-sensitive workflows where correctness, evidence, and repeatability matter more than novelty.

| Use case | Buyer pain | Esemble workflow |
| --- | --- | --- |
| Governed research reports | Research output is hard to verify and expensive to redo | Researcher -> Source Verifier -> Analyst -> Writer -> Reviewer |
| Secure code review | AI code tools create untracked recommendations and inconsistent review quality | Repo Scanner -> Security Reviewer -> Test Planner -> Patch Advisor -> Human Approval |
| Compliance-safe content | Marketing/legal claims need citations and approval history | Creator -> Claims Checker -> Compliance Reviewer -> Publisher Gate |
| Internal policy audit | Teams need evidence-backed findings, not generic summaries | Document Reader -> Control Mapper -> Risk Scorer -> Audit Report Writer |

## Release Pillars

### 0. Organize

Users create companies as operational workspaces. A company contains teams, agents, workflows, issues, budgets, approvals, artifacts, and audit history for one mission.

### 1. Design

Users build workflows from curated role packs, not a noisy catalog of hundreds of agents. Each workflow is an SOP: nodes, edges, inputs, output contracts, quality gates, and approval requirements.

### 2. Run

The DAG engine executes workflows in topological order, passes content-addressed artifacts between steps, tracks status in real time, and supports local or cloud model providers.

### 3. Govern

Budget limits, token grants, approval gates, workspace permissions, tool policies, and audit logging make agent behavior controllable.

### 4. Evaluate

Each workflow can define acceptance criteria. Runs produce an evaluation result: pass, needs review, or fail. This is the most important release gap to close.

### 5. Audit

Every run creates an audit package: workflow version, model/provider, prompts, tool calls, approvals, costs, artifact hashes, evaluation result, and final deliverables.

## Architecture

```text
Product UI
  Dashboard | Workflow Studio | Run Console | Evaluation Review | Audit Center | Settings

API / Governance Layer
  Auth | Workflow CRUD | Execution API | Approval API | Policy API | Audit Export API

Agent Runtime
  DAGWorkflowEngine | ManagedAgent | LLMProvider | Tool Registry | Runner Factory

Control Plane
  Budget Enforcer | Approval Gates | Security Policy | Audit Logger | Evaluation Engine

Data Plane
  CAS Artifacts | SQLite/Supabase Metadata | Workspace Files | RAG Index | Export Bundles
```

## What Is In Scope For Release

- Companies workspace tab
- Visual workflow creation and editing
- Curated role packs for the first three workflows
- DAG execution with clear run states
- CAS artifact persistence
- Audit event history
- Human approval gates
- Budget and token tracking
- Model provider configuration
- Evaluation criteria per workflow
- Audit package export
- Local developer setup

## What Is Deferred

- Large agent marketplace
- Universal agent import as a primary selling point
- Full autonomous company/org simulation as the main metaphor
- Complex macro marketplace
- Broad external app launcher positioning
- Dozens of general-purpose specialist agents in the main journey

These can remain in the codebase, but they should not dominate the release product.

## Repository Map

| Path | Purpose |
| --- | --- |
| `core/dag_engine.py` | Workflow execution engine |
| `core/managed_agent.py` | Budget-aware agent runtime wrapper |
| `core/ensemble_space.py` | Content-addressable artifact storage |
| `core/audit.py` | SQLite/Supabase audit logging |
| `core/cost_control/` | Budget, input, timeout, and concurrency controls |
| `core/governance.py` | FastAPI governance and product API |
| `skills/` | Agent role instructions |
| `directives/` | SOP workflow definitions |
| `ui/` | React workflow studio and operations console |
| `schema/` | Supabase schema and RLS migrations |
| `docs/` | Release, setup, and operations documentation |

## Documentation

The repo intentionally keeps a small documentation surface.

If you only open one design document, open the canonical architecture spec first:

- [docs/ensemble-architecture.md](./docs/ensemble-architecture.md)

Supporting docs stay available for release tracking and implementation detail:

| File | Purpose |
| --- | --- |
| `README.md` | Product overview and release direction |
| `docs/ensemble-architecture.md` | Canonical end-to-end product architecture, page spec, and workflow contract |
| `docs/product-plan.md` | Single source of truth for product plan, architecture, features, decisions, and release checklist |
| `docs/release-backlog.md` | Detailed release task tracker with completion checkboxes |
| `docs/operations.md` | Local setup, self-hosting, smoke tests, and operational checklist |

## Release Readiness Definition

Esemble is release ready when a user can:

1. Create a company workspace from a mission.
2. Monitor agents, teams, issues, approvals, and runs inside that company.
3. Create a governed workflow from a curated template.
4. Run it with a real model provider.
5. See every agent step complete or fail with useful state.
6. Review generated artifacts.
7. Approve or reject risky actions.
8. See cost and token usage.
9. Review evaluation results.
10. Export an audit package that explains what happened.

## Product North Star

**Trusted successful workflow runs per week.**

Supporting metrics:

- Evaluation pass rate
- Human override rate
- Cost per successful run
- Approval response time
- Workflow rerun rate
- Audit export count
- Time saved per completed workflow

## Research Basis

The market is moving toward agentic systems, but governance is the adoption bottleneck. Gartner has warned that many agentic AI projects will be canceled due to unclear value, cost, and risk controls, while also forecasting broad enterprise adoption of agentic capabilities. Deloitte's recent enterprise AI research points to immature governance for autonomous agents. IBM and other enterprise vendors are converging around orchestration, identity, guardrails, and observability. Esemble's release strategy is built around that pressure: make agents operationally trustworthy.
