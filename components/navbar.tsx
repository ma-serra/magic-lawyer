"use client";

import type { ReactNode, SVGProps } from "react";

import { useMemo, useEffect } from "react";
import { Navbar as HeroUINavbar, NavbarBrand, NavbarContent } from "@heroui/navbar";
import { Button } from "@heroui/button";
import { link as linkStyles } from "@heroui/theme";
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from "@heroui/dropdown";
import { Avatar } from "@heroui/avatar";
import { Badge } from "@heroui/badge";
import clsx from "clsx";
import NextLink from "next/link";
import { signOut, useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";

import Image from "next/image";
import { useAvatar } from "@/app/hooks/use-avatar";
import { siteConfig } from "@/config/site";
import packageInfo from "@/package.json";
import { SignInOut } from "@/components/signinout";
import { ThemeSwitch } from "@/components/theme-switch";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { CentralizedSearchBar } from "@/components/centralized-search-bar";
import { Logo } from "@/components/icons";
import { NavbarSupportChat } from "@/components/support/navbar-support-chat";
import { TENANT_PERMISSIONS } from "@/types";
import { UserRole, TenantPermission } from "@/generated/prisma";

const breadcrumbLabelMap: Record<string, string> = {
  dashboard: "Painel",
  processos: "Processos",
  documentos: "Documentos",
  financeiro: "Financeiro",
  "dados-bancarios": "Dados bancários",
  relatorios: "Relatórios",
  usuario: "Usuário",
  perfil: "Perfil",
  editar: "Editar",
  configuracoes: "Configurações",
  billing: "Billing",
  equipe: "Equipe",
  help: "Suporte",
};

type NavbarProps = {
  onOpenSidebar?: () => void;
  rightExtras?: ReactNode;
  showAuthenticatedSecondaryNav?: boolean;
};

const MenuIcon = ({ className, ...props }: SVGProps<SVGSVGElement>) => (
  <svg aria-hidden className={clsx("h-5 w-5", className)} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24" {...props}>
    <line x1="3" x2="21" y1="6" y2="6" />
    <line x1="3" x2="21" y1="12" y2="12" />
    <line x1="3" x2="21" y1="18" y2="18" />
  </svg>
);

const toTitleCase = (value: string) =>
  value
    .split(" ")
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");

export const Navbar = ({ onOpenSidebar, rightExtras, showAuthenticatedSecondaryNav = true }: NavbarProps) => {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { avatarUrl, mutate: mutateAvatar } = useAvatar();

  const tenantLogoUrl = session?.user?.tenantLogoUrl || undefined;
  const tenantName = session?.user?.tenantName || "Magic Lawyer";
  const hasTenantBranding = Boolean(session?.user?.tenantName || tenantLogoUrl);
  const brandSubtitle = hasTenantBranding ? "Portal do escritório" : "SaaS jurídico white label";
  const brandTitleClasses = clsx("text-xs sm:text-sm font-semibold text-primary", hasTenantBranding ? "tracking-tight" : "uppercase tracking-[0.3em]");
  const userDisplayName = session?.user?.name || session?.user?.email || "Usuário";
  const userEmail = session?.user?.email || "Conta Magic Lawyer";
  const userAvatar = avatarUrl || (session?.user as any)?.avatarUrl || undefined;
  const userRole = (session?.user as any)?.role as UserRole | undefined;
  const userPermissions = ((session?.user as any)?.permissions as TenantPermission[] | undefined) ?? [];
  const isSuperAdmin = userRole === UserRole.SUPER_ADMIN;
  const hasPermission = (permission?: string) => !permission || isSuperAdmin || userPermissions.includes(permission as TenantPermission);

  // Escutar evento customizado de atualização do avatar
  useEffect(() => {
    const handleAvatarUpdate = () => {
      // Revalidar dados do SWR quando o avatar for atualizado
      mutateAvatar();
    };

    window.addEventListener("avatarUpdated", handleAvatarUpdate as EventListener);

    return () => {
      window.removeEventListener("avatarUpdated", handleAvatarUpdate as EventListener);
    };
  }, [mutateAvatar]);

  const appVersion = packageInfo.version ?? "0.0.0";

  const canManageTenantSettings = hasPermission(TENANT_PERMISSIONS.manageOfficeSettings);

  const renderNavLink = (label: string, href: string) => {
    const isActive = pathname === href;

    return (
      <NextLink
        key={label}
        className={clsx(
          linkStyles({ color: "foreground" }),
          "relative px-4 py-2 text-sm font-medium transition-colors",
          isActive ? "bg-primary/15 text-primary" : "text-default-500 hover:text-primary",
        )}
        href={href}
      >
        {label}
      </NextLink>
    );
  };

  const handleUserAction = (key: string) => {
    if (key === "profile") {
      // SuperAdmin não tem perfil de usuário comum
      if (isSuperAdmin) {
        router.push("/admin/configuracoes");
      } else {
        router.push("/usuario/perfil/editar");
      }

      return;
    }

    if (key === "tenant-settings") {
      // SuperAdmin vai para configurações do sistema
      if (isSuperAdmin) {
        router.push("/admin/configuracoes");
      } else {
        router.push("/configuracoes");
      }

      return;
    }

    if (key === "logout") {
      void signOut({ callbackUrl: "/login" });
    }
  };

  const breadcrumbItems = useMemo(() => {
    const segments = pathname.split("/").filter(Boolean);
    const items = segments.map((segment, index) => {
      const href = `/${segments.slice(0, index + 1).join("/")}`;
      const normalized = segment.replace(/-/g, " ");
      const label = breadcrumbLabelMap[segment] ? breadcrumbLabelMap[segment] : toTitleCase(normalized);

      return {
        href,
        label,
      };
    });

    if (items.length === 0 || items[0].href !== "/dashboard") {
      items.unshift({ href: "/dashboard", label: "Painel" });
    }

    return items;
  }, [pathname]);

  const authenticatedNav = useMemo(() => {
    if (!showAuthenticatedSecondaryNav) return null;

    return (
      <div className="mx-auto w-full max-w-full xl:max-w-6xl border-b border-divider bg-background/60 px-2 sm:px-4 md:px-6 py-1.5 sm:py-2 backdrop-blur-xl overflow-x-auto">
        <div className="flex flex-nowrap items-center gap-2">
          {siteConfig.navItemsAuthenticated.map((item) => {
            const isActive = pathname.startsWith(item.href);

            return (
              <NextLink
                key={item.href}
                className={clsx("px-4 py-2 text-sm font-medium transition rounded-md", isActive ? "bg-primary/25 text-primary" : "text-default-500 hover:text-primary hover:bg-default-100")}
                href={item.href}
              >
                {item.label}
              </NextLink>
            );
          })}
        </div>
      </div>
    );
  }, [pathname, showAuthenticatedSecondaryNav]);

  return (
    <div className="sticky top-0 z-50 flex flex-col">
      <HeroUINavbar className="border-b border-divider bg-background/95 backdrop-blur-xl py-1.5 md:py-2" isBordered={false} maxWidth="full">
        {/* Seção Esquerda - Brand e Menu Mobile */}
        <NavbarContent className="shrink-0 min-w-0" justify="start">
          {onOpenSidebar ? (
            <Button
              isIconOnly
              className="inline-flex h-8 w-8 items-center justify-center border border-divider bg-content1 text-default-500 transition hover:border-primary/40 hover:text-primary md:hidden"
              radius="none"
              variant="light"
              onPress={onOpenSidebar}
            >
              <MenuIcon />
            </Button>
          ) : null}
          <NavbarBrand className="min-w-0">
            <NextLink className="flex items-center gap-2 sm:gap-3" href="/">
              {tenantLogoUrl ? (
                <span className="flex h-10 w-16 sm:h-14 sm:w-28 shrink-0 items-center justify-center rounded-xl bg-content1/80 p-1.5 shadow-[0_6px_14px_rgba(2,6,23,0.18)] dark:bg-content1/35 dark:shadow-[0_10px_20px_rgba(0,0,0,0.45)]">
                  <Image unoptimized alt={`Logo ${tenantName}`} className="h-auto max-h-full w-auto max-w-full object-contain" height={56} src={tenantLogoUrl} width={112} />
                </span>
              ) : (
                <span className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 p-2 text-primary">
                  <Logo className="h-5 w-5 sm:h-6 sm:w-6" />
                </span>
              )}
              <span className="hidden min-w-0 flex-col leading-tight sm:flex">
                <span className={clsx(brandTitleClasses, "truncate max-w-[170px] lg:max-w-none")}>{tenantName}</span>
                <span className="block text-xs text-default-400 truncate max-w-[220px] lg:max-w-none">{brandSubtitle}</span>
                <span className="hidden md:block text-[10px] uppercase tracking-wide text-default-600">versão {appVersion}</span>
              </span>
            </NextLink>
          </NavbarBrand>
        </NavbarContent>

        {/* Seção Central - Search Bar */}
        {session?.user && (
          <>
            {/* Botão de lupa até xl (modo 50% usa botão) */}
            <NavbarContent className="hidden sm:flex flex-1 min-w-0 px-1 sm:px-2 xl:hidden" justify="center">
              <Button
                isIconOnly
                aria-label="Buscar"
                className="h-8 w-8 min-w-8 border border-divider bg-content1 text-default-600 hover:text-primary"
                radius="full"
                size="sm"
                variant="light"
                onPress={() => window.dispatchEvent(new CustomEvent("open-search"))}
              >
                {/* lucide search svg inline to avoid extra import churn */}
                <svg aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" x2="16.65" y1="21" y2="16.65" />
                </svg>
              </Button>
            </NavbarContent>

            {/* Barra de busca apenas em ≥xl (telas largas/PC) */}
            <NavbarContent className="hidden xl:flex flex-1 min-w-0 px-1 xl:px-2 2xl:px-3" justify="center">
              <CentralizedSearchBar className="w-full max-w-[20rem] xl:max-w-[24rem] 2xl:max-w-[30rem]" />
            </NavbarContent>
          </>
        )}

        {/* Seção Direita - Ações */}
        <NavbarContent className="shrink-0 min-w-0 gap-1 sm:gap-2" justify="end">
          {session?.user ? rightExtras : null}
          {session?.user ? (
            <Button
              isIconOnly
              aria-label="Buscar"
              className="h-8 w-8 min-w-8 border border-divider bg-content1 text-default-600 hover:text-primary sm:hidden"
              radius="full"
              size="sm"
              variant="light"
              onPress={() => window.dispatchEvent(new CustomEvent("open-search"))}
            >
              <svg aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" x2="16.65" y1="21" y2="16.65" />
              </svg>
            </Button>
          ) : null}
          {session?.user ? <NavbarSupportChat /> : null}
          {session?.user ? (
            <div className="hidden sm:block">
              <NotificationCenter />
            </div>
          ) : null}
          <div className="hidden md:block">
            <ThemeSwitch />
          </div>
          <div className="flex md:hidden">
            <ThemeSwitch />
          </div>
          {session?.user ? (
            <div className="hidden sm:block">
              <Dropdown placement="bottom-end">
                <DropdownTrigger>
                  <Button
                    className="h-auto max-w-[14rem] min-w-0 gap-2 overflow-hidden border border-divider bg-content1 p-1.5 shadow-sm transition hover:border-primary/40 hover:bg-primary/5 sm:p-2 xl:max-w-[16rem] 2xl:max-w-[20rem]"
                    variant="light"
                  >
                    <Badge
                      className="shrink-0"
                      color={userRole === "ADMIN" ? "danger" : userRole === "ADVOGADO" ? "primary" : "default"}
                      content={userRole?.replace(/_/g, " ").charAt(0) || "U"}
                      placement="bottom-right"
                      shape="circle"
                      size="sm"
                    >
                      <Avatar
                        isBordered
                        className="h-8 w-8 shrink-0 text-xs"
                        name={userDisplayName}
                        size="sm"
                        src={userAvatar}
                      />
                    </Badge>
                    <div className="hidden min-w-0 flex-1 overflow-hidden text-left xl:block">
                      <p
                        className="truncate whitespace-nowrap text-sm font-medium leading-tight"
                        title={userDisplayName}
                      >
                        {userDisplayName}
                      </p>
                      <p className="truncate whitespace-nowrap text-xs text-default-500">
                        {userRole?.replace(/_/g, " ").toLowerCase()}
                      </p>
                    </div>
                  </Button>
                </DropdownTrigger>
                <DropdownMenu aria-label="Menu do usuário" className="min-w-[220px]" onAction={(key) => handleUserAction(String(key))}>
                  <DropdownItem key="profile" description={isSuperAdmin ? "Configurações do sistema" : "Gerenciar informações pessoais"}>
                    {isSuperAdmin ? "Configurações" : "Meu perfil"}
                  </DropdownItem>
                  {!isSuperAdmin && canManageTenantSettings ? (
                    <DropdownItem key="tenant-settings" description="Branding, domínios e integrações do escritório">
                      Configurações do escritório
                    </DropdownItem>
                  ) : null}
                  <DropdownItem key="logout" className="text-danger" color="danger" description="Encerrar sessão com segurança">
                    Sair
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
            </div>
          ) : (
            <div className="hidden sm:flex">
              <SignInOut />
            </div>
          )}
        </NavbarContent>
      </HeroUINavbar>

      {authenticatedNav}
    </div>
  );
};
