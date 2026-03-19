export type DeadlineDigestItem = {
  prazoId: string;
  processoId: string;
  processoNumero: string;
  clienteNome: string | null;
  titulo: string | null;
  dataVencimento: string;
};

export type DeadlineDigestPayload = {
  diasRestantes: number;
  digestDate: string;
  digestKey: string;
  totalPrazos: number;
  resumoPrazos: string;
  prazos: DeadlineDigestItem[];
  frentePrazo?: string | null;
  frentePrazoLabel?: string;
};

function formatDigestDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
  }).format(date);
}

function compareDigestItems(a: DeadlineDigestItem, b: DeadlineDigestItem) {
  const dateDiff =
    new Date(a.dataVencimento).getTime() - new Date(b.dataVencimento).getTime();

  if (dateDiff !== 0) {
    return dateDiff;
  }

  return `${a.clienteNome ?? ""}${a.processoNumero}${a.titulo ?? ""}`.localeCompare(
    `${b.clienteNome ?? ""}${b.processoNumero}${b.titulo ?? ""}`,
    "pt-BR",
  );
}

export function buildDeadlineDigestSummary(items: DeadlineDigestItem[]) {
  return [...items]
    .sort(compareDigestItems)
    .map((item) => {
      const parts = [
        item.clienteNome?.trim() || "Cliente não informado",
        `Processo ${item.processoNumero}`,
        `Prazo final ${formatDigestDate(item.dataVencimento)}`,
      ];

      if (item.titulo?.trim()) {
        parts.push(item.titulo.trim());
      }

      return `• ${parts.join(" - ")}`;
    })
    .join("\n");
}

export function buildDeadlineDigestPayload(params: {
  daysRemaining: number;
  digestDate: string;
  items: DeadlineDigestItem[];
}): DeadlineDigestPayload {
  const sortedItems = [...params.items].sort(compareDigestItems);
  const resumoPrazos = buildDeadlineDigestSummary(sortedItems);

  return {
    diasRestantes: params.daysRemaining,
    digestDate: params.digestDate,
    digestKey: `prazo.digest_${params.daysRemaining}d:${params.digestDate}`,
    totalPrazos: sortedItems.length,
    resumoPrazos,
    prazos: sortedItems,
  };
}
