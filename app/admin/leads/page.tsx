import { Metadata } from "next";

import { LeadsContent } from "./leads-content";

import { ProfileDashboard } from "@/components/profile-dashboard";

export const metadata: Metadata = {
  title: "Leads comerciais",
  description: "Funil de leads capturados na landing de preços",
};

export default function AdminLeadsPage() {
  return (
    <ProfileDashboard>
      <LeadsContent />
    </ProfileDashboard>
  );
}
