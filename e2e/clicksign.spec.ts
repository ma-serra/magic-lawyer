import { expect, test, type Page } from "@playwright/test";

import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

const TENANT_A = {
  slug: "sandra",
  email: "sandra@adv.br",
  password: "Sandra@123",
  apiBase: "https://tenant-a.clicksign.test/api/v1",
  accessToken: "tenant-a-disabled-token",
};

const TENANT_B = {
  slug: "salba",
  email: "luciano@salbaadvocacia.com.br",
  password: "Luciano@123",
  apiBase: "https://tenant-b.clicksign.test/api/v1",
  accessToken: "tenant-b-disabled-token",
};

type StoredClicksignConfig = {
  id: string;
  tenantId: string;
  apiBase: string;
  accessTokenEncrypted: string;
  ambiente: "SANDBOX" | "PRODUCAO";
  integracaoAtiva: boolean;
  dataConfiguracao: Date;
  ultimaValidacao: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

async function submitLogin(page: Page): Promise<void> {
  const submitButton = page.getByRole("button", { name: /^Entrar no sistema$/i });
  if (await submitButton.first().isVisible().catch(() => false)) {
    await submitButton.first().click();
  } else {
    await page.getByRole("button", { name: /^Logar$/i }).first().click();
  }

  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 20000,
  });
  await page.waitForLoadState("domcontentloaded");
}

async function loginTenantAdmin(
  page: Page,
  credentials: { slug: string; email: string; password: string },
): Promise<void> {
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");

  await page.fill('input[name="email"], input[type="email"]', credentials.email);
  await page.fill(
    'input[name="password"], input[type="password"]',
    credentials.password,
  );

  const slugField = page.getByLabel("Escritório (slug/domínio)");
  if (await slugField.isVisible().catch(() => false)) {
    await slugField.fill(credentials.slug);
  }

  await submitLogin(page);
}

async function openClicksignSettings(page: Page): Promise<void> {
  await page.goto("/configuracoes?tab=clicksign");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByText("Integração ClickSign").first()).toBeVisible({
    timeout: 20000,
  });
}

async function setIntegrationActive(page: Page, value: boolean): Promise<void> {
  const toggle = page
    .getByRole("switch", { name: /Integração ativa para este tenant/i })
    .first();
  await expect(toggle).toBeVisible();

  const isChecked = (await toggle.getAttribute("aria-checked")) === "true";
  if (isChecked !== value) {
    await toggle.click();
  }
}

async function saveDisabledClicksignConfig(
  page: Page,
  params: {
    apiBase: string;
    accessToken: string;
  },
): Promise<void> {
  await openClicksignSettings(page);
  await page.getByLabel("Access token").fill(params.accessToken);
  await page.getByLabel("API base").fill(params.apiBase);
  await setIntegrationActive(page, false);
  await page.getByRole("button", { name: /Salvar integração/i }).click();

  await expect(page.getByText("Desativada no tenant").first()).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByLabel("API base")).toHaveValue(params.apiBase);
  await expect(page.getByText("Token do tenant: Configurado").first()).toBeVisible();
}

test.describe.serial("ClickSign multi-tenant E2E", () => {
  test.describe.configure({ timeout: 120000 });

  let tenantAId: string | null = null;
  let tenantBId: string | null = null;
  let previousTenantAConfig: StoredClicksignConfig | null = null;
  let previousTenantBConfig: StoredClicksignConfig | null = null;

  test.beforeAll(async () => {
    const tenants = await prisma.tenant.findMany({
      where: {
        slug: {
          in: [TENANT_A.slug, TENANT_B.slug],
        },
      },
      select: {
        id: true,
        slug: true,
      },
    });

    tenantAId = tenants.find((tenant) => tenant.slug === TENANT_A.slug)?.id ?? null;
    tenantBId = tenants.find((tenant) => tenant.slug === TENANT_B.slug)?.id ?? null;

    if (!tenantAId || !tenantBId) {
      return;
    }

    const existingConfigs = await prisma.clicksignTenantConfig.findMany({
      where: {
        tenantId: {
          in: [tenantAId, tenantBId],
        },
      },
    });

    previousTenantAConfig =
      existingConfigs.find((config) => config.tenantId === tenantAId) ?? null;
    previousTenantBConfig =
      existingConfigs.find((config) => config.tenantId === tenantBId) ?? null;

    await prisma.clicksignTenantConfig.deleteMany({
      where: {
        tenantId: {
          in: [tenantAId, tenantBId],
        },
      },
    });
  });

  test.afterAll(async () => {
    if (tenantAId || tenantBId) {
      await prisma.clicksignTenantConfig.deleteMany({
        where: {
          tenantId: {
            in: [tenantAId, tenantBId].filter(Boolean) as string[],
          },
        },
      });
    }

    if (previousTenantAConfig) {
      await prisma.clicksignTenantConfig.create({
        data: previousTenantAConfig,
      });
    }

    if (previousTenantBConfig) {
      await prisma.clicksignTenantConfig.create({
        data: previousTenantBConfig,
      });
    }

    await prisma.$disconnect();
  });

  test("tenant A salva configuração própria sem vazar para tenant B", async ({
    page,
  }) => {
    test.skip(!tenantAId || !tenantBId, "Tenants de seed não encontrados.");

    await loginTenantAdmin(page, TENANT_A);
    await saveDisabledClicksignConfig(page, {
      apiBase: TENANT_A.apiBase,
      accessToken: TENANT_A.accessToken,
    });

    const config = await prisma.clicksignTenantConfig.findUnique({
      where: { tenantId: tenantAId! },
    });

    expect(config).toMatchObject({
      tenantId: tenantAId,
      apiBase: TENANT_A.apiBase,
      ambiente: "SANDBOX",
      integracaoAtiva: false,
    });
    expect(config?.accessTokenEncrypted).toBeTruthy();
  });

  test("tenant B inicia sem enxergar configuração do tenant A e persiste a sua própria", async ({
    page,
  }) => {
    test.skip(!tenantAId || !tenantBId, "Tenants de seed não encontrados.");

    await loginTenantAdmin(page, TENANT_B);
    await openClicksignSettings(page);

    await expect(page.getByLabel("API base")).not.toHaveValue(TENANT_A.apiBase);
    await expect(
      page.getByText("Origem efetiva: Desativada no tenant"),
    ).toHaveCount(0);

    await saveDisabledClicksignConfig(page, {
      apiBase: TENANT_B.apiBase,
      accessToken: TENANT_B.accessToken,
    });

    const config = await prisma.clicksignTenantConfig.findUnique({
      where: { tenantId: tenantBId! },
    });

    expect(config).toMatchObject({
      tenantId: tenantBId,
      apiBase: TENANT_B.apiBase,
      ambiente: "SANDBOX",
      integracaoAtiva: false,
    });
    expect(config?.accessTokenEncrypted).toBeTruthy();
  });

  test("tenant A continua vendo apenas sua própria configuração após tenant B salvar a dele", async ({
    page,
  }) => {
    test.skip(!tenantAId || !tenantBId, "Tenants de seed não encontrados.");

    await loginTenantAdmin(page, TENANT_A);
    await openClicksignSettings(page);

    await expect(page.getByLabel("API base")).toHaveValue(TENANT_A.apiBase);
    await expect(page.getByLabel("API base")).not.toHaveValue(TENANT_B.apiBase);
    await expect(page.getByText("Desativada no tenant").first()).toBeVisible();
    await expect(page.getByText("Token do tenant: Configurado").first()).toBeVisible();
  });
});
