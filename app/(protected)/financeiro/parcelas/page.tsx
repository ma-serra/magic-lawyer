import { redirect } from "next/navigation";

import ParcelasContent from "@/app/(protected)/parcelas/parcelas-content";
import { getSession } from "@/app/lib/auth";
import { checkPermission } from "@/app/actions/equipe";
import { UserRole } from "@/generated/prisma";

export default async function FinanceiroParcelasPage() {
  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user as any;

  if (user.role === "SUPER_ADMIN") {
    redirect("/admin/dashboard");
  }

  if (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) {
    return <ParcelasContent />;
  }

  try {
    const hasPermission = await checkPermission("financeiro", "visualizar");

    if (!hasPermission) {
      redirect("/dashboard");
    }

    return <ParcelasContent />;
  } catch (error) {
    console.error(
      "Erro ao verificar permissões para /financeiro/parcelas:",
      error,
    );
    redirect("/dashboard");
  }
}

