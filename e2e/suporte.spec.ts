import { expect, test, type Locator, type Page } from "@playwright/test";

const TENANT_ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || "sandra@adv.br";
const TENANT_ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || "Sandra@123";
const TENANT_SLUG = process.env.TEST_TENANT_SLUG || "sandra";

const SUPER_ADMIN_EMAIL =
  process.env.TEST_SUPER_ADMIN_EMAIL || "robsonnonatoiii@gmail.com";
const SUPER_ADMIN_PASSWORD =
  process.env.TEST_SUPER_ADMIN_PASSWORD || "Robson123!";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+Xl7sAAAAASUVORK5CYII=",
  "base64",
);
const TENANT_INITIAL_DESCRIPTION =
  "Não conseguimos anexar comprovante no processo 8154973-16.2024.8.05.0001. O upload retorna erro ao concluir.";
const TENANT_CHAT_MESSAGE =
  "Ao enviar um PDF de 12MB no processo 8154973-16.2024.8.05.0001, o sistema retorna 'arquivo excede limite'. Podem orientar o procedimento correto?";
const SUPPORT_INTERNAL_NOTE =
  "Análise interna: validar limite de upload por tenant e checar compressão automática no pipeline de anexos.";
const SUPPORT_PUBLIC_REPLY =
  "Ajustamos o fluxo de upload para este caso. Faça novo envio com PDF até 10MB ou divida em anexos complementares. Se persistir, responda com horário e navegador utilizado.";
const SUPPORT_CLOSURE_SUMMARY =
  "Cliente orientado com limite e alternativa de anexos complementares. Atendimento concluído sem pendências técnicas abertas.";

function randomTicketTitle(): string {
  return `E2E Suporte ${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
}

async function setInternalSwitch(modal: Locator, value: boolean): Promise<void> {
  const toggle = modal.getByRole("switch", { name: /Mensagem interna da equipe/i });
  const isChecked = (await toggle.getAttribute("aria-checked")) === "true";

  if (isChecked !== value) {
    await toggle.click();
  }
}

async function openTenantThread(page: Page, title: string): Promise<Locator> {
  const threadModal = page.getByRole("dialog").filter({ hasText: title });
  try {
    await expect(threadModal).toBeVisible({ timeout: 4000 });
    return threadModal;
  } catch {
    // segue fluxo de abertura manual pela lista
  }

  await page.getByPlaceholder("Buscar por título, descrição ou e-mail").fill(title);
  const ticketCardButton = page
    .getByRole("button", { name: new RegExp(title, "i") })
    .first();
  await expect(ticketCardButton).toBeVisible({ timeout: 15000 });
  await ticketCardButton.click();
  await expect(threadModal).toBeVisible({ timeout: 15000 });
  return threadModal;
}

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

async function loginTenantAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");

  await page.fill('input[name="email"], input[type="email"]', TENANT_ADMIN_EMAIL);
  await page.fill(
    'input[name="password"], input[type="password"]',
    TENANT_ADMIN_PASSWORD,
  );

  const tenantSlugField = page.getByLabel("Escritório (slug/domínio)");
  if (await tenantSlugField.isVisible().catch(() => false)) {
    await tenantSlugField.fill(TENANT_SLUG);
  }

  await submitLogin(page);
}

async function loginSuperAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");

  await page.fill('input[name="email"], input[type="email"]', SUPER_ADMIN_EMAIL);
  await page.fill(
    'input[name="password"], input[type="password"]',
    SUPER_ADMIN_PASSWORD,
  );

  const tenantSlugField = page.getByLabel("Escritório (slug/domínio)");
  if (await tenantSlugField.isVisible().catch(() => false)) {
    await tenantSlugField.fill("");
  }

  await submitLogin(page);
}

test.describe.serial("Modulo de Suporte E2E", () => {
  test.describe.configure({ timeout: 120000 });

  let createdTicketTitle = "";

  test("tenant abre ticket com imagem e envia mensagem", async ({ page }) => {
    createdTicketTitle = randomTicketTitle();

    await loginTenantAdmin(page);
    await page.goto("/suporte");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByText("Suporte").first()).toBeVisible();
    await page.getByRole("button", { name: /Novo ticket/i }).click();

    const createModal = page
      .getByRole("dialog")
      .filter({ hasText: "Novo ticket de suporte" });
    await expect(createModal).toBeVisible();

    await createModal.getByLabel("Título").fill(createdTicketTitle);
    await createModal.getByLabel("Descrição").fill(TENANT_INITIAL_DESCRIPTION);
    await createModal.locator('input[type="file"]').setInputFiles([
      {
        name: "ticket-e2e.png",
        mimeType: "image/png",
        buffer: ONE_PIXEL_PNG,
      },
    ]);
    await expect(createModal.getByText("ticket-e2e.png")).toBeVisible();
    await createModal.getByRole("button", { name: /Abrir ticket/i }).click();

    const threadModal = await openTenantThread(page, createdTicketTitle);
    await threadModal
      .getByPlaceholder("Escreva sua mensagem para o suporte")
      .fill(TENANT_CHAT_MESSAGE);
    await threadModal.locator('input[type="file"]').setInputFiles([
      {
        name: "mensagem-e2e.png",
        mimeType: "image/png",
        buffer: ONE_PIXEL_PNG,
      },
    ]);
    await expect(threadModal.getByText("mensagem-e2e.png")).toBeVisible();
    await threadModal.getByRole("button", { name: /Enviar mensagem/i }).click();

    await expect(threadModal.getByText(TENANT_CHAT_MESSAGE)).toBeVisible();
  });

  test("super admin visualiza ticket na fila global e abre conversa", async ({ page }) => {
    test.skip(!createdTicketTitle, "Ticket E2E não foi criado no passo anterior.");

    await loginSuperAdmin(page);
    await page.goto("/admin/suporte");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByText("Suporte operacional").first()).toBeVisible();
    await page
      .getByPlaceholder("Buscar por ticket, tenant, e-mail ou título")
      .fill(createdTicketTitle);

    const cardTitle = page.getByText(createdTicketTitle, { exact: true }).first();
    await expect(cardTitle).toBeVisible();
    await cardTitle.click();

    const threadModal = page.getByRole("dialog").filter({ hasText: createdTicketTitle });
    await expect(threadModal).toBeVisible();
    await expect(threadModal.getByText(TENANT_CHAT_MESSAGE)).toBeVisible();

    const assumeButton = threadModal.getByRole("button", { name: /Assumir chat agora/i });
    if (await assumeButton.isVisible().catch(() => false)) {
      await assumeButton.click();
    }

    await setInternalSwitch(threadModal, true);
    await threadModal.getByPlaceholder("Responder ticket").fill(SUPPORT_INTERNAL_NOTE);
    await threadModal.getByRole("button", { name: /Enviar resposta/i }).click();
    await expect(threadModal.getByText(SUPPORT_INTERNAL_NOTE)).toBeVisible();
    await expect(threadModal.getByText("Interna").first()).toBeVisible();

    await setInternalSwitch(threadModal, false);
    await threadModal.getByPlaceholder("Responder ticket").fill(SUPPORT_PUBLIC_REPLY);
    await threadModal.getByRole("button", { name: /Enviar resposta/i }).click();
    await expect(threadModal.getByText(SUPPORT_PUBLIC_REPLY)).toBeVisible();

    await threadModal.getByRole("button", { name: /Tela cheia/i }).click();
    await page.waitForURL(/\/admin\/suporte\/chat\//, { timeout: 15000 });
    await expect(page.getByText(createdTicketTitle, { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Fechar atendimento").first()).toBeVisible();
    await page.getByLabel("Resumo do fechamento").fill(SUPPORT_CLOSURE_SUMMARY);
    await page.getByRole("button", { name: /Finalizar atendimento/i }).click();
    await expect(page.getByText("Chat finalizado").first()).toBeVisible();
    await expect(page.getByText(SUPPORT_CLOSURE_SUMMARY).first()).toBeVisible();
  });

  test("tenant visualiza resposta pública do suporte", async ({ page }) => {
    test.skip(!createdTicketTitle, "Ticket E2E não foi criado no passo anterior.");

    await loginTenantAdmin(page);
    await page.goto("/suporte");
    await page.waitForLoadState("domcontentloaded");

    const threadModal = await openTenantThread(page, createdTicketTitle);
    await expect(threadModal.getByText(SUPPORT_PUBLIC_REPLY)).toBeVisible();
    await expect(threadModal.getByText("Chat finalizado pelo suporte").first()).toBeVisible();
    await expect(threadModal.getByText(SUPPORT_CLOSURE_SUMMARY).first()).toBeVisible();
  });
});
