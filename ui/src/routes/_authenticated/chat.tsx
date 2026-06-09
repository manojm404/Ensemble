import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bot,
  MessageSquarePlus,
  Send,
  Search,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/glass/Primitives";
import { GlassPanel } from "@/components/glass/GlassPanel";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput, GlassTextarea } from "@/components/glass/GlassInput";
import { StateView, StatusChip } from "@/components/glass/StateView";
import { agentApi, chatApi } from "@/lib/adapters";
import type { Agent, ChatMessage } from "@/lib/adapters/types";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({ meta: [{ title: "Chat - 0101" }] }),
  component: ChatPage,
});

function ChatPage() {
  const qc = useQueryClient();
  const [selectedAgentId, setSelectedAgentId] = React.useState("");
  const [topicId, setTopicId] = React.useState("");
  const [draft, setDraft] = React.useState("");
  const [search, setSearch] = React.useState("");

  const agents = useQuery({
    queryKey: ["chat-agents"],
    queryFn: () => agentApi.list(),
  });
  const topics = useQuery({
    queryKey: ["chat-topics"],
    queryFn: () => chatApi.listTopics(),
  });
  const messages = useQuery({
    queryKey: ["chat-messages", topicId],
    queryFn: () => chatApi.getMessages(topicId),
    enabled: Boolean(topicId),
  });

  React.useEffect(() => {
    if (!selectedAgentId && agents.data?.[0]) {
      setSelectedAgentId(agents.data[0].id);
    }
  }, [agents.data, selectedAgentId]);

  const filteredAgents = React.useMemo(() => {
    const items = agents.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((agent) =>
      `${agent.name} ${agent.role} ${agent.description ?? ""} ${agent.capabilities.join(" ")}`
        .toLowerCase()
        .includes(q),
    );
  }, [agents.data, search]);

  const selectedAgent = filteredAgents.find((agent) => agent.id === selectedAgentId) ?? agents.data?.find((agent) => agent.id === selectedAgentId);
  const selectedTopic = topics.data?.find((item) => item.id === topicId);
  const agentLabelById = React.useMemo(() => {
    return Object.fromEntries((agents.data ?? []).map((agent) => [agent.id, agent.name]));
  }, [agents.data]);

  const createTopic = useMutation({
    mutationFn: async () => {
      if (!selectedAgent) throw new Error("Pick an agent first.");
      return chatApi.createTopic({
        title: `${selectedAgent.name} thread`,
        assistant_id: selectedAgent.id,
      });
    },
    onSuccess: (topic) => {
      setTopicId(topic.id);
      qc.invalidateQueries({ queryKey: ["chat-topics"] });
      toast.success(`Started a thread with ${selectedAgent?.name ?? "the agent"}.`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not create topic"),
  });

  const deleteTopic = useMutation({
    mutationFn: (id: string) => chatApi.deleteTopic(id),
    onSuccess: () => {
      setTopicId("");
      qc.invalidateQueries({ queryKey: ["chat-topics"] });
      toast.success("Thread deleted.");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not delete topic"),
  });

  const send = useMutation({
    mutationFn: async () => {
      const body = draft.trim();
      if (!body) throw new Error("Write a message first.");
      const agent = selectedAgent;
      if (!agent) throw new Error("Pick an agent first.");

      let activeTopicId = topicId;
      if (!activeTopicId) {
        const topic = await chatApi.createTopic({
          title: `${agent.name} thread`,
          assistant_id: agent.id,
        });
        activeTopicId = topic.id;
        setTopicId(topic.id);
      }

      await chatApi.sendMessage(activeTopicId, body, "user");
      const history = (messages.data ?? []).map(toGenerateMessage);
      const answer = await chatApi.generate({
        assistant_id: agent.id,
        agent_id: agent.id,
        use_skills: true,
        system_prompt: buildAgentSystemPrompt(agent),
        messages: [...history, { role: "user", content: body }],
        message: body,
      });
      await chatApi.sendMessage(activeTopicId, answer || "I could not generate a response.", "assistant", agent.id);
      return activeTopicId;
    },
    onSuccess: (activeTopicId) => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["chat-topics"] });
      qc.invalidateQueries({ queryKey: ["chat-messages", activeTopicId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Message failed"),
  });

  return (
    <div>
      <PageHeader
        kicker="Operations"
        title="Chat"
        subtitle="Pick any agent and talk to them directly. Threads persist through refresh."
        actions={
          <GlassButton
            variant="rim"
            onClick={() => createTopic.mutate()}
            disabled={!selectedAgent || createTopic.isPending}
          >
            <MessageSquarePlus /> New thread
          </GlassButton>
        }
      />

      <div className="grid xl:grid-cols-[310px_1fr_320px] gap-4 min-h-[68vh]">
        <GlassPanel padding="md" className="space-y-4">
          <div>
            <div className="text-xs font-mono tracking-widest text-muted-foreground uppercase mb-3">
              Agents
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <GlassInput
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search any agent..."
                className="pl-9"
              />
            </div>
            <div className="mt-3 max-h-[38vh] overflow-auto pr-1 space-y-2">
              {filteredAgents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => setSelectedAgentId(agent.id)}
                  className={[
                    "w-full text-left rounded-2xl border px-3 py-3 transition-colors",
                    agent.id === selectedAgentId
                      ? "border-rim/35 bg-rim/[0.08]"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{agent.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {agent.role}
                      </div>
                    </div>
                    <StatusChip status={agent.status} />
                  </div>
                  <div className="mt-2 text-[11px] text-muted-foreground line-clamp-2">
                    {agent.description ?? "No description available."}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-mono tracking-widest text-muted-foreground uppercase mb-3">
              Threads
            </div>
            <StateView loading={topics.isLoading} error={topics.error}>
              {(topics.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No threads yet.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {(topics.data ?? []).map((topic) => {
                    const topicAgentName = topic.assistant_id
                      ? agentLabelById[topic.assistant_id] ?? topic.assistant_id
                      : "0101";
                    return (
                      <li key={topic.id} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setTopicId(topic.id);
                            if (topic.assistant_id) setSelectedAgentId(topic.assistant_id);
                          }}
                          className={[
                            "flex-1 text-left py-2 px-3 rounded-xl hover:bg-white/[0.04]",
                            topic.id === topicId ? "bg-white/[0.06] text-rim" : "text-foreground/85",
                          ].join(" ")}
                        >
                          <span className="block truncate">{topic.title}</span>
                          <span className="block text-[10px] text-muted-foreground">
                            {topicAgentName} · {new Date(topic.updated_at).toLocaleDateString()}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteTopic.mutate(topic.id)}
                          className="p-2 text-muted-foreground hover:text-red-300"
                          aria-label="Delete thread"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </StateView>
          </div>
        </GlassPanel>

        <GlassPanel padding="none" className="flex min-h-[68vh] flex-col overflow-hidden">
          <div className="border-b border-white/10 px-5 py-4">
            <div className="text-sm font-medium flex items-center gap-2">
              <Bot className="size-4 text-rim" />
              {selectedAgent ? selectedAgent.name : "Pick an agent"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {selectedTopic ? selectedTopic.title : "Start a new thread to begin a conversation."}
            </div>
          </div>

          <div className="flex-1 overflow-auto px-5 py-5 space-y-3">
            {!selectedAgent ? (
              <EmptyThread text="Pick any agent to start chatting." />
            ) : !topicId ? (
              <EmptyThread text="Create a thread, then send your first message." />
            ) : messages.isLoading ? (
              <EmptyThread text="Loading messages..." />
            ) : (messages.data ?? []).length === 0 ? (
              <EmptyThread text="Ask the agent for help, critique, or next steps." />
            ) : (
              (messages.data ?? []).map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  agentNames={agentLabelById}
                />
              ))
            )}
          </div>

          <form
            className="border-t border-white/10 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              send.mutate();
            }}
          >
            <div className="flex gap-3 items-end">
              <GlassTextarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    send.mutate();
                  }
                }}
                rows={2}
                placeholder="Ask this agent anything..."
                disabled={!selectedAgent || send.isPending}
              />
              <GlassButton type="submit" variant="rim" size="icon" disabled={!selectedAgent || send.isPending}>
                <Send />
              </GlassButton>
            </div>
          </form>
        </GlassPanel>

        <GlassPanel padding="lg" className="space-y-4">
          <div>
            <div className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="size-4 text-rim" /> Agent brief
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Use this panel to understand who you are talking to and what they are best at.
            </p>
          </div>

          {selectedAgent ? (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                <div className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">
                  Selected agent
                </div>
                <div className="font-semibold text-chrome mt-1">{selectedAgent.name}</div>
                <div className="text-sm text-muted-foreground mt-2">{selectedAgent.role}</div>
                <div className="mt-3 flex items-center gap-2">
                  <StatusChip status={selectedAgent.status} />
                  <span className="text-xs text-muted-foreground">
                    {selectedAgent.capabilities.length} capabilities
                  </span>
                </div>
              </div>

              <div>
                <div className="text-xs font-mono tracking-widest text-muted-foreground uppercase mb-2">
                  Capabilities
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedAgent.capabilities.length > 0 ? (
                    selectedAgent.capabilities.map((capability) => (
                      <span
                        key={capability}
                        className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1 text-xs text-foreground/80"
                      >
                        {capability}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">No capabilities listed.</span>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-xs font-mono tracking-widest text-muted-foreground uppercase mb-2">
                  Suggested use
                </div>
                <p className="text-sm text-muted-foreground">
                  {selectedAgent.description ??
                    "Ask this agent for focused help, critique, or a next-step recommendation."}
                </p>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Pick an agent to see their brief.</p>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  agentNames,
}: {
  message: ChatMessage;
  agentNames: Record<string, string>;
}) {
  const fromUser = message.role === "user";
  const author = fromUser ? "You" : agentNames[message.author ?? ""] ?? message.author ?? "0101";
  return (
    <div className={`flex ${fromUser ? "justify-end" : "justify-start"}`}>
      <div
        className={[
          "max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          fromUser ? "bg-rim/18 border border-rim/25" : "glass-inset",
        ].join(" ")}
      >
        <div className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase mb-1">
          {author}
        </div>
        <div className="whitespace-pre-wrap">{message.body}</div>
      </div>
    </div>
  );
}

function EmptyThread({ text }: { text: string }) {
  return (
    <div className="h-full min-h-[360px] grid place-items-center text-center">
      <div>
        <Bot className="size-8 text-rim mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}

function toGenerateMessage(message: ChatMessage): {
  role: "user" | "assistant" | "system";
  content: string;
} {
  return {
    role: message.role === "user" ? "user" : message.role === "system" ? "system" : "assistant",
    content: message.body,
  };
}

function buildAgentSystemPrompt(agent: Agent) {
  const capabilityLine = agent.capabilities.length
    ? `Capabilities: ${agent.capabilities.join(", ")}.`
    : "Capabilities: general assistance.";
  return [
    `You are ${agent.name}, a ${agent.role}.`,
    agent.description ? `Persona: ${agent.description}` : "",
    capabilityLine,
    "Keep responses direct, helpful, and grounded in the user's request.",
    "If the user asks for a next step, give the next step first.",
  ]
    .filter(Boolean)
    .join("\n");
}
