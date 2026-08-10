-- ============================================================================
-- LUMEN ANALYTICS - CUSTOM DATABASE FUNCTIONS DEFINITIONS
-- ============================================================================

-- Function: public.backfill_campaign_metrics_agency_id()
-- Language: PL/pgSQL
-- Security: DEFINER (Executes with privileges of the function creator, bypassing RLS to fetch parent details)
-- Description:
--   When inserting or updating campaign metrics, if the incoming row does not 
--   have an agency_id set but does have a client_id set, this function automatically 
--   looks up the correct agency_id from the public.clients table and populates the field. 
--   This ensures that metrics remain strictly associated with the correct tenant.

CREATE OR REPLACE FUNCTION public.backfill_campaign_metrics_agency_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Check if the agency_id is omitted and a client relation is provided
  IF NEW.agency_id IS NULL AND NEW.client_id IS NOT NULL THEN
    SELECT agency_id INTO NEW.agency_id 
    FROM public.clients 
    WHERE id = NEW.client_id;
  END IF;
  
  RETURN NEW;
END;
$function$;
