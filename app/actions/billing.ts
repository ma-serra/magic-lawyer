"use server";

import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import prisma, { convertAllDecimalFields } from "@/app/lib/prisma";
import { PACOTE_BILLING_CONTEXT } from "@/app/lib/pacotes-juiz-commerce";
import { createAsaasClientFromEncrypted, type AsaasPayment } from "@/lib/asaas";
import { InvoiceStatus, Prisma } from "@/generated/prisma";

export interface BillingFiltros {
  status?: string;
  search?: string;
  pagina?: number;
  itensPorPagina?: number;
}

export interface BillingFaturaItem {
  id: string;
  numero: string;
  descricao: string | null;
  valor: number;
  moeda: string;
  status: string;
  vencimento: Date | null;
  pagoEm: Date | null;
  externalInvoiceId: string | null;
  urlBoleto: string | null;
  urlCobranca: string | null;
  urlComprovante: string | null;
  linhaDigitavel: string | null;
  metodoPagamento: string | null;
  metodoPagamentoLabel: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BillingResumo {
  totalFaturas: number;
  totalPago: number;
  totalAberto: number;
  totalVencido: number;
  valorTotal: number;
  valorPago: number;
  valorAberto: number;
  valorVencido: number;
}

export interface BillingAssinatura {
  id: string;
  status: string;
  plano: string | null;
  dataInicio: Date | null;
  renovaEm: Date | null;
  trialEndsAt: Date | null;
  metodoCobranca: string | null;
  metodoCobrancaLabel: string;
  detalheMetodo: string | null;
  ultimaSincronizacao: Date | null;
}

const BILLING_SYNC_MIN_INTERVAL_MS = 60 * 1000;
const BILLING_SYNC_PAGE_SIZE = 100;
const BILLING_SYNC_MAX_PAGES = 20;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function toNumberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function normalizePaymentMethod(value: unknown): string | null {
  const method = asString(value)?.toUpperCase();

  if (!method) return null;

  if (method === "BOLETO") return "BOLETO";
  if (method === "PIX") return "PIX";
  if (method === "CREDIT_CARD" || method === "CARTAO") return "CREDIT_CARD";

  return method;
}

function paymentMethodLabel(method: string | null): string {
  switch (method) {
    case "BOLETO":
      return "Boleto";
    case "PIX":
      return "PIX";
    case "CREDIT_CARD":
      return "Cartão de crédito";
    default:
      return "Não informado";
  }
}

function mapAsaasStatusToInvoiceStatus(status: unknown): InvoiceStatus {
  const normalized = asString(status)?.toUpperCase();

  switch (normalized) {
    case "RECEIVED":
    case "CONFIRMED":
    case "RECEIVED_IN_CASH":
      return InvoiceStatus.PAGA;
    case "OVERDUE":
      return InvoiceStatus.VENCIDA;
    case "PENDING":
    case "PROCESSING":
      return InvoiceStatus.ABERTA;
    case "REFUNDED":
    case "CHARGED_BACK":
    case "FAILED":
    case "CANCELED":
    case "CANCELLED":
      return InvoiceStatus.CANCELADA;
    default:
      return InvoiceStatus.RASCUNHO;
  }
}

function extractLast4(value: unknown): string | null {
  const str = asString(value);
  if (!str) return null;

  const digits = str.replace(/\D/g, "");
  if (digits.length < 4) return null;

  return digits.slice(-4);
}

function extractCardSummary(metadata: unknown): string | null {
  const data = asRecord(metadata);

  const directSummary =
    asString(data.cardSummary) ??
    asString(asRecord(data.card).summary) ??
    asString(asRecord(data.creditCard).summary);
  if (directSummary) return directSummary;

  const brand =
    asString(data.cardBrand) ??
    asString(asRecord(data.card).brand) ??
    asString(asRecord(data.creditCard).brand);
  const last4 =
    extractLast4(data.cardLast4) ??
    extractLast4(asRecord(data.card).last4) ??
    extractLast4(asRecord(data.creditCard).last4) ??
    extractLast4(asRecord(data.creditCard).number);

  if (!last4) return null;

  return brand ? `${brand} • final ${last4}` : `Final ${last4}`;
}

function mergeSubscriptionMetadata(
  current: unknown,
  patch: Record<string, unknown>,
): Prisma.InputJsonValue {
  const base = asRecord(current);
  const baseSync = asRecord(base.billingSync);
  const patchSync = asRecord(patch.billingSync);

  const merged: Record<string, unknown> = {
    ...base,
    ...patch,
  };

  if (Object.keys(baseSync).length > 0 || Object.keys(patchSync).length > 0) {
    merged.billingSync = {
      ...baseSync,
      ...patchSync,
    };
  }

  return merged as Prisma.InputJsonValue;
}

async function syncSubscriptionBillingFromAsaas(params: {
  tenantId: string;
  assinaturaId: string;
  asaasCustomerId: string | null;
  asaasSubscriptionId: string;
  metadata: unknown;
  asaasApiKeyEncrypted: string;
  asaasAmbiente: "SANDBOX" | "PRODUCAO";
}) {
  const metadata = asRecord(params.metadata);
  const lastSyncAt = toDate(asRecord(metadata.billingSync).lastSyncedAt);

  if (
    lastSyncAt &&
    Date.now() - lastSyncAt.getTime() < BILLING_SYNC_MIN_INTERVAL_MS
  ) {
    return;
  }

  const asaasClient = createAsaasClientFromEncrypted(
    params.asaasApiKeyEncrypted,
    params.asaasAmbiente.toLowerCase() as "sandbox" | "production",
  );

  let subscriptionData: Record<string, unknown> | null = null;
  try {
    const raw = (await asaasClient.getSubscription(
      params.asaasSubscriptionId,
    )) as unknown;
    subscriptionData = asRecord(raw);
  } catch (error) {
    console.error(
      "[billing] Falha ao buscar assinatura no Asaas durante sync:",
      error,
    );
  }

  const allPayments: AsaasPayment[] = [];
  let offset = 0;

  try {
    for (let page = 0; page < BILLING_SYNC_MAX_PAGES; page += 1) {
      const response = await asaasClient.listPayments({
        subscription: params.asaasSubscriptionId,
        offset,
        limit: BILLING_SYNC_PAGE_SIZE,
      });

      const pagePayments = response.data || [];
      allPayments.push(...pagePayments);

      if (!response.hasMore || pagePayments.length === 0) {
        break;
      }

      offset += BILLING_SYNC_PAGE_SIZE;
    }
  } catch (subscriptionSearchError) {
    if (!params.asaasCustomerId) {
      throw subscriptionSearchError;
    }

    for (let page = 0; page < BILLING_SYNC_MAX_PAGES; page += 1) {
      const response = await asaasClient.listPayments({
        customer: params.asaasCustomerId,
        offset,
        limit: BILLING_SYNC_PAGE_SIZE,
      });

      const pagePayments = (response.data || []).filter(
        (payment) =>
          asString(payment.subscription) === params.asaasSubscriptionId,
      );

      allPayments.push(...pagePayments);

      if (!response.hasMore || (response.data || []).length === 0) {
        break;
      }

      offset += BILLING_SYNC_PAGE_SIZE;
    }
  }

  const existingFaturas = await prisma.fatura.findMany({
    where: {
      tenantId: params.tenantId,
      subscriptionId: params.assinaturaId,
      externalInvoiceId: { in: allPayments.map((payment) => payment.id || "") },
    },
    select: {
      id: true,
      numero: true,
      descricao: true,
      externalInvoiceId: true,
      metadata: true,
    },
  });

  const byExternalId = new Map(
    existingFaturas
      .filter((item) => !!item.externalInvoiceId)
      .map((item) => [item.externalInvoiceId as string, item]),
  );

  for (const payment of allPayments) {
    const externalInvoiceId = asString(payment.id);
    if (!externalInvoiceId) continue;

    const current = byExternalId.get(externalInvoiceId);
    const currentMetadata = asRecord(current?.metadata);
    const paymentRaw = payment as unknown as Record<string, unknown>;
    const creditCard = asRecord(paymentRaw.creditCard);

    const cardLast4 =
      extractLast4(creditCard.number) ??
      extractLast4(paymentRaw.creditCardNumber) ??
      extractLast4(currentMetadata.cardLast4);
    const cardBrand =
      asString(creditCard.brand) ??
      asString(paymentRaw.creditCardBrand) ??
      asString(currentMetadata.cardBrand);

    const method = normalizePaymentMethod(
      payment.billingType ?? currentMetadata.paymentMethod,
    );
    const dueDate = toDate(payment.dueDate);
    const paidAt = toDate(payment.paymentDate) ?? toDate(payment.confirmedDate);
    const chargeUrl =
      asString(payment.bankSlipUrl) ??
      asString(payment.boletoUrl) ??
      asString(payment.invoiceUrl);

    const mergedInvoiceMetadata: Prisma.InputJsonValue = {
      ...currentMetadata,
      paymentMethod: method,
      paymentMethodLabel: paymentMethodLabel(method),
      asaasStatus: asString(payment.status),
      invoiceUrl: asString(payment.invoiceUrl),
      bankSlipUrl: asString(payment.bankSlipUrl) ?? asString(payment.boletoUrl),
      transactionReceiptUrl: asString(payment.transactionReceiptUrl),
      digitableLine: asString(payment.digitableLine),
      identificationField: asString(payment.identificationField),
      cardLast4,
      cardBrand,
      lastSyncedAt: new Date().toISOString(),
    };

    const faturaData = {
      tenantId: params.tenantId,
      subscriptionId: params.assinaturaId,
      contratoId: null,
      numero: current?.numero || `ASS-${externalInvoiceId}`,
      descricao:
        current?.descricao ||
        asString(payment.description) ||
        "Assinatura Magic Lawyer",
      valor: toNumberValue(payment.value),
      moeda: "BRL",
      status: mapAsaasStatusToInvoiceStatus(payment.status),
      vencimento: dueDate,
      pagoEm: paidAt,
      externalInvoiceId,
      urlBoleto: chargeUrl,
      metadata: mergedInvoiceMetadata,
    } satisfies Prisma.FaturaUncheckedCreateInput;

    if (current?.id) {
      await prisma.fatura.update({
        where: { id: current.id },
        data: faturaData,
      });
    } else {
      await prisma.fatura.create({
        data: faturaData,
      });
    }
  }

  const gatewayMethod = normalizePaymentMethod(subscriptionData?.billingType);
  const subscriptionCardSummary = extractCardSummary(metadata);
  const paymentCardSummary =
    allPayments
      .map((payment) => {
        const paymentMeta = asRecord({
          cardBrand: asString((payment as unknown as Record<string, unknown>).creditCardBrand),
          cardLast4: extractLast4(
            asRecord((payment as unknown as Record<string, unknown>).creditCard)
              .number,
          ),
        });

        return extractCardSummary(paymentMeta);
      })
      .find(Boolean) || null;

  const syncPatch: Record<string, unknown> = {
    billingType:
      gatewayMethod ??
      normalizePaymentMethod(metadata.billingType) ??
      normalizePaymentMethod(metadata.formaPagamento),
    cardSummary: subscriptionCardSummary ?? paymentCardSummary ?? null,
    billingSync: {
      lastSyncedAt: new Date().toISOString(),
      source: "asaas",
      totalPayments: allPayments.length,
      subscriptionStatus: asString(subscriptionData?.status),
      nextDueDate: asString(subscriptionData?.nextDueDate),
    },
  };

  await prisma.tenantSubscription.update({
    where: { id: params.assinaturaId },
    data: {
      renovaEm: toDate(subscriptionData?.nextDueDate),
      metadata: mergeSubscriptionMetadata(params.metadata, syncPatch),
      updatedAt: new Date(),
    },
  });
}

export async function getTenantBillingFaturas(
  filtros: BillingFiltros = {},
): Promise<{
  success: boolean;
  data?: {
    assinatura: BillingAssinatura | null;
    faturas: BillingFaturaItem[];
    total: number;
    totalPaginas: number;
    resumo: BillingResumo;
  };
  error?: string;
}> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.tenantId) {
      return { success: false, error: "Não autenticado" };
    }

    const role = (session.user as any)?.role as string | undefined;
    const canManageBilling =
      role === "ADMIN" || role === "SUPER_ADMIN" || role === "FINANCEIRO";

    if (!canManageBilling) {
      return {
        success: false,
        error: "Sem permissão para acessar o billing do escritório",
      };
    }

    const tenantId = session.user.tenantId;
    const pagina = filtros.pagina || 1;
    const itensPorPagina = filtros.itensPorPagina || 10;
    const skip = (pagina - 1) * itensPorPagina;

    const [assinaturaSyncBase, asaasConfig] = await Promise.all([
      prisma.tenantSubscription.findFirst({
        where: { tenantId },
        select: {
          id: true,
          metadata: true,
          asaasCustomerId: true,
          asaasSubscriptionId: true,
        },
      }),
      prisma.tenantAsaasConfig.findUnique({
        where: { tenantId },
        select: {
          asaasApiKey: true,
          ambiente: true,
          integracaoAtiva: true,
        },
      }),
    ]);

    if (
      assinaturaSyncBase?.id &&
      assinaturaSyncBase.asaasSubscriptionId &&
      asaasConfig?.integracaoAtiva
    ) {
      try {
        await syncSubscriptionBillingFromAsaas({
          tenantId,
          assinaturaId: assinaturaSyncBase.id,
          asaasCustomerId: assinaturaSyncBase.asaasCustomerId,
          asaasSubscriptionId: assinaturaSyncBase.asaasSubscriptionId,
          metadata: assinaturaSyncBase.metadata,
          asaasApiKeyEncrypted: asaasConfig.asaasApiKey,
          asaasAmbiente: asaasConfig.ambiente,
        });
      } catch (syncError) {
        console.error("[billing] Falha ao sincronizar faturas com Asaas:", syncError);
      }
    }

    const assinatura = await prisma.tenantSubscription.findFirst({
      where: { tenantId },
      select: {
        id: true,
        status: true,
        dataInicio: true,
        renovaEm: true,
        trialEndsAt: true,
        metadata: true,
        plano: { select: { nome: true } },
      },
    });

    const billingOrigins: Prisma.FaturaWhereInput[] = [];

    if (assinatura?.id) {
      billingOrigins.push({
        subscriptionId: assinatura.id,
      });
    }

    billingOrigins.push({
      metadata: {
        path: ["billingContext"],
        equals: PACOTE_BILLING_CONTEXT,
      },
    });

    const whereBase: Prisma.FaturaWhereInput = {
      tenantId,
      contratoId: null,
      OR: billingOrigins,
    };

    if (filtros.status) {
      whereBase.status = filtros.status as InvoiceStatus;
    }

    if (filtros.search?.trim()) {
      const term = filtros.search.trim();

      whereBase.OR = [
        { numero: { contains: term, mode: "insensitive" } },
        { descricao: { contains: term, mode: "insensitive" } },
        { externalInvoiceId: { contains: term, mode: "insensitive" } },
      ];
    }

    const [total, faturas, totalAgg, pagoAgg, abertoAgg, vencidoAgg] =
      await Promise.all([
        prisma.fatura.count({ where: whereBase }),
        prisma.fatura.findMany({
          where: whereBase,
          select: {
            id: true,
            numero: true,
            descricao: true,
            valor: true,
            moeda: true,
            status: true,
            vencimento: true,
            pagoEm: true,
            externalInvoiceId: true,
            urlBoleto: true,
            metadata: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: [{ vencimento: "desc" }, { createdAt: "desc" }],
          skip,
          take: itensPorPagina,
        }),
        prisma.fatura.aggregate({
          where: whereBase,
          _sum: { valor: true },
        }),
        prisma.fatura.aggregate({
          where: { ...whereBase, status: InvoiceStatus.PAGA },
          _sum: { valor: true },
          _count: { _all: true },
        }),
        prisma.fatura.aggregate({
          where: {
            ...whereBase,
            status: { in: [InvoiceStatus.ABERTA, InvoiceStatus.RASCUNHO] },
          },
          _sum: { valor: true },
          _count: { _all: true },
        }),
        prisma.fatura.aggregate({
          where: { ...whereBase, status: InvoiceStatus.VENCIDA },
          _sum: { valor: true },
          _count: { _all: true },
        }),
      ]);

    const resumo: BillingResumo = {
      totalFaturas: total,
      totalPago: pagoAgg._count._all,
      totalAberto: abertoAgg._count._all,
      totalVencido: vencidoAgg._count._all,
      valorTotal: Number(totalAgg._sum.valor || 0),
      valorPago: Number(pagoAgg._sum.valor || 0),
      valorAberto: Number(abertoAgg._sum.valor || 0),
      valorVencido: Number(vencidoAgg._sum.valor || 0),
    };

    const faturasComMetadados = faturas.map((item) => {
      const converted = convertAllDecimalFields(item);
      const metadata = asRecord(converted.metadata);
      const metodoPagamento = normalizePaymentMethod(
        metadata.paymentMethod ?? metadata.billingType,
      );
      const urlCobranca =
        asString(converted.urlBoleto) ??
        asString(metadata.invoiceUrl) ??
        asString(metadata.bankSlipUrl);
      const urlComprovante = asString(metadata.transactionReceiptUrl);
      const linhaDigitavel =
        asString(metadata.digitableLine) ??
        asString(metadata.identificationField);

      return {
        ...converted,
        metodoPagamento,
        metodoPagamentoLabel: paymentMethodLabel(metodoPagamento),
        urlCobranca,
        urlComprovante,
        linhaDigitavel,
        metadata,
      };
    });

    const assinaturaMetadata = asRecord(assinatura?.metadata);
    const metodoFromAssinatura = normalizePaymentMethod(
      assinaturaMetadata.billingType ??
        assinaturaMetadata.formaPagamento ??
        assinaturaMetadata.paymentMethod,
    );
    const metodoFromFaturas =
      faturasComMetadados.find((item) => item.metodoPagamento)?.metodoPagamento ??
      null;
    const metodoCobranca = metodoFromFaturas ?? metodoFromAssinatura;

    const assinaturaData: BillingAssinatura | null = assinatura
      ? {
          id: assinatura.id,
          status: assinatura.status,
          plano: assinatura.plano?.nome || null,
          dataInicio: assinatura.dataInicio,
          renovaEm: assinatura.renovaEm,
          trialEndsAt: assinatura.trialEndsAt,
          metodoCobranca,
          metodoCobrancaLabel: paymentMethodLabel(metodoCobranca),
          detalheMetodo:
            extractCardSummary(assinaturaMetadata) ||
            faturasComMetadados
              .map((item) => extractCardSummary(item.metadata))
              .find(Boolean) ||
            null,
          ultimaSincronizacao: toDate(
            asRecord(assinaturaMetadata.billingSync).lastSyncedAt,
          ),
        }
      : null;

    const serialized = JSON.parse(JSON.stringify(faturasComMetadados));

    return {
      success: true,
      data: {
        assinatura: assinaturaData,
        faturas: serialized,
        total,
        totalPaginas: Math.max(1, Math.ceil(total / itensPorPagina)),
        resumo,
      },
    };
  } catch (error) {
    console.error("Erro ao buscar billing do tenant:", error);
    return { success: false, error: "Erro interno ao carregar billing" };
  }
}
