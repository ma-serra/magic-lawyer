import { Metadata } from "next";
import { redirect } from "next/navigation";

import { SuporteContent } from "./suporte-content";

import { getSession } from "@/app/lib/auth";

export const metadata: Metadata = {
  title: "Suporte",
  description: "Central de tickets e chat com o suporte Magic Lawyer.",
};

export const dynamic = "force-dynamic";

export default async function SuportePage() {
  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  const role = String((session.user as any)?.role ?? "");

  if (role === "SUPER_ADMIN") {
    redirect("/admin/suporte");
  }

  return <SuporteContent />;
}
