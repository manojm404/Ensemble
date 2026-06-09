import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy alias. Workspaces are canonical at /workspaces.
 */
export const Route = createFileRoute("/_authenticated/workspace")({
  beforeLoad: () => {
    throw redirect({ to: "/workspaces" });
  },
});
