"use server";

import { getSession } from "@/app/lib/auth";
import prisma from "@/app/lib/prisma";
import { logAudit, toAuditJson } from "@/app/lib/audit/log";
import logger from "@/lib/logger";

export interface BoardCreatePayload {
  nome: string;
  descricao?: string | null;
  tipo?: "PESSOAL" | "EQUIPE" | "PROJETO" | "PROCESSO" | "CLIENTE";
  icone?: string | null;
  cor?: string | null;
  visibilidade?: "PRIVADO" | "EQUIPE" | "PUBLICO";
  criarColunasDefault?: boolean; // Se true, cria colunas padrão
}

export interface BoardUpdatePayload {
  nome?: string;
  descricao?: string | null;
  tipo?: "PESSOAL" | "EQUIPE" | "PROJETO" | "PROCESSO" | "CLIENTE";
  icone?: string | null;
  cor?: string | null;
  favorito?: boolean;
  visibilidade?: "PRIVADO" | "EQUIPE" | "PUBLICO";
  ordem?: number;
  ativo?: boolean;
}

// Colunas padrão para novos boards
const COLUNAS_DEFAULT = [
  { nome: "A Fazer", cor: "#6B7280", ordem: 0 },
  { nome: "Em Andamento", cor: "#3B82F6", ordem: 1 },
  { nome: "Revisão", cor: "#F59E0B", ordem: 2 },
  { nome: "Concluído", cor: "#10B981", ordem: 3 },
];

export async function listBoards(params?: { tipo?: string; ativo?: boolean }) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const where: any = {
      tenantId: user.tenantId,
    };

    if (params?.tipo) {
      where.tipo = params.tipo;
    }

    if (params?.ativo !== undefined) {
      where.ativo = params.ativo;
    }

    const boards = await prisma.board.findMany({
      where,
      include: {
        _count: {
          select: {
            colunas: true,
            tarefas: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
      },
      orderBy: [{ favorito: "desc" }, { ordem: "asc" }, { nome: "asc" }],
    });

    return { success: true, boards };
  } catch (error) {
    logger.error("Erro ao listar boards:", error);

    return { success: false, error: "Erro ao listar boards" };
  }
}

export async function getBoard(id: string) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    const board = await prisma.board.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
      },
      include: {
        colunas: {
          orderBy: { ordem: "asc" },
          include: {
            _count: {
              select: {
                tarefas: {
                  where: {
                    deletedAt: null,
                  },
                },
              },
            },
          },
        },
        _count: {
          select: {
            tarefas: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
      },
    });

    if (!board) {
      return { success: false, error: "Board não encontrado" };
    }

    return { success: true, board };
  } catch (error) {
    logger.error("Erro ao buscar board:", error);

    return { success: false, error: "Erro ao buscar board" };
  }
}

export async function createBoard(data: BoardCreatePayload) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    // Validações
    if (!data.nome?.trim()) {
      return { success: false, error: "Nome é obrigatório" };
    }

    // Criar board
    const board = await prisma.board.create({
      data: {
        nome: data.nome.trim(),
        descricao: data.descricao?.trim(),
        tipo: data.tipo || "EQUIPE",
        icone: data.icone,
        cor: data.cor,
        visibilidade: data.visibilidade || "EQUIPE",
        tenantId: user.tenantId,
      },
    });

    // Criar colunas padrão se solicitado
    if (data.criarColunasDefault !== false) {
      await prisma.boardColumn.createMany({
        data: COLUNAS_DEFAULT.map((col) => ({
          ...col,
          boardId: board.id,
          tenantId: user.tenantId,
        })),
      });
    }

    logger.info(`Board criado: ${board.id} por usuário ${user.email}`);

    try {
      await logAudit({
        tenantId: user.tenantId,
        usuarioId: user.id,
        acao: "board.create",
        entidade: "Board",
        entidadeId: board.id,
        dados: toAuditJson({
          id: board.id,
          nome: board.nome,
          descricao: board.descricao,
          tipo: board.tipo,
          visibilidade: board.visibilidade,
          ativo: board.ativo,
        }),
      });
    } catch (auditError) {
      logger.warn("Falha ao registrar auditoria de criação de board", auditError);
    }

    // Retornar com colunas
    const boardCompleto = await prisma.board.findUnique({
      where: { id: board.id },
      include: {
        colunas: {
          orderBy: { ordem: "asc" },
        },
      },
    });

    return { success: true, board: boardCompleto };
  } catch (error) {
    logger.error("Erro ao criar board:", error);

    return { success: false, error: "Erro ao criar board" };
  }
}

export async function updateBoard(id: string, data: BoardUpdatePayload) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    // Verificar se o board existe e pertence ao tenant
    const boardExistente = await prisma.board.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
      },
    });

    if (!boardExistente) {
      return { success: false, error: "Board não encontrado" };
    }

    const updateData: any = {};

    if (data.nome !== undefined) {
      const nome = data.nome.trim();

      if (!nome) {
        return { success: false, error: "Nome é obrigatório" };
      }

      updateData.nome = nome;
    }
    if (data.descricao !== undefined)
      updateData.descricao = data.descricao?.trim();
    if (data.tipo !== undefined) updateData.tipo = data.tipo;
    if (data.icone !== undefined) updateData.icone = data.icone;
    if (data.cor !== undefined) updateData.cor = data.cor;
    if (data.favorito !== undefined) updateData.favorito = data.favorito;
    if (data.visibilidade !== undefined)
      updateData.visibilidade = data.visibilidade;
    if (data.ordem !== undefined) updateData.ordem = data.ordem;
    if (data.ativo !== undefined) updateData.ativo = data.ativo;

    if (Object.keys(updateData).length === 0) {
      const boardAtual = await prisma.board.findUnique({
        where: { id },
        include: {
          colunas: {
            orderBy: { ordem: "asc" },
          },
        },
      });

      return { success: true, board: boardAtual };
    }

    const board = await prisma.board.update({
      where: { id },
      data: updateData,
      include: {
        colunas: {
          orderBy: { ordem: "asc" },
        },
      },
    });

    logger.info(`Board atualizado: ${id} por usuário ${user.email}`);

    try {
      await logAudit({
        tenantId: user.tenantId,
        usuarioId: user.id,
        acao: "board.update",
        entidade: "Board",
        entidadeId: id,
        changedFields: Object.keys(updateData),
        previousValues: toAuditJson({
          nome: boardExistente.nome,
          descricao: boardExistente.descricao,
          tipo: boardExistente.tipo,
          icone: boardExistente.icone,
          cor: boardExistente.cor,
          favorito: boardExistente.favorito,
          visibilidade: boardExistente.visibilidade,
          ordem: boardExistente.ordem,
          ativo: boardExistente.ativo,
        }),
        dados: toAuditJson({
          nome: board.nome,
          descricao: board.descricao,
          tipo: board.tipo,
          icone: board.icone,
          cor: board.cor,
          favorito: board.favorito,
          visibilidade: board.visibilidade,
          ordem: board.ordem,
          ativo: board.ativo,
        }),
      });
    } catch (auditError) {
      logger.warn(
        "Falha ao registrar auditoria de atualização de board",
        auditError,
      );
    }

    return { success: true, board };
  } catch (error) {
    logger.error("Erro ao atualizar board:", error);

    return { success: false, error: "Erro ao atualizar board" };
  }
}

export async function deleteBoard(id: string) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    // Verificar se o board existe e pertence ao tenant
    const board = await prisma.board.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
      },
      include: {
        _count: {
          select: {
            tarefas: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
      },
    });

    if (!board) {
      return { success: false, error: "Board não encontrado" };
    }

    // Verificar se há tarefas
    if (board._count.tarefas > 0) {
      return {
        success: false,
        error: `Não é possível excluir. Existem ${board._count.tarefas} tarefa(s) neste board. Arquive-as primeiro.`,
      };
    }

    // Deletar colunas e board
    await prisma.$transaction([
      prisma.boardColumn.deleteMany({
        where: { boardId: id },
      }),
      prisma.board.delete({
        where: { id },
      }),
    ]);

    logger.info(`Board deletado: ${id} por usuário ${user.email}`);

    try {
      await logAudit({
        tenantId: user.tenantId,
        usuarioId: user.id,
        acao: "board.delete",
        entidade: "Board",
        entidadeId: id,
        previousValues: toAuditJson({
          nome: board.nome,
          descricao: board.descricao,
          tipo: board.tipo,
          ativo: board.ativo,
          tarefas: board._count.tarefas,
        }),
      });
    } catch (auditError) {
      logger.warn("Falha ao registrar auditoria de exclusão de board", auditError);
    }

    return { success: true };
  } catch (error) {
    logger.error("Erro ao deletar board:", error);

    return { success: false, error: "Erro ao deletar board" };
  }
}

export async function duplicateBoard(id: string, novoNome: string) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    // Buscar board original
    const boardOriginal = await prisma.board.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
      },
      include: {
        colunas: {
          orderBy: { ordem: "asc" },
        },
      },
    });

    if (!boardOriginal) {
      return { success: false, error: "Board não encontrado" };
    }

    // Criar novo board
    const novoBoard = await prisma.board.create({
      data: {
        nome: novoNome.trim(),
        descricao: boardOriginal.descricao,
        tipo: boardOriginal.tipo,
        icone: boardOriginal.icone,
        cor: boardOriginal.cor,
        visibilidade: boardOriginal.visibilidade,
        tenantId: user.tenantId,
      },
    });

    // Duplicar colunas
    if (boardOriginal.colunas.length > 0) {
      await prisma.boardColumn.createMany({
        data: boardOriginal.colunas.map((col) => ({
          nome: col.nome,
          cor: col.cor,
          ordem: col.ordem,
          limite: col.limite,
          boardId: novoBoard.id,
          tenantId: user.tenantId,
        })),
      });
    }

    logger.info(
      `Board duplicado: ${id} → ${novoBoard.id} por usuário ${user.email}`,
    );

    try {
      await logAudit({
        tenantId: user.tenantId,
        usuarioId: user.id,
        acao: "board.duplicate",
        entidade: "Board",
        entidadeId: novoBoard.id,
        dados: toAuditJson({
          origemBoardId: id,
          novoBoardId: novoBoard.id,
          nome: novoBoard.nome,
          colunasDuplicadas: boardOriginal.colunas.length,
        }),
      });
    } catch (auditError) {
      logger.warn("Falha ao registrar auditoria de duplicação de board", auditError);
    }

    // Retornar com colunas
    const boardCompleto = await prisma.board.findUnique({
      where: { id: novoBoard.id },
      include: {
        colunas: {
          orderBy: { ordem: "asc" },
        },
      },
    });

    return { success: true, board: boardCompleto };
  } catch (error) {
    logger.error("Erro ao duplicar board:", error);

    return { success: false, error: "Erro ao duplicar board" };
  }
}

export async function getBoardsResumidos() {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const boards = await prisma.board.findMany({
      where: {
        tenantId: user.tenantId,
        ativo: true,
      },
      select: {
        id: true,
        nome: true,
        tipo: true,
        icone: true,
        cor: true,
        favorito: true,
      },
      orderBy: [{ favorito: "desc" }, { ordem: "asc" }, { nome: "asc" }],
    });

    return { success: true, boards };
  } catch (error) {
    logger.error("Erro ao listar boards resumidos:", error);

    return { success: false, error: "Erro ao listar boards" };
  }
}

export async function criarBoardPadrao() {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    // Verificar se já existe algum board
    const boardsExistentes = await prisma.board.count({
      where: { tenantId: user.tenantId },
    });

    if (boardsExistentes > 0) {
      return { success: false, error: "Já existem boards criados" };
    }

    // Criar board padrão
    const board = await prisma.board.create({
      data: {
        nome: "Quadro Principal",
        descricao: "Quadro padrão para gerenciar tarefas da equipe",
        tipo: "EQUIPE",
        visibilidade: "EQUIPE",
        tenantId: user.tenantId,
      },
    });

    // Criar colunas padrão
    await prisma.boardColumn.createMany({
      data: COLUNAS_DEFAULT.map((col) => ({
        ...col,
        boardId: board.id,
        tenantId: user.tenantId,
      })),
    });

    logger.info(`Board padrão criado para tenant ${user.tenantId}`);

    try {
      await logAudit({
        tenantId: user.tenantId,
        usuarioId: user.id,
        acao: "board.create_default",
        entidade: "Board",
        entidadeId: board.id,
        dados: toAuditJson({
          id: board.id,
          nome: board.nome,
          tipo: board.tipo,
          colunasCriadas: COLUNAS_DEFAULT.map((coluna) => coluna.nome),
        }),
      });
    } catch (auditError) {
      logger.warn(
        "Falha ao registrar auditoria de criação de board padrão",
        auditError,
      );
    }

    // Retornar com colunas
    const boardCompleto = await prisma.board.findUnique({
      where: { id: board.id },
      include: {
        colunas: {
          orderBy: { ordem: "asc" },
        },
      },
    });

    return { success: true, board: boardCompleto };
  } catch (error) {
    logger.error("Erro ao criar board padrão:", error);

    return { success: false, error: "Erro ao criar board padrão" };
  }
}

export async function getBoardHistorico(boardId: string, limit = 8) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return { success: false, error: "Não autorizado" };
    }

    const user = session.user as any;

    if (!user.tenantId) {
      return { success: false, error: "Tenant não encontrado" };
    }

    const board = await prisma.board.findFirst({
      where: {
        id: boardId,
        tenantId: user.tenantId,
      },
      select: {
        id: true,
      },
    });

    if (!board) {
      return { success: false, error: "Lista de trabalho não encontrada" };
    }

    const historico = await prisma.auditLog.findMany({
      where: {
        tenantId: user.tenantId,
        entidade: "Board",
        entidadeId: boardId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: Math.max(1, Math.min(limit, 30)),
      include: {
        usuario: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    return { success: true, historico };
  } catch (error) {
    logger.error("Erro ao carregar histórico da lista de trabalho:", error);

    return { success: false, error: "Erro ao carregar histórico" };
  }
}
