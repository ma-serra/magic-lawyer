import { expect, test } from "@playwright/test";

import { loginAsUser } from "./helpers/auth";

const SUPER_ADMIN_EMAIL =
  process.env.TEST_SUPER_ADMIN_EMAIL || "robsonnonatoiii@gmail.com";
const SUPER_ADMIN_PASSWORD =
  process.env.TEST_SUPER_ADMIN_PASSWORD || "Robson123!";

test.describe.serial("Cockpit financeiro global admin", () => {
  test.describe.configure({ timeout: 180000 });

  test("renderiza o cockpit com indicadores, charts e tabelas principais", async ({
    page,
  }) => {
    await loginAsUser(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);

    await page.goto("/admin/financeiro");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByRole("heading", { name: "Cockpit financeiro global" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Exportar CSV" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "XLSX" })).toBeVisible();
    await expect(page.getByRole("button", { name: "PDF" })).toBeVisible();

    await expect(page.getByText("Receita faturada x recebida")).toBeVisible();
    await expect(page.getByText("Mix de receita")).toBeVisible();
    await expect(page.getByText("Aging de recebíveis")).toBeVisible();
    await expect(page.getByText("Forecast de caixa")).toBeVisible();
    await expect(page.getByText("Faturas recentes")).toBeVisible();
    await expect(page.getByText("Pagamentos recentes")).toBeVisible();
    await expect(page.getByText("Comissões pendentes")).toBeVisible();
    await expect(page.getByText("Registros fora do catálogo de cobrança atual")).toBeVisible();
    await expect(
      page.getByText("O produto hoje opera com PIX, boleto e cartão."),
    ).toBeVisible();
    await expect(
      page.getByText("Legado: Débito Automático").first(),
    ).toBeVisible();
  });

  test("permite trocar o recorte temporal sem quebrar o cockpit", async ({
    page,
  }) => {
    await loginAsUser(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);

    await page.goto("/admin/financeiro");
    await page.waitForLoadState("domcontentloaded");

    await page.getByRole("button", { name: "30 dias" }).click();
    await expect(
      page.getByRole("heading", { name: "Cockpit financeiro global" }).first(),
    ).toBeVisible();
    await expect(page.getByText("Falha ao carregar o cockpit")).toHaveCount(0);

    await page.getByRole("button", { name: "Ano" }).click();
    await expect(
      page.getByRole("heading", { name: "Cockpit financeiro global" }).first(),
    ).toBeVisible();
    await expect(page.getByText("Falha ao carregar o cockpit")).toHaveCount(0);

    await expect(page.getByText("Mix de receita")).toBeVisible();
    await expect(page.getByText("Comissões pendentes")).toBeVisible();
  });
});
