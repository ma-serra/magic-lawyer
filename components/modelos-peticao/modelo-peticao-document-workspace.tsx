"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  Input,
  ScrollShadow,
  Select,
  SelectItem,
  Switch,
} from "@heroui/react";
import { toast } from "@/lib/toast";
import {
  AlignCenter,
  AlignLeft,
  Bold,
  Building2,
  Heading1,
  Heading2,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  ScanSearch,
  Signature,
  Sparkles,
  Type,
  Underline as UnderlineIcon,
} from "lucide-react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";

import { ImageEditorModal } from "@/components/image-editor-modal";
import { uploadModeloPeticaoImage } from "@/app/actions/modelos-peticao";
import {
  MODELO_PETICAO_PRESETS,
  createModeloPeticaoDocument,
  extractTemplateTokensFromDocument,
  extractTemplateTokensFromString,
  normalizeModeloPeticaoDocument,
  serializeModeloPeticaoDocumentToText,
  type HeaderImageMode,
  type ModeloPeticaoDocumentJson,
  type ModeloPeticaoPresetKey,
  type TenantBrandingDocumentSeed,
} from "@/lib/modelos-peticao/document-schema";

export type ModeloPeticaoVariavel = {
  nome: string;
  tipo: string;
  descricao: string;
  obrigatorio: boolean;
  grupo?: string;
};

export type TenantBrandingLite = TenantBrandingDocumentSeed;

type ModeloPeticaoDocumentWorkspaceProps = {
  value: string;
  documentValue?: ModeloPeticaoDocumentJson | null;
  onChange: (value: string) => void;
  onDocumentChange?: (value: ModeloPeticaoDocumentJson) => void;
  variaveis: ModeloPeticaoVariavel[];
  onVariaveisChange: (value: ModeloPeticaoVariavel[]) => void;
  branding?: TenantBrandingLite | null;
  compact?: boolean;
  presetKey?: string | null;
  onPresetChange?: (value: ModeloPeticaoPresetKey) => void;
  onSuggestedMetadataChange?: (value: {
    tipo?: string | null;
    categoria?: string | null;
  }) => void;
  readOnly?: boolean;
};

type LibraryVariable = ModeloPeticaoVariavel & {
  exemplo?: string;
  presetKeys?: ModeloPeticaoPresetKey[];
};

const TEMPLATE_TOKEN_REGEX = /{{\s*([^{}]+?)\s*}}/g;
const A4_WIDTH = 794;
const A4_MIN_HEIGHT = 1123;

const VARIABLE_LIBRARY: LibraryVariable[] = [
  {
    nome: "escritorio_nome",
    tipo: "texto",
    descricao: "Nome do escritório ou banca.",
    obrigatorio: false,
    grupo: "Escritório",
    exemplo: "Dayane Assis Advocacia",
  },
  {
    nome: "escritorio_email",
    tipo: "texto",
    descricao: "Email principal do escritório.",
    obrigatorio: false,
    grupo: "Escritório",
    exemplo: "contato@escritorio.com.br",
  },
  {
    nome: "escritorio_telefone",
    tipo: "texto",
    descricao: "Telefone principal do escritório.",
    obrigatorio: false,
    grupo: "Escritório",
    exemplo: "(71) 99999-9999",
  },
  {
    nome: "escritorio_endereco",
    tipo: "texto",
    descricao: "Endereço principal do escritório.",
    obrigatorio: false,
    grupo: "Escritório",
    exemplo: "Rua da Justiça, 100",
  },
  {
    nome: "processo_numero",
    tipo: "texto",
    descricao: "Número principal do processo.",
    obrigatorio: true,
    grupo: "Processo",
    exemplo: "0001234-56.2026.8.05.0001",
  },
  {
    nome: "processo_numero_cnj",
    tipo: "texto",
    descricao: "Número CNJ do processo.",
    obrigatorio: false,
    grupo: "Processo",
    exemplo: "0001234-56.2026.8.05.0001",
  },
  {
    nome: "processo_titulo",
    tipo: "texto",
    descricao: "Título ou assunto do processo.",
    obrigatorio: false,
    grupo: "Processo",
    exemplo: "Ação Trabalhista",
  },
  {
    nome: "processo_classe",
    tipo: "texto",
    descricao: "Classe processual cadastrada.",
    obrigatorio: false,
    grupo: "Processo",
    exemplo: "Reclamação Trabalhista",
  },
  {
    nome: "processo_valor_causa",
    tipo: "numero",
    descricao: "Valor da causa.",
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
    exemplo: "Cactos Serviços Gerais Ltda",
  },
  {
    nome: "cliente_documento",
    tipo: "texto",
    descricao: "CPF ou CNPJ do cliente.",
    obrigatorio: false,
    grupo: "Cliente",
    exemplo: "07.546.074/0001-77",
  },
  {
    nome: "cliente_email",
    tipo: "texto",
    descricao: "Email principal do cliente.",
    obrigatorio: false,
    grupo: "Cliente",
    exemplo: "cactosservicos@gmail.com",
  },
  {
    nome: "cliente_telefone",
    tipo: "texto",
    descricao: "Telefone do cliente.",
    obrigatorio: false,
    grupo: "Cliente",
    exemplo: "(71) 99999-0000",
  },
  {
    nome: "advogado_nome",
    tipo: "texto",
    descricao: "Nome do advogado responsável.",
    obrigatorio: false,
    grupo: "Advogado",
    exemplo: "Dayane Costa Assis",
  },
  {
    nome: "advogado_oab",
    tipo: "texto",
    descricao: "Número e UF da OAB.",
    obrigatorio: false,
    grupo: "Advogado",
    exemplo: "BA 21.833",
  },
  {
    nome: "tribunal_nome",
    tipo: "texto",
    descricao: "Nome do tribunal.",
    obrigatorio: false,
    grupo: "Foro",
    exemplo: "Tribunal Regional do Trabalho da 5ª Região",
  },
  {
    nome: "vara_nome",
    tipo: "texto",
    descricao: "Vara ou juízo.",
    obrigatorio: false,
    grupo: "Foro",
    exemplo: "5ª Vara do Trabalho de Salvador",
  },
  {
    nome: "comarca_nome",
    tipo: "texto",
    descricao: "Comarca do processo.",
    obrigatorio: false,
    grupo: "Foro",
    exemplo: "Salvador",
  },
  {
    nome: "orgao_julgador",
    tipo: "texto",
    descricao: "Órgão julgador informado no processo.",
    obrigatorio: false,
    grupo: "Foro",
    exemplo: "2ª Turma",
  },
  {
    nome: "data_atual",
    tipo: "data",
    descricao: "Data atual no momento da geração.",
    obrigatorio: false,
    grupo: "Datas",
    exemplo: "03/04/2026",
  },
  {
    nome: "reclamante_nome",
    tipo: "texto",
    descricao: "Parte reclamante em peças trabalhistas.",
    obrigatorio: false,
    grupo: "Partes",
    exemplo: "Fulano de Tal",
    presetKeys: ["trabalhista-contestacao"],
  },
  {
    nome: "reclamada_nome",
    tipo: "texto",
    descricao: "Parte reclamada em peças trabalhistas.",
    obrigatorio: false,
    grupo: "Partes",
    exemplo: "Empresa XYZ Ltda",
    presetKeys: ["trabalhista-contestacao"],
  },
  {
    nome: "autor_nome",
    tipo: "texto",
    descricao: "Parte autora do processo.",
    obrigatorio: false,
    grupo: "Partes",
    exemplo: "Autor do processo",
  },
  {
    nome: "reu_nome",
    tipo: "texto",
    descricao: "Parte ré do processo.",
    obrigatorio: false,
    grupo: "Partes",
    exemplo: "Réu do processo",
    presetKeys: ["criminal-resposta"],
  },
  {
    nome: "ministerio_publico_nome",
    tipo: "texto",
    descricao: "Parte do Ministério Público, se existir.",
    obrigatorio: false,
    grupo: "Partes",
    exemplo: "Ministério Público do Estado da Bahia",
    presetKeys: ["criminal-resposta"],
  },
  {
    nome: "autoridade_acusadora_nome",
    tipo: "texto",
    descricao: "Nome da acusação ou órgão acusador.",
    obrigatorio: false,
    grupo: "Partes",
    exemplo: "Ministério Público",
    presetKeys: ["criminal-resposta"],
  },
];

const TYPOGRAPHY_TOKENS = [
  {
    id: "insert-title",
    label: "Título",
    icon: Heading1,
    action: (editor: Editor) =>
      editor.chain().focus().setHeading({ level: 1 }).insertContent("TÍTULO").run(),
  },
  {
    id: "insert-section",
    label: "Seção",
    icon: Heading2,
    action: (editor: Editor) =>
      editor
        .chain()
        .focus()
        .setHeading({ level: 2 })
        .insertContent("NOVA SEÇÃO")
        .run(),
  },
  {
    id: "insert-paragraph",
    label: "Parágrafo",
    icon: Pilcrow,
    action: (editor: Editor) =>
      editor.chain().focus().setParagraph().insertContent("Novo parágrafo.").run(),
  },
  {
    id: "insert-signature",
    label: "Assinatura",
    icon: Signature,
    action: (editor: Editor) =>
      editor
        .chain()
        .focus()
        .insertContent(
          "<p>{{comarca_nome}}, {{data_atual}}.</p><p>{{advogado_nome}}<br />OAB {{advogado_oab}}</p>",
        )
        .run(),
  },
  {
    id: "insert-separator",
    label: "Separador",
    icon: Minus,
    action: (editor: Editor) => editor.chain().focus().setHorizontalRule().run(),
  },
];

function highlightTemplateTokens(html: string) {
  return html.replace(
    TEMPLATE_TOKEN_REGEX,
    (match) =>
      `<span class="rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[0.88em] text-primary">${match}</span>`,
  );
}

function normalizeVariableName(value: string) {
  return value.trim().replace(/\s+/g, "_");
}

export function normalizeModeloPeticaoVariaveis(
  value: unknown,
): ModeloPeticaoVariavel[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry) {
        return null;
      }

      if (typeof entry === "string") {
        return {
          nome: normalizeVariableName(entry),
          tipo: "texto",
          descricao: "Variável detectada no conteúdo.",
          obrigatorio: false,
        } satisfies ModeloPeticaoVariavel;
      }

      if (typeof entry !== "object" || !("nome" in entry)) {
        return null;
      }

      const rawEntry = entry as Record<string, unknown>;
      const nome = normalizeVariableName(String(rawEntry.nome || ""));

      if (!nome) {
        return null;
      }

      return {
        nome,
        tipo: typeof rawEntry.tipo === "string" ? rawEntry.tipo : "texto",
        descricao:
          typeof rawEntry.descricao === "string"
            ? rawEntry.descricao
            : "Variável detectada no conteúdo.",
        obrigatorio: Boolean(rawEntry.obrigatorio),
        grupo: typeof rawEntry.grupo === "string" ? rawEntry.grupo : undefined,
      } satisfies ModeloPeticaoVariavel;
    })
    .filter((entry): entry is ModeloPeticaoVariavel => Boolean(entry));
}

export function mergeModeloPeticaoVariaveisWithConteudo(
  variaveis: ModeloPeticaoVariavel[],
  conteudo: string,
) {
  const merged = new Map<string, ModeloPeticaoVariavel>();

  for (const variavel of normalizeModeloPeticaoVariaveis(variaveis)) {
    merged.set(variavel.nome, variavel);
  }

  for (const token of extractTemplateTokensFromString(conteudo)) {
    if (!merged.has(token)) {
      const libraryMatch = VARIABLE_LIBRARY.find((entry) => entry.nome === token);
      merged.set(token, {
        nome: token,
        tipo: libraryMatch?.tipo || "texto",
        descricao: libraryMatch?.descricao || "Variável detectada no conteúdo.",
        obrigatorio: false,
        grupo: libraryMatch?.grupo,
      });
    }
  }

  return Array.from(merged.values()).sort((a, b) => a.nome.localeCompare(b.nome));
}

function getPresetOptions() {
  return Object.values(MODELO_PETICAO_PRESETS).map((preset) => ({
    key: preset.key,
    label: preset.label,
    description: preset.description,
  }));
}

function getHeaderImageUrl(
  document: ModeloPeticaoDocumentJson,
  branding?: TenantBrandingLite | null,
) {
  if (document.header.imageMode === "tenant_logo") {
    return branding?.logoUrl || null;
  }

  if (document.header.imageMode === "custom_image") {
    return document.header.customImageUrl || null;
  }

  return null;
}

function getEditorBaseClasses(isBody = false) {
  return [
    "prose prose-slate max-w-none outline-none dark:prose-invert",
    "[&_.ProseMirror]:outline-none",
    "[&_.ProseMirror_h1]:my-4 [&_.ProseMirror_h1]:text-center [&_.ProseMirror_h1]:text-[1.55rem] [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h1]:uppercase [&_.ProseMirror_h1]:tracking-[0.16em]",
    "[&_.ProseMirror_h2]:mt-6 [&_.ProseMirror_h2]:mb-2 [&_.ProseMirror_h2]:text-[1rem] [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:uppercase [&_.ProseMirror_h2]:tracking-[0.14em]",
    "[&_.ProseMirror_p]:my-2 [&_.ProseMirror_p]:leading-8",
    "[&_.ProseMirror_ol]:my-3 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6",
    "[&_.ProseMirror_ul]:my-3 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6",
    "[&_.ProseMirror_hr]:my-5 [&_.ProseMirror_hr]:border-default-200",
    "[&_.ProseMirror_img]:mx-auto [&_.ProseMirror_img]:my-5 [&_.ProseMirror_img]:max-h-64 [&_.ProseMirror_img]:rounded-xl [&_.ProseMirror_img]:border [&_.ProseMirror_img]:border-default-200/70 [&_.ProseMirror_img]:object-contain",
    isBody ? "min-h-[460px] text-[15px] text-slate-900 dark:text-slate-100" : "text-[14px] text-slate-700 dark:text-slate-200",
  ].join(" ");
}

function buildEditorExtensions(isBody = false) {
  return [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3],
      },
      horizontalRule: isBody ? {} : false,
    }),
    Underline,
    TextAlign.configure({
      types: ["heading", "paragraph"],
    }),
    Image.configure({
      inline: false,
      allowBase64: true,
    }),
  ];
}

function useRichTextFieldEditor(options: {
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  isBody?: boolean;
  readOnly?: boolean;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: !options.readOnly,
    extensions: buildEditorExtensions(options.isBody),
    content: options.value,
    editorProps: {
      attributes: {
        class: getEditorBaseClasses(options.isBody),
      },
      handleDOMEvents: {
        focus: () => {
          options.onFocus();
          return false;
        },
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      options.onChange(currentEditor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    const currentHtml = editor.getHTML();
    if (currentHtml !== options.value) {
      editor.commands.setContent(options.value || "<p></p>", {
        emitUpdate: false,
      });
    }
  }, [editor, options.value]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(!options.readOnly);
  }, [editor, options.readOnly]);

  return editor;
}

function VariableLibrarySection({
  items,
  onInsert,
}: {
  items: LibraryVariable[];
  onInsert: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      {items.map((variavel) => (
        <button
          key={variavel.nome}
          className="w-full rounded-2xl border border-default-200/80 bg-content1/80 px-4 py-3 text-left transition hover:border-primary/35 hover:bg-content2/70"
          type="button"
          onClick={() => onInsert(`{{${variavel.nome}}}`)}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-sm font-semibold text-foreground">
                {`{{${variavel.nome}}}`}
              </p>
              <p className="mt-1 text-xs text-default-500">{variavel.descricao}</p>
            </div>
            <Chip size="sm" variant="flat">
              {variavel.grupo || "Modelo"}
            </Chip>
          </div>
        </button>
      ))}
    </div>
  );
}

function FormattingToolbar({
  editor,
  onInsertBodyImage,
}: {
  editor: Editor | null;
  onInsertBodyImage: () => void;
}) {
  const isReady = Boolean(editor);

  const buttons = [
    {
      id: "bold",
      icon: Bold,
      onPress: () => editor?.chain().focus().toggleBold().run(),
      active: editor?.isActive("bold"),
    },
    {
      id: "italic",
      icon: Italic,
      onPress: () => editor?.chain().focus().toggleItalic().run(),
      active: editor?.isActive("italic"),
    },
    {
      id: "underline",
      icon: UnderlineIcon,
      onPress: () => editor?.chain().focus().toggleUnderline().run(),
      active: editor?.isActive("underline"),
    },
    {
      id: "left",
      icon: AlignLeft,
      onPress: () => editor?.chain().focus().setTextAlign("left").run(),
      active: editor?.isActive({ textAlign: "left" }),
    },
    {
      id: "center",
      icon: AlignCenter,
      onPress: () => editor?.chain().focus().setTextAlign("center").run(),
      active: editor?.isActive({ textAlign: "center" }),
    },
    {
      id: "bullet",
      icon: List,
      onPress: () => editor?.chain().focus().toggleBulletList().run(),
      active: editor?.isActive("bulletList"),
    },
    {
      id: "ordered",
      icon: ListOrdered,
      onPress: () => editor?.chain().focus().toggleOrderedList().run(),
      active: editor?.isActive("orderedList"),
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-3xl border border-default-200/80 bg-content1/95 px-4 py-3 shadow-[0_16px_48px_-36px_rgba(15,23,42,0.65)] backdrop-blur">
      {buttons.map((button) => {
        const Icon = button.icon;

        return (
          <Button
            key={button.id}
            isDisabled={!isReady}
            size="sm"
            variant={button.active ? "solid" : "light"}
            onPress={button.onPress}
          >
            <Icon className="h-4 w-4" />
          </Button>
        );
      })}

      <Divider className="mx-1 hidden h-6 md:block" orientation="vertical" />

      <Button isDisabled={!isReady} size="sm" variant="light" onPress={onInsertBodyImage}>
        <ImagePlus className="h-4 w-4" />
      </Button>
    </div>
  );
}

function renderDocumentPreview(
  document: ModeloPeticaoDocumentJson,
  branding?: TenantBrandingLite | null,
) {
  const accentColor = branding?.primaryColor || "#0f172a";
  const headerImageUrl = getHeaderImageUrl(document, branding);

  return (
    <div
      className="relative overflow-hidden rounded-[32px] border border-default-200/80 bg-white shadow-[0_30px_90px_-42px_rgba(15,23,42,0.48)] dark:border-white/10 dark:bg-slate-950"
      style={{
        maxWidth: A4_WIDTH,
        minHeight: A4_MIN_HEIGHT,
        fontFamily: document.page.fontFamily,
        fontSize: `${document.page.fontSize}px`,
        lineHeight: document.page.lineHeight,
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-24 opacity-70"
        style={{
          background:
            "linear-gradient(180deg, rgba(15,23,42,0.04) 0%, rgba(15,23,42,0) 100%)",
        }}
      />
      <div
        className="relative flex min-h-[inherit] flex-col"
        style={{
          paddingTop: document.page.marginTop,
          paddingRight: document.page.marginRight,
          paddingBottom: document.page.marginBottom,
          paddingLeft: document.page.marginLeft,
        }}
      >
        <div
          className={document.header.alignment === "center" ? "text-center" : "text-left"}
        >
          {headerImageUrl ? (
            <div className="mb-5 flex justify-center">
              <img
                alt="Identidade visual do modelo"
                className="max-h-24 max-w-[240px] object-contain"
                src={headerImageUrl}
              />
            </div>
          ) : null}
          <div
            className="document-preview-rich text-slate-900 dark:text-slate-100"
            dangerouslySetInnerHTML={{
              __html: highlightTemplateTokens(document.header.titleHtml),
            }}
          />
          <div
            className="document-preview-rich mt-2 text-sm text-slate-600 dark:text-slate-300"
            dangerouslySetInnerHTML={{
              __html: highlightTemplateTokens(document.header.metadataHtml),
            }}
          />
          {document.header.showDivider ? (
            <div
              className="mt-5 h-px w-full"
              style={{ backgroundColor: `${accentColor}22` }}
            />
          ) : null}
        </div>

        <div
          className="document-preview-rich mt-8 flex-1 text-slate-900 dark:text-slate-100"
          dangerouslySetInnerHTML={{
            __html: highlightTemplateTokens(document.bodyHtml),
          }}
        />

        <div
          className={document.footer.alignment === "center" ? "mt-10 text-center" : "mt-10 text-left"}
        >
          {document.footer.showDivider ? (
            <div
              className="mb-4 h-px w-full"
              style={{ backgroundColor: `${accentColor}22` }}
            />
          ) : null}
          <div
            className="document-preview-rich text-xs text-slate-600 dark:text-slate-300"
            dangerouslySetInnerHTML={{
              __html: highlightTemplateTokens(document.footer.html),
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function ModeloPeticaoDocumentPreview({
  documentValue,
  branding,
}: {
  documentValue?: ModeloPeticaoDocumentJson | null;
  branding?: TenantBrandingLite | null;
}) {
  const document = useMemo(
    () =>
      normalizeModeloPeticaoDocument(documentValue, {
        branding,
      }),
    [branding, documentValue],
  );

  return renderDocumentPreview(document, branding);
}

export function ModeloPeticaoDocumentWorkspace({
  value,
  documentValue,
  onChange,
  onDocumentChange,
  variaveis,
  onVariaveisChange,
  branding,
  compact = false,
  presetKey,
  onPresetChange,
  onSuggestedMetadataChange,
  readOnly = false,
}: ModeloPeticaoDocumentWorkspaceProps) {
  const normalizedDocument = useMemo(
    () =>
      normalizeModeloPeticaoDocument(documentValue, {
        conteudo: value,
        presetKey,
        branding,
      }),
    [branding, documentValue, presetKey, value],
  );
  const documentRef = useRef(normalizedDocument);
  const variaveisRef = useRef(variaveis);

  useEffect(() => {
    documentRef.current = normalizedDocument;
  }, [normalizedDocument]);

  useEffect(() => {
    variaveisRef.current = variaveis;
  }, [variaveis]);

  const [activeField, setActiveField] = useState<"header" | "metadata" | "body" | "footer">(
    "body",
  );
  const [variableSearch, setVariableSearch] = useState("");
  const [imageModalTarget, setImageModalTarget] = useState<"header" | "body" | null>(
    null,
  );
  const [imageUploadPending, setImageUploadPending] = useState(false);
  const deferredVariableSearch = useDeferredValue(variableSearch);

  const syncDocument = (nextDocument: ModeloPeticaoDocumentJson) => {
    const normalized = normalizeModeloPeticaoDocument(nextDocument, {
      branding,
    });
    const searchableText = serializeModeloPeticaoDocumentToText(normalized);

    documentRef.current = normalized;
    onDocumentChange?.(normalized);
    onChange(searchableText);
    onVariaveisChange(
      mergeModeloPeticaoVariaveisWithConteudo(variaveisRef.current, searchableText),
    );
  };

  const bodyEditor = useRichTextFieldEditor({
    value: normalizedDocument.bodyHtml,
    readOnly,
    isBody: true,
    onFocus: () => setActiveField("body"),
    onChange: (html) => {
      syncDocument({
        ...documentRef.current,
        bodyHtml: html,
      });
    },
  });
  const headerEditor = useRichTextFieldEditor({
    value: normalizedDocument.header.titleHtml,
    readOnly,
    onFocus: () => setActiveField("header"),
    onChange: (html) => {
      syncDocument({
        ...documentRef.current,
        header: {
          ...documentRef.current.header,
          titleHtml: html,
        },
      });
    },
  });
  const metadataEditor = useRichTextFieldEditor({
    value: normalizedDocument.header.metadataHtml,
    readOnly,
    onFocus: () => setActiveField("metadata"),
    onChange: (html) => {
      syncDocument({
        ...documentRef.current,
        header: {
          ...documentRef.current.header,
          metadataHtml: html,
        },
      });
    },
  });
  const footerEditor = useRichTextFieldEditor({
    value: normalizedDocument.footer.html,
    readOnly,
    onFocus: () => setActiveField("footer"),
    onChange: (html) => {
      syncDocument({
        ...documentRef.current,
        footer: {
          ...documentRef.current.footer,
          html,
        },
      });
    },
  });

  const activeEditor =
    activeField === "body"
      ? bodyEditor
      : activeField === "header"
        ? headerEditor
        : activeField === "metadata"
          ? metadataEditor
          : footerEditor;

  const currentPresetKey = normalizedDocument.preset.key;
  const currentPreset = MODELO_PETICAO_PRESETS[currentPresetKey];
  const presetOptions = getPresetOptions();
  const libraryTokens = extractTemplateTokensFromDocument(normalizedDocument);
  const detectedVariables = useMemo(
    () =>
      mergeModeloPeticaoVariaveisWithConteudo(
        [
          ...normalizeModeloPeticaoVariaveis(variaveis),
          ...VARIABLE_LIBRARY.filter((entry) =>
            libraryTokens.includes(entry.nome),
          ),
        ],
        serializeModeloPeticaoDocumentToText(normalizedDocument),
      ),
    [libraryTokens, normalizedDocument, variaveis],
  );
  const filteredVariableLibrary = useMemo(() => {
    const searchTerm = deferredVariableSearch.trim().toLowerCase();

    return VARIABLE_LIBRARY.filter((entry) => {
      const matchesPreset =
        !entry.presetKeys || entry.presetKeys.includes(currentPresetKey);

      if (!matchesPreset) {
        return false;
      }

      if (!searchTerm) {
        return true;
      }

      return (
        entry.nome.toLowerCase().includes(searchTerm) ||
        entry.descricao.toLowerCase().includes(searchTerm) ||
        (entry.grupo || "").toLowerCase().includes(searchTerm)
      );
    });
  }, [currentPresetKey, deferredVariableSearch]);
  const outlineItems = normalizedDocument.bodyBlocks.filter(
    (block) => block.title && (block.type === "section" || block.type === "title"),
  );

  const insertIntoActiveEditor = (snippet: string) => {
    if (!activeEditor || readOnly) {
      return;
    }

    activeEditor.chain().focus().insertContent(snippet).run();
  };

  const handlePresetChange = (nextPresetKey: string) => {
    if (!nextPresetKey || !(nextPresetKey in MODELO_PETICAO_PRESETS)) {
      return;
    }

    const key = nextPresetKey as ModeloPeticaoPresetKey;
    const nextDocument = createModeloPeticaoDocument(key, branding);

    syncDocument({
      ...nextDocument,
      header: {
        ...nextDocument.header,
        imageMode: normalizedDocument.header.imageMode,
        customImageUrl: normalizedDocument.header.customImageUrl,
      },
      media:
        normalizedDocument.header.imageMode === "custom_image"
          ? normalizedDocument.media
          : nextDocument.media,
    });

    onPresetChange?.(key);
    onSuggestedMetadataChange?.({
      tipo: MODELO_PETICAO_PRESETS[key].suggestedTipo,
      categoria: MODELO_PETICAO_PRESETS[key].suggestedCategoria,
    });
  };

  const handleChangeHeaderImageMode = (nextMode: HeaderImageMode) => {
    syncDocument({
      ...documentRef.current,
      header: {
        ...documentRef.current.header,
        imageMode: nextMode,
        customImageUrl: nextMode === "custom_image" ? documentRef.current.header.customImageUrl : null,
      },
    });
  };

  const handleSaveImage = async (
    imageData: string | null,
    isUrl: boolean,
    target: "header" | "body",
  ) => {
    if (!imageData || readOnly) {
      return;
    }

    setImageUploadPending(true);

    try {
      const formData = new FormData();

      if (isUrl) {
        formData.append("url", imageData);
      } else {
        const imageResponse = await fetch(imageData);
        const imageBlob = await imageResponse.blob();
        formData.append(
          "file",
          imageBlob,
          `modelo-peticao-${Date.now()}.${imageBlob.type.includes("png") ? "png" : "jpg"}`,
        );
      }

      const result = await uploadModeloPeticaoImage(formData);

      if (!result.success || !result.data?.url) {
        toast.error(result.error || "Não foi possível enviar a imagem.");
        return;
      }

      if (target === "header") {
        syncDocument({
          ...documentRef.current,
          header: {
            ...documentRef.current.header,
            imageMode: "custom_image",
            customImageUrl: result.data.url,
          },
        });
        toast.success("Imagem do cabeçalho atualizada.");
      } else if (bodyEditor) {
        bodyEditor
          .chain()
          .focus()
          .setImage({ src: result.data.url, alt: "Imagem da petição" })
          .run();
        toast.success("Imagem inserida no corpo do documento.");
      }
    } catch (error) {
      toast.error("Falha ao processar a imagem.");
    } finally {
      setImageUploadPending(false);
      setImageModalTarget(null);
    }
  };

  const pageShellClasses = compact
    ? "grid grid-cols-1 gap-5 xl:grid-cols-[320px_minmax(0,1fr)]"
    : "grid grid-cols-1 gap-5 2xl:grid-cols-[320px_minmax(0,1fr)_300px]";
  const panelClasses =
    "rounded-[28px] border border-default-200/80 bg-content1/90 shadow-[0_24px_64px_-44px_rgba(15,23,42,0.58)] backdrop-blur dark:border-white/10 dark:bg-slate-950/72";
  const headerImageUrl = getHeaderImageUrl(normalizedDocument, branding);

  return (
    <>
      <div className={pageShellClasses}>
        <div className="space-y-5">
          <Card className={panelClasses}>
            <CardHeader className="flex items-start gap-3 border-b border-default-200/70 px-5 py-4 dark:border-white/10">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-base font-semibold">Composição do modelo</p>
                <p className="text-sm text-default-500">
                  Documento A4 com identidade visual, seções e vocabulário jurídico.
                </p>
              </div>
            </CardHeader>
            <CardBody className="space-y-5 px-5 py-5">
              <Select
                isDisabled={readOnly}
                items={presetOptions}
                label="Preset inicial"
                selectedKeys={[currentPresetKey]}
                onSelectionChange={(keys) => {
                  const nextValue = String(Array.from(keys)[0] || currentPresetKey);
                  handlePresetChange(nextValue);
                }}
              >
                {(item) => (
                  <SelectItem key={item.key} textValue={item.label}>
                    {item.label}
                  </SelectItem>
                )}
              </Select>

              <div className="rounded-2xl border border-default-200/70 bg-content2/50 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                  Direção ativa
                </p>
                <p className="mt-2 text-sm text-default-700 dark:text-default-300">
                  {currentPreset.description}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Chip size="sm" variant="flat">
                    {normalizedDocument.partyVocabulary.primaryPartyLabel}
                  </Chip>
                  <Chip size="sm" variant="flat">
                    {normalizedDocument.partyVocabulary.opposingPartyLabel}
                  </Chip>
                  {normalizedDocument.partyVocabulary.prosecutorLabel ? (
                    <Chip size="sm" variant="flat">
                      {normalizedDocument.partyVocabulary.prosecutorLabel}
                    </Chip>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                  Cabeçalho
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    color={normalizedDocument.header.imageMode === "tenant_logo" ? "primary" : "default"}
                    isDisabled={readOnly || !branding?.logoUrl}
                    variant={normalizedDocument.header.imageMode === "tenant_logo" ? "solid" : "bordered"}
                    onPress={() => handleChangeHeaderImageMode("tenant_logo")}
                  >
                    Logo
                  </Button>
                  <Button
                    color={normalizedDocument.header.imageMode === "custom_image" ? "primary" : "default"}
                    isDisabled={readOnly}
                    variant={normalizedDocument.header.imageMode === "custom_image" ? "solid" : "bordered"}
                    onPress={() => {
                      handleChangeHeaderImageMode("custom_image");
                      setImageModalTarget("header");
                    }}
                  >
                    Imagem
                  </Button>
                  <Button
                    color={normalizedDocument.header.imageMode === "none" ? "primary" : "default"}
                    isDisabled={readOnly}
                    variant={normalizedDocument.header.imageMode === "none" ? "solid" : "bordered"}
                    onPress={() => handleChangeHeaderImageMode("none")}
                  >
                    Sem
                  </Button>
                </div>

                <div className="rounded-2xl border border-default-200/70 bg-content2/50 px-4 py-4">
                  <p className="text-sm font-medium text-default-700 dark:text-default-200">
                    {normalizedDocument.header.imageMode === "tenant_logo"
                      ? branding?.logoUrl
                        ? "Usando a logo padrão do escritório."
                        : "Este tenant ainda não tem logo publicada."
                      : normalizedDocument.header.imageMode === "custom_image"
                        ? normalizedDocument.header.customImageUrl
                          ? "Imagem própria do modelo configurada."
                          : "Adicione uma imagem própria para este modelo."
                        : "Cabeçalho sem imagem."}
                  </p>
                  {normalizedDocument.header.imageMode === "custom_image" ? (
                    <div className="mt-3 flex gap-2">
                      <Button
                        isDisabled={readOnly}
                        size="sm"
                        startContent={<ImagePlus className="h-4 w-4" />}
                        variant="light"
                        onPress={() => setImageModalTarget("header")}
                      >
                        Trocar imagem
                      </Button>
                      {normalizedDocument.header.customImageUrl ? (
                        <Button
                          isDisabled={readOnly}
                          size="sm"
                          variant="light"
                          onPress={() =>
                            syncDocument({
                              ...documentRef.current,
                              header: {
                                ...documentRef.current.header,
                                customImageUrl: null,
                              },
                            })
                          }
                        >
                          Remover
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                  Inserções rápidas
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {TYPOGRAPHY_TOKENS.map((action) => {
                    const Icon = action.icon;
                    return (
                      <Button
                        key={action.id}
                        isDisabled={readOnly || !bodyEditor}
                        size="sm"
                        startContent={<Icon className="h-4 w-4" />}
                        variant="bordered"
                        onPress={() => action.action(bodyEditor!)}
                      >
                        {action.label}
                      </Button>
                    );
                  })}
                </div>
                <div className="space-y-2">
                  {currentPreset.quickBlocks.map((block) => (
                    <Button
                      key={block.id}
                      isDisabled={readOnly || !bodyEditor}
                      fullWidth
                      size="sm"
                      variant="light"
                      onPress={() => bodyEditor?.chain().focus().insertContent(block.html).run()}
                    >
                      {block.label}
                    </Button>
                  ))}
                </div>
              </div>
            </CardBody>
          </Card>

          {compact ? null : (
            <Card className={panelClasses}>
              <CardHeader className="flex items-center justify-between border-b border-default-200/70 px-5 py-4 dark:border-white/10">
                <div>
                  <p className="text-base font-semibold">Variáveis</p>
                  <p className="text-sm text-default-500">
                    Insira placeholders no cabeçalho, corpo ou rodapé.
                  </p>
                </div>
                <ScanSearch className="h-5 w-5 text-primary" />
              </CardHeader>
              <CardBody className="space-y-4 px-5 py-5">
                <Input
                  isClearable
                  placeholder="Buscar variável"
                  value={variableSearch}
                  onClear={() => setVariableSearch("")}
                  onValueChange={setVariableSearch}
                />
                <ScrollShadow className="max-h-[460px] pr-2">
                  <VariableLibrarySection
                    items={filteredVariableLibrary}
                    onInsert={insertIntoActiveEditor}
                  />
                </ScrollShadow>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <FormattingToolbar
            editor={activeEditor}
            onInsertBodyImage={() => setImageModalTarget("body")}
          />

          <div className="overflow-hidden rounded-[36px] border border-default-200/80 bg-[linear-gradient(180deg,rgba(241,245,249,0.88),rgba(255,255,255,0.92))] p-3 shadow-[0_30px_90px_-58px_rgba(15,23,42,0.72)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(2,6,23,0.96))] sm:p-6">
            <div className="flex justify-center overflow-x-auto">
              <div
                className="relative overflow-hidden rounded-[32px] border border-default-200/80 bg-white shadow-[0_30px_90px_-42px_rgba(15,23,42,0.48)] dark:border-white/10 dark:bg-slate-950"
                style={{
                  maxWidth: A4_WIDTH,
                  minHeight: A4_MIN_HEIGHT,
                  fontFamily: normalizedDocument.page.fontFamily,
                  fontSize: `${normalizedDocument.page.fontSize}px`,
                  lineHeight: normalizedDocument.page.lineHeight,
                }}
              >
                <div
                  className="absolute inset-x-0 top-0 h-24 opacity-70"
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(15,23,42,0.04) 0%, rgba(15,23,42,0) 100%)",
                  }}
                />
                <div
                  className="relative flex min-h-[inherit] flex-col"
                  style={{
                    paddingTop: normalizedDocument.page.marginTop,
                    paddingRight: normalizedDocument.page.marginRight,
                    paddingBottom: normalizedDocument.page.marginBottom,
                    paddingLeft: normalizedDocument.page.marginLeft,
                  }}
                >
                  <div
                    className={
                      normalizedDocument.header.alignment === "center"
                        ? "text-center"
                        : "text-left"
                    }
                  >
                    {headerImageUrl ? (
                      <div className="mb-5 flex justify-center">
                        <img
                          alt="Identidade visual do modelo"
                          className="max-h-24 max-w-[240px] object-contain"
                          src={headerImageUrl}
                        />
                      </div>
                    ) : null}

                    <EditorContent editor={headerEditor} />
                    <div className="mt-2">
                      <EditorContent editor={metadataEditor} />
                    </div>
                    {normalizedDocument.header.showDivider ? (
                      <div className="mt-5 h-px w-full bg-default-200/80 dark:bg-white/10" />
                    ) : null}
                  </div>

                  <div className="mt-8 flex-1">
                    <EditorContent editor={bodyEditor} />
                  </div>

                  <div
                    className={
                      normalizedDocument.footer.alignment === "center"
                        ? "mt-10 text-center"
                        : "mt-10 text-left"
                    }
                  >
                    {normalizedDocument.footer.showDivider ? (
                      <div className="mb-4 h-px w-full bg-default-200/80 dark:bg-white/10" />
                    ) : null}
                    <EditorContent editor={footerEditor} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={compact ? "space-y-5 xl:col-span-2" : "space-y-5"}>
          <Card className={panelClasses}>
            <CardHeader className="flex items-start gap-3 border-b border-default-200/70 px-5 py-4 dark:border-white/10">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-base font-semibold">Resumo operacional</p>
                <p className="text-sm text-default-500">
                  Outline da peça, variáveis detectadas e compatibilidade com petições.
                </p>
              </div>
            </CardHeader>
            <CardBody className="space-y-5 px-5 py-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-default-200/70 bg-content2/50 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                    Preset
                  </p>
                  <p className="mt-2 text-sm font-semibold">{currentPreset.label}</p>
                </div>
                <div className="rounded-2xl border border-default-200/70 bg-content2/50 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                    Seções
                  </p>
                  <p className="mt-2 text-sm font-semibold">
                    {normalizedDocument.bodyBlocks.length} blocos mapeados
                  </p>
                </div>
                <div className="rounded-2xl border border-default-200/70 bg-content2/50 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                    Variáveis
                  </p>
                  <p className="mt-2 text-sm font-semibold">
                    {detectedVariables.length} detectadas
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                  Outline do corpo
                </p>
                <div className="space-y-2">
                  {outlineItems.length ? (
                    outlineItems.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-default-200/70 bg-content2/50 px-4 py-3"
                      >
                        <p className="text-sm font-semibold text-default-700 dark:text-default-200">
                          {item.title}
                        </p>
                        <p className="mt-1 text-xs text-default-500">
                          {item.type === "title" ? "Título principal" : "Seção"}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-default-500">
                      O outline aparece conforme você adiciona títulos e seções.
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                  Variáveis detectadas
                </p>
                <div className="flex flex-wrap gap-2">
                  {detectedVariables.length ? (
                    detectedVariables.map((variavel) => (
                      <Chip key={variavel.nome} size="sm" variant="flat">
                        {`{{${variavel.nome}}}`}
                      </Chip>
                    ))
                  ) : (
                    <p className="text-sm text-default-500">
                      Nenhuma variável detectada no momento.
                    </p>
                  )}
                </div>
              </div>

              {compact ? (
                <div className="space-y-3">
                  <Divider />
                  <Input
                    isClearable
                    placeholder="Buscar variável"
                    value={variableSearch}
                    onClear={() => setVariableSearch("")}
                    onValueChange={setVariableSearch}
                  />
                  <ScrollShadow className="max-h-[300px] pr-2">
                    <VariableLibrarySection
                      items={filteredVariableLibrary}
                      onInsert={insertIntoActiveEditor}
                    />
                  </ScrollShadow>
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card className={panelClasses}>
            <CardHeader className="flex items-center justify-between border-b border-default-200/70 px-5 py-4 dark:border-white/10">
              <div>
                <p className="text-base font-semibold">Configurações rápidas</p>
                <p className="text-sm text-default-500">
                  Ajustes visuais para o documento final.
                </p>
              </div>
              <Type className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardBody className="space-y-4 px-5 py-5">
              <Switch
                isDisabled={readOnly}
                isSelected={normalizedDocument.header.showDivider}
                onValueChange={(checked) =>
                  syncDocument({
                    ...documentRef.current,
                    header: {
                      ...documentRef.current.header,
                      showDivider: checked,
                    },
                  })
                }
              >
                Linha no cabeçalho
              </Switch>

              <Switch
                isDisabled={readOnly}
                isSelected={normalizedDocument.footer.showDivider}
                onValueChange={(checked) =>
                  syncDocument({
                    ...documentRef.current,
                    footer: {
                      ...documentRef.current.footer,
                      showDivider: checked,
                    },
                  })
                }
              >
                Linha no rodapé
              </Switch>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  isDisabled={readOnly}
                  variant={
                    normalizedDocument.header.alignment === "left"
                      ? "solid"
                      : "bordered"
                  }
                  onPress={() =>
                    syncDocument({
                      ...documentRef.current,
                      header: {
                        ...documentRef.current.header,
                        alignment: "left",
                      },
                    })
                  }
                >
                  <AlignLeft className="h-4 w-4" />
                </Button>
                <Button
                  isDisabled={readOnly}
                  variant={
                    normalizedDocument.header.alignment === "center"
                      ? "solid"
                      : "bordered"
                  }
                  onPress={() =>
                    syncDocument({
                      ...documentRef.current,
                      header: {
                        ...documentRef.current.header,
                        alignment: "center",
                      },
                    })
                  }
                >
                  <AlignCenter className="h-4 w-4" />
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      <ImageEditorModal
        currentImageUrl={
          imageModalTarget === "header"
            ? normalizedDocument.header.customImageUrl
            : undefined
        }
        isOpen={imageModalTarget !== null}
        onClose={() => setImageModalTarget(null)}
        onSave={(imageData, isUrl) => {
          if (!imageModalTarget) {
            return;
          }

          startTransition(() => {
            void handleSaveImage(imageData, isUrl, imageModalTarget);
          });
        }}
      />

      {imageUploadPending ? (
        <div className="fixed bottom-6 right-6 z-50 rounded-2xl border border-default-200/80 bg-content1/95 px-4 py-3 shadow-lg backdrop-blur">
          <p className="text-sm text-default-700 dark:text-default-200">
            Enviando imagem do modelo...
          </p>
        </div>
      ) : null}
    </>
  );
}
