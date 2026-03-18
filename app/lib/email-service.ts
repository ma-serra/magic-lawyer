import { Resend } from "resend";

import prisma from "@/app/lib/prisma";
import { logOperationalEvent } from "@/app/lib/audit/operational-events";

// =============================================
// TYPES
// =============================================

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface EmailData {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export interface AdvogadoEmailData {
  nome: string;
  email: string;
  oab: string;
  especialidades: string[];
  linkLogin?: string;
}

// =============================================
// EMAIL TEMPLATES
// =============================================

export const getBoasVindasTemplate = (
  data: AdvogadoEmailData,
): EmailTemplate => {
  const especialidadesText =
    data.especialidades.length > 0
      ? data.especialidades.join(", ")
      : "Não especificadas";

  return {
    subject: "Bem-vindo ao Magic Lawyer! 🎉",
    html: `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Bem-vindo ao Magic Lawyer</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
          }
          .container {
            background-color: white;
            border-radius: 10px;
            padding: 30px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e9ecef;
          }
          .logo {
            font-size: 28px;
            font-weight: bold;
            color: #2563eb;
            margin-bottom: 10px;
          }
          .welcome-title {
            color: #1f2937;
            font-size: 24px;
            margin-bottom: 20px;
          }
          .info-card {
            background-color: #f8f9fa;
            border-left: 4px solid #2563eb;
            padding: 20px;
            margin: 20px 0;
            border-radius: 5px;
          }
          .info-item {
            margin-bottom: 10px;
          }
          .info-label {
            font-weight: bold;
            color: #374151;
          }
          .info-value {
            color: #6b7280;
          }
          .credentials {
            background-color: #fef3c7;
            border: 1px solid #f59e0b;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
          }
          .credentials-title {
            color: #92400e;
            font-weight: bold;
            margin-bottom: 10px;
          }
          .credentials-item {
            margin-bottom: 8px;
          }
          .button {
            display: inline-block;
            background-color: #2563eb;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: bold;
            margin: 20px 0;
          }
          .button:hover {
            background-color: #1d4ed8;
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e9ecef;
            color: #6b7280;
            font-size: 14px;
          }
          .warning {
            background-color: #fef2f2;
            border: 1px solid #fca5a5;
            border-radius: 6px;
            padding: 15px;
            margin: 20px 0;
            color: #dc2626;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">⚖️ Magic Lawyer</div>
            <h1 class="welcome-title">Bem-vindo, ${data.nome}!</h1>
          </div>

          <p>É com grande prazer que damos as boas-vindas ao <strong>Magic Lawyer</strong>! Seu perfil de advogado foi criado com sucesso e você já pode começar a utilizar nossa plataforma.</p>

          <div class="info-card">
            <h3 style="color: #2563eb; margin-top: 0;">Seus Dados Cadastrais</h3>
            <div class="info-item">
              <span class="info-label">Nome:</span>
              <span class="info-value"> ${data.nome}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Email:</span>
              <span class="info-value"> ${data.email}</span>
            </div>
            <div class="info-item">
              <span class="info-label">OAB:</span>
              <span class="info-value"> ${data.oab}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Especialidades:</span>
              <span class="info-value"> ${especialidadesText}</span>
            </div>
          </div>

          <p>Com o Magic Lawyer, você terá acesso a:</p>
          <ul>
            <li>📋 Gestão completa de processos</li>
            <li>👥 Controle de clientes</li>
            <li>📊 Relatórios de performance</li>
            <li>💰 Controle de comissões</li>
            <li>🔔 Notificações em tempo real</li>
            <li>📱 Interface responsiva e intuitiva</li>
          </ul>

          ${
            data.linkLogin
              ? `
            <div style="text-align: center;">
              <a href="${data.linkLogin}" class="button">Acessar Plataforma</a>
            </div>
          `
              : ""
          }

          <p>Se você tiver alguma dúvida ou precisar de suporte, não hesite em entrar em contato conosco.</p>

          <div class="footer">
            <p>Este é um email automático do sistema Magic Lawyer.</p>
            <p>© ${new Date().getFullYear()} Magic Lawyer. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Bem-vindo ao Magic Lawyer!

      Olá ${data.nome},

      É com grande prazer que damos as boas-vindas ao Magic Lawyer! Seu perfil de advogado foi criado com sucesso.

      Seus Dados:
      - Nome: ${data.nome}
      - Email: ${data.email}
      - OAB: ${data.oab}
      - Especialidades: ${especialidadesText}

      Com o Magic Lawyer você terá acesso a:
      - Gestão completa de processos
      - Controle de clientes
      - Relatórios de performance
      - Controle de comissões
      - Notificações em tempo real
      - Interface responsiva e intuitiva

      ${data.linkLogin ? `Acesse: ${data.linkLogin}` : ""}

      Se tiver dúvidas, entre em contato conosco.

      © ${new Date().getFullYear()} Magic Lawyer. Todos os direitos reservados.
    `,
  };
};

export const getNotificacaoTemplate = (data: {
  nome: string;
  email: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  linkAcao?: string;
  textoAcao?: string;
  tenantName?: string;
  branding?: {
    logoUrl?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
    accentColor?: string | null;
  };
}): EmailTemplate => {
  const messageHtml = data.mensagem.replace(/\n/g, "<br />");
  const brandName = data.tenantName?.trim() || "Magic Lawyer";
  const primary = data.branding?.primaryColor?.trim() || "#2563eb";
  const secondary = data.branding?.secondaryColor?.trim() || "#1d4ed8";
  const accent = data.branding?.accentColor?.trim() || "#2563eb";
  const logoUrl = data.branding?.logoUrl?.trim() || null;

  return {
    subject: `🔔 ${brandName} - ${data.titulo}`,
    html: `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Notificação - Magic Lawyer</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
          }
          .container {
            background-color: white;
            border-radius: 10px;
            padding: 30px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e9ecef;
          }
          .logo {
            font-size: 28px;
            font-weight: bold;
            color: ${primary};
            margin-bottom: 10px;
          }
          .logo-image {
            max-height: 54px;
            width: auto;
            max-width: 220px;
            object-fit: contain;
            margin: 0 auto 12px;
            display: block;
          }
          .notification-title {
            color: #1f2937;
            font-size: 20px;
            margin-bottom: 20px;
          }
          .notification-content {
            background-color: #f8f9fa;
            border-left: 4px solid ${secondary};
            padding: 20px;
            margin: 20px 0;
            border-radius: 5px;
          }
          .button {
            display: inline-block;
            background-color: ${accent};
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: bold;
            margin: 20px 0;
          }
          .button:hover {
            opacity: 0.9;
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e9ecef;
            color: #6b7280;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            ${
              logoUrl
                ? `<img class="logo-image" src="${logoUrl}" alt="${brandName}" />`
                : `<div class="logo">⚖️ ${brandName}</div>`
            }
            <h1 class="notification-title">${data.titulo}</h1>
          </div>

          <p>Olá <strong>${data.nome}</strong>,</p>

          <div class="notification-content">
            <p>${messageHtml}</p>
          </div>

          ${
            data.linkAcao && data.textoAcao
              ? `
            <div style="text-align: center;">
              <a href="${data.linkAcao}" class="button">${data.textoAcao}</a>
            </div>
          `
              : ""
          }

          <p>Atenciosamente,<br>Equipe ${brandName}</p>

          <div class="footer">
            <p>Este é um email automático do sistema ${brandName}.</p>
            <p>© ${new Date().getFullYear()} ${brandName}. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      ${brandName} - ${data.titulo}

      Olá ${data.nome},

      ${data.mensagem}

      ${data.linkAcao && data.textoAcao ? `${data.textoAcao}: ${data.linkAcao}` : ""}

      Atenciosamente,
      Equipe ${brandName}

      © ${new Date().getFullYear()} ${brandName}. Todos os direitos reservados.
    `,
  };
};

// =============================================
// EMAIL SERVICE
// =============================================

class EmailService {
  private getErrorMessage(error: unknown, fallback: string) {
    if (error && typeof error === "object" && "message" in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string" && message.trim() !== "") {
        return message;
      }
    }

    return fallback;
  }

  private resolveFromName(tenantId: string, fallbackName?: string) {
    return prisma.tenantBranding
      .findUnique({ where: { tenantId } })
      .then(
        (branding) => branding?.emailFromName || fallbackName || "Magic Lawyer",
      );
  }

  private async getTenantEmailCredential(
    tenantId: string,
    type: "DEFAULT" | "ADMIN" = "DEFAULT",
  ) {
    const cred = await prisma.tenantEmailCredential.findUnique({
      where: { tenantId_type: { tenantId, type } },
    });

    if (!cred && type === "DEFAULT") {
      // tentar ADMIN como fallback
      return prisma.tenantEmailCredential.findUnique({
        where: { tenantId_type: { tenantId, type: "ADMIN" } },
      });
    }

    return cred;
  }

  private createResendClient(apiKey: string) {
    return new Resend(apiKey);
  }

  async sendEmailPerTenant(
    tenantId: string,
    emailData: EmailData & {
      credentialType?: "DEFAULT" | "ADMIN";
      fromNameFallback?: string;
    },
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const credential = await this.getTenantEmailCredential(
        tenantId,
        emailData.credentialType || "DEFAULT",
      );

      if (!credential) {
        await logOperationalEvent({
          tenantId,
          category: "EMAIL",
          source: "RESEND",
          action: "EMAIL_FAILED",
          status: "ERROR",
          actorType: "SYSTEM",
          entityType: "TENANT_EMAIL_CREDENTIAL",
          route: "email-service",
          message: "Tentativa de envio sem credencial de email configurada.",
          payload: {
            to: emailData.to,
            subject: emailData.subject,
            credentialType: emailData.credentialType || "DEFAULT",
          },
        });

        return {
          success: false,
          error: "Credenciais de email não configuradas para o tenant",
        };
      }

      const resend = this.createResendClient(credential.apiKey);

      const fromName = await this.resolveFromName(
        tenantId,
        credential.fromName || emailData.fromNameFallback,
      );
      const from = emailData.from || `${fromName} <${credential.fromAddress}>`;

      const { data, error } = await resend.emails.send({
        from,
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text || emailData.html.replace(/<[^>]*>/g, ""),
      });

      if (error) {
        await logOperationalEvent({
          tenantId,
          category: "EMAIL",
          source: "RESEND",
          action: "EMAIL_FAILED",
          status: "ERROR",
          actorType: "SYSTEM",
          entityType: "EMAIL",
          route: "email-service",
          message: this.getErrorMessage(error, "Erro ao enviar email via Resend"),
          payload: {
            to: emailData.to,
            from,
            subject: emailData.subject,
            credentialType: emailData.credentialType || "DEFAULT",
            providerMessageId: null,
          },
        });

        return {
          success: false,
          error: this.getErrorMessage(error, "Erro ao enviar email via Resend"),
        };
      }

      await logOperationalEvent({
        tenantId,
        category: "EMAIL",
        source: "RESEND",
        action: "EMAIL_SENT",
        status: "SUCCESS",
        actorType: "SYSTEM",
        entityType: "EMAIL",
        entityId: data?.id ?? null,
        route: "email-service",
        message: "Email enviado com sucesso.",
        payload: {
          to: emailData.to,
          from,
          subject: emailData.subject,
          credentialType: emailData.credentialType || "DEFAULT",
          providerMessageId: data?.id ?? null,
        },
      });

      return { success: true, messageId: data?.id };
    } catch (error) {
      console.error("Error sending email (Resend/per-tenant):", error);

      await logOperationalEvent({
        tenantId,
        category: "EMAIL",
        source: "RESEND",
        action: "EMAIL_FAILED",
        status: "ERROR",
        actorType: "SYSTEM",
        entityType: "EMAIL",
        route: "email-service",
        message: this.getErrorMessage(error, "Unknown error sending email"),
        payload: {
          to: emailData.to,
          subject: emailData.subject,
          credentialType: emailData.credentialType || "DEFAULT",
        },
      });

      return {
        success: false,
        error: this.getErrorMessage(error, "Unknown error sending email"),
      };
    }
  }

  async sendBoasVindasAdvogado(
    tenantId: string,
    data: AdvogadoEmailData,
  ): Promise<boolean> {
    const template = getBoasVindasTemplate(data);

    const result = await this.sendEmailPerTenant(tenantId, {
      to: data.email,
      subject: template.subject,
      html: template.html,
      text: template.text,
      credentialType: "ADMIN",
      fromNameFallback: "Magic Lawyer",
    });

    return result.success;
  }

  async sendNotificacaoAdvogado(
    tenantId: string,
    data: {
      nome: string;
      email: string;
      tipo: string;
      titulo: string;
      mensagem: string;
      linkAcao?: string;
      textoAcao?: string;
    },
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const tenantBranding = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        branding: {
          select: {
            logoUrl: true,
            primaryColor: true,
            secondaryColor: true,
            accentColor: true,
          },
        },
      },
    });

    const template = getNotificacaoTemplate({
      ...data,
      tenantName: tenantBranding?.name || "Magic Lawyer",
      branding: tenantBranding?.branding
        ? {
            logoUrl: tenantBranding.branding.logoUrl,
            primaryColor: tenantBranding.branding.primaryColor,
            secondaryColor: tenantBranding.branding.secondaryColor,
            accentColor: tenantBranding.branding.accentColor,
          }
        : undefined,
    });

    return this.sendEmailPerTenant(tenantId, {
      to: data.email,
      subject: template.subject,
      html: template.html,
      text: template.text,
      credentialType: "DEFAULT",
    });
  }

  // Método para testar a configuração de email por tenant
  async testConnection(
    tenantId: string,
    type: "DEFAULT" | "ADMIN" = "DEFAULT",
  ): Promise<boolean> {
    const result = await this.testConnectionDetailed(tenantId, type);

    return result.success;
  }

  async testConnectionDetailed(
    tenantId: string,
    type: "DEFAULT" | "ADMIN" = "DEFAULT",
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const credential = await this.getTenantEmailCredential(tenantId, type);

      if (!credential) {
        return {
          success: false,
          error: `Credencial ${type} não configurada para este tenant.`,
        };
      }

      const resend = this.createResendClient(credential.apiKey);
      const { error } = await resend.domains.list();

      if (error) {
        console.error("Resend connection test failed:", error);

        return {
          success: false,
          error:
            typeof error.message === "string" && error.message.trim()
              ? error.message
              : "Resend rejeitou a validação da API key.",
        };
      }

      return { success: true };
    } catch (error) {
      console.error("Email connection test failed (Resend):", error);

      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro desconhecido ao validar credenciais de email.",
      };
    }
  }

  async getProvidersStatus(
    tenantId: string,
  ): Promise<Array<{ name: string; configured: boolean }>> {
    const [defaultCred, adminCred] = await Promise.all([
      this.getTenantEmailCredential(tenantId, "DEFAULT"),
      this.getTenantEmailCredential(tenantId, "ADMIN"),
    ]);

    return [
      {
        name: "Resend (DEFAULT)",
        configured: Boolean(defaultCred),
      },
      {
        name: "Resend (ADMIN)",
        configured: Boolean(adminCred),
      },
    ];
  }
}

export const emailService = new EmailService();
