import prisma from "@/app/lib/prisma";
import { TipoEndereco } from "@/generated/prisma";

import {
  BRAZIL_STATE_METADATA,
  EMPTY_BRAZIL_COVERAGE_STATE_DETAILS,
  buildBrazilCoverageOverview,
  type BrazilCoverageEntry,
  type BrazilCoverageLocationItem,
  type BrazilCoverageOverview,
  type BrazilCoverageStateDetails,
  normalizeBrazilUf,
} from "@/app/lib/geo/brazil-coverage";

const PRODUCTION_TENANT_WHERE = {
  slug: {
    not: "global",
  },
  isTestEnvironment: false,
} as const;

const NORMALIZED_STATE_NAME_TO_UF = new Map(
  Object.entries(BRAZIL_STATE_METADATA).map(([uf, meta]) => [
    meta.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase(),
    uf,
  ]),
);

function normalizeFreeText(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function extractUfFromText(value?: string | null) {
  const normalized = normalizeFreeText(value);

  if (!normalized) {
    return null;
  }

  const directMatch =
    normalized.match(/(?:^|[\s(/-])([A-Z]{2})(?:$|[\s)/-])/)?.[1] ?? null;
  const directUf = normalizeBrazilUf(directMatch);

  if (directUf) {
    return directUf;
  }

  const slashMatch = normalized.match(/\/([A-Z]{2})$/)?.[1] ?? null;
  const slashUf = normalizeBrazilUf(slashMatch);

  if (slashUf) {
    return slashUf;
  }

  for (const [stateName, uf] of NORMALIZED_STATE_NAME_TO_UF.entries()) {
    if (normalized.includes(stateName)) {
      return uf;
    }
  }

  return null;
}

function resolveProcessUf(params: {
  tribunalUf?: string | null;
  comarca?: string | null;
  vara?: string | null;
  foro?: string | null;
  orgaoJulgador?: string | null;
}) {
  return (
    normalizeBrazilUf(params.tribunalUf) ||
    extractUfFromText(params.comarca) ||
    extractUfFromText(params.vara) ||
    extractUfFromText(params.foro) ||
    extractUfFromText(params.orgaoJulgador)
  );
}

function rowsToUfMap(
  rows: Array<{ uf: string | null; _count: { _all: number } }>,
) {
  const totals = new Map<string, number>();

  for (const row of rows) {
    const uf = normalizeBrazilUf(row.uf);

    if (!uf) {
      continue;
    }

    totals.set(uf, (totals.get(uf) || 0) + row._count._all);
  }

  return totals;
}

async function getTenantProcessCountsByUf(tenantId: string) {
  const rows = await prisma.processo.findMany({
    where: {
      tenantId,
      deletedAt: null,
    },
    select: {
      comarca: true,
      foro: true,
      vara: true,
      orgaoJulgador: true,
      tribunal: {
        select: {
          uf: true,
        },
      },
    },
  });

  const totals = new Map<string, number>();

  for (const row of rows) {
    const uf = resolveProcessUf({
      tribunalUf: row.tribunal?.uf,
      comarca: row.comarca,
      vara: row.vara,
      foro: row.foro,
      orgaoJulgador: row.orgaoJulgador,
    });

    if (!uf) {
      continue;
    }

    totals.set(uf, (totals.get(uf) || 0) + 1);
  }

  return totals;
}

async function getGlobalProcessCountsByUf() {
  const rows = await prisma.processo.findMany({
    where: {
      deletedAt: null,
      tenant: {
        is: PRODUCTION_TENANT_WHERE,
      },
    },
    select: {
      comarca: true,
      foro: true,
      vara: true,
      orgaoJulgador: true,
      tribunal: {
        select: {
          uf: true,
        },
      },
    },
  });

  const totals = new Map<string, number>();

  for (const row of rows) {
    const uf = resolveProcessUf({
      tribunalUf: row.tribunal?.uf,
      comarca: row.comarca,
      vara: row.vara,
      foro: row.foro,
      orgaoJulgador: row.orgaoJulgador,
    });

    if (!uf) {
      continue;
    }

    totals.set(uf, (totals.get(uf) || 0) + 1);
  }

  return totals;
}

async function getTenantLawyerCountsByUf(tenantId: string) {
  const lawyerRows = await prisma.advogado.groupBy({
    by: ["oabUf"],
    where: {
      tenantId,
      isExterno: false,
      usuario: {
        is: {
          active: true,
        },
      },
      oabUf: {
        not: null,
      },
    },
    _count: {
      _all: true,
    },
  });

  return rowsToUfMap(
    lawyerRows.map((row) => ({
      uf: row.oabUf,
      _count: row._count,
    })),
  );
}

async function getGlobalLawyerCountsByUf() {
  const lawyerRows = await prisma.advogado.groupBy({
    by: ["oabUf"],
    where: {
      isExterno: false,
      oabUf: {
        not: null,
      },
      usuario: {
        is: {
          active: true,
        },
      },
      tenant: {
        is: PRODUCTION_TENANT_WHERE,
      },
    },
    _count: {
      _all: true,
    },
  });

  return rowsToUfMap(
    lawyerRows.map((row) => ({
      uf: row.oabUf,
      _count: row._count,
    })),
  );
}

function pickOfficeCoverage(
  currentRows: Array<{ tenantId: string; estado: string; _count: { _all: number } }>,
  legacyRows: Array<{ tenantId: string; estado: string; _count: { _all: number } }>,
) {
  const currentByKey = new Map(
    currentRows
      .map((row) => {
        const uf = normalizeBrazilUf(row.estado);
        return uf
          ? [`${row.tenantId}:${uf}`, { uf, total: row._count._all }]
          : null;
      })
      .filter(
        (entry): entry is [string, { uf: string; total: number }] =>
          Array.isArray(entry),
      ),
  );

  const legacyByKey = new Map(
    legacyRows
      .map((row) => {
        const uf = normalizeBrazilUf(row.estado);
        return uf
          ? [`${row.tenantId}:${uf}`, { uf, total: row._count._all }]
          : null;
      })
      .filter(
        (entry): entry is [string, { uf: string; total: number }] =>
          Array.isArray(entry),
      ),
  );

  const totals = new Map<string, number>();

  for (const key of new Set([...currentByKey.keys(), ...legacyByKey.keys()])) {
    const current = currentByKey.get(key);
    const legacy = legacyByKey.get(key);
    const chosen = current ?? legacy;

    if (!chosen) {
      continue;
    }

    totals.set(chosen.uf, (totals.get(chosen.uf) || 0) + chosen.total);
  }

  return totals;
}

async function getTenantOfficeCountsByUf(tenantId: string) {
  const [currentRows, legacyRows] = await Promise.all([
    prisma.endereco.groupBy({
      by: ["tenantId", "estado"],
      where: {
        tenantId,
        deletedAt: null,
        usuarioId: null,
        clienteId: null,
        tipo: TipoEndereco.ESCRITORIO,
      },
      _count: {
        _all: true,
      },
    }),
    prisma.tenantEndereco.groupBy({
      by: ["tenantId", "estado"],
      where: {
        tenantId,
      },
      _count: {
        _all: true,
      },
    }),
  ]);

  return pickOfficeCoverage(currentRows, legacyRows);
}

async function getGlobalOfficeCountsByUf() {
  const [currentRows, legacyRows] = await Promise.all([
    prisma.endereco.groupBy({
      by: ["tenantId", "estado"],
      where: {
        deletedAt: null,
        usuarioId: null,
        clienteId: null,
        tipo: TipoEndereco.ESCRITORIO,
        tenant: {
          is: PRODUCTION_TENANT_WHERE,
        },
      },
      _count: {
        _all: true,
      },
    }),
    prisma.tenantEndereco.groupBy({
      by: ["tenantId", "estado"],
      where: {
        tenant: {
          is: PRODUCTION_TENANT_WHERE,
        },
      },
      _count: {
        _all: true,
      },
    }),
  ]);

  return pickOfficeCoverage(currentRows, legacyRows);
}

function mapsToCoverageEntries(params: {
  processos: Map<string, number>;
  advogados: Map<string, number>;
  escritorios: Map<string, number>;
}) {
  const ufs = new Set([
    ...params.processos.keys(),
    ...params.advogados.keys(),
    ...params.escritorios.keys(),
  ]);

  return Array.from(ufs).map(
    (uf) =>
      ({
        uf,
        processos: params.processos.get(uf) || 0,
        advogados: params.advogados.get(uf) || 0,
        escritorios: params.escritorios.get(uf) || 0,
      }) satisfies BrazilCoverageEntry,
  );
}

function compactParts(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" • ");
}

function dedupeLocationItems(items: BrazilCoverageLocationItem[]) {
  const seen = new Set<string>();
  const unique: BrazilCoverageLocationItem[] = [];

  for (const item of items) {
    const key = `${item.id}:${item.title}:${item.subtitle ?? ""}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(item);
  }

  return unique;
}

function buildLawyerName(params: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  oabNumero?: string | null;
  oabUf?: string | null;
}) {
  const fullName = compactParts([params.firstName, params.lastName]).replace(
    / • /g,
    " ",
  );

  if (fullName) {
    return fullName;
  }

  if (params.email) {
    return params.email;
  }

  if (params.oabNumero && params.oabUf) {
    return `OAB ${params.oabNumero}/${params.oabUf}`;
  }

  return "Advogado sem identificacao";
}

function attachDetailsToOverview(
  overview: BrazilCoverageOverview,
  detailsByUf: Map<string, BrazilCoverageStateDetails>,
): BrazilCoverageOverview {
  return {
    ...overview,
    states: overview.states.map((state) => ({
      ...state,
      details: detailsByUf.get(state.uf) ?? EMPTY_BRAZIL_COVERAGE_STATE_DETAILS,
    })),
  };
}

async function getTenantProcessDetailsByUf(
  tenantId: string,
  ufs: string[],
): Promise<Map<string, BrazilCoverageLocationItem[]>> {
  const rows = await prisma.processo.findMany({
    where: {
      tenantId,
      deletedAt: null,
    },
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      numero: true,
      comarca: true,
      foro: true,
      vara: true,
      orgaoJulgador: true,
      tribunal: {
        select: {
          nome: true,
          uf: true,
        },
      },
      cliente: {
        select: {
          nome: true,
        },
      },
    },
  });

  const grouped = new Map<string, BrazilCoverageLocationItem[]>();

  for (const row of rows) {
    const uf = resolveProcessUf({
      tribunalUf: row.tribunal?.uf,
      comarca: row.comarca,
      vara: row.vara,
      foro: row.foro,
      orgaoJulgador: row.orgaoJulgador,
    });

    if (!uf || !ufs.includes(uf)) {
      continue;
    }

    const current = grouped.get(uf) ?? [];

    if (current.length >= 6) {
      continue;
    }

    current.push({
      id: row.id,
      title: row.numero,
      subtitle: compactParts([
        row.tribunal?.nome,
        row.orgaoJulgador,
        row.comarca,
        row.vara,
        row.cliente?.nome,
      ]),
      href: `/processos/${row.id}`,
    });
    grouped.set(uf, current);
  }

  return grouped;
}

async function getGlobalProcessDetailsByUf(
  ufs: string[],
): Promise<Map<string, BrazilCoverageLocationItem[]>> {
  const rows = await prisma.processo.findMany({
    where: {
      deletedAt: null,
      tenant: {
        is: PRODUCTION_TENANT_WHERE,
      },
    },
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      numero: true,
      comarca: true,
      foro: true,
      vara: true,
      orgaoJulgador: true,
      tribunal: {
        select: {
          nome: true,
          uf: true,
        },
      },
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  const grouped = new Map<string, BrazilCoverageLocationItem[]>();

  for (const row of rows) {
    const uf = resolveProcessUf({
      tribunalUf: row.tribunal?.uf,
      comarca: row.comarca,
      vara: row.vara,
      foro: row.foro,
      orgaoJulgador: row.orgaoJulgador,
    });

    if (!uf || !ufs.includes(uf)) {
      continue;
    }

    const current = grouped.get(uf) ?? [];

    if (current.length >= 6) {
      continue;
    }

    current.push({
      id: row.id,
      title: row.numero,
      subtitle: compactParts([
        row.tenant?.name,
        row.tribunal?.nome,
        row.orgaoJulgador,
        row.comarca,
        row.vara,
      ]),
      href: row.tenant?.id ? `/admin/tenants/${row.tenant.id}` : undefined,
    });
    grouped.set(uf, current);
  }

  return grouped;
}

async function getTenantLawyerDetailsByUf(
  tenantId: string,
  ufs: string[],
): Promise<Map<string, BrazilCoverageLocationItem[]>> {
  const entries = await Promise.all(
    ufs.map(async (uf) => {
      const rows = await prisma.advogado.findMany({
        where: {
          tenantId,
          isExterno: false,
          oabUf: uf,
          usuario: {
            is: {
              active: true,
            },
          },
        },
        orderBy: [{ updatedAt: "desc" }],
        take: 6,
        select: {
          id: true,
          oabNumero: true,
          oabUf: true,
          usuario: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      return [
        uf,
        rows.map(
          (row) =>
            ({
              id: row.id,
              title: buildLawyerName({
                firstName: row.usuario?.firstName,
                lastName: row.usuario?.lastName,
                email: row.usuario?.email,
                oabNumero: row.oabNumero,
                oabUf: row.oabUf,
              }),
              subtitle: row.oabNumero
                ? `OAB ${row.oabNumero}/${row.oabUf ?? uf}`
                : row.usuario?.email ?? undefined,
              href: `/advogados/${row.id}`,
            }) satisfies BrazilCoverageLocationItem,
        ),
      ] as const;
    }),
  );

  return new Map(entries);
}

async function getGlobalLawyerDetailsByUf(
  ufs: string[],
): Promise<Map<string, BrazilCoverageLocationItem[]>> {
  const entries = await Promise.all(
    ufs.map(async (uf) => {
      const rows = await prisma.advogado.findMany({
        where: {
          isExterno: false,
          oabUf: uf,
          usuario: {
            is: {
              active: true,
            },
          },
          tenant: {
            is: PRODUCTION_TENANT_WHERE,
          },
        },
        orderBy: [{ updatedAt: "desc" }],
        take: 6,
        select: {
          id: true,
          oabNumero: true,
          oabUf: true,
          usuario: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          tenant: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      return [
        uf,
        rows.map(
          (row) =>
            ({
              id: row.id,
              title: buildLawyerName({
                firstName: row.usuario?.firstName,
                lastName: row.usuario?.lastName,
                email: row.usuario?.email,
                oabNumero: row.oabNumero,
                oabUf: row.oabUf,
              }),
              subtitle: compactParts([
                row.tenant?.name,
                row.oabNumero
                  ? `OAB ${row.oabNumero}/${row.oabUf ?? uf}`
                  : row.usuario?.email,
              ]),
              href: row.tenant?.id
                ? `/admin/tenants/${row.tenant.id}`
                : undefined,
            }) satisfies BrazilCoverageLocationItem,
        ),
      ] as const;
    }),
  );

  return new Map(entries);
}

async function getTenantOfficeDetailsByUf(
  tenantId: string,
  ufs: string[],
): Promise<Map<string, BrazilCoverageLocationItem[]>> {
  const entries = await Promise.all(
    ufs.map(async (uf) => {
      const [currentRows, legacyRows] = await Promise.all([
        prisma.endereco.findMany({
          where: {
            tenantId,
            deletedAt: null,
            usuarioId: null,
            clienteId: null,
            tipo: TipoEndereco.ESCRITORIO,
            estado: uf,
          },
          orderBy: [{ principal: "desc" }, { updatedAt: "desc" }],
          take: 6,
          select: {
            id: true,
            apelido: true,
            cidade: true,
            logradouro: true,
            numero: true,
            telefone: true,
          },
        }),
        prisma.tenantEndereco.findMany({
          where: {
            tenantId,
            estado: uf,
          },
          orderBy: [{ principal: "desc" }, { updatedAt: "desc" }],
          take: 6,
          select: {
            id: true,
            apelido: true,
            cidade: true,
            logradouro: true,
            numero: true,
            telefone: true,
          },
        }),
      ]);

      const items = dedupeLocationItems([
        ...currentRows.map(
          (row) =>
            ({
              id: `current-${row.id}`,
              title: row.apelido,
              subtitle: compactParts([
                row.cidade,
                compactParts([row.logradouro, row.numero]),
                row.telefone,
              ]),
            }) satisfies BrazilCoverageLocationItem,
        ),
        ...legacyRows.map(
          (row) =>
            ({
              id: `legacy-${row.id}`,
              title: row.apelido,
              subtitle: compactParts([
                row.cidade,
                compactParts([row.logradouro, row.numero]),
                row.telefone,
              ]),
            }) satisfies BrazilCoverageLocationItem,
        ),
      ]).slice(0, 6);

      return [uf, items] as const;
    }),
  );

  return new Map(entries);
}

async function getGlobalOfficeDetailsByUf(
  ufs: string[],
): Promise<Map<string, BrazilCoverageLocationItem[]>> {
  const entries = await Promise.all(
    ufs.map(async (uf) => {
      const [currentRows, legacyRows] = await Promise.all([
        prisma.endereco.findMany({
          where: {
            deletedAt: null,
            usuarioId: null,
            clienteId: null,
            tipo: TipoEndereco.ESCRITORIO,
            estado: uf,
            tenant: {
              is: PRODUCTION_TENANT_WHERE,
            },
          },
          orderBy: [{ principal: "desc" }, { updatedAt: "desc" }],
          take: 6,
          select: {
            id: true,
            apelido: true,
            cidade: true,
            logradouro: true,
            numero: true,
            telefone: true,
            tenant: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        }),
        prisma.tenantEndereco.findMany({
          where: {
            estado: uf,
            tenant: {
              is: PRODUCTION_TENANT_WHERE,
            },
          },
          orderBy: [{ principal: "desc" }, { updatedAt: "desc" }],
          take: 6,
          select: {
            id: true,
            apelido: true,
            cidade: true,
            logradouro: true,
            numero: true,
            telefone: true,
            tenant: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        }),
      ]);

      const items = dedupeLocationItems([
        ...currentRows.map(
          (row) =>
            ({
              id: `current-${row.id}`,
              title: row.apelido,
              subtitle: compactParts([
                row.tenant?.name,
                row.cidade,
                compactParts([row.logradouro, row.numero]),
                row.telefone,
              ]),
              href: row.tenant?.id
                ? `/admin/tenants/${row.tenant.id}`
                : undefined,
            }) satisfies BrazilCoverageLocationItem,
        ),
        ...legacyRows.map(
          (row) =>
            ({
              id: `legacy-${row.id}`,
              title: row.apelido,
              subtitle: compactParts([
                row.tenant?.name,
                row.cidade,
                compactParts([row.logradouro, row.numero]),
                row.telefone,
              ]),
              href: row.tenant?.id
                ? `/admin/tenants/${row.tenant.id}`
                : undefined,
            }) satisfies BrazilCoverageLocationItem,
        ),
      ]).slice(0, 6);

      return [uf, items] as const;
    }),
  );

  return new Map(entries);
}

async function getTenantBrazilCoverageDetails(
  tenantId: string,
  ufs: string[],
): Promise<Map<string, BrazilCoverageStateDetails>> {
  const [processos, advogados, escritorios] = await Promise.all([
    getTenantProcessDetailsByUf(tenantId, ufs),
    getTenantLawyerDetailsByUf(tenantId, ufs),
    getTenantOfficeDetailsByUf(tenantId, ufs),
  ]);

  return new Map(
    ufs.map((uf) => [
      uf,
      {
        processos: processos.get(uf) ?? [],
        advogados: advogados.get(uf) ?? [],
        escritorios: escritorios.get(uf) ?? [],
      } satisfies BrazilCoverageStateDetails,
    ]),
  );
}

async function getGlobalBrazilCoverageDetails(
  ufs: string[],
): Promise<Map<string, BrazilCoverageStateDetails>> {
  const [processos, advogados, escritorios] = await Promise.all([
    getGlobalProcessDetailsByUf(ufs),
    getGlobalLawyerDetailsByUf(ufs),
    getGlobalOfficeDetailsByUf(ufs),
  ]);

  return new Map(
    ufs.map((uf) => [
      uf,
      {
        processos: processos.get(uf) ?? [],
        advogados: advogados.get(uf) ?? [],
        escritorios: escritorios.get(uf) ?? [],
      } satisfies BrazilCoverageStateDetails,
    ]),
  );
}

export async function getTenantBrazilCoverageOverview(
  tenantId: string,
): Promise<BrazilCoverageOverview> {
  const [processos, advogados, escritorios] = await Promise.all([
    getTenantProcessCountsByUf(tenantId),
    getTenantLawyerCountsByUf(tenantId),
    getTenantOfficeCountsByUf(tenantId),
  ]);

  const overview = buildBrazilCoverageOverview(
    mapsToCoverageEntries({ processos, advogados, escritorios }),
  );
  const detailsByUf = await getTenantBrazilCoverageDetails(
    tenantId,
    overview.states.map((state) => state.uf),
  );

  return attachDetailsToOverview(overview, detailsByUf);
}

export async function getGlobalBrazilCoverageOverview(): Promise<BrazilCoverageOverview> {
  const [processos, advogados, escritorios] = await Promise.all([
    getGlobalProcessCountsByUf(),
    getGlobalLawyerCountsByUf(),
    getGlobalOfficeCountsByUf(),
  ]);

  const overview = buildBrazilCoverageOverview(
    mapsToCoverageEntries({ processos, advogados, escritorios }),
  );
  const detailsByUf = await getGlobalBrazilCoverageDetails(
    overview.states.map((state) => state.uf),
  );

  return attachDetailsToOverview(overview, detailsByUf);
}
