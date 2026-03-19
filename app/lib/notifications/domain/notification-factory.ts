import type { NotificationEvent } from "../notification-service";

import { NotificationPolicy } from "./notification-policy";

/**
 * Factory para criar e validar eventos de notificação
 * Separa responsabilidades de criação e validação do NotificationService
 */
export class NotificationFactory {
  /**
   * Cria e valida um evento de notificação
   */
  static createEvent(
    type: string,
    tenantId: string,
    userId: string,
    payload: Record<string, any>,
    options?: {
      urgency?: NotificationEvent["urgency"];
      channels?: NotificationEvent["channels"];
    },
  ): NotificationEvent {
    // 1. Validar tipo de evento
    this.validateEventType(type);

    // 2. Validar payload obrigatório
    this.validatePayload(type, payload);

    // 3. Sanitizar payload (remover dados sensíveis)
    const sanitizedPayload = this.sanitizePayload(payload);

    // 4. Determinar urgência (usa policy se não especificada)
    const urgency =
      options?.urgency ?? NotificationPolicy.getDefaultUrgency(type);

    // 5. Determinar canais (só usa policy se não especificada explicitamente)
    // IMPORTANTE: Não injetar canais padrão aqui - deixar que NotificationService
    // use preferências do usuário. Canais padrão só devem ser usados quando
    // o evento especifica explicitamente ou quando é CRITICAL
    const channels = options?.channels; // undefined se não especificado = deixa Service decidir

    // 6. Validar estrutura final
    const event: NotificationEvent = {
      type,
      tenantId,
      userId,
      payload: sanitizedPayload,
      urgency,
      channels,
    };

    this.validateEvent(event);

    return event;
  }

  /**
   * Valida se o tipo de evento é conhecido
   */
  private static validateEventType(type: string): void {
    const validTypes = NotificationPolicy.getValidEventTypes();

    if (!validTypes.includes(type)) {
      console.warn(
        `[NotificationFactory] Tipo de evento desconhecido: ${type}. Permitindo mesmo assim para flexibilidade.`,
      );
      // Não bloqueia - permite eventos customizados para integrações futuras
    }
  }

  /**
   * Valida campos obrigatórios do payload baseado no tipo de evento
   */
  private static validatePayload(
    type: string,
    payload: Record<string, any>,
  ): void {
    const requiredFields = NotificationPolicy.getRequiredFields(type);

    if (requiredFields.length === 0) {
      return; // Tipo de evento não tem campos obrigatórios definidos
    }

    const missingFields: string[] = [];

    for (const field of requiredFields) {
      if (
        !(field in payload) ||
        payload[field] === null ||
        payload[field] === undefined
      ) {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      throw new Error(
        `[NotificationFactory] Payload inválido para evento ${type}. Campos obrigatórios faltando: ${missingFields.join(", ")}`,
      );
    }
  }

  /**
   * Sanitiza payload removendo dados sensíveis
   */
  private static sanitizePayload(
    payload: Record<string, any>,
  ): Record<string, any> {
    const sensitiveFields = [
      "cpf",
      "cnpj",
      "senha",
      "password",
      "token",
      "secret",
      "apiKey",
      "creditCard",
      "cvv",
      "cvc",
    ];

    const sanitized = { ...payload };

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        delete sanitized[field];
        console.warn(
          `[NotificationFactory] Dados sensíveis removidos do payload: ${field}`,
        );
      }
    }

    // Remover objetos aninhados grandes (substituir por IDs)
    const maxDepth = 3;

    return this.flattenPayload(sanitized, maxDepth);
  }

  /**
   * Limita profundidade de objetos aninhados
   */
  private static flattenPayload(
    payload: any,
    maxDepth: number,
    currentDepth = 0,
  ): any {
    if (currentDepth >= maxDepth) {
      // Se exceder profundidade, retorna apenas ID se existir
      if (typeof payload === "object" && payload !== null && "id" in payload) {
        return { id: payload.id };
      }

      return null;
    }

    if (Array.isArray(payload)) {
      return payload.map((item) =>
        this.flattenPayload(item, maxDepth, currentDepth + 1),
      );
    }

    if (typeof payload === "object" && payload !== null) {
      const flattened: Record<string, any> = {};

      for (const [key, value] of Object.entries(payload)) {
        if (
          typeof value === "object" &&
          value !== null &&
          !(value instanceof Date)
        ) {
          flattened[key] = this.flattenPayload(
            value,
            maxDepth,
            currentDepth + 1,
          );
        } else {
          flattened[key] = value;
        }
      }

      return flattened;
    }

    return payload;
  }

  /**
   * Valida estrutura final do evento
   */
  private static validateEvent(event: NotificationEvent): void {
    if (!event.type || typeof event.type !== "string") {
      throw new Error("[NotificationFactory] Tipo de evento inválido");
    }

    if (!event.tenantId || typeof event.tenantId !== "string") {
      throw new Error("[NotificationFactory] tenantId inválido");
    }

    if (!event.userId || typeof event.userId !== "string") {
      throw new Error("[NotificationFactory] userId inválido");
    }

    if (!event.payload || typeof event.payload !== "object") {
      throw new Error("[NotificationFactory] Payload inválido");
    }

    const validUrgencies = ["CRITICAL", "HIGH", "MEDIUM", "INFO"];

    if (!validUrgencies.includes(event.urgency || "MEDIUM")) {
      throw new Error(
        `[NotificationFactory] Urgência inválida: ${event.urgency}`,
      );
    }

    const validChannels = ["REALTIME", "EMAIL", "TELEGRAM", "PUSH"];

    if (event.channels) {
      for (const channel of event.channels) {
        if (!validChannels.includes(channel)) {
          throw new Error(`[NotificationFactory] Canal inválido: ${channel}`);
        }
      }
    }
  }

  /**
   * Cria múltiplos eventos (batch)
   */
  static createBatchEvents(
    type: string,
    tenantId: string,
    userIds: string[],
    payload: Record<string, any>,
    options?: {
      urgency?: NotificationEvent["urgency"];
      channels?: NotificationEvent["channels"];
    },
  ): NotificationEvent[] {
    return userIds.map((userId) =>
      this.createEvent(type, tenantId, userId, payload, options),
    );
  }
}
