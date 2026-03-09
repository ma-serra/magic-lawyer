"use server";

import { Prisma } from "@/generated/prisma";
import { getServerSession } from "next-auth/next";

import prisma from "@/app/lib/prisma";
import { emailService } from "@/app/lib/email-service";
import { authOptions } from "@/auth";
import logger from "@/lib/logger";

// ==================== TIPOS ====================

export type Plano = {
  id: string;
  nome: string;
  slug: string;
  descricao?: string | null;
  valorMensal?: number | null;
  valorAnual?: number | null;
  moeda: string;
  limiteUsuarios?: number | null;
  limiteProcessos?: number | null;
  limiteStorageMb?: number | null;
  recursos?: any;
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const PLANO_VERSAO_STATUS = {
  DRAFT: "DRAFT",
  REVIEW: "REVIEW",
  PUBLISHED: "PUBLISHED",
  ARCHIVED: "ARCHIVED",
} as const;

const PLANO_REAJUSTE_STATUS = {
  SCHEDULED: "SCHEDULED",
  ACTIVE: "ACTIVE",
  CANCELED: "CANCELED",
} as const;

const PLANO_REAJUSTE_FASE = {
  PRE_VIGENCIA: "PRE_VIGENCIA",
  POS_VIGENCIA: "POS_VIGENCIA",
} as const;

export type PlanoVersaoStatusValue =
  (typeof PLANO_VERSAO_STATUS)[keyof typeof PLANO_VERSAO_STATUS];

export type PlanoVersaoResumo = {
  id: string;
  numero: number;
  status: PlanoVersaoStatusValue;
  titulo?: string | null;
  descricao?: string | null;
  publicadoEm?: Date | null;
  criadoPorId?: string | null;
  publicadoPorId?: string | null;
};

export type ModuloCatalogoItem = {
  id: string;
  slug: string;
  nome: string;
  descricao?: string | null;
  categoria?: string | null;
  categoriaInfo?: {
    id: string;
    nome: string;
    slug: string;
    cor: string | null;
    icone: string | null;
  } | null;
  icone?: string | null;
  ordem?: number | null;
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type PlanoModuloConfig = {
  moduloId: string;
  slug: string;
  nome: string;
  categoria?: string | null;
  categoriaInfo?: {
    id: string;
    nome: string;
    slug: string;
    cor: string | null;
    icone: string | null;
  } | null;
  descricao?: string | null;
  icone?: string | null;
  ordem?: number | null;
  ordemNoPlano?: number | null;
  habilitado: boolean;
};

export type PlanoModuloUpdateInput = {
  moduloId: string;
  habilitado: boolean;
  ordem?: number | null;
};

export type DefaultActionResponse = {
  success: boolean;
  error?: string;
};

export type PlanoMatrixModuleRow = {
  moduloId: string;
  slug: string;
  nome: string;
  descricao?: string | null;
  categoria?: string | null;
  categoriaInfo?: {
    id: string;
    nome: string;
    slug: string;
    cor: string | null;
    icone: string | null;
  } | null;
  planos: Array<{
    planoId: string;
    habilitado: boolean;
  }>;
};

type CatalogModule = {
  id: string;
  slug: string;
  nome: string;
  categoria: string | null;
  categoriaInfo: {
    id: string;
    nome: string;
    slug: string;
    cor: string | null;
    icone: string | null;
  } | null;
  descricao: string | null;
  icone: string | null;
  ordem: number | null;
};

export type GetPlanoMatrixResponse = {
  success: boolean;
  data?: {
    planos: Array<{ id: string; nome: string; slug: string }>;
    modulos: PlanoMatrixModuleRow[];
  };
  error?: string;
};

export type PlanoReajusteStatusValue =
  (typeof PLANO_REAJUSTE_STATUS)[keyof typeof PLANO_REAJUSTE_STATUS];

export type PlanoReajusteFaseValue =
  (typeof PLANO_REAJUSTE_FASE)[keyof typeof PLANO_REAJUSTE_FASE];

export type PlanoReajusteResumo = {
  id: string;
  planoId: string;
  status: PlanoReajusteStatusValue;
  vigenciaEm: Date;
  avisoDiasAntes: number;
  avisoDiasDepois: number;
  aplicarAssinaturasAtivas: boolean;
  valorMensalAnterior?: number | null;
  valorMensalNovo?: number | null;
  valorAnualAnterior?: number | null;
  valorAnualNovo?: number | null;
  moeda: string;
  aplicadoEm?: Date | null;
  canceladoEm?: Date | null;
  motivoCancelamento?: string | null;
  observacoes?: string | null;
  criadoPorEmail?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AgendarPlanoReajusteInput = {
  valorMensalNovo?: number | null;
  valorAnualNovo?: number | null;
  vigenciaEm: string;
  avisoDiasAntes?: number;
  avisoDiasDepois?: number;
  aplicarAssinaturasAtivas?: boolean;
  observacoes?: string;
};

type PlanoNotificacaoDestinatario = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
};

function toPlanoVersaoResumo(versao: {
  id: string;
  numero: number;
  status: string;
  titulo: string | null;
  descricao: string | null;
  publicadoEm: Date | null;
  criadoPorId: string | null;
  publicadoPorId: string | null;
}): PlanoVersaoResumo {
  return {
    id: versao.id,
    numero: versao.numero,
    status: versao.status as PlanoVersaoStatusValue,
    titulo: versao.titulo ?? undefined,
    descricao: versao.descricao ?? undefined,
    publicadoEm: versao.publicadoEm ?? undefined,
    criadoPorId: versao.criadoPorId ?? undefined,
    publicadoPorId: versao.publicadoPorId ?? undefined,
  };
}

function toPlanoReajusteResumo(reajuste: {
  id: string;
  planoId: string;
  status: string;
  vigenciaEm: Date;
  avisoDiasAntes: number;
  avisoDiasDepois: number;
  aplicarAssinaturasAtivas: boolean;
  valorMensalAnterior: Prisma.Decimal | null;
  valorMensalNovo: Prisma.Decimal | null;
  valorAnualAnterior: Prisma.Decimal | null;
  valorAnualNovo: Prisma.Decimal | null;
  moeda: string;
  aplicadoEm: Date | null;
  canceladoEm: Date | null;
  motivoCancelamento: string | null;
  observacoes: string | null;
  criadoPorEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
}): PlanoReajusteResumo {
  return {
    id: reajuste.id,
    planoId: reajuste.planoId,
    status: reajuste.status as PlanoReajusteStatusValue,
    vigenciaEm: reajuste.vigenciaEm,
    avisoDiasAntes: reajuste.avisoDiasAntes,
    avisoDiasDepois: reajuste.avisoDiasDepois,
    aplicarAssinaturasAtivas: reajuste.aplicarAssinaturasAtivas,
    valorMensalAnterior: reajuste.valorMensalAnterior
      ? Number(reajuste.valorMensalAnterior)
      : null,
    valorMensalNovo: reajuste.valorMensalNovo
      ? Number(reajuste.valorMensalNovo)
      : null,
    valorAnualAnterior: reajuste.valorAnualAnterior
      ? Number(reajuste.valorAnualAnterior)
      : null,
    valorAnualNovo: reajuste.valorAnualNovo
      ? Number(reajuste.valorAnualNovo)
      : null,
    moeda: reajuste.moeda,
    aplicadoEm: reajuste.aplicadoEm,
    canceladoEm: reajuste.canceladoEm,
    motivoCancelamento: reajuste.motivoCancelamento,
    observacoes: reajuste.observacoes,
    criadoPorEmail: reajuste.criadoPorEmail,
    createdAt: reajuste.createdAt,
    updatedAt: reajuste.updatedAt,
  };
}

function getStartOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);

  copy.setDate(copy.getDate() + days);

  return copy;
}

function diffInCalendarDays(a: Date, b: Date): number {
  const aStart = getStartOfDay(a).getTime();
  const bStart = getStartOfDay(b).getTime();

  return Math.round((aStart - bStart) / (24 * 60 * 60 * 1000));
}

function formatMoney(value?: number | null, moeda = "BRL") {
  if (value == null) {
    return "N/I";
  }

  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: moeda,
    maximumFractionDigits: 2,
  });
}

function parseDateAtStartOfDay(value: string): Date | null {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const [year, month, day] = normalized.split("-").map(Number);

    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }

  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  parsed.setHours(0, 0, 0, 0);

  return parsed;
}

function normalizeMoneyInput(
  input: number | null | undefined,
  fallback: Prisma.Decimal | null,
): Prisma.Decimal | null {
  if (input === undefined) {
    return fallback;
  }

  if (input === null) {
    return null;
  }

  return new Prisma.Decimal(input);
}

async function createPlanoVersaoSnapshotTx(
  tx: Prisma.TransactionClient,
  params: {
    plano: { id: string; nome: string };
    status: PlanoVersaoStatusValue;
    usuarioId?: string | null;
    titulo?: string;
    descricao?: string;
    requireActiveModules?: boolean;
  },
) {
  const { plano, status, usuarioId, titulo, descricao, requireActiveModules } =
    params;

  const modulosAtivos: Array<{
    moduloId: string;
    ordem: number;
    modulo: { ordem: number | null; nome: string };
  }> = await tx.planoModulo.findMany({
    where: { planoId: plano.id, habilitado: true },
    include: {
      modulo: {
        select: {
          ordem: true,
          nome: true,
        },
      },
    },
  });

  if (
    (requireActiveModules ?? status === PLANO_VERSAO_STATUS.PUBLISHED) &&
    modulosAtivos.length === 0
  ) {
    throw new Error(
      "Nenhum módulo habilitado. Ative ao menos um módulo antes de criar a versão.",
    );
  }

  const ultimaVersao = await tx.planoVersao.findFirst({
    where: { planoId: plano.id },
    orderBy: { numero: "desc" },
  });

  const proximoNumero = (ultimaVersao?.numero ?? 0) + 1;

  const defaultTitulo =
    titulo ??
    (status === PLANO_VERSAO_STATUS.REVIEW
      ? `${plano.nome} · Revisão ${proximoNumero}`
      : status === PLANO_VERSAO_STATUS.DRAFT
        ? `${plano.nome} · Rascunho ${proximoNumero}`
        : `${plano.nome} · Versão ${proximoNumero}`);

  const modulosData = [...modulosAtivos]
    .sort(
      (a, b) =>
        a.ordem - b.ordem ||
        (a.modulo.ordem ?? 999) - (b.modulo.ordem ?? 999) ||
        a.modulo.nome.localeCompare(b.modulo.nome),
    )
    .map(
      (
        modulo,
        ordem,
      ): {
        moduloId: string;
        habilitado: boolean;
        ordem: number;
      } => ({
        moduloId: modulo.moduloId,
        habilitado: true,
        ordem,
      }),
    );

  const now = new Date();

  const versao = await tx.planoVersao.create({
    data: {
      planoId: plano.id,
      numero: proximoNumero,
      status,
      titulo: defaultTitulo,
      descricao,
      criadoPorId: usuarioId ?? null,
      publicadoPorId:
        status === PLANO_VERSAO_STATUS.PUBLISHED
          ? (usuarioId ?? null)
          : undefined,
      publicadoEm: status === PLANO_VERSAO_STATUS.PUBLISHED ? now : undefined,
      modulos:
        modulosData.length > 0
          ? {
              createMany: {
                data: modulosData,
              },
            }
          : undefined,
    },
  });

  return versao;
}

export type TenantSubscription = {
  id: string;
  tenantId: string;
  planoId?: string;
  status: string;
  dataInicio: Date;
  dataFim?: Date | null;
  renovaEm?: Date | null;
  trialEndsAt?: Date | null;
  externalCustomerId?: string | null;
  externalSubscriptionId?: string | null;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
};

export type GetPlanosResponse = {
  success: boolean;
  data?: Plano[];
  error?: string;
};

export type GetPlanoResponse = {
  success: boolean;
  data?: Plano;
  error?: string;
};

export type GetPlanoConfiguracaoResponse = {
  success: boolean;
  data?: {
    plano: Plano;
    modulos: PlanoModuloConfig[];
    versoes: PlanoVersaoResumo[];
    ultimaVersao?: PlanoVersaoResumo;
  };
  error?: string;
};

export type GetModuloCatalogoResponse = {
  success: boolean;
  data?: ModuloCatalogoItem[];
  error?: string;
};

export type GetEstatisticasPlanosResponse = {
  success: boolean;
  data?: {
    totalPlanos: number;
    planosAtivos: number;
    totalAssinaturas: number;
    assinaturasAtivas: number;
    faturamentoMensal: number;
  };
  error?: string;
};

export type GetPlanoReajustesResponse = {
  success: boolean;
  data?: PlanoReajusteResumo[];
  error?: string;
};

export type AgendarPlanoReajusteResponse = {
  success: boolean;
  data?: {
    reajuste: PlanoReajusteResumo;
    impacto: {
      assinaturasAtivas: number;
      tenantsAtivosComAssinatura: number;
      adminsNotificaveis: number;
    };
  };
  error?: string;
};

export type CancelarPlanoReajusteResponse = {
  success: boolean;
  data?: PlanoReajusteResumo;
  error?: string;
};

// ==================== FUNÇÕES AUXILIARES ====================

async function ensureSuperAdmin() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !session?.user?.email) {
    throw new Error("Não autenticado");
  }

  const userRole = (session.user as any)?.role;

  if (userRole !== "SUPER_ADMIN") {
    throw new Error(
      "Acesso negado. Apenas Super Admins podem gerenciar planos.",
    );
  }

  // Buscar o ID do SuperAdmin correspondente ao usuário
  const superAdmin = await prisma.superAdmin.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });

  if (!superAdmin) {
    throw new Error("Super Admin não encontrado");
  }

  return superAdmin.id;
}

async function ensureSuperAdminContext() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !session.user.email) {
    throw new Error("Não autenticado");
  }

  const userRole = (session.user as any)?.role;

  if (userRole !== "SUPER_ADMIN") {
    throw new Error(
      "Acesso negado. Apenas Super Admins podem gerenciar planos.",
    );
  }

  const superAdmin = await prisma.superAdmin.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true },
  });

  if (!superAdmin) {
    throw new Error("Super Admin não encontrado");
  }

  return {
    superAdminId: superAdmin.id,
    email: superAdmin.email,
  };
}

async function notifyTenantAdminsAboutPlanoReajuste(params: {
  tenantId: string;
  tenantName: string;
  planoNome: string;
  reajusteId: string;
  fase: PlanoReajusteFaseValue;
  vigenciaEm: Date;
  valorMensalNovo?: number | null;
  valorAnualNovo?: number | null;
  moeda: string;
  aplicarAssinaturasAtivas: boolean;
}) {
  const {
    tenantId,
    tenantName,
    planoNome,
    reajusteId,
    fase,
    vigenciaEm,
    valorMensalNovo,
    valorAnualNovo,
    moeda,
    aplicarAssinaturasAtivas,
  } = params;

  const destinatarios: PlanoNotificacaoDestinatario[] =
    await prisma.usuario.findMany({
      where: {
        tenantId,
        role: "ADMIN",
        active: true,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
      take: 20,
    });

  if (!destinatarios.length) {
    return { emailEnviado: false, inAppCriado: false };
  }

  const valorMensalLabel = formatMoney(valorMensalNovo, moeda);
  const valorAnualLabel = formatMoney(valorAnualNovo, moeda);
  const vigenciaLabel = vigenciaEm.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });

  const titulo =
    fase === PLANO_REAJUSTE_FASE.PRE_VIGENCIA
      ? `Reajuste programado do plano ${planoNome}`
      : `Reajuste aplicado no plano ${planoNome}`;
  const mensagem =
    fase === PLANO_REAJUSTE_FASE.PRE_VIGENCIA
      ? `O plano ${planoNome} terá novo valor em ${vigenciaLabel}. Mensal: ${valorMensalLabel}. Anual: ${valorAnualLabel}.`
      : `O plano ${planoNome} foi reajustado em ${vigenciaLabel}. Mensal: ${valorMensalLabel}. Anual: ${valorAnualLabel}.`;
  const observacaoContratual = aplicarAssinaturasAtivas
    ? "Assinaturas ativas também foram atualizadas para este novo valor."
    : "Assinaturas ativas permanecem no valor contratado atual (somente novas assinaturas usam o novo preço).";

  const notificacao = await prisma.notificacao.create({
    data: {
      tenantId,
      titulo,
      mensagem: `${mensagem} ${observacaoContratual}`,
      tipo: "FINANCEIRO",
      prioridade: fase === PLANO_REAJUSTE_FASE.PRE_VIGENCIA ? "ALTA" : "MEDIA",
      canais: ["IN_APP", "EMAIL"],
      referenciaTipo: "PLANO_REAJUSTE",
      referenciaId: reajusteId,
      dados: {
        plano: planoNome,
        vigenciaEm,
        valorMensalNovo,
        valorAnualNovo,
        moeda,
        fase,
        aplicarAssinaturasAtivas,
      },
      createdById: null,
    },
    select: { id: true },
  });

  await prisma.notificacaoUsuario.createMany({
    data: destinatarios.map((destinatario) => ({
      notificacaoId: notificacao.id,
      tenantId,
      usuarioId: destinatario.id,
      canal: "IN_APP",
    })),
    skipDuplicates: true,
  });

  let emailEnviado = false;

  for (const destinatario of destinatarios) {
    if (!destinatario.email) {
      continue;
    }

    const nome =
      [destinatario.firstName, destinatario.lastName]
        .filter(Boolean)
        .join(" ") || destinatario.email;

    const html = `
      <h2>${titulo}</h2>
      <p>Olá ${nome},</p>
      <p>${mensagem}</p>
      <p><strong>Regra contratual:</strong> ${observacaoContratual}</p>
      <p>Escritório: ${tenantName}</p>
      <p>Este aviso foi gerado automaticamente pelo Magic Lawyer.</p>
    `;

    const envio = await emailService.sendEmailPerTenant(tenantId, {
      to: destinatario.email,
      subject: `Magic Lawyer · ${titulo}`,
      html,
      text: `${titulo}\n\n${mensagem}\n\nRegra contratual: ${observacaoContratual}\n\nEscritório: ${tenantName}`,
      credentialType: "ADMIN",
      fromNameFallback: "Magic Lawyer",
    });

    if (envio.success) {
      emailEnviado = true;
    }
  }

  return { emailEnviado, inAppCriado: true };
}

async function processPlanoPriceRollouts() {
  const now = new Date();
  const today = getStartOfDay(now);

  const reajustes = await prisma.planoReajuste.findMany({
    where: {
      status: {
        in: [PLANO_REAJUSTE_STATUS.SCHEDULED, PLANO_REAJUSTE_STATUS.ACTIVE],
      },
    },
    include: {
      plano: {
        select: {
          id: true,
          nome: true,
          valorMensal: true,
          valorAnual: true,
          moeda: true,
        },
      },
    },
    orderBy: [{ vigenciaEm: "asc" }],
    take: 50,
  });

  for (const reajuste of reajustes) {
    if (
      reajuste.status === PLANO_REAJUSTE_STATUS.SCHEDULED &&
      reajuste.vigenciaEm <= now
    ) {
      await prisma.$transaction(async (tx) => {
        const current = await tx.planoReajuste.findUnique({
          where: { id: reajuste.id },
          select: {
            id: true,
            planoId: true,
            status: true,
            valorMensalNovo: true,
            valorAnualNovo: true,
            valorMensalAnterior: true,
            valorAnualAnterior: true,
            moeda: true,
            aplicarAssinaturasAtivas: true,
            criadoPorEmail: true,
          },
        });

        if (!current || current.status !== PLANO_REAJUSTE_STATUS.SCHEDULED) {
          return;
        }

        // "Trava" de idempotência: só uma transação pode ativar o reajuste.
        const lock = await tx.planoReajuste.updateMany({
          where: {
            id: current.id,
            status: PLANO_REAJUSTE_STATUS.SCHEDULED,
          },
          data: {
            status: PLANO_REAJUSTE_STATUS.ACTIVE,
            aplicadoEm: new Date(),
            updatedAt: new Date(),
          },
        });

        if (lock.count === 0) {
          return;
        }

        if (current.aplicarAssinaturasAtivas) {
          await tx.tenantSubscription.updateMany({
            where: {
              planoId: current.planoId,
              status: {
                in: ["ATIVA", "TRIAL"],
              },
            },
            data: {
              valorMensalContratado: current.valorMensalNovo,
              valorAnualContratado: current.valorAnualNovo,
              moedaContratada: current.moeda,
              precoCongelado: false,
              updatedAt: new Date(),
            },
          });
        } else {
          // Mantém assinaturas já ativas no valor contratado anterior.
          await tx.tenantSubscription.updateMany({
            where: {
              planoId: current.planoId,
              status: {
                in: ["ATIVA", "TRIAL"],
              },
            },
            data: {
              valorMensalContratado: current.valorMensalAnterior,
              valorAnualContratado: current.valorAnualAnterior,
              moedaContratada: current.moeda,
              precoCongelado: true,
              updatedAt: new Date(),
            },
          });
        }

        await tx.plano.update({
          where: { id: current.planoId },
          data: {
            valorMensal: current.valorMensalNovo,
            valorAnual: current.valorAnualNovo,
            moeda: current.moeda,
            updatedAt: new Date(),
          },
        });

        if (current.criadoPorEmail) {
          const superAdmin = await tx.superAdmin.findUnique({
            where: { email: current.criadoPorEmail },
            select: { id: true },
          });

          if (superAdmin?.id) {
            await tx.superAdminAuditLog.create({
              data: {
                superAdminId: superAdmin.id,
                acao: "APPLY_PLANO_REAJUSTE",
                entidade: "PLANO_REAJUSTE",
                entidadeId: current.id,
                dadosNovos: {
                  planoId: current.planoId,
                  valorMensalNovo: current.valorMensalNovo,
                  valorAnualNovo: current.valorAnualNovo,
                  moeda: current.moeda,
                  aplicarAssinaturasAtivas: current.aplicarAssinaturasAtivas,
                },
              },
            });
          }
        }
      });
    }

    const current = await prisma.planoReajuste.findUnique({
      where: { id: reajuste.id },
      include: {
        plano: {
          select: {
            nome: true,
          },
        },
      },
    });

    if (!current || current.status === PLANO_REAJUSTE_STATUS.CANCELED) {
      continue;
    }

    const daysUntilVigencia = diffInCalendarDays(current.vigenciaEm, now);
    const daysSinceApplied =
      current.aplicadoEm != null
        ? diffInCalendarDays(now, current.aplicadoEm)
        : null;

    const shouldNotifyPre =
      current.status === PLANO_REAJUSTE_STATUS.SCHEDULED &&
      daysUntilVigencia >= 0 &&
      daysUntilVigencia <= current.avisoDiasAntes;
    const shouldNotifyPost =
      current.status === PLANO_REAJUSTE_STATUS.ACTIVE &&
      current.aplicadoEm != null &&
      daysSinceApplied != null &&
      daysSinceApplied >= 0 &&
      daysSinceApplied <= current.avisoDiasDepois;

    const fase: PlanoReajusteFaseValue | null = shouldNotifyPre
      ? PLANO_REAJUSTE_FASE.PRE_VIGENCIA
      : shouldNotifyPost
        ? PLANO_REAJUSTE_FASE.POS_VIGENCIA
        : null;

    if (!fase) {
      continue;
    }

    const assinaturasAtivas = await prisma.tenantSubscription.findMany({
      where: {
        planoId: current.planoId,
        status: {
          in: ["ATIVA", "TRIAL"],
        },
        tenant: {
          status: "ACTIVE",
        },
      },
      select: {
        tenantId: true,
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    for (const assinatura of assinaturasAtivas) {
      const referenciaDia = today;
      let createdCommunication = false;

      try {
        await prisma.planoReajusteComunicacao.create({
          data: {
            reajusteId: current.id,
            tenantId: assinatura.tenantId,
            fase,
            referenciaDia,
          },
        });
        createdCommunication = true;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          createdCommunication = false;
        } else {
          throw error;
        }
      }

      if (!createdCommunication) {
        continue;
      }

      const notificacaoResult = await notifyTenantAdminsAboutPlanoReajuste({
        tenantId: assinatura.tenantId,
        tenantName: assinatura.tenant.name,
        planoNome: current.plano.nome,
        reajusteId: current.id,
        fase,
        vigenciaEm: current.vigenciaEm,
        valorMensalNovo: current.valorMensalNovo
          ? Number(current.valorMensalNovo)
          : null,
        valorAnualNovo: current.valorAnualNovo
          ? Number(current.valorAnualNovo)
          : null,
        moeda: current.moeda,
        aplicarAssinaturasAtivas: current.aplicarAssinaturasAtivas,
      });

      await prisma.planoReajusteComunicacao.update({
        where: {
          reajusteId_tenantId_fase_referenciaDia: {
            reajusteId: current.id,
            tenantId: assinatura.tenantId,
            fase,
            referenciaDia,
          },
        },
        data: {
          emailEnviado: notificacaoResult.emailEnviado,
          inAppCriado: notificacaoResult.inAppCriado,
          canais: {
            inApp: notificacaoResult.inAppCriado,
            email: notificacaoResult.emailEnviado,
          },
        },
      });
    }
  }
}

// ==================== CRUD PLANOS ====================

export async function getPlanos(): Promise<GetPlanosResponse> {
  try {
    await ensureSuperAdmin();
    await processPlanoPriceRollouts();

    const planos = await prisma.plano.findMany({
      orderBy: [{ valorMensal: "asc" }, { nome: "asc" }],
    });

    return {
      success: true,
      data: planos.map((plano) => ({
        ...plano,
        valorMensal: plano.valorMensal ? Number(plano.valorMensal) : undefined,
        valorAnual: plano.valorAnual ? Number(plano.valorAnual) : undefined,
      })),
    };
  } catch (error) {
    logger.error("Erro ao buscar planos:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

export async function getPlanoById(id: string): Promise<GetPlanoResponse> {
  try {
    await ensureSuperAdmin();

    const plano = await prisma.plano.findUnique({
      where: { id },
      include: {
        subscriptions: {
          include: {
            tenant: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    });

    if (!plano) {
      return {
        success: false,
        error: "Plano não encontrado",
      };
    }

    return {
      success: true,
      data: {
        ...plano,
        valorMensal: plano.valorMensal ? Number(plano.valorMensal) : undefined,
        valorAnual: plano.valorAnual ? Number(plano.valorAnual) : undefined,
      },
    };
  } catch (error) {
    logger.error("Erro ao buscar plano:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

export async function updatePlano(
  id: string,
  data: Partial<Plano>,
): Promise<GetPlanoResponse> {
  try {
    await ensureSuperAdmin();

    // Verificar se o plano existe
    const planoExistente = await prisma.plano.findUnique({
      where: { id },
    });

    if (!planoExistente) {
      return {
        success: false,
        error: "Plano não encontrado",
      };
    }

    const plano = await prisma.plano.update({
      where: { id },
      data: {
        nome: data.nome,
        slug: data.slug,
        descricao: data.descricao,
        valorMensal: data.valorMensal,
        valorAnual: data.valorAnual,
        limiteUsuarios: data.limiteUsuarios,
        limiteProcessos: data.limiteProcessos,
        limiteStorageMb: data.limiteStorageMb,
        recursos: data.recursos,
        ativo: data.ativo,
        updatedAt: new Date(),
      },
    });

    return {
      success: true,
      data: {
        ...plano,
        valorMensal: plano.valorMensal ? Number(plano.valorMensal) : undefined,
        valorAnual: plano.valorAnual ? Number(plano.valorAnual) : undefined,
      },
    };
  } catch (error) {
    logger.error("Erro ao atualizar plano:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

// ==================== CONFIGURAÇÃO DE MÓDULOS ====================

export async function getModuloCatalogo(): Promise<GetModuloCatalogoResponse> {
  try {
    await ensureSuperAdmin();

    const modulos = await prisma.modulo.findMany({
      include: {
        categoria: {
          select: {
            id: true,
            nome: true,
            slug: true,
            cor: true,
            icone: true,
          },
        },
      },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    });

    return {
      success: true,
      data: modulos.map((modulo) => ({
        ...modulo,
        categoria: modulo.categoria?.nome ?? undefined,
        categoriaInfo: modulo.categoria,
      })),
    };
  } catch (error) {
    logger.error("Erro ao carregar catálogo de módulos:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

export async function getPlanoConfiguracao(
  planoId: string,
): Promise<GetPlanoConfiguracaoResponse> {
  try {
    await ensureSuperAdmin();
    await processPlanoPriceRollouts();

    const [plano, catalogo, configuracaoAtual, versoes] = await Promise.all([
      prisma.plano.findUnique({ where: { id: planoId } }),
      prisma.modulo.findMany({
        where: { ativo: true },
        orderBy: [{ ordem: "asc" }, { nome: "asc" }],
        select: {
          id: true,
          slug: true,
          nome: true,
          categoria: true,
          descricao: true,
          icone: true,
          ordem: true,
        },
      }),
      prisma.planoModulo.findMany({
        where: { planoId },
        select: {
          moduloId: true,
          habilitado: true,
          ordem: true,
        },
      }),
      prisma.planoVersao.findMany({
        where: { planoId },
        orderBy: { numero: "desc" },
        take: 20,
      }),
    ]);

    if (!plano) {
      return {
        success: false,
        error: "Plano não encontrado",
      };
    }

    const configuracaoAtualMap = new Map(
      configuracaoAtual.map((modulo) => [
        modulo.moduloId,
        {
          habilitado: modulo.habilitado,
          ordem: modulo.ordem,
        },
      ]),
    );

    const catalogModules = catalogo as CatalogModule[];

    const modulos: PlanoModuloConfig[] = catalogModules.map((modulo) => ({
      moduloId: modulo.id,
      slug: modulo.slug,
      nome: modulo.nome,
      categoria: modulo.categoriaInfo?.nome ?? undefined,
      categoriaInfo: modulo.categoriaInfo,
      descricao: modulo.descricao ?? undefined,
      icone: modulo.icone ?? undefined,
      ordem: modulo.ordem ?? undefined,
      ordemNoPlano: configuracaoAtualMap.get(modulo.id)?.ordem ?? undefined,
      habilitado: configuracaoAtualMap.get(modulo.id)?.habilitado ?? false,
    }));

    const versoesResumo: PlanoVersaoResumo[] = versoes.map((versao) =>
      toPlanoVersaoResumo(versao),
    );

    return {
      success: true,
      data: {
        plano: {
          ...plano,
          valorMensal: plano.valorMensal
            ? Number(plano.valorMensal)
            : undefined,
          valorAnual: plano.valorAnual ? Number(plano.valorAnual) : undefined,
        },
        modulos,
        versoes: versoesResumo,
        ultimaVersao: versoesResumo[0],
      },
    };
  } catch (error) {
    logger.error("Erro ao carregar configuração do plano:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

export async function getPlanoReajustes(
  planoId: string,
): Promise<GetPlanoReajustesResponse> {
  try {
    await ensureSuperAdmin();
    await processPlanoPriceRollouts();

    if (!planoId?.trim()) {
      return {
        success: false,
        error: "Plano inválido para buscar reajustes.",
      };
    }

    const reajustes = await prisma.planoReajuste.findMany({
      where: { planoId },
      orderBy: [{ vigenciaEm: "desc" }, { createdAt: "desc" }],
      take: 50,
    });

    return {
      success: true,
      data: reajustes.map(toPlanoReajusteResumo),
    };
  } catch (error) {
    logger.error("Erro ao listar reajustes de plano:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

export async function agendarPlanoReajuste(
  planoId: string,
  input: AgendarPlanoReajusteInput,
): Promise<AgendarPlanoReajusteResponse> {
  try {
    const { superAdminId, email } = await ensureSuperAdminContext();
    await processPlanoPriceRollouts();

    if (!planoId?.trim()) {
      return {
        success: false,
        error: "Plano inválido para agendar reajuste.",
      };
    }

    const vigenciaEm = parseDateAtStartOfDay(input.vigenciaEm);

    if (!vigenciaEm) {
      return {
        success: false,
        error: "Informe uma data de vigência válida.",
      };
    }

    const dataMinimaVigencia = addDays(getStartOfDay(new Date()), 1);

    if (vigenciaEm < dataMinimaVigencia) {
      return {
        success: false,
        error: "A vigência deve ser a partir de amanhã.",
      };
    }

    const avisoDiasAntes = Math.max(
      0,
      Math.min(30, Math.trunc(input.avisoDiasAntes ?? 7)),
    );
    const avisoDiasDepois = Math.max(
      0,
      Math.min(30, Math.trunc(input.avisoDiasDepois ?? 3)),
    );
    const aplicarAssinaturasAtivas = Boolean(input.aplicarAssinaturasAtivas);
    const observacoes = input.observacoes?.trim()
      ? input.observacoes.trim().slice(0, 2000)
      : null;

    const plano = await prisma.plano.findUnique({
      where: { id: planoId },
      select: {
        id: true,
        nome: true,
        valorMensal: true,
        valorAnual: true,
        moeda: true,
      },
    });

    if (!plano) {
      return {
        success: false,
        error: "Plano não encontrado.",
      };
    }

    const hasMensalInPayload = Object.prototype.hasOwnProperty.call(
      input,
      "valorMensalNovo",
    );
    const hasAnualInPayload = Object.prototype.hasOwnProperty.call(
      input,
      "valorAnualNovo",
    );

    if (
      hasMensalInPayload &&
      input.valorMensalNovo != null &&
      input.valorMensalNovo < 0
    ) {
      return {
        success: false,
        error: "Valor mensal não pode ser negativo.",
      };
    }

    if (
      hasAnualInPayload &&
      input.valorAnualNovo != null &&
      input.valorAnualNovo < 0
    ) {
      return {
        success: false,
        error: "Valor anual não pode ser negativo.",
      };
    }

    const valorMensalNovo = normalizeMoneyInput(
      hasMensalInPayload ? input.valorMensalNovo : undefined,
      plano.valorMensal,
    );
    const valorAnualNovo = normalizeMoneyInput(
      hasAnualInPayload ? input.valorAnualNovo : undefined,
      plano.valorAnual,
    );

    const mensalAlterado =
      (plano.valorMensal?.toString() ?? null) !==
      (valorMensalNovo?.toString() ?? null);
    const anualAlterado =
      (plano.valorAnual?.toString() ?? null) !==
      (valorAnualNovo?.toString() ?? null);

    if (!mensalAlterado && !anualAlterado) {
      return {
        success: false,
        error:
          "Informe ao menos um novo valor diferente do preço atual do plano.",
      };
    }

    const reajusteProgramado = await prisma.planoReajuste.findFirst({
      where: {
        planoId,
        status: PLANO_REAJUSTE_STATUS.SCHEDULED,
        vigenciaEm: { gte: getStartOfDay(new Date()) },
      },
      orderBy: { vigenciaEm: "asc" },
      select: {
        id: true,
        vigenciaEm: true,
      },
    });

    if (reajusteProgramado) {
      return {
        success: false,
        error: `Já existe reajuste programado para ${reajusteProgramado.vigenciaEm.toLocaleDateString(
          "pt-BR",
        )}. Cancele o atual antes de criar um novo.`,
      };
    }

    const assinaturasAtivas = await prisma.tenantSubscription.findMany({
      where: {
        planoId,
        status: { in: ["ATIVA", "TRIAL"] },
        tenant: { status: "ACTIVE" },
      },
      select: {
        tenantId: true,
      },
    });

    const tenantIdsAtivos = Array.from(
      new Set(assinaturasAtivas.map((item) => item.tenantId)),
    );

    const adminsNotificaveis =
      tenantIdsAtivos.length > 0
        ? await prisma.usuario.count({
            where: {
              tenantId: { in: tenantIdsAtivos },
              role: "ADMIN",
              active: true,
            },
          })
        : 0;

    const reajuste = await prisma.planoReajuste.create({
      data: {
        planoId: plano.id,
        valorMensalAnterior: plano.valorMensal,
        valorMensalNovo,
        valorAnualAnterior: plano.valorAnual,
        valorAnualNovo,
        moeda: plano.moeda,
        vigenciaEm,
        avisoDiasAntes,
        avisoDiasDepois,
        aplicarAssinaturasAtivas,
        observacoes,
        criadoPorEmail: email,
      },
    });

    await prisma.superAdminAuditLog.create({
      data: {
        superAdminId,
        acao: "SCHEDULE_PLANO_REAJUSTE",
        entidade: "PLANO",
        entidadeId: plano.id,
        dadosAntigos: {
          valorMensal: plano.valorMensal,
          valorAnual: plano.valorAnual,
          moeda: plano.moeda,
        },
        dadosNovos: {
          reajusteId: reajuste.id,
          vigenciaEm,
          valorMensalNovo,
          valorAnualNovo,
          avisoDiasAntes,
          avisoDiasDepois,
          aplicarAssinaturasAtivas,
          observacoes,
        },
      },
    });

    return {
      success: true,
      data: {
        reajuste: toPlanoReajusteResumo(reajuste),
        impacto: {
          assinaturasAtivas: assinaturasAtivas.length,
          tenantsAtivosComAssinatura: tenantIdsAtivos.length,
          adminsNotificaveis,
        },
      },
    };
  } catch (error) {
    logger.error("Erro ao agendar reajuste de plano:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

export async function cancelarPlanoReajuste(
  reajusteId: string,
  motivoCancelamento?: string,
): Promise<CancelarPlanoReajusteResponse> {
  try {
    const { superAdminId } = await ensureSuperAdminContext();

    if (!reajusteId?.trim()) {
      return {
        success: false,
        error: "Reajuste inválido para cancelamento.",
      };
    }

    const reajuste = await prisma.planoReajuste.findUnique({
      where: { id: reajusteId },
      include: {
        plano: {
          select: {
            id: true,
            nome: true,
          },
        },
      },
    });

    if (!reajuste) {
      return {
        success: false,
        error: "Reajuste não encontrado.",
      };
    }

    if (reajuste.status !== PLANO_REAJUSTE_STATUS.SCHEDULED) {
      return {
        success: false,
        error:
          "Só é possível cancelar reajustes com status Programado (ainda não aplicados).",
      };
    }

    const motivo = motivoCancelamento?.trim()
      ? motivoCancelamento.trim().slice(0, 1000)
      : "Cancelado manualmente no painel administrativo";

    const reajusteCancelado = await prisma.planoReajuste.update({
      where: { id: reajuste.id },
      data: {
        status: PLANO_REAJUSTE_STATUS.CANCELED,
        canceladoEm: new Date(),
        motivoCancelamento: motivo,
        updatedAt: new Date(),
      },
    });

    await prisma.superAdminAuditLog.create({
      data: {
        superAdminId,
        acao: "CANCEL_PLANO_REAJUSTE",
        entidade: "PLANO_REAJUSTE",
        entidadeId: reajuste.id,
        dadosAntigos: {
          status: reajuste.status,
          vigenciaEm: reajuste.vigenciaEm,
          valorMensalNovo: reajuste.valorMensalNovo,
          valorAnualNovo: reajuste.valorAnualNovo,
          planoId: reajuste.planoId,
          planoNome: reajuste.plano.nome,
        },
        dadosNovos: {
          status: PLANO_REAJUSTE_STATUS.CANCELED,
          canceladoEm: reajusteCancelado.canceladoEm,
          motivoCancelamento: motivo,
        },
      },
    });

    return {
      success: true,
      data: toPlanoReajusteResumo(reajusteCancelado),
    };
  } catch (error) {
    logger.error("Erro ao cancelar reajuste de plano:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

export async function getPlanosMatrix(): Promise<GetPlanoMatrixResponse> {
  try {
    await ensureSuperAdmin();

    const [planos, modulos, relacoes] = await Promise.all([
      prisma.plano.findMany({
        select: { id: true, nome: true, slug: true },
        orderBy: [{ nome: "asc" }],
      }),
      prisma.modulo.findMany({
        where: { ativo: true },
        include: {
          categoria: {
            select: {
              id: true,
              nome: true,
              slug: true,
              cor: true,
              icone: true,
            },
          },
        },
        orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      }),
      prisma.planoModulo.findMany({
        select: {
          planoId: true,
          moduloId: true,
          habilitado: true,
        },
      }),
    ]);

    const statusPorModulo = new Map<string, Map<string, boolean>>();

    relacoes.forEach((relacao) => {
      if (!statusPorModulo.has(relacao.moduloId)) {
        statusPorModulo.set(relacao.moduloId, new Map());
      }

      statusPorModulo
        .get(relacao.moduloId)!
        .set(relacao.planoId, relacao.habilitado);
    });

    const matriz: PlanoMatrixModuleRow[] = modulos.map((modulo) => ({
      moduloId: modulo.id,
      slug: modulo.slug,
      nome: modulo.nome,
      descricao: modulo.descricao,
      categoria: modulo.categoria?.nome ?? undefined,
      categoriaInfo: modulo.categoria,
      planos: planos.map((plano) => ({
        planoId: plano.id,
        habilitado: statusPorModulo.get(modulo.id)?.get(plano.id) ?? false,
      })),
    }));

    return {
      success: true,
      data: {
        planos,
        modulos: matriz,
      },
    };
  } catch (error) {
    logger.error("Erro ao carregar matriz de planos:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

export async function setPlanoModulos(
  planoId: string,
  updates: PlanoModuloUpdateInput[],
): Promise<DefaultActionResponse> {
  if (!updates?.length) {
    return { success: true };
  }

  try {
    await ensureSuperAdmin();

    await prisma.$transaction(async (tx) => {
      const plano = await tx.plano.findUnique({ where: { id: planoId } });

      if (!plano) {
        throw new Error("Plano não encontrado");
      }

      const moduloIds = Array.from(
        new Set(updates.map((item) => item.moduloId)),
      );

      const modulosExistentes = await tx.modulo.findMany({
        where: { id: { in: moduloIds } },
        select: { id: true },
      });

      const relacoesAtuais = await tx.planoModulo.findMany({
        where: { planoId },
        select: {
          moduloId: true,
          habilitado: true,
          ordem: true,
        },
      });

      const modulosValidos = new Set(modulosExistentes.map((item) => item.id));
      const relacoesAtuaisMap = new Map(
        relacoesAtuais.map((item) => [item.moduloId, item]),
      );
      let proximaOrdem =
        relacoesAtuais
          .filter((item) => item.habilitado)
          .reduce((max, item) => Math.max(max, item.ordem), -1) + 1;

      for (const update of updates) {
        if (!modulosValidos.has(update.moduloId)) {
          throw new Error(`Módulo inválido: ${update.moduloId}`);
        }

        const relacaoAtual = relacoesAtuaisMap.get(update.moduloId);
        const ordemAtualizada = update.habilitado
          ? update.ordem != null
            ? Math.max(0, Math.trunc(update.ordem))
            : relacaoAtual?.habilitado
              ? relacaoAtual.ordem
              : proximaOrdem++
          : (relacaoAtual?.ordem ?? 0);

        await tx.planoModulo.upsert({
          where: {
            planoId_moduloId: {
              planoId,
              moduloId: update.moduloId,
            },
          },
          update: {
            habilitado: update.habilitado,
            ordem: ordemAtualizada,
            updatedAt: new Date(),
          },
          create: {
            planoId,
            moduloId: update.moduloId,
            habilitado: update.habilitado,
            ordem: ordemAtualizada,
          },
        });
      }

      await tx.plano.update({
        where: { id: planoId },
        data: {
          updatedAt: new Date(),
        },
      });
    });

    return { success: true };
  } catch (error) {
    logger.error("Erro ao atualizar módulos do plano:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

export async function syncPlanoModulos(
  planoId: string,
  activeModuloIds: string[],
): Promise<DefaultActionResponse> {
  try {
    await ensureSuperAdmin();

    const orderedModuloIds = Array.from(new Set(activeModuloIds));
    const activeSet = new Set(orderedModuloIds);

    await prisma.$transaction(async (tx) => {
      const plano = await tx.plano.findUnique({
        where: { id: planoId },
      });

      if (!plano) {
        throw new Error("Plano não encontrado");
      }

      const modulosAtuais = await tx.planoModulo.findMany({
        where: { planoId },
        select: {
          moduloId: true,
          habilitado: true,
          ordem: true,
        },
      });

      for (const [ordem, moduloId] of orderedModuloIds.entries()) {
        await tx.planoModulo.upsert({
          where: {
            planoId_moduloId: {
              planoId,
              moduloId,
            },
          },
          update: {
            habilitado: true,
            ordem,
            updatedAt: new Date(),
          },
          create: {
            planoId,
            moduloId,
            habilitado: true,
            ordem,
          },
        });
      }

      const modulosParaDesabilitar = modulosAtuais
        .filter(
          (modulo) => modulo.habilitado && !activeSet.has(modulo.moduloId),
        )
        .map((modulo) => modulo.moduloId);

      if (modulosParaDesabilitar.length > 0) {
        await tx.planoModulo.updateMany({
          where: {
            planoId,
            moduloId: { in: modulosParaDesabilitar },
          },
          data: { habilitado: false, updatedAt: new Date() },
        });
      }

      await tx.plano.update({
        where: { id: planoId },
        data: { updatedAt: new Date() },
      });
    });

    return { success: true };
  } catch (error) {
    logger.error("Erro ao sincronizar módulos do plano:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

export async function createPlanoVersaoDraft(
  planoId: string,
  payload?: { titulo?: string; descricao?: string },
): Promise<{ success: boolean; data?: PlanoVersaoResumo; error?: string }> {
  try {
    await ensureSuperAdmin();

    const versao = await prisma.$transaction(async (tx) => {
      const plano = await tx.plano.findUnique({
        where: { id: planoId },
        select: { id: true, nome: true },
      });

      if (!plano) {
        throw new Error("Plano não encontrado");
      }

      const novaVersao = await createPlanoVersaoSnapshotTx(tx, {
        plano,
        status: PLANO_VERSAO_STATUS.DRAFT,
        usuarioId: null,
        titulo: payload?.titulo,
        descricao: payload?.descricao,
        requireActiveModules: false,
      });

      await tx.plano.update({
        where: { id: planoId },
        data: { updatedAt: new Date() },
      });

      return novaVersao;
    });

    return { success: true, data: toPlanoVersaoResumo(versao) };
  } catch (error) {
    logger.error("Erro ao criar rascunho de versão:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

export async function createPlanoVersaoReview(
  planoId: string,
  payload?: { titulo?: string; descricao?: string },
): Promise<{ success: boolean; data?: PlanoVersaoResumo; error?: string }> {
  try {
    await ensureSuperAdmin();

    const versao = await prisma.$transaction(async (tx) => {
      const plano = await tx.plano.findUnique({
        where: { id: planoId },
        select: { id: true, nome: true },
      });

      if (!plano) {
        throw new Error("Plano não encontrado");
      }

      const novaVersao = await createPlanoVersaoSnapshotTx(tx, {
        plano,
        status: PLANO_VERSAO_STATUS.REVIEW,
        usuarioId: null,
        titulo: payload?.titulo,
        descricao: payload?.descricao,
        requireActiveModules: true,
      });

      await tx.plano.update({
        where: { id: planoId },
        data: { updatedAt: new Date() },
      });

      return novaVersao;
    });

    return { success: true, data: toPlanoVersaoResumo(versao) };
  } catch (error) {
    logger.error("Erro ao enviar versão para revisão:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

export async function publishPlanoVersao(
  planoId: string,
  payload?: { titulo?: string; descricao?: string; versaoId?: string },
): Promise<{ success: boolean; data?: PlanoVersaoResumo; error?: string }> {
  try {
    const usuarioId = await ensureSuperAdmin();

    const versao = await prisma.$transaction(async (tx) => {
      const plano = await tx.plano.findUnique({
        where: { id: planoId },
        select: { id: true, nome: true },
      });

      if (!plano) {
        throw new Error("Plano não encontrado");
      }

      let versaoAlvo;

      if (payload?.versaoId) {
        versaoAlvo = await tx.planoVersao.findUnique({
          where: { id: payload.versaoId },
          include: {
            modulos: true,
          },
        });

        if (!versaoAlvo || versaoAlvo.planoId !== plano.id) {
          throw new Error("Versão informada não pertence a este plano");
        }

        if (versaoAlvo.status === PLANO_VERSAO_STATUS.PUBLISHED) {
          throw new Error("Esta versão já foi publicada");
        }

        if (versaoAlvo.modulos.length === 0) {
          throw new Error("Esta versão não possui módulos associados");
        }

        await tx.planoVersao.updateMany({
          where: { planoId, status: PLANO_VERSAO_STATUS.PUBLISHED },
          data: { status: PLANO_VERSAO_STATUS.ARCHIVED },
        });

        versaoAlvo = await tx.planoVersao.update({
          where: { id: versaoAlvo.id },
          data: {
            status: PLANO_VERSAO_STATUS.PUBLISHED,
            titulo:
              payload?.titulo ??
              versaoAlvo.titulo ??
              `${plano.nome} · Versão ${versaoAlvo.numero}`,
            descricao: payload?.descricao ?? versaoAlvo.descricao,
            publicadoPorId: null,
            publicadoEm: new Date(),
          },
        });
      } else {
        versaoAlvo = await createPlanoVersaoSnapshotTx(tx, {
          plano,
          status: PLANO_VERSAO_STATUS.PUBLISHED,
          usuarioId: null,
          titulo: payload?.titulo,
          descricao: payload?.descricao,
          requireActiveModules: true,
        });
      }

      await tx.tenantSubscription.updateMany({
        where: { planoId },
        data: {
          planoVersaoId: versaoAlvo.id,
          updatedAt: new Date(),
        },
      });

      await tx.plano.update({
        where: { id: planoId },
        data: { updatedAt: new Date() },
      });

      return versaoAlvo;
    });

    return { success: true, data: toPlanoVersaoResumo(versao) };
  } catch (error) {
    logger.error("Erro ao publicar versão do plano:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

type CreatePlanoInput = {
  nome: string;
  slug: string;
  descricao?: string | null;
  valorMensal?: number;
  valorAnual?: number;
  moeda?: string;
  limiteUsuarios?: number | null;
  limiteProcessos?: number | null;
  limiteStorageMb?: number | null;
  periodoTeste?: number;
  recursos?: any;
  ativo?: boolean;
  moduloIds?: string[];
  moduloSlugs?: string[];
};

export async function createPlano(
  input: CreatePlanoInput,
): Promise<GetPlanoResponse> {
  try {
    const usuarioId = await ensureSuperAdmin();

    const plano = await prisma.$transaction(async (tx) => {
      const slugEmUso = await tx.plano.findUnique({
        where: { slug: input.slug },
        select: { id: true },
      });

      if (slugEmUso) {
        throw new Error("Já existe um plano com este slug");
      }

      const planoCriado = await tx.plano.create({
        data: {
          nome: input.nome,
          slug: input.slug,
          descricao: input.descricao,
          valorMensal: input.valorMensal,
          valorAnual: input.valorAnual,
          moeda: input.moeda ?? "BRL",
          limiteUsuarios: input.limiteUsuarios,
          limiteProcessos: input.limiteProcessos,
          limiteStorageMb: input.limiteStorageMb,
          periodoTeste: input.periodoTeste ?? 14,
          recursos: input.recursos,
          ativo: input.ativo ?? true,
        },
      });

      const modulosDisponiveis = await tx.modulo.findMany({
        where: {
          OR: [
            {
              id: {
                in: input.moduloIds ?? [],
              },
            },
            {
              slug: {
                in: input.moduloSlugs ?? [],
              },
            },
          ],
        },
        orderBy: [{ ordem: "asc" }, { nome: "asc" }],
        select: {
          id: true,
        },
      });

      if (modulosDisponiveis.length > 0) {
        await tx.planoModulo.createMany({
          data: modulosDisponiveis.map((modulo, ordem) => ({
            planoId: planoCriado.id,
            moduloId: modulo.id,
            habilitado: true,
            ordem,
          })),
          skipDuplicates: true,
        });

        await tx.planoVersao.create({
          data: {
            planoId: planoCriado.id,
            numero: 1,
            status: "PUBLISHED",
            titulo: `${planoCriado.nome} · Versão 1`,
            descricao: "Versão inicial publicada automaticamente",
            criadoPorId: usuarioId,
            publicadoPorId: usuarioId,
            publicadoEm: new Date(),
            modulos: {
              createMany: {
                data: modulosDisponiveis.map((modulo, ordem) => ({
                  moduloId: modulo.id,
                  habilitado: true,
                  ordem,
                })),
              },
            },
          },
        });
      }

      return planoCriado;
    });

    return {
      success: true,
      data: {
        ...plano,
        valorMensal: plano.valorMensal ? Number(plano.valorMensal) : undefined,
        valorAnual: plano.valorAnual ? Number(plano.valorAnual) : undefined,
      },
    };
  } catch (error) {
    logger.error("Erro ao criar plano:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

export async function duplicatePlano(
  planoId: string,
  overrides?: Partial<Omit<CreatePlanoInput, "moduloIds" | "moduloSlugs">>,
): Promise<GetPlanoResponse> {
  try {
    await ensureSuperAdmin();

    const planoOriginal = await prisma.plano.findUnique({
      where: { id: planoId },
      include: {
        modulos: true,
      },
    });

    if (!planoOriginal) {
      return {
        success: false,
        error: "Plano de origem não encontrado",
      };
    }

    const slugBase = overrides?.slug ?? `${planoOriginal.slug}-copy`;
    const slugNormalizadoBase = slugBase.replace(/\s+/g, "-").toLowerCase();

    let slugNormalizado = slugNormalizadoBase;
    let contador = 1;

    while (
      await prisma.plano.findUnique({
        where: { slug: slugNormalizado },
        select: { id: true },
      })
    ) {
      slugNormalizado = `${slugNormalizadoBase}-${contador}`;
      contador += 1;
    }

    return await createPlano({
      nome: overrides?.nome ?? `${planoOriginal.nome} (cópia)`,
      slug: slugNormalizado,
      descricao: overrides?.descricao ?? planoOriginal.descricao ?? undefined,
      valorMensal:
        overrides?.valorMensal ??
        (planoOriginal.valorMensal
          ? Number(planoOriginal.valorMensal)
          : undefined),
      valorAnual:
        overrides?.valorAnual ??
        (planoOriginal.valorAnual
          ? Number(planoOriginal.valorAnual)
          : undefined),
      moeda: overrides?.moeda ?? planoOriginal.moeda ?? "BRL",
      limiteUsuarios:
        overrides?.limiteUsuarios ?? planoOriginal.limiteUsuarios ?? undefined,
      limiteProcessos:
        overrides?.limiteProcessos ??
        planoOriginal.limiteProcessos ??
        undefined,
      limiteStorageMb:
        overrides?.limiteStorageMb ??
        planoOriginal.limiteStorageMb ??
        undefined,
      periodoTeste: overrides?.periodoTeste ?? planoOriginal.periodoTeste ?? 14,
      recursos: overrides?.recursos ?? planoOriginal.recursos ?? undefined,
      ativo: overrides?.ativo ?? false,
      moduloIds: planoOriginal.modulos
        .filter((modulo) => modulo.habilitado)
        .map((modulo) => modulo.moduloId),
    });
  } catch (error) {
    logger.error("Erro ao duplicar plano:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

// ==================== FUNÇÕES DE ANÁLISE ====================

export async function getEstatisticasPlanos(): Promise<GetEstatisticasPlanosResponse> {
  try {
    await ensureSuperAdmin();
    await processPlanoPriceRollouts();

    const [
      totalPlanos,
      planosAtivos,
      totalAssinaturas,
      assinaturasAtivas,
      faturamentoMensal,
    ] = await Promise.all([
      prisma.plano.count(),
      prisma.plano.count({ where: { ativo: true } }),
      prisma.tenantSubscription.count(),
      prisma.tenantSubscription.count({
        where: {
          status: "ATIVA",
          planoId: { not: null },
        },
      }),
      prisma.fatura.aggregate({
        where: {
          status: "PAGA",
          pagoEm: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
        _sum: {
          valor: true,
        },
      }),
    ]);

    return {
      success: true,
      data: {
        totalPlanos,
        planosAtivos,
        totalAssinaturas,
        assinaturasAtivas,
        faturamentoMensal: Number(faturamentoMensal._sum?.valor ?? 0),
      },
    };
  } catch (error) {
    logger.error("Erro ao buscar estatísticas de planos:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

// ==================== FUNÇÕES DE ASSINATURAS ====================

export async function getAssinaturas() {
  try {
    await ensureSuperAdmin();
    await processPlanoPriceRollouts();

    const assinaturas = await prisma.tenantSubscription.findMany({
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        plano: {
          select: {
            id: true,
            nome: true,
            valorMensal: true,
            valorAnual: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return {
      success: true,
      data: assinaturas.map((assinatura) => ({
        ...assinatura,
        plano: assinatura.plano
          ? {
              ...assinatura.plano,
              valorMensal: assinatura.plano.valorMensal
                ? Number(assinatura.plano.valorMensal)
                : undefined,
              valorAnual: assinatura.plano.valorAnual
                ? Number(assinatura.plano.valorAnual)
                : undefined,
            }
          : null,
      })),
    };
  } catch (error) {
    logger.error("Erro ao buscar assinaturas:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}
