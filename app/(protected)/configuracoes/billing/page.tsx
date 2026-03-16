import { Metadata } from "next";
import { redirect } from "next/navigation";

import BillingContent from "./billing-content";

import { getSession } from "@/app/lib/auth";
import { TENANT_PERMISSIONS } from "@/types";

export const metadata: Metadata = {
  title: "Billing da conta",
  description:
    "Faturas da conta do escritório com a plataforma, incluindo assinatura principal e add-ons premium.",
};

export default async function BillingPage() {
  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  const role = (session.user as any)?.role as string | undefined;
  const permissions = ((session.user as any)?.permissions ?? []) as string[];
  const allowed =
    role === "SUPER_ADMIN" ||
    permissions.includes(TENANT_PERMISSIONS.manageOfficeSettings);

  if (!allowed) {
    redirect("/dashboard");
  }

  return <BillingContent />;
}
