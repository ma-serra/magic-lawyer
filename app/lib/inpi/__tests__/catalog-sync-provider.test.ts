describe("catalog sync provider", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("always uses vercel queue", async () => {
    const { getInpiCatalogSyncProvider } = await import(
      "@/app/lib/inpi/catalog-sync-provider"
    );

    expect(getInpiCatalogSyncProvider()).toBe("vercel-queue");
  });
});
