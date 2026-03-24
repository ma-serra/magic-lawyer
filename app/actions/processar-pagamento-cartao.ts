"use server";

import type { CheckoutData } from "./checkout";

import prisma from "@/app/lib/prisma";
import {
  AsaasClient,
  formatCpfCnpjForAsaas,
  formatDateForAsaas,
  normalizeAsaasApiKey,
  resolveAsaasEnvironment,
  type AsaasPayment,
} from "@/lib/asaas";
import { processarPagamentoConfirmado } from "@/app/actions/processar-pagamento-confirmado";

interface ProcessarPagamentoCartaoData {
  checkoutId: string;
  paymentData: {
    cardNumber: string;
    cardName: string;
    expiryMonth: string;
    expiryYear: string;
    cvv: string;
    amount: number;
    customerName: string;
  };
}

interface ProcessarPagamentoCartaoSuccess {
  success: true;
  data: {
    status: string;
    asaasPaymentId: string;
    tenantId?: string;
    tenantDomain?: string;
    subscriptionId?: string;
    credentials?: {
      email: string;
      maskedEmail: string;
      primeiroAcessoEnviado: boolean;
    };
    message?: string;
  };
  message?: string;
}

interface ProcessarPagamentoCartaoError {
  success: false;
  error: string;
}

export type ProcessarPagamentoCartaoResult =
  | ProcessarPagamentoCartaoSuccess
  | ProcessarPagamentoCartaoError;

export async function processarPagamentoCartao(
  data: ProcessarPagamentoCartaoData,
): Promise<ProcessarPagamentoCartaoResult> {
  try {
    const checkoutSession = await prisma.checkoutSession.findFirst({
      where: { id: data.checkoutId },
    });

    if (!checkoutSession) {
      return {
        success: false,
        error: `Sessão de checkout não encontrada (${data.checkoutId})`,
      };
    }

    const checkoutData = checkoutSession.dadosCheckout as CheckoutData | null;

    if (!checkoutData) {
      return {
        success: false,
        error: "Dados do checkout não encontrados para esta sessão",
      };
    }

    const plano = await prisma.plano.findUnique({
      where: { id: checkoutSession.planoId },
    });

    if (!plano) {
      return { success: false, error: "Plano não encontrado" };
    }

    const apiKey = normalizeAsaasApiKey(process.env.ASAAS_API_KEY);

    if (!apiKey) {
      throw new Error("ASAAS_API_KEY não configurada");
    }

    const asaasClient = new AsaasClient(
      apiKey,
      resolveAsaasEnvironment(process.env.ASAAS_ENVIRONMENT),
    );

    const sanitizedCardNumber = data.paymentData.cardNumber.replace(/\D/g, "");
    const sanitizedCardCvv = data.paymentData.cvv.replace(/\D/g, "");
    const sanitizedPhone = checkoutData.telefone?.replace(/\D/g, "");
    const sanitizedCep = checkoutData.cep?.replace(/\D/g, "");
    const sanitizedCpf =
      checkoutData.cpf?.replace(/\D/g, "") ||
      checkoutData.cnpj?.replace(/\D/g, "");

    if (!sanitizedCardNumber || !sanitizedCardCvv) {
      return {
        success: false,
        error: "Dados do cartão inválidos",
      };
    }

    const paymentRequest: AsaasPayment = {
      customer: checkoutSession.asaasCustomerId,
      billingType: "CREDIT_CARD",
      value: Number(data.paymentData.amount),
      dueDate: formatDateForAsaas(
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ),
      description: `Assinatura ${plano.nome} - Magic Lawyer`,
      externalReference: `checkout_${data.checkoutId}`,
      creditCard: {
        holderName: data.paymentData.cardName,
        number: sanitizedCardNumber,
        expiryMonth: data.paymentData.expiryMonth,
        expiryYear:
          data.paymentData.expiryYear.length === 2
            ? `20${data.paymentData.expiryYear}`
            : data.paymentData.expiryYear,
        ccv: sanitizedCardCvv,
      },
      creditCardHolderInfo: {
        name: data.paymentData.cardName,
        email: checkoutData.email,
        cpfCnpj: formatCpfCnpjForAsaas(sanitizedCpf || sanitizedCardNumber),
        postalCode: sanitizedCep,
        addressNumber: checkoutData.numero,
        ...(checkoutData.complemento
          ? { addressComplement: checkoutData.complemento }
          : {}),
        ...(sanitizedPhone
          ? { phone: sanitizedPhone, mobilePhone: sanitizedPhone }
          : {}),
      },
    };

    const asaasPayment = await asaasClient.createPayment(paymentRequest);

    if (!asaasPayment?.id) {
      return {
        success: false,
        error: "Erro ao criar pagamento no Asaas",
      };
    }

    await prisma.checkoutSession.update({
      where: { id: checkoutSession.id },
      data: {
        asaasPaymentId: asaasPayment.id,
        status: "PROCESSING",
      },
    });

    const paymentDetails = await asaasClient.getPayment(asaasPayment.id);

    if (paymentDetails?.status === "CONFIRMED") {
      const confirmResult = await processarPagamentoConfirmado(asaasPayment.id);

      if (confirmResult.success) {
        return {
          success: true,
          data: {
            ...confirmResult.data,
            status: "CONFIRMED",
            asaasPaymentId: asaasPayment.id,
          },
        };
      }

      return {
        success: false,
        error:
          confirmResult.error ||
          "Pagamento criado, mas não foi possível confirmar a assinatura",
      };
    }

    return {
      success: true,
      data: {
        status: paymentDetails?.status ?? "PENDING",
        asaasPaymentId: asaasPayment.id,
      },
      message: "Pagamento criado. Aguarde a confirmação.",
    };
  } catch (error) {
    console.error("Erro ao processar pagamento com cartão:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro ao processar pagamento com cartão",
    };
  }
}
