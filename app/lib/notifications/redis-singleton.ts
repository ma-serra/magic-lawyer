/**
 * Singleton de conexão Redis para evitar connection leaks
 * Reutiliza a mesma conexão em todas as operações
 */

import Redis from "ioredis";

let redisInstance: Redis | null = null;

/**
 * Obtém instância singleton do Redis
 */
export function getRedisInstance(): Redis {
  if (!redisInstance) {
    // Em desenvolvimento, usar Redis local padrão
    const isDev = process.env.NODE_ENV !== "production";
    const devRedisUrl = "redis://localhost:6379";
    const redisUrl = isDev
      ? process.env.REDIS_URL || devRedisUrl
      : process.env.REDIS_URL;

    if (!redisUrl) {
      throw new Error(
        "REDIS_URL environment variable is required in production",
      );
    }

    // Configuração para Vercel Redis (Upstash)
    if (redisUrl.startsWith("rediss://")) {
      redisInstance = new Redis(redisUrl, {
        tls: {
          rejectUnauthorized: false,
        },
        maxRetriesPerRequest: null,
        lazyConnect: true,
      });
    } else {
      // Configuração para desenvolvimento local
      redisInstance = new Redis(redisUrl, {
        maxRetriesPerRequest: null,
        lazyConnect: true,
      });
    }

    // Conectar se ainda não conectado
    if (redisInstance.status !== "ready") {
      redisInstance.connect().catch((err) => {
        console.error("[RedisSingleton] Erro ao conectar:", err);
      });
    }
  }

  return redisInstance;
}

/**
 * Fecha conexão Redis (apenas em shutdown)
 */
export async function closeRedisConnection(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit();
    redisInstance = null;
  }
}
