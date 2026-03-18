import { expect, test } from "@playwright/test";

import { loginAsUser } from "./helpers/auth";

const SUPER_ADMIN_EMAIL =
  process.env.TEST_SUPER_ADMIN_EMAIL || "robsonnonatoiii@gmail.com";
const SUPER_ADMIN_PASSWORD =
  process.env.TEST_SUPER_ADMIN_PASSWORD || "Robson123!";

test.describe.serial("Centro de auditoria operacional", () => {
  test.describe.configure({ timeout: 180000 });

  test("renderiza o hub com abas operacionais e navega entre trilhas críticas", async ({
    page,
  }) => {
    await loginAsUser(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);

    await page.goto("/admin/auditoria");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByRole("heading", { name: "Centro de auditoria operacional" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Exportar trilha atual" }),
    ).toBeVisible();

    await expect(page.getByText("Eventos operacionais")).toBeVisible();
    await expect(page.getByText("Mudanças auditadas")).toBeVisible();
    await expect(page.getByText("Acessos 24h")).toBeVisible();
    await expect(page.getByText("Emails 24h")).toBeVisible();

    await page.getByRole("tab", { name: "Acessos" }).click();
    await expect(page.getByText("Entradas, bloqueios e tentativas")).toBeVisible();

    await page.getByRole("tab", { name: "Suporte" }).click();
    await expect(
      page.getByRole("heading", { name: "Tickets recentes" }),
    ).toBeVisible();

    await page.getByRole("tab", { name: "Emails" }).click();
    await expect(
      page.getByText("Disparos reais de email com remetente"),
    ).toBeVisible();

    await page.getByRole("tab", { name: "Webhooks" }).click();
    await expect(
      page.getByText("Recebimento, rejeição e processamento de webhooks"),
    ).toBeVisible();

    await page.getByRole("tab", { name: "Crons" }).click();
    await expect(
      page.getByText("Execuções agendadas, rejeições, falhas e conclusões"),
    ).toBeVisible();

    await page.getByRole("tab", { name: "Alterações" }).click();
    await expect(
      page.getByText("Quem mudou o quê no sistema"),
    ).toBeVisible();
  });
});
