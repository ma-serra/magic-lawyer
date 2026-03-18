import { NextRequest, NextResponse } from "next/server";

import prisma from "@/app/lib/prisma";
import { processarPagamentoConfirmado } from "@/app/actions/processar-pagamento-confirmado";
import { AsaasWebhookService } from "@/app/lib/notifications/services/asaas-webhook";
import {
  getRequestAuditMetadata,
  logOperationalEvent,
} from "@/app/lib/audit/operational-events";
import {
  activatePacoteSubscription,
  cancelPacoteSubscription,
  extractPacoteAssinaturaIdFromReference,
  markPacoteSubscriptionOverdue,
} from "@/app/lib/pacotes-juiz-commerce";
import { decrypt } from "@/lib/crypto";
import logger from "@/lib/logger";

type AsaasWebhookPayload = {
  event?: string;
  payment?: {
    id?: string;
    subscription?: string;
    externalReference?: string;
    value?: number;
    dueDate?: string;
    confirmedDate?: string;
    billingType?: string;
  };
  subscription?: {
    id?: string;
    status?: string;
    externalReference?: string;
  };
};

function extractTenantIdFromExternalReference(
  externalReference?: string | null,
): string | null {
  if (!externalReference) return null;
  if (!externalReference.startsWith("tenant_")) return null;

  const tenantId = externalReference.replace("tenant_", "").trim();
  return tenantId || null;
}

function normalizeParcelaReference(
  externalReference?: string | null,
): string | null {
  if (!externalReference) return null;
  if (externalReference.startsWith("checkout_")) return null;
  if (externalReference.startsWith("tenant_")) return null;
  if (extractPacoteAssinaturaIdFromReference(externalReference)) return null;

  if (externalReference.startsWith("parcela_")) {
    return externalReference.replace("parcela_", "").trim() || null;
  }

  return externalReference.trim() || null;
}

async function resolveTenantIdFromWebhook(
  webhookData: AsaasWebhookPayload,
): Promise<string | null> {
  const assinaturaPacoteId = extractPacoteAssinaturaIdFromReference(
    webhookData.payment?.externalReference ??
      webhookData.subscription?.externalReference,
  );

  if (assinaturaPacoteId) {
    const assinaturaPacote = await prisma.assinaturaPacoteJuiz.findUnique({
      where: { id: assinaturaPacoteId },
      select: { tenantId: true },
    });

    if (assinaturaPacote?.tenantId) {
      return assinaturaPacote.tenantId;
    }
  }

  const tenantByExternalReference = extractTenantIdFromExternalReference(
    webhookData.payment?.externalReference ??
      webhookData.subscription?.externalReference,
  );
  if (tenantByExternalReference) {
    return tenantByExternalReference;
  }

  const parcelaId = normalizeParcelaReference(webhookData.payment?.externalReference);
  if (parcelaId) {
    const parcela = await prisma.contratoParcela.findFirst({
      where: { id: parcelaId },
      select: { tenantId: true },
    });
    if (parcela?.tenantId) {
      return parcela.tenantId;
    }
  }

  if (webhookData.payment?.id) {
    const parcelaByPayment = await prisma.contratoParcela.findFirst({
      where: { asaasPaymentId: webhookData.payment.id },
      select: { tenantId: true },
    });
    if (parcelaByPayment?.tenantId) {
      return parcelaByPayment.tenantId;
    }
  }

  const subscriptionId =
    webhookData.subscription?.id || webhookData.payment?.subscription;
  if (subscriptionId) {
    const subscription = await prisma.tenantSubscription.findFirst({
      where: { asaasSubscriptionId: subscriptionId },
      select: { tenantId: true },
    });
    if (subscription?.tenantId) {
      return subscription.tenantId;
    }
  }

  return null;
}

async function validateWebhookToken(
  tenantId: string | null,
  accessToken: string | null,
  options?: {
    forceGlobalSecret?: boolean;
  },
) {
  const globalSecret = process.env.ASAAS_WEBHOOK_SECRET?.trim() || null;

  if (options?.forceGlobalSecret) {
    if (!globalSecret) {
      logger.warn(
        "[AsaasWebhook] Webhook da plataforma sem ASAAS_WEBHOOK_SECRET configurado. Prosseguindo sem autenticação.",
      );
      return { ok: true };
    }

    if (!accessToken || accessToken !== globalSecret) {
      return { ok: false, reason: "Token global inválido" };
    }

    return { ok: true };
  }

  if (!tenantId) {
    if (!globalSecret) {
      logger.warn(
        "[AsaasWebhook] Evento sem tenant resolvido e sem segredo global. Prosseguindo sem autenticação.",
      );
      return { ok: true };
    }

    if (!accessToken || accessToken !== globalSecret) {
      return { ok: false, reason: "Token global inválido" };
    }

    return { ok: true };
  }

  const config = await prisma.tenantAsaasConfig.findUnique({
    where: { tenantId },
    select: { webhookAccessToken: true },
  });

  if (config?.webhookAccessToken) {
    try {
      const decryptedToken = decrypt(config.webhookAccessToken);
      if (!accessToken || accessToken !== decryptedToken) {
        return { ok: false, reason: "Token do webhook do tenant inválido" };
      }

      return { ok: true };
    } catch (error) {
      logger.error("[AsaasWebhook] Erro ao validar token do tenant:", error);
      return { ok: false, reason: "Falha ao validar token do webhook" };
    }
  }

  if (globalSecret) {
    if (!accessToken || accessToken !== globalSecret) {
      return { ok: false, reason: "Token global inválido" };
    }

    return { ok: true };
  }

  logger.warn(
    `[AsaasWebhook] Tenant ${tenantId} sem token de webhook e sem segredo global. Prosseguindo sem autenticação.`,
  );
  return { ok: true };
}

async function findSubscriptionForPayment(payment: {
  subscription?: string;
  externalReference?: string;
}) {
  if (payment.subscription) {
    const bySubscription = await prisma.tenantSubscription.findFirst({
      where: { asaasSubscriptionId: payment.subscription },
    });
    if (bySubscription) return bySubscription;
  }

  const tenantIdFromReference = extractTenantIdFromExternalReference(
    payment.externalReference,
  );
  if (tenantIdFromReference) {
    return prisma.tenantSubscription.findFirst({
      where: { tenantId: tenantIdFromReference },
      orderBy: { updatedAt: "desc" },
    });
  }

  if (
    payment.externalReference &&
    !payment.externalReference.startsWith("checkout_") &&
    !payment.externalReference.startsWith("parcela_") &&
    !payment.externalReference.startsWith("tenant_")
  ) {
    return prisma.tenantSubscription.findFirst({
      where: { asaasSubscriptionId: payment.externalReference },
    });
  }

  return null;
}

export async function POST(request: NextRequest) {
  const requestMeta = getRequestAuditMetadata(request);

  try {
    const rawPayload = await request.text();
    const accessToken = request.headers.get("asaas-access-token");

    let webhookData: AsaasWebhookPayload;

    try {
      webhookData = JSON.parse(rawPayload) as AsaasWebhookPayload;
    } catch {
      await logOperationalEvent({
        category: "WEBHOOK",
        source: "ASAAS",
        action: "WEBHOOK_INVALID_PAYLOAD",
        status: "ERROR",
        actorType: "WEBHOOK",
        route: requestMeta.route,
        ipAddress: requestMeta.ipAddress,
        userAgent: requestMeta.userAgent,
        message: "Webhook Asaas recebido com JSON inválido.",
      });

      return NextResponse.json({ error: "Payload JSON inválido" }, { status: 400 });
    }

    const tenantId = await resolveTenantIdFromWebhook(webhookData);
    await logOperationalEvent({
      tenantId,
      category: "WEBHOOK",
      source: "ASAAS",
      action: "WEBHOOK_RECEIVED",
      status: "INFO",
      actorType: "WEBHOOK",
      entityType: "ASAAS_EVENT",
      entityId:
        webhookData.payment?.id ??
        webhookData.subscription?.id ??
        webhookData.payment?.externalReference ??
        null,
      route: requestMeta.route,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      message: `Webhook Asaas recebido: ${webhookData.event ?? "desconhecido"}.`,
      payload: {
        event: webhookData.event ?? null,
        paymentId: webhookData.payment?.id ?? null,
        subscriptionId:
          webhookData.subscription?.id ?? webhookData.payment?.subscription ?? null,
        externalReference:
          webhookData.payment?.externalReference ??
          webhookData.subscription?.externalReference ??
          null,
        hasAccessToken: Boolean(accessToken),
      },
    });
    const tokenValidation = await validateWebhookToken(tenantId, accessToken, {
      forceGlobalSecret: Boolean(
        extractPacoteAssinaturaIdFromReference(
          webhookData.payment?.externalReference ??
            webhookData.subscription?.externalReference,
        ),
      ),
    });

    if (!tokenValidation.ok) {
      logger.warn(
        `[AsaasWebhook] Requisição recusada (${tokenValidation.reason ?? "token inválido"})`,
      );
      await logOperationalEvent({
        tenantId,
        category: "WEBHOOK",
        source: "ASAAS",
        action: "WEBHOOK_REJECTED",
        status: "WARNING",
        actorType: "WEBHOOK",
        entityType: "ASAAS_EVENT",
        entityId:
          webhookData.payment?.id ??
          webhookData.subscription?.id ??
          webhookData.payment?.externalReference ??
          null,
        route: requestMeta.route,
        ipAddress: requestMeta.ipAddress,
        userAgent: requestMeta.userAgent,
        message: `Webhook Asaas rejeitado: ${tokenValidation.reason ?? "token inválido"}.`,
        payload: {
          event: webhookData.event ?? null,
          reason: tokenValidation.reason ?? null,
        },
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    switch (webhookData.event) {
      case "PAYMENT_CREATED":
        await handlePaymentCreated(webhookData);
        break;
      case "PAYMENT_RECEIVED":
        await handlePaymentReceived(webhookData);
        break;
      case "PAYMENT_OVERDUE":
        await handlePaymentOverdue(webhookData);
        break;
      case "PAYMENT_DELETED":
        await handlePaymentDeleted(webhookData);
        break;
      case "SUBSCRIPTION_CREATED":
        await handleSubscriptionCreated(webhookData);
        break;
      case "SUBSCRIPTION_UPDATED":
        await handleSubscriptionUpdated(webhookData);
        break;
      case "SUBSCRIPTION_DELETED":
        await handleSubscriptionDeleted(webhookData);
        break;
      default:
        logger.info(
          `[AsaasWebhook] Evento recebido sem handler dedicado: ${webhookData.event ?? "desconhecido"}`,
        );
    }

    if (tenantId) {
      await prisma.tenantAsaasConfig.updateMany({
        where: { tenantId },
        data: {
          lastWebhookAt: new Date(),
          lastWebhookEvent: webhookData.event ?? null,
        },
      });
    }

    if (tenantId && webhookData.payment) {
      try {
        await AsaasWebhookService.processWebhook(webhookData as any, tenantId);
      } catch (error) {
        logger.error("[AsaasWebhook] Erro ao processar notificações:", error);
      }
    }

    await logOperationalEvent({
      tenantId,
      category: "WEBHOOK",
      source: "ASAAS",
      action: "WEBHOOK_PROCESSED",
      status: "SUCCESS",
      actorType: "WEBHOOK",
      entityType: "ASAAS_EVENT",
      entityId:
        webhookData.payment?.id ??
        webhookData.subscription?.id ??
        webhookData.payment?.externalReference ??
        null,
      route: requestMeta.route,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      message: `Webhook Asaas processado: ${webhookData.event ?? "desconhecido"}.`,
      payload: {
        event: webhookData.event ?? null,
        paymentId: webhookData.payment?.id ?? null,
        subscriptionId:
          webhookData.subscription?.id ?? webhookData.payment?.subscription ?? null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Erro ao processar webhook Asaas:", error);

    await logOperationalEvent({
      category: "WEBHOOK",
      source: "ASAAS",
      action: "WEBHOOK_FAILED",
      status: "ERROR",
      actorType: "WEBHOOK",
      route: requestMeta.route,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
      message:
        error instanceof Error ? error.message : "Falha interna ao processar webhook Asaas.",
    });

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ============================================
// HANDLERS DE EVENTOS
// ============================================

async function handlePaymentCreated(webhookData: AsaasWebhookPayload) {
  logger.info(
    `[AsaasWebhook] PAYMENT_CREATED ${webhookData.payment?.id ?? "sem-id"}`,
  );
}

async function handlePaymentReceived(webhookData: AsaasWebhookPayload) {
  const payment = webhookData.payment;
  if (!payment?.id) return;

  const assinaturaPacoteId = extractPacoteAssinaturaIdFromReference(
    payment.externalReference,
  );

  if (assinaturaPacoteId) {
    await activatePacoteSubscription({
      assinaturaId: assinaturaPacoteId,
      payment: {
        id: payment.id,
        customer: payment.externalReference || assinaturaPacoteId,
        billingType: (payment.billingType as "PIX" | "BOLETO" | "CREDIT_CARD") || "PIX",
        value: payment.value ?? 0,
        dueDate: payment.dueDate || new Date().toISOString(),
        confirmedDate: payment.confirmedDate || new Date().toISOString(),
        status: "CONFIRMED",
        externalReference: payment.externalReference,
      },
      billingType:
        (payment.billingType as "PIX" | "BOLETO" | "CREDIT_CARD" | undefined) ??
        undefined,
    });
    return;
  }

  // Pagamento de checkout de assinatura do próprio sistema Magic Lawyer
  if (payment.externalReference?.startsWith("checkout_")) {
    const result = await processarPagamentoConfirmado(payment.id);
    if (!result.success) {
      logger.error(
        `[AsaasWebhook] Falha ao processar checkout ${payment.id}: ${result.error}`,
      );
    }
    return;
  }

  const subscription = await findSubscriptionForPayment(payment);
  if (!subscription) return;

  await prisma.tenantSubscription.update({
    where: { id: subscription.id },
    data: {
      status: "ATIVA",
      asaasPaymentId: payment.id,
      updatedAt: new Date(),
    },
  });

  await prisma.fatura.create({
    data: {
      tenantId: subscription.tenantId,
      subscriptionId: subscription.id,
      numero: `FAT-${Date.now()}`,
      descricao: "Assinatura Magic Lawyer",
      valor: (payment.value ?? 0) / 100,
      moeda: "BRL",
      status: "PAGA",
      vencimento: payment.dueDate ? new Date(payment.dueDate) : new Date(),
      pagoEm: payment.confirmedDate ? new Date(payment.confirmedDate) : new Date(),
      metadata: {
        asaasPaymentId: payment.id,
        paymentMethod: payment.billingType,
      },
    },
  });
}

async function handlePaymentOverdue(webhookData: AsaasWebhookPayload) {
  const payment = webhookData.payment;
  if (!payment?.id) return;

  const assinaturaPacoteId = extractPacoteAssinaturaIdFromReference(
    payment.externalReference,
  );

  if (assinaturaPacoteId) {
    await markPacoteSubscriptionOverdue(assinaturaPacoteId);
    return;
  }

  const subscription = await findSubscriptionForPayment(payment);
  if (!subscription) return;

  await prisma.tenantSubscription.update({
    where: { id: subscription.id },
    data: {
      status: "INADIMPLENTE",
      updatedAt: new Date(),
    },
  });
}

async function handlePaymentDeleted(webhookData: AsaasWebhookPayload) {
  const assinaturaPacoteId = extractPacoteAssinaturaIdFromReference(
    webhookData.payment?.externalReference,
  );

  if (assinaturaPacoteId) {
    await cancelPacoteSubscription(assinaturaPacoteId);
    return;
  }

  logger.info(
    `[AsaasWebhook] PAYMENT_DELETED ${webhookData.payment?.id ?? "sem-id"}`,
  );
}

async function handleSubscriptionCreated(webhookData: AsaasWebhookPayload) {
  logger.info(
    `[AsaasWebhook] SUBSCRIPTION_CREATED ${webhookData.subscription?.id ?? "sem-id"}`,
  );
}

async function handleSubscriptionUpdated(webhookData: AsaasWebhookPayload) {
  const subscription = webhookData.subscription;
  if (!subscription?.id) return;

  const dbSubscription = await prisma.tenantSubscription.findFirst({
    where: { asaasSubscriptionId: subscription.id },
  });

  if (!dbSubscription) return;

  await prisma.tenantSubscription.update({
    where: { id: dbSubscription.id },
    data: {
      status: subscription.status === "ACTIVE" ? "ATIVA" : "CANCELADA",
      updatedAt: new Date(),
    },
  });
}

async function handleSubscriptionDeleted(webhookData: AsaasWebhookPayload) {
  const subscription = webhookData.subscription;
  if (!subscription?.id) return;

  const dbSubscription = await prisma.tenantSubscription.findFirst({
    where: { asaasSubscriptionId: subscription.id },
  });

  if (!dbSubscription) return;

  await prisma.tenantSubscription.update({
    where: { id: dbSubscription.id },
    data: {
      status: "CANCELADA",
      dataFim: new Date(),
      updatedAt: new Date(),
    },
  });
}
