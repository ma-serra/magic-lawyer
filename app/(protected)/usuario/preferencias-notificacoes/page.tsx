import { Metadata } from "next";

import { NotificationPreferencesContent } from "./notification-preferences-content";

import { PeoplePageHeader } from "@/components/people-ui";

export const metadata: Metadata = {
  title: "Preferências de Notificações",
  description: "Configure suas preferências de notificações por tipo de evento",
};

export default function NotificationPreferencesPage() {
  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 py-10">
      <PeoplePageHeader
        title="Preferências de notificações"
        description="Defina por evento quais canais e qual urgência serão usados nos alertas operacionais."
        tag="Configurações"
      />
      <NotificationPreferencesContent />
    </section>
  );
}
