import { redirect } from "next/navigation";

import DadosBancariosContent from "./dados-bancarios-content";

import { getSession } from "@/app/lib/auth";
import { checkPermission } from "@/app/actions/equipe";
import { UserRole } from "@/generated/prisma";

export default async function FinanceiroDadosBancariosPage() {
  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  const role = String((session.user as any)?.role || "");

  if (role === "SUPER_ADMIN") {
    redirect("/admin/dashboard");
  }

  if (role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN) {
    return <DadosBancariosContent />;
  }

  try {
    const hasPermission = await checkPermission("financeiro", "visualizar");

    if (!hasPermission) {
      redirect("/dashboard");
    }
  } catch (error) {
    console.error(
      "Erro ao verificar permissões para /financeiro/dados-bancarios:",
      error,
    );
    redirect("/dashboard");
  }

  return <DadosBancariosContent />;
}
