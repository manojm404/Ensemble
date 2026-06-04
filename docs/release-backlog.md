# Esemble Release Backlog

This document turns the remaining release gaps into implementation-sized tasks.

Use this as the working tracker for release completion:
- mark the top-level checkbox when the task is done,
- add a short completion note under the task,
- and keep the acceptance criteria true before closing it.

## Status Key

- `[ ]` not started
- `[-]` in progress
- `[x]` complete

## Release Queue

- [x] 1. Adaptive workflow routing
- [x] 2. Output quality and packaging
- [x] 3. Failure presentation
- [x] 4. Company workspace polish
- [x] 5. Provider and policy reliability
- [x] 6. Evaluation and approval completion
- [x] 7. Navigation and doc cleanup

## Workflow Studio 2.0 Runtime Foundation

### Goal
Make workflow runs replayable, auditable, and notebook-ready before replacing the remaining visual shell.

### Implementation Slices
- [x] Add durable run event persistence for live run board replay.
- [x] Initialize all workflow nodes into idle/queued state before execution starts.
- [x] Persist validated agent-to-agent handoff messages.
- [x] Return run messages, message threads, and events through status/result APIs.
- [x] Render message-bus threads in the Results Notebook with filter controls.

### Completion Note
Completed on 2026-06-01.
Files touched:
- `core/governance.py`
- `core/dag_engine.py`
- `core/workflows/messages.py`
- `ui/src/components/workflow/WorkflowExecutionPanel.tsx`
- `ui/src/pages/WorkflowOutput.tsx`
- `ui/src/lib/api.ts`
- `tests/test_workflow_studio_runtime.py`
- `tests/test_agent_messages.py`
Notes:
- Added first-class run events and agent messages as the substrate for Workflow Studio 2.0.
- Run status now exposes durable node lanes, events, messages, and threaded message groups.
- Results Notebook now reads the backend message contract instead of only local/mock-style output state.

## Workflow Studio 2.0 Simulation Runtime

### Goal
Make non-linear, chaotic multi-agent workflows executable without squeezing them into a sequential DAG.

### Implementation Slices
- [x] Add a logical-cycle `SimulationRunner`.
- [x] Persist simulation state board versions.
- [x] Persist simulation checkpoints for refresh-safe recovery.
- [x] Persist per-agent simulation logs.
- [x] Reuse the Agent Message Bus for threaded public/private simulation messages.
- [x] Branch `/api/workflows/run` into simulation mode when graph metadata requests it.
- [x] Add `/api/simulation/run` start/status/state/messages/audit/result endpoints.
- [x] Add Quantum Banana acceptance coverage.
- [x] Surface simulation state, checkpoints, logs, and audit events in the Results Notebook.

### Completion Note
Completed on 2026-06-01.
Files touched:
- `core/workflows/simulation.py`
- `core/workflows/__init__.py`
- `core/governance.py`
- `ui/src/lib/api.ts`
- `ui/src/components/workflow/WorkflowExecutionPanel.tsx`
- `ui/src/pages/WorkflowOutput.tsx`
- `tests/test_simulation_runner.py`
- `docs/workflows-redesign.md`
- `docs/release-backlog.md`
Notes:
- Added first runnable Simulation Mode backend slice with logical ticks, state versions, checkpoints, logs, messages, and document result packaging.
- Quantum Banana simulations expand to the mapped 15-agent runtime when the prompt asks for that scenario.
- Simulation results now carry state board snapshots, checkpoints, agent logs, messages, and audit events into the output page.
- Results Notebook now shows a Simulation Inspector with State Board, Checkpoints, Agent Logs, and Audit Timeline panels.
- Workflow Studio now polls simulation runs through the simulation status API, marks completed planned agents as done when the backend run completes, and persists the output bundle immediately so the bottom Output action appears reliably.
- Pause/resume/step controls are wired from the Live Run Board to the simulation control endpoints, with a distinct paused state and checkpoint step feedback.
- Simulation runs now support real manual stepping: the runner checks a persisted cycle-control gate between logical cycles, Pause blocks the next cycle, Step grants one cycle, and Resume returns to automatic execution.
- Magic Flow exposes a Manual stepping option for Simulation mode and writes it into `simulation_defaults.manual_control`.

## How To Use This Backlog

Work on one release item at a time.

For each item:
1. Complete the implementation slices in order.
2. Verify the acceptance criteria in the app and in tests.
3. Mark the top-level checkbox complete only after the full item is done.
4. Add a short completion note with the files changed.

The sub-checklists below are intentionally detailed so they can be used as a practical implementation guide, not just a planning note.

## Task Document Template

Each release item below follows the same structure:
- Goal
- Why it matters
- Scope
- Dependencies
- Backend work
- UI work
- Acceptance criteria
- Implementation slices
- Verification
- Done when
- Completion note

When a task is complete, add a completion note in this format:

```md
### Completion Note
Completed on YYYY-MM-DD.
Files touched:
- `path/to/file`
- `path/to/file`
Notes:
- short summary of what changed
```

## 1. Adaptive Workflow Routing

### Goal
Make workflow generation consistently pick the right specialists for the user’s prompt and show a clear route explanation.

### Why It Matters
This is the main gap between a generic agent graph and a premium governed workflow product. If routing feels random, the entire workflow canvas feels untrustworthy.

### Scope
- Improve the planner so it understands prompt domain, output type, and risk level.
- Route all major domains with purpose-fit specialists.
- Persist selection reasons for each stage.
- Show stage names and routing rationale in the editor, run console, and output pages.

### Dependencies
- Workflow template generation
- Agent skill registry metadata
- Workflow save/load persistence
- Run status payloads

### Backend Work
- Tighten the prompt classifier and domain router in `core/governance.py`.
- Ensure stage planning uses explicit role fit and artifact fit, not just keywords.
- Add clear routing metadata to run records.
- Preserve requested agent count and only compress plans intentionally.

### UI Work
- Show the route explanation in the workflow editor.
- Show per-node selection reason during execution.
- Show the route summary in output views.

### Acceptance Criteria
- A prompt about research produces research-oriented stages.
- A prompt about web design produces product/web-oriented stages.
- The UI explains why each agent was chosen.
- The workflow does not fall back to generic agent labels for domain-specific prompts.

### Verification
- Test at least one research prompt.
- Test at least one website prompt.
- Test at least one code review or content prompt.
- Confirm the route summary survives a refresh.

### Done When
- [x] Prompt-specific workflows route correctly across the main supported domains.
- [x] Each generated node has a readable stage name and selection reason.
- [x] Route metadata survives save/load and run playback.

### Implementation Slices
- [x] Review the current routing domains and stage templates.
- [x] Tighten the prompt classification rules for research, web, content, code, and compliance requests.
- [x] Make route selection reasons specific to the chosen domain.
- [x] Ensure generated nodes carry stage names instead of generic step labels.
- [x] Persist route metadata into workflow saves and run records.
- [x] Verify the editor, run console, and output page all display the same route metadata.
- [x] Test at least one prompt from each major release domain.

### Completion Note
Completed on 2026-05-31.
Files touched:
- `core/governance.py`
- `tests/test_workflow_generation.py`
- `ui/src/pages/WorkflowEditor.tsx`
- `ui/src/components/workflow/WorkflowExecutionPanel.tsx`
- `ui/src/pages/WorkflowOutput.tsx`
Notes:
- Added dedicated routing for news/article, local business web, code review, and compliance workflows.
- Persisted route evidence and stage plans through save/load, run playback, and output surfaces.
- Verified the routing test suite and frontend build after the changes.

## 2. Output Quality and Packaging

### Goal
Make outputs feel like a real deliverable bundle, not just an execution transcript.

### Why It Matters
Users need preview, files, and document tabs to feel intentional and trustworthy.

### Scope
- Strengthen packaging for web deliverables and report outputs.
- Keep the preview tab as the default for web content.
- Keep the file tree clean and human-facing.
- Make output summaries readable and presentation-ready.

### Dependencies
- Backend workflow run outputs
- Artifact hydration and normalization
- Output viewer tab selection logic

### Backend Work
- Ensure final output metadata includes package type, artifact count, and preview availability.
- Keep file artifacts normalized and ordered.
- Remove noisy internal artifact paths from user-facing output.

### UI Work
- Keep Preview / Files / Document behavior consistent.
- Default to the correct tab based on output type.
- Make the file tree surface the best human-facing filenames first.

### Acceptance Criteria
- Generated websites open directly in Preview.
- Files tab shows a clean tree.
- Document tab shows the transcript or summary.
- No raw internal clutter is exposed in the main output UI.

### Verification
- Run a web workflow and confirm Preview opens first.
- Run a file-only output and confirm Files opens correctly.
- Refresh the page and confirm the output remains readable.

### Done When
- [x] Web outputs open in Preview by default.
- [x] File trees are clean and readable.
- [x] Output summaries show package metadata clearly.

### Implementation Slices
- [x] Inspect current output storage and artifact hydration paths.
- [x] Normalize package metadata for web and document outputs.
- [x] Sort user-facing files so the primary deliverables appear first.
- [x] Remove duplicate or noisy artifact paths from the visible UI.
- [x] Keep preview-first behavior for HTML/web output types.
- [x] Make the document tab present the transcript and evaluation notes clearly.
- [x] Verify file-only outputs still open correctly after refresh.

### Completion Note
Completed on 2026-06-01.
Files touched:
- `core/governance.py`
- `ui/src/components/workflow/OutputViewer.tsx`
- `ui/src/components/workflow/WorkflowExecutionPanel.tsx`
- `ui/src/pages/WorkflowOutput.tsx`
- `tests/test_workflow_generation.py`
Notes:
- Normalized artifact display paths at the backend and UI layers so repo/step prefixes no longer leak into the user-facing file tree.
- Preserved package metadata in the workflow output store and refreshed output page so preview/files/document summaries stay consistent.
- Verified the routing and packaging-related test suite plus the UI build.

## 3. Failure Presentation

### Goal
Make failures understandable immediately.

### Why It Matters
Broken runs should explain what failed, where it failed, and what artifact or step was affected.

### Scope
- Surface the failing agent name.
- Surface the failure reason in plain language.
- Surface the impacted node or artifact.
- Keep the run console and workflow list consistent.

### Dependencies
- Run status API
- Node status serialization
- Workflow list card state

### Backend Work
- Preserve failure metadata in run status and audit records.
- Ensure node status includes label, role, and error text.

### UI Work
- Make failure states visually distinct.
- Show the failed agent first, not generic step numbers.
- Keep the error readable without opening raw logs.

### Acceptance Criteria
- A failed run says which agent failed.
- The reason is visible without extra clicks.
- Users can tell whether the failure is input, provider, validation, or governance related.

### Verification
- Force at least one provider failure.
- Force at least one validation failure.
- Confirm the list view and run console use the same wording.

### Done When
- [x] Failed steps always show agent identity and reason.
- [x] Run console and list views show consistent failure labels.
- [x] No generic `step1` / `step2` failures are shown to users.

### Implementation Slices
- [x] Audit run status payloads for label, role, node id, and error text.
- [x] Keep backend failure metadata attached to the failing node.
- [x] Update the run console to prioritize the failing agent name.
- [x] Update workflow list cards so failures read like real agent errors.
- [x] Distinguish validation, provider, approval, and runtime failures.
- [x] Confirm that no fallback text reverts to step-number-only labels.

### Completion Note
Completed on 2026-06-01.
Files touched:
- `core/governance.py`
- `ui/src/lib/api.ts`
- `ui/src/components/workflow/WorkflowExecutionPanel.tsx`
- `ui/src/components/workflow/AgentStepTracker.tsx`
- `ui/src/pages/Workflows.tsx`
- `tests/test_workflow_generation.py`
Notes:
- Added backend failure classification for provider, validation, approval, governance, and runtime errors.
- Surfaced the failure label and reason in the run console, workflow list, and step tracker so users see the failing agent clearly.
- Added regression coverage so the failure taxonomy stays distinct from routing tests.

## 4. Company Workspace Polish

### Goal
Turn companies into a real operational workspace, not just a decorative account shell.

### Why It Matters
The company area is the product’s operational home. It should look and behave like a serious workspace.

### Scope
- Improve the command center pages.
- Make activity, issues, reports, teams, and agents feel connected to actual runs.
- Keep back navigation and tab behavior reliable.

### Dependencies
- Tenant scoping
- Company dashboard aggregates
- Tab persistence and scroll memory

### Backend Work
- Ensure company data is truly tenant-scoped.
- Continue linking issues, activity, reports, and runs.
- Derive health from real signals, not fake metrics.

### UI Work
- Clean up action placement.
- Keep company cards and subpages operational.
- Make reports and activity feel trustworthy and current.

### Acceptance Criteria
- Company dashboard shows real operational data.
- Reports are exportable and meaningful.
- Subpages feel like part of one workspace system.

### Verification
- Open a company page, switch tabs, and return without losing context.
- Export a report and confirm it matches current workspace data.
- Check that activity and issues point to actual runs.

### Done When
- [x] Company dashboard reads like a command center.
- [x] Teams, issues, activity, and reports feel operational.
- [x] Back navigation and tab persistence are reliable across company pages.

### Implementation Slices
- [x] Recheck company dashboard metrics so they are derived from real signals.
- [x] Confirm teams, agents, issues, and reports all resolve to the current tenant.
- [x] Clean up action placement on the company command center pages.
- [x] Keep tab state and scroll state stable across the company surface.
- [x] Ensure reports are exportable and match the visible workspace data.
- [x] Confirm back-to-companies and nested-page navigation remain consistent.

### Completion Note
Completed on 2026-06-01.
Files touched:
- `core/company_routes.py`
- `ui/src/lib/company-data.ts`
- `ui/src/pages/CompanyCommandCenter.tsx`
- `ui/src/pages/CompanyAgents.tsx`
- `ui/src/pages/CompanyTeams.tsx`
- `ui/src/pages/CompanyIssues.tsx`
- `ui/src/pages/CompanyActivity.tsx`
- `ui/src/pages/CompanyReports.tsx`
- `tests/test_company_routes.py`
Notes:
- Added a tenant-scoped company operations endpoint that derives health, approvals, blocked items, failed runs, agent health, recent runs, activity, and artifacts from persisted company and workflow signals.
- Wired the command center and reports page to use backend operations data first, with local cache as fallback.
- Report export now includes the same operations payload visible in the workspace UI.
- Consolidated workspace-level actions into a command-center action rail and changed nested pages to return to the workspace before returning to the company list.
- Added scroll-memory keys for company workspace, agents, teams, issues, activity, and reports.
- Fixed direct nested company routes so back navigation uses the route company id instead of stale ambient company context.
- Verified with backend route tests, frontend production build, and browser smoke checks for Reports and Agents navigation.

## 5. Provider and Policy Reliability

### Goal
Prevent avoidable run failures caused by bad credentials, unsupported models, or missing policy configuration.

### Why It Matters
Provider setup is a release blocker class issue. If this is unstable, everything downstream becomes noisy.

### Scope
- Validate provider credentials before save.
- Restrict model selections to supported options.
- Make policy validation clear and actionable.
- Keep local and managed setups understandable.

### Dependencies
- Provider settings API
- Encryption key validation
- Supported model registry

### Backend Work
- Harden provider test endpoints and validation responses.
- Make invalid keys, base URLs, and unsupported models explicit.
- Keep the encryption and storage path safe.

### UI Work
- Show provider status clearly.
- Explain what is missing and how to fix it.
- Keep the settings pages focused on setup and trust, not noise.

### Acceptance Criteria
- Provider test works before workflow execution.
- Invalid keys are visible immediately.
- Unsupported models cannot be selected silently.

### Verification
- Test with a valid provider key.
- Test with an invalid provider key.
- Test with an unsupported model name.

### Done When
- [x] Provider testing is reliable.
- [x] Supported model choices are curated and explicit.
- [x] Policy validation explains failures clearly.

### Implementation Slices
- [x] Validate the provider test endpoint end to end.
- [x] Limit the visible model list to supported, tested models.
- [x] Make key and base URL validation readable in the UI.
- [x] Ensure policy settings can be saved and reloaded consistently.
- [x] Confirm invalid provider settings block execution before workflow run.
- [x] Verify settings copy explains the failure and the fix.

### Completion Note
Completed on 2026-06-03. Provider setup now blocks unsupported managed-provider models, keeps OpenAI-compatible endpoints free-form but test-gated, normalizes compatible base URLs, gives readable provider/key/base URL failures, and prevents workflow execution when the saved provider config is invalid. Policy settings now validate threshold and timeout values before persistence, reload correctly, and show actionable UI copy.

Implementation files:
- `core/governance.py`
- `core/llm_provider.py`
- `core/settings.py`
- `ui/src/components/settings/ProvidersSettings.tsx`
- `ui/src/pages/Settings.tsx`
- `tests/test_provider_settings.py`

Verification:
- `python -m py_compile core/governance.py core/llm_provider.py core/settings.py`
- `pytest tests/test_provider_settings.py -q`
- `pytest tests/test_workflow_generation.py -q`
- `npm run build`

## 6. Evaluation and Approval Completion

### Goal
Close the trust loop so completed runs always show evaluation and approval state.

### Why It Matters
Esemble is release-ready only when the product can say whether the run was acceptable and whether a human had to approve it.

### Scope
- Make evaluation visible in the workflow run output.
- Make approval state visible in the run console and workspace pages.
- Keep the approval queue decision-ready.

### Dependencies
- Evaluation result persistence
- Approval queue records
- Run console state sync

### Backend Work
- Persist evaluation results consistently.
- Persist approval state consistently.
- Make completed runs always expose the review result.

### UI Work
- Show evaluation score / pass-fail / notes.
- Show approval pending / approved / rejected states.
- Keep the review surface lightweight but actionable.

### Acceptance Criteria
- Users can see evaluation results without leaving the workflow result.
- Approval state is visible on completed or paused runs.
- The queue is decision-ready.

### Verification
- Run a workflow that completes successfully.
- Run a workflow that pauses for approval.
- Confirm evaluation and approval data appear consistently everywhere.

### Done When
- [x] Evaluation appears on completed runs consistently.
- [x] Approval state is visible in workflow and company views.
- [x] The approval queue is usable without opening raw logs.

### Implementation Slices
- [x] Confirm evaluation results are stored on completion.
- [x] Show evaluation score, pass/fail, and summary in output views.
- [x] Surface approval pending / approved / rejected states in the run console.
- [x] Make approval queue cards decision-ready without raw log hunting.
- [x] Keep the evaluation and approval states synchronized across workflow and company surfaces.
- [x] Verify completed runs always show a visible review outcome.

### Completion Note
Completed on 2026-06-03. Completed workflows now hydrate evaluation summaries into the run console and output surface, the approval queue shows workflow/run context and direct navigation instead of raw JSON only, and company surfaces already reflect approvals waiting plus evaluation pass rate. This closes the trust loop without changing the existing approval backend model.

Implementation files:
- `ui/src/components/workflow/WorkflowExecutionPanel.tsx`
- `ui/src/pages/Permissions.tsx`

Verification:
- `npm run build`

## 7. Navigation and Doc Cleanup

### Goal
Remove stale surfaces and keep the release navigation/doc surface compact.

### Why It Matters
Too many surfaces make the product feel unfinished and dilute the control-plane story.

### Scope
- Keep primary navigation focused on the release product.
- Hide or archive obsolete surfaces that compete with the core flow.
- Keep the documentation set canonical.

### Dependencies
- Route map
- Top bar / sidebar nav
- README and docs index

### Backend / Product Work
- Remove or hide stale routes from primary discovery.
- Keep the release docs linked from one canonical place.

### UI Work
- Simplify top-level navigation where possible.
- Keep advanced surfaces out of the main path unless needed.

### Acceptance Criteria
- The user only sees the release-facing surfaces by default.
- The docs surface is easy to understand and not redundant.

### Verification
- Review the sidebar and top bar from a fresh session.
- Confirm the canonical docs links are still discoverable.
- Confirm hidden surfaces are not part of the default release path.

### Done When
- [x] Primary navigation is trimmed to release surfaces.
- [x] Canonical docs remain discoverable.
- [x] Obsolete product surfaces are hidden or clearly secondary.

### Completion Note
Completed on 2026-06-04. The primary rail now centers the release surfaces, advanced surfaces moved into a collapsed secondary utilities section, the top bar no longer duplicates launcher/settings entry points, and the README now points users to the canonical architecture doc first.

Implementation files:
- `ui/src/components/layout/Sidebar.tsx`
- `ui/src/components/layout/TopBar.tsx`
- `README.md`
- `docs/release-backlog.md`

### Implementation Slices
- [x] Review current top-level navigation and secondary routes.
- [x] Hide or demote any release-irrelevant product surfaces.
- [x] Keep the canonical docs linked from one clear entry point.
- [x] Remove duplicate documentation references from the main path.
- [x] Confirm the remaining navigation matches the release story.
- [x] Verify the app still exposes advanced surfaces when needed, but not as primary distractions.

## Completion Rule

When a task is finished:

1. Change its checkbox to `[x]`.
2. Add a short completion note under the task.
3. Link the implementation files that were changed.
4. Keep the acceptance criteria visible for the next review.

## Completion Log

Use this section to record what was finished and when.

- [x] Adaptive workflow routing
  - Completion note: Finished on 2026-06-01 with prompt-aware blueprint routing, strict stage matching, agent shortlist scoring, and exact-role incident/product workflow preservation.
- [x] Output quality and packaging
  - Completion note: Finished on 2026-06-01 with clean document/package output flows, previewable artifacts, and run outputs aligned to the workflow contract.
- [x] Failure presentation
  - Completion note: Finished on 2026-06-01 with durable failure-state retention, visible failed-step evidence, and run-status surfaces that keep the error story intact.
- [x] Company workspace polish
  - Completion note: Finished on 2026-06-01 with operations-backed metrics, exportable reports, command-center actions, route-safe nested navigation, and company scroll memory.
- [x] Provider and policy reliability
  - Completion note: Finished on 2026-06-03 with curated provider model enforcement, readable provider/key/base URL failures, OpenAI-compatible custom endpoint support, workflow-run provider preflight, and validated policy save/reload behavior.
- [x] Evaluation and approval completion
  - Completion note: Finished on 2026-06-03 with visible evaluation hydration in the run console, output-page review scores, and decision-ready approval queue cards plus company-level approval visibility.
- [x] Navigation and doc cleanup
  - Completion note: Completed on 2026-06-04 with a trimmed primary navigation rail, collapsed secondary utilities entry points, removal of duplicate top-bar launcher/settings shortcuts, and a canonical-docs pointer in the README.
