-- ============================================================================
-- LUMEN ANALYTICS - AUTOMATED CLIENT REPORTING + EMAIL MIGRATION
-- ============================================================================

-- 1. Add reporting configuration columns to public.clients table
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS reporting_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS report_email text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS report_cc text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS report_day integer NOT NULL DEFAULT 1 CHECK (report_day BETWEEN 0 AND 6); -- 0 = Sunday, 1 = Monday, etc.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS report_time text NOT NULL DEFAULT '08:00';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS report_timezone text NOT NULL DEFAULT 'UTC';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS report_period text NOT NULL DEFAULT 'weekly' CHECK (report_period IN ('weekly', 'monthly'));

-- 2. Create client_report_deliveries table
CREATE TABLE IF NOT EXISTS public.client_report_deliveries (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    agency_id uuid NOT NULL,
    client_id text NOT NULL,
    report_period_start date NOT NULL,
    report_period_end date NOT NULL,
    recipient_email text NOT NULL,
    status text NOT NULL CHECK (status IN ('queued', 'sent', 'failed')),
    sent_at timestamp with time zone,
    error_message text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),

    CONSTRAINT client_report_deliveries_pkey PRIMARY KEY (id),
    CONSTRAINT client_report_deliveries_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies (id) ON DELETE CASCADE,
    CONSTRAINT client_report_deliveries_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients (id) ON DELETE CASCADE,
    CONSTRAINT unique_client_period_email UNIQUE (client_id, report_period_start, report_period_end, recipient_email)
);

-- 3. Enable RLS
ALTER TABLE public.client_report_deliveries ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
CREATE POLICY "Allow service_role full access" ON public.client_report_deliveries
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated agency owners access" ON public.client_report_deliveries
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND (profiles.is_admin = true OR profiles.agency_id = client_report_deliveries.agency_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND (profiles.is_admin = true OR profiles.agency_id = client_report_deliveries.agency_id)
        )
    );

-- 5. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_client_report_deliveries_client_id ON public.client_report_deliveries (client_id);
CREATE INDEX IF NOT EXISTS idx_client_report_deliveries_agency_id ON public.client_report_deliveries (agency_id);
