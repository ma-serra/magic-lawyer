import { getServerSession } from "next-auth/next";

import { getAgendaResumo } from "../eventos";
import prisma from "@/app/lib/prisma";
import { checkPermission } from "@/app/actions/equipe";
import { getAccessibleAdvogadoIds } from "@/app/lib/advogado-access";

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

jest.mock("@/auth", () => ({
  authOptions: {},
}));

jest.mock("@/app/actions/equipe", () => ({
  checkPermission: jest.fn(),
}));

jest.mock("@/app/lib/advogado-access", () => ({
  getAccessibleAdvogadoIds: jest.fn(),
}));

jest.mock("@/app/actions/google-calendar", () => ({
  syncEventoWithGoogle: jest.fn(),
  removeEventoFromGoogle: jest.fn(),
}));

jest.mock("@/app/lib/feriados/holiday-impact", () => ({
  parseHolidayImpact: jest.fn((value) => value),
}));

jest.mock("@/app/lib/soft-delete", () => ({
  buildSoftDeletePayload: jest.fn(() => ({})),
}));

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock("@/app/lib/prisma", () => ({
  __esModule: true,
  default: {
    usuario: {
      findUnique: jest.fn(),
    },
    cliente: {
      findFirst: jest.fn(),
    },
    evento: {
      count: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

describe("getAgendaResumo", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (checkPermission as jest.Mock).mockResolvedValue(true);
    (getAccessibleAdvogadoIds as jest.Mock).mockResolvedValue(["adv-1"]);
    (prisma.$transaction as jest.Mock).mockImplementation((operations) =>
      Promise.all(operations),
    );
  });

  it("agrega contagens do periodo principal com o mesmo escopo da agenda", async () => {
    (getServerSession as jest.Mock).mockResolvedValue({
      user: {
        id: "admin-1",
        role: "ADMIN",
        tenantId: "tenant-1",
        email: "admin@magiclawyer.com.br",
      },
    });
    (prisma.evento.count as jest.Mock)
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2);
    (prisma.evento.findFirst as jest.Mock).mockResolvedValue({
      id: "evento-1",
      titulo: "Audiencia de conciliacao",
      dataInicio: new Date(2026, 3, 10, 9, 0, 0),
      dataFim: new Date(2026, 3, 10, 10, 0, 0),
      tipo: "AUDIENCIA",
      status: "AGENDADO",
    });

    const result = await getAgendaResumo(
      {
        titulo: "audiencia",
        origem: "local",
      },
      {
        periodoInicio: new Date(2026, 3, 1, 0, 0, 0),
        periodoFim: new Date(2026, 3, 30, 23, 59, 59),
      },
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        totalPeriodo: 12,
        audienciasPeriodo: 4,
        eventosHoje: 2,
        proximoEvento: expect.objectContaining({
          id: "evento-1",
          titulo: "Audiencia de conciliacao",
        }),
      }),
    );
    expect(prisma.evento.count).toHaveBeenCalledTimes(3);
    expect(prisma.evento.findFirst).toHaveBeenCalledTimes(1);

    const periodoWhere = (prisma.evento.count as jest.Mock).mock.calls[0][0].where;
    const audienciasWhere = (prisma.evento.count as jest.Mock).mock.calls[1][0]
      .where;
    const proximoWhere = (prisma.evento.findFirst as jest.Mock).mock.calls[0][0]
      .where;

    expect(periodoWhere).toEqual(
      expect.objectContaining({
        tenantId: "tenant-1",
        deletedAt: null,
        googleEventId: null,
        titulo: {
          contains: "audiencia",
          mode: "insensitive",
        },
      }),
    );
    expect(audienciasWhere.AND).toEqual(
      expect.arrayContaining([expect.objectContaining({ tipo: "AUDIENCIA" })]),
    );
    expect(proximoWhere.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dataFim: expect.objectContaining({
            gte: expect.any(Date),
          }),
        }),
      ]),
    );
  });

  it("retorna resumo vazio quando o advogado filtrado esta fora do escopo", async () => {
    (getServerSession as jest.Mock).mockResolvedValue({
      user: {
        id: "advogado-1",
        role: "ADVOGADO",
        tenantId: "tenant-1",
        email: "advogado@magiclawyer.com.br",
      },
    });

    const result = await getAgendaResumo({
      advogadoId: "adv-2",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      totalPeriodo: 0,
      audienciasPeriodo: 0,
      eventosHoje: 0,
      proximoEvento: null,
    });
    expect(checkPermission).toHaveBeenCalledWith("agenda", "visualizar");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
