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
        description: "Visao geral do sistema",
      },
      {
        label: "Tenants",
        href: "/admin/tenants",
        icon: "Building2",
        description: "Gerenciar escritorios de advocacia",
      },
      {
        label: "Planos e Modulos",
        href: "/admin/planos",
        icon: "Layers",
        description: "Catalogo comercial: planos, modulos, matriz e composicao",
      },
      {
        label: "Leads",
        href: "/admin/leads",
        icon: "Users",
        description: "Funil comercial de captacao da landing",
      },
      {
        label: "Juizes Globais",
        href: "/admin/juizes",
        icon: "Scale",
        description: "Base de dados de juizes",
      },
      {
        label: "Causas Oficiais",
        href: "/admin/causas",
        icon: "Causas",
        description: "Sincronizar catalogo oficial de causas por tenant",
      },
      {
        label: "Pacotes Premium",
        href: "/admin/pacotes",
        icon: "Crown",
        description: "Configurar monetizacao",
      },
      {
        label: "Magic AI",
        href: "/admin/magic-ai",
        icon: "Sparkles",
        description: "Governanca da IA juridica e rollout premium",
      },
      {
        label: "Feriados",
        href: "/admin/feriados",
        icon: "Feriados",
        description: "Catalogo oficial, rollout por tenant e auditoria da experiencia",
      },
      {
        label: "Financeiro",
        href: "/admin/financeiro",
        icon: "DollarSign",
        description: "Gestao financeira global",
      },
      {
        label: "Bancos",
        href: "/admin/bancos",
        icon: "Building",
        description: "Gestao de bancos do sistema",
      },
      {
        label: "Relatorios",
        href: "/admin/relatorios",
        icon: "BarChart3",
        description: "Analytics e relatorios",
      },
    ];
  }, []);

  const secondaryNavigationItems = useMemo<NavigationItem[]>(() => {
    return [
      {
        label: "Seguranca",
        href: "/admin/seguranca",
        icon: "ShieldAlert",
        description: "Acessos, alertas de conta e resposta a incidentes",
      },
      {
        label: "Auditoria",
        href: "/admin/auditoria",
        icon: "Shield",
        description: "Logs de sistema e auditoria",
      },
      {
        label: "Configuracoes",
        href: "/admin/configuracoes",
        icon: "Settings",
        description: "Configuracoes do sistema",
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
    return "Visao geral do sistema Magic Lawyer - SuperAdmin";
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
