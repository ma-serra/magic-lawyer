import { redirect } from "next/navigation";

import { getSession } from "@/app/lib/auth";
import { checkPermission } from "@/app/actions/equipe";
import { UserRole } from "@/generated/prisma";

import { OperacoesJuridicasContent } from "./operacoes-juridicas-content";

export const metadata = {
  title: "Operações Jurídicas",
  description:
    "Central de publicações, intimações, discovery processual e protocolos do escritório.",
};

export default async function OperacoesJuridicasPage() {
  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  const role = (session.user as any)?.role as UserRole | undefined;

  if (
    role === UserRole.CLIENTE ||
    role === UserRole.FINANCEIRO ||
    role === UserRole.SUPER_ADMIN
  ) {
    redirect("/dashboard");
  }

  if (role === UserRole.ADMIN || role === UserRole.ADVOGADO) {
    return <OperacoesJuridicasContent />;
  }

  try {
    const canView = await checkPermission("processos", "visualizar");

    if (!canView) {
      redirect("/dashboard");
    }

    return <OperacoesJuridicasContent />;
  } catch {
    redirect("/dashboard");
  }
}
