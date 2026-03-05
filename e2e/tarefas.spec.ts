import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";

function randomTaskTitle(): string {
  return `E2E Tarefa ${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
}

test.describe.serial("Modulo de Tarefas E2E", () => {
  test.describe.configure({ timeout: 120000 });

  test("cria tarefa na lista e valida no kanban", async ({ page }) => {
    const titulo = randomTaskTitle();

    await loginAsAdmin(page);
    await page.goto("/tarefas");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Tarefas").first()).toBeVisible();

    await page.getByRole("button", { name: /Nova Tarefa/i }).first().click();
    await expect(page.getByText("Nova Tarefa").first()).toBeVisible();

    await page.getByLabel("Título").fill(titulo);
    await page.getByLabel("Descrição").fill("Tarefa criada via Playwright E2E.");
    await page.getByRole("button", { name: /^Criar$/i }).click();

    await page.waitForLoadState("networkidle");
    await expect(page.getByText(titulo).first()).toBeVisible();

    await page.getByRole("tab", { name: /Kanban/i }).first().click();
    await expect(page.getByText("Total no quadro").first()).toBeVisible();
    await expect(page.getByText(titulo).first()).toBeVisible();
  });
});
