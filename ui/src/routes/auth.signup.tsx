import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import { SocialAuth } from "@/components/auth/SocialAuth";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput } from "@/components/glass/GlassInput";
import { Field } from "./auth.login";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/auth/signup")({
  head: () => ({ meta: [{ title: "Create account — 0101" }] }),
  component: SignupPage,
});

function SignupPage() {
  const { signupWithPassword, status } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (status === "authenticated") {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [status, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      await signupWithPassword(email, password, fullName || undefined);
      toast.success("Workspace created.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create account");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Create your workspace"
      subtitle="Spin up your first governed workflow in under five minutes."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/auth/login" className="text-rim hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SocialAuth />
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Full name">
          <GlassInput
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Ada Lovelace"
            autoComplete="name"
          />
        </Field>
        <Field label="Work email">
          <GlassInput
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
          />
        </Field>
        <Field label="Password">
          <GlassInput
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
          />
        </Field>
        <GlassButton type="submit" variant="rim" size="lg" className="w-full" disabled={loading}>
          {loading ? "Creating workspace…" : "Create workspace"}
        </GlassButton>
        <p className="text-[11px] text-muted-foreground text-center pt-2">
          By continuing you agree to govern your agents responsibly.
        </p>
      </form>
    </AuthShell>
  );
}
