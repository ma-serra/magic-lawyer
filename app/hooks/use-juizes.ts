import type {
  JuizDetalhado,
  ProcessoJuiz,
  JulgamentoJuiz,
  JuizSerializado,
  JuizFormOptions,
  JuizFilters,
  JuizCatalogoOpcao,
  ProcessoVinculoAutoridade,
} from "@/app/actions/juizes";

import useSWR from "swr";

import {
  getJuizDetalhado,
  getProcessosDoJuiz,
  getJulgamentosDoJuiz,
  getJuizFormData,
  getJuizes,
  buscarJuizesCatalogoPorNome,
  getProcessosParaVinculoAutoridade,
  verificarFavoritoJuiz,
} from "@/app/actions/juizes";

/**
 * Hook para buscar detalhes completos de um juiz
 */
export function useJuizDetalhado(juizId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<JuizDetalhado | null>(
    juizId ? `juiz-${juizId}` : null,
    async () => {
      if (!juizId) return null;
      const result = await getJuizDetalhado(juizId);

      if (!result.success) {
        throw new Error(result.error || "Erro ao carregar juiz");
      }

      return result.juiz || null;
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    },
  );

  return {
    juiz: data ?? null,
    isLoading,
    isError: !!error,
    error,
    mutate,
    refresh: mutate,
  };
}

/**
 * Hook para buscar processos de um juiz
 */
export function useProcessosDoJuiz(juizId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<ProcessoJuiz[] | null>(
    juizId ? `processos-juiz-${juizId}` : null,
    async () => {
      if (!juizId) return null;
      const result = await getProcessosDoJuiz(juizId);

      if (!result.success) {
        throw new Error(result.error || "Erro ao carregar processos do juiz");
      }

      return result.processos || [];
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    },
  );

  return {
    processos: data ?? [],
    isLoading,
    isError: !!error,
    error,
    mutate,
    refresh: mutate,
  };
}

/**
 * Hook para buscar julgamentos de um juiz
 */
export function useJulgamentosDoJuiz(juizId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<JulgamentoJuiz[] | null>(
    juizId ? `julgamentos-juiz-${juizId}` : null,
    async () => {
      if (!juizId) return null;
      const result = await getJulgamentosDoJuiz(juizId);

      if (!result.success) {
        throw new Error(result.error || "Erro ao carregar julgamentos do juiz");
      }

      return result.julgamentos || [];
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    },
  );

  return {
    julgamentos: data ?? [],
    isLoading,
    isError: !!error,
    error,
    mutate,
    refresh: mutate,
  };
}

/**
 * Hook para buscar opções do formulário de juízes
 */
export function useJuizFormData() {
  const { data, error, isLoading, mutate } = useSWR<JuizFormOptions | null>(
    "juiz-form-data",
    async () => {
      const result = await getJuizFormData();

      if (!result.success) {
        throw new Error(result.error || "Erro ao carregar dados do formulário");
      }

      return result.data || null;
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    },
  );

  return {
    formData: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
    refresh: mutate,
  };
}

/**
 * Hook para buscar lista de juízes com filtros
 */
export function useJuizes(filters: JuizFilters = {}) {
  const { data, error, isLoading, mutate } = useSWR<JuizSerializado[] | null>(
    `juizes-${JSON.stringify(filters)}`,
    async () => {
      const result = await getJuizes(filters);

      if (!result.success) {
        throw new Error(result.error || "Erro ao carregar juízes");
      }

      return result.data || [];
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    },
  );

  return {
    juizes: data ?? [],
    isLoading,
    isError: !!error,
    error,
    mutate,
    refresh: mutate,
  };
}

/**
 * Hook para buscar catálogo global de nomes de juízes
 * Retorna apenas nome + id para vínculo (sem detalhes sensíveis).
 */
export function useJuizesCatalogoPorNome(search: string, enabled = true) {
  const normalized = search.trim();
  const key =
    enabled && normalized.length >= 3 ? `juizes-catalogo-${normalized}` : null;

  const { data, error, isLoading, mutate } = useSWR<JuizCatalogoOpcao[] | null>(
    key,
    async () => {
      const result = await buscarJuizesCatalogoPorNome(normalized);

      if (!result.success) {
        throw new Error(result.error || "Erro ao buscar catálogo de juízes");
      }

      return result.data || [];
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    },
  );

  return {
    opcoes: data ?? [],
    isLoading,
    isError: !!error,
    error,
    mutate,
    refresh: mutate,
  };
}

/**
 * Hook para verificar se um juiz é favorito
 */
export function useFavoritoJuiz(juizId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<boolean>(
    juizId ? `favorito-juiz-${juizId}` : null,
    async () => {
      if (!juizId) return false;
      const result = await verificarFavoritoJuiz(juizId);

      if (!result.success) {
        return false;
      }

      return result.isFavorito || false;
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    },
  );

  return {
    isFavorito: data ?? false,
    isLoading,
    isError: !!error,
    error,
    mutate,
    refresh: mutate,
  };
}

/**
 * Hook para buscar processos visíveis para vínculo com autoridade.
 */
export function useProcessosParaVinculoAutoridade(
  juizId: string | null,
  enabled = true,
) {
  const key = enabled && juizId ? `processos-vinculo-autoridade-${juizId}` : null;

  const { data, error, isLoading, mutate } = useSWR<
    ProcessoVinculoAutoridade[] | null
  >(
    key,
    async () => {
      if (!juizId) return [];
      const result = await getProcessosParaVinculoAutoridade(juizId);

      if (!result.success) {
        throw new Error(result.error || "Erro ao carregar processos");
      }

      return result.processos || [];
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    },
  );

  return {
    processos: data ?? [],
    isLoading,
    isError: !!error,
    error,
    mutate,
    refresh: mutate,
  };
}
