import prisma from "@/app/lib/prisma";
import { syncCapturedProcessDocuments } from "@/app/lib/juridical/process-document-sync";
import { ensureJusbrasilProcessMonitorBestEffort } from "@/app/lib/juridical/jusbrasil-process-monitoring";
import {
  Prisma,
  ProcessoStatus,
  ProcessoPolo,
  TipoPessoa,
  UserRole,
} from "@/generated/prisma";
import { getTribunalConfig } from "@/lib/api/juridical/config";
import {
  AdvogadoParte,
  ParteProcesso,
  ProcessoJuridico,
} from "@/lib/api/juridical/types";

const normalizeCacheKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

function inferTipoPessoa(nome: string): TipoPessoa {
  const normalized = normalizeCacheKey(nome);
  const juridicaTerms = ["LTDA", "S/A", "SA ", "EIRELI", "MEI", "EPP", "ASSOCIACAO", "CONDOMINIO", "EMPRESA", "COMERCIO", "INDUSTRIA", "COOPERATIVA", "HOSPITAL", "CLINICA"];

  return juridicaTerms.some((term) => normalized.includes(term)) ? TipoPessoa.JURIDICA : TipoPessoa.FISICA;
}

function mapPartePolo(parte: ParteProcesso): ProcessoPolo | null {
  if (parte.tipo === "AUTOR") return ProcessoPolo.AUTOR;
  if (parte.tipo === "REU") return ProcessoPolo.REU;
  if (parte.tipo === "TERCEIRO") return ProcessoPolo.TERCEIRO;
  return null;
}

function resolveClienteNome(processo: ProcessoJuridico, clienteNome?: string) {
  if (clienteNome) return clienteNome.trim();
  const autor = processo.partes?.find((parte) => parte.tipo === "AUTOR");
  if (autor?.nome) return autor.nome.trim();
  const primeiraParte = processo.partes?.[0];
  if (primeiraParte?.nome) return primeiraParte.nome.trim();
  return "Cliente importado";
}

function splitFullName(nome: string) {
  const parts = nome.trim().split(/\s+/).filter(Boolean);
  const firstName = parts.shift() || nome.trim();
  const lastName = parts.join(" ").trim() || null;

  return {
    firstName,
    lastName,
  };
}

function normalizeOptionalString(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalEmail(value?: string | null) {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

function isSyntheticExternalLawyerEmail(value?: string | null) {
  const normalized = normalizeOptionalEmail(value);
  if (!normalized) {
    return false;
  }

  return normalized.endsWith("@magiclawyer.local") || normalized.includes("jusbrasil+");
}

function buildSyntheticExternalLawyerEmail(params: {
  tenantId: string;
  nome: string;
  oabNumero?: string | null;
  oabUf?: string | null;
}) {
  const base = normalizeCacheKey(params.nome)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 40);
  const oabSegment = params.oabNumero && params.oabUf
    ? `${params.oabUf}${params.oabNumero}`.toLowerCase()
    : "sem-oab";

  return `jusbrasil+${base || "advogado"}.${oabSegment}.${params.tenantId.slice(0, 8)}@magiclawyer.local`;
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function findExistingExternalAdvogado(
  tx: Prisma.TransactionClient,
  params: {
    tenantId: string;
    nome: string;
    oabNumero?: string | null;
    oabUf?: string | null;
  },
) {
  const { firstName, lastName } = splitFullName(params.nome);

  const byOab =
    params.oabNumero && params.oabUf
      ? await tx.advogado.findFirst({
          where: {
            tenantId: params.tenantId,
            oabNumero: params.oabNumero,
            oabUf: params.oabUf,
          },
          select: {
            id: true,
            oabNumero: true,
            oabUf: true,
            telefone: true,
            whatsapp: true,
            usuario: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        })
      : null;

  if (byOab) {
    return byOab;
  }

  return tx.advogado.findFirst({
    where: {
      tenantId: params.tenantId,
      isExterno: true,
      usuario: {
        firstName: {
          equals: firstName,
          mode: "insensitive",
        },
        ...(lastName
          ? {
              lastName: {
                equals: lastName,
                mode: "insensitive",
              },
            }
          : {
              OR: [{ lastName: null }, { lastName: "" }],
            }),
      },
    },
    select: {
      id: true,
      oabNumero: true,
      oabUf: true,
      telefone: true,
      whatsapp: true,
      usuario: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      },
    },
  });
}

async function ensureUniqueSyntheticEmail(
  tx: Prisma.TransactionClient,
  params: {
    tenantId: string;
    baseEmail: string;
  },
) {
  const [localPart, domainPart] = params.baseEmail.split("@");
  let email = params.baseEmail;
  let suffix = 1;

  while (
    await tx.usuario.findFirst({
      where: {
        tenantId: params.tenantId,
        email,
      },
      select: {
        id: true,
      },
    })
  ) {
    email = `${localPart}.${suffix}@${domainPart}`;
    suffix += 1;
  }

  return email;
}

async function isTenantEmailAvailable(
  tx: Prisma.TransactionClient,
  params: {
    tenantId: string;
    email: string;
    exceptUserId?: string;
  },
) {
  const existing = await tx.usuario.findFirst({
    where: {
      tenantId: params.tenantId,
      email: params.email,
      ...(params.exceptUserId
        ? {
            NOT: {
              id: params.exceptUserId,
            },
          }
        : {}),
    },
    select: {
      id: true,
    },
  });

  return !existing;
}

async function resolveExternalAdvogadoEmail(
  tx: Prisma.TransactionClient,
  params: {
    tenantId: string;
    nome: string;
    oabNumero?: string | null;
    oabUf?: string | null;
    email?: string | null;
  },
) {
  const preferredEmail = normalizeOptionalEmail(params.email);

  if (
    preferredEmail &&
    (await isTenantEmailAvailable(tx, {
      tenantId: params.tenantId,
      email: preferredEmail,
    }))
  ) {
    return preferredEmail;
  }

  return ensureUniqueSyntheticEmail(tx, {
    tenantId: params.tenantId,
    baseEmail: buildSyntheticExternalLawyerEmail({
      tenantId: params.tenantId,
      nome: params.nome,
      oabNumero: params.oabNumero,
      oabUf: params.oabUf,
    }),
  });
}

async function ensureExternalAdvogado(
  tx: Prisma.TransactionClient,
  params: {
    tenantId: string;
    advogado: AdvogadoParte;
  },
) {
  const nome = params.advogado.nome.trim();
  if (!nome) {
    return null;
  }

  const oabNumero = params.advogado.oabNumero?.trim() || null;
  const oabUf = params.advogado.oabUf?.trim().toUpperCase() || null;
  const telefone = normalizeOptionalString(params.advogado.telefone);
  const email = normalizeOptionalEmail(params.advogado.email);
  const { firstName, lastName } = splitFullName(nome);
  let existente = await findExistingExternalAdvogado(tx, {
    tenantId: params.tenantId,
    nome,
    oabNumero,
    oabUf,
  });

  if (existente) {
    const shouldUpdatePhone =
      Boolean(telefone) &&
      !normalizeOptionalString(existente.telefone) &&
      !normalizeOptionalString(existente.usuario.phone);
    const shouldUpdateWhatsapp =
      Boolean(telefone) && !normalizeOptionalString(existente.whatsapp);
    const shouldUpdateEmail =
      Boolean(email) &&
      isSyntheticExternalLawyerEmail(existente.usuario.email) &&
      (await isTenantEmailAvailable(tx, {
        tenantId: params.tenantId,
        email: email!,
        exceptUserId: existente.usuario.id,
      }));

    if (
      (!existente.oabNumero && oabNumero) ||
      (!existente.oabUf && oabUf) ||
      shouldUpdatePhone ||
      shouldUpdateWhatsapp ||
      shouldUpdateEmail ||
      normalizeCacheKey(
        `${existente.usuario.firstName || ""} ${existente.usuario.lastName || ""}`.trim(),
      ) !== normalizeCacheKey(nome)
    ) {
      await tx.advogado.update({
        where: {
          id: existente.id,
        },
        data: {
          ...(oabNumero && !existente.oabNumero ? { oabNumero } : {}),
          ...(oabUf && !existente.oabUf ? { oabUf } : {}),
          ...(shouldUpdatePhone ? { telefone } : {}),
          ...(shouldUpdateWhatsapp ? { whatsapp: telefone } : {}),
          usuario: {
            update: {
              ...(existente.usuario.firstName !== firstName ? { firstName } : {}),
              ...((existente.usuario.lastName || null) !== (lastName || null)
                ? { lastName }
                : {}),
              ...(shouldUpdatePhone ? { phone: telefone } : {}),
              ...(shouldUpdateEmail ? { email: email! } : {}),
            },
          },
        },
      });
    }

    return {
      id: existente.id,
      nome,
      oabNumero,
      oabUf,
    };
  }

  const resolvedEmail = await resolveExternalAdvogadoEmail(tx, {
    tenantId: params.tenantId,
    nome,
    oabNumero,
    oabUf,
    email,
  });

  try {
    const usuario = await tx.usuario.create({
      data: {
        tenantId: params.tenantId,
        email: resolvedEmail,
        passwordHash: null,
        role: UserRole.ADVOGADO,
        firstName,
        lastName,
        phone: telefone,
        active: false,
      },
      select: {
        id: true,
      },
    });

    const advogado = await tx.advogado.create({
      data: {
        tenantId: params.tenantId,
        usuarioId: usuario.id,
        oabNumero,
        oabUf,
        isExterno: true,
        telefone,
        whatsapp: telefone,
        notificarEmail: false,
        notificarWhatsapp: false,
        notificarSistema: false,
        podeCriarProcessos: false,
        podeEditarProcessos: false,
        podeExcluirProcessos: false,
        podeGerenciarClientes: false,
        podeAcessarFinanceiro: false,
      },
      select: {
        id: true,
      },
    });

    return {
      id: advogado.id,
      nome,
      oabNumero,
      oabUf,
    };
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await wait(150 * (attempt + 1));
      existente = await findExistingExternalAdvogado(tx, {
        tenantId: params.tenantId,
        nome,
        oabNumero,
        oabUf,
      });

      if (existente) {
        return {
          id: existente.id,
          nome,
          oabNumero,
          oabUf,
        };
      }
    }

    throw error;
  }
}

async function summarizeParteLawyers(
  tx: Prisma.TransactionClient,
  tenantId: string,
  advogados: AdvogadoParte[] | undefined,
) {
  const ensuredLawyers: Array<{
    id: string;
    nome: string;
    oabNumero?: string | null;
    oabUf?: string | null;
  }> = [];
  const seen = new Set<string>();

  for (const advogado of advogados || []) {
    const ensured = await ensureExternalAdvogado(tx, {
      tenantId,
      advogado,
    });

    if (!ensured) {
      continue;
    }

    const key = ensured.oabNumero && ensured.oabUf
      ? `${ensured.oabUf}:${ensured.oabNumero}`
      : normalizeCacheKey(ensured.nome);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    ensuredLawyers.push(ensured);
  }

  return {
    primaryAdvogadoId: ensuredLawyers[0]?.id || null,
    advogadoIds: ensuredLawyers.map((item) => item.id),
    papel:
      ensuredLawyers.length > 0
        ? ensuredLawyers.length === 1
          ? "Representado por 1 advogado"
          : `Representado por ${ensuredLawyers.length} advogados`
        : null,
    observacoes:
      ensuredLawyers.length > 0
        ? `Advogados importados via Jusbrasil: ${ensuredLawyers
            .map((item) =>
              item.oabNumero && item.oabUf
                ? `${item.nome} (${item.oabUf}/${item.oabNumero})`
                : item.nome,
            )
            .join("; ")}`
        : null,
  };
}

async function ensureCliente(
  tx: Prisma.TransactionClient,
  tenantId: string,
  processo: ProcessoJuridico,
  clienteNome?: string,
) {
  const nome = resolveClienteNome(processo, clienteNome);
  const parteCorrespondente = processo.partes?.find(
    (parte) => normalizeCacheKey(parte.nome) === normalizeCacheKey(nome),
  );
  const documento = normalizeOptionalString(parteCorrespondente?.documento);
  const email = normalizeOptionalEmail(parteCorrespondente?.email);
  const telefone = normalizeOptionalString(parteCorrespondente?.telefone);

  const existente = await tx.cliente.findFirst({
    where: {
      tenantId,
      nome: {
        equals: nome,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      nome: true,
      documento: true,
      email: true,
      telefone: true,
      celular: true,
    },
  });

  if (existente) {
    const shouldUpdateDocumento =
      Boolean(documento) && !normalizeOptionalString(existente.documento);
    const shouldUpdateEmail =
      Boolean(email) && !normalizeOptionalEmail(existente.email);
    const shouldUpdateTelefone =
      Boolean(telefone) &&
      !normalizeOptionalString(existente.telefone) &&
      !normalizeOptionalString(existente.celular);

    if (shouldUpdateDocumento || shouldUpdateEmail || shouldUpdateTelefone) {
      await tx.cliente.update({
        where: {
          id: existente.id,
        },
        data: {
          ...(shouldUpdateDocumento ? { documento } : {}),
          ...(shouldUpdateEmail ? { email } : {}),
          ...(shouldUpdateTelefone ? { telefone } : {}),
        },
      });
    }

    return {
      id: existente.id,
      nome: existente.nome,
      documento: shouldUpdateDocumento ? documento : existente.documento,
      email: shouldUpdateEmail ? email : existente.email,
      telefone: shouldUpdateTelefone ? telefone : existente.telefone,
    };
  }

  return tx.cliente.create({
    data: {
      tenantId,
      nome,
      tipoPessoa: inferTipoPessoa(nome),
      documento,
      email,
      telefone,
    },
    select: {
      id: true,
      nome: true,
      documento: true,
      email: true,
      telefone: true,
    },
  });
}

async function ensureTribunal(tenantId: string, processo: ProcessoJuridico) {
  const tribunalConfig = processo.tribunalSigla ? getTribunalConfig({ sigla: processo.tribunalSigla }) : undefined;
  const nome = processo.tribunalNome || tribunalConfig?.nome || processo.tribunalSigla || "Tribunal";
  const sigla = processo.tribunalSigla || tribunalConfig?.sigla || null;
  const uf = processo.uf || tribunalConfig?.uf || null;
  const esfera = processo.esfera || tribunalConfig?.esfera || null;
  const siteUrl = tribunalConfig?.urlBase || null;

  const whereOr: Array<{ sigla?: string | null; nome?: string; uf?: string | null }> = [];

  if (sigla) {
    whereOr.push({ sigla });
  }
  if (nome && uf) {
    whereOr.push({ nome, uf });
  }

  const existente = whereOr.length
    ? await prisma.tribunal.findFirst({
        where: {
          AND: [{ OR: whereOr }, { OR: [{ tenantId }, { tenantId: null }] }],
        },
        select: {
          id: true,
        },
      })
    : null;

  if (existente) {
    return existente;
  }

  return prisma.tribunal.create({
    data: {
      tenantId: null,
      nome,
      sigla,
      uf,
      esfera: esfera ? String(esfera) : null,
      siteUrl,
    },
    select: {
      id: true,
    },
  });
}

async function buildPartesPayload(
  tx: Prisma.TransactionClient,
  tenantId: string,
  processoId: string,
  partes: ParteProcesso[] | undefined,
  cliente: {
    id: string;
    nome: string;
    documento?: string | null;
    email?: string | null;
    telefone?: string | null;
  },
) {
  const payload: Array<{
    tenantId: string;
    processoId: string;
    tipoPolo: ProcessoPolo;
    nome: string;
    documento?: string | null;
    email?: string | null;
    telefone?: string | null;
    clienteId?: string | null;
    advogadoId?: string | null;
    papel?: string | null;
    observacoes?: string | null;
  }> = [];
  const seen = new Set<string>();

  for (const parte of partes || []) {
    const tipoPolo = mapPartePolo(parte);
    if (!tipoPolo) continue;
    const nome = parte.nome.trim();
    if (!nome) continue;

    const key = `${tipoPolo}:${normalizeCacheKey(nome)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const isCliente = normalizeCacheKey(nome) === normalizeCacheKey(cliente.nome);
    const lawyerSummary = await summarizeParteLawyers(tx, tenantId, parte.advogados);

    if (isCliente) {
      for (const advogadoId of lawyerSummary.advogadoIds) {
        await ensureAdvogadoClienteLink(tx, {
          tenantId,
          advogadoId,
          clienteId: cliente.id,
        });
      }
    }

    payload.push({
      tenantId,
      processoId,
      tipoPolo,
      nome,
      documento: parte.documento || null,
      email: normalizeOptionalEmail(parte.email),
      telefone: normalizeOptionalString(parte.telefone),
      clienteId: isCliente ? cliente.id : null,
      advogadoId: lawyerSummary.primaryAdvogadoId,
      papel: lawyerSummary.papel,
      observacoes: lawyerSummary.observacoes,
    });
  }

  const clienteKey = `${ProcessoPolo.AUTOR}:${normalizeCacheKey(cliente.nome)}`;
  if (!seen.has(clienteKey)) {
    payload.push({
      tenantId,
      processoId,
      tipoPolo: ProcessoPolo.AUTOR,
      nome: cliente.nome,
      documento: cliente.documento || null,
      email: cliente.email || null,
      telefone: cliente.telefone || null,
      clienteId: cliente.id,
    });
  }

  return payload;
}

type PartePayload = Awaited<ReturnType<typeof buildPartesPayload>>[number];

async function syncProcessoPartes(
  tx: Prisma.TransactionClient,
  partesPayload: PartePayload[],
) {
  if (partesPayload.length === 0) {
    return;
  }

  const { tenantId, processoId } = partesPayload[0];
  const existentes = await tx.processoParte.findMany({
    where: {
      tenantId,
      processoId,
    },
    select: {
      id: true,
      tipoPolo: true,
      nome: true,
      documento: true,
      email: true,
      telefone: true,
      clienteId: true,
      advogadoId: true,
      papel: true,
      observacoes: true,
    },
  });

  const existingMap = new Map(
    existentes.map((parte) => [
      `${parte.tipoPolo}:${normalizeCacheKey(parte.nome)}`,
      parte,
    ]),
  );

  for (const parte of partesPayload) {
    const key = `${parte.tipoPolo}:${normalizeCacheKey(parte.nome)}`;
    const existente = existingMap.get(key);

    if (!existente) {
      await tx.processoParte.create({
        data: parte,
      });
      continue;
    }

    const shouldUpdateDocumento =
      !existente.documento && Boolean(parte.documento);
    const shouldUpdateEmail = !existente.email && Boolean(parte.email);
    const shouldUpdateTelefone = !existente.telefone && Boolean(parte.telefone);
    const shouldUpdateCliente =
      !existente.clienteId && Boolean(parte.clienteId);
    const shouldUpdateAdvogado =
      !existente.advogadoId && Boolean(parte.advogadoId);
    const shouldUpdatePapel =
      normalizeCacheKey(existente.papel || "") !== normalizeCacheKey(parte.papel || "");
    const shouldUpdateObservacoes =
      normalizeCacheKey(existente.observacoes || "") !==
      normalizeCacheKey(parte.observacoes || "");

    if (
      shouldUpdateDocumento ||
      shouldUpdateEmail ||
      shouldUpdateTelefone ||
      shouldUpdateCliente ||
      shouldUpdateAdvogado ||
      shouldUpdatePapel ||
      shouldUpdateObservacoes
    ) {
      await tx.processoParte.update({
        where: { id: existente.id },
        data: {
          ...(shouldUpdateDocumento ? { documento: parte.documento } : {}),
          ...(shouldUpdateEmail ? { email: parte.email } : {}),
          ...(shouldUpdateTelefone ? { telefone: parte.telefone } : {}),
          ...(shouldUpdateCliente ? { clienteId: parte.clienteId } : {}),
          ...(shouldUpdateAdvogado ? { advogadoId: parte.advogadoId } : {}),
          ...(shouldUpdatePapel ? { papel: parte.papel } : {}),
          ...(shouldUpdateObservacoes
            ? { observacoes: parte.observacoes }
            : {}),
        },
      });
    }
  }
}

async function ensureAdvogadoClienteLink(
  tx: Prisma.TransactionClient,
  params: {
    tenantId: string;
    advogadoId?: string;
    clienteId: string;
  },
) {
  const { tenantId, advogadoId, clienteId } = params;
  if (!advogadoId) {
    return;
  }

  await tx.advogadoCliente.upsert({
    where: {
      advogadoId_clienteId: {
        advogadoId,
        clienteId,
      },
    },
    update: {},
    create: {
      tenantId,
      advogadoId,
      clienteId,
      relacionamento: "IMPORTADO_CAPTURA",
    },
  });
}

const EXTERNAL_SYNC_TAG = "origem:sincronizacao_externa";

function extractStringTags(tags: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter(Boolean);
}

function buildExternalSyncTags(tags: Prisma.JsonValue | null | undefined): string[] {
  const uniqueTags = new Set(extractStringTags(tags));
  uniqueTags.add(EXTERNAL_SYNC_TAG);
  return Array.from(uniqueTags);
}

export async function upsertProcessoFromCapture(params: {
  tenantId: string;
  processo: ProcessoJuridico;
  clienteNome?: string;
  advogadoId?: string;
  updateIfExists?: boolean;
  syncJusbrasilProcessMonitor?: boolean;
}) {
  const {
    tenantId,
    processo,
    clienteNome,
    advogadoId,
    updateIfExists = true,
    syncJusbrasilProcessMonitor = true,
  } = params;
  const numero = processo.numeroProcesso?.trim();

  if (!numero) {
    throw new Error("Número do processo não informado para persistir");
  }

  const existente = await prisma.processo.findFirst({
    where: {
      tenantId,
      OR: [{ numero }, { numeroCnj: numero }],
    },
    select: {
      id: true,
      status: true,
      clienteId: true,
      advogadoResponsavelId: true,
      tags: true,
    },
  });

  const tribunal = await ensureTribunal(tenantId, processo);
  const reatribuirCliente = Boolean(clienteNome && clienteNome.trim().length > 0);

  if (existente && !updateIfExists) {
    return { processoId: existente.id, created: false, updated: false };
  }

  if (existente && updateIfExists) {
    await prisma.$transaction(async (tx) => {
      const clienteAtual =
        (await tx.cliente.findUnique({
          where: { id: existente.clienteId },
          select: {
            id: true,
            nome: true,
            documento: true,
            email: true,
            telefone: true,
          },
        })) ||
        (await ensureCliente(tx, tenantId, processo, clienteNome));

      const clienteAlvo = reatribuirCliente
        ? await ensureCliente(tx, tenantId, processo, clienteNome)
        : clienteAtual;

      await tx.processo.update({
        where: { id: existente.id },
        data: {
          numeroCnj: numero,
          classeProcessual: processo.classe || null,
          comarca: processo.comarca || null,
          vara: processo.vara || null,
          dataDistribuicao: processo.dataDistribuicao || null,
          valorCausa: processo.valorCausa ?? null,
          tribunalId: tribunal.id,
          descricao: processo.assunto || null,
          ...(existente.status === ProcessoStatus.RASCUNHO
            ? { status: ProcessoStatus.EM_ANDAMENTO }
            : {}),
          ...(advogadoId ? { advogadoResponsavelId: advogadoId } : {}),
          ...(reatribuirCliente ? { clienteId: clienteAlvo.id } : {}),
          tags: buildExternalSyncTags(existente.tags),
        },
      });

      const partesPayload = await buildPartesPayload(
        tx,
        tenantId,
        existente.id,
        processo.partes,
        clienteAlvo,
      );

      await syncProcessoPartes(tx, partesPayload);
      await syncCapturedProcessDocuments(tx, {
        tenantId,
        processoId: existente.id,
        clienteId: clienteAlvo.id,
        documentos: processo.documentos,
      });
      await ensureAdvogadoClienteLink(tx, {
        tenantId,
        advogadoId,
        clienteId: clienteAlvo.id,
      });
    }, {
      maxWait: 10_000,
      timeout: 30_000,
    });

    if (syncJusbrasilProcessMonitor) {
      await ensureJusbrasilProcessMonitorBestEffort({
        tenantId,
        processoId: existente.id,
        numeroProcesso: numero,
      });
    }

    return { processoId: existente.id, created: false, updated: true };
  }

  const criado = await prisma.$transaction(async (tx) => {
    const cliente = await ensureCliente(tx, tenantId, processo, clienteNome);

    const processoCriado = await tx.processo.create({
      data: {
        tenantId,
        numero,
        numeroCnj: numero,
        status: ProcessoStatus.EM_ANDAMENTO,
        classeProcessual: processo.classe || null,
        comarca: processo.comarca || null,
        vara: processo.vara || null,
        dataDistribuicao: processo.dataDistribuicao || null,
        valorCausa: processo.valorCausa ?? null,
        clienteId: cliente.id,
        tribunalId: tribunal.id,
        descricao: processo.assunto || null,
        advogadoResponsavelId: advogadoId || null,
        tags: buildExternalSyncTags(null),
      },
      select: {
        id: true,
      },
    });

    const partesPayload = await buildPartesPayload(
      tx,
      tenantId,
      processoCriado.id,
      processo.partes,
      cliente,
    );

    if (partesPayload.length > 0) {
      await tx.processoParte.createMany({
        data: partesPayload,
      });
    }

    await syncCapturedProcessDocuments(tx, {
      tenantId,
      processoId: processoCriado.id,
      clienteId: cliente.id,
      documentos: processo.documentos,
    });

    await ensureAdvogadoClienteLink(tx, {
      tenantId,
      advogadoId,
      clienteId: cliente.id,
      });

    return processoCriado;
  }, {
    maxWait: 10_000,
    timeout: 30_000,
  });

  if (syncJusbrasilProcessMonitor) {
    await ensureJusbrasilProcessMonitorBestEffort({
      tenantId,
      processoId: criado.id,
      numeroProcesso: numero,
    });
  }

  return { processoId: criado.id, created: true, updated: false };
}
