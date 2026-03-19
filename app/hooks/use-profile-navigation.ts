import { useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";

import type { AuthenticatedNavPrefetchStrategy } from "@/app/lib/navigation/prefetch-policy";

import { useUserPermissions } from "./use-user-permissions";
import { useTenantModules } from "./use-tenant-modules";
import { useModuleRouteMap } from "./use-module-route-map";

export interface NavigationItem {
  label: string;
  href: string;
  icon?: string;
  description?: string;
  badge?: string;
  children?: NavigationItem[];
  isAccordion?: boolean;
  compactChildrenCount?: number;
  section?: string;
  requiredModules?: string[];
  prefetchStrategy?: AuthenticatedNavPrefetchStrategy;
}

function filterNavigation(
  items: NavigationItem[],
  hasModule: (href: string, required?: string[]) => boolean,
): NavigationItem[] {
  const filtered: NavigationItem[] = [];

  for (const item of items) {
    const children = item.children
      ? filterNavigation(item.children, hasModule)
      : undefined;

    const allowed = hasModule(item.href, item.requiredModules);

    if (item.isAccordion) {
      if (children && children.length > 0) {
        if (allowed) {
          filtered.push({ ...item, children });
        } else {
          filtered.push(...children);
        }
        continue;
      }

      if (allowed) {
        filtered.push({ ...item, children: undefined });
      }

      continue;
    }

    if (!allowed) {
      continue;
    }

    filtered.push({ ...item, children });
  }

  return filtered;
}

export function useProfileNavigation() {
  const { data: session } = useSession();
  const {
    userRole,
    permissions,
    isAdmin,
    isAdvogado,
    isSecretaria,
    isFinanceiro,
    isCliente,
  } = useUserPermissions();

  // Buscar módulos via hook realtime (atualiza automaticamente)
  const { modules: realtimeModules, isLoading: isLoadingModules } =
    useTenantModules();
  const { moduleRouteMap } = useModuleRouteMap();

  // Debug removido

  // Usar módulos do realtime se disponível, senão usar do session
  // IMPORTANTE: Mantém uso de session enquanto carrega para evitar sidebar vazio
  const sessionModules = (session?.user as any)?.tenantModules as
    | string[]
    | undefined;

  // Garantir que temos sempre um array válido
  const grantedModules = useMemo(() => {
    if (realtimeModules.length > 0) {
      return realtimeModules;
    }

    return sessionModules || [];
  }, [realtimeModules, sessionModules]);

  const inferModulesForHref = useCallback(
    (href: string, explicit?: string[]) => {
      if (explicit && explicit.length > 0) {
        return explicit;
      }

      if (!moduleRouteMap || Object.keys(moduleRouteMap).length === 0) {
        return [];
      }

      const normalizedHref = href.replace(/\/$/, "") || "/";
      const matchedModules: string[] = [];

      for (const [moduleSlug, routes] of Object.entries(moduleRouteMap)) {
        const matches = routes.some((route) => {
          const normalizedRoute = route.replace(/\/$/, "") || "/";

          if (normalizedRoute === "/") {
            return normalizedHref.startsWith("/");
          }

          return (
            normalizedHref === normalizedRoute ||
            normalizedHref.startsWith(`${normalizedRoute}/`)
          );
        });

        if (matches) {
          matchedModules.push(moduleSlug);
        }
      }

      return matchedModules;
    },
    [moduleRouteMap],
  );

  const hasModuleAccess = useCallback(
    (href: string, required?: string[]) => {
      if (!grantedModules || !Array.isArray(grantedModules)) {
        return false;
      }

      if (grantedModules.includes("*")) {
        return true;
      }

      const modulesToCheck = inferModulesForHref(href, required);

      if (!modulesToCheck || modulesToCheck.length === 0) {
        return true;
      }

      return modulesToCheck.some((module) => grantedModules.includes(module));
    },
    [grantedModules, inferModulesForHref],
  );

  const navigationItems = useMemo(() => {
    const items: NavigationItem[] = [];

    items.push({
      label: "Painel",
      href: "/dashboard",
      icon: "LayoutDashboard",
      description: "Visão geral do sistema",
      section: "Visão Geral",
      requiredModules: ["dashboard"],
    });

    if (permissions.canViewReports) {
      items.push({
        label: "Relatórios",
        href: "/relatorios",
        icon: "BarChart3",
        description: "Relatórios e analytics",
        section: "Visão Geral",
        requiredModules: ["relatorios"],
      });
    }

    if (!isCliente && (isAdmin || isAdvogado || isSecretaria || isFinanceiro)) {
      items.push({
        label: "Magic AI",
        href: "/magic-ai",
        icon: "Sparkles",
        description: "Assistente jurídico proativo do escritório",
        section: "Inteligência Jurídica",
      });
    }

    if (permissions.canViewAllClients) {
      items.push({
        label: "Clientes",
        href: "/clientes",
        icon: "Users",
        description: "Gestão da base de clientes",
        section: "Gestão de Pessoas",
        requiredModules: ["clientes"],
      });
    }

    if (permissions.canManageTeam) {
      items.push({
        label: "Advogados",
        href: "/advogados",
        icon: "Users",
        description: "Gestão de advogados do escritório",
        section: "Gestão de Pessoas",
        requiredModules: ["advogados"],
      });

      items.push({
        label: "Equipe",
        href: "/equipe",
        icon: "Users",
        description: "Gestão de usuários e permissões",
        section: "Gestão de Pessoas",
        requiredModules: ["equipe"],
      });
    }

    if (permissions.canViewAllProcesses || permissions.canViewAllClients) {
      items.push({
        label: "Processos",
        href: "/processos",
        icon: "FileText",
        description: isCliente ? "Meu processo" : "Gestão de processos",
        section: "Atividades Jurídicas",
        requiredModules: ["processos"],
      });
    }

    if (
      !isCliente &&
      (permissions.canViewAllProcesses || isAdvogado || isSecretaria)
    ) {
      items.push({
        label: "Petições",
        href: "/peticoes",
        icon: "FileText",
        description: "Gestão de petições processuais",
        section: "Atividades Jurídicas",
        requiredModules: ["peticoes"],
      });
    }

    if (
      isCliente ||
      permissions.canViewAllProcesses ||
      isAdvogado ||
      isSecretaria
    ) {
      items.push({
        label: "Andamentos",
        href: "/andamentos",
        icon: "Activity",
        description: isCliente
          ? "Timeline dos meus andamentos"
          : "Timeline de movimentações processuais",
        section: "Atividades Jurídicas",
        requiredModules: ["andamentos"],
      });
    }

    if (permissions.canViewAllClients || isAdvogado) {
      items.push({
        label: "Procurações",
        href: "/procuracoes",
        icon: "Shield",
        description: "Gestão de procurações e poderes",
        section: "Atividades Jurídicas",
        requiredModules: ["procuracoes"],
      });
    }

    if (permissions.canViewAllDocuments || isCliente) {
      if (isCliente) {
        items.push({
          label: "Contratos",
          href: "/contratos",
          icon: "FileSignature",
          description: "Meus contratos com advogados",
          section: "Atividades Jurídicas",
          requiredModules: ["contratos"],
        });
      } else {
        items.push({
          label: "Contratos",
          href: "/contratos",
          icon: "FileSignature",
          description: "Gestão de contratos e honorários",
          section: "Atividades Jurídicas",
          requiredModules: ["contratos"],
        });
      }
    }

    if (permissions.canViewAllDocuments || isCliente) {
      items.push({
        label: "Documentos",
        href: "/documentos",
        icon: "FolderOpen",
        description: isCliente ? "Meus documentos" : "Gestão de documentos",
        section: "Atividades Jurídicas",
        requiredModules: ["documentos"],
      });
    }

    const apoioJuridicoItems: NavigationItem[] = [];

    if (
      !isCliente &&
      (permissions.canViewAllProcesses || permissions.canManageOfficeSettings)
    ) {
      apoioJuridicoItems.push({
        label: "INPI",
        href: "/inpi",
        icon: "Shield",
        description: "Viabilidade de marca e colisões multi-tenant",
        requiredModules: ["causas"],
      });

      apoioJuridicoItems.push({
        label: "Causas",
        href: "/causas",
        icon: "Scale",
        description: "Catálogo de assuntos processuais",
        requiredModules: ["causas"],
      });
    }

    if (permissions.canViewJudgesDatabase) {
      apoioJuridicoItems.push({
        label: "Juízes",
        href: "/juizes",
        icon: "Scale",
        description: isCliente
          ? "Informações sobre juízes"
          : "Base de dados de juízes",
        requiredModules: ["juizes"],
      });

      apoioJuridicoItems.push({
        label: "Loja Premium",
        href: "/juizes/pacotes",
        icon: "CreditCard",
        description: "Comprar pacotes de autoridades premium",
        requiredModules: ["juizes"],
      });
    }

    // Portal do Advogado - Acesso para ADMIN e ADVOGADO
    if (isAdmin || isAdvogado || isSecretaria) {
      apoioJuridicoItems.push({
        label: "Operações Jurídicas",
        href: "/portal-advogado/operacoes",
        icon: "Scale",
        description:
          "Publicações, intimações, discovery processual e fila de protocolos",
      });

      apoioJuridicoItems.push({
        label: "Portal do Advogado",
        href: "/portal-advogado",
        icon: "Gavel",
        description: "Portais dos tribunais, recessos forenses e comunicados",
      });
    }

    if (isAdmin || isAdvogado) {
      apoioJuridicoItems.push({
        label: "Discovery Full",
        href: "/portal-advogado/operacoes?tab=discovery",
        icon: "Gavel",
        description: "Captura por OAB, planilha e sincronização operacional",
      });

      apoioJuridicoItems.push({
        label: "Protocolos",
        href: "/portal-advogado/operacoes?tab=protocols",
        icon: "FileText",
        description: "Fila pronta para protocolar petições do escritório",
      });
    }

    if (apoioJuridicoItems.length > 0) {
      items.push({
        label: "Apoio Jurídico",
        href: apoioJuridicoItems[0].href,
        icon: "Scale",
        description: "Bases e ferramentas de apoio",
        isAccordion: true,
        section: "Atividades Jurídicas",
        children: apoioJuridicoItems,
      });
    }

    const canViewAgenda =
      (!isCliente && permissions.canViewAllEvents) ||
      (isCliente && permissions.canViewClientEvents);

    if (canViewAgenda) {
      items.push({
        label: "Agenda",
        href: "/agenda",
        icon: "Calendar",
        description: isCliente ? "Eventos do meu processo" : "Gestão de agenda",
        section: "Operacional",
        requiredModules: ["agenda"],
      });
    }

    if (
      !isCliente &&
      (permissions.canViewAllProcesses || isAdvogado || isSecretaria)
    ) {
      items.push({
        label: "Prazos",
        href: "/processos/prazos",
        icon: "Clock",
        description: "Carteira operacional de prazos do escritório",
        section: "Operacional",
        requiredModules: ["processos"],
      });
    }

    if (!isCliente) {
      items.push({
        label: "Tarefas",
        href: "/tarefas",
        icon: "CheckSquare",
        description: "Gestão de tarefas e atividades",
        section: "Operacional",
        requiredModules: ["tarefas"],
      });
    }

    if (
      !isCliente &&
      (permissions.canViewAllProcesses || isSecretaria || isAdvogado)
    ) {
      items.push({
        label: "Diligências",
        href: "/diligencias",
        icon: "Clipboard",
        description: "Controle de diligências internas e externas",
        section: "Operacional",
        requiredModules: ["diligencias"],
      });
    }

    if (
      !isCliente &&
      (permissions.canManageOfficeSettings || isSecretaria || isAdvogado)
    ) {
      items.push({
        label: "Regimes de prazo",
        href: "/regimes-prazo",
        icon: "Clock",
        description: "Regras de contagem aplicadas aos prazos",
        section: "Operacional",
        requiredModules: ["regimes-prazo"],
      });
    }

    if (permissions.canViewFinancialData || isFinanceiro) {
      items.push({
        label: "Financeiro",
        href: "/financeiro/dashboard",
        icon: "DollarSign",
        description: isCliente
          ? "Minhas faturas"
          : isAdvogado
            ? "Minhas comissões"
            : "Gestão financeira",
        isAccordion: true,
        compactChildrenCount: 5,
        section: "Operacional",
        children: [
          {
            label: "Dashboard",
            href: "/financeiro/dashboard",
            icon: "BarChart3",
            description: "Visão geral financeira",
            requiredModules: ["financeiro"],
          },
          {
            label: "Parcelas",
            href: "/financeiro/parcelas",
            icon: "Receipt",
            description: "Parcelas de contrato",
            requiredModules: ["parcelas"],
          },
          {
            label: "Recibos",
            href: "/financeiro/recibos",
            icon: "FileText",
            description: "Comprovantes e recibos pagos",
            requiredModules: ["financeiro"],
          },
          {
            label: "Honorários",
            href: "/financeiro/honorarios",
            icon: "DollarSign",
            description: "Honorários contratuais",
            requiredModules: ["honorarios"],
          },
          {
            label: "Dados bancários",
            href: "/financeiro/dados-bancarios",
            icon: "CreditCard",
            description: "Contas bancárias de usuários e clientes",
            requiredModules: ["financeiro"],
          },
        ],
        requiredModules: ["financeiro"],
      });
    }

    items.push({
      label: "Suporte",
      href: "/suporte",
      icon: "HelpCircle",
      description: "Central de ajuda e suporte",
      section: "Administração",
      requiredModules: ["help"],
    });

    if (permissions.canManageOfficeSettings) {
      items.push({
        label: "Configurações do escritório",
        href: "/configuracoes",
        icon: "Settings",
        description: "Central de configurações do escritório",
        section: "Administração",
        requiredModules: ["configuracoes"],
      });
    }

    return filterNavigation(items, hasModuleAccess);
  }, [
    hasModuleAccess,
    permissions,
    isCliente,
    isAdvogado,
    isSecretaria,
    isFinanceiro,
  ]);

  const secondaryNavigationItems = useMemo(() => {
    return [] as NavigationItem[];
  }, []);

  const getDashboardTitle = useCallback(() => {
    switch (userRole) {
      case "SUPER_ADMIN":
        return "Painel Global";
      case "ADMIN":
        return "Painel Administrativo";
      case "ADVOGADO":
        return "Meu Escritório";
      case "SECRETARIA":
        return "Central Operacional";
      case "FINANCEIRO":
        return "Central Financeira";
      case "CLIENTE":
        return "Meu Processo";
      default:
        return "Painel";
    }
  }, [userRole]);

  const getDashboardDescription = useCallback(() => {
    switch (userRole) {
      case "SUPER_ADMIN":
        return "Visão unificada de tenants, receita e saúde da operação";
      case "ADMIN":
        return "Visão completa do escritório, relatórios e gestão";
      case "ADVOGADO":
        return "Seus clientes, processos e agenda pessoal";
      case "SECRETARIA":
        return "Organização da agenda e controle de prazos";
      case "FINANCEIRO":
        return "Gestão financeira e controle de pagamentos";
      case "CLIENTE":
        return "Acompanhamento do seu processo e pagamentos";
      default:
        return "Visão geral do sistema";
    }
  }, [userRole]);

  const getWelcomeMessage = useCallback(() => {
    const userName = session?.user?.name || "Usuário";

    switch (userRole) {
      case "SUPER_ADMIN":
        return `Olá, ${userName}! Aqui está a fotografia global dos tenants.`;
      case "ADMIN":
        return `Bem-vindo, ${userName}! Seu escritório está pronto para avançar.`;
      case "ADVOGADO":
        return `Olá, Dr(a). ${userName}! Vamos acelerar seus resultados jurídicos.`;
      case "SECRETARIA":
        return `Olá, ${userName}! Controle cada prazo com precisão.`;
      case "FINANCEIRO":
        return `Boas-vindas, ${userName}! A performance financeira está nas suas mãos.`;
      case "CLIENTE":
        return `Olá, ${userName}! Acompanhe seu processo com transparência.`;
      default:
        return `Olá, ${userName}!`;
    }
  }, [session?.user?.name, userRole]);

  return {
    navigationItems,
    secondaryNavigationItems,
    getDashboardTitle,
    getDashboardDescription,
    getWelcomeMessage,
    userRole,
  };
}
