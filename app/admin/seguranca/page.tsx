import { Metadata } from "next";

import { AdminSecurityContent } from "./seguranca-content";

import { ProfileDashboard } from "@/components/profile-dashboard";

export const metadata: Metadata = {
  title: "Seguranca",
  description: "Cockpit de seguranca, acessos e resposta a incidentes do Magic Lawyer",
};

export default function AdminSecurityPage() {
  return (
    <ProfileDashboard>
      <AdminSecurityContent />
    </ProfileDashboard>
  );
}
