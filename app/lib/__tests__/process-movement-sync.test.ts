jest.mock("@/app/lib/prisma", () => ({
  __esModule: true,
  default: {},
}));

jest.mock("@/app/lib/notifications/hybrid-notification-service", () => ({
  __esModule: true,
  HybridNotificationService: {
    publishNotification: jest.fn(),
  },
}));

import { extractLawyerUserIdsFromProcessScope } from "@/app/lib/juridical/process-movement-sync";

describe("process movement sync", () => {
  it("deduplica advogados ativos do processo, partes e procuracoes", () => {
    const result = extractLawyerUserIdsFromProcessScope({
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
        {
          advogado: {
            usuario: {
              id: "user-1",
              active: true,
            },
          },
        },
        {
          advogado: {
            usuario: {
              id: "user-3",
              active: false,
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
                    id: "user-4",
                    active: true,
                  },
                },
              },
              {
                advogado: {
                  usuario: {
                    id: "user-2",
                    active: true,
                  },
                },
              },
            ],
          },
        },
      ],
    });

    expect(result).toEqual(["user-1", "user-2", "user-4"]);
  });
});
