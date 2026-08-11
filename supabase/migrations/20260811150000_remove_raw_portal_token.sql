-- 1. Add encrypted_token column for AES-256-GCM encrypted token storage at rest
ALTER TABLE public.client_portal_access ADD COLUMN IF NOT EXISTS encrypted_token TEXT;

-- 2. Drop raw_token column to eliminate plaintext credential storage in database
ALTER TABLE public.client_portal_access DROP COLUMN IF EXISTS raw_token;
