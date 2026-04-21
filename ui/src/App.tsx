import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkflowOutputProvider } from "@/lib/workflow-output-context";
import { AppLayout } from "@/components/layout/AppLayout";
import { CompanyProvider } from "./lib/company-context";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Chat from "./pages/Chat";
import ExternalApp from "./pages/ExternalApp";
import Launcher from "./pages/Launcher";
import Agents from "./pages/Agents";
import Workflows from "./pages/Workflows";
import WorkflowEditor from "./pages/WorkflowEditor";
import WorkflowOutput from "./pages/WorkflowOutput";
import Permissions from "./pages/Permissions";
import Permissions from "./pages/Permissions";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import Marketplace from "./pages/Marketplace";
import ImportAgents from "./pages/ImportAgents";
import CompanyDashboard from "./pages/CompanyDashboard";
import CompanyList from "./pages/CompanyList";
import CompanyTeams from "./pages/CompanyTeams";
import CompanyTeamDetail from "./pages/CompanyTeamDetail";
import CompanyAgents from "./pages/CompanyAgents";
import CompanyIssues from "./pages/CompanyIssues";
import CompanyActivity from "./pages/CompanyActivity";
import CompanyReports from "./pages/CompanyReports";

import Inbox from "./pages/Inbox";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <WorkflowOutputProvider>
        <CompanyProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Index />} />
                <Route path="/chat" element={<Chat />} />
                <Route path="/inbox" element={<Inbox />} />
                <Route path="/launcher" element={<Launcher />} />
                <Route path="/app/:appId" element={<ExternalApp />} />
                <Route path="/agents" element={<Agents />} />
                <Route path="/marketplace" element={<Marketplace />} />
                <Route path="/marketplace/import" element={<ImportAgents />} />
                <Route path="/workflows" element={<Workflows />} />
                <Route path="/workflows/:id" element={<WorkflowEditor />} />
                <Route path="/workflow-output/:id" element={<WorkflowOutput />} />
                <Route path="/permissions" element={<Permissions />} />
                <Route path="/settings/*" element={<Settings />} />
                {/* Companies */}
                <Route path="/companies" element={<CompanyList />} />
                <Route path="/company/:id" element={<CompanyDashboard />} />
                <Route path="/company/:id/teams" element={<CompanyTeams />} />
                <Route path="/company/:id/teams/:teamId" element={<CompanyTeamDetail />} />
                <Route path="/company/:id/agents" element={<CompanyAgents />} />
                <Route path="/company/:id/issues" element={<CompanyIssues />} />
                <Route path="/company/:id/activity" element={<CompanyActivity />} />
                <Route path="/company/:id/reports" element={<CompanyReports />} />
              </Route>
              <Route path="/auth" element={<Auth />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </CompanyProvider>
      </WorkflowOutputProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
