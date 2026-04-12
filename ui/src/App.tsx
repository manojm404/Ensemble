import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkflowOutputProvider } from "@/lib/workflow-output-context";
import { AppLayout } from "@/components/layout/AppLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Chat from "./pages/Chat";
import ExternalApp from "./pages/ExternalApp";
import Launcher from "./pages/Launcher";
import Agents from "./pages/Agents";
import Workflows from "./pages/Workflows";
import WorkflowEditor from "./pages/WorkflowEditor";
import WorkflowOutput from "./pages/WorkflowOutput";
import Macros from "./pages/Macros";
import MacroDetail from "./pages/MacroDetail";
import Permissions from "./pages/Permissions";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import Marketplace from "./pages/Marketplace";
import ImportAgents from "./pages/ImportAgents";
import OrgDashboard from "./pages/OrgDashboard";
import OrgList from "./pages/OrgList";
import OrgDepartments from "./pages/OrgDepartments";
import OrgDepartmentDetail from "./pages/OrgDepartmentDetail";
import OrgAgentHiring from "./pages/OrgAgentHiring";
import OrgAgents from "./pages/OrgAgents";
import OrgTasks from "./pages/OrgTasks";
import OrgActivity from "./pages/OrgActivity";
import OrgReports from "./pages/OrgReports";
import { OrgProvider } from "./lib/org-context";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <WorkflowOutputProvider>
        <OrgProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Index />} />
                <Route path="/chat" element={<Chat />} />
                <Route path="/launcher" element={<Launcher />} />
                <Route path="/app/:appId" element={<ExternalApp />} />
                <Route path="/agents" element={<Agents />} />
                <Route path="/marketplace" element={<Marketplace />} />
                <Route path="/marketplace/import" element={<ImportAgents />} />
              <Route path="/workflows" element={<Workflows />} />
              <Route path="/workflows/:id" element={<WorkflowEditor />} />
              <Route path="/workflow-output/:id" element={<WorkflowOutput />} />
              <Route path="/macros" element={<Macros />} />
              <Route path="/macros/:id" element={<MacroDetail />} />
              <Route path="/permissions" element={<Permissions />} />
              <Route path="/settings/*" element={<Settings />} />
              <Route path="/orgs" element={<OrgList />} />
              <Route path="/org/:id" element={<OrgDashboard />} />
              <Route path="/org/:id/departments" element={<OrgDepartments />} />
              <Route path="/org/:id/departments/:deptId" element={<OrgDepartmentDetail />} />
              <Route path="/org/:id/roster" element={<OrgAgentHiring />} />
              <Route path="/org/:id/agents" element={<OrgAgents />} />
              <Route path="/org/:id/tasks" element={<OrgTasks />} />
              <Route path="/org/:id/activity" element={<OrgActivity />} />
              <Route path="/org/:id/reports" element={<OrgReports />} />
            </Route>
            <Route path="/auth" element={<Auth />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        </OrgProvider>
      </WorkflowOutputProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
