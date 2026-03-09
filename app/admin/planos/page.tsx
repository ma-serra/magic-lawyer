import { Metadata } from "next";

import { PlanosContent } from "./planos-content";

import { ProfileDashboard } from "@/components/profile-dashboard";

export const metadata: Metadata = {
  title: "Planos e Módulos",
  description:
    "Gerencie planos comerciais, catálogo de módulos e a composição oficial da oferta",
};

export default function PlanosAdminPage() {
  return (
    <ProfileDashboard>
      <PlanosContent />
    </ProfileDashboard>
  );
}
