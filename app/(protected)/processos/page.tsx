import { Metadata } from "next";
import { redirect } from "next/navigation";

import { ProcessosContent } from "./processos-content";

import { getSession } from "@/app/lib/auth";
import { checkPermission } from "@/app/actions/equipe";
import { isJusbrasilIntegrationEnabledForTenant } from "@/app/lib/juridical/jusbrasil-oab-sync";
import { UserRole } from "@/generated/prisma";

export const metadata: Metadata = {
  title: "Processos",
  description: "Gestão centralizada de processos, audiências e diligências.",
};

export default async function ProcessosPage() {
  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user as any;
  const tenantId = typeof user.tenantId === "string" ? user.tenantId : null;

  // SuperAdmin vai para dashboard admin
  if (user.role === "SUPER_ADMIN") {
    redirect("/admin/dashboard");
  }

  // Admin sempre tem acesso
  if (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) {
    const canSyncOab = tenantId
      ? await isJusbrasilIntegrationEnabledForTenant(tenantId)
      : false;

    return <ProcessosContent canCreateProcesso canSyncOab={canSyncOab} />;
  }

  // Para outros roles, verificar permissão processos.visualizar
  try {
    const hasPermission = await checkPermission("processos", "visualizar");

    if (!hasPermission) {
      redirect("/dashboard");
    }

    const [canCreateProcesso, canEditProcesso, jusbrasilEnabled] = await Promise.all([
      checkPermission("processos", "criar"),
      checkPermission("processos", "editar"),
      tenantId
        ? isJusbrasilIntegrationEnabledForTenant(tenantId)
        : Promise.resolve(false),
    ]);

    return (
      <ProcessosContent
        canCreateProcesso={canCreateProcesso}
        canSyncOab={canEditProcesso && jusbrasilEnabled}
      />
    );
  } catch (error) {
    console.error("Erro ao verificar permissões para /processos:", error);
    redirect("/dashboard");
  }
}
