describe("catalog sync config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.VERCEL;
    delete process.env.VERCEL_URL;
    delete process.env.APP_RUNTIME_WORKERS_ENABLED;
    delete process.env.INPI_OFFICIAL_BACKGROUND_SEARCH_ENABLED;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("disables official INPI background search by default on Vercel", async () => {
    process.env.VERCEL = "1";

    const { isInpiOfficialBackgroundSearchEnabled } = await import(
      "@/app/lib/inpi/catalog-sync-config"
    );

    expect(isInpiOfficialBackgroundSearchEnabled()).toBe(false);
  });

  it("allows explicit opt-in for official INPI background search", async () => {
    process.env.VERCEL = "1";
    process.env.INPI_OFFICIAL_BACKGROUND_SEARCH_ENABLED = "true";

    const { isInpiOfficialBackgroundSearchEnabled } = await import(
      "@/app/lib/inpi/catalog-sync-config"
    );

    expect(isInpiOfficialBackgroundSearchEnabled()).toBe(true);
  });

  it("disables app runtime workers by default on Vercel", async () => {
    process.env.VERCEL_URL = "magic-lawyer.vercel.app";

    const { shouldBootstrapAppRuntimeWorkers } = await import(
      "@/app/lib/inpi/catalog-sync-config"
    );

    expect(shouldBootstrapAppRuntimeWorkers()).toBe(false);
  });
});
