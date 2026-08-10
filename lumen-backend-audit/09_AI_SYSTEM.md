# Lumen Analytics - AI Summary System Audit

Lumen Analytics incorporates a server-side AI Daily Summary generator that translates raw performance metrics into strategic marketing insights.

---

## 1. System Integration: `/api/summary`

The AI generation is initiated by a client request to `POST /api/summary` with the following parameters:
- `clientId`: ID of the target client.
- `clientName`: Display name of the client.
- `metricsSummary`: Performance indicators aggregate (spend, conversions, CTR, clicks, CPC, etc.).
- `tone` *(Optional)*: Tone configuration (`"Executive"`, `"Casual"`, `"Data-Driven"`, default is `"Executive"`).

The endpoint resolves ownership, executes the API request to Anthropic Claude, and returns structured insights. All API keys remain on the server, and the client receives only the sanitized final JSON output.

---

## 2. LLM Prompt Engineering

When a valid `ANTHROPIC_API_KEY` is present, the server communicates with the Claude API.

### A. API Target
- **URL**: `https://api.anthropic.com/v1/messages`
- **Model**: `claude-sonnet-5`
- **Headers**:
  - `x-api-key`: `[REDACTED]`
  - `anthropic-version`: `2023-06-01`

### B. System Prompt
The system prompt establishes the persona and enforces schema compliance:
```text
You are an elite digital marketing performance analyst and executive reporting expert.
You translate complex paid advertising performance metrics into a structured JSON object containing three strategic marketing insights.
IMPORTANT: You MUST return ONLY a valid JSON object matching the following TypeScript interface. Do NOT write any conversational prose, markdown blocks (other than wrapping the JSON in a json block if required), or extra characters.

Interface:
interface Response {
  insights: Array<{
    type: "scale" | "watch" | "opportunity" | "alert";
    label: "SCALE" | "WATCH" | "OPPORTUNITY" | "ALERT";
    number: string; // e.g. "01", "02", "03"
    what: string;   // a clear summary of what happened
    why: string;    // the underlying cause or reason
    action: string; // recommended action
  }>;
}

IMPORTANT: Only reference ad channels and platforms that have data in the metrics provided to you. Never mention Google Ads, Meta Ads, TikTok Ads, or any specific platform unless that platform's data is explicitly included in the metrics summary.
```

### C. User Prompt
Constructed dynamically based on client and metric aggregates:
```text
Please analyze the performance metrics over the last 30 days for our client "{clientName}":
Metrics summary:
- Total Spend: ${totalSpend}
- Total Conversions: {totalConversions}
- Avg Conversion Rate: {avgConvRate}%
- Total Clicks: {totalClicks}
- Avg Click-Through Rate: {avgCtr}%
- Cost per Conversion: ${costPerConversion}

Please write three structured insights matching the JSON schema. Use tone: {tone}.
Make the insights feel highly strategic, calm, and tailored to "{clientName}".
```

---

## 3. Fallback Dynamic Insights Engine

If no Anthropic API key is configured or the API request fails (due to rate limits, timeouts, or network issues), the backend automatically and gracefully drops back to a local, rules-based engine:

### A. Generator Method
`generateDynamicFallbackInsights(clientName, metricsSummary)`

### B. Logic Rules
- **Insight 01 (SCALE)**: Encourages budget scaling. Calculates spend and conversions.
  - *Recommendation*: "Increase daily budget by 10-15% on best performing asset."
- **Insight 02 (WATCH)**: Pinpoints conversion rate or cost per acquisition inefficiencies.
  - *Recommendation*: "Review search query match and exclude low-intent variations."
- **Insight 03 (OPPORTUNITY)**: Identifies strong click engagement or traffic interest.
  - *Recommendation*: "Deploy new creative variations of current top-performing copy."
- **Tone Adjustments**: Dynamically prefixes output strings based on the requested tone:
  - *Casual*: "Hey, quick update on..."
  - *Data-Driven*: "Analyzing key performative indicators..."
  - *Executive*: "Executive overview for..."
