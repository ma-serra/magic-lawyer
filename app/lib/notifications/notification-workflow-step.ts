import type { NotificationJobData } from "./notification-job";

import { NotificationService } from "./notification-service";

export async function processNotificationWorkflowStep(
  event: NotificationJobData,
): Promise<void> {
  "use step";

  await NotificationService.processNotificationSync(event);
}
