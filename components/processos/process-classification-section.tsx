"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/react";
import {
  DollarSign,
  FileText,
  Flag,
  Landmark,
  Layers,
} from "lucide-react";

import type { ProcessoCreateInput } from "@/app/actions/processos";
import {
  ProcedimentoProcessual,
  ProcessoFase,
  ProcessoGrau,
} from "@/generated/prisma";
import {
  doesAreaRequireProcedimento,
  getProcedimentoProcessualOptions,
  isProcedimentoCompatibleWithArea,
} from "@/app/lib/processos/procedimento-processual";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/searchable-select";

export type ProcessoClassificationValue = Pick<
  ProcessoCreateInput,
  | "classeProcessual"
  | "causaIds"
  | "areaId"
  | "fase"
  | "grau"
  | "orgaoJulgador"
  | "procedimentoProcessual"
  | "valorCausa"
>;

type AreaOption = {
  id: string;
  nome: string;
  slug: string;
};

type CausaOption = {
  id: string;
  nome: string;
  codigoCnj?: string | null;
};

type ProcessClassificationSectionProps = {
  value: ProcessoClassificationValue;
  onPatch: (patch: Partial<ProcessoClassificationValue>) => void;
  classProcessualOptions: SearchableSelectOption[];
  isLoadingClassesProcessuais?: boolean;
  causas: CausaOption[];
  isLoadingCausas?: boolean;
  areas: AreaOption[];
  isLoadingAreas?: boolean;
  tribunalOptions: SearchableSelectOption[];
  isLoadingTribunais?: boolean;
  fases: ProcessoFase[];
  graus: ProcessoGrau[];
  getFaseLabel: (fase: ProcessoFase) => string;
  formatGrauLabel: (grau: ProcessoGrau) => string;
  grauDescription: string;
  canQuickCreateCatalog?: boolean;
  canQuickCreateArea?: boolean;
  onOpenClassModal: () => void;
  onOpenCauseModal: () => void;
  onOpenAreaModal: () => void;
};

export function ProcessClassificationSection({
  value,
  onPatch,
  classProcessualOptions,
  isLoadingClassesProcessuais = false,
  causas,
  isLoadingCausas = false,
  areas,
  isLoadingAreas = false,
  tribunalOptions,
  isLoadingTribunais = false,
  fases,
  graus,
  getFaseLabel,
  formatGrauLabel,
  grauDescription,
  canQuickCreateCatalog = false,
  canQuickCreateArea = false,
  onOpenClassModal,
  onOpenCauseModal,
  onOpenAreaModal,
}: ProcessClassificationSectionProps) {
  const causaOptionKeys = useMemo(
    () => new Set(causas.map((causa) => causa.id)),
    [causas],
  );
  const selectedClasseProcessualKey = useMemo(() => {
    const currentValue = value.classeProcessual?.trim();

    if (!currentValue) {
      return null;
    }

    const match = classProcessualOptions.find(
      (item) => item.key === currentValue || item.label === currentValue,
    );

    return match?.key ?? null;
  }, [classProcessualOptions, value.classeProcessual]);
  const selectedCausaKeys = useMemo(
    () =>
      (value.causaIds ?? []).filter((causaId) => causaOptionKeys.has(causaId)),
    [causaOptionKeys, value.causaIds],
  );
  const assuntosSelecionadosResumo = useMemo(() => {
    if (selectedCausaKeys.length === 0) {
      return "";
    }

    const causeMap = new Map(causas.map((causa) => [causa.id, causa.nome]));
    return selectedCausaKeys
      .map((causaId) => causeMap.get(causaId))
      .filter(Boolean)
      .join(", ");
  }, [causas, selectedCausaKeys]);
  const selectedAreaKeys = value.areaId ? [value.areaId] : [];
  const selectedArea = useMemo(
    () => areas.find((area) => area.id === value.areaId),
    [areas, value.areaId],
  );
  const selectedOrgaoJulgadorKey = useMemo(() => {
    const currentValue = value.orgaoJulgador?.trim();

    if (!currentValue) {
      return null;
    }

    const match = tribunalOptions.find(
      (item) => item.key === currentValue || item.label === currentValue,
    );

    return match?.key ?? null;
  }, [tribunalOptions, value.orgaoJulgador]);
  const procedimentoOptions = useMemo(
    () => getProcedimentoProcessualOptions(selectedArea?.slug),
    [selectedArea?.slug],
  );
  const procedimentoRequired = doesAreaRequireProcedimento(selectedArea?.slug);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <SearchableSelect
            description="Classe da acao. Os assuntos juridicos do caso ficam no campo abaixo."
            emptyContent="Nenhuma classe processual encontrada"
            isLoading={isLoadingClassesProcessuais}
            items={classProcessualOptions}
            label="Classe processual"
            placeholder="Digite para buscar a classe"
            selectedKey={selectedClasseProcessualKey}
            startContent={<FileText className="h-4 w-4 text-default-400" />}
            onSelectionChange={(selectedKey) => {
              const option = classProcessualOptions.find(
                (item) => item.key === selectedKey,
              );

              onPatch({
                classeProcessual: option?.label || "",
              });
            }}
          />
          <div className="flex flex-wrap justify-end gap-2">
            {canQuickCreateCatalog ? (
              <Button
                color="secondary"
                size="sm"
                variant="light"
                onPress={onOpenClassModal}
              >
                Nao encontrou a classe? Criar agora
              </Button>
            ) : null}
            <Button
              as={Link}
              color="secondary"
              href="/configuracoes?tab=classes-processuais"
              size="sm"
              variant="light"
            >
              Gerenciar classes processuais
            </Button>
          </div>
        </div>

        <div className="space-y-2 lg:col-span-2">
          <Select
            description="Temas juridicos do caso. Voce pode selecionar mais de um assunto."
            isLoading={isLoadingCausas}
            label="Assuntos do processo"
            placeholder="Selecione um ou mais assuntos"
            selectedKeys={selectedCausaKeys}
            selectionMode="multiple"
            onSelectionChange={(keys) => {
              const nextKeys =
                keys === "all"
                  ? causas.map((causa) => causa.id)
                  : (Array.from(keys) as string[]);

              onPatch({
                causaIds: nextKeys.filter((causaId) =>
                  causaOptionKeys.has(causaId),
                ),
              });
            }}
          >
            {causas.map((causa) => (
              <SelectItem
                key={causa.id}
                textValue={`${causa.nome}${causa.codigoCnj ? ` • ${causa.codigoCnj}` : ""}`}
              >
                {causa.nome}
                {causa.codigoCnj ? ` • ${causa.codigoCnj}` : ""}
              </SelectItem>
            ))}
          </Select>
          {assuntosSelecionadosResumo ? (
            <p className="text-xs text-default-500">
              Selecionados: {assuntosSelecionadosResumo}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            {canQuickCreateCatalog ? (
              <Button
                color="secondary"
                size="sm"
                variant="light"
                onPress={onOpenCauseModal}
              >
                Nao encontrou o assunto? Criar agora
              </Button>
            ) : null}
            <Button
              as={Link}
              color="secondary"
              href="/causas"
              size="sm"
              variant="light"
            >
              Gerenciar assuntos processuais
            </Button>
          </div>
        </div>

        <Select
          description="Classificacao por area de atuacao do escritorio."
          isClearable
          isLoading={isLoadingAreas}
          label="Area do processo"
          placeholder="Selecione uma area"
          selectedKeys={selectedAreaKeys}
          onSelectionChange={(keys) => {
            const selectedKey = Array.from(keys)[0] as string | undefined;
            const nextArea = areas.find((area) => area.id === selectedKey);
            const shouldClearProcedimento = !isProcedimentoCompatibleWithArea({
              areaSlug: nextArea?.slug,
              procedimentoProcessual: value.procedimentoProcessual ?? null,
            });

            onPatch({
              areaId: selectedKey || undefined,
              ...(shouldClearProcedimento
                ? { procedimentoProcessual: undefined }
                : {}),
            });
          }}
        >
          {areas.map((area) => (
            <SelectItem key={area.id} textValue={area.nome}>
              {area.nome}
            </SelectItem>
          ))}
        </Select>
        {canQuickCreateArea ? (
          <div className="flex justify-end">
            <Button
              color="secondary"
              size="sm"
              variant="light"
              onPress={onOpenAreaModal}
            >
              Nao encontrou a area? Criar agora
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          description="Etapa do processo para orientar prazos e prioridade."
          label="Fase processual"
          placeholder="Selecione a fase"
          selectedKeys={value.fase ? [value.fase] : []}
          startContent={<Flag className="h-4 w-4 text-default-400" />}
          onSelectionChange={(keys) => {
            const key = Array.from(keys)[0];
            onPatch({
              fase: key ? (key as ProcessoFase) : undefined,
            });
          }}
        >
          {fases.map((fase) => (
            <SelectItem key={fase} textValue={getFaseLabel(fase)}>
              {getFaseLabel(fase)}
            </SelectItem>
          ))}
        </Select>

        <Select
          description={grauDescription}
          label="Grau"
          placeholder="Selecione o grau"
          selectedKeys={value.grau ? [value.grau] : []}
          startContent={<Layers className="h-4 w-4 text-default-400" />}
          onSelectionChange={(keys) => {
            const key = Array.from(keys)[0];
            onPatch({
              grau: key ? (key as ProcessoGrau) : undefined,
            });
          }}
        >
          {graus.map((grau) => (
            <SelectItem key={grau} textValue={formatGrauLabel(grau)}>
              {formatGrauLabel(grau)}
            </SelectItem>
          ))}
        </Select>
      </div>

      <SearchableSelect
        allowsCustomValue
        customValue={value.orgaoJulgador || ""}
        description="Informe o orgao julgador institucional. Voce pode usar sigla, nome completo ou texto livre."
        emptyContent="Nenhuma sugestao encontrada. Voce pode manter o texto digitado."
        isLoading={isLoadingTribunais}
        isVirtualized={false}
        items={tribunalOptions}
        label="Orgao julgador"
        placeholder="Digite a sigla, o nome ou o orgao julgador"
        selectedKey={selectedOrgaoJulgadorKey}
        startContent={<Landmark className="h-4 w-4 text-default-400" />}
        onCustomValueChange={(orgaoJulgador) => onPatch({ orgaoJulgador })}
        onSelectionChange={(selectedKey) =>
          onPatch({
            orgaoJulgador:
              tribunalOptions.find((item) => item.key === selectedKey)?.label ||
              "",
          })
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          description={
            procedimentoRequired
              ? "Selecione o rito ou procedimento compativel com a area escolhida."
              : "Selecione primeiro uma area com procedimento configurado."
          }
          isDisabled={procedimentoOptions.length === 0}
          isRequired={procedimentoRequired}
          label="Rito / Procedimento da area"
          placeholder={
            procedimentoOptions.length > 0
              ? "Selecione o rito / procedimento"
              : "Sem opcoes para esta area"
          }
          selectedKeys={
            value.procedimentoProcessual
              ? [value.procedimentoProcessual]
              : []
          }
          onSelectionChange={(keys) => {
            const key = Array.from(keys)[0];
            onPatch({
              procedimentoProcessual: key
                ? (key as ProcedimentoProcessual)
                : undefined,
            });
          }}
        >
          {procedimentoOptions.map((option) => (
            <SelectItem key={option.value} textValue={option.label}>
              {option.label}
            </SelectItem>
          ))}
        </Select>

        <Input
          description="Valor economico da acao, quando houver."
          label="Valor da Causa (R$)"
          placeholder="0,00"
          startContent={<DollarSign className="h-4 w-4 text-default-400" />}
          type="number"
          value={
            value.valorCausa !== undefined && !Number.isNaN(value.valorCausa)
              ? String(value.valorCausa)
              : ""
          }
          onValueChange={(nextValue) => {
            const normalized = nextValue.replace(/,/g, ".");
            const numericValue =
              normalized.trim() === "" ? undefined : Number(normalized);

            onPatch({
              valorCausa:
                numericValue !== undefined && !Number.isNaN(numericValue)
                  ? numericValue
                  : undefined,
            });
          }}
        />
      </div>
    </div>
  );
}
