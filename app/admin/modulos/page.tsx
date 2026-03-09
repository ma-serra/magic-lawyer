import { redirect } from "next/navigation";

export default function ModulosAdminPage() {
  redirect("/admin/planos?workspace=modulos");
}
