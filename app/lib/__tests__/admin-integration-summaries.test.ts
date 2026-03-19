import {
  buildAdminAsaasSummary,
  buildAdminCertificatesSummary,
  buildAdminClicksignSummary,
  buildAdminTenantChannelProviderSummary,
} from "../admin-integration-summaries";

describe("admin integration summaries", () => {
  it("monta resumo de ClickSign com fallback mock quando tenant não configurou", () => {
    const summary = buildAdminClicksignSummary(null, {
      available: true,
      source: "MOCK",
      mockMode: true,
      apiBase: "mock://clicksign/api/v1",
      ambiente: "SANDBOX",
    });

    expect(summary).toEqual(
      expect.objectContaining({
        id: null,
        hasTenantConfig: false,
        effectiveSource: "MOCK",
        fallbackAvailable: true,
        fallbackSource: "MOCK",
        mockMode: true,
        fallbackApiBase: "mock://clicksign/api/v1",
        ambiente: "SANDBOX",
      }),
    );
  });

  it("monta resumo de ClickSign como desativado quando tenant configurou e desligou", () => {
    const now = new Date("2026-03-09T08:00:00.000Z");

    const summary = buildAdminClicksignSummary(
      {
        id: "clk_1",
        apiBase: "https://sandbox.clicksign.com/api/v1",
        ambiente: "SANDBOX",
        integracaoAtiva: false,
        dataConfiguracao: now,
        ultimaValidacao: null,
        accessTokenEncrypted: "enc-token",
      },
      {
        available: true,
        source: "GLOBAL",
        mockMode: false,
        apiBase: "https://sandbox.clicksign.com/api/v1",
        ambiente: "SANDBOX",
      },
    );

    expect(summary).toEqual(
      expect.objectContaining({
        id: "clk_1",
        hasTenantConfig: true,
        hasAccessToken: true,
        integracaoAtiva: false,
        effectiveSource: "DISABLED",
      }),
    );
  });

  it("monta resumo de Asaas com proteção por segredo global", () => {
    const now = new Date("2026-03-09T09:00:00.000Z");

    const summary = buildAdminAsaasSummary(
      {
        id: "asa_1",
        asaasApiKey: "enc-api-key",
        webhookAccessToken: null,
        asaasAccountId: "acc_123",
        asaasWalletId: "wallet_456",
        ambiente: "PRODUCAO",
        integracaoAtiva: true,
        dataConfiguracao: now,
        webhookConfiguredAt: null,
        lastWebhookAt: now,
        lastWebhookEvent: "PAYMENT_CONFIRMED",
        ultimaValidacao: now,
      },
      {
        webhookUrl: "https://magic.test/api/webhooks/asaas",
        globalWebhookSecretConfigured: true,
      },
    );

    expect(summary).toEqual(
      expect.objectContaining({
        id: "asa_1",
        asaasAccountId: "acc_123",
        hasApiKey: true,
        hasWebhookAccessToken: false,
        globalWebhookSecretConfigured: true,
        isWebhookProtected: true,
        webhookUrl: "https://magic.test/api/webhooks/asaas",
        lastWebhookEvent: "PAYMENT_CONFIRMED",
      }),
    );
  });

  it("monta resumo de certificados com política e sinais operacionais", () => {
    const latestValidationAt = new Date("2026-03-09T10:00:00.000Z");
    const latestUseAt = new Date("2026-03-09T11:00:00.000Z");

    const summary = buildAdminCertificatesSummary({
      policy: "HYBRID",
      certificates: [
        {
          scope: "OFFICE",
          isActive: true,
          validUntil: new Date("2027-01-01T00:00:00.000Z"),
          lastValidatedAt: latestValidationAt,
          lastUsedAt: latestUseAt,
        },
        {
          scope: "LAWYER",
          isActive: false,
          validUntil: new Date("2025-01-01T00:00:00.000Z"),
          lastValidatedAt: null,
          lastUsedAt: null,
        },
      ],
    });

    expect(summary).toEqual(
      expect.objectContaining({
        policy: "HYBRID",
        totalCertificates: 2,
        activeCertificates: 1,
        expiredCertificates: 1,
        officeCertificates: 1,
        lawyerCertificates: 1,
        hasActiveOfficeCertificate: true,
        latestValidationAt,
        latestUseAt,
      }),
    );
  });

  it("monta resumo administrativo do provider omnichannel sem expor segredo", () => {
    const validatedAt = new Date("2026-03-09T12:00:00.000Z");

    const summary = buildAdminTenantChannelProviderSummary("WHATSAPP", {
      id: "channel_1",
      provider: "META_CLOUD_API",
      displayName: "WhatsApp institucional",
      credentialsEncrypted: "enc-secret",
      configuration: {
        phoneNumberId: "1234567890",
        apiVersion: "v23.0",
      },
      active: true,
      healthStatus: "PENDING",
      dataConfiguracao: validatedAt,
      lastValidatedAt: validatedAt,
      lastValidationMode: "STRUCTURAL",
      lastErrorAt: null,
      lastErrorMessage: null,
    });

    expect(summary).toEqual(
      expect.objectContaining({
        id: "channel_1",
        channel: "WHATSAPP",
        provider: "META_CLOUD_API",
        providerLabel: "Meta Cloud API",
        hasCredentials: true,
        healthStatus: "PENDING",
        lastValidationMode: "STRUCTURAL",
      }),
    );
    expect(summary.configSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "phoneNumberId",
          value: "1234567890",
        }),
      ]),
    );
  });

  it("monta resumo administrativo do Telegram com fallback global", () => {
    const summary = buildAdminTenantChannelProviderSummary("TELEGRAM", null, {
      available: true,
      provider: "TELEGRAM_BOT",
      providerLabel: "Telegram Bot",
      displayName: "Magic Radar",
      botUsername: "@magicradarbot",
      healthHint: "Bot global da plataforma pronto para operação multi-tenant.",
    });

    expect(summary).toEqual(
      expect.objectContaining({
        channel: "TELEGRAM",
        provider: "TELEGRAM_BOT",
        providerLabel: "Telegram Bot",
        displayName: "Magic Radar",
        effectiveSource: "GLOBAL",
        fallbackAvailable: true,
        hasCredentials: true,
      }),
    );
    expect(summary.configSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "botUsername",
          value: "@magicradarbot",
        }),
      ]),
    );
  });
});
