import { ProcessoPrazoStatus } from "@/generated/prisma";

export type PrazoWorkspaceLike = {
  status: ProcessoPrazoStatus | string;
  dataVencimento: Date | string;
  responsavelId?: string | null;
};

export type PrazoOperationalBucket =
  | "overdue"
  | "today"
  | "next_7d"
  | "next_30d"
  | "future"
  | "completed"
  | "canceled";

export type PrazoWorkspaceSummary = {
  total: number;
  abertos: number;
  vencidos: number;
  venceHoje: number;
  proximos7Dias: number;
  proximos30Dias: number;
  concluidos: number;
  semResponsavel: number;
};

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

export function getPrazoDaysRemaining(
  dataVencimento: Date | string,
  now = new Date(),
) {
  const target = startOfDay(toDate(dataVencimento));
  const today = startOfDay(now);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function getPrazoOperationalBucket(
  prazo: PrazoWorkspaceLike,
  now = new Date(),
): PrazoOperationalBucket {
  if (prazo.status === ProcessoPrazoStatus.CONCLUIDO) {
    return "completed";
  }

  if (prazo.status === ProcessoPrazoStatus.CANCELADO) {
    return "canceled";
  }

  const dueDate = toDate(prazo.dataVencimento);
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);
  const daysRemaining = getPrazoDaysRemaining(dueDate, now);

  if (dueDate < dayStart) {
    return "overdue";
  }

  if (dueDate >= dayStart && dueDate <= dayEnd) {
    return "today";
  }

  if (daysRemaining <= 7) {
    return "next_7d";
  }

  if (daysRemaining <= 30) {
    return "next_30d";
  }

  return "future";
}

export function buildPrazoWorkspaceSummary(
  items: PrazoWorkspaceLike[],
  now = new Date(),
): PrazoWorkspaceSummary {
  return items.reduce<PrazoWorkspaceSummary>(
    (acc, prazo) => {
      acc.total += 1;

      const bucket = getPrazoOperationalBucket(prazo, now);

      if (
        prazo.status === ProcessoPrazoStatus.ABERTO ||
        prazo.status === ProcessoPrazoStatus.PRORROGADO
      ) {
        acc.abertos += 1;
      }

      if (bucket === "completed") {
        acc.concluidos += 1;
      }

      if (bucket === "overdue") {
        acc.vencidos += 1;
      }

      if (bucket === "today") {
        acc.venceHoje += 1;
      }

      if (bucket === "next_7d") {
        acc.proximos7Dias += 1;
      }

      if (bucket === "next_30d") {
        acc.proximos30Dias += 1;
      }

      if (
        (prazo.status === ProcessoPrazoStatus.ABERTO ||
          prazo.status === ProcessoPrazoStatus.PRORROGADO) &&
        !prazo.responsavelId
      ) {
        acc.semResponsavel += 1;
      }

      return acc;
    },
    {
      total: 0,
      abertos: 0,
      vencidos: 0,
      venceHoje: 0,
      proximos7Dias: 0,
      proximos30Dias: 0,
      concluidos: 0,
      semResponsavel: 0,
    },
  );
}

export function formatPrazoRelativeLabel(
  dataVencimento: Date | string,
  status: ProcessoPrazoStatus | string,
  now = new Date(),
) {
  if (status === ProcessoPrazoStatus.CONCLUIDO) {
    return "Concluído";
  }

  if (status === ProcessoPrazoStatus.CANCELADO) {
    return "Cancelado";
  }

  const daysRemaining = getPrazoDaysRemaining(dataVencimento, now);

  if (daysRemaining === 0) {
    return "Vence hoje";
  }

  if (daysRemaining === 1) {
    return "Vence amanhã";
  }

  if (daysRemaining > 1) {
    return `Vence em ${daysRemaining} dias`;
  }

  if (daysRemaining === -1) {
    return "Venceu ontem";
  }

  return `${Math.abs(daysRemaining)} dias em atraso`;
}
