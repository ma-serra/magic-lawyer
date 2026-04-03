import type { Metadata } from "next";

import { AdminFeriadosContent } from "./feriados-admin-content";

import { ProfileDashboard } from "@/components/profile-dashboard";

export const metadata: Metadata = {
  title: "Feriados Admin",
  description:
    "Catalogo oficial, rollout governado por banco e auditoria da experiencia de feriados.",
};

export default function AdminFeriadosPage() {
  return (
    <ProfileDashboard>
      <AdminFeriadosContent />
    </ProfileDashboard>
  );
}
