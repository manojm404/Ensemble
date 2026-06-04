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
  Sparkles,
  FolderTree,
  Building2,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";
import { scopedStorageKey } from "./storage-scope";

// Icon mapping for persistence
const iconMap: Record<string, LucideIcon> = {
  MessageSquare, Bot, GitBranch, Blocks, Shield, Settings, ShoppingBag, LayoutGrid, Sparkles, FolderTree, Building2, LayoutDashboard
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
  { id: "permissions", title: "Permissions", url: "/permissions", icon: Shield, iconName: "Shield", description: "Access control" },
  { id: "companies", title: "Companies", url: "/companies", icon: LayoutGrid, iconName: "LayoutGrid", description: "AI-powered business entities" },
  { id: "settings", title: "Settings", url: "/settings/general", icon: Settings, iconName: "Settings", description: "App configuration" },
];

interface TabContextType {
  tabs: TabItem[];
  openApp: (app: AppItem) => void;
  openExternalApp: (app: { id: string; title: string; url: string; logoUrl: string }) => void;
  openRouteTab: (tab: { id: string; title: string; url: string; icon: LucideIcon; iconName?: string; logoUrl?: string; closable?: boolean }) => void;
  closeTab: (tabId: string) => void;
  updateCurrentTabUrl: (url: string, title?: string, tabId?: string) => void;
}

const TabContext = createContext<TabContextType | null>(null);

export function useTabContext() {
  const ctx = useContext(TabContext);
  if (!ctx) throw new Error("useTabContext must be used within TabProvider");
  return ctx;
}

const STORAGE_KEY = () => scopedStorageKey("ensemble_tabs_v3");

export function TabProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<TabItem[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY());
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const restoredTabs = parsed.map((t: any) => ({
          ...t,
          url: t.id === "home" ? "/" : t.id === "chat" ? "/chat" : t.url,
          icon: iconMap[t.iconName] || LayoutGrid
        }));
        
        // Remove Personal tab if it exists
        const filteredTabs = restoredTabs.filter((t: any) => t.id !== "personal");
        
        // Ensure Chat tab is always present
        if (!filteredTabs.some((t: any) => t.id === "chat")) {
          filteredTabs.splice(1, 0, {
            id: "chat",
            title: "Chat",
            url: "/chat",
            icon: MessageSquare,
            iconName: "MessageSquare",
            closable: false
          });
        }
        return filteredTabs;
      } catch (e) {
        console.error("Failed to restore tabs:", e);
      }
    }
    return [
      { id: "home", title: "Home", url: "/", icon: LayoutGrid, iconName: "LayoutGrid", closable: false },
      { id: "chat", title: "Chat", url: "/chat", icon: MessageSquare, iconName: "MessageSquare", closable: false },
    ];
  });

  const upsertTab = useCallback((tab: TabItem) => {
    setTabs((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === tab.id);
      if (existingIndex >= 0) {
        const next = [...prev];
        next[existingIndex] = { ...next[existingIndex], ...tab };
        return next;
      }
      return [...prev, tab];
    });
  }, []);

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
    localStorage.setItem(STORAGE_KEY(), JSON.stringify(toSave));
  }, [tabs]);

  const openApp = useCallback((app: AppItem) => {
    upsertTab({
      id: app.id,
      title: app.title,
      url: app.url,
      icon: app.icon,
      iconName: app.iconName,
      closable: app.id !== "personal" && app.id !== "home",
    });
  }, [upsertTab]);

  const openRouteTab = useCallback((tab: { id: string; title: string; url: string; icon: LucideIcon; iconName?: string; logoUrl?: string; closable?: boolean }) => {
    upsertTab({
      id: tab.id,
      title: tab.title,
      url: tab.url,
      icon: tab.icon,
      iconName: tab.iconName,
      logoUrl: tab.logoUrl,
      closable: tab.closable ?? true,
    });
  }, [upsertTab]);

  const openExternalApp = useCallback((app: { id: string; title: string; url: string; logoUrl: string }) => {
    const tabId = `ext-${app.id}`;
    upsertTab({
      id: tabId,
      title: app.title,
      url: `/app/${app.id}`,
      icon: Bot,
      iconName: "Bot",
      closable: true,
      logoUrl: app.logoUrl,
    });
  }, [upsertTab]);

  const closeTab = useCallback((tabId: string) => {
    setTabs((prev) => prev.filter((t) => t.id !== tabId || !t.closable));
  }, []);

  const updateCurrentTabUrl = useCallback((url: string, title?: string, tabId?: string) => {
    setTabs((prev) => {
      return prev.map((t) => {
        // If a specific tabId is provided, update that exact tab.
        // Otherwise, do a best-effort guess (legacy behavior, but safer).
        if (tabId && t.id === tabId) {
          return { ...t, url, title: title || t.title };
        } else if (!tabId && (t.id === "workflows" || t.url.startsWith("/workflows/"))) {
          return { ...t, url, title: title || t.title };
        }
        return t;
      });
    });
  }, []);

  return (
    <TabContext.Provider value={{ tabs, openApp, openExternalApp, openRouteTab, closeTab, updateCurrentTabUrl }}>
      {children}
    </TabContext.Provider>
  );
}
