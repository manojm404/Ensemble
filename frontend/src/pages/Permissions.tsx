import { useState, useEffect } from "react";
import { Shield, Plus, Trash2, CheckCircle2, XCircle, Clock } from "lucide-react";
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
  const [perms, setPerms] = useState(mockPerms);
  const [domains, setDomains] = useState(egressDomains);
  const [newDomain, setNewDomain] = useState("");
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [loadingApprovals, setLoadingApprovals] = useState(true);

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
        <h2 className="text-sm font-semibold text-foreground">Permission Matrix</h2>
        <Badge variant="secondary" className="text-[10px] bg-badge-orange/20 text-badge-orange ml-2">Zero Trust</Badge>
      </div>

      <Tabs defaultValue="matrix" className="flex-1 flex flex-col">
        <div className="px-4 pt-2">
          <TabsList className="h-8 bg-secondary/50">
            <TabsTrigger value="matrix" className="text-xs">Capability Matrix</TabsTrigger>
            <TabsTrigger value="egress" className="text-xs">Egress Whitelist</TabsTrigger>
            <TabsTrigger value="approvals" className="text-xs flex items-center gap-1.5">
              Approvals Queue
              {pendingApprovals.length > 0 && <Badge className="h-4 px-1 py-0 text-[9px] bg-primary">{pendingApprovals.length}</Badge>}
            </TabsTrigger>
          </TabsList>
        </div>

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
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-foreground">{approval.action}</span>
                          <Badge variant="secondary" className="text-[10px] bg-secondary/50 font-mono">{approval.id.split('-')[0]}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">Started by <span className="text-foreground">{approval.agent}</span> in <span className="text-foreground">{approval.workflow_id}</span></p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-mono text-muted-foreground">{new Date(approval.timestamp).toLocaleTimeString()}</p>
                        <Badge variant="outline" className="mt-1 text-[10px]">{approval.status}</Badge>
                      </div>
                    </div>
                    
                    <div className="bg-secondary/30 rounded-lg p-3 border border-border/40">
                      <p className="text-xs text-muted-foreground font-mono whitespace-pre-wrap">{JSON.stringify(approval.details, null, 2)}</p>
                    </div>
                    
                    <div className="flex justify-end gap-2 pt-2">
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
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Permissions;
