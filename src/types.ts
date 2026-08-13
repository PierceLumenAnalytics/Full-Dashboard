export interface ClientAccount {
  id: string;
  name: string;
  domain: string;
  platform: string;
  monthlyBudget: number;
  status: "Active" | "Paused" | "Needs Review";
  createdAt: string;
  agencyId?: string | null;
  targetCpl?: number | null;
  brandColor?: string | null;
  industry?: string | null;
  primaryGoal?: string | null;
  regionalDistribution?: any[] | null;
  primaryMarket?: string | null;
  logoUrl?: string | null;
  reportingEnabled?: boolean;
  reportEmail?: string | null;
  reportCc?: string | null;
  reportDay?: number;
  reportTime?: string;
  reportTimezone?: string;
  reportPeriod?: "weekly" | "monthly";
}

export interface PerformanceMetric {
  date: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  conversionValue: number;
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

export type ActiveTab = "overview" | "clients" | "summary" | "logs" | "settings" | "reports";

export interface AnalyticsData {
  client: ClientAccount;
  metrics: PerformanceMetric[];
}
