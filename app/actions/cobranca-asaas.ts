"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import QRCode from "qrcode";

import { authOptions } from "@/auth";
import prisma from "@/app/lib/prisma";
import {
  AsaasClient,
  type AsaasCustomer,
  type AsaasPayment,
  type AsaasPaymentStatus,
  createAsaasClientFromEncrypted,
  formatCpfCnpjForAsaas,
  formatDateForAsaas,
  formatValueForAsaas,
} from "@/lib/asaas";
import { Prisma, type ContratoParcelaStatus } from "@/generated/prisma";

type ParcelaComRelacionamentos = Prisma.ContratoParcelaGetPayload<{
  include: {
    contrato: {
      include: {
        cliente: { include: { enderecos: true } };
        dadosBancarios: { include: { banco: true } };
      };
    };
    dadosBancarios: { include: { banco: true } };
  };
}>;

type AsaasContext =
  | {
      success: true;
      parcela: ParcelaComRelacionamentos;
      asaasClient: AsaasClient;
      tenantId: string;
    }
  | { success: false; error: string };

type EnsureCustomerResult =
  | { success: true; customerId: string }
  | { success: false; error: string };

// ============================================
// Helpers
// ============================================

function mapAsaasStatusToParcela(
  status?: AsaasPaymentStatus,
): ContratoParcelaStatus {
  switch (status) {
    case "CONFIRMED":
    case "RECEIVED":
    case "RECEIVED_IN_CASH":
      return "PAGA";
    case "OVERDUE":
      return "ATRASADA";
    case "CANCELED":
    case "CANCELLED":
      return "CANCELADA";
    default:
      return "PENDENTE";
  }
}

function sanitizeDigits(value?: string | null): string | undefined {
  const digits = value?.replace(/\D/g, "");

  return digits && digits.length > 0 ? digits : undefined;
}

function isJsonObject(
  value: Prisma.JsonValue | null | undefined,
): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toJsonValue(value: unknown): Prisma.JsonValue | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    const items = value
      .map((item) => toJsonValue(item))
      .filter((item): item is Prisma.JsonValue => item !== undefined);

    return items;
  }

  if (typeof value === "object" && value) {
    const result: Prisma.JsonObject = {};

    for (const [key, entry] of Object.entries(value)) {
      const jsonValue = toJsonValue(entry);

      if (jsonValue !== undefined) {
        result[key] = jsonValue;
      }
    }

    return result;
  }

  return undefined;
}

function createJsonObject(data: Record<string, unknown>): Prisma.JsonObject {
  const result: Prisma.JsonObject = {};

  for (const [key, value] of Object.entries(data)) {
    const jsonValue = toJsonValue(value);

    if (jsonValue !== undefined) {
      result[key] = jsonValue;
    }
  }

  return result;
}

async function getAsaasContext(
  parcelaId: string,
  tenantId: string,
): Promise<AsaasContext> {
  const parcela = await prisma.contratoParcela.findFirst({
    where: {
      id: parcelaId,
      tenantId,
    },
    include: {
      contrato: {
        include: {
          cliente: { include: { enderecos: true } },
          dadosBancarios: { include: { banco: true } },
        },
      },
      dadosBancarios: { include: { banco: true } },
    },
  });

  if (!parcela) {
    return { success: false, error: "Parcela não encontrada" };
  }

  const asaasConfig = await prisma.tenantAsaasConfig.findUnique({
    where: { tenantId },
  });

  if (!asaasConfig || !asaasConfig.integracaoAtiva) {
    return {
      success: false,
      error: "Configuração Asaas não encontrada ou inativa",
    };
  }

  const asaasClient = createAsaasClientFromEncrypted(
    asaasConfig.asaasApiKey,
    asaasConfig.ambiente.toLowerCase() as "sandbox" | "production",
  );

  return { success: true, parcela, asaasClient, tenantId };
}

async function ensureAsaasCustomer(
  asaasClient: AsaasClient,
  cliente: ParcelaComRelacionamentos["contrato"]["cliente"],
): Promise<EnsureCustomerResult> {
  if (cliente.asaasCustomerId) {
    return { success: true, customerId: cliente.asaasCustomerId };
  }

  const documento = cliente.documento?.trim();

  if (!documento) {
    return {
      success: false,
      error:
        "O cliente precisa ter um CPF/CNPJ cadastrado para gerar cobranças.",
    };
  }

  const existing = await asaasClient.findCustomerByCpfCnpj(documento);

  if (existing?.id) {
    await prisma.cliente.update({
      where: { id: cliente.id },
      data: { asaasCustomerId: existing.id },
    });

    return { success: true, customerId: existing.id };
  }

  const endereco =
    cliente.enderecos.find((item) => item.principal) ?? cliente.enderecos[0];

  const defaultEmail = cliente.email || `cliente-${cliente.id}@magiclawyer.com`;
  const telefone =
    sanitizeDigits(cliente.telefone) ?? sanitizeDigits(cliente.celular);
  const celular =
    sanitizeDigits(cliente.celular) ?? sanitizeDigits(cliente.telefone);

  const payload: AsaasCustomer = {
    name: cliente.nome,
    email: defaultEmail,
    cpfCnpj: formatCpfCnpjForAsaas(documento),
    country: "Brasil",
  };

  if (telefone) payload.phone = telefone;
  if (celular) payload.mobilePhone = celular;
  if (endereco?.logradouro) payload.address = endereco.logradouro;
  if (endereco?.numero) payload.addressNumber = endereco.numero;
  if (endereco?.complemento) payload.complement = endereco.complemento;
  if (endereco?.bairro) payload.province = endereco.bairro;
  if (endereco?.cidade) payload.city = endereco.cidade;
  if (endereco?.estado) payload.state = endereco.estado;
  if (endereco?.cep) payload.postalCode = sanitizeDigits(endereco.cep);

  const newCustomer = await asaasClient.createCustomer(payload);

  if (!newCustomer.id) {
    return {
      success: false,
      error: "Não foi possível criar o cliente no Asaas.",
    };
  }

  await prisma.cliente.update({
    where: { id: cliente.id },
    data: { asaasCustomerId: newCustomer.id },
  });

  return { success: true, customerId: newCustomer.id };
}

async function persistParcelaPagamento({
  parcelaId,
  billingType,
  asaasPayment,
  dadosPagamento,
}: {
  parcelaId: string;
  billingType: string;
  asaasPayment: AsaasPayment;
  dadosPagamento: Prisma.JsonObject;
}) {
  const dataPagamento = asaasPayment.confirmedDate
    ? new Date(asaasPayment.confirmedDate)
    : null;

  await prisma.contratoParcela.update({
    where: { id: parcelaId },
    data: {
      formaPagamento: billingType,
      asaasPaymentId: asaasPayment.id ?? null,
      status: mapAsaasStatusToParcela(asaasPayment.status),
      dataPagamento,
      dadosPagamento,
      updatedAt: new Date(),
    },
  });
}

function buildPixPaymentData(params: {
  valor: number;
  vencimento: Date;
  status?: AsaasPaymentStatus;
  qrCode: string;
  qrCodeImage: string | null;
  chavePix: string;
  payload?: string | null;
  expirationDate?: string | null;
}): Prisma.JsonObject {
  const {
    valor,
    vencimento,
    status,
    qrCode,
    qrCodeImage,
    chavePix,
    payload,
    expirationDate,
  } = params;

  return createJsonObject({
    tipo: "PIX",
    valor,
    status: status ?? "PENDING",
    vencimento,
    qrCode,
    qrCodeImage,
    chavePix,
    payload,
    expirationDate,
  });
}

function buildBoletoPaymentData(params: {
  valor: number;
  vencimento: Date;
  status?: AsaasPaymentStatus;
  codigoBarras?: string | null;
  linhaDigitavel?: string | null;
  linkBoleto?: string | null;
}): Prisma.JsonObject {
  const {
    valor,
    vencimento,
    status,
    codigoBarras,
    linhaDigitavel,
    linkBoleto,
  } = params;

  return createJsonObject({
    tipo: "BOLETO",
    valor,
    status: status ?? "PENDING",
    vencimento,
    codigoBarras,
    linhaDigitavel,
    linkBoleto,
  });
}

function buildCartaoPaymentData(params: {
  valor: number;
  vencimento: Date;
  status?: AsaasPaymentStatus;
}): Prisma.JsonObject {
  const { valor, vencimento, status } = params;

  return createJsonObject({
    tipo: "CARTAO",
    valor,
    status: status ?? "PROCESSING",
    vencimento,
  });
}

// ============================================
// PIX Dinâmico
// ============================================

export async function gerarPixDinamico(data: {
  parcelaId: string;
  valor: number;
  descricao?: string;
  vencimento?: Date;
}) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.tenantId) {
      return { success: false, error: "Não autenticado" };
    }

    const context = await getAsaasContext(
      data.parcelaId,
      session.user.tenantId,
    );

    if (!context.success) {
      return context;
    }

    const { parcela, asaasClient } = context;
    const customerResult = await ensureAsaasCustomer(
      asaasClient,
      parcela.contrato.cliente,
    );

    if (!customerResult.success) {
      return customerResult;
    }

    const vencimento = data.vencimento ?? new Date();

    const asaasPayment = await asaasClient.createPayment({
      customer: customerResult.customerId,
      billingType: "PIX",
      value: formatValueForAsaas(data.valor),
      dueDate: formatDateForAsaas(vencimento),
      description:
        data.descricao ??
        `Parcela ${parcela.numeroParcela} - ${parcela.contrato.cliente.nome}`,
      externalReference: `parcela_${parcela.id}`,
    });

    if (!asaasPayment.id) {
      throw new Error("Pagamento não retornou um ID");
    }

    const pixQrCode = await asaasClient.generatePixQrCode(asaasPayment.id);
    const qrCodePayload = pixQrCode.payload ?? pixQrCode.qrCode ?? "";
    const qrCodeValue = qrCodePayload || pixQrCode.encodedImage || "";
    const qrCodeImage =
      pixQrCode.encodedImage ??
      (qrCodePayload ? await QRCode.toDataURL(qrCodePayload) : null);

    if (!qrCodeValue) {
      throw new Error("Dados do QR Code não retornados pelo Asaas");
    }

    const dadosPagamento = buildPixPaymentData({
      valor: data.valor,
      vencimento,
      status: asaasPayment.status,
      qrCode: qrCodeValue,
      qrCodeImage,
      chavePix: qrCodePayload,
      payload: pixQrCode.payload ?? null,
      expirationDate: pixQrCode.expirationDate ?? null,
    });

    await persistParcelaPagamento({
      parcelaId: parcela.id,
      billingType: "PIX",
      asaasPayment,
      dadosPagamento,
    });

    // Notificar criação de pagamento PIX
    try {
      const { NotificationService } = await import(
        "@/app/lib/notifications/notification-service"
      );
      const { NotificationFactory } = await import(
        "@/app/lib/notifications/domain/notification-factory"
      );

      // Buscar dados da parcela e contrato
      const parcelaCompleta = await prisma.contratoParcela.findUnique({
        where: { id: parcela.id },
        include: {
          contrato: {
            include: {
              cliente: true,
              advogadoResponsavel: {
                include: {
                  usuario: {
                    select: { id: true },
                  },
                },
              },
            },
          },
        },
      });

      if (parcelaCompleta) {
        const recipients: string[] = [];

        // Admin do tenant
        const admin = await prisma.usuario.findFirst({
          where: {
            tenantId: parcelaCompleta.tenantId,
            role: "ADMIN",
          },
          select: { id: true },
        });

        if (admin) recipients.push(admin.id);

        // Advogado responsável
        if (parcelaCompleta.contrato.advogadoResponsavel?.usuario?.id) {
          recipients.push(
            parcelaCompleta.contrato.advogadoResponsavel.usuario.id,
          );
        }

        // Responsável pela parcela
        if (parcelaCompleta.responsavelUsuarioId) {
          recipients.push(parcelaCompleta.responsavelUsuarioId);
        }

        // Enviar notificação
        for (const recipientId of recipients) {
          const event = NotificationFactory.createEvent(
            "boleto.generated",
            parcelaCompleta.tenantId,
            recipientId,
            {
              parcelaId: parcelaCompleta.id,
              contratoId: parcelaCompleta.contratoId,
              valor: Number(parcelaCompleta.valor),
              metodo: "PIX",
              clienteNome: parcelaCompleta.contrato.cliente.nome,
              dataVencimento: parcelaCompleta.dataVencimento.toISOString(),
            },
          );

          await NotificationService.publishNotification(event);
        }
      }
    } catch (notificationError) {
      console.error(
        "[CobrancaAsaas] Erro ao enviar notificação PIX:",
        notificationError,
      );
    }

    revalidatePath("/parcelas");
    revalidatePath("/financeiro/parcelas");

    return {
      success: true,
      data: {
        paymentId: asaasPayment.id,
        qrCode: qrCodeValue,
        qrCodeImage,
        chavePix: qrCodePayload,
        valor: data.valor,
        vencimento,
      },
    };
  } catch (error) {
    console.error("Erro ao gerar PIX dinâmico:", error);

    return { success: false, error: "Erro ao gerar PIX" };
  }
}

// ============================================
// Boleto
// ============================================

export async function gerarBoletoAsaas(data: {
  parcelaId: string;
  valor: number;
  descricao?: string;
  vencimento?: Date;
}) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.tenantId) {
      return { success: false, error: "Não autenticado" };
    }

    const context = await getAsaasContext(
      data.parcelaId,
      session.user.tenantId,
    );

    if (!context.success) {
      return context;
    }

    const { parcela, asaasClient } = context;
    const customerResult = await ensureAsaasCustomer(
      asaasClient,
      parcela.contrato.cliente,
    );

    if (!customerResult.success) {
      return customerResult;
    }

    const vencimento = data.vencimento ?? new Date();

    const asaasPayment = await asaasClient.createPayment({
      customer: customerResult.customerId,
      billingType: "BOLETO",
      value: formatValueForAsaas(data.valor),
      dueDate: formatDateForAsaas(vencimento),
      description:
        data.descricao ??
        `Parcela ${parcela.numeroParcela} - ${parcela.contrato.cliente.nome}`,
      externalReference: `parcela_${parcela.id}`,
    });

    if (!asaasPayment.id) {
      throw new Error("Pagamento não retornou um ID");
    }

    const linhaDigitavel =
      asaasPayment.digitableLine ?? asaasPayment.identificationField ?? null;
    const dadosPagamento = buildBoletoPaymentData({
      valor: data.valor,
      vencimento,
      status: asaasPayment.status,
      codigoBarras: asaasPayment.identificationField ?? null,
      linhaDigitavel,
      linkBoleto: asaasPayment.bankSlipUrl ?? asaasPayment.invoiceUrl ?? null,
    });

    await persistParcelaPagamento({
      parcelaId: parcela.id,
      billingType: "BOLETO",
      asaasPayment,
      dadosPagamento,
    });

    // Notificar criação de boleto
    try {
      const { NotificationService } = await import(
        "@/app/lib/notifications/notification-service"
      );
      const { NotificationFactory } = await import(
        "@/app/lib/notifications/domain/notification-factory"
      );

      // Buscar dados da parcela e contrato
      const parcelaCompleta = await prisma.contratoParcela.findUnique({
        where: { id: parcela.id },
        include: {
          contrato: {
            include: {
              cliente: true,
              advogadoResponsavel: {
                include: {
                  usuario: {
                    select: { id: true },
                  },
                },
              },
            },
          },
        },
      });

      if (parcelaCompleta) {
        const recipients: string[] = [];

        // Admin do tenant
        const admin = await prisma.usuario.findFirst({
          where: {
            tenantId: parcelaCompleta.tenantId,
            role: "ADMIN",
          },
          select: { id: true },
        });

        if (admin) recipients.push(admin.id);

        // Advogado responsável
        if (parcelaCompleta.contrato.advogadoResponsavel?.usuario?.id) {
          recipients.push(
            parcelaCompleta.contrato.advogadoResponsavel.usuario.id,
          );
        }

        // Responsável pela parcela
        if (parcelaCompleta.responsavelUsuarioId) {
          recipients.push(parcelaCompleta.responsavelUsuarioId);
        }

        // Enviar notificação
        const pagamentoId = asaasPayment.id;
        const boletoId =
          asaasPayment.identificationField ||
          asaasPayment.boletoUrl ||
          asaasPayment.invoiceUrl ||
          asaasPayment.id;
        const vencimentoIso = vencimento.toISOString();

        for (const recipientId of recipients) {
          const event = NotificationFactory.createEvent(
            "boleto.generated",
            parcelaCompleta.tenantId,
            recipientId,
            {
              pagamentoId,
              boletoId,
              parcelaId: parcelaCompleta.id,
              contratoId: parcelaCompleta.contratoId,
              clienteId: parcelaCompleta.contrato.clienteId,
              valor: Number(parcelaCompleta.valor),
              metodo: "BOLETO",
              clienteNome: parcelaCompleta.contrato.cliente.nome,
              vencimento: vencimentoIso,
              dataVencimento: parcelaCompleta.dataVencimento.toISOString(),
              linhaDigitavel,
            },
          );

          await NotificationService.publishNotification(event);
        }
      }
    } catch (notificationError) {
      console.error(
        "[CobrancaAsaas] Erro ao enviar notificação boleto:",
        notificationError,
      );
    }

    revalidatePath("/parcelas");
    revalidatePath("/financeiro/parcelas");

    return {
      success: true,
      data: {
        paymentId: asaasPayment.id,
        codigoBarras: asaasPayment.identificationField ?? null,
        linhaDigitavel,
        linkBoleto: asaasPayment.bankSlipUrl ?? asaasPayment.invoiceUrl ?? null,
        valor: data.valor,
        vencimento,
      },
    };
  } catch (error) {
    console.error("Erro ao gerar boleto:", error);

    return { success: false, error: "Erro ao gerar boleto" };
  }
}

// ============================================
// Cartão de Crédito
// ============================================

export async function gerarCobrancaCartao(data: {
  parcelaId: string;
  valor: number;
  descricao?: string;
  vencimento?: Date;
  dadosCartao: {
    numero: string;
    nome: string;
    cvv: string;
    mes: string;
    ano: string;
  };
}) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.tenantId) {
      return { success: false, error: "Não autenticado" };
    }

    const context = await getAsaasContext(
      data.parcelaId,
      session.user.tenantId,
    );

    if (!context.success) {
      return context;
    }

    const { parcela, asaasClient } = context;
    const customerResult = await ensureAsaasCustomer(
      asaasClient,
      parcela.contrato.cliente,
    );

    if (!customerResult.success) {
      return customerResult;
    }

    const vencimento = data.vencimento ?? new Date();
    const sanitizedCardNumber = sanitizeDigits(data.dadosCartao.numero);
    const sanitizedCvv = sanitizeDigits(data.dadosCartao.cvv);

    if (!sanitizedCardNumber || !sanitizedCvv) {
      return {
        success: false,
        error: "Dados do cartão inválidos",
      };
    }

    const enderecoPrincipal =
      parcela.contrato.cliente.enderecos.find((item) => item.principal) ??
      parcela.contrato.cliente.enderecos[0];

    const holderCpfCnpj = parcela.contrato.cliente.documento
      ? formatCpfCnpjForAsaas(parcela.contrato.cliente.documento)
      : undefined;
    const emailTitular =
      parcela.contrato.cliente.email ??
      `cliente-${parcela.contrato.cliente.id}@magiclawyer.com`;
    const postalCode = enderecoPrincipal?.cep
      ? sanitizeDigits(enderecoPrincipal.cep)
      : undefined;
    const addressNumber = enderecoPrincipal?.numero;
    const addressComplement = enderecoPrincipal?.complemento;
    const phone = sanitizeDigits(parcela.contrato.cliente.telefone);
    const mobilePhone = sanitizeDigits(parcela.contrato.cliente.celular);

    if (!holderCpfCnpj) {
      return {
        success: false,
        error:
          "Não foi possível identificar o CPF/CNPJ do responsável pelo cartão.",
      };
    }

    const asaasPayment = await asaasClient.createPayment({
      customer: customerResult.customerId,
      billingType: "CREDIT_CARD",
      value: formatValueForAsaas(data.valor),
      dueDate: formatDateForAsaas(vencimento),
      description:
        data.descricao ??
        `Parcela ${parcela.numeroParcela} - ${parcela.contrato.cliente.nome}`,
      externalReference: `parcela_${parcela.id}`,
      creditCard: {
        holderName: data.dadosCartao.nome,
        number: sanitizedCardNumber,
        expiryMonth: data.dadosCartao.mes,
        expiryYear:
          data.dadosCartao.ano.length === 2
            ? `20${data.dadosCartao.ano}`
            : data.dadosCartao.ano,
        ccv: sanitizedCvv,
      },
      creditCardHolderInfo: {
        name: data.dadosCartao.nome,
        email: emailTitular,
        cpfCnpj: holderCpfCnpj,
        ...(postalCode ? { postalCode } : {}),
        ...(addressNumber ? { addressNumber } : {}),
        ...(addressComplement ? { addressComplement } : {}),
        ...(phone ? { phone } : {}),
        ...(mobilePhone ? { mobilePhone } : {}),
      },
    });

    if (!asaasPayment.id) {
      throw new Error("Pagamento não retornou um ID");
    }

    const dadosPagamento = buildCartaoPaymentData({
      valor: data.valor,
      vencimento,
      status: asaasPayment.status,
    });

    await persistParcelaPagamento({
      parcelaId: parcela.id,
      billingType: "CREDIT_CARD",
      asaasPayment,
      dadosPagamento,
    });

    revalidatePath("/parcelas");
    revalidatePath("/financeiro/parcelas");

    return {
      success: true,
      data: {
        paymentId: asaasPayment.id,
        status: asaasPayment.status ?? "PROCESSING",
        valor: data.valor,
        vencimento,
      },
    };
  } catch (error) {
    console.error("Erro ao processar cartão:", error);

    return { success: false, error: "Erro ao processar pagamento" };
  }
}

// ============================================
// Consultar Status
// ============================================

export async function consultarStatusPagamento(paymentId: string) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.tenantId) {
      return { success: false, error: "Não autenticado" };
    }

    const asaasConfig = await prisma.tenantAsaasConfig.findUnique({
      where: { tenantId: session.user.tenantId },
    });

    if (!asaasConfig || !asaasConfig.integracaoAtiva) {
      return {
        success: false,
        error: "Configuração Asaas não encontrada ou inativa",
      };
    }

    const asaasClient = createAsaasClientFromEncrypted(
      asaasConfig.asaasApiKey,
      asaasConfig.ambiente.toLowerCase() as "sandbox" | "production",
    );

    const payment = await asaasClient.getPayment(paymentId);

    return {
      success: true,
      data: {
        paymentId: payment.id,
        status: payment.status,
        parcelaStatus: mapAsaasStatusToParcela(payment.status),
        value: payment.value,
        dueDate: payment.dueDate,
        confirmedDate: payment.confirmedDate,
        description: payment.description,
      },
    };
  } catch (error) {
    console.error("Erro ao consultar status do pagamento:", error);

    return { success: false, error: "Erro ao consultar pagamento" };
  }
}

// ============================================
// Conciliar Pagamento
// ============================================

export async function conciliarPagamento(paymentId: string) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.tenantId) {
      return { success: false, error: "Não autenticado" };
    }

    const parcela = await prisma.contratoParcela.findFirst({
      where: {
        asaasPaymentId: paymentId,
        tenantId: session.user.tenantId,
      },
    });

    if (!parcela) {
      return { success: false, error: "Parcela não encontrada" };
    }

    const asaasConfig = await prisma.tenantAsaasConfig.findUnique({
      where: { tenantId: session.user.tenantId },
    });

    if (!asaasConfig || !asaasConfig.integracaoAtiva) {
      return {
        success: false,
        error: "Configuração Asaas não encontrada ou inativa",
      };
    }

    const asaasClient = createAsaasClientFromEncrypted(
      asaasConfig.asaasApiKey,
      asaasConfig.ambiente.toLowerCase() as "sandbox" | "production",
    );

    const payment = await asaasClient.getPayment(paymentId);
    const novoStatus = mapAsaasStatusToParcela(payment.status);

    const dadosExistentes = isJsonObject(parcela.dadosPagamento)
      ? { ...parcela.dadosPagamento }
      : {};

    const dadosPagamento = createJsonObject({
      ...dadosExistentes,
      status: payment.status ?? null,
      confirmedDate: payment.confirmedDate ?? null,
    });

    await prisma.contratoParcela.update({
      where: { id: parcela.id },
      data: {
        status: novoStatus,
        dataPagamento: payment.confirmedDate
          ? new Date(payment.confirmedDate)
          : null,
        formaPagamento: payment.billingType ?? parcela.formaPagamento,
        dadosPagamento,
        updatedAt: new Date(),
      },
    });

    revalidatePath("/parcelas");
    revalidatePath("/financeiro/parcelas");

    return {
      success: true,
      data: {
        parcelaId: parcela.id,
        status: novoStatus,
        paymentStatus: payment.status,
        confirmedDate: payment.confirmedDate,
      },
    };
  } catch (error) {
    console.error("Erro ao conciliar pagamento:", error);

    return { success: false, error: "Erro ao conciliar pagamento" };
  }
}
