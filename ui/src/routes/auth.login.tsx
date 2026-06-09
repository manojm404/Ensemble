import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import { AuthShell } from "@/components/auth/AuthShell";
import { SocialAuth } from "@/components/auth/SocialAuth";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput } from "@/components/glass/GlassInput";
import { useAuth } from "@/lib/auth";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth/login")({
  head: () => ({ meta: [{ title: "Sign in — 0101" }] }),
  validateSearch: searchSchema,
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { loginWithPassword } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await loginWithPassword(email, password);
      toast.success("Welcome back.");
      await navigate({ to: getRedirectPath(search.redirect), replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not sign in";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Continue to your workspace."
      footer={
        <>
          New here?{" "}
          <Link to="/auth/signup" className="text-rim hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <SocialAuth />
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email">
          <GlassInput
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </Field>
        <Field
          label="Password"
          aside={
            <Link to="/auth/forgot-password" className="text-xs text-rim/90 hover:text-rim">
              Forgot?
            </Link>
          }
        >
          <GlassInput
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>
        <GlassButton type="submit" variant="rim" size="lg" className="w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </GlassButton>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </form>
    </AuthShell>
  );
}

function getRedirectPath(redirect?: string) {
  if (!redirect) return "/dashboard";
  try {
    const url = new URL(redirect, window.location.origin);
    if (url.origin !== window.location.origin) return "/dashboard";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/dashboard";
  }
}

export function Field({
  label,
  aside,
  children,
}: {
  label: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium tracking-wide text-foreground/80 uppercase">
          {label}
        </span>
        {aside}
      </div>
      {children}
    </label>
  );
}
