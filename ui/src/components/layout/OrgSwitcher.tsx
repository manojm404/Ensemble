/**
 * OrgSwitcher.tsx — Dropdown organization switcher
 * 
 * Shows current org name with dropdown to switch between orgs.
 * Includes "Create New Org" and "Personal Workspace" options.
 */

import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2,
  Plus,
  Check,
  Sparkles,
  Trash2,
  ChevronDown,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useOrgContext, type Organization } from "@/lib/org-context";
import { toast } from "sonner";

export function OrgSwitcher() {
  const { orgs, currentOrg, setCurrentOrgId, createOrg, deleteOrg } = useOrgContext();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgDesc, setNewOrgDesc] = useState("");
  const [newOrgTier, setNewOrgTier] = useState<"Starter" | "Pro" | "Enterprise">("Starter");
  const [creating, setCreating] = useState(false);
  
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click or escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const filteredOrgs = orgs.filter(o =>
    o.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelectOrg = (org: Organization) => {
    setCurrentOrgId(org.id);
    setOpen(false);
    navigate(`/org/${org.id}`);
  };

  const handlePersonalWorkspace = () => {
    setCurrentOrgId(null);
    setOpen(false);
    navigate("/personal");
  };

  const handleDeleteOrg = async (e: React.MouseEvent, org: Organization) => {
    e.stopPropagation();
    if (!confirm(`Delete "${org.name}"? This cannot be undone.`)) return;
    await deleteOrg(org.id);
    toast.success(`"${org.name}" deleted`);
  };

  const handleCreateOrg = async () => {
    if (!newOrgName.trim()) {
      toast.error("Organization name is required");
      return;
    }
    setCreating(true);
    try {
      await createOrg({
        name: newOrgName,
        description: newOrgDesc,
        tier: newOrgTier,
      });
      toast.success(`"${newOrgName}" created`);
      setCreateOpen(false);
      setNewOrgName("");
      setNewOrgDesc("");
      setNewOrgTier("Starter");
    } catch (err: any) {
      toast.error(err.message || "Failed to create organization");
    } finally {
      setCreating(false);
    }
  };

  // Determine display name
  const isPersonal = location.pathname.startsWith("/personal");
  const displayName = isPersonal
    ? "Personal Workspace"
    : currentOrg?.name || "Select Organization";

  return (
    <div className="relative" ref={ref}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className="h-8 px-3 flex items-center gap-2 rounded-lg bg-secondary/50 hover:bg-secondary/80 border border-border/30 transition-colors text-xs font-medium text-foreground"
      >
        {isPersonal ? (
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        ) : (
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className="truncate max-w-[140px]">{displayName}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground/60" />
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full left-0 mt-2 w-72 rounded-xl glass border border-border/40 shadow-2xl z-50 overflow-hidden"
            >
              {/* Search */}
              <div className="p-3 border-b border-border/30">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search organizations..."
                    className="h-8 pl-8 text-xs bg-secondary/30 border-border/30"
                  />
                </div>
              </div>

              {/* Personal Workspace option */}
              <button
                onClick={handlePersonalWorkspace}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-primary/10 ${
                  isPersonal ? "bg-primary/10 text-primary" : "text-foreground"
                }`}
              >
                <Sparkles className="h-4 w-4 text-primary shrink-0" />
                <span className="flex-1 text-left font-medium">Personal Workspace</span>
                {isPersonal && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
              </button>

              {/* Divider */}
              <div className="h-px bg-border/20 mx-3" />

              {/* Organization list */}
              <div className="max-h-[250px] overflow-y-auto p-1.5 space-y-0.5">
                {filteredOrgs.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    {orgs.length === 0 ? "No organizations yet" : "No matches"}
                  </p>
                )}
                {filteredOrgs.map((org) => (
                  <button
                    key={org.id}
                    onClick={() => handleSelectOrg(org)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors group ${
                      currentOrg?.id === org.id
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-secondary/50"
                    }`}
                  >
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 text-left min-w-0">
                      <span className="font-medium truncate block">{org.name}</span>
                      <span className="text-[10px] text-muted-foreground/60">{org.tier}</span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => handleDeleteOrg(e, org)}
                        className="h-5 w-5 flex items-center justify-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                      {currentOrg?.id === org.id && <Check className="h-3.5 w-3.5 text-primary" />}
                    </div>
                  </button>
                ))}
              </div>

              {/* Create new org button */}
              <div className="p-2 border-t border-border/30">
                {!createOpen ? (
                  <button
                    onClick={() => setCreateOpen(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Create New Organization
                  </button>
                ) : (
                  <div className="p-3 space-y-2">
                    <Input
                      value={newOrgName}
                      onChange={(e) => setNewOrgName(e.target.value)}
                      placeholder="Organization name"
                      className="h-8 text-xs bg-secondary/30 border-border/30"
                      autoFocus
                    />
                    <Input
                      value={newOrgDesc}
                      onChange={(e) => setNewOrgDesc(e.target.value)}
                      placeholder="Description (optional)"
                      className="h-8 text-xs bg-secondary/30 border-border/30"
                    />
                    <div className="flex gap-1">
                      {(["Starter", "Pro", "Enterprise"] as const).map(tier => (
                        <button
                          key={tier}
                          onClick={() => setNewOrgTier(tier)}
                          className={`flex-1 text-[10px] py-1 rounded ${
                            newOrgTier === tier
                              ? "bg-primary/20 text-primary font-medium"
                              : "text-muted-foreground hover:bg-secondary/50"
                          }`}
                        >
                          {tier}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-7 text-[10px]"
                        onClick={() => setCreateOpen(false)}
                        disabled={creating}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 h-7 text-[10px]"
                        onClick={handleCreateOrg}
                        disabled={creating || !newOrgName.trim()}
                      >
                        {creating ? "Creating..." : "Create"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
