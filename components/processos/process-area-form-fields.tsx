"use client";

import { Input, Switch, Textarea } from "@heroui/react";

import { normalizeProcessCatalogSlug } from "@/app/lib/processos/catalog-slug";

export type AreaProcessoFormValue = {
  nome: string;
  slug: string;
  descricao: string;
  ordem: number;
  ativo: boolean;
};

type ProcessAreaFormFieldsProps = {
  value: AreaProcessoFormValue;
  onChange: (value: AreaProcessoFormValue) => void;
  mode?: "quick" | "full";
  syncSlugOnNameChange?: boolean;
  disabled?: boolean;
};

export function ProcessAreaFormFields({
  value,
  onChange,
  mode = "full",
  syncSlugOnNameChange = false,
  disabled = false,
}: ProcessAreaFormFieldsProps) {
  return (
    <div className="space-y-4">
      <Input
        isRequired
        description={
          mode === "full"
            ? "Nome exibido no cadastro e filtros de processos."
            : undefined
        }
        isDisabled={disabled}
        label="Nome da area"
        placeholder={mode === "full" ? "Ex.: Direito Civil" : "Ex: Direito Previdenciario"}
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
            description="Identificador tecnico usado internamente."
            isDisabled={disabled}
            label="Slug"
            placeholder="direito-civil"
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
            placeholder="100"
            type="number"
            value={String(value.ordem)}
            variant="bordered"
            onChange={(event) =>
              onChange({
                ...value,
                ordem:
                  Number.parseInt(event.target.value || "100", 10) || 100,
              })
            }
          />
        </div>
      ) : null}

      <Textarea
        description={
          mode === "full"
            ? "Opcional. Ajuda o time a entender quando usar esta area."
            : undefined
        }
        isDisabled={disabled}
        label={mode === "full" ? "Descricao interna" : "Descricao"}
        minRows={3}
        placeholder={
          mode === "full"
            ? "Descreva escopo e contexto desta area."
            : "Resumo opcional sobre quando usar esta area"
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
            Area ativa para novos processos
          </Switch>
        </div>
      ) : null}
    </div>
  );
}
