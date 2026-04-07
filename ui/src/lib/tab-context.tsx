/**
 * tab-context.tsx — Browser-style Tab Management
 * 
 * Provides a Chrome/VS Code-like tab system where each app opens as a tab.
 * The "Home" tab is always present and not closable.
 * 
 * PRODUCTION-READY: This is real state management, not mocked.
 * 
 * DO NOT CHANGE:
 * - The allApps array order (it determines launcher grid order)
 * - The TabItem interface (TopBar.tsx depends on all fields)
 * - The non-closable "Home" tab behavior
 */

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import {
  MessageSquare,
  Bot,
  GitBranch,
  Blocks,
  Shield,
  Settings,
  ShoppingBag,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";

// Icon mapping for persistence
const iconMap: Record<string, LucideIcon> = {
  MessageSquare, Bot, GitBranch, Blocks, Shield, Settings, ShoppingBag, LayoutGrid
};

export interface AppItem {
  id: string;
  title: string;
  url: string;
  icon: LucideIcon;
  iconName?: string; // For persistence
  description: string;
}

export interface TabItem {
  id: string;
  title: string;
  url: string;
  icon: LucideIcon;
  iconName?: string;
  closable: boolean;
  logoUrl?: string;
}

export const allApps: AppItem[] = [
  { id: "chat", title: "Chat", url: "/chat", icon: MessageSquare, iconName: "MessageSquare", description: "Conversations with agents" },
  { id: "agents", title: "Agents", url: "/agents", icon: Bot, iconName: "Bot", description: "Manage AI agents" },
  { id: "marketplace", title: "Marketplace", url: "/marketplace", icon: ShoppingBag, iconName: "ShoppingBag", description: "Browse community agent packs" },
  { id: "workflows", title: "Workflows", url: "/workflows", icon: GitBranch, iconName: "GitBranch", description: "Automation pipelines" },
  { id: "macros", title: "Macros", url: "/macros", icon: Blocks, iconName: "Blocks", description: "Reusable sequences" },
  { id: "permissions", title: "Permissions", url: "/permissions", icon: Shield, iconName: "Shield", description: "Access control" },
  { id: "orgs", title: "Organization", url: "/orgs", icon: LayoutGrid, iconName: "LayoutGrid", description: "Corporate management OS" },
  { id: "settings", title: "Settings", url: "/settings/general", icon: Settings, iconName: "Settings", description: "App configuration" },
];

interface TabContextType {
  tabs: TabItem[];
  openApp: (app: AppItem) => void;
  openExternalApp: (app: { id: string; title: string; url: string; logoUrl: string }) => void;
  closeTab: (tabId: string) => void;
}

const TabContext = createContext<TabContextType | null>(null);

export function useTabContext() {
  const ctx = useContext(TabContext);
  if (!ctx) throw new Error("useTabContext must be used within TabProvider");
  return ctx;
}

const STORAGE_KEY = "ensemble_tabs_v3";

export function TabProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<TabItem[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.map((t: any) => ({
          ...t,
          url: t.id === "home" ? "/" : t.url, // Sanity check for home URL
          icon: iconMap[t.iconName] || LayoutGrid
        }));
      } catch (e) {
        console.error("Failed to restore tabs:", e);
      }
    }
    return [{ id: "home", title: "Home", url: "/", icon: MessageSquare, iconName: "MessageSquare", closable: false }];
  });

  // Persist on change
  useEffect(() => {
    const toSave = tabs.map(t => ({
      id: t.id,
      title: t.title,
      url: t.url,
      iconName: t.iconName,
      closable: t.closable,
      logoUrl: t.logoUrl
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  }, [tabs]);

  const openApp = useCallback((app: AppItem) => {
    setTabs((prev) => {
      if (prev.some((t) => t.id === app.id)) return prev;
      return [...prev, { 
        id: app.id, 
        title: app.title, 
        url: app.url, 
        icon: app.icon, 
        iconName: app.iconName, 
        closable: true 
      }];
    });
  }, []);

  const openExternalApp = useCallback((app: { id: string; title: string; url: string; logoUrl: string }) => {
    const tabId = `ext-${app.id}`;
    setTabs((prev) => {
      if (prev.some((t) => t.id === tabId)) return prev;
      return [...prev, { 
        id: tabId, 
        title: app.title, 
        url: `/app/${app.id}`, 
        icon: Bot, 
        iconName: "Bot",
        closable: true, 
        logoUrl: app.logoUrl 
      }];
    });
  }, []);

  const closeTab = useCallback((tabId: string) => {
    setTabs((prev) => prev.filter((t) => t.id !== tabId || !t.closable));
  }, []);

  return (
    <TabContext.Provider value={{ tabs, openApp, openExternalApp, closeTab }}>
      {children}
    </TabContext.Provider>
  );
}
