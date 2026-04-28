import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, Building2, Users, Bot, FolderTree, Sparkles, Trash2, Loader2, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useCompanyContext } from "@/lib/company-context";
import { getAllCompanies, deleteCompany, buildCompanyFromMission, createCompanyFromMission, getCompanyById, updateCompany } from "@/lib/company-data";
import { MagicCompanyDialog } from "@/components/layout/MagicCompanyDialog";
import { toast } from "sonner";

export default function CompanyList() {
  const navigate = useNavigate();
  const { companies, currentCompany, setCurrentCompanyId, createCompany } = useCompanyContext();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [mission, setMission] = useState("");
  const [creating, setCreating] = useState(false);
  const [magicOpen, setMagicOpen] = useState(false);
  const [magicGenerating, setMagicGenerating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editMission, setEditMission] = useState("");
  const [forceRefresh, setForceRefresh] = useState(0);

  const localCompanies = getAllCompanies();
  const displayCompanies = companies.length > 0 ? companies : localCompanies.map(c => ({
    id: c.id, name: c.name, mission: c.mission || "", emoji: c.emoji || "🏢", status: c.status,
  }));

  const handleDelete = async (id: string) => {
    const deleted = deleteCompany(id);
    if (deleted) {
      toast.success("Company deleted");
      // If the deleted company was selected, go back to list
      if (currentCompany?.id === id) {
        setCurrentCompanyId(null as any);
      }
      setForceRefresh(prev => prev + 1); // Trigger re-render
    }
    setDeleteTarget(null);
  };

  const handleEditOpen = (id: string) => {
    const company = getCompanyById(id);
    if (company) {
      setEditName(company.name);
      setEditMission(company.mission || "");
      setEditTarget(id);
    }
  };

  const handleEditSave = () => {
    if (!editTarget || !editName.trim()) return;
    updateCompany(editTarget, { name: editName, mission: editMission });
    toast.success(`Company "${editName}" updated`);
    setForceRefresh(prev => prev + 1);
    setEditTarget(null);
  };

  const handleCreate = async () => {
    if (!name.trim() || !mission.trim()) return;
    setCreating(true);
    try {
      const structure = buildCompanyFromMission(mission);
      const company = createCompanyFromMission(mission, { ...structure, name });
      setCurrentCompanyId(company.id);
      navigate(`/company/${company.id}`);
    } catch (e) {
      console.error(e);
    }
    setCreating(false);
    setCreateOpen(false);
  };

  const handleMagicCreate = async (missionText: string) => {
    setMagicGenerating(true);
    try {
      const company = await createCompany(missionText);
      setMagicOpen(false);
      navigate(`/company/${company.id}`);
    } catch (e) {
      console.error(e);
    }
    setMagicGenerating(false);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div className="max-w-6xl mx-auto w-full px-8 py-12">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Companies</h1>
            <p className="text-sm text-muted-foreground mt-1">Build and manage your AI-powered companies</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setMagicOpen(true)}>
              <Sparkles className="h-4 w-4" /> Auto-Build Company
            </Button>
            <Button size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New Company
            </Button>
          </div>
        </div>

        <Separator className="mb-8" />

        {/* Company Grid */}
        {displayCompanies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-20 w-20 rounded-2xl bg-secondary/30 flex items-center justify-center mb-6">
              <Building2 className="h-10 w-10 text-muted-foreground/30" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No companies yet</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              Describe your mission and we'll auto-build a company with a CEO and the right team of agents.
            </p>
            <Button className="gap-2" onClick={() => setMagicOpen(true)}>
              <Sparkles className="h-4 w-4" /> Build Your First Company
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayCompanies.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card
                  className={`cursor-pointer transition-all hover:shadow-lg hover:border-primary/20 ${
                    currentCompany?.id === c.id ? "border-primary/40 shadow-md shadow-primary/5" : ""
                  }`}
                  onClick={() => { setCurrentCompanyId(c.id); navigate(`/company/${c.id}`); }}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-xl">
                          {c.emoji}
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">{c.name}</h3>
                          {c.mission && (
                            <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{c.mission}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={(e) => { e.stopPropagation(); handleEditOpen(c.id); }}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(c.id); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" /> 1</span>
                      <span className="flex items-center gap-1"><Bot className="h-3 w-3" /> —</span>
                      <span className="flex items-center gap-1"><FolderTree className="h-3 w-3" /> —</span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Manual Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Company</DialogTitle>
            <DialogDescription>Give your company a name and mission</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Company Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Analytics Co." />
            </div>
            <div className="space-y-2">
              <Label>Mission</Label>
              <Textarea value={mission} onChange={(e) => setMission(e.target.value)} placeholder="e.g. Build a SaaS analytics platform..." className="min-h-[80px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !name.trim() || !mission.trim()}>
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Company
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Company</DialogTitle>
            <DialogDescription>Are you sure? This will remove the company and all its data. This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteTarget && handleDelete(deleteTarget)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Company Dialog */}
      <Dialog open={!!editTarget} onOpenChange={() => setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Company</DialogTitle>
            <DialogDescription>Update the company name and mission. Changes will be saved immediately.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Company Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Company name" />
            </div>
            <div className="space-y-2">
              <Label>Mission</Label>
              <Textarea value={editMission} onChange={(e) => setEditMission(e.target.value)} placeholder="Company mission..." className="min-h-[80px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={!editName.trim()}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Magic Company Dialog */}
      <MagicCompanyDialog open={magicOpen} onOpenChange={setMagicOpen} onGenerate={handleMagicCreate} isGenerating={magicGenerating} />
    </div>
  );
}
