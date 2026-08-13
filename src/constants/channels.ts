export interface ChannelCatalogItem {
  key: string;
  name: string;
  category: "Paid Media" | "Video" | "TV / Video" | "Organic" | "Analytics" | "Attribution";
}

export const DEFAULT_CHANNEL_CATALOG: ChannelCatalogItem[] = [
  { key: "google_ads", name: "Google Ads", category: "Paid Media" },
  { key: "meta_ads", name: "Meta Ads", category: "Paid Media" },
  { key: "tiktok_ads", name: "TikTok Ads", category: "Paid Media" },
  { key: "microsoft_ads", name: "Microsoft Ads", category: "Paid Media" },
  { key: "linkedin_ads", name: "LinkedIn Ads", category: "Paid Media" },
  { key: "youtube", name: "YouTube", category: "Video" },
  { key: "linear_tv", name: "Linear TV", category: "TV / Video" },
  { key: "ott_ctv", name: "OTT / CTV", category: "TV / Video" },
  { key: "programmatic", name: "Programmatic Display", category: "Paid Media" },
  { key: "seo", name: "SEO", category: "Organic" },
  { key: "ga4", name: "GA4", category: "Analytics" },
  { key: "call_tracking", name: "Call Tracking", category: "Attribution" }
];

export const DEFAULT_ENABLED_CHANNELS = [
  "Google Ads",
  "Meta Ads",
  "TikTok Ads"
];

/**
 * Safely parses a platform string like "Google Ads + Meta Ads" into an array of channel names.
 */
export function parsePlatformString(platform: string | null | undefined): string[] {
  if (!platform || typeof platform !== "string") return [];
  if (platform.trim() === "All Platforms") return [];
  return platform
    .split("+")
    .map(ch => ch.trim())
    .filter(ch => ch.length > 0);
}

/**
 * Serializes an array of channel names back into a " + " delimited string.
 */
export function serializePlatformChannels(channels: string[]): string {
  if (!Array.isArray(channels) || channels.length === 0) return "Google Ads";
  const unique = Array.from(new Set(channels.map(c => c.trim()).filter(c => c.length > 0)));
  return unique.join(" + ");
}

/**
 * Sanitizes an array of channel names for agency configuration.
 */
export function sanitizeAgencyChannels(channels: any): string[] {
  if (!Array.isArray(channels) || channels.length === 0) {
    return [...DEFAULT_ENABLED_CHANNELS];
  }
  const seen = new Set<string>();
  const sanitized: string[] = [];
  for (const item of channels) {
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (trimmed.length > 0 && trimmed.length <= 50) {
        const lower = trimmed.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          sanitized.push(trimmed);
        }
      }
    }
  }
  return sanitized.length > 0 ? sanitized.slice(0, 30) : [...DEFAULT_ENABLED_CHANNELS];
}
