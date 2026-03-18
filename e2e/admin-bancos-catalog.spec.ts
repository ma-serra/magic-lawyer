import { expect, test } from "@playwright/test";

import { loginAsUser } from "./helpers/auth";

const SUPER_ADMIN_EMAIL =
  process.env.TEST_SUPER_ADMIN_EMAIL || "robsonnonatoiii@gmail.com";
const SUPER_ADMIN_PASSWORD =
  process.env.TEST_SUPER_ADMIN_PASSWORD || "Robson123!";

test.describe.serial("Catálogo bancário admin", () => {
  test.describe.configure({ timeout: 180000 });

  test("renderiza a leitura operacional do catálogo", async ({ page }) => {
    await loginAsUser(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);

    await page.goto("/admin/bancos");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByRole("heading", {
        name: "Instituicoes financeiras que alimentam o produto",
      }),
    ).toBeVisible();
    await expect(page.getByText("Catalogo bancario", { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        "Esse catalogo existe para padronizar o banco exibido em dados bancarios",
      ),
    ).toBeVisible();
    await expect(page.getByText("Instituicoes mais usadas")).toBeVisible();
    await expect(page.getByText("Saude do catalogo")).toBeVisible();
    await expect(page.getByText("Catalogo operacional de bancos")).toBeVisible();
  });

  test("permite buscar uma instituição e abrir o formulário de manutenção", async ({
    page,
  }) => {
    await loginAsUser(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);

    await page.goto("/admin/bancos");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText("Catalogo operacional de bancos")).toBeVisible();

    await page.getByLabel("Buscar bancos").fill("001");
    await expect(page.getByText("Banco do Brasil").first()).toBeVisible();
    await expect(page.getByText("ISPB 00000000")).toBeVisible();

    await page.getByRole("button", { name: "Adicionar instituicao" }).click();
    await expect(
      page.getByText("Adicionar instituicao ao catalogo"),
    ).toBeVisible();
    await expect(page.getByLabel("Codigo COMPE")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "ISPB" })).toBeVisible();
  });
});
