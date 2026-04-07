"use client";

import { useState } from "react";
import { Button } from "@heroui/button";
import { FileText } from "lucide-react";

import { createClasseProcessual } from "@/app/actions/classes-processuais";
import { normalizeProcessCatalogSlug } from "@/app/lib/processos/catalog-slug";
import {
  ProcessClassFormFields,
  type ClasseProcessualFormValue,
} from "@/components/processos/process-class-form-fields";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/lib/toast";

type ClasseProcessualQuickCreated = {
  id: string;
  nome: string;
  slug: string;
  descricao: string | null;
  ordem: number | null;
  ativo: boolean;
};

type ProcessClassQuickCreateModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (classe: ClasseProcessualQuickCreated) => void | Promise<void>;
};

const INITIAL_FORM_STATE: ClasseProcessualFormValue = {
  nome: "",
  slug: "",
  descricao: "",
  ordem: 1000,
  ativo: true,
};

export function ProcessClassQuickCreateModal({
  isOpen,
  onClose,
  onCreated,
}: ProcessClassQuickCreateModalProps) {
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
      toast.error("Informe o nome da classe processual");
      return;
    }

    const slug = normalizeProcessCatalogSlug(nome);

    if (!slug) {
      toast.error("Nao foi possivel gerar o identificador da classe");
      return;
    }

    setIsSaving(true);

    try {
      const result = await createClasseProcessual({
        nome,
        slug,
        descricao: formState.descricao.trim() || null,
      });

      if (!result.success || !result.data) {
        toast.error(result.error || "Erro ao criar classe processual");
        return;
      }

      await onCreated(result.data as ClasseProcessualQuickCreated);
      toast.success("Classe processual criada com sucesso");
      setFormState(INITIAL_FORM_STATE);
      onClose();
    } catch {
      toast.error("Erro ao criar classe processual");
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
            Salvar classe
          </Button>
        </>
      }
      isOpen={isOpen}
      showFooter
      size="lg"
      title="Cadastrar classe processual"
      onClose={handleClose}
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <FileText className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-semibold text-default-700">
                Criacao rapida para este escritorio
              </p>
              <p className="mt-1 text-xs text-default-500">
                A nova classe ficara disponivel imediatamente neste processo e
                no catalogo do escritorio.
              </p>
            </div>
          </div>
        </div>

        <ProcessClassFormFields
          mode="quick"
          value={formState}
          onChange={setFormState}
        />
      </div>
    </Modal>
  );
}
