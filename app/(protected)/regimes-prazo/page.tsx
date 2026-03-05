import { Metadata } from "next";
import { redirect } from "next/navigation";

import { RegimesPrazoContent } from "./regimes-prazo-content";

import { getSession } from "@/app/lib/auth";
import { checkPermission } from "@/app/actions/equipe";
import { UserRole } from "@/generated/prisma";

export const metadata: Metadata = {
  title: "Regimes de Prazo",
  description: "Configuração de regimes de contagem de prazos processuais.",
};

export default async function RegimesPrazoPage() {
  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user as any;

  // SuperAdmin vai para dashboard admin
  if (user.role === "SUPER_ADMIN") {
    redirect("/admin/dashboard");
  }

  // Cliente não tem acesso
  if (user.role === "CLIENTE") {
    redirect("/dashboard");
  }

  // Admin sempre tem acesso
  if (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) {
    return <RegimesPrazoContent />;
  }

  // Para outros roles, verificar permissão equipe.editar
  // (regimes de prazo são configurações, similar a canManageOfficeSettings)
  try {
    const hasPermission = await checkPermission("equipe", "editar");

    if (!hasPermission) {
      redirect("/dashboard");
    }

    return <RegimesPrazoContent />;
  } catch {
    redirect("/dashboard");
  }
}
