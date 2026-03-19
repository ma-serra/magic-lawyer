import {
  buildDeadlineProcessPreferenceKey,
  isDeadlineProcessMuted,
} from "@/app/lib/notifications/deadline-process-preference-keys";

describe("deadline process preferences", () => {
  it("monta chave estavel por tenant usuario e processo", () => {
    expect(
      buildDeadlineProcessPreferenceKey({
        tenantId: "tenant-1",
        userId: "user-1",
        processoId: "proc-1",
      }),
    ).toBe("tenant-1:user-1:proc-1");
  });

  it("identifica processo silenciado no indice", () => {
    const mutedIndex = new Set([
      buildDeadlineProcessPreferenceKey({
        tenantId: "tenant-1",
        userId: "user-1",
        processoId: "proc-1",
      }),
    ]);

    expect(
      isDeadlineProcessMuted(mutedIndex, {
        tenantId: "tenant-1",
        userId: "user-1",
        processoId: "proc-1",
      }),
    ).toBe(true);
    expect(
      isDeadlineProcessMuted(mutedIndex, {
        tenantId: "tenant-1",
        userId: "user-2",
        processoId: "proc-1",
      }),
    ).toBe(false);
  });
});
