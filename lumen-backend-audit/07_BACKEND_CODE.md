# Lumen Analytics - Backend/API Code Audit

The backend server is built using **Node.js, Express, TypeScript, and the Supabase JS SDK**. It is fully contained in [server.ts](file:///c:/Users/pejos/OneDrive/Desktop/Anti/server.ts) with its entry point for Vercel Serverless deployments defined in [api/index.ts](file:///c:/Users/pejos/OneDrive/Desktop/Anti/api/index.ts).

---

## 1. Request Lifecycle & Custom Middlewares

### A. Global Read-Only Protection Middleware
* **Location**: [server.ts:14-52](file:///c:/Users/pejos/OneDrive/Desktop/Anti/server.ts#L14-L52)
* **Purpose**: Prevents write operations on public demonstration workspaces while permitting platform administrators and verified API synchronization integrations to write.
* **Mechanism**:
  1. Captures all write requests (`POST`, `PUT`, `DELETE`, `PATCH`), excluding AI summary requests (`/summary`) or config retrievals (`/config`).
  2. Bypasses lock if the request possesses:
     - **Windsor API Key**: Header `x-api-key` or query parameter `apiKey` matches `process.env.WINDSOR_API_KEY`.
     - **Valid User Token**: Authenticated session user verified via `supabase.auth.getUser()`.
     - **Agency Header**: A valid `x-agency-slug` header that resolves to an existing agency record.
  3. If none match, returns `403 Forbidden` with `"This is a read-only public demonstration. Modifications are disabled."`.

### B. Authentication & Multi-Tenancy Middleware (`requireAuth`)
* **Location**: [server.ts:95-228](file:///c:/Users/pejos/OneDrive/Desktop/Anti/server.ts#L95-L228)
* **Purpose**: Resolves the user context, authentication status, and tenant (Agency) association for subsequent routes.
* **Mechanism**:
  1. **Windsor Key Verification**: If a valid Windsor API key is present, sets `req.user` to a system role `windsor-ai-system` with admin privileges and bypasses token checks.
  2. **Standard User Token Verification**: If a `Bearer <token>` is present in the `Authorization` header, retrieves the user from `supabase.auth.getUser(token)`. It then queries the `profiles` table to find the associated agency. Sets `req.user` with their profile metadata, roles, and agency configurations.
  3. **White-Label Header Verification**: If a header `x-agency-slug` is present, retrieves the corresponding agency, assigning a read-only `public-reader` role associated with that agency.
  4. **Fallback Public Session**: If no credentials match, attempts to load the default agency "Ignite PPC Group" from the database, assigning a read-only `public-demo-user-id` session.
  5. If the lookup fails, returns `401 Unauthorized`.

---

## 2. API Routes Breakdown

### Configuration & Profile
* **`GET /api/config`**: Serves public configuration parameters (`supabaseUrl` and the non-sensitive `supabaseAnonKey`) to the client.
* **`GET /api/profile`**: Returns the evaluated user context of the current session.

### Agency Management
* **`PUT /api/agency/cta`**: Allows agency users to edit their `custom_cta` message in the `agencies` table. Automatically writes a detailed record to the `audit_logs` table.
* **`GET /api/agencies`** *(Admin Only)*: Lists all registered agencies.
* **`POST /api/admin/agencies/onboard`** *(Admin Only)*: Onboards a new agency, creating the agency row, configuring parameters (slug, colors, logo, client limit), inserting initial clients, and logging an audit event.
* **`GET /api/admin/agencies`** *(Admin Only)*: Lists all agencies and calculates the count of clients nested under each agency.
* **`PUT /api/admin/agencies/:id`** *(Admin Only)*: Modifies parameters of an existing agency.
* **`DELETE /api/admin/agencies/:id`** *(Admin Only)*: Deletes an agency and cascades deletion to all client records associated with it.

### Client Management
* **`GET /api/clients`**: Lists clients. Agency users only see clients matching their `agency_id`. Global administrators see all clients.
* **`POST /api/clients`**: Creates a client record under the user's agency. Performs validation, enforces the agency's `client_limit` constraints, inserts the client row, and writes an audit log.
* **`PUT /api/clients/:id`**: Modifies a client's status, budget, domain, or platform choice. Ownership is validated to prevent Agency A from modifying Agency B's clients.
* **`DELETE /api/clients/:id`**: Deletes a client and records an audit log. Verifies ownership before execution.

### Analytics & Data Ingestion
* **`GET /api/analytics/:clientId`**: Retrieves performance metrics. Checks agency access to the client. Queries the `campaign_metrics` table, aggregates metrics by date (combining multiple platforms/campaigns per day), and returns them. If no records are present in the database, falls back to the deterministic mock metrics generator.
* **`POST /api/clients/:id/import`**: Bulk imports campaign metrics from a parsed CSV payload. Validates rows (type, dates, numeric ranges). Deletes existing client records in `campaign_metrics` to avoid duplication, inserts the new set, and logs an audit log.

### System Logs
* **`GET /api/logs`**: Retrieves the `audit_logs` history. Agency users only see audit logs matching their `agency_id`. Admins see all logs.

### AI Reports
* **`POST /api/summary`**: Generates three marketing insights. Validates client access. Invokes the Anthropic Claude API or falls back to the local insights rule-engine.

---

## 3. Database Access Layer
The application acts as a hybrid:
1. **Direct client-to-database calls**: The frontend client uses the `@supabase/supabase-js` client (initialized with `supabaseUrl` and `supabaseAnonKey`) for basic read operations. These operations are sandboxed natively by the database Row-Level Security (RLS) policies.
2. **Server-side database access**: The Express backend acts as an authenticated broker. It is initialized using the `SUPABASE_SERVICE_ROLE_KEY` (service role key), which bypasses all RLS policies. It queries, validates, writes, and deletes rows, enforcing multi-tenant isolation via Express controller logic (`currentClient.agency_id === user.agencyId`).
