/**
 * company-context.tsx — Company Context Provider
 *
 * Manages current company state across the app.
 * Provides company list, current company, and create/delete functions.
 * Supports "Magic Company" creation via mission statement.
 */

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { fetchApi } from "./api";
import {
  createCompany as createCompanyData,
  deleteCompany as deleteCompanyData,
  getAllCompanies as getAllCompaniesData,
  createCompanyFromMission,
  buildCompanyFromMission,
  type Company as CompanyDataEntry
} from "./company-data";

export interface Company {
  id: string;
  name: string;
  mission: string;
  emoji: string;
  status: "Active" | "Setup";
}

interface CompanyContextType {
  companies: Company[];
  currentCompany: Company | null;
  setCurrentCompanyId: (companyId: string | null) => void;
  createCompany: (mission: string) => Promise<Company>;
  deleteCompany: (companyId: string) => Promise<void>;
  isLoading: boolean;
}

const CompanyContext = createContext<CompanyContextType | null>(null);

export function useCompanyContext() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompanyContext must be used within CompanyProvider");
  return ctx;
}

const STORAGE_KEY = "ensemble_current_company";

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load companies on mount
  useEffect(() => {
    const loadCompanies = async () => {
      try {
        const localCompanies = getAllCompaniesData();

        try {
          const backendCompanies = await fetchApi("/api/companies", {}, true);
          if (backendCompanies && Array.isArray(backendCompanies) && backendCompanies.length > 0) {
            const backendIds = new Set(backendCompanies.map((o: any) => o.id));
            const mapped = [
              ...localCompanies.filter(o => !backendIds.has(o.id)).map(o => ({
                id: o.id,
                name: o.name,
                mission: o.mission || "",
                emoji: o.emoji || "🏢",
                status: o.status,
              })),
              ...backendCompanies.map((o: any) => ({
                id: o.id,
                name: o.name,
                mission: o.mission || "",
                emoji: o.emoji || "🏢",
                status: o.status || "Setup",
              }))
            ];
            setCompanies(mapped);
            return;
          }
        } catch {
          // Backend unavailable, use local data
        }

        if (localCompanies.length > 0) {
          const mapped = localCompanies.map(o => ({
            id: o.id,
            name: o.name,
            mission: o.mission || "",
            emoji: o.emoji || "🏢",
            status: o.status,
          }));
          setCompanies(mapped);
        }
      } catch (err) {
        console.error("Failed to load companies:", err);
      } finally {
        setIsLoading(false);
      }
    };
    loadCompanies();
  }, []);

  // Set current company from saved preference
  useEffect(() => {
    const savedCompanyId = localStorage.getItem(STORAGE_KEY);
    if (savedCompanyId && companies.length > 0) {
      const found = companies.find(o => o.id === savedCompanyId);
      if (found) setCurrentCompany(found);
    } else if (companies.length > 0) {
      setCurrentCompany(companies[0]);
    }
  }, [companies]);

  const setCurrentCompanyId = (companyId: string | null) => {
    if (companyId) {
      const found = companies.find(o => o.id === companyId);
      if (found) {
        setCurrentCompany(found);
        localStorage.setItem(STORAGE_KEY, companyId);
      }
    } else {
      setCurrentCompany(null);
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const createCompany = async (mission: string): Promise<Company> => {
    let structure: any;

    // Try backend LLM-powered company generation first
    try {
      structure = await fetchApi("/api/companies/generate", {
        method: "POST",
        body: JSON.stringify({ mission }),
      });
    } catch {
      // Fallback: client-side keyword matching
      structure = buildCompanyFromMission(mission);
    }

    // Create the company in the data store (auto-provisions CEO + teams + agents)
    const company = createCompanyFromMission(mission, structure);

    // Try to sync with backend
    try {
      await fetchApi("/api/companies", {
        method: "POST",
        body: JSON.stringify({
          id: company.id,
          name: company.name,
          mission: company.mission,
          emoji: company.emoji,
        }),
      });
    } catch {
      // Backend unavailable, continue with local-only
    }

    const contextCompany: Company = {
      id: company.id,
      name: company.name,
      mission: company.mission,
      emoji: company.emoji,
      status: company.status,
    };

    const updatedCompanies = [...companies, contextCompany];
    setCompanies(updatedCompanies);
    setCurrentCompany(contextCompany);
    localStorage.setItem(STORAGE_KEY, contextCompany.id);

    return contextCompany;
  };

  const deleteCompany = async (companyId: string): Promise<void> => {
    try {
      await fetchApi(`/api/companies/${companyId}`, { method: "DELETE" });
    } catch {
      // Fallback: delete locally
    }

    deleteCompanyData(companyId);

    const updatedCompanies = companies.filter(o => o.id !== companyId);
    setCompanies(updatedCompanies);

    if (currentCompany?.id === companyId) {
      if (updatedCompanies.length > 0) {
        setCurrentCompany(updatedCompanies[0]);
        localStorage.setItem(STORAGE_KEY, updatedCompanies[0].id);
      } else {
        setCurrentCompany(null);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  };

  return (
    <CompanyContext.Provider value={{
      companies,
      currentCompany,
      setCurrentCompanyId,
      createCompany,
      deleteCompany,
      isLoading,
    }}>
      {children}
    </CompanyContext.Provider>
  );
}
