describe("telegram provider", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_USERNAME;
    delete process.env.TELEGRAM_BOT_DISPLAY_NAME;
    jest.resetModules();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("monta provider global quando o token está presente", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "123456:AAExemploSeguro";
    process.env.TELEGRAM_BOT_USERNAME = "magicradarbot";
    process.env.TELEGRAM_BOT_DISPLAY_NAME = "Magic Radar";

    const {
      getGlobalTelegramProviderContext,
      getGlobalTelegramProviderSummary,
    } = await import("../notifications/telegram-provider");

    expect(getGlobalTelegramProviderContext()).toEqual(
      expect.objectContaining({
        botToken: "123456:AAExemploSeguro",
        botUsername: "@magicradarbot",
        source: "GLOBAL",
        displayName: "Magic Radar",
      }),
    );

    expect(getGlobalTelegramProviderSummary()).toEqual(
      expect.objectContaining({
        available: true,
        botUsername: "@magicradarbot",
        displayName: "Magic Radar",
      }),
    );
  });

  it("não expõe provider global quando o token não está configurado", async () => {
    const {
      getGlobalTelegramProviderContext,
      getGlobalTelegramProviderSummary,
    } = await import("../notifications/telegram-provider");

    expect(getGlobalTelegramProviderContext()).toBeNull();
    expect(getGlobalTelegramProviderSummary()).toEqual(
      expect.objectContaining({
        available: false,
        botUsername: null,
        displayName: "Magic Radar",
      }),
    );
  });
});
