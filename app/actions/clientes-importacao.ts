"use server";

import { checkPermission } from "@/app/actions/equipe";
import { createCliente, type ClienteCreateInput } from "@/app/actions/clientes";
import { getSession } from "@/app/lib/auth";
import { TipoPessoa } from "@/generated/prisma";

const MAX_IMPORT_ROWS = 1000;
const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".csv"];

type ImportHeaderField =
  | "nome"
  | "email"
  | "telefone"
  | "celular"
  | "tipoPessoa"
  | "documento"
  | "dataNascimento"
  | "inscricaoEstadual"
  | "nomePai"
  | "documentoPai"
  | "nomeMae"
  | "documentoMae"
  | "observacoes"
  | "responsavelNome"
  | "responsavelEmail"
  | "responsavelTelefone"
  | "cep"
  | "logradouro"
  | "numero"
  | "complemento"
  | "bairro"
  | "cidade"
  | "estado"
  | "pais"
  | "criarUsuario";

type ParsedImportRow = Partial<Record<ImportHeaderField, unknown>>;

const HEADER_ALIASES: Record<string, ImportHeaderField> = {
  nome: "nome",
  nomecompleto: "nome",
  razaosocial: "nome",
  email: "email",
  telefone: "telefone",
  celular: "celular",
  whatsapp: "celular",
  tipopessoa: "tipoPessoa",
  tipo: "tipoPessoa",
  pessoa: "tipoPessoa",
  documento: "documento",
  cpfcnpj: "documento",
  cnpjcpf: "documento",
  cpf: "documento",
  cnpj: "documento",
  datanascimento: "dataNascimento",
  nascimento: "dataNascimento",
  inscricaoestadual: "inscricaoEstadual",
  ie: "inscricaoEstadual",
  nomepai: "nomePai",
  paicliente: "nomePai",
  documentopai: "documentoPai",
  cpfpai: "documentoPai",
  nomemae: "nomeMae",
  maecliente: "nomeMae",
  documentomae: "documentoMae",
  cpfmae: "documentoMae",
  observacoes: "observacoes",
  observacao: "observacoes",
  responsavelnome: "responsavelNome",
  responsavelemail: "responsavelEmail",
  responsaveltelefone: "responsavelTelefone",
  cep: "cep",
  logradouro: "logradouro",
  endereco: "logradouro",
  numero: "numero",
  complemento: "complemento",
  bairro: "bairro",
  cidade: "cidade",
  estado: "estado",
  uf: "estado",
  pais: "pais",
  criarusuario: "criarUsuario",
  usuario: "criarUsuario",
};

export interface ImportarClientesResultado {
  success: boolean;
  message: string;
  totalRows: number;
  importedCount: number;
  failedCount: number;
  errors: string[];
  warnings: string[];
}

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function stringValue(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return undefined;
    }

    return value.toISOString().slice(0, 10);
  }

  const parsed = String(value).trim();

  return parsed ? parsed : undefined;
}

function parseTipoPessoa(value: unknown): TipoPessoa | undefined {
  const normalized = stringValue(value)
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, "");

  if (!normalized) {
    return undefined;
  }

  if (
    normalized === "JURIDICA" ||
    normalized === "PJ" ||
    normalized === "PESSOAJURIDICA"
  ) {
    return TipoPessoa.JURIDICA;
  }

  if (
    normalized === "FISICA" ||
    normalized === "PF" ||
    normalized === "PESSOAFISICA"
  ) {
    return TipoPessoa.FISICA;
  }

  return undefined;
}

function parseBoolean(value: unknown): boolean {
  const normalized = stringValue(value)
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (!normalized) {
    return false;
  }

  return ["1", "true", "sim", "yes", "y", "s"].includes(normalized);
}

function parseDate(value: unknown): Date | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const parsed = new Date(excelEpoch.getTime() + value * 86400000);

    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  const parsedValue = stringValue(value);

  if (!parsedValue) {
    return undefined;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(parsedValue)) {
    const parsed = new Date(`${parsedValue}T00:00:00`);

    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(parsedValue)) {
    const [day, month, year] = parsedValue.split("/").map(Number);
    const parsed = new Date(year, month - 1, day);

    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  const parsed = new Date(parsedValue);

  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function sanitizeDocumento(value: unknown): string | undefined {
  const parsed = stringValue(value);

  if (!parsed) {
    return undefined;
  }

  const digits = parsed.replace(/\D/g, "");

  return digits || undefined;
}

function mapRowByAliases(row: Record<string, unknown>): ParsedImportRow {
  const mapped: ParsedImportRow = {};

  for (const [rawKey, rawValue] of Object.entries(row)) {
    const normalizedKey = normalizeHeader(rawKey);
    const alias = HEADER_ALIASES[normalizedKey];

    if (alias) {
      mapped[alias] = rawValue;
    }
  }

  return mapped;
}

function hasAddressFields(row: ParsedImportRow) {
  return Boolean(
    stringValue(row.cep) ||
      stringValue(row.logradouro) ||
      stringValue(row.numero) ||
      stringValue(row.complemento) ||
      stringValue(row.bairro) ||
      stringValue(row.cidade) ||
      stringValue(row.estado),
  );
}

function getExtension(fileName: string) {
  const lower = fileName.toLowerCase();
  const index = lower.lastIndexOf(".");

  return index >= 0 ? lower.slice(index) : "";
}

export async function importarClientesPlanilha(
  formData: FormData,
): Promise<ImportarClientesResultado> {
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return {
      success: false,
      message: "Selecione um arquivo .xlsx, .xls ou .csv para continuar.",
      totalRows: 0,
      importedCount: 0,
      failedCount: 0,
      errors: ["Arquivo inválido."],
      warnings: [],
    };
  }

  const extension = getExtension(file.name);

  if (!ACCEPTED_EXTENSIONS.includes(extension)) {
    return {
      success: false,
      message: "Formato inválido. Use .xlsx, .xls ou .csv.",
      totalRows: 0,
      importedCount: 0,
      failedCount: 0,
      errors: ["Formato de arquivo não suportado."],
      warnings: [],
    };
  }

  if (file.size === 0) {
    return {
      success: false,
      message: "O arquivo está vazio.",
      totalRows: 0,
      importedCount: 0,
      failedCount: 0,
      errors: ["Arquivo sem conteúdo."],
      warnings: [],
    };
  }

  const session = await getSession();

  if (!session?.user) {
    return {
      success: false,
      message: "Sessão inválida.",
      totalRows: 0,
      importedCount: 0,
      failedCount: 0,
      errors: ["Usuário não autenticado."],
      warnings: [],
    };
  }

  const canCreate = await checkPermission("clientes", "criar");

  if (!canCreate) {
    return {
      success: false,
      message: "Você não tem permissão para importar clientes.",
      totalRows: 0,
      importedCount: 0,
      failedCount: 0,
      errors: ["Permissão negada para importação."],
      warnings: [],
    };
  }

  try {
    const XLSX = await import("xlsx");
    const buffer = Buffer.from(await file.arrayBuffer());

    let workbook = XLSX.read(buffer, {
      type: "buffer",
      cellDates: true,
      raw: false,
    });

    if (!workbook.SheetNames.length) {
      return {
        success: false,
        message: "Planilha sem abas válidas.",
        totalRows: 0,
        importedCount: 0,
        failedCount: 0,
        errors: ["Não encontramos nenhuma aba com dados."],
        warnings: [],
      };
    }

    let rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets[workbook.SheetNames[0]!]!,
      {
        defval: "",
        blankrows: false,
      },
    );

    // Fallback para CSV com ponto e vírgula (Excel pt-BR).
    if (
      extension === ".csv" &&
      rows.length > 0 &&
      Object.keys(rows[0] ?? {}).length === 1
    ) {
      workbook = XLSX.read(buffer, {
        type: "buffer",
        cellDates: true,
        raw: false,
        FS: ";",
      } as Parameters<typeof XLSX.read>[1]);

      rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        workbook.Sheets[workbook.SheetNames[0]!]!,
        {
          defval: "",
          blankrows: false,
        },
      );
    }

    if (!rows.length) {
      return {
        success: false,
        message: "Planilha sem linhas para importar.",
        totalRows: 0,
        importedCount: 0,
        failedCount: 0,
        errors: ["Preencha pelo menos uma linha no arquivo."],
        warnings: [],
      };
    }

    if (rows.length > MAX_IMPORT_ROWS) {
      return {
        success: false,
        message: `Limite de ${MAX_IMPORT_ROWS} linhas por importação.`,
        totalRows: rows.length,
        importedCount: 0,
        failedCount: rows.length,
        errors: [`Arquivo com ${rows.length} linhas. Divida em lotes menores.`],
        warnings: [],
      };
    }

    let importedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];
    const warnings: string[] = [];

    for (let index = 0; index < rows.length; index += 1) {
      const rawRow = rows[index] ?? {};
      const row = mapRowByAliases(rawRow);
      const lineNumber = index + 2;

      const nome = stringValue(row.nome);
      const tipoPessoa = parseTipoPessoa(row.tipoPessoa);

      if (!nome) {
        failedCount += 1;
        errors.push(`Linha ${lineNumber}: nome é obrigatório.`);
        continue;
      }

      if (!tipoPessoa) {
        failedCount += 1;
        errors.push(
          `Linha ${lineNumber}: tipoPessoa inválido (use FISICA/PF ou JURIDICA/PJ).`,
        );
        continue;
      }

      const parsedDate = parseDate(row.dataNascimento);
      const originalDate = stringValue(row.dataNascimento);

      if (originalDate && !parsedDate) {
        failedCount += 1;
        errors.push(
          `Linha ${lineNumber}: dataNascimento inválida (use AAAA-MM-DD ou DD/MM/AAAA).`,
        );
        continue;
      }

      if (tipoPessoa === TipoPessoa.JURIDICA && parsedDate) {
        warnings.push(
          `Linha ${lineNumber}: dataNascimento ignorada para pessoa jurídica.`,
        );
      }

      const documento = sanitizeDocumento(row.documento);
      const enderecoInformado = hasAddressFields(row);
      const logradouro = stringValue(row.logradouro);
      const cidade = stringValue(row.cidade);
      const estado = stringValue(row.estado);

      if (enderecoInformado && (!logradouro || !cidade || !estado)) {
        failedCount += 1;
        errors.push(
          `Linha ${lineNumber}: para importar endereço, informe logradouro, cidade e estado.`,
        );
        continue;
      }

      const payload: ClienteCreateInput = {
        tipoPessoa,
        nome,
        email: stringValue(row.email),
        telefone: stringValue(row.telefone),
        celular: stringValue(row.celular),
        documento,
        dataNascimento:
          tipoPessoa === TipoPessoa.FISICA ? parsedDate : undefined,
        inscricaoEstadual:
          tipoPessoa === TipoPessoa.JURIDICA
            ? stringValue(row.inscricaoEstadual)
            : undefined,
        nomePai:
          tipoPessoa === TipoPessoa.FISICA
            ? stringValue(row.nomePai)
            : undefined,
        documentoPai:
          tipoPessoa === TipoPessoa.FISICA
            ? stringValue(row.documentoPai)
            : undefined,
        nomeMae:
          tipoPessoa === TipoPessoa.FISICA
            ? stringValue(row.nomeMae)
            : undefined,
        documentoMae:
          tipoPessoa === TipoPessoa.FISICA
            ? stringValue(row.documentoMae)
            : undefined,
        observacoes: stringValue(row.observacoes),
        responsavelNome: stringValue(row.responsavelNome),
        responsavelEmail: stringValue(row.responsavelEmail),
        responsavelTelefone: stringValue(row.responsavelTelefone),
        criarUsuario: parseBoolean(row.criarUsuario),
        enderecoPrincipal: enderecoInformado
          ? {
              cep: stringValue(row.cep),
              logradouro,
              numero: stringValue(row.numero),
              complemento: stringValue(row.complemento),
              bairro: stringValue(row.bairro),
              cidade,
              estado,
              pais: stringValue(row.pais) || "Brasil",
            }
          : undefined,
      };

      const created = await createCliente(payload);

      if (!created.success) {
        failedCount += 1;
        errors.push(
          `Linha ${lineNumber}: ${created.error || "falha ao criar cliente."}`,
        );
        continue;
      }

      importedCount += 1;
    }

    const success = importedCount > 0;
    const baseMessage = success
      ? `${importedCount} cliente(s) importado(s) com sucesso.`
      : "Nenhum cliente foi importado.";

    return {
      success,
      message: baseMessage,
      totalRows: rows.length,
      importedCount,
      failedCount,
      errors: errors.slice(0, 50),
      warnings: warnings.slice(0, 20),
    };
  } catch (error) {
    return {
      success: false,
      message: "Erro ao processar a planilha de clientes.",
      totalRows: 0,
      importedCount: 0,
      failedCount: 0,
      errors: [
        error instanceof Error
          ? error.message
          : "Falha inesperada durante a importação.",
      ],
      warnings: [],
    };
  }
}
