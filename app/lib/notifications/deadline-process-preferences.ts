import prisma from "@/app/lib/prisma";
import {
  buildDeadlineProcessPreferenceKey,
  type DeadlineProcessPreferenceKey,
} from "./deadline-process-preference-keys";

export async function getMutedDeadlineProcessPreferenceIndex(params: {
  tenantIds: string[];
  userIds: string[];
  processoIds: string[];
}) {
  if (
    params.tenantIds.length === 0 ||
    params.userIds.length === 0 ||
    params.processoIds.length === 0
  ) {
    return new Set<DeadlineProcessPreferenceKey>();
  }

  const rows = await prisma.processoDeadlineNotificationPreference.findMany({
    where: {
      tenantId: {
        in: params.tenantIds,
      },
      userId: {
        in: params.userIds,
      },
      processoId: {
        in: params.processoIds,
      },
      deadlineAlertsMuted: true,
    },
    select: {
      tenantId: true,
      userId: true,
      processoId: true,
    },
  });

  return new Set(
    rows.map((row) =>
      buildDeadlineProcessPreferenceKey({
        tenantId: row.tenantId,
        userId: row.userId,
        processoId: row.processoId,
      }),
    ),
  );
}
