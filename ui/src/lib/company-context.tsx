/**
 * company-context.tsx — Company Context Provider
 *
 * Manages current company state across the app.
 * Provides company list, current company, and create/delete functions.
 * Supports "Magic Company" creation via mission statement.
 */

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import {
  createCompanyWorkspace,
  deleteCompanyWorkspace,
  listCompanies,
  type CompanySummary,
} from "./api";
import { hydrateCompanyFromBackend, upsertCompanySummary } from "./company-data";
import { scopedStorageKey } from "./storage-scope";

export interface Company {
  id: string;
  name: string;
  mission: string;
  emoji: string;
  status: "Active" | "Setup";
  agents: number;
  teams: number;
  projects: number;
}

interface CompanyContextType {
  companies: Company[];
  currentCompany: Company | null;
  setCurrentCompanyId: (companyId: string | null) => void;
  createCompany: (name: string, motive: string) => Promise<Company>;
  deleteCompany: (companyId: string) => Promise<void>;
  isLoading: boolean;
}

const CompanyContext = createContext<CompanyContextType | null>(null);

export function useCompanyContext() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompanyContext must be used within CompanyProvider");
  return ctx;
}

const STORAGE_KEY = () => scopedStorageKey("ensemble_current_company");

function toContextCompany(company: CompanySummary): Company {
  return {
    id: company.id,
    name: company.name,
    mission: company.mission || "",
    emoji: company.emoji || "🏢",
    status: company.status || "Active",
    agents: company.agents ?? company.agent_count ?? 0,
    teams: company.teams ?? company.team_count ?? 0,
    projects: company.projects ?? company.issue_count ?? 0,
  };
}

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load companies on mount
  useEffect(() => {
    const loadCompanies = async () => {
      try {
        const apiCompanies = await listCompanies();
        const contextCompanies = apiCompanies.map(toContextCompany);
        setCompanies(contextCompanies);
        apiCompanies.forEach((company) => upsertCompanySummary(company));
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
    const savedCompanyId = localStorage.getItem(STORAGE_KEY());
    if (savedCompanyId && companies.length > 0) {
      const found = companies.find(o => o.id === savedCompanyId);
      if (found) {
        setCurrentCompany(found);
      } else if (companies.length > 0) {
        setCurrentCompany(companies[0]);
        localStorage.setItem(STORAGE_KEY(), companies[0].id);
      }
    } else if (companies.length > 0) {
      setCurrentCompany(companies[0]);
      localStorage.setItem(STORAGE_KEY(), companies[0].id);
    } else {
      setCurrentCompany(null);
      localStorage.removeItem(STORAGE_KEY());
    }
  }, [companies]);

  const setCurrentCompanyId = (companyId: string | null) => {
    if (companyId) {
      const found = companies.find(o => o.id === companyId);
      if (found) {
        setCurrentCompany(found);
        localStorage.setItem(STORAGE_KEY(), companyId);
      }
    } else {
      setCurrentCompany(null);
      localStorage.removeItem(STORAGE_KEY());
    }
  };

  const createCompany = async (name: string, motive: string): Promise<Company> => {
    const createdCompany = await createCompanyWorkspace(name, motive);
    const contextCompany = toContextCompany(createdCompany);
    upsertCompanySummary(createdCompany);
    await hydrateCompanyFromBackend(createdCompany.id);

    const updatedCompanies = [...companies, contextCompany];
    setCompanies(updatedCompanies);
    setCurrentCompany(contextCompany);
    localStorage.setItem(STORAGE_KEY(), contextCompany.id);

    return contextCompany;
  };

  const deleteCompany = async (companyId: string): Promise<void> => {
    await deleteCompanyWorkspace(companyId);
    const updatedCompanies = companies.filter(o => o.id !== companyId);
    setCompanies(updatedCompanies);

    if (currentCompany?.id === companyId) {
      if (updatedCompanies.length > 0) {
        setCurrentCompany(updatedCompanies[0]);
        localStorage.setItem(STORAGE_KEY(), updatedCompanies[0].id);
      } else {
        setCurrentCompany(null);
        localStorage.removeItem(STORAGE_KEY());
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
