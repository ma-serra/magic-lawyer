import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";

function randomTaskTitle(): string {
  return `E2E Tarefa ${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
}

test.describe.serial("Modulo de Tarefas E2E", () => {
  test.describe.configure({ timeout: 120000 });

  test("cria tarefa na lista e valida no kanban", async ({ page }) => {
    const titulo = randomTaskTitle();
    const listaNome = `E2E Lista ${Date.now()}-${Math.floor(Math.random() * 10_000)}`;

    await loginAsAdmin(page);
    await page.goto("/tarefas");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Tarefas").first()).toBeVisible();

    await page.getByRole("button", { name: /Nova Lista/i }).first().click();
    const modalLista = page
      .getByRole("dialog")
      .filter({ hasText: "Nova Lista de Trabalho" })
      .first();
    await expect(modalLista).toBeVisible();
    await modalLista.getByLabel("Nome da lista").fill(listaNome);
    await modalLista.getByRole("button", { name: /Criar Lista/i }).click();
    await expect(modalLista).toBeHidden({ timeout: 15000 });

    await page.getByRole("button", { name: /Nova Tarefa/i }).first().click();
    const modal = page.getByRole("dialog").filter({ hasText: "Nova Tarefa" }).first();
    await expect(modal).toBeVisible();

    await modal.getByLabel("Título").fill(titulo);
    await modal.getByLabel("Descrição").fill("Tarefa criada via Playwright E2E.");

    await modal.getByRole("button", { name: /^Criar$/i }).click();
    await expect(modal).toBeHidden({ timeout: 15000 });
    await expect(page.getByText(titulo).first()).toBeVisible({ timeout: 15000 });

    await page.getByRole("tab", { name: /Kanban/i }).first().click();
    await expect(page.getByText("Total no quadro").first()).toBeVisible();
    await expect(page.getByText(titulo).first()).toBeVisible({ timeout: 15000 });
  });
});
