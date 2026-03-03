import { Metadata } from "next";
import { redirect } from "next/navigation";

import ModelosContratoContent from "./modelos-contrato-content";

import { getSession } from "@/app/lib/auth";
import { checkPermission } from "@/app/actions/equipe";
import { UserRole } from "@/generated/prisma";

export const metadata: Metadata = {
  title: "Modelos de Contratos",
  description: "Biblioteca de modelos de contratos reutilizáveis.",
};

export default async function ModelosContratoPage() {
  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user as any;

  if (user.role === "SUPER_ADMIN") {
    redirect("/admin/dashboard");
  }

  if (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) {
    return <ModelosContratoContent />;
  }

  try {
    const hasPermission = await checkPermission("contratos", "visualizar");

    if (!hasPermission) {
      redirect("/dashboard");
    }

    return <ModelosContratoContent />;
  } catch (error) {
    console.error("Erro ao verificar permissões para /contratos/modelos:", error);

    redirect("/dashboard");
  }
}
