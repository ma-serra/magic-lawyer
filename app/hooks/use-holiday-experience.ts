"use client";

import useSWR from "swr";

import { getMyHolidayExperienceRollout } from "@/app/actions/admin-feriados";

export function useHolidayExperienceRollout() {
  const query = useSWR("holiday-experience-rollout", async () => {
    const response = await getMyHolidayExperienceRollout();

    if (!response.success || !response.data) {
      throw new Error(
        response.error ?? "Nao foi possivel carregar o rollout de feriados",
      );
    }

    return response.data;
  });

  return {
    rollout: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    mutate: query.mutate,
  };
}
