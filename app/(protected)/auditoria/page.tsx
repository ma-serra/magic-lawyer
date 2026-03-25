import { redirect } from "next/navigation";

import { getSession } from "@/app/lib/auth";
import { UserRole } from "@/generated/prisma";

import { AuditoriaTenantContent } from "./auditoria-content";

export default async function AuditoriaTenantPage() {
  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user as { role?: UserRole | string };

  if (user.role === UserRole.SUPER_ADMIN) {
    redirect("/admin/auditoria");
  }

  if (user.role !== UserRole.ADMIN) {
    redirect("/dashboard");
  }

  return <AuditoriaTenantContent />;
}
