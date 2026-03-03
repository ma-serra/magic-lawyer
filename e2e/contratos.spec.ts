import { expect, test, type Locator, type Page } from "@playwright/test";

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || "sandra@adv.br";
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || "Sandra@123";

function randomSlug(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
}

async function getPrimeiroClienteId(page: Page): Promise<string | null> {
  await page.goto("/clientes");
  await page.waitForLoadState("networkidle");

  const href = await page.evaluate(() => {
    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href^="/clientes/"]'),
    );

    for (const link of links) {
      const value = link.getAttribute("href") || "";

      if (/^\/clientes\/[^/]+$/.test(value)) {
        return value;
      }
    }

    return null;
  });

  if (!href) {
    return null;
  }

  return href.replace("/clientes/", "");
}

async function loginAsAdminForE2E(page: Page): Promise<void> {
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");

  const quickLoginButton = page.getByRole("button", { name: /^Logar$/i }).first();
  const hasQuickLogin = await quickLoginButton.isVisible({ timeout: 10000 }).catch(
    () => false,
  );

  if (hasQuickLogin) {
    try {
      await quickLoginButton.click();
      await page.waitForURL((url) => !url.pathname.includes("/login"), {
        timeout: 20000,
      });
      await page.waitForLoadState("networkidle");

      return;
    } catch {
      await page.goto("/login");
      await page.waitForLoadState("domcontentloaded");
    }
  }

  await page.fill('input[name="email"], input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[name="password"], input[type="password"]', ADMIN_PASSWORD);

  const slugField = page.getByLabel("Escritório (slug/domínio)");
  if (await slugField.isVisible().catch(() => false)) {
    await slugField.fill("sandra");
  }

  await page
    .getByRole("button", { name: /Entrar no sistema/i })
    .click();

  try {
    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 20000,
    });
  } catch {
    const retryQuickLogin = page.getByRole("button", { name: /^Logar$/i }).first();
    if (await retryQuickLogin.isVisible().catch(() => false)) {
      await retryQuickLogin.click();
      await page.waitForURL((url) => !url.pathname.includes("/login"), {
        timeout: 20000,
      });
    } else {
      throw new Error("Falha ao autenticar no fluxo E2E.");
    }
  }

  await page.waitForLoadState("networkidle");
}

function contratoCardByTitle(page: Page, titulo: string): Locator {
  return page
    .locator("div.rounded-2xl, div[class*='card'], div")
    .filter({ has: page.getByRole("heading", { name: titulo, exact: true }) })
    .first();
}

async function openContratoActions(
  page: Page,
  titulo: string,
  optionLabel: RegExp,
): Promise<void> {
  const card = contratoCardByTitle(page, titulo);
  await expect(card).toBeVisible();
  await card.scrollIntoViewIfNeeded();

  const heading = page.getByRole("heading", { name: titulo, exact: true });
  const trigger = heading
    .locator(
      "xpath=ancestor::div[contains(@class,'flex items-start justify-between')][1]//button",
    )
    .first();

  await expect(trigger).toBeVisible();
  await trigger.click({ force: true });

  const option = page.getByRole("menuitem", { name: optionLabel }).first();
  const isVisible = await option.isVisible({ timeout: 3000 }).catch(() => false);
  if (!isVisible) {
    await trigger.press("Enter");
  }
  await expect(option).toBeVisible();
}

async function openModeloActions(
  page: Page,
  nomeModelo: string,
  optionLabel: RegExp,
): Promise<void> {
  const card = page
    .locator("div")
    .filter({ has: page.getByText(nomeModelo, { exact: true }) })
    .filter({ has: page.getByRole("button", { name: "Visualizar" }) })
    .first();

  await expect(card).toBeVisible();
  await card.scrollIntoViewIfNeeded();

  const title = page.getByText(nomeModelo, { exact: true }).first();
  const trigger = title
    .locator(
      "xpath=ancestor::div[contains(@class,'items-start justify-between')][1]//button",
    )
    .first();
  await expect(trigger).toBeVisible();
  await trigger.click({ force: true });

  const option = page.getByRole("menuitem", { name: optionLabel }).first();
  const isVisible = await option.isVisible({ timeout: 3000 }).catch(() => false);
  if (!isVisible) {
    await trigger.press("Enter");
  }
  await expect(option).toBeVisible();
}

test.describe.serial("Modulo de Contratos E2E", () => {
  test.describe.configure({ timeout: 120000 });

  test.beforeEach(async ({ page }) => {
    await loginAsAdminForE2E(page);
  });

  test("smoke de navegação dos contratos e modelos", async ({ page }) => {
    await page.goto("/contratos");
    await expect(page.getByText("Contratos").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Novo Contrato/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Modelos de Contrato/i }),
    ).toBeVisible();

    await page.goto("/contratos/novo");
    await expect(page.getByText("Novo Contrato").first()).toBeVisible();
    await expect(page.getByLabel(/Título do Contrato/i)).toBeVisible();
    await expect(page.getByText("Tipo de contrato").first()).toBeVisible();
    await expect(page.getByText("Modelo de contrato").first()).toBeVisible();
    await expect(page.getByText("Período do contrato").first()).toBeVisible();

    await page.goto("/contratos/modelos");
    await expect(page.getByText("Modelos de Contrato").first()).toBeVisible();
    await page.getByRole("button", { name: /Novo modelo/i }).first().click();
    await expect(page.getByText("Novo modelo de contrato")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("fluxo completo de contratos: criar, detalhar, editar e excluir", async ({
    page,
  }) => {
    const clienteId = await getPrimeiroClienteId(page);
    test.skip(!clienteId, "Sem cliente disponível para criação de contrato.");

    const tituloInicial = randomSlug("E2E Contrato");
    const tituloAtualizado = `${tituloInicial} Editado`;

    await page.goto(`/contratos/novo?clienteId=${clienteId}`);
    await expect(page.getByText("Novo Contrato").first()).toBeVisible();
    await page.getByLabel(/Título do Contrato/i).fill(tituloInicial);
    await page.getByLabel("Resumo").fill("Contrato criado via Playwright E2E.");
    await page.getByRole("button", { name: /Criar Contrato/i }).click();

    await page.waitForLoadState("networkidle");
    await page.goto("/contratos");
    await expect(page.getByText("Contratos").first()).toBeVisible();

    const busca = page.getByPlaceholder("Buscar por título, cliente ou resumo...");
    await busca.fill(tituloInicial);
    await page.waitForTimeout(400);

    await expect(page.getByRole("heading", { name: tituloInicial })).toBeVisible();

    await openContratoActions(page, tituloInicial, /Ver detalhes/i);
    const detailsItem = page.getByRole("menuitem", { name: /Ver detalhes/i }).first();
    const detailsHref = await detailsItem.getAttribute("href");
    expect(detailsHref).toBeTruthy();
    await page.goto(detailsHref!);
    await page.waitForURL(/\/contratos\/[^/]+$/);
    await expect(page.getByText("Visualização do contrato")).toBeVisible();

    await page.getByRole("button", { name: /Editar Contrato/i }).click();
    await page.waitForURL(/\/contratos\/[^/]+\/editar$/);
    await expect(page.getByText("Editar Contrato")).toBeVisible();
    await page.getByLabel(/Título do Contrato/i).fill(tituloAtualizado);
    await page.getByRole("button", { name: /Salvar Alterações/i }).click();

    await page.waitForURL(/\/contratos\/[^/]+$/);
    await expect(page.getByText(tituloAtualizado).first()).toBeVisible();

    await page.goto("/contratos");
    await busca.fill(tituloAtualizado);
    await page.waitForTimeout(400);
    await expect(page.getByRole("heading", { name: tituloAtualizado })).toBeVisible();

    await openContratoActions(page, tituloAtualizado, /^Excluir$/i);
    await page
      .getByRole("menuitem", { name: /^Excluir$/i })
      .first()
      .evaluate((el) => {
        (el as HTMLElement).click();
      });
    await expect(page.getByText("Excluir contrato")).toBeVisible();
    await page
      .locator("button")
      .filter({ hasText: /^Excluir$/ })
      .last()
      .click();

    await expect(page.getByText("Excluir contrato")).not.toBeVisible();
    await page.waitForTimeout(500);
    await busca.fill(tituloAtualizado);
    await page.waitForTimeout(400);
    await expect(page.getByRole("heading", { name: tituloAtualizado })).toHaveCount(0);
  });

  test("fluxo completo de modelos: criar, visualizar, editar e excluir", async ({
    page,
  }) => {
    const nomeModelo = randomSlug("E2E Modelo Contrato");
    const nomeModeloEditado = `${nomeModelo} Atualizado`;

    await page.goto("/contratos/modelos");
    await expect(page.getByText("Modelos de Contrato").first()).toBeVisible();

    await page.getByRole("button", { name: /Novo modelo/i }).first().click();
    await expect(page.getByText("Novo modelo de contrato")).toBeVisible();
    const createModal = page
      .getByRole("dialog")
      .filter({ hasText: "Novo modelo de contrato" })
      .first();

    await createModal.getByLabel("Nome").fill(nomeModelo);
    await createModal
      .getByLabel("Descrição")
      .fill("Modelo de contrato criado por teste automatizado.");
    await createModal
      .getByLabel("Conteúdo")
      .fill("CONTRATO DE PRESTAÇÃO DE SERVIÇOS\n\nPartes ajustadas por teste E2E.");
    await createModal.getByRole("button", { name: /^Salvar$/i }).click();

    await expect(page.getByText("Novo modelo de contrato")).not.toBeVisible();
    await expect(page.getByText(nomeModelo, { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Visualizar" }).first().click();
    await expect(page.getByText("Detalhes do modelo")).toBeVisible();
    await page.getByRole("button", { name: "Fechar" }).click();

    const card = page
      .locator("div")
      .filter({ has: page.getByText(nomeModelo, { exact: true }) })
      .filter({ has: page.getByRole("button", { name: "Editar" }) })
      .first();
    await card.getByRole("button", { name: "Editar" }).first().click();

    await expect(page.getByText("Editar modelo de contrato")).toBeVisible();
    const editModal = page
      .getByRole("dialog")
      .filter({ hasText: "Editar modelo de contrato" })
      .first();
    await editModal.getByLabel("Nome").fill(nomeModeloEditado);
    await editModal.getByRole("button", { name: /Salvar alterações/i }).click();

    await expect(page.getByText("Editar modelo de contrato")).not.toBeVisible();
    await expect(page.getByText(nomeModeloEditado, { exact: true }).first()).toBeVisible();

    await openModeloActions(page, nomeModeloEditado, /^Excluir$/i);
    await page
      .getByRole("menuitem", { name: /^Excluir$/i })
      .first()
      .evaluate((el) => {
        (el as HTMLElement).click();
      });
    await expect(page.getByText("Confirmar exclusão")).toBeVisible();
    await page
      .locator("button")
      .filter({ hasText: /^Excluir$/ })
      .last()
      .click();

    await expect(page.getByText("Confirmar exclusão")).not.toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.getByText(nomeModeloEditado, { exact: true })).toHaveCount(0);
  });
});
