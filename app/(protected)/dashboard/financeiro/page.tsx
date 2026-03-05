import { redirect } from "next/navigation";

import { getSession } from "@/app/lib/auth";
import { checkPermission } from "@/app/actions/equipe";
import { UserRole } from "@/generated/prisma";

export default async function DashboardFinanceiroPage() {
  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user as any;

  // SuperAdmin vai para dashboard admin
  if (user.role === "SUPER_ADMIN") {
    redirect("/admin/dashboard");
  }

  // Admin sempre tem acesso
  if (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) {
    redirect("/financeiro/dashboard");
  }

  // Para outros roles, verificar permissão financeiro.visualizar
  try {
    const hasPermission = await checkPermission("financeiro", "visualizar");

    if (!hasPermission) {
      redirect("/dashboard");
    }

    redirect("/financeiro/dashboard");
  } catch (error) {
    console.error(
      "Erro ao verificar permissões para /dashboard/financeiro:",
      error,
    );
    redirect("/dashboard");
  }
}
