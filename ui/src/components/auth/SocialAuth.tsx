import * as React from "react";
import { toast } from "sonner";
import { GlassButton } from "@/components/glass/GlassButton";
import { useAuth } from "@/lib/auth";

export function SocialAuth() {
  const { signInWithGoogle, signInWithApple } = useAuth();
  const [loading, setLoading] = React.useState<"google" | "apple" | null>(null);

  async function go(provider: "google" | "apple") {
    setLoading(provider);
    try {
      if (provider === "google") await signInWithGoogle();
      else await signInWithApple();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${provider} sign-in failed`);
      setLoading(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <GlassButton
          type="button"
          variant="glass"
          size="lg"
          disabled={loading !== null}
          onClick={() => go("google")}
        >
          <GoogleIcon />
          {loading === "google" ? "…" : "Google"}
        </GlassButton>
        <GlassButton
          type="button"
          variant="glass"
          size="lg"
          disabled={loading !== null}
          onClick={() => go("apple")}
        >
          <AppleIcon />
          {loading === "apple" ? "…" : "Apple"}
        </GlassButton>
      </div>
      <div className="flex items-center gap-3 py-2">
        <div className="flex-1 h-px bg-white/8" />
        <span className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">
          or with email
        </span>
        <div className="flex-1 h-px bg-white/8" />
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.4-1.6 4.1-5.5 4.1-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.7 14.6 2.8 12 2.8 6.9 2.8 2.8 6.9 2.8 12s4.1 9.2 9.2 9.2c5.3 0 8.8-3.7 8.8-9 0-.6-.1-1.1-.2-1.6H12z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden>
      <path d="M17.05 12.04c-.03-2.92 2.39-4.32 2.5-4.39-1.36-1.99-3.48-2.27-4.24-2.3-1.81-.18-3.53 1.06-4.45 1.06-.92 0-2.34-1.04-3.85-1.01-1.98.03-3.81 1.15-4.83 2.92-2.06 3.57-.53 8.85 1.48 11.74.98 1.42 2.15 3 3.66 2.95 1.47-.06 2.03-.95 3.81-.95 1.78 0 2.27.95 3.82.92 1.58-.03 2.58-1.44 3.55-2.86 1.12-1.64 1.58-3.23 1.6-3.31-.04-.02-3.07-1.18-3.05-4.77zM14.13 4.11C14.93 3.13 15.48 1.78 15.32.44c-1.15.05-2.55.77-3.39 1.74-.75.86-1.41 2.25-1.23 3.55 1.29.1 2.61-.65 3.43-1.62z" />
    </svg>
  );
}
