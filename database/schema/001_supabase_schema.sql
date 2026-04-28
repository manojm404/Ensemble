-- =====================================================
-- Ensemble v2.0 — Supabase Database Schema
-- =====================================================
-- Purpose: Multi-tenant schema with Row Level Security (RLS)
--          for user isolation, encrypted API keys, budget tracking,
--          audit logging, workflow management, and feedback collection.
--
-- Run this file in Supabase SQL Editor to create the full schema.
--
-- Schema Version: 1.0
-- Last Updated:   April 11, 2026
-- Release Phase:  Phase 1 (Supabase Setup)
-- =====================================================

-- =====================================================
-- 0. EXTENSIONS
-- =====================================================

-- Vector embeddings for RAG (384-dim from all-MiniLM-L6-v2)
CREATE EXTENSION IF NOT EXISTS vector;

-- UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. USER PROFILES (extends auth.users)
-- =====================================================

CREATE TABLE public.profiles (
    id              UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email           VARCHAR(255) UNIQUE NOT NULL,
    full_name       VARCHAR(255),
    avatar_url      TEXT,
    tier            VARCHAR(50) DEFAULT 'free',
    sop_run_count   INT DEFAULT 0,
    total_cost_usd  DECIMAL(10,6) DEFAULT 0,
    last_run_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT tier_valid CHECK (tier IN ('free', 'pro', 'enterprise'))
);

COMMENT ON TABLE public.profiles IS 'Extends Supabase auth.users with Ensemble-specific profile data.';
COMMENT ON COLUMN public.profiles.tier IS 'Subscription tier: free (100 SOP runs/mo), pro, enterprise.';
COMMENT ON COLUMN public.profiles.sop_run_count IS 'Tracks monthly SOP runs for free tier enforcement.';
COMMENT ON COLUMN public.profiles.total_cost_usd IS 'Cumulative LLM API cost for this user.';

-- =====================================================
-- 2. USER SETTINGS
-- =====================================================

CREATE TABLE public.user_settings (
    id                          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                     UUID REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
    default_llm_provider        VARCHAR(50) DEFAULT 'gemini',
    default_model               VARCHAR(100) DEFAULT 'gemini-2.5-flash',
    base_url                    TEXT,
    approval_cost_threshold     DECIMAL(10,6) DEFAULT 0.0001,
    approval_timeout_seconds    INT DEFAULT 300,
    theme                       VARCHAR(50) DEFAULT 'dark',
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT theme_valid CHECK (theme IN ('dark', 'light', 'system'))
);

COMMENT ON TABLE public.user_settings IS 'Per-user preferences: default LLM provider, model, UI theme, approval thresholds.';

-- =====================================================
-- 3. LLM API KEYS (encrypted at rest)
-- =====================================================

CREATE TABLE public.user_api_keys (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    provider        VARCHAR(50) NOT NULL,
    encrypted_key   TEXT NOT NULL,
    key_suffix      VARCHAR(10) NOT NULL,
    is_active       BOOLEAN DEFAULT true,
    last_used_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, provider),
    CONSTRAINT provider_valid CHECK (provider IN (
        'gemini', 'openai', 'anthropic', 'deepseek', 'groq',
        'openrouter', 'ollama', 'lm-studio', 'localai', 'llama-cpp', 'vllm', 'cherryin', 'siliconflow', 'aihubmix'
    ))
);

COMMENT ON TABLE public.user_api_keys IS 'Encrypted LLM provider API keys. Keys are AES-256 encrypted at rest. Only the last N characters (key_suffix) are stored in plain text for display.';
COMMENT ON COLUMN public.user_api_keys.key_suffix IS 'Last 4-6 characters of the API key for display purposes (e.g., "...abc123").';

-- =====================================================
-- 4. WORKFLOWS (SOP & DAG definitions)
-- =====================================================

CREATE TABLE public.workflows (
    id              VARCHAR(50) PRIMARY KEY,
    user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    graph_json      JSONB,
    version         INT DEFAULT 1,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.workflows IS 'User-defined SOP/DAG workflows. graph_json stores the full node/edge definition.';
COMMENT ON COLUMN public.workflows.graph_json IS 'JSONB representation of the workflow graph (React Flow format).';

-- =====================================================
-- 5. WORKFLOW EXECUTIONS
-- =====================================================

CREATE TABLE public.workflow_executions (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    workflow_id     VARCHAR(50) REFERENCES public.workflows(id) ON DELETE SET NULL,
    status          VARCHAR(20) DEFAULT 'pending',
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    duration_ms     INT,
    total_cost_usd  DECIMAL(10,6) DEFAULT 0,
    total_tokens    INT DEFAULT 0,
    error_message   TEXT,
    result_json     JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT status_valid CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'hibernated'))
);

COMMENT ON TABLE public.workflow_executions IS 'Tracks each run of a workflow with status, timing, cost, and token usage.';

-- =====================================================
-- 6. MACROS (collapsible sub-workflows)
-- =====================================================

CREATE TABLE public.macros (
    macro_id        VARCHAR(50) PRIMARY KEY,
    user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    graph_json      JSONB,
    version         INT DEFAULT 1,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.macros IS 'Reusable sub-workflows that can be collapsed/expanded on the canvas.';

-- =====================================================
-- 7. AUDIT EVENTS (append-only)
-- =====================================================

CREATE TABLE public.audit_events (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    company_id      TEXT,
    agent_id        TEXT,
    action_type     TEXT,
    details_json    JSONB,
    cost_usd        DECIMAL(10,6) DEFAULT 0,
    cas_hash        TEXT,
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast user-scoped queries
CREATE INDEX idx_audit_events_user ON public.audit_events(user_id, created_at DESC);
-- Index for agent-scoped queries
CREATE INDEX idx_audit_events_agent ON public.audit_events(agent_id, created_at DESC) WHERE agent_id IS NOT NULL;

COMMENT ON TABLE public.audit_events IS 'Immutable log of all agent actions. Append-only: no UPDATE or DELETE allowed.';
COMMENT ON COLUMN public.audit_events.ip_address IS 'IP address of the request (for security auditing).';
COMMENT ON COLUMN public.audit_events.user_agent IS 'HTTP User-Agent string of the client.';

-- =====================================================
-- 8. CONVERSATIONS (agent chat history)
-- =====================================================

CREATE TABLE public.conversations (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    session_id      TEXT NOT NULL,
    agent_id        TEXT,
    messages        JSONB,
    token_count     INT DEFAULT 0,
    total_cost_usd  DECIMAL(10,6) DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversations_user ON public.conversations(user_id, updated_at DESC);
CREATE INDEX idx_conversations_session ON public.conversations(user_id, session_id);

COMMENT ON TABLE public.conversations IS 'Chat history between users and agents. messages is a JSONB array of role/content pairs.';

-- =====================================================
-- 9. RAG DOCUMENTS (with vector embeddings)
-- =====================================================

CREATE TABLE public.rag_documents (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    filename        TEXT NOT NULL,
    content         TEXT,
    metadata        JSONB,
    embedding       vector(384),
    chunk_index     INT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rag_documents_user ON public.rag_documents(user_id);
-- HNSW index for fast vector similarity search
CREATE INDEX idx_rag_documents_embedding ON public.rag_documents
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

COMMENT ON TABLE public.rag_documents IS 'User-uploaded documents with vector embeddings for semantic search (RAG).';
COMMENT ON COLUMN public.rag_documents.embedding IS '384-dim embedding from all-MiniLM-L6-v2 model.';
COMMENT ON COLUMN public.rag_documents.chunk_index IS 'Document chunk order (0 = first chunk).';

-- =====================================================
-- 10. TOKEN GRANTS (budget allocations)
-- =====================================================

CREATE TABLE public.token_grants (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    grant_amount    DECIMAL(10,4) NOT NULL,
    spent           DECIMAL(10,4) DEFAULT 0,
    remaining       DECIMAL(10,4) GENERATED ALWAYS AS (grant_amount - spent) STORED,
    status          VARCHAR(20) DEFAULT 'active',
    task_description TEXT,
    agent_id        TEXT,
    workflow_id     VARCHAR(50) REFERENCES public.workflows(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,

    CONSTRAINT grant_status_valid CHECK (status IN ('active', 'expired', 'exhausted', 'revoked'))
);

CREATE INDEX idx_token_grants_user ON public.token_grants(user_id, status);
CREATE INDEX idx_token_grants_active ON public.token_grants(user_id) WHERE status = 'active';

COMMENT ON TABLE public.token_grants IS 'Budget allocations per task/agent. remaining is auto-calculated from grant_amount - spent.';

-- =====================================================
-- 11. CUSTOM AGENTS (user-defined agent personas)
-- =====================================================

CREATE TABLE public.custom_agents (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    category        VARCHAR(100),
    description     TEXT,
    instruction     TEXT,
    model           VARCHAR(100),
    temperature     DECIMAL(3,2) DEFAULT 0.7,
    tools           JSONB DEFAULT '[]',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_custom_agents_user ON public.custom_agents(user_id);

COMMENT ON TABLE public.custom_agents IS 'User-created AI agent personas with custom instructions and tool access.';
COMMENT ON COLUMN public.custom_agents.tools IS 'JSONB array of allowed tools (e.g., ["search_web", "read_artifact", "shell_cmd"]).';

-- =====================================================
-- 12. NOTIFICATIONS
-- =====================================================

CREATE TABLE public.notifications (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    type            VARCHAR(50) NOT NULL,
    title           VARCHAR(255) NOT NULL,
    message         TEXT,
    metadata        JSONB,
    is_read         BOOLEAN DEFAULT false,
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT notification_type_valid CHECK (type IN (
        'approval_request', 'budget_warning', 'budget_exceeded', 'error',
        'workflow_completed', 'workflow_failed', 'system', 'feedback_response'
    ))
);

CREATE INDEX idx_notifications_user ON public.notifications(user_id, is_read, created_at DESC);

COMMENT ON TABLE public.notifications IS 'System notifications: approval requests, budget alerts, errors, workflow status.';

-- =====================================================
-- 13. FEEDBACK (user reviews and suggestions)
-- =====================================================

CREATE TABLE public.feedback (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    type            VARCHAR(50) DEFAULT 'feedback',
    rating          INT,
    title           VARCHAR(255),
    message         TEXT NOT NULL,
    category        VARCHAR(100),
    status          VARCHAR(20) DEFAULT 'new',
    admin_response  TEXT,
    metadata        JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT feedback_type_valid CHECK (type IN ('feedback', 'feature_request', 'bug_report', 'question', 'praise')),
    CONSTRAINT feedback_rating_valid CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
    CONSTRAINT feedback_status_valid CHECK (status IN ('new', 'acknowledged', 'in_progress', 'resolved', 'rejected', 'planned'))
);

CREATE INDEX idx_feedback_user ON public.feedback(user_id, created_at DESC);
CREATE INDEX idx_feedback_status ON public.feedback(status, created_at DESC);
CREATE INDEX idx_feedback_type ON public.feedback(type, created_at DESC);

COMMENT ON TABLE public.feedback IS 'User feedback, feature requests, bug reports, and questions. Links to user_id for RLS.';

-- =====================================================
-- 14. BUG REPORTS (detailed, linked to feedback)
-- =====================================================

CREATE TABLE public.bug_reports (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    feedback_id     UUID REFERENCES public.feedback(id) ON DELETE SET NULL,
    title           VARCHAR(255) NOT NULL,
    description     TEXT NOT NULL,
    steps_to_reproduce TEXT,
    expected_behavior TEXT,
    actual_behavior TEXT,
    severity        VARCHAR(20) DEFAULT 'medium',
    browser_info    TEXT,
    os_info         TEXT,
    screenshot_url  TEXT,
    status          VARCHAR(20) DEFAULT 'new',
    assignee_notes  TEXT,
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT bug_severity_valid CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    CONSTRAINT bug_status_valid CHECK (status IN ('new', 'confirmed', 'in_progress', 'fixed', 'wont_fix', 'duplicate', 'cannot_reproduce'))
);

CREATE INDEX idx_bug_reports_user ON public.bug_reports(user_id, created_at DESC);
CREATE INDEX idx_bug_reports_status ON public.bug_reports(status, created_at DESC);
CREATE INDEX idx_bug_reports_severity ON public.bug_reports(severity, created_at DESC);

COMMENT ON TABLE public.bug_reports IS 'Detailed bug reports with reproduction steps, severity, and environment info.';

-- =====================================================
-- 15. DAILY TOKEN USAGE (for budget enforcement)
-- =====================================================

CREATE TABLE public.daily_token_usage (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    usage_date      DATE NOT NULL DEFAULT CURRENT_DATE,
    tokens_used     INT DEFAULT 0,
    cost_usd        DECIMAL(10,6) DEFAULT 0,
    sop_runs        INT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, usage_date)
);

CREATE INDEX idx_daily_usage_user ON public.daily_token_usage(user_id, usage_date DESC);

COMMENT ON TABLE public.daily_token_usage IS 'Daily aggregation of token usage, cost, and SOP run count for budget enforcement.';

-- =====================================================
-- TRIGGER FUNCTIONS
-- =====================================================

-- 1. Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
    );

    -- Auto-create default settings
    INSERT INTO public.user_settings (user_id)
    VALUES (NEW.id);

    -- Auto-grant welcome bonus tokens (10,000 for free tier)
    INSERT INTO public.token_grants (user_id, grant_amount, spent, status, task_description)
    VALUES (NEW.id, 10000, 0, 'active', 'Welcome bonus — 10,000 tokens on signup');

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user IS 'Trigger function: auto-creates profile, settings, and welcome bonus tokens when a new user signs up.';

-- 2. Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_updated_at IS 'Trigger function: auto-updates the updated_at column on any row modification.';

-- 3. Enforce monthly SOP run limit for free tier
CREATE OR REPLACE FUNCTION public.check_sop_run_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    user_tier VARCHAR(50);
    current_month_runs INT;
BEGIN
    -- Get user's tier
    SELECT tier INTO user_tier FROM public.profiles WHERE id = NEW.user_id;

    -- Only enforce for free tier
    IF user_tier = 'free' THEN
        -- Count runs this month
        SELECT COALESCE(SUM(sop_runs), 0) INTO current_month_runs
        FROM public.daily_token_usage
        WHERE user_id = NEW.user_id
          AND usage_date >= date_trunc('month', CURRENT_DATE)::date;

        IF current_month_runs >= 100 THEN
            RAISE EXCEPTION 'Free tier limit exceeded: 100 SOP runs per month. Upgrade to Pro for unlimited runs.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_sop_run_limit IS 'Trigger function: enforces 100 SOP runs/month limit for free tier users.';

-- 4. Auto-aggregate daily token usage on workflow execution completion
CREATE OR REPLACE FUNCTION public.aggregate_daily_usage()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only aggregate on completed or failed executions
    IF NEW.status IN ('completed', 'failed') AND (OLD IS NULL OR OLD.status != NEW.status) THEN
        INSERT INTO public.daily_token_usage (user_id, usage_date, tokens_used, cost_usd, sop_runs)
        VALUES (NEW.user_id, CURRENT_DATE, NEW.total_tokens, NEW.total_cost_usd, 1)
        ON CONFLICT (user_id, usage_date)
        DO UPDATE SET
            tokens_used = daily_token_usage.tokens_used + EXCLUDED.tokens_used,
            cost_usd = daily_token_usage.cost_usd + EXCLUDED.cost_usd,
            sop_runs = daily_token_usage.sop_runs + EXCLUDED.sop_runs,
            updated_at = NOW();

        -- Update profile totals
        UPDATE public.profiles
        SET
            sop_run_count = sop_run_count + 1,
            total_cost_usd = total_cost_usd + NEW.total_cost_usd,
            last_run_at = NOW()
        WHERE id = NEW.user_id;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.aggregate_daily_usage IS 'Trigger function: aggregates token usage into daily_token_usage table when a workflow execution completes.';

-- =====================================================
-- CREATE TRIGGERS
-- =====================================================

-- 1. On new auth user → create profile, settings, welcome tokens
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- 2. Auto-update updated_at on all tables with that column
CREATE TRIGGER set_updated_at_profiles
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_user_settings
    BEFORE UPDATE ON public.user_settings
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_user_api_keys
    BEFORE UPDATE ON public.user_api_keys
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_workflows
    BEFORE UPDATE ON public.workflows
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_macros
    BEFORE UPDATE ON public.macros
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_conversations
    BEFORE UPDATE ON public.conversations
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_custom_agents
    BEFORE UPDATE ON public.custom_agents
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_feedback
    BEFORE UPDATE ON public.feedback
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_bug_reports
    BEFORE UPDATE ON public.bug_reports
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_daily_token_usage
    BEFORE UPDATE ON public.daily_token_usage
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 3. Enforce SOP run limit on new workflow executions
CREATE TRIGGER enforce_sop_run_limit
    BEFORE INSERT ON public.workflow_executions
    FOR EACH ROW
    EXECUTE FUNCTION public.check_sop_run_limit();

-- 4. Aggregate daily usage on workflow execution status change
CREATE TRIGGER aggregate_daily_usage
    AFTER INSERT OR UPDATE OF status ON public.workflow_executions
    FOR EACH ROW
    EXECUTE FUNCTION public.aggregate_daily_usage();

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================
-- Rule: Users can ONLY see and modify their own data.
-- The only exception is feedback/bug reports which can be
-- read by admins (handled separately via service role key).

-- --- profiles ---
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- --- user_settings ---
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own settings"
    ON public.user_settings FOR ALL
    USING (auth.uid() = user_id);

-- --- user_api_keys ---
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own API keys"
    ON public.user_api_keys FOR ALL
    USING (auth.uid() = user_id);

-- --- workflows ---
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own workflows"
    ON public.workflows FOR ALL
    USING (auth.uid() = user_id);

-- --- workflow_executions ---
ALTER TABLE public.workflow_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own workflow executions"
    ON public.workflow_executions FOR ALL
    USING (auth.uid() = user_id);

-- --- macros ---
ALTER TABLE public.macros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own macros"
    ON public.macros FOR ALL
    USING (auth.uid() = user_id);

-- --- audit_events (APPEND-ONLY: no UPDATE or DELETE) ---
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own audit events"
    ON public.audit_events FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own audit events"
    ON public.audit_events FOR SELECT
    USING (auth.uid() = user_id);

-- Note: No UPDATE or DELETE policies for audit_events — they are intentionally omitted
-- to enforce append-only behavior. Not even the user can modify their own audit log.

-- --- conversations ---
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own conversations"
    ON public.conversations FOR ALL
    USING (auth.uid() = user_id);

-- --- rag_documents ---
ALTER TABLE public.rag_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own RAG documents"
    ON public.rag_documents FOR ALL
    USING (auth.uid() = user_id);

-- --- token_grants ---
ALTER TABLE public.token_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own token grants"
    ON public.token_grants FOR ALL
    USING (auth.uid() = user_id);

-- --- custom_agents ---
ALTER TABLE public.custom_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own custom agents"
    ON public.custom_agents FOR ALL
    USING (auth.uid() = user_id);

-- --- notifications ---
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own notifications"
    ON public.notifications FOR ALL
    USING (auth.uid() = user_id);

-- --- feedback ---
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create feedback"
    ON public.feedback FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own feedback"
    ON public.feedback FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own feedback"
    ON public.feedback FOR UPDATE
    USING (auth.uid() = user_id);

-- --- bug_reports ---
ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create bug reports"
    ON public.bug_reports FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own bug reports"
    ON public.bug_reports FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own bug reports"
    ON public.bug_reports FOR UPDATE
    USING (auth.uid() = user_id);

-- --- daily_token_usage ---
ALTER TABLE public.daily_token_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own daily usage"
    ON public.daily_token_usage FOR SELECT
    USING (auth.uid() = user_id);

-- daily_token_usage is only updated by triggers, not by user API calls
-- No INSERT/UPDATE/DELETE policies — users cannot modify this directly

-- =====================================================
-- HELPER FUNCTIONS (for API use)
-- =====================================================

-- Get user's remaining token grant
CREATE OR REPLACE FUNCTION public.get_remaining_tokens(p_user_id UUID)
RETURNS DECIMAL
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    total_granted DECIMAL;
    total_spent DECIMAL;
BEGIN
    SELECT COALESCE(SUM(grant_amount), 0) INTO total_granted
    FROM public.token_grants
    WHERE user_id = p_user_id AND status = 'active';

    SELECT COALESCE(SUM(spent), 0) INTO total_spent
    FROM public.token_grants
    WHERE user_id = p_user_id AND status = 'active';

    RETURN total_granted - total_spent;
END;
$$;

-- Check if user has exceeded monthly SOP run limit
CREATE OR REPLACE FUNCTION public.is_sop_limit_exceeded(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_tier VARCHAR(50);
    current_month_runs INT;
BEGIN
    SELECT tier INTO user_tier FROM public.profiles WHERE id = p_user_id;

    -- Pro and enterprise have no limit
    IF user_tier != 'free' THEN
        RETURN false;
    END IF;

    SELECT COALESCE(SUM(sop_runs), 0) INTO current_month_runs
    FROM public.daily_token_usage
    WHERE user_id = p_user_id
      AND usage_date >= date_trunc('month', CURRENT_DATE)::date;

    RETURN current_month_runs >= 100;
END;
$$;

-- Mask an API key for display (show only last N characters)
CREATE OR REPLACE FUNCTION public.mask_api_key(full_key TEXT, visible_chars INT DEFAULT 4)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF length(full_key) <= visible_chars THEN
        RETURN full_key;
    END IF;
    RETURN '...' || right(full_key, visible_chars);
END;
$$;

-- =====================================================
-- VERIFICATION: Check that everything was created
-- =====================================================

DO $$
DECLARE
    table_count INT;
    policy_count INT;
    trigger_count INT;
    function_count INT;
BEGIN
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public';

    SELECT COUNT(*) INTO trigger_count
    FROM information_schema.triggers
    WHERE trigger_schema = 'public';

    SELECT COUNT(*) INTO function_count
    FROM information_schema.routines
    WHERE routine_schema = 'public'
      AND routine_name NOT LIKE 'pg_%';

    RAISE NOTICE '========================================';
    RAISE NOTICE 'Ensemble Schema Verification Complete';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Tables created:      %', table_count;
    RAISE NOTICE 'RLS policies created: %', policy_count;
    RAISE NOTICE 'Triggers created:     %', trigger_count;
    RAISE NOTICE 'Functions created:    %', function_count;
    RAISE NOTICE '========================================';

    IF table_count < 15 THEN
        RAISE WARNING 'Expected at least 15 tables, found %', table_count;
    END IF;

    IF policy_count < 25 THEN
        RAISE WARNING 'Expected at least 25 RLS policies, found %', policy_count;
    END IF;
END $$;

-- =====================================================
-- SAMPLE QUERIES (for testing after schema creation)
-- =====================================================
-- Uncomment and run these to verify the schema works:

-- 1. Check all tables exist
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
-- ORDER BY table_name;

-- 2. Check RLS is enabled on all tables
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';

-- 3. Simulate a new user signup (trigger handles the rest)
-- INSERT INTO auth.users (id, email, encrypted_password)
-- VALUES ('00000000-0000-0000-0000-000000000001', 'test@example.com', 'hashed_password');
-- -- Check auto-created profile:
-- SELECT * FROM profiles WHERE id = '00000000-0000-0000-0000-000000000001';
-- -- Check auto-created settings:
-- SELECT * FROM user_settings WHERE user_id = '00000000-0000-0000-0000-000000000001';
-- -- Check welcome bonus tokens:
-- SELECT * FROM token_grants WHERE user_id = '00000000-0000-0000-0000-000000000001';

-- 4. Check remaining tokens function
-- SELECT get_remaining_tokens('00000000-0000-0000-0000-000000000001');

-- 5. Check SOP limit function
-- SELECT is_sop_limit_exceeded('00000000-0000-0000-0000-000000000001');

-- 6. Create a workflow
-- INSERT INTO workflows (id, user_id, name, graph_json)
-- VALUES ('wf_test_001', '00000000-0000-0000-0000-000000000001', 'Test Workflow', '{"nodes": [], "edges": []}');

-- 7. Execute a workflow (triggers daily usage aggregation)
-- INSERT INTO workflow_executions (user_id, workflow_id, status, started_at, completed_at, duration_ms, total_cost_usd, total_tokens)
-- VALUES ('00000000-0000-0000-0000-000000000001', 'wf_test_001', 'completed', NOW(), NOW(), 5000, 0.001, 150);

-- 8. Verify daily usage was aggregated
-- SELECT * FROM daily_token_usage WHERE user_id = '00000000-0000-0000-0000-000000000001';

-- 9. Submit feedback
-- INSERT INTO feedback (user_id, type, rating, title, message)
-- VALUES ('00000000-0000-0000-0000-000000000001', 'feedback', 5, 'Great platform!', 'Love the agent orchestration.');

-- 10. Submit a bug report
-- INSERT INTO bug_reports (user_id, title, description, severity, steps_to_reproduce)
-- VALUES ('00000000-0000-0000-0000-000000000001', 'Workflow save fails', 'When saving a large workflow, the request times out.', 'high', '1. Create workflow with 50+ nodes 2. Click Save 3. Wait for timeout');
