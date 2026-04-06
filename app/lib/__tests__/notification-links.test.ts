import {
  resolveNotificationActionText,
  resolveNotificationPath,
  resolveNotificationUrl,
} from "@/app/lib/notifications/notification-links";

describe("notification links", () => {
  it("resolve prazo notifications to the direct prazo URL", () => {
    expect(
      resolveNotificationPath("prazo.expired", {
        processoId: "proc_123",
        prazoId: "prazo_456",
      }),
    ).toBe("/processos/proc_123?tab=prazos&prazoId=prazo_456");
  });

  it("resolve digest notifications to the central deadlines page", () => {
    expect(
      resolveNotificationPath("prazo.digest_10d", {
        digestKey: "digest:test",
      }),
    ).toBe("/prazos");
  });

  it("preserves security action URLs when present", () => {
    expect(
      resolveNotificationUrl(
        "access.login_new",
        {
          securityActionUrl: "https://magiclawyer.vercel.app/seguranca/revisar",
        },
        "https://tenant.magiclawyer.vercel.app",
      ),
    ).toBe("https://magiclawyer.vercel.app/seguranca/revisar");
  });

  it("builds absolute URLs when a base URL is available", () => {
    expect(
      resolveNotificationUrl(
        "prazo.created",
        {
          processoId: "proc_123",
          prazoId: "prazo_456",
        },
        "https://tenant.magiclawyer.vercel.app/",
      ),
    ).toBe(
      "https://tenant.magiclawyer.vercel.app/processos/proc_123?tab=prazos&prazoId=prazo_456",
    );
  });

  it("uses direct prazo CTA labels for prazo events", () => {
    expect(
      resolveNotificationActionText("prazo.created", {
        prazoId: "prazo_456",
      }),
    ).toBe("Abrir prazo");
    expect(resolveNotificationActionText("prazo.digest_30d", {})).toBe(
      "Revisar lista de prazos",
    );
  });
});
