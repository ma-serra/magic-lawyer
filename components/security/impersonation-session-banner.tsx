"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { addToast } from "@heroui/toast";
import { AlertTriangle, ShieldAlert, Undo2 } from "lucide-react";

import { endTenantUserImpersonation } from "@/app/actions/admin";

export function ImpersonationSessionBanner() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [isEnding, setIsEnding] = useState(false);

  const impersonation = (session?.user as any)?.impersonation as
    | {
        active: boolean;
        superAdminName?: string | null;
        superAdminEmail: string;
        targetUserName?: string | null;
        targetUserEmail: string;
        targetTenantName?: string | null;
      }
    | null
    | undefined;

  if (!impersonation?.active) {
    return null;
  }

  const targetUserLabel =
    impersonation.targetUserName?.trim() || impersonation.targetUserEmail;
  const targetTenantLabel =
    impersonation.targetTenantName?.trim() || "Tenant não identificado";

  const handleStopImpersonation = async () => {
    if (isEnding) return;

    setIsEnding(true);

    try {
      const result = await endTenantUserImpersonation();

      if (!result.success || !result.data?.ticket) {
        addToast({
          title: "Falha ao encerrar sessão monitorada",
          description:
            result.error ??
            "Não foi possível restaurar sua sessão de super admin.",
          color: "danger",
        });
        return;
      }

      await update({
        impersonationTicket: result.data.ticket,
      });

      addToast({
        title: "Sessão monitorada encerrada",
        description: "Você voltou para o contexto de Super Admin.",
        color: "success",
      });

      router.push(result.data.redirectTo ?? "/admin/dashboard");
      router.refresh();
    } catch (error) {
      addToast({
        title: "Erro ao encerrar sessão monitorada",
        description:
          error instanceof Error
            ? error.message
            : "Erro inesperado ao restaurar sessão.",
        color: "danger",
      });
    } finally {
      setIsEnding(false);
    }
  };

  return (
    <div className="w-full border-b border-amber-700/80 bg-amber-500 px-4 py-2 text-black shadow-[0_8px_24px_rgba(120,53,15,0.25)]">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-0.5">
            <p className="text-sm font-extrabold uppercase tracking-wide">
              Sessão monitorada de suporte ativa
            </p>
            <p className="text-xs font-semibold">
              Você está autenticado como{" "}
              <span className="font-extrabold">{targetUserLabel}</span> no
              escritório <span className="font-extrabold">{targetTenantLabel}</span>.
              Todas as ações estão auditadas.
            </p>
            <p className="flex items-center gap-1 text-[11px] font-semibold">
              <AlertTriangle className="h-3.5 w-3.5" />
              Atenção máxima a dados sensíveis de clientes e processos.
            </p>
          </div>
        </div>
        <Button
          color="warning"
          isLoading={isEnding}
          radius="full"
          size="sm"
          startContent={<Undo2 className="h-4 w-4" />}
          variant="solid"
          onPress={handleStopImpersonation}
        >
          Encerrar acesso como usuário
        </Button>
      </div>
    </div>
  );
}
