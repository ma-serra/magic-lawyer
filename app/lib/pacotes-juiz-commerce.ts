import prisma from "@/app/lib/prisma";
import {
  AutoridadeNivelAcesso,
  AutoridadeOrigemUnlock,
  AutoridadeStatusUnlock,
  InvoiceStatus,
  PaymentStatus,
  Prisma,
} from "@/generated/prisma";
import {
  AsaasClient,
  formatCpfCnpjForAsaas,
  formatDateForAsaas,
  normalizeAsaasApiKey,
  resolveAsaasEnvironment,
  type AsaasCustomer,
  type AsaasPayment,
} from "@/lib/asaas";
import logger from "@/lib/logger";

export const PACOTE_ASSINATURA_EXTERNAL_REFERENCE_PREFIX =
  "pacote_assinatura_";
export const PACOTE_BILLING_CONTEXT = "PACOTE_AUTORIDADE";
export const PACOTE_STATUS_PENDENTE = "PENDENTE";
export const PACOTE_STATUS_ATIVA = "ATIVA";
export const PACOTE_STATUS_INADIMPLENTE = "INADIMPLENTE";
export const PACOTE_STATUS_CANCELADA = "CANCELADA";

type PacoteAssinaturaComPacote = Prisma.AssinaturaPacoteJuizGetPayload<{
  include: {
    pacote: {
      include: {
        juizes: {
          where: {
            ativo: true,
          },
          select: {
            juizId: true;
          };
        };
      };
    };
    tenant: {
      select: {
        id: true;
        name: true;
        slug: true;
        documento: true;
        email: true;
        telefone: true;
        razaoSocial: true;
        nomeFantasia: true;
      };
    };
  };
}>;

export type PacoteCheckoutPaymentSnapshot = {
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

export function buildPacoteAssinaturaExternalReference(assinaturaId: string) {
  return `${PACOTE_ASSINATURA_EXTERNAL_REFERENCE_PREFIX}${assinaturaId}`;
}

export function extractPacoteAssinaturaIdFromReference(
  externalReference?: string | null,
) {
  if (!externalReference) return null;
  if (!externalReference.startsWith(PACOTE_ASSINATURA_EXTERNAL_REFERENCE_PREFIX)) {
    return null;
  }

  const assinaturaId = externalReference
    .replace(PACOTE_ASSINATURA_EXTERNAL_REFERENCE_PREFIX, "")
    .trim();

  return assinaturaId || null;
}

export function isPacoteStatusAtivo(status: string) {
  return status === PACOTE_STATUS_ATIVA;
}

export function isPacoteAssinaturaAtiva(
  status: string,
  dataFim?: Date | string | null,
  now = new Date(),
) {
  if (!isPacoteStatusAtivo(status)) {
    return false;
  }

  if (!dataFim) {
    return true;
  }

  const parsed = dataFim instanceof Date ? dataFim : new Date(dataFim);
  return !Number.isNaN(parsed.getTime()) && parsed > now;
}

function mapAsaasStatusToInvoiceStatus(status: string | null | undefined) {
  const normalized = (status || "").toUpperCase();

  switch (normalized) {
    case "CONFIRMED":
    case "RECEIVED":
    case "RECEIVED_IN_CASH":
      return InvoiceStatus.PAGA;
    case "OVERDUE":
      return InvoiceStatus.VENCIDA;
    case "PENDING":
    case "PROCESSING":
      return InvoiceStatus.ABERTA;
    case "FAILED":
    case "REFUNDED":
    case "CHARGED_BACK":
    case "CANCELED":
    case "CANCELLED":
      return InvoiceStatus.CANCELADA;
    default:
      return InvoiceStatus.RASCUNHO;
  }
}

function mapAsaasStatusToPaymentStatus(status: string | null | undefined) {
  const normalized = (status || "").toUpperCase();

  switch (normalized) {
    case "CONFIRMED":
    case "RECEIVED":
    case "RECEIVED_IN_CASH":
      return PaymentStatus.PAGO;
    case "PROCESSING":
      return PaymentStatus.PROCESSANDO;
    case "FAILED":
    case "REFUNDED":
    case "CHARGED_BACK":
    case "CANCELED":
    case "CANCELLED":
      return PaymentStatus.FALHOU;
    default:
      return PaymentStatus.PENDENTE;
  }
}

function isDevelopmentRuntime() {
  return process.env.NODE_ENV !== "production";
}

function getPlatformAsaasClient() {
  const apiKey = normalizeAsaasApiKey(process.env.ASAAS_API_KEY);

  if (!apiKey) {
    return null;
  }

  const environment = resolveAsaasEnvironment(process.env.ASAAS_ENVIRONMENT);

  return new AsaasClient(apiKey, environment);
}

function buildMockPixPayload(assinaturaId: string, pacoteNome: string) {
  return `MOCK-PIX|${assinaturaId}|${pacoteNome}|${Date.now()}`;
}

async function ensurePlatformCustomer(
  tenantId: string,
  client: AsaasClient,
): Promise<{ customerId: string; createdCustomer: AsaasCustomer | null }> {
  const [tenant, subscription, firstAdmin] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        documento: true,
        email: true,
        telefone: true,
        razaoSocial: true,
        nomeFantasia: true,
      },
    }),
    prisma.tenantSubscription.findUnique({
      where: { tenantId },
      select: {
        id: true,
        asaasCustomerId: true,
      },
    }),
    prisma.usuario.findFirst({
      where: {
        tenantId,
        role: "ADMIN",
      },
      select: {
        email: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    }),
  ]);

  if (!tenant) {
    throw new Error("Tenant não encontrado para cobrança do pacote");
  }

  if (subscription?.asaasCustomerId) {
    return {
      customerId: subscription.asaasCustomerId,
      createdCustomer: null,
    };
  }

  const document = tenant.documento?.trim();
  if (document) {
    try {
      const existingCustomer = await client.findCustomerByCpfCnpj(document);
      if (existingCustomer?.id) {
        if (subscription?.id) {
          await prisma.tenantSubscription.update({
            where: { id: subscription.id },
            data: {
              asaasCustomerId: existingCustomer.id,
            },
          });
        }

        return {
          customerId: existingCustomer.id,
          createdCustomer: existingCustomer,
        };
      }
    } catch (error) {
      logger.warn(
        "[PacotesJuizCommerce] Falha ao localizar cliente existente no Asaas",
        {
          error,
          tenantId,
        },
      );
    }
  }

  const customer = await client.createCustomer({
    name:
      tenant.nomeFantasia?.trim() ||
      tenant.razaoSocial?.trim() ||
      tenant.name.trim(),
    email:
      tenant.email?.trim() ||
      firstAdmin?.email?.trim() ||
      `financeiro+${tenant.slug}@magiclawyer.local`,
    cpfCnpj: formatCpfCnpjForAsaas(
      document || `${tenant.id}`.replace(/\D/g, "").slice(0, 11).padEnd(11, "0"),
    ),
    phone: tenant.telefone?.replace(/\D/g, "") || undefined,
    mobilePhone: tenant.telefone?.replace(/\D/g, "") || undefined,
    country: "Brasil",
  });

  if (!customer.id) {
    throw new Error("Não foi possível criar o cliente do escritório no Asaas");
  }

  if (subscription?.id) {
    await prisma.tenantSubscription.update({
      where: { id: subscription.id },
      data: {
        asaasCustomerId: customer.id,
      },
    });
  }

  return {
    customerId: customer.id,
    createdCustomer: customer,
  };
}

function createPacoteInvoiceNumber(tenantSlug: string, assinaturaId: string) {
  const suffix = assinaturaId.slice(-6).toUpperCase();
  return `PKG-${tenantSlug.toUpperCase()}-${suffix}`;
}

function buildPacoteInvoiceMetadata(input: {
  assinaturaPacoteId: string;
  pacoteId: string;
  pacoteNome: string;
  billingType?: string | null;
  payment?: AsaasPayment | null;
  isMock?: boolean;
}) {
  return {
    billingContext: PACOTE_BILLING_CONTEXT,
    assinaturaPacoteId: input.assinaturaPacoteId,
    pacoteId: input.pacoteId,
    pacoteNome: input.pacoteNome,
    billingType: input.billingType ?? input.payment?.billingType ?? null,
    asaasPaymentId: input.payment?.id ?? null,
    invoiceUrl: input.payment?.invoiceUrl ?? null,
    bankSlipUrl:
      input.payment?.bankSlipUrl ?? input.payment?.boletoUrl ?? null,
    transactionReceiptUrl: input.payment?.transactionReceiptUrl ?? null,
    pixCopyPaste:
      input.payment?.pixTransaction?.payload ??
      input.payment?.pixTransaction?.qrCode ??
      null,
    pixQrCodeUrl: input.payment?.pixTransaction?.qrCodeUrl ?? null,
    paymentStatus: input.payment?.status ?? null,
    dueDate: input.payment?.dueDate ?? null,
    confirmedDate: input.payment?.confirmedDate ?? null,
    isMock: input.isMock ?? false,
  } satisfies Prisma.JsonObject;
}

async function findPacoteInvoice(tenantId: string, assinaturaPacoteId: string) {
  return prisma.fatura.findFirst({
    where: {
      tenantId,
      contratoId: null,
      metadata: {
        path: ["assinaturaPacoteId"],
        equals: assinaturaPacoteId,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function upsertPacoteInvoice(params: {
  assinatura: PacoteAssinaturaComPacote;
  billingType?: "PIX" | "BOLETO" | "CREDIT_CARD" | null;
  payment?: AsaasPayment | null;
  isMock?: boolean;
}) {
  const existingInvoice = await findPacoteInvoice(
    params.assinatura.tenantId,
    params.assinatura.id,
  );

  const invoiceStatus = mapAsaasStatusToInvoiceStatus(params.payment?.status);
  const metadata = buildPacoteInvoiceMetadata({
    assinaturaPacoteId: params.assinatura.id,
    pacoteId: params.assinatura.pacoteId,
    pacoteNome: params.assinatura.pacote.nome,
    billingType: params.billingType ?? params.assinatura.formaPagamento,
    payment: params.payment,
    isMock: params.isMock,
  });

  const invoiceData: Prisma.FaturaUncheckedCreateInput &
    Prisma.FaturaUncheckedUpdateInput = {
    tenantId: params.assinatura.tenantId,
    subscriptionId: null,
    contratoId: null,
    numero:
      existingInvoice?.numero ||
      createPacoteInvoiceNumber(
        params.assinatura.tenant.slug,
        params.assinatura.id,
      ),
    descricao: `Pacote premium · ${params.assinatura.pacote.nome}`,
    valor: Number(params.assinatura.precoPago),
    moeda: params.assinatura.pacote.moeda || "BRL",
    status: invoiceStatus,
    vencimento: params.payment?.dueDate
      ? new Date(params.payment.dueDate)
      : existingInvoice?.vencimento || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    pagoEm: params.payment?.confirmedDate
      ? new Date(params.payment.confirmedDate)
      : invoiceStatus === InvoiceStatus.PAGA
        ? new Date()
        : null,
    externalInvoiceId:
      params.payment?.id || existingInvoice?.externalInvoiceId || null,
    urlBoleto:
      params.payment?.bankSlipUrl ||
      params.payment?.boletoUrl ||
      params.payment?.invoiceUrl ||
      existingInvoice?.urlBoleto ||
      null,
    metadata,
  };

  const invoice = existingInvoice
    ? await prisma.fatura.update({
        where: { id: existingInvoice.id },
        data: invoiceData,
      })
    : await prisma.fatura.create({
        data: invoiceData,
      });

  const paymentStatus = mapAsaasStatusToPaymentStatus(params.payment?.status);
  const existingPayment = await prisma.pagamento.findFirst({
    where: {
      tenantId: params.assinatura.tenantId,
      faturaId: invoice.id,
    },
  });

  if (existingPayment) {
    await prisma.pagamento.update({
      where: { id: existingPayment.id },
      data: {
        valor: Number(params.assinatura.precoPago),
        status: paymentStatus,
        metodo:
          params.billingType ??
          params.payment?.billingType ??
          params.assinatura.formaPagamento ??
          existingPayment.metodo,
        transacaoId: params.payment?.id ?? existingPayment.transacaoId,
        confirmadoEm:
          paymentStatus === PaymentStatus.PAGO
            ? params.payment?.confirmedDate
              ? new Date(params.payment.confirmedDate)
              : existingPayment.confirmadoEm || new Date()
            : null,
        detalhes: metadata,
      },
    });
  } else {
    await prisma.pagamento.create({
      data: {
        tenantId: params.assinatura.tenantId,
        faturaId: invoice.id,
        valor: Number(params.assinatura.precoPago),
        status: paymentStatus,
        metodo:
          params.billingType ??
          params.payment?.billingType ??
          params.assinatura.formaPagamento ??
          null,
        transacaoId: params.payment?.id ?? null,
        confirmadoEm:
          paymentStatus === PaymentStatus.PAGO
            ? params.payment?.confirmedDate
              ? new Date(params.payment.confirmedDate)
              : new Date()
            : null,
        detalhes: metadata,
      },
    });
  }

  return invoice;
}

function buildSnapshotFromInvoice(
  invoice: Awaited<ReturnType<typeof findPacoteInvoice>>,
  fallback: {
    billingType?: string | null;
    value: number;
    status?: string;
  },
): PacoteCheckoutPaymentSnapshot {
  const metadata =
    invoice && invoice.metadata && typeof invoice.metadata === "object"
      ? (invoice.metadata as Record<string, unknown>)
      : {};

  return {
    asaasPaymentId:
      (metadata.asaasPaymentId as string | null | undefined) ??
      invoice?.externalInvoiceId ??
      null,
    billingType:
      ((metadata.billingType as string | null | undefined) ??
        fallback.billingType ??
        null) as "PIX" | "BOLETO" | "CREDIT_CARD" | null,
    status:
      (metadata.paymentStatus as string | null | undefined) ??
      fallback.status ??
      invoice?.status ??
      PACOTE_STATUS_PENDENTE,
    value: Number(invoice?.valor ?? fallback.value),
    dueDate:
      (metadata.dueDate as string | null | undefined) ??
      (invoice?.vencimento ? invoice.vencimento.toISOString() : null),
    invoiceUrl:
      (metadata.invoiceUrl as string | null | undefined) ??
      (metadata.bankSlipUrl as string | null | undefined) ??
      invoice?.urlBoleto ??
      null,
    bankSlipUrl:
      (metadata.bankSlipUrl as string | null | undefined) ??
      invoice?.urlBoleto ??
      null,
    transactionReceiptUrl:
      (metadata.transactionReceiptUrl as string | null | undefined) ?? null,
    pixCopyPaste:
      (metadata.pixCopyPaste as string | null | undefined) ?? null,
    pixQrCodeUrl:
      (metadata.pixQrCodeUrl as string | null | undefined) ?? null,
    isMock: Boolean(metadata.isMock),
  };
}

export async function reconcilePacoteUnlocks(tenantId: string) {
  const now = new Date();

  const [assinaturasAtivas, unlocksAtuais] = await Promise.all([
    prisma.assinaturaPacoteJuiz.findMany({
      where: {
        tenantId,
        status: PACOTE_STATUS_ATIVA,
        OR: [{ dataFim: null }, { dataFim: { gt: now } }],
      },
      include: {
        pacote: {
          include: {
            juizes: {
              where: {
                ativo: true,
              },
              select: {
                juizId: true,
              },
            },
          },
        },
      },
      orderBy: [{ dataFim: "desc" }, { createdAt: "asc" }],
    }),
    prisma.autoridadeTenantUnlock.findMany({
      where: {
        tenantId,
      },
    }),
  ]);

  const pacoteByJuiz = new Map<
    string,
    {
      assinaturaPacoteId: string;
      dataFim: Date | null;
    }
  >();

  for (const assinatura of assinaturasAtivas) {
    for (const pacoteJuiz of assinatura.pacote.juizes) {
      if (!pacoteByJuiz.has(pacoteJuiz.juizId)) {
        pacoteByJuiz.set(pacoteJuiz.juizId, {
          assinaturaPacoteId: assinatura.id,
          dataFim: assinatura.dataFim,
        });
      }
    }
  }

  for (const [juizId, pacoteInfo] of pacoteByJuiz.entries()) {
    const existingUnlock = unlocksAtuais.find((item) => item.juizId === juizId);

    if (!existingUnlock) {
      await prisma.autoridadeTenantUnlock.create({
        data: {
          tenantId,
          juizId,
          assinaturaPacoteId: pacoteInfo.assinaturaPacoteId,
          nivelAcesso: AutoridadeNivelAcesso.COMPLETO,
          origem: AutoridadeOrigemUnlock.PACOTE,
          status: AutoridadeStatusUnlock.ATIVO,
          dataFim: pacoteInfo.dataFim,
        },
      });
      continue;
    }

    if (existingUnlock.origem !== AutoridadeOrigemUnlock.PACOTE) {
      if (
        existingUnlock.status !== AutoridadeStatusUnlock.ATIVO ||
        existingUnlock.nivelAcesso !== AutoridadeNivelAcesso.COMPLETO
      ) {
        await prisma.autoridadeTenantUnlock.update({
          where: { id: existingUnlock.id },
          data: {
            status: AutoridadeStatusUnlock.ATIVO,
            nivelAcesso: AutoridadeNivelAcesso.COMPLETO,
          },
        });
      }
      continue;
    }

    await prisma.autoridadeTenantUnlock.update({
      where: { id: existingUnlock.id },
      data: {
        assinaturaPacoteId: pacoteInfo.assinaturaPacoteId,
        nivelAcesso: AutoridadeNivelAcesso.COMPLETO,
        status: AutoridadeStatusUnlock.ATIVO,
        dataFim: pacoteInfo.dataFim,
      },
    });
  }

  for (const unlock of unlocksAtuais) {
    if (unlock.origem !== AutoridadeOrigemUnlock.PACOTE) {
      continue;
    }

    if (pacoteByJuiz.has(unlock.juizId)) {
      continue;
    }

    await prisma.autoridadeTenantUnlock.update({
      where: { id: unlock.id },
      data: {
        status: AutoridadeStatusUnlock.EXPIRADO,
        dataFim: unlock.dataFim && unlock.dataFim < now ? unlock.dataFim : now,
        assinaturaPacoteId: null,
      },
    });
  }
}

export async function expirePacoteSubscriptions(tenantId: string) {
  const now = new Date();
  const expired = await prisma.assinaturaPacoteJuiz.updateMany({
    where: {
      tenantId,
      status: PACOTE_STATUS_ATIVA,
      dataFim: {
        lte: now,
      },
    },
    data: {
      status: PACOTE_STATUS_CANCELADA,
      updatedAt: now,
    },
  });

  if (expired.count > 0) {
    await reconcilePacoteUnlocks(tenantId);
  }
}

export async function getPacoteInvoiceSnapshot(
  tenantId: string,
  assinaturaPacoteId: string,
  fallback: {
    billingType?: string | null;
    value: number;
    status?: string;
  },
) {
  const invoice = await findPacoteInvoice(tenantId, assinaturaPacoteId);
  return buildSnapshotFromInvoice(invoice, fallback);
}

export async function activatePacoteSubscription(params: {
  assinaturaId: string;
  payment?: AsaasPayment | null;
  paidAt?: Date;
  billingType?: "PIX" | "BOLETO" | "CREDIT_CARD" | null;
  isMock?: boolean;
}) {
  const assinatura = await prisma.assinaturaPacoteJuiz.findUnique({
    where: { id: params.assinaturaId },
    include: {
      pacote: {
        include: {
          juizes: {
            where: {
              ativo: true,
            },
            select: {
              juizId: true,
            },
          },
        },
      },
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
          documento: true,
          email: true,
          telefone: true,
          razaoSocial: true,
          nomeFantasia: true,
        },
      },
    },
  });

  if (!assinatura) {
    throw new Error("Assinatura de pacote não encontrada");
  }

  const now = params.paidAt ?? new Date();
  const dataFim = assinatura.pacote.duracaoDias
    ? new Date(
        now.getTime() +
          assinatura.pacote.duracaoDias * 24 * 60 * 60 * 1000,
      )
    : null;

  const updated = await prisma.assinaturaPacoteJuiz.update({
    where: { id: assinatura.id },
    data: {
      status: PACOTE_STATUS_ATIVA,
      dataInicio: now,
      dataFim,
      formaPagamento:
        params.billingType ??
        params.payment?.billingType ??
        assinatura.formaPagamento,
      renovacaoAutomatica: false,
      observacoes: params.isMock
        ? "Pagamento confirmado em modo de desenvolvimento."
        : assinatura.observacoes,
    },
    include: {
      pacote: {
        include: {
          juizes: {
            where: {
              ativo: true,
            },
            select: {
              juizId: true,
            },
          },
        },
      },
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
          documento: true,
          email: true,
          telefone: true,
          razaoSocial: true,
          nomeFantasia: true,
        },
      },
    },
  });

  await upsertPacoteInvoice({
    assinatura: updated,
    billingType:
      (params.billingType ??
        updated.formaPagamento) as "PIX" | "BOLETO" | "CREDIT_CARD" | null,
    payment:
      params.payment ?? ({
        id: null as unknown as string,
        customer: updated.tenantId,
        billingType: (params.billingType ??
          updated.formaPagamento ??
          "PIX") as "PIX" | "BOLETO" | "CREDIT_CARD",
        value: Number(updated.precoPago),
        dueDate: formatDateForAsaas(now),
        confirmedDate: now.toISOString(),
        status: "CONFIRMED",
      }),
    isMock: params.isMock,
  });

  await reconcilePacoteUnlocks(updated.tenantId);

  return updated;
}

export async function markPacoteSubscriptionOverdue(assinaturaId: string) {
  const assinatura = await prisma.assinaturaPacoteJuiz.update({
    where: { id: assinaturaId },
    data: {
      status: PACOTE_STATUS_INADIMPLENTE,
    },
    include: {
      pacote: {
        include: {
          juizes: {
            where: {
              ativo: true,
            },
            select: {
              juizId: true,
            },
          },
        },
      },
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
          documento: true,
          email: true,
          telefone: true,
          razaoSocial: true,
          nomeFantasia: true,
        },
      },
    },
  });

  await upsertPacoteInvoice({
    assinatura,
    billingType:
      (assinatura.formaPagamento as "PIX" | "BOLETO" | "CREDIT_CARD" | null) ??
      null,
    payment: {
      customer: assinatura.tenantId,
      billingType:
        (assinatura.formaPagamento as "PIX" | "BOLETO" | "CREDIT_CARD") ||
        "PIX",
      value: Number(assinatura.precoPago),
      dueDate: formatDateForAsaas(new Date()),
      status: "OVERDUE",
    },
  });

  await reconcilePacoteUnlocks(assinatura.tenantId);

  return assinatura;
}

export async function cancelPacoteSubscription(assinaturaId: string) {
  const assinatura = await prisma.assinaturaPacoteJuiz.update({
    where: { id: assinaturaId },
    data: {
      status: PACOTE_STATUS_CANCELADA,
      dataFim: new Date(),
    },
    include: {
      pacote: {
        include: {
          juizes: {
            where: {
              ativo: true,
            },
            select: {
              juizId: true,
            },
          },
        },
      },
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
          documento: true,
          email: true,
          telefone: true,
          razaoSocial: true,
          nomeFantasia: true,
        },
      },
    },
  });

  await reconcilePacoteUnlocks(assinatura.tenantId);

  return assinatura;
}

async function createFallbackMockPayment(params: {
  assinatura: PacoteAssinaturaComPacote;
  billingType: "PIX" | "BOLETO" | "CREDIT_CARD";
  autoConfirm?: boolean;
}) {
  const payment: AsaasPayment = {
    id: `mock_pkg_${params.assinatura.id}_${Date.now()}`,
    customer: params.assinatura.tenantId,
    billingType: params.billingType,
    value: Number(params.assinatura.precoPago),
    dueDate: formatDateForAsaas(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
    description: `Pacote premium ${params.assinatura.pacote.nome} - Magic Lawyer`,
    externalReference: buildPacoteAssinaturaExternalReference(
      params.assinatura.id,
    ),
    status: params.autoConfirm ? "CONFIRMED" : "PENDING",
    confirmedDate: params.autoConfirm ? new Date().toISOString() : null,
    invoiceUrl:
      params.billingType === "BOLETO"
        ? `https://mock.magiclawyer.local/pacotes/${params.assinatura.id}/boleto`
        : null,
    bankSlipUrl:
      params.billingType === "BOLETO"
        ? `https://mock.magiclawyer.local/pacotes/${params.assinatura.id}/boleto`
        : null,
    pixTransaction:
      params.billingType === "PIX"
        ? {
            payload: buildMockPixPayload(
              params.assinatura.id,
              params.assinatura.pacote.nome,
            ),
          }
        : undefined,
  };

  await upsertPacoteInvoice({
    assinatura: params.assinatura,
    billingType: params.billingType,
    payment,
    isMock: true,
  });

  if (params.autoConfirm) {
    await activatePacoteSubscription({
      assinaturaId: params.assinatura.id,
      payment,
      paidAt: new Date(),
      billingType: params.billingType,
      isMock: true,
    });
  }

  return payment;
}

export async function createPacoteCheckout(params: {
  tenantId: string;
  pacoteId: string;
  billingType: "PIX" | "BOLETO" | "CREDIT_CARD";
}) {
  await expirePacoteSubscriptions(params.tenantId);

  const pacote = await prisma.pacoteJuiz.findFirst({
    where: {
      id: params.pacoteId,
      isPublico: true,
      status: {
        in: ["ATIVO", "PROMOCIONAL"],
      },
    },
    include: {
      juizes: {
        where: {
          ativo: true,
        },
        select: {
          juizId: true,
        },
      },
    },
  });

  if (!pacote) {
    throw new Error("Pacote não disponível para compra");
  }

  const assinaturaAtiva = await prisma.assinaturaPacoteJuiz.findFirst({
    where: {
      tenantId: params.tenantId,
      pacoteId: params.pacoteId,
      status: PACOTE_STATUS_ATIVA,
      OR: [{ dataFim: null }, { dataFim: { gt: new Date() } }],
    },
  });

  if (assinaturaAtiva) {
    throw new Error("Este pacote já está ativo para o escritório");
  }

  let assinatura = await prisma.assinaturaPacoteJuiz.findFirst({
    where: {
      tenantId: params.tenantId,
      pacoteId: params.pacoteId,
      status: PACOTE_STATUS_PENDENTE,
    },
    include: {
      pacote: {
        include: {
          juizes: {
            where: {
              ativo: true,
            },
            select: {
              juizId: true,
            },
          },
        },
      },
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
          documento: true,
          email: true,
          telefone: true,
          razaoSocial: true,
          nomeFantasia: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!assinatura) {
    assinatura = await prisma.assinaturaPacoteJuiz.create({
      data: {
        tenantId: params.tenantId,
        pacoteId: params.pacoteId,
        status: PACOTE_STATUS_PENDENTE,
        precoPago: Number(pacote.preco),
        formaPagamento: params.billingType,
        renovacaoAutomatica: false,
      },
      include: {
        pacote: {
          include: {
            juizes: {
              where: {
                ativo: true,
              },
              select: {
                juizId: true,
              },
            },
          },
        },
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            documento: true,
            email: true,
            telefone: true,
            razaoSocial: true,
            nomeFantasia: true,
          },
        },
      },
    });
  } else if (assinatura.formaPagamento !== params.billingType) {
    assinatura = await prisma.assinaturaPacoteJuiz.update({
      where: { id: assinatura.id },
      data: {
        formaPagamento: params.billingType,
        updatedAt: new Date(),
      },
      include: {
        pacote: {
          include: {
            juizes: {
              where: {
                ativo: true,
              },
              select: {
                juizId: true,
              },
            },
          },
        },
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            documento: true,
            email: true,
            telefone: true,
            razaoSocial: true,
            nomeFantasia: true,
          },
        },
      },
    });
  }

  if (params.billingType === "CREDIT_CARD") {
    const snapshot = await getPacoteInvoiceSnapshot(
      params.tenantId,
      assinatura.id,
      {
        billingType: params.billingType,
        value: Number(assinatura.precoPago),
        status: PACOTE_STATUS_PENDENTE,
      },
    );

    return {
      assinatura,
      payment: snapshot,
    };
  }

  const client = getPlatformAsaasClient();

  if (!client) {
    const mockPayment = await createFallbackMockPayment({
      assinatura,
      billingType: params.billingType,
      autoConfirm: false,
    });

    return {
      assinatura,
      payment: buildSnapshotFromInvoice(
        await findPacoteInvoice(params.tenantId, assinatura.id),
        {
          billingType: params.billingType,
          value: Number(assinatura.precoPago),
          status: mockPayment.status,
        },
      ),
    };
  }

  try {
    const { customerId } = await ensurePlatformCustomer(params.tenantId, client);
    const payment = await client.createPayment({
      customer: customerId,
      billingType: params.billingType,
      value: Number(assinatura.precoPago),
      dueDate: formatDateForAsaas(
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ),
      description: `Pacote premium ${assinatura.pacote.nome} - Magic Lawyer`,
      externalReference: buildPacoteAssinaturaExternalReference(assinatura.id),
    });

    let paymentDetails = payment;

    if (payment.id) {
      paymentDetails = await client.getPayment(payment.id);
      if (params.billingType === "PIX" && payment.id) {
        try {
          const pixQrCode = await client.generatePixQrCode(payment.id);
          paymentDetails = {
            ...paymentDetails,
            pixTransaction: {
              payload:
                pixQrCode.payload ??
                paymentDetails.pixTransaction?.payload ??
                undefined,
              qrCodeUrl:
                pixQrCode.qrCodeUrl ??
                paymentDetails.pixTransaction?.qrCodeUrl ??
                undefined,
              qrCode:
                pixQrCode.qrCode ??
                paymentDetails.pixTransaction?.qrCode ??
                undefined,
              encodedImage:
                pixQrCode.encodedImage ??
                paymentDetails.pixTransaction?.encodedImage ??
                undefined,
              expirationDate:
                pixQrCode.expirationDate ??
                paymentDetails.pixTransaction?.expirationDate ??
                undefined,
            },
          };
        } catch (error) {
          logger.warn(
            "[PacotesJuizCommerce] Falha ao buscar QR Code PIX do pacote",
            {
              error,
              assinaturaId: assinatura.id,
            },
          );
        }
      }
    }

    await upsertPacoteInvoice({
      assinatura,
      billingType: params.billingType,
      payment: paymentDetails,
      isMock: false,
    });

    return {
      assinatura,
      payment: buildSnapshotFromInvoice(
        await findPacoteInvoice(params.tenantId, assinatura.id),
        {
          billingType: params.billingType,
          value: Number(assinatura.precoPago),
          status: paymentDetails.status,
        },
      ),
    };
  } catch (error) {
    if (!isDevelopmentRuntime()) {
      throw error;
    }

    logger.warn(
      "[PacotesJuizCommerce] Caindo para cobrança simulada em desenvolvimento",
      {
        error,
        tenantId: params.tenantId,
        pacoteId: params.pacoteId,
      },
    );

    const mockPayment = await createFallbackMockPayment({
      assinatura,
      billingType: params.billingType,
      autoConfirm: false,
    });

    return {
      assinatura,
      payment: buildSnapshotFromInvoice(
        await findPacoteInvoice(params.tenantId, assinatura.id),
        {
          billingType: params.billingType,
          value: Number(assinatura.precoPago),
          status: mockPayment.status,
        },
      ),
    };
  }
}

export async function processPacoteCreditCardPayment(params: {
  tenantId: string;
  assinaturaId: string;
  paymentData: {
    cardNumber: string;
    cardName: string;
    expiryMonth: string;
    expiryYear: string;
    cvv: string;
  };
}) {
  const assinatura = await prisma.assinaturaPacoteJuiz.findFirst({
    where: {
      id: params.assinaturaId,
      tenantId: params.tenantId,
      status: {
        in: [PACOTE_STATUS_PENDENTE, PACOTE_STATUS_INADIMPLENTE],
      },
    },
    include: {
      pacote: {
        include: {
          juizes: {
            where: {
              ativo: true,
            },
            select: {
              juizId: true,
            },
          },
        },
      },
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
          documento: true,
          email: true,
          telefone: true,
          razaoSocial: true,
          nomeFantasia: true,
        },
      },
    },
  });

  if (!assinatura) {
    throw new Error("Checkout do pacote não encontrado");
  }

  const client = getPlatformAsaasClient();

  if (!client) {
    const mockPayment = await createFallbackMockPayment({
      assinatura,
      billingType: "CREDIT_CARD",
      autoConfirm: true,
    });

    return {
      assinaturaId: assinatura.id,
      status: "CONFIRMED",
      payment: buildSnapshotFromInvoice(
        await findPacoteInvoice(params.tenantId, assinatura.id),
        {
          billingType: "CREDIT_CARD",
          value: Number(assinatura.precoPago),
          status: mockPayment.status,
        },
      ),
    };
  }

  try {
    const { customerId } = await ensurePlatformCustomer(params.tenantId, client);
    const document =
      assinatura.tenant.documento?.replace(/\D/g, "") ||
      `${assinatura.tenantId}`.replace(/\D/g, "").slice(0, 11).padEnd(11, "0");
    const phone = assinatura.tenant.telefone?.replace(/\D/g, "") || undefined;
    const payment = await client.createPayment({
      customer: customerId,
      billingType: "CREDIT_CARD",
      value: Number(assinatura.precoPago),
      dueDate: formatDateForAsaas(
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ),
      description: `Pacote premium ${assinatura.pacote.nome} - Magic Lawyer`,
      externalReference: buildPacoteAssinaturaExternalReference(assinatura.id),
      creditCard: {
        holderName: params.paymentData.cardName,
        number: params.paymentData.cardNumber.replace(/\D/g, ""),
        expiryMonth: params.paymentData.expiryMonth,
        expiryYear:
          params.paymentData.expiryYear.length === 2
            ? `20${params.paymentData.expiryYear}`
            : params.paymentData.expiryYear,
        ccv: params.paymentData.cvv.replace(/\D/g, ""),
      },
      creditCardHolderInfo: {
        name: params.paymentData.cardName,
        email: assinatura.tenant.email || "financeiro@magiclawyer.local",
        cpfCnpj: formatCpfCnpjForAsaas(document),
        ...(phone ? { phone, mobilePhone: phone } : {}),
      },
    });

    const paymentDetails = payment.id
      ? await client.getPayment(payment.id)
      : payment;

    await upsertPacoteInvoice({
      assinatura,
      billingType: "CREDIT_CARD",
      payment: paymentDetails,
      isMock: false,
    });

    if (paymentDetails.status === "CONFIRMED") {
      await activatePacoteSubscription({
        assinaturaId: assinatura.id,
        payment: paymentDetails,
        billingType: "CREDIT_CARD",
      });

      return {
        assinaturaId: assinatura.id,
        status: "CONFIRMED",
        payment: buildSnapshotFromInvoice(
          await findPacoteInvoice(params.tenantId, assinatura.id),
          {
            billingType: "CREDIT_CARD",
            value: Number(assinatura.precoPago),
            status: "CONFIRMED",
          },
        ),
      };
    }

    return {
      assinaturaId: assinatura.id,
      status: paymentDetails.status ?? PACOTE_STATUS_PENDENTE,
      payment: buildSnapshotFromInvoice(
        await findPacoteInvoice(params.tenantId, assinatura.id),
        {
          billingType: "CREDIT_CARD",
          value: Number(assinatura.precoPago),
          status: paymentDetails.status,
        },
      ),
    };
  } catch (error) {
    if (!isDevelopmentRuntime()) {
      throw error;
    }

    logger.warn(
      "[PacotesJuizCommerce] Caindo para pagamento mock em cartão",
      {
        error,
        assinaturaId: assinatura.id,
      },
    );

    const mockPayment = await createFallbackMockPayment({
      assinatura,
      billingType: "CREDIT_CARD",
      autoConfirm: true,
    });

    return {
      assinaturaId: assinatura.id,
      status: "CONFIRMED",
      payment: buildSnapshotFromInvoice(
        await findPacoteInvoice(params.tenantId, assinatura.id),
        {
          billingType: "CREDIT_CARD",
          value: Number(assinatura.precoPago),
          status: mockPayment.status,
        },
      ),
    };
  }
}

export async function confirmPacotePaymentInDevelopment(params: {
  tenantId: string;
  assinaturaId: string;
}) {
  if (!isDevelopmentRuntime()) {
    throw new Error("Simulação disponível apenas em desenvolvimento");
  }

  const assinatura = await prisma.assinaturaPacoteJuiz.findFirst({
    where: {
      id: params.assinaturaId,
      tenantId: params.tenantId,
    },
    include: {
      pacote: {
        include: {
          juizes: {
            where: {
              ativo: true,
            },
            select: {
              juizId: true,
            },
          },
        },
      },
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
          documento: true,
          email: true,
          telefone: true,
          razaoSocial: true,
          nomeFantasia: true,
        },
      },
    },
  });

  if (!assinatura) {
    throw new Error("Assinatura do pacote não encontrada");
  }

  const payment = await createFallbackMockPayment({
    assinatura,
    billingType:
      (assinatura.formaPagamento as "PIX" | "BOLETO" | "CREDIT_CARD") || "PIX",
    autoConfirm: true,
  });

  return {
    assinaturaId: assinatura.id,
    status: "CONFIRMED",
    payment: buildSnapshotFromInvoice(
      await findPacoteInvoice(params.tenantId, assinatura.id),
      {
        billingType:
          (assinatura.formaPagamento as
            | "PIX"
            | "BOLETO"
            | "CREDIT_CARD"
            | null) ?? "PIX",
        value: Number(assinatura.precoPago),
        status: payment.status,
      },
    ),
  };
}

export async function listTenantPacotesCatalog(tenantId: string) {
  await expirePacoteSubscriptions(tenantId);

  const [pacotes, assinaturas] = await Promise.all([
    prisma.pacoteJuiz.findMany({
      where: {
        isPublico: true,
        status: {
          in: ["ATIVO", "PROMOCIONAL"],
        },
      },
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
        juizes: {
          where: {
            ativo: true,
          },
          include: {
            juiz: {
              select: {
                id: true,
                nome: true,
                tipoAutoridade: true,
                comarca: true,
                vara: true,
                especialidades: true,
              },
            },
          },
          orderBy: {
            ordemExibicao: "asc",
          },
          take: 5,
        },
      },
      orderBy: [{ ordemExibicao: "asc" }, { nome: "asc" }],
    }),
    prisma.assinaturaPacoteJuiz.findMany({
      where: {
        tenantId,
      },
      orderBy: [{ createdAt: "desc" }],
    }),
  ]);

  return Promise.all(
    pacotes.map(async (pacote) => {
      const subscription = assinaturas.find((item) => item.pacoteId === pacote.id);
      const payment = subscription
        ? await getPacoteInvoiceSnapshot(tenantId, subscription.id, {
            billingType: subscription.formaPagamento,
            value: Number(subscription.precoPago),
            status: subscription.status,
          })
        : null;

      return {
        ...pacote,
        preco: Number(pacote.preco),
        autoridadePreview: pacote.juizes.map((item) => ({
          id: item.juiz.id,
          nome: item.juiz.nome,
          tipoAutoridade: item.juiz.tipoAutoridade,
          comarca: item.juiz.comarca,
          vara: item.juiz.vara,
          especialidades: item.juiz.especialidades,
        })),
        assinaturaAtual: subscription
          ? {
              id: subscription.id,
              status: subscription.status,
              dataInicio: subscription.dataInicio,
              dataFim: subscription.dataFim,
              formaPagamento: subscription.formaPagamento,
              precoPago: Number(subscription.precoPago),
              renovacaoAutomatica: subscription.renovacaoAutomatica,
              payment,
            }
          : null,
      };
    }),
  );
}

export async function listTenantPacoteSubscriptions(tenantId: string) {
  await expirePacoteSubscriptions(tenantId);

  const assinaturas = await prisma.assinaturaPacoteJuiz.findMany({
    where: {
      tenantId,
    },
    include: {
      pacote: {
        include: {
          _count: {
            select: {
              juizes: {
                where: {
                  ativo: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  return Promise.all(
    assinaturas.map(async (assinatura) => ({
      id: assinatura.id,
      status: assinatura.status,
      dataInicio: assinatura.dataInicio,
      dataFim: assinatura.dataFim,
      renovacaoAutomatica: assinatura.renovacaoAutomatica,
      precoPago: Number(assinatura.precoPago),
      formaPagamento: assinatura.formaPagamento,
      pacote: {
        id: assinatura.pacote.id,
        nome: assinatura.pacote.nome,
        descricao: assinatura.pacote.descricao,
        cor: assinatura.pacote.cor,
        icone: assinatura.pacote.icone,
        duracaoDias: assinatura.pacote.duracaoDias,
        autoridadeCount: assinatura.pacote._count.juizes,
      },
      payment: await getPacoteInvoiceSnapshot(tenantId, assinatura.id, {
        billingType: assinatura.formaPagamento,
        value: Number(assinatura.precoPago),
        status: assinatura.status,
      }),
    })),
  );
}

export async function listRecentPacoteSubscriptionsForAdmin() {
  const assinaturas = await prisma.assinaturaPacoteJuiz.findMany({
    include: {
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      pacote: {
        select: {
          id: true,
          nome: true,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 12,
  });

  return assinaturas.map((assinatura) => ({
    id: assinatura.id,
    status: assinatura.status,
    dataInicio: assinatura.dataInicio,
    dataFim: assinatura.dataFim,
    precoPago: Number(assinatura.precoPago),
    formaPagamento: assinatura.formaPagamento,
    createdAt: assinatura.createdAt,
    tenant: assinatura.tenant,
    pacote: assinatura.pacote,
  }));
}
