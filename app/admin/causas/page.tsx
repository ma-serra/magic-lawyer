import { Metadata } from "next";

import { CausasAdminContent } from "./causas-admin-content";

import { ProfileDashboard } from "@/components/profile-dashboard";

export const metadata: Metadata = {
  title: "Causas Oficiais",
  description: "Sincronização de causas oficiais para escritórios",
};

export default function CausasAdminPage() {
  return (
    <ProfileDashboard>
      <CausasAdminContent />
    </ProfileDashboard>
  );
}
