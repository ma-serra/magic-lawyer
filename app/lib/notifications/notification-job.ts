export interface NotificationJobData {
  type: string;
  tenantId: string;
  userId: string;
  payload: Record<string, any>;
  urgency: "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";
  channels: ("REALTIME" | "EMAIL" | "PUSH")[];
}
