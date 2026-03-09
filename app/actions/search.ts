"use server";

import type { SearchResult } from "@/components/searchbar";

import prisma from "@/app/lib/prisma";
import { getSession } from "@/app/lib/auth";
import { getAccessibleAdvogadoIds } from "@/app/lib/advogado-access";
import logger from "@/lib/logger";
import { UserRole, type Prisma } from "@/generated/prisma";

interface SearchOptions {
  tenantId?: string | null;
}

function buildScopedAdvogadoProcessOrConditions(
  accessibleAdvogados: string[],
  role: UserRole,
  userId: string,
): Prisma.ProcessoWhereInput[] {
  const conditions: Prisma.ProcessoWhereInput[] = [
    {
      advogadoResponsavelId: {
        in: accessibleAdvogados,
      },
    },
    {
      procuracoesVinculadas: {
        some: {
          procuracao: {
            outorgados: {
              some: {
                advogadoId: {
                  in: accessibleAdvogados,
                },
              },
            },
          },
        },
      },
    },
    {
      partes: {
        some: {
          advogadoId: {
            in: accessibleAdvogados,
          },
        },
      },
    },
    {
      cliente: {
        advogadoClientes: {
          some: {
            advogadoId: {
              in: accessibleAdvogados,
            },
          },
        },
      },
    },
  ];

  if (role === UserRole.ADVOGADO) {
    conditions.push({
      cliente: {
        usuario: {
          createdById: userId,
        },
      },
    });
  }

  return conditions;
}

async function getClienteIdFromSession(
  userId: string,
  tenantId: string,
): Promise<string | null> {
  const cliente = await prisma.cliente.findFirst({
    where: {
      usuarioId: userId,
      tenantId,
      deletedAt: null,
    },
    select: {
      id: true,
    },
  });

  return cliente?.id ?? null;
}

export async function searchContent(
  query: string,
  options: SearchOptions = {},
): Promise<SearchResult[]> {
  const session = await getSession();
  const user = session?.user as
    | {
        id?: string;
        tenantId?: string | null;
        role?: UserRole;
      }
    | undefined;
  const userId = user?.id ?? null;
  const sessionTenantId = user?.tenantId ?? null;
  const userRole = user?.role;
  const isSuperAdmin = userRole === UserRole.SUPER_ADMIN;
  const isAdmin = userRole === UserRole.ADMIN || isSuperAdmin;
  const requestedTenantId = options.tenantId ?? sessionTenantId;

  logger.info("[search] searchContent chamado", {
    optionsTenantId: options.tenantId,
    hasSession: !!session,
    userId,
    userRole,
  });

  logger.info("[search] contexto determinado", {
    sessionTenantId,
    userRole,
    isSuperAdmin,
    requestedTenantId,
  });

  const rawQuery = query.trim();
  const searchTerm = rawQuery.toLowerCase();
  const normalizedDigits = rawQuery.replace(/\D/g, "");

  const isQueryTooShort = !rawQuery || rawQuery.length < 2;

  logger.info("[search] validação de query", {
    queryLength: rawQuery.length,
    isQueryTooShort,
    isSuperAdmin,
    allowEmpty: isSuperAdmin,
  });

  if (isQueryTooShort && !isSuperAdmin) {
    logger.info("[search] query muito curta para usuário normal");
    return [];
  }

  // Para Super Admin: permitir busca sem tenant específico (retorna agregados)
  // Para usuários normais: obrigatório ter tenantId da sessão
  if (!isSuperAdmin) {
    if (!session || !userId) {
      logger.warn("[search] sessão inválida para usuário não super admin");
      return [];
    }
    if (!requestedTenantId) {
      logger.warn("[search] usuário normal sem tenantId");
      return [];
    }
    if (requestedTenantId !== sessionTenantId) {
      logger.warn("[search] tentativa de acesso a tenant diferente", {
        requestedTenantId,
        sessionTenantId,
      });
      return [];
    }
  }

  const results: SearchResult[] = [];

  try {
    // Para Super Admin: retornar apenas agregados por tenant, sem dados sensíveis
    if (isSuperAdmin) {
      logger.info("[search] modo super admin", {
        requestedTenantId,
        searchTerm,
        isAllTenants: requestedTenantId === "ALL" || !requestedTenantId,
      });

      // Se não há query ou query vazia, retornar todos os tenants (limitado)
      const whereClause: any = {};
      
      if (requestedTenantId && requestedTenantId !== "ALL") {
        whereClause.id = requestedTenantId;
      }

      // Se há query, adicionar filtro de busca
      if (searchTerm && searchTerm.length > 0) {
        whereClause.OR = [
          { name: { contains: searchTerm, mode: "insensitive" as const } },
          { slug: { contains: searchTerm, mode: "insensitive" as const } },
          { domain: { contains: searchTerm, mode: "insensitive" as const } },
        ];
      }

      const tenants = await prisma.tenant.findMany({
        where: whereClause,
        take: 10,
        select: {
          id: true,
          name: true,
          slug: true,
          domain: true,
          _count: {
            select: {
              processos: true,
              clientes: true,
              documentos: true,
            },
          },
        },
        orderBy: {
          name: "asc",
        },
      });

      logger.info("[search] tenants encontrados para super admin", {
        count: tenants.length,
      });

      // Fallback: se a busca não casar, mas há tenant selecionado, retorna ele
      if (
        tenants.length === 0 &&
        requestedTenantId &&
        requestedTenantId !== "ALL"
      ) {
        logger.info("[search] tentando buscar tenant específico", {
          tenantId: requestedTenantId ?? undefined,
        });

        const tenant = await prisma.tenant.findUnique({
          where: { id: requestedTenantId },
          select: {
            id: true,
            name: true,
            slug: true,
            domain: true,
            _count: {
              select: {
                processos: true,
                clientes: true,
                documentos: true,
              },
            },
          },
        });

        if (tenant) {
          tenants.push(tenant);
          logger.info("[search] tenant específico encontrado", {
            tenantName: tenant.name,
          });
        }
      }

      tenants.forEach((tenant) => {
        results.push({
          id: `tenant-${tenant.id}`,
          type: "tenant",
          title: tenant.name,
          description: tenant.domain ?? tenant.slug,
          href: `/admin/tenants/${tenant.id}`,
          status: `${tenant._count.processos} processos · ${tenant._count.clientes} clientes`,
          statusColor: "primary",
        });
      });

      logger.info("[search] resultados super admin", {
        total: results.length,
      });

      return results.slice(0, 10);
    }

    if (!userId || !requestedTenantId || !userRole) {
      logger.warn("[search] contexto insuficiente para busca");
      return [];
    }

    const clienteId =
      userRole === UserRole.CLIENTE
        ? await getClienteIdFromSession(userId, requestedTenantId)
        : null;
    const accessibleAdvogados =
      isAdmin || userRole === UserRole.CLIENTE
        ? []
        : await getAccessibleAdvogadoIds(session as any);

    const advogadoProcessOrConditions =
      accessibleAdvogados.length > 0
        ? buildScopedAdvogadoProcessOrConditions(
            accessibleAdvogados,
            userRole,
            userId,
          )
        : [];

    const processoScopeFilter: Prisma.ProcessoWhereInput = clienteId
      ? { clienteId }
      : !isAdmin && advogadoProcessOrConditions.length > 0
        ? { OR: advogadoProcessOrConditions }
        : {};

    const clienteScopeFilter: Prisma.ClienteWhereInput = clienteId
      ? { id: clienteId }
      : !isAdmin && accessibleAdvogados.length > 0
        ? {
            OR: [
              {
                advogadoClientes: {
                  some: {
                    advogadoId: {
                      in: accessibleAdvogados,
                    },
                  },
                },
              },
              ...(userRole === UserRole.ADVOGADO
                ? [
                    {
                      usuario: {
                        createdById: userId,
                      },
                    },
                  ]
                : []),
            ],
          }
        : {};

    const documentoScopeFilter: Prisma.DocumentoWhereInput = clienteId
      ? {
          OR: [{ clienteId }, { processo: { clienteId } }],
        }
      : !isAdmin && accessibleAdvogados.length > 0
        ? {
            OR: [
              {
                cliente: {
                  advogadoClientes: {
                    some: {
                      advogadoId: {
                        in: accessibleAdvogados,
                      },
                    },
                  },
                },
              },
              {
                processo: {
                  AND: [
                    {
                      tenantId: requestedTenantId,
                      deletedAt: null,
                    },
                    {
                      OR: advogadoProcessOrConditions,
                    },
                  ],
                },
              },
            ],
          }
        : {};

    const juizScopeFilter: Prisma.JuizWhereInput = clienteId
      ? {
          processos: {
            some: {
              tenantId: requestedTenantId,
              deletedAt: null,
              clienteId,
            },
          },
        }
      : !isAdmin && accessibleAdvogados.length > 0
        ? {
            processos: {
              some: {
                AND: [
                  {
                    tenantId: requestedTenantId,
                    deletedAt: null,
                  },
                  {
                    OR: advogadoProcessOrConditions,
                  },
                ],
              },
            },
          }
        : {
            processos: {
              some: {
                tenantId: requestedTenantId,
                deletedAt: null,
              },
            },
          };

    // Buscar processos
    logger.info("[search] processos query", {
      tenantId: requestedTenantId,
      userRole,
      hasClienteScope: Boolean(clienteId),
      hasAdvScope: accessibleAdvogados.length > 0,
    });

    const processos = await prisma.processo.findMany({
      where: {
        AND: [
          {
            tenantId: requestedTenantId,
            deletedAt: null,
          },
          processoScopeFilter,
          {
            OR: [
              { numero: { contains: searchTerm, mode: "insensitive" as const } },
              ...(normalizedDigits.length >= 4
                ? [
                    {
                      numero: {
                        contains: normalizedDigits,
                        mode: "insensitive" as const,
                      },
                    },
                  ]
                : []),
              {
                titulo: {
                  contains: searchTerm,
                  mode: "insensitive" as const,
                },
              },
              {
                descricao: {
                  contains: searchTerm,
                  mode: "insensitive" as const,
                },
              },
            ],
          },
        ],
      },
      take: 5,
      select: {
        id: true,
        numero: true,
        titulo: true,
        descricao: true,
        status: true,
        cliente: {
          select: {
            nome: true,
          },
        },
      },
    });

    logger.info("[search] processos encontrados", {
      tenantId: requestedTenantId,
      total: processos.length,
    });

    processos.forEach((processo) => {
      const resumo = processo.titulo ?? processo.descricao ?? "";
      const clienteNome = processo.cliente?.nome ?? "Cliente não informado";

      results.push({
        id: `processo-${processo.id}`,
        type: "processo",
        title: processo.numero,
        description: resumo ? `${resumo} - ${clienteNome}` : clienteNome,
        href: `/processos/${processo.id}`,
        status: processo.status,
        statusColor: getStatusColor(processo.status),
      });
    });

    // Buscar clientes
    const clientes = await prisma.cliente.findMany({
      where: {
        AND: [
          {
            tenantId: requestedTenantId,
            deletedAt: null,
          },
          clienteScopeFilter,
          {
            OR: [
              { nome: { contains: searchTerm, mode: "insensitive" as const } },
              { email: { contains: searchTerm, mode: "insensitive" as const } },
              {
                documento: {
                  contains: searchTerm,
                  mode: "insensitive" as const,
                },
              },
            ],
          },
        ],
      },
      take: 5,
      select: {
        id: true,
        nome: true,
        email: true,
        tipoPessoa: true,
      },
    });

    clientes.forEach((cliente) => {
      const tipoLabel =
        cliente.tipoPessoa === "FISICA" ? "Pessoa Física" : "Pessoa Jurídica";

      results.push({
        id: `cliente-${cliente.id}`,
        type: "cliente",
        title: cliente.nome,
        description: cliente.email || tipoLabel,
        href: `/clientes/${cliente.id}`,
        status: cliente.tipoPessoa === "FISICA" ? "PF" : "PJ",
        statusColor: cliente.tipoPessoa === "FISICA" ? "primary" : "secondary",
      });
    });

    // Buscar documentos
    const documentos = await prisma.documento.findMany({
      where: {
        AND: [
          {
            tenantId: requestedTenantId,
            deletedAt: null,
          },
          documentoScopeFilter,
          {
            OR: [
              { nome: { contains: searchTerm, mode: "insensitive" as const } },
              {
                descricao: {
                  contains: searchTerm,
                  mode: "insensitive" as const,
                },
              },
            ],
          },
        ],
      },
      take: 5,
      select: {
        id: true,
        nome: true,
        descricao: true,
        tipo: true,
        processo: {
          select: {
            numero: true,
          },
        },
      },
    });

    documentos.forEach((documento) => {
      const descriptionParts = [
        documento.descricao?.trim() || null,
        documento.processo?.numero
          ? `Processo: ${documento.processo.numero}`
          : null,
      ].filter(Boolean) as string[];
      const description =
        descriptionParts.join(" - ") || "Documento cadastrado";

      results.push({
        id: `documento-${documento.id}`,
        type: "documento",
        title: documento.nome,
        description,
        href: `/documentos/${documento.id}`,
        status: documento.tipo ?? "Documento",
        statusColor: "default",
      });
    });

    // Buscar juízes
    const juizes = await prisma.juiz.findMany({
      where: {
        AND: [
          juizScopeFilter,
          {
            OR: [
              { nome: { contains: searchTerm, mode: "insensitive" as const } },
              {
                nomeCompleto: {
                  contains: searchTerm,
                  mode: "insensitive" as const,
                },
              },
              { cpf: { contains: searchTerm, mode: "insensitive" as const } },
              { oab: { contains: searchTerm, mode: "insensitive" as const } },
              { email: { contains: searchTerm, mode: "insensitive" as const } },
              { vara: { contains: searchTerm, mode: "insensitive" as const } },
              {
                comarca: {
                  contains: searchTerm,
                  mode: "insensitive" as const,
                },
              },
            ],
          },
        ],
      },
      take: 5,
      select: {
        id: true,
        nome: true,
        nomeCompleto: true,
        vara: true,
        comarca: true,
        status: true,
        nivel: true,
      },
    });

    juizes.forEach((juiz) => {
      results.push({
        id: `juiz-${juiz.id}`,
        type: "juiz",
        title: juiz.nomeCompleto || juiz.nome,
        description: `${juiz.vara || "Vara não informada"} - ${juiz.comarca || "Comarca não informada"}`,
        href: `/juizes/${juiz.id}`,
        status: juiz.status,
        statusColor: juiz.status === "ATIVO" ? "success" : "default",
      });
    });

    // Buscar usuários (apenas se for admin)
    const usuarios = isAdmin
      ? await prisma.usuario.findMany({
          where: {
            tenantId: requestedTenantId,
            OR: [
              {
                firstName: {
                  contains: searchTerm,
                  mode: "insensitive" as const,
                },
              },
              {
                lastName: {
                  contains: searchTerm,
                  mode: "insensitive" as const,
                },
              },
              { email: { contains: searchTerm, mode: "insensitive" as const } },
            ],
          },
          take: 3,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        })
      : [];

    usuarios.forEach((usuario) => {
      const fullName =
        `${usuario.firstName ?? ""} ${usuario.lastName ?? ""}`.trim();

      results.push({
        id: `usuario-${usuario.id}`,
        type: "usuario",
        title: fullName || usuario.email,
        description: usuario.email,
        href: `/equipe/${usuario.id}`,
        status: usuario.role,
        statusColor: usuario.role === "ADMIN" ? "danger" : "default",
      });
    });

    // Ordenar resultados por relevância (título que começa com o termo primeiro)
    results.sort((a, b) => {
      const aStartsWith = a.title.toLowerCase().startsWith(searchTerm);
      const bStartsWith = b.title.toLowerCase().startsWith(searchTerm);

      if (aStartsWith && !bStartsWith) return -1;
      if (!aStartsWith && bStartsWith) return 1;

      return a.title.localeCompare(b.title);
    });

    if (results.length === 0) {
      logger.info("[search] Nenhum resultado", {
        query: rawQuery,
        tenant: requestedTenantId,
        userId,
        role: userRole,
        scope: "tenant-role-scoped",
      });
    }

    return results.slice(0, 10); // Limitar a 10 resultados
  } catch (error) {
    logger.error("Erro na busca:", error);

    return [];
  }
}

function getStatusColor(
  status: string,
): "default" | "primary" | "secondary" | "success" | "warning" | "danger" {
  switch (status?.toUpperCase()) {
    case "ATIVO":
    case "EM_ANDAMENTO":
      return "success";
    case "PENDENTE":
      return "warning";
    case "CANCELADO":
    case "ARQUIVADO":
      return "danger";
    case "CONCLUIDO":
      return "primary";
    default:
      return "default";
  }
}
