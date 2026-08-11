-- ============================================================================
-- LUMEN ANALYTICS - DEMO DATA SYSTEM UPGRADE SCHEMA MIGRATION
-- ============================================================================

-- 1. Add is_demo column to agencies table to cleanly identify the demo tenant
ALTER TABLE public.agencies ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- 2. Add campaign_name and revenue columns to campaign_metrics table
-- Default campaign_name to 'General' to accommodate existing data
ALTER TABLE public.campaign_metrics ADD COLUMN IF NOT EXISTS campaign_name text NOT NULL DEFAULT 'General';
ALTER TABLE public.campaign_metrics ADD COLUMN IF NOT EXISTS revenue numeric NOT NULL DEFAULT 0.0;

-- 3. Drop old daily platform-level unique constraint
ALTER TABLE public.campaign_metrics DROP CONSTRAINT IF EXISTS campaign_metrics_client_date_platform_key;

-- 4. Create new unique constraint including campaign_name to support multiple campaign entries per day
ALTER TABLE public.campaign_metrics ADD CONSTRAINT campaign_metrics_client_date_platform_campaign_key UNIQUE (client_id, date, platform, campaign_name);
