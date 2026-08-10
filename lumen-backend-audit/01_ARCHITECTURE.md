# Lumen Analytics - Backend Architecture Summary

This document provides a technical overview of the Lumen Analytics application architecture. It describes how the components of the frontend, backend server, database, authentication system, and external integrations communicate and function as a multi-tenant business intelligence dashboard for advertising performance.

---

## 1. What the Application Does
Lumen Analytics is a multi-tenant White-Label Marketing Analytics Dashboard. It allows advertising agencies to onboard their clients, connect ad platforms, track daily marketing performance metrics (spend, impressions, clicks, conversions), and generate AI-driven performance summaries for their clients. It features custom branding (logo, colors, custom call-to-action text) dynamically tailored per agency.

---

## 2. Frontend-Backend Communication
The application is structured as a Single Page Application (SPA) built using React. 
- **Development**: During development, the frontend is served via Vite's dev server, and Express API endpoints are mounted via Vite middleware.
- **Production**: In production, the backend is a Node/Express application served from a compiled JS bundle (`dist/server.cjs`). It serves the static built assets of the React frontend from the `dist/` directory, routing any fallback requests to `index.html` (SPA routing).
- **API Communication**: The client communicates with the server via standard HTTP requests (`fetch` API). API requests are intercepted client-side to attach authentication headers (Bearer token) and tenant identification headers (`X-Agency-Slug`).

---

## 3. How Supabase is Used
Supabase serves as the backend database, authentication provider, and management plane:
- **Postgres Database**: Relational tables (`agencies`, `profiles`, `clients`, `campaign_metrics`, `audit_logs`) store agency configuration, user relationships, clients, performance metrics, and compliance/audit logging.
- **Supabase Auth**: Manages sign-up, login, token issuance, and password recovery.
- **Row-Level Security (RLS)**: Enforces tenant isolation natively at the database level by restricting which rows in the tables are visible or modifiable based on the authenticated user's credentials and agency association.

---

## 4. How Authentication Works
Authentication is handled via Supabase GoTrue Auth:
1. Users log in through the frontend client by sending their email and password to Supabase.
2. Supabase issues a JSON Web Token (JWT) representing the user session.
3. The frontend stores this token and includes it in the HTTP headers (`Authorization: Bearer <access_token>`) for all requests sent to the custom Express backend.
4. The Express backend verifies this token on protected routes by calling `supabase.auth.getUser(token)`. If verified, the server fetches the user's role and agency context from the `public.profiles` database table and attaches it to the request context.
5. In addition to token-based user auth, the system supports:
   - **Windsor.ai Sync Key**: Server-to-server integration bypasses standard token checks using a shared header/query key (`x-api-key` or `apiKey`).
   - **White-Label Public Mode**: Public visitors viewing an agency dashboard do not authenticate with user credentials; instead, their request is routed based on the custom domain/slug header (`X-Agency-Slug`), granting read-only access to that specific agency's clients and metrics.

---

## 5. How Agencies and Clients are Modeled
The multi-tenant hierarchy is modeled as follows:
- **Agencies (`public.agencies`)**: Represent the top-level tenant. Each agency has unique branding attributes (colors, logos, custom CTAs) and a distinct subdomain/slug.
- **Profiles (`public.profiles`)**: Represent the users. Each profile has a one-to-one link to a Supabase Auth User ID and is associated with a single `agency_id`. Users can also be marked as platform admins (`is_admin: true`), bypassing agency constraints.
- **Clients (`public.clients`)**: Belong to an agency via `agency_id`. A client represents a business entity with a name, domain, ad platform choice, and monthly budget.
- **Campaign Metrics (`public.campaign_metrics`)**: Detailed performance metrics representing daily performance. They are linked to both a `client_id` and an `agency_id`.

---

## 6. How Campaign Data Enters the System
Campaign performance metrics can enter the system in three ways:
1. **Manual CSV Upload**: Agency operators upload historical daily data via a CSV importer on the frontend. The file is parsed in the browser and sent to the server endpoint `/api/clients/:id/import`.
2. **Windsor.ai Integration (Server-to-Server Sync)**: An external ETL/data pipeline (Windsor.ai) pushes synchronized campaign metrics from Google Ads, Meta Ads, and TikTok Ads directly to the API endpoints using the Windsor API Key bypass.
3. **Mock Data Generation Sandbox**: If no imported database metrics are present for a given client, the backend dynamically generates deterministic mock daily performance charts (`generateMockMetrics`) based on the client's monthly budget and ID to present a fully populated, believable dashboard.

---

## 7. How Data is Updated
- CSV uploads delete existing metrics for the selected client and perform a bulk insert of new records.
- API endpoints allow updating client budgets, agency custom CTAs, and onboarding brand new agencies.
- Audit logs are inserted synchronously into the `audit_logs` table upon any creation, update, or deletion of client accounts and settings to maintain compliance.

---

## 8. How AI Summaries are Generated
Daily campaign summaries are generated dynamically via the `/api/summary` endpoint:
1. The client sends a request containing the `clientId`, `clientName`, and a summary of performance metrics (spend, conversions, CTR, CPC).
2. The server checks the caller's authorization to ensure they own or manage that client.
3. If configured, the server calls the Anthropic Claude API (`https://api.anthropic.com/v1/messages` using `sonnet-5`) with a specialized system prompt that instructs Claude to analyze the numbers and return exactly three structured strategic insights (labeled SCALE, WATCH, or OPPORTUNITY) as a JSON object.
4. If the Claude API key is absent, or if the API call fails or times out, the server falls back gracefully to a local rule-based insights sandbox generator that computes realistic and tailored structured insights dynamically from the metric values.

---

## 9. How Dashboards Retrieve Data
The frontend React dashboard makes standard requests to `/api/analytics/:clientId`. The Express server:
1. Validates user permission to access the client.
2. Checks if there are imported metrics in the `campaign_metrics` table.
3. If metrics exist, aggregates them by date (collating multiple platforms/campaigns per day) and returns them sorted chronologically.
4. If no database metrics exist, calls the deterministic `generateMockMetrics` utility to return synthesized data.

---

## 10. How Tenant Isolation Works
Tenant isolation is enforced in two parallel layers:
- **Application Middleware (Express)**: Every request checked by `requireAuth` associates the client's session user with a specific `agencyId` (unless they are a global `is_admin`). For client and analytics requests, the Express route verifies that the target `client.agency_id` matches the user's `agencyId` before serving or mutating any data.
- **Database Policies (Supabase RLS)**: Every table has Row-Level Security enabled. Queries initiated from the client-side Supabase SDK are checked by Postgres policies. For example, a select query on `clients` is only permitted if the profile of the caller (`auth.uid()`) has `is_admin = true` or `profiles.agency_id = clients.agency_id`.
- **Foreign Key Sync Trigger**: A database trigger `trg_backfill_campaign_metrics_agency_id` executes before insert or update on `campaign_metrics`. It ensures that if a record is inserted without a direct `agency_id`, it automatically fetches the correct `agency_id` from the parent `clients` record, guaranteeing the data is correctly sandboxed.
