"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { Gavel, Plus } from "lucide-react";

import { marcarEventoComoRealizado } from "@/app/actions/eventos";
import type { ProcessoEvento } from "@/app/actions/processos";
import { useEventosProcesso } from "@/app/hooks/use-processos";
import EventoForm from "@/components/evento-form";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/lib/toast";
import { EventoTipo } from "@/generated/prisma";

import {
  ProcessoAudienciasList,
  type ProcessoAudienciaListItem,
} from "./processo-audiencias-list";

export type ProcessoAudienciasModalMode = "list" | "create";

interface ProcessoAudienciasModalProps {
  isOpen: boolean;
  onClose: () => void;
  processoId: string;
  processoNumero: string;
  processoTitulo?: string | null;
  clienteId?: string | null;
  advogadoResponsavelId?: string | null;
  canCreate?: boolean;
  canEdit?: boolean;
  canComplete?: boolean;
  defaultMode?: ProcessoAudienciasModalMode;
  onChanged?: () => void | Promise<void>;
}

export function ProcessoAudienciasModal({
  isOpen,
  onClose,
  processoId,
  processoNumero,
  processoTitulo,
  clienteId = null,
  advogadoResponsavelId = null,
  canCreate = false,
  canEdit = false,
  canComplete = false,
  defaultMode = "list",
  onChanged,
}: ProcessoAudienciasModalProps) {
  const [isAudienciaFormOpen, setIsAudienciaFormOpen] = useState(false);
  const [audienciaEditando, setAudienciaEditando] =
    useState<ProcessoEvento | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const {
    eventos,
    isLoading,
    mutate: mutateEventos,
  } = useEventosProcesso(isOpen ? processoId : null);

  const audiencias = useMemo(
    () => eventos.filter((evento) => evento.tipo === EventoTipo.AUDIENCIA),
    [eventos],
  );

  const processLabel = processoTitulo?.trim()
    ? `${processoNumero} • ${processoTitulo}`
    : processoNumero;

  const audienciaFormPreset = useMemo(
    () => ({
      tipo: EventoTipo.AUDIENCIA,
      processoId,
      clienteId,
      advogadoResponsavelId,
    }),
    [advogadoResponsavelId, clienteId, processoId],
  );

  const audienciaFormCopy = useMemo(
    () => ({
      createTitle: "Nova audiência",
      editTitle: "Editar audiência",
      createSubmitLabel: "Criar audiência",
      editSubmitLabel: "Atualizar audiência",
    }),
    [],
  );

  useEffect(() => {
    if (!isOpen) {
      setIsAudienciaFormOpen(false);
      setAudienciaEditando(null);
      setCompletingId(null);
      return;
    }

    if (defaultMode === "create" && canCreate) {
      setAudienciaEditando(null);
      setIsAudienciaFormOpen(true);
    }
  }, [canCreate, defaultMode, isOpen]);

  const revalidateAfterMutation = async () => {
    await Promise.all([mutateEventos(), Promise.resolve(onChanged?.())]);
  };

  const handleCreateAudiencia = () => {
    if (!canCreate) {
      return;
    }

    setAudienciaEditando(null);
    setIsAudienciaFormOpen(true);
  };

  const handleEditAudiencia = (audiencia: ProcessoAudienciaListItem) => {
    if (!canEdit) {
      return;
    }

    setAudienciaEditando(audiencia as ProcessoEvento);
    setIsAudienciaFormOpen(true);
  };

  const handleCloseAudienciaForm = () => {
    setIsAudienciaFormOpen(false);
    setAudienciaEditando(null);
  };

  const handleAudienciaFormSuccess = async () => {
    await revalidateAfterMutation();
    setIsAudienciaFormOpen(false);
    setAudienciaEditando(null);
  };

  const handleCompleteAudiencia = async (
    audiencia: ProcessoAudienciaListItem,
  ) => {
    if (!canComplete) {
      return;
    }

    try {
      setCompletingId(audiencia.id);
      const result = await marcarEventoComoRealizado(audiencia.id);

      if (!result.success) {
        toast.error(result.error || "Erro ao concluir audiência");
        return;
      }

      toast.success("Audiência marcada como concluída!");
      await revalidateAfterMutation();
    } catch {
      toast.error("Erro interno do servidor");
    } finally {
      setCompletingId(null);
    }
  };

  return (
    <>
      <Modal
        footer={
          <>
            <Button variant="light" onPress={onClose}>
              Fechar
            </Button>
            {canCreate ? (
              <Button
                color="primary"
                startContent={<Plus className="h-4 w-4" />}
                onPress={handleCreateAudiencia}
              >
                Nova audiência
              </Button>
            ) : null}
          </>
        }
        isOpen={isOpen && !isAudienciaFormOpen}
        size="2xl"
        title="Audiências do processo"
        onClose={onClose}
      >
        <div className="space-y-4 pt-2">
          <div className="rounded-2xl border border-default-200 bg-default-50/70 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-secondary/10 p-2 text-secondary">
                <Gavel className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  {processLabel}
                </p>
                <p className="text-xs text-default-500">
                  Veja as audiências futuras e passadas deste processo, com
                  ações rápidas de acompanhamento.
                </p>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner label="Carregando audiências..." />
            </div>
          ) : (
            <ProcessoAudienciasList
              audiencias={audiencias}
              canComplete={canComplete}
              canCreate={canCreate}
              completingId={completingId}
              emptyDescription="Quando uma audiência for cadastrada na agenda vinculada a este processo, ela aparecerá aqui automaticamente."
              onComplete={canComplete ? handleCompleteAudiencia : undefined}
              onCreate={canCreate ? handleCreateAudiencia : undefined}
              onEdit={canEdit ? handleEditAudiencia : undefined}
            />
          )}
        </div>
      </Modal>

      <EventoForm
        copy={audienciaFormCopy}
        evento={audienciaEditando || undefined}
        isOpen={isOpen && isAudienciaFormOpen}
        locks={{
          tipo: true,
          processo: true,
          cliente: true,
        }}
        onClose={handleCloseAudienciaForm}
        onSuccess={handleAudienciaFormSuccess}
        preset={audienciaFormPreset}
      />
    </>
  );
}
