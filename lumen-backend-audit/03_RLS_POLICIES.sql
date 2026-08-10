-- ============================================================================
-- LUMEN ANALYTICS - ROW LEVEL SECURITY POLICIES EXPORT
-- ============================================================================

-- Ensure Row Level Security is active on all tables
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 1. Policies for Table: public.agencies
-- ============================================================================

-- A. Policy: Allow agency read access
-- Applied to: authenticated users
-- Action: SELECT
-- Condition: Users can read their own agency details (or all if they are a platform admin).
CREATE POLICY "Allow agency read access" ON public.agencies
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND (profiles.is_admin = true OR profiles.agency_id = agencies.id)
        )
    );

-- B. Policy: Allow service_role full access
-- Applied to: service_role
-- Action: ALL
CREATE POLICY "Allow service_role full access" ON public.agencies
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);


-- ============================================================================
-- 2. Policies for Table: public.profiles
-- ============================================================================

-- A. Policy: Allow users read own profile
-- Applied to: authenticated users
-- Action: SELECT
-- Condition: Users can read their own profile row (or all if they are a platform admin).
CREATE POLICY "Allow users read own profile" ON public.profiles
    FOR SELECT
    TO authenticated
    USING (
        id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.is_admin = true
        )
    );

-- B. Policy: Allow service_role full access
-- Applied to: service_role
-- Action: ALL
CREATE POLICY "Allow service_role full access" ON public.profiles
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);


-- ============================================================================
-- 3. Policies for Table: public.clients
-- ============================================================================

-- A. Policy: Allow authenticated clients access
-- Applied to: authenticated users
-- Action: ALL (SELECT, INSERT, UPDATE, DELETE)
-- Condition: Access is permitted if the user is a platform admin, or belongs to the same agency as the client.
CREATE POLICY "Allow authenticated clients access" ON public.clients
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND (profiles.is_admin = true OR profiles.agency_id = clients.agency_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND (profiles.is_admin = true OR profiles.agency_id = clients.agency_id)
        )
    );

-- B. Policy: Allow service_role full access
-- Applied to: service_role
-- Action: ALL
CREATE POLICY "Allow service_role full access" ON public.clients
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);


-- ============================================================================
-- 4. Policies for Table: public.campaign_metrics
-- ============================================================================

-- A. Policy: Allow authenticated campaign_metrics access
-- Applied to: authenticated users
-- Action: ALL (SELECT, INSERT, UPDATE, DELETE)
-- Condition: Access is permitted if the user is a platform admin, or the metric belongs to the user's agency,
--            or if agency_id is NULL, the metric belongs to a client owned by the user's agency.
CREATE POLICY "Allow authenticated campaign_metrics access" ON public.campaign_metrics
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND (
                  profiles.is_admin = true
                  OR profiles.agency_id = campaign_metrics.agency_id
                  OR (
                      campaign_metrics.agency_id IS NULL
                      AND profiles.agency_id = (
                          SELECT clients.agency_id FROM public.clients
                          WHERE clients.id = campaign_metrics.client_id
                      )
                  )
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND (
                  profiles.is_admin = true
                  OR profiles.agency_id = campaign_metrics.agency_id
                  OR (
                      campaign_metrics.agency_id IS NULL
                      AND profiles.agency_id = (
                          SELECT clients.agency_id FROM public.clients
                          WHERE clients.id = campaign_metrics.client_id
                      )
                  )
              )
        )
    );

-- B. Policy: Allow service_role full access
-- Applied to: service_role
-- Action: ALL
CREATE POLICY "Allow service_role full access" ON public.campaign_metrics
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);


-- ============================================================================
-- 5. Policies for Table: public.audit_logs
-- ============================================================================

-- A. Policy: Allow authenticated audit_logs access
-- Applied to: authenticated users
-- Action: ALL
-- Condition: Access is permitted if the user is a platform admin, or belongs to the same agency as the log entry.
CREATE POLICY "Allow authenticated audit_logs access" ON public.audit_logs
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND (profiles.is_admin = true OR profiles.agency_id = audit_logs.agency_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND (profiles.is_admin = true OR profiles.agency_id = audit_logs.agency_id)
        )
    );

-- B. Policy: Allow service_role full access
-- Applied to: service_role
-- Action: ALL
CREATE POLICY "Allow service_role full access" ON public.audit_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);


-- ============================================================================
-- HOW SYSTEM ENFORCES TENANT ISOLATION (Agency A vs. Agency B, Client A vs. Client B)
-- ============================================================================
/*
1. AGENCY ISOLATION:
   - Users are linked to a single agency via `profiles.agency_id`.
   - RLS policies on `clients`, `campaign_metrics`, and `audit_logs` verify that the user's `profiles.agency_id` matches the table row's `agency_id`.
   - A query from a user of Agency A attempting to read or modify a client of Agency B will return 0 rows (for SELECT) or throw permission errors (for mutations) because the EXISTS check fails.

2. CLIENT ISOLATION:
   - While clients within the same agency can see each other's metrics if they belong to the same agency (since this is an agency dashboard),
     cross-agency leakage is prevented because a client is explicitly bound to a single agency via `clients.agency_id`.
   - The campaign metrics policies explicitly fallback to check `clients.agency_id` if the metric row's `agency_id` is null, ensuring no orphaned client metrics leak.
*/
