import { Metadata } from "next";
import { redirect } from "next/navigation";

import { DocumentosContent } from "./documentos-content";

import {
  getDocumentExplorerClientes,
  getDocumentExplorerData,
} from "@/app/actions/documentos-explorer";
import { getSession } from "@/app/lib/auth";
import { checkPermission } from "@/app/actions/equipe";
import { UserRole } from "@/generated/prisma";

export const metadata: Metadata = {
  title: "Documentos",
  description:
    "Gestão de documentos jurídicos com organização em árvore por cliente e processo.",
};

export default async function DocumentosPage() {
  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user as any;

  // SuperAdmin vai para dashboard admin
  if (user.role === "SUPER_ADMIN") {
    redirect("/admin/dashboard");
  }

  // Admin sempre tem acesso
  if (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) {
    const clientesResult = await getDocumentExplorerClientes();

    return (
      <DocumentosContent
        canDeleteDocumentos={true}
        canManageDocumentos={true}
        initialClientes={clientesResult.success ? clientesResult.data ?? [] : []}
        initialData={null}
        initialError={
          !clientesResult.success ? clientesResult.error : undefined
        }
      />
    );
  }

  // Para outros roles, verificar permissões explícitas do módulo documentos.
  try {
    const [canViewDocumentos, canEditDocumentos, canDeleteDocumentos] =
      await Promise.all([
        checkPermission("documentos", "visualizar"),
        checkPermission("documentos", "editar"),
        checkPermission("documentos", "excluir"),
      ]);

    if (!canViewDocumentos) {
      redirect("/dashboard");
    }

    const clientesResult = await getDocumentExplorerClientes();

    return (
      <DocumentosContent
        canDeleteDocumentos={canDeleteDocumentos}
        canManageDocumentos={canEditDocumentos}
        initialClientes={clientesResult.success ? clientesResult.data ?? [] : []}
        initialData={null}
        initialError={
          !clientesResult.success ? clientesResult.error : undefined
        }
      />
    );
  } catch (error) {
    console.error("Erro ao verificar permissões para /documentos:", error);
    redirect("/dashboard");
  }
}
