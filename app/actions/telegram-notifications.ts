"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/app/lib/auth";
import {
  confirmTelegramConnection,
  createTelegramConnectionCode,
  disconnectTelegramConnection,
  getTelegramConnectionStatus,
} from "@/app/lib/notifications/telegram-bot";

async function ensureTenantSession() {
  const session = await getSession();

  if (!session?.user?.id || !session.user.tenantId) {
    throw new Error("Sessão inválida para integração do Telegram.");
  }

  return {
    userId: session.user.id,
    tenantId: session.user.tenantId,
  };
}

export async function getMyTelegramNotificationStatus() {
  try {
    const { tenantId, userId } = await ensureTenantSession();
    const status = await getTelegramConnectionStatus(tenantId, userId);

    return {
      success: true,
      status,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Falha ao carregar Telegram.",
    };
  }
}

export async function beginMyTelegramNotificationConnection() {
  try {
    const { tenantId, userId } = await ensureTenantSession();
    const result = await createTelegramConnectionCode(tenantId, userId);

    if (!result.success) {
      return result;
    }

    revalidatePath("/usuario/perfil/editar");

    return {
      success: true,
      code: result.code,
      botUsername: result.botUsername,
      providerDisplayName: result.providerDisplayName,
      providerSource: result.providerSource,
      deepLink: result.deepLink,
      expiresInSeconds: result.expiresInSeconds,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Falha ao iniciar conexão com Telegram.",
    };
  }
}

export async function confirmMyTelegramNotificationConnection() {
  try {
    const { tenantId, userId } = await ensureTenantSession();
    const result = await confirmTelegramConnection(tenantId, userId);

    if (!result.success) {
      return result;
    }

    revalidatePath("/usuario/perfil/editar");
    revalidatePath("/usuario/preferencias-notificacoes");

    return {
      success: true,
      username: result.username,
      chatId: result.chatId,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Falha ao confirmar conexão com Telegram.",
    };
  }
}

export async function disconnectMyTelegramNotificationConnection() {
  try {
    const { tenantId, userId } = await ensureTenantSession();
    await disconnectTelegramConnection(tenantId, userId);

    revalidatePath("/usuario/perfil/editar");
    revalidatePath("/usuario/preferencias-notificacoes");

    return {
      success: true,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Falha ao desconectar Telegram.",
    };
  }
}
