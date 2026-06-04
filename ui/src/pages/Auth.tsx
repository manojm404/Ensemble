import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GitBranch, Mail, Lock, User, ArrowRight, Eye, EyeOff, Building } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

const AUTH_REDIRECT_KEY = "ensemble_auth_redirect";
const AUTH_REDIRECT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_TOKEN_TTL_MS = 60 * 60 * 1000;

function extractErrorMessage(payload: unknown, fallback: string) {
  if (!payload) return fallback;

  if (typeof payload === "string") return payload;

  if (Array.isArray(payload)) {
    const parts = payload
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const maybeMessage = (item as { msg?: unknown; message?: unknown }).msg ?? (item as { message?: unknown }).message;
          if (typeof maybeMessage === "string") return maybeMessage;
        }
        return null;
      })
      .filter((item): item is string => Boolean(item));

    if (parts.length > 0) return parts.join(", ");
    return fallback;
  }

  if (typeof payload === "object") {
    const detail = (payload as { detail?: unknown }).detail;
    if (detail !== undefined) return extractErrorMessage(detail, fallback);

    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;

    const error = (payload as { error?: unknown }).error;
    if (typeof error === "string" && error.trim()) return error;

    try {
      return JSON.stringify(payload);
    } catch {
      return fallback;
    }
  }

  return fallback;
}

function getSafeAuthRedirect() {
  try {
    const raw = localStorage.getItem(AUTH_REDIRECT_KEY);
    if (!raw) return null;

    let path: string | null = null;
    let ts: number | null = null;

    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string") {
        path = parsed;
      } else if (parsed && typeof parsed === "object") {
        if (typeof parsed.path === "string") path = parsed.path;
        if (typeof parsed.ts === "number") ts = parsed.ts;
      }
    } catch {
      path = raw;
    }

    if (!path) return null;

    const isFresh = ts ? Date.now() - ts <= AUTH_REDIRECT_TTL_MS : true;
    if (!isFresh) {
      localStorage.removeItem(AUTH_REDIRECT_KEY);
      return null;
    }

    if (path.startsWith("/workflow-output/")) {
      const outputId = path.split("/workflow-output/")[1] || "";
      try {
        const outputsRaw = localStorage.getItem("ensemble_workflow_outputs");
        if (outputsRaw) {
          const outputs = JSON.parse(outputsRaw);
          if (!outputs?.[outputId]?.output?.markdown) {
            localStorage.removeItem(AUTH_REDIRECT_KEY);
            return null;
          }
        } else {
          localStorage.removeItem(AUTH_REDIRECT_KEY);
          return null;
        }
      } catch {
        localStorage.removeItem(AUTH_REDIRECT_KEY);
        return null;
      }
    }

    return path;
  } catch {
    return null;
  }
}

const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const shouldLogout = params.get("logout") === "1";
    if (!shouldLogout) return;

    localStorage.removeItem('ensemble_auth_token');
    localStorage.removeItem('ensemble_refresh_token');
    localStorage.removeItem('ensemble_token_expires_at');
    localStorage.removeItem('ensemble_auth_redirect');
    toast.success("You have been signed out");
    navigate("/auth", { replace: true });
  }, [location.search, navigate]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(extractErrorMessage(errorData, "Login failed"));
      }
      
      const data = await res.json();
      if (data.token) {
        localStorage.setItem('ensemble_auth_token', data.token);
        // Store refresh token and expiration time for auto-refresh
        if (data.refresh_token) localStorage.setItem('ensemble_refresh_token', data.refresh_token);
        const ttlMs = data.expires_in ? (data.expires_in * 1000) : DEFAULT_TOKEN_TTL_MS;
        localStorage.setItem('ensemble_token_expires_at', (Date.now() + ttlMs).toString());
      }
      toast.success("Successfully logged in");
      // Navigate to the stored redirect or home
      const redirect = getSafeAuthRedirect();
      localStorage.removeItem(AUTH_REDIRECT_KEY);
      navigate(redirect || "/dashboard");
    } catch (err: any) {
      toast.error(err.message || "Failed to login");
    } finally {
      setLoading(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (!agreedToTerms) {
      toast.error("You must agree to the Terms and Privacy Policy");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, full_name: name, company_name: companyName })
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(extractErrorMessage(errorData, "Signup failed"));
      }
      
      const data = await res.json();
      if (data.token) {
        localStorage.setItem('ensemble_auth_token', data.token);
        // Store refresh token and expiration time for auto-refresh
        if (data.refresh_token) localStorage.setItem('ensemble_refresh_token', data.refresh_token);
        const ttlMs = data.expires_in ? (data.expires_in * 1000) : DEFAULT_TOKEN_TTL_MS;
        localStorage.setItem('ensemble_token_expires_at', (Date.now() + ttlMs).toString());
      }
      toast.success("Account created successfully");
      const redirect = getSafeAuthRedirect();
      localStorage.removeItem(AUTH_REDIRECT_KEY);
      navigate(redirect || "/dashboard");
    } catch (err: any) {
      toast.error(err.message || "Failed to sign up");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    toast.info("Password reset email sent", { description: "Check your inbox for reset instructions" });
  };

  const handleSocialLogin = (provider: string) => {
    setLoading(true);
    toast.info(`Signing in with ${provider}...`);
    setTimeout(() => {
      setLoading(false);
      navigate("/dashboard");
    }, 1200);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[linear-gradient(180deg,#e3e8ef_0%,#eef2f7_42%,#dce3eb_100%)] relative overflow-hidden text-foreground">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/8 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-sky-500/10 blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="relative z-10 w-full max-w-md px-4"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
          className="flex flex-col items-center mb-8"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 glow-primary mb-4">
            <GitBranch className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Esemble</h1>
          <p className="text-sm text-foreground/75 mt-1">Collaborative OS for Multi-Agent Workflows</p>
        </motion.div>

        <div className="rounded-[1.75rem] border border-border/60 bg-card/85 backdrop-blur-2xl p-6 shadow-[0_25px_80px_rgba(15,23,42,0.08)]">
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="w-full h-10 bg-muted/70 border border-border/60 mb-6 rounded-full p-1">
              <TabsTrigger value="login" className="flex-1">Sign In</TabsTrigger>
              <TabsTrigger value="signup" className="flex-1">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm text-foreground/75">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/55" />
                    <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" className="pl-10 bg-background/80 border-border/60 h-11 shadow-sm" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm text-foreground/75">Password</Label>
                    <button type="button" onClick={handleForgotPassword} className="text-xs text-primary hover:underline">Forgot password?</button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/55" />
                    <Input 
                      type={showPassword ? "text" : "password"} 
                      value={password} 
                      onChange={e => setPassword(e.target.value)} 
                      required 
                      placeholder="••••••••" 
                      autoComplete="current-password"
                      className="pl-10 pr-10 bg-background/80 border-border/60 h-11 shadow-sm" 
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/55 hover:text-foreground">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full h-11 gap-2 text-sm" disabled={loading}>
                  {loading ? (
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full" />
                  ) : (
                    <>Sign In <ArrowRight className="h-4 w-4" /></>
                  )}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignupSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm text-foreground/75">Full Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/55" />
                      <Input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="Your name" className="pl-10 bg-background/80 border-border/60 h-11 shadow-sm" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm text-foreground/75">Company Name (Optional)</Label>
                    <div className="relative">
                      <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/55" />
                      <Input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Your company" className="pl-10 bg-background/80 border-border/60 h-11 shadow-sm" />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-foreground/75">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/55" />
                    <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" className="pl-10 bg-background/80 border-border/60 h-11 shadow-sm" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm text-foreground/75">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/55" />
                      <Input 
                        type={showPassword ? "text" : "password"} 
                        value={password} 
                        onChange={e => setPassword(e.target.value)} 
                        required 
                        placeholder="Min 8 characters" 
                        className="pl-10 pr-10 bg-background/80 border-border/60 h-11 shadow-sm" 
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/55 hover:text-foreground">
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm text-foreground/75">Confirm Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/55" />
                      <Input 
                        type={showPassword ? "text" : "password"} 
                        value={confirmPassword} 
                        onChange={e => setConfirmPassword(e.target.value)} 
                        required 
                        placeholder="Repeat password" 
                        className="pl-10 pr-10 bg-background/80 border-border/60 h-11 shadow-sm" 
                      />
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2 pt-2">
                  <Checkbox id="terms" checked={agreedToTerms} onCheckedChange={(checked) => setAgreedToTerms(Boolean(checked))} />
                  <label
                    htmlFor="terms"
                    className="text-xs text-foreground/65"
                  >
                    I agree to the{" "}
                    <button type="button" onClick={() => toast.info("Terms of Service", { description: "Full terms available at ensemble.ai/terms" })} className="text-primary hover:underline">Terms</button> and{" "}
                    <button type="button" onClick={() => toast.info("Privacy Policy", { description: "Full policy available at ensemble.ai/privacy" })} className="text-primary hover:underline">Privacy Policy</button>.
                  </label>
                </div>

                <Button type="submit" className="w-full h-11 gap-2 text-sm" disabled={loading}>
                  {loading ? (
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full" />
                  ) : (
                    <>Create Account <ArrowRight className="h-4 w-4" /></>
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="mt-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border/70" />
            <span className="text-xs text-foreground/60">or continue with</span>
            <div className="h-px flex-1 bg-border/70" />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button variant="outline" className="h-11 gap-2 bg-background/80 border-border/60 shadow-sm" onClick={() => handleSocialLogin("Google")}>
              <svg className="h-4 w-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Google
            </Button>
            <Button variant="outline" className="h-11 gap-2 bg-background/80 border-border/60 shadow-sm" onClick={() => handleSocialLogin("Apple")}>
              <svg className="h-4 w-4 text-foreground" fill="currentColor" viewBox="0 0 24 24"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
              Apple
            </Button>
          </div>
        </div>

        <p className="text-center text-xs text-foreground/60 mt-6">
          By continuing, you agree to Esemble's{" "}
          <button onClick={() => toast.info("Terms of Service", { description: "Full terms available at ensemble.ai/terms" })} className="text-primary hover:underline">Terms</button> and{" "}
          <button onClick={() => toast.info("Privacy Policy", { description: "Full policy available at ensemble.ai/privacy" })} className="text-primary hover:underline">Privacy Policy</button>
        </p>
      </motion.div>
    </div>
  );
};

export default Auth;
