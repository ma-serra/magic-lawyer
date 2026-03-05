import { redirect } from "next/navigation";
import AgendaContent from "./agenda-content";

import { getSession } from "@/app/lib/auth";
import { checkPermission } from "@/app/actions/equipe";
import { UserRole } from "@/generated/prisma";

export default async function AgendaPage() {
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
    return <AgendaContent />;
  }

  // Para outros roles, verificar permissão agenda.visualizar
  // A permissão agenda.visualizar é necessária para acessar /agenda
  try {
    const hasPermission = await checkPermission("agenda", "visualizar");

    if (!hasPermission) {
      redirect("/dashboard");
    }

    return <AgendaContent />;
  } catch (error) {
    // Se houver erro ao verificar permissões, redirecionar
    console.error("Erro ao verificar permissões para /agenda:", error);
    redirect("/dashboard");
  }
}
