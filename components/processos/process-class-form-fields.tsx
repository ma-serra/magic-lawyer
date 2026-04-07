"use client";

import { Input, Switch, Textarea } from "@heroui/react";

import { normalizeProcessCatalogSlug } from "@/app/lib/processos/catalog-slug";

export type ClasseProcessualFormValue = {
  nome: string;
  slug: string;
  descricao: string;
  ordem: number;
  ativo: boolean;
};

type ProcessClassFormFieldsProps = {
  value: ClasseProcessualFormValue;
  onChange: (value: ClasseProcessualFormValue) => void;
  mode?: "quick" | "full";
  syncSlugOnNameChange?: boolean;
  disabled?: boolean;
};

export function ProcessClassFormFields({
  value,
  onChange,
  mode = "full",
  syncSlugOnNameChange = false,
  disabled = false,
}: ProcessClassFormFieldsProps) {
  return (
    <div className="space-y-4">
      <Input
        isRequired
        description={
          mode === "full"
            ? "Nome exibido no cadastro do processo."
            : undefined
        }
        isDisabled={disabled}
        label="Nome da classe"
        placeholder={mode === "full" ? "Ex.: Acao Penal" : "Ex: Acao penal"}
        value={value.nome}
        variant="bordered"
        onValueChange={(nome) =>
          onChange({
            ...value,
            nome,
            slug:
              mode === "full" && syncSlugOnNameChange
                ? normalizeProcessCatalogSlug(nome)
                : value.slug,
          })
        }
      />

      {mode === "full" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            isRequired
            description="Identificador tecnico usado no catalogo."
            isDisabled={disabled}
            label="Slug"
            placeholder="acao-penal"
            value={value.slug}
            variant="bordered"
            onValueChange={(slug) =>
              onChange({
                ...value,
                slug: normalizeProcessCatalogSlug(slug),
              })
            }
          />
          <Input
            description="Numeros menores aparecem primeiro."
            isDisabled={disabled}
            label="Ordem"
            min={0}
            placeholder="1000"
            type="number"
            value={String(value.ordem)}
            variant="bordered"
            onChange={(event) =>
              onChange({
                ...value,
                ordem:
                  Number.parseInt(event.target.value || "1000", 10) || 1000,
              })
            }
          />
        </div>
      ) : null}

      <Textarea
        description={
          mode === "full"
            ? "Opcional. Ajuda o time a entender quando usar esta classe."
            : undefined
        }
        isDisabled={disabled}
        label="Descricao"
        minRows={3}
        placeholder={
          mode === "full"
            ? "Resumo interno sobre o uso desta classe."
            : "Resumo opcional sobre quando usar esta classe"
        }
        value={value.descricao}
        variant="bordered"
        onValueChange={(descricao) =>
          onChange({
            ...value,
            descricao,
          })
        }
      />

      {mode === "full" ? (
        <div className="rounded-xl border border-white/10 px-3 py-3">
          <Switch
            isDisabled={disabled}
            isSelected={value.ativo}
            size="sm"
            onValueChange={(ativo) =>
              onChange({
                ...value,
                ativo,
              })
            }
          >
            Classe ativa para novos processos
          </Switch>
        </div>
      ) : null}
    </div>
  );
}
