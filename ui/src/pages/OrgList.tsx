import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Building2,
  Users,
  Cpu,
  Layers,
  ChevronRight,
  ShieldCheck,
  Zap,
  Rocket,
  Plus,
  X,
  Save,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { fetchApi } from "@/lib/api";
import { createOrg, getAllOrgs, deleteOrg } from "@/lib/org-data";
import { Trash2 } from "lucide-react";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" }
  }
};

export default function OrgList() {
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState(() => getAllOrgs().map(o => ({
    id: o.id,
    name: o.name,
    status: o.status,
    description: o.description,
    members: o.memberCount,
    agents: o.agentCount,
    depts: o.departmentCount,
    tier: o.tier,
    icon: <Building2 className="h-6 w-6 text-primary" />,
    iconBg: "bg-primary/10"
  })));
  const [createOpen, setCreateOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [industry, setIndustry] = useState("");
  const [tier, setTier] = useState("Starter");
  const [website, setWebsite] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [location, setLocation] = useState("");

  const resetForm = () => {
    setName("");
    setDescription("");
    setIndustry("");
    setTier("Starter");
    setWebsite("");
    setContactEmail("");
    setLocation("");
  };

  useEffect(() => {
    // Try to load real orgs from backend, fall back to local store
    fetchApi('/api/orgs')
      .then(data => {
        if (data && Array.isArray(data) && data.length > 0) {
          // Merge backend data with local store
          const localOrgs = getAllOrgs();
          const backendIds = new Set(data.map((o: any) => o.id));
          const merged = [...localOrgs.filter(o => !backendIds.has(o.id)), ...data.map((o: any) => ({
            id: o.id,
            name: o.name,
            status: o.status || "Active",
            description: o.description || "Organization",
            members: o.memberCount || o.members || 0,
            agents: o.agentCount || o.agents || 0,
            depts: o.departmentCount || o.departments || 0,
            tier: o.tier || "Starter",
            icon: <Building2 className="h-6 w-6 text-primary" />,
            iconBg: "bg-primary/10"
          }))];
          setOrgs(merged.map(o => ({
            id: o.id,
            name: o.name,
            status: o.status,
            description: o.description,
            members: o.members,
            agents: o.agents,
            depts: o.depts,
            tier: o.tier,
            icon: o.icon || <Building2 className="h-6 w-6 text-primary" />,
            iconBg: o.iconBg || "bg-primary/10"
          })));
        }
      })
      .catch(() => {
        // Use local orgs if backend unavailable
        const localOrgs = getAllOrgs();
        setOrgs(localOrgs.map(o => ({
          id: o.id,
          name: o.name,
          status: o.status,
          description: o.description,
          members: o.memberCount,
          agents: o.agentCount,
          depts: o.departmentCount,
          tier: o.tier,
          icon: <Building2 className="h-6 w-6 text-primary" />,
          iconBg: "bg-primary/10"
        })));
      });
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Organization name is required");
      return;
    }
    setLoading(true);
    try {
      // Try backend first
      const result = await fetchApi('/api/orgs', {
        method: 'POST',
        body: JSON.stringify({
          name,
          description,
          industry,
          tier,
          website,
          contact_email: contactEmail,
          location
        })
      });

      const newOrgData = {
        id: result.id || name.toLowerCase().replace(/\s+/g, '-'),
        name,
        description: description || "New organization",
        tier: tier as any,
        industry,
        website,
        contactEmail,
        location,
      };

      const createdOrg = createOrg(newOrgData);
      addOrgToUI(createdOrg);
    } catch (err: any) {
      // Fallback: create locally
      const newOrgData = {
        id: name.toLowerCase().replace(/\s+/g, '-'),
        name,
        description: description || "New organization",
        tier: tier as any,
        industry,
        website,
        contactEmail,
        location,
      };
      const createdOrg = createOrg(newOrgData);
      addOrgToUI(createdOrg);
    } finally {
      setLoading(false);
    }
  };

  const addOrgToUI = (org: any) => {
    const newOrg = {
      id: org.id,
      name: org.name,
      status: org.status,
      description: org.description,
      members: org.memberCount,
      agents: org.agentCount,
      depts: org.departmentCount,
      tier: org.tier,
      icon: <Building2 className="h-6 w-6 text-primary" />,
      iconBg: "bg-primary/10"
    };
    setOrgs(prev => [...prev, newOrg]);
    setCreateOpen(false);
    resetForm();
    toast.success(`"${org.name}" created successfully`);
  };

  const iconMap: Record<string, { icon: React.ReactNode; bg: string }> = {
    "Ensemble Labs": { icon: <Building2 className="h-6 w-6 text-primary" />, bg: "bg-primary/10" },
    "Nexus AI Corp": { icon: <Zap className="h-6 w-6 text-amber-400" />, bg: "bg-amber-400/10" },
    "Stealth Startup": { icon: <Rocket className="h-6 w-6 text-indigo-400" />, bg: "bg-indigo-400/10" },
  };

  const handleDelete = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!confirm(`Delete organization "${name}"? This cannot be undone.`)) return;
    deleteOrg(id);
    setOrgs(prev => prev.filter(o => o.id !== id));
    toast.success(`"${name}" deleted`);
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Organizations</h1>
            <p className="text-sm text-muted-foreground mt-1 font-medium italic opacity-60 font-mono tracking-tighter">Canonical Registry — Deploying Corporate Intelligence</p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => { resetForm(); setCreateOpen(true); }}>
            <Plus className="h-4 w-4" /> New Organization
          </Button>
        </div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6"
        >
          {orgs.map((org) => {
            const iconData = iconMap[org.name] || { icon: <Building2 className="h-6 w-6 text-primary" />, bg: "bg-primary/10" };
            return (
              <motion.div key={org.id} variants={itemVariants}>
                <Card
                  className="p-8 bg-card/40 backdrop-blur-md border-border/40 rounded-[2.5rem] hover:border-primary/40 hover:bg-card/70 transition-all duration-500 cursor-pointer group relative overflow-hidden shadow-2xl"
                  onClick={() => navigate(`/org/${org.id}`)}
                >
                  {/* Background Glow */}
                  <div className="absolute -top-24 -right-24 h-48 w-48 bg-primary/5 blur-[100px] rounded-full group-hover:bg-primary/10 transition-all duration-700" />

                  <div className="flex flex-col gap-6">
                    <div className="flex items-center justify-between">
                      <div className={`h-16 w-16 rounded-3xl ${org.iconBg || iconData.bg} flex items-center justify-center border border-white/10 shadow-inner transition-transform group-hover:scale-105 duration-500`}>
                        {org.icon || iconData.icon}
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary" className={`text-[10px] uppercase font-black tracking-widest px-3 h-6 rounded-lg ${org.status === 'Active' ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' : 'bg-muted text-muted-foreground'}`}>
                          {org.status}
                        </Badge>
                        <button
                          onClick={(e) => handleDelete(e, org.id, org.name)}
                          className="opacity-0 group-hover:opacity-100 h-6 w-6 flex items-center justify-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                          title="Delete organization"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    <div>
                      <h2 className="text-2xl font-black text-foreground group-hover:text-primary transition-colors tracking-tighter">{org.name}</h2>
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2 font-medium italic leading-relaxed h-10 opacity-70 group-hover:opacity-100 transition-opacity">
                        {org.description}
                      </p>
                    </div>

                    <div className="pt-6 border-transparent group-hover:border-white/5 transition-all">
                      <div className="flex items-center gap-6">
                        <div className="flex flex-col gap-1">
                          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/30 px-1">Infrastructure</span>
                          <div className="flex items-center gap-4 text-[11px] font-bold text-muted-foreground/80">
                            <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-primary/40" /> {org.members}</span>
                            <span className="flex items-center gap-1.5"><Cpu className="h-4 w-4 text-primary/40" /> {org.agents}</span>
                            <span className="flex items-center gap-1.5"><Layers className="h-4 w-4 text-primary/40" /> {org.depts}</span>
                          </div>
                        </div>
                        <div className="ml-auto">
                          <div className="h-9 w-9 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 group-hover:bg-primary/20 group-hover:border-primary/20 transition-all">
                            <ChevronRight className="h-5 w-5 text-muted-foreground/20 group-hover:text-primary" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      {/* Create Organization Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto glass border-border/40">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Create New Organization</DialogTitle>
            <DialogDescription className="text-xs">Set up a new organization with agents, departments, and workflows</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            {/* Name */}
            <div className="space-y-1.5">
              <Label className="text-xs"><span className="text-destructive">*</span> Organization Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Acme Corp" className="h-9" />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this organization do?" className="min-h-[70px]" />
            </div>

            {/* Industry */}
            <div className="space-y-1.5">
              <Label className="text-xs">Industry</Label>
              <Select value={industry} onValueChange={setIndustry}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select industry" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="technology">Technology</SelectItem>
                  <SelectItem value="finance">Finance & Banking</SelectItem>
                  <SelectItem value="healthcare">Healthcare</SelectItem>
                  <SelectItem value="education">Education</SelectItem>
                  <SelectItem value="ecommerce">E-Commerce</SelectItem>
                  <SelectItem value="media">Media & Entertainment</SelectItem>
                  <SelectItem value="manufacturing">Manufacturing</SelectItem>
                  <SelectItem value="consulting">Consulting</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tier */}
            <div className="space-y-1.5">
              <Label className="text-xs">Plan Tier</Label>
              <Select value={tier} onValueChange={setTier}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Starter">Starter — Basic features</SelectItem>
                  <SelectItem value="Pro">Pro — Advanced workflows</SelectItem>
                  <SelectItem value="Enterprise">Enterprise — Full suite</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Website */}
            <div className="space-y-1.5">
              <Label className="text-xs">Website</Label>
              <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" className="h-9" />
            </div>

            {/* Contact Email */}
            <div className="space-y-1.5">
              <Label className="text-xs">Contact Email</Label>
              <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="admin@example.com" type="email" className="h-9" />
            </div>

            {/* Location */}
            <div className="space-y-1.5">
              <Label className="text-xs">Location</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g., San Francisco, CA" className="h-9" />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setCreateOpen(false)} disabled={loading}>
                Cancel
              </Button>
              <Button className="flex-1 gap-1.5" onClick={handleCreate} disabled={loading || !name.trim()}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Creating...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" /> Create Organization
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
