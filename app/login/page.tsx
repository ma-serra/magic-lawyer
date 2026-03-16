import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { getPublicMarketingMetrics } from "@/app/lib/public-marketing-metrics";

import LoginPageClient from "./login-page-client";

export default async function LoginPage() {
  const [session, marketingMetrics] = await Promise.all([
    getServerSession(authOptions),
    getPublicMarketingMetrics(),
  ]);

  const role = (session?.user as any)?.role as string | undefined;

  if (session?.user) {
    redirect(role === "SUPER_ADMIN" ? "/admin/dashboard" : "/dashboard");
  }

  return (
    <LoginPageClient
      marketingMetrics={[
        {
          label: "Processos sob controle",
          value: marketingMetrics.display.processos,
        },
        {
          label: "Clientes ativos",
          value: marketingMetrics.display.clientes,
        },
        {
          label: "Usuários habilitados",
          value: marketingMetrics.display.usuarios,
        },
      ]}
    />
  );
}
