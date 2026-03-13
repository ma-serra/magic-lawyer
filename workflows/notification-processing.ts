import type { NotificationJobData } from "@/app/lib/notifications/notification-job";
import { processNotificationWorkflowStep } from "@/app/lib/notifications/notification-workflow-step";

export async function notificationProcessingWorkflow(
  event: NotificationJobData,
) {
  "use workflow";

  await processNotificationWorkflowStep(event);
}
