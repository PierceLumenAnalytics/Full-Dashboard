-- ============================================================================
-- LUMEN ANALYTICS - AGENCY ADMIN FIELDS MIGRATION
-- ============================================================================

ALTER TABLE public.agencies ADD COLUMN IF NOT EXISTS timezone text;
ALTER TABLE public.agencies ADD COLUMN IF NOT EXISTS industry text;

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS primary_market text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS logo_url text;
