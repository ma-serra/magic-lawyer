import { redirect } from "next/navigation";

import TarefasWorkspace from "./tarefas-workspace";

import { getSession } from "@/app/lib/auth";

export default async function TarefasPage() {
  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user as any;

  // SuperAdmin vai para dashboard admin
  if (user.role === "SUPER_ADMIN") {
    redirect("/admin/dashboard");
  }

  // Cliente não tem acesso a tarefas
  if (user.role === "CLIENTE") {
    redirect("/dashboard");
  }

  // Admin e outros roles têm acesso
  // (tarefas não requerem permissão específica, apenas não ser cliente)
  return <TarefasWorkspace />;
}
