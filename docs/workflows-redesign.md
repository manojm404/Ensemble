# Workflow Redesign

This document defines the next-generation workflow experience for Esemble/Kette.

The current workflow surface mixes canvas authoring, runtime state, and output browsing. The redesign splits those responsibilities into three distinct product layers:

1. Canvas board for composition
2. Live run board for execution
3. Results notebook for deliverables

The goal is a release-ready workflow system that feels like a premium control surface, not a demo.

## Product Principles

- The canvas should feel like an orchestration board, not a generic flowchart editor.
- Prompt-first and canvas-first workflows should both be first-class.
- The UI should always answer: what is running, what is idle, what failed, and why.
- Outputs should look like polished deliverables with files, preview, and traceable agent reasoning.
- Every run should be auditable, resumable, and refresh-safe.

## Core Modes

### 1. Canvas Board

Users manually assemble agents on a board.

What it shows:
- draggable agent cards
- edges and execution order
- agent role, model, and prompt snippet
- per-node configuration panel
- validation and warnings before run

What it does:
- add/remove agents from the backend catalog
- connect agents into an execution graph
- edit agent prompts, tools, and verification rules
- save as a workflow template

### 2. MagicFlow

Users type a task prompt and the backend generates the workflow.

What it shows:
- prompt input
- route rationale
- chosen agents and why they were selected
- generated stage plan before execution

What it does:
- classify the task domain and risk level
- pick the best specialists from the backend registry
- build a workflow graph with stage metadata
- let the user adjust the plan before running

### 3. Live Run Board

When a workflow runs, the board becomes an operations console.

What it shows:
- current active agent lane
- idle agents
- completed agents in green
- failed agents in red with failure reason
- progress, time, and run status

What it does:
- stream backend run events
- update node status in place
- preserve failed state and failure reason
- support pause/approval states

### 4. Results Notebook

After the run completes, users open a dedicated results page.

What it shows:
- original prompt
- generated plan / route summary
- each agent’s thought summary and report
- file tree for code outputs
- preview for websites/apps
- export and download actions

What it does:
- group the output by agent and by artifact type
- keep previews live for web deliverables
- package downloadable files cleanly
- provide an audit-friendly summary

## Backend Architecture

### Service Layers

#### Workflow Orchestrator

The orchestrator owns:
- workflow definitions
- workflow runs
- agent lane state
- output packaging
- event emission

This layer should be deterministic and not depend on the UI.

#### Planner / MagicFlow Router

The planner owns:
- prompt classification
- domain routing
- agent selection
- stage ordering
- rationale generation

It returns a full workflow plan, not just nodes.

#### Run Ledger

Every run should have a durable ledger containing:
- run id
- workflow id
- prompt
- generated plan
- per-node status
- per-node failure text and failure kind
- timestamps
- output package metadata

#### Agent Message Bus

The message bus owns targeted agent-to-agent communication.

Use it for:
- private collusion messages
- public handoffs
- warnings
- email chains
- overrides
- audit-only evidence

Messages are immutable once written.

#### AgentMessage

- message_id
- run_id
- cycle
- sender_node_id
- recipient_node_ids
- visibility: `public` | `private` | `hidden_until_audit`
- message_type: `handoff` | `collusion` | `warning` | `email` | `override` | `note` | `profit_report`
- subject
- body
- related_state_keys
- source_event_ids
- created_at
- thread_id
- in_reply_to

Threading rules:
- `thread_id` is required for email messages.
- `in_reply_to` must reference an existing message in the same run.
- replies must share the same `thread_id` as the parent message.
- messages cannot reply to themselves.
- thread cycles are invalid.

Results Notebook email sections should prefer threaded messages and fall back to chronological email messages when no thread exists.

Message thread inspection should support filters for thread, sender, recipient, and message type. Private and audit-hidden visibility must remain explicit in the UI.

### Suggested Data Model

#### WorkflowDefinition

- id
- name
- source_mode: `canvas` | `magicflow`
- graph
- metadata
- created_at
- updated_at

#### WorkflowPlan

- domain_key
- domain_title
- prompt_summary
- routing_reason
- requested_agents
- generated_agents
- stage_plan
- risk_level

#### WorkflowRun

- run_id
- workflow_id
- status
- current_node
- current_node_label
- current_node_role
- started_at
- completed_at
- failure_kind
- failure_label
- failure_reason

#### NodeRun

- run_id
- node_id
- label
- role
- status
- selection_reason
- input_summary
- output_summary
- failure_kind
- failure_label
- failure_reason
- updated_at

#### WorkflowPackage

- package_type
- primary_artifact
- artifact_count
- has_preview
- artifact_paths

### API Contract

#### `POST /api/workflows/magicflow`

Input:
- prompt
- preferred_agent_count
- optional domain hints

Output:
- workflow definition
- route explanation
- stage plan

#### `POST /api/workflows/run`

Input:
- workflow id or inline graph
- prompt
- initial context

Output:
- run id
- initial run state

#### `GET /api/runs/{id}/status`

Returns:
- global run status
- current node metadata
- node statuses
- failure metadata
- approval metadata

#### `GET /api/runs/{id}/events`

Returns:
- ordered execution events for live UI streaming and replay

#### `GET /api/workflows/{id}/result`

Returns:
- prompt
- plan
- per-agent summaries
- package metadata
- file tree
- preview availability

### Backend Rules

- Never return raw Python exception objects to the UI.
- Always normalize failure text into human-readable strings.
- Persist failure kind as a first-class field.
- Keep run state refresh-safe and replayable.
- Keep output packaging separate from execution state.

## Frontend Architecture

### Primary Workflow Page

Replace the current editor with a three-zone layout:

1. Left rail: catalog and prompt-to-workflow controls
2. Center board: canvas / live run board
3. Right rail: inspector and output detail

### Board States

#### Build State

- agent cards
- edges
- configuration inspector
- validation summary

#### MagicFlow State

- prompt composer
- route explanation
- generated stage plan
- “refine before run” actions

#### Run State

- lane status chips
- active agent spotlight
- idle/completed/failed lanes
- event stream

#### Results State

- summary header
- agent thought cards
- files tab
- preview tab
- export button

### Visual Direction

- dark premium canvas surface
- restrained accent palette
- distinct status colors
- no noisy gradients
- strong spacing and hierarchy
- production-style cards and sheets

### Recommended UI Components

- `WorkflowBoard`
- `AgentLane`
- `MagicFlowComposer`
- `RunStatusRail`
- `ResultNotebook`
- `ArtifactExplorer`
- `PreviewFrame`
- `AgentReportCard`

## Migration Strategy

### Phase 1

- create the new workflow data model and response contracts
- preserve existing workflows while adding the new plan/run/result payloads

Implementation status:
- durable `workflow_run_events` ledger added for replayable run-board state
- durable `agent_messages` ledger added for targeted agent-to-agent communication
- run status now returns initialized idle/running/completed/failed node lanes
- result payloads now include messages, message threads, and run events
- Results Notebook can inspect threaded messages with thread, sender, recipient, and type filters
- `SimulationRunner` added for logical-cycle simulation workflows
- simulation state versions, checkpoints, and per-agent logs are persisted
- simulation endpoints added for status, state, checkpoints, messages, audit, and result
- simulation result payloads now include state board snapshots, checkpoints, agent logs, status, messages, and audit events
- Results Notebook now includes a Simulation Inspector for state, checkpoint, agent log, and audit review
- the live run board now polls simulation runs through the simulation status endpoint and finalizes completed steps plus output persistence in the same completion tick
- simulation pause, resume, and step controls are wired to backend control endpoints with a distinct paused state in the run board
- manual simulation mode now gates the backend runner between logical cycles so Step advances exactly one checkpoint and Resume returns to automatic execution
- Quantum Banana-style document simulations now have a deterministic acceptance path

### Phase 2

- rebuild the workflow editor shell around the board layout
- introduce MagicFlow as a prompt-first path

### Phase 3

- replace the run console with the live board
- add agent lane states and live execution summaries

### Phase 4

- replace the results page with a notebook-style deliverable view
- keep file preview and download support as first-class actions

### Phase 5

- remove legacy workflow visuals and stale surfaces
- tighten navigation so workflows feel like one coherent product

## Definition of Done

- users can build a workflow manually or via prompt
- the backend picks specialists intelligently for MagicFlow
- the run view shows active, idle, completed, and failed agents clearly
- completion opens a polished results page with prompt, agent reports, files, and preview
- coding workflows expose downloadable files and live preview
- the workflow experience feels release-ready and premium
