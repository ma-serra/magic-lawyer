import useSWR from "swr";

import {
  type ContratoListFilters,
  type ContratoListPaginatedResult,
  getAllContratos,
  getContratoById,
  getContratosPaginated,
  getContratosComParcelas,
} from "@/app/actions/contratos";

/**
 * Hook para buscar todos os contratos do tenant
 */
export function useAllContratos() {
  const { data, error, isLoading, mutate } = useSWR(
    "contratos-all",
    async () => {
      const result = await getAllContratos();

      if (!result.success) {
        throw new Error(result.error || "Erro ao carregar contratos");
      }

      return result.contratos || [];
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    },
  );

  return {
    contratos: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
    refresh: mutate,
  };
}

/**
 * Hook para buscar contratos com paginação server-side
 */
export function useContratosPaginated(params: {
  page: number;
  pageSize: number;
  filtros?: ContratoListFilters;
}) {
  const { page, pageSize, filtros } = params;
  const key = [
    "contratos-paginated",
    page,
    pageSize,
    filtros?.search ?? "",
    filtros?.status ?? "",
    filtros?.clienteId ?? "",
    filtros?.advogadoId ?? "",
    filtros?.tipoId ?? "",
    filtros?.modeloId ?? "",
    String(filtros?.comArquivo ?? ""),
    String(filtros?.valorMin ?? ""),
    String(filtros?.valorMax ?? ""),
    filtros?.ordenacao ?? "recente",
  ];

  const { data, error, isLoading, mutate } = useSWR<ContratoListPaginatedResult>(
    key,
    async () => {
      const result = await getContratosPaginated({
        page,
        pageSize,
        filtros,
      });

      if (!result.success || !result.data) {
        throw new Error(result.error || "Erro ao carregar contratos");
      }

      return result.data;
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    },
  );

  return {
    data,
    contratos: data?.items ?? [],
    metrics: data?.metrics,
    pagination: data
      ? {
          page: data.page,
          pageSize: data.pageSize,
          total: data.total,
          totalPages: data.totalPages,
        }
      : undefined,
    isLoading,
    isError: !!error,
    error,
    mutate,
    refresh: mutate,
  };
}

/**
 * Hook para buscar um contrato específico
 */
export function useContratoDetalhado(contratoId: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    contratoId ? `contrato-${contratoId}` : null,
    async () => {
      if (!contratoId) return null;

      const result = await getContratoById(contratoId);

      if (!result.success) {
        throw new Error(result.error || "Erro ao carregar contrato");
      }

      return result.contrato || null;
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    },
  );

  return {
    contrato: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
    refresh: mutate,
  };
}

/**
 * Hook para buscar contratos com informações de parcelas
 */
export function useContratosComParcelas() {
  const { data, error, isLoading, mutate } = useSWR(
    "contratos-com-parcelas",
    async () => {
      const result = await getContratosComParcelas();

      if (!result.success) {
        throw new Error(result.error || "Erro ao carregar contratos");
      }

      return result.contratos || [];
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    },
  );

  return {
    contratos: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
    refresh: mutate,
  };
}
