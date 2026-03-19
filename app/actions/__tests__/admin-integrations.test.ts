import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

import {
  testTenantAsaasConnectionAsSuperAdmin,
  testTenantChannelProviderAsSuperAdmin,
  testTenantClicksignConnectionAsSuperAdmin,
} from "../admin-integrations";
import prisma from "@/app/lib/prisma";
import {
  getGlobalClicksignFallbackSummary,
  testClicksignConnection,
} from "@/app/lib/clicksign";
import { getGlobalTelegramProviderSummary } from "@/app/lib/notifications/telegram-provider";
import { createAsaasClientFromEncrypted } from "@/lib/asaas";
import { decrypt } from "@/lib/crypto";

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

jest.mock("@/app/lib/prisma", () => ({
  __esModule: true,
  default: {
    clicksignTenantConfig: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    tenantAsaasConfig: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    tenantChannelProvider: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    superAdminAuditLog: {
      create: jest.fn(),
    },
  },
}));

jest.mock("@/app/lib/clicksign", () => ({
  getGlobalClicksignFallbackSummary: jest.fn(),
  testClicksignConnection: jest.fn(),
}));

jest.mock("@/app/lib/notifications/telegram-provider", () => ({
  getGlobalTelegramProviderSummary: jest.fn(),
}));

jest.mock("@/lib/asaas", () => ({
  createAsaasClientFromEncrypted: jest.fn(),
}));

jest.mock("@/lib/crypto", () => ({
  decrypt: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

describe("admin integration actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue({
      user: {
        id: "super-admin-id",
        role: "SUPER_ADMIN",
      },
    });
    (getGlobalTelegramProviderSummary as jest.Mock).mockReturnValue({
      available: false,
      source: "GLOBAL",
      provider: "TELEGRAM_BOT",
      providerLabel: "Telegram Bot",
      botUsername: null,
      displayName: "Magic Radar",
      healthHint: "Bot global da plataforma ainda não configurado no ambiente.",
    });
  });

  it("testa ClickSign do tenant e atualiza auditoria/validação", async () => {
    (
      prisma.clicksignTenantConfig.findUnique as jest.Mock
    ).mockResolvedValue({
      id: "clicksign-config-id",
      apiBase: "https://sandbox.clicksign.com/api/v1",
      ambiente: "SANDBOX",
      integracaoAtiva: true,
      dataConfiguracao: new Date("2026-03-09T10:00:00.000Z"),
      ultimaValidacao: null,
      accessTokenEncrypted: "enc-token",
    });
    (decrypt as jest.Mock).mockReturnValue("plain-token");
    (getGlobalClicksignFallbackSummary as jest.Mock).mockReturnValue({
      available: false,
      source: "GLOBAL",
      mockMode: false,
      apiBase: "https://sandbox.clicksign.com/api/v1",
      ambiente: "SANDBOX",
    });
    (testClicksignConnection as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        source: "TENANT",
        ambiente: "SANDBOX",
      },
    });

    const result = await testTenantClicksignConnectionAsSuperAdmin("tenant-1");

    expect(result.success).toBe(true);
    expect(result.data?.source).toBe("TENANT");
    expect(prisma.clicksignTenantConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "clicksign-config-id" },
        data: expect.objectContaining({
          ultimaValidacao: expect.any(Date),
        }),
      }),
    );
    expect(prisma.superAdminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          acao: "TEST_TENANT_CLICKSIGN_CONNECTION",
          entidade: "TENANT_INTEGRATION",
          entidadeId: "tenant-1",
        }),
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/admin/tenants/tenant-1");
  });

  it("testa Asaas do tenant e atualiza auditoria/validação", async () => {
    const testConnection = jest.fn().mockResolvedValue(true);

    (prisma.tenantAsaasConfig.findUnique as jest.Mock).mockResolvedValue({
      id: "asaas-config-id",
      asaasApiKey: "enc-api-key",
      webhookAccessToken: "enc-webhook",
      asaasAccountId: "acc_123",
      asaasWalletId: "wallet_456",
      ambiente: "SANDBOX",
      integracaoAtiva: true,
      dataConfiguracao: new Date("2026-03-09T10:00:00.000Z"),
      webhookConfiguredAt: new Date("2026-03-09T10:10:00.000Z"),
      lastWebhookAt: null,
      lastWebhookEvent: null,
      ultimaValidacao: null,
    });
    (createAsaasClientFromEncrypted as jest.Mock).mockReturnValue({
      testConnection,
    });

    const result = await testTenantAsaasConnectionAsSuperAdmin("tenant-1");

    expect(result.success).toBe(true);
    expect(result.data?.ambiente).toBe("SANDBOX");
    expect(createAsaasClientFromEncrypted).toHaveBeenCalledWith(
      "enc-api-key",
      "sandbox",
    );
    expect(prisma.tenantAsaasConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "asaas-config-id" },
        data: expect.objectContaining({
          ultimaValidacao: expect.any(Date),
        }),
      }),
    );
    expect(prisma.superAdminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          acao: "TEST_TENANT_ASAAS_CONNECTION",
          entidade: "TENANT_INTEGRATION",
          entidadeId: "tenant-1",
        }),
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/admin/tenants/tenant-1");
  });

  it("testa provider omnichannel do tenant e atualiza auditoria/validação", async () => {
    (prisma.tenantChannelProvider.findUnique as jest.Mock).mockResolvedValue({
      id: "channel_provider_id",
      tenantId: "tenant-1",
      channel: "TELEGRAM",
      provider: "TELEGRAM_BOT",
      displayName: "Telegram institucional",
      credentialsEncrypted: "enc-bot-token",
      configuration: {
        botUsername: "@magiclawyerbot",
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
    (decrypt as jest.Mock).mockReturnValue(
      JSON.stringify({
        botToken: "123456789:AAExemploTokenSeguro",
      }),
    );

    const result = await testTenantChannelProviderAsSuperAdmin(
      "tenant-1",
      "TELEGRAM",
    );

    expect(result.success).toBe(true);
    expect(result.data?.validationMode).toBe("STRUCTURAL");
    expect(prisma.tenantChannelProvider.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "channel_provider_id" },
        data: expect.objectContaining({
          healthStatus: "PENDING",
          lastValidatedAt: expect.any(Date),
        }),
      }),
    );
    expect(prisma.superAdminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          acao: "TEST_TENANT_CHANNEL_PROVIDER_CONNECTION",
          entidade: "TENANT_INTEGRATION",
          entidadeId: "tenant-1",
        }),
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/admin/tenants/tenant-1");
  });

  it("usa o bot global do Telegram quando o tenant não possui provider próprio", async () => {
    (prisma.tenantChannelProvider.findUnique as jest.Mock).mockResolvedValue(null);
    (getGlobalTelegramProviderSummary as jest.Mock).mockReturnValue({
      available: true,
      source: "GLOBAL",
      provider: "TELEGRAM_BOT",
      providerLabel: "Telegram Bot",
      botUsername: "@magicradarbot",
      displayName: "Magic Radar",
      healthHint: "Bot global da plataforma pronto para operação multi-tenant.",
    });

    const result = await testTenantChannelProviderAsSuperAdmin(
      "tenant-1",
      "TELEGRAM",
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        provider: "TELEGRAM_BOT",
        validationMode: "STRUCTURAL",
        effectiveSource: "GLOBAL",
      }),
    );
    expect(prisma.tenantChannelProvider.update).not.toHaveBeenCalled();
    expect(prisma.superAdminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          acao: "TEST_TENANT_CHANNEL_PROVIDER_CONNECTION",
          entidadeId: "tenant-1",
        }),
      }),
    );
  });
});
