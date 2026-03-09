import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

import {
  configurarTenantChannelProvider,
  testarTenantChannelProvider,
} from "../tenant-channel-providers";
import prisma from "@/app/lib/prisma";
import { logAudit } from "@/app/lib/audit/log";

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

jest.mock("@/app/lib/prisma", () => ({
  __esModule: true,
  default: {
    tenantChannelProvider: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@/app/lib/audit/log", () => ({
  logAudit: jest.fn(),
  toAuditJson: (value: unknown) => value,
}));

describe("tenant channel provider actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue({
      user: {
        id: "user_1",
        role: "ADMIN",
        tenantId: "tenant_1",
        permissions: [],
      },
    });
  });

  it("salva provider mock ativo e registra auditoria", async () => {
    (prisma.tenantChannelProvider.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.tenantChannelProvider.upsert as jest.Mock).mockResolvedValue({
      id: "provider_1",
      tenantId: "tenant_1",
      channel: "WHATSAPP",
      provider: "INTERNAL_MOCK",
      displayName: "WhatsApp mock",
      credentialsEncrypted: null,
      configuration: {},
      active: true,
      healthStatus: "HEALTHY",
      dataConfiguracao: new Date("2026-03-09T10:00:00.000Z"),
      lastValidatedAt: new Date("2026-03-09T10:00:00.000Z"),
      lastValidationMode: "MOCK",
      lastErrorAt: null,
      lastErrorMessage: null,
      createdAt: new Date("2026-03-09T10:00:00.000Z"),
      updatedAt: new Date("2026-03-09T10:00:00.000Z"),
    });

    const result = await configurarTenantChannelProvider({
      channel: "WHATSAPP",
      provider: "INTERNAL_MOCK",
      displayName: "WhatsApp mock",
      active: true,
      publicConfig: {},
      secretConfig: {},
    });

    expect(result.success).toBe(true);
    expect(result.validation).toEqual(
      expect.objectContaining({
        success: true,
        mode: "MOCK",
        healthStatus: "HEALTHY",
      }),
    );
    expect(prisma.tenantChannelProvider.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          tenantId: "tenant_1",
          channel: "WHATSAPP",
          provider: "INTERNAL_MOCK",
          healthStatus: "HEALTHY",
        }),
      }),
    );
    expect(logAudit).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/configuracoes");
  });

  it("marca erro quando a validação do provider falha", async () => {
    (prisma.tenantChannelProvider.findUnique as jest.Mock).mockResolvedValue({
      id: "provider_telegram",
      tenantId: "tenant_1",
      channel: "TELEGRAM",
      provider: "TELEGRAM_BOT",
      displayName: "Telegram do escritório",
      credentialsEncrypted: null,
      configuration: {
        botUsername: "@magiclawyer",
      },
      active: true,
      healthStatus: "PENDING",
      dataConfiguracao: new Date("2026-03-09T10:00:00.000Z"),
      lastValidatedAt: null,
      lastValidationMode: null,
      lastErrorAt: null,
      lastErrorMessage: null,
      createdAt: new Date("2026-03-09T10:00:00.000Z"),
      updatedAt: new Date("2026-03-09T10:00:00.000Z"),
    });

    const result = await testarTenantChannelProvider("TELEGRAM");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Bot token é obrigatório.");
    expect(prisma.tenantChannelProvider.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "provider_telegram" },
        data: expect.objectContaining({
          healthStatus: "ERROR",
          lastErrorMessage: "Bot token é obrigatório.",
        }),
      }),
    );
    expect(logAudit).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/configuracoes");
  });
});
