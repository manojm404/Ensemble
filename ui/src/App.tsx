import { useEffect } from "react";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import {
  BrowserRouter,
  Route,
  Routes,
  Outlet,
  useNavigate,
  useLocation,
  Navigate,
} from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkflowOutputProvider } from "@/lib/workflow-output-context";
import { AppLayout } from "@/components/layout/AppLayout";
import PublicLayout from "@/components/layout/PublicLayout"; // Import PublicLayout
import { Button } from "@/components/ui/button"; // Import Button
import { TabProvider } from "@/lib/tab-context";
import { CompanyProvider } from "./lib/company-context";
import { UserProvider } from "./lib/user-context";
import { EventProvider } from "./lib/EventContext";
import Index from "./pages/Index"; // Our dashboard page
import About from "./pages/About";   // The new public info page
import Landing from "./pages/Landing"; // The new high-converting landing page
import Platform from "./pages/Platform";
import Solutions from "./pages/Solutions";
import Enterprise from "./pages/Enterprise";
import Pricing from "./pages/Pricing";
import Auth from "./pages/Auth";
import Chat from "./pages/Chat";
import ExternalApp from "./pages/ExternalApp";
import Launcher from "./pages/Launcher";
import Agents from "./pages/Agents";
import Workflows from "./pages/Workflows";
import WorkflowEditor from "./pages/WorkflowEditor";
import WorkflowOutput from "./pages/WorkflowOutput";
import Permissions from "./pages/Permissions";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import Marketplace from "./pages/Marketplace";
import ImportAgents from "./pages/ImportAgents";
import CompanyDashboard from "./pages/CompanyDashboard";
import { CompanyCommandCenter } from "./pages/CompanyCommandCenter";
import CompanyList from "./pages/CompanyList";
import CompanyTeams from "./pages/CompanyTeams";
import CompanyTeamDetail from "./pages/CompanyTeamDetail";
import CompanyAgents from "./pages/CompanyAgents";
import CompanyIssues from "./pages/CompanyIssues";
import CompanyActivity from "./pages/CompanyActivity";
import CompanyReports from "./pages/CompanyReports";

import Inbox from "./pages/Inbox";

const AUTH_REDIRECT_KEY = 'ensemble_auth_redirect';

// Helper to check authentication status
const checkAuth = () => {
  return localStorage.getItem('ensemble_auth_token') !== null;
};

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <WorkflowOutputProvider>
        <CompanyProvider>
          <UserProvider>
            <TabProvider>
              <Toaster />
              <Sonner />
              <EventProvider>
                <BrowserRouter>
                  <Routes>
                    {/* --- PUBLIC ROUTES --- */}
                    <Route element={<PublicLayout />}>
                      <Route path="/landing" element={<Landing />} />
                      <Route path="/about" element={<About />} />
                      <Route path="/platform" element={<Platform />} />
                      <Route path="/solutions" element={<Solutions />} />
                      <Route path="/enterprise" element={<Enterprise />} />
                      <Route path="/pricing" element={<Pricing />} />
                      <Route path="/auth" element={<Auth />} />
                      {/* Root redirect logic for unauthenticated users */}
                      <Route path="/" element={<AuthRedirectWrapper />} />
                    </Route>

                    {/* --- PROTECTED ROUTES --- */}
                    <Route element={<ProtectedRouteWrapper><AppLayout /></ProtectedRouteWrapper>}>
                      <Route path="/dashboard" element={<Index />} />
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
                      <Route path="/companies" element={<CompanyList />} />
                      <Route path="/company/:id" element={<CompanyCommandCenter />} />
                      <Route path="/company/:id/teams" element={<CompanyTeams />} />
                      <Route path="/company/:id/teams/:teamId" element={<CompanyCommandCenter />} />
                      <Route path="/company/:id/agents" element={<CompanyAgents />} />
                      <Route path="/company/:id/issues" element={<CompanyIssues />} />
                      <Route path="/company/:id/activity" element={<CompanyActivity />} />
                      <Route path="/company/:id/reports" element={<CompanyReports />} />
                    </Route>

                    {/* Catch-all */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </BrowserRouter>
              </EventProvider>
            </TabProvider>
          </UserProvider>
        </CompanyProvider>
      </WorkflowOutputProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

// --- Auth Guard Components ---

const AuthRedirectWrapper = () => {
  const isAuth = checkAuth();
  return isAuth ? <Navigate to="/dashboard" replace /> : <Navigate to="/landing" replace />;
};

const ProtectedRouteWrapper = ({ children }: { children: React.ReactNode }) => {
  const isAuth = checkAuth();
  const location = useLocation();
  
  if (!isAuth) {
    // Store where the user was trying to go
    localStorage.setItem(AUTH_REDIRECT_KEY, JSON.stringify({
      path: location.pathname,
      ts: Date.now(),
    }));
    return <Navigate to="/landing" replace />;
  }
  
  return <>{children}</>;
};

export default App;
