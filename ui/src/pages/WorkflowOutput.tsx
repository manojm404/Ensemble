/**
 * WorkflowOutput.tsx — Full-Width Workflow Output Page
 * 
 * Opens as a tab when users click "Open in Tab" from the execution panel.
 * Renders the same OutputViewer component but at full width for better
 * readability of documents, file exploration, and live previews.
 * 
 * Reads output data from WorkflowOutputContext by workflow ID (from URL param).
 * 
 * DO NOT CHANGE:
 * - The route param pattern (:id)
 * - The header layout (title + metadata + actions)
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useWorkflowOutput } from "@/lib/workflow-output-context";
import { OutputViewer, normalizeDisplayPath } from "@/components/workflow/OutputViewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Clock, Bot, Download, ShieldCheck, AlertTriangle, CheckCircle2, Sparkles, Mail, Lock, EyeOff, Database, History, ListChecks, Activity } from "lucide-react";
import { exportWorkflowAuditPackage, getWorkflowEvaluation, getWorkflowResult } from "@/lib/api";

const STORAGE_KEY = "ensemble_workflow_outputs";
const DELIVERY_STAGES = ["Result", "Files", "Preview", "Evaluation", "Messages", "Audit"];

function loadStoredOutput(id: string) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const data = parsed[id];
    if (data?.output?.markdown || (Array.isArray(data?.output?.files) && data.output.files.length > 0)) {
      return { ...data, completedAt: new Date(data.completedAt) };
    }
    return null;
  } catch {
    return null;
  }
}

function humanizeOutputTitle(value?: string) {
  return String(value || "Workflow Output")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/\bAi\b/g, "AI")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(value?: string, fallback = "") {
  return String(value || fallback)
    .replace(/```(?:json|markdown|md)?/gi, "")
    .replace(/```/g, "")
    .replace(/-\s+\*\*([^*]+)\*\*:\s*/g, "$1: ")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatMatchType(value?: unknown) {
  const type = String(value || "exact").toLowerCase();
  if (type === "virtual") return "Virtual";
  if (type === "adapted") return "Adapted";
  if (type === "missing") return "Gap";
  return "Exact";
}

function matchBadgeClass(value?: unknown) {
  const type = String(value || "exact").toLowerCase();
  if (type === "virtual") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  if (type === "adapted") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  if (type === "missing") return "border-rose-300/25 bg-rose-300/10 text-rose-100";
  return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
}

function roleLabel(value?: string) {
  const raw = cleanText(value, "Specialist")
    .replace(/^role:\s*/i, "")
    .replace(/^core[_-\s]*/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!raw || /^default$/i.test(raw)) return "Specialist";
  return raw
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bQa\b/g, "QA")
    .replace(/\bUi\b/g, "UI")
    .replace(/\bUx\b/g, "UX")
    .replace(/\bSeo\b/g, "SEO");
}

function parseStructuredAgentReports(text: string) {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  if (!/^\{/.test(stripped)) return [];
  try {
    const parsed = JSON.parse(stripped);
    if (!parsed || typeof parsed !== "object") return [];
    const cards = [];
    if (parsed.plan && typeof parsed.plan === "object") {
      cards.push({
        title: "Planner",
        role: "Workflow Planner",
        taskFocus: cleanText(parsed.plan.headline || "Structure the deliverable"),
        reason: cleanText(parsed.plan.angle || parsed.plan.introduction || "Converted the prompt into a usable content plan."),
        result: cleanText(parsed.plan.angle || parsed.plan.headline || "A workflow plan was created."),
        details: [],
      });
    }
    if (parsed.article && typeof parsed.article === "object") {
      cards.push({
        title: "Writer",
        role: "Content Author",
        taskFocus: cleanText(parsed.article.title || "Draft the final document"),
        reason: "Used the approved plan and prompt constraints to produce the final written artifact.",
        result: cleanText(parsed.article.body || "A written artifact was produced.").slice(0, 520),
        details: [],
      });
    }
    if (parsed.review && typeof parsed.review === "object") {
      const flags = Array.isArray(parsed.review.flags) ? parsed.review.flags.join("; ") : "";
      cards.push({
        title: "Reviewer",
        role: "Editorial QA",
        taskFocus: "Check clarity, factual quality, SEO readiness, and authority signals.",
        reason: "Verified the final package before handoff.",
        result: cleanText(flags || parsed.review.clarity || parsed.review.factual_accuracy || "Review completed."),
        details: [],
      });
    }
    if (typeof parsed.message === "string" && String(parsed.status || "").toLowerCase() === "error") {
      cards.push({
        title: "Run Failure",
        role: "System",
        taskFocus: "Explain why this workflow did not produce a valid final artifact.",
        reason: "The backend returned an error payload.",
        result: cleanText(parsed.message),
        details: [],
      });
    }
    return cards;
  } catch {
    return [];
  }
}

function parseAgentReports(markdown?: string) {
  const text = (markdown || "").trim();
  if (!text) return [];

  const structured = parseStructuredAgentReports(text);
  if (structured.length > 0) return structured;

  const sections = text.split(/\n(?=###\s+\d+\.)/g);
  return sections
    .map((section) => {
      const lines = section.split("\n").map((line) => line.trim());
      const titleLine = lines.find((line) => /^###\s+\d+\./.test(line)) || "";
      const title = titleLine.replace(/^###\s+\d+\.\s*/, "").trim();
      const bullets = lines.filter((line) => line.startsWith("- "));
      const extract = (label: string) => {
        const match = bullets.find((line) => line.toLowerCase().startsWith(`- **${label.toLowerCase()}`));
        if (!match) return "";
        return match.replace(/^-\s+\*\*.*?\*\*:\s*/i, "").trim();
      };
      const body = lines
        .filter((line) => line && !line.startsWith("#") && !line.startsWith("###") && !line.startsWith("- "))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      return {
        title: cleanText(title || "Agent"),
        role: roleLabel(extract("Role") || "Specialist"),
        taskFocus: cleanText(extract("Task focus") || "Workflow step"),
        reason: cleanText(extract("Why this step was chosen") || extract("Why this agent was chosen") || ""),
        result: cleanText(extract("High-level result") || body.slice(0, 360)),
        details: bullets,
      };
    })
    .filter((section) => section.title || section.result);
}

type ThreadedMessage = {
  message_id: string;
  run_id?: string;
  cycle?: number;
  sender_node_id?: string;
  recipient_node_ids?: string[];
  visibility?: "public" | "private" | "hidden_until_audit" | string;
  message_type?: string;
  subject?: string;
  body?: string;
  created_at?: string;
  thread_id?: string;
  in_reply_to?: string;
  depth?: number;
};

function buildThreadedMessages(messages: ThreadedMessage[] = []) {
  const validMessages = messages.filter((message) => message.message_id);
  if (!validMessages.length) return [];

  const byId = new Map(validMessages.map((message) => [message.message_id, message]));
  const groups = new Map<string, ThreadedMessage[]>();
  validMessages.forEach((message) => {
    const key = message.thread_id || `chronological:${message.message_id}`;
    groups.set(key, [...(groups.get(key) || []), message]);
  });

  const sortMessage = (a: ThreadedMessage, b: ThreadedMessage) => (
    (a.cycle || 0) - (b.cycle || 0)
    || String(a.created_at || "").localeCompare(String(b.created_at || ""))
    || String(a.message_id || "").localeCompare(String(b.message_id || ""))
  );

  return Array.from(groups.entries()).map(([threadId, group]) => {
    const children = new Map<string, ThreadedMessage[]>();
    const roots: ThreadedMessage[] = [];
    group.forEach((message) => {
      const parentId = message.in_reply_to || "";
      if (parentId && byId.has(parentId) && byId.get(parentId)?.thread_id === message.thread_id) {
        children.set(parentId, [...(children.get(parentId) || []), message]);
      } else {
        roots.push(message);
      }
    });

    const ordered: ThreadedMessage[] = [];
    const visit = (message: ThreadedMessage, depth: number) => {
      ordered.push({ ...message, depth });
      [...(children.get(message.message_id) || [])].sort(sortMessage).forEach((child) => visit(child, depth + 1));
    };
    roots.sort(sortMessage).forEach((root) => visit(root, 0));

    return {
      threadId,
      messages: ordered.length ? ordered : [...group].sort(sortMessage).map((message) => ({ ...message, depth: 0 })),
    };
  }).sort((a, b) => sortMessage(a.messages[0], b.messages[0]));
}

export default function WorkflowOutput() {
  const { id } = useParams<{ id: string }>();
  const { getOutput } = useWorkflowOutput();
  const [backendData, setBackendData] = useState<any>(null);
  const [loadingBackend, setLoadingBackend] = useState(false);
  const [evaluation, setEvaluation] = useState<any>(null);
  const [exporting, setExporting] = useState(false);
  const [messageThreadFilter, setMessageThreadFilter] = useState("all");
  const [messageSenderFilter, setMessageSenderFilter] = useState("all");
  const [messageRecipientFilter, setMessageRecipientFilter] = useState("all");
  const [messageTypeFilter, setMessageTypeFilter] = useState("all");
  let data = id ? getOutput(id) : undefined;

  // Fallback: load from localStorage directly (handles page refresh)
  if (!data && id) {
    data = loadStoredOutput(id) || undefined;
  }

  useEffect(() => {
    if (!id || data) return;
    let mounted = true;
    setLoadingBackend(true);
    getWorkflowResult(id)
      .then((result) => {
        if (mounted) setBackendData(result);
      })
      .finally(() => {
        if (mounted) setLoadingBackend(false);
      });
    return () => {
      mounted = false;
    };
  }, [id, data]);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    getWorkflowEvaluation(id)
      .then((result) => {
        if (mounted) setEvaluation(result);
      })
      .catch(() => {
        if (mounted) setEvaluation(null);
      });
    return () => {
      mounted = false;
    };
  }, [id]);

  if (!data && (backendData?.latest?.output?.markdown || backendData?.files?.length)) {
    data = {
      title: backendData?.latest?.task || `Workflow ${id}`,
      task: backendData?.latest?.task || "",
      agentCount: backendData.outputs?.length || 1,
      output: {
        markdown: backendData?.latest?.output?.markdown,
        files: backendData?.latest?.output?.files || backendData.files,
        package: backendData?.package || backendData?.latest?.package,
      },
      completedAt: new Date(backendData?.latest?.completedAt || Date.now()),
      workflowId: id,
    };
  }

  if (data && !data.output.package) {
    const files = Array.isArray(data.output.files) ? data.output.files : [];
    const hasHtml = files.some((file) => file.path.toLowerCase().endsWith(".html"));
    const hasMarkdown = Boolean((data.output.markdown || "").trim());
    data = {
      ...data,
      output: {
        ...data.output,
        package: {
          package_type: hasHtml
            ? "web-package"
            : files.length > 1 && hasMarkdown
              ? "mixed-package"
              : files.length > 0
                ? "file-package"
                : "document-package",
          primary_artifact: files.find((file) => file.path.toLowerCase().endsWith("index.html") || file.path.toLowerCase().endsWith("preview.html"))?.path
            || files[0]?.path
            || "workflow-output.md",
          artifact_count: files.length,
          has_preview: hasHtml,
          artifact_paths: files.slice(0, 8).map((file) => normalizeDisplayPath(file.path)),
        },
      },
    };
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <FileText className="h-12 w-12 text-muted-foreground/20" />
        <div className="text-center space-y-1">
          <p className="text-sm font-medium text-foreground">No output found</p>
          <p className="text-xs text-muted-foreground">
            {loadingBackend ? "Loading the latest backend result..." : "Run a workflow to see results here"}
          </p>
        </div>
      </div>
    );
  }

  const fileCount = Array.isArray(data.output?.files) ? data.output.files.length : 0;
  const normalizedFiles = [...(data.output?.files || [])].map((file) => ({
    ...file,
    path: normalizeDisplayPath(file.path),
  }));
  const sortedFiles = [...normalizedFiles].sort((a, b) => {
    const order = ["index.html", "preview.html", "style.css", "styles.css", "script.js", "app.js", "main.js", "manifest.json"];
    const ai = order.findIndex((name) => String(a.path).toLowerCase().endsWith(name));
    const bi = order.findIndex((name) => String(b.path).toLowerCase().endsWith(name));
    const ap = ai === -1 ? 999 : ai;
    const bp = bi === -1 ? 999 : bi;
    if (ap !== bp) return ap - bp;
    return String(a.path).localeCompare(String(b.path));
  });
  const packageType = data.output?.package?.package_type === "web-package"
    ? "Web package"
    : data.output?.package?.package_type === "mixed-package"
      ? "Mixed package"
      : data.output?.package?.package_type === "file-package"
        ? "File package"
        : data.output?.package?.package_type === "document-package"
          ? "Document package"
          : data.output?.workflowId
            ? (sortedFiles.some((file) => file.path.toLowerCase().endsWith(".html")) || /<!doctype html|<html[\s>]/i.test(data.output?.markdown || ""))
              ? "Web package"
              : fileCount > 1
                ? "Mixed package"
                : "Document package"
            : "Output package";
  const primaryArtifact = data.output?.package?.primary_artifact
    || sortedFiles.find((file) => file.path.toLowerCase().endsWith("index.html") || file.path.toLowerCase().endsWith("preview.html"))?.path
    || sortedFiles[0]?.path
    || "workflow-output.md";
  const hasPreview = Boolean(
    data.output?.package?.has_preview ||
    (data.output?.workflowId &&
      (data.output?.files?.some((file) => file?.path?.toLowerCase().endsWith(".html")) ||
        /<!doctype html|<html[\s>]/i.test(data.output?.markdown || "")))
  );
  const requestedAgents = data.plan?.requestedAgents || data.plan?.stagePlan?.length || data.agentCount || 0;
  const generatedAgents = data.plan?.generatedAgents || data.agentCount || 0;
  const plannerSource = data.plan?.plannerSource || data.plan?.planner_source || "LangChain";
  const outputType = data.plan?.outputType || data.plan?.output_type || "document";
  const agentReports = parseAgentReports(data.output?.markdown);
  const stagePlanReports = Array.isArray(data.plan?.stagePlan) && data.plan.stagePlan.length > 0
    ? data.plan.stagePlan.map((stage: any, idx: number) => ({
        title: cleanText(stage.label || stage.stage || stage.agent || stage.agent_name || `Agent ${idx + 1}`),
        role: roleLabel(stage.agent || stage.agent_name || stage.agentId || stage.agent_id || "Specialist"),
        taskFocus: cleanText(stage.label || stage.stage || "Workflow step"),
        reason: cleanText(stage.reason || stage.selection_reason || "Selected by the planner for this route."),
        result: cleanText(stage.result || stage.output || stage.summary || data.output?.markdown || "Workflow step completed."),
        details: [],
      }))
    : [];
  const rawMessages = (
    ((data.output as any)?.messages)
    || ((data as any)?.messages)
    || backendData?.messages
    || backendData?.latest?.messages
    || []
  ) as ThreadedMessage[];
  const messageThreads = buildThreadedMessages(Array.isArray(rawMessages) ? rawMessages : []);
  const messageList = messageThreads.flatMap((thread) => thread.messages.map((message) => ({ ...message, threadId: thread.threadId })));
  const simulationStatePayload = (
    ((data.output as any)?.state)
    || ((data as any)?.state)
    || backendData?.state
    || backendData?.latest?.output?.state
    || null
  );
  const simulationStateEntries = Object.entries((simulationStatePayload?.state || {}) as Record<string, any>)
    .sort(([a], [b]) => a.localeCompare(b));
  const simulationCheckpoints = (
    ((data.output as any)?.checkpoints)
    || ((data as any)?.checkpoints)
    || backendData?.checkpoints
    || backendData?.latest?.output?.checkpoints
    || []
  ) as any[];
  const simulationLogs = (
    ((data.output as any)?.agent_logs)
    || ((data as any)?.agent_logs)
    || backendData?.agent_logs
    || backendData?.latest?.output?.agent_logs
    || []
  ) as any[];
  const auditEvents = (
    ((data.output as any)?.events)
    || ((data as any)?.events)
    || backendData?.events
    || []
  ) as any[];
  const isSimulationOutput = simulationStateEntries.length > 0 || simulationCheckpoints.length > 0 || simulationLogs.length > 0;
  const messageFilterOptions = {
    threads: [...new Set(messageThreads.map((thread) => thread.threadId))].sort(),
    senders: [...new Set(messageList.map((message) => message.sender_node_id).filter(Boolean))].sort(),
    recipients: [...new Set(messageList.flatMap((message) => message.recipient_node_ids || []).filter(Boolean))].sort(),
    types: [...new Set(messageList.map((message) => message.message_type).filter(Boolean))].sort(),
  };
  const filteredMessageThreads = messageThreads
    .map((thread) => ({
      ...thread,
      messages: thread.messages.filter((message) => {
        const matchesThread = messageThreadFilter === "all" || thread.threadId === messageThreadFilter;
        const matchesSender = messageSenderFilter === "all" || message.sender_node_id === messageSenderFilter;
        const matchesRecipient = messageRecipientFilter === "all" || (message.recipient_node_ids || []).includes(messageRecipientFilter);
        const matchesType = messageTypeFilter === "all" || message.message_type === messageTypeFilter;
        return matchesThread && matchesSender && matchesRecipient && matchesType;
      }),
    }))
    .filter((thread) => thread.messages.length > 0);

  const reportCards = (stagePlanReports.length > 0 ? stagePlanReports : agentReports).slice(0, 8);
  const filePreview = sortedFiles.slice(0, 8);
  const displayTitle = humanizeOutputTitle(data.title);
  const agentBadgeCount = generatedAgents || data.agentCount || reportCards.length || 0;

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.10),transparent_32%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.08),transparent_24%),linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--background))_100%)] text-foreground">
      <div className="sticky top-0 z-30 border-b border-border/50 bg-background/80 backdrop-blur-2xl">
        <div className="px-5 py-5 xl:px-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 max-w-5xl">
              <div className="flex items-center gap-3">
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.35rem] border border-primary/20 bg-primary/10 shadow-sm">
                  <div className="absolute inset-0 rounded-[1.35rem] bg-primary/15 blur-xl" />
                  <Sparkles className="relative h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">Delivery Notebook</p>
                    <Badge variant="outline" className="border-primary/20 bg-primary/10 px-2 py-0 text-[9px] font-black uppercase tracking-[0.18em] text-primary">
                      Audit package
                    </Badge>
                  </div>
                  <h1 className="truncate text-2xl font-black tracking-[-0.04em] text-foreground md:text-3xl">{displayTitle}</h1>
                </div>
              </div>
              <p className="ml-[60px] mt-1.5 max-w-4xl truncate text-sm font-medium leading-6 text-foreground/65">
                {data.task}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                className="h-10 gap-2 rounded-xl border-border/60 px-4 font-bold shadow-sm transition-all hover:bg-secondary/50"
                onClick={async () => {
                  if (!id) return;
                  try {
                    setExporting(true);
                    await exportWorkflowAuditPackage(id);
                  } finally {
                    setExporting(false);
                  }
                }}
                disabled={!id || exporting}
              >
                <Download className="h-4 w-4" />
                {exporting ? "Exporting..." : "Export Audit"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-10 gap-2 rounded-xl border-primary/20 bg-primary/5 px-4 font-bold text-primary shadow-sm transition-all hover:bg-primary/10"
                onClick={() => {
                  if (!id) return;
                  sessionStorage.setItem(`rerun_${id}`, JSON.stringify({ lastOutput: data.task }));
                  window.location.href = `/workflows/${id}`;
                }}
              >
                <Bot className="h-4 w-4" />
                Modify & Rerun
              </Button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {[
              { label: "Agents", value: agentBadgeCount, icon: Bot, tone: "text-primary" },
              { label: "Files", value: fileCount, icon: FileText, tone: "text-foreground" },
              { label: "Preview", value: hasPreview ? "Ready" : "None", icon: hasPreview ? CheckCircle2 : AlertTriangle, tone: hasPreview ? "text-emerald-600" : "text-amber-600" },
              { label: "Evaluation", value: evaluation?.status ? String(evaluation.status).replace("_", " ") : "Pending", icon: ShieldCheck, tone: evaluation?.status === "pass" ? "text-emerald-600" : "text-primary" },
              { label: "Messages", value: messageList.length, icon: Mail, tone: "text-primary" },
            ].map((metric) => {
              const Icon = metric.icon;
              return (
                <div key={metric.label} className="rounded-2xl border border-border/55 bg-card/75 px-4 py-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground">{metric.label}</p>
                    <Icon className={`h-4 w-4 ${metric.tone}`} />
                  </div>
                  <p className="mt-2 truncate text-sm font-black capitalize text-foreground">{metric.value}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-border/55 bg-card/70 p-3 shadow-sm xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10">
                {hasPreview ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <FileText className="h-4 w-4 text-amber-600" />}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">Package route</p>
                <p className="truncate text-sm font-semibold text-foreground">
                  {packageType} via {String(plannerSource).replace(/_/g, " ")} · primary artifact {primaryArtifact}
                </p>
              </div>
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1 xl:pb-0">
              {DELIVERY_STAGES.map((stage, index) => (
                <div key={stage} className="flex shrink-0 items-center gap-1">
                  <div className={`rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] ${
                    index <= (evaluation ? 5 : 3)
                      ? "border-primary/25 bg-primary/10 text-primary"
                      : "border-border/55 bg-background/70 text-muted-foreground"
                  }`}>
                    {stage}
                  </div>
                  {index < DELIVERY_STAGES.length - 1 && <div className="h-px w-3 bg-border/70" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="px-8 py-6">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
          <section className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-[1.75rem] border border-border/50 bg-card/80 p-5 shadow-sm backdrop-blur-xl">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Prompt</p>
                    <h2 className="mt-1 text-base font-semibold text-foreground">What the user asked for</h2>
                    <p className="mt-3 line-clamp-4 text-sm leading-6 text-muted-foreground">{data.task}</p>
                  </div>
                  <div className="shrink-0 rounded-2xl border border-border/50 bg-background/70 px-4 py-3 text-right">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Primary artifact</p>
                    <p className="mt-1 max-w-[180px] truncate text-sm font-semibold text-foreground">{primaryArtifact}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{packageType}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-border/50 bg-card/80 p-5 shadow-sm backdrop-blur-xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Route</p>
                    <h2 className="mt-1 text-base font-semibold text-foreground">{data.plan?.domainTitle || "Generated workflow"}</h2>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-wider">
                      {requestedAgents} planned
                    </Badge>
                    <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-[0.18em] border-primary/20 text-primary">
                      {String(outputType).replace(/_/g, " ")}
                    </Badge>
                  </div>
                </div>
                <p className="mt-3 line-clamp-4 text-sm leading-6 text-muted-foreground">
                  {data.plan?.routingReason || "This workflow was routed by the planner using the task prompt and specialist metadata."}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {data.plan?.promptSummary && (
                    <Badge variant="outline" className="border-border/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-foreground/70">
                      {data.plan.promptSummary}
                    </Badge>
                  )}
                  {Array.isArray(data.plan?.routeEvidence) && data.plan.routeEvidence.slice(0, 3).map((item: string) => (
                  <Badge key={item} variant="outline" className="max-w-full border-primary/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary/80">
                    {item}
                  </Badge>
                  ))}
                </div>
                {Array.isArray(data.plan?.stagePlan) && data.plan.stagePlan.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-[9px] font-black uppercase tracking-[0.24em] text-muted-foreground">Stage plan</p>
                    <div className="grid gap-2 md:grid-cols-2">
                      {data.plan.stagePlan.slice(0, 4).map((stage: any, idx: number) => (
                        <div key={`${stage.id || idx}`} className="rounded-2xl border border-border/40 bg-background/70 p-3">
	                          <div className="flex items-center justify-between gap-3">
	                            <p className="truncate text-xs font-semibold text-foreground">{stage.label || stage.stage || `Stage ${idx + 1}`}</p>
	                            <Badge variant="outline" className={`text-[9px] font-bold uppercase tracking-wider ${matchBadgeClass(stage.match_type || stage.matchType)}`}>
	                              {formatMatchType(stage.match_type || stage.matchType)}
	                            </Badge>
	                          </div>
	                          <p className="mt-1 truncate text-[10px] font-semibold text-foreground/70">
	                            {stage.requested_role || stage.agent || stage.agent_name || stage.agentId || "Agent"}
	                          </p>
	                          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                            {stage.reason || stage.selection_reason || "Selected by the planner for this route."}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-border/50 bg-card/80 p-5 shadow-sm backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Agent reports</p>
                  <h2 className="mt-1 text-base font-semibold text-foreground">What each agent reported</h2>
                </div>
                <Badge variant="outline" className="border-border/60 text-[10px] font-bold uppercase tracking-wider text-foreground/70">
                  {reportCards.length} summaries
                </Badge>
              </div>
              {reportCards.length > 0 ? (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {reportCards.map((report, idx) => (
                    <div key={`${report.title}-${idx}`} className="min-w-0 rounded-2xl border border-border/40 bg-background/70 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Agent {idx + 1}</p>
                          <h3 className="mt-1 break-words text-base font-bold tracking-tight text-foreground">{report.title}</h3>
                        </div>
                        <Badge variant="secondary" className="max-w-[180px] shrink-0 truncate text-[10px] font-bold uppercase tracking-wider">
                          {report.role}
                        </Badge>
                      </div>
                      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Task focus</p>
                      <p className="mt-1 break-words text-sm leading-6 text-foreground/80">{report.taskFocus || "Workflow step"}</p>
                      {report.reason && (
                        <>
                          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Why it was selected</p>
                          <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">{report.reason}</p>
                        </>
                      )}
                      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Result</p>
                      <p className="mt-1 line-clamp-6 break-words text-sm leading-6 text-foreground/80">{report.result}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-border/60 bg-background/50 p-6 text-sm text-muted-foreground">
                  No agent summaries were returned yet.
                </div>
              )}
            </div>

            {messageThreads.length > 0 && (
              <div className="rounded-[1.75rem] border border-border/50 bg-card/80 p-5 shadow-sm backdrop-blur-xl">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Message threads</p>
                    <h2 className="mt-1 text-base font-semibold text-foreground">Agent message bus</h2>
                  </div>
                  <Badge variant="outline" className="gap-1.5 border-border/60 text-[10px] font-bold uppercase tracking-wider text-foreground/70">
                    <Mail className="h-3 w-3" />
                    {messageThreads.length} threads
                  </Badge>
                </div>
                <div className="mt-4 space-y-3">
                  <div className="grid gap-2 rounded-2xl border border-border/40 bg-background/60 p-3 md:grid-cols-4">
                    <label className="space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Thread</span>
                      <select
                        value={messageThreadFilter}
                        onChange={(event) => setMessageThreadFilter(event.target.value)}
                        className="h-9 w-full rounded-xl border border-border/60 bg-card px-3 text-xs font-medium text-foreground outline-none"
                      >
                        <option value="all">All threads</option>
                        {messageFilterOptions.threads.map((threadId) => (
                          <option key={threadId} value={threadId}>{threadId.replace(/^thread_/, "").replace(/_/g, " ")}</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Sender</span>
                      <select
                        value={messageSenderFilter}
                        onChange={(event) => setMessageSenderFilter(event.target.value)}
                        className="h-9 w-full rounded-xl border border-border/60 bg-card px-3 text-xs font-medium text-foreground outline-none"
                      >
                        <option value="all">All senders</option>
                        {messageFilterOptions.senders.map((sender) => (
                          <option key={sender} value={sender}>{sender}</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Recipient</span>
                      <select
                        value={messageRecipientFilter}
                        onChange={(event) => setMessageRecipientFilter(event.target.value)}
                        className="h-9 w-full rounded-xl border border-border/60 bg-card px-3 text-xs font-medium text-foreground outline-none"
                      >
                        <option value="all">All recipients</option>
                        {messageFilterOptions.recipients.map((recipient) => (
                          <option key={recipient} value={recipient}>{recipient}</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Type</span>
                      <select
                        value={messageTypeFilter}
                        onChange={(event) => setMessageTypeFilter(event.target.value)}
                        className="h-9 w-full rounded-xl border border-border/60 bg-card px-3 text-xs font-medium text-foreground outline-none"
                      >
                        <option value="all">All types</option>
                        {messageFilterOptions.types.map((messageType) => (
                          <option key={messageType} value={messageType}>{messageType}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {filteredMessageThreads.map((thread) => (
                    <div key={thread.threadId} className="rounded-2xl border border-border/40 bg-background/70 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-xs font-semibold text-foreground">{thread.threadId.replace(/^thread_/, "").replace(/_/g, " ")}</p>
                        <Badge variant="secondary" className="text-[9px] font-bold uppercase tracking-wider">
                          {thread.messages.length} messages
                        </Badge>
                      </div>
                      <div className="mt-3 space-y-2">
                        {thread.messages.map((message) => {
                          const isPrivate = message.visibility === "private";
                          const isAuditHidden = message.visibility === "hidden_until_audit";
                          return (
                            <div
                              key={message.message_id}
                              className="rounded-xl border border-border/40 bg-card/70 p-3"
                              style={{ marginLeft: `${Math.min(message.depth || 0, 4) * 18}px` }}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-foreground">{message.subject || "Untitled message"}</p>
                                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                                    {message.sender_node_id || "agent"} to {(message.recipient_node_ids || []).join(", ") || "recipient"}
                                  </p>
                                </div>
                                <Badge
                                  variant="outline"
                                  className={`shrink-0 gap-1 text-[9px] font-bold uppercase tracking-wider ${
                                    isPrivate
                                      ? "border-rose-500/20 bg-rose-500/10 text-rose-600"
                                      : isAuditHidden
                                        ? "border-amber-500/20 bg-amber-500/10 text-amber-600"
                                        : "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
                                  }`}
                                >
                                  {isPrivate ? <Lock className="h-3 w-3" /> : isAuditHidden ? <EyeOff className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
                                  {message.visibility || "public"}
                                </Badge>
                              </div>
                              <p className="mt-2 line-clamp-3 text-sm leading-6 text-foreground/75">{message.body || "No message body."}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.plan && (
              <div className="rounded-[1.75rem] border border-border/50 bg-card/80 p-5 shadow-sm backdrop-blur-xl">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Planner route</p>
                    <h2 className="mt-1 text-base font-semibold text-foreground">{data.plan.domainTitle || "Generated workflow"}</h2>
                  </div>
                  <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-wider">
                    {data.plan.stagePlan?.length || data.agentCount} stages
                  </Badge>
                </div>
                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {data.plan.stagePlan?.map((stage: any, idx: number) => (
                    <div key={`${stage.id || idx}`} className="rounded-xl border border-border/40 bg-background/70 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-xs font-semibold text-foreground">{stage.label || `Stage ${idx + 1}`}</p>
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0">{idx + 1}</Badge>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">{stage.agent}</p>
                      <p className="mt-2 text-[11px] leading-5 text-foreground/70">{stage.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isSimulationOutput && (
              <div className="rounded-[1.75rem] border border-sky-500/15 bg-card/85 p-5 shadow-sm backdrop-blur-xl">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-sky-600">Simulation Inspector</p>
                    <h2 className="mt-1 text-base font-semibold text-foreground">State, checkpoints, logs, and audit trail</h2>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                      This run used logical-cycle simulation. The panels below show which state keys changed, what checkpoints were saved,
                      which agents logged activity, and what audit events explain the final report.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="border-sky-500/20 bg-sky-500/10 text-[10px] font-bold uppercase tracking-wider text-sky-600">
                      {simulationStateEntries.length} state keys
                    </Badge>
                    <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/10 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                      {simulationCheckpoints.length} checkpoints
                    </Badge>
                    <Badge variant="outline" className="border-amber-500/20 bg-amber-500/10 text-[10px] font-bold uppercase tracking-wider text-amber-600">
                      {auditEvents.length} events
                    </Badge>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                  <div className="rounded-2xl border border-border/40 bg-background/65 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-sky-500" />
                        <h3 className="text-sm font-semibold text-foreground">State Board</h3>
                      </div>
                      <Badge variant="secondary" className="text-[9px] font-bold uppercase tracking-wider">latest values</Badge>
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {simulationStateEntries.slice(0, 12).map(([key, entry]: [string, any]) => {
                        const value = entry?.value;
                        const warnings = Array.isArray(entry?.warnings) ? entry.warnings : [];
                        const printable = typeof value === "string"
                          ? value
                          : typeof value === "number" || typeof value === "boolean"
                            ? String(value)
                            : JSON.stringify(value ?? null);
                        return (
                          <div key={key} className="rounded-xl border border-border/40 bg-card/70 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-semibold text-foreground">{key.replace(/_/g, " ")}</p>
                                <p className="mt-1 truncate text-[11px] text-muted-foreground">v{entry?.version || 1} by {entry?.writer_agent_id || "agent"} · cycle {entry?.cycle ?? 0}</p>
                              </div>
                              <Badge
                                variant="outline"
                                className={`shrink-0 text-[8px] font-bold uppercase tracking-wider ${
                                  entry?.visibility === "private"
                                    ? "border-rose-500/20 bg-rose-500/10 text-rose-600"
                                    : "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
                                }`}
                              >
                                {entry?.visibility || "public"}
                              </Badge>
                            </div>
                            <p className="mt-2 line-clamp-3 break-words text-xs leading-5 text-foreground/75">{printable}</p>
                            {warnings.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {warnings.slice(0, 2).map((warning: string) => (
                                  <Badge key={warning} variant="outline" className="border-amber-500/20 bg-amber-500/10 px-1.5 py-0 text-[8px] font-bold uppercase tracking-wider text-amber-600">
                                    {warning}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-4">
                    <div className="rounded-2xl border border-border/40 bg-background/65 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <History className="h-4 w-4 text-emerald-500" />
                          <h3 className="text-sm font-semibold text-foreground">Checkpoints</h3>
                        </div>
                        <Badge variant="secondary" className="text-[9px] font-bold uppercase tracking-wider">refresh safe</Badge>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {simulationCheckpoints.slice(-6).map((checkpoint) => (
                          <div key={checkpoint.cycle} className="rounded-xl border border-border/40 bg-card/70 p-3">
                            <p className="text-xs font-semibold text-foreground">Cycle {checkpoint.cycle}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {Object.keys(checkpoint.state || {}).length} state keys · {Object.keys(checkpoint.agent_status || {}).length} agents
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border/40 bg-background/65 p-4">
                      <div className="flex items-center gap-2">
                        <ListChecks className="h-4 w-4 text-amber-500" />
                        <h3 className="text-sm font-semibold text-foreground">Agent Logs</h3>
                      </div>
                      <div className="mt-3 space-y-2">
                        {simulationLogs.slice(-5).map((log, idx) => (
                          <div key={`${log.node_id}-${log.cycle}-${idx}`} className="rounded-xl border border-border/40 bg-card/70 px-3 py-2">
                            <div className="flex items-center justify-between gap-3">
                              <p className="truncate text-xs font-semibold text-foreground">{log.node_id}</p>
                              <Badge variant="outline" className="px-1.5 py-0 text-[8px] font-bold uppercase tracking-wider">cycle {log.cycle}</Badge>
                            </div>
                            <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted-foreground">{log.message}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-border/40 bg-background/65 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-semibold text-foreground">Audit Timeline</h3>
                    </div>
                    <Badge variant="secondary" className="text-[9px] font-bold uppercase tracking-wider">{auditEvents.length} events</Badge>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {auditEvents.slice(-9).map((event: any, idx: number) => (
                      <div key={`${event.id || idx}-${event.event_type || event.type}`} className="rounded-xl border border-border/40 bg-card/70 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-xs font-semibold text-foreground">{String(event.event_type || event.type || "event").replace(/\./g, " ")}</p>
                          <Badge variant="outline" className="px-1.5 py-0 text-[8px] font-bold uppercase tracking-wider">{event.status || "info"}</Badge>
                        </div>
                        <p className="mt-1 truncate text-[11px] text-muted-foreground">{event.label || event.node_id || "system"}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-[1.75rem] border border-border/50 bg-card/80 p-5 shadow-sm backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Deliverables</p>
                  <h2 className="mt-1 text-base font-semibold text-foreground">Files and preview surface</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-wider">
                    {fileCount} files
                  </Badge>
                  <Badge variant="outline" className={`text-[10px] font-bold uppercase tracking-wider ${hasPreview ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600" : "border-amber-500/20 bg-amber-500/10 text-amber-600"}`}>
                    {hasPreview ? "Preview ready" : "Preview unavailable"}
                  </Badge>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {filePreview.map((file) => (
                  <div key={file.path} className="rounded-2xl border border-border/40 bg-background/70 px-3 py-3">
                    <p className="truncate text-xs font-semibold text-foreground">{file.path}</p>
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">{file.language || "text"}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-border/50 bg-card/80 shadow-sm backdrop-blur-xl">
              <div className="border-b border-border/40 px-5 py-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Result surface</p>
                <h2 className="mt-1 text-base font-semibold text-foreground">Document, files, and live preview</h2>
              </div>
              <div className="min-h-[680px]">
                <OutputViewer output={data.output} />
              </div>
            </div>
          </section>

          <aside className="space-y-5">
            {evaluation && (
              <div className="rounded-[1.75rem] border border-border/50 bg-card/80 p-5 shadow-sm backdrop-blur-xl">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
                      evaluation.status === "pass"
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-500"
                        : evaluation.status === "needs_review"
                          ? "border-amber-500/20 bg-amber-500/10 text-amber-500"
                          : "border-rose-500/20 bg-rose-500/10 text-rose-500"
                    }`}>
                      {evaluation.status === "pass" ? <CheckCircle2 className="h-5 w-5" /> : evaluation.status === "needs_review" ? <ShieldCheck className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Evaluation</p>
                      <h2 className="text-base font-semibold text-foreground capitalize">{evaluation.status.replace("_", " ")}</h2>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Score</p>
                    <p className="text-lg font-semibold text-foreground">{evaluation.score}/{evaluation.max_score}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">{evaluation.summary}</p>
              </div>
            )}

            <div className="rounded-[1.75rem] border border-border/50 bg-card/80 p-5 shadow-sm backdrop-blur-xl">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Package manifest</p>
              <div className="mt-3 space-y-2">
                <div className="rounded-2xl border border-border/40 bg-background/70 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Package type</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{packageType}</p>
                </div>
                <div className="rounded-2xl border border-border/40 bg-background/70 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Primary artifact</p>
                  <p className="mt-1 truncate text-sm font-semibold text-foreground">{primaryArtifact}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-2xl border border-border/40 bg-background/70 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Planned</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{requestedAgents}</p>
                  </div>
                  <div className="rounded-2xl border border-border/40 bg-background/70 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Generated</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{generatedAgents}</p>
                  </div>
                </div>
              </div>
            </div>

            {evaluation && (
              <div className="rounded-[1.75rem] border border-border/50 bg-card/80 p-5 shadow-sm backdrop-blur-xl">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Checks</p>
                <div className="mt-3 space-y-2">
                  {(evaluation.checks || []).map((check: any, idx: number) => (
                    <div key={idx} className="flex items-start justify-between gap-3 rounded-2xl border border-border/40 bg-background/70 px-3 py-2.5">
                      <div>
                        <p className="text-sm font-medium text-foreground">{check.name}</p>
                        <p className="text-xs text-muted-foreground">{check.detail}</p>
                      </div>
                      <Badge variant="secondary" className={check.passed ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}>
                        {check.passed ? "Pass" : "Review"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
