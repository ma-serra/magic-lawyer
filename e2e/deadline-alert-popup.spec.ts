import { expect, test } from "@playwright/test";
import { PrismaClient } from "../generated/prisma";

import { loginAsAdmin } from "./helpers/auth";

const prisma = new PrismaClient();

test.describe("critical deadline popup", () => {
  let notificationIds: string[] = [];

  test.afterEach(async () => {
    if (notificationIds.length > 0) {
      await prisma.notification.deleteMany({
        where: { id: { in: notificationIds } },
      });
      notificationIds = [];
    }
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("exige leitura explicita para prazo no limite", async ({ page }) => {
    const [tenant, otherTenant] = await Promise.all([
      prisma.tenant.findFirst({
        where: { slug: "sandra" },
        select: {
          id: true,
          usuarios: {
            where: {
              email: "sandra@adv.br",
            },
            select: {
              id: true,
            },
            take: 1,
          },
          processos: {
            where: {
              deletedAt: null,
            },
            select: {
              id: true,
              numero: true,
            },
            orderBy: {
              createdAt: "asc",
            },
            take: 1,
          },
        },
      }),
      prisma.tenant.findFirst({
        where: { slug: "salba" },
        select: {
          id: true,
          usuarios: {
            where: {
              email: "luciano@salbaadvocacia.com.br",
            },
            select: {
              id: true,
            },
            take: 1,
          },
          processos: {
            where: {
              deletedAt: null,
            },
            select: {
              id: true,
              numero: true,
            },
            orderBy: {
              createdAt: "asc",
            },
            take: 1,
          },
        },
      }),
    ]);

    if (!tenant?.usuarios[0] || !tenant.processos[0]) {
      throw new Error(
        "Contexto Sandra não encontrado para E2E do popup crítico de prazo.",
      );
    }

    if (!otherTenant?.usuarios[0] || !otherTenant.processos[0]) {
      throw new Error(
        "Contexto Salba não encontrado para validação de isolamento multi-tenant.",
      );
    }

    const userId = tenant.usuarios[0].id;
    const processo = tenant.processos[0];
    const otherUserId = otherTenant.usuarios[0].id;
    const otherProcesso = otherTenant.processos[0];

    await Promise.all([
      prisma.notification.updateMany({
        where: {
          tenantId: tenant.id,
          userId,
          type: {
            in: ["prazo.expiring_1d", "prazo.expiring_2h", "prazo.expired"],
          },
          readAt: null,
        },
        data: {
          readAt: new Date(),
        },
      }),
      prisma.notification.updateMany({
        where: {
          tenantId: otherTenant.id,
          userId: otherUserId,
          type: {
            in: ["prazo.expiring_1d", "prazo.expiring_2h", "prazo.expired"],
          },
          readAt: null,
        },
        data: {
          readAt: new Date(),
        },
      }),
    ]);

    const [created, otherCreated] = await Promise.all([
      prisma.notification.create({
        data: {
          tenantId: tenant.id,
          userId,
          type: "prazo.expiring_2h",
          title: "Prazo crítico de teste",
          message:
            "O prazo do processo de teste está a menos de 2 horas do vencimento.",
          urgency: "CRITICAL",
          channels: ["REALTIME", "EMAIL"],
          payload: {
            processoId: processo.id,
            processoNumero: processo.numero,
            prazoId: "prazo-popup-test",
            titulo: "Manifestação urgente",
            dataVencimento: new Date(
              Date.now() + 2 * 60 * 60 * 1000,
            ).toISOString(),
            diasRestantes: 0,
            referenciaTipo: "prazo",
            referenciaId: "prazo-popup-test",
          },
        },
      }),
      prisma.notification.create({
        data: {
          tenantId: otherTenant.id,
          userId: otherUserId,
          type: "prazo.expiring_2h",
          title: "Prazo crítico do outro escritório",
          message:
            "Este alerta pertence a outro tenant e não pode aparecer aqui.",
          urgency: "CRITICAL",
          channels: ["REALTIME", "EMAIL"],
          payload: {
            processoId: otherProcesso.id,
            processoNumero: otherProcesso.numero,
            prazoId: "prazo-popup-other-tenant",
            titulo: "Prazo sigiloso",
            dataVencimento: new Date(
              Date.now() + 2 * 60 * 60 * 1000,
            ).toISOString(),
            diasRestantes: 0,
            referenciaTipo: "prazo",
            referenciaId: "prazo-popup-other-tenant",
          },
        },
      }),
    ]);

    notificationIds = [created.id, otherCreated.id];

    await loginAsAdmin(page);
    await page.waitForLoadState("domcontentloaded");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await expect(
      dialog.getByText("Prazo crítico", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByText("Este alerta exige leitura explícita do advogado."),
    ).toBeVisible();
    await expect(dialog.getByText(processo.numero)).toBeVisible();
    await expect(dialog.getByText(otherProcesso.numero)).toHaveCount(0);
    await expect(
      dialog.getByText("Prazo crítico do outro escritório"),
    ).toHaveCount(0);

    await dialog.getByRole("button", { name: "Marcar que li" }).click();

    await expect(dialog).toBeHidden({ timeout: 15000 });

    await expect
      .poll(
        async () =>
          (
            await prisma.notification.findUnique({
              where: { id: created.id },
              select: { readAt: true },
            })
          )?.readAt?.toISOString() ?? null,
        {
          timeout: 15000,
        },
      )
      .not.toBeNull();
  });
});
