describe("catalog sync provider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.VERCEL;
    delete process.env.VERCEL_URL;
    delete process.env.INPI_CATALOG_SYNC_PROVIDER;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("uses bullmq by default outside Vercel", async () => {
    const { getInpiCatalogSyncProvider } = await import(
      "@/app/lib/inpi/catalog-sync-provider"
    );

    expect(getInpiCatalogSyncProvider()).toBe("bullmq");
  });

  it("uses vercel queue by default on Vercel", async () => {
    process.env.VERCEL = "1";

    const { getInpiCatalogSyncProvider } = await import(
      "@/app/lib/inpi/catalog-sync-provider"
    );

    expect(getInpiCatalogSyncProvider()).toBe("vercel-queue");
  });

  it("accepts explicit provider override", async () => {
    process.env.INPI_CATALOG_SYNC_PROVIDER = "bullmq";
    process.env.VERCEL = "1";

    const { getInpiCatalogSyncProvider } = await import(
      "@/app/lib/inpi/catalog-sync-provider"
    );

    expect(getInpiCatalogSyncProvider()).toBe("bullmq");
  });
});
