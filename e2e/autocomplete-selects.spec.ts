import { expect, test, type Locator, type Page } from "@playwright/test";

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || "sandra@adv.br";
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || "Sandra@123";

async function loginAsAdminForE2E(page: Page): Promise<void> {
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  await page.fill('input[name="email"], input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[name="password"], input[type="password"]', ADMIN_PASSWORD);

  const slugField = page.getByLabel("Escritório (slug/domínio)");
  if (await slugField.isVisible().catch(() => false)) {
    await slugField.fill("sandra");
  }

  const submitButton = page.getByRole("button", { name: /^Entrar no sistema$/i });
  await submitButton.first().click();

  try {
    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 60000,
    });
  } catch {
    const bodyText = ((await page.textContent("body").catch(() => "")) || "").toLowerCase();
    throw new Error(
      `Falha ao autenticar no fluxo E2E. URL final: ${page.url()}.` +
        (bodyText ? ` Trecho da tela: ${bodyText.slice(0, 240)}` : ""),
    );
  }

  await page.waitForLoadState("domcontentloaded");
}

async function pickFirstAutocompleteOption(
  page: Page,
  field: Locator,
): Promise<string> {
  await expect(field).toBeVisible();
  await field.click();
  await field.fill("a");
  await page.waitForTimeout(300);

  const option = page.getByRole("option").first();
  const optionVisible = await option.isVisible({ timeout: 2000 }).catch(() => false);

  if (optionVisible) {
    await option.click();
  } else {
    await field.press("ArrowDown");
    await page.waitForTimeout(200);
    await field.press("Enter");
  }

  await expect(field).not.toHaveValue("");

  return (await field.inputValue()).trim();
}

async function triggerHeroButton(button: Locator): Promise<void> {
  await expect(button).toBeVisible();
  await button.scrollIntoViewIfNeeded();
  await button.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
}

test.describe("Autocomplete de entidades", () => {
  test.describe.configure({ timeout: 180000 });

  test.beforeEach(async ({ page }) => {
    await loginAsAdminForE2E(page);
  });

  test("processo novo usa autocomplete para entidades principais", async ({
    page,
  }) => {
    await page.goto("/processos/novo", { waitUntil: "domcontentloaded" });

    const cliente = page.getByLabel(/^Cliente \*$/i).first();
    const autoridade = page.getByLabel(/^Autoridade do Caso \*$/i).first();
    const tribunal = page.getByLabel(/^Tribunal \*$/i).first();
    const advogado = page.getByLabel(/^Advogado Responsável$/i).first();

    await pickFirstAutocompleteOption(page, cliente);
    await expect(autoridade).toBeVisible();
    await expect(tribunal).toBeVisible();
    await expect(advogado).toBeVisible();
  });

  test("agenda usa autocomplete nos relacionamentos do evento", async ({
    page,
  }) => {
    await page.goto("/agenda", { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: /Novo Evento/i }).first().click();

    const modal = page.getByTestId("evento-form-modal");
    await expect(modal).toBeVisible();

    const cliente = modal.getByLabel(/^Cliente$/i).first();
    const processo = modal.getByLabel(/^Processo$/i).first();
    const advogado = modal.getByLabel(/Advogado Responsável/i).first();

    await expect(processo).toBeDisabled();
    await pickFirstAutocompleteOption(page, cliente);
    await expect(processo).toBeEnabled();
    await expect(advogado).toBeVisible();
  });

  test("contratos e procuracoes expõem autocompletes de cliente e modelo", async ({
    page,
  }) => {
    await page.goto("/contratos/novo", { waitUntil: "domcontentloaded" });

    await pickFirstAutocompleteOption(page, page.getByLabel(/^Cliente \*$/i).first());
    await expect(page.getByLabel(/^Tipo de contrato$/i).first()).toBeVisible();
    await expect(page.getByLabel(/^Modelo de contrato$/i).first()).toBeVisible();

    await page.goto("/procuracoes/novo", { waitUntil: "domcontentloaded" });

    await pickFirstAutocompleteOption(page, page.getByLabel(/^Cliente \*$/i).first());
    await expect(page.getByLabel(/^Modelo de Procuração$/i).first()).toBeVisible();
  });

  test("diligencias usam autocomplete em vínculos operacionais", async ({
    page,
  }) => {
    await page.goto("/diligencias", { waitUntil: "domcontentloaded" });

    const diligenciasFilterCliente = page.getByLabel(/^Cliente$/i).first();
    const diligenciasFilterProcesso = page.getByLabel(/^Processo$/i).first();
    const diligenciasFilterResponsavel = page.getByLabel(/Responsável/i).first();

    await expect(diligenciasFilterCliente).toBeVisible();
    await expect(diligenciasFilterProcesso).toBeVisible();
    await expect(diligenciasFilterResponsavel).toBeVisible();

    await pickFirstAutocompleteOption(page, diligenciasFilterCliente);
    await expect(diligenciasFilterProcesso).toBeVisible();
  });

  test("recibos mantém filtros pesquisáveis por cliente, processo e advogado", async ({
    page,
  }) => {
    await page.goto("/financeiro/recibos", { waitUntil: "domcontentloaded" });

    const toggleFiltros = page.getByTestId("recibos-toggle-filters");
    await triggerHeroButton(toggleFiltros);

    const cliente = page.getByRole("combobox", {
      name: /Selecione um cliente/i,
    });
    const processo = page.getByRole("combobox", {
      name: /Selecione um processo/i,
    });
    const advogado = page.getByRole("combobox", {
      name: /Selecione um advogado/i,
    });

    await expect(cliente).toBeVisible();
    await expect(processo).toBeVisible();
    await expect(advogado).toBeVisible();

    await cliente.fill("a");
    await expect(cliente).toHaveValue("a");
  });
});
