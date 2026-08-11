-- 1. Create client_portal_access table
CREATE TABLE IF NOT EXISTS public.client_portal_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
    raw_token TEXT,
    token_hash TEXT NOT NULL UNIQUE,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_rotated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT client_portal_access_client_id_key UNIQUE (client_id)
);

-- 2. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_client_portal_access_token_hash ON public.client_portal_access (token_hash);
CREATE INDEX IF NOT EXISTS idx_client_portal_access_client_id ON public.client_portal_access (client_id);
CREATE INDEX IF NOT EXISTS idx_client_portal_access_agency_id ON public.client_portal_access (agency_id);

-- 3. Enable RLS
ALTER TABLE public.client_portal_access ENABLE ROW LEVEL SECURITY;

-- 4. Policies
CREATE POLICY "Allow service_role full access" ON public.client_portal_access
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated agency owners access" ON public.client_portal_access
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND (profiles.is_admin = true OR profiles.agency_id = client_portal_access.agency_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND (profiles.is_admin = true OR profiles.agency_id = client_portal_access.agency_id)
        )
    );
