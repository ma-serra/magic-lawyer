import {
  buildTenantChannelProviderView,
  mergeTenantChannelProviderConfigs,
  testTenantChannelProviderDraft,
} from "../tenant-channel-providers";
import { encrypt } from "@/lib/crypto";

describe("tenant channel providers", () => {
  it("preserva segredos existentes quando apenas dados públicos são alterados", () => {
    const merged = mergeTenantChannelProviderConfigs({
      provider: "TELEGRAM_BOT",
      currentProvider: "TELEGRAM_BOT",
      existingPublicConfig: {
        botUsername: "@canal_antigo",
      },
      existingSecretConfig: encrypt(
        JSON.stringify({
          botToken: "123456:ABCDEF-ghijklmnop",
        }),
      ),
      nextPublicConfig: {
        botUsername: "@canal_novo",
      },
      nextSecretConfig: {},
    });

    expect(merged.publicConfig).toEqual({
      botUsername: "@canal_novo",
    });
    expect(merged.secretConfig).toEqual({
      botToken: "123456:ABCDEF-ghijklmnop",
    });
    expect(merged.credentialsEncrypted).toEqual(expect.any(String));
  });

  it("valida estruturalmente um bot Telegram compatível", () => {
    const result = testTenantChannelProviderDraft({
      channel: "TELEGRAM",
      provider: "TELEGRAM_BOT",
      publicConfig: {
        botUsername: "@magic_lawyer_bot",
      },
      secretConfig: {
        botToken: "123456789:AAExemploTokenSeguro",
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        mode: "STRUCTURAL",
        healthStatus: "PENDING",
      }),
    );
    expect(result.warnings).toHaveLength(1);
  });

  it("monta view com preview operacional e segredos mascarados", () => {
    const view = buildTenantChannelProviderView("SMS", {
      id: "provider_sms",
      tenantId: "tenant_1",
      channel: "SMS",
      provider: "TWILIO_SMS",
      displayName: "SMS cobrança",
      credentialsEncrypted: encrypt(
        JSON.stringify({
          accountSid: "AC1234567890ABCDEF1234567890ABCD",
          authToken: "token-super-seguro",
        }),
      ),
      configuration: {
        fromNumber: "+15551234567",
        messagingServiceSid: "MG1234567890ABCDEF1234567890ABCD",
      },
      active: true,
      healthStatus: "PENDING",
      dataConfiguracao: new Date("2026-03-09T10:00:00.000Z"),
      lastValidatedAt: new Date("2026-03-09T10:05:00.000Z"),
      lastValidationMode: "STRUCTURAL",
      lastErrorAt: null,
      lastErrorMessage: null,
      createdAt: new Date("2026-03-09T10:00:00.000Z"),
      updatedAt: new Date("2026-03-09T10:05:00.000Z"),
    });

    expect(view.providerLabel).toBe("Twilio SMS");
    expect(view.summaryItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "fromNumber",
          value: "+15551234567",
        }),
      ]),
    );
    expect(view.secretItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "accountSid",
          present: true,
        }),
      ]),
    );
  });
});
