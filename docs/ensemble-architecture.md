# Esemble Product Architecture

This document is the canonical product specification for Esemble.

It defines:
- what the product is,
- how the workflow system must behave,
- what each page does,
- which buttons must exist,
- what each button must do,
- how agents are selected,
- how artifacts are created,
- how outputs are previewed,
- how governance and approvals work,
- and what “done” means for each major feature.

If implementation conflicts with this document, this document wins until explicitly changed.

## 1. Product Intent

Esemble is a governed agent workflow platform for repeatable AI work.

It is not:
- a generic chatbot,
- a random agent playground,
- a noisy agent marketplace,
- or an “autonomous company simulator” as the main product story.

It is:
- a control plane for AI work,
- a workflow builder,
- a runtime for executing multi-step agent plans,
- a governance layer for approval and budget control,
- and an audit/evaluation system for proving what happened.

## 2. Product Principles

### 2.1 Trust Before Autonomy
Every workflow must be explainable, inspectable, and replayable.

### 2.2 Brief Before Build
Every user request must first become a structured brief before execution.

### 2.3 Plan Before Run
The system must select agents and a stage plan before execution begins.

### 2.4 Handoff Is a Contract
Each step must pass a clear output contract to the next step.

### 2.5 Artifact First
The final output must be real artifacts, not only chat text.

### 2.6 Fail Clearly
If a step fails, the UI must name the failing agent, show the reason, and expose the failing artifacts.

### 2.7 Preview Must Work
If the system generates a website, the preview must be visible without manual file hunting.

### 2.8 One Source of Truth
The workflow spec, runtime behavior, and UI must all reflect the same product contract.

## 3. User Roles

### 3.1 Builder
Creates workflows, edits agents, and runs jobs.

Needs:
- workflow creation,
- agent selection visibility,
- output preview,
- rerun,
- and file inspection.

### 3.2 Operator
Runs workflows repeatedly and monitors progress.

Needs:
- status,
- failures,
- approvals,
- cost visibility,
- and clean output access.

### 3.3 Reviewer
Checks output quality and approves risky actions.

Needs:
- step-by-step traceability,
- artifact preview,
- evaluation results,
- and clear failure reasons.

### 3.4 Admin
Configures providers, budgets, keys, policies, and workspace settings.

Needs:
- provider selection,
- API key setup,
- budget limits,
- security policies,
- and workspace controls.

## 4. Information Architecture

### 4.1 Global App Shell

Persistent areas:
- Top navigation
- Left navigation or workspace selector
- Theme toggle
- Settings
- User profile
- Workflow tabs
- Company context

Global actions:
- create new workflow,
- create new company,
- open chat,
- open settings,
- toggle theme,
- open current run output,
- and open the current workspace.

### 4.2 Primary Routes

- `/dashboard`
- `/companies`
- `/company/:id`
- `/company/:id/agents`
- `/company/:id/teams`
- `/company/:id/issues`
- `/company/:id/activity`
- `/company/:id/reports`
- `/workflows`
- `/workflows/new`
- `/workflows/:id`
- `/workflow-output/:id`
- `/chat`
- `/settings/providers`
- `/settings/budgets`
- `/settings/security`

### 4.3 Secondary Routes

These routes remain available for support and advanced workflows, but they are not part of the primary release navigation:

- `/`
- `/auth`
- `/settings`
- `/marketplace`
- `/marketplace/import`
- `/launcher`
- `/import-agents`
- `/macros`
- `/permissions`
- `/inbox`
- `/external-app`
- `/about`
- `/platform`
- `/solutions`
- `/enterprise`
- `/pricing`

## 5. Workflow Operating Model

Every workflow must follow this pipeline:

1. Intake
2. Brief
3. Plan
4. Route
5. Execute
6. Verify
7. Package
8. Preview
9. Audit

### 5.1 Intake

The user enters a business goal, such as:
- “need a modern classy local bar website”
- “review this codebase”
- “generate a research report”

The system must extract:
- objective,
- audience,
- output type,
- constraints,
- risk level,
- and success criteria.

### 5.2 Brief

The system must create a structured brief:
- what the user wants,
- what the workflow should produce,
- what files are expected,
- what quality bar is required,
- what dependencies exist,
- and what must not happen.

### 5.3 Plan

The planner must decide:
- how many stages are needed,
- whether stages are sequential or parallel,
- what each stage owns,
- what artifacts each stage must emit,
- and whether approvals are required.

### 5.4 Route

The router must choose the best skill for each stage using:
- skill metadata,
- category,
- role fit,
- tool fit,
- and output contract fit.

The router must not choose agents randomly.

### 5.5 Execute

Each node runs with:
- the original user brief,
- predecessor outputs,
- predecessor handover summary,
- relevant artifacts,
- and role isolation.

The default runtime for clean DAG workflows is LangGraph-backed execution. The custom engine remains available for fallback shapes that need loop handling or other non-linear behavior, but the runtime must preserve node state, approvals, and replayable output history.

### 5.6 Verify

Each step must be validated for:
- format compliance,
- output quality,
- required files,
- and required artifact presence.

If the step fails, the next step must not pretend it succeeded.

### 5.7 Package

The final product must be packaged into:
- human-readable markdown,
- clean files,
- previewable web output if applicable,
- and audit metadata.

### 5.8 Preview

If the workflow creates a website or web page:
- the preview tab must be the default view,
- the files tab must show a clean project tree,
- and the document tab must contain the agent transcript or summary.

### 5.9 Audit

Every run must record:
- workflow name,
- run id,
- chosen agents,
- provider,
- model,
- prompts,
- tool usage,
- output hashes,
- approvals,
- evaluation result,
- and failure reason if any.

## 6. Agent Selection Rules

### 6.1 Skill Folder Role

The `skills/` folder is the canonical library of role behavior.

It is used for:
- role prompt text,
- capability definition,
- output style expectations,
- tool permissions,
- and fallback agent loading.

It is not a human-facing catalog in the main product story.

### 6.2 Selection Criteria

Skill selection must consider:
- request domain,
- stage label,
- category,
- tool needs,
- output format,
- and whether the role is design, product, engineering, review, or QA.

### 6.3 Agent Handoff Rule

The next agent must receive:
- the original request,
- the prior agent’s output,
- the handover summary,
- and the artifact references.

### 6.4 Failure Rule

If a step fails, the UI and logs must show:
- the agent label,
- the role,
- the node id,
- and the error text.

Never show only `step1` or `step2` to users.

## 7. Workflow Studio Spec

### 7.1 Purpose

Workflow Studio is the place to design, inspect, and run a workflow.

### 7.2 Required Controls

Workflow Studio must include:
- back to workflows,
- workflow name,
- rename,
- save,
- run,
- rerun,
- output,
- files,
- preview,
- approvals,
- evaluation,
- and delete.

### 7.3 Required Views

Workflow Studio must show:
- canvas,
- node inspector,
- current run status,
- execution timeline,
- output pane,
- and file preview panel.

### 7.4 Button Behavior

#### Back
- Returns to the workflow list.
- Must preserve unsaved state if possible.

#### Save
- Persists graph changes.
- Must visibly confirm success.

#### Run
- Executes the workflow immediately.
- Must disable while running.
- Must show live progress.

#### Rerun
- Re-executes the same workflow using current graph settings.
- Must not open a fake editor-only state.

#### Output
- Opens the latest real workflow output.

#### Files
- Opens the clean artifact tree.

#### Preview
- Opens web preview when the output is HTML/web-based.

#### Delete
- Requires confirmation.
- Must explain that history and artifacts may be removed or archived.

## 8. Workflow List Spec

### 8.1 Page Goal

The workflows page is the operational index of runnable workflows.

### 8.2 Card Contents

Each card should show:
- workflow name,
- status badge,
- agent count,
- last edited time,
- current run status,
- last output state,
- run button,
- rerun button,
- output button,
- delete button.

### 8.3 Card Behavior

Clicking a card:
- opens the workflow editor.

Run button:
- starts execution from the list.

Rerun button:
- re-executes the workflow.

Output button:
- opens the latest successful output.

Delete button:
- removes the workflow after confirmation.

### 8.4 Empty State

If no workflows exist, the page must offer:
- create new workflow,
- import workflow,
- or browse templates.

## 9. Output Experience Spec

### 9.1 Output Tabs

The output modal must contain:
- Document
- Files
- Preview

### 9.2 Tab Priority

Default tab logic:
- Preview for web outputs,
- Files for file-based outputs,
- Document for pure narrative outputs.

### 9.3 Document Tab

Must show:
- final transcript,
- step summaries,
- timestamps,
- and evaluation notes when available.

### 9.4 Files Tab

Must show:
- a clean tree,
- human-facing filenames,
- direct file selection,
- copy,
- and download all.

Must not expose raw internal clutter such as:
- `.git`,
- duplicate hidden internals,
- stale artifact copies,
- or noisy node folder artifacts when a clean repo exists.

### 9.5 Preview Tab

Must show:
- the final generated website or app UI,
- not the transcript.

If no preview exists:
- show an explanatory empty state,
- not a broken iframe.

## 10. Filesystem / Artifact Spec

### 10.1 Human-Facing Tree

For web deliverables, the clean output tree should prefer:
- `index.html`
- `style.css`
- `script.js`
- optional images/assets folder

### 10.2 Internal Storage

Internal runtime storage may still use:
- workflow workspace folders,
- node folders,
- repo snapshots,
- and git safety commits.

Those are implementation details, not the user-facing artifact model.

### 10.3 File Naming Rules

Generated files must:
- use lowercase, readable names,
- avoid duplicated `style2.css` unless truly needed,
- and avoid meaningless internal prefixes in the visible UI.

## 11. Company Workspace Spec

Companies are operational workspaces, not just accounts.

### Company Pages

- Dashboard
- Teams
- Agents
- Issues
- Activity
- Reports

### Required Company Buttons

Global company pages should include:
- back to companies,
- create company,
- edit company,
- archive,
- invite member,
- create team,
- add agent,
- create issue,
- export report.

### Company Dashboard

Must summarize:
- active workflows,
- recent runs,
- approvals,
- open issues,
- and top agents.

### Teams

Must show:
- team list,
- create team,
- team detail,
- assign agents,
- edit team,
- archive team.

### Agents

Must show:
- agent list,
- skill source,
- status,
- capabilities,
- and last activity.

### Issues

Must show:
- issue list,
- severity,
- owner,
- workflow link,
- resolution status.

### Activity

Must show:
- chronological events,
- workflow runs,
- approvals,
- audit events,
- and file exports.

### Reports

Must show:
- evaluation summaries,
- quality trends,
- run metrics,
- and exportable artifacts.

## 12. Chat Spec

Chat is a helper surface, not the core product.

### Chat Buttons

- New topic
- Attach
- Send
- Model/provider selector
- Clear topic
- Export conversation

### Chat Behavior

- Messages should be useful, not generic.
- Tool calls and reasoning outcomes should be visible at a high level.
- If a conversation references a workflow, it should link back to the workflow/run.

## 13. Settings Spec

### 13.1 Provider Settings

Must include:
- provider selection,
- model selection,
- API key setup,
- base URL if relevant,
- connection test,
- and saved provider status.

### 13.2 Budget Settings

Must include:
- approval threshold,
- per-run budget,
- per-company budget,
- and failure behavior when the budget is exhausted.

### 13.3 Security Settings

Must include:
- auth mode,
- key encryption,
- workspace permissions,
- approval requirements,
- and tool allowlist/denylist.

### 13.4 Workspace Settings

Must include:
- local mode vs managed mode,
- storage behavior,
- audit retention,
- export controls,
- and data location.

## 14. Button System Standards

Every button in Esemble must follow one of these roles:

- Primary action
- Secondary action
- Destructive action
- Context action
- Navigation action
- Status action

### Button Rules

- Primary action appears once per surface.
- Destructive actions require confirmation.
- Context actions should live near the data they affect.
- Status actions should explain what they do, not just show an icon.
- If a button triggers a long-running job, it must show loading state and be disabled while active.

## 15. Workflow Quality Bar for Web Deliverables

For website generation requests, the final implementation must:
- feel like a real product,
- use clear typography,
- use a premium layout,
- have a strong hero,
- show meaningful sections,
- include responsive behavior,
- include a polished navigation system,
- and avoid basic school-project aesthetics.

The final agent must be instructed to:
- keep the request faithful,
- avoid inventing a different business,
- avoid generic placeholders,
- and emit a project structure that can be previewed immediately.

## 16. Release Definition

Esemble is not release-ready when it merely runs.

It is release-ready when:
- workflows can be designed,
- routes are consistent,
- the right agents are selected,
- outputs are clean,
- preview works,
- failures are explained,
- and the audit record is complete.

## 17. Implementation Order

The recommended implementation order is:

1. Finalize this architecture document.
2. Align workflow planner and router to the spec.
3. Align workflow UI to the spec.
4. Align output and artifact handling to the spec.
5. Align company/workspace pages to the spec.
6. Add evaluation and approval polish.
7. Remove or hide obsolete surfaces from the main navigation.

## 18. Current Gaps To Close

The main gaps remaining are:
- adaptive agent routing after each step,
- stronger output validation for premium web deliverables,
- cleaner artifact packaging,
- richer workflow failure presentation,
- and page-level UX cleanup across the app shell.

## 19. Final Product Goal

Esemble should feel like a serious control plane for AI work:
- calm,
- disciplined,
- auditable,
- and capable of shipping real outputs that a team can trust.
