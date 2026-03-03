import { redirect } from "next/navigation";

import { PortalAdvogadoContent } from "./portal-advogado-content";

import { getSession } from "@/app/lib/auth";
import { UserRole } from "@/generated/prisma";

export default async function PortalAdvogadoPage() {
  const session = await getSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const userRole = (session.user as any)?.role as UserRole | undefined;
  const isAdmin = userRole === UserRole.ADMIN;
  const isAdvogado = userRole === UserRole.ADVOGADO;

  // Apenas ADMIN e ADVOGADO podem acessar
  if (!isAdmin && !isAdvogado) {
    redirect("/dashboard");
  }

  return <PortalAdvogadoContent />;
}
