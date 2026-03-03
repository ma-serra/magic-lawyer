import { UserRole } from "@/generated/prisma";

export type RolePermissionMatrix = Record<UserRole, Record<string, string[]>>;

const ROLE_BASE_PERMISSIONS: RolePermissionMatrix = {
  [UserRole.ADMIN]: {
    processos: ["criar", "editar", "excluir", "visualizar", "exportar"],
    clientes: ["criar", "editar", "excluir", "visualizar", "exportar"],
    advogados: ["criar", "editar", "excluir", "visualizar", "exportar"],
    documentos: ["criar", "editar", "excluir", "visualizar", "exportar"],
    procuracoes: ["criar", "editar", "excluir", "visualizar", "exportar"],
    financeiro: ["criar", "editar", "excluir", "visualizar", "exportar"],
    contratos: ["criar", "editar", "excluir", "visualizar", "exportar"],
    equipe: ["criar", "editar", "excluir", "visualizar", "exportar"],
    relatorios: ["criar", "editar", "excluir", "visualizar", "exportar"],
    "portal-advogado": ["visualizar"],
  },
  [UserRole.FINANCEIRO]: {
    processos: ["visualizar"],
    clientes: ["visualizar"],
    advogados: ["visualizar"],
    documentos: ["visualizar"],
    financeiro: ["criar", "editar", "excluir", "visualizar", "exportar"],
    contratos: ["criar", "editar", "excluir", "visualizar", "exportar"],
    equipe: ["visualizar"],
    relatorios: ["visualizar", "exportar"],
  },
  [UserRole.SUPER_ADMIN]: {
    processos: ["criar", "editar", "excluir", "visualizar", "exportar"],
    clientes: ["criar", "editar", "excluir", "visualizar", "exportar"],
    advogados: ["criar", "editar", "excluir", "visualizar", "exportar"],
    documentos: ["criar", "editar", "excluir", "visualizar", "exportar"],
    procuracoes: ["criar", "editar", "excluir", "visualizar", "exportar"],
    financeiro: ["criar", "editar", "excluir", "visualizar", "exportar"],
    contratos: ["criar", "editar", "excluir", "visualizar", "exportar"],
    equipe: ["criar", "editar", "excluir", "visualizar", "exportar"],
    relatorios: ["criar", "editar", "excluir", "visualizar", "exportar"],
    "portal-advogado": ["visualizar"],
  },
  [UserRole.ADVOGADO]: {
    processos: ["criar", "editar", "visualizar", "exportar"],
    clientes: ["criar", "editar", "visualizar", "exportar"],
    advogados: ["visualizar"],
    documentos: ["criar", "editar", "visualizar", "exportar"],
    procuracoes: ["criar", "editar", "excluir", "visualizar", "exportar"],
    financeiro: ["visualizar"],
    contratos: ["criar", "editar", "visualizar", "exportar"],
    equipe: ["visualizar"],
    relatorios: ["visualizar", "exportar"],
    "portal-advogado": ["visualizar"],
  },
  [UserRole.SECRETARIA]: {
    processos: ["criar", "editar", "visualizar", "exportar"],
    clientes: ["criar", "editar", "visualizar", "exportar"],
    advogados: ["visualizar"],
    documentos: ["criar", "editar", "visualizar", "exportar"],
    procuracoes: ["criar", "editar", "excluir", "visualizar", "exportar"],
    financeiro: ["visualizar"],
    contratos: ["criar", "editar", "visualizar", "exportar"],
    equipe: ["visualizar"],
    relatorios: ["visualizar", "exportar"],
  },
  [UserRole.CLIENTE]: {
    processos: ["visualizar"],
    clientes: ["visualizar"],
    advogados: ["visualizar"],
    documentos: ["visualizar"],
    procuracoes: ["visualizar"],
    financeiro: ["visualizar"],
    contratos: ["visualizar"],
    equipe: [],
    relatorios: ["visualizar"],
  },
};

const AUTO_VIEW_ROLES = new Set<UserRole>([
  UserRole.ADVOGADO,
  UserRole.SECRETARIA,
  UserRole.FINANCEIRO,
]);

const AUTO_VIEW_BLOCKLIST: Partial<Record<UserRole, Set<string>>> = {};

export function getRoleBasePermissions(
  role: UserRole,
): Record<string, string[]> {
  return ROLE_BASE_PERMISSIONS[role] ?? {};
}

function isAutoViewBlocked(role: UserRole, modulo: string): boolean {
  const blocklist = AUTO_VIEW_BLOCKLIST[role];

  if (!blocklist) {
    return false;
  }

  return blocklist.has(modulo);
}

export function resolveRolePermission(
  role: UserRole,
  modulo: string,
  acao: string,
): boolean {
  if (role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN) {
    return true;
  }

  const basePermissions = getRoleBasePermissions(role);

  if (basePermissions[modulo]?.includes(acao)) {
    return true;
  }

  if (acao === "visualizar" && AUTO_VIEW_ROLES.has(role)) {
    return !isAutoViewBlocked(role, modulo);
  }

  return false;
}
