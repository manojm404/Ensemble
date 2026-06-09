import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput } from "@/components/glass/GlassInput";
import { Field } from "./auth.login";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/auth/forgot-password")({
  head: () => ({ meta: [{ title: "Reset password — 0101" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await sendPasswordReset(email);
      setSent(true);
      toast.success("Check your inbox.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send reset link");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Reset password"
      subtitle="We'll email you a link to set a new one."
      footer={
        <Link to="/auth/login" className="text-rim hover:underline">
          ← Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="text-center text-sm text-foreground/80 py-4">
          A reset link is on its way to <span className="text-foreground">{email}</span>. Check spam
          if you don't see it.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email">
            <GlassInput
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
            />
          </Field>
          <GlassButton type="submit" variant="rim" size="lg" className="w-full" disabled={loading}>
            {loading ? "Sending…" : "Send reset link"}
          </GlassButton>
        </form>
      )}
    </AuthShell>
  );
}
