import type { DashboardData } from "@/app/actions/dashboard";

import useSWR from "swr";

import { getDashboardData } from "@/app/actions/dashboard";

export function useDashboardData() {
  const { data, error, isLoading, mutate } = useSWR<DashboardData>(
    "dashboard-data",
    async () => {
      const response = await getDashboardData();

      if (!response.success || !response.data) {
        throw new Error(
          response.error || "Não foi possível carregar o dashboard",
        );
      }

      return response.data;
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    },
  );

  return {
    data,
    role: data?.role ?? null,
    stats: data?.stats ?? [],
    insights: data?.insights ?? [],
    highlights: data?.highlights ?? [],
    pending: data?.pending ?? [],
    trends: data?.trends ?? [],
    alerts: data?.alerts ?? [],
    activity: data?.activity ?? [],
    geographicOverview: data?.geographicOverview ?? null,
    isLoading,
    isError: !!error,
    error,
    mutate,
    refresh: mutate,
  };
}
