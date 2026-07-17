export interface ClientAccount {
  id: string;
  name: string;
  domain: string;
  platform: "Google Ads" | "Meta Ads" | "TikTok Ads" | "All Platforms";
  monthlyBudget: number;
  status: "Active" | "Paused" | "Needs Review";
  createdAt: string;
  agencyId?: string | null;
}

export interface PerformanceMetric {
  date: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "REFRESH";
  entity: string;
  details: string;
  user: string;
  agencyId?: string | null;
}

export type ActiveTab = "overview" | "clients" | "summary" | "logs";

export interface AnalyticsData {
  client: ClientAccount;
  metrics: PerformanceMetric[];
}
