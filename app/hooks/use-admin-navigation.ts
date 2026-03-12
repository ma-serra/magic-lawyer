import { useMemo } from "react";

import type { AuthenticatedNavPrefetchStrategy } from "@/app/lib/navigation/prefetch-policy";

export interface NavigationItem {
  label: string;
  href: string;
  icon?: string;
  description?: string;
  badge?: string;
  isAccordion?: boolean;
  compactChildrenCount?: number;
  children?: NavigationItem[];
  prefetchStrategy?: AuthenticatedNavPrefetchStrategy;
}

export function useAdminNavigation() {
  const navigationItems = useMemo<NavigationItem[]>(() => {
    return [
      {
        label: "Dashboard",
        href: "/admin/dashboard",
        icon: "LayoutDashboard",
        description: "Visão geral do sistema",
      },
      {
        label: "Tenants",
        href: "/admin/tenants",
        icon: "Building2",
        description: "Gerenciar escritórios de advocacia",
      },
      {
        label: "Planos e Módulos",
        href: "/admin/planos",
        icon: "Layers",
        description: "Catálogo comercial: planos, módulos, matriz e composição",
      },
      {
        label: "Leads",
        href: "/admin/leads",
        icon: "Users",
        description: "Funil comercial de captação da landing",
      },
      {
        label: "Juízes Globais",
        href: "/admin/juizes",
        icon: "Scale",
        description: "Base de dados de juízes",
      },
      {
        label: "Causas Oficiais",
        href: "/admin/causas",
        icon: "Causas",
        description: "Sincronizar catálogo oficial de causas por tenant",
      },
      {
        label: "Pacotes Premium",
        href: "/admin/pacotes",
        icon: "Crown",
        description: "Configurar monetização",
      },
      {
        label: "Financeiro",
        href: "/admin/financeiro",
        icon: "DollarSign",
        description: "Gestão financeira global",
      },
      {
        label: "Bancos",
        href: "/admin/bancos",
        icon: "Building",
        description: "Gestão de bancos do sistema",
      },
      {
        label: "Relatórios",
        href: "/admin/relatorios",
        icon: "BarChart3",
        description: "Analytics e relatórios",
      },
    ];
  }, []);

  const secondaryNavigationItems = useMemo<NavigationItem[]>(() => {
    return [
      {
        label: "Auditoria",
        href: "/admin/auditoria",
        icon: "Shield",
        description: "Logs de sistema e auditoria",
      },
      {
        label: "Configurações",
        href: "/admin/configuracoes",
        icon: "Settings",
        description: "Configurações do sistema",
      },
      {
        label: "Suporte",
        href: "/admin/suporte",
        icon: "HelpCircle",
        description: "Central de suporte",
      },
    ];
  }, []);

  const getDashboardTitle = () => {
    return "Dashboard Administrativo";
  };

  const getDashboardDescription = () => {
    return "Visão geral do sistema Magic Lawyer - SuperAdmin";
  };

  const getWelcomeMessage = () => {
    return "Bem-vindo ao painel administrativo do Magic Lawyer.";
  };

  return {
    navigationItems,
    secondaryNavigationItems,
    getDashboardTitle,
    getDashboardDescription,
    getWelcomeMessage,
  };
}
