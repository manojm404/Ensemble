import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, Link, createRootRouteWithContext, useRouter } from "@tanstack/react-router";

import { AuthProvider } from "../lib/auth";
import { Toaster } from "sonner";
import { GlassPanel } from "../components/glass/GlassPanel";
import { GlassButton } from "../components/glass/GlassButton";
import { Wordmark } from "../components/brand/Wordmark";

function NotFoundComponent() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <GlassPanel variant="strong" padding="lg" className="max-w-md w-full text-center rim-light">
        <div className="flex justify-center mb-6">
          <Wordmark size={32} />
        </div>
        <div className="font-mono text-xs tracking-[0.3em] text-rim/80 mb-3">ERROR / 404</div>
        <h1 className="text-3xl font-semibold tracking-tight text-chrome mb-2">Off the map</h1>
        <p className="text-sm text-muted-foreground mb-8">
          The route you tried isn&rsquo;t part of this workflow.
        </p>
        <GlassButton asChild variant="rim" size="md">
          <Link to="/">Return home</Link>
        </GlassButton>
      </GlassPanel>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <GlassPanel variant="strong" padding="lg" className="max-w-md w-full text-center">
        <div className="font-mono text-xs tracking-[0.3em] text-destructive/80 mb-3">
          RUNTIME ERROR
        </div>
        <h1 className="text-2xl font-semibold tracking-tight mb-2">Something cracked the glass.</h1>
        <p className="text-sm text-muted-foreground mb-6">{message}</p>
        <div className="flex gap-3 justify-center">
          <GlassButton
            variant="rim"
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            Try again
          </GlassButton>
          <GlassButton asChild variant="glass">
            <a href="/">Home</a>
          </GlassButton>
        </div>
      </GlassPanel>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            className: "glass border border-white/10 !text-foreground",
          }}
        />
      </AuthProvider>
    </QueryClientProvider>
  );
}
