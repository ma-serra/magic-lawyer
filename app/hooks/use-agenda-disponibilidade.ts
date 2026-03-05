import useSWR from "swr";

import {
  getMinhaDisponibilidadeAgenda,
  type AgendaDisponibilidadeView,
} from "@/app/actions/agenda-disponibilidade";

const EMPTY_SCHEDULE: AgendaDisponibilidadeView[] = [];

export function useAgendaDisponibilidade(enabled: boolean = true) {
  const { data, error, isLoading, mutate } = useSWR(
    enabled ? "agenda-disponibilidade" : null,
    () => getMinhaDisponibilidadeAgenda(),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    },
  );

  return {
    disponibilidade:
      data?.success && Array.isArray(data.data) ? data.data : EMPTY_SCHEDULE,
    fromDefault: data?.success ? !!data.fromDefault : false,
    isLoading,
    error: error || (data?.success === false ? data.error : null),
    mutate,
  };
}
