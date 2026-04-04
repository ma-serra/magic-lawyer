"use client";

import {
  useMemo,
  type ReactElement,
  type ReactNode,
  useState,
  useEffect,
} from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
} from "@heroui/drawer";
import { Button } from "@heroui/button";
import { Avatar } from "@heroui/avatar";
import { Tooltip } from "@heroui/react";
import { useSession } from "next-auth/react";
import useSWR from "swr";

import type { AuthenticatedNavPrefetchStrategy } from "@/app/lib/navigation/prefetch-policy";
import { AppNavLink } from "@/components/app-nav-link";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { Logo } from "@/components/icons";
import { DevInfo } from "@/components/dev-info";
import { useAvatar } from "@/app/hooks/use-avatar";

async function fetchDevWorkbenchAccess() {
  const response = await fetch("/api/internal/dev-workbench-access", {
    method: "GET",
    cache: "no-store",
    credentials: "include",
  });

  if (!response.ok) {
    return { enabled: false };
  }

  return (await response.json()) as { enabled?: boolean };
}

const navIconStroke = 1.6;
const sidebarNameConnectors = new Set(["da", "de", "do", "das", "dos", "e"]);
type IconProps = {
  size?: number;
};

function getSidebarDisplayName(name: string): string {
  const normalized = name.trim().replace(/\s+/g, " ");

  if (normalized.length <= 24) {
    return normalized;
  }

  const parts = normalized.split(" ");

  if (parts.length === 1) {
    return normalized;
  }

  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  const middleName = parts
    .slice(1, -1)
    .find((part) => !sidebarNameConnectors.has(part.toLowerCase()));

  const compactCandidates = [
    middleName ? `${firstName} ${middleName} ${lastName}` : null,
    `${firstName} ${lastName}`,
    normalized,
  ].filter((candidate): candidate is string => Boolean(candidate));

  return compactCandidates.find((candidate) => candidate.length <= 24) ?? compactCandidates[0];
}

const DashboardIcon = ({ size = 18 }: IconProps) => (
  <svg
    aria-hidden
    className="text-current"
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={navIconStroke}
    viewBox="0 0 24 24"
    width={size}
  >
    <path d="M3 13h8V3H3zM13 21h8V11h-8z" />
    <path d="M3 21h8v-4H3zM13 3v4h8V3z" />
  </svg>
);

const FolderIcon = ({ size = 18 }: IconProps) => (
  <svg
    aria-hidden
    className="text-current"
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={navIconStroke}
    viewBox="0 0 24 24"
    width={size}
  >
    <path d="M3 7a2 2 0 0 1 2-2h4l2 3h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    <path d="M3 7h18" />
  </svg>
);

const FileIcon = ({ size = 18 }: IconProps) => (
  <svg
    aria-hidden
    className="text-current"
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={navIconStroke}
    viewBox="0 0 24 24"
    width={size}
  >
    <path d="M4 3h9l5 5v13H4z" />
    <path d="M13 3v6h6" />
  </svg>
);

const WalletIcon = ({ size = 18 }: IconProps) => (
  <svg
    aria-hidden
    className="text-current"
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={navIconStroke}
    viewBox="0 0 24 24"
    width={size}
  >
    <rect height="14" rx="2" width="20" x="2" y="5" />
    <path d="M16 12h4" />
  </svg>
);

const ChartIcon = ({ size = 18 }: IconProps) => (
  <svg
    aria-hidden
    className="text-current"
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={navIconStroke}
    viewBox="0 0 24 24"
    width={size}
  >
    <path d="M4 19v-8" />
    <path d="M9 19V5" />
    <path d="M15 19v-5" />
    <path d="M20 19V9" />
  </svg>
);

const CalendarIcon = ({ size = 18 }: IconProps) => (
  <svg
    aria-hidden
    className="text-current"
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={navIconStroke}
    viewBox="0 0 24 24"
    width={size}
  >
    <rect height="18" rx="2" ry="2" width="18" x="3" y="4" />
    <line x1="16" x2="16" y1="2" y2="6" />
    <line x1="8" x2="8" y1="2" y2="6" />
    <line x1="3" x2="21" y1="10" y2="10" />
  </svg>
);

const ScaleIcon = ({ size = 18 }: IconProps) => (
  <svg
    aria-hidden
    className="text-current"
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={navIconStroke}
    viewBox="0 0 24 24"
    width={size}
  >
    <path d="M16 11V7a4 4 0 0 0-8 0v4" />
    <rect height="11" rx="2" width="18" x="3" y="11" />
    <circle cx="12" cy="16" r="1" />
  </svg>
);

const PeopleIcon = ({ size = 18 }: IconProps) => (
  <svg
    aria-hidden
    className="text-current"
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={navIconStroke}
    viewBox="0 0 24 24"
    width={size}
  >
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const SettingsIcon = ({ size = 18 }: IconProps) => (
  <svg
    aria-hidden
    className="text-current"
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={navIconStroke}
    viewBox="0 0 24 24"
    width={size}
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const UserIcon = ({ size = 18 }: IconProps) => (
  <svg
    aria-hidden
    className="text-current"
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={navIconStroke}
    viewBox="0 0 24 24"
    width={size}
  >
    <circle cx="12" cy="7" r="4" />
    <path d="M5.5 21a6.5 6.5 0 0 1 13 0" />
  </svg>
);

const HelpIcon = ({ size = 18 }: IconProps) => (
  <svg
    aria-hidden
    className="text-current"
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={navIconStroke}
    viewBox="0 0 24 24"
    width={size}
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <path d="M12 17h.01" />
  </svg>
);

const ReceiptIcon = ({ size = 18 }: IconProps) => (
  <svg
    aria-hidden
    className="text-current"
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={navIconStroke}
    viewBox="0 0 24 24"
    width={size}
  >
    <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z" />
    <path d="M14 8H8" />
    <path d="M16 12H8" />
    <path d="M13 16H8" />
  </svg>
);

const CreditCardIcon = ({ size = 18 }: IconProps) => (
  <svg
    aria-hidden
    className="text-current"
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={navIconStroke}
    viewBox="0 0 24 24"
    width={size}
  >
    <rect height="14" rx="2" width="20" x="2" y="5" />
    <line x1="2" x2="22" y1="10" y2="10" />
  </svg>
);

const FileSignatureIcon = ({ size = 18 }: IconProps) => (
  <svg
    aria-hidden
    className="text-current"
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={navIconStroke}
    viewBox="0 0 24 24"
    width={size}
  >
    <path d="M20 19.5v.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8l4 4v13.5" />
    <path d="M14 2v4h4" />
    <path d="M10 9H8" />
    <path d="M16 13H8" />
    <path d="M16 17H8" />
    <path d="M10 5H8" />
  </svg>
);

const FileTemplateIcon = ({ size = 18 }: IconProps) => (
  <svg
    aria-hidden
    className="text-current"
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={navIconStroke}
    viewBox="0 0 24 24"
    width={size}
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M16 13H8" />
    <path d="M16 17H8" />
    <path d="M10 9H8" />
  </svg>
);

const ShieldIcon = ({ size = 18 }: IconProps) => (
  <svg
    aria-hidden
    className="text-current"
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={navIconStroke}
    viewBox="0 0 24 24"
    width={size}
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

const ClockIcon = ({ size = 18 }: IconProps) => (
  <svg
    aria-hidden
    className="text-current"
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={navIconStroke}
    viewBox="0 0 24 24"
    width={size}
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l3 3" />
  </svg>
);

const ClipboardIcon = ({ size = 18 }: IconProps) => (
  <svg
    aria-hidden
    className="text-current"
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={navIconStroke}
    viewBox="0 0 24 24"
    width={size}
  >
    <path d="M16 4h1a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1" />
    <path d="M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
    <path d="M9 12h6" />
    <path d="M9 16h6" />
  </svg>
);

const UsersIcon = ({ size = 18 }: IconProps) => (
  <svg
    aria-hidden
    className="text-current"
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={navIconStroke}
    viewBox="0 0 24 24"
    width={size}
  >
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const ChevronDownIcon = ({ size = 16 }: IconProps) => (
  <svg
    aria-hidden
    className="text-current"
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={navIconStroke}
    viewBox="0 0 24 24"
    width={size}
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const CheckSquareIcon = ({ size = 18 }: IconProps) => (
  <svg
    aria-hidden
    className="text-current"
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={navIconStroke}
    viewBox="0 0 24 24"
    width={size}
  >
    <rect height="18" rx="2" width="18" x="3" y="3" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const TagIcon = ({ size = 18 }: IconProps) => (
  <svg
    aria-hidden
    className="text-current"
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={navIconStroke}
    viewBox="0 0 24 24"
    width={size}
  >
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <circle cx="7" cy="7" r="1" />
  </svg>
);

const PuzzleIcon = ({ size = 18 }: IconProps) => (
  <svg
    aria-hidden
    className="text-current"
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={navIconStroke}
    viewBox="0 0 24 24"
    width={size}
  >
    <path d="M19.439 7.85c-.049.322-.059.644-.03.965l1.09 6.42a2 2 0 0 1-1.35 2.365l-1.148.381a1 1 0 0 1-1.618-.516l-1.774-6.65a1 1 0 0 0-1.176-.754l-5.33.884a1 1 0 0 1-1.105-.516L5.814 8.381a1 1 0 0 1 .192-1.165l2.128-2.128a1 1 0 0 1 1.414 0l.707.707a1 1 0 0 0 1.414 0l2.121-2.121a1 1 0 0 1 1.415 0l2.121 2.121a1 1 0 0 0 1.415 0l.707-.707a1 1 0 0 1 1.414 0l2.128 2.128a1 1 0 0 1 .192 1.165z" />
  </svg>
);

const BuildingIcon = ({ size = 18 }: IconProps) => (
  <svg
    aria-hidden
    className="text-current"
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={navIconStroke}
    viewBox="0 0 24 24"
    width={size}
  >
    <rect height="16" width="16" x="4" y="4" />
    <rect height="6" width="6" x="9" y="9" />
    <path d="M9 1v3" />
    <path d="M15 1v3" />
    <path d="M9 20v3" />
    <path d="M15 20v3" />
    <path d="M20 9h3" />
    <path d="M20 14h3" />
    <path d="M1 9h3" />
    <path d="M1 14h3" />
  </svg>
);

const LayoutBoardIcon = ({ size = 18 }: IconProps) => (
  <svg
    aria-hidden
    className="text-current"
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={navIconStroke}
    viewBox="0 0 24 24"
    width={size}
  >
    <rect height="18" rx="2" width="18" x="3" y="3" />
    <path d="M3 9h18" />
    <path d="M9 21V9" />
  </svg>
);

const ListIcon = ({ size = 18 }: IconProps) => (
  <svg
    aria-hidden
    className="text-current"
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={navIconStroke}
    viewBox="0 0 24 24"
    width={size}
  >
    <line x1="8" x2="21" y1="6" y2="6" />
    <line x1="8" x2="21" y1="12" y2="12" />
    <line x1="8" x2="21" y1="18" y2="18" />
    <line x1="3" x2="3.01" y1="6" y2="6" />
    <line x1="3" x2="3.01" y1="12" y2="12" />
    <line x1="3" x2="3.01" y1="18" y2="18" />
  </svg>
);

const ActivityIcon = ({ size = 18 }: IconProps) => (
  <svg
    aria-hidden
    className="text-current"
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={navIconStroke}
    viewBox="0 0 24 24"
    width={size}
  >
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);

const navIconMap: Record<string, ReactElement> = {
  Painel: <DashboardIcon />,
  Dashboard: <DashboardIcon />,
  Clientes: <PeopleIcon />,
  Processos: <FolderIcon />,
  Petições: <FileIcon />,
  Procurações: <ShieldIcon />,
  Contratos: <FileSignatureIcon />,
  Modelos: <FileTemplateIcon />,
  Documentos: <FileIcon />,
  Agenda: <CalendarIcon />,
  Prazos: <ClockIcon />,
  Feriados: <CalendarIcon />,
  Tarefas: <CheckSquareIcon />,
  Financeiro: <WalletIcon />,
  Honorários: <WalletIcon />,
  Parcelas: <ReceiptIcon />,
  Faturas: <ReceiptIcon />,
  Magistrados: <ScaleIcon />,
  Juízes: <ScaleIcon />,
  "Juízes Globais": <ScaleIcon />,
  Causas: <ScaleIcon />,
  INPI: <ShieldIcon />,
  "Apoio Jurídico": <ScaleIcon />,
  "Operações Jurídicas": <ScaleIcon />,
  "Portal do Advogado": (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </svg>
  ),
  "Discovery Full": <ActivityIcon />,
  Protocolos: <FileIcon />,
  "Regimes de prazo": <ClockIcon />,
  Diligências: <ClipboardIcon />,
  Relatórios: <ChartIcon />,
  Equipe: <PeopleIcon />,
  Tenants: <PeopleIcon />,
  Advogados: <UsersIcon />,
  Leads: <UsersIcon />,
  "Meu Perfil": <UserIcon />,
  "Configurações do escritório": <SettingsIcon />,
  Configurações: <SettingsIcon />,
  "Categorias de Tarefa": <TagIcon />,
  Categorias: <TagIcon />,
  "Gestão de Módulos": <PuzzleIcon />,
  Módulos: <PuzzleIcon />,
  "Dados Bancários": <CreditCardIcon />,
  "Áreas de Processo": <ScaleIcon />,
  "Tipos de Contrato": <FileSignatureIcon />,
  Tribunais: <BuildingIcon />,
  Andamentos: <ActivityIcon />,
  Kanban: <LayoutBoardIcon />,
  Lista: <ListIcon />,
  Suporte: <HelpIcon />,
  "Pacotes Premium": <WalletIcon />,
  Auditoria: <ScaleIcon />,
  "Causas Oficiais": <ScaleIcon />,
};

export type SidebarNavItem = {
  label: string;
  href: string;
  description?: string;
  children?: SidebarNavItem[];
  isAccordion?: boolean;
  compactChildrenCount?: number;
  section?: string;
  prefetchStrategy?: AuthenticatedNavPrefetchStrategy;
};

export type SidebarProps = {
  tenantName: string;
  tenantLogoUrl?: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  navItems: SidebarNavItem[];
  secondaryItems: SidebarNavItem[];
};

const SidebarSectionLabel = ({
  collapsed,
  children,
}: {
  collapsed: boolean;
  children: ReactNode;
}) =>
  collapsed ? null : (
    <div className="px-2 py-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-default-400">
        {children}
      </p>
    </div>
  );

// Componente para item com accordion
const AccordionNavItem = ({
  item,
  icon,
  isDesktop,
  onCloseMobile,
}: {
  item: SidebarNavItem;
  icon: ReactElement;
  isDesktop: boolean;
  onCloseMobile?: () => void;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAllChildren, setShowAllChildren] = useState(false);
  const pathname = usePathname();
  const children = item.children ?? [];
  const compactChildrenCount =
    typeof item.compactChildrenCount === "number" &&
    item.compactChildrenCount > 0
      ? item.compactChildrenCount
      : children.length;
  const hasHiddenChildren = children.length > compactChildrenCount;
  const activeChildIndex = children.findIndex(
    (child) => pathname === child.href || pathname.startsWith(`${child.href}/`),
  );
  const hasActiveChild = activeChildIndex >= 0;
  const visibleChildren =
    hasHiddenChildren && !showAllChildren
      ? children.slice(0, compactChildrenCount)
      : children;
  const hiddenChildrenCount = Math.max(children.length - compactChildrenCount, 0);

  // Expandir automaticamente se houver filho ativo
  useEffect(() => {
    if (hasActiveChild) {
      setIsExpanded(true);

      if (hasHiddenChildren && activeChildIndex >= compactChildrenCount) {
        setShowAllChildren(true);
      }
    }
  }, [activeChildIndex, compactChildrenCount, hasActiveChild, hasHiddenChildren]);

  const handleToggleAccordion = () => {
    setIsExpanded((current) => {
      const next = !current;

      if (!next) {
        setShowAllChildren(false);
      }

      return next;
    });
  };

  return (
    <li key={item.href}>
      <div className="space-y-1">
        {/* Item principal com botão de toggle */}
        <div className="flex items-center">
          {/* Botão de toggle - só expande/recolhe */}
          <button
            aria-label={isExpanded ? "Recolher" : "Expandir"}
            className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition text-default-400 hover:bg-default-100 hover:text-default-900 flex-1"
            onClick={handleToggleAccordion}
          >
            <span className="shrink-0 text-base">{icon}</span>
            <span className="truncate">{item.label}</span>
            <span
              className={`transition-transform duration-200 ml-auto ${isExpanded ? "rotate-180" : ""}`}
            >
              <ChevronDownIcon size={14} />
            </span>
          </button>
        </div>

        {/* Sub-itens com animação */}
        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? "max-h-[40rem] opacity-100" : "max-h-0 opacity-0"}`}
        >
          <ul className="space-y-1 pl-6">
            {visibleChildren.map((child) => {
              const isChildActive =
                pathname === child.href ||
                pathname.startsWith(`${child.href}/`);

              return (
                <li key={child.href}>
                  <Tooltip
                    content={child.description || child.label}
                    delay={300}
                    placement="right"
                  >
                    <AppNavLink
                      className={
                        isChildActive
                          ? "flex items-center gap-2 rounded-xl px-3 py-1.5 text-[13px] transition bg-primary/25 text-primary"
                          : "flex items-center gap-2 rounded-xl px-3 py-1.5 text-[13px] transition text-default-400 hover:bg-default-100 hover:text-default-900"
                      }
                      href={child.href}
                      prefetchStrategy={child.prefetchStrategy}
                      onClick={() => {
                        if (!isDesktop && onCloseMobile) {
                          onCloseMobile();
                        }
                      }}
                    >
                      <span
                        className={
                          isChildActive
                            ? "h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                            : "h-1.5 w-1.5 shrink-0 rounded-full bg-default-500/70"
                        }
                      />
                      <span className="truncate">{child.label}</span>
                    </AppNavLink>
                  </Tooltip>
                </li>
              );
            })}
            {hasHiddenChildren ? (
              <li>
                <button
                  className="ml-3 flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-default-500 transition hover:bg-default-100 hover:text-default-800"
                  type="button"
                  onClick={() => setShowAllChildren((current) => !current)}
                >
                  <span
                    className={`transition-transform duration-200 ${showAllChildren ? "rotate-180" : ""}`}
                  >
                    <ChevronDownIcon size={12} />
                  </span>
                  <span>
                    {showAllChildren
                      ? "Mostrar menos"
                      : `Mostrar mais (${hiddenChildrenCount})`}
                  </span>
                </button>
              </li>
            ) : null}
          </ul>
        </div>
      </div>
    </li>
  );
};

const SidebarToggleIcon = ({ collapsed }: { collapsed: boolean }) => (
  <span className="relative flex h-6 w-6 items-center justify-center">
    <span
      className={clsx(
        "absolute inset-0 rounded-full border border-primary/50 transition-all duration-500 ease-out",
        collapsed ? "scale-90 opacity-50" : "scale-110 opacity-80",
      )}
    />
    <span
      className={clsx(
        "absolute inset-0 rounded-full bg-primary/20 transition-opacity duration-500",
        collapsed ? "opacity-25" : "opacity-40",
      )}
    />
    <svg
      aria-hidden
      className={clsx(
        "relative h-4 w-4 text-primary transition-transform duration-500 ease-in-out",
        collapsed ? "rotate-0" : "rotate-180",
      )}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M13 5l7 7-7 7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
      />
      <path
        d="M4 5l7 7-7 7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
      />
    </svg>
  </span>
);

function SidebarContent({
  tenantName,
  tenantLogoUrl,
  collapsed,
  onToggleCollapse,
  navItems,
  secondaryItems,
  isDesktop,
  onCloseMobile,
}: {
  tenantName: string;
  tenantLogoUrl?: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  navItems: SidebarNavItem[];
  secondaryItems: SidebarNavItem[];
  isDesktop: boolean;
  onCloseMobile?: () => void;
}) {
  const { data: session } = useSession();
  const { avatarUrl, mutate: mutateAvatar } = useAvatar();
  const pathname = usePathname();
  const isSuperAdmin = (session?.user as any)?.role === "SUPER_ADMIN";
  const userName = session?.user?.name?.trim() || "Advogado(a)";
  const userAvatar =
    avatarUrl ||
    (session?.user as any)?.avatarUrl ||
    session?.user?.image ||
    undefined;
  const sidebarUserName = useMemo(() => getSidebarDisplayName(userName), [userName]);
  const { data: devWorkbenchAccess } = useSWR(
    "dev-workbench-access",
    fetchDevWorkbenchAccess,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );
  const showDevWorkbench = !collapsed && Boolean(devWorkbenchAccess?.enabled);

  useEffect(() => {
    const handleAvatarUpdate = () => {
      mutateAvatar();
    };

    window.addEventListener("avatarUpdated", handleAvatarUpdate as EventListener);

    return () => {
      window.removeEventListener("avatarUpdated", handleAvatarUpdate as EventListener);
    };
  }, [mutateAvatar]);

  const sections = useMemo(() => {
    const groupedItems = navItems.reduce(
      (acc, item) => {
        const section = item.section || "Geral";

        if (!acc[section]) {
          acc[section] = [];
        }
        acc[section].push(item);

        return acc;
      },
      {} as Record<string, SidebarNavItem[]>,
    );

    const groupedSecondaryItems = secondaryItems.reduce(
      (acc, item) => {
        const section = item.section || "Administração";

        if (!acc[section]) {
          acc[section] = [];
        }
        acc[section].push(item);

        return acc;
      },
      {} as Record<string, SidebarNavItem[]>,
    );

    const orderedSections: Array<{ title: string; items: SidebarNavItem[] }> = [];
    const sectionOrder = [
      "Visão Geral",
      "Gestão de Pessoas",
      "Atividades Jurídicas",
      "Operacional",
      "Administração",
    ];

    sectionOrder.forEach((sectionTitle) => {
      if (groupedItems[sectionTitle]?.length > 0) {
        orderedSections.push({
          title: sectionTitle,
          items: groupedItems[sectionTitle],
        });
      }
    });

    Object.entries(groupedItems).forEach(([sectionTitle, items]) => {
      if (!sectionOrder.includes(sectionTitle) && items.length > 0) {
        orderedSections.push({ title: sectionTitle, items });
      }
    });

    Object.entries(groupedSecondaryItems).forEach(([sectionTitle, items]) => {
      if (items.length === 0) {
        return;
      }

      const existingSectionIndex = orderedSections.findIndex(
        (section) => section.title === sectionTitle,
      );

      if (existingSectionIndex >= 0) {
        orderedSections[existingSectionIndex].items.push(...items);
        return;
      }

      orderedSections.push({ title: sectionTitle, items });
    });

    return orderedSections;
  }, [navItems, secondaryItems]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div
        className={clsx(
          "flex-1 space-y-3 overflow-y-auto px-2 pb-4",
          isDesktop ? "pt-4" : null,
        )}
      >
        <div
          className={clsx(
            "mx-1",
            collapsed
              ? "flex items-center justify-center px-1 pb-2"
              : "px-3 pb-2",
          )}
        >
          <div
            className={clsx(
              "flex w-full",
              collapsed
                ? "items-center justify-center"
                : "flex-col items-center justify-center gap-2 text-center",
            )}
          >
            <Avatar
              className={clsx(
                "shrink-0 border-2 border-primary/25 text-sm",
                collapsed ? "h-12 w-12" : "h-16 w-16",
              )}
              color="primary"
              name={userName}
              showFallback
              size={collapsed ? "lg" : "md"}
              src={userAvatar}
            />

            {!collapsed ? (
              <div className="w-full max-w-full px-2" title={userName}>
                <p className="overflow-hidden text-center text-sm font-semibold leading-tight text-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] break-words">
                  {sidebarUserName}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {sections.map((section, index) => (
          <div key={section.title} className="space-y-1.5">
            {/* Separador visual entre seções (exceto a primeira) */}
            {index > 0 && !collapsed && (
              <div className="mx-2 my-1.5 border-t border-default-200/50" />
            )}

            <SidebarSectionLabel collapsed={collapsed}>
              {section.title}
            </SidebarSectionLabel>

            {collapsed ? (
              // Versão colapsada - sem accordion
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
                  const icon = navIconMap[item.label] ?? <DashboardIcon />;

                  return (
                    <li key={item.href}>
                      <AppNavLink
                        className={
                          isActive
                            ? "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition justify-center bg-primary/25 text-primary"
                            : "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition justify-center text-default-400 hover:bg-default-100 hover:text-default-900"
                        }
                        href={item.href}
                        prefetchStrategy={item.prefetchStrategy}
                        onClick={() => {
                          if (!isDesktop && onCloseMobile) {
                            onCloseMobile();
                          }
                        }}
                      >
                        <span className="shrink-0 text-base">{icon}</span>
                      </AppNavLink>
                    </li>
                  );
                })}
              </ul>
            ) : (
              // Versão expandida - com accordion
              <ul className="space-y-1">
                {section.items.map((item) => {
                  // Para itens com accordion, nunca considerar o pai como ativo - FIXED v2
                  const isActive = item.isAccordion
                    ? false
                    : pathname === item.href ||
                      pathname.startsWith(`${item.href}/`);
                  const icon = navIconMap[item.label] ?? <DashboardIcon />;

                  if (item.isAccordion && item.children) {
                    return (
                      <AccordionNavItem
                        key={item.href}
                        icon={icon}
                        isDesktop={isDesktop}
                        item={item}
                        onCloseMobile={onCloseMobile}
                      />
                    );
                  }

                  // Item normal sem accordion
                  return (
                    <li key={item.href}>
                      <AppNavLink
                        className={
                          isActive
                            ? "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition bg-primary/25 text-primary"
                            : "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition text-default-400 hover:bg-default-100 hover:text-default-900"
                        }
                        href={item.href}
                        prefetchStrategy={item.prefetchStrategy}
                        onClick={() => {
                          if (!isDesktop && onCloseMobile) {
                            onCloseMobile();
                          }
                        }}
                      >
                        <span className="shrink-0 text-base">{icon}</span>
                        <span className="truncate">{item.label}</span>
                      </AppNavLink>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}


      </div>
      {isDesktop ? (
        <div className="border-t border-default-200 p-3 space-y-2">
          {showDevWorkbench ? (
            <DevInfo
              mode="inline"
              buttonClassName="w-full justify-start px-3 py-2 h-auto border border-default-200 bg-default-100/60 text-default-700 hover:bg-default-100 hover:text-default-900 shadow-none"
              buttonContainerClassName="w-full"
              showStatusTrigger={isSuperAdmin}
              statusButtonClassName="w-full justify-between px-3 py-2 h-auto"
            />
          ) : null}
          <Tooltip content="Ajuda" placement="right">
            <Button
              as={AppNavLink}
              className="group h-10 min-w-10 w-10 self-start rounded-xl border border-warning/30 bg-warning/10 px-0 text-warning shadow-none transition-all duration-200 hover:bg-warning/20"
              color="default"
              href="/suporte"
              isIconOnly
              prefetchStrategy="none"
              radius="lg"
              variant="flat"
            >
              <HelpIcon size={16} />
              <span className="sr-only">Abrir chamado</span>
            </Button>
          </Tooltip>
          <Button
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            className={clsx(
              "group w-full border shadow-none transition-all duration-200",
              collapsed
                ? "h-10 min-w-10 rounded-xl border-primary/30 bg-primary/10 px-0 text-primary hover:bg-primary/20"
                : "h-10 justify-start rounded-xl border-primary/25 bg-primary/10 px-3 text-primary hover:bg-primary/15",
            )}
            color="default"
            isIconOnly={collapsed}
            radius="lg"
            variant="flat"
            onPress={onToggleCollapse}
          >
            <SidebarToggleIcon collapsed={collapsed} />
            <span className="sr-only">
              {collapsed ? "Expandir menu" : "Recolher menu"}
            </span>
            {!collapsed ? (
              <span className="ml-2 text-sm font-medium tracking-tight">
                {collapsed ? "Expandir menu" : "Recolher menu"}
              </span>
            ) : null}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function AppSidebar({
  tenantName,
  tenantLogoUrl,
  collapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
  navItems,
  secondaryItems,
}: SidebarProps) {
  return (
    <>
      <aside
        className={clsx(
          "hidden h-screen flex-col border-r border-divider bg-background/80 backdrop-blur-xl transition-all duration-300 md:flex",
          collapsed ? "md:w-[84px]" : "md:w-64",
        )}
      >
        <SidebarContent
          isDesktop
          collapsed={collapsed}
          navItems={navItems}
          secondaryItems={secondaryItems}
          tenantLogoUrl={tenantLogoUrl}
          tenantName={tenantName}
          onCloseMobile={onCloseMobile}
          onToggleCollapse={onToggleCollapse}
        />
      </aside>

      <Drawer
        isOpen={isMobileOpen}
        placement="left"
        size="sm"
        onOpenChange={(open) => {
          if (!open) {
            onCloseMobile();
          }
        }}
      >
        <DrawerContent className="bg-background/95 text-white">
          {(onClose) => (
            <>
              <DrawerHeader className="border-b border-default-200/70 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  {tenantLogoUrl ? (
                    <span className="flex h-10 w-16 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 p-1">
                      <Image
                        unoptimized
                        alt={`Logo ${tenantName}`}
                        className="h-full w-full object-contain"
                        height={40}
                        src={tenantLogoUrl}
                        width={64}
                      />
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-lg bg-primary/15 p-2 text-primary">
                      <Logo className="h-5 w-5" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
                      {tenantName}
                    </p>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-default-400">
                      Menu Principal
                    </p>
                  </div>
                </div>
              </DrawerHeader>
              <DrawerBody className="p-0">
                <div className="border-b border-default-200 px-4 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-default-400">
                      Notificações
                    </span>
                    <NotificationCenter />
                  </div>
                </div>
                <SidebarContent
                  collapsed={false}
                  isDesktop={false}
                  navItems={navItems}
                  secondaryItems={secondaryItems}
                  tenantLogoUrl={tenantLogoUrl}
                  tenantName={tenantName}
                  onCloseMobile={() => {
                    onCloseMobile();
                    onClose();
                  }}
                  onToggleCollapse={onToggleCollapse}
                />
              </DrawerBody>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
}
