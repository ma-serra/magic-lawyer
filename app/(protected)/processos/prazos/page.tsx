import { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSession } from "@/app/lib/auth";
import { checkPermission } from "@/app/actions/equipe";
import { UserRole } from "@/generated/prisma";

import { PrazosContent } from "./prazos-content";

export const metadata: Metadata = {
  title: "Prazos",
  description: "Central operacional de prazos do escritório.",
};

export default async function PrazosPage() {
  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user as any;

  if (user.role === "SUPER_ADMIN") {
    redirect("/admin/dashboard");
  }

  if (user.role === UserRole.CLIENTE || user.role === UserRole.FINANCEIRO) {
    redirect("/dashboard");
  }

  if (user.role === UserRole.ADMIN) {
    return <PrazosContent />;
  }

  try {
    const hasPermission = await checkPermission("processos", "visualizar");

    if (!hasPermission) {
      redirect("/dashboard");
    }

    return <PrazosContent />;
  } catch {
    redirect("/dashboard");
  }
}
