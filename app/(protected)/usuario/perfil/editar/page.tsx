import { Metadata } from "next";

import { ProfileContent } from "./profile-content";

import { PeoplePageHeader } from "@/components/people-ui";

export const metadata: Metadata = {
  title: "Editar perfil",
  description: "Personalize seus dados, preferências e informações de contato.",
};

export default function EditUserProfilePage() {
  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 py-10">
      <PeoplePageHeader
        title="Gerencie seu perfil"
        description="Atualize dados pessoais, segurança, notificações e integrações de conta em um único fluxo."
        tag="Área do usuário"
      />
      <ProfileContent />
    </section>
  );
}
