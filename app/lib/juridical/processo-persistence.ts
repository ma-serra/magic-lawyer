import prisma from "@/app/lib/prisma";
import { syncCapturedProcessDocuments } from "@/app/lib/juridical/process-document-sync";
import { ensureJusbrasilProcessMonitorBestEffort } from "@/app/lib/juridical/jusbrasil-process-monitoring";
import {
  ensureProcessoClientePartes,
  syncProcessoClientes,
  syncProcessoResponsaveis,
  uniqueOrderedProcessoRelationIds,
} from "@/app/lib/processos/processo-vinculos";
import {
  inferImportedProcessoStatus,
  mergeImportedProcessoStatus,
} from "@/app/lib/juridical/processo-status-mapping";
import { NotificationHelper } from "@/app/lib/notifications/notification-helper";
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

type AdvogadoResponsavelContext = {
  nome: string;
  oabNumero?: string | null;
  oabUf?: string | null;
};

function matchesAdvogadoResponsavelNome(
  value: string | null | undefined,
  advogadoResponsavel?: AdvogadoResponsavelContext | null,
) {
  if (!value || !advogadoResponsavel?.nome) {
    return false;
  }

  return normalizeCacheKey(value) === normalizeCacheKey(advogadoResponsavel.nome);
}

function matchesAdvogadoResponsavelIdentidade(
  advogado: AdvogadoParte | undefined,
  advogadoResponsavel?: AdvogadoResponsavelContext | null,
) {
  if (!advogado || !advogadoResponsavel) {
    return false;
  }

  if (
    advogadoResponsavel.oabNumero &&
    advogadoResponsavel.oabUf &&
    advogado.oabNumero &&
    advogado.oabUf
  ) {
    return (
      advogado.oabNumero.trim() === advogadoResponsavel.oabNumero.trim() &&
      advogado.oabUf.trim().toUpperCase() ===
        advogadoResponsavel.oabUf.trim().toUpperCase()
    );
  }

  return matchesAdvogadoResponsavelNome(advogado.nome, advogadoResponsavel);
}

function resolveClienteNome(
  processo: ProcessoJuridico,
  options?: {
    clienteNome?: string;
    advogadoResponsavel?: AdvogadoResponsavelContext | null;
  },
) {
  if (options?.clienteNome) return options.clienteNome.trim();
  const autores =
    processo.partes?.filter(
      (parte) => parte.tipo === "AUTOR" && Boolean(parte.nome?.trim()),
    ) || [];

  const parteRepresentadaPelaAdvogada = processo.partes?.find(
    (parte) =>
      Boolean(parte.nome?.trim()) &&
      !matchesAdvogadoResponsavelNome(parte.nome, options?.advogadoResponsavel) &&
      (parte.advogados || []).some((advogado) =>
        matchesAdvogadoResponsavelIdentidade(
          advogado,
          options?.advogadoResponsavel,
        ),
      ),
  );

  if (parteRepresentadaPelaAdvogada?.nome) {
    return parteRepresentadaPelaAdvogada.nome.trim();
  }

  if (autores.length > 0) {
    const autorRepresentadoPelaAdvogada = autores.find(
      (parte) =>
        !matchesAdvogadoResponsavelNome(parte.nome, options?.advogadoResponsavel) &&
        (parte.advogados || []).some((advogado) =>
          matchesAdvogadoResponsavelIdentidade(
            advogado,
            options?.advogadoResponsavel,
          ),
        ),
    );

    if (autorRepresentadoPelaAdvogada?.nome) {
      return autorRepresentadoPelaAdvogada.nome.trim();
    }

    const autorDistintoDaAdvogada = autores.find(
      (parte) =>
        !matchesAdvogadoResponsavelNome(parte.nome, options?.advogadoResponsavel),
    );

    if (autorDistintoDaAdvogada?.nome) {
      return autorDistintoDaAdvogada.nome.trim();
    }

    if (autores[0]?.nome) {
      return autores[0].nome.trim();
    }
  }

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
            isExterno: true,
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
      isExterno: true,
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
    const canOverwriteProfileData = existente.isExterno;
    const shouldUpdatePhone =
      canOverwriteProfileData &&
      Boolean(telefone) &&
      !normalizeOptionalString(existente.telefone) &&
      !normalizeOptionalString(existente.usuario.phone);
    const shouldUpdateWhatsapp =
      canOverwriteProfileData &&
      Boolean(telefone) &&
      !normalizeOptionalString(existente.whatsapp);
    const shouldUpdateEmail =
      canOverwriteProfileData &&
      Boolean(email) &&
      isSyntheticExternalLawyerEmail(existente.usuario.email) &&
      (await isTenantEmailAvailable(tx, {
        tenantId: params.tenantId,
        email: email!,
        exceptUserId: existente.usuario.id,
      }));
    const shouldUpdateDisplayName =
      canOverwriteProfileData &&
      normalizeCacheKey(
        `${existente.usuario.firstName || ""} ${existente.usuario.lastName || ""}`.trim(),
      ) !== normalizeCacheKey(nome);

    if (
      (!existente.oabNumero && oabNumero) ||
      (!existente.oabUf && oabUf) ||
      shouldUpdatePhone ||
      shouldUpdateWhatsapp ||
      shouldUpdateEmail ||
      shouldUpdateDisplayName
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
          ...(canOverwriteProfileData
            ? {
                usuario: {
                  update: {
                    ...(shouldUpdateDisplayName &&
                    existente.usuario.firstName !== firstName
                      ? { firstName }
                      : {}),
                    ...(shouldUpdateDisplayName &&
                    (existente.usuario.lastName || null) !== (lastName || null)
                      ? { lastName }
                      : {}),
                    ...(shouldUpdatePhone ? { phone: telefone } : {}),
                    ...(shouldUpdateEmail ? { email: email! } : {}),
                  },
                },
              }
            : {}),
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
  advogadoResponsavel?: AdvogadoResponsavelContext | null,
) {
  const nome = resolveClienteNome(processo, {
    clienteNome,
    advogadoResponsavel,
  });
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

function collectImportedClientCandidateNames(
  processo: ProcessoJuridico,
  options?: {
    clientePrincipalNome?: string | null;
    clienteNomeExplicito?: string | null;
    advogadoResponsavel?: AdvogadoResponsavelContext | null;
  },
) {
  const names: string[] = [];
  const seen = new Set<string>();

  const addName = (value?: string | null) => {
    const normalizedValue = value?.trim();
    if (
      !normalizedValue ||
      matchesAdvogadoResponsavelNome(normalizedValue, options?.advogadoResponsavel)
    ) {
      return;
    }

    const key = normalizeCacheKey(normalizedValue);
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    names.push(normalizedValue);
  };

  addName(options?.clientePrincipalNome);
  addName(options?.clienteNomeExplicito);

  for (const parte of processo.partes || []) {
    const representadaPeloResponsavel = (parte.advogados || []).some((advogado) =>
      matchesAdvogadoResponsavelIdentidade(advogado, options?.advogadoResponsavel),
    );

    if (representadaPeloResponsavel) {
      addName(parte.nome);
    }
  }

  return names;
}

async function ensureImportedClientesRelacionados(
  tx: Prisma.TransactionClient,
  params: {
    tenantId: string;
    processo: ProcessoJuridico;
    clientePrincipal: {
      id: string;
      nome: string;
      documento?: string | null;
      email?: string | null;
      telefone?: string | null;
    };
    clienteNome?: string;
    advogadoResponsavel?: AdvogadoResponsavelContext | null;
  },
) {
  const clientes = [params.clientePrincipal];
  const seen = new Set([params.clientePrincipal.id]);
  const candidateNames = collectImportedClientCandidateNames(params.processo, {
    clientePrincipalNome: params.clientePrincipal.nome,
    clienteNomeExplicito: params.clienteNome,
    advogadoResponsavel: params.advogadoResponsavel,
  });

  for (const nome of candidateNames) {
    const cliente = await ensureCliente(
      tx,
      params.tenantId,
      params.processo,
      nome,
      params.advogadoResponsavel,
    );

    if (!seen.has(cliente.id)) {
      seen.add(cliente.id);
      clientes.push(cliente);
    }
  }

  return clientes;
}

function shouldFlagImportedClientReview(
  processo: ProcessoJuridico,
  options?: {
    clienteNome?: string | null;
    advogadoResponsavel?: AdvogadoResponsavelContext | null;
    clientesRelacionadosCount?: number;
  },
) {
  if ((options?.clientesRelacionadosCount ?? 0) > 1) {
    return false;
  }

  const representedCandidates = collectImportedClientCandidateNames(processo, {
    clienteNomeExplicito: options?.clienteNome,
    advogadoResponsavel: options?.advogadoResponsavel,
  });

  if (representedCandidates.length > 0) {
    return false;
  }

  const autores = uniqueOrderedProcessoRelationIds(
    (processo.partes || [])
      .filter((parte) => parte.tipo === "AUTOR")
      .map((parte) => parte.nome),
  );

  return autores.length > 1;
}

async function ensureImportedClientReviewTasks(params: {
  tenantId: string;
  processoId: string;
  processoNumero: string;
  clienteId?: string | null;
}) {
  const processo = await prisma.processo.findFirst({
    where: {
      id: params.processoId,
      tenantId: params.tenantId,
    },
    select: {
      id: true,
      responsaveis: {
        select: {
          advogado: {
            select: {
              usuario: {
                select: {
                  id: true,
                  active: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      },
      advogadoResponsavel: {
        select: {
          usuario: {
            select: {
              id: true,
              active: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
  });

  if (!processo) {
    return;
  }

  const recipientIds = uniqueOrderedProcessoRelationIds([
    ...processo.responsaveis.map((item) =>
      item.advogado.usuario?.active ? item.advogado.usuario.id : null,
    ),
    processo.advogadoResponsavel?.usuario?.active
      ? processo.advogadoResponsavel.usuario.id
      : null,
  ]);

  const fallbackAdmins =
    recipientIds.length === 0
      ? await prisma.usuario.findMany({
          where: {
            tenantId: params.tenantId,
            role: UserRole.ADMIN,
            active: true,
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        })
      : [];

  const finalRecipients = uniqueOrderedProcessoRelationIds([
    ...recipientIds,
    ...fallbackAdmins.map((admin) => admin.id),
  ]);

  for (const userId of finalRecipients) {
    const existing = await prisma.tarefa.findFirst({
      where: {
        tenantId: params.tenantId,
        processoId: params.processoId,
        responsavelId: userId,
        titulo: "Revisar vínculo de cliente importado do Jusbrasil",
        status: {
          in: ["PENDENTE", "EM_ANDAMENTO"],
        },
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      continue;
    }

    const tarefa = await prisma.tarefa.create({
      data: {
        tenantId: params.tenantId,
        titulo: "Revisar vínculo de cliente importado do Jusbrasil",
        descricao:
          `O processo ${params.processoNumero} foi importado com múltiplos indícios de cliente e precisa de revisão humana antes de consolidar o vínculo final.`,
        prioridade: "ALTA",
        status: "PENDENTE",
        processoId: params.processoId,
        clienteId: params.clienteId ?? null,
        responsavelId: userId,
      },
      select: {
        id: true,
      },
    });

    await NotificationHelper.notifyTarefaCreated(params.tenantId, userId, {
      tarefaId: tarefa.id,
      titulo: "Revisar vínculo de cliente importado do Jusbrasil",
      descricao:
        `O processo ${params.processoNumero} precisa de revisão para confirmar o cliente correto.`,
      criadoPor: "Importação Jusbrasil",
    });

    await NotificationHelper.notifyTarefaAssigned(params.tenantId, userId, {
      tarefaId: tarefa.id,
      titulo: "Revisar vínculo de cliente importado do Jusbrasil",
      atribuidoPara: "Responsável pelo processo",
      atribuidoPor: "Importação Jusbrasil",
    });
  }
}

async function getAdvogadoResponsavelContext(
  tx: Prisma.TransactionClient,
  advogadoId?: string | null,
): Promise<AdvogadoResponsavelContext | null> {
  if (!advogadoId) {
    return null;
  }

  const advogado = await tx.advogado.findUnique({
    where: { id: advogadoId },
    select: {
      oabNumero: true,
      oabUf: true,
      usuario: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  const nome = `${advogado?.usuario.firstName || ""} ${advogado?.usuario.lastName || ""}`
    .trim();

  if (!advogado || !nome) {
    return null;
  }

  return {
    nome,
    oabNumero: advogado.oabNumero,
    oabUf: advogado.oabUf,
  };
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
  const importedStatus = inferImportedProcessoStatus(processo);

  if (existente && !updateIfExists) {
    return { processoId: existente.id, created: false, updated: false };
  }

  if (existente && updateIfExists) {
    const updatedResult = await prisma.$transaction(async (tx) => {
      const advogadoResponsavel = await getAdvogadoResponsavelContext(
        tx,
        advogadoId || existente.advogadoResponsavelId,
      );
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
        (await ensureCliente(
          tx,
          tenantId,
          processo,
          clienteNome,
          advogadoResponsavel,
        ));

      const clienteAlvo = reatribuirCliente
        ? await ensureCliente(
            tx,
            tenantId,
            processo,
            clienteNome,
            advogadoResponsavel,
          )
        : clienteAtual;
      const clientesRelacionados = await ensureImportedClientesRelacionados(tx, {
        tenantId,
        processo,
        clientePrincipal: clienteAlvo,
        clienteNome,
        advogadoResponsavel,
      });
      const clienteIdsRelacionados = uniqueOrderedProcessoRelationIds(
        clientesRelacionados.map((cliente) => cliente.id),
      );
      const advogadoIdsRelacionados = uniqueOrderedProcessoRelationIds([
        advogadoId,
        existente.advogadoResponsavelId,
      ]);

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
          status: mergeImportedProcessoStatus(existente.status, importedStatus),
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
      await syncProcessoClientes(tx, {
        tenantId,
        processoId: existente.id,
        clienteIds: clienteIdsRelacionados,
      });
      await syncProcessoResponsaveis(tx, {
        tenantId,
        processoId: existente.id,
        advogadoIds: advogadoIdsRelacionados,
        advogadoPrincipalId: advogadoId || existente.advogadoResponsavelId,
      });
      await ensureProcessoClientePartes(tx, {
        tenantId,
        processoId: existente.id,
        clienteIds: clienteIdsRelacionados,
      });

      return {
        processoId: existente.id,
        clienteId: clienteAlvo.id,
        clienteIdsRelacionados,
        needsClientReview: shouldFlagImportedClientReview(processo, {
          clienteNome,
          advogadoResponsavel,
          clientesRelacionadosCount: clienteIdsRelacionados.length,
        }),
      };
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

    if (updatedResult.needsClientReview) {
      await ensureImportedClientReviewTasks({
        tenantId,
        processoId: updatedResult.processoId,
        processoNumero: numero,
        clienteId: updatedResult.clienteId,
      });
    }

    return { processoId: existente.id, created: false, updated: true };
  }

  const criado = await prisma.$transaction(async (tx) => {
    const advogadoResponsavel = await getAdvogadoResponsavelContext(
      tx,
      advogadoId,
    );
    const cliente = await ensureCliente(
      tx,
      tenantId,
      processo,
      clienteNome,
      advogadoResponsavel,
    );
    const clientesRelacionados = await ensureImportedClientesRelacionados(tx, {
      tenantId,
      processo,
      clientePrincipal: cliente,
      clienteNome,
      advogadoResponsavel,
    });
    const clienteIdsRelacionados = uniqueOrderedProcessoRelationIds(
      clientesRelacionados.map((item) => item.id),
    );
    const advogadoIdsRelacionados = uniqueOrderedProcessoRelationIds([advogadoId]);

    const processoCriado = await tx.processo.create({
      data: {
        tenantId,
        numero,
        numeroCnj: numero,
        status: importedStatus,
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
    await syncProcessoClientes(tx, {
      tenantId,
      processoId: processoCriado.id,
      clienteIds: clienteIdsRelacionados,
    });
    await syncProcessoResponsaveis(tx, {
      tenantId,
      processoId: processoCriado.id,
      advogadoIds: advogadoIdsRelacionados,
      advogadoPrincipalId: advogadoId || null,
    });
    await ensureProcessoClientePartes(tx, {
      tenantId,
      processoId: processoCriado.id,
      clienteIds: clienteIdsRelacionados,
    });

    return {
      ...processoCriado,
      clienteId: cliente.id,
      clienteIdsRelacionados,
      needsClientReview: shouldFlagImportedClientReview(processo, {
        clienteNome,
        advogadoResponsavel,
        clientesRelacionadosCount: clienteIdsRelacionados.length,
      }),
    };
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

  if (criado.needsClientReview) {
    await ensureImportedClientReviewTasks({
      tenantId,
      processoId: criado.id,
      processoNumero: numero,
      clienteId: criado.clienteId,
    });
  }

  return { processoId: criado.id, created: true, updated: false };
}
