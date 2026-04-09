"use client";

import Link from "next/link";
import {
  useDeferredValue,
  useMemo,
  useState,
  type KeyboardEvent,
} from "react";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Plus, Search, X } from "lucide-react";

type CausaOption = {
  id: string;
  nome: string;
  codigoCnj?: string | null;
};

type ProcessCauseSelectorProps = {
  causas: CausaOption[];
  selectedCauseIds: string[];
  isLoading?: boolean;
  canQuickCreateCatalog?: boolean;
  onChange: (nextIds: string[]) => void;
  onOpenCreate: (prefill?: string) => void;
};

function normalizeCauseSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function ProcessCauseSelector({
  causas,
  selectedCauseIds,
  isLoading = false,
  canQuickCreateCatalog = false,
  onChange,
  onOpenCreate,
}: ProcessCauseSelectorProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const selectedCauseIdSet = useMemo(
    () => new Set(selectedCauseIds),
    [selectedCauseIds],
  );
  const selectedCauses = useMemo(
    () => causas.filter((causa) => selectedCauseIdSet.has(causa.id)),
    [causas, selectedCauseIdSet],
  );
  const filteredCauses = useMemo(() => {
    const normalizedQuery = normalizeCauseSearchText(deferredQuery);

    return causas.filter((causa) => {
      if (selectedCauseIdSet.has(causa.id)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = normalizeCauseSearchText(
        [causa.nome, causa.codigoCnj || ""].filter(Boolean).join(" "),
      );

      return haystack.includes(normalizedQuery);
    });
  }, [causas, deferredQuery, selectedCauseIdSet]);

  const trimmedQuery = query.trim();

  const handleAddCause = (causaId: string) => {
    if (selectedCauseIdSet.has(causaId)) {
      return;
    }

    onChange([...selectedCauseIds, causaId]);
    setQuery("");
  };

  const handleRemoveCause = (causaId: string) => {
    onChange(selectedCauseIds.filter((item) => item !== causaId));
  };

  const handleCreateCause = (prefill?: string) => {
    onOpenCreate(prefill?.trim() || undefined);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    if (filteredCauses.length > 0) {
      handleAddCause(filteredCauses[0].id);
      return;
    }

    if (canQuickCreateCatalog && trimmedQuery) {
      handleCreateCause(trimmedQuery);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-default-700">
            Assuntos do processo
          </div>
          <p className="text-xs text-default-500">
            Temas juridicos do caso. Busque, adicione e remova assuntos sem sair
            do formulario.
          </p>
        </div>

        {canQuickCreateCatalog ? (
          <Button
            color="secondary"
            size="sm"
            startContent={<Plus className="h-4 w-4" />}
            variant="flat"
            onPress={() => handleCreateCause(trimmedQuery)}
          >
            Criar assunto
          </Button>
        ) : null}
      </div>

      <Input
        description="Digite para buscar assuntos existentes e pressione Enter para adicionar o primeiro resultado."
        label="Buscar assunto"
        placeholder="Ex: responsabilidade civil, dano moral, consumidor"
        startContent={<Search className="h-4 w-4 text-default-400" />}
        value={query}
        onKeyDown={handleKeyDown}
        onValueChange={setQuery}
      />

      <div className="rounded-xl border border-default-200 bg-content2/40 p-3">
        <div className="flex flex-wrap gap-2">
          {selectedCauses.length > 0 ? (
            selectedCauses.map((causa) => (
              <button
                key={causa.id}
                aria-label={`Remover ${causa.nome}`}
                className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition hover:border-primary/40 hover:bg-primary/15"
                type="button"
                onClick={() => handleRemoveCause(causa.id)}
              >
                <span>{causa.nome}</span>
                <X className="h-3.5 w-3.5" />
              </button>
            ))
          ) : (
            <p className="text-xs text-default-500">
              Nenhum assunto selecionado ainda.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-default-200 bg-content1 p-2">
        {isLoading ? (
          <p className="px-2 py-3 text-sm text-default-500">
            Carregando assuntos...
          </p>
        ) : filteredCauses.length > 0 ? (
          <div className="max-h-64 overflow-y-auto">
            {filteredCauses.slice(0, 12).map((causa) => (
              <button
                key={causa.id}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-default-100"
                type="button"
                onClick={() => handleAddCause(causa.id)}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-default-700">
                    {causa.nome}
                  </div>
                  {causa.codigoCnj ? (
                    <div className="text-xs text-default-500">
                      Codigo CNJ: {causa.codigoCnj}
                    </div>
                  ) : null}
                </div>
                <Plus className="h-4 w-4 shrink-0 text-default-400" />
              </button>
            ))}
          </div>
        ) : trimmedQuery ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-2 py-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-default-700">
                Nenhum assunto encontrado para "{trimmedQuery}"
              </p>
              <p className="text-xs text-default-500">
                Voce pode ajustar a busca ou criar esse assunto agora.
              </p>
            </div>

            {canQuickCreateCatalog ? (
              <Button
                color="secondary"
                size="sm"
                variant="flat"
                onPress={() => handleCreateCause(trimmedQuery)}
              >
                Criar assunto "{trimmedQuery}"
              </Button>
            ) : (
              <span className="text-xs text-default-500">
                Sem permissao para criar assunto neste perfil.
              </span>
            )}
          </div>
        ) : (
          <div className="px-2 py-3 text-sm text-default-500">
            Digite para buscar um assunto existente.
          </div>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        {canQuickCreateCatalog ? (
          <Button
            color="secondary"
            size="sm"
            variant="light"
            onPress={() => handleCreateCause(trimmedQuery)}
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
  );
}
