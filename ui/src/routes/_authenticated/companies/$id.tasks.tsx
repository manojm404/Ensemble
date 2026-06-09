import * as React from "react";
import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Mail, Play, Send, Sparkles, UserRound } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { GlassPanel } from "@/components/glass/GlassPanel";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput, GlassTextarea } from "@/components/glass/GlassInput";
import { StateView, StatusChip } from "@/components/glass/StateView";
import { companyApi, workflowApi } from "@/lib/adapters";
import type { CompanyTask } from "@/lib/adapters/types";

export const Route = createFileRoute("/_authenticated/companies/$id/tasks")({
  head: () => ({ meta: [{ title: "Tasks - 0101" }] }),
  component: TasksPage,
});

function TasksPage() {
  const { id: companyId } = useParams({ from: "/_authenticated/companies/$id/tasks" });
  const qc = useQueryClient();
  const router = useRouter();
  const [prompt, setPrompt] = React.useState("Write a SOC2 evidence review");
  const [taskType, setTaskType] = React.useState<"one_time" | "workflow">("one_time");
  const [departmentId, setDepartmentId] = React.useState("");
  const [agentId, setAgentId] = React.useState("");
  const [schedule, setSchedule] = React.useState("manual");
  const [reportRecipientEmail, setReportRecipientEmail] = React.useState("");
  const [reportOnCompletion, setReportOnCompletion] = React.useState(true);

  const tasks = useQuery({
    queryKey: ["company-tasks", companyId],
    queryFn: () => companyApi.listTasks(companyId),
  });
  const departments = useQuery({
    queryKey: ["company-teams", companyId],
    queryFn: () => companyApi.getTeams(companyId),
  });
  const agents = useQuery({
    queryKey: ["company-agents", companyId],
    queryFn: () => companyApi.getAgents(companyId),
  });
  const activeAgents =
    agents.data?.filter((agent) => !["disabled", "fired"].includes(agent.status)) ?? [];
  const selectedAgent = activeAgents.find((agent) => agent.id === agentId);

  const createTask = useMutation({
    mutationFn: () =>
      companyApi.createTask(companyId, {
        prompt,
        department_id: departmentId || undefined,
        agent_ids: agentId ? [agentId] : undefined,
        output_type: "auto",
        task_type: taskType,
        schedule: taskType === "workflow" ? { cadence: schedule } : {},
        report_recipient_email: reportRecipientEmail.trim() || undefined,
        report_on_completion: reportOnCompletion && Boolean(reportRecipientEmail.trim()),
      }),
    onSuccess: (task) => {
      toast.success(task.route.route_quality === "ready" ? "Task routed." : "Task needs hiring.");
      setPrompt("");
      qc.invalidateQueries({ queryKey: ["company-tasks", companyId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not create task"),
  });

  const emailReport = useMutation({
    mutationFn: (task: CompanyTask) =>
      companyApi.sendTaskReportEmail(
        companyId,
        task.id,
        task.report_recipient_email ?? task.report?.recipient_email,
      ),
    onSuccess: (result) => {
      toast.success(
        result.delivery_status === "sent"
          ? `Report emailed to ${result.recipient_email}`
          : `Report ${result.delivery_status}: ${result.delivery_details ?? result.recipient_email}`,
      );
      qc.invalidateQueries({ queryKey: ["company-tasks", companyId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not email report"),
  });

  async function runTask(task: CompanyTask) {
    try {
      const prepared = await companyApi.prepareTaskRun(companyId, task.id);
      const run = await workflowApi.run(prepared.workflow_id, {
        taskId: task.id,
        companyId,
        initialInput: prepared.initial_input,
        graph: prepared.graph,
      });
      toast.success(`Run started: ${run.run_id}`);
      qc.invalidateQueries({ queryKey: ["company-tasks", companyId] });
      router.navigate({ to: "/runs/$runId", params: { runId: run.run_id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not run task");
    }
  }

  return (
    <div className="space-y-6">
      <GlassPanel padding="lg">
        <div className="text-sm font-medium flex items-center gap-2">
          <Sparkles className="size-4 text-rim" /> Assign CEO work
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          One-time work becomes a Task. Repeated work becomes a Workflow with schedule metadata.
        </p>
        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!prompt.trim()) return toast.error("Describe the work first.");
            createTask.mutate();
          }}
        >
          <GlassTextarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={4}
            placeholder="Tell your agents what to do..."
          />
          <div className="grid md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.4fr_1fr_1.3fr_auto] gap-3">
            <label className="space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Work type
              </span>
              <select
                value={taskType}
                onChange={(event) => setTaskType(event.target.value as "one_time" | "workflow")}
                className="h-10 w-full rounded-xl bg-black/30 border border-white/10 px-3 text-sm text-foreground focus:outline-none focus:border-rim/60"
              >
                <option value="one_time" className="bg-background text-foreground">
                  One-time task
                </option>
                <option value="workflow" className="bg-background text-foreground">
                  Recurring workflow
                </option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Department
              </span>
              <select
                value={departmentId}
                onChange={(event) => setDepartmentId(event.target.value)}
                className="h-10 w-full rounded-xl bg-black/30 border border-white/10 px-3 text-sm text-foreground focus:outline-none focus:border-rim/60"
              >
                <option value="" className="bg-background text-foreground">
                  Auto route
                </option>
                {departments.data?.map((department) => (
                  <option
                    key={department.id}
                    value={department.id}
                    className="bg-background text-foreground"
                  >
                    {department.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Worker
              </span>
              <select
                value={agentId}
                onChange={(event) => setAgentId(event.target.value)}
                className="h-10 w-full rounded-xl bg-black/30 border border-white/10 px-3 text-sm text-foreground focus:outline-none focus:border-rim/60"
              >
                <option value="" className="bg-background text-foreground">
                  Auto-pick best hired agent
                </option>
                {activeAgents.map((agent) => (
                  <option key={agent.id} value={agent.id} className="bg-background text-foreground">
                    {agent.name} - {agent.role}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Schedule
              </span>
              <select
                value={schedule}
                onChange={(event) => setSchedule(event.target.value)}
                disabled={taskType !== "workflow"}
                className="h-10 w-full rounded-xl bg-black/30 border border-white/10 px-3 text-sm text-foreground focus:outline-none focus:border-rim/60 disabled:opacity-50"
              >
                {["manual", "hourly", "daily", "weekly"].map((item) => (
                  <option key={item} value={item} className="bg-background text-foreground">
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Report email
              </span>
              <GlassInput
                type="email"
                value={reportRecipientEmail}
                onChange={(event) => setReportRecipientEmail(event.target.value)}
                placeholder="ceo@company.com"
                className="h-10"
              />
            </label>
            <div className="flex items-end">
              <GlassButton type="submit" variant="rim" disabled={createTask.isPending}>
                <Send /> {createTask.isPending ? "Routing..." : "Create"}
              </GlassButton>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={reportOnCompletion}
                disabled={!reportRecipientEmail.trim()}
                onChange={(event) => setReportOnCompletion(event.target.checked)}
                className="size-4 rounded border-white/20 bg-black/30 accent-[var(--rim)] disabled:opacity-40"
              />
              Email the assigned agent report when the task completes.
            </label>
            <span className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1 text-xs text-foreground/70">
              {selectedAgent
                ? `${selectedAgent.name} will own this task.`
                : "0101 will choose from active hired agents."}
            </span>
          </div>
        </form>
      </GlassPanel>

      <StateView loading={tasks.isLoading} error={tasks.error}>
        <div className="grid xl:grid-cols-2 gap-4">
          {(tasks.data ?? []).map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onRun={() => runTask(task)}
              onEmailReport={() => emailReport.mutate(task)}
              emailingReport={emailReport.isPending}
            />
          ))}
        </div>
        {!tasks.data?.length && (
          <GlassPanel padding="lg">
            <p className="text-sm text-muted-foreground py-10 text-center">
              No CEO tasks yet. Create one above.
            </p>
          </GlassPanel>
        )}
      </StateView>
    </div>
  );
}

function TaskCard({
  task,
  onRun,
  onEmailReport,
  emailingReport,
}: {
  task: CompanyTask;
  onRun: () => void;
  onEmailReport: () => void;
  emailingReport: boolean;
}) {
  const selected = task.route.selected_agents ?? [];
  const missing = task.route.missing_roles ?? [];
  const assignedAgent =
    selected.find((agent) => agent.company_agent_id === task.agent_id) ?? selected[0];
  const reportRecipient = task.report_recipient_email ?? task.report?.recipient_email;
  const reportStatus = task.report_delivery_status ?? task.report?.delivery_status;
  const isCompleted = ["completed", "completed_passed"].includes(task.status);
  return (
    <GlassPanel padding="lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-mono tracking-widest text-rim uppercase mb-1">
            {task.type === "workflow" ? "Recurring workflow" : "One-time task"}
          </div>
          <h3 className="text-lg font-semibold text-chrome">{task.title}</h3>
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{task.prompt}</p>
        </div>
        <StatusChip status={task.status} />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl glass-inset px-3 py-2">
          <div className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">
            Worker
          </div>
          <div className="mt-1 text-sm font-medium text-foreground">
            {assignedAgent?.agent_name ?? assignedAgent?.requested_role ?? "Auto route pending"}
          </div>
        </div>
        <div className="rounded-xl glass-inset px-3 py-2">
          <div className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">
            Report delivery
          </div>
          <div className="mt-1 text-sm font-medium text-foreground">
            {reportRecipient
              ? reportStatus
                ? `${reportStatus} to ${reportRecipient}`
                : `Armed for ${reportRecipient}`
              : "No email recipient"}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl glass-inset p-3">
        <div className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase mb-2">
          Route review
        </div>
        <p className="text-sm text-foreground/80">{task.route.routing_reason}</p>
        {!!selected.length && (
          <div className="mt-3 space-y-2">
            {selected.map((agent, index) => (
              <div
                key={`${agent.agent_id}-${index}`}
                className="rounded-lg bg-white/[0.035] px-3 py-2"
              >
                <div className="text-sm font-medium">
                  <UserRound className="mr-2 inline size-3.5 text-rim" />
                  {agent.agent_name ?? agent.requested_role}
                </div>
                <div className="text-xs text-muted-foreground">{agent.selection_reason}</div>
              </div>
            ))}
          </div>
        )}
        {!!missing.length && (
          <div className="mt-3 space-y-2">
            {missing.map((role) => (
              <div
                key={role.role}
                className="rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2"
              >
                <div className="text-sm text-amber-200">{role.role}</div>
                <div className="text-xs text-amber-100/70">{role.reason}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {task.type === "workflow" && (
        <div className="mt-3 text-xs text-muted-foreground flex items-center gap-2">
          <CalendarClock className="size-3.5" /> Schedule:{" "}
          {String(task.schedule.cadence ?? "manual")}
        </div>
      )}

      {reportRecipient && (
        <div className="mt-3 text-xs text-muted-foreground flex items-center gap-2">
          <Mail className="size-3.5" /> Report: {reportRecipient}
          {reportStatus ? <span className="text-foreground/70">({reportStatus})</span> : null}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-4">
        {task.status === "ready" && (
          <GlassButton variant="rim" onClick={onRun}>
            <Play /> Run
          </GlassButton>
        )}
        {task.workflow_id && (
          <GlassButton asChild variant="glass">
            <Link to="/workflows/$id" params={{ id: task.workflow_id }}>
              Open workflow
            </Link>
          </GlassButton>
        )}
        {task.run_id && (
          <GlassButton asChild variant="primary">
            <Link to="/runs/$runId" params={{ runId: task.run_id }}>
              View output
            </Link>
          </GlassButton>
        )}
        {isCompleted && reportRecipient && (
          <GlassButton variant="glass" onClick={onEmailReport} disabled={emailingReport}>
            <Mail /> {emailingReport ? "Sending..." : "Email report"}
          </GlassButton>
        )}
      </div>
    </GlassPanel>
  );
}
