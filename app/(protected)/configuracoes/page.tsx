import { Metadata } from "next";
import { redirect } from "next/navigation";

import { ConfiguracoesTabs } from "./configuracoes-tabs";

import { getSession } from "@/app/lib/auth";
import { TENANT_PERMISSIONS } from "@/types";
import { getTenantConfigData } from "@/app/actions/tenant-config";
import { PeoplePageHeader } from "@/components/people-ui";
import { getBrazilTimezoneOptions } from "@/app/lib/timezones/brazil-timezones";

export const metadata: Metadata = {
  title: "Configurações do escritório",
  description: "Personalize branding, integrações e preferências avançadas.",
};

export default async function ConfiguracoesPage() {
  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  const role = (session.user as any)?.role as string | undefined;
  const permissions = ((session.user as any)?.permissions ?? []) as string[];
  const allowed =
    role === "SUPER_ADMIN" ||
    role === "ADMIN" ||
    permissions.includes(TENANT_PERMISSIONS.manageOfficeSettings);

  if (!allowed) {
    redirect("/dashboard");
  }

  // Buscar dados do tenant
  const [tenantData, timezoneOptions] = await Promise.all([
    getTenantConfigData(),
    getBrazilTimezoneOptions(),
  ]);

  if (!tenantData.success || !tenantData.data) {
    redirect("/dashboard");
  }

  const { tenant, branding, subscription, modules, metrics, digitalCertificates } =
    tenantData.data;

  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-3 py-8 sm:px-6">
      <PeoplePageHeader
        description="Central única para configurar escritório, branding, integrações e catálogos operacionais."
        tag="Administração"
        title="Configurações do escritório"
      />

      <ConfiguracoesTabs
        branding={branding}
        timezoneOptions={timezoneOptions}
        metrics={metrics}
        modules={modules}
        subscription={subscription}
        tenant={tenant}
        certificates={digitalCertificates}
        certificatePolicy={tenant.digitalCertificatePolicy}
      />
    </section>
  );
}
