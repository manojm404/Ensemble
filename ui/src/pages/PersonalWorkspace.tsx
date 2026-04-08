/**
 * PersonalWorkspace.tsx — Personal Workspace with all native agents
 * 
 * Reuses the existing ChatView component but with no org context.
 * Users can chat with any native agent from the marketplace.
 */
import { ChatView } from "@/components/chat/ChatView";

export default function PersonalWorkspace() {
  return <ChatView />;
}
