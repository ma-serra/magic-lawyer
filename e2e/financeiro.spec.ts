import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";

test.describe.serial("Modulo Financeiro E2E", () => {
  test.describe.configure({ timeout: 180000 });

  test("smoke de navegação e carregamento das rotas principais", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    await page.goto("/financeiro/dashboard");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText("Cockpit financeiro").first()).toBeVisible();

    await page.goto("/financeiro/parcelas");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText("Parcelas de contrato").first()).toBeVisible();

    await page.goto("/financeiro/recibos");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText("Recibos").first()).toBeVisible();
    await expect(
      page.getByRole("table", { name: "Lista de recibos" }).or(
        page.getByText("Nenhum recibo encontrado"),
      ),
    ).toBeVisible();

    await page.goto("/financeiro/honorarios");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.getByText("Honorários contratuais").first(),
    ).toBeVisible();

    await page.goto("/financeiro/dados-bancarios");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText("Dados bancários").first()).toBeVisible();
  });
});
