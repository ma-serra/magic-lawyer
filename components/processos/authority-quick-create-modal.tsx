"use client";

import { useMemo, useState } from "react";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/react";

import { createJuizTenant, type JuizSerializado } from "@/app/actions/juizes";
import { Modal } from "@/components/ui/modal";
import { SearchableSelect } from "@/components/searchable-select";
import { toast } from "@/lib/toast";
import { JuizNivel, JuizStatus, JuizTipoAutoridade } from "@/generated/prisma";

type TribunalOption = {
  id: string;
  nome: string;
  sigla?: string | null;
  esfera?: string | null;
  uf?: string | null;
};

type AuthorityQuickCreateModalProps = {
  isOpen: boolean;
  tribunais: TribunalOption[];
  onClose: () => void;
  onCreated: (juiz: JuizSerializado) => void | Promise<void>;
};

type AuthorityQuickCreateFormState = {
  tipoAutoridade: JuizTipoAutoridade;
  nome: string;
  vara: string;
  comarca: string;
  cidade: string;
  estado: string;
  email: string;
  telefone: string;
  tribunalId: string;
};

const initialFormState: AuthorityQuickCreateFormState = {
  tipoAutoridade: JuizTipoAutoridade.JUIZ,
  nome: "",
  vara: "",
  comarca: "",
  cidade: "",
  estado: "",
  email: "",
  telefone: "",
  tribunalId: "",
};

export function AuthorityQuickCreateModal({
  isOpen,
  tribunais,
  onClose,
  onCreated,
}: AuthorityQuickCreateModalProps) {
  const [formState, setFormState] =
    useState<AuthorityQuickCreateFormState>(initialFormState);
  const [isSaving, setIsSaving] = useState(false);

  const tribunalOptions = useMemo(
    () => [
      {
        key: "NONE",
        label: "Sem tribunal definido",
        textValue: "Sem tribunal definido",
      },
      ...tribunais.map((tribunal) => ({
        key: tribunal.id,
        label: tribunal.sigla
          ? `${tribunal.sigla} - ${tribunal.nome}`
          : tribunal.nome,
        textValue: [
          tribunal.sigla || "",
          tribunal.nome,
          tribunal.esfera || "",
          tribunal.uf || "",
        ]
          .filter(Boolean)
          .join(" "),
        description:
          [tribunal.esfera, tribunal.uf].filter(Boolean).join(" • ") ||
          "Sem esfera/UF",
      })),
    ],
    [tribunais],
  );

  const handleClose = () => {
    if (isSaving) {
      return;
    }

    setFormState(initialFormState);
    onClose();
  };

  const handleSave = async () => {
    if (!formState.nome.trim()) {
      toast.error("Informe o nome da autoridade");
      return;
    }

    if (!formState.vara.trim()) {
      toast.error(
        formState.tipoAutoridade === JuizTipoAutoridade.PROMOTOR
          ? "Informe a promotoria"
          : "Informe a vara",
      );
      return;
    }

    setIsSaving(true);

    try {
      const result = await createJuizTenant({
        tipoAutoridade: formState.tipoAutoridade,
        nome: formState.nome.trim(),
        vara: formState.vara.trim(),
        comarca: formState.comarca.trim() || undefined,
        cidade: formState.cidade.trim() || undefined,
        estado: formState.estado.trim().toUpperCase() || undefined,
        email: formState.email.trim() || undefined,
        telefone: formState.telefone.trim() || undefined,
        tribunalId:
          formState.tribunalId && formState.tribunalId !== "NONE"
            ? formState.tribunalId
            : undefined,
        status: JuizStatus.ATIVO,
        nivel:
          formState.tipoAutoridade === JuizTipoAutoridade.PROMOTOR
            ? JuizNivel.OUTROS
            : JuizNivel.JUIZ_TITULAR,
        especialidades: [],
      });

      if (!result.success || !result.juiz) {
        toast.error(result.error || "Erro ao cadastrar autoridade");
        return;
      }

      await onCreated(result.juiz);
      toast.success("Autoridade cadastrada com sucesso", {
        description:
          result.juiz.cadastroCompleto === false
            ? `Abrimos uma tarefa para completar: ${result.juiz.camposPendentes?.join(", ")}.`
            : undefined,
      });
      setFormState(initialFormState);
      onClose();
    } catch {
      toast.error("Erro ao cadastrar autoridade");
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
            Salvar autoridade
          </Button>
        </>
      }
      isOpen={isOpen}
      showFooter
      size="xl"
      title="Cadastrar autoridade do caso"
      onClose={handleClose}
    >
      <div className="space-y-4">
        <p className="text-sm text-default-500">
          Cadastre a autoridade do caso sem sair do processo. O tribunal aqui é
          opcional, e o órgão julgador textual continua disponível no
          formulário principal do processo.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Tipo de autoridade"
            selectedKeys={[formState.tipoAutoridade]}
            variant="bordered"
            onSelectionChange={(keys) =>
              setFormState((prev) => ({
                ...prev,
                tipoAutoridade:
                  (Array.from(keys)[0] as JuizTipoAutoridade) ??
                  JuizTipoAutoridade.JUIZ,
              }))
            }
          >
            <SelectItem key={JuizTipoAutoridade.JUIZ} textValue="Juiz">
              Juiz
            </SelectItem>
            <SelectItem key={JuizTipoAutoridade.PROMOTOR} textValue="Promotor">
              Promotor
            </SelectItem>
          </Select>

          <Input
            isRequired
            label="Nome da autoridade"
            placeholder="Ex: Ana Costa"
            value={formState.nome}
            variant="bordered"
            onValueChange={(value) =>
              setFormState((prev) => ({ ...prev, nome: value }))
            }
          />

          <Input
            isRequired
            label={
              formState.tipoAutoridade === JuizTipoAutoridade.PROMOTOR
                ? "Promotoria"
                : "Vara"
            }
            placeholder={
              formState.tipoAutoridade === JuizTipoAutoridade.PROMOTOR
                ? "Ex: 2a Promotoria Criminal"
                : "Ex: 1a Vara Civel"
            }
            value={formState.vara}
            variant="bordered"
            onValueChange={(value) =>
              setFormState((prev) => ({ ...prev, vara: value }))
            }
          />

          <Input
            label="Comarca"
            placeholder="Ex: Salvador"
            value={formState.comarca}
            variant="bordered"
            onValueChange={(value) =>
              setFormState((prev) => ({ ...prev, comarca: value }))
            }
          />

          <Input
            label="Cidade"
            placeholder="Ex: Salvador"
            value={formState.cidade}
            variant="bordered"
            onValueChange={(value) =>
              setFormState((prev) => ({ ...prev, cidade: value }))
            }
          />

          <Input
            label="UF"
            maxLength={2}
            placeholder="Ex: BA"
            value={formState.estado}
            variant="bordered"
            onValueChange={(value) =>
              setFormState((prev) => ({
                ...prev,
                estado: value.toUpperCase(),
              }))
            }
          />

          <SearchableSelect
            description="Opcional. Digite a sigla ou o nome do tribunal"
            emptyContent="Nenhum tribunal encontrado"
            items={tribunalOptions}
            isVirtualized={false}
            label="Tribunal de referência (opcional)"
            listboxProps={{
              className: "max-h-72 overflow-y-auto",
            }}
            placeholder="Digite para buscar o tribunal"
            popoverProps={{
              classNames: {
                base: "z-[12000]",
                content: "z-[12000]",
              },
              offset: 8,
              placement: "bottom",
              shouldFlip: false,
            }}
            selectedKey={formState.tribunalId || "NONE"}
            onSelectionChange={(selectedKey) =>
              setFormState((prev) => ({
                ...prev,
                tribunalId: (selectedKey || "NONE").trim(),
              }))
            }
          />

          <Input
            label="Email"
            placeholder="email@exemplo.com"
            type="email"
            value={formState.email}
            variant="bordered"
            onValueChange={(value) =>
              setFormState((prev) => ({ ...prev, email: value }))
            }
          />

          <Input
            label="Telefone"
            placeholder="(00) 00000-0000"
            value={formState.telefone}
            variant="bordered"
            onValueChange={(value) =>
              setFormState((prev) => ({ ...prev, telefone: value }))
            }
          />
        </div>
      </div>
    </Modal>
  );
}
