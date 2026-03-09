import { redirect } from "next/navigation";

export default function ModuloCategoriasPage() {
  redirect("/admin/planos?workspace=modulos");
}
