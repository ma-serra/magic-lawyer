"use client";

import { useSession } from "next-auth/react";
import { useMemo } from "react";

import { usePermissionsCheck } from "./use-permission-check";

export type UserRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "ADVOGADO"
  | "SECRETARIA"
  | "FINANCEIRO"
  | "CLIENTE";

export interface UserPermissions {
  canViewAllProcesses: boolean;
  canViewAllClients: boolean;
  canViewAllEvents: boolean;
  canViewClientEvents: boolean; // Nova permissão para clientes verem eventos dos seus processos
  canViewFinancialData: boolean;
  canManageTeam: boolean;
  canManageOfficeSettings: boolean;
  canCreateEvents: boolean;
  canEditAllEvents: boolean;
  canViewReports: boolean;
  canManageContracts: boolean;
  canViewAllDocuments: boolean;
  canManageUsers: boolean;
  canViewJudgesDatabase: boolean;
  canManageJudgesDatabase: boolean;
  canCreateJudgeProfiles: boolean;
  canEditJudgeProfiles: boolean;
  canDeleteJudgeProfiles: boolean;
  canViewPremiumJudges: boolean;
}

/**
 * Mapeamento de permissões antigas para novo formato (módulo + ação)
 *
 * Nota: Alguns módulos podem não estar no rolePermissions padrão (ex: agenda, juizes, documentos).
 * Nesses casos, a verificação retornará false se não houver override/cargo configurado.
 */
const PERMISSION_MAP: Record<
  keyof UserPermissions,
  { modulo: string; acao: string } | null
> = {
  // Mapeamentos diretos para módulos do sistema padrão
  canViewAllProcesses: { modulo: "processos", acao: "visualizar" },
  canViewAllClients: { modulo: "clientes", acao: "visualizar" },
  canViewFinancialData: { modulo: "financeiro", acao: "visualizar" },
  canManageTeam: { modulo: "equipe", acao: "visualizar" },
  canViewReports: { modulo: "relatorios", acao: "visualizar" },
  canManageContracts: { modulo: "contratos", acao: "criar" }, // Criar/editar contratos

  // Agenda - usar módulo agenda específico
  canViewAllEvents: { modulo: "agenda", acao: "visualizar" },
  canViewClientEvents: { modulo: "agenda", acao: "visualizar" },
  canCreateEvents: { modulo: "agenda", acao: "criar" },
  canEditAllEvents: { modulo: "agenda", acao: "editar" },

  // Configurações - pode não estar no sistema padrão
  canManageOfficeSettings: { modulo: "equipe", acao: "editar" }, // Usar equipe.editar como proxy

  // Documentos - pode não estar no sistema padrão
  canViewAllDocuments: { modulo: "processos", acao: "visualizar" }, // Proxied para processos

  // Equipe/Usuários
  canManageUsers: { modulo: "equipe", acao: "editar" },

  // Juízes - usando advogados como proxy (similar estrutura)
  canViewJudgesDatabase: { modulo: "advogados", acao: "visualizar" },
  canManageJudgesDatabase: { modulo: "advogados", acao: "editar" }, // Proxy para advogados.editar
  canCreateJudgeProfiles: { modulo: "advogados", acao: "criar" }, // Proxy para advogados.criar
  canEditJudgeProfiles: { modulo: "advogados", acao: "editar" },
  canDeleteJudgeProfiles: { modulo: "advogados", acao: "excluir" }, // Proxy se houver excluir
  canViewPremiumJudges: { modulo: "advogados", acao: "visualizar" }, // Controle de negócio, mas usar como proxy
};

/**
 * Hook para verificar permissões do usuário
 *
 * **Migrado para usar o novo sistema de permissões:**
 * - Usa `usePermissionsCheck` internamente
 * - Respeita override → cargo → role padrão
 * - Mantém interface antiga para compatibilidade
 *
 * SUPER_ADMIN e ADMIN têm acesso total (bypass do sistema de permissões)
 */
export function useUserPermissions() {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role as UserRole | undefined;
  const isSuperAdmin = userRole === "SUPER_ADMIN";
  const isAdmin = userRole === "ADMIN";

  // Preparar lista de permissões para verificar (apenas se não for SUPER_ADMIN/ADMIN)
  const permissionChecks = useMemo(() => {
    // SUPER_ADMIN e ADMIN têm acesso total, não precisam verificar
    if (isSuperAdmin || isAdmin) {
      return [];
    }

    // Criar lista de verificações para todos os módulos/ações
    const checks: Array<{ modulo: string; acao: string }> = [];
    const seen = new Set<string>();

    Object.values(PERMISSION_MAP).forEach((mapping) => {
      // Ignorar mapeamentos null (não têm correspondência no novo sistema)
      if (!mapping) return;

      const { modulo, acao } = mapping;
      const key = `${modulo}.${acao}`;

      if (!seen.has(key)) {
        seen.add(key);
        checks.push({ modulo, acao });
      }
    });

    return checks;
  }, [isSuperAdmin, isAdmin]);

  // Verificar permissões usando o novo sistema (apenas se não for SUPER_ADMIN/ADMIN)
  const { permissions: newPermissions, isLoading } = usePermissionsCheck(
    permissionChecks,
    {
      enabled: !isSuperAdmin && !isAdmin, // Desabilitar se for SUPER_ADMIN/ADMIN
      enableEarlyAccess: true, // Retornar false até carregar
    },
  );

  // Construir objeto de permissões compatível com interface antiga
  const permissions = useMemo<UserPermissions>(() => {
    // SUPER_ADMIN tem acesso total
    if (isSuperAdmin) {
      return {
        canViewAllProcesses: true,
        canViewAllClients: true,
        canViewAllEvents: true,
        canViewClientEvents: true,
        canViewFinancialData: true,
        canManageTeam: true,
        canManageOfficeSettings: true,
        canCreateEvents: true,
        canEditAllEvents: true,
        canViewReports: true,
        canManageContracts: true,
        canViewAllDocuments: true,
        canManageUsers: true,
        canViewJudgesDatabase: true,
        canManageJudgesDatabase: true,
        canCreateJudgeProfiles: true,
        canEditJudgeProfiles: true,
        canDeleteJudgeProfiles: true,
        canViewPremiumJudges: true,
      };
    }

    // ADMIN (Escritório) - Acesso total ao escritório
    if (isAdmin) {
      return {
        canViewAllProcesses: true,
        canViewAllClients: true,
        canViewAllEvents: true,
        canViewClientEvents: true,
        canViewFinancialData: true,
        canManageTeam: true,
        canManageOfficeSettings: true,
        canCreateEvents: true,
        canEditAllEvents: true,
        canViewReports: true,
        canManageContracts: true,
        canViewAllDocuments: true,
        canManageUsers: true,
        canViewJudgesDatabase: true,
        canManageJudgesDatabase: true,
        canCreateJudgeProfiles: true,
        canEditJudgeProfiles: true,
        canDeleteJudgeProfiles: true,
        canViewPremiumJudges: true,
      };
    }

    // Para outros roles, usar o novo sistema de permissões
    // Mapear resultados do novo sistema para interface antiga
    const mappedPermissions: UserPermissions = {
      canViewAllProcesses:
        (PERMISSION_MAP.canViewAllProcesses &&
          newPermissions[
            `${PERMISSION_MAP.canViewAllProcesses.modulo}.${PERMISSION_MAP.canViewAllProcesses.acao}`
          ]) ??
        false,
      canViewAllClients:
        (PERMISSION_MAP.canViewAllClients &&
          newPermissions[
            `${PERMISSION_MAP.canViewAllClients.modulo}.${PERMISSION_MAP.canViewAllClients.acao}`
          ]) ??
        false,
      canViewAllEvents:
        (PERMISSION_MAP.canViewAllEvents &&
          newPermissions[
            `${PERMISSION_MAP.canViewAllEvents.modulo}.${PERMISSION_MAP.canViewAllEvents.acao}`
          ]) ??
        false,
      canViewClientEvents:
        (PERMISSION_MAP.canViewClientEvents &&
          newPermissions[
            `${PERMISSION_MAP.canViewClientEvents.modulo}.${PERMISSION_MAP.canViewClientEvents.acao}`
          ]) ??
        false,
      canViewFinancialData:
        (PERMISSION_MAP.canViewFinancialData &&
          newPermissions[
            `${PERMISSION_MAP.canViewFinancialData.modulo}.${PERMISSION_MAP.canViewFinancialData.acao}`
          ]) ??
        false,
      canManageTeam:
        (PERMISSION_MAP.canManageTeam &&
          newPermissions[
            `${PERMISSION_MAP.canManageTeam.modulo}.${PERMISSION_MAP.canManageTeam.acao}`
          ]) ??
        false,
      canManageOfficeSettings:
        (PERMISSION_MAP.canManageOfficeSettings &&
          newPermissions[
            `${PERMISSION_MAP.canManageOfficeSettings.modulo}.${PERMISSION_MAP.canManageOfficeSettings.acao}`
          ]) ??
        false,
      canCreateEvents:
        (PERMISSION_MAP.canCreateEvents &&
          newPermissions[
            `${PERMISSION_MAP.canCreateEvents.modulo}.${PERMISSION_MAP.canCreateEvents.acao}`
          ]) ??
        false,
      canEditAllEvents:
        (PERMISSION_MAP.canEditAllEvents &&
          newPermissions[
            `${PERMISSION_MAP.canEditAllEvents.modulo}.${PERMISSION_MAP.canEditAllEvents.acao}`
          ]) ??
        false,
      canViewReports:
        (PERMISSION_MAP.canViewReports &&
          newPermissions[
            `${PERMISSION_MAP.canViewReports.modulo}.${PERMISSION_MAP.canViewReports.acao}`
          ]) ??
        false,
      canManageContracts:
        (PERMISSION_MAP.canManageContracts &&
          newPermissions[
            `${PERMISSION_MAP.canManageContracts.modulo}.${PERMISSION_MAP.canManageContracts.acao}`
          ]) ??
        false,
      canViewAllDocuments:
        (PERMISSION_MAP.canViewAllDocuments &&
          newPermissions[
            `${PERMISSION_MAP.canViewAllDocuments.modulo}.${PERMISSION_MAP.canViewAllDocuments.acao}`
          ]) ??
        false,
      canManageUsers:
        (PERMISSION_MAP.canManageUsers &&
          newPermissions[
            `${PERMISSION_MAP.canManageUsers.modulo}.${PERMISSION_MAP.canManageUsers.acao}`
          ]) ??
        false,
      // Permissões de juízes - usando proxies
      canViewJudgesDatabase:
        (PERMISSION_MAP.canViewJudgesDatabase &&
          newPermissions[
            `${PERMISSION_MAP.canViewJudgesDatabase.modulo}.${PERMISSION_MAP.canViewJudgesDatabase.acao}`
          ]) ??
        false,
      canManageJudgesDatabase:
        (PERMISSION_MAP.canManageJudgesDatabase &&
          newPermissions[
            `${PERMISSION_MAP.canManageJudgesDatabase.modulo}.${PERMISSION_MAP.canManageJudgesDatabase.acao}`
          ]) ??
        false,
      canCreateJudgeProfiles:
        (PERMISSION_MAP.canCreateJudgeProfiles &&
          newPermissions[
            `${PERMISSION_MAP.canCreateJudgeProfiles.modulo}.${PERMISSION_MAP.canCreateJudgeProfiles.acao}`
          ]) ??
        false,
      canEditJudgeProfiles:
        (PERMISSION_MAP.canEditJudgeProfiles &&
          newPermissions[
            `${PERMISSION_MAP.canEditJudgeProfiles.modulo}.${PERMISSION_MAP.canEditJudgeProfiles.acao}`
          ]) ??
        false,
      canDeleteJudgeProfiles:
        (PERMISSION_MAP.canDeleteJudgeProfiles &&
          newPermissions[
            `${PERMISSION_MAP.canDeleteJudgeProfiles.modulo}.${PERMISSION_MAP.canDeleteJudgeProfiles.acao}`
          ]) ??
        false,
      canViewPremiumJudges:
        (PERMISSION_MAP.canViewPremiumJudges &&
          newPermissions[
            `${PERMISSION_MAP.canViewPremiumJudges.modulo}.${PERMISSION_MAP.canViewPremiumJudges.acao}`
          ]) ??
        false,
    };

    return mappedPermissions;
  }, [isSuperAdmin, isAdmin, newPermissions]);

  const hasPermission = (permission: keyof UserPermissions) => {
    return permissions[permission];
  };

  const hasAnyPermission = (permissionsList: (keyof UserPermissions)[]) => {
    return permissionsList.some((permission) => permissions[permission]);
  };

  const hasAllPermissions = (permissionsList: (keyof UserPermissions)[]) => {
    return permissionsList.every((permission) => permissions[permission]);
  };

  return {
    userRole,
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    isSuperAdmin,
    isAdmin,
    isAdvogado: userRole === "ADVOGADO",
    isSecretaria: userRole === "SECRETARIA",
    isFinanceiro: userRole === "FINANCEIRO",
    isCliente: userRole === "CLIENTE",
    // Expor estado de loading para componentes que precisam
    isLoadingPermissions: isLoading,
  };
}
