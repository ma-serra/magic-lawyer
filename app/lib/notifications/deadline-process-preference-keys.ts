export type DeadlineProcessPreferenceKey = `${string}:${string}:${string}`;

export function buildDeadlineProcessPreferenceKey(params: {
  tenantId: string;
  userId: string;
  processoId: string;
}): DeadlineProcessPreferenceKey {
  return `${params.tenantId}:${params.userId}:${params.processoId}`;
}

export function isDeadlineProcessMuted(
  mutedIndex: Set<DeadlineProcessPreferenceKey>,
  params: {
    tenantId: string;
    userId: string;
    processoId: string;
  },
) {
  return mutedIndex.has(buildDeadlineProcessPreferenceKey(params));
}
