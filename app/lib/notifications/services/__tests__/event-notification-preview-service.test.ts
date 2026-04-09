jest.mock("@/app/lib/prisma", () => ({
  __esModule: true,
  default: {
    tenant: {
      findFirst: jest.fn(),
    },
    usuario: {
      findMany: jest.fn(),
    },
    tenantEmailCredential: {
      findFirst: jest.fn(),
    },
    webPushSubscription: {
      count: jest.fn(),
    },
    notificationTemplate: {
      findUnique: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
    notificationDelivery: {
      create: jest.fn(),
    },
    notificationDispatchAudit: {
      create: jest.fn(),
    },
  },
}));

jest.mock("@/app/lib/email-service", () => ({
  __esModule: true,
  emailService: {
    sendNotificacaoAdvogado: jest.fn(),
  },
  getNotificacaoTemplate: jest.fn(),
}));

jest.mock("@/app/lib/notifications/telegram-bot", () => ({
  __esModule: true,
  getActiveTelegramProvider: jest.fn(),
  renderTelegramNotification: jest.fn(),
  sendTelegramNotificationToChatId: jest.fn(),
}));

import prisma from "@/app/lib/prisma";
import {
  emailService,
  getNotificacaoTemplate,
} from "@/app/lib/email-service";
import {
  getActiveTelegramProvider,
  renderTelegramNotification,
  sendTelegramNotificationToChatId,
} from "@/app/lib/notifications/telegram-bot";
import { EventNotificationPreviewService } from "@/app/lib/notifications/services/event-notification-preview-service";

const mockPrisma = prisma as unknown as {
  tenant: { findFirst: jest.Mock };
  usuario: { findMany: jest.Mock };
  tenantEmailCredential: { findFirst: jest.Mock };
  webPushSubscription: { count: jest.Mock };
  notificationTemplate: { findUnique: jest.Mock };
  notification: { create: jest.Mock };
  notificationDelivery: { create: jest.Mock };
  notificationDispatchAudit: { create: jest.Mock };
};

const mockEmailService = emailService as unknown as {
  sendNotificacaoAdvogado: jest.Mock;
};

const mockGetNotificacaoTemplate = getNotificacaoTemplate as jest.Mock;
const mockGetActiveTelegramProvider = getActiveTelegramProvider as jest.Mock;
const mockRenderTelegramNotification = renderTelegramNotification as jest.Mock;
const mockSendTelegramNotificationToChatId =
  sendTelegramNotificationToChatId as jest.Mock;

describe("EventNotificationPreviewService", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockPrisma.tenant.findFirst.mockResolvedValue({
      id: "tenant_dayane",
      name: "Dayane Assis Advocacia e Consultoria Juridica",
      slug: "dayane-assis-advocacia",
      domain: null,
      branding: {
        customDomainText: null,
        logoUrl: null,
        primaryColor: "#2563eb",
        secondaryColor: "#1d4ed8",
        accentColor: "#3b82f6",
      },
    });
    mockPrisma.usuario.findMany.mockResolvedValue([]);
    mockPrisma.tenantEmailCredential.findFirst.mockResolvedValue({
      id: "cred_1",
    });
    mockPrisma.webPushSubscription.count.mockResolvedValue(0);
    mockPrisma.notificationTemplate.findUnique.mockResolvedValue(null);

    mockGetNotificacaoTemplate.mockReturnValue({
      subject: "Assunto preview",
      html: "<p>Preview HTML</p>",
      text: "Preview texto",
    });
    mockGetActiveTelegramProvider.mockResolvedValue({
      source: "GLOBAL",
      displayName: "Magic Radar",
      botToken: "token",
    });
    mockRenderTelegramNotification.mockResolvedValue({
      text: "Mensagem Telegram",
      actionUrl: "https://magiclawyer.vercel.app/agenda/preview-evento-001",
      actionText: "Ver evento",
    });
    mockEmailService.sendNotificacaoAdvogado.mockResolvedValue({
      success: true,
      messageId: "email_1",
    });
    mockSendTelegramNotificationToChatId.mockResolvedValue({
      success: true,
      messageId: "telegram_1",
    });
  });

  it("gera preview sem enviar e sem usar tabelas de notificacao", async () => {
    const result = await EventNotificationPreviewService.execute({
      mode: "preview",
      tenantSlug: "dayane-assis-advocacia",
      eventType: "evento.created",
      recipients: {
        emails: ["assisdayane@hotmail.com"],
        telegramChatIds: ["8621247112"],
      },
    });

    expect(result.eventType).toBe("evento.created");
    expect(result.rendered.title).toBe("Novo evento agendado");
    expect(result.channelAssessment.EMAIL.status).toBe("ready");
    expect(result.channelAssessment.TELEGRAM.status).toBe("ready");
    expect(result.channelAssessment.WHATSAPP.status).toBe("unsupported");
    expect(mockEmailService.sendNotificacaoAdvogado).not.toHaveBeenCalled();
    expect(mockSendTelegramNotificationToChatId).not.toHaveBeenCalled();
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    expect(mockPrisma.notificationDelivery.create).not.toHaveBeenCalled();
    expect(mockPrisma.notificationDispatchAudit.create).not.toHaveBeenCalled();
  });

  it("rejeita destinatarios que batem com usuario cliente do tenant", async () => {
    mockPrisma.usuario.findMany.mockResolvedValue([
      {
        id: "cliente_1",
        email: "cliente@teste.com",
        role: "CLIENTE",
        telegramChatId: null,
      },
    ]);

    await expect(
      EventNotificationPreviewService.execute({
        mode: "preview",
        eventType: "evento.reminder_1h",
        recipients: {
          emails: ["cliente@teste.com"],
        },
      }),
    ).rejects.toThrow(/clientes/i);
  });

  it("envia somente email e telegram no modo send", async () => {
    const result = await EventNotificationPreviewService.execute({
      mode: "send",
      eventType: "evento.reminder_1h",
      recipients: {
        emails: ["assisdayane@hotmail.com"],
        telegramChatIds: ["8621247112"],
      },
    });

    expect(mockEmailService.sendNotificacaoAdvogado).toHaveBeenCalledWith(
      "tenant_dayane",
      expect.objectContaining({
        email: "assisdayane@hotmail.com",
        skipOperationalLog: true,
      }),
    );
    expect(mockSendTelegramNotificationToChatId).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant_dayane",
        chatId: "8621247112",
      }),
    );
    expect(result.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: "EMAIL",
          success: true,
        }),
        expect.objectContaining({
          channel: "TELEGRAM",
          success: true,
        }),
      ]),
    );
  });

  it("aplica aviso de teste e baseUrl manual no conteudo renderizado", async () => {
    const result = await EventNotificationPreviewService.execute({
      mode: "preview",
      eventType: "evento.created",
      baseUrl: "https://magiclawyer.vercel.app",
      testNotice: "Esta notificacao e apenas um teste interno.",
      recipients: {
        emails: ["assisdayane@hotmail.com"],
      },
    });

    expect(result.rendered.title).toBe("[TESTE INTERNO] Novo evento agendado");
    expect(result.rendered.message).toContain(
      "Esta notificacao e apenas um teste interno.",
    );
    expect(result.rendered.actionUrl).toBe(
      "https://magiclawyer.vercel.app/agenda/preview-evento-001",
    );
  });
});
