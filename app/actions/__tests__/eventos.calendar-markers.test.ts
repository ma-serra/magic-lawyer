import { getServerSession } from "next-auth/next";

import { getAgendaCalendarMarkers } from "../eventos";
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
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

describe("getAgendaCalendarMarkers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (checkPermission as jest.Mock).mockResolvedValue(true);
    (getAccessibleAdvogadoIds as jest.Mock).mockResolvedValue(["adv-1"]);
  });

  it("agrega os dias do mes considerando eventos sobrepostos e filtros ativos", async () => {
    (getServerSession as jest.Mock).mockResolvedValue({
      user: {
        id: "admin-1",
        role: "ADMIN",
        tenantId: "tenant-1",
        email: "admin@magiclawyer.com.br",
      },
    });
    (prisma.evento.findMany as jest.Mock).mockResolvedValue([
      {
        dataInicio: new Date(2026, 5, 8, 23, 0, 0),
        dataFim: new Date(2026, 5, 9, 1, 0, 0),
      },
      {
        dataInicio: new Date(2026, 5, 9, 11, 30, 0),
        dataFim: new Date(2026, 5, 9, 14, 0, 0),
      },
      {
        dataInicio: new Date(2026, 5, 9, 15, 0, 0),
        dataFim: new Date(2026, 5, 9, 16, 0, 0),
      },
    ]);

    const result = await getAgendaCalendarMarkers(
      {
        titulo: "audiencia",
        origem: "local",
      },
      {
        periodoInicio: new Date(2026, 5, 1, 0, 0, 0),
        periodoFim: new Date(2026, 5, 30, 23, 59, 59),
      },
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual([
      {
        dateKey: "2026-06-08",
        total: 1,
      },
      {
        dateKey: "2026-06-09",
        total: 3,
      },
    ]);

    const where = (prisma.evento.findMany as jest.Mock).mock.calls[0][0].where;

    expect(where).toEqual(
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
    expect(where.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dataInicio: expect.objectContaining({
            lte: new Date(2026, 5, 30, 23, 59, 59),
          }),
        }),
        expect.objectContaining({
          dataFim: expect.objectContaining({
            gte: new Date(2026, 5, 1, 0, 0, 0),
          }),
        }),
      ]),
    );
  });

  it("retorna lista vazia quando nao houver eventos no periodo", async () => {
    (getServerSession as jest.Mock).mockResolvedValue({
      user: {
        id: "admin-1",
        role: "ADMIN",
        tenantId: "tenant-1",
        email: "admin@magiclawyer.com.br",
      },
    });
    (prisma.evento.findMany as jest.Mock).mockResolvedValue([]);

    const result = await getAgendaCalendarMarkers(undefined, {
      periodoInicio: new Date(2026, 5, 1, 0, 0, 0),
      periodoFim: new Date(2026, 5, 30, 23, 59, 59),
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it("retorna vazio quando o advogado filtrado esta fora do escopo", async () => {
    (getServerSession as jest.Mock).mockResolvedValue({
      user: {
        id: "advogado-1",
        role: "ADVOGADO",
        tenantId: "tenant-1",
        email: "advogado@magiclawyer.com.br",
      },
    });

    const result = await getAgendaCalendarMarkers({
      advogadoId: "adv-2",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
    expect(checkPermission).toHaveBeenCalledWith("agenda", "visualizar");
    expect(prisma.evento.findMany).not.toHaveBeenCalled();
  });
});
