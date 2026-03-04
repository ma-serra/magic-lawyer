import { Metadata } from "next";
import { redirect } from "next/navigation";

import { InpiContent } from "./inpi-content";

import { checkPermission } from "@/app/actions/equipe";
import { getSession } from "@/app/lib/auth";
import { UserRole } from "@/generated/prisma";

export const metadata: Metadata = {
  title: "INPI",
  description:
    "Dossiês de viabilidade de marca com análise de colisão e operação multi-tenant.",
};

export const dynamic = "force-dynamic";

export default async function InpiPage() {
  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user as {
    role: UserRole;
  };

  if (user.role === UserRole.SUPER_ADMIN) {
    redirect("/admin/dashboard");
  }

  if (user.role === UserRole.CLIENTE) {
    redirect("/dashboard");
  }

  if (user.role === UserRole.ADMIN) {
    return <InpiContent canSyncCatalog />;
  }

  try {
    const canRead = await checkPermission("causas", "visualizar");

    if (!canRead) {
      redirect("/dashboard");
    }

    const canWrite = await checkPermission("causas", "editar");

    return <InpiContent canSyncCatalog={false} canWrite={canWrite} />;
  } catch {
    redirect("/dashboard");
  }
}
