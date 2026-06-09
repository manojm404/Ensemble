import * as React from "react";
import { StrictMode } from "react";
import type { ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import { getRouter } from "./router";
import "./styles.css";

const router = getRouter();

class AppErrorBoundary extends React.Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  render() {
    if (this.state.error) {
      const message =
        this.state.error instanceof Error
          ? this.state.error.message
          : typeof this.state.error === "string"
            ? this.state.error
            : "Unknown application error";

      return (
        <div className="min-h-screen grid place-items-center px-6 text-foreground">
          <div className="glass max-w-md w-full rounded-2xl border border-white/10 p-8 text-center">
            <div className="font-mono text-xs tracking-[0.3em] text-destructive/80 mb-3">
              RUNTIME ERROR
            </div>
            <h1 className="text-2xl font-semibold mb-3">Dashboard could not render.</h1>
            <p className="text-sm text-muted-foreground mb-6">{message}</p>
            <button
              className="rounded-xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm"
              onClick={() => window.location.assign("/auth/login?redirect=%2Fdashboard")}
            >
              Return to sign in
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <RouterProvider router={router} />
    </AppErrorBoundary>
  </StrictMode>,
);
