import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, FolderTree, ChevronRight, Bot, Users, CheckCircle2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useCompanyContext } from "@/lib/company-context";
import { getCompanyById, getTeamsByCompany, createTeam, getAgentsByCompany } from "@/lib/company-data";

export default function CompanyTeams() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentCompany, setCurrentCompanyId } = useCompanyContext();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamDesc, setTeamDesc] = useState("");
  const [teamEmoji, setTeamEmoji] = useState("📁");

  const company = getCompanyById(id || currentCompany?.id || "") || currentCompany;
  if (!company) return <div className="flex items-center justify-center h-full text-muted-foreground">No company selected</div>;

  const teams = getTeamsByCompany(company.id);
  const agents = getAgentsByCompany(company.id);
  const filtered = teams.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));

  const handleCreate = () => {
    if (!teamName.trim()) return;
    createTeam(company.id, { name: teamName, description: teamDesc, emoji: teamEmoji });
    setCreateOpen(false);
    setTeamName("");
    setTeamDesc("");
    setTeamEmoji("📁");
  };

  const emojis = ["⚙️", "🎨", "📣", "💰", "🔧", "📊", "🧪", "🎮", "🛡️", "📁", "🚀", "💡"];

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-border/40 bg-card/30 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-xl border border-primary/20">{company.emoji}</div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-foreground">{company.name}</h1>
              <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
              <span className="text-sm text-muted-foreground">Teams</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search teams..." className="h-8 pl-8 pr-4 w-48 text-xs bg-secondary/30 border-border/40 rounded-lg" />
            {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="h-3 w-3 text-muted-foreground/40" /></button>}
          </div>
          <Button size="sm" className="gap-1.5 h-8" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New Team
          </Button>
        </div>
      </div>

      {/* Teams Grid */}
      <div className="flex-1 p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((team, i) => {
            const teamAgents = agents.filter(a => a.teamId === team.id);
            return (
              <motion.div key={team.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Card className="cursor-pointer hover:border-primary/20 transition-all hover:shadow-md" onClick={() => navigate(`/company/${company.id}/teams/${team.id}`)}>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-10 w-10 rounded-xl bg-secondary/50 flex items-center justify-center text-xl border border-border/20">{team.emoji}</div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-foreground truncate">{team.name}</h3>
                        <p className="text-[11px] text-muted-foreground line-clamp-1">{team.description}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Bot className="h-3 w-3" /> {teamAgents.length} agents</span>
                      <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> {team.completedIssueCount} done</span>
                    </div>
                    {teamAgents.length > 0 && (
                      <div className="flex -space-x-2 mt-3">
                        {teamAgents.slice(0, 5).map(a => (
                          <div key={a.id} className="h-6 w-6 rounded-full bg-secondary border-2 border-background flex items-center justify-center text-[10px]" title={a.name}>{a.emoji}</div>
                        ))}
                        {teamAgents.length > 5 && (
                          <div className="h-6 w-6 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[8px] text-muted-foreground">+{teamAgents.length - 5}</div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FolderTree className="h-10 w-10 text-muted-foreground/20 mb-4" />
            <p className="text-sm font-semibold text-foreground/60">No teams found</p>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Team</DialogTitle><DialogDescription>Add a new team to {company.name}</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Emoji</Label>
              <div className="flex gap-1.5 flex-wrap">{emojis.map(e => <button key={e} onClick={() => setTeamEmoji(e)} className={`h-8 w-8 rounded-lg text-lg flex items-center justify-center transition-all ${teamEmoji === e ? "bg-primary/20 border border-primary/30" : "bg-secondary/30 hover:bg-secondary/50"}`}>{e}</button>)}</div>
            </div>
            <div className="space-y-2"><Label>Name</Label><Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="e.g. Engineering" /></div>
            <div className="space-y-2"><Label>Description</Label><Input value={teamDesc} onChange={(e) => setTeamDesc(e.target.value)} placeholder="e.g. Build and maintain the platform" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!teamName.trim()}>Create Team</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
