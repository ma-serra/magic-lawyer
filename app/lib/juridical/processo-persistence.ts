import prisma from "@/app/lib/prisma";
import { ensureJusbrasilProcessMonitorBestEffort } from "@/app/lib/juridical/jusbrasil-process-monitoring";
import { Prisma, ProcessoStatus, ProcessoPolo, TipoPessoa } from "@/generated/prisma";
import { getTribunalConfig } from "@/lib/api/juridical/config";
import { ParteProcesso, ProcessoJuridico } from "@/lib/api/juridical/types";

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

async function ensureCliente(tenantId: string, processo: ProcessoJuridico, clienteNome?: string) {
  const nome = resolveClienteNome(processo, clienteNome);
  const documento = processo.partes?.find((parte) => parte.nome.trim().toLowerCase() === nome.trim().toLowerCase() && parte.documento)?.documento;

  const existente = await prisma.cliente.findFirst({
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
    },
  });

  if (existente) {
    return existente;
  }

  return prisma.cliente.create({
    data: {
      tenantId,
      nome,
      tipoPessoa: inferTipoPessoa(nome),
      documento: documento || null,
    },
    select: {
      id: true,
      nome: true,
      documento: true,
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

function buildPartesPayload(tenantId: string, processoId: string, partes: ParteProcesso[] | undefined, cliente: { id: string; nome: string; documento?: string | null }) {
  const payload: Array<{
    tenantId: string;
    processoId: string;
    tipoPolo: ProcessoPolo;
    nome: string;
    documento?: string | null;
    clienteId?: string | null;
  }> = [];
  const seen = new Set<string>();

  (partes || []).forEach((parte) => {
    const tipoPolo = mapPartePolo(parte);
    if (!tipoPolo) return;
    const nome = parte.nome.trim();
    if (!nome) return;

    const key = `${tipoPolo}:${normalizeCacheKey(nome)}`;
    if (seen.has(key)) return;
    seen.add(key);

    const isCliente = normalizeCacheKey(nome) === normalizeCacheKey(cliente.nome);

    payload.push({
      tenantId,
      processoId,
      tipoPolo,
      nome,
      documento: parte.documento || null,
      clienteId: isCliente ? cliente.id : null,
    });
  });

  const clienteKey = `${ProcessoPolo.AUTOR}:${normalizeCacheKey(cliente.nome)}`;
  if (!seen.has(clienteKey)) {
    payload.push({
      tenantId,
      processoId,
      tipoPolo: ProcessoPolo.AUTOR,
      nome: cliente.nome,
      documento: cliente.documento || null,
      clienteId: cliente.id,
    });
  }

  return payload;
}

type PartePayload = ReturnType<typeof buildPartesPayload>[number];

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
      clienteId: true,
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
    const shouldUpdateCliente =
      !existente.clienteId && Boolean(parte.clienteId);

    if (shouldUpdateDocumento || shouldUpdateCliente) {
      await tx.processoParte.update({
        where: { id: existente.id },
        data: {
          ...(shouldUpdateDocumento ? { documento: parte.documento } : {}),
          ...(shouldUpdateCliente ? { clienteId: parte.clienteId } : {}),
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
}) {
  const {
    tenantId,
    processo,
    clienteNome,
    advogadoId,
    updateIfExists = true,
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
    const clienteAtual =
      (await prisma.cliente.findUnique({
        where: { id: existente.clienteId },
        select: { id: true, nome: true, documento: true },
      })) ||
      (await ensureCliente(tenantId, processo, clienteNome));

    const clienteAlvo = reatribuirCliente
      ? await ensureCliente(tenantId, processo, clienteNome)
      : clienteAtual;

    await prisma.$transaction(async (tx) => {
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

      const partesPayload = buildPartesPayload(
        tenantId,
        existente.id,
        processo.partes,
        clienteAlvo,
      );

      await syncProcessoPartes(tx, partesPayload);
      await ensureAdvogadoClienteLink(tx, {
        tenantId,
        advogadoId,
        clienteId: clienteAlvo.id,
      });
    });

    await ensureJusbrasilProcessMonitorBestEffort({
      tenantId,
      processoId: existente.id,
      numeroProcesso: numero,
    });

    return { processoId: existente.id, created: false, updated: true };
  }

  const cliente = await ensureCliente(tenantId, processo, clienteNome);

  const criado = await prisma.$transaction(async (tx) => {
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

    const partesPayload = buildPartesPayload(tenantId, processoCriado.id, processo.partes, cliente);

    if (partesPayload.length > 0) {
      await tx.processoParte.createMany({
        data: partesPayload,
      });
    }

    await ensureAdvogadoClienteLink(tx, {
      tenantId,
      advogadoId,
      clienteId: cliente.id,
    });

    return processoCriado;
  });

  await ensureJusbrasilProcessMonitorBestEffort({
    tenantId,
    processoId: criado.id,
    numeroProcesso: numero,
  });

  return { processoId: criado.id, created: true, updated: false };
}
