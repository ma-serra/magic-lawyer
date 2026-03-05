import useSWR from "swr";

import {
  getMetricasFinanceiras,
  getGraficoParcelas,
  getHonorariosPorAdvogado,
  getDadosBancariosAtivos,
  getAdvogadosAtivos,
  getClientesAtivos,
  getVisoesFinanceiras,
  type MetricasFinanceiras,
  type GraficoParcelas,
  type HonorariosPorAdvogado,
  type VisoesFinanceiras,
  type FiltrosDashboard,
} from "@/app/actions/dashboard-financeiro";

// ============================================
// HOOKS PARA MÉTRICAS FINANCEIRAS
// ============================================

export function useMetricasFinanceiras(filtros?: FiltrosDashboard) {
  const { data, error, isLoading, mutate } = useSWR<MetricasFinanceiras>(
    ["metricas-financeiras", filtros],
    () => getMetricasFinanceiras(filtros),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      refreshInterval: 0,
    },
  );

  return {
    metricas: data,
    isLoading,
    error,
    mutate,
  };
}

export function useGraficoParcelas(filtros?: FiltrosDashboard) {
  const { data, error, isLoading, mutate } = useSWR<GraficoParcelas[]>(
    ["grafico-parcelas", filtros],
    () => getGraficoParcelas(filtros),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      refreshInterval: 0,
    },
  );

  return {
    grafico: data || [],
    isLoading,
    error,
    mutate,
  };
}

export function useHonorariosPorAdvogado(filtros?: FiltrosDashboard) {
  const { data, error, isLoading, mutate } = useSWR<HonorariosPorAdvogado[]>(
    ["honorarios-advogado", filtros],
    () => getHonorariosPorAdvogado(filtros),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      refreshInterval: 0,
    },
  );

  return {
    honorarios: data || [],
    isLoading,
    error,
    mutate,
  };
}

// ============================================
// HOOKS PARA DADOS AUXILIARES
// ============================================

export function useDadosBancariosAtivos() {
  const { data, error, isLoading, mutate } = useSWR(
    "dashboard-financeiro-dados-bancarios-ativos",
    getDadosBancariosAtivos,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      refreshInterval: 0,
    },
  );

  return {
    dadosBancarios: Array.isArray(data) ? data : [],
    isLoading,
    error,
    mutate,
  };
}

export function useAdvogadosAtivos() {
  const { data, error, isLoading, mutate } = useSWR(
    "advogados-ativos",
    getAdvogadosAtivos,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      refreshInterval: 0,
    },
  );

  return {
    advogados: Array.isArray(data) ? data : [],
    isLoading,
    error,
    mutate,
  };
}

export function useClientesAtivos() {
  const { data, error, isLoading, mutate } = useSWR(
    "clientes-ativos",
    getClientesAtivos,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      refreshInterval: 0,
    },
  );

  return {
    clientes: Array.isArray(data) ? data : [],
    isLoading,
    error,
    mutate,
  };
}

export function useVisoesFinanceiras(filtros?: FiltrosDashboard) {
  const { data, error, isLoading, mutate } = useSWR<VisoesFinanceiras>(
    ["visoes-financeiras", filtros],
    () => getVisoesFinanceiras(filtros),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      refreshInterval: 0,
    },
  );

  return {
    visoes: data || { porResponsavel: [], porCliente: [], porProcesso: [] },
    isLoading,
    error,
    mutate,
  };
}

// ============================================
// HOOK COMPOSTO PARA DASHBOARD COMPLETO
// ============================================

export function useDashboardFinanceiro(filtros?: FiltrosDashboard) {
  const metricas = useMetricasFinanceiras(filtros);
  const grafico = useGraficoParcelas(filtros);
  const honorarios = useHonorariosPorAdvogado(filtros);
  const dadosBancarios = useDadosBancariosAtivos();
  const advogados = useAdvogadosAtivos();
  const clientes = useClientesAtivos();
  const visoesFinanceiras = useVisoesFinanceiras(filtros);

  const isLoading =
    metricas.isLoading ||
    grafico.isLoading ||
    honorarios.isLoading ||
    dadosBancarios.isLoading ||
    advogados.isLoading ||
    clientes.isLoading ||
    visoesFinanceiras.isLoading;

  const error =
    metricas.error ||
    grafico.error ||
    honorarios.error ||
    dadosBancarios.error ||
    advogados.error ||
    clientes.error ||
    visoesFinanceiras.error;

  const mutate = () => {
    metricas.mutate();
    grafico.mutate();
    honorarios.mutate();
    dadosBancarios.mutate();
    advogados.mutate();
    clientes.mutate();
    visoesFinanceiras.mutate();
  };

  return {
    // Dados
    metricas: metricas.metricas,
    grafico: grafico.grafico,
    honorarios: honorarios.honorarios,
    dadosBancarios: Array.isArray(dadosBancarios.dadosBancarios)
      ? dadosBancarios.dadosBancarios
      : [],
    advogados: Array.isArray(advogados.advogados) ? advogados.advogados : [],
    clientes: Array.isArray(clientes.clientes) ? clientes.clientes : [],
    visoesFinanceiras: visoesFinanceiras.visoes,

    // Estados
    isLoading,
    error,
    mutate,
  };
}
