"use server";

import { revalidatePath } from "next/cache";
import tls from "tls";

import { getServerSession } from "next-auth";

import prisma from "@/app/lib/prisma";
import {
  DigitalCertificateLogAction,
  DigitalCertificatePolicy,
  DigitalCertificateScope,
  DigitalCertificateType,
} from "@/generated/prisma";
import {
  decryptBuffer,
  decryptToString,
  encryptBuffer,
  encryptString,
} from "@/lib/certificate-crypto";
import { normalizePkcs12Buffer, parsePkcs12ToPem } from "@/lib/pkcs12-utils";
import logger from "@/lib/logger";
import { testComunicaMtlsConnection } from "@/lib/api/juridical/pje/comunica";
import { authOptions } from "@/auth";
import { TENANT_PERMISSIONS } from "@/types";

const MAX_CERTIFICATE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const DEFAULT_POLICY = DigitalCertificatePolicy.OFFICE;

interface UploadCertificateParams {
  fileBuffer: Buffer;
  password: string;
  label?: string;
  validUntil?: Date | null;
  activate?: boolean;
  tipo?: DigitalCertificateType;
  scope?: DigitalCertificateScope;
}

interface ActionContext {
  tenantId: string;
  userId: string;
  role?: string;
  permissions: string[];
}

async function requireActionContext(): Promise<ActionContext> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.tenantId || !session.user.id) {
    throw new Error("Não autorizado");
  }

  return {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    role: (session.user as any)?.role as string | undefined,
    permissions: ((session.user as any)?.permissions ?? []) as string[],
  };
}

function hasOfficeSettingsPermission(context: ActionContext) {
  return (
    context.role === "SUPER_ADMIN" ||
    context.role === "ADMIN" ||
    context.permissions.includes(TENANT_PERMISSIONS.manageOfficeSettings)
  );
}

function isSuperAdmin(context: ActionContext) {
  return context.role === "SUPER_ADMIN";
}

function formatPkcs12Error(error: unknown) {
  if (!(error instanceof Error)) {
    return "erro desconhecido";
  }

  const message = error.message;

  if (
    /mac verify failure/i.test(message) ||
    /pkcs#12 mac could not be verified/i.test(message) ||
    /invalid password/i.test(message) ||
    /bad decrypt/i.test(message) ||
    /bad password/i.test(message)
  ) {
    return "Senha incorreta para o certificado. Verifique a senha e tente novamente.";
  }

  if (/Unsupported PKCS12 PFX data/i.test(message)) {
    return `${message}. O certificado pode usar criptografia legada; reexporte em AES-256 ou habilite o provider legacy do OpenSSL.`;
  }

  return message;
}

function validatePkcs12Password(buffer: Buffer, password: string) {
  try {
    tls.createSecureContext({
      pfx: buffer,
      passphrase: password,
    });
  } catch (cryptoError) {
    try {
      const parsed = parsePkcs12ToPem(buffer, password);
      tls.createSecureContext({
        key: parsed.keyPem,
        cert: parsed.certPem,
        ca: parsed.caPem.length > 0 ? parsed.caPem : undefined,
      });
    } catch (fallbackError) {
      const primaryMessage = formatPkcs12Error(cryptoError);
      const fallbackMessage = formatPkcs12Error(fallbackError);
      throw new Error(
        `Falha ao importar certificado PKCS#12: ${primaryMessage} (${fallbackMessage})`,
      );
    }
  }
}

function policyAllowsScope(
  policy: DigitalCertificatePolicy,
  scope: DigitalCertificateScope,
) {
  if (policy === DigitalCertificatePolicy.HYBRID) {
    return true;
  }

  if (policy === DigitalCertificatePolicy.LAWYER) {
    return scope === DigitalCertificateScope.LAWYER;
  }

  return scope === DigitalCertificateScope.OFFICE;
}

async function getTenantPolicy(
  tenantId: string,
): Promise<DigitalCertificatePolicy> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { digitalCertificatePolicy: true },
  });

  return tenant?.digitalCertificatePolicy ?? DEFAULT_POLICY;
}

async function ensureAdvogado(tenantId: string, userId: string) {
  const advogado = await prisma.advogado.findFirst({
    where: {
      tenantId,
      usuarioId: userId,
    },
    select: { id: true },
  });

  if (!advogado) {
    throw new Error("Somente advogados podem gerenciar certificados pessoais.");
  }
}

async function assertUploadAllowed(
  context: ActionContext,
  scope: DigitalCertificateScope,
  policy: DigitalCertificatePolicy,
) {
  if (!policyAllowsScope(policy, scope)) {
    throw new Error("Política do escritório não permite esse tipo de certificado.");
  }

  if (scope === DigitalCertificateScope.OFFICE) {
    if (!hasOfficeSettingsPermission(context)) {
      throw new Error(
        "Apenas administradores podem enviar certificados do escritório.",
      );
    }
    return;
  }

  if (!isSuperAdmin(context)) {
    await ensureAdvogado(context.tenantId, context.userId);
  }
}

async function assertCertificateAccess(params: {
  context: ActionContext;
  certificate: {
    id: string;
    scope: DigitalCertificateScope;
    responsavelUsuarioId: string | null;
  };
  policy: DigitalCertificatePolicy;
}) {
  const { context, certificate, policy } = params;

  if (!policyAllowsScope(policy, certificate.scope)) {
    throw new Error("Política do escritório não permite acessar este certificado.");
  }

  if (certificate.scope === DigitalCertificateScope.OFFICE) {
    if (!hasOfficeSettingsPermission(context)) {
      throw new Error(
        "Apenas administradores podem gerenciar certificados do escritório.",
      );
    }
    return;
  }

  if (isSuperAdmin(context)) {
    return;
  }

  if (!certificate.responsavelUsuarioId) {
    throw new Error("Certificado pessoal sem responsável definido.");
  }

  if (certificate.responsavelUsuarioId !== context.userId) {
    throw new Error("Você não pode gerenciar certificados de outro advogado.");
  }

  await ensureAdvogado(context.tenantId, context.userId);
}

function sanitizeCertificate(cert: {
  id: string;
  tenantId: string;
  responsavelUsuarioId: string | null;
  label: string | null;
  tipo: DigitalCertificateType;
  scope: DigitalCertificateScope;
  isActive: boolean;
  validUntil: Date | null;
  lastValidatedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  responsavelUsuario?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
}) {
  return {
    id: cert.id,
    tenantId: cert.tenantId,
    responsavelUsuarioId: cert.responsavelUsuarioId,
    label: cert.label,
    tipo: cert.tipo,
    scope: cert.scope,
    isActive: cert.isActive,
    validUntil: cert.validUntil,
    lastValidatedAt: cert.lastValidatedAt,
    lastUsedAt: cert.lastUsedAt,
    createdAt: cert.createdAt,
    updatedAt: cert.updatedAt,
    responsavelUsuario: cert.responsavelUsuario
      ? {
          id: cert.responsavelUsuario.id,
          firstName: cert.responsavelUsuario.firstName,
          lastName: cert.responsavelUsuario.lastName,
          email: cert.responsavelUsuario.email,
        }
      : null,
  };
}

export async function uploadDigitalCertificate({
  fileBuffer,
  password,
  label,
  validUntil,
  activate = true,
  tipo = DigitalCertificateType.PJE,
  scope = DigitalCertificateScope.OFFICE,
}: UploadCertificateParams) {
  const context = await requireActionContext();
  const { tenantId, userId } = context;

  if (!fileBuffer?.length) {
    throw new Error("Arquivo do certificado não foi enviado");
  }

  if (fileBuffer.byteLength > MAX_CERTIFICATE_SIZE_BYTES) {
    throw new Error("Certificado excede o limite de 2MB");
  }

  if (!password || password.trim().length === 0) {
    throw new Error("A senha do certificado é obrigatória");
  }

  try {
    const policy = await getTenantPolicy(tenantId);

    await assertUploadAllowed(context, scope, policy);

    const normalizedBuffer = normalizePkcs12Buffer(fileBuffer);
    validatePkcs12Password(normalizedBuffer, password);
    const certificateEncryption = encryptBuffer(normalizedBuffer);
    const passwordEncryption = encryptString(password);

    const result = await prisma.$transaction(async (tx) => {
      if (activate) {
        const activeCertificates = await tx.digitalCertificate.findMany({
          where: {
            tenantId,
            tipo,
            isActive: true,
            scope,
            ...(scope === DigitalCertificateScope.LAWYER
              ? { responsavelUsuarioId: userId }
              : {}),
          },
        });

        if (activeCertificates.length > 0) {
          const activeIds = activeCertificates.map((item) => item.id);

          await tx.digitalCertificate.updateMany({
            where: {
              id: {
                in: activeIds,
              },
            },
            data: {
              isActive: false,
            },
          });

          await tx.digitalCertificateLog.createMany({
            data: activeIds.map((certificateId) => ({
              tenantId,
              digitalCertificateId: certificateId,
              action: DigitalCertificateLogAction.DISABLED,
              actorId: userId,
              message:
                "Desativado automaticamente ao subir novo certificado.",
            })),
          });
        }
      }

      const created = await tx.digitalCertificate.create({
        data: {
          tenantId,
          responsavelUsuarioId: userId,
          label,
          tipo,
          scope,
          encryptedData: new Uint8Array(certificateEncryption.encrypted),
          encryptedPassword: new Uint8Array(passwordEncryption.encrypted),
          iv: new Uint8Array(certificateEncryption.iv),
          passwordIv: new Uint8Array(passwordEncryption.iv),
          isActive: activate,
          validUntil: validUntil ?? null,
          logs: {
            create: [
              {
                tenantId,
                action: DigitalCertificateLogAction.CREATED,
                actorId: userId,
                message: "Certificado adicionado pelo usuário.",
              },
              ...(activate
                ? [
                    {
                      tenantId,
                      action: DigitalCertificateLogAction.ENABLED,
                      actorId: userId,
                      message: "Certificado ativado para integrações PJe.",
                    },
                  ]
                : []),
            ],
          },
        },
        include: {
          responsavelUsuario: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      return created;
    });

    revalidatePath("/configuracoes/certificados");

    return {
      success: true,
      certificate: sanitizeCertificate(result),
    };
  } catch (error) {
    logger.error(
      { error, tenantId, userId },
      "Falha ao salvar certificado digital",
    );

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro desconhecido ao salvar certificado",
    };
  }
}

export async function listDigitalCertificates(tenantId: string) {
  if (!tenantId) {
    throw new Error("tenantId é obrigatório");
  }

  const certificates = await prisma.digitalCertificate.findMany({
    where: {
      tenantId,
    },
    orderBy: [
      {
        isActive: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
    select: {
      id: true,
      tenantId: true,
      responsavelUsuarioId: true,
      label: true,
      tipo: true,
      scope: true,
      isActive: true,
      validUntil: true,
      lastValidatedAt: true,
      lastUsedAt: true,
      createdAt: true,
      updatedAt: true,
      responsavelUsuario: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  return certificates.map(sanitizeCertificate);
}

export async function listMyDigitalCertificates() {
  const { tenantId, userId, role } = await requireActionContext();
  const policy = await getTenantPolicy(tenantId);

  if (!policyAllowsScope(policy, DigitalCertificateScope.LAWYER)) {
    return [];
  }

  // Verificar se o usuário é advogado
  const advogado =
    role === "SUPER_ADMIN"
      ? { id: "super-admin" }
      : await prisma.advogado.findFirst({
          where: {
            usuarioId: userId,
            tenantId,
          },
          select: { id: true },
        });

  if (!advogado) {
    return [];
  }

  // Buscar certificados do advogado atual
  const certificates = await prisma.digitalCertificate.findMany({
    where: {
      tenantId,
      responsavelUsuarioId: userId,
      scope: DigitalCertificateScope.LAWYER,
    },
    orderBy: [
      {
        isActive: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
    select: {
      id: true,
      tenantId: true,
      responsavelUsuarioId: true,
      label: true,
      tipo: true,
      scope: true,
      isActive: true,
      validUntil: true,
      lastValidatedAt: true,
      lastUsedAt: true,
      createdAt: true,
      updatedAt: true,
      responsavelUsuario: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  return certificates.map((cert) => {
    const sanitized = sanitizeCertificate(cert);
    return {
      ...sanitized,
      validUntil: cert.validUntil?.toISOString() ?? null,
      lastValidatedAt: cert.lastValidatedAt?.toISOString() ?? null,
      lastUsedAt: cert.lastUsedAt?.toISOString() ?? null,
      createdAt: cert.createdAt.toISOString(),
      updatedAt: cert.updatedAt.toISOString(),
    };
  });
}

export async function getDigitalCertificatePolicy() {
  try {
    const { tenantId } = await requireActionContext();
    const policy = await getTenantPolicy(tenantId);

    return { success: true, policy };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao buscar política.",
    };
  }
}

export async function deactivateDigitalCertificate({
  certificateId,
}: {
  certificateId: string;
}) {
  const context = await requireActionContext();
  const { tenantId, userId } = context;

  if (!certificateId) {
    throw new Error("certificateId é obrigatório");
  }

  try {
    const policy = await getTenantPolicy(tenantId);
    const certificate = await prisma.digitalCertificate.findFirst({
      where: {
        id: certificateId,
        tenantId,
      },
      select: {
        id: true,
        scope: true,
        responsavelUsuarioId: true,
      },
    });

    if (!certificate) {
      return { success: false, error: "Certificado não encontrado" };
    }

    await assertCertificateAccess({ context, certificate, policy });

    const updated = await prisma.digitalCertificate.update({
      where: {
        id: certificateId,
        tenantId,
      },
      data: {
        isActive: false,
        logs: {
          create: {
            tenantId,
            action: DigitalCertificateLogAction.DISABLED,
            actorId: userId,
            message: "Certificado desativado manualmente.",
          },
        },
      },
      select: {
        id: true,
        isActive: true,
        updatedAt: true,
      },
    });

    revalidatePath("/configuracoes/certificados");

    return { success: true, certificate: updated };
  } catch (error) {
    logger.error(
      { error, tenantId, certificateId, userId },
      "Falha ao desativar certificado digital",
    );

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro desconhecido ao desativar certificado",
    };
  }
}

export async function activateDigitalCertificate({
  certificateId,
}: {
  certificateId: string;
}) {
  const context = await requireActionContext();
  const { tenantId, userId } = context;

  if (!certificateId) {
    throw new Error("certificateId é obrigatório");
  }

  try {
    const policy = await getTenantPolicy(tenantId);

    const result = await prisma.$transaction(async (tx) => {
      const certificate = await tx.digitalCertificate.findFirst({
        where: {
          id: certificateId,
          tenantId,
        },
        select: {
          id: true,
          tipo: true,
          scope: true,
          responsavelUsuarioId: true,
        },
      });

      if (!certificate) {
        throw new Error("Certificado não encontrado");
      }

      await assertCertificateAccess({
        context,
        certificate: {
          id: certificate.id,
          scope: certificate.scope,
          responsavelUsuarioId: certificate.responsavelUsuarioId,
        },
        policy,
      });

      // Desativar outros certificados do mesmo tipo
      const activeIds = await tx.digitalCertificate.findMany({
        where: {
          tenantId,
          tipo: certificate.tipo,
          isActive: true,
          scope: certificate.scope,
          id: {
            not: certificateId,
          },
          ...(certificate.scope === DigitalCertificateScope.LAWYER
            ? { responsavelUsuarioId: certificate.responsavelUsuarioId }
            : {}),
        },
        select: { id: true },
      });

      if (activeIds.length > 0) {
        const ids = activeIds.map((item) => item.id);

        await tx.digitalCertificate.updateMany({
          where: { id: { in: ids } },
          data: { isActive: false },
        });

        await tx.digitalCertificateLog.createMany({
          data: ids.map((id) => ({
            tenantId,
            digitalCertificateId: id,
            action: DigitalCertificateLogAction.DISABLED,
            actorId: userId,
            message: "Desativado ao ativar outro certificado.",
          })),
        });
      }

      const updated = await tx.digitalCertificate.update({
        where: {
          id: certificateId,
        },
        data: {
          isActive: true,
          logs: {
            create: {
              tenantId,
              action: DigitalCertificateLogAction.ENABLED,
              actorId: userId,
              message: "Certificado ativado manualmente.",
            },
          },
        },
        select: {
          id: true,
          isActive: true,
          updatedAt: true,
        },
      });

      return updated;
    });

    revalidatePath("/configuracoes/certificados");

    return { success: true, certificate: result };
  } catch (error) {
    logger.error(
      { error, tenantId, certificateId, userId },
      "Falha ao ativar certificado digital",
    );

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro desconhecido ao ativar certificado",
    };
  }
}

export async function listDigitalCertificateLogs({
  certificateId,
  cursor,
  take = 20,
}: {
  certificateId: string;
  cursor?: string;
  take?: number;
}) {
  const context = await requireActionContext();
  const { tenantId } = context;

  if (!certificateId) {
    throw new Error("certificateId é obrigatório");
  }

  const policy = await getTenantPolicy(tenantId);
  const certificate = await prisma.digitalCertificate.findFirst({
    where: {
      id: certificateId,
      tenantId,
    },
    select: {
      id: true,
      scope: true,
      responsavelUsuarioId: true,
    },
  });

  if (!certificate) {
    throw new Error("Certificado não encontrado");
  }

  await assertCertificateAccess({ context, certificate, policy });

  const logs = await prisma.digitalCertificateLog.findMany({
    where: {
      tenantId,
      digitalCertificateId: certificateId,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: take + 1,
    ...(cursor
      ? {
          cursor: {
            id: cursor,
          },
          skip: 1,
        }
      : {}),
    include: {
      actor: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  const hasNextPage = logs.length > take;
  const items = hasNextPage ? logs.slice(0, -1) : logs;
  const nextCursor = hasNextPage ? items[items.length - 1]?.id : undefined;

  const sanitized = items.map((log) => ({
    id: log.id,
    action: log.action,
    message: log.message,
    createdAt: log.createdAt,
    actor: log.actor
      ? {
          id: log.actor.id,
          firstName: log.actor.firstName,
          lastName: log.actor.lastName,
          email: log.actor.email,
        }
      : null,
  }));

  return {
    items: sanitized,
    nextCursor,
  };
}

export async function testDigitalCertificate({
  certificateId,
}: {
  certificateId: string;
}) {
  const context = await requireActionContext();
  const { tenantId, userId } = context;

  if (!certificateId) {
    throw new Error("certificateId é obrigatório");
  }

  const certificate = await prisma.digitalCertificate.findFirst({
    where: {
      id: certificateId,
      tenantId,
    },
    select: {
      id: true,
      encryptedData: true,
      iv: true,
      encryptedPassword: true,
      passwordIv: true,
      tipo: true,
      scope: true,
      responsavelUsuarioId: true,
    },
  });

  if (!certificate) {
    return {
      success: false,
      error: "Certificado não encontrado",
    };
  }

  try {
    const policy = await getTenantPolicy(tenantId);
    await assertCertificateAccess({
      context,
      certificate: {
        id: certificate.id,
        scope: certificate.scope,
        responsavelUsuarioId: certificate.responsavelUsuarioId,
      },
      policy,
    });

    const certificateBuffer = decryptBuffer(
      new Uint8Array(certificate.encryptedData as unknown as Uint8Array),
      new Uint8Array(certificate.iv as unknown as Uint8Array),
    );
    const password = decryptToString(
      new Uint8Array(certificate.encryptedPassword as unknown as Uint8Array),
      new Uint8Array(certificate.passwordIv as unknown as Uint8Array),
    );
    const normalizedBuffer = normalizePkcs12Buffer(certificateBuffer);

    validatePkcs12Password(normalizedBuffer, password);

    let extraMessage: string | undefined;
    if (certificate.tipo === DigitalCertificateType.PJE) {
      const comunicaTest = await testComunicaMtlsConnection({
        pfx: normalizedBuffer,
        passphrase: password,
      });

      if (!comunicaTest.ok) {
        throw new Error(comunicaTest.message);
      }

      extraMessage = comunicaTest.message;
    }

    await prisma.digitalCertificate.update({
      where: {
        id: certificateId,
      },
      data: {
        lastValidatedAt: new Date(),
      },
      include: {
        logs: true,
      },
    });

    await prisma.digitalCertificateLog.create({
      data: {
        tenantId,
        digitalCertificateId: certificateId,
        action: DigitalCertificateLogAction.TESTED,
        actorId: userId,
        message: `Teste concluído (${certificate.tipo}).${
          extraMessage ? ` ${extraMessage}` : ""
        }`,
      },
    });

    return {
      success: true,
      message:
        certificate.tipo === DigitalCertificateType.PJE && extraMessage
          ? extraMessage
          : "Certificado validado com sucesso.",
    };
  } catch (error) {
    logger.error(
      { error, tenantId, certificateId, userId },
      "Falha ao testar certificado digital",
    );

    await prisma.digitalCertificate.update({
      where: { id: certificateId },
      data: {},
    });

    await prisma.digitalCertificateLog.create({
      data: {
        tenantId,
        digitalCertificateId: certificateId,
        action: DigitalCertificateLogAction.TESTED,
        actorId: userId,
        message: `Teste falhou: ${
          error instanceof Error ? error.message : "erro desconhecido"
        }`,
      },
    });

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro desconhecido ao testar certificado",
    };
  }
}

export async function uploadDigitalCertificateFromForm(
  formData: FormData,
) {
  const { tenantId, userId } = await requireActionContext();

  const file = formData.get("certificate") as File | null;
  const password = formData.get("password") as string | null;
  const label = formData.get("label") as string | null;
  const validUntilStr = formData.get("validUntil") as string | null;
  const activateStr = formData.get("activate") as string | null;
  const tipo = (formData.get("tipo") as string) || "PJE";
  const scope = (formData.get("scope") as string) || "OFFICE";

  if (!file) {
    return {
      success: false,
      error: "Arquivo do certificado não foi enviado",
    };
  }

  if (!password || password.trim().length === 0) {
    return {
      success: false,
      error: "A senha do certificado é obrigatória",
    };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    const validUntil = validUntilStr
      ? new Date(validUntilStr)
      : null;

    const activate = activateStr !== "false";

    const normalizedScope =
      scope === DigitalCertificateScope.LAWYER
        ? DigitalCertificateScope.LAWYER
        : DigitalCertificateScope.OFFICE;

    return await uploadDigitalCertificate({
      fileBuffer,
      password,
      label: label || undefined,
      validUntil,
      activate,
      tipo: tipo as DigitalCertificateType,
      scope: normalizedScope,
    });
  } catch (error) {
    logger.error(
      { error, tenantId, userId },
      "Falha ao processar upload de certificado via formulário",
    );

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro desconhecido ao processar certificado",
    };
  }
}
