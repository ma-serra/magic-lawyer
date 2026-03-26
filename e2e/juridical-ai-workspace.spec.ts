import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../generated/prisma";

const TENANT_BASE_URL =
  process.env.TENANT_BASE_URL || "http://localhost:9192";
const ADMIN_BASE_URL = process.env.ADMIN_BASE_URL || "http://localhost:9192";
const prisma = new PrismaClient();

async function getSandraTenantContext() {
  const tenant = await prisma.tenant.findFirst({
    where: { slug: "sandra" },
    select: { id: true },
  });

  if (!tenant) {
    throw new Error("Tenant Sandra não encontrado para E2E do Magic AI.");
  }

  const processo = await prisma.processo.findFirst({
    where: {
      tenantId: tenant.id,
      deletedAt: null,
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!processo) {
    throw new Error("Nenhum processo encontrado para o tenant Sandra.");
  }

  return {
    tenantId: tenant.id,
    processId: processo.id,
  };
}

async function getTenantBySlug(slug: string) {
  const tenant = await prisma.tenant.findFirst({
    where: { slug },
    select: {
      id: true,
      name: true,
      subscription: {
        select: {
          id: true,
          metadata: true,
        },
      },
    },
  });

  if (!tenant) {
    throw new Error(`Tenant ${slug} não encontrado para E2E do Magic AI.`);
  }

  return tenant;
}

async function authenticateWithCredentials(params: {
  page: Page;
  baseUrl: string;
  email: string;
  password: string;
  tenant?: string;
}) {
  const request = params.page.context().request;

  const csrfResponse = await request.get(`${params.baseUrl}/api/auth/csrf`);
  expect(csrfResponse.ok()).toBeTruthy();
  const csrfPayload = (await csrfResponse.json()) as { csrfToken?: string };
  expect(csrfPayload.csrfToken).toBeTruthy();

  const callbackResponse = await request.post(
    `${params.baseUrl}/api/auth/callback/credentials`,
    {
      form: {
        csrfToken: csrfPayload.csrfToken!,
        email: params.email,
        password: params.password,
        tenant: params.tenant ?? "",
        callbackUrl: `${params.baseUrl}/dashboard`,
        json: "true",
      },
    },
  );

  expect(callbackResponse.ok()).toBeTruthy();

  const sessionResponse = await request.get(`${params.baseUrl}/api/auth/session`);
  expect(sessionResponse.ok()).toBeTruthy();
  const session = (await sessionResponse.json()) as {
    user?: { email?: string | null };
  };

  expect(session.user?.email?.toLowerCase()).toBe(params.email.toLowerCase());
}

async function loginTenantAdmin(page: Page) {
  await authenticateWithCredentials({
    page,
    baseUrl: TENANT_BASE_URL,
    email: "sandra@adv.br",
    password: "Sandra@123",
    tenant: "sandra",
  });
}

async function loginSuperAdmin(page: Page) {
  await authenticateWithCredentials({
    page,
    baseUrl: ADMIN_BASE_URL,
    email: "robsonnonatoiii@gmail.com",
    password: "Robson123!",
  });
}

async function loginRvbTenant(page: Page) {
  await authenticateWithCredentials({
    page,
    baseUrl: TENANT_BASE_URL,
    email: "admin@rvb.adv.br",
    password: "Rvb@123",
    tenant: "rvb",
  });
}

test.describe("juridical ai workspace", () => {
  test.describe.configure({ timeout: 120000 });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("tenant acessa o workspace e gera uma peça auditável", async ({
    page,
  }) => {
    const { tenantId, processId } = await getSandraTenantContext();
    const modelCountBefore = await prisma.modeloPeticao.count({
      where: {
        tenantId,
        nome: {
          contains: "Base AI",
        },
      },
    });
    const peticaoCountBefore = await prisma.peticao.count({
      where: {
        tenantId,
        processoId: processId,
        titulo: {
          contains: "Contestação",
        },
      },
    });
    const documentoCountBefore = await prisma.documento.count({
      where: {
        tenantId,
        processoId: processId,
        nome: {
          contains: "Contestação",
        },
      },
    });
    await loginTenantAdmin(page);

    await page.goto(
      `${TENANT_BASE_URL}/magic-ai?action=nova-peca&tab=peca&processId=${processId}`,
      {
        timeout: 60000,
        waitUntil: "domcontentloaded",
      },
    );

    const pieceTypeCombobox = page.getByPlaceholder("Escolha o tipo");
    await expect(pieceTypeCombobox).toBeVisible({ timeout: 15000 });
    await pieceTypeCombobox.click();
    await pieceTypeCombobox.fill("Contestação");
    const objectiveField = page.getByPlaceholder(
      "Ex.: impugnar penhora e pedir efeito suspensivo",
    );
    await expect(objectiveField).toBeVisible({ timeout: 15000 });
    await objectiveField.fill("Impugnar penhora e pedir efeito suspensivo");
    const generateButton = page
      .locator("button")
      .filter({ hasText: "Gerar rascunho auditável" })
      .last();
    await expect(generateButton).toBeEnabled({ timeout: 20000 });
    await generateButton.click();

    await page
      .locator("pre")
      .filter({ hasText: "# Contestação" })
      .first()
      .waitFor({ state: "attached", timeout: 30000 });
    await page.getByText("Lastro e fontes verificáveis").scrollIntoViewIfNeeded();
    await expect(page.getByText("Lastro e fontes verificáveis")).toBeVisible();
    await expect(page.getByRole("link", { name: "Ver processo no sistema" })).toBeVisible();
    await page.getByRole("button", { name: "Salvar em documentos" }).click();
    await expect
      .poll(
        async () =>
          prisma.documento.count({
            where: {
              tenantId,
              processoId: processId,
              nome: {
                contains: "Contestação",
              },
            },
          }),
        {
          timeout: 15000,
        },
      )
      .toBeGreaterThan(documentoCountBefore);
    await page.getByRole("button", { name: "Criar petição" }).click();
    await expect
      .poll(
        async () =>
          prisma.peticao.count({
            where: {
              tenantId,
              processoId: processId,
              titulo: {
                contains: "Contestação",
              },
            },
          }),
        {
          timeout: 15000,
        },
      )
      .toBeGreaterThan(peticaoCountBefore);
    await page.getByRole("button", { name: "Salvar como modelo" }).click();
    await expect(page.getByText("Modelo criado")).toBeVisible();

    await page.getByRole("tab", { name: "Histórico" }).click();
    await page.getByRole("button", { name: /Rascunhos/i }).click();
    await expect(page.getByText("Rascunhos recentes")).toBeVisible();
    await page.getByRole("button", { name: "Abrir rascunho" }).first().click();
    await page
      .locator("pre")
      .filter({ hasText: "# Contestação" })
      .first()
      .waitFor({ state: "attached", timeout: 30000 });

    const modelCountAfter = await prisma.modeloPeticao.count({
      where: {
        tenantId,
        nome: {
          contains: "Base AI",
        },
      },
    });
    expect(modelCountAfter).toBeGreaterThan(modelCountBefore);
  });

  test("tenant estrutura cálculo preliminar de sentença no workspace", async ({
    page,
  }) => {
    const { processId } = await getSandraTenantContext();
    await loginTenantAdmin(page);

    await page.goto(
      `${TENANT_BASE_URL}/magic-ai?action=calcular-sentenca&tab=calculos&processId=${processId}`,
      {
        timeout: 60000,
        waitUntil: "domcontentloaded",
      },
    );

    await expect(page.getByRole("tab", { name: "Cálculos" })).toBeVisible({
      timeout: 15000,
    });

    await page
      .getByLabel("Objetivo do memorial")
      .fill("Montar memorial preliminar para cumprimento de sentença");
    await page.getByLabel("Dispositivo ou trecho da sentença").fill(
      "a) CONDENAR a parte ré à restituição em dobro dos valores pagos a maior, com correção monetária pelo IPCA desde o pagamento indevido e juros de mora pela taxa SELIC a partir da citação. b) CONDENAR a parte ré ao pagamento de indenização por danos morais no valor de R$ 4.000,00, corrigido pelo IPCA desde a sentença e juros de mora pela SELIC a partir da citação.",
    );
    await page
      .getByRole("button", { name: "Estruturar cálculo da sentença" })
      .click();

    await expect(page.getByText("Resumo executivo do cálculo")).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText("Itens condenatórios mapeados")).toBeVisible();
    await expect(page.getByText("Memorial preliminar de cálculo")).toBeVisible();
  });

  test("super admin cria e publica nova versão de prompt", async ({ page }) => {
    await loginSuperAdmin(page);

    await page.goto(`${ADMIN_BASE_URL}/admin/magic-ai?tab=prompts`, {
      timeout: 60000,
      waitUntil: "domcontentloaded",
    });

    const promptTitle = `Prompt E2E ${Date.now()}`;
    await page.getByRole("textbox", { name: "Título" }).fill(promptTitle);
    await page
      .getByRole("textbox", { name: "System prompt" })
      .fill("Você governa o rollout com prudência, auditoria e foco em risco.");
    await page
      .getByRole("textbox", { name: "Instruction prompt" })
      .fill("Entregue critérios de publicação, risco e observabilidade.");

    await page.getByRole("button", { name: "Versionar prompt" }).click();
    const promptCard = page
      .locator("div")
      .filter({ hasText: promptTitle })
      .filter({ hasText: "DRAFT" })
      .first();

    await expect(promptCard).toBeVisible({ timeout: 15000 });
    await promptCard.getByRole("button", { name: "Publicar" }).first().click();

    await expect(promptCard).toContainText("PUBLISHED", { timeout: 15000 });
  });

  test("super admin governa rollout e o tenant reflete a política liberada", async ({
    page,
    browser,
  }) => {
    const rvbTenant = await getTenantBySlug("rvb");
    const hadSubscription = Boolean(rvbTenant.subscription?.id);
    const previousMetadata = rvbTenant.subscription?.metadata ?? null;
    const adminContext = await browser.newContext();
    const tenantContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const tenantPage = await tenantContext.newPage();

    try {
      await loginSuperAdmin(adminPage);
      await adminPage.goto(`${ADMIN_BASE_URL}/admin/magic-ai?tab=rollout`, {
        timeout: 60000,
        waitUntil: "domcontentloaded",
      });
      await expect(
        adminPage.getByText("Editor de rollout por escritório"),
      ).toBeVisible({ timeout: 15000 });
      await expect(adminPage.getByText("Fila de rollout")).toBeVisible({
        timeout: 15000,
      });

      const nextMetadata = {
        ...(previousMetadata && typeof previousMetadata === "object"
          ? (previousMetadata as Record<string, unknown>)
          : {}),
        magicAi: {
          rollout: {
            stage: "PILOT",
            workspaceEnabled: true,
            tierOverride: "PREMIUM",
            enabledTasks: [
              "PIECE_DRAFTING",
              "DOCUMENT_ANALYSIS",
              "QUESTION_ANSWERING",
              "PROCESS_SUMMARY",
              "CASE_STRATEGY",
              "JURISPRUDENCE_BRIEF",
            ],
            notes: "Piloto liberado com bloqueio temporário da validação de citações.",
            owner: "E2E rollout",
            nextReviewAt: "2026-03-25T12:00:00.000Z",
            updatedAt: new Date().toISOString(),
            updatedBy: "E2E",
          },
        },
      };

      if (rvbTenant.subscription?.id) {
        await prisma.tenantSubscription.update({
          where: { id: rvbTenant.subscription.id },
          data: {
            metadata: nextMetadata as never,
          },
        });
      } else {
        await prisma.tenantSubscription.create({
          data: {
            tenantId: rvbTenant.id,
            metadata: nextMetadata as never,
          },
        });
      }

      await loginRvbTenant(tenantPage);
      await tenantPage.goto(`${TENANT_BASE_URL}/magic-ai`, {
        timeout: 60000,
        waitUntil: "domcontentloaded",
      });

      await expect(tenantPage.getByText("Piloto").first()).toBeVisible({
        timeout: 15000,
      });
      await expect(
        tenantPage.getByText("Workspace habilitado para uso.", { exact: false }),
      ).toBeVisible({
        timeout: 15000,
      });
      await expect(
        tenantPage.getByText("Validação de citações", { exact: true }).last(),
      ).toBeVisible();
      await expect(
        tenantPage.getByText("Bloqueada", { exact: true }).last(),
      ).toBeVisible();
      await expect(
        tenantPage.getByText("Próxima revisão", { exact: true }),
      ).toBeVisible();
    } finally {
      if (rvbTenant.subscription?.id) {
        await prisma.tenantSubscription.update({
          where: { id: rvbTenant.subscription.id },
          data: {
            metadata: previousMetadata as never,
          },
        });
      } else if (!hadSubscription) {
        await prisma.tenantSubscription.deleteMany({
          where: {
            tenantId: rvbTenant.id,
          },
        });
      }
      await adminContext.close();
      await tenantContext.close();
    }
  });
});
