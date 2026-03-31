import { NextResponse } from "next/server";

const CSV_SEPARATOR = ";";

function csvEscape(value: string) {
  const shouldQuote =
    value.includes(CSV_SEPARATOR) ||
    value.includes('"') ||
    value.includes("\n");

  if (!shouldQuote) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}

function buildCsvRow(values: string[]) {
  return values.map((value) => csvEscape(value)).join(CSV_SEPARATOR);
}

const CSV_HEADER = [
  "nome",
  "email",
  "telefone",
  "celular",
  "tipoPessoa",
  "documento",
  "dataNascimento",
  "inscricaoEstadual",
  "nomePai",
  "documentoPai",
  "nomeMae",
  "documentoMae",
  "observacoes",
  "responsavelNome",
  "responsavelEmail",
  "responsavelTelefone",
  "cep",
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "estado",
  "pais",
  "criarUsuario",
];

const CSV_SAMPLE_ROW = [
  "Ana Beatriz Souza",
  "ana.souza@example.com",
  "+55 11 98888-0000",
  "+55 11 97777-0000",
  "FISICA",
  "12345678901",
  "1990-05-15",
  "",
  "João Souza",
  "98765432100",
  "Maria Souza",
  "11223344556",
  "Cliente VIP; prefere contato por WhatsApp",
  "",
  "",
  "",
  "01311-000",
  "Avenida Paulista",
  "1000",
  "Sala 1201",
  "Bela Vista",
  "São Paulo",
  "SP",
  "Brasil",
  "nao",
];

const CSV_SAMPLE_ROW_PJ = [
  "Empresa Exemplo LTDA",
  "financeiro@empresaexemplo.com.br",
  "+55 11 3222-1100",
  "",
  "JURIDICA",
  "12345678000199",
  "",
  "123456789",
  "Contato principal: diretoria jurídica",
  "Marina Alves",
  "marina.alves@empresaexemplo.com.br",
  "+55 11 98888-1234",
  "40010-000",
  "Rua Chile",
  "20",
  "5º andar",
  "Centro Histórico",
  "Salvador",
  "BA",
  "Brasil",
  "sim",
];

const CSV_CONTENT = `\uFEFF${buildCsvRow(CSV_HEADER)}\n${buildCsvRow(CSV_SAMPLE_ROW)}\n${buildCsvRow(CSV_SAMPLE_ROW_PJ)}\n`;

export async function GET() {
  return new NextResponse(CSV_CONTENT, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="modelo-importacao-clientes.csv"',
      "Cache-Control": "no-store",
    },
  });
}
