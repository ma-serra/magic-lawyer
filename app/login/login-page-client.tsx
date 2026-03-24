"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getSession, signIn, useSession } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Divider } from "@heroui/divider";
import { Chip } from "@heroui/chip";
import { addToast, closeToast } from "@heroui/toast";
import NextLink from "next/link";

import Image from "next/image";
import useSWR from "swr";
import { Logo } from "@/components/icons";
import { ThemeSwitch } from "@/components/theme-switch";
import { useTenantFromDomain } from "@/hooks/use-tenant-from-domain";
import { DevInfo } from "@/components/dev-info";
import { LogIn } from "lucide-react";
import { fetchTenantBrandingFromDomain } from "@/lib/fetchers/tenant-branding";
import { getDevQuickLogins } from "@/app/actions/tenant-domains";
import {
  checkPrimeiroAcessoPorEmail,
  enviarLinkPrimeiroAcesso,
} from "@/app/actions/primeiro-acesso";

const loginHighlights = [
  {
    title: "Timeline processual organizada",
    description:
      "Andamentos, documentos, tarefas e alertas no mesmo fluxo operacional.",
  },
  {
    title: "Portal white-label para clientes",
    description:
      "Cada escritório entrega experiência própria sem depender de soluções paralelas.",
  },
  {
    title: "Governança e auditoria",
    description:
      "Registro de ações, permissões e trilhas críticas para crescer com segurança.",
  },
];

type LoginPageClientProps = {
  marketingMetrics: Array<{
    label: string;
    value: string;
  }>;
};

function LoginPageInner({ marketingMetrics }: LoginPageClientProps) {
  const params = useSearchParams();
  const router = useRouter();
  const { status, data: session } = useSession();
  const tenantFromDomain = useTenantFromDomain();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Buscar branding do tenant pelo domínio
  const { data: tenantBranding } = useSWR(
    "tenant-branding-from-domain",
    fetchTenantBrandingFromDomain,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
    },
  );

  const tenantLogoUrl = tenantBranding?.success
    ? tenantBranding.data?.logoUrl
    : null;
  const tenantName = tenantBranding?.success ? tenantBranding.data?.name : null;
  const tenantLoginBackgroundUrl = tenantBranding?.success
    ? tenantBranding.data?.loginBackgroundUrl
    : null;
  const [devQuickLogins, setDevQuickLogins] = useState<
    Array<{
      group: string;
      description?: string;
      options: Array<{
        name: string;
        roleLabel: string;
        email: string;
        password: string;
        tenant?: string;
        chipColor?:
          | "primary"
          | "secondary"
          | "success"
          | "warning"
          | "danger"
          | "default";
      }>;
    }>
  >([]);
  const [devPanelOpen, setDevPanelOpen] = useState(false);
  const [isLargeScreen, setIsLargeScreen] = useState(false);
  const callbackUrl = params.get("callbackUrl");
  const reason = params.get("reason"); // Motivo do redirecionamento
  const firstAccessReady = params.get("firstAccessReady");
  const firstAccessEmail = params.get("firstAccessEmail");
  const isDevMode = process.env.NODE_ENV === "development";
  const emailRegex = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/, []);
  const [isCheckingFirstAccess, setIsCheckingFirstAccess] = useState(false);
  const [isFirstAccessEmail, setIsFirstAccessEmail] = useState(false);
  const [maskedFirstAccessEmail, setMaskedFirstAccessEmail] = useState<
    string | null
  >(null);
  const [checkedEmail, setCheckedEmail] = useState("");
  const loginInFlightRef = useRef(false);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  const resolveRedirectTarget = useCallback(
    (role?: string | null) => {
      const defaultTarget =
        role === "SUPER_ADMIN" ? "/admin/dashboard" : "/dashboard";

      if (!callbackUrl) {
        return defaultTarget;
      }

      const parsedTarget = (() => {
        // Permitir somente rotas internas
        if (callbackUrl.startsWith("/")) {
          return callbackUrl;
        }

        try {
          if (typeof window === "undefined") {
            return null;
          }

          const url = new URL(callbackUrl, window.location.origin);

          if (url.origin !== window.location.origin) {
            return null;
          }

          return `${url.pathname}${url.search}${url.hash}` || null;
        } catch (error) {
          return null;
        }
      })();

      if (!parsedTarget) {
        return defaultTarget;
      }

      // Bloquear acesso indevido às áreas erradas conforme o perfil
      if (role === "SUPER_ADMIN" && !parsedTarget.startsWith("/admin")) {
        return "/admin/dashboard";
      }

      if (role !== "SUPER_ADMIN" && parsedTarget.startsWith("/admin")) {
        return defaultTarget;
      }

      return parsedTarget;
    },
    [callbackUrl],
  );

  const attemptLogin = useCallback(
    async ({
      email: rawEmail,
      password: rawPassword,
    }: {
      email: string;
      password: string;
    }) => {
      const sanitizedEmail = rawEmail.trim();
      const sanitizedPassword = rawPassword.trim();

      if (!sanitizedEmail || !sanitizedPassword) {
        addToast({
          title: "Campos obrigatórios",
          description: "Preencha e-mail e senha para continuar.",
          color: "warning",
          timeout: 4000,
        });

        return false;
      }

      if (!emailRegex.test(sanitizedEmail)) {
        addToast({
          title: "E-mail inválido",
          description: "Por favor, insira um e-mail válido.",
          color: "warning",
          timeout: 4000,
        });

        return false;
      }

      if (loginInFlightRef.current) {
        return false;
      }

      loginInFlightRef.current = true;
      setLoading(true);

      const loginPromise = (async () => {
        const response = await signIn("credentials", {
          email: sanitizedEmail,
          password: sanitizedPassword,
          tenant: tenantFromDomain || undefined,
          redirect: false,
        });

        if (!response) {
          throw new Error(
            "Não foi possível contatar o servidor de autenticação.",
          );
        }

        if (!response.ok) {
          if (response.error === "TENANT_SUSPENDED") {
            throw new Error("TENANT_SUSPENDED");
          }
          if (response.error === "TENANT_CANCELLED") {
            throw new Error("TENANT_CANCELLED");
          }

          if (response.error === "CredentialsSignin") {
            throw new Error(
              "Email ou senha incorretos. Verifique suas credenciais e tente novamente.",
            );
          }

          if (response.error?.startsWith("REDIRECT_TO_HOST:")) {
            const redirectHost = response.error.replace("REDIRECT_TO_HOST:", "");
            const redirectUrl = `https://${redirectHost}/login`;

            addToast({
              title: "Redirecionamento automático",
              description:
                "Você será redirecionado para o domínio correto do seu escritório.",
              color: "primary",
              timeout: 3000,
            });

            setTimeout(() => {
              window.location.href = redirectUrl;
            }, 2000);

            return;
          }

          if (response.error?.startsWith("REDIRECT_TO_TENANT:")) {
            const tenantSlug = response.error.replace("REDIRECT_TO_TENANT:", "");
            const redirectUrl = `https://${tenantSlug}.magiclawyer.vercel.app/login`;

            addToast({
              title: "Redirecionamento automático",
              description:
                "Você será redirecionado para o domínio correto do seu escritório.",
              color: "primary",
              timeout: 3000,
            });

            setTimeout(() => {
              window.location.href = redirectUrl;
            }, 2000);

            return;
          }

          throw new Error(
            response.error ??
              "Credenciais inválidas. Verifique seus dados e tente novamente.",
          );
        }

        return response;
      })();

      const loaderKey = addToast({
        title: "Conectando ao escritório",
        description: "Validando suas credenciais com segurança...",
        color: "primary",
        promise: loginPromise,
        timeout: 0,
        hideCloseButton: true,
        shouldShowTimeoutProgress: false,
      });

      try {
        await loginPromise;

        if (loaderKey) {
          closeToast(loaderKey);
        }

        addToast({
          title: "Bem-vindo(a)!",
          description: "Login efetuado com sucesso.",
          color: "success",
          timeout: 3500,
        });

        const freshSession = await getSession();
        const role = (freshSession?.user as any)?.role as string | undefined;
        const target = resolveRedirectTarget(role);

        router.replace(target);

        return true;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Ocorreu um erro inesperado durante o login.";

        if (loaderKey) {
          closeToast(loaderKey);
        }

        let title = "Erro ao entrar";
        let description = message;
        let color: "danger" | "warning" = "danger";

        if (message === "TENANT_SUSPENDED") {
          title = "🔒 Escritório Suspenso";
          description =
            "Sua conta foi temporariamente suspensa. Entre em contato com o suporte para mais informações.";
          color = "warning";
        } else if (message === "TENANT_CANCELLED") {
          title = "❌ Escritório Cancelado";
          description =
            "Sua conta foi cancelada. Entre em contato com o suporte para reativar.";
          color = "danger";
        } else if (
          message.includes("Email ou senha incorretos") ||
          message.includes("credenciais inválidas")
        ) {
          title = "❌ Email ou senha incorretos";
          description =
            "Verifique se digitou corretamente seu email e senha. Lembre-se: a senha é sensível a maiúsculas e minúsculas.";
          color = "warning";
        } else if (message.includes("Não foi possível contatar")) {
          title = "Erro de conexão";
          description =
            "Verifique sua conexão com a internet e tente novamente.";
        }

        addToast({
          title,
          description,
          color,
          timeout: 6000,
        });

        return false;
      } finally {
        loginInFlightRef.current = false;
        setLoading(false);
      }
    },
    [emailRegex, resolveRedirectTarget, router, tenantFromDomain],
  );

  // Exibir mensagem de motivo do redirecionamento
  useEffect(() => {
    if (reason && status !== "authenticated") {
      let title = "";
      let description = "";
      let color: "danger" | "warning" = "danger";

      switch (reason) {
        case "SUSPENDED":
        case "TENANT_SUSPENDED":
          title = "🔒 Escritório Suspenso";
          description =
            "Sua conta foi temporariamente suspensa. Entre em contato com o suporte para mais informações.";
          color = "warning";
          break;
        case "CANCELLED":
        case "TENANT_CANCELLED":
          title = "❌ Escritório Cancelado";
          description =
            "Sua conta foi cancelada. Entre em contato com o suporte para reativar.";
          color = "danger";
          break;
        case "TENANT_NOT_FOUND":
          title = "❌ Escritório Não Encontrado";
          description =
            "O escritório informado não existe ou foi removido do sistema.";
          color = "danger";
          break;
        case "SESSION_VERSION_MISMATCH":
          title = "🔄 Sessão Expirada";
          description =
            "Suas credenciais foram alteradas. Por favor, faça login novamente.";
          color = "warning";
          break;
        case "SESSION_REVOKED":
          title = "🔒 Sessão Revogada";
          description =
            "Sua sessão foi encerrada por segurança. Por favor, faça login novamente.";
          color = "warning";
          break;
        case "USER_DISABLED":
          title = "🚫 Usuário Desativado";
          description =
            "Sua conta foi desativada. Entre em contato com o administrador do escritório.";
          color = "warning";
          break;
        case "USER_ID_MISMATCH":
          title = "⚠️ Erro de Autenticação";
          description =
            "Houve um problema com sua sessão. Por favor, faça login novamente.";
          color = "warning";
          break;
        case "USER_NOT_FOUND":
          title = "❌ Usuário Não Encontrado";
          description = "Usuário não encontrado no sistema.";
          color = "danger";
          break;
        case "NOT_AUTHENTICATED":
          title = "❌ Não Autenticado";
          description = "Você precisa fazer login para acessar esta página.";
          color = "warning";
          break;
        case "INVALID_PAYLOAD":
          title = "⚠️ Erro de Comunicação";
          description =
            "Houve um problema ao validar sua sessão. Tente novamente.";
          color = "warning";
          break;
        case "INTERNAL_ERROR":
          title = "⚠️ Erro Interno";
          description =
            "Ocorreu um erro no servidor. Tente novamente mais tarde.";
          color = "danger";
          break;
        default:
          title = "⚠️ Acesso Negado";
          description = `Motivo: ${reason}. Entre em contato com o suporte.`;
          color = "danger";
      }

      addToast({
        title,
        description,
        color,
        timeout: 8000,
      });
    }
  }, [reason, status]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    const role = (session?.user as any)?.role as string | undefined;
    const target = resolveRedirectTarget(role);

    router.replace(target);
  }, [status, session, router, resolveRedirectTarget]);

  useEffect(() => {
    if (!isDevMode) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const handleResize = () => {
      setIsLargeScreen(window.innerWidth >= 1024);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [isDevMode]);

  useEffect(() => {
    // Garantir que o painel dev comece sempre fechado
    setDevPanelOpen(false);
  }, []);

  useEffect(() => {
    if (!isDevMode) {
      setDevQuickLogins([]);

      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const host = window.location.host;

    // Para localhost:9192 (Super Admin), manter hardcoded
    if (host === "localhost:9192") {
      setDevQuickLogins([
        {
          group: "Super Admins",
          description: "Acesso administrativo global",
          options: [
            {
              name: "Robson (Super Admin)",
              roleLabel: "SUPER_ADMIN",
              email: "robsonnonatoiii@gmail.com",
              password: "Robson123!",
              chipColor: "warning",
            },
            {
              name: "Talisia (Super Admin)",
              roleLabel: "SUPER_ADMIN",
              email: "talisiavmatos@gmail.com",
              password: "Talisia123!",
              chipColor: "warning",
            },
          ],
        },
      ]);

      return;
    }

    // Para outros tenants, buscar do banco de dados
    getDevQuickLogins(host)
      .then((result) => {
        if (
          result.success &&
          result.tenant &&
          result.usuarios &&
          result.usuarios.length > 0
        ) {
          setDevQuickLogins([
            {
              group: result.tenant.name,
              description: "Apenas para desenvolvimento local",
              options: result.usuarios.map((usuario) => ({
                name: usuario.name,
                roleLabel: usuario.roleLabel,
                email: usuario.email,
                password: usuario.password,
                tenant: usuario.tenant,
                chipColor: usuario.chipColor,
              })),
            },
          ]);
        } else {
          setDevQuickLogins([]);
        }
      })
      .catch((error) => {
        setDevQuickLogins([]);
      });
  }, [isDevMode]);

  const handleSubmit = useCallback(async () => {
    if (loading) {
      return;
    }

    const currentEmail = emailInputRef.current?.value ?? email;
    const currentPassword = passwordInputRef.current?.value ?? password;

    const sanitizedEmail = currentEmail.trim();
    const sanitizedPassword = currentPassword.trim();

    if (isFirstAccessEmail && !sanitizedPassword) {
      if (!emailRegex.test(sanitizedEmail)) {
        addToast({
          title: "E-mail inválido",
          description: "Informe um e-mail válido para receber o link.",
          color: "warning",
        });
        return;
      }

      setLoading(true);
      const response = await enviarLinkPrimeiroAcesso({
        email: sanitizedEmail,
        tenantHint: tenantFromDomain?.trim() || undefined,
      });
      setLoading(false);

      if (!response.success) {
        addToast({
          title: "Não foi possível enviar o link",
          description:
            response.error ||
            "Tente novamente em alguns instantes ou contate o administrador.",
          color: "danger",
          timeout: 6000,
        });
        return;
      }

      addToast({
        title: "Link enviado",
        description: `Enviamos o link de primeiro acesso para ${response.maskedEmail}.`,
        color: "success",
        timeout: 6000,
      });
      return;
    }

    await attemptLogin({
      email: sanitizedEmail,
      password: sanitizedPassword,
    });
  }, [
    attemptLogin,
    email,
    emailRegex,
    isFirstAccessEmail,
    loading,
    password,
    tenantFromDomain,
  ]);

  const handleDevQuickLogin = useCallback(
    async (option: { email: string; password: string; tenant?: string }) => {
      if (loading) {
        return;
      }

      setEmail(option.email);
      setPassword(option.password);

      await attemptLogin({
        email: option.email,
        password: option.password,
      });
    },
    [attemptLogin, loading],
  );

  const handleSubmitOnEnter = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter") {
        return;
      }
      e.preventDefault();
      void handleSubmit();
    },
    [handleSubmit],
  );

  const handleEmailBlur = useCallback(async () => {
    const sanitizedEmail = email.trim().toLowerCase();
    const sanitizedPassword = password.trim();

    // Se o usuário já informou senha, priorizamos o fluxo de login normal
    // e evitamos uma chamada extra de server action no blur.
    if (sanitizedPassword) {
      return;
    }

    if (!sanitizedEmail || !emailRegex.test(sanitizedEmail)) {
      setIsFirstAccessEmail(false);
      setMaskedFirstAccessEmail(null);
      setCheckedEmail("");
      return;
    }

    if (sanitizedEmail === checkedEmail) {
      return;
    }

    setIsCheckingFirstAccess(true);

    try {
      const response = await checkPrimeiroAcessoPorEmail({
        email: sanitizedEmail,
        tenantHint: tenantFromDomain?.trim() || undefined,
      });

      if (response.success && response.firstAccess) {
        setIsFirstAccessEmail(true);
        setMaskedFirstAccessEmail(response.maskedEmail || null);
      } else {
        setIsFirstAccessEmail(false);
        setMaskedFirstAccessEmail(null);
      }
      setCheckedEmail(sanitizedEmail);
    } catch {
      setIsFirstAccessEmail(false);
      setMaskedFirstAccessEmail(null);
      setCheckedEmail("");
    } finally {
      setIsCheckingFirstAccess(false);
    }
  }, [checkedEmail, email, emailRegex, password, tenantFromDomain]);

  useEffect(() => {
    const sanitizedEmail = email.trim().toLowerCase();

    if (checkedEmail && sanitizedEmail !== checkedEmail) {
      setIsFirstAccessEmail(false);
      setMaskedFirstAccessEmail(null);
      setCheckedEmail("");
    }
  }, [checkedEmail, email]);

  useEffect(() => {
    if (firstAccessEmail && !email) {
      setEmail(firstAccessEmail);
    }
  }, [email, firstAccessEmail]);

  useEffect(() => {
    if (firstAccessReady === "1") {
      addToast({
        title: "Primeiro acesso concluído",
        description:
          "Senha definida com sucesso. Agora faça login normalmente.",
        color: "success",
        timeout: 6000,
      });
    }
  }, [firstAccessReady]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-amber-50 via-white to-sky-100 px-4 py-20 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      {tenantLoginBackgroundUrl ? (
        <>
          <div
            className="absolute inset-0 -z-30 bg-cover bg-center"
            style={{ backgroundImage: `url(${tenantLoginBackgroundUrl})` }}
          />
          <div className="absolute inset-0 -z-20 bg-white/88 dark:bg-slate-950/76" />
        </>
      ) : null}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.16),transparent_42%)] dark:bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.18),transparent_42%)]" />
      <div className="absolute left-[-5rem] top-20 -z-10 h-72 w-72 rounded-full bg-amber-300/30 blur-3xl dark:bg-primary/16" />
      <div className="absolute bottom-0 right-[-4rem] -z-10 h-80 w-80 rounded-full bg-sky-300/30 blur-3xl dark:bg-cyan-500/12" />

      <div className="fixed left-6 top-6 z-10 flex items-center gap-2">
        <Button
          as={NextLink}
          color="default"
          href="/"
          radius="full"
          size="sm"
          startContent={
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M15 19l-7-7 7-7"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
              />
            </svg>
          }
          variant="bordered"
        >
          Voltar
        </Button>

        <div className="rounded-full border border-slate-200/80 bg-white/85 p-1 shadow-lg backdrop-blur dark:border-white/10 dark:bg-slate-950/70">
          <ThemeSwitch />
        </div>
      </div>

      {isDevMode ? (
        <DevInfo
          buttonClassName="shadow-lg"
          buttonContainerClassName="fixed top-6 right-6 z-10"
        />
      ) : null}

      {isDevMode && devQuickLogins.length > 0 && (
        <>
          {!isLargeScreen && devPanelOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity"
              onClick={() => setDevPanelOpen(false)}
            />
          )}

          <div className="fixed bottom-20 right-6 z-40 flex items-center gap-2">
            <Button
              key="dev-quick-logins-button"
              className="shadow-lg"
              color="primary"
              size="sm"
              startContent={<LogIn className="h-4 w-4" />}
              variant="flat"
              onPress={() => setDevPanelOpen((prev) => !prev)}
            >
              {devPanelOpen ? "Esconder logins" : "Logins rápidos"}
            </Button>
          </div>

          <aside
            className={`fixed z-50 transition-all duration-300 ${
              isLargeScreen
                ? "top-24 right-6 w-[320px]"
                : "top-24 left-1/2 w-[min(420px,calc(100vw-2.5rem))] -translate-x-1/2"
            } ${devPanelOpen ? "opacity-100 pointer-events-auto translate-y-0" : isLargeScreen ? "opacity-0 pointer-events-none translate-x-6" : "opacity-0 pointer-events-none -translate-y-4"}`}
          >
            <Card className="border border-primary/20 shadow-2xl backdrop-blur bg-white/95 dark:bg-content1/90 h-full max-h-[75vh] flex flex-col">
              <CardHeader className="flex items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-default-700 dark:text-default-200">
                    Painel Dev
                  </p>
                  <p className="text-xs text-default-400">
                    Logins rápidos para testes locais
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Chip color="primary" size="sm" variant="flat">
                    Dev only
                  </Chip>
                  <Button
                    isIconOnly
                    aria-label="Fechar painel de logins"
                    size="sm"
                    variant="light"
                    onPress={() => setDevPanelOpen(false)}
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M18 6L6 18M6 6l12 12"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </Button>
                </div>
              </CardHeader>
              <Divider />
              <CardBody className="space-y-5 overflow-y-auto pr-1">
                {devQuickLogins.map((group, groupIndex) => (
                  <div key={group.group} className="space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-default-600 dark:text-default-300">
                        {group.group}
                      </p>
                      {group.description ? (
                        <p className="text-xs text-default-400">
                          {group.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      {group.options.map((option) => (
                        <div
                          key={option.email}
                          className="flex items-center justify-between gap-2 rounded-lg border border-default-200 bg-default-50 px-3 py-2 dark:border-default-100/20 dark:bg-default-50/10"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-default-600 dark:text-default-100 truncate">
                              {option.name}
                            </p>
                            <Chip
                              className="mt-1"
                              color={option.chipColor ?? "default"}
                              size="sm"
                              variant="flat"
                            >
                              {option.roleLabel}
                            </Chip>
                          </div>
                          <Button
                            color="primary"
                            isDisabled={loading}
                            size="sm"
                            variant="flat"
                            onPress={() => handleDevQuickLogin(option)}
                          >
                            Logar
                          </Button>
                        </div>
                      ))}
                    </div>
                    {groupIndex !== devQuickLogins.length - 1 && <Divider />}
                  </div>
                ))}
                <p className="text-[10px] text-default-400">
                  Disponível apenas em ambientes de desenvolvimento. Usa as
                  credenciais padrão do seed.
                </p>
              </CardBody>
            </Card>
          </aside>
        </>
      )}

      <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
        <section className="order-2 space-y-8 lg:order-1">
          <div className="space-y-5">
            <Chip
              className="border border-amber-200/80 bg-amber-100/80 px-4 text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-900 dark:border-primary/20 dark:bg-primary/10 dark:text-primary-200"
              radius="full"
              variant="flat"
            >
              Entrada segura do escritório
            </Chip>
            <div className="space-y-4">
              <h1 className="max-w-2xl text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl dark:text-white">
                Entre na central operacional que sustenta a rotina do
                escritório.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">
                Da captura de processos ao portal do cliente, tudo foi desenhado
                para reduzir ruído operacional e manter a equipe alinhada.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {marketingMetrics.map((item) => (
              <Card
                key={item.label}
                className="border border-slate-200/80 bg-white/78 shadow-[0_24px_50px_-38px_rgba(15,23,42,0.35)] backdrop-blur dark:border-white/10 dark:bg-white/5"
              >
                <CardBody className="gap-2 p-5">
                  <p className="text-3xl font-semibold text-slate-950 dark:text-white">
                    {item.value}
                  </p>
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                    {item.label}
                  </p>
                </CardBody>
              </Card>
            ))}
          </div>

          <div className="grid gap-4">
            {loginHighlights.map((item) => (
              <div
                key={item.title}
                className="rounded-3xl border border-slate-200/80 bg-white/72 px-5 py-5 shadow-[0_24px_50px_-38px_rgba(15,23,42,0.35)] backdrop-blur dark:border-white/10 dark:bg-white/6"
              >
                <p className="text-lg font-semibold text-slate-950 dark:text-white">
                  {item.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <div className="order-1 lg:order-2">
          <div className="mb-6 text-center lg:text-left">
            <div className="mb-4 flex justify-center lg:justify-start">
              {tenantLogoUrl ? (
                <div className="rounded-2xl border border-slate-200/80 bg-white/85 p-3 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.32)] dark:border-white/10 dark:bg-white/5">
                  <Image
                    unoptimized
                    alt={tenantName || "Logo do escritório"}
                    className="h-12 w-auto object-contain"
                    height={48}
                    src={tenantLogoUrl}
                    width={120}
                  />
                </div>
              ) : (
                <div className="rounded-2xl bg-slate-950 p-3 text-white dark:bg-primary dark:text-primary-foreground">
                  <Logo className="h-8 w-8" />
                </div>
              )}
            </div>
            <h2 className="text-2xl font-bold text-slate-950 dark:text-white">
              Bem-vindo de volta
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {tenantName
                ? `Entre na sua conta para acessar ${tenantName}.`
                : "Entre na sua conta para acessar o escritório."}
            </p>
          </div>

          <Card className="border border-slate-200/80 bg-white/88 shadow-[0_35px_90px_-48px_rgba(15,23,42,0.48)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/76">
            <CardHeader className="flex flex-col gap-3 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🔐</span>
                <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
                  Acesso seguro
                </h2>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Suas credenciais e ações sensíveis trafegam com proteção e
                rastreabilidade.
              </p>
              <div className="mt-2 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-start gap-3">
                  <span className="text-sm text-primary">💡</span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary-700 dark:text-primary-300">
                      Dica operacional
                    </p>
                    <p className="mt-1 text-xs leading-6 text-primary-800 dark:text-primary-200">
                      O acesso ao escritório é identificado automaticamente pelo
                      domínio deste link.
                    </p>
                  </div>
                </div>
              </div>
            </CardHeader>
            <Divider className="border-slate-200 dark:border-white/10" />
            <CardBody className="pt-6">
              <div className="space-y-4">
                <Input
                  isRequired
                  className="mb-4"
                  label="E-mail"
                  ref={emailInputRef}
                  startContent={
                    <span className="text-default-400 text-sm">📧</span>
                  }
                  type="email"
                  value={email}
                  onBlur={() => {
                    void handleEmailBlur();
                  }}
                  onChange={(e) => {
                    setEmail(e.target.value);
                  }}
                  onKeyDown={handleSubmitOnEnter}
                />
                {isFirstAccessEmail ? (
                  <div className="mb-4 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-xs leading-6 text-primary-800 dark:text-primary-200">
                    Primeiro acesso detectado para{" "}
                    <strong>{maskedFirstAccessEmail || "este e-mail"}</strong>.
                    Clique em <strong>Enviar link de primeiro acesso</strong>{" "}
                    para definir a senha.
                  </div>
                ) : (
                  <Input
                    isRequired
                    className="mb-4"
                    label="Senha"
                    ref={passwordInputRef}
                    startContent={
                      <span className="text-default-400 text-sm">🔒</span>
                    }
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleSubmitOnEnter}
                  />
                )}
                <Button
                  fullWidth
                  color="primary"
                  isDisabled={loading}
                  isLoading={loading}
                  size="lg"
                  startContent={loading ? null : <span>🚀</span>}
                  type="button"
                  onClick={() => {
                    void handleSubmit();
                  }}
                >
                  {loading
                    ? "Processando..."
                    : isFirstAccessEmail
                      ? "Enviar link de primeiro acesso"
                      : "Entrar no sistema"}
                </Button>
              </div>
            </CardBody>
          </Card>

          <div className="mt-6 text-center">
            <p className="mb-4 text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
              Ainda está avaliando a plataforma?
            </p>
            <div className="flex flex-col gap-2">
              <Button
                as={NextLink}
                className="border-slate-300 bg-white/70 text-slate-900 hover:bg-white dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                href="/precos"
                radius="full"
                size="sm"
                startContent={<span>💎</span>}
                variant="bordered"
              >
                Ver planos disponíveis
              </Button>
              <Button
                as={NextLink}
                className="text-slate-600 dark:text-slate-300"
                href="/about"
                radius="full"
                size="sm"
                startContent={<span>ℹ️</span>}
                variant="light"
              >
                Saiba mais sobre a plataforma
              </Button>
            </div>
          </div>

          <div className="mt-6 text-center">
            <Chip
              color="success"
              size="sm"
              startContent={<span>🛡️</span>}
              variant="flat"
            >
              Login 100% seguro
            </Chip>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPageClient({
  marketingMetrics,
}: LoginPageClientProps) {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <LoginPageInner marketingMetrics={marketingMetrics} />
    </Suspense>
  );
}
