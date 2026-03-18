import { Metadata } from "next";

import { MagicAiContent } from "./magic-ai-content";

import { ProfileDashboard } from "@/components/profile-dashboard";

export const metadata: Metadata = {
  title: "Magic AI Jurídica",
  description:
    "Workspace premium para geração de peças, análise documental e inteligência jurídica contextual.",
};

export default function MagicAiPage() {
  return (
    <ProfileDashboard>
      <MagicAiContent />
    </ProfileDashboard>
  );
}
