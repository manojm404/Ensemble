# Esemble Product Plan

For the full end-to-end product architecture, page/button spec, workflow contract, and implementation sequence, see [ensemble-architecture.md](./ensemble-architecture.md).

## Product Direction

Esemble is a governed agent workflow platform for repeatable, auditable AI work.

The product should not launch as a broad "autonomous AI company" or a catalog of hundreds of agents. It should launch as a focused control plane for agentic workflows:

- design the SOP,
- run the workflow,
- govern risky actions,
- evaluate the output,
- preserve the audit record.

## One-Line Pitch

Design, run, evaluate, and audit AI agent workflows with human approval, budget control, artifact lineage, and local-first deployment.

## Why This Direction

Market research points to the same adoption blocker: organizations are interested in agents, but they do not trust uncontrolled agent behavior in production.

Evidence:

- Gartner reported that over 40% of agentic AI projects may be canceled by the end of 2027 because of cost, unclear value, or inadequate risk controls.
- Deloitte's 2026 enterprise AI research says agentic AI usage is rising while only one in five companies has a mature governance model for autonomous AI agents.
- IBM and other enterprise vendors are positioning agent orchestration around guardrails, identity, credential control, observability, and audit logging.

Decision:

Esemble should compete on trust, governance, evaluation, and auditability rather than generic agent creation.

## Target Users

### Operations Owner

Owns repeatable work such as research reports, code reviews, policy reviews, compliance checks, or internal analysis.

Needs:

- create repeatable workflows,
- see where a run is blocked,
- compare runs,
- export evidence.

### Technical Admin

Configures providers, API keys, data mode, workspace permissions, and security policy.

Needs:

- provider testing,
- credential isolation,
- local/cloud data clarity,
- backup and deployment path.

### Reviewer / Approver

Approves sensitive steps and validates final outputs.

Needs:

- clear approval cards,
- attached evidence,
- evaluation criteria,
- fast accept/reject flow.

## Release Scope

### In

- Companies workspace tab
- Dashboard
- Template Gallery
- Workflow Studio
- Run Console
- Approval Center
- Evaluation Review
- Audit Center
- Provider Settings
- Budget Settings
- Local SQLite mode
- Supabase team mode
- Audit export

### Out For First Release

- Marketplace as primary nav
- 186-agent catalog as primary onboarding
- Autonomous company simulation as top-level metaphor
- Universal import as first-run path
- Complex macro marketplace
- External AI app launcher as core experience

Those can remain as advanced features later.

Important distinction:

Companies are in scope as **workspaces**. The "autonomous company simulation" metaphor is out of scope as the main product story.

## Core Architecture

```text
UI
  Companies
  Company Dashboard
  Dashboard
  Templates
  Workflow Studio
  Run Console
  Approvals
  Audit
  Settings

API
  Company API
  Team API
  Agent Assignment API
  Issue API
  Workflow API
  Execution API
  Approval API
  Evaluation API
  Audit Export API
  Provider Settings API
  Policy API

Runtime
  LangGraphRuntime
  DAGWorkflowEngine fallback
  ManagedAgent
  RunnerFactory
  LLMProvider
  ToolRegistry

Governance
  BudgetEnforcer
  ApprovalManager
  AuditLogger
  SecurityPolicy
  EvaluationEngine

Storage
  SQLite local mode
  Supabase team mode
  Company records
  Team records
  Agent assignment records
  Issue records
  CAS artifact blobs
  Workspace files
  RAG index
```

## Primary Navigation

```text
/                         Dashboard
/companies                Companies list
/companies/new            Create company
/company/:id              Company dashboard
/company/:id/agents       Company agents
/company/:id/teams        Company teams
/company/:id/issues       Company issues
/company/:id/activity     Company activity
/company/:id/reports      Company reports
/templates                Template gallery
/workflows                Workflow list
/workflows/:id            Workflow Studio
/runs                     Run history
/runs/:runId              Run Console and results
/approvals                Approval Center
/audit                    Audit Center
/settings/providers       Model provider setup
/settings/budgets         Budget limits
/settings/security        Tool and data policies
/settings/workspace       Local/Supabase/workspace settings
```

## Release Templates

### Governed Research Report

Problem:

Research reports are slow, inconsistent, and hard to verify.

Workflow:

1. Researcher gathers candidate sources.
2. Source Verifier checks relevance and reachability.
3. Analyst extracts findings and trade-offs.
4. Writer creates final report.
5. Evaluator checks source coverage, structure, and unresolved claims.
6. Human reviewer accepts or requests revision.

Output:

- final report,
- source table,
- evaluation result,
- audit package.

### Secure Code Review

Problem:

AI code review can be noisy, untracked, and hard to trust.

Workflow:

1. Repo Scanner summarizes changed areas.
2. Security Reviewer identifies risks.
3. Test Planner proposes verification.
4. Patch Advisor suggests changes.
5. Evaluator checks evidence and severity.
6. Human approval gates any write operation.

Output:

- review findings,
- severity list,
- suggested tests,
- audit package.

### Compliance-Safe Content Review

Problem:

Marketing or external content needs claim checking and approval.

Workflow:

1. Content Creator drafts.
2. Claims Checker extracts factual claims.
3. Source Verifier validates evidence.
4. Compliance Reviewer flags risky wording.
5. Evaluator checks claims, disclaimers, and approval readiness.
6. Human approval gates publishing.

Output:

- approved draft,
- claim evidence table,
- risk notes,
- audit package.

## Feature Specifications

### Companies

Purpose:

Companies are operational workspaces. A company groups agents, teams, workflows, issues, budgets, approvals, artifacts, and audit history around one business mission.

This gives users a simple mental model:

- company = workspace,
- teams = groups of agents,
- agents = employees assigned to work,
- issues = tasks/work requests,
- workflows = SOPs used to complete work,
- activity = observable work history,
- reports = outcomes and audit summaries.

How company creation works:

1. User clicks Create Company.
2. User enters company name and mission.
3. Esemble offers two setup modes:
   - Quick Start: create empty company with one default Operations team.
   - Auto-Build: recommend teams, agents, and starter workflows from the mission.
4. User reviews the proposed structure before creating it.
5. Backend persists company, teams, agent assignments, and default budget/policy.
6. User lands on the company dashboard.

Release rule:

Auto-Build must be reviewable before creation. Do not silently create a large agent organization.

Company fields:

- name,
- mission,
- industry/use case,
- owner/user,
- status,
- budget policy,
- default provider,
- created_at,
- updated_at.

Company dashboard shows:

- mission and status,
- active agents,
- running issues,
- workflows in progress,
- pending approvals,
- evaluation pass rate,
- monthly cost,
- recent activity,
- recent artifacts/reports.

Release rule:

Company health should be based on real signals: blocked issues, failed runs, approval backlog, budget risk, and evaluation failures.

### Company Agents

Purpose:

Let users monitor agent employees working inside a company.

Agent states:

- `idle`: available for work,
- `running`: currently assigned to a run or issue,
- `waiting_for_approval`: blocked on human approval,
- `blocked`: failed or missing dependency,
- `paused`: manually disabled.

Agent card shows:

- name,
- role,
- team,
- current task,
- model/provider,
- tools allowed,
- last activity,
- issues completed,
- evaluation pass rate,
- cost this month.

How monitoring works:

1. Runtime updates agent state during workflow execution.
2. Company dashboard aggregates state by company.
3. Agent detail shows recent runs, artifacts, approvals, and failures.
4. User can pause, resume, reassign, or inspect an agent.

Release rule:

Do not show fake productivity metrics. If data is unavailable, show "not enough run history."

### Company Teams

Purpose:

Group agents by function so a company is easy to understand.

Default teams by template:

- Operations
- Research
- Engineering
- Review / Compliance

How it works:

1. Auto-Build recommends teams from mission.
2. User can add, rename, or remove teams.
3. Agents belong to one primary team.
4. Issues and workflows can be routed to a team.

Release rule:

Teams should simplify routing and monitoring, not become complex HR hierarchy.

### Company Issues

Purpose:

Issues are task requests inside a company. They are the easiest way for a user to ask the AI workforce to do work.

Issue lifecycle:

- `draft`
- `queued`
- `assigned`
- `running`
- `waiting_for_approval`
- `completed_passed`
- `completed_needs_review`
- `failed`
- `cancelled`

How it works:

1. User creates issue with title, description, priority, and optional team/agent.
2. Esemble recommends a workflow or agent route.
3. User confirms assignment.
4. Workflow run starts.
5. Issue links to run ID, artifacts, evaluation, and audit package.

Release rule:

Every completed issue must link to the workflow run that produced the result.

### Company Activity

Purpose:

Give users a live operational feed of what agents are doing.

Activity event types:

- company created,
- team created,
- agent hired/assigned,
- issue created,
- workflow started,
- agent step completed,
- approval requested,
- approval decided,
- evaluation completed,
- artifact produced,
- audit exported,
- failure/blocker.

Release rule:

Activity should be derived from audit events where possible, not maintained as a separate fake timeline.

### Company Reports

Purpose:

Show outcomes at the company level.

Reports include:

- weekly work summary,
- cost by team/agent/workflow,
- evaluation pass rate,
- approval bottlenecks,
- failed runs,
- artifacts produced,
- audit exports.

Release rule:

Reports should help the user manage the company workspace, not just show decorative charts.

### Dashboard

Purpose:

Show operational health, not vanity activity.

Shows:

- active runs,
- runs needing approval,
- evaluation pass rate,
- cost this month,
- failed or blocked runs,
- recent audit exports.

Release rule:

Execution completion and evaluation pass rate must be separate metrics.

### Template Gallery

Purpose:

Give users a working starting point.

How it works:

1. User chooses a template.
2. Template creates a workflow graph with roles, quality gates, and approval policy.
3. User enters task-specific input.
4. User can run immediately or customize.

Release rule:

Each template must include sample input and expected output shape.

### Workflow Studio

Purpose:

Design and edit SOPs.

Node types:

- Agent node
- Approval node
- Evaluation node
- Tool node
- Artifact node

Validation rules:

- no unsupported cycles,
- every agent has a role prompt,
- terminal workflows include evaluation,
- approval nodes have a reason and policy,
- provider settings are valid,
- output contracts are defined.

Release rule:

The Run button should surface validation errors before execution.

### Run Console

Purpose:

Make execution understandable.

Run states:

- `queued`
- `running`
- `waiting_for_approval`
- `evaluating`
- `completed_passed`
- `completed_needs_review`
- `failed`
- `cancelled`

How it works:

1. User starts workflow.
2. Backend snapshots workflow version.
3. DAG engine executes nodes.
4. Each step writes artifacts to CAS.
5. Audit logger records model calls, tool calls, costs, approvals, and artifacts.
6. Evaluation runs before final success.

Release rule:

A run is not successful until evaluation passes or a reviewer explicitly accepts it.

### Agent Runtime

Purpose:

Execute role-specific work within policy and budget.

How it works:

1. `ManagedAgent` receives role prompt, task input, prior artifacts, available tools, and policy.
2. Input limiter trims or summarizes oversized context.
3. Budget enforcer reserves expected spend.
4. LLM provider executes the model call.
5. Tool calls are checked against policy.
6. Output is committed to CAS.
7. Spend is confirmed or released.

Release rule:

Agent output should include summary, produced artifacts, risks, and open questions.

### Evaluation Engine

Purpose:

Determine whether output is good enough.

Evaluation types:

- checklist evaluation,
- source/citation verification,
- JSON schema validation,
- reviewer rubric,
- test command result,
- LLM-as-judge with evidence requirement.

How it works:

1. Workflow defines criteria.
2. Evaluation node receives final output and relevant artifacts.
3. Deterministic checks run first.
4. Optional LLM review runs second.
5. Result is `pass`, `needs_review`, or `fail`.
6. Result is logged and attached to the audit package.

Release rule:

Every release template must produce an evaluation result.

### Approval Center

Purpose:

Keep humans in control of risky steps.

Approval triggers:

- cost threshold exceeded,
- sensitive tool request,
- external network call,
- file deletion or overwrite,
- publish/deploy/send action,
- low evaluation score.

Approval card includes:

- requesting agent,
- requested action,
- reason,
- cost/risk estimate,
- relevant artifacts,
- approve/reject buttons,
- optional comment.

Release rule:

Approval requests must be decision-ready without opening raw logs.

### Budget Control

Purpose:

Prevent runaway cost.

How it works:

1. Runtime estimates cost before LLM/tool calls.
2. Budget enforcer checks available spend.
3. Escrow reserves expected cost.
4. Actual usage confirms spend.
5. Unused escrow is released.
6. Thresholds trigger approval.

Release rule:

Failed or canceled runs must release unused escrow.

### Artifact System

Purpose:

Make outputs durable and reviewable.

How it works:

1. Deliverables are written to CAS.
2. Manifest stores symbolic name, hash, state, user/company, and timestamp.
3. Runs reference artifact hashes.
4. Audit export includes hashes and readable copies.

Release rule:

UI must show artifact history for a run.

### Audit Center

Purpose:

Turn a run into a shareable record.

Audit package includes:

- workflow name and version,
- run ID,
- user ID,
- agent IDs,
- model/provider metadata,
- tool calls,
- approval decisions,
- cost and token usage,
- artifact hashes,
- evaluation criteria and result,
- final deliverables.

Release rule:

Audit export must be understandable to a non-engineering stakeholder.

### Company Budgets And Policies

Purpose:

Give each company its own operational limits.

Company-level controls:

- monthly spend cap,
- per-run cap,
- approval threshold,
- default provider,
- allowed tools,
- allowed domains,
- workspace path,
- data retention policy.

How it works:

1. Company has default policy.
2. Teams and workflows inherit company policy.
3. Agent-specific overrides are allowed only when explicit.
4. Runtime checks company policy before tool/model calls.
5. Budget dashboard aggregates spend at company, team, workflow, and agent levels.

Release rule:

Company policy must be enforced by runtime, not just shown in the UI.

### Provider Settings

Purpose:

Support cloud and local models without confusing the user.

How it works:

1. User configures provider.
2. API keys are encrypted at rest.
3. Provider test verifies credentials.
4. Workflow nodes inherit default provider or override model.
5. UI labels which data leaves the machine.

Release rule:

Provider test must happen before workflow execution.

### Security Policy

Purpose:

Constrain tools and data access.

Policy dimensions:

- agent to tool permissions,
- agent to workspace permissions,
- domain allowlist,
- approval requirements,
- dry-run mode,
- storage quota.

Release rule:

Policy denial must explain what was denied and how to fix it.

## Data Additions Needed

```text
workflow_evaluations
  id
  user_id
  workflow_id
  run_id
  status
  criteria_json
  result_json
  score
  reviewer_id
  created_at

artifact_versions
  id
  user_id
  run_id
  symbolic_name
  hash
  artifact_type
  created_at

audit_exports
  id
  user_id
  run_id
  format
  export_hash
  created_at

companies
  id
  user_id
  name
  mission
  industry
  status
  default_provider
  budget_policy_json
  security_policy_json
  created_at
  updated_at

company_teams
  id
  company_id
  name
  description
  created_at
  updated_at

company_agents
  id
  company_id
  team_id
  skill_id
  display_name
  role
  status
  model_provider
  model_name
  tool_policy_json
  created_at
  updated_at

company_issues
  id
  company_id
  team_id
  assigned_agent_id
  workflow_id
  run_id
  title
  description
  priority
  status
  result_artifact_hash
  evaluation_id
  created_at
  updated_at
```

## Implementation Milestones

### Milestone 1: Simplify Product Surface

- Update main navigation.
- Add Companies as the workspace layer.
- Move marketplace/import/company simulation language into advanced areas.
- Rewrite product copy around governed workflows.
- Add template-first entry point.

### Milestone 1A: Companies Workspace Foundation

- Replace localStorage-only company state with backend persistence.
- Add create company API with reviewable Auto-Build proposal.
- Add company dashboard backed by real runs, issues, approvals, and audit events.
- Add agent state model.
- Link issues to workflow runs.
- Add company-level budget and policy inheritance.

### Milestone 2: Evaluation Foundation

- Add `core/evaluation.py`.
- Add evaluation result persistence.
- Add evaluation node support in DAG engine.
- Add evaluation panel in UI.
- Add tests for pass/fail/needs_review.

### Milestone 3: Audit Export

- Add audit export service.
- Add Markdown export.
- Add JSON export.
- Include artifact hashes and evaluation.
- Add UI export button.

### Milestone 4: Release Templates

- Create three template definitions.
- Add sample inputs.
- Add validation rules.
- Add smoke tests.

### Milestone 5: Reliability Pass

- Normalize run statuses.
- Improve error states.
- Preserve partial artifacts on failure.
- Verify SQLite local mode.
- Verify Supabase team mode.

## Decision Records

### D1: Governed workflows, not autonomous company

Evidence:

Agent frameworks and no-code builders are crowded. Enterprise adoption blockers center on governance, audit, cost, identity, and reliability.

Decision:

Lead with controlled SOP execution and auditability.

Trade-off:

Less flashy, more credible for real buyers.

### D2: Evaluation before marketplace

Evidence:

Without evaluation, the system can log activity but cannot prove outcome quality.

Decision:

Build evaluation as release-critical. Defer marketplace as primary navigation.

Trade-off:

Less ecosystem breadth at launch, stronger trust story.

### D3: Curated templates before large agent catalog

Evidence:

Users buy completed workflows, not agent inventory. Large catalogs create choice overload.

Decision:

Keep the agent library, but present curated workflow templates first.

Trade-off:

Less impressive catalog-first demo, faster first user success.

### D4: Local-first plus team mode

Evidence:

Privacy-sensitive teams need local execution; teams also need auth and shared records.

Decision:

Keep SQLite/local mode and Supabase/team mode.

Trade-off:

More QA burden, stronger differentiation.

### D5: Audit package as a product artifact

Evidence:

Governance-sensitive teams need shareable evidence.

Decision:

Treat audit export as a primary feature.

Trade-off:

Requires tighter event and artifact consistency.

### D6: Companies as workspaces, not simulation

Evidence:

Users want an easy way to create a working environment and monitor agents as employees. The repo already has company pages, company context, teams, agents, issues, and activity concepts.

Decision:

Keep Companies as a first-class workspace tab, but define it operationally: companies own teams, agents, issues, workflows, budgets, approvals, artifacts, and audit history.

Trade-off:

The company metaphor remains intuitive, but we avoid making the release feel like a toy simulation.

## Release Checklist

Product:

- [ ] Company creation works in Quick Start and Auto-Build modes.
- [ ] Company dashboard shows real agent, issue, run, approval, cost, and evaluation signals.
- [ ] Company agents show real runtime state.
- [ ] Issues link to workflow runs and artifacts.
- [ ] First-run template path works without explanation.
- [ ] Three templates run end to end.
- [ ] Evaluation result shown for every completed run.
- [ ] Approval path tested.
- [ ] Audit export works.
- [ ] Empty states are useful.
- [ ] Error states explain recovery.

Engineering:

- [ ] Backend tests pass.
- [ ] UI builds.
- [ ] Provider test flow works.
- [ ] Local SQLite mode works.
- [ ] Supabase mode works.
- [ ] No hardcoded demo-only success metrics.

Go-to-market:

- [ ] Landing copy says "governed agent workflows."
- [ ] Demo uses one workflow from input to audit export.
- [ ] Docs include local quick start.
- [ ] Docs include self-hosting path.
- [ ] Pricing/packaging does not depend on marketplace.

## Release Finish Plan

The architecture is defined. The remaining work should be executed in this order so the product reaches release with minimal churn:

| Priority | Workstream | Why it matters | Done when |
| --- | --- | --- | --- |
| 1 | Adaptive workflow routing | Stops generic agent selection and makes generated workflows match the prompt | Prompt-specific workflows pick purpose-fit specialists and show stage names clearly |
| 2 | Output quality and packaging | Ensures generated work looks like a real product, not a partial transcript | Preview opens by default, files are clean, and web deliverables are polished |
| 3 | Failure presentation | Makes broken runs understandable and debuggable | The UI names the failing agent, the reason, and the affected artifacts |
| 4 | Company workspace polish | Makes the company model operational rather than decorative | Company pages show real signals, back navigation works, and reports are trustworthy |
| 5 | Provider and policy reliability | Prevents run failures caused by bad credentials or unsupported models | Provider test, model selection, and policy validation all work before execution |
| 6 | Evaluation and approval completion | Closes the trust loop for release-sensitive work | Completed runs show evaluation results and approval state consistently |
| 7 | Navigation and doc cleanup | Reduces clutter and removes stale product surfaces | Only the canonical docs and the release-facing navigation remain visible |

### Current Release Tasks

- Tighten adaptive routing for all workflow domains.
- Finish preview/files/document behavior for generated websites and report workflows.
- Improve failure states across workflow run and company pages.
- Complete the evaluation and approval UI so every release template is decision-ready.
- Remove or hide obsolete navigation and stale product surfaces.
- Keep the docs surface restricted to the canonical plan, architecture, and operations guides.
