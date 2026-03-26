import { expect, test, type Page } from "@playwright/test";

const SUPER_ADMIN_EMAIL =
  process.env.TEST_SUPER_ADMIN_EMAIL || "robsonnonatoiii@gmail.com";
const SUPER_ADMIN_PASSWORD =
  process.env.TEST_SUPER_ADMIN_PASSWORD || "Robson123!";

const TENANTS = {
  rvb: {
    slug: "rvb",
    email: "admin@rvb.adv.br",
    password: "Rvb@123",
  },
  salba: {
    slug: "salba",
    email: "luciano@salbaadvocacia.com.br",
    password: "Luciano@123",
  },
  sandra: {
    slug: "sandra",
    email: "sandra@adv.br",
    password: "Sandra@123",
  },
} as const;

const PREMIUM_AUTHORITY_NAME = "Ana Costa";
const PACKAGE_NAME = `Pacote E2E Premium ${Date.now()}`;
const PACKAGE_DESCRIPTION =
  "Oferta premium criada em teste para validar loja interna, billing e governança comercial.";

async function login(
  page: Page,
  credentials: {
    email: string;
    password: string;
    slug?: string;
  },
) {
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");

  await page.fill('input[name="email"], input[type="email"]', credentials.email);
  await page.fill(
    'input[name="password"], input[type="password"]',
    credentials.password,
  );

  if (credentials.slug) {
    const slugField = page.locator(
      'input[name="tenantSlug"], input[name="slug"], input[placeholder*="meu-escritorio"]',
    );

    if (await slugField.first().isVisible().catch(() => false)) {
      await slugField.first().fill(credentials.slug);
    }
  }

  const submit = page
    .getByRole("button", { name: /^Entrar no sistema$/i })
    .or(page.locator('button[type="submit"]'))
    .first();

  await submit.click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 20000,
  });
  await page.waitForLoadState("domcontentloaded");
}

async function selectAutocompleteOption(
  page: Page,
  label: string,
  query: string,
  optionText: string,
) {
  const input = page.getByLabel(label).first();
  await input.click();
  await input.fill(query);

  const option = page
    .locator('[role="option"]')
    .filter({ hasText: optionText })
    .first();

  await expect(option).toBeVisible({ timeout: 10000 });
  await input.press("ArrowDown");
  await input.press("Enter");
}

test.describe.serial("monetização premium de pacotes", () => {
  test("super admin monta um pacote vendável no cockpit comercial", async ({
    page,
  }) => {
    await login(page, {
      email: SUPER_ADMIN_EMAIL,
      password: SUPER_ADMIN_PASSWORD,
    });

    await page.goto("/admin/pacotes");
    await expect(
      page.getByRole("heading", { name: /Monetização e pacotes premium/i }),
    ).toBeVisible();
    await expect(
      page.getByText(PREMIUM_AUTHORITY_NAME).first(),
    ).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: /Criar pacote/i }).first().click();
    await expect(
      page.getByText(/Novo pacote premium/i).first(),
    ).toBeVisible();

    await page.getByLabel("Nome do pacote").fill(PACKAGE_NAME);
    await page.getByLabel("Preço").fill("321.90");
    await page.getByLabel("Descrição comercial").fill(PACKAGE_DESCRIPTION);
    await page.getByLabel("Vigência em dias").fill("30");
    await page.getByLabel("Ordem").fill("98");

    await selectAutocompleteOption(
      page,
      "Adicionar autoridade",
      "Ana",
      PREMIUM_AUTHORITY_NAME,
    );

    const addAuthorityButton = page.getByTestId("pacote-add-autoridade");
    await expect(addAuthorityButton).toBeEnabled({ timeout: 10000 });
    await page.waitForTimeout(250);
    await addAuthorityButton.evaluate((element) => {
      (element as HTMLButtonElement).click();
    });
    await expect(
      page
        .getByTestId("pacote-selected-autoridade")
        .filter({ hasText: PREMIUM_AUTHORITY_NAME })
        .first(),
    ).toBeVisible();

    await page.getByTestId("pacote-save").evaluate((element) => {
      (element as HTMLButtonElement).click();
    });
    await expect(page.getByText(PACKAGE_NAME)).toBeVisible({ timeout: 15000 });

    const packageCard = page
      .getByTestId("admin-pacote-card")
      .filter({ hasText: PACKAGE_NAME })
      .first();

    await expect(packageCard).toContainText("Loja: Público");
    await expect(packageCard).toContainText("30 dias");
  });

  test("tenant rvb compra o pacote na loja interna e vê o add-on no billing", async ({
    page,
  }) => {
    await login(page, TENANTS.rvb);

    await page.goto("/juizes/pacotes");
    await expect(
      page.getByRole("heading", { name: /Loja interna de autoridades/i }),
    ).toBeVisible();

    const packageCard = page
      .getByTestId("tenant-pacote-card")
      .filter({ hasText: PACKAGE_NAME })
      .first();

    await expect(packageCard).toBeVisible({ timeout: 15000 });
    await packageCard.getByRole("button", { name: /Comprar pacote/i }).click();

    await expect(
      page.getByText(/Escolha como o escritório vai pagar/i),
    ).toBeVisible();
    await page.getByRole("button", { name: /Gerar cobrança/i }).click();

    await expect(page.getByText(/QR Code PIX/i)).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByRole("button", { name: /Simular confirmação/i }),
    ).toBeVisible();

    await page.getByRole("button", { name: /Simular confirmação/i }).click();

    await expect(
      page.getByText("Pacote liberado para o escritório", { exact: true }),
    ).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: /^Fechar$/i }).click();

    const activeSubscriptionCard = page
      .getByTestId("tenant-pacote-subscription-card")
      .filter({ hasText: PACKAGE_NAME })
      .first();

    await expect(activeSubscriptionCard).toBeVisible({ timeout: 15000 });
    await expect(activeSubscriptionCard).toContainText(/Pago|Ativa/i);

    const activeCatalogCard = page
      .getByTestId("tenant-pacote-card")
      .filter({ hasText: PACKAGE_NAME })
      .first();

    await expect(activeCatalogCard).toContainText("Este pacote já está ativo");

    await page.goto("/configuracoes/billing");
    await expect(
      page.getByRole("heading", { name: /Billing da conta/i }),
    ).toBeVisible();
    await expect(
      page.getByText(`Pacote premium · ${PACKAGE_NAME}`),
    ).toBeVisible({ timeout: 15000 });
  });

  test("tenant salba vê a vitrine, mas não herda a compra feita pelo rvb", async ({
    page,
  }) => {
    await login(page, TENANTS.salba);

    await page.goto("/juizes/pacotes");
    const packageCard = page
      .getByTestId("tenant-pacote-card")
      .filter({ hasText: PACKAGE_NAME })
      .first();

    await expect(packageCard).toBeVisible({ timeout: 15000 });
    await expect(packageCard).toContainText(/Disponível|Promocional/i);
    await expect(
      packageCard.getByRole("button", { name: /Comprar pacote/i }),
    ).toBeVisible();

    await page.goto("/configuracoes/billing");
    await expect(
      page.getByText(`Pacote premium · ${PACKAGE_NAME}`),
    ).toHaveCount(0);
  });

  test("super admin acompanha a venda recente no painel global", async ({
    page,
  }) => {
    await login(page, {
      email: SUPER_ADMIN_EMAIL,
      password: SUPER_ADMIN_PASSWORD,
    });

    await page.goto("/admin/pacotes");

    const salesRow = page
      .getByTestId("admin-pacote-subscription-row")
      .filter({ hasText: PACKAGE_NAME })
      .first();

    await expect(salesRow).toBeVisible({ timeout: 15000 });
    await expect(salesRow).toContainText(/rvb|RVB Advocacia/i);
    await expect(salesRow).toContainText(/ATIVA|PAGA/i);
  });

  test("tenant sandra continua vendo o histórico existente sem regressão", async ({
    page,
  }) => {
    await login(page, TENANTS.sandra);

    await page.goto("/juizes/pacotes");
    await expect(
      page.getByRole("heading", { name: /Loja interna de autoridades/i }),
    ).toBeVisible();
    await expect(
      page.getByTestId("tenant-pacote-subscription-card").first(),
    ).toBeVisible();
  });
});
