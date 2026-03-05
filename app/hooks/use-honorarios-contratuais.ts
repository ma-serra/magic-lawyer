import useSWR from "swr";

import {
  listHonorariosContratuais,
  getHonorarioContratual,
  getTiposHonorario,
  calcularValorHonorario,
  getDadosPagamentoHonorario,
} from "@/app/actions/honorarios-contratuais";

// Hook para listar honorários contratuais
export function useHonorariosContratuais(filters?: {
  contratoId?: string;
  contratoIds?: string[];
  tipo?: "FIXO" | "SUCESSO" | "HIBRIDO";
  ativo?: boolean;
  apenasMeusContratos?: boolean;
}) {
  const { data, error, isLoading, mutate } = useSWR(
    ["honorarios-contratuais", filters],
    () => listHonorariosContratuais(filters),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    },
  );

  return {
    honorarios: data?.data || [],
    isLoading,
    error: error,
    mutate,
  };
}

// Hook para buscar honorário específico
export function useHonorarioContratual(id: string) {
  const { data, error, isLoading, mutate } = useSWR(
    id ? ["honorario-contratual", id] : null,
    () => getHonorarioContratual(id),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    },
  );

  return {
    honorario: data?.data,
    isLoading,
    error: error,
    mutate,
  };
}

// Hook para tipos de honorário
export function useTiposHonorario() {
  const { data, error, isLoading } = useSWR(
    "tipos-honorario",
    getTiposHonorario,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );

  return {
    tipos: data?.data || [],
    isLoading,
    error: error,
  };
}

// Hook para calcular valor do honorário
export function useCalculoHonorario(honorarioId: string, valorBase?: number) {
  const { data, error, isLoading, mutate } = useSWR(
    honorarioId && valorBase
      ? ["calculo-honorario", honorarioId, valorBase]
      : null,
    () => calcularValorHonorario(honorarioId, valorBase),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );

  return {
    calculo: data?.data,
    isLoading,
    error: error,
    recalcular: mutate,
  };
}

// Hook para obter dados de pagamento do honorário
export function useDadosPagamentoHonorario(honorarioId: string) {
  const { data, error, isLoading, mutate } = useSWR(
    honorarioId ? ["dados-pagamento-honorario", honorarioId] : null,
    () => getDadosPagamentoHonorario(honorarioId),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    },
  );

  return {
    dadosPagamento: data?.success ? data.data : null,
    isLoading,
    error: error,
    recarregar: mutate,
  };
}
