import { Prisma } from "@/generated/prisma";
import prisma from "@/app/lib/prisma";

export type AuditLogParams = {
  tenantId: string;
  usuarioId?: string | null;
  acao: string;
  entidade: string;
  entidadeId?: string | null;
  dados?: Prisma.InputJsonValue | null;
  previousValues?: Prisma.InputJsonValue | null;
  changedFields?: string[];
  ip?: string | null;
  userAgent?: string | null;
};

function isForeignKeyViolation(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2003"
  ) {
    return true;
  }

  const maybeError = error as { code?: unknown; message?: unknown } | null;

  if (maybeError?.code === "P2003") {
    return true;
  }

  if (
    typeof maybeError?.message === "string" &&
    maybeError.message.includes("Foreign key constraint violated")
  ) {
    return true;
  }

  return false;
}

async function resolveAuditUsuarioId(
  tenantId: string,
  usuarioId?: string | null,
): Promise<string | null> {
  if (!usuarioId) {
    return null;
  }

  const user = await prisma.usuario.findFirst({
    where: {
      id: usuarioId,
      tenantId,
    },
    select: { id: true },
  });

  return user?.id ?? null;
}

export function toAuditJson(
  value: unknown,
): Prisma.InputJsonValue | null | undefined {
  if (value === undefined) return undefined;

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

export function extractChangedFieldsFromDiff(
  items: Array<{ field?: string }> | null | undefined,
): string[] {
  if (!items || items.length === 0) {
    return [];
  }

  const fields = items
    .map((item) => item.field)
    .filter((field): field is string => Boolean(field));

  return Array.from(new Set(fields));
}

export async function logAudit({
  tenantId,
  usuarioId,
  acao,
  entidade,
  entidadeId,
  dados,
  previousValues,
  changedFields,
  ip,
  userAgent,
}: AuditLogParams) {
  const safeUsuarioId = await resolveAuditUsuarioId(tenantId, usuarioId);

  const normalizedDados =
    dados === null ? Prisma.JsonNull : (dados as Prisma.InputJsonValue | undefined);
  const normalizedPrevious =
    previousValues === null
      ? Prisma.JsonNull
      : (previousValues as Prisma.InputJsonValue | undefined);

  const baseData = {
    tenantId,
    acao,
    entidade,
    entidadeId: entidadeId ?? null,
    dados: normalizedDados,
    previousValues: normalizedPrevious,
    changedFields: changedFields ?? [],
    ip: ip ?? null,
    userAgent: userAgent ?? null,
  };

  try {
    return await prisma.auditLog.create({
      data: {
        ...baseData,
        usuarioId: safeUsuarioId,
      },
    });
  } catch (error) {
    // Mantém o fluxo de negócio mesmo se houver inconsistência transitória de FK em usuarioId.
    if (isForeignKeyViolation(error)) {
      return prisma.auditLog.create({
        data: {
          ...baseData,
          usuarioId: null,
        },
      });
    }

    throw error;
  }
}
