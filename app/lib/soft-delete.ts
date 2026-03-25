export type SoftDeleteActor = {
  actorId?: string | null;
  actorType?: string | null;
};

export function buildSoftDeletePayload(
  actor?: SoftDeleteActor | null,
  reason?: string | null,
) {
  return {
    deletedAt: new Date(),
    deletedByActorType: actor?.actorType?.trim() || "USER",
    deletedByActorId: actor?.actorId?.trim() || null,
    deleteReason: reason?.trim() || null,
  };
}

export function buildRestorePayload() {
  return {
    deletedAt: null,
    deletedByActorType: null,
    deletedByActorId: null,
    deleteReason: null,
  };
}

