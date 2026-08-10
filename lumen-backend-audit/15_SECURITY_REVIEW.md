# Lumen Analytics - Technical Security & Performance Review

This document contains a preliminary security audit and performance review of the Lumen Analytics backend. It highlights architectural risks, database performance bottlenecks, and multi-tenant isolation vectors.

---

## 1. Security & Authorization Risks

### A. RLS Bypass in Express Server
- **Finding**: The Express server initiates its connection to Supabase using the `SUPABASE_SERVICE_ROLE_KEY`. This key operates with administrative rights, bypassing Postgres Row-Level Security (RLS) entirely.
- **Impact**: All tenant isolation relies on Express controller code. A single coding error or missing check (e.g. forgetting to verify `currentClient.agency_id === user.agencyId` in a mutation endpoint) would result in a cross-tenant data leak or unauthorized modification.
- **Recommendation**: Transition Express server database calls to route requests using the user's individual JWT context (delegate tokens to the database query level) or implement automated integration tests to verify multi-tenant isolation boundaries on every API route.

### B. White-Label Agency Slug Spoofing
- **Finding**: Public read-only dashboard access is authenticated via the `X-Agency-Slug` header. If a slug exists in the database, the server grants the request read-only access to that agency's context.
- **Impact**: Agency slugs (e.g. `ignite-ppc`, `demo-agency`) are easily guessable. An unauthenticated attacker can spoof the header `X-Agency-Slug: acme-marketing` to download Acme's client list, daily campaigns, and performance metrics.
- **Recommendation**: Secure white-label dashboards using cryptographically secure tokens, hashes, or randomized UUIDs rather than sequential or guessed slugs.

### C. Default Fallback Account Leakage
- **Finding**: If no auth headers or slugs are sent, `requireAuth` defaults to authenticating the requester as a member of "Ignite PPC Group" rather than rejecting the call.
- **Impact**: Errors in token propagation or frontend header synchronization will fail silently and show mock or seeded demo agency data, which may mask configuration or authentication issues.
- **Recommendation**: Remove default public fallbacks on production endpoints; reject unauthenticated calls with a `401 Unauthorized` status.

---

## 2. Database Performance & Scaling Issues

### A. Missing Indexes on Foreign Keys (Critical Performance Bottleneck)
- **Finding**: The schema lacks indexes on critical foreign key columns:
  - `clients.agency_id`
  - `profiles.agency_id`
  - `campaign_metrics.client_id`
  - `campaign_metrics.agency_id`
  - `audit_logs.agency_id`
- **Impact**: As the metrics database grows (thousands of daily rows per client), dashboard loads will suffer severe delays. Postgres will be forced to perform full-table scans to execute the RLS expressions and JOIN statements:
  ```sql
  SELECT * FROM public.clients WHERE agency_id = 'agency-uuid';
  SELECT * FROM public.campaign_metrics WHERE client_id = 'client-id';
  ```
- **Recommendation**: Add index constraints to all foreign keys:
  ```sql
  CREATE INDEX idx_clients_agency_id ON public.clients(agency_id);
  CREATE INDEX idx_profiles_agency_id ON public.profiles(agency_id);
  CREATE INDEX idx_campaign_metrics_client_id ON public.campaign_metrics(client_id);
  CREATE INDEX idx_campaign_metrics_agency_id ON public.campaign_metrics(agency_id);
  ```

---

## 3. API & Data Resiliency Concerns

### A. Uncapped Bulk Ingest Payloads
- **Finding**: The CSV import endpoint `/api/clients/:id/import` loops through an array of records without checking payload size, row counts, or rate limits.
- **Impact**: A malicious actor or massive automated sync could upload millions of rows, causing server memory exhaustion (Out of Memory crash) or database CPU spikes.
- **Recommendation**: Enforce limit checks (e.g., maximum 5,000 rows per batch) and implement rate limiting on bulk import routes.

### B. Fallback Metrics Masking Database Failures
- **Finding**: If database queries fail or return empty, the server automatically serves mock metrics.
- **Impact**: Connection problems to Supabase or query syntax issues will fail silently and display synthesized data. This can mislead operators into thinking the system is healthy when the database is offline or empty.
- **Recommendation**: Differentiate between "genuine empty database" and "connection failure," and surface clear errors to the client instead of masking database exceptions with mock data.
