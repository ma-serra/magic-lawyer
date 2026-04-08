import type { Evento } from "@/generated/prisma";

import { DateUtils, dayjs } from "@/app/lib/date-utils";

export interface AgendaDayGroup<T extends Pick<Evento, "dataInicio">> {
  key: string;
  date: Date;
  label: string;
  contextualLabel: string | null;
  eventos: T[];
}

function capitalize(value: string) {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function buildAgendaMonthRange(referenceDate: Date) {
  return {
    start: DateUtils.startOfMonth(referenceDate).startOf("day").toDate(),
    end: DateUtils.endOfMonth(referenceDate).endOf("day").toDate(),
  };
}

export function formatAgendaMonthLabel(referenceDate: Date) {
  return capitalize(
    new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
    }).format(referenceDate),
  );
}

export function formatAgendaDayLabel(date: Date) {
  return capitalize(
    new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    }).format(date),
  );
}

export function getAgendaDayContextualLabel(date: Date) {
  if (DateUtils.isToday(date)) {
    return "Hoje";
  }

  if (DateUtils.isTomorrow(date)) {
    return "Amanhã";
  }

  if (DateUtils.isYesterday(date)) {
    return "Ontem";
  }

  return null;
}

export function groupEventosByDay<T extends Pick<Evento, "dataInicio">>(
  eventos: T[],
): AgendaDayGroup<T>[] {
  const grouped = new Map<string, AgendaDayGroup<T>>();

  for (const evento of eventos) {
    const eventDate = dayjs(evento.dataInicio).toDate();
    const key = dayjs(eventDate).format("YYYY-MM-DD");
    const existingGroup = grouped.get(key);

    if (existingGroup) {
      existingGroup.eventos.push(evento);
      continue;
    }

    grouped.set(key, {
      key,
      date: eventDate,
      label: formatAgendaDayLabel(eventDate),
      contextualLabel: getAgendaDayContextualLabel(eventDate),
      eventos: [evento],
    });
  }

  return Array.from(grouped.values()).sort((left, right) =>
    left.date.getTime() - right.date.getTime(),
  );
}
