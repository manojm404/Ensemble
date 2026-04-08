/**
 * org-context.tsx — Organization Context Provider
 *
 * Manages current organization state across the app.
 * Provides org list, current org, and switch/create/delete functions.
 */

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { fetchApi } from "./api";
import { 
  createOrg as createOrgData, 
  deleteOrg as deleteOrgData,
  getAllOrgs as getAllOrgsData,
  type Organization as OrgDataEntry 
} from "./org-data";

export interface Organization {
  id: string;
  name: string;
  description: string;
  tier: "Starter" | "Pro" | "Enterprise";
  status: "Active" | "Setup";
  icon?: string;
  iconBg?: string;
}

interface OrgContextType {
  orgs: Organization[];
  currentOrg: Organization | null;
  setCurrentOrgId: (orgId: string | null) => void;
  createOrg: (org: Omit<Organization, "id" | "status">) => Promise<Organization>;
  deleteOrg: (orgId: string) => Promise<void>;
  isLoading: boolean;
}

const OrgContext = createContext<OrgContextType | null>(null);

export function useOrgContext() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrgContext must be used within OrgProvider");
  return ctx;
}

const STORAGE_KEY = "ensemble_current_org";

export function OrgProvider({ children }: { children: ReactNode }) {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load orgs on mount from org-data.ts (single source of truth)
  useEffect(() => {
    const loadOrgs = async () => {
      try {
        // Load from org-data.ts store (which persists to localStorage)
        const localOrgs = getAllOrgsData();
        
        // Try to fetch from backend to get latest data
        try {
          const backendOrgs = await fetchApi("/api/orgs");
          if (backendOrgs && Array.isArray(backendOrgs) && backendOrgs.length > 0) {
            // Merge backend data with local store
            const backendIds = new Set(backendOrgs.map((o: any) => o.id));
            const mapped = [
              // Include local orgs not in backend
              ...localOrgs.filter(o => !backendIds.has(o.id)).map(o => ({
                id: o.id,
                name: o.name,
                description: o.description,
                tier: o.tier,
                status: o.status,
              })),
              // Add backend orgs
              ...backendOrgs.map((o: any) => ({
                id: o.id,
                name: o.name,
                description: o.description || "",
                tier: o.tier || "Starter",
                status: o.status || "Setup",
              }))
            ];
            setOrgs(mapped);
            return;
          }
        } catch {
          // Backend unavailable, use local data
        }
        
        // Use local orgs if backend unavailable or returns empty
        if (localOrgs.length > 0) {
          const mapped = localOrgs.map(o => ({
            id: o.id,
            name: o.name,
            description: o.description,
            tier: o.tier,
            status: o.status,
          }));
          setOrgs(mapped);
        }
      } catch (err) {
        console.error("Failed to load organizations:", err);
      } finally {
        setIsLoading(false);
      }
    };
    loadOrgs();
  }, []);

  // Set current org from saved preference
  useEffect(() => {
    const savedOrgId = localStorage.getItem(STORAGE_KEY);
    if (savedOrgId && orgs.length > 0) {
      const found = orgs.find(o => o.id === savedOrgId);
      if (found) setCurrentOrg(found);
    } else if (orgs.length > 0) {
      setCurrentOrg(orgs[0]);
    }
  }, [orgs]);

  const setCurrentOrgId = (orgId: string | null) => {
    if (orgId) {
      const found = orgs.find(o => o.id === orgId);
      if (found) {
        setCurrentOrg(found);
        localStorage.setItem(STORAGE_KEY, orgId);
      }
    } else {
      setCurrentOrg(null);
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const createOrg = async (org: Omit<Organization, "id" | "status">): Promise<Organization> => {
    let newOrg: Organization;
    
    try {
      const result = await fetchApi("/api/orgs", {
        method: "POST",
        body: JSON.stringify(org),
      });
      
      newOrg = {
        id: result.id,
        name: result.name,
        description: result.description || "",
        tier: result.tier || "Starter",
        status: "Setup",
      };
    } catch {
      // Fallback: generate ID locally
      newOrg = {
        id: org.name.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now().toString(36),
        name: org.name,
        description: org.description || "",
        tier: org.tier || "Starter",
        status: "Setup",
      };
    }
    
    // CRITICAL: Sync with org-data.ts store
    createOrgData({
      id: newOrg.id,
      name: newOrg.name,
      description: newOrg.description,
      tier: newOrg.tier,
    });
    
    // Update context state
    const updatedOrgs = [...orgs, newOrg];
    setOrgs(updatedOrgs);
    setCurrentOrg(newOrg);
    localStorage.setItem(STORAGE_KEY, newOrg.id);
    
    return newOrg;
  };

  const deleteOrg = async (orgId: string): Promise<void> => {
    try {
      await fetchApi(`/api/orgs/${orgId}`, { method: "DELETE" });
    } catch {
      // Fallback: delete locally
    }
    
    // CRITICAL: Sync with org-data.ts store
    deleteOrgData(orgId);
    
    const updatedOrgs = orgs.filter(o => o.id !== orgId);
    setOrgs(updatedOrgs);

    if (currentOrg?.id === orgId) {
      if (updatedOrgs.length > 0) {
        setCurrentOrg(updatedOrgs[0]);
        localStorage.setItem(STORAGE_KEY, updatedOrgs[0].id);
      } else {
        setCurrentOrg(null);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  };

  return (
    <OrgContext.Provider value={{
      orgs,
      currentOrg,
      setCurrentOrgId,
      createOrg,
      deleteOrg,
      isLoading,
    }}>
      {children}
    </OrgContext.Provider>
  );
}
