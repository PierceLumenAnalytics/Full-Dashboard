-- ============================================================================
-- LUMEN ANALYTICS - COMPLETE DATABASE SCHEMA EXPORT (PostgreSQL/Supabase)
-- ============================================================================

-- Enable extensions used in schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. Table: public.agencies
-- ============================================================================
CREATE TABLE public.agencies (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    contact_email text NULL,
    plan_tier text NULL DEFAULT 'Standard'::text,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    custom_cta text NULL,
    logo_url text NULL,
    primary_color text NULL,
    accent_color text NULL,
    client_limit integer NOT NULL DEFAULT 5,
    slug text NOT NULL,
    
    CONSTRAINT agencies_pkey PRIMARY KEY (id),
    CONSTRAINT agencies_slug_key UNIQUE (slug)
);

-- RLS enablement
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. Table: public.profiles
-- ============================================================================
CREATE TABLE public.profiles (
    id uuid NOT NULL,
    agency_id uuid NULL,
    is_admin boolean NOT NULL DEFAULT false,
    email text NULL,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    
    CONSTRAINT profiles_pkey PRIMARY KEY (id),
    CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE,
    CONSTRAINT profiles_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies (id) ON DELETE SET NULL
);

-- RLS enablement
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. Table: public.clients
-- ============================================================================
CREATE TABLE public.clients (
    id text NOT NULL,
    name text NOT NULL,
    domain text NOT NULL,
    platform text NOT NULL,
    monthly_budget numeric NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    agency_id uuid NULL,
    
    CONSTRAINT clients_pkey PRIMARY KEY (id),
    CONSTRAINT clients_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies (id) ON DELETE SET NULL
);

-- RLS enablement
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. Table: public.campaign_metrics
-- ============================================================================
CREATE TABLE public.campaign_metrics (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    client_id text NULL,
    agency_id uuid NULL,
    date date NOT NULL,
    platform text NOT NULL,
    spend numeric NOT NULL,
    impressions bigint NOT NULL,
    clicks bigint NOT NULL,
    conversions bigint NOT NULL,
    conversion_value numeric NOT NULL DEFAULT 0.0,
    created_at timestamp with time zone NULL DEFAULT now(),
    
    CONSTRAINT campaign_metrics_pkey PRIMARY KEY (id),
    CONSTRAINT campaign_metrics_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients (id) ON DELETE CASCADE,
    CONSTRAINT campaign_metrics_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies (id) ON DELETE SET NULL
);

-- RLS enablement
ALTER TABLE public.campaign_metrics ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 5. Table: public.audit_logs
-- ============================================================================
CREATE TABLE public.audit_logs (
    id text NOT NULL,
    timestamp timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    action text NOT NULL,
    entity text NOT NULL,
    details text NOT NULL,
    "user" text NOT NULL,
    agency_id uuid NULL,
    
    CONSTRAINT audit_logs_pkey PRIMARY KEY (id),
    CONSTRAINT audit_logs_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies (id) ON DELETE SET NULL
);

-- RLS enablement
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6. Indexes defined in public schema
-- ============================================================================
-- (Note: No foreign key indexes exist in the source database - highlighted in Security Review)
CREATE UNIQUE INDEX agencies_pkey ON public.agencies USING btree (id);
CREATE UNIQUE INDEX agencies_slug_key ON public.agencies USING btree (slug);
CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);
CREATE UNIQUE INDEX clients_pkey ON public.clients USING btree (id);
CREATE UNIQUE INDEX campaign_metrics_pkey ON public.campaign_metrics USING btree (id);
CREATE UNIQUE INDEX audit_logs_pkey ON public.audit_logs USING btree (id);
