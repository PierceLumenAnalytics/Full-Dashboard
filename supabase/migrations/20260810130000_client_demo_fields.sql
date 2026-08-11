-- ============================================================================
-- LUMEN ANALYTICS - CLIENT DEMO FIELDS MIGRATION
-- ============================================================================

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS target_cpl numeric;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS brand_color text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS industry text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS primary_goal text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS regional_distribution jsonb;
