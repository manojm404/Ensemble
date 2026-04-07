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

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import {
  MessageSquare,
  Bot,
  GitBranch,
  Blocks,
  Shield,
  Settings,
  Globe,
  type LucideIcon,
} from "lucide-react";

export interface AppItem {
  id: string;
  title: string;
  url: string;
  icon: LucideIcon;
  description: string;
}

export interface TabItem {
  id: string;
  title: string;
  url: string;
  icon: LucideIcon;
  closable: boolean;
  /** Logo URL for external AI apps (ChatGPT, Claude, etc.) */
  logoUrl?: string;
}

/**
 * All built-in apps available in the launcher.
 * Adding a new app here automatically adds it to the Launcher grid.
 * DO NOT CHANGE order — it matches the visual grid layout.
 */
export const allApps: AppItem[] = [
  { id: "chat", title: "Chat", url: "/chat", icon: MessageSquare, description: "Conversations with agents" },
  { id: "agents", title: "Agents", url: "/agents", icon: Bot, description: "Manage AI agents" },
  { id: "workflows", title: "Workflows", url: "/workflows", icon: GitBranch, description: "Automation pipelines" },
  { id: "macros", title: "Macros", url: "/macros", icon: Blocks, description: "Reusable sequences" },
  { id: "permissions", title: "Permissions", url: "/permissions", icon: Shield, description: "Access control" },
  { id: "settings", title: "Settings", url: "/settings/general", icon: Settings, description: "App configuration" },
];

interface TabContextType {
  tabs: TabItem[];
  /** Opens an internal app as a new tab (deduplicates by id) */
  openApp: (app: AppItem) => void;
  /** Opens an external AI app (ChatGPT, Claude, etc.) in an iframe tab */
  openExternalApp: (app: { id: string; title: string; url: string; logoUrl: string }) => void;
  /** Closes a tab by id (Home tab cannot be closed) */
  closeTab: (tabId: string) => void;
}

const TabContext = createContext<TabContextType | null>(null);

export function useTabContext() {
  const ctx = useContext(TabContext);
  if (!ctx) throw new Error("useTabContext must be used within TabProvider");
  return ctx;
}

export function TabProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<TabItem[]>([
    /* Home tab — always present, not closable */
    { id: "home", title: "Home", url: "/", icon: MessageSquare, closable: false },
  ]);

  /** Opens app tab — skips if already open (deduplicate by id) */
  const openApp = useCallback((app: AppItem) => {
    setTabs((prev) => {
      if (prev.some((t) => t.id === app.id)) return prev;
      return [...prev, { ...app, closable: true }];
    });
  }, []);

  /** Opens external app in iframe — prefixes id with "ext-" to avoid conflicts */
  const openExternalApp = useCallback((app: { id: string; title: string; url: string; logoUrl: string }) => {
    const tabId = `ext-${app.id}`;
    setTabs((prev) => {
      if (prev.some((t) => t.id === tabId)) return prev;
      return [...prev, { id: tabId, title: app.title, url: `/app/${app.id}`, icon: Bot, closable: true, logoUrl: app.logoUrl }];
    });
  }, []);

  /** Closes a tab — respects closable flag (Home can't be closed) */
  const closeTab = useCallback((tabId: string) => {
    setTabs((prev) => prev.filter((t) => t.id !== tabId || !t.closable));
  }, []);

  return (
    <TabContext.Provider value={{ tabs, openApp, openExternalApp, closeTab }}>
      {children}
    </TabContext.Provider>
  );
}
