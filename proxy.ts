import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

import { isRouteAllowedByModulesEdge } from "@/app/lib/module-map-edge";
import { getTenantHostHints } from "@/lib/tenant-host";

// Função para detectar dinamicamente o NEXTAUTH_URL baseado no ambiente
function getDynamicNextAuthUrl(host: string): string {
  // Remove porta se existir
  const cleanHost = host.split(":")[0];

  // Para desenvolvimento local
  if (cleanHost.includes("localhost")) {
    return `http://${cleanHost}`;
  }

  // Para preview deployments do Vercel (branches que não são main)
  if (
    cleanHost.includes("vercel.app") &&
    !cleanHost.includes("magiclawyer.vercel.app")
  ) {
    return `https://${cleanHost}`;
  }

  // Para domínio principal de produção
  if (cleanHost.includes("magiclawyer.vercel.app")) {
    return "https://magiclawyer.vercel.app";
  }

  // Para domínios customizados
  return `https://${cleanHost}`;
}

// Função para extrair tenant do domínio
function extractTenantFromDomain(host: string): string | null {
  const { slugHint, domainHint } = getTenantHostHints(host);
  return slugHint || domainHint;
}

export default withAuth(
  async function proxy(req) {
    const pathname = req.nextUrl.pathname;

    // Centralizar configurações em uma única superfície com abas.
    // Mantém compatibilidade de links antigos sem expor rotas separadas.
    if (pathname.startsWith("/configuracoes/")) {
      const legacyToTab: Record<string, string> = {
        "/configuracoes/feriados": "feriados",
        "/configuracoes/billing": "billing",
        "/configuracoes/tribunais": "tribunais",
        "/configuracoes/tipos-peticao": "tipos-peticao",
        "/configuracoes/tipos-contrato": "tipos-contrato",
        "/configuracoes/areas-processo": "areas-processo",
        "/configuracoes/categorias-tarefa": "categorias-tarefa",
        "/configuracoes/asaas": "asaas",
      };

      const tab = legacyToTab[pathname];
      if (tab) {
        const redirectUrl = new URL("/configuracoes", req.url);
        redirectUrl.searchParams.set("tab", tab);

        return NextResponse.redirect(redirectUrl);
      }
    }

    const token = req.nextauth.token;
    const isAuth = !!token;
    const isAuthPage = req.nextUrl.pathname.startsWith("/login");
    let sessionChecked = false; // Controlar se verificou sessão nesta execução

    // Validar sessão periodicamente (a cada 15 segundos)
    const userRole = (token as any)?.role;
    const isSuperAdmin = userRole === "SUPER_ADMIN";
    const hasTenantId = !!(token as any)?.tenantId;

    // Validação para usuários com tenant (usuários comuns)
    if (token && hasTenantId && !isSuperAdmin) {
      const lastCheck = req.cookies.get("ml-last-session-check");
      const shouldCheck =
        !lastCheck || Date.now() - Number(lastCheck.value) > 15000;

      if (shouldCheck) {
        try {
          const host = req.headers.get("host") || "";
          // Em desenvolvimento local, evitar fetch para evitar falhas intermitentes no Edge
          const isLocalhost =
            host.includes("localhost") || host.startsWith("127.0.0.1");

          if (isLocalhost) {
            sessionChecked = true; // marca e não valida via HTTP em dev
            throw new Error("skip-local-session-check");
          }
          const base = req.nextUrl.origin || getDynamicNextAuthUrl(host);
          const url = new URL(
            "/api/internal/session/validate",
            base,
          ).toString();

          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-token": process.env.REALTIME_INTERNAL_TOKEN || "",
            },
            body: JSON.stringify({
              tenantId: (token as any).tenantId,
              userId: (token as any).id,
              tenantVersion: (token as any).tenantSessionVersion || 1,
              userVersion: (token as any).sessionVersion || 1,
            }),
          });

          if (response.status === 409) {
            const data = await response.json();
            const logoutUrl = new URL("/login", req.url);

            logoutUrl.searchParams.set(
              "reason",
              data.reason || "SESSION_REVOKED",
            );

            const res = NextResponse.redirect(logoutUrl);

            res.cookies.delete("next-auth.session-token");
            res.cookies.set("ml-session-revoked", "1", { path: "/" });

            return res;
          }

          // Marcar que verificou nesta execução
          sessionChecked = true;
        } catch (error) {
          // Em dev/edge, falhas de rede não devem quebrar nem poluir o console
          if ((error as Error)?.message !== "skip-local-session-check") {
            console.warn("[proxy] sessão não validada (continuando)");
          }
          // Em caso de erro, continuar normalmente (fail-safe)
        }
      }
    }

    // Validação para SuperAdmin (apenas quando está acessando rotas /admin)
    if (token && isSuperAdmin && req.nextUrl.pathname.startsWith("/admin")) {
      const lastCheck = req.cookies.get("ml-last-superadmin-check");
      const shouldCheck =
        !lastCheck || Date.now() - Number(lastCheck.value) > 15000;

      if (shouldCheck) {
        try {
          const host = req.headers.get("host") || "";
          // Em desenvolvimento local, evitar fetch para evitar falhas intermitentes no Edge
          const isLocalhost =
            host.includes("localhost") || host.startsWith("127.0.0.1");

          if (isLocalhost) {
            sessionChecked = true; // marca e não valida via HTTP em dev
            throw new Error("skip-local-session-check");
          }
          const base = req.nextUrl.origin || getDynamicNextAuthUrl(host);
          const url = new URL(
            "/api/internal/session/validate-superadmin",
            base,
          ).toString();

          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-token": process.env.REALTIME_INTERNAL_TOKEN || "",
            },
            body: JSON.stringify({
              superAdminId: (token as any).id,
            }),
          });

          if (response.status === 404 || response.status === 409) {
            const data = await response.json();
            const logoutUrl = new URL("/login", req.url);

            logoutUrl.searchParams.set(
              "reason",
              data.reason || "SESSION_REVOKED",
            );

            const res = NextResponse.redirect(logoutUrl);

            res.cookies.delete("next-auth.session-token");
            res.cookies.set("ml-session-revoked", "1", { path: "/" });

            return res;
          }

          // Marcar que verificou nesta execução
          sessionChecked = true;
        } catch (error) {
          // Em dev/edge, falhas de rede não devem quebrar nem poluir o console
          if ((error as Error)?.message !== "skip-local-session-check") {
            console.warn(
              "[proxy] sessão SuperAdmin não validada (continuando)",
            );
          }
          // Em caso de erro, continuar normalmente (fail-safe)
        }
      }
    }

    // Continuar com o fluxo normal do middleware...
    // cookie será setado no final se sessionChecked for true

    // Detectar tenant baseado no domínio (mantido para depuração/compatibilidade)
    const host = req.headers.get("host") || "";
    void extractTenantFromDomain(host);

    // Se não está logado e não está na página de login, redireciona para login
    if (!isAuth && !isAuthPage) {
      // Se está tentando acessar rota protegida, redireciona para login
      if (
        req.nextUrl.pathname.startsWith("/dashboard") ||
        req.nextUrl.pathname.startsWith("/processos") ||
        req.nextUrl.pathname.startsWith("/inpi") ||
        req.nextUrl.pathname.startsWith("/documentos") ||
        req.nextUrl.pathname.startsWith("/financeiro") ||
        req.nextUrl.pathname.startsWith("/relatorios") ||
        req.nextUrl.pathname.startsWith("/equipe") ||
        req.nextUrl.pathname.startsWith("/help") ||
        req.nextUrl.pathname.startsWith("/configuracoes") ||
        req.nextUrl.pathname.startsWith("/usuario") ||
        req.nextUrl.pathname.startsWith("/admin")
      ) {
        // Se está tentando acessar área administrativa, redireciona para login normal
        // O redirecionamento para admin será feito após o login baseado no role do usuário
        return NextResponse.redirect(new URL("/login", req.url));
      }
    }

    // Se está logado e está na página de login, redireciona baseado no role do usuário
    // EXCETO se há um reason na query indicando que a sessão foi invalidada
    if (isAuth && isAuthPage) {
      const reason = req.nextUrl.searchParams.get("reason");

      // Se há um reason de invalidação, não redirecionar (deixar mostrar a página de login)
      if (
        reason &&
        (reason === "SUPER_ADMIN_NOT_FOUND" ||
          reason === "SESSION_REVOKED" ||
          reason === "VALIDATION_ERROR")
      ) {
        // Limpar cookie e deixar mostrar página de login
        const response = NextResponse.next();

        response.cookies.delete("next-auth.session-token");

        return response;
      }

      const userRole = (token as any)?.role;
      const isSuperAdmin = userRole === "SUPER_ADMIN";

      if (isSuperAdmin) {
        return NextResponse.redirect(new URL("/admin/dashboard", req.url));
      } else {
        return NextResponse.redirect(new URL("/dashboard", req.url));
      }
    }

    // Se está logado e está na página inicial, redireciona baseado no role do usuário
    if (isAuth && req.nextUrl.pathname === "/") {
      const userRole = (token as any)?.role;
      const isSuperAdmin = userRole === "SUPER_ADMIN";

      if (isSuperAdmin) {
        return NextResponse.redirect(new URL("/admin/dashboard", req.url));
      } else {
        return NextResponse.redirect(new URL("/dashboard", req.url));
      }
    }

    // Verificar se usuário comum está tentando acessar área administrativa
    if (isAuth && req.nextUrl.pathname.startsWith("/admin")) {
      const userRole = (token as any)?.role;
      const isSuperAdmin = userRole === "SUPER_ADMIN";

      if (!isSuperAdmin) {
        return NextResponse.redirect(new URL("/dashboard", req.url));
      }
    }

    // Verificar se SuperAdmin está tentando acessar área comum (PROIBIR)
    if (
      isAuth &&
      !req.nextUrl.pathname.startsWith("/admin") &&
      !req.nextUrl.pathname.startsWith("/api") &&
      !req.nextUrl.pathname.startsWith("/login")
    ) {
      const userRole = (token as any)?.role;
      const isSuperAdmin = userRole === "SUPER_ADMIN";

      // SuperAdmin NÃO pode acessar rotas de usuário comum
      if (isSuperAdmin) {
        // Rotas que SuperAdmin NÃO pode acessar
        const rotasProibidas = [
          "/dashboard",
          "/processos",
          "/documentos",
          "/agenda",
          "/inpi",
          "/financeiro",
          "/juizes",
          "/relatorios",
          "/equipe",
          "/help",
          "/configuracoes",
          "/usuario",
        ];

        const isRotaProibida = rotasProibidas.some((rota) =>
          req.nextUrl.pathname.startsWith(rota),
        );

        if (isRotaProibida) {
          return NextResponse.redirect(new URL("/admin/dashboard", req.url));
        }
      }
    }

    // Verificar permissões de módulos para usuários comuns
    if (
      isAuth &&
      !req.nextUrl.pathname.startsWith("/admin") &&
      !req.nextUrl.pathname.startsWith("/api")
    ) {
      const modules = (token as any)?.tenantModules as string[] | undefined;
      const role = (token as any)?.role;

      if (role !== "SUPER_ADMIN") {
        try {
          const allowed = await isRouteAllowedByModulesEdge(
            req.nextUrl.pathname,
            modules,
            req.nextUrl.origin,
          );

          if (!allowed) {
            return NextResponse.redirect(new URL("/dashboard", req.url));
          }
        } catch (error) {
          console.error("Erro ao verificar permissões de módulos:", error);
          // Em caso de erro, permitir acesso (fail-safe)
        }
      }
    }

    // Retornar resposta com cookie de verificação se necessário
    const response = NextResponse.next();

    if (sessionChecked) {
      // Cookie para usuários com tenant
      if (hasTenantId && !isSuperAdmin) {
        response.cookies.set("ml-last-session-check", Date.now().toString(), {
          httpOnly: false,
          path: "/",
          maxAge: 60, // 1 minuto
        });
      }
      // Cookie para SuperAdmin
      if (isSuperAdmin) {
        response.cookies.set(
          "ml-last-superadmin-check",
          Date.now().toString(),
          {
            httpOnly: false,
            path: "/",
            maxAge: 60, // 1 minuto
          },
        );
      }
    }

    return response;
  },
  {
    callbacks: {
      authorized: () => {
        // Para rotas protegidas, verifica se tem token
        return true; // Deixamos o middleware acima fazer a lógica
      },
    },
  },
);

export const config = {
  matcher: [
    {
      /*
       * Match all request paths except for the ones starting with:
       * - api (API routes)
       * - _next/static (static files)
       * - _next/image (image optimization files)
       * - favicon.ico (favicon file)
       * - .well-known/workflow (rotas internas do Workflow)
       */
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|\\.well-known/workflow/).*)",
    },
  ],
};
