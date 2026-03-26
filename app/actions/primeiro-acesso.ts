"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";

import prisma from "@/app/lib/prisma";
import {
  extractRequestIp,
  extractRequestUserAgent,
  logOperationalEvent,
} from "@/app/lib/audit/operational-events";
import { enviarEmailPrimeiroAcesso, maskEmail } from "@/app/lib/first-access-email";
import { validarTokenPrimeiroAcesso } from "@/app/lib/first-access-token";
import { getTenantHostHints } from "@/lib/tenant-host";

type UsuarioPrimeiroAcesso = {
  id: string;
  tenantId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  active: boolean;
  passwordHash: string | null;
  tenant: {
    id: string;
    slug: string;
    domain: string | null;
    name: string;
    status: string;
  };
};

function extractTenantFromDomain(host: string) {
  const { slugHint, domainHint } = getTenantHostHints(host);
  return slugHint || domainHint;
}

async function resolveTenantHint(tenantHint?: string) {
  const hinted = tenantHint?.trim().toLowerCase();
  if (hinted) return hinted;

  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") || hdrs.get("host") || "";

  return extractTenantFromDomain(host);
}

async function findUsuarioPrimeiroAcesso(
  email: string,
  tenantHint?: string,
): Promise<UsuarioPrimeiroAcesso | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  const resolvedHint = await resolveTenantHint(tenantHint);

  const whereTenant = resolvedHint
    ? {
        OR: [
          { slug: { equals: resolvedHint, mode: "insensitive" as const } },
          { domain: { equals: resolvedHint, mode: "insensitive" as const } },
        ],
      }
    : undefined;

  if (whereTenant) {
    return prisma.usuario.findFirst({
      where: {
        email: { equals: normalizedEmail, mode: "insensitive" },
        tenant: whereTenant,
      },
      include: {
        tenant: {
          select: {
            id: true,
            slug: true,
            domain: true,
            name: true,
            status: true,
          },
        },
      },
    }) as Promise<UsuarioPrimeiroAcesso | null>;
  }

  const matches = (await prisma.usuario.findMany({
    where: {
      email: { equals: normalizedEmail, mode: "insensitive" },
    },
    include: {
      tenant: {
        select: {
          id: true,
          slug: true,
          domain: true,
          name: true,
          status: true,
        },
      },
    },
    take: 5,
  })) as UsuarioPrimeiroAcesso[];

  if (matches.length !== 1) {
    return null;
  }

  return matches[0];
}

function isUsuarioElegivelPrimeiroAcesso(usuario: UsuarioPrimeiroAcesso | null) {
  if (!usuario) return false;
  if (!usuario.active) return false;
  if (usuario.tenant.status !== "ACTIVE") return false;

  return !usuario.passwordHash;
}

export async function checkPrimeiroAcessoPorEmail(params: {
  email: string;
  tenantHint?: string;
}) {
  const usuario = await findUsuarioPrimeiroAcesso(params.email, params.tenantHint);
  const isPrimeiroAcesso = isUsuarioElegivelPrimeiroAcesso(usuario);

  return {
    success: true,
    firstAccess: isPrimeiroAcesso,
    maskedEmail:
      isPrimeiroAcesso && usuario ? maskEmail(usuario.email) : undefined,
  };
}

export async function enviarLinkPrimeiroAcesso(params: {
  email: string;
  tenantHint?: string;
}) {
  const usuario = await findUsuarioPrimeiroAcesso(params.email, params.tenantHint);

  if (!isUsuarioElegivelPrimeiroAcesso(usuario)) {
    return {
      success: false,
      error:
        "Usuário não elegível para primeiro acesso. Verifique o e-mail e tente novamente.",
    };
  }

  if (!usuario) {
    return {
      success: false,
      error:
        "Usuário não elegível para primeiro acesso. Verifique o e-mail e tente novamente.",
    };
  }

  const nomeCompleto =
    `${usuario.firstName || ""} ${usuario.lastName || ""}`.trim() || undefined;

  const envio = await enviarEmailPrimeiroAcesso({
    userId: usuario.id,
    tenantId: usuario.tenantId,
    email: usuario.email,
    nome: nomeCompleto,
    tenantNome: usuario.tenant.name,
  });

  if (!envio.success) {
    return {
      success: false,
      error:
        envio.error ||
        "Não foi possível enviar o e-mail de primeiro acesso no momento.",
    };
  }

  return {
    success: true,
    maskedEmail: maskEmail(usuario.email),
  };
}

export async function validarLinkPrimeiroAcesso(token: string) {
  const validation = validarTokenPrimeiroAcesso(token);

  if (!validation.success) {
    return {
      success: false,
      reason: validation.reason,
    };
  }

  const usuario = await prisma.usuario.findFirst({
    where: {
      id: validation.payload.userId,
      tenantId: validation.payload.tenantId,
      email: { equals: validation.payload.email, mode: "insensitive" },
    },
    include: {
      tenant: {
        select: {
          name: true,
          status: true,
        },
      },
    },
  });

  if (!usuario || !usuario.active || usuario.tenant.status !== "ACTIVE") {
    return {
      success: false,
      reason: "INVALID_SIGNATURE" as const,
    };
  }

  if (usuario.passwordHash) {
    return {
      success: false,
      reason: "MALFORMED" as const,
      alreadyConfigured: true,
    };
  }

  return {
    success: true,
    email: usuario.email,
    tenantName: usuario.tenant.name,
    maskedEmail: maskEmail(usuario.email),
  };
}

export async function concluirPrimeiroAcesso(params: {
  token: string;
  password: string;
  confirmPassword: string;
}) {
  if (!params.password || params.password.length < 8) {
    return {
      success: false,
      error: "A senha deve conter pelo menos 8 caracteres.",
    };
  }

  if (params.password !== params.confirmPassword) {
    return {
      success: false,
      error: "As senhas não coincidem.",
    };
  }

  const validation = validarTokenPrimeiroAcesso(params.token);
  if (!validation.success) {
    return {
      success: false,
      error:
        validation.reason === "EXPIRED"
          ? "Este link expirou. Solicite um novo link de primeiro acesso."
          : "Link inválido de primeiro acesso.",
    };
  }

  const usuario = await prisma.usuario.findFirst({
    where: {
      id: validation.payload.userId,
      tenantId: validation.payload.tenantId,
      email: { equals: validation.payload.email, mode: "insensitive" },
      active: true,
      tenant: {
        status: "ACTIVE",
      },
    },
    select: {
      id: true,
      email: true,
      passwordHash: true,
    },
  });

  if (!usuario) {
    return {
      success: false,
      error: "Usuário não encontrado para concluir o primeiro acesso.",
    };
  }

  if (usuario.passwordHash) {
    return {
      success: false,
      error:
        "Este acesso já foi configurado. Faça login com sua senha atual.",
      alreadyConfigured: true,
    };
  }

  const passwordHash = await bcrypt.hash(params.password, 12);

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: {
      passwordHash,
      updatedAt: new Date(),
    },
  });

  const requestHeaders = await headers();

  await logOperationalEvent({
    tenantId: validation.payload.tenantId,
    category: "ACCESS",
    source: "FIRST_ACCESS",
    action: "PASSWORD_DEFINED",
    status: "SUCCESS",
    actorType: "TENANT_USER",
    actorId: usuario.id,
    actorEmail: usuario.email,
    entityType: "USUARIO",
    entityId: usuario.id,
    route: "/primeiro-acesso/[token]",
    ipAddress: extractRequestIp(requestHeaders),
    userAgent: extractRequestUserAgent(requestHeaders),
    message: "Usuario definiu senha pelo fluxo de primeiro acesso.",
  });

  return {
    success: true,
    email: usuario.email,
  };
}
