import { TENANT_PERMISSIONS } from "@/types";

export type SiteConfig = typeof siteConfig;

export const siteConfig = {
  name: "Magic Lawyer",
  description:
    "Sistema para advogados - Controle seu escritório com facilidade.",
  navItemsPublic: [
    { label: "Início", href: "/" },
    { label: "Planos", href: "/precos" },
  ],
  navItemsAuthenticated: [
    { label: "Painel", href: "/dashboard" },
    { label: "Processos", href: "/processos" },
    { label: "Documentos", href: "/documentos" },
    { label: "Agenda", href: "/agenda" },
    { label: "Financeiro", href: "/financeiro" },
    { label: "Juízes", href: "/juizes" },
    { label: "Relatórios", href: "/relatorios" },
  ],
  navMenuItemsPublic: [
    { label: "Portal do Cliente", href: "/login?view=cliente" },
    { label: "Suporte", href: "/help" },
    { label: "Termos & Políticas", href: "/docs" },
  ],
  navMenuItemsAuthenticated: [
    { label: "Meu Perfil", href: "/usuario/perfil/editar" },
    {
      label: "Equipe & Permissões",
      href: "/equipe",
      requiresPermission: TENANT_PERMISSIONS.manageTeam,
    },
    {
      label: "Configurações do Escritório",
      href: "/configuracoes",
      requiresPermission: TENANT_PERMISSIONS.manageOfficeSettings,
    },
    { label: "Suporte", href: "/help" },
  ],
  links: {
    github: "https://github.com/nonattodev",
    twitter: "https://github.com/nonattodev",
    discord: "https://github.com/nonattodev",
    sponsor: "https://github.com/nonattodev",
  },
};
