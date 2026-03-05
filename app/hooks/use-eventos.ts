import useSWR from "swr";

import {
  getEventos,
  getEventoById,
  getEventoFormData,
  type EventoListMeta,
} from "@/app/actions/eventos";

// Hook para buscar eventos
export function useEventos(filters?: {
  dataInicio?: Date;
  dataFim?: Date;
  status?: string;
  tipo?: string;
  clienteId?: string;
  processoId?: string;
  advogadoId?: string;
  local?: string;
  titulo?: string;
  origem?: "google" | "local";
},
options?: {
  page?: number;
  pageSize?: number;
  enabled?: boolean;
}) {
  const enabled = options?.enabled ?? true;
  const { data, error, isLoading, mutate } = useSWR(
    enabled ? ["eventos", filters, options?.page, options?.pageSize] : null,
    () =>
      getEventos(filters, {
        page: options?.page,
        pageSize: options?.pageSize,
      }),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      refreshInterval: 0,
    },
  );

  const defaultMeta: EventoListMeta = {
    total: 0,
    page: options?.page ?? 1,
    pageSize: options?.pageSize ?? 20,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  };

  return {
    eventos: data?.success ? data.data : [],
    meta: data?.success && data.meta ? data.meta : defaultMeta,
    isLoading,
    error: error || (data?.success === false ? data.error : null),
    mutate,
  };
}

// Hook para buscar evento específico
export function useEvento(id: string) {
  const { data, error, isLoading, mutate } = useSWR(
    id ? ["evento", id] : null,
    () => getEventoById(id),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    },
  );

  return {
    evento: data?.success ? data.data : null,
    isLoading,
    error: error || (data?.success === false ? data.error : null),
    mutate,
  };
}

// Hook para dados do formulário
export function useEventoFormData() {
  const { data, error, isLoading, mutate } = useSWR(
    "evento-form-data",
    getEventoFormData,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    },
  );

  return {
    formData: data?.success
      ? data.data
      : { processos: [], clientes: [], advogados: [] },
    isLoading,
    error: error || (data?.success === false ? data.error : null),
    mutate,
  };
}

// Hook para eventos do dia atual
export function useEventosHoje() {
  const hoje = new Date();
  const inicioDia = new Date(
    hoje.getFullYear(),
    hoje.getMonth(),
    hoje.getDate(),
  );
  const fimDia = new Date(
    hoje.getFullYear(),
    hoje.getMonth(),
    hoje.getDate() + 1,
  );

  return useEventos({
    dataInicio: inicioDia,
    dataFim: fimDia,
  });
}

// Hook para eventos da semana atual
export function useEventosSemana() {
  const hoje = new Date();
  const inicioSemana = new Date(hoje);

  inicioSemana.setDate(hoje.getDate() - hoje.getDay()); // Domingo
  inicioSemana.setHours(0, 0, 0, 0);

  const fimSemana = new Date(inicioSemana);

  fimSemana.setDate(inicioSemana.getDate() + 7); // Próximo domingo

  return useEventos({
    dataInicio: inicioSemana,
    dataFim: fimSemana,
  });
}

// Hook para eventos do mês atual
export function useEventosMes() {
  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);

  return useEventos({
    dataInicio: inicioMes,
    dataFim: fimMes,
  });
}
