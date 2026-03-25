"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";

import prisma from "@/app/lib/prisma";
import { authOptions } from "@/auth";
import {
  createPacoteCheckout,
  processPacoteCreditCardPayment,
  confirmPacotePaymentInDevelopment,
  getPacoteInvoiceSnapshot,
  listRecentPacoteSubscriptionsForAdmin,
  listTenantPacoteSubscriptions,
  listTenantPacotesCatalog,
} from "@/app/lib/pacotes-juiz-commerce";
import logger from "@/lib/logger";

// ==================== TIPOS ====================

export type PacoteJuiz = {
  id: string;
  nome: string;
  descricao?: string | null;
  preco: number;
  moeda: string;
  duracaoDias?: number | null;
  limiteUsuarios?: number | null;
  limiteConsultas?: number | null;
  isPublico: boolean;
  status: "ATIVO" | "INATIVO" | "PROMOCIONAL";
  ordemExibicao: number;
  cor: string;
  icone?: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: {
    juizes: number;
    assinaturas: number;
  };
};

export type PacoteJuizItem = {
  id: string;
  pacoteId: string;
  juizId: string;
  ordemExibicao: number;
  createdAt: Date;
  juiz?: {
    id: string;
    nome: string;
    nomeCompleto?: string | null;
    comarca?: string | null;
    vara?: string | null;
    especialidades: string[];
  };
};

export type AssinaturaPacoteJuiz = {
  id: string;
  tenantId: string;
  pacoteId: string;
  status: string;
  dataInicio: Date;
  dataFim?: Date | null;
  renovacaoAutomatica: boolean;
  precoPago: number;
  formaPagamento?: string | null;
  observacoes?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type GetPacotesJuizResponse = {
  success: boolean;
  data?: PacoteJuiz[];
  error?: string;
};

export type GetPacoteJuizResponse = {
  success: boolean;
  data?: PacoteJuiz & {
    juizes: PacoteJuizItem[];
    assinaturas: AssinaturaPacoteJuiz[];
  };
  error?: string;
};

export type CreatePacoteJuizResponse = {
  success: boolean;
  data?: PacoteJuiz;
  error?: string;
};

export type UpdatePacoteJuizResponse = {
  success: boolean;
  data?: PacoteJuiz;
  error?: string;
};

export type DeletePacoteJuizResponse = {
  success: boolean;
  error?: string;
};

export type PacoteCheckoutPayment = {
  asaasPaymentId: string | null;
  billingType: "PIX" | "BOLETO" | "CREDIT_CARD" | null;
  status: string;
  value: number;
  dueDate: string | null;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  transactionReceiptUrl: string | null;
  pixCopyPaste: string | null;
  pixQrCodeUrl: string | null;
  isMock: boolean;
};

export type TenantPacoteCatalogItem = PacoteJuiz & {
  autoridadePreview: Array<{
    id: string;
    nome: string;
    tipoAutoridade: string;
    comarca: string | null;
    vara: string | null;
    especialidades: string[];
  }>;
  assinaturaAtual: {
    id: string;
    status: string;
    dataInicio: Date;
    dataFim: Date | null;
    formaPagamento: string | null;
    precoPago: number;
    renovacaoAutomatica: boolean;
    payment: PacoteCheckoutPayment | null;
  } | null;
};

export type TenantPacoteSubscriptionItem = {
  id: string;
  status: string;
  dataInicio: Date;
  dataFim: Date | null;
  renovacaoAutomatica: boolean;
  precoPago: number;
  formaPagamento: string | null;
  pacote: {
    id: string;
    nome: string;
    descricao: string | null;
    cor: string;
    icone: string | null;
    duracaoDias: number | null;
    autoridadeCount: number;
  };
  payment: PacoteCheckoutPayment;
};

export type PacoteCheckoutResponse = {
  success: boolean;
  data?: {
    checkoutId: string;
    pacoteId: string;
    status: string;
    payment: PacoteCheckoutPayment;
  };
  error?: string;
};

export type PacoteCheckoutStatusResponse = {
  success: boolean;
  data?: {
    checkoutId: string;
    status: string;
    payment: PacoteCheckoutPayment;
  };
  error?: string;
};

export type TenantPacoteCatalogResponse = {
  success: boolean;
  data?: TenantPacoteCatalogItem[];
  error?: string;
};

export type TenantPacoteSubscriptionsResponse = {
  success: boolean;
  data?: TenantPacoteSubscriptionItem[];
  error?: string;
};

export type RecentPacoteSubscriptionAdminItem = {
  id: string;
  status: string;
  dataInicio: Date;
  dataFim: Date | null;
  precoPago: number;
  formaPagamento: string | null;
  createdAt: Date;
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  pacote: {
    id: string;
    nome: string;
  };
};

export type RecentPacoteSubscriptionsAdminResponse = {
  success: boolean;
  data?: RecentPacoteSubscriptionAdminItem[];
  error?: string;
};

// ==================== FUNÇÕES AUXILIARES ====================

async function ensureSuperAdmin() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Não autenticado");
  }

  const userRole = (session.user as any)?.role;

  if (userRole !== "SUPER_ADMIN") {
    throw new Error(
      "Acesso negado. Apenas Super Admins podem gerenciar pacotes de juízes.",
    );
  }

  return session.user.id;
}

async function ensureTenantAuthenticated() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Não autenticado");
  }

  const user = session.user as any;

  if (!user.tenantId) {
    throw new Error("Tenant não encontrado");
  }

  if (user.role === "SUPER_ADMIN") {
    throw new Error("Fluxo disponível apenas dentro do tenant");
  }

  return {
    session,
    user,
    tenantId: user.tenantId as string,
  };
}

// ==================== CRUD PACOTES DE JUÍZES ====================

export async function getPacotesJuiz(): Promise<GetPacotesJuizResponse> {
  try {
    await ensureSuperAdmin();

    const pacotes = await prisma.pacoteJuiz.findMany({
      include: {
        _count: {
          select: {
            juizes: {
              where: {
                ativo: true,
              },
            },
            assinaturas: true,
          },
        },
      },
      orderBy: [{ ordemExibicao: "asc" }, { nome: "asc" }],
    });

    return {
      success: true,
      data: pacotes.map((pacote) => ({
        ...pacote,
        preco: Number(pacote.preco),
      })),
    };
  } catch (error) {
    logger.error("Erro ao buscar pacotes de juízes:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

export async function getPacoteJuizById(
  id: string,
): Promise<GetPacoteJuizResponse> {
  try {
    await ensureSuperAdmin();

    const pacote = await prisma.pacoteJuiz.findUnique({
      where: { id },
      include: {
        juizes: {
          where: {
            ativo: true,
          },
          include: {
            juiz: {
              select: {
                id: true,
                nome: true,
                nomeCompleto: true,
                comarca: true,
                vara: true,
                especialidades: true,
              },
            },
          },
          orderBy: {
            ordemExibicao: "asc",
          },
        },
        assinaturas: {
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

    if (!pacote) {
      return {
        success: false,
        error: "Pacote de juízes não encontrado",
      };
    }

    return {
      success: true,
      data: {
        ...pacote,
        preco: Number(pacote.preco),
        juizes: pacote.juizes,
        assinaturas: pacote.assinaturas.map((assinatura) => ({
          ...assinatura,
          precoPago: Number(assinatura.precoPago),
        })),
      },
    };
  } catch (error) {
    logger.error("Erro ao buscar pacote de juízes:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

export async function createPacoteJuiz(
  data: Partial<PacoteJuiz>,
): Promise<CreatePacoteJuizResponse> {
  try {
    const superAdminId = await ensureSuperAdmin();

    // Validar dados obrigatórios
    if (!data.nome || !data.preco) {
      return {
        success: false,
        error: "Nome e preço são obrigatórios",
      };
    }

    const pacote = await prisma.pacoteJuiz.create({
      data: {
        nome: data.nome,
        descricao: data.descricao,
        preco: data.preco,
        moeda: data.moeda || "BRL",
        duracaoDias: data.duracaoDias,
        limiteUsuarios: data.limiteUsuarios,
        limiteConsultas: data.limiteConsultas,
        isPublico: data.isPublico ?? true,
        status: data.status || "ATIVO",
        ordemExibicao: data.ordemExibicao || 0,
        cor: data.cor || "primary",
        icone: data.icone,
        superAdminId,
      },
    });

    return {
      success: true,
      data: {
        ...pacote,
        preco: Number(pacote.preco),
      },
    };
  } catch (error) {
    logger.error("Erro ao criar pacote de juízes:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

export async function updatePacoteJuiz(
  id: string,
  data: Partial<PacoteJuiz>,
): Promise<UpdatePacoteJuizResponse> {
  try {
    await ensureSuperAdmin();

    // Verificar se o pacote existe
    const pacoteExistente = await prisma.pacoteJuiz.findUnique({
      where: { id },
    });

    if (!pacoteExistente) {
      return {
        success: false,
        error: "Pacote de juízes não encontrado",
      };
    }

    const pacote = await prisma.pacoteJuiz.update({
      where: { id },
      data: {
        nome: data.nome,
        descricao: data.descricao,
        preco: data.preco,
        moeda: data.moeda,
        duracaoDias: data.duracaoDias,
        limiteUsuarios: data.limiteUsuarios,
        limiteConsultas: data.limiteConsultas,
        isPublico: data.isPublico,
        status: data.status,
        ordemExibicao: data.ordemExibicao,
        cor: data.cor,
        icone: data.icone,
        updatedAt: new Date(),
      },
    });

    return {
      success: true,
      data: {
        ...pacote,
        preco: Number(pacote.preco),
      },
    };
  } catch (error) {
    logger.error("Erro ao atualizar pacote de juízes:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

export async function deletePacoteJuiz(
  id: string,
): Promise<DeletePacoteJuizResponse> {
  try {
    await ensureSuperAdmin();

    // Verificar se o pacote existe
    const pacoteExistente = await prisma.pacoteJuiz.findUnique({
      where: { id },
      include: {
        assinaturas: true,
      },
    });

    if (!pacoteExistente) {
      return {
        success: false,
        error: "Pacote de juízes não encontrado",
      };
    }

    // Verificar se há assinaturas ativas
    const assinaturasAtivas = pacoteExistente.assinaturas.filter(
      (assinatura) => assinatura.status === "ATIVA",
    );

    if (assinaturasAtivas.length > 0) {
      return {
        success: false,
        error: `Não é possível deletar o pacote. Existem ${assinaturasAtivas.length} assinatura(s) ativa(s).`,
      };
    }

    await prisma.pacoteJuiz.update({
      where: { id },
      data: {
        status: "INATIVO",
      },
    });

    return {
      success: true,
    };
  } catch (error) {
    logger.error("Erro ao deletar pacote de juízes:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

// ==================== GERENCIAMENTO DE JUÍZES NO PACOTE ====================

export async function adicionarJuizAoPacote(
  pacoteId: string,
  juizId: string,
  ordemExibicao?: number,
) {
  try {
    await ensureSuperAdmin();

    const item = await prisma.pacoteJuizItem.upsert({
      where: {
        pacoteId_juizId: {
          pacoteId,
          juizId,
        },
      },
      update: {
        ativo: true,
        ordemExibicao: ordemExibicao || 0,
      },
      create: {
        pacoteId,
        juizId,
        ordemExibicao: ordemExibicao || 0,
        ativo: true,
      },
    });

    return {
      success: true,
      data: item,
    };
  } catch (error) {
    logger.error("Erro ao adicionar juiz ao pacote:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

export async function removerJuizDoPacote(pacoteId: string, juizId: string) {
  try {
    await ensureSuperAdmin();

    await prisma.pacoteJuizItem.updateMany({
      where: {
        pacoteId,
        juizId,
        ativo: true,
      },
      data: {
        ativo: false,
      },
    });

    return {
      success: true,
    };
  } catch (error) {
    logger.error("Erro ao remover juiz do pacote:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

// ==================== FUNÇÕES DE ANÁLISE ====================

export async function getEstatisticasPacotesJuiz() {
  try {
    await ensureSuperAdmin();

    const [
      totalPacotes,
      pacotesAtivos,
      totalAssinaturas,
      assinaturasAtivas,
      faturamentoMensal,
    ] = await Promise.all([
      prisma.pacoteJuiz.count(),
      prisma.pacoteJuiz.count({ where: { status: "ATIVO" } }),
      prisma.assinaturaPacoteJuiz.count(),
      prisma.assinaturaPacoteJuiz.count({ where: { status: "ATIVA" } }),
      prisma.assinaturaPacoteJuiz.aggregate({
        where: {
          status: "ATIVA",
          dataInicio: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
        _sum: {
          precoPago: true,
        },
      }),
    ]);

    return {
      success: true,
      data: {
        totalPacotes,
        pacotesAtivos,
        totalAssinaturas,
        assinaturasAtivas,
        faturamentoMensal: Number(faturamentoMensal._sum.precoPago || 0),
      },
    };
  } catch (error) {
    logger.error("Erro ao buscar estatísticas de pacotes de juízes:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

export async function getAssinaturasPacotesJuizRecentesAdmin(): Promise<RecentPacoteSubscriptionsAdminResponse> {
  try {
    await ensureSuperAdmin();

    const assinaturas = await listRecentPacoteSubscriptionsForAdmin();

    return {
      success: true,
      data: assinaturas,
    };
  } catch (error) {
    logger.error("Erro ao buscar assinaturas recentes de pacotes:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

export async function getCatalogoPacotesJuizTenant(): Promise<TenantPacoteCatalogResponse> {
  try {
    const { tenantId } = await ensureTenantAuthenticated();
    const catalogo = await listTenantPacotesCatalog(tenantId);

    return {
      success: true,
      data: catalogo,
    };
  } catch (error) {
    logger.error("Erro ao buscar catálogo do tenant para pacotes:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

export async function getAssinaturasPacoteJuizTenant(): Promise<TenantPacoteSubscriptionsResponse> {
  try {
    const { tenantId } = await ensureTenantAuthenticated();
    const assinaturas = await listTenantPacoteSubscriptions(tenantId);

    return {
      success: true,
      data: assinaturas,
    };
  } catch (error) {
    logger.error("Erro ao buscar assinaturas de pacote do tenant:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro interno do servidor",
    };
  }
}

export async function iniciarCheckoutPacoteJuiz(input: {
  pacoteId: string;
  billingType: "PIX" | "BOLETO" | "CREDIT_CARD";
}): Promise<PacoteCheckoutResponse> {
  try {
    const { tenantId } = await ensureTenantAuthenticated();

    if (!input.pacoteId) {
      return { success: false, error: "Pacote não informado" };
    }

    const checkout = await createPacoteCheckout({
      tenantId,
      pacoteId: input.pacoteId,
      billingType: input.billingType,
    });

    revalidatePath("/juizes");
    revalidatePath("/juizes/pacotes");
    revalidatePath("/configuracoes");
    revalidatePath("/configuracoes/billing");

    return {
      success: true,
      data: {
        checkoutId: checkout.assinatura.id,
        pacoteId: input.pacoteId,
        status: checkout.assinatura.status,
        payment: checkout.payment,
      },
    };
  } catch (error) {
    logger.error("Erro ao iniciar checkout do pacote:", error);

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro ao iniciar checkout",
    };
  }
}

export async function processarPagamentoCartaoPacoteJuiz(input: {
  checkoutId: string;
  paymentData: {
    cardNumber: string;
    cardName: string;
    expiryMonth: string;
    expiryYear: string;
    cvv: string;
  };
}): Promise<PacoteCheckoutStatusResponse> {
  try {
    const { tenantId } = await ensureTenantAuthenticated();

    if (!input.checkoutId) {
      return { success: false, error: "Checkout não informado" };
    }

    const result = await processPacoteCreditCardPayment({
      tenantId,
      assinaturaId: input.checkoutId,
      paymentData: input.paymentData,
    });

    revalidatePath("/juizes");
    revalidatePath("/juizes/pacotes");
    revalidatePath("/configuracoes");
    revalidatePath("/configuracoes/billing");

    return {
      success: true,
      data: {
        checkoutId: result.assinaturaId,
        status: result.status,
        payment: result.payment,
      },
    };
  } catch (error) {
    logger.error("Erro ao processar pagamento de pacote no cartão:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao processar pagamento do pacote",
    };
  }
}

export async function getStatusCheckoutPacoteJuiz(
  checkoutId: string,
): Promise<PacoteCheckoutStatusResponse> {
  try {
    const { tenantId } = await ensureTenantAuthenticated();

    if (!checkoutId) {
      return { success: false, error: "Checkout não informado" };
    }

    const assinatura = await prisma.assinaturaPacoteJuiz.findFirst({
      where: {
        id: checkoutId,
        tenantId,
      },
      select: {
        id: true,
        status: true,
        precoPago: true,
        formaPagamento: true,
      },
    });

    if (!assinatura) {
      return { success: false, error: "Checkout do pacote não encontrado" };
    }

    const payment = await getPacoteInvoiceSnapshot(tenantId, assinatura.id, {
      billingType: assinatura.formaPagamento,
      value: Number(assinatura.precoPago),
      status: assinatura.status,
    });

    return {
      success: true,
      data: {
        checkoutId: assinatura.id,
        status: assinatura.status,
        payment,
      },
    };
  } catch (error) {
    logger.error("Erro ao consultar status do checkout do pacote:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao consultar checkout do pacote",
    };
  }
}

export async function simularPagamentoPacoteJuizDev(
  checkoutId: string,
): Promise<PacoteCheckoutStatusResponse> {
  try {
    const { tenantId } = await ensureTenantAuthenticated();

    if (!checkoutId) {
      return { success: false, error: "Checkout não informado" };
    }

    const result = await confirmPacotePaymentInDevelopment({
      tenantId,
      assinaturaId: checkoutId,
    });

    revalidatePath("/juizes");
    revalidatePath("/juizes/pacotes");
    revalidatePath("/admin/pacotes");
    revalidatePath("/configuracoes");
    revalidatePath("/configuracoes/billing");

    return {
      success: true,
      data: {
        checkoutId: result.assinaturaId,
        status: result.status,
        payment: result.payment,
      },
    };
  } catch (error) {
    logger.error("Erro ao simular pagamento do pacote:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao simular pagamento do pacote",
    };
  }
}
