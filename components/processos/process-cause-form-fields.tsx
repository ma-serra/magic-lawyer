"use client";

import { Input, Textarea } from "@heroui/input";

export type CausaProcessualFormValue = {
  nome: string;
  codigoCnj: string;
  descricao: string;
};

type ProcessCauseFormFieldsProps = {
  value: CausaProcessualFormValue;
  onChange: (value: CausaProcessualFormValue) => void;
  showCodigoCnj?: boolean;
  disabled?: boolean;
};

export function ProcessCauseFormFields({
  value,
  onChange,
  showCodigoCnj = true,
  disabled = false,
}: ProcessCauseFormFieldsProps) {
  return (
    <div className="space-y-4">
      <div className={showCodigoCnj ? "grid gap-3 sm:grid-cols-2" : "space-y-0"}>
        <Input
          isRequired
          isDisabled={disabled}
          label="Nome do assunto"
          placeholder="Ex.: Peculato"
          value={value.nome}
          variant="bordered"
          onValueChange={(nome) =>
            onChange({
              ...value,
              nome,
            })
          }
        />
        {showCodigoCnj ? (
          <Input
            isDisabled={disabled}
            label="Codigo CNJ"
            placeholder="Opcional"
            value={value.codigoCnj}
            variant="bordered"
            onValueChange={(codigoCnj) =>
              onChange({
                ...value,
                codigoCnj,
              })
            }
          />
        ) : null}
      </div>

      <Textarea
        isDisabled={disabled}
        label="Descricao"
        minRows={3}
        placeholder="Observacao breve para uso interno"
        value={value.descricao}
        variant="bordered"
        onValueChange={(descricao) =>
          onChange({
            ...value,
            descricao,
          })
        }
      />
    </div>
  );
}
