# Lumen Analytics - Campaign Data Pipeline Audit

This document details the methods by which marketing campaign performance data enters, is validated by, and is stored in the Lumen Analytics system.

---

## 1. CSV Data Ingestion Pipeline

### A. Endpoint
`POST /api/clients/:id/import`

### B. Ingestion Flow
1. **Client Ownership Check**: The server identifies the client by ID and verifies that the calling user belongs to the same agency (or is a platform administrator).
2. **Payload Parsing**: The endpoint expects a JSON payload containing an array of records under the `rows` key.
3. **Record Validation**: Every row is processed and validated:
   - **Date**: Must match `YYYY-MM-DD` format.
   - **Platform**: Must be a string.
   - **Spend**: Must be a valid non-negative number.
   - **Impressions**: Must be a valid non-negative integer.
   - **Clicks**: Must be a valid non-negative integer.
   - **Conversions**: Must be a valid non-negative integer.
   Any validation failure aborts the execution and returns `400 Bad Request` specifying the failing row index.
4. **Duplicate Prevention (Overwrite Method)**: Before inserting the new records, the server executes a deletion query:
   ```typescript
   await supabase.from("campaign_metrics").delete().eq("client_id", id);
   ```
   This wipes any existing historical metrics for the client, avoiding primary key or unique index conflicts and preventing duplicate data points for the same date.
5. **Bulk Insert**: The server performs a bulk database insert of the validated rows into the `campaign_metrics` table.
6. **Audit Trail**: Adds a record to the `audit_logs` table detailing the actor, target client, and the count of imported records.

---

## 2. Windsor.ai Sync Integration

The system supports server-to-server synchronization with Windsor.ai, a marketing data integration provider.

### A. Authentication
Windsor.ai requests bypass standard user token authentication. The backend checks:
- Query parameter: `apiKey`
- HTTP Header: `x-api-key`

If the key matches `process.env.WINDSOR_API_KEY` (defaulting to `"windsor_secret_123"` if not configured), the request is authorized under the system identity `windsor-ai-system`.

### B. Execution Privileges
The system identity `windsor-ai-system` is treated as a global write-capable operator (`isAdmin: true`). This allows Windsor's ETL pipelines to push bulk campaign metric updates directly into the `/api/clients/:id/import` endpoint.

---

## 3. Fallback/Mock Metrics Generator

To guarantee a fully populated dashboard environment when no data has been imported into the database, the server incorporates a deterministic mock metrics generator.

### A. Activation Condition
In the `/api/analytics/:clientId` endpoint, if the database query to `campaign_metrics` returns zero records, the server automatically invokes `generateMockMetrics`.

### B. Generator Mechanics
- **Deterministic Seeding**: Uses a Linear Congruential Generator (LCG) seeded with the unique client ID string. This ensures that the generated charts remain identical across dashboard refreshes for the same client, while presenting different values across clients.
- **Budget Scaling**: Scales daily performance metrics based on the client's configured `monthly_budget` (Daily spend = `monthly_budget / 30`).
- **Statistical Modeling**:
  - Average Cost Per Click (CPC) modeled around $1.20 - $1.80.
  - Average Click-Through Rate (CTR) modeled around 2.0% - 3.0%.
  - Average Conversion Rate modeled around 2.5% - 4.5%.
  - BELIEVABLE ROAS targeted between 3.2x and 7.5x.
  - Incorporates day-of-week multipliers (weekends reduced by 25%, weekdays boosted by 15%) and random daily volatility (±15%) for realism.
- **Span**: Outputs exactly 120 days of historical data to support 7-day, 30-day, and 90-day chart filters.

---

## 4. Error Handling and Resiliency

- **Database Errors**: All queries to Supabase are wrapped in `try/catch` blocks. If the SDK returns an error message, the server logs the error, aborts transaction steps, and returns `500 Internal Server Error`.
- **Bypass Validation**: There is no automatic retry logic implemented on the backend Express server. If an API call fails during ingestion, the client (or Windsor.ai pipeline) must detect the failure status and re-initiate the push.
