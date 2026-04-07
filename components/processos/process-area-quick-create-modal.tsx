"use client";

import { useState } from "react";
import { Button } from "@heroui/button";
import { BriefcaseBusiness } from "lucide-react";

import { createAreaProcesso } from "@/app/actions/areas-processo";
import { normalizeProcessCatalogSlug } from "@/app/lib/processos/catalog-slug";
import {
  ProcessAreaFormFields,
  type AreaProcessoFormValue,
} from "@/components/processos/process-area-form-fields";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/lib/toast";

type AreaProcessoQuickCreated = {
  id: string;
  nome: string;
  slug: string;
  descricao: string | null;
  ordem: number | null;
  ativo: boolean;
};

type ProcessAreaQuickCreateModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (area: AreaProcessoQuickCreated) => void | Promise<void>;
};

const INITIAL_FORM_STATE: AreaProcessoFormValue = {
  nome: "",
  slug: "",
  descricao: "",
  ordem: 100,
  ativo: true,
};

export function ProcessAreaQuickCreateModal({
  isOpen,
  onClose,
  onCreated,
}: ProcessAreaQuickCreateModalProps) {
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
      toast.error("Informe o nome da area");
      return;
    }

    const slug = normalizeProcessCatalogSlug(nome);

    if (!slug) {
      toast.error("Nao foi possivel gerar o identificador da area");
      return;
    }

    setIsSaving(true);

    try {
      const result = await createAreaProcesso({
        nome,
        slug,
        descricao: formState.descricao.trim() || null,
      });

      if (!result.success || !result.area) {
        toast.error(result.error || "Erro ao criar area do processo");
        return;
      }

      await onCreated(result.area as AreaProcessoQuickCreated);
      toast.success("Area do processo criada com sucesso");
      setFormState(INITIAL_FORM_STATE);
      onClose();
    } catch {
      toast.error("Erro ao criar area do processo");
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
            Salvar area
          </Button>
        </>
      }
      isOpen={isOpen}
      showFooter
      size="lg"
      title="Cadastrar area do processo"
      onClose={handleClose}
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <BriefcaseBusiness className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-semibold text-default-700">
                Criacao rapida para este escritorio
              </p>
              <p className="mt-1 text-xs text-default-500">
                A nova area ficara disponivel imediatamente neste processo e no
                catalogo do seu escritorio.
              </p>
            </div>
          </div>
        </div>

        <ProcessAreaFormFields
          mode="quick"
          value={formState}
          onChange={setFormState}
        />
      </div>
    </Modal>
  );
}
