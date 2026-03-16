import { Metadata } from "next";
import { redirect } from "next/navigation";

import { PacotesJuizStoreContent } from "./pacotes-store-content";

import { getSession } from "@/app/lib/auth";
import { checkPermission } from "@/app/actions/equipe";
import { ProfileDashboard } from "@/components/profile-dashboard";
import { UserRole } from "@/generated/prisma";

export const metadata: Metadata = {
  title: "Loja de Autoridades Premium",
  description:
    "Catálogo interno de pacotes premium de juízes e promotores para o escritório.",
};

export default async function PacotesJuizStorePage() {
  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user as any;

  if (user.role === "SUPER_ADMIN") {
    redirect("/admin/pacotes");
  }

  if (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) {
    return (
      <ProfileDashboard>
        <PacotesJuizStoreContent />
      </ProfileDashboard>
    );
  }

  try {
    const hasPermission = await checkPermission("advogados", "visualizar");

    if (!hasPermission) {
      redirect("/dashboard");
    }

    return (
      <ProfileDashboard>
        <PacotesJuizStoreContent />
      </ProfileDashboard>
    );
  } catch (error) {
    redirect("/dashboard");
  }
}
