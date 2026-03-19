import { NotificationService } from "./notification-service";
import { NotificationEvent } from "./types";

import prisma from "@/app/lib/prisma";

/**
 * Serviço de migração do sistema legado para o novo sistema de notificações
 */
export class NotificationMigrationService {
  /**
   * Mapeia tipos do sistema legado para o novo sistema
   */
  private static mapLegacyTypeToNew(legacyType: string): string {
    const typeMapping: Record<string, string> = {
      SISTEMA: "system.notification",
      PRAZO: "prazo.expiring",
      DOCUMENTO: "documento.uploaded",
      MENSAGEM: "mensagem.received",
      FINANCEIRO: "financeiro.payment",
      OUTRO: "general.notification",
    };

    return typeMapping[legacyType] || "general.notification";
  }

  /**
   * Mapeia prioridades do sistema legado para o novo sistema
   */
  private static mapLegacyPriorityToNew(
    legacyPriority: string,
  ): "CRITICAL" | "HIGH" | "MEDIUM" | "INFO" {
    const priorityMapping: Record<
      string,
      "CRITICAL" | "HIGH" | "MEDIUM" | "INFO"
    > = {
      CRITICA: "CRITICAL",
      ALTA: "HIGH",
      MEDIA: "MEDIUM",
      BAIXA: "INFO",
    };

    return priorityMapping[legacyPriority] || "MEDIUM";
  }

  /**
   * Mapeia canais do sistema legado para o novo sistema
   */
  private static mapLegacyChannelsToNew(
    legacyChannels: string[],
  ): ("REALTIME" | "EMAIL" | "TELEGRAM" | "PUSH")[] {
    const channelMapping: Record<
      string,
      "REALTIME" | "EMAIL" | "TELEGRAM" | "PUSH"
    > = {
      IN_APP: "REALTIME",
      EMAIL: "EMAIL",
      SMS: "EMAIL",
      WHATSAPP: "EMAIL", // Mapear WhatsApp para EMAIL por enquanto
      TELEGRAM: "TELEGRAM",
      PUSH: "PUSH",
    };

    return legacyChannels.map(
      (channel) => channelMapping[channel] || "REALTIME",
    );
  }

  /**
   * Migra uma notificação do sistema legado para o novo sistema
   */
  static async migrateLegacyNotification(
    legacyNotificationId: string,
  ): Promise<void> {
    try {
      // Buscar notificação legada
      const legacyNotification = await prisma.notificacao.findUnique({
        where: { id: legacyNotificationId },
        include: {
          destinos: true,
        },
      });

      if (!legacyNotification) {
        console.log(
          `[Migration] Notificação legada ${legacyNotificationId} não encontrada`,
        );

        return;
      }

      // Migrar cada destino da notificação
      for (const destino of legacyNotification.destinos) {
        const event: NotificationEvent = {
          type: this.mapLegacyTypeToNew(legacyNotification.tipo),
          tenantId: legacyNotification.tenantId,
          userId: destino.usuarioId,
          payload: {
            // Preservar dados originais
            legacyId: legacyNotification.id,
            legacyDestinoId: destino.id,
            referenciaTipo: legacyNotification.referenciaTipo,
            referenciaId: legacyNotification.referenciaId,
            dados: legacyNotification.dados,
            // Adicionar metadados de migração
            migratedAt: new Date().toISOString(),
            migrationSource: "legacy_system",
          },
          urgency: this.mapLegacyPriorityToNew(legacyNotification.prioridade),
          channels: this.mapLegacyChannelsToNew(legacyNotification.canais),
        };

        // Publicar no novo sistema
        await NotificationService.publishNotification(event);

        console.log(
          `[Migration] Notificação ${legacyNotificationId} migrada para usuário ${destino.usuarioId}`,
        );
      }
    } catch (error) {
      console.error(
        `[Migration] Erro ao migrar notificação ${legacyNotificationId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Migra todas as notificações legadas não migradas
   */
  static async migrateAllLegacyNotifications(): Promise<{
    migrated: number;
    errors: number;
  }> {
    let migrated = 0;
    let errors = 0;

    try {
      // Buscar notificações legadas que ainda não foram migradas
      const legacyNotifications = await prisma.notificacao.findMany({
        where: {
          // Assumir que notificações criadas antes de hoje são legadas
          createdAt: {
            lt: new Date(new Date().setHours(0, 0, 0, 0)), // Antes de hoje
          },
        },
        include: {
          destinos: true,
        },
        take: 100, // Processar em lotes
      });

      console.log(
        `[Migration] Encontradas ${legacyNotifications.length} notificações legadas para migrar`,
      );

      for (const notification of legacyNotifications) {
        try {
          await this.migrateLegacyNotification(notification.id);
          migrated++;
        } catch (error) {
          console.error(
            `[Migration] Erro ao migrar notificação ${notification.id}:`,
            error,
          );
          errors++;
        }
      }

      console.log(
        `[Migration] Migração concluída: ${migrated} migradas, ${errors} erros`,
      );

      return { migrated, errors };
    } catch (error) {
      console.error("[Migration] Erro geral na migração:", error);
      throw error;
    }
  }

  /**
   * Cria uma notificação no sistema legado (para compatibilidade durante transição)
   */
  static async createLegacyNotification(data: {
    tenantId: string;
    titulo: string;
    mensagem: string;
    tipo: string;
    prioridade: string;
    canais: string[];
    userIds: string[];
    dados?: any;
    referenciaTipo?: string;
    referenciaId?: string;
    createdById?: string;
  }): Promise<string> {
    try {
      // Validar tipos antes de criar
      const validTypes = [
        "SISTEMA",
        "PRAZO",
        "DOCUMENTO",
        "MENSAGEM",
        "FINANCEIRO",
        "OUTRO",
      ];
      const validPriorities = ["BAIXA", "MEDIA", "ALTA", "CRITICA"];
      const validChannels = [
        "IN_APP",
        "EMAIL",
        "SMS",
        "WHATSAPP",
        "TELEGRAM",
        "PUSH",
      ];

      if (!validTypes.includes(data.tipo)) {
        throw new Error(
          `Tipo inválido: ${data.tipo}. Tipos válidos: ${validTypes.join(", ")}`,
        );
      }

      if (!validPriorities.includes(data.prioridade)) {
        throw new Error(
          `Prioridade inválida: ${data.prioridade}. Prioridades válidas: ${validPriorities.join(", ")}`,
        );
      }

      for (const canal of data.canais) {
        if (!validChannels.includes(canal)) {
          throw new Error(
            `Canal inválido: ${canal}. Canais válidos: ${validChannels.join(", ")}`,
          );
        }
      }

      // Para testes, usar tenantId fixo se não existir
      let tenantId = data.tenantId;

      if (tenantId === "test-tenant") {
        // Buscar primeiro tenant disponível ou criar um de teste
        const existingTenant = await prisma.tenant.findFirst();

        if (existingTenant) {
          tenantId = existingTenant.id;
        } else {
          // Criar tenant de teste
          const testTenant = await prisma.tenant.create({
            data: {
              name: "Teste Tenant",
              slug: "teste-tenant",
              email: "teste@teste.com",
              telefone: "11999999999",
              documento: "12345678000199",
              razaoSocial: "Teste Tenant LTDA",
              nomeFantasia: "Teste Tenant",
              status: "ACTIVE",
            },
          });

          tenantId = testTenant.id;
        }
      }

      // Criar notificação principal
      const notification = await prisma.notificacao.create({
        data: {
          tenantId: tenantId,
          titulo: data.titulo,
          mensagem: data.mensagem,
          tipo: data.tipo as any,
          prioridade: data.prioridade as any,
          canais: data.canais as any,
          dados: data.dados,
          referenciaTipo: data.referenciaTipo,
          referenciaId: data.referenciaId,
          createdById: data.createdById,
        },
      });

      // Para testes, usar usuário real se não existir
      let userIds = data.userIds;

      if (userIds.includes("test-user")) {
        // Buscar primeiro usuário disponível ou criar um de teste
        const existingUser = await prisma.usuario.findFirst({
          where: { tenantId: tenantId },
        });

        if (existingUser) {
          userIds = [existingUser.id];
        } else {
          // Criar usuário de teste
          const testUser = await prisma.usuario.create({
            data: {
              tenantId: tenantId,
              firstName: "Teste",
              lastName: "Usuário",
              email: "teste@teste.com",
              role: "ADVOGADO",
              active: true,
            },
          });

          userIds = [testUser.id];
        }
      }

      // Criar destinos para cada usuário
      const destinosData = userIds.map((userId) => ({
        notificacaoId: notification.id,
        tenantId: tenantId,
        usuarioId: userId,
        canal: data.canais[0] as any, // Usar primeiro canal como padrão
        status: "NAO_LIDA" as any,
      }));

      await prisma.notificacaoUsuario.createMany({
        data: destinosData,
      });

      console.log(
        `[Legacy] Notificação ${notification.id} criada para ${data.userIds.length} usuários`,
      );

      return notification.id;
    } catch (error) {
      console.error("[Legacy] Erro ao criar notificação legada:", error);
      throw error;
    }
  }

  /**
   * Verifica se uma notificação já foi migrada
   */
  static async isNotificationMigrated(
    legacyNotificationId: string,
  ): Promise<boolean> {
    try {
      // Verificar se existe no novo sistema
      const newNotification = await prisma.notification.findFirst({
        where: {
          payload: {
            path: ["legacyId"],
            equals: legacyNotificationId,
          },
        },
      });

      return !!newNotification;
    } catch (error) {
      console.error(
        `[Migration] Erro ao verificar migração da notificação ${legacyNotificationId}:`,
        error,
      );

      return false;
    }
  }
}
