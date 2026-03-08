"use server";

import { revalidatePath } from "next/cache";

import prisma from "@/app/lib/prisma";
import { getSession } from "@/app/lib/auth";

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

async function getTenantId(): Promise<string> {
  const session = await getSession();

  if (!session?.user?.tenantId) {
    throw new Error("Usuário não autenticado ou tenant não encontrado");
  }

  return session.user.tenantId;
}

function normalizeTipoNome(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function sanitizeNomeTipo(nome: string) {
  return nome.replace(/\s+/g, " ").trim();
}

// ============================================
// LISTAR TIPOS DE PETIÇÃO
// ============================================

export async function listTiposPeticao() {
  try {
    const tenantId = await getTenantId();

    const [tiposGlobais, tiposTenant] = await Promise.all([
      prisma.tipoPeticao.findMany({
        where: {
          tenantId: null,
          global: true,
          ativo: true,
          deletedAt: null,
        },
        orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      }),
      prisma.tipoPeticao.findMany({
        where: {
          tenantId,
          global: false,
          deletedAt: null,
        },
        orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      }),
    ]);

    const tenantPorNome = new Map<string, (typeof tiposTenant)[number]>();
    for (const tipo of tiposTenant) {
      tenantPorNome.set(normalizeTipoNome(tipo.nome), tipo);
    }

    const nomesGlobais = new Set<string>();
    const efetivos: typeof tiposGlobais = [];

    for (const tipoGlobal of tiposGlobais) {
      const nomeNormalizado = normalizeTipoNome(tipoGlobal.nome);
      nomesGlobais.add(nomeNormalizado);

      const override = tenantPorNome.get(nomeNormalizado);
      if (!override) {
        efetivos.push(tipoGlobal);
        continue;
      }

      if (!override.ativo) {
        continue;
      }

      efetivos.push({
        ...tipoGlobal,
        id: override.id,
        tenantId: override.tenantId,
        nome: override.nome,
        descricao: override.descricao ?? tipoGlobal.descricao,
        categoria: override.categoria ?? tipoGlobal.categoria,
        ordem: override.ordem ?? tipoGlobal.ordem,
        global: false,
        ativo: true,
        createdAt: override.createdAt,
        updatedAt: override.updatedAt,
        deletedAt: override.deletedAt,
      });
    }

    for (const tipoTenant of tiposTenant) {
      if (!tipoTenant.ativo) continue;
      if (nomesGlobais.has(normalizeTipoNome(tipoTenant.nome))) continue;
      efetivos.push(tipoTenant);
    }

    efetivos.sort((a, b) => {
      if ((a.ordem ?? 0) !== (b.ordem ?? 0)) {
        return (a.ordem ?? 0) - (b.ordem ?? 0);
      }
      return a.nome.localeCompare(b.nome, "pt-BR");
    });

    return {
      success: true,
      data: efetivos,
    };
  } catch (error) {
    console.error("Erro ao listar tipos de petição:", error);

    return {
      success: false,
      error: "Erro ao listar tipos de petição",
      data: [],
    };
  }
}

// ============================================
// LISTAR CONFIGURAÇÕES DE TIPOS DO TENANT (ATIVOS E INATIVOS)
// ============================================

export async function listTiposPeticaoConfiguracaoTenant() {
  try {
    const tenantId = await getTenantId();

    const tipos = await prisma.tipoPeticao.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    });

    return {
      success: true,
      data: tipos,
    };
  } catch (error) {
    console.error("Erro ao listar configurações de tipos do tenant:", error);

    return {
      success: false,
      error: "Erro ao listar configurações do tenant",
      data: [],
    };
  }
}

// ============================================
// CRIAR TIPO DE PETIÇÃO
// ============================================

export async function createTipoPeticao(data: {
  nome: string;
  descricao?: string;
  categoria?: string;
  ordem?: number;
}) {
  try {
    const tenantId = await getTenantId();
    const nomeNormalizadoInput = sanitizeNomeTipo(data.nome);

    if (!nomeNormalizadoInput) {
      return {
        success: false,
        error: "Nome do tipo é obrigatório",
      };
    }

    // Não permitir criar customizado com mesmo nome de tipo global
    const tiposGlobais = await prisma.tipoPeticao.findMany({
      where: {
        tenantId: null,
        global: true,
        deletedAt: null,
      },
      select: { nome: true },
    });
    const nomeConflitaComGlobal = tiposGlobais.some(
      (tipo) =>
        normalizeTipoNome(tipo.nome) === normalizeTipoNome(nomeNormalizadoInput),
    );

    if (nomeConflitaComGlobal) {
      return {
        success: false,
        error:
          "Este nome já existe como tipo global. Gerencie a ativação na aba de tipos globais.",
      };
    }

    // Verificar se já existe um tipo com o mesmo nome
    const existente = await prisma.tipoPeticao.findUnique({
      where: {
        tenantId_nome: {
          tenantId,
          nome: nomeNormalizadoInput,
        },
      },
    });

    if (existente) {
      return {
        success: false,
        error: "Já existe um tipo de petição com este nome",
      };
    }

    // Criar tipo CUSTOMIZADO do tenant (com tenantId)
    const tipo = await prisma.tipoPeticao.create({
      data: {
        tenantId, // ← Sempre preenchido para tipos customizados
        nome: nomeNormalizadoInput,
        descricao: data.descricao,
        categoria: data.categoria,
        ordem: data.ordem || 1000, // Ordem alta para aparecer depois dos globais
        global: false, // ← Sempre false para tipos customizados
        ativo: true,
      },
    });

    revalidatePath("/configuracoes/tipos-peticao");
    revalidatePath("/peticoes");

    return {
      success: true,
      data: tipo,
      message: "Tipo de petição criado com sucesso",
    };
  } catch (error) {
    console.error("Erro ao criar tipo de petição:", error);

    return {
      success: false,
      error: "Erro ao criar tipo de petição",
    };
  }
}

// ============================================
// ATUALIZAR TIPO DE PETIÇÃO
// ============================================

export async function updateTipoPeticao(
  id: string,
  data: {
    nome?: string;
    descricao?: string;
    categoria?: string;
    ordem?: number;
    ativo?: boolean;
  },
) {
  try {
    const tenantId = await getTenantId();

    // Verificar se o tipo existe e pertence ao tenant
    const tipoExistente = await prisma.tipoPeticao.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!tipoExistente) {
      return {
        success: false,
        error: "Tipo de petição não encontrado",
      };
    }

    // Se está mudando o nome, verificar se já existe outro com o mesmo nome
    if (data.nome && sanitizeNomeTipo(data.nome) !== tipoExistente.nome) {
      const novoNome = sanitizeNomeTipo(data.nome);

      const tiposGlobais = await prisma.tipoPeticao.findMany({
        where: {
          tenantId: null,
          global: true,
          deletedAt: null,
        },
        select: { nome: true },
      });
      const nomeConflitaComGlobal = tiposGlobais.some(
        (tipo) => normalizeTipoNome(tipo.nome) === normalizeTipoNome(novoNome),
      );
      if (nomeConflitaComGlobal) {
        return {
          success: false,
          error:
            "Este nome já existe como tipo global. Use outro nome para o tipo customizado.",
        };
      }

      const outroComMesmoNome = await prisma.tipoPeticao.findUnique({
        where: {
          tenantId_nome: {
            tenantId,
            nome: novoNome,
          },
        },
      });

      if (outroComMesmoNome) {
        return {
          success: false,
          error: "Já existe um tipo de petição com este nome",
        };
      }
    }

    const tipo = await prisma.tipoPeticao.update({
      where: { id },
      data: {
        nome: data.nome ? sanitizeNomeTipo(data.nome) : undefined,
        descricao: data.descricao,
        categoria: data.categoria,
        ordem: data.ordem,
        ativo: data.ativo,
      },
    });

    revalidatePath("/configuracoes/tipos-peticao");
    revalidatePath("/peticoes");

    return {
      success: true,
      data: tipo,
      message: "Tipo de petição atualizado com sucesso",
    };
  } catch (error) {
    console.error("Erro ao atualizar tipo de petição:", error);

    return {
      success: false,
      error: "Erro ao atualizar tipo de petição",
    };
  }
}

// ============================================
// DELETAR TIPO DE PETIÇÃO (SOFT DELETE)
// ============================================

export async function deleteTipoPeticao(id: string) {
  try {
    const tenantId = await getTenantId();

    // Verificar se o tipo existe e pertence ao tenant
    const tipo = await prisma.tipoPeticao.findFirst({
      where: {
        id,
        tenantId, // Só pode deletar tipos do próprio tenant
      },
    });

    if (!tipo) {
      return {
        success: false,
        error: "Tipo de petição não encontrado ou não pertence ao seu tenant",
      };
    }

    // Não permitir deletar tipos globais
    if (tipo.global || tipo.tenantId === null) {
      return {
        success: false,
        error: "Não é possível deletar tipos globais do sistema",
      };
    }

    // Soft delete
    await prisma.tipoPeticao.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        ativo: false,
      },
    });

    revalidatePath("/configuracoes/tipos-peticao");
    revalidatePath("/peticoes");

    return {
      success: true,
      message: "Tipo de petição removido com sucesso",
    };
  } catch (error) {
    console.error("Erro ao deletar tipo de petição:", error);

    return {
      success: false,
      error: "Erro ao deletar tipo de petição",
    };
  }
}

// ============================================
// OBTER TIPO DE PETIÇÃO POR ID
// ============================================

export async function getTipoPeticao(id: string) {
  try {
    const tenantId = await getTenantId();

    const tipo = await prisma.tipoPeticao.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
    });

    if (!tipo) {
      return {
        success: false,
        error: "Tipo de petição não encontrado",
      };
    }

    return {
      success: true,
      data: tipo,
    };
  } catch (error) {
    console.error("Erro ao buscar tipo de petição:", error);

    return {
      success: false,
      error: "Erro ao buscar tipo de petição",
    };
  }
}

// ============================================
// LISTAR CATEGORIAS DISPONÍVEIS
// ============================================

export async function getCategoriasTipoPeticao() {
  return {
    success: true,
    data: [
      { value: "INICIAL", label: "Inicial" },
      { value: "RESPOSTA", label: "Resposta" },
      { value: "RECURSO", label: "Recurso" },
      { value: "EXECUCAO", label: "Execução" },
      { value: "URGENTE", label: "Urgente" },
      { value: "PROCEDIMENTO", label: "Procedimento" },
      { value: "OUTROS", label: "Outros" },
    ],
  };
}

// ============================================
// ADICIONAR TIPOS GLOBAIS (APENAS ADMIN)
// ============================================
// Esta função cria tipos GLOBAIS (tenantId = null)
// Disponíveis para TODOS os tenants

export async function addTiposGlobais() {
  try {
    const tiposPadrao = [
      // INICIAL
      { nome: "Petição Inicial", categoria: "INICIAL", ordem: 1 },
      { nome: "Mandado de Segurança", categoria: "INICIAL", ordem: 2 },
      { nome: "Habeas Corpus", categoria: "INICIAL", ordem: 3 },
      { nome: "Ação Cautelar", categoria: "INICIAL", ordem: 4 },

      // RESPOSTA
      { nome: "Contestação", categoria: "RESPOSTA", ordem: 10 },
      { nome: "Réplica", categoria: "RESPOSTA", ordem: 11 },
      { nome: "Reconvenção", categoria: "RESPOSTA", ordem: 12 },
      { nome: "Impugnação", categoria: "RESPOSTA", ordem: 13 },

      // RECURSO
      { nome: "Recurso de Apelação", categoria: "RECURSO", ordem: 20 },
      { nome: "Recurso Especial", categoria: "RECURSO", ordem: 21 },
      { nome: "Recurso Extraordinário", categoria: "RECURSO", ordem: 22 },
      { nome: "Agravo de Instrumento", categoria: "RECURSO", ordem: 23 },
      { nome: "Embargos de Declaração", categoria: "RECURSO", ordem: 24 },

      // EXECUCAO
      { nome: "Cumprimento de Sentença", categoria: "EXECUCAO", ordem: 30 },
      {
        nome: "Execução de Título Extrajudicial",
        categoria: "EXECUCAO",
        ordem: 31,
      },
      { nome: "Embargos à Execução", categoria: "EXECUCAO", ordem: 32 },
      {
        nome: "Exceção de Pré-executividade",
        categoria: "EXECUCAO",
        ordem: 33,
      },

      // URGENTE
      { nome: "Tutela Antecipada", categoria: "URGENTE", ordem: 40 },
      { nome: "Pedido de Liminar", categoria: "URGENTE", ordem: 41 },
      { nome: "Tutela Cautelar", categoria: "URGENTE", ordem: 42 },

      // PROCEDIMENTO
      { nome: "Manifestação", categoria: "PROCEDIMENTO", ordem: 50 },
      { nome: "Memorial", categoria: "PROCEDIMENTO", ordem: 51 },
      { nome: "Alegações Finais", categoria: "PROCEDIMENTO", ordem: 52 },
      { nome: "Contrarrazões", categoria: "PROCEDIMENTO", ordem: 53 },

      // OUTROS
      { nome: "Aditamento", categoria: "OUTROS", ordem: 60 },
      { nome: "Desistência", categoria: "OUTROS", ordem: 61 },
      { nome: "Renúncia", categoria: "OUTROS", ordem: 62 },
      { nome: "Acordo/Transação", categoria: "OUTROS", ordem: 63 },
      { nome: "Outros", categoria: "OUTROS", ordem: 99 },
    ];

    let criados = 0;
    let existentes = 0;

    for (const tipo of tiposPadrao) {
      const tipoExistente = await prisma.tipoPeticao.findFirst({
        where: {
          tenantId: null,
          nome: tipo.nome,
        },
      });

      if (!tipoExistente) {
        await prisma.tipoPeticao.create({
          data: {
            tenantId: null, // ← NULL = global
            nome: tipo.nome,
            categoria: tipo.categoria,
            ordem: tipo.ordem,
            global: true,
            ativo: true,
          },
        });
        criados++;
      } else {
        existentes++;
      }
    }

    return {
      success: true,
      message: `Tipos globais: ${criados} criados, ${existentes} já existentes`,
      criados,
      existentes,
    };
  } catch (error) {
    console.error("Erro ao adicionar tipos globais:", error);

    return { success: false, error: "Erro ao adicionar tipos globais" };
  }
}

// ============================================
// CONFIGURAR TIPOS GLOBAIS PARA O TENANT
// ============================================
// Permite o tenant escolher quais tipos globais quer usar

export async function configurarTiposGlobaisTenant(
  tipoGlobalId: string,
  ativo: boolean,
) {
  try {
    const tenantId = await getTenantId();

    // Verificar se o tipo global existe
    const tipoGlobal = await prisma.tipoPeticao.findFirst({
      where: {
        id: tipoGlobalId,
        tenantId: null,
        global: true,
      },
    });

    if (!tipoGlobal) {
      return {
        success: false,
        error: "Tipo global não encontrado",
      };
    }

    // Criar ou atualizar configuração específica do tenant
    // Registro do tenant funciona como override de ativação e metadados do global.
    await prisma.tipoPeticao.upsert({
      where: {
        tenantId_nome: {
          tenantId,
          nome: tipoGlobal.nome,
        },
      },
      create: {
        tenantId,
        nome: tipoGlobal.nome,
        descricao: tipoGlobal.descricao,
        categoria: tipoGlobal.categoria,
        ordem: tipoGlobal.ordem,
        global: false, // ← Configuração do tenant
        ativo,
      },
      update: {
        ativo,
      },
    });

    revalidatePath("/configuracoes/tipos-peticao");
    revalidatePath("/peticoes");

    return {
      success: true,
      message: `Tipo "${tipoGlobal.nome}" ${ativo ? "ativado" : "desativado"} para seu tenant`,
    };
  } catch (error) {
    console.error("Erro ao configurar tipo global:", error);

    return {
      success: false,
      error: "Erro ao configurar tipo global",
    };
  }
}

// ============================================
// LISTAR TIPOS GLOBAIS DISPONÍVEIS
// ============================================

export async function listarTiposGlobais() {
  try {
    const tiposGlobais = await prisma.tipoPeticao.findMany({
      where: {
        tenantId: null,
        global: true,
        ativo: true,
        deletedAt: null,
      },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    });

    return {
      success: true,
      data: tiposGlobais,
    };
  } catch (error) {
    console.error("Erro ao listar tipos globais:", error);

    return {
      success: false,
      error: "Erro ao listar tipos globais",
      data: [],
    };
  }
}
