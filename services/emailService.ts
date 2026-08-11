// Services: Email delivery and HTML reporting template generator
import { ClientReportSummary } from "./clientReport.js";

interface SendEmailParams {
  to: string;
  cc?: string;
  subject: string;
  html: string;
  agencyName: string;
}

export async function sendEmail({
  to,
  cc,
  subject,
  html,
  agencyName
}: SendEmailParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const provider = process.env.EMAIL_PROVIDER || "console";
  const apiKey = process.env.EMAIL_API_KEY;
  const fromEmail = process.env.EMAIL_FROM || "reports@lumenanalytics.co";
  const fromName = process.env.EMAIL_FROM_NAME || agencyName;

  console.log(`[EmailService] Dispatching email via provider: ${provider} (To: ${to}, CC: ${cc || "none"})`);

  if (provider === "resend") {
    if (!apiKey) {
      return { success: false, error: "Missing Resend API Key in environment variables (EMAIL_API_KEY)." };
    }
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: to.split(",").map(e => e.trim()),
          cc: cc ? cc.split(",").map(e => e.trim()) : undefined,
          subject: subject,
          html: html
        })
      });

      if (response.ok) {
        const data = await response.json() as any;
        return { success: true, messageId: data.id };
      } else {
        const errText = await response.text();
        return { success: false, error: `Resend API returned status ${response.status}: ${errText}` };
      }
    } catch (err: any) {
      return { success: false, error: "Resend fetch exception: " + err.message };
    }
  }

  if (provider === "sendgrid") {
    if (!apiKey) {
      return { success: false, error: "Missing SendGrid API Key in environment variables (EMAIL_API_KEY)." };
    }
    try {
      const personalizations: any[] = [{
        to: to.split(",").map(e => ({ email: e.trim() })),
        cc: cc ? cc.split(",").map(e => ({ email: e.trim() })) : undefined
      }];

      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          personalizations,
          from: { email: fromEmail, name: fromName },
          subject: subject,
          content: [{ type: "text/html", value: html }]
        })
      });

      if (response.ok || response.status === 202) {
        return { success: true };
      } else {
        const errText = await response.text();
        return { success: false, error: `SendGrid API returned status ${response.status}: ${errText}` };
      }
    } catch (err: any) {
      return { success: false, error: "SendGrid fetch exception: " + err.message };
    }
  }

  // Fallback: Console provider
  console.log("==========================================");
  console.log(`[CONSOLE EMAIL TRANSMISSION]`);
  console.log(`From:    ${fromName} <${fromEmail}>`);
  console.log(`To:      ${to}`);
  console.log(`CC:      ${cc || "(none)"}`);
  console.log(`Subject: ${subject}`);
  console.log("------------------------------------------");
  console.log("HTML length:", html.length, "characters");
  console.log("==========================================");

  return { success: true, messageId: "console-mock-id-" + Date.now() };
}

// Generate the fully branded weekly email HTML template
export function renderReportHtml(report: any): string {
  const {
    clientName,
    agencyName,
    logoUrl,
    primaryColor,
    accentColor,
    portalUrl,
    period,
    metrics,
    comparison,
    channels,
    campaigns,
    summary
  } = report;

  const formatDateStr = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  };

  const periodText = `${formatDateStr(period.startDate)} – ${formatDateStr(period.endDate)}`;

  // CSS variables replacement since some email clients filter custom properties, we use inline colors directly
  const themeAccent = primaryColor;
  const themeContrast = report.metrics.cpl > 0 ? getContrastColorHex(themeAccent) : "#080808";

  // Comparison helper
  const renderComparisonValue = (val: number | null, lowerIsBetter = false) => {
    if (val === null || val === undefined) {
      return `<span style="color: #6F6B63; font-size: 11px;">No prior data</span>`;
    }
    const sign = val >= 0 ? "+" : "";
    const isImproved = lowerIsBetter ? val < 0 : val >= 0;
    const color = isImproved ? "#6FAF7B" : "#C96B63";
    const arrow = val >= 0 ? "▲" : "▼";
    return `<span style="color: ${color}; font-weight: bold; font-size: 12px;">${arrow} ${sign}${val.toFixed(1)}%</span>`;
  };

  // Channel rows
  const channelRows = channels.map((ch: any) => `
    <tr>
      <td style="padding: 10px 8px; border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: 600; color: #F4F1E8; font-size: 12px;">${ch.platform}</td>
      <td style="padding: 10px 8px; border-bottom: 1px solid rgba(255,255,255,0.06); text-align: right; color: #A7A39A; font-family: monospace; font-size: 12px;">$${ch.spend.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
      <td style="padding: 10px 8px; border-bottom: 1px solid rgba(255,255,255,0.06); text-align: right; color: #F4F1E8; font-weight: 500; font-size: 12px;">${ch.conversions.toLocaleString()}</td>
      <td style="padding: 10px 8px; border-bottom: 1px solid rgba(255,255,255,0.06); text-align: right; color: #A7A39A; font-family: monospace; font-size: 12px;">$${ch.cpl.toFixed(2)}</td>
    </tr>
  `).join("");

  // Campaign rows
  const campaignRows = campaigns.slice(0, 5).map((c: any) => `
    <tr>
      <td style="padding: 10px 8px; border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: 500; color: #F4F1E8; font-size: 12px; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${c.campaign_name}</td>
      <td style="padding: 10px 8px; border-bottom: 1px solid rgba(255,255,255,0.06); text-align: right; color: #A7A39A; font-family: monospace; font-size: 12px;">$${c.spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
      <td style="padding: 10px 8px; border-bottom: 1px solid rgba(255,255,255,0.06); text-align: right; color: #F4F1E8; font-weight: 500; font-size: 12px;">${c.conversions.toLocaleString()}</td>
      <td style="padding: 10px 8px; border-bottom: 1px solid rgba(255,255,255,0.06); text-align: right; color: #A7A39A; font-family: monospace; font-size: 12px;">$${c.cpl.toFixed(2)}</td>
    </tr>
  `).join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${clientName} Weekly Performance Report</title>
</head>
<body style="margin: 0; padding: 0; background-color: #080808; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #F4F1E8; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #080808; padding: 24px 12px;">
    <tr>
      <td align="center">
        <!-- Main Container -->
        <table width="100%" max-width="600" style="max-width: 600px; width: 100%; border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 12px; background-color: #101010; overflow: hidden; border-spacing: 0; text-align: left;">
          
          <!-- Header Banner -->
          <tr>
            <td style="padding: 24px 32px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); background-color: #121212;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    ${logoUrl ? `
                      <img src="${logoUrl}" alt="${agencyName}" height="32" style="height: 32px; max-width: 160px; object-contain: contain; margin-bottom: 8px;" />
                    ` : `
                      <div style="display: inline-block; padding: 6px 12px; background-color: rgba(255,255,255,0.02); border: 1px solid ${themeAccent}33; border-radius: 6px; color: ${themeAccent}; font-weight: bold; font-size: 14px; letter-spacing: 0.5px; margin-bottom: 8px;">
                        ${agencyName.substring(0, 2).toUpperCase()}
                      </div>
                    `}
                    <h2 style="margin: 0; font-size: 12px; font-weight: 700; color: ${themeAccent}; text-transform: uppercase; letter-spacing: 1.5px; font-family: monospace;">Performance Report</h2>
                    <h1 style="margin: 4px 0 0 0; font-size: 18px; font-weight: 700; color: #F4F1E8; letter-spacing: -0.3px;">${clientName}</h1>
                    <span style="font-size: 11px; color: #6F6B63; display: block; margin-top: 4px;">Reporting Period: <strong>${periodText}</strong></span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px;">

              <!-- PERFORMANCE KPI CARDS -->
              <h3 style="margin: 0 0 16px 0; font-size: 11px; font-weight: 700; color: #A7A39A; text-transform: uppercase; letter-spacing: 1px; font-family: monospace;">Performance Highlights</h3>
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 32px;">
                <tr>
                  <td width="48%" style="padding: 16px; background-color: #141414; border: 1px solid rgba(255,255,255,0.04); border-radius: 8px; vertical-align: top; margin-bottom: 12px;">
                    <span style="font-size: 10px; color: #A7A39A; text-transform: uppercase; tracking-wider: 1px; display: block;">Ad Spend</span>
                    <strong style="font-size: 20px; color: #F4F1E8; font-family: monospace; display: block; margin: 4px 0;">$${metrics.spend.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                    ${renderComparisonValue(comparison.spend)}
                  </td>
                  <td width="4%"></td>
                  <td width="48%" style="padding: 16px; background-color: #141414; border: 1px solid rgba(255,255,255,0.04); border-radius: 8px; vertical-align: top; margin-bottom: 12px;">
                    <span style="font-size: 10px; color: #A7A39A; text-transform: uppercase; tracking-wider: 1px; display: block;">Leads Generated</span>
                    <strong style="font-size: 20px; color: #F4F1E8; display: block; margin: 4px 0;">${metrics.conversions.toLocaleString()}</strong>
                    ${renderComparisonValue(comparison.conversions)}
                  </td>
                </tr>
                <tr style="height: 12px;"><td></td></tr>
                <tr>
                  <td width="48%" style="padding: 16px; background-color: #141414; border: 1px solid rgba(255,255,255,0.04); border-radius: 8px; vertical-align: top;">
                    <span style="font-size: 10px; color: #A7A39A; text-transform: uppercase; tracking-wider: 1px; display: block;">Cost Per Lead</span>
                    <strong style="font-size: 20px; color: #F4F1E8; font-family: monospace; display: block; margin: 4px 0;">$${metrics.cpl.toFixed(2)}</strong>
                    ${renderComparisonValue(comparison.cpl, true)}
                  </td>
                  <td width="4%"></td>
                  <td width="48%" style="padding: 16px; background-color: #141414; border: 1px solid rgba(255,255,255,0.04); border-radius: 8px; vertical-align: top;">
                    <span style="font-size: 10px; color: #A7A39A; text-transform: uppercase; tracking-wider: 1px; display: block;">Return on Ad Spend</span>
                    <strong style="font-size: 20px; color: #F4F1E8; display: block; margin: 4px 0;">${metrics.roas > 0 ? metrics.roas.toFixed(2) + 'x' : 'N/A'}</strong>
                    ${renderComparisonValue(comparison.roas)}
                  </td>
                </tr>
              </table>

              <!-- AI STRATEGIC SUMMARY -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 32px; background-color: #141414; border: 1px solid ${themeAccent}22; border-left: 3px solid ${themeAccent}; border-radius: 4px 8px 8px 4px;">
                <tr>
                  <td style="padding: 20px 24px;">
                    <h4 style="margin: 0 0 10px 0; font-size: 10px; font-weight: 700; color: ${themeAccent}; text-transform: uppercase; letter-spacing: 1.5px; font-family: monospace;">AI Performance Summary</h4>
                    <p style="margin: 0 0 16px 0; font-size: 13px; line-height: 1.6; color: #F4F1E8;">${summary.executiveSummary}</p>
                    
                    <table width="100%" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding-bottom: 8px; font-size: 12px; line-height: 1.5; color: #A7A39A;">
                          <strong style="color: #6FAF7B;">✔ What Improved:</strong> ${summary.whatImproved}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom: 8px; font-size: 12px; line-height: 1.5; color: #A7A39A;">
                          <strong style="color: #C96B63;">⚠ What Declined:</strong> ${summary.whatDeclined}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom: 8px; font-size: 12px; line-height: 1.5; color: #A7A39A;">
                          <strong>🔎 Campaigns Observation:</strong> ${summary.campaignObservations}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.04); font-size: 12px; line-height: 1.5; color: #F4F1E8;">
                          <strong style="color: ${themeAccent};">💡 Recommended Next Step:</strong> ${summary.recommendedNextStep}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- PLATFORM CHANNEL PERFORMANCE -->
              ${channelRows.length > 0 ? `
                <h3 style="margin: 0 0 12px 0; font-size: 11px; font-weight: 700; color: #A7A39A; text-transform: uppercase; letter-spacing: 1px; font-family: monospace;">Channel Breakdown</h3>
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 32px; border-collapse: collapse;">
                  <thead>
                    <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
                      <th align="left" style="padding: 8px; font-size: 10px; text-transform: uppercase; color: #6F6B63; font-family: monospace;">Platform</th>
                      <th align="right" style="padding: 8px; font-size: 10px; text-transform: uppercase; color: #6F6B63; font-family: monospace;">Spend</th>
                      <th align="right" style="padding: 8px; font-size: 10px; text-transform: uppercase; color: #6F6B63; font-family: monospace;">Leads</th>
                      <th align="right" style="padding: 8px; font-size: 10px; text-transform: uppercase; color: #6F6B63; font-family: monospace;">CPL</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${channelRows}
                  </tbody>
                </table>
              ` : ""}

              <!-- CAMPAIGN INSIGHTS -->
              ${campaignRows.length > 0 ? `
                <h3 style="margin: 0 0 12px 0; font-size: 11px; font-weight: 700; color: #A7A39A; text-transform: uppercase; letter-spacing: 1px; font-family: monospace;">Campaign Performance</h3>
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 32px; border-collapse: collapse;">
                  <thead>
                    <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
                      <th align="left" style="padding: 8px; font-size: 10px; text-transform: uppercase; color: #6F6B63; font-family: monospace;">Campaign</th>
                      <th align="right" style="padding: 8px; font-size: 10px; text-transform: uppercase; color: #6F6B63; font-family: monospace;">Spend</th>
                      <th align="right" style="padding: 8px; font-size: 10px; text-transform: uppercase; color: #6F6B63; font-family: monospace;">Leads</th>
                      <th align="right" style="padding: 8px; font-size: 10px; text-transform: uppercase; color: #6F6B63; font-family: monospace;">CPL</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${campaignRows}
                  </tbody>
                </table>
              ` : ""}

              <!-- CALL TO ACTION / VIEW FULL DASHBOARD -->
              ${portalUrl ? `
                <table width="100%" border="0" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="center" style="padding: 8px 0 0 0;">
                      <a href="${portalUrl}" target="_blank" style="display: inline-block; padding: 12px 28px; background-color: ${themeAccent}; color: ${themeContrast}; text-decoration: none; font-weight: bold; border-radius: 6px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; transition: background-color 150ms ease-in-out;">
                        View Full Interactive Report
                      </a>
                    </td>
                  </tr>
                </table>
              ` : ""}

            </td>
          </tr>

          <!-- Footer Footnote -->
          <tr>
            <td align="center" style="padding: 24px 32px; border-top: 1px solid rgba(255, 255, 255, 0.06); background-color: #121212;">
              <span style="font-size: 10px; color: #6F6B63; display: block;">Prepared by <strong>${agencyName}</strong></span>
              <span style="font-size: 9px; color: #444444; display: block; margin-top: 4px;">Powered by Lumen Analytics • White-Label Performance Reporting</span>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

// Relative luminance calculator (copied from themeHelpers.ts logic to be Node server runtime compatible)
function getContrastColorHex(hexColor: string): string {
  let hex = hexColor.replace("#", "");
  if (hex.length === 3) {
    hex = hex.split("").map(c => c + c).join("");
  }
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#080808" : "#FFFFFF";
}
