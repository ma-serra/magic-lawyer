import { Resend } from "resend";

import logger from "@/lib/logger";

const createResendClient = () => {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY não configurada");
  }

  return new Resend(apiKey);
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim() !== "") {
      return message;
    }
  }

  return fallback;
};

const toBase64AttachmentContent = (content: Buffer | string) => {
  if (Buffer.isBuffer(content)) {
    return content.toString("base64");
  }

  return Buffer.from(content).toString("base64");
};

// Interface para opções de email
export interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

// Função para enviar email
export const sendEmail = async (options: EmailOptions) => {
  try {
    const resend = createResendClient();
    const from = process.env.RESEND_FROM_EMAIL;

    if (!from) {
      throw new Error("RESEND_FROM_EMAIL não configurado");
    }

    if (!options.html && !options.text) {
      throw new Error("É necessário informar html ou text para envio de email");
    }

    const basePayload = {
      from,
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      attachments: options.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: toBase64AttachmentContent(attachment.content),
        contentType: attachment.contentType,
      })),
    };

    const payload = options.html
      ? {
          ...basePayload,
          html: options.html,
          text: options.text,
        }
      : {
          ...basePayload,
          text: options.text!,
        };

    const { data, error } = await resend.emails.send(payload);

    if (error) {
      return {
        success: false,
        error: getErrorMessage(error, "Falha ao enviar email via Resend"),
      };
    }

    logger.info("Email enviado com sucesso:", data?.id);

    return { success: true, messageId: data?.id };
  } catch (error) {
    logger.error("Erro ao enviar email:", error);

    return {
      success: false,
      error: getErrorMessage(error, "Erro desconhecido"),
    };
  }
};

// Função para verificar a conexão com a API do Resend
export const verifyEmailConnection = async () => {
  try {
    const resend = createResendClient();
    const { error } = await resend.domains.list();

    if (error) {
      logger.error("Falha na verificação da API Resend:", error);
      return {
        success: false,
        error: getErrorMessage(error, "Falha ao validar API key do Resend"),
      };
    }

    logger.info("Conexão Resend verificada com sucesso");

    return { success: true };
  } catch (error) {
    logger.error("Erro na verificação Resend:", error);

    return {
      success: false,
      error: getErrorMessage(error, "Erro desconhecido"),
    };
  }
};

// Templates de email
export const emailTemplates = {
  // Template para notificação de novo evento
  novoEvento: (evento: {
    titulo: string;
    dataInicio: string;
    local?: string;
    linkAcesso?: string;
    descricao?: string;
  }) => ({
    subject: `Novo evento agendado: ${evento.titulo}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Novo Evento Agendado</h2>
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px;">
          <h3 style="margin-top: 0; color: #2c3e50;">${evento.titulo}</h3>
          <p><strong>Data/Hora:</strong> ${evento.dataInicio}</p>
          ${evento.local ? `<p><strong>Local:</strong> ${evento.local}</p>` : ""}
          ${evento.linkAcesso ? `<p><strong>Link do evento:</strong> <a href="${evento.linkAcesso}">${evento.linkAcesso}</a></p>` : ""}
          ${evento.descricao ? `<p><strong>Descrição:</strong> ${evento.descricao}</p>` : ""}
        </div>
        <p style="color: #666; font-size: 14px; margin-top: 20px;">
          Este é um email automático do sistema Magic Lawyer.
        </p>
      </div>
    `,
  }),

  // Template para lembrete de evento
  lembreteEvento: (evento: {
    titulo: string;
    dataInicio: string;
    local?: string;
    linkAcesso?: string;
    minutosRestantes: number;
  }) => ({
    subject: `Lembrete: ${evento.titulo} em ${evento.minutosRestantes} minutos`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #e74c3c;">Lembrete de Evento</h2>
        <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; border-left: 4px solid #ffc107;">
          <h3 style="margin-top: 0; color: #856404;">${evento.titulo}</h3>
          <p><strong>Data/Hora:</strong> ${evento.dataInicio}</p>
          ${evento.local ? `<p><strong>Local:</strong> ${evento.local}</p>` : ""}
          ${evento.linkAcesso ? `<p><strong>Link do evento:</strong> <a href="${evento.linkAcesso}">${evento.linkAcesso}</a></p>` : ""}
          <p style="color: #856404; font-weight: bold;">
            ⏰ Evento em ${evento.minutosRestantes} minutos
          </p>
        </div>
        <p style="color: #666; font-size: 14px; margin-top: 20px;">
          Este é um lembrete automático do sistema Magic Lawyer.
        </p>
      </div>
    `,
  }),

  // Template para documento para assinatura
  documentoAssinatura: (documento: {
    titulo: string;
    urlAssinatura: string;
    dataExpiracao?: string;
    descricao?: string;
  }) => ({
    subject: `Documento para assinatura: ${documento.titulo}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Documento para Assinatura</h2>
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
          <h3 style="margin-top: 0; color: #2c3e50;">${documento.titulo}</h3>
          ${documento.descricao ? `<p><strong>Descrição:</strong> ${documento.descricao}</p>` : ""}
          ${documento.dataExpiracao ? `<p><strong>Expira em:</strong> ${documento.dataExpiracao}</p>` : ""}
          <div style="text-align: center; margin: 30px 0;">
            <a href="${documento.urlAssinatura}" 
               style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              Assinar Documento
            </a>
          </div>
        </div>
        <p style="color: #666; font-size: 14px; margin-top: 20px;">
          Este é um email automático do sistema Magic Lawyer.
        </p>
      </div>
    `,
  }),

  // Template para notificação financeira
  notificacaoFinanceira: (dados: {
    tipo: "fatura" | "pagamento" | "vencimento";
    titulo: string;
    valor?: string;
    dataVencimento?: string;
    descricao?: string;
  }) => ({
    subject: `Notificação Financeira: ${dados.titulo}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Notificação Financeira</h2>
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
          <h3 style="margin-top: 0; color: #2c3e50;">${dados.titulo}</h3>
          ${dados.descricao ? `<p><strong>Descrição:</strong> ${dados.descricao}</p>` : ""}
          ${dados.valor ? `<p><strong>Valor:</strong> ${dados.valor}</p>` : ""}
          ${dados.dataVencimento ? `<p><strong>Vencimento:</strong> ${dados.dataVencimento}</p>` : ""}
        </div>
        <p style="color: #666; font-size: 14px; margin-top: 20px;">
          Este é um email automático do sistema Magic Lawyer.
        </p>
      </div>
    `,
  }),
};
