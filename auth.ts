/* eslint-disable no-console */

import type { NextAuthOptions, Session, User } from "next-auth";
import type { JWT } from "next-auth/jwt";

import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import prisma from "./app/lib/prisma";
import {
  extractRequestIp,
  extractRequestUserAgent,
  logOperationalEvent,
} from "./app/lib/audit/operational-events";
import { verifyImpersonationTicket } from "./app/lib/impersonation-ticket";
import { getTenantAccessibleModules } from "./app/lib/tenant-modules";
import {
  buildDefaultTenantDomainBySlug,
  getTenantHostHints,
} from "./lib/tenant-host";

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
        const requestHeaders = new Headers(req?.headers as HeadersInit | undefined);
        const authRoute = "/api/auth/[...nextauth]";
        const ipAddress = extractRequestIp(requestHeaders);
        const userAgent = extractRequestUserAgent(requestHeaders);
        const normalizedEmail = credentials?.email?.trim().toLowerCase();
        const normalizedTenant = credentials?.tenant?.trim().toLowerCase();

        // Tentar detectar tenant pelo domínio da requisição
        const host = req?.headers?.host || "";
        const { cleanHost, slugHint, domainHint } = getTenantHostHints(host);
        const tenantFromDomain = (slugHint || domainHint)?.toLowerCase() ?? null;

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
          hostHints: { cleanHost, slugHint, domainHint },
        };

        if (!credentials?.email || !credentials?.password) {
          console.warn(
            "[auth] Credenciais incompletas para login",
            attemptContext,
          );

          await logOperationalEvent({
            category: "ACCESS",
            source: "NEXTAUTH",
            action: "LOGIN_REJECTED",
            status: "WARNING",
            actorType: "ANONYMOUS",
            actorEmail: normalizedEmail ?? credentials?.email ?? null,
            route: authRoute,
            ipAddress,
            userAgent,
            message: "Tentativa de login com credenciais incompletas.",
            payload: attemptContext,
          });

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
            hostHints: { cleanHost, slugHint, domainHint },
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

              await logOperationalEvent({
                category: "ACCESS",
                source: "NEXTAUTH",
                action: "LOGIN_REJECTED",
                status: "WARNING",
                actorType: "SUPER_ADMIN",
                actorId: superAdmin.id,
                actorName: `${superAdmin.firstName} ${superAdmin.lastName}`.trim(),
                actorEmail: superAdmin.email,
                entityType: "SUPER_ADMIN",
                entityId: superAdmin.id,
                route: authRoute,
                ipAddress,
                userAgent,
                message: "Super admin sem senha cadastrada tentou autenticar.",
                payload: attemptContext,
              });

              return null;
            }

            const validPassword = await bcrypt.compare(
              credentials.password,
              superAdmin.passwordHash,
            );

            if (!validPassword) {
              console.warn("[auth] Senha inválida para SuperAdmin");

              await logOperationalEvent({
                category: "ACCESS",
                source: "NEXTAUTH",
                action: "LOGIN_REJECTED",
                status: "WARNING",
                actorType: "SUPER_ADMIN",
                actorId: superAdmin.id,
                actorName: `${superAdmin.firstName} ${superAdmin.lastName}`.trim(),
                actorEmail: superAdmin.email,
                entityType: "SUPER_ADMIN",
                entityId: superAdmin.id,
                route: authRoute,
                ipAddress,
                userAgent,
                message: "Tentativa de login de super admin com senha inválida.",
                payload: attemptContext,
              });

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

            await logOperationalEvent({
              category: "ACCESS",
              source: "NEXTAUTH",
              action: "LOGIN_SUCCESS",
              status: "SUCCESS",
              actorType: "SUPER_ADMIN",
              actorId: superAdmin.id,
              actorName: `${superAdmin.firstName} ${superAdmin.lastName}`.trim(),
              actorEmail: superAdmin.email,
              entityType: "SUPER_ADMIN",
              entityId: superAdmin.id,
              route: authRoute,
              ipAddress,
              userAgent,
              message: "Login de super admin autorizado.",
              payload: attemptContext,
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
                    domain: true,
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
                  tenantDomain: u.tenant?.domain,
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
                const tenantDomain = userWithSpecificTenant.tenant?.domain?.trim();
                const redirectHost =
                  tenantDomain ||
                  (tenantSlug ? buildDefaultTenantDomainBySlug(tenantSlug) : "");

                console.info("[auth] REDIRECIONANDO para tenant específico", {
                  userEmail: email,
                  userTenant: tenantSlug,
                  redirectHost,
                  currentDomain: host,
                });

                // Retornar erro com redirecionamento
                if (redirectHost) {
                  throw new Error(`REDIRECT_TO_HOST:${redirectHost}`);
                }
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

            await logOperationalEvent({
              tenantId: user?.tenantId ?? null,
              category: "ACCESS",
              source: "NEXTAUTH",
              action: "LOGIN_REJECTED",
              status: "WARNING",
              actorType: "TENANT_USER",
              actorId: user?.id ?? null,
              actorEmail: email,
              entityType: "USUARIO",
              entityId: user?.id ?? null,
              route: authRoute,
              ipAddress,
              userAgent,
              message: "Tentativa de login com usuário inexistente ou sem senha.",
              payload: attemptContext,
            });

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

            await logOperationalEvent({
              tenantId: user.tenantId,
              category: "ACCESS",
              source: "NEXTAUTH",
              action: "LOGIN_REJECTED",
              status: "WARNING",
              actorType: "TENANT_USER",
              actorId: user.id,
              actorName:
                [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
              actorEmail: user.email,
              entityType: "USUARIO",
              entityId: user.id,
              route: authRoute,
              ipAddress,
              userAgent,
              message: "Tentativa de login com senha inválida.",
              payload: attemptContext,
            });

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

            await logOperationalEvent({
              tenantId: user.tenantId,
              category: "ACCESS",
              source: "NEXTAUTH",
              action: "LOGIN_BLOCKED",
              status:
                tenantData?.status === "SUSPENDED" ||
                tenantData?.status === "CANCELLED"
                  ? "ERROR"
                  : "WARNING",
              actorType: "TENANT_USER",
              actorId: user.id,
              actorName:
                [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
              actorEmail: user.email,
              entityType: "TENANT",
              entityId: user.tenantId,
              route: authRoute,
              ipAddress,
              userAgent,
              message: `Login bloqueado por status do tenant: ${tenantData?.status}.`,
              payload: {
                ...attemptContext,
                tenantStatus: tenantData?.status,
              },
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

          await logOperationalEvent({
            tenantId: user.tenantId,
            category: "ACCESS",
            source: "NEXTAUTH",
            action: "LOGIN_SUCCESS",
            status: "SUCCESS",
            actorType: "TENANT_USER",
            actorId: user.id,
            actorName:
              [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
            actorEmail: user.email,
            entityType: "USUARIO",
            entityId: user.id,
            route: authRoute,
            ipAddress,
            userAgent,
            message: "Login autorizado para usuário do tenant.",
            payload: {
              ...attemptContext,
              tenantId: user.tenantId,
              role: user.role,
            },
          });

          return resultUser as any;
        } catch (error) {
          // Verificar se é erro de redirecionamento
          if (
            error instanceof Error &&
            (error.message.startsWith("REDIRECT_TO_TENANT:") ||
              error.message.startsWith("REDIRECT_TO_HOST:"))
          ) {
            const redirectTarget = error.message.startsWith("REDIRECT_TO_HOST:")
              ? error.message.replace("REDIRECT_TO_HOST:", "")
              : error.message.replace("REDIRECT_TO_TENANT:", "");

            console.info("[auth] Redirecionamento para tenant específico", {
              ...attemptContext,
              redirectTarget,
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

            await logOperationalEvent({
              category: "ACCESS",
              source: "NEXTAUTH",
              action: "LOGIN_BLOCKED",
              status: "ERROR",
              actorType: "TENANT_USER",
              actorEmail: normalizedEmail ?? credentials?.email ?? null,
              route: authRoute,
              ipAddress,
              userAgent,
              message: `Login bloqueado por ${error.message}.`,
              payload: {
                ...attemptContext,
                error: error.message,
              },
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
        const impersonationTicket =
          (typeof rawPayload.impersonationTicket === "string"
            ? rawPayload.impersonationTicket
            : typeof rawPayload.user?.impersonationTicket === "string"
              ? rawPayload.user?.impersonationTicket
              : null) ?? null;

        if (impersonationTicket) {
          const currentSessionId = (token as any).id as string | undefined;
          const currentRole = (token as any).role as string | undefined;
          const verification = verifyImpersonationTicket(impersonationTicket, {
            sessionId: currentSessionId,
            role: currentRole,
          });

          if (verification.valid) {
            const nextSession = verification.payload.nextSession;

            (token as any).id = nextSession.id;
            token.email = nextSession.email;
            token.name = nextSession.name ?? undefined;
            token.picture = nextSession.image ?? undefined;
            (token as any).tenantId = nextSession.tenantId ?? undefined;
            (token as any).role = nextSession.role;
            (token as any).tenantSlug = nextSession.tenantSlug ?? undefined;
            (token as any).tenantName = nextSession.tenantName ?? undefined;
            (token as any).tenantLogoUrl =
              nextSession.tenantLogoUrl ?? undefined;
            (token as any).tenantFaviconUrl =
              nextSession.tenantFaviconUrl ?? undefined;
            (token as any).permissions = nextSession.permissions ?? [];
            (token as any).avatarUrl =
              nextSession.avatarUrl ??
              nextSession.image ??
              undefined;
            (token as any).tenantModules = nextSession.tenantModules ?? [];
            (token as any).sessionVersion = nextSession.sessionVersion ?? 1;
            (token as any).tenantSessionVersion =
              nextSession.tenantSessionVersion ?? 1;
            (token as any).tenantPlanRevision =
              nextSession.tenantPlanRevision ?? 1;
            (token as any).tenantStatus = nextSession.tenantStatus ?? undefined;
            (token as any).tenantStatusReason =
              nextSession.tenantStatusReason ?? undefined;
            (token as any).impersonation = nextSession.impersonation ?? null;

            return token;
          }

          console.warn(
            "[auth] Ticket de impersonação rejeitado",
            verification.reason,
          );
        }

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
        token.email = user.email ?? token.email;
        token.name = user.name ?? token.name;
        token.picture = (user as any).image ?? token.picture;
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
        (token as any).impersonation = (user as any).impersonation ?? null;
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
        session.user.name = token.name ?? session.user.name;
        session.user.email = token.email ?? session.user.email;
        session.user.image = (token as any).picture ?? session.user.image;
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
        (session.user as any).impersonation = (token as any).impersonation as
          | {
              active: boolean;
              startedAt: string;
              superAdminId: string;
              superAdminEmail: string;
              superAdminName?: string | null;
              targetUserId: string;
              targetUserEmail: string;
              targetUserName?: string | null;
              targetUserRole: string;
              targetTenantId: string;
              targetTenantSlug?: string | null;
              targetTenantName?: string | null;
            }
          | null
          | undefined;
      }

      return session;
    },
  },
};
