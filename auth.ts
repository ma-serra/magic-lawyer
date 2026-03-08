/* eslint-disable no-console */

import type { NextAuthOptions, Session, User } from "next-auth";
import type { JWT } from "next-auth/jwt";

import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import prisma from "./app/lib/prisma";
import { getTenantAccessibleModules } from "./app/lib/tenant-modules";

// Função para detectar se é um preview deployment com subdomínio
function isPreviewWithSubdomain(host: string): boolean {
  const cleanHost = host.split(":")[0];

  // Detecta padrões como: sandra.magic-lawyer-4ye22ftxh-magiclawyer.vercel.app
  return (
    cleanHost.includes("vercel.app") &&
    !cleanHost.includes("magiclawyer.vercel.app") &&
    cleanHost.includes(".")
  );
}

// Função para extrair o subdomínio de um preview deployment
function extractSubdomainFromPreview(host: string): string | null {
  const cleanHost = host.split(":")[0];

  if (isPreviewWithSubdomain(cleanHost)) {
    const parts = cleanHost.split(".");

    if (parts.length > 0) {
      return parts[0]; // Retorna o primeiro parte (ex: "sandra")
    }
  }

  return null;
}

// Função para extrair tenant do domínio
function extractTenantFromDomain(host: string): string | null {
  // Remove porta se existir
  const cleanHost = host.split(":")[0];

  // Para preview deployments com subdomínio: sandra.magic-lawyer-4ye22ftxh-magiclawyer.vercel.app
  if (isPreviewWithSubdomain(cleanHost)) {
    const subdomain = extractSubdomainFromPreview(cleanHost);

    if (subdomain) {
      return subdomain;
    }
  }

  // Para domínios Vercel: subdomain.magiclawyer.vercel.app
  if (cleanHost.endsWith(".magiclawyer.vercel.app")) {
    const subdomain = cleanHost.replace(".magiclawyer.vercel.app", "");

    // Se não é o domínio principal, retorna o subdomínio
    if (subdomain && subdomain !== "magiclawyer") {
      return subdomain;
    }
  }

  // Para domínios customizados: subdomain.magiclawyer.com.br
  if (cleanHost.endsWith(".magiclawyer.com.br")) {
    const subdomain = cleanHost.replace(".magiclawyer.com.br", "");

    if (subdomain) {
      return subdomain;
    }
  }

  // Para desenvolvimento local: subdomain.localhost
  if (cleanHost.endsWith(".localhost")) {
    const subdomain = cleanHost.replace(".localhost", "");

    if (subdomain) {
      return subdomain; // Manter case original
    }
  }

  // Para domínios diretos: sandra.com.br
  // Neste caso, o domínio completo é o identificador do tenant
  if (
    !cleanHost.includes("magiclawyer") &&
    !cleanHost.includes("vercel.app") &&
    !cleanHost.includes("localhost")
  ) {
    return cleanHost;
  }

  return null;
}

// Campos extras que vamos guardar no token
// - id, tenantId, role, name, email

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  // Configuração para aceitar qualquer domínio localhost
  useSecureCookies: process.env.NODE_ENV === "production",
  providers: [
    Credentials({
      name: "Credenciais",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
        tenant: { label: "Escritório", type: "text" }, // pode ser slug ou domínio
      },
      authorize: async (credentials, req) => {
        const normalizedEmail = credentials?.email?.trim().toLowerCase();
        const normalizedTenant = credentials?.tenant?.trim().toLowerCase();

        // Tentar detectar tenant pelo domínio da requisição
        const host = req?.headers?.host || "";
        const tenantFromDomain = extractTenantFromDomain(host)?.toLowerCase();

        // Se o tenant está vazio, undefined ou 'undefined', tratamos como auto-detect
        // Mas se detectamos pelo domínio, usamos esse
        const shouldAutoDetect =
          !normalizedTenant ||
          normalizedTenant === "undefined" ||
          normalizedTenant === "";

        const finalTenant = tenantFromDomain || normalizedTenant;

        const attemptContext = {
          email: normalizedEmail ?? "(missing)",
          tenant: shouldAutoDetect ? "(auto)" : finalTenant,
          tenantFromDomain,
          rawTenant: credentials?.tenant,
          normalizedTenant,
          shouldAutoDetect,
          finalTenant,
        };

        if (!credentials?.email || !credentials?.password) {
          console.warn(
            "[auth] Credenciais incompletas para login",
            attemptContext,
          );

          return null;
        }

        console.info("[auth] Tentativa de login recebida", attemptContext);

        try {
          const email = normalizedEmail ?? credentials.email;

          // Log para debug
          console.info("[auth] Buscando usuário", {
            email,
            tenantWhere: shouldAutoDetect ? "todos os tenants" : "específico",
            tenant: shouldAutoDetect ? "(auto-detect)" : finalTenant,
            tenantFromDomain,
            shouldAutoDetect,
            currentDomain: host,
          });

          // PRIMEIRO: Verificar se é SuperAdmin
          console.info("[auth] Verificando se é SuperAdmin");
          const superAdmin = await prisma.superAdmin.findUnique({
            where: { email },
          });

          if (superAdmin) {
            console.info("[auth] SuperAdmin encontrado", {
              id: superAdmin.id,
              email: superAdmin.email,
            });

            // Verificar senha do SuperAdmin
            if (!superAdmin.passwordHash) {
              console.warn("[auth] SuperAdmin sem senha cadastrada");

              return null;
            }

            const validPassword = await bcrypt.compare(
              credentials.password,
              superAdmin.passwordHash,
            );

            if (!validPassword) {
              console.warn("[auth] Senha inválida para SuperAdmin");

              return null;
            }

            // Login do SuperAdmin autorizado
            const resultUser = {
              id: superAdmin.id,
              email: superAdmin.email,
              name: `${superAdmin.firstName} ${superAdmin.lastName}`,
              image: superAdmin.image || undefined,
              tenantId: null, // SuperAdmin não tem tenant
              role: "SUPER_ADMIN",
              tenantSlug: null,
              tenantName: "Magic Lawyer Admin",
              permissions: ["*"], // SuperAdmin tem todas as permissões
              tenantModules: ["*"],
            };

            console.info("[auth] Login SuperAdmin autorizado", {
              ...attemptContext,
              userId: superAdmin.id,
              role: "SUPER_ADMIN",
            });

            return resultUser as any;
          }

          // SEGUNDO: Se não é SuperAdmin, buscar usuário normal
          let tenantWhere: any = undefined;

          if (!shouldAutoDetect && finalTenant) {
            tenantWhere = {
              OR: [
                { slug: { equals: finalTenant, mode: "insensitive" } },
                { domain: { equals: finalTenant, mode: "insensitive" } },
              ],
            };
            console.info("[auth] Buscando usuário com filtro de tenant", {
              finalTenant,
              tenantWhere,
            });
          } else {
            console.info(
              "[auth] Buscando usuário SEM filtro de tenant (auto-detect)",
            );
          }

          // Primeiro, vamos tentar buscar o usuário sem filtro de tenant para debug
          if (shouldAutoDetect) {
            console.info("[auth] Buscando usuário normal em todos os tenants");
            const allUsers = await prisma.usuario.findMany({
              where: {
                email: { equals: email, mode: "insensitive" },
                active: true,
              },
              include: {
                tenant: {
                  select: {
                    id: true,
                    slug: true,
                    name: true,
                    status: true,
                  },
                },
              },
            });

            console.info("[auth] Usuários encontrados em todos os tenants", {
              count: allUsers.length,
              users: allUsers.map((u) => ({
                id: u.id,
                email: u.email,
                tenantSlug: u.tenant?.slug,
                tenantName: u.tenant?.name,
                tenantStatus: u.tenant?.status,
              })),
            });

            // IMPORTANTE: Verificar se algum tenant está suspenso/cancelado ANTES de continuar
            const suspendedTenant = allUsers.find(
              (u) => u.tenant?.status === "SUSPENDED",
            );
            const cancelledTenant = allUsers.find(
              (u) => u.tenant?.status === "CANCELLED",
            );

            if (suspendedTenant) {
              console.warn("[auth] Tenant suspenso detectado no auto-detect", {
                tenantStatus: suspendedTenant.tenant?.status,
              });
              throw new Error("TENANT_SUSPENDED");
            }

            if (cancelledTenant) {
              console.warn("[auth] Tenant cancelado detectado no auto-detect", {
                tenantStatus: cancelledTenant.tenant?.status,
              });
              throw new Error("TENANT_CANCELLED");
            }

            // Se encontrou usuário em tenant específico e está no domínio principal, redirecionar
            if (
              allUsers.length > 0 &&
              !tenantFromDomain &&
              host.includes("magiclawyer.vercel.app")
            ) {
              console.info("[auth] Verificando redirecionamento", {
                allUsersCount: allUsers.length,
                tenantFromDomain,
                host,
                users: allUsers.map((u) => ({
                  email: u.email,
                  tenantSlug: u.tenant?.slug,
                  tenantName: u.tenant?.name,
                })),
              });

              const userWithSpecificTenant = allUsers.find(
                (u) => u.tenant?.slug && u.tenant.slug !== "magiclawyer",
              );

              if (userWithSpecificTenant) {
                const tenantSlug = userWithSpecificTenant.tenant?.slug;

                console.info("[auth] REDIRECIONANDO para tenant específico", {
                  userEmail: email,
                  userTenant: tenantSlug,
                  currentDomain: host,
                });

                // Retornar erro com redirecionamento
                throw new Error(`REDIRECT_TO_TENANT:${tenantSlug}`);
              } else {
                console.info(
                  "[auth] Usuário encontrado mas não precisa redirecionar",
                  {
                    userEmail: email,
                    userTenants: allUsers.map((u) => u.tenant?.slug),
                  },
                );
              }
            }
          }

          const user = await prisma.usuario.findFirst({
            where: {
              email: { equals: email, mode: "insensitive" },
              ...(tenantWhere
                ? {
                    tenant: tenantWhere,
                  }
                : {}),
              active: true,
            },
            include: {
              tenant: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                  status: true,
                  statusReason: true,
                  statusChangedAt: true,
                  sessionVersion: true,
                  planRevision: true,
                  branding: true,
                  nomeFantasia: true,
                  razaoSocial: true,
                },
              },
              permissoes: {
                select: {
                  permissao: true,
                },
              },
            } as any,
          });

          // Log do resultado da busca
          console.info("[auth] Resultado da busca", {
            userFound: !!user,
            userId: user?.id,
            tenantId: user?.tenantId,
            tenantSlug: (user as any)?.tenant?.slug,
            tenantName: (user as any)?.tenant?.name,
          });

          if (!user || !user.passwordHash) {
            console.warn(
              "[auth] Usuário não encontrado ou sem senha cadastrada",
              attemptContext,
            );

            return null;
          }

          const valid = await bcrypt.compare(
            credentials.password,
            user.passwordHash,
          );

          if (!valid) {
            console.warn(
              "[auth] Senha inválida para o usuário",
              attemptContext,
            );

            return null;
          }

          const tenantData = (user as any)?.tenant as
            | (typeof user & {
                branding?: {
                  logoUrl?: string | null;
                  faviconUrl?: string | null;
                } | null;
                status?: string;
                slug?: string | null;
                nomeFantasia?: string | null;
                razaoSocial?: string | null;
                name?: string | null;
              })
            | undefined;
          const permissionsRaw = ((user as any)?.permissoes ?? []) as Array<{
            permissao: string;
          }>;

          if (tenantData?.status !== "ACTIVE") {
            console.warn("[auth] Tenant com acesso bloqueado", {
              ...attemptContext,
              tenantStatus: tenantData?.status,
            });

            // Retornar erro específico baseado no status para exibir mensagem correta
            if (tenantData?.status === "SUSPENDED") {
              throw new Error("TENANT_SUSPENDED");
            } else if (tenantData?.status === "CANCELLED") {
              throw new Error("TENANT_CANCELLED");
            } else {
              throw new Error(`TENANT_STATUS_${tenantData?.status}`);
            }
          }

          const tenantName =
            tenantData?.nomeFantasia ??
            tenantData?.razaoSocial ??
            tenantData?.name ??
            tenantData?.slug ??
            undefined;

          const permissions = permissionsRaw.map(
            (permission) => permission.permissao,
          );

          const accessibleModules = await getTenantAccessibleModules(
            user.tenantId,
          );

          // Buscar sessionVersion do usuário
          const sessionVersion = (user as any).sessionVersion || 1;
          const tenantSessionVersion = (tenantData as any)?.sessionVersion || 1;
          const tenantPlanRevision = (tenantData as any)?.planRevision || 1;

          const resultUser = {
            id: user.id,
            email: user.email,
            name:
              [user.firstName, user.lastName].filter(Boolean).join(" ") ||
              undefined,
            image: user.avatarUrl || undefined,
            tenantId: user.tenantId,
            role: user.role,
            tenantSlug: tenantData?.slug || undefined,
            tenantName,
            tenantLogoUrl: tenantData?.branding?.logoUrl || undefined,
            tenantFaviconUrl: tenantData?.branding?.faviconUrl || undefined,
            permissions,
            tenantModules: accessibleModules,
            // Campos de versionamento de sessão
            sessionVersion,
            tenantSessionVersion,
            tenantPlanRevision,
            tenantStatus: tenantData?.status,
            tenantStatusReason: tenantData?.statusReason,
          } as unknown as User & {
            tenantId: string;
            role: string;
            permissions: string[];
            tenantModules: string[];
            sessionVersion: number;
            tenantSessionVersion: number;
            tenantPlanRevision: number;
            tenantStatus: string;
            tenantStatusReason?: string | null;
          };

          console.info("[auth] Login autorizado", {
            ...attemptContext,
            userId: user.id,
            tenantId: user.tenantId,
            role: user.role,
          });

          return resultUser as any;
        } catch (error) {
          // Verificar se é erro de redirecionamento
          if (
            error instanceof Error &&
            error.message.startsWith("REDIRECT_TO_TENANT:")
          ) {
            console.info("[auth] Redirecionamento para tenant específico", {
              ...attemptContext,
              redirectTenant: error.message.replace("REDIRECT_TO_TENANT:", ""),
            });

            // Re-lançar o erro para ser tratado pelo cliente
            throw error;
          }

          // Verificar se é erro de tenant suspenso/cancelado
          if (
            error instanceof Error &&
            (error.message === "TENANT_SUSPENDED" ||
              error.message === "TENANT_CANCELLED")
          ) {
            console.warn("[auth] Tenant suspenso/cancelado detectado", {
              ...attemptContext,
              error: error.message,
            });

            // Re-lançar o erro para ser tratado pelo cliente
            throw error;
          }

          const safeError =
            error instanceof Error
              ? { message: error.message, stack: error.stack }
              : error;

          console.error("[auth] Erro inesperado durante autenticação", {
            ...attemptContext,
            error: safeError,
          });

          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({
      token,
      user,
      trigger,
      session: sessionUpdate,
    }: {
      token: JWT;
      user?:
        | (User & {
            tenantId?: string;
            role?: string;
            tenantSlug?: string;
            tenantName?: string;
            tenantLogoUrl?: string;
            tenantFaviconUrl?: string;
            sessionVersion?: number;
            tenantSessionVersion?: number;
            tenantPlanRevision?: number;
            tenantStatus?: string;
            tenantStatusReason?: string | null;
          })
        | null;
      trigger?: "update" | "signIn" | "signUp";
      session?: Session | Record<string, unknown> | null;
    }): Promise<JWT> {
      if (trigger === "update" && sessionUpdate) {
        const rawPayload = (sessionUpdate as any) ?? {};
        const incomingModules = Array.isArray(rawPayload.tenantModules)
          ? rawPayload.tenantModules
          : Array.isArray(rawPayload.user?.tenantModules)
            ? rawPayload.user?.tenantModules
            : undefined;

        if (incomingModules) {
          (token as any).tenantModules = incomingModules;
        }

        const incomingPlanRevision =
          typeof rawPayload.tenantPlanRevision === "number"
            ? rawPayload.tenantPlanRevision
            : typeof rawPayload.user?.tenantPlanRevision === "number"
              ? rawPayload.user?.tenantPlanRevision
              : undefined;

        if (typeof incomingPlanRevision === "number") {
          (token as any).tenantPlanRevision = incomingPlanRevision;
        }

        const incomingTenantLogoUrl =
          rawPayload.tenantLogoUrl !== undefined
            ? rawPayload.tenantLogoUrl
            : rawPayload.user?.tenantLogoUrl;
        if (incomingTenantLogoUrl !== undefined) {
          (token as any).tenantLogoUrl = incomingTenantLogoUrl || undefined;
        }

        const incomingTenantFaviconUrl =
          rawPayload.tenantFaviconUrl !== undefined
            ? rawPayload.tenantFaviconUrl
            : rawPayload.user?.tenantFaviconUrl;
        if (incomingTenantFaviconUrl !== undefined) {
          (token as any).tenantFaviconUrl =
            incomingTenantFaviconUrl || undefined;
        }
      }

      // No login
      if (user) {
        (token as any).id = user.id;
        (token as any).tenantId = (user as any).tenantId;
        (token as any).role = (user as any).role;
        (token as any).tenantSlug = (user as any).tenantSlug;
        (token as any).tenantName = (user as any).tenantName;
        (token as any).tenantLogoUrl = (user as any).tenantLogoUrl;
        (token as any).tenantFaviconUrl = (user as any).tenantFaviconUrl;
        (token as any).permissions = (user as any).permissions ?? [];
        (token as any).avatarUrl = (user as any).image; // image contém o avatarUrl
        (token as any).tenantModules = (user as any).tenantModules ?? [];
        // Campos de versionamento de sessão
        (token as any).sessionVersion = (user as any).sessionVersion ?? 1;
        (token as any).tenantSessionVersion =
          (user as any).tenantSessionVersion ?? 1;
        (token as any).tenantPlanRevision =
          (user as any).tenantPlanRevision ?? 1;
        (token as any).tenantStatus = (user as any).tenantStatus;
        (token as any).tenantStatusReason = (user as any).tenantStatusReason;
      }

      return token;
    },
    async session({
      session,
      token,
    }: {
      session: Session;
      token: JWT;
    }): Promise<Session> {
      if (session.user) {
        // Usar dados do token (mais rápido e confiável)
        (session.user as any).id = (token as any).id as string | undefined;
        (session.user as any).tenantId = (token as any).tenantId as
          | string
          | undefined;
        (session.user as any).role = (token as any).role as string | undefined;
        (session.user as any).tenantSlug = (token as any).tenantSlug as
          | string
          | undefined;
        (session.user as any).tenantName = (token as any).tenantName as
          | string
          | undefined;
        (session.user as any).tenantLogoUrl = (token as any).tenantLogoUrl as
          | string
          | undefined;
        (session.user as any).tenantFaviconUrl = (token as any)
          .tenantFaviconUrl as string | undefined;
        (session.user as any).permissions = (token as any).permissions as
          | string[]
          | undefined;
        (session.user as any).avatarUrl = (token as any).avatarUrl as
          | string
          | undefined;
        (session.user as any).tenantModules = (token as any).tenantModules as
          | string[]
          | undefined;
        // Campos de versionamento de sessão
        (session.user as any).sessionVersion = (token as any).sessionVersion as
          | number
          | undefined;
        (session.user as any).tenantSessionVersion = (token as any)
          .tenantSessionVersion as number | undefined;
        (session.user as any).tenantPlanRevision = (token as any)
          .tenantPlanRevision as number | undefined;
        (session.user as any).tenantStatus = (token as any).tenantStatus as
          | string
          | undefined;
        (session.user as any).tenantStatusReason = (token as any)
          .tenantStatusReason as string | null | undefined;
      }

      return session;
    },
  },
};
