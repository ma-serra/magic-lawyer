jest.mock("@/app/lib/prisma", () => ({
  __esModule: true,
  default: {
    processo: {
      findFirst: jest.fn(),
    },
  },
}));

jest.mock("@/app/lib/notifications/hybrid-notification-service", () => ({
  __esModule: true,
  HybridNotificationService: {
    publishNotification: jest.fn(),
  },
}));

import prisma from "@/app/lib/prisma";
import { HybridNotificationService } from "@/app/lib/notifications/hybrid-notification-service";
import { publishProcessNotificationToLawyers } from "@/app/lib/juridical/process-movement-sync";

const findFirst = jest.mocked(prisma.processo.findFirst);
const publishNotification = jest.mocked(
  HybridNotificationService.publishNotification,
);

describe("process notification recipients", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("envia para todos os advogados vinculados ao processo", async () => {
    findFirst.mockResolvedValue({
      id: "proc-1",
      numero: "1234567-89.2024.8.05.0001",
      titulo: "Obrigação de fazer",
      cliente: {
        nome: "Cliente Teste",
      },
      advogadoResponsavel: {
        usuario: {
          id: "user-1",
          active: true,
        },
      },
      partes: [
        {
          advogado: {
            usuario: {
              id: "user-2",
              active: true,
            },
          },
        },
      ],
      procuracoesVinculadas: [
        {
          procuracao: {
            outorgados: [
              {
                advogado: {
                  usuario: {
                    id: "user-3",
                    active: true,
                  },
                },
              },
            ],
          },
        },
      ],
    } as any);

    const result = await publishProcessNotificationToLawyers({
      tenantId: "tenant-1",
      processoId: "proc-1",
      type: "processo.updated",
      payload: {
        changesSummary: "Status alterado",
      },
      urgency: "HIGH",
      channels: ["REALTIME", "EMAIL", "TELEGRAM"],
    });

    expect(result.recipients).toBe(3);
    expect(publishNotification).toHaveBeenCalledTimes(3);
    expect(publishNotification).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: "processo.updated",
        tenantId: "tenant-1",
        userId: "user-1",
        payload: expect.objectContaining({
          processoId: "proc-1",
          processoNumero: "1234567-89.2024.8.05.0001",
          clienteNome: "Cliente Teste",
          processoTitulo: "Obrigação de fazer",
        }),
      }),
    );
  });
});
