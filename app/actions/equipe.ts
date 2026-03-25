"use server";

import { revalidatePath } from "next/cache";

import { Prisma, UserRole } from "@/generated/prisma";
import { getSession } from "@/app/lib/auth";
import prisma from "@/app/lib/prisma";
import { NotificationHelper } from "@/app/lib/notifications/notification-helper";
import { resolveRolePermission } from "@/app/lib/permissions/role-defaults";
import { getTenantAccessibleModules } from "@/app/lib/tenant-modules";
import { publishRealtimeEvent } from "@/app/lib/realtime/publisher";
import logger from "@/lib/logger";

// ===== TIPOS E INTERFACES =====

export interface CargoData {
  id: string;
  nome: string;
  descricao?: string;
  nivel: number;
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;
  usuariosCount: number;
  permissoes: CargoPermissaoData[];
}

export interface CargoPermissaoData {
  id: string;
  modulo: string;
  acao: string;
  permitido: boolean;
}

export interface UsuarioEquipeData {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: UserRole;
  active: boolean;
  avatarUrl?: string;
  isExterno?: boolean; // Para advogados
  phone?: string;
  cpf?: string;
  rg?: string;
  dataNascimento?: Date;
  observacoes?: string;
  cargos: CargoData[];
  vinculacoes: UsuarioVinculacaoData[];
  permissoesIndividuais: UsuarioPermissaoIndividualData[];
}

export interface UsuarioVinculacaoData {
  id: string;
  advogadoId: string;
  advogadoNome: string;
  tipo: string;
  ativo: boolean;
  dataInicio: Date;
  dataFim?: Date;
  observacoes?: string;
}

export interface UsuarioPermissaoIndividualData {
  id: string;
  modulo: string;
  acao: string;
  permitido: boolean;
  motivo?: string;
}

// ===== CRUD DE CARGOS =====

export async function getCargos(): Promise<CargoData[]> {
  const session = await getSession();

  if (!session?.user?.tenantId) {
    throw new Error("Usuário não autenticado");
  }

  const cargos = await prisma.cargo.findMany({
    where: {
      tenantId: session.user.tenantId,
    },
    include: {
      usuarios: {
        where: { ativo: true },
        select: { id: true },
      },
      permissoes: true,
    },
    orderBy: [{ nivel: "asc" }, { nome: "asc" }],
  });

  return cargos.map((cargo) => ({
    id: cargo.id,
    nome: cargo.nome,
    descricao: cargo.descricao || undefined,
    nivel: cargo.nivel,
    ativo: cargo.ativo,
    createdAt: cargo.createdAt,
    updatedAt: cargo.updatedAt,
    usuariosCount: cargo.usuarios.length,
    permissoes: cargo.permissoes.map((permissao) => ({
      id: permissao.id,
      modulo: permissao.modulo,
      acao: permissao.acao,
      permitido: permissao.permitido,
    })),
  }));
}

export async function createCargo(data: {
  nome: string;
  descricao?: string;
  nivel: number;
  permissoes: { modulo: string; acao: string; permitido: boolean }[];
}): Promise<CargoData> {
  const session = await getSession();

  if (!session?.user?.tenantId) {
    throw new Error("Usuário não autenticado");
  }

  if (session.user.role !== UserRole.ADMIN) {
    throw new Error("Apenas administradores podem criar cargos");
  }

  const cargo = await prisma.cargo.create({
    data: {
      tenantId: session.user.tenantId,
      nome: data.nome,
      descricao: data.descricao,
      nivel: data.nivel,
      permissoes: {
        create: data.permissoes.map((permissao) => ({
          tenantId: session.user.tenantId!,
          modulo: permissao.modulo,
          acao: permissao.acao,
          permitido: permissao.permitido,
        })),
      },
    },
    include: {
      usuarios: {
        where: { ativo: true },
        select: { id: true },
      },
      permissoes: true,
    },
  });

  revalidatePath("/equipe");

  // Publicar evento realtime
  publishRealtimeEvent("cargo-update", {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    payload: {
      cargoId: cargo.id,
      action: "created",
      cargo: {
        id: cargo.id,
        nome: cargo.nome,
        nivel: cargo.nivel,
        ativo: cargo.ativo,
      },
      changedBy: session.user.id!,
    },
  }).catch((error) => {
    console.error("[realtime] Falha ao publicar evento cargo-update", error);
  });

  return {
    id: cargo.id,
    nome: cargo.nome,
    descricao: cargo.descricao || undefined,
    nivel: cargo.nivel,
    ativo: cargo.ativo,
    createdAt: cargo.createdAt,
    updatedAt: cargo.updatedAt,
    usuariosCount: cargo.usuarios?.length || 0,
    permissoes: cargo.permissoes?.map((permissao) => ({
      id: permissao.id,
      modulo: permissao.modulo,
      acao: permissao.acao,
      permitido: permissao.permitido,
    })),
  };
}

export async function updateCargo(
  cargoId: string,
  data: {
    nome: string;
    descricao?: string;
    nivel: number;
    ativo: boolean;
    permissoes: { modulo: string; acao: string; permitido: boolean }[];
  },
): Promise<CargoData> {
  const session = await getSession();

  if (!session?.user?.tenantId) {
    throw new Error("Usuário não autenticado");
  }

  if (session.user.role !== UserRole.ADMIN) {
    throw new Error("Apenas administradores podem editar cargos");
  }

  // Atualizar cargo
  const cargo = await prisma.cargo.update({
    where: {
      id: cargoId,
      tenantId: session.user.tenantId,
    },
    data: {
      nome: data.nome,
      descricao: data.descricao,
      nivel: data.nivel,
      ativo: data.ativo,
    },
  });

  const uniquePermissoes = new Map<
    string,
    { modulo: string; acao: string; permitido: boolean }
  >();

  for (const permissao of data.permissoes) {
    const key = `${permissao.modulo}:${permissao.acao}`;

    uniquePermissoes.set(key, permissao);
  }

  const permissoesParaCriar = Array.from(uniquePermissoes.values());

  const permissaoWhereList = permissoesParaCriar.map((permissao) => ({
    modulo: permissao.modulo,
    acao: permissao.acao,
  }));

  await prisma.$transaction([
    ...permissoesParaCriar.map((permissao) =>
      prisma.cargoPermissao.upsert({
        where: {
          tenantId_cargoId_modulo_acao: {
            tenantId: session.user.tenantId!,
            cargoId,
            modulo: permissao.modulo,
            acao: permissao.acao,
          },
        },
        update: {
          permitido: permissao.permitido,
        },
        create: {
          tenantId: session.user.tenantId!,
          cargoId,
          modulo: permissao.modulo,
          acao: permissao.acao,
          permitido: permissao.permitido,
        },
      }),
    ),
    prisma.cargoPermissao.updateMany({
      where: {
        tenantId: session.user.tenantId!,
        cargoId,
        ...(permissaoWhereList.length > 0
          ? {
              NOT: {
                OR: permissaoWhereList,
              },
            }
          : {}),
      },
      data: {
        permitido: false,
      },
    }),
  ]);

  revalidatePath("/equipe");

  // Retornar cargo atualizado
  const cargoAtualizado = await prisma.cargo.findUnique({
    where: { id: cargoId },
    include: {
      usuarios: {
        where: { ativo: true },
        select: { id: true },
      },
      permissoes: true,
    },
  });

  if (!cargoAtualizado) {
    throw new Error("Cargo não encontrado");
  }

  // Publicar evento realtime
  publishRealtimeEvent("cargo-update", {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    payload: {
      cargoId: cargoAtualizado.id,
      action: "updated",
      cargo: {
        id: cargoAtualizado.id,
        nome: cargoAtualizado.nome,
        nivel: cargoAtualizado.nivel,
        ativo: cargoAtualizado.ativo,
      },
      changedBy: session.user.id!,
    },
  }).catch((error) => {
    console.error("[realtime] Falha ao publicar evento cargo-update", error);
  });

  return {
    id: cargoAtualizado.id,
    nome: cargoAtualizado.nome,
    descricao: cargoAtualizado.descricao || undefined,
    nivel: cargoAtualizado.nivel,
    ativo: cargoAtualizado.ativo,
    createdAt: cargoAtualizado.createdAt,
    updatedAt: cargoAtualizado.updatedAt,
    usuariosCount: cargoAtualizado.usuarios?.length || 0,
    permissoes: cargoAtualizado.permissoes?.map((permissao) => ({
      id: permissao.id,
      modulo: permissao.modulo,
      acao: permissao.acao,
      permitido: permissao.permitido,
    })),
  };
}

export async function deleteCargo(cargoId: string): Promise<void> {
  const session = await getSession();

  if (!session?.user?.tenantId) {
    throw new Error("Usuário não autenticado");
  }

  if (session.user.role !== UserRole.ADMIN) {
    throw new Error("Apenas administradores podem excluir cargos");
  }

  // Verificar se há usuários vinculados ao cargo
  const usuariosVinculados = await prisma.usuarioCargo.count({
    where: {
      cargoId: cargoId,
      tenantId: session.user.tenantId,
      ativo: true,
    },
  });

  if (usuariosVinculados > 0) {
    throw new Error("Não é possível excluir cargo com usuários vinculados");
  }

  const cargoDeactivated = await prisma.cargo.updateMany({
    where: {
      id: cargoId,
      tenantId: session.user.tenantId,
    },
    data: {
      ativo: false,
    },
  });

  if (cargoDeactivated.count === 0) {
    throw new Error("Cargo não encontrado");
  }

  revalidatePath("/equipe");

  // Publicar evento realtime
  publishRealtimeEvent("cargo-update", {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    payload: {
      cargoId: cargoId,
      action: "deleted",
      changedBy: session.user.id!,
    },
  }).catch((error) => {
    console.error("[realtime] Falha ao publicar evento cargo-update", error);
  });
}

// ===== GESTÃO DE USUÁRIOS DA EQUIPE =====

export async function getUsuariosEquipe(): Promise<UsuarioEquipeData[]> {
  const session = await getSession();

  if (!session?.user?.tenantId) {
    throw new Error("Usuário não autenticado");
  }

  const usuarios = await prisma.usuario.findMany({
    where: {
      tenantId: session.user.tenantId,
      role: {
        notIn: [UserRole.CLIENTE, UserRole.ADVOGADO],
      },
      advogado: {
        is: null,
      },
    },
    include: {
      cargos: {
        where: { ativo: true },
        include: {
          cargo: {
            include: {
              permissoes: true,
            },
          },
        },
      },
      vinculacoesComoServidor: {
        where: { ativo: true },
        include: {
          advogado: {
            include: {
              usuario: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      },
      permissoesIndividuais: true,
      advogado: {
        select: {
          isExterno: true,
        },
      },
    },
    orderBy: [{ role: "asc" }, { firstName: "asc" }],
  });

  return usuarios.map((usuario) => ({
    id: usuario.id,
    email: usuario.email,
    firstName: usuario.firstName || undefined,
    lastName: usuario.lastName || undefined,
    role: usuario.role,
    active: usuario.active,
    avatarUrl: usuario.avatarUrl || undefined,
    isExterno: usuario.advogado?.isExterno,
    phone: usuario.phone || undefined,
    cpf: usuario.cpf || undefined,
    rg: usuario.rg || undefined,
    dataNascimento: usuario.dataNascimento || undefined,
    observacoes: usuario.observacoes || undefined,
    cargos: usuario.cargos.map((uc) => ({
      id: uc.cargo.id,
      nome: uc.cargo.nome,
      descricao: uc.cargo.descricao || undefined,
      nivel: uc.cargo.nivel,
      ativo: uc.cargo.ativo,
      createdAt: uc.cargo.createdAt,
      updatedAt: uc.cargo.updatedAt,
      usuariosCount: 0, // Será calculado separadamente
      permissoes: uc.cargo.permissoes.map((permissao) => ({
        id: permissao.id,
        modulo: permissao.modulo,
        acao: permissao.acao,
        permitido: permissao.permitido,
      })),
    })),
    vinculacoes: usuario.vinculacoesComoServidor.map((vinculacao) => ({
      id: vinculacao.id,
      advogadoId: vinculacao.advogadoId,
      advogadoNome:
        `${vinculacao.advogado.usuario.firstName || ""} ${vinculacao.advogado.usuario.lastName || ""}`.trim(),
      tipo: vinculacao.tipo,
      ativo: vinculacao.ativo,
      dataInicio: vinculacao.dataInicio,
      dataFim: vinculacao.dataFim || undefined,
      observacoes: vinculacao.observacoes || undefined,
    })),
    permissoesIndividuais: usuario.permissoesIndividuais.map((permissao) => ({
      id: permissao.id,
      modulo: permissao.modulo,
      acao: permissao.acao,
      permitido: permissao.permitido,
      motivo: permissao.motivo || undefined,
    })),
  }));
}

export async function atribuirCargoUsuario(
  usuarioId: string,
  cargoId: string,
): Promise<void> {
  const session = await getSession();

  if (!session?.user?.tenantId) {
    throw new Error("Usuário não autenticado");
  }

  if (session.user.role !== UserRole.ADMIN) {
    throw new Error("Apenas administradores podem atribuir cargos");
  }

  // Verificar se o cargo existe
  const cargo = await prisma.cargo.findFirst({
    where: {
      id: cargoId,
      tenantId: session.user.tenantId,
      ativo: true,
    },
  });

  if (!cargo) {
    throw new Error("Cargo não encontrado");
  }

  // Verificar se o usuário existe
  const usuario = await prisma.usuario.findFirst({
    where: {
      id: usuarioId,
      tenantId: session.user.tenantId,
    },
  });

  if (!usuario) {
    throw new Error("Usuário não encontrado");
  }

  // Desativar cargo atual se existir
  await prisma.usuarioCargo.updateMany({
    where: {
      usuarioId: usuarioId,
      tenantId: session.user.tenantId,
      ativo: true,
    },
    data: {
      ativo: false,
      dataFim: new Date(),
    },
  });

  // Atribuir novo cargo (reativa se já existir vínculo histórico)
  await prisma.usuarioCargo.upsert({
    where: {
      tenantId_usuarioId_cargoId: {
        tenantId: session.user.tenantId,
        usuarioId: usuarioId,
        cargoId: cargoId,
      },
    },
    update: {
      ativo: true,
      dataInicio: new Date(),
      dataFim: null,
    },
    create: {
      tenantId: session.user.tenantId,
      usuarioId: usuarioId,
      cargoId: cargoId,
      ativo: true,
      dataInicio: new Date(),
    },
  });

  // Registrar no histórico
  await prisma.equipeHistorico.create({
    data: {
      tenantId: session.user.tenantId,
      usuarioId: usuarioId,
      acao: "cargo_alterado",
      dadosAntigos: { cargoAnterior: "N/A" },
      dadosNovos: { cargoNovo: cargo.nome },
      motivo: `Cargo alterado para ${cargo.nome}`,
      realizadoPor: session.user.id!,
    },
  });

  revalidatePath("/equipe");

  // Notificar clientes para revalidarem permissões em tempo real
  publishRealtimeEvent("usuario-update", {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    payload: {
      usuarioId,
      action: "permissions-updated",
      changedBy: session.user.id!,
      permission: {
        modulo: "equipe",
        acao: "cargo_alterado",
        permitido: true,
      },
    },
  }).catch((error) => {
    console.error("[realtime] Falha ao publicar evento usuario-update", error);
  });
}

export async function removerCargoUsuario(
  usuarioId: string,
  cargoId: string,
): Promise<void> {
  const session = await getSession();

  if (!session?.user?.tenantId) {
    throw new Error("Usuário não autenticado");
  }

  if (session.user.role !== UserRole.ADMIN) {
    throw new Error("Apenas administradores podem remover cargos");
  }

  // Desativar cargo do usuário
  await prisma.usuarioCargo.updateMany({
    where: {
      usuarioId: usuarioId,
      cargoId: cargoId,
      tenantId: session.user.tenantId,
      ativo: true,
    },
    data: {
      ativo: false,
      dataFim: new Date(),
    },
  });

  // Registrar no histórico
  const cargo = await prisma.cargo.findFirst({
    where: {
      id: cargoId,
      tenantId: session.user.tenantId,
    },
    select: {
      nome: true,
    },
  });

  await prisma.equipeHistorico.create({
    data: {
      tenantId: session.user.tenantId,
      usuarioId: usuarioId,
      acao: "cargo_removido",
      dadosAntigos: { cargoRemovido: cargo?.nome || "N/A" },
      dadosNovos: { cargoRemovido: cargo?.nome || "N/A" },
      motivo: `Cargo ${cargo?.nome || ""} removido`,
      realizadoPor: session.user.id!,
    },
  });

  revalidatePath("/equipe");
}

export async function vincularUsuarioAdvogado(
  usuarioId: string,
  advogadoId: string,
  tipo: string,
  observacoes?: string,
): Promise<void> {
  const session = await getSession();

  if (!session?.user?.tenantId) {
    throw new Error("Usuário não autenticado");
  }

  if (session.user.role !== UserRole.ADMIN) {
    throw new Error(
      "Apenas administradores podem vincular usuários a advogados",
    );
  }

  // Verificar se a vinculação ativa já existe
  const vinculacaoAtiva = await prisma.usuarioVinculacao.findFirst({
    where: {
      usuarioId: usuarioId,
      advogadoId: advogadoId,
      tenantId: session.user.tenantId,
      ativo: true,
    },
  });

  if (vinculacaoAtiva) {
    throw new Error("Usuário já está vinculado a este advogado");
  }

  // Criar ou reativar vinculação histórica
  await prisma.usuarioVinculacao.upsert({
    where: {
      tenantId_usuarioId_advogadoId: {
        tenantId: session.user.tenantId,
        usuarioId,
        advogadoId,
      },
    },
    update: {
      tipo,
      ativo: true,
      dataInicio: new Date(),
      dataFim: null,
      observacoes: observacoes ?? null,
    },
    create: {
      tenantId: session.user.tenantId,
      usuarioId,
      advogadoId,
      tipo,
      ativo: true,
      dataInicio: new Date(),
      observacoes,
    },
  });

  // Registrar no histórico
  await prisma.equipeHistorico.create({
    data: {
      tenantId: session.user.tenantId,
      usuarioId: usuarioId,
      acao: "vinculacao_alterada",
      dadosAntigos: { vinculacaoAnterior: "N/A" },
      dadosNovos: { vinculacaoNova: `${tipo} vinculado ao advogado` },
      motivo: `Vinculação criada: ${tipo}`,
      realizadoPor: session.user.id!,
    },
  });

  revalidatePath("/equipe");
}

export async function desvincularUsuarioAdvogado(
  vinculacaoId: string,
): Promise<void> {
  const session = await getSession();

  if (!session?.user?.tenantId) {
    throw new Error("Usuário não autenticado");
  }

  if (session.user.role !== UserRole.ADMIN) {
    throw new Error("Apenas administradores podem desvincular usuários");
  }

  // Desativar vinculação
  await prisma.usuarioVinculacao.update({
    where: {
      id: vinculacaoId,
      tenantId: session.user.tenantId,
    },
    data: {
      ativo: false,
      dataFim: new Date(),
    },
  });

  revalidatePath("/equipe");
}

// ===== SISTEMA DE PERMISSÕES =====

export async function verificarPermissao(
  modulo: string,
  acao: string,
  usuarioId?: string,
): Promise<boolean> {
  const session = await getSession();

  if (!session?.user?.tenantId) {
    return false;
  }

  const targetUsuarioId = usuarioId ?? session.user.id ?? "desconhecido";

  // Admin e SuperAdmin têm todas as permissões
  if (
    session.user.role === UserRole.ADMIN ||
    session.user.role === UserRole.SUPER_ADMIN
  ) {
    return true;
  }

  // Verificar permissões individuais primeiro
  const permissaoIndividual = await prisma.usuarioPermissaoIndividual.findFirst(
    {
      where: {
        tenantId: session.user.tenantId,
        usuarioId: targetUsuarioId,
        modulo: modulo,
        acao: acao,
      },
    },
  );

  if (permissaoIndividual) {
    const permitido = permissaoIndividual.permitido;

    // Logar recusa se override negar
    if (!permitido) {
      logPermissaoNegada({
        tenantId: session.user.tenantId,
        usuarioId: targetUsuarioId,
        modulo,
        acao,
        role: session.user.role!,
        origem: "override",
      }).catch((error) => {
        console.error("[permissions] Erro ao logar recusa:", error);
      });
    }

    return permitido;
  }

  // Verificar permissões do cargo
  const usuarioCargo = await prisma.usuarioCargo.findFirst({
    where: {
      tenantId: session.user.tenantId,
      usuarioId: targetUsuarioId,
      ativo: true,
    },
    include: {
      cargo: {
        include: {
          permissoes: true,
        },
      },
    },
  });

  if (usuarioCargo?.cargo) {
    const permissaoCargo = usuarioCargo.cargo.permissoes.find(
      (p) => p.modulo === modulo && p.acao === acao,
    );

    if (permissaoCargo) {
      const permitido = permissaoCargo.permitido;

      // Logar recusa se cargo negar
      if (!permitido) {
        logPermissaoNegada({
          tenantId: session.user.tenantId,
          usuarioId: targetUsuarioId,
          modulo,
          acao,
          role: session.user.role!,
          origem: "cargo",
          cargoId: usuarioCargo.cargo.id,
        }).catch((error) => {
          console.error("[permissions] Erro ao logar recusa:", error);
        });
      }

      return permitido;
    }
  }

  const userRole = session.user.role! as UserRole;

  if (resolveRolePermission(userRole, modulo, acao)) {
    return true;
  }

  // Logar recusa de permissão (assíncrono, não bloqueia resposta)
  logPermissaoNegada({
    tenantId: session.user.tenantId,
    usuarioId: targetUsuarioId,
    modulo,
    acao,
    role: session.user.role!,
    origem: "role",
  }).catch((error) => {
    console.error("[permissions] Erro ao logar recusa:", error);
  });

  return false;
}

/**
 * Loga uma tentativa negada de acesso para auditoria
 */
async function logPermissaoNegada(data: {
  tenantId: string;
  usuarioId: string;
  modulo: string;
  acao: string;
  role: string;
  origem: "override" | "cargo" | "role";
  cargoId?: string;
}) {
  try {
    // Logger para console/logs estruturados
    logger.warn("[PERMISSION_DENIED]", {
      tenantId: data.tenantId,
      usuarioId: data.usuarioId,
      modulo: data.modulo,
      acao: data.acao,
      role: data.role,
      origem: data.origem,
      cargoId: data.cargoId,
      timestamp: new Date().toISOString(),
    });

    // Registrar no EquipeHistorico para auditoria detalhada
    await prisma.equipeHistorico
      .create({
        data: {
          tenantId: data.tenantId,
          usuarioId: data.usuarioId,
          acao: "permissao_negada",
          dadosAntigos: Prisma.JsonNull,
          dadosNovos: {
            modulo: data.modulo,
            acao: data.acao,
            origem: data.origem,
            role: data.role,
            cargoId: data.cargoId,
          },
          motivo: `Tentativa de acesso negada: ${data.modulo}.${data.acao} (origem: ${data.origem})`,
          realizadoPor: data.usuarioId, // O próprio usuário tentou acessar
        },
      })
      .catch((error) => {
        // Não bloquear se houver erro ao salvar histórico
        console.error("[permissions] Erro ao salvar histórico:", error);
      });
  } catch (error) {
    // Silenciosamente falhar - não deve interromper o fluxo
    console.error("[permissions] Erro geral ao logar recusa:", error);
  }
}

export async function adicionarPermissaoIndividual(
  usuarioId: string,
  modulo: string,
  acao: string,
  permitido: boolean,
  motivo?: string,
): Promise<void> {
  const session = await getSession();

  if (!session?.user?.tenantId) {
    throw new Error("Usuário não autenticado");
  }

  if (session.user.role !== UserRole.ADMIN) {
    throw new Error(
      "Apenas administradores podem adicionar permissões individuais",
    );
  }

  const actor = session.user as any;
  const actorName =
    `${actor.firstName ?? ""} ${actor.lastName ?? ""}`.trim() ||
    actor.email ||
    actor.id;

  const existingPermission = await prisma.usuarioPermissaoIndividual.findUnique(
    {
      where: {
        tenantId_usuarioId_modulo_acao: {
          tenantId: session.user.tenantId,
          usuarioId: usuarioId,
          modulo: modulo,
          acao: acao,
        },
      },
    },
  );

  await prisma.usuarioPermissaoIndividual.upsert({
    where: {
      tenantId_usuarioId_modulo_acao: {
        tenantId: session.user.tenantId,
        usuarioId: usuarioId,
        modulo: modulo,
        acao: acao,
      },
    },
    update: {
      permitido: permitido,
      motivo: motivo,
    },
    create: {
      tenantId: session.user.tenantId,
      usuarioId: usuarioId,
      modulo: modulo,
      acao: acao,
      permitido: permitido,
      motivo: motivo,
    },
  });

  // Registrar no histórico
  await prisma.equipeHistorico.create({
    data: {
      tenantId: session.user.tenantId,
      usuarioId: usuarioId,
      acao: "permissao_alterada",
      dadosAntigos: { permissaoAnterior: `${modulo}.${acao}: N/A` },
      dadosNovos: {
        permissaoNova: `${modulo}.${acao}: ${permitido ? "PERMITIDO" : "NEGADO"}`,
      },
      motivo: motivo || `Permissão ${permitido ? "concedida" : "negada"}`,
      realizadoPor: session.user.id!,
    },
  });

  try {
    const targetUser = await prisma.usuario.findFirst({
      where: { id: usuarioId, tenantId: session.user.tenantId },
      select: { firstName: true, lastName: true, email: true },
    });

    const admins = await prisma.usuario.findMany({
      where: {
        tenantId: session.user.tenantId,
        active: true,
        role: {
          in: [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARIA],
        },
        id: {
          not: session.user.id,
        },
      },
      select: { id: true },
    });

    const recipients = new Set<string>();

    if (usuarioId !== session.user.id) {
      recipients.add(usuarioId);
    }

    admins.forEach(({ id }) => {
      if (id !== usuarioId) {
        recipients.add(id);
      }
    });

    if (recipients.size && targetUser) {
      const permissaoLabel = `${modulo}.${acao}`;
      const oldPermissions = existingPermission
        ? [
            `${permissaoLabel}: ${existingPermission.permitido ? "PERMITIDO" : "NEGADO"}`,
          ]
        : [];
      const newPermissions = [
        `${permissaoLabel}: ${permitido ? "PERMITIDO" : "NEGADO"}`,
      ];

      const targetUserName =
        `${targetUser.firstName ?? ""} ${targetUser.lastName ?? ""}`.trim() ||
        targetUser.email ||
        usuarioId;

      await Promise.all(
        Array.from(recipients).map((id) =>
          NotificationHelper.notifyEquipePermissionsChanged(
            session.user.tenantId!,
            id,
            {
              usuarioId,
              nome: targetUserName,
              permissoesAntigas: oldPermissions,
              permissoesNovas: newPermissions,
              alteradoPor: actorName,
            },
          ),
        ),
      );
    }
  } catch (error) {
    console.warn(
      "Falha ao emitir notificações de equipe.permissions_changed",
      error,
    );
  }

  revalidatePath("/equipe");
}

/**
 * Retorna o estado efetivo de todas as permissões para um usuário
 * Inclui origem: "override", "cargo" ou "role"
 */
export async function getPermissoesEfetivas(usuarioId: string): Promise<
  Array<{
    modulo: string;
    acao: string;
    permitido: boolean;
    origem: "override" | "cargo" | "role";
  }>
> {
  const session = await getSession();

  if (!session?.user?.tenantId) {
    throw new Error("Usuário não autenticado");
  }

  if (session.user.role !== UserRole.ADMIN) {
    throw new Error("Apenas administradores podem consultar permissões");
  }

  const usuario = await prisma.usuario.findFirst({
    where: {
      id: usuarioId,
      tenantId: session.user.tenantId,
    },
    include: {
      permissoesIndividuais: true,
      cargos: {
        where: { ativo: true },
        include: {
          cargo: {
            include: {
              permissoes: true,
            },
          },
        },
      },
    },
  });

  if (!usuario) {
    throw new Error("Usuário não encontrado");
  }

  // Buscar todos os módulos e ações disponíveis
  const tenantModules = await getTenantAccessibleModules(session.user.tenantId);

  const acoes = ["visualizar", "criar", "editar", "excluir", "exportar"];

  const permissoesEfetivas: Array<{
    modulo: string;
    acao: string;
    permitido: boolean;
    origem: "override" | "cargo" | "role";
  }> = [];

  // Buscar módulos disponíveis do tenant
  const modulos = await prisma.modulo.findMany({
    where: {
      slug: { in: tenantModules },
      ativo: true,
    },
    select: { slug: true },
  });

  const moduloSlugs = modulos.map((m) => m.slug);

  // Para cada módulo e ação, determinar a permissão efetiva
  for (const modulo of moduloSlugs) {
    for (const acao of acoes) {
      // 1. Verificar override individual
      const override = usuario.permissoesIndividuais.find(
        (p) => p.modulo === modulo && p.acao === acao,
      );

      if (override) {
        permissoesEfetivas.push({
          modulo,
          acao,
          permitido: override.permitido,
          origem: "override",
        });
        continue;
      }

      // 2. Verificar permissão do cargo
      const usuarioCargoAtivo = usuario.cargos.find((uc) => uc.ativo);

      if (usuarioCargoAtivo?.cargo) {
        const permissaoCargo = usuarioCargoAtivo.cargo.permissoes.find(
          (p) => p.modulo === modulo && p.acao === acao,
        );

        if (permissaoCargo) {
          permissoesEfetivas.push({
            modulo,
            acao,
            permitido: permissaoCargo.permitido,
            origem: "cargo",
          });
          continue;
        }
      }

      // 3. Verificar permissão padrão do role
      permissoesEfetivas.push({
        modulo,
        acao,
        permitido: resolveRolePermission(
          usuario.role as UserRole,
          modulo,
          acao,
        ),
        origem: "role",
      });
    }
  }

  return permissoesEfetivas;
}

// ===== DASHBOARD DE EQUIPE =====

export async function getDashboardEquipe(): Promise<{
  totalUsuarios: number;
  totalCargos: number;
  usuariosPorCargo: { cargo: string; count: number }[];
  vinculacoesAtivas: number;
  permissoesIndividuais: number;
  convitesPendentes: number;
}> {
  const session = await getSession();

  if (!session?.user?.tenantId) {
    throw new Error("Usuário não autenticado");
  }

  const [
    totalUsuarios,
    totalCargos,
    usuariosPorCargo,
    vinculacoesAtivas,
    permissoesIndividuais,
    convitesPendentes,
  ] = await Promise.all([
    prisma.usuario.count({
      where: {
        tenantId: session.user.tenantId,
        role: {
          notIn: [UserRole.CLIENTE, UserRole.ADVOGADO],
        },
        advogado: {
          is: null,
        },
      },
    }),
    prisma.cargo.count({
      where: { tenantId: session.user.tenantId, ativo: true },
    }),
    prisma.usuarioCargo.groupBy({
      by: ["cargoId"],
      where: {
        tenantId: session.user.tenantId,
        ativo: true,
      },
      _count: { cargoId: true },
    }),
    prisma.usuarioVinculacao.count({
      where: {
        tenantId: session.user.tenantId,
        ativo: true,
      },
    }),
    prisma.usuarioPermissaoIndividual.count({
      where: { tenantId: session.user.tenantId },
    }),
    prisma.equipeConvite.count({
      where: {
        tenantId: session.user.tenantId,
        status: "pendente",
      },
    }),
  ]);

  // Buscar nomes dos cargos
  const cargos = await prisma.cargo.findMany({
    where: { tenantId: session.user.tenantId },
    select: { id: true, nome: true },
  });

  const usuariosPorCargoComNome = usuariosPorCargo.map((item) => {
    const cargo = cargos.find((c) => c.id === item.cargoId);

    return {
      cargo: cargo?.nome || "Cargo não encontrado",
      count: item._count.cargoId,
    };
  });

  return {
    totalUsuarios,
    totalCargos,
    usuariosPorCargo: usuariosPorCargoComNome,
    vinculacoesAtivas,
    permissoesIndividuais,
    convitesPendentes,
  };
}

// ===== MÓDULOS DO TENANT =====

export interface ModuloInfo {
  slug: string;
  nome: string;
  descricao?: string;
}

/**
 * Lista os módulos acessíveis para o tenant logado com detalhes completos
 * Reutiliza a lógica resiliente de getTenantAccessibleModules para garantir
 * fallbacks corretos e evitar duplicação de código
 */
export async function listModulosPorTenant(): Promise<ModuloInfo[]> {
  const session = await getSession();

  if (!session?.user?.tenantId) {
    throw new Error("Usuário não autenticado");
  }

  const tenantId = session.user.tenantId;

  // 1. Obter slugs de módulos acessíveis usando a lógica resiliente existente
  const moduleSlugs = await getTenantAccessibleModules(tenantId);

  if (moduleSlugs.length === 0) {
    return [];
  }

  // Módulos extras que devem existir mesmo que ainda não estejam cadastrados no backend
  const fallbackModules: Record<
    string,
    { nome: string; descricao?: string | null }
  > = {
    "portal-advogado": {
      nome: "Portal do Advogado",
      descricao: "Acesso a portais de tribunais, recessos e comunicados",
    },
  };

  // 2. Buscar detalhes completos dos módulos a partir dos slugs
  const modulos = await prisma.modulo.findMany({
    where: {
      slug: {
        in: moduleSlugs,
      },
      ativo: true,
    },
    select: {
      slug: true,
      nome: true,
      descricao: true,
      ordem: true,
    },
    orderBy: { ordem: "asc" },
  });

  // 3. Ordenar manualmente de acordo com a ordem de moduleSlugs (fallback)
  const moduleMap = new Map(modulos.map((m) => [m.slug, m]));

  // Incluir módulos de fallback que ainda não existam na base
  moduleSlugs.forEach((slug) => {
    if (!moduleMap.has(slug) && fallbackModules[slug]) {
      moduleMap.set(slug, {
        slug,
        nome: fallbackModules[slug].nome,
        descricao: fallbackModules[slug].descricao ?? null,
        ordem: 999,
      });
    }
  });

  const orderedModulos = moduleSlugs
    .map((slug) => moduleMap.get(slug))
    .filter((m): m is NonNullable<typeof m> => m !== undefined);

  // 4. Retornar no formato esperado
  return orderedModulos.map((m) => ({
    slug: m.slug,
    nome: m.nome,
    descricao: m.descricao || undefined,
  }));
}

/**
 * Atualiza dados de um usuário da equipe do tenant
 */
export async function updateUsuarioEquipe(
  usuarioId: string,
  data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    active?: boolean;
    cpf?: string | null;
    rg?: string | null;
    dataNascimento?: Date | null;
    observacoes?: string | null;
    role?: UserRole;
    avatarUrl?: string | null;
  },
): Promise<UsuarioEquipeData> {
  const session = await getSession();

  if (!session?.user?.tenantId) {
    throw new Error("Usuário não autenticado");
  }

  if (session.user.role !== UserRole.ADMIN) {
    throw new Error("Apenas administradores podem editar usuários");
  }

  // Verificar se o usuário existe e pertence ao tenant
  const usuario = await prisma.usuario.findFirst({
    where: {
      id: usuarioId,
      tenantId: session.user.tenantId,
    },
  });

  if (!usuario) {
    throw new Error("Usuário não encontrado");
  }

  // Construir updateData apenas com campos definidos
  const updateData: Record<string, unknown> = {};

  if (data.firstName !== undefined && data.firstName !== usuario.firstName) {
    updateData.firstName = data.firstName;
  }

  if (data.lastName !== undefined && data.lastName !== usuario.lastName) {
    updateData.lastName = data.lastName;
  }

  // Validar email único se está sendo alterado
  if (data.email !== undefined && data.email !== usuario.email) {
    const existingUser = await prisma.usuario.findFirst({
      where: {
        email: data.email,
        tenantId: session.user.tenantId,
        id: { not: usuarioId },
      },
    });

    if (existingUser) {
      throw new Error("Este email já está em uso por outro usuário");
    }

    updateData.email = data.email;
  }

  if (data.phone !== undefined && data.phone !== usuario.phone) {
    updateData.phone = data.phone;
  }

  if (data.active !== undefined && data.active !== usuario.active) {
    updateData.active = data.active;
  }

  // Validar CPF único se está sendo alterado
  if (data.cpf !== undefined && data.cpf !== usuario.cpf) {
    if (data.cpf) {
      const existingUser = await prisma.usuario.findFirst({
        where: {
          cpf: data.cpf,
          tenantId: session.user.tenantId,
          id: { not: usuarioId },
        },
      });

      if (existingUser) {
        throw new Error("Este CPF já está em uso por outro usuário");
      }
    }
    updateData.cpf = data.cpf;
  }

  if (data.rg !== undefined && data.rg !== usuario.rg) {
    updateData.rg = data.rg;
  }

  if (data.dataNascimento !== undefined) {
    updateData.dataNascimento = data.dataNascimento;
  }

  if (
    data.observacoes !== undefined &&
    data.observacoes !== usuario.observacoes
  ) {
    updateData.observacoes = data.observacoes;
  }

  // Validar role - apenas ADMIN pode alterar role
  if (data.role !== undefined && data.role !== usuario.role) {
    const allowedRoles = new Set<UserRole>([
      UserRole.ADMIN,
      UserRole.SECRETARIA,
      UserRole.FINANCEIRO,
    ]);

    if (!allowedRoles.has(data.role)) {
      throw new Error(
        "Role inválido para equipe. Para ADVOGADO, utilize o módulo de Advogados.",
      );
    }

    // Não permitir alterar para SUPER_ADMIN ou alterar de SUPER_ADMIN
    if (
      data.role === UserRole.SUPER_ADMIN ||
      usuario.role === UserRole.SUPER_ADMIN
    ) {
      throw new Error("Não é possível alterar role para/de SUPER_ADMIN");
    }

    if (usuario.role === UserRole.ADVOGADO && data.role !== UserRole.ADVOGADO) {
      const advogadoPerfil = await prisma.advogado.findFirst({
        where: {
          tenantId: session.user.tenantId,
          usuarioId,
        },
        select: { id: true },
      });

      if (advogadoPerfil) {
        throw new Error(
          "Este usuário possui perfil de advogado. Altere o tipo pelo módulo de Advogados.",
        );
      }
    }

    updateData.role = data.role;
  }

  if (data.avatarUrl !== undefined && data.avatarUrl !== usuario.avatarUrl) {
    updateData.avatarUrl = data.avatarUrl;
  }

  // Só atualizar se houver mudanças
  if (Object.keys(updateData).length > 0) {
    await prisma.usuario.update({
      where: { id: usuarioId },
      data: updateData,
    });

    // Registrar no histórico
    await prisma.equipeHistorico.create({
      data: {
        tenantId: session.user.tenantId,
        usuarioId: usuarioId,
        acao: "dados_alterados",
        dadosAntigos: {
          firstName: usuario.firstName,
          lastName: usuario.lastName,
          email: usuario.email,
          phone: usuario.phone,
          active: usuario.active,
          cpf: usuario.cpf,
          rg: usuario.rg,
          dataNascimento: usuario.dataNascimento,
          observacoes: usuario.observacoes,
          role: usuario.role,
          avatarUrl: usuario.avatarUrl,
        } as Prisma.InputJsonValue,
        dadosNovos: updateData as unknown as Prisma.InputJsonValue,
        motivo: "Dados do usuário atualizados pelo admin",
        realizadoPor: session.user.id!,
      },
    });
  }

  revalidatePath("/equipe");

  // Retornar usuário atualizado
  const usuarios = await getUsuariosEquipe();

  const updatedUser = usuarios.find((u) => u.id === usuarioId);

  if (!updatedUser) {
    throw new Error("Erro ao recuperar usuário atualizado");
  }

  // Publicar evento realtime
  publishRealtimeEvent("usuario-update", {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    payload: {
      usuarioId: updatedUser.id,
      action: "updated",
      usuario: {
        id: updatedUser.id,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        active: updatedUser.active,
      },
      changedBy: session.user.id!,
    },
  }).catch((error) => {
    console.error("[realtime] Falha ao publicar evento usuario-update", error);
  });

  return updatedUser;
}

// ===== VERIFICAÇÃO DE PERMISSÕES (OTIMIZADAS) =====

/**
 * Verifica uma permissão específica para o usuário atual ou um usuário específico.
 * Usa a precedência: override individual → cargo → role padrão
 *
 * @param modulo - Slug do módulo (ex: 'processos', 'clientes')
 * @param acao - Ação desejada (ex: 'criar', 'editar', 'visualizar')
 * @param usuarioId - ID do usuário a verificar (opcional, usa o usuário da sessão por padrão)
 * @returns true se o usuário tem permissão, false caso contrário
 */
export async function checkPermission(
  modulo: string,
  acao: string,
  usuarioId?: string,
): Promise<boolean> {
  return verificarPermissao(modulo, acao, usuarioId);
}

/**
 * Verifica múltiplas permissões de uma vez, otimizado para evitar N round-trips.
 * Retorna um mapa com as permissões verificadas: { "modulo.acao": boolean }
 *
 * @param requests - Array de objetos com módulo e ação a verificar
 * @param usuarioId - ID do usuário a verificar (opcional, usa o usuário da sessão por padrão)
 * @returns Mapa de permissões no formato { "modulo.acao": boolean }
 */
export async function checkPermissions(
  requests: Array<{ modulo: string; acao: string }>,
  usuarioId?: string,
): Promise<Record<string, boolean>> {
  const session = await getSession();

  if (!session?.user?.tenantId) {
    // Retornar todas como false se não autenticado
    return requests.reduce(
      (acc, { modulo, acao }) => {
        acc[`${modulo}.${acao}`] = false;

        return acc;
      },
      {} as Record<string, boolean>,
    );
  }

  const targetUsuarioId = usuarioId || session.user.id!;

  // Se for verificar permissões de outro usuário, só ADMIN pode
  if (usuarioId && usuarioId !== session.user.id) {
    if (session.user.role !== UserRole.ADMIN) {
      throw new Error(
        "Apenas administradores podem consultar permissões de outros usuários",
      );
    }
  }

  // Se for ADMIN, tem todas as permissões
  if (
    session.user.role === UserRole.ADMIN ||
    session.user.role === UserRole.SUPER_ADMIN
  ) {
    return requests.reduce(
      (acc, { modulo, acao }) => {
        acc[`${modulo}.${acao}`] = true;

        return acc;
      },
      {} as Record<string, boolean>,
    );
  }

  // Buscar usuário com permissões individuais e cargo
  const usuario = await prisma.usuario.findFirst({
    where: {
      id: targetUsuarioId,
      tenantId: session.user.tenantId,
    },
    include: {
      permissoesIndividuais: true,
      cargos: {
        where: { ativo: true },
        include: {
          cargo: {
            include: {
              permissoes: true,
            },
          },
        },
      },
    },
  });

  if (!usuario) {
    // Retornar todas como false se usuário não encontrado
    return requests.reduce(
      (acc, { modulo, acao }) => {
        acc[`${modulo}.${acao}`] = false;

        return acc;
      },
      {} as Record<string, boolean>,
    );
  }

  const results: Record<string, boolean> = {};

  // Verificar cada permissão solicitada
  for (const { modulo, acao } of requests) {
    const key = `${modulo}.${acao}`;

    // 1. Verificar override individual
    const override = usuario.permissoesIndividuais.find(
      (p) => p.modulo === modulo && p.acao === acao,
    );

    if (override) {
      results[key] = override.permitido;
      continue;
    }

    // 2. Verificar permissão do cargo
    const usuarioCargoAtivo = usuario.cargos.find((uc) => uc.ativo);

    if (usuarioCargoAtivo?.cargo) {
      const permissaoCargo = usuarioCargoAtivo.cargo.permissoes.find(
        (p) => p.modulo === modulo && p.acao === acao,
      );

      if (permissaoCargo) {
        results[key] = permissaoCargo.permitido;
        continue;
      }
    }

    // 3. Verificar permissão padrão do role
    results[key] = resolveRolePermission(
      usuario.role as UserRole,
      modulo,
      acao,
    );
  }

  return results;
}

// ===== HISTÓRICO DE EQUIPE =====

export interface EquipeHistoricoData {
  id: string;
  usuarioId: string;
  acao: string;
  dadosAntigos: any;
  dadosNovos: any;
  motivo?: string | null;
  realizadoPor: string;
  createdAt: Date;
  realizadoPorUsuario?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email: string;
  };
}

export async function getEquipeHistorico(
  usuarioId: string,
): Promise<EquipeHistoricoData[]> {
  const session = await getSession();

  if (!session?.user?.tenantId) {
    throw new Error("Usuário não autenticado");
  }

  const historico = await prisma.equipeHistorico.findMany({
    where: {
      tenantId: session.user.tenantId,
      usuarioId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  // Buscar informações dos usuários que realizaram as ações
  const realizadoPorIds = Array.from(
    new Set(historico.map((h) => h.realizadoPor)),
  );
  const usuariosRealizadores = await prisma.usuario.findMany({
    where: {
      id: { in: realizadoPorIds },
      tenantId: session.user.tenantId,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  });

  const usuariosMap = new Map<
    string,
    {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
    }
  >(usuariosRealizadores.map((u) => [u.id, u]));

  return historico.map((h) => {
    const usuarioRealizador = usuariosMap.get(h.realizadoPor);

    return {
      id: h.id,
      usuarioId: h.usuarioId,
      acao: h.acao,
      dadosAntigos: h.dadosAntigos,
      dadosNovos: h.dadosNovos,
      motivo: h.motivo || undefined,
      realizadoPor: h.realizadoPor,
      createdAt: h.createdAt,
      realizadoPorUsuario: usuarioRealizador
        ? {
            id: usuarioRealizador.id,
            firstName: usuarioRealizador.firstName || undefined,
            lastName: usuarioRealizador.lastName || undefined,
            email: usuarioRealizador.email,
          }
        : undefined,
    };
  });
}

// Upload de avatar para usuário da equipe
export async function uploadAvatarUsuarioEquipe(
  usuarioId: string,
  formData: FormData,
): Promise<{ success: boolean; avatarUrl?: string; error?: string }> {
  try {
    const session = await getSession();

    if (!session?.user?.tenantId) {
      return { success: false, error: "Usuário não autenticado" };
    }

    if (session.user.role !== UserRole.ADMIN) {
      return {
        success: false,
        error: "Apenas administradores podem alterar avatares",
      };
    }

    const usuario = await prisma.usuario.findFirst({
      where: {
        id: usuarioId,
        tenantId: session.user.tenantId,
      },
    });

    if (!usuario) {
      return { success: false, error: "Usuário não encontrado" };
    }

    const file = formData.get("file") as File;
    const url = formData.get("url") as string;

    let avatarUrl: string;

    if (url) {
      try {
        new URL(url);
        if (!/\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(url)) {
          return {
            success: false,
            error: "URL deve apontar para uma imagem válida",
          };
        }
        avatarUrl = url;
      } catch {
        return { success: false, error: "URL inválida" };
      }
    } else if (file) {
      const allowedTypes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
      ];

      if (!allowedTypes.includes(file.type)) {
        return {
          success: false,
          error: "Tipo de arquivo não permitido. Use JPG, PNG ou WebP.",
        };
      }

      const maxSize = 5 * 1024 * 1024; // 5MB

      if (file.size > maxSize) {
        return { success: false, error: "Arquivo muito grande. Máximo 5MB." };
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const { UploadService } = await import("@/lib/upload-service");
      const uploadService = UploadService.getInstance();
      const tenant = await prisma.tenant.findUnique({
        where: { id: session.user.tenantId },
        select: { slug: true },
      });

      const userName =
        `${usuario.firstName || ""} ${usuario.lastName || ""}`.trim() ||
        usuario.email;
      const result = await uploadService.uploadAvatar(
        buffer,
        usuario.id,
        file.name,
        tenant?.slug ?? undefined,
        userName,
      );

      if (!result.success || !result.url) {
        return { success: false, error: result.error || "Erro no upload" };
      }

      avatarUrl = result.url;
    } else {
      return { success: false, error: "Nenhum arquivo ou URL fornecido" };
    }

    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { avatarUrl },
    });

    revalidatePath("/equipe");

    return { success: true, avatarUrl };
  } catch (error) {
    logger.error("Erro no upload do avatar:", error);

    return { success: false, error: "Erro ao fazer upload do avatar" };
  }
}
