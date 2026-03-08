import { redirect } from "next/navigation";

export default function ConfiguracoesFeriadosRedirectPage() {
  redirect("/regimes-prazo?tab=feriados");
}

