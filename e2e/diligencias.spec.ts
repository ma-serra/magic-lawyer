import { expect, test, type Page } from "@playwright/test";

import { loginAsAdmin } from "./helpers/auth";

function randomDiligenciaTitle(): string {
  return `E2E Diligencia ${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
}

test.describe.serial("Modulo de Diligencias E2E", () => {
  test.describe.configure({ timeout: 180000 });

  test("fluxo completo: criar, editar, concluir, cancelar, filtrar, paginar e excluir", async ({
    page,
  }) => {
    const tituloInicial = randomDiligenciaTitle();
    const tituloEditado = `${tituloInicial} - Editada`;

    await loginAsAdmin(page);
    await page.goto("/diligencias");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByText("Diligências").first()).toBeVisible();
    await page.getByRole("button", { name: /Nova Diligência/i }).first().click();

    const createModal = page.getByRole("dialog").filter({ hasText: "Nova diligência" });
    await expect(createModal).toBeVisible();
    await createModal.getByLabel("Título").fill(tituloInicial);
    await createModal
      .getByLabel("Descrição")
      .fill("Diligência criada no E2E para validar fluxo operacional.");
    await createModal.getByRole("button", { name: /Criar diligência/i }).click();

    await expect(page.getByText(tituloInicial).first()).toBeVisible();

    await page.getByText(tituloInicial).first().click();
    const detalhesModal = page
      .getByRole("dialog")
      .filter({ hasText: "Detalhamento operacional da diligência selecionada." });
    await expect(detalhesModal).toBeVisible();

    const editButton = page.getByRole("button", { name: /^Editar$/i }).last();
    await expect(editButton).toBeVisible();
    await editButton.click({ force: true });
    const editModal = page.getByRole("dialog").filter({ hasText: "Editar diligência" });
    await expect(editModal).toBeVisible();
    await editModal.getByLabel("Título").fill(tituloEditado);
    await editModal
      .getByLabel("Observações internas")
      .fill("Atualização via fluxo E2E.");
    await editModal.getByRole("button", { name: /Salvar alterações/i }).click();

    await expect(page.getByText(tituloEditado).first()).toBeVisible();
    await detalhesModal.getByRole("button", { name: /^Fechar$/i }).click();

    await page
      .getByPlaceholder("Título, tipo, processo, responsável...")
      .fill(tituloEditado);
    await expect(page.getByText(tituloEditado).first()).toBeVisible();

    const cardComTitulo = page
      .locator("div")
      .filter({ has: page.getByRole("heading", { name: tituloEditado, exact: true }) })
      .first();
    await expect(cardComTitulo).toBeVisible();
    await cardComTitulo.getByRole("checkbox").first().click();

    await page.getByRole("button", { name: /Concluir selecionadas/i }).click();
    const confirmLote = page
      .getByRole("dialog")
      .filter({ hasText: "Confirmar ação em lote" });
    await expect(confirmLote).toBeVisible();
    await confirmLote.getByRole("button", { name: /^Confirmar$/i }).click();

    await cardComTitulo.getByRole("checkbox").first().click();
    await page.getByRole("button", { name: /Arquivar selecionadas/i }).click();
    await expect(confirmLote).toBeVisible();
    await confirmLote.getByRole("button", { name: /^Confirmar$/i }).click();

    const pagina2 = page.getByRole("button", { name: /^2$/ });
    if (await pagina2.isVisible().catch(() => false)) {
      await pagina2.click();
      await expect(page.getByText(/registro\(s\) encontrado\(s\)/i).first()).toBeVisible();
      await page.getByRole("button", { name: /^1$/ }).first().click();
    }

    await page.getByText(tituloEditado).first().click();
    await expect(detalhesModal).toBeVisible();
    await detalhesModal.getByRole("button", { name: /Excluir/i }).click();

    const deleteModal = page.getByRole("dialog").filter({ hasText: "Excluir diligência" });
    await expect(deleteModal).toBeVisible();
    await deleteModal.getByLabel(/Digite "EXCLUIR"/i).fill("EXCLUIR");
    await deleteModal
      .getByRole("button", { name: /Excluir definitivamente/i })
      .click();

    await expect(page.getByText(tituloEditado).first()).not.toBeVisible();
  });
});
