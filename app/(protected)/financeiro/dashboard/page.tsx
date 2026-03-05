import { Metadata } from "next";
import { redirect } from "next/navigation";

import FinanceiroContent from "../financeiro-content";

import { getSession } from "@/app/lib/auth";
import { checkPermission } from "@/app/actions/equipe";
import { UserRole } from "@/generated/prisma";

export const metadata: Metadata = {
  title: "Financeiro Dashboard",
  description:
    "Cockpit financeiro do escritório com visão por processo, cliente e profissional.",
};

export default async function FinanceiroDashboardPage() {
  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user as any;

  if (user.role === "SUPER_ADMIN") {
    redirect("/admin/dashboard");
  }

  if (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) {
    return (
      <FinanceiroContent
        userName={user.name}
        userRole={String(user.role || "ADMIN")}
      />
    );
  }

  try {
    const hasPermission = await checkPermission("financeiro", "visualizar");

    if (!hasPermission) {
      redirect("/dashboard");
    }

    return (
      <FinanceiroContent
        userName={user.name}
        userRole={String(user.role || "OPERACIONAL")}
      />
    );
  } catch (error) {
    console.error(
      "Erro ao verificar permissões para /financeiro/dashboard:",
      error,
    );
    redirect("/dashboard");
  }
}

