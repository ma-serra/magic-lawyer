import { listComarcasPorTribunal, listVarasPorTribunal } from "../tribunais";
import { getSession } from "@/app/lib/auth";

type TribunalRow = {
  id: string;
  nome: string;
  sigla: string | null;
  deletedAt: Date | null;
};

type LocalidadeRow = {
  id: string;
  tribunalId: string;
  slug: string;
  nome: string;
  sigla: string | null;
  tipo: string | null;
  ordem: number | null;
  ativo: boolean;
};

type VaraRow = {
  id: string;
  tribunalId: string;
  localidadeId: string;
  slug: string;
  nome: string;
  sigla: string | null;
  tipo: string | null;
  ordem: number | null;
  ativo: boolean;
};

let database: {
  tribunais: TribunalRow[];
  localidades: LocalidadeRow[];
  varas: VaraRow[];
  processos: Array<{ comarca?: string | null; vara?: string | null }>;
  juizes: Array<{ comarca?: string | null; vara?: string | null }>;
  nextLocalidadeId: number;
  nextVaraId: number;
};

const tribunalFindFirstMock = jest.fn();
const tribunalLocalidadeFindFirstMock = jest.fn();
const tribunalLocalidadeFindManyMock = jest.fn();
const tribunalLocalidadeCreateMock = jest.fn();
const tribunalLocalidadeCreateManyMock = jest.fn();
const tribunalLocalidadeUpdateMock = jest.fn();
const tribunalVaraFindManyMock = jest.fn();
const tribunalVaraCreateMock = jest.fn();
const tribunalVaraCreateManyMock = jest.fn();
const tribunalVaraUpdateMock = jest.fn();
const processoFindManyMock = jest.fn();
const juizFindManyMock = jest.fn();

jest.mock("@/app/lib/auth", () => ({
  getSession: jest.fn(),
}));

jest.mock("@/app/lib/notifications/redis-singleton", () => ({
  getRedisInstance: jest.fn(),
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
    tribunal: {
      findFirst: (...args: any[]) => tribunalFindFirstMock(...args),
    },
    tribunalLocalidade: {
      findFirst: (...args: any[]) => tribunalLocalidadeFindFirstMock(...args),
      findMany: (...args: any[]) => tribunalLocalidadeFindManyMock(...args),
      create: (...args: any[]) => tribunalLocalidadeCreateMock(...args),
      createMany: (...args: any[]) => tribunalLocalidadeCreateManyMock(...args),
      update: (...args: any[]) => tribunalLocalidadeUpdateMock(...args),
    },
    tribunalVara: {
      findMany: (...args: any[]) => tribunalVaraFindManyMock(...args),
      create: (...args: any[]) => tribunalVaraCreateMock(...args),
      createMany: (...args: any[]) => tribunalVaraCreateManyMock(...args),
      update: (...args: any[]) => tribunalVaraUpdateMock(...args),
    },
    processo: {
      findMany: (...args: any[]) => processoFindManyMock(...args),
    },
    juiz: {
      findMany: (...args: any[]) => juizFindManyMock(...args),
    },
  },
}));

function resetDatabase(overrides?: Partial<typeof database>) {
  database = {
    tribunais: [
      {
        id: "trf1-id",
        nome: "Tribunal Regional Federal da 1a Regiao",
        sigla: "TRF1",
        deletedAt: null,
      },
    ],
    localidades: [],
    varas: [],
    processos: [],
    juizes: [],
    nextLocalidadeId: 1,
    nextVaraId: 1,
    ...overrides,
  };
}

function pick<T extends Record<string, any>>(
  row: T,
  select?: Record<string, any>,
): any {
  if (!select) {
    return { ...row };
  }

  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(select)) {
    if (value === true) {
      result[key] = row[key];
      continue;
    }

    if (key === "localidade" && value && typeof value === "object" && "select" in value) {
      const localidade = database.localidades.find(
        (item) => item.id === row.localidadeId,
      );
      result.localidade = localidade ? pick(localidade, value.select) : null;
    }
  }

  return result;
}

function sortByOrderAndName<T extends { ordem: number | null; nome: string }>(
  rows: T[],
) {
  return [...rows].sort((left, right) => {
    const leftOrder = left.ordem ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.ordem ?? Number.MAX_SAFE_INTEGER;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.nome.localeCompare(right.nome, "pt-BR");
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  resetDatabase();

  (getSession as jest.Mock).mockResolvedValue({
    user: {
      id: "user-1",
      role: "ADMIN",
      tenantId: "tenant-1",
    },
  });

  tribunalFindFirstMock.mockImplementation(async ({ where, select }: any) => {
    const row = database.tribunais.find(
      (item) =>
        item.id === where?.id &&
        (where?.deletedAt === undefined || item.deletedAt === where.deletedAt),
    );

    return row ? pick(row, select) : null;
  });

  tribunalLocalidadeFindFirstMock.mockImplementation(
    async ({ where, select }: any) => {
      const row =
        database.localidades.find(
          (item) =>
            item.tribunalId === where?.tribunalId &&
            (where?.ativo === undefined || item.ativo === where.ativo) &&
            (where?.OR ?? []).some(
              (condition: any) =>
                (condition.id && item.id === condition.id) ||
                (condition.nome && item.nome === condition.nome) ||
                (condition.sigla && item.sigla === condition.sigla) ||
                (condition.slug && item.slug === condition.slug),
            ),
        ) ?? null;

      return row ? pick(row, select) : null;
    },
  );

  tribunalLocalidadeFindManyMock.mockImplementation(
    async ({ where, select }: any) => {
      const rows = sortByOrderAndName(
        database.localidades.filter(
          (item) =>
            (where?.tribunalId === undefined ||
              item.tribunalId === where.tribunalId) &&
            (where?.ativo === undefined || item.ativo === where.ativo),
        ),
      );

      return rows.map((row) => pick(row, select));
    },
  );

  tribunalLocalidadeCreateMock.mockImplementation(async ({ data, select }: any) => {
    const row: LocalidadeRow = {
      id: `loc-${database.nextLocalidadeId++}`,
      tribunalId: data.tribunalId,
      slug: data.slug,
      nome: data.nome,
      sigla: data.sigla ?? null,
      tipo: data.tipo ?? null,
      ordem: data.ordem ?? null,
      ativo: data.ativo ?? true,
    };

    database.localidades.push(row);
    return pick(row, select);
  });

  tribunalLocalidadeCreateManyMock.mockImplementation(async ({ data }: any) => {
    for (const item of data ?? []) {
      database.localidades.push({
        id: `loc-${database.nextLocalidadeId++}`,
        tribunalId: item.tribunalId,
        slug: item.slug,
        nome: item.nome,
        sigla: item.sigla ?? null,
        tipo: item.tipo ?? null,
        ordem: item.ordem ?? null,
        ativo: item.ativo ?? true,
      });
    }

    return { count: data?.length ?? 0 };
  });

  tribunalLocalidadeUpdateMock.mockImplementation(async ({ where, data, select }: any) => {
    const row = database.localidades.find((item) => item.id === where.id);

    if (!row) {
      throw new Error(`Localidade nao encontrada: ${where.id}`);
    }

    Object.assign(row, data);
    return pick(row, select);
  });

  tribunalVaraFindManyMock.mockImplementation(async ({ where, select }: any) => {
    const rows = sortByOrderAndName(
      database.varas.filter(
        (item) =>
          (where?.tribunalId === undefined || item.tribunalId === where.tribunalId) &&
          (where?.localidadeId === undefined ||
            item.localidadeId === where.localidadeId) &&
          (where?.ativo === undefined || item.ativo === where.ativo),
      ),
    );

    return rows.map((row) => pick(row, select));
  });

  tribunalVaraCreateMock.mockImplementation(async ({ data, select }: any) => {
    const row: VaraRow = {
      id: `vara-${database.nextVaraId++}`,
      tribunalId: data.tribunalId,
      localidadeId: data.localidadeId,
      slug: data.slug,
      nome: data.nome,
      sigla: data.sigla ?? null,
      tipo: data.tipo ?? null,
      ordem: data.ordem ?? null,
      ativo: data.ativo ?? true,
    };

    database.varas.push(row);
    return pick(row, select);
  });

  tribunalVaraCreateManyMock.mockImplementation(async ({ data }: any) => {
    for (const item of data ?? []) {
      database.varas.push({
        id: `vara-${database.nextVaraId++}`,
        tribunalId: item.tribunalId,
        localidadeId: item.localidadeId,
        slug: item.slug,
        nome: item.nome,
        sigla: item.sigla ?? null,
        tipo: item.tipo ?? null,
        ordem: item.ordem ?? null,
        ativo: item.ativo ?? true,
      });
    }

    return { count: data?.length ?? 0 };
  });

  tribunalVaraUpdateMock.mockImplementation(async ({ where, data, select }: any) => {
    const row = database.varas.find((item) => item.id === where.id);

    if (!row) {
      throw new Error(`Vara nao encontrada: ${where.id}`);
    }

    Object.assign(row, data);
    return pick(row, select);
  });

  processoFindManyMock.mockResolvedValue([]);
  juizFindManyMock.mockResolvedValue([]);
});

describe("catalogo judicial TRF1", () => {
  it("semeia SJBA e SJPA com subsecoes oficiais e lista varas por alias de capital/interior", async () => {
    const comarcasResult = await listComarcasPorTribunal("trf1-id");

    expect(comarcasResult.success).toBe(true);
    expect(comarcasResult.comarcas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sigla: "SJBA",
          nome: "Secao Judiciaria da Bahia",
          aliases: expect.arrayContaining(["Salvador", "SJBA"]),
        }),
        expect.objectContaining({
          nome: "Subsecao Judiciaria de Feira de Santana",
          aliases: expect.arrayContaining(["Feira de Santana"]),
        }),
        expect.objectContaining({
          nome: "Subsecao Judiciaria de Vitoria da Conquista",
          aliases: expect.arrayContaining(["Vitoria da Conquista"]),
        }),
        expect.objectContaining({
          sigla: "SJPA",
          nome: "Secao Judiciaria do Para",
          aliases: expect.arrayContaining(["Belem", "SJPA"]),
        }),
        expect.objectContaining({
          nome: "Subsecao Judiciaria de Maraba",
          aliases: expect.arrayContaining(["Maraba"]),
        }),
        expect.objectContaining({
          nome: "Subsecao Judiciaria de Santarem",
          aliases: expect.arrayContaining(["Santarem"]),
        }),
      ]),
    );

    const salvadorVaras = await listVarasPorTribunal({
      tribunalId: "trf1-id",
      comarca: "Salvador",
    });
    expect(salvadorVaras.success).toBe(true);
    expect(salvadorVaras.varas).toHaveLength(24);
    expect(salvadorVaras.varas[0]?.nome).toBe("1A VARA FEDERAL CIVEL");
    expect(salvadorVaras.varas[15]?.nome).toBe("16A VARA FEDERAL CIVEL");

    const feiraVaras = await listVarasPorTribunal({
      tribunalId: "trf1-id",
      comarca: "Feira de Santana",
    });
    expect(feiraVaras.varas.map((item) => item.nome)).toEqual([
      "1A VARA FEDERAL",
      "2A VARA FEDERAL",
      "3A VARA FEDERAL",
    ]);

    const belemVaras = await listVarasPorTribunal({
      tribunalId: "trf1-id",
      comarca: "Belem",
    });
    expect(belemVaras.varas).toHaveLength(12);
    expect(belemVaras.varas[0]?.nome).toBe("1A VARA FEDERAL");
    expect(belemVaras.varas[11]?.nome).toBe(
      "12A VARA FEDERAL DE JUIZADO ESPECIAL CIVEL",
    );

    const localidadeCount = database.localidades.length;
    const varaCount = database.varas.length;

    await listComarcasPorTribunal("trf1-id");
    await listVarasPorTribunal({
      tribunalId: "trf1-id",
      comarca: "Salvador",
    });

    expect(database.localidades).toHaveLength(localidadeCount);
    expect(database.varas).toHaveLength(varaCount);
    expect(new Set(database.localidades.map((item) => item.slug)).size).toBe(
      database.localidades.length,
    );
    expect(
      new Set(
        database.varas.map((item) => `${item.localidadeId}:${item.slug}`),
      ).size,
    ).toBe(database.varas.length);
  });

  it("consolida registros legados de Salvador sem duplicar a 16A Vara Federal Civel", async () => {
    resetDatabase({
      localidades: [
        {
          id: "legacy-salvador",
          tribunalId: "trf1-id",
          slug: "salvador",
          nome: "Salvador",
          sigla: null,
          tipo: "COMARCA",
          ordem: null,
          ativo: true,
        },
      ],
      varas: [
        {
          id: "legacy-vara-16",
          tribunalId: "trf1-id",
          localidadeId: "legacy-salvador",
          slug: "vara-salvador-16",
          nome: "16A Vara Federal Civel da SJBA",
          sigla: null,
          tipo: "VARA",
          ordem: null,
          ativo: true,
        },
      ],
      nextLocalidadeId: 2,
      nextVaraId: 2,
    });

    const result = await listVarasPorTribunal({
      tribunalId: "trf1-id",
      comarca: "Salvador",
    });

    expect(result.success).toBe(true);
    expect(result.varas).toHaveLength(24);

    const canonicalLocalidade = database.localidades.find(
      (item) => item.sigla === "SJBA" && item.ativo,
    );
    expect(canonicalLocalidade).toBeTruthy();
    expect(
      database.localidades.filter(
        (item) => item.ativo && item.slug === "sjba" && item.sigla === "SJBA",
      ),
    ).toHaveLength(1);
    expect(
      database.localidades.some(
        (item) => item.ativo && item.id === "legacy-salvador" && item.slug === "salvador",
      ),
    ).toBe(false);

    const canonicalVaras = database.varas.filter(
      (item) => item.localidadeId === canonicalLocalidade?.id && item.ativo,
    );
    expect(
      canonicalVaras.filter((item) => item.nome === "16A VARA FEDERAL CIVEL"),
    ).toHaveLength(1);
    expect(
      canonicalVaras.find((item) => item.id === "legacy-vara-16"),
    ).toEqual(
      expect.objectContaining({
        slug: "16a-vara-federal-civel",
        nome: "16A VARA FEDERAL CIVEL",
      }),
    );
    expect(
      new Set(canonicalVaras.map((item) => item.slug)).size,
    ).toBe(canonicalVaras.length);
  });
});
