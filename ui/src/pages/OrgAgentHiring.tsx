import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

/**
 * OrgAgentHiring — Redirects to agents marketplace with org context.
 * Users browse 1690+ pre-built agents and add them to their org.
 */
export default function OrgAgentHiring() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    navigate(`/agents?orgId=${id}`);
  }, [id, navigate]);

  return null;
}
