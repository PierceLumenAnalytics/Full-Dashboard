-- ============================================================================
-- LUMEN ANALYTICS - PRODUCTION READINESS HARDENING MIGRATION
-- ============================================================================

-- 1. DATA CLEANUP: Remove duplicate daily metrics prior to unique constraint application
DELETE FROM public.campaign_metrics a USING public.campaign_metrics b
WHERE a.id < b.id
  AND a.client_id = b.client_id
  AND a.date = b.date
  AND a.platform = b.platform;

-- 2. DEDUPLICATION: Add unique constraint on campaign metrics to support idempotent upserts
ALTER TABLE public.campaign_metrics
ADD CONSTRAINT campaign_metrics_client_date_platform_key UNIQUE (client_id, date, platform);

-- 3. DATA INTEGRITY: Alter client constraints
-- A. Add check constraint to ensure monthly budget is never negative
ALTER TABLE public.clients ADD CONSTRAINT clients_monthly_budget_check CHECK (monthly_budget >= 0);

-- B. Set client.agency_id as NOT NULL to prevent orphaned clients (assumes cleanup was done)
-- First check/assign a default fallback agency if there are any orphans (precautionary data cleanup)
DO $$
DECLARE
    fallback_agency_id uuid;
BEGIN
    SELECT id INTO fallback_agency_id FROM public.agencies LIMIT 1;
    IF fallback_agency_id IS NOT NULL THEN
        UPDATE public.clients SET agency_id = fallback_agency_id WHERE agency_id IS NULL;
    END IF;
END $$;

ALTER TABLE public.clients ALTER COLUMN agency_id SET NOT NULL;

-- C. Add public dashboard publish flag for client records
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS public_dashboard_enabled boolean NOT NULL DEFAULT false;

-- 4. NEW TABLE: public.public_dashboards
-- Stores cryptographically random hashed tokens for public read-only white-label dashboard authorization.
CREATE TABLE IF NOT EXISTS public.public_dashboards (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    agency_id uuid NOT NULL,
    token_hash text NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    
    CONSTRAINT public_dashboards_pkey PRIMARY KEY (id),
    CONSTRAINT public_dashboards_agency_id_key UNIQUE (agency_id),
    CONSTRAINT public_dashboards_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies (id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.public_dashboards ENABLE ROW LEVEL SECURITY;

-- 5. NEW TABLE: public.ai_summaries
-- Caches generated AI summaries to prevent Claude API cost explosions on dashboard page refreshes.
CREATE TABLE IF NOT EXISTS public.ai_summaries (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    client_id text NOT NULL,
    agency_id uuid NOT NULL,
    date_range text NOT NULL,
    summary_data jsonb NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    
    CONSTRAINT ai_summaries_pkey PRIMARY KEY (id),
    CONSTRAINT ai_summaries_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients (id) ON DELETE CASCADE,
    CONSTRAINT ai_summaries_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies (id) ON DELETE CASCADE,
    CONSTRAINT ai_summaries_client_date_range_key UNIQUE (client_id, date_range)
);

-- Enable RLS
ALTER TABLE public.ai_summaries ENABLE ROW LEVEL SECURITY;

-- 6. PERFORMANCE INDEXES: Prevent table scans as database metrics grow
CREATE INDEX IF NOT EXISTS idx_clients_agency_id ON public.clients (agency_id);
CREATE INDEX IF NOT EXISTS idx_profiles_agency_id ON public.profiles (agency_id);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_client_id ON public.campaign_metrics (client_id);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_agency_id ON public.campaign_metrics (agency_id);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_date ON public.campaign_metrics (date);
CREATE INDEX IF NOT EXISTS idx_audit_logs_agency_id ON public.audit_logs (agency_id);

-- ============================================================================
-- 7. DATABASE POLICIES FOR NEW TABLES
-- ============================================================================

-- Policies for public_dashboards
CREATE POLICY "Allow service_role full access" ON public.public_dashboards
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated agency owners access" ON public.public_dashboards
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND (profiles.is_admin = true OR profiles.agency_id = public_dashboards.agency_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND (profiles.is_admin = true OR profiles.agency_id = public_dashboards.agency_id)
        )
    );

-- Policies for ai_summaries
CREATE POLICY "Allow service_role full access" ON public.ai_summaries
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated agency access" ON public.ai_summaries
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND (profiles.is_admin = true OR profiles.agency_id = ai_summaries.agency_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND (profiles.is_admin = true OR profiles.agency_id = ai_summaries.agency_id)
        )
    );
