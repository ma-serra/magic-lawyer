import { Metadata } from "next";

import { AdminMagicAiContent } from "./admin-magic-ai-content";

import { ProfileDashboard } from "@/components/profile-dashboard";

export const metadata: Metadata = {
  title: "Magic AI Admin",
  description:
    "Governança, prompts, adoção e auditoria da camada de IA jurídica do Magic Lawyer.",
};

export default function AdminMagicAiPage() {
  return (
    <ProfileDashboard>
      <AdminMagicAiContent />
    </ProfileDashboard>
  );
}
