"use server";

import { revalidatePath } from "next/cache";

import prisma from "@/app/lib/prisma";
import { getSession } from "@/app/lib/auth";
import {
  getTenantHostHints,
  normalizeTenantDomainInput,
} from "@/lib/tenant-host";

/**
 * Atualiza o domínio de um tenant
 */
export async function updateTenantDomain(
  tenantId: string,
  domain: string | null,
) {
  const session = await getSession();
  const user = session?.user;

  // Verificar se o usuário tem permissão para editar este tenant
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true },
  });

  if (!tenant) {
    throw new Error("Tenant não encontrado");
  }

  // Verificar se o usuário é SuperAdmin ou tem permissão para editar este tenant
  if ((user as any)?.role !== "SUPER_ADMIN") {
    throw new Error("Sem permissão para editar domínios");
  }

  // Se domain não é null, verificar se já existe
  const normalizedDomain = domain
    ? normalizeTenantDomainInput(domain) || null
    : null;

  if (normalizedDomain) {
    const existingTenant = await prisma.tenant.findFirst({
      where: {
        domain: { equals: normalizedDomain, mode: "insensitive" },
        id: { not: tenantId },
      },
      select: { id: true, name: true },
    });

    if (existingTenant) {
      throw new Error(
        `O domínio ${domain} já está sendo usado pelo tenant ${existingTenant.name}`,
      );
    }
  }

  // Atualizar o domínio
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { domain: normalizedDomain },
  });

  revalidatePath("/admin/tenants");

  return { success: true, message: "Domínio atualizado com sucesso" };
}

/**
 * Lista todos os domínios configurados
 */
export async function getTenantDomains() {
  const session = await getSession();
  const user = session?.user;

  if ((user as any)?.role !== "SUPER_ADMIN") {
    throw new Error("Sem permissão para acessar esta informação");
  }

  const tenants = await prisma.tenant.findMany({
    where: {
      domain: { not: null },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      domain: true,
      status: true,
    },
    orderBy: { name: "asc" },
  });

  return tenants;
}

/**
 * Valida se um domínio pode ser usado
 */
export async function validateDomain(domain: string, excludeTenantId?: string) {
  if (!domain) return { valid: true, message: "" };
  const normalizedDomain = normalizeTenantDomainInput(domain);

  // Verificar formato básico do domínio
  const domainRegex =
    /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.([a-zA-Z]{2,}|[a-zA-Z]{2,}\.[a-zA-Z]{2,})$/;

  if (!domainRegex.test(normalizedDomain)) {
    return { valid: false, message: "Formato de domínio inválido" };
  }

  // Verificar se já existe
  const existingTenant = await prisma.tenant.findFirst({
      where: {
      domain: { equals: normalizedDomain, mode: "insensitive" },
      ...(excludeTenantId ? { id: { not: excludeTenantId } } : {}),
    },
    select: { id: true, name: true },
  });

  if (existingTenant) {
    return {
      valid: false,
      message: `O domínio ${domain} já está sendo usado pelo tenant ${existingTenant.name}`,
    };
  }

  return { valid: true, message: "" };
}

/**
 * Detecta o tenant baseado no domínio
 */
export async function getTenantByDomain(host: string) {
  const { cleanHost, slugHint } = getTenantHostHints(host);

  // Buscar por domínio exato
  const tenant = await prisma.tenant.findFirst({
    where: {
      domain: { equals: cleanHost, mode: "insensitive" },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      domain: true,
      status: true,
    },
  });

  if (tenant) {
    return tenant;
  }

  if (slugHint) {
    return await prisma.tenant.findFirst({
      where: {
        slug: slugHint,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        domain: true,
        status: true,
      },
    });
  }

  return null;
}

/**
 * Mapeamento de senhas padrão por tenant e role (apenas para desenvolvimento)
 * Baseado nos seeds do projeto
 */
const DEFAULT_PASSWORDS: Record<string, Record<string, string>> = {
  sandra: {
    ADMIN: "Sandra@123",
    SECRETARIA: "Funcionario@123",
    ADVOGADO: "Advogado@123",
    ADVOGADA: "Advogado@123",
    CLIENTE: "Cliente@123",
    DEFAULT: "Cliente@123",
  },
  salba: {
    ADMIN: "Luciano@123",
    ADVOGADO: "Mariana@123", // Senha padrão para advogados (Mariana)
    ADVOGADA: "Mariana@123",
    CLIENTE: "Cliente1@123", // Senha padrão para clientes
    DEFAULT: "Cliente1@123",
  },
  rvb: {
    ADMIN: "Rvb@123",
    DEFAULT: "Rvb@123",
  },
  "ml-test": {
    ADMIN: "Teste@123",
    DEFAULT: "Teste@123",
  },
};

/**
 * Mapeamento de senhas específicas por email (quando a senha não segue o padrão)
 * Apenas para casos especiais onde a senha não pode ser inferida pelo role
 */
const SPECIFIC_EMAIL_PASSWORDS: Record<string, string> = {
  // Salba - Pedro tem senha diferente
  "pedro@salbaadvocacia.com.br": "Pedro@123",
  // Clientes do Salba com senhas diferentes
  "joao.silva@salbaadvocacia.com.br": "Cliente1@123",
  "maria.oliveira@salbaadvocacia.com.br": "Cliente2@123",
  "carlos.pereira@salbaadvocacia.com.br": "Cliente3@123",
  // Sandra - Robson tem senha especial
  "magiclawyersaas@gmail.com": "Robson123!",
};

/**
 * Busca usuários de um tenant para logins rápidos em modo dev
 * APENAS FUNCIONA EM MODO DE DESENVOLVIMENTO
 */
export async function getDevQuickLogins(host: string): Promise<{
  success: boolean;
  tenant?: {
    id: string;
    name: string;
    slug: string;
  };
  usuarios?: Array<{
    name: string;
    roleLabel: string;
    email: string;
    password: string;
    tenant: string;
    chipColor?: "primary" | "secondary" | "success" | "warning" | "danger" | "default";
  }>;
  error?: string;
}> {
  // Apenas em modo desenvolvimento
  if (process.env.NODE_ENV !== "development") {
    return { success: false, error: "Apenas disponível em modo desenvolvimento" };
  }

  try {
    const tenant = await getTenantByDomain(host);

    if (!tenant) {
      return { success: false, error: "Tenant não encontrado" };
    }

    // Buscar usuários do tenant
    const usuarios = await prisma.usuario.findMany({
      where: {
        tenantId: tenant.id,
        active: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
      },
      orderBy: [
        { role: "asc" },
        { firstName: "asc" },
      ],
    });

    // Mapear senhas padrão
    const tenantPasswords = DEFAULT_PASSWORDS[tenant.slug.toLowerCase()] || DEFAULT_PASSWORDS["sandra"];

    const usuariosComSenhas = usuarios.map((usuario) => {
      const fullName = `${usuario.firstName ?? ""} ${usuario.lastName ?? ""}`.trim() || usuario.email;
      
      // Verificar se há senha específica para este email
      const specificPassword = SPECIFIC_EMAIL_PASSWORDS[usuario.email.toLowerCase()];
      const password = specificPassword || tenantPasswords[usuario.role] || tenantPasswords["DEFAULT"] || "Cliente@123";

      // Determinar cor do chip baseado no role
      let chipColor: "primary" | "secondary" | "success" | "warning" | "danger" | "default" = "default";
      if (usuario.role === "ADMIN") chipColor = "danger";
      else if (usuario.role === "SUPER_ADMIN") chipColor = "warning";
      else if (usuario.role === "ADVOGADO") chipColor = "primary";
      else if (usuario.role === "SECRETARIA") chipColor = "secondary";
      else if (usuario.role === "CLIENTE") chipColor = "success";

      return {
        name: fullName,
        roleLabel: usuario.role,
        email: usuario.email,
        password,
        tenant: tenant.slug,
        chipColor,
      };
    });

    return {
      success: true,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
      usuarios: usuariosComSenhas,
    };
  } catch (error) {
    console.error("Erro ao buscar logins rápidos:", error);
    return { success: false, error: "Erro ao buscar usuários" };
  }
}
