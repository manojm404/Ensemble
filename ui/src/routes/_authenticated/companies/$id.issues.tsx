import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/companies/$id/issues")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/companies/$id/tasks", params });
  },
});
