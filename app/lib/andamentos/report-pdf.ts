import { jsPDF } from "jspdf";

type AndamentoReportPdfItem = {
  titulo: string;
  descricao?: string | null;
  tipo?: string | null;
  statusOperacional?: string | null;
  prioridade?: string | null;
  dataMovimentacao: Date;
  prazo?: Date | null;
  slaEm?: Date | null;
  processoNumero: string;
  processoTitulo?: string | null;
  criadoPorNome?: string | null;
  responsavelNome?: string | null;
};

type AndamentoReportPdfInput = {
  clienteNome: string;
  periodoLabel: string;
  resumoLabel: string;
  generatedAt?: Date;
  itens: AndamentoReportPdfItem[];
};

function formatDate(value?: Date | null) {
  if (!value) {
    return "Nao informado";
  }

  return new Date(value).toLocaleDateString("pt-BR");
}

function normalizeText(value?: string | null) {
  if (!value) {
    return "";
  }

  return value
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

export function gerarPdfRelatorioAndamentosBuffer(
  input: AndamentoReportPdfInput,
): Buffer {
  const doc = new jsPDF({
    unit: "pt",
    format: "a4",
  });

  const margin = 42;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - margin * 2;
  let cursorY = margin;

  const ensureSpace = (requiredHeight = 20) => {
    if (cursorY + requiredHeight <= pageHeight - margin) {
      return;
    }

    doc.addPage();
    cursorY = margin;
  };

  const addWrappedText = (
    text: string,
    options?: {
      fontSize?: number;
      weight?: "normal" | "bold";
      gapAfter?: number;
    },
  ) => {
    const fontSize = options?.fontSize ?? 10;
    const gapAfter = options?.gapAfter ?? 8;
    const lines = doc.splitTextToSize(text, usableWidth);
    const lineHeight = fontSize + 4;

    ensureSpace(lines.length * lineHeight + gapAfter);
    doc.setFont("helvetica", options?.weight ?? "normal");
    doc.setFontSize(fontSize);

    lines.forEach((line: string) => {
      doc.text(line, margin, cursorY);
      cursorY += lineHeight;
    });

    cursorY += gapAfter;
  };

  const addDivider = () => {
    ensureSpace(16);
    doc.setDrawColor(210);
    doc.line(margin, cursorY, pageWidth - margin, cursorY);
    cursorY += 14;
  };

  addWrappedText("Relatorio de andamentos do cliente", {
    fontSize: 18,
    weight: "bold",
    gapAfter: 4,
  });
  addWrappedText(`Cliente: ${input.clienteNome}`, {
    fontSize: 11,
    weight: "bold",
    gapAfter: 2,
  });
  addWrappedText(`Periodo: ${input.periodoLabel}`, {
    fontSize: 10,
    gapAfter: 2,
  });
  addWrappedText(input.resumoLabel, {
    fontSize: 10,
    gapAfter: 2,
  });
  addWrappedText(
    `Gerado em ${new Date(input.generatedAt ?? new Date()).toLocaleString("pt-BR")}`,
    {
      fontSize: 9,
      gapAfter: 10,
    },
  );

  addDivider();

  if (input.itens.length === 0) {
    addWrappedText("Nenhum andamento encontrado para os filtros selecionados.", {
      fontSize: 11,
    });
  } else {
    input.itens.forEach((item, index) => {
      addWrappedText(
        `${index + 1}. ${normalizeText(item.titulo) || "Andamento sem titulo"}`,
        {
          fontSize: 12,
          weight: "bold",
          gapAfter: 2,
        },
      );

      const processoLabel = item.processoTitulo
        ? `${item.processoNumero} - ${item.processoTitulo}`
        : item.processoNumero;

      addWrappedText(`Processo: ${processoLabel}`, {
        fontSize: 10,
        gapAfter: 2,
      });
      addWrappedText(
        `Data: ${formatDate(item.dataMovimentacao)} | Tipo: ${item.tipo || "Nao informado"} | Status: ${item.statusOperacional || "Nao informado"} | Prioridade: ${item.prioridade || "Nao informada"}`,
        {
          fontSize: 10,
          gapAfter: 2,
        },
      );
      addWrappedText(
        `Criado por: ${item.criadoPorNome || "Nao informado"} | Responsavel: ${item.responsavelNome || "Nao definido"}`,
        {
          fontSize: 10,
          gapAfter: 2,
        },
      );

      if (item.prazo || item.slaEm) {
        addWrappedText(
          `Prazo: ${formatDate(item.prazo)} | SLA: ${formatDate(item.slaEm)}`,
          {
            fontSize: 10,
            gapAfter: 2,
          },
        );
      }

      if (normalizeText(item.descricao)) {
        addWrappedText(`Descricao: ${normalizeText(item.descricao)}`, {
          fontSize: 10,
          gapAfter: 4,
        });
      }

      addDivider();
    });
  }

  const pdfArrayBuffer = doc.output("arraybuffer");
  return Buffer.from(pdfArrayBuffer);
}
