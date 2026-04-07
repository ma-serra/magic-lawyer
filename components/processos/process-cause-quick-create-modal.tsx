"use client";

import { useState } from "react";
import { Button } from "@heroui/button";
import { Scale } from "lucide-react";

import { createCausa } from "@/app/actions/causas";
import {
  ProcessCauseFormFields,
  type CausaProcessualFormValue,
} from "@/components/processos/process-cause-form-fields";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/lib/toast";

type CausaQuickCreated = {
  id: string;
  nome: string;
  codigoCnj: string | null;
  descricao: string | null;
  ativo: boolean;
  isOficial: boolean;
};

type ProcessCauseQuickCreateModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (causa: CausaQuickCreated) => void | Promise<void>;
};

const INITIAL_FORM_STATE: CausaProcessualFormValue = {
  nome: "",
  codigoCnj: "",
  descricao: "",
};

export function ProcessCauseQuickCreateModal({
  isOpen,
  onClose,
  onCreated,
}: ProcessCauseQuickCreateModalProps) {
  const [formState, setFormState] = useState(INITIAL_FORM_STATE);
  const [isSaving, setIsSaving] = useState(false);

  const handleClose = () => {
    if (isSaving) {
      return;
    }

    setFormState(INITIAL_FORM_STATE);
    onClose();
  };

  const handleSave = async () => {
    const nome = formState.nome.trim();

    if (!nome) {
      toast.error("Informe o nome do assunto");
      return;
    }

    setIsSaving(true);

    try {
      const result = await createCausa({
        nome,
        descricao: formState.descricao.trim() || null,
      });

      if (!result.success || !result.causa) {
        toast.error(result.error || "Erro ao criar assunto do processo");
        return;
      }

      await onCreated(result.causa as CausaQuickCreated);
      toast.success("Assunto do processo criado com sucesso");
      setFormState(INITIAL_FORM_STATE);
      onClose();
    } catch {
      toast.error("Erro ao criar assunto do processo");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      backdrop="blur"
      footerContent={
        <>
          <Button variant="light" onPress={handleClose}>
            Cancelar
          </Button>
          <Button color="primary" isLoading={isSaving} onPress={handleSave}>
            Salvar assunto
          </Button>
        </>
      }
      isOpen={isOpen}
      showFooter
      size="lg"
      title="Cadastrar assunto do processo"
      onClose={handleClose}
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <Scale className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-semibold text-default-700">
                Criacao rapida para este escritorio
              </p>
              <p className="mt-1 text-xs text-default-500">
                O novo assunto ficara disponivel imediatamente neste processo e
                no catalogo juridico do escritorio.
              </p>
            </div>
          </div>
        </div>

        <ProcessCauseFormFields
          showCodigoCnj={false}
          value={formState}
          onChange={setFormState}
        />
      </div>
    </Modal>
  );
}
