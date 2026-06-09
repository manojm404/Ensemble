import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput } from "@/components/glass/GlassInput";
import { Field } from "./auth.login";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/auth/reset-password")({
  head: () => ({ meta: [{ title: "Set new password — 0101" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { updatePassword, status } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast.error("Password too short.");
    if (password !== confirm) return toast.error("Passwords don't match.");
    setLoading(true);
    try {
      await updatePassword(password);
      toast.success("Password updated.");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reset password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Set a new password"
      subtitle={
        status === "authenticated"
          ? "Choose something memorable. We never see it."
          : "Open the email link first, then set a new password here."
      }
      footer={
        <Link to="/auth/login" className="text-rim hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="New password">
          <GlassInput
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Confirm password">
          <GlassInput
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <GlassButton
          type="submit"
          variant="rim"
          size="lg"
          className="w-full"
          disabled={loading || status !== "authenticated"}
        >
          {loading ? "Updating…" : "Update password"}
        </GlassButton>
      </form>
    </AuthShell>
  );
}
