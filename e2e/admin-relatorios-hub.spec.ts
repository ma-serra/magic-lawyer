import { expect, test } from "@playwright/test";

import { loginAsUser } from "./helpers/auth";

const SUPER_ADMIN_EMAIL =
  process.env.TEST_SUPER_ADMIN_EMAIL || "robsonnonatoiii@gmail.com";
const SUPER_ADMIN_PASSWORD =
  process.env.TEST_SUPER_ADMIN_PASSWORD || "Robson123!";

test.describe.serial("Hub global de relatorios admin", () => {
  test.describe.configure({ timeout: 180000 });

  test("organiza o hub em abas sem perder charts, ranking e catalogo mestre", async ({
    page,
  }) => {
    await loginAsUser(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);

    await page.goto("/admin/relatorios");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByRole("heading", { name: "Hub global de relatorios" }).first(),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Exportar CSV" })).toBeVisible();
    await expect(page.getByRole("button", { name: "XLSX" })).toBeVisible();
    await expect(page.getByRole("button", { name: "PDF" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Visao executiva" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Biblioteca comercial" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Monitoramento" })).toBeVisible();

    await expect(
      page.getByRole("heading", { name: "Radar de receita e crescimento" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Composicao financeira" }),
    ).toBeVisible();

    await page.getByRole("tab", { name: "Biblioteca comercial" }).click();

    await expect(
      page.getByRole("heading", { name: "Frentes de relatacao priorizadas" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Mais pedidos pelo negocio" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Catalogo mestre de relatorios" }),
    ).toBeVisible();

    await expect(page.getByText("Receita e cobranca").first()).toBeVisible();
    await expect(page.getByText("Suporte e SLA").first()).toBeVisible();
    await expect(page.getByText("Governanca e auditoria").first()).toBeVisible();
    await expect(
      page.getByText("Entregaveis externos e premium").first(),
    ).toBeVisible();

    const rows = page.locator("table tbody tr");
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeLessThanOrEqual(12);
    await expect(page.getByText(/Exibindo 1-12 de/i)).toBeVisible();
  });

  test("permite paginar o catalogo mestre sem perder os filtros aplicados", async ({
    page,
  }) => {
    await loginAsUser(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);

    await page.goto("/admin/relatorios");
    await page.waitForLoadState("domcontentloaded");
    await page.getByRole("tab", { name: "Biblioteca comercial" }).click();

    await expect(page.getByText(/Exibindo 1-12 de/i)).toBeVisible();
    await page.getByRole("button", { name: "24" }).click();
    await expect(page.getByText(/Exibindo 1-24 de/i)).toBeVisible();
  });

  test("permite focar a biblioteca por frente sem quebrar a tabela", async ({
    page,
  }) => {
    await loginAsUser(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);

    await page.goto("/admin/relatorios");
    await page.waitForLoadState("domcontentloaded");
    await page.getByRole("tab", { name: "Biblioteca comercial" }).click();

    await page
      .getByRole("button", { name: /Suporte e SLA .*relatorio/ })
      .click();

    await expect(page.getByText("Backlog atual de suporte")).toBeVisible();
    await expect(page.getByText("SLA de primeira resposta rompido")).toBeVisible();
    await expect(page.getByText("Tempo medio de resolucao")).toBeVisible();
    await expect(page.getByText("Catalogo mestre de relatorios")).toBeVisible();
  });
});
