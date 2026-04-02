"use client";

import { useMemo, useRef, useState } from "react";
import { Button, Card, CardBody, CardHeader, Chip, Input, Textarea } from "@heroui/react";
import {
  Building2,
  Eye,
  FilePenLine,
  FileText,
  ListPlus,
  Plus,
  ScanSearch,
  Sparkles,
} from "lucide-react";

export type ModeloPeticaoVariavel = {
  nome: string;
  tipo: string;
  descricao: string;
  obrigatorio: boolean;
  grupo?: string;
};

export type TenantBrandingLite = {
  name: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
};

type ModeloPeticaoDocumentWorkspaceProps = {
  value: string;
  onChange: (value: string) => void;
  variaveis: ModeloPeticaoVariavel[];
  onVariaveisChange: (value: ModeloPeticaoVariavel[]) => void;
  branding?: TenantBrandingLite | null;
  compact?: boolean;
};

type LibraryVariable = ModeloPeticaoVariavel & {
  exemplo?: string;
};

const TEMPLATE_TOKEN_REGEX = /{{\s*([^{}]+?)\s*}}/g;

const VARIABLE_LIBRARY: LibraryVariable[] = [
  {
    nome: "escritorio_nome",
    tipo: "texto",
    descricao: "Nome do escritorio ou banca.",
    obrigatorio: false,
    grupo: "Escritorio",
    exemplo: "Dayane Assis Advocacia",
  },
  {
    nome: "escritorio_email",
    tipo: "texto",
    descricao: "Email principal do escritorio.",
    obrigatorio: false,
    grupo: "Escritorio",
    exemplo: "contato@escritorio.com.br",
  },
  {
    nome: "escritorio_telefone",
    tipo: "texto",
    descricao: "Telefone principal do escritorio.",
    obrigatorio: false,
    grupo: "Escritorio",
    exemplo: "(91) 99999-9999",
  },
  {
    nome: "escritorio_endereco",
    tipo: "texto",
    descricao: "Endereco principal do escritorio.",
    obrigatorio: false,
    grupo: "Escritorio",
    exemplo: "Av. Conselheiro Furtado, 1000",
  },
  {
    nome: "processo_numero",
    tipo: "texto",
    descricao: "Numero interno ou principal do processo.",
    obrigatorio: true,
    grupo: "Processo",
    exemplo: "0001234-56.2026.8.14.0301",
  },
  {
    nome: "processo_numero_cnj",
    tipo: "texto",
    descricao: "Numero CNJ do processo.",
    obrigatorio: false,
    grupo: "Processo",
    exemplo: "0001234-56.2026.8.14.0301",
  },
  {
    nome: "processo_titulo",
    tipo: "texto",
    descricao: "Titulo ou assunto principal do processo.",
    obrigatorio: false,
    grupo: "Processo",
    exemplo: "Acao de cobranca",
  },
  {
    nome: "processo_classe",
    tipo: "texto",
    descricao: "Classe processual cadastrada.",
    obrigatorio: false,
    grupo: "Processo",
    exemplo: "Procedimento Comum Civel",
  },
  {
    nome: "processo_valor_causa",
    tipo: "numero",
    descricao: "Valor da causa do processo.",
    obrigatorio: false,
    grupo: "Processo",
    exemplo: "R$ 18.540,00",
  },
  {
    nome: "cliente_nome",
    tipo: "texto",
    descricao: "Nome do cliente principal.",
    obrigatorio: true,
    grupo: "Cliente",
    exemplo: "Cactos Servicos Gerais Ltda",
  },
  {
    nome: "cliente_documento",
    tipo: "texto",
    descricao: "CPF ou CNPJ do cliente.",
    obrigatorio: false,
    grupo: "Cliente",
    exemplo: "12.345.678/0001-90",
  },
  {
    nome: "cliente_email",
    tipo: "texto",
    descricao: "Email principal do cliente.",
    obrigatorio: false,
    grupo: "Cliente",
    exemplo: "cliente@empresa.com.br",
  },
  {
    nome: "cliente_telefone",
    tipo: "texto",
    descricao: "Telefone do cliente.",
    obrigatorio: false,
    grupo: "Cliente",
    exemplo: "(91) 98888-7777",
  },
  {
    nome: "advogado_nome",
    tipo: "texto",
    descricao: "Nome do advogado responsavel.",
    obrigatorio: false,
    grupo: "Advogado",
    exemplo: "Dayane Costa Assis",
  },
  {
    nome: "advogado_oab",
    tipo: "texto",
    descricao: "Numero e UF da OAB.",
    obrigatorio: false,
    grupo: "Advogado",
    exemplo: "PA 21833",
  },
  {
    nome: "tribunal_nome",
    tipo: "texto",
    descricao: "Nome do tribunal selecionado.",
    obrigatorio: false,
    grupo: "Foro",
    exemplo: "Tribunal de Justica do Para",
  },
  {
    nome: "vara_nome",
    tipo: "texto",
    descricao: "Vara ou juizado do processo.",
    obrigatorio: false,
    grupo: "Foro",
    exemplo: "5a Vara do Trabalho de Belem",
  },
  {
    nome: "comarca_nome",
    tipo: "texto",
    descricao: "Comarca do processo.",
    obrigatorio: false,
    grupo: "Foro",
    exemplo: "Belem",
  },
  {
    nome: "orgao_julgador",
    tipo: "texto",
    descricao: "Orgao julgador informado no processo.",
    obrigatorio: false,
    grupo: "Foro",
    exemplo: "2a Turma Recursal",
  },
  {
    nome: "data_atual",
    tipo: "data",
    descricao: "Data atual no momento da geracao.",
    obrigatorio: false,
    grupo: "Datas",
    exemplo: "02/04/2026",
  },
  {
    nome: "mes_atual",
    tipo: "texto",
    descricao: "Mes atual por extenso.",
    obrigatorio: false,
    grupo: "Datas",
    exemplo: "abril",
  },
  {
    nome: "ano_atual",
    tipo: "texto",
    descricao: "Ano atual.",
    obrigatorio: false,
    grupo: "Datas",
    exemplo: "2026",
  },
];

const DOCUMENT_BLOCKS = [
  {
    id: "cabecalho",
    label: "Cabecalho do escritorio",
    snippet:
      "{{escritorio_nome}}\n{{escritorio_endereco}}\n{{escritorio_email}} | {{escritorio_telefone}}\n\n",
  },
  {
    id: "enderecamento",
    label: "Enderecamento",
    snippet:
      "Excelentissimo(a) Senhor(a) Doutor(a) Juiz(a) de Direito da {{vara_nome}} da Comarca de {{comarca_nome}}.\n\n",
  },
  {
    id: "qualificacao",
    label: "Qualificacao da parte",
    snippet:
      "{{cliente_nome}}, inscrito(a) no documento {{cliente_documento}}, por seus procuradores infra-assinados, vem, respeitosamente, a presenca de Vossa Excelencia, nos autos do processo {{processo_numero}}, apresentar a presente peticao.\n\n",
  },
  {
    id: "fatos",
    label: "Bloco de fatos",
    snippet: "I - DOS FATOS\n\nDescrever os fatos relevantes do caso.\n\n",
  },
  {
    id: "fundamentos",
    label: "Fundamentos",
    snippet:
      "II - DOS FUNDAMENTOS JURIDICOS\n\nDesenvolver os fundamentos juridicos aplicaveis ao caso.\n\n",
  },
  {
    id: "pedidos",
    label: "Pedidos",
    snippet:
      "III - DOS PEDIDOS\n\nDiante do exposto, requer:\n1. \n2. \n3. \n\n",
  },
  {
    id: "fecho",
    label: "Fecho e assinatura",
    snippet:
      "Termos em que,\nPede deferimento.\n\n{{comarca_nome}}, {{data_atual}}.\n\n{{advogado_nome}}\n{{advogado_oab}}\n",
  },
];

const PREVIEW_SAMPLE_VALUES = VARIABLE_LIBRARY.reduce<Record<string, string>>(
  (acc, variable) => {
    acc[variable.nome] = variable.exemplo || variable.nome;
    return acc;
  },
  {},
);

function normalizeVariableName(raw: string) {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

export function normalizeModeloPeticaoVariaveis(
  raw: unknown,
): ModeloPeticaoVariavel[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const normalized = (raw
    .map((entry) => {
      if (typeof entry === "string") {
        const nome = normalizeVariableName(entry);
        if (!nome) return null;
        return {
          nome,
          tipo: "texto",
          descricao: "Variavel customizada do modelo.",
          obrigatorio: false,
          grupo: "Customizada",
        } satisfies ModeloPeticaoVariavel;
      }

      if (!entry || typeof entry !== "object") {
        return null;
      }

      const entryRecord = entry as Record<string, unknown>;
      const nome = normalizeVariableName(String(entryRecord.nome || ""));
      if (!nome) return null;

      return {
        nome,
        tipo:
          typeof entryRecord.tipo === "string" && entryRecord.tipo.trim()
            ? entryRecord.tipo.trim()
            : "texto",
        descricao:
          typeof entryRecord.descricao === "string" &&
          entryRecord.descricao.trim()
            ? entryRecord.descricao.trim()
            : "Variavel customizada do modelo.",
        obrigatorio: Boolean(entryRecord.obrigatorio),
        grupo:
          typeof entryRecord.grupo === "string" && entryRecord.grupo.trim()
            ? entryRecord.grupo.trim()
            : "Customizada",
      } satisfies ModeloPeticaoVariavel;
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))) as ModeloPeticaoVariavel[];

  return mergeModeloPeticaoVariaveisWithConteudo(normalized, "");
}

export function extractTemplateVariableNames(content: string) {
  if (!content) return [];

  const names = new Set<string>();
  for (const match of content.matchAll(TEMPLATE_TOKEN_REGEX)) {
    const name = normalizeVariableName(match[1] || "");
    if (name) {
      names.add(name);
    }
  }

  return Array.from(names);
}

export function mergeModeloPeticaoVariaveisWithConteudo(
  variaveis: ModeloPeticaoVariavel[],
  content: string,
) {
  const merged = new Map<string, ModeloPeticaoVariavel>();

  for (const variable of variaveis) {
    const nome = normalizeVariableName(variable.nome);
    if (!nome) continue;

    merged.set(nome, {
      ...variable,
      nome,
      grupo: variable.grupo || "Customizada",
    });
  }

  for (const nome of extractTemplateVariableNames(content)) {
    if (merged.has(nome)) continue;

    const fromLibrary = VARIABLE_LIBRARY.find((item) => item.nome === nome);
    merged.set(nome, {
      nome,
      tipo: fromLibrary?.tipo || "texto",
      descricao:
        fromLibrary?.descricao || "Variavel identificada no conteudo do modelo.",
      obrigatorio: fromLibrary?.obrigatorio || false,
      grupo: fromLibrary?.grupo || "Documento",
    });
  }

  return Array.from(merged.values()).sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

function splitPreviewLine(line: string) {
  const parts: Array<{ type: "text" | "variable"; value: string }> = [];
  let lastIndex = 0;

  for (const match of line.matchAll(TEMPLATE_TOKEN_REGEX)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      parts.push({
        type: "text",
        value: line.slice(lastIndex, start),
      });
    }

    parts.push({
      type: "variable",
      value: normalizeVariableName(match[1] || ""),
    });
    lastIndex = start + match[0].length;
  }

  if (lastIndex < line.length) {
    parts.push({
      type: "text",
      value: line.slice(lastIndex),
    });
  }

  return parts;
}

export function ModeloPeticaoDocumentWorkspace({
  value,
  onChange,
  variaveis,
  onVariaveisChange,
  branding,
  compact = false,
}: ModeloPeticaoDocumentWorkspaceProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [customVariableName, setCustomVariableName] = useState("");
  const [customVariableDescription, setCustomVariableDescription] = useState("");
  const [showBrandingPreview, setShowBrandingPreview] = useState(true);

  const mergedVariables = useMemo(
    () => mergeModeloPeticaoVariaveisWithConteudo(variaveis, value),
    [variaveis, value],
  );

  const filteredLibrary = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase();
    if (!query) return VARIABLE_LIBRARY;

    return VARIABLE_LIBRARY.filter((item) =>
      [item.nome, item.descricao, item.grupo]
        .filter(Boolean)
        .some((entry) => entry!.toLowerCase().includes(query)),
    );
  }, [libraryQuery]);

  const groupedLibrary = useMemo(() => {
    return filteredLibrary.reduce<Record<string, LibraryVariable[]>>((acc, item) => {
      const key = item.grupo || "Outros";
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [filteredLibrary]);

  const previewLines = useMemo(() => value.split(/\r?\n/), [value]);
  const pageClassName = compact
    ? "min-h-[780px] p-8"
    : "min-h-[960px] p-10";
  const brandingAccentStyle =
    showBrandingPreview && branding?.primaryColor
      ? { backgroundColor: branding.primaryColor }
      : undefined;

  function syncVariableInState(variable: ModeloPeticaoVariavel) {
    const merged = mergeModeloPeticaoVariaveisWithConteudo(
      [...variaveis, variable],
      value,
    );
    onVariaveisChange(merged);
  }

  function insertIntoContent(snippet: string, variable?: ModeloPeticaoVariavel) {
    const element = textareaRef.current;

    if (!element) {
      onChange(value + snippet);
      if (variable) syncVariableInState(variable);
      return;
    }

    const start = element.selectionStart ?? value.length;
    const end = element.selectionEnd ?? value.length;
    const nextValue = value.slice(0, start) + snippet + value.slice(end);
    onChange(nextValue);

    if (variable) {
      syncVariableInState(variable);
    } else {
      onVariaveisChange(mergeModeloPeticaoVariaveisWithConteudo(variaveis, nextValue));
    }

    const nextCursor = start + snippet.length;
    requestAnimationFrame(() => {
      element.focus();
      element.selectionStart = nextCursor;
      element.selectionEnd = nextCursor;
    });
  }

  function handleInsertVariable(variable: LibraryVariable | ModeloPeticaoVariavel) {
    insertIntoContent(`{{${variable.nome}}}`, {
      nome: variable.nome,
      tipo: variable.tipo,
      descricao: variable.descricao,
      obrigatorio: variable.obrigatorio,
      grupo: variable.grupo,
    });
  }

  function handleAddCustomVariable() {
    const normalizedName = normalizeVariableName(customVariableName);
    if (!normalizedName) return;

    const customVariable: ModeloPeticaoVariavel = {
      nome: normalizedName,
      tipo: "texto",
      descricao:
        customVariableDescription.trim() || "Variavel customizada do escritorio.",
      obrigatorio: false,
      grupo: "Customizada",
    };

    handleInsertVariable(customVariable);
    setCustomVariableName("");
    setCustomVariableDescription("");
  }

  function handleToggleRequired(variableName: string) {
    onVariaveisChange(
      mergeModeloPeticaoVariaveisWithConteudo(
        mergedVariables.map((item) =>
          item.nome === variableName
            ? { ...item, obrigatorio: !item.obrigatorio }
            : item,
        ),
        value,
      ),
    );
  }

  function handleRemoveVariable(variableName: string) {
    onVariaveisChange(
      mergeModeloPeticaoVariaveisWithConteudo(
        mergedVariables.filter((item) => item.nome !== variableName),
        value,
      ),
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-5">
        <Card className="border border-default-200/80 bg-content1/90 dark:border-white/10 dark:bg-background/60">
          <CardHeader className="flex items-center gap-2 pb-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-semibold">Blocos do documento</p>
              <p className="text-xs text-default-500">
                Insira partes comuns da peticao com um clique.
              </p>
            </div>
          </CardHeader>
          <CardBody className="gap-2">
            {DOCUMENT_BLOCKS.map((block) => (
              <Button
                key={block.id}
                className="justify-start"
                size="sm"
                startContent={<ListPlus className="h-4 w-4" />}
                variant="bordered"
                onPress={() => insertIntoContent(block.snippet)}
              >
                {block.label}
              </Button>
            ))}
          </CardBody>
        </Card>

        <Card className="border border-default-200/80 bg-content1/90 dark:border-white/10 dark:bg-background/60">
          <CardHeader className="flex items-center gap-2 pb-2">
            <ScanSearch className="h-4 w-4 text-secondary" />
            <div>
              <p className="text-sm font-semibold">Biblioteca de variaveis</p>
              <p className="text-xs text-default-500">
                Clique para inserir placeholders no documento.
              </p>
            </div>
          </CardHeader>
          <CardBody className="gap-4">
            <Input
              placeholder="Buscar variavel"
              size="sm"
              value={libraryQuery}
              onValueChange={setLibraryQuery}
            />

            <div className="max-h-[420px] space-y-4 overflow-y-auto pr-1">
              {Object.entries(groupedLibrary).map(([group, items]) => (
                <div key={group} className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                    {group}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {items.map((item) => (
                      <Chip
                        key={item.nome}
                        className="cursor-pointer"
                        color={
                          mergedVariables.some((variable) => variable.nome === item.nome)
                            ? "primary"
                            : "default"
                        }
                        variant="flat"
                        onClick={() => handleInsertVariable(item)}
                      >
                        {item.nome}
                      </Chip>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2 rounded-2xl border border-default-200/80 bg-default-50/70 p-3 dark:border-white/10 dark:bg-white/5">
              <p className="text-sm font-semibold">Nova variavel do escritorio</p>
              <Input
                label="Nome da variavel"
                placeholder="ex: contrato_referencia"
                size="sm"
                value={customVariableName}
                onValueChange={setCustomVariableName}
              />
              <Textarea
                label="Descricao"
                minRows={2}
                placeholder="Explique quando essa variavel deve ser preenchida."
                size="sm"
                value={customVariableDescription}
                onValueChange={setCustomVariableDescription}
              />
              <Button
                color="primary"
                size="sm"
                startContent={<Plus className="h-4 w-4" />}
                onPress={handleAddCustomVariable}
              >
                Criar e inserir
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="space-y-5">
        <div className="grid gap-5 2xl:grid-cols-2">
          <Card className="border border-default-200/80 bg-content1/90 dark:border-white/10 dark:bg-background/60">
            <CardHeader className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FilePenLine className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-sm font-semibold">Editor do documento</p>
                  <p className="text-xs text-default-500">
                    O conteudo continua salvo em texto com placeholders.
                  </p>
                </div>
              </div>
              <Chip size="sm" variant="flat">
                {value.trim().length} caracteres
              </Chip>
            </CardHeader>
            <CardBody>
              <div className="rounded-[28px] border border-default-200/80 bg-white shadow-[0_28px_80px_-48px_rgba(15,23,42,0.4)] dark:border-white/10 dark:bg-slate-950">
                <div className={`${pageClassName} mx-auto max-w-[816px]`}>
                  <Textarea
                    ref={textareaRef}
                    isRequired
                    classNames={{
                      base: "h-full",
                      input:
                        "min-h-[640px] resize-none border-none bg-transparent p-0 text-[15px] leading-8 text-slate-900 shadow-none outline-none dark:text-slate-100",
                      inputWrapper:
                        "h-full items-start rounded-none border-none bg-transparent p-0 shadow-none",
                    }}
                    labelPlacement="outside"
                    minRows={compact ? 22 : 28}
                    placeholder="Escreva a estrutura da peticao, insira variaveis e monte o documento em formato livre."
                    value={value}
                    onValueChange={(nextValue) => {
                      onChange(nextValue);
                      onVariaveisChange(
                        mergeModeloPeticaoVariaveisWithConteudo(
                          mergedVariables,
                          nextValue,
                        ),
                      );
                    }}
                  />
                </div>
              </div>
            </CardBody>
          </Card>

          <Card className="border border-default-200/80 bg-content1/90 dark:border-white/10 dark:bg-background/60">
            <CardHeader className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-secondary" />
                <div>
                  <p className="text-sm font-semibold">Preview do documento</p>
                  <p className="text-xs text-default-500">
                    Simulacao visual com branding e variaveis destacadas.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                startContent={<Building2 className="h-4 w-4" />}
                variant={showBrandingPreview ? "solid" : "bordered"}
                onPress={() => setShowBrandingPreview((current) => !current)}
              >
                {showBrandingPreview ? "Ocultar branding" : "Mostrar branding"}
              </Button>
            </CardHeader>
            <CardBody>
              <div className="rounded-[28px] border border-default-200/80 bg-white shadow-[0_28px_80px_-48px_rgba(15,23,42,0.4)] dark:border-white/10 dark:bg-slate-950">
                <div className={`${pageClassName} mx-auto max-w-[816px] space-y-8`}>
                  {showBrandingPreview && (branding?.name || branding?.logoUrl) ? (
                    <div className="border-b border-slate-200 pb-6 dark:border-white/10">
                      <div
                        className="mb-5 h-1.5 w-32 rounded-full"
                        style={brandingAccentStyle}
                      />
                      <div className="flex items-center gap-4">
                        {branding.logoUrl ? (
                          <img
                            alt={branding.name || "Logo do escritorio"}
                            className="h-16 w-auto max-w-[180px] object-contain"
                            src={branding.logoUrl}
                          />
                        ) : null}
                        <div>
                          <p className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                            {branding.name || "Escritorio"}
                          </p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            Cabecalho visual do escritorio no documento.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    {previewLines.length === 0 || !value.trim() ? (
                      <p className="text-sm leading-7 text-slate-500 dark:text-slate-400">
                        O preview aparece aqui conforme o documento for sendo montado.
                      </p>
                    ) : (
                      previewLines.map((line, index) =>
                        line.trim() ? (
                          <p
                            key={`${line}-${index}`}
                            className="whitespace-pre-wrap text-[15px] leading-8 text-slate-900 dark:text-slate-100"
                          >
                            {splitPreviewLine(line).map((part, partIndex) =>
                              part.type === "variable" ? (
                                <span
                                  key={`${part.value}-${partIndex}`}
                                  className="rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary"
                                >
                                  {PREVIEW_SAMPLE_VALUES[part.value] || part.value}
                                </span>
                              ) : (
                                <span key={`${part.value}-${partIndex}`}>{part.value}</span>
                              ),
                            )}
                          </p>
                        ) : (
                          <div key={`spacer-${index}`} className="h-4" />
                        ),
                      )
                    )}
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

        <Card className="border border-default-200/80 bg-content1/90 dark:border-white/10 dark:bg-background/60">
          <CardHeader className="flex items-center gap-2 pb-2">
            <FileText className="h-4 w-4 text-warning" />
            <div>
              <p className="text-sm font-semibold">Variaveis do modelo</p>
              <p className="text-xs text-default-500">
                O sistema salva as variaveis usadas no documento e o que o escritorio marcou manualmente.
              </p>
            </div>
          </CardHeader>
          <CardBody className="gap-3">
            <div className="flex flex-wrap gap-2">
              {mergedVariables.length === 0 ? (
                <Chip variant="flat">Nenhuma variavel adicionada ainda</Chip>
              ) : (
                mergedVariables.map((variable) => (
                  <Chip key={variable.nome} color="primary" variant="flat">
                    {variable.nome}
                  </Chip>
                ))
              )}
            </div>

            {mergedVariables.length > 0 ? (
              <div className="space-y-2">
                {mergedVariables.map((variable) => (
                  <div
                    key={variable.nome}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-default-200/80 bg-default-50/70 px-4 py-3 dark:border-white/10 dark:bg-white/5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{`{{${variable.nome}}}`}</p>
                      <p className="text-xs text-default-500">
                        {variable.grupo || "Documento"} | {variable.descricao}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant={variable.obrigatorio ? "solid" : "bordered"}
                        onPress={() => handleToggleRequired(variable.nome)}
                      >
                        {variable.obrigatorio ? "Obrigatoria" : "Opcional"}
                      </Button>
                      <Button
                        color="danger"
                        size="sm"
                        variant="light"
                        onPress={() => handleRemoveVariable(variable.nome)}
                      >
                        Remover
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
