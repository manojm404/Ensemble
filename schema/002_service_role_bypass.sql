-- =====================================================
-- Ensemble Phase 3 Migration: Service Role Bypass Policies
-- =====================================================
-- The service_role key needs to be able to insert/update
-- on behalf of users. These policies allow the backend
-- (using service_role) to manage data for any user.
-- =====================================================

-- Helper function to check if request is from service role
CREATE OR REPLACE FUNCTION public.is_service_role()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
$$;

-- Add service_role bypass policies to all tables
-- This allows the backend to manage data on behalf of users

-- user_api_keys: Allow service_role to manage all keys
DROP POLICY IF EXISTS "Service role manage all API keys" ON public.user_api_keys;
CREATE POLICY "Service role manage all API keys" ON public.user_api_keys
    FOR ALL USING (public.is_service_role());

-- user_settings: Allow service_role to manage all settings
DROP POLICY IF EXISTS "Service role manage all settings" ON public.user_settings;
CREATE POLICY "Service role manage all settings" ON public.user_settings
    FOR ALL USING (public.is_service_role());

-- workflows: Allow service_role to manage all workflows
DROP POLICY IF EXISTS "Service role manage all workflows" ON public.workflows;
CREATE POLICY "Service role manage all workflows" ON public.workflows
    FOR ALL USING (public.is_service_role());

-- workflow_executions: Allow service_role to manage all executions
DROP POLICY IF EXISTS "Service role manage all executions" ON public.workflow_executions;
CREATE POLICY "Service role manage all executions" ON public.workflow_executions
    FOR ALL USING (public.is_service_role());

-- macros: Allow service_role to manage all macros
DROP POLICY IF EXISTS "Service role manage all macros" ON public.macros;
CREATE POLICY "Service role manage all macros" ON public.macros
    FOR ALL USING (public.is_service_role());

-- audit_events: Allow service_role to insert (append-only still enforced for users)
DROP POLICY IF EXISTS "Service role insert audit events" ON public.audit_events;
CREATE POLICY "Service role insert audit events" ON public.audit_events
    FOR INSERT WITH CHECK (public.is_service_role());

-- conversations: Allow service_role to manage all conversations
DROP POLICY IF EXISTS "Service role manage all conversations" ON public.conversations;
CREATE POLICY "Service role manage all conversations" ON public.conversations
    FOR ALL USING (public.is_service_role());

-- rag_documents: Allow service_role to manage all RAG documents
DROP POLICY IF EXISTS "Service role manage all RAG documents" ON public.rag_documents;
CREATE POLICY "Service role manage all RAG documents" ON public.rag_documents
    FOR ALL USING (public.is_service_role());

-- token_grants: Allow service_role to manage all token grants
DROP POLICY IF EXISTS "Service role manage all token grants" ON public.token_grants;
CREATE POLICY "Service role manage all token grants" ON public.token_grants
    FOR ALL USING (public.is_service_role());

-- custom_agents: Allow service_role to manage all custom agents
DROP POLICY IF EXISTS "Service role manage all custom agents" ON public.custom_agents;
CREATE POLICY "Service role manage all custom agents" ON public.custom_agents
    FOR ALL USING (public.is_service_role());

-- notifications: Allow service_role to manage all notifications
DROP POLICY IF EXISTS "Service role manage all notifications" ON public.notifications;
CREATE POLICY "Service role manage all notifications" ON public.notifications
    FOR ALL USING (public.is_service_role());

-- feedback: Allow service_role to read all feedback (for admin dashboard)
DROP POLICY IF EXISTS "Service role manage all feedback" ON public.feedback;
CREATE POLICY "Service role manage all feedback" ON public.feedback
    FOR ALL USING (public.is_service_role());

-- bug_reports: Allow service_role to manage all bug reports
DROP POLICY IF EXISTS "Service role manage all bug reports" ON public.bug_reports;
CREATE POLICY "Service role manage all bug reports" ON public.bug_reports
    FOR ALL USING (public.is_service_role());

-- daily_token_usage: Allow service_role to update usage
DROP POLICY IF EXISTS "Service role update daily usage" ON public.daily_token_usage;
CREATE POLICY "Service role update daily usage" ON public.daily_token_usage
    FOR ALL USING (public.is_service_role());

-- profiles: Allow service_role to read all profiles
DROP POLICY IF EXISTS "Service role read all profiles" ON public.profiles;
CREATE POLICY "Service role read all profiles" ON public.profiles
    FOR SELECT USING (public.is_service_role());

-- Verify
DO $$
DECLARE
    policy_count INT;
BEGIN
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public' AND policyname LIKE 'Service role%';

    RAISE NOTICE '✅ Created % service role bypass policies', policy_count;
END $$;
