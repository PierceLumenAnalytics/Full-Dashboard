-- ============================================================================
-- LUMEN ANALYTICS - CUSTOM DATABASE TRIGGERS
-- ============================================================================

-- Trigger: trg_backfill_campaign_metrics_agency_id
-- Table: public.campaign_metrics
-- Execution: BEFORE INSERT OR UPDATE FOR EACH ROW
-- Function called: backfill_campaign_metrics_agency_id()
-- Description:
--   Automatically executes before any insertion or modification of a row in 
--   the public.campaign_metrics table to verify and populate the agency_id,
--   guaranteeing correct tenant isolation at the record level.

DROP TRIGGER IF EXISTS trg_backfill_campaign_metrics_agency_id ON public.campaign_metrics;

CREATE TRIGGER trg_backfill_campaign_metrics_agency_id
    BEFORE INSERT OR UPDATE
    ON public.campaign_metrics
    FOR EACH ROW
    EXECUTE FUNCTION public.backfill_campaign_metrics_agency_id();
