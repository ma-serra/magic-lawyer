import { redirect } from "next/navigation";

import { ProcuracoesContent } from "./procuracoes-content";

import { getSession } from "@/app/lib/auth";
import { checkPermission } from "@/app/actions/equipe";
import { UserRole } from "@/generated/prisma";

export default async function ProcuracoesPage() {
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
    return <ProcuracoesContent />;
  }

  // Para outros roles, verificar permissão procurarções.visualizar
  try {
    const hasPermission = await checkPermission("procuracoes", "visualizar");

    if (!hasPermission) {
      redirect("/dashboard");
    }

    return <ProcuracoesContent />;
  } catch (error) {
    console.error("Erro ao verificar permissões para /procuracoes:", error);
    redirect("/dashboard");
  }
}
