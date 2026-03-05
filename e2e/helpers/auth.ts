import { Page } from "@playwright/test";

const DEFAULT_CREDENTIALS = {
  ADMIN: {
    email: "sandra@adv.br",
    password: "Sandra@123",
  },
  ADVOGADO: {
    email: "luciano.santos@adv.br",
    password: "Luciano@123",
  },
  SECRETARIA: {
    email: "souzacostaadv@hotmail.com",
    password: "Funcionario@123",
  },
  FINANCEIRO: {
    email: "financeiro@test.com",
    password: "financeiro123",
  },
  CLIENTE: {
    email: "magiclawyersaas@gmail.com",
    password: "Robson123!",
  },
} as const;

type Role = "ADMIN" | "ADVOGADO" | "SECRETARIA" | "FINANCEIRO" | "CLIENTE";

async function fillLoginForm(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.fill('input[name="email"], input[type="email"]', email);
  await page.fill('input[name="password"], input[type="password"]', password);

  const tenantSlug = process.env.TEST_TENANT_SLUG;
  if (tenantSlug) {
    const slugField = page.locator(
      'input[name="tenantSlug"], input[name="slug"], input[placeholder*="meu-escritorio"]',
    );

    if (await slugField.first().isVisible().catch(() => false)) {
      await slugField.first().fill(tenantSlug);
    }
  }
}

async function clickLoginSubmit(page: Page): Promise<void> {
  const submitByLabel = page
    .getByRole("button", { name: /^Entrar no sistema$/i })
    .first();
  const hasSubmitByLabel = await submitByLabel
    .isVisible({ timeout: 3000 })
    .catch(() => false);

  if (hasSubmitByLabel) {
    await submitByLabel.click();
    return;
  }

  const submitByType = page.locator('button[type="submit"]').first();
  const hasSubmitByType = await submitByType
    .isVisible({ timeout: 3000 })
    .catch(() => false);

  if (hasSubmitByType) {
    await submitByType.click();
    return;
  }

  const submitByEntrar = page.getByRole("button", { name: /^Entrar$/i }).first();
  const hasSubmitByEntrar = await submitByEntrar
    .isVisible({ timeout: 2000 })
    .catch(() => false);

  if (hasSubmitByEntrar) {
    await submitByEntrar.click();
    return;
  }

  throw new Error("Não foi possível localizar o botão de submit do login.");
}

/**
 * Helper para fazer login no sistema
 */
export async function loginAsUser(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");

  await fillLoginForm(page, email, password);

  await clickLoginSubmit(page);

  try {
    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 20000,
    });
  } catch {
    const bodyText = (
      (await page.textContent("body").catch(() => "")) || ""
    ).toLowerCase();
    const loginErrorHint = [
      "inválid",
      "invalido",
      "credencial",
      "erro",
      "acesso",
      "primeiro acesso",
    ].find((pattern) => bodyText.includes(pattern));

    throw new Error(
      `Falha no login E2E para ${email}. URL final: ${page.url()}.` +
        (loginErrorHint ? ` Sinal detectado: ${loginErrorHint}.` : ""),
    );
  }

  await page.waitForLoadState("domcontentloaded");
}

/**
 * Helper para fazer login como ADMIN
 * Assume que existe um usuário ADMIN com email e senha padrão
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  const adminEmail = process.env.TEST_ADMIN_EMAIL || DEFAULT_CREDENTIALS.ADMIN.email;
  const adminPassword =
    process.env.TEST_ADMIN_PASSWORD || DEFAULT_CREDENTIALS.ADMIN.password;

  await loginAsUser(page, adminEmail, adminPassword);
}

/**
 * Helper para fazer login como usuário específico por role
 */
export async function loginAsRole(
  page: Page,
  role: Role,
): Promise<void> {
  const roleEmails: Record<string, string> = {
    ADMIN: process.env.TEST_ADMIN_EMAIL || DEFAULT_CREDENTIALS.ADMIN.email,
    ADVOGADO:
      process.env.TEST_ADVOGADO_EMAIL || DEFAULT_CREDENTIALS.ADVOGADO.email,
    SECRETARIA:
      process.env.TEST_SECRETARIA_EMAIL || DEFAULT_CREDENTIALS.SECRETARIA.email,
    FINANCEIRO:
      process.env.TEST_FINANCEIRO_EMAIL || DEFAULT_CREDENTIALS.FINANCEIRO.email,
    CLIENTE: process.env.TEST_CLIENTE_EMAIL || DEFAULT_CREDENTIALS.CLIENTE.email,
  };

  const rolePasswords: Record<string, string> = {
    ADMIN: process.env.TEST_ADMIN_PASSWORD || DEFAULT_CREDENTIALS.ADMIN.password,
    ADVOGADO:
      process.env.TEST_ADVOGADO_PASSWORD || DEFAULT_CREDENTIALS.ADVOGADO.password,
    SECRETARIA:
      process.env.TEST_SECRETARIA_PASSWORD || DEFAULT_CREDENTIALS.SECRETARIA.password,
    FINANCEIRO:
      process.env.TEST_FINANCEIRO_PASSWORD || DEFAULT_CREDENTIALS.FINANCEIRO.password,
    CLIENTE:
      process.env.TEST_CLIENTE_PASSWORD || DEFAULT_CREDENTIALS.CLIENTE.password,
  };

  await loginAsUser(page, roleEmails[role], rolePasswords[role]);
}

/**
 * Helper para fazer logout
 */
export async function logout(page: Page): Promise<void> {
  // Tentar encontrar botão de logout (pode estar em menu dropdown)
  const logoutButton = page.locator(
    'button:has-text("Sair"), button:has-text("Logout"), [data-testid="logout"]',
  );

  if (await logoutButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await logoutButton.click();
    await page.waitForURL((url) => url.pathname.includes("/login"), {
      timeout: 5000,
    });
  } else {
    // Se não encontrar botão, navegar diretamente para logout
    await page.goto("/api/auth/signout");
    await page.waitForURL((url) => url.pathname.includes("/login"), {
      timeout: 5000,
    });
  }
}
