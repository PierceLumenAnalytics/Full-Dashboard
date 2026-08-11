import { Request } from "express";

export function getAppBaseUrl(req?: Request): string {
  // 1. Explicit production environment variables
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  if (process.env.PUBLIC_APP_URL) return process.env.PUBLIC_APP_URL;
  if (process.env.APP_URL) return process.env.APP_URL;

  // 2. Request origin fallback
  if (req) {
    const host = (req.headers["x-forwarded-host"] as string) || req.get("host");
    const protocol = req.secure || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    if (host) {
      return `${protocol}://${host}`;
    }
  }

  // 3. Local development fallback
  const port = process.env.PORT || 3000;
  return `http://localhost:${port}`;
}

export function buildClientDashboardUrl({
  agencySlug,
  clientId,
  req
}: {
  agencySlug: string;
  clientId: string;
  req?: Request;
}): string {
  const baseUrl = getAppBaseUrl(req);
  return `${baseUrl}/agency/${agencySlug}?client=${clientId}`;
}

export function buildClientPortalUrl({
  portalToken,
  req
}: {
  portalToken: string;
  req?: Request;
}): string {
  const baseUrl = getAppBaseUrl(req);
  return `${baseUrl}/portal/${portalToken}`;
}

