import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Plus, Trash2, CheckCircle2, XCircle, Clock, AlertTriangle, FileText, GitBranch, ExternalLink } from "lucide-react";
import { getPendingApprovals, submitApproval } from "@/lib/api";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Permission {
  agentId: string;
  agentName: string;
  read: boolean;
  write: boolean;
  execute: boolean;
  network: boolean;
}

const mockPerms: Permission[] = [
  { agentId: "1", agentName: "CodeBot", read: true, write: true, execute: true, network: false },
  { agentId: "2", agentName: "Architect", read: true, write: false, execute: false, network: true },
  { agentId: "3", agentName: "DocWriter", read: true, write: true, execute: false, network: false },
  { agentId: "4", agentName: "DataSage", read: true, write: false, execute: true, network: true },
  { agentId: "5", agentName: "InfraBot", read: true, write: true, execute: true, network: true },
];

const egressDomains = ["api.openai.com", "api.anthropic.com", "github.com", "registry.npmjs.org"];

const Permissions = () => {
  const navigate = useNavigate();
  const [perms, setPerms] = useState(mockPerms);
  const [domains, setDomains] = useState(egressDomains);
  const [newDomain, setNewDomain] = useState("");
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [loadingApprovals, setLoadingApprovals] = useState(true);

  const approvalSummary = useMemo(() => {
    const approvals = pendingApprovals.length;
    const approvalsByWorkflow = pendingApprovals.reduce<Record<string, number>>((acc, approval) => {
      const key = approval.workflow_id || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const topWorkflow = Object.entries(approvalsByWorkflow).sort((a, b) => b[1] - a[1])[0];
    return {
      approvals,
      topWorkflow: topWorkflow?.[0] || "No active workflow",
      topWorkflowCount: topWorkflow?.[1] || 0,
    };
  }, [pendingApprovals]);

  const formatDetails = (details: Record<string, any>) => {
    if (!details || typeof details !== "object") return [];
    const entries = [
      ["Run ID", details.run_id || details.runId],
      ["Workflow", details.workflow_id || details.workflowId],
      ["Current node", details.current_node || details.currentNode || details.node_id],
      ["Estimated cost", details.cost || details.estimated_cost || details.cost_usd],
      ["Tool", details.tool || details.action || details.operation],
    ];
    return entries.filter(([, value]) => value !== undefined && value !== null && value !== "");
  };

  useEffect(() => {
    let mounted = true;
    getPendingApprovals().then((data) => {
      if (mounted) {
        setPendingApprovals(Array.isArray(data) ? data : []);
        setLoadingApprovals(false);
      }
    });
    return () => { mounted = false; };
  }, []);

  const handleDecision = async (id: string, decision: "APPROVE" | "REJECT") => {
    const success = await submitApproval(id, decision);
    if (success) {
      setPendingApprovals((prev) => prev.filter((a) => a.id !== id));
    }
  };

  const togglePerm = (agentId: string, key: keyof Omit<Permission, "agentId" | "agentName">) => {
    setPerms((prev) => prev.map((p) => (p.agentId === agentId ? { ...p, [key]: !p[key] } : p)));
  };

  const PermBadge = ({ enabled }: { enabled: boolean }) => (
    <Badge variant="secondary" className={`text-[10px] ${enabled ? "bg-badge-green/20 text-badge-green" : "bg-badge-red/20 text-badge-red"}`}>
      {enabled ? "Allow" : "Deny"}
    </Badge>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-4 border-b border-border/50">
        <Shield className="h-5 w-5 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Governance Center</h2>
        <Badge variant="secondary" className="text-[10px] bg-badge-orange/20 text-badge-orange ml-2">Zero Trust</Badge>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] gap-1.5">
            <AlertTriangle className="h-3 w-3" />
            {approvalSummary.approvals} pending
          </Badge>
          <Badge variant="outline" className="text-[10px] gap-1.5">
            <GitBranch className="h-3 w-3" />
            {approvalSummary.topWorkflowCount} in {approvalSummary.topWorkflow}
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="approvals" className="flex-1 flex flex-col">
        <div className="px-4 pt-2">
          <TabsList className="h-8 bg-secondary/50">
            <TabsTrigger value="approvals" className="text-xs flex items-center gap-1.5">
              Approvals Queue
              {pendingApprovals.length > 0 && <Badge className="h-4 px-1 py-0 text-[9px] bg-primary">{pendingApprovals.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="matrix" className="text-xs">Capability Matrix</TabsTrigger>
            <TabsTrigger value="egress" className="text-xs">Egress Whitelist</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="approvals" className="flex-1 mt-0 p-4">
          <div className="max-w-3xl space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Review and approve high-risk agent actions or expenditures.</p>
              <Button variant="outline" size="sm" onClick={() => {
                setLoadingApprovals(true);
                getPendingApprovals().then(data => { setPendingApprovals(Array.isArray(data) ? data : []); setLoadingApprovals(false); });
              }}>Refresh</Button>
            </div>

            {loadingApprovals ? (
              <div className="text-xs text-muted-foreground">Loading queue...</div>
            ) : pendingApprovals.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/40 p-8 text-center bg-card/30">
                <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="text-sm text-foreground font-medium">No pending approvals</p>
                <p className="text-xs text-muted-foreground mt-1">Agent actions are flowing smoothly.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingApprovals.map((approval) => (
                  <div key={approval.id} className="rounded-xl border border-border/50 bg-card p-4 flex flex-col gap-3">
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-semibold text-foreground">{approval.action}</span>
                          <Badge variant="secondary" className="text-[10px] bg-secondary/50 font-mono">{approval.id.split('-')[0]}</Badge>
                          {approval.workflow_id && (
                            <Badge variant="outline" className="text-[10px] gap-1.5">
                              <GitBranch className="h-3 w-3" />
                              {approval.workflow_id}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Started by <span className="text-foreground">{approval.agent}</span>
                          {approval.reason ? <> · <span className="text-foreground">{approval.reason}</span></> : null}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-mono text-muted-foreground">{new Date(approval.timestamp).toLocaleTimeString()}</p>
                        <Badge variant="outline" className="mt-1 text-[10px]">{approval.status}</Badge>
                      </div>
                    </div>

                    <div className="grid gap-2 md:grid-cols-2">
                      {formatDetails(approval.details).map(([label, value]) => (
                        <div key={label} className="rounded-lg border border-border/40 bg-secondary/20 px-3 py-2">
                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
                          <p className="mt-1 truncate text-sm font-medium text-foreground">{String(value)}</p>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-lg border border-border/40 bg-secondary/30 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Decision details</p>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground whitespace-pre-wrap">{approval.details?.message || approval.details?.summary || approval.details?.note || approval.reason || "Review the payload below and decide whether to approve or reject this action."}</p>
                      <p className="mt-3 text-xs font-mono text-muted-foreground whitespace-pre-wrap">{JSON.stringify(approval.details, null, 2)}</p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                      <Button variant="ghost" size="sm" className="gap-1.5 px-2 text-xs text-muted-foreground" onClick={() => approval.workflow_id && navigate(`/workflow-output/${approval.workflow_id}`)} disabled={!approval.workflow_id}>
                        <ExternalLink className="h-3.5 w-3.5" />
                        View workflow
                      </Button>
                      <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="text-badge-red hover:text-badge-red border-badge-red/20 hover:bg-badge-red/10" onClick={() => handleDecision(approval.id, "REJECT")}>
                        <XCircle className="h-4 w-4 mr-1.5" />
                        Deny Action
                      </Button>
                      <Button size="sm" className="bg-badge-green text-badge-green-foreground hover:bg-badge-green/90" onClick={() => handleDecision(approval.id, "APPROVE")}>
                        <CheckCircle2 className="h-4 w-4 mr-1.5" />
                        Approve Action
                      </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="matrix" className="flex-1 mt-0 p-4">
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="text-xs">Agent</TableHead>
                  <TableHead className="text-xs text-center">Read</TableHead>
                  <TableHead className="text-xs text-center">Write</TableHead>
                  <TableHead className="text-xs text-center">Execute</TableHead>
                  <TableHead className="text-xs text-center">Network</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perms.map((p) => (
                  <TableRow key={p.agentId} className="border-border/50">
                    <TableCell className="text-sm font-medium">{p.agentName}</TableCell>
                    {(["read", "write", "execute", "network"] as const).map((key) => (
                      <TableCell key={key} className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Switch checked={p[key]} onCheckedChange={() => togglePerm(p.agentId, key)} />
                          <PermBadge enabled={p[key]} />
                        </div>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="egress" className="flex-1 mt-0 p-4">
          <div className="space-y-4 max-w-lg">
            <p className="text-sm text-muted-foreground">Manage allowed external domains for agent network requests.</p>
            <div className="flex gap-2">
              <Input value={newDomain} onChange={(e) => setNewDomain(e.target.value)} placeholder="api.example.com" className="bg-secondary/50 border-border/50" />
              <Button size="sm" className="gap-1" onClick={() => { if (newDomain.trim()) { setDomains((d) => [...d, newDomain.trim()]); setNewDomain(""); } }}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
            <div className="space-y-1">
              {domains.map((d, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-border/50 bg-card px-3 py-2">
                  <span className="text-sm text-foreground font-mono">{d}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDomains((ds) => ds.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Permissions;
