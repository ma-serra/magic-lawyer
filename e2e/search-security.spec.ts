import { test, expect, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";

import { PrismaClient } from "../generated/prisma";
import { loginAsRole, loginAsUser } from "./helpers/auth";

const prisma = new PrismaClient();

const SUPER_ADMIN_EMAIL =
  process.env.TEST_SUPER_ADMIN_EMAIL ?? "superadmin.e2e@magiclawyer.local";
const SUPER_ADMIN_PASSWORD =
  process.env.TEST_SUPER_ADMIN_PASSWORD ?? "SuperAdmin@123";

const OUTRO_TENANT_PROCESSO = "0000025-13.2026.8.26.462";
const CLIENTE_RESTRITO_SANDRA = "ALDO JOSE BATISTA DE JESUS";
const PROCESSO_CLIENTE_LOGADO = "8154973-16.2024.8.05.0001";
const EMAIL_USUARIO_INTERNO = "jaqueline.souza@sandraadv.br";

async function openGlobalSearch(page: Page) {
  const dialog = page.locator('[role="dialog"]').last();
  const existingInput = dialog.getByPlaceholder(
    "Buscar processos, clientes, documentos...",
  );
  const alreadyOpen = await existingInput
    .isVisible({ timeout: 800 })
    .catch(() => false);

  if (alreadyOpen) {
    return { dialog, input: existingInput };
  }

  const headerSearch = page
    .getByPlaceholder("Buscar processos, clientes, documentos, juízes...")
    .first();

  await expect(headerSearch).toBeVisible({ timeout: 15000 });
  await headerSearch.click();

  const input = dialog.getByPlaceholder(
    "Buscar processos, clientes, documentos...",
  );

  await expect(input).toBeVisible({ timeout: 10000 });

  return { dialog, input };
}

async function runSearch(page: Page, term: string) {
  const { dialog, input } = await openGlobalSearch(page);

  await input.fill("");
  await input.fill(term);
  await page.waitForTimeout(900);
  await expect(dialog.getByText("Buscando...")).toHaveCount(0, {
    timeout: 20000,
  }).catch(() => null);

  return { dialog };
}

test.describe("Busca global - segurança de escopo", () => {
  test.beforeAll(async () => {
    const passwordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10);

    await prisma.superAdmin.upsert({
      where: {
        email: SUPER_ADMIN_EMAIL,
      },
      update: {
        firstName: "Super",
        lastName: "Admin E2E",
        passwordHash,
        status: "ACTIVE",
      },
      create: {
        email: SUPER_ADMIN_EMAIL,
        firstName: "Super",
        lastName: "Admin E2E",
        passwordHash,
        status: "ACTIVE",
      },
    });
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("ADMIN: mantém escopo do tenant e pode buscar usuários internos", async ({
    page,
  }) => {
    await loginAsRole(page, "ADMIN");
    await page.goto("/dashboard");

    let search = await runSearch(page, OUTRO_TENANT_PROCESSO);
    await expect(
      search.dialog.locator("button").filter({ hasText: OUTRO_TENANT_PROCESSO }),
    ).toHaveCount(0);

    search = await runSearch(page, CLIENTE_RESTRITO_SANDRA);
    await expect(
      search.dialog
        .locator("button")
        .filter({ hasText: CLIENTE_RESTRITO_SANDRA })
        .first(),
    ).toBeVisible();

    search = await runSearch(page, EMAIL_USUARIO_INTERNO);
    await expect(
      search.dialog
        .locator("button")
        .filter({ hasText: EMAIL_USUARIO_INTERNO })
        .first(),
    ).toBeVisible();
    await expect(
      search.dialog.locator("button span").filter({ hasText: /^Usuário$/ }).first(),
    ).toBeVisible();
  });

  test("ADVOGADO: mantém escopo do tenant e não recebe resultados de usuários internos", async ({
    page,
  }) => {
    await loginAsRole(page, "ADVOGADO");
    await page.goto("/dashboard");

    let search = await runSearch(page, OUTRO_TENANT_PROCESSO);
    await expect(
      search.dialog.locator("button").filter({ hasText: OUTRO_TENANT_PROCESSO }),
    ).toHaveCount(0);

    search = await runSearch(page, EMAIL_USUARIO_INTERNO);
    await expect(
      search.dialog.locator("button").filter({ hasText: EMAIL_USUARIO_INTERNO }),
    ).toHaveCount(0);
    await expect(
      search.dialog.locator("button span").filter({ hasText: /^Usuário$/ }),
    ).toHaveCount(0);
  });

  test("CLIENTE: só enxerga próprios dados, sem outros clientes do tenant", async ({
    page,
  }) => {
    await loginAsRole(page, "CLIENTE");
    await page.goto("/dashboard");

    let search = await runSearch(page, PROCESSO_CLIENTE_LOGADO);
    await expect(
      search.dialog
        .locator("button")
        .filter({ hasText: PROCESSO_CLIENTE_LOGADO })
        .first(),
    ).toBeVisible();

    search = await runSearch(page, CLIENTE_RESTRITO_SANDRA);
    await expect(
      search.dialog.locator("button").filter({ hasText: CLIENTE_RESTRITO_SANDRA }),
    ).toHaveCount(0);

    search = await runSearch(page, OUTRO_TENANT_PROCESSO);
    await expect(
      search.dialog.locator("button").filter({ hasText: OUTRO_TENANT_PROCESSO }),
    ).toHaveCount(0);
  });

  test("SUPER_ADMIN: busca retorna apenas agregados por tenant (sem dados sensíveis)", async ({
    page,
  }) => {
    await loginAsUser(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    await page.goto("/admin/dashboard");

    const search = await runSearch(page, "sandra");

    await expect(
      search.dialog
        .locator("button")
        .filter({ hasText: "Souza Costa Advogados Associados" })
        .first(),
    ).toBeVisible();
    await expect(
      search.dialog.locator("button span").filter({ hasText: /^Tenant$/ }).first(),
    ).toBeVisible();
    await expect(
      search.dialog.locator("button span").filter({ hasText: /^Processo$/ }),
    ).toHaveCount(0);
    await expect(
      search.dialog.locator("button span").filter({ hasText: /^Cliente$/ }),
    ).toHaveCount(0);
  });
});
