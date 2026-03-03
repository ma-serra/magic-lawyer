import { Metadata } from "next";
import { redirect } from "next/navigation";

import ContratosContent from "./contratos-content";

import { getSession } from "@/app/lib/auth";
import { checkPermission } from "@/app/actions/equipe";
import { UserRole } from "@/generated/prisma";

export const metadata: Metadata = {
  title: "Contratos",
  description: "Gestão completa de contratos e modelos jurídicos.",
};

export default async function ContratosPage() {
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
    return <ContratosContent />;
  }

  // Para outros roles, verificar permissão contratos.visualizar
  try {
    const hasPermission = await checkPermission("contratos", "visualizar");

    if (!hasPermission) {
      redirect("/dashboard");
    }

    return <ContratosContent />;
  } catch (error) {
    console.error("Erro ao verificar permissões para /contratos:", error);
    redirect("/dashboard");
  }
}
