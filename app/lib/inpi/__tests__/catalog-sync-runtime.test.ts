import {
  INPI_CATALOG_SYNC_STALE_MS,
  INPI_SYNC_MAX_OPERATIONAL_WINDOW_MS,
  estimateInpiCatalogSyncEtaSeconds,
  isInpiCatalogSyncStale,
} from "@/app/lib/inpi/catalog-sync-runtime";

describe("catalog sync runtime", () => {
  it("marks active sync as stale after the inactivity window", () => {
    const now = Date.parse("2026-03-11T12:00:00.000Z");

    expect(
      isInpiCatalogSyncStale(
        {
          status: "RUNNING",
          updatedAt: new Date(now - INPI_CATALOG_SYNC_STALE_MS - 1).toISOString(),
        },
        now,
      ),
    ).toBe(true);

    expect(
      isInpiCatalogSyncStale(
        {
          status: "COMPLETED",
          updatedAt: new Date(now - INPI_CATALOG_SYNC_STALE_MS - 1).toISOString(),
        },
        now,
      ),
    ).toBe(false);
  });

  it("caps ETA to the operational sync window", () => {
    const now = Date.parse("2026-03-11T12:00:00.000Z");
    const startedAt = new Date(now - 3 * 60 * 1000).toISOString();

    expect(
      estimateInpiCatalogSyncEtaSeconds(
        {
          status: "RUNNING",
          progressPct: 3,
          startedAt,
          updatedAt: new Date(now).toISOString(),
        },
        now,
      ),
    ).toBe(
      Math.ceil((INPI_SYNC_MAX_OPERATIONAL_WINDOW_MS - 3 * 60 * 1000) / 1000),
    );
  });

  it("stops estimating when the operational window is exhausted", () => {
    const now = Date.parse("2026-03-11T12:00:00.000Z");

    expect(
      estimateInpiCatalogSyncEtaSeconds(
        {
          status: "RUNNING",
          progressPct: 40,
          startedAt: new Date(
            now - INPI_SYNC_MAX_OPERATIONAL_WINDOW_MS - 5_000,
          ).toISOString(),
          updatedAt: new Date(now).toISOString(),
        },
        now,
      ),
    ).toBeUndefined();
  });
});
