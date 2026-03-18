"use client";

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type Key,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  Input,
  Progress,
  Spinner,
  Tab,
  Tabs,
  Textarea,
} from "@heroui/react";
import { addToast } from "@heroui/toast";
import useSWR from "swr";
import {
  ArrowLeft,
  ArrowUpRight,
  BrainCircuit,
  Copy,
  Download,
  FileSearch,
  FileText,
  History,
  LibraryBig,
  Scale,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import {
  createJuridicalAiDocumentFromDraft,
  createJuridicalAiPeticaoFromDraft,
  createJuridicalAiModelFromDraft,
  executeJuridicalAiDocumentAnalysis,
  executeJuridicalAiGenericTask,
  executeJuridicalAiPieceDraft,
  getJuridicalAiCaseMemory,
  getJuridicalAiDraftDetail,
  getJuridicalAiWorkspaceBootstrap,
  trackJuridicalAiInteraction,
} from "@/app/actions/juridical-ai";
import { useDocumentosProcesso, useAllProcessos } from "@/app/hooks/use-processos";
import { useModelosPeticaoAtivos } from "@/app/hooks/use-modelos-peticao";
import {
  JURIDICAL_AI_GENERIC_TASK_OPTIONS,
  JURIDICAL_AI_PIECE_TYPES,
  JURIDICAL_AI_ROLLOUT_STAGE_LABELS,
  JURIDICAL_AI_TAB_LABELS,
  JURIDICAL_AI_TASK_LABELS,
  JURIDICAL_AI_TIER_LABELS,
  JURIDICAL_AI_USAGE_METRICS,
} from "@/app/lib/juridical-ai/constants";
import {
  getJuridicalAiTaskForAction,
  getJuridicalAiWorkspaceTabForAction,
} from "@/app/lib/juridical-ai/assistant-dock";
import type {
  JuridicalAiAnalysisResult,
  JuridicalAiCaseMemoryView,
  JuridicalAiDraftResult,
  JuridicalAiGenericResult,
  JuridicalAiTaskKey,
  JuridicalAiWorkspaceBootstrap,
  JuridicalAiWorkspaceTab,
} from "@/app/lib/juridical-ai/types";
import { SearchableSelect, type SearchableSelectOption } from "@/components/searchable-select";

type WorkspaceResult =
  | { kind: "piece"; data: JuridicalAiDraftResult }
  | { kind: "analysis"; data: JuridicalAiAnalysisResult }
  | { kind: "generic"; data: JuridicalAiGenericResult }
  | null;

const WORKSPACE_TAB_ORDER: JuridicalAiWorkspaceTab[] = [
  "peca",
  "documento",
  "citacoes",
  "pergunta",
  "pesquisa",
  "historico",
];

const WORKSPACE_ICONS: Record<JuridicalAiWorkspaceTab, ReactNode> = {
  peca: <FileText className="h-4 w-4" />,
  documento: <FileSearch className="h-4 w-4" />,
  citacoes: <ShieldCheck className="h-4 w-4" />,
  pergunta: <BrainCircuit className="h-4 w-4" />,
  pesquisa: <Scale className="h-4 w-4" />,
  historico: <History className="h-4 w-4" />,
};

const WORKSPACE_PRIMARY_TASK_BY_TAB: Partial<
  Record<JuridicalAiWorkspaceTab, JuridicalAiTaskKey>
> = {
  peca: "PIECE_DRAFTING",
  documento: "DOCUMENT_ANALYSIS",
  citacoes: "CITATION_VALIDATION",
  pesquisa: "JURISPRUDENCE_BRIEF",
};

const WORKSPACE_GENERIC_TASKS: JuridicalAiTaskKey[] = [
  "QUESTION_ANSWERING",
  "PROCESS_SUMMARY",
  "CASE_STRATEGY",
];

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR");
}

function formatQuota(limit: number | null) {
  return limit === null ? "Ilimitado" : limit.toString();
}

async function copyMarkdownOutput(content: string) {
  await navigator.clipboard.writeText(content);
}

function downloadMarkdownOutput(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function buildWorkspaceFetcher() {
  return getJuridicalAiWorkspaceBootstrap().then((response) => {
    if (!response.success || !response.data) {
      throw new Error(response.error ?? "Nao foi possivel carregar o workspace.");
    }

    return response.data;
  });
}

function normalizeTabFromSearchParams(
  searchParams: { get(name: string): string | null },
): JuridicalAiWorkspaceTab {
  const tab = searchParams.get("tab");
  if (tab && WORKSPACE_TAB_ORDER.includes(tab as JuridicalAiWorkspaceTab)) {
    return tab as JuridicalAiWorkspaceTab;
  }

  const action = searchParams.get("action");
  if (action) {
    return getJuridicalAiWorkspaceTabForAction(action as never);
  }

  return "peca";
}

function resolveInitialGenericTask(searchParams: {
  get(name: string): string | null;
}): JuridicalAiTaskKey {
  const action = searchParams.get("action");
  if (action) {
    return getJuridicalAiTaskForAction(action as never);
  }

  return "QUESTION_ANSWERING";
}

function UsageMetricCard({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number | null;
}) {
  const percent =
    limit === null || limit === 0 ? undefined : Math.min(100, Math.round((used / limit) * 100));

  return (
    <Card className="border border-default-200/60 bg-content1/70">
      <CardBody className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <Chip color={limit === null ? "success" : percent && percent >= 85 ? "warning" : "primary"} size="sm" variant="flat">
            {used} / {formatQuota(limit)}
          </Chip>
        </div>
        {typeof percent === "number" ? (
          <Progress aria-label={label} color={percent >= 85 ? "warning" : "primary"} value={percent} />
        ) : (
          <p className="text-xs text-default-500">
            Sem franquia mensal fixa para este recurso.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function ResultPanel({
  result,
  onCopyContent,
  onDownloadContent,
  onCreateModelFromDraft,
  onCreateDocumentFromDraft,
  onCreatePeticaoFromDraft,
  isCreatingModel,
  isCreatingDocument,
  isCreatingPeticao,
}: {
  result: WorkspaceResult;
  onCopyContent: (content: string) => void | Promise<void>;
  onDownloadContent: (content: string, filename: string) => void;
  onCreateModelFromDraft: (draftId: string) => void;
  onCreateDocumentFromDraft: (draftId: string) => void;
  onCreatePeticaoFromDraft: (draftId: string) => void;
  isCreatingModel: boolean;
  isCreatingDocument: boolean;
  isCreatingPeticao: boolean;
}) {
  if (!result) {
    return (
      <Card className="border border-dashed border-primary/25 bg-primary/5">
        <CardBody className="items-center justify-center gap-3 py-10 text-center">
          <div className="rounded-full border border-primary/20 bg-primary/10 p-4 text-primary">
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <p className="text-lg font-semibold text-foreground">
              Resultado do workspace
            </p>
            <p className="max-w-xl text-sm text-default-500">
              A primeira execução vai aparecer aqui com resumo, rastreio do prompt e saída em markdown para revisão humana.
            </p>
          </div>
        </CardBody>
      </Card>
    );
  }

  const confidence = result.data.confidenceScore ?? null;
  const markdownContent =
    "contentMarkdown" in result.data ? result.data.contentMarkdown : null;

  return (
    <Card className="border border-primary/20 bg-content1/80">
      <CardHeader className="flex flex-col items-start gap-3 border-b border-default-200/70">
        <div className="flex w-full flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Resultado mais recente
            </p>
            <h3 className="text-xl font-semibold text-foreground">
              {result.kind === "piece"
                ? result.data.title
                : result.kind === "analysis"
                  ? "Análise documental"
                  : "Resposta jurídica assistida"}
            </h3>
            <p className="text-sm text-default-500">{result.data.summary}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip color="primary" size="sm" variant="flat">
              {result.data.engine === "OPENAI_RESPONSES" ? "OpenAI" : "Motor local"}
            </Chip>
            {result.data.promptVersionLabel ? (
              <Chip color="secondary" size="sm" variant="flat">
                {result.data.promptVersionLabel}
              </Chip>
            ) : null}
            {confidence !== null ? (
              <Chip color={confidence >= 75 ? "success" : "warning"} size="sm" variant="flat">
                Confiança {confidence}%
              </Chip>
            ) : null}
            {markdownContent ? (
              <>
                <Button
                  size="sm"
                  startContent={<Copy className="h-4 w-4" />}
                  variant="flat"
                  onPress={() => onCopyContent(markdownContent)}
                >
                  Copiar
                </Button>
                <Button
                  size="sm"
                  startContent={<Download className="h-4 w-4" />}
                  variant="flat"
                  onPress={() =>
                    onDownloadContent(
                      markdownContent,
                      `${
                        result.kind === "piece"
                          ? result.data.title
                          : result.kind === "analysis"
                            ? "analise-documental"
                            : "resposta-juridica"
                      }-${Date.now()}.md`,
                    )
                  }
                >
                  Baixar .md
                </Button>
                {result.kind === "piece" ? (
                  <>
                    <Button
                      isLoading={isCreatingDocument}
                      size="sm"
                      startContent={<FileText className="h-4 w-4" />}
                      variant="flat"
                      onPress={() => onCreateDocumentFromDraft(result.data.draftId)}
                    >
                      Salvar em documentos
                    </Button>
                    <Button
                      color="primary"
                      isLoading={isCreatingPeticao}
                      size="sm"
                      startContent={<FileText className="h-4 w-4" />}
                      variant="flat"
                      onPress={() => onCreatePeticaoFromDraft(result.data.draftId)}
                    >
                      Criar petição
                    </Button>
                    <Button
                      color="secondary"
                      isLoading={isCreatingModel}
                      size="sm"
                      startContent={<LibraryBig className="h-4 w-4" />}
                      variant="flat"
                      onPress={() => onCreateModelFromDraft(result.data.draftId)}
                    >
                      Salvar como modelo
                    </Button>
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardBody className="gap-5">
        {"contentMarkdown" in result.data ? (
          <div className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
              Saída em markdown
            </p>
            <pre className="overflow-x-auto whitespace-pre-wrap text-sm leading-7 text-foreground">
              {result.data.contentMarkdown}
            </pre>
          </div>
        ) : null}

        {"sourceLeads" in result.data && result.data.sourceLeads?.length ? (
          <div className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
              Lastro e fontes verificáveis
            </p>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {result.data.sourceLeads.map((item) => (
                <div
                  key={`${item.sourceType}-${item.label}-${item.detail}`}
                  className="rounded-2xl border border-default-200/60 px-3 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">{item.label}</p>
                      <p className="text-xs text-default-500">
                        {item.sourceType} • {item.detail}
                      </p>
                    </div>
                    <Chip
                      color={
                        item.verificationLevel === "OFICIAL"
                          ? "success"
                          : item.verificationLevel === "INTERNO"
                            ? "primary"
                            : "warning"
                      }
                      size="sm"
                      variant="flat"
                    >
                      {item.verificationLevel}
                    </Chip>
                  </div>
                  <p className="mt-3 text-sm text-default-700">{item.whyItMatters}</p>
                  {item.verificationLinks?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.verificationLinks.map((link) => (
                        <a
                          key={`${item.label}-${link.href}`}
                          className="inline-flex items-center gap-1 rounded-full border border-default-200/70 px-3 py-1.5 text-xs font-medium text-default-700 transition hover:border-primary/40 hover:text-primary"
                          href={link.href}
                          rel={link.kind === "EXTERNAL" ? "noreferrer" : undefined}
                          target={link.kind === "EXTERNAL" ? "_blank" : undefined}
                        >
                          <ArrowUpRight className="h-3.5 w-3.5" />
                          <span>{link.label}</span>
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {result.kind === "piece" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                Citações capturadas
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {result.data.citations.length > 0 ? (
                  result.data.citations.map((item) => (
                    <Chip key={item} size="sm" variant="flat">
                      {item}
                    </Chip>
                  ))
                ) : (
                  <p className="text-sm text-default-500">
                    Nenhuma citação automática encontrada no rascunho.
                  </p>
                )}
              </div>
            </div>
            <div className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                Revisão humana pendente
              </p>
              <ul className="mt-3 space-y-2 text-sm text-default-600">
                {result.data.pendingReview.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
                {result.data.pendingReview.length === 0 ? (
                  <li>• Nenhum ponto crítico adicional sinalizado.</li>
                ) : null}
              </ul>
            </div>
          </div>
        ) : null}

        {result.kind === "analysis" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                Achados
              </p>
              <div className="mt-3 space-y-3">
                {result.data.findings.map((item) => (
                  <div key={`${item.label}-${item.detail}`} className="rounded-2xl border border-default-200/60 px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">{item.label}</p>
                      <Chip color={item.severity === "HIGH" ? "danger" : item.severity === "MEDIUM" ? "warning" : "success"} size="sm" variant="flat">
                        {item.severity}
                      </Chip>
                    </div>
                    <p className="mt-2 text-sm text-default-600">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <div className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                  Alertas de risco
                </p>
                <ul className="mt-3 space-y-2 text-sm text-default-600">
                  {result.data.riskFlags.length > 0 ? (
                    result.data.riskFlags.map((item) => <li key={item}>• {item}</li>)
                  ) : (
                    <li>• Nenhum risco automático sensível identificado no texto colado.</li>
                  )}
                </ul>
              </div>
              <div className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                  Próximos passos
                </p>
                <ul className="mt-3 space-y-2 text-sm text-default-600">
                  {result.data.recommendations.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : null}

        {result.kind === "generic" ? (
          <div className="space-y-4">
            <div className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                Pontos principais
              </p>
              <ul className="mt-3 space-y-2 text-sm text-default-600">
                {result.data.bullets.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>

            {result.data.citationChecks?.length ? (
              <div className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                  Radar de referências
                </p>
                <div className="mt-3 space-y-3">
                  {result.data.citationChecks.map((item) => (
                    <div
                      key={`${item.sourceType}-${item.normalizedReference}`}
                      className="rounded-2xl border border-default-200/60 px-3 py-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-foreground">{item.label}</p>
                          <p className="text-xs text-default-500">
                            {item.sourceType} • {item.normalizedReference}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Chip
                            color={
                              item.status === "CONFIRMAVEL"
                                ? "success"
                                : item.status === "INCOMPLETA"
                                  ? "warning"
                                  : "danger"
                            }
                            size="sm"
                            variant="flat"
                          >
                            {item.status}
                          </Chip>
                          {item.externalVerificationStatus ? (
                            <Chip
                              color={
                                item.externalVerificationStatus ===
                                "CONFIRMADA_FONTE_OFICIAL"
                                  ? "primary"
                                  : item.externalVerificationStatus ===
                                      "CONFIRMADA_EM_BUSCA_OFICIAL"
                                    ? "success"
                                  : item.externalVerificationStatus ===
                                      "PORTAL_OFICIAL_COM_RESTRICAO"
                                    ? "warning"
                                  : item.externalVerificationStatus ===
                                      "FONTE_OFICIAL_SEM_MATCH"
                                    ? "warning"
                                  : item.externalVerificationStatus ===
                                      "LINK_OFICIAL_DE_PESQUISA"
                                    ? "secondary"
                                    : item.externalVerificationStatus ===
                                        "FONTE_EXTERNA_INDISPONIVEL"
                                      ? "warning"
                                      : "default"
                              }
                              size="sm"
                              variant="flat"
                            >
                              {item.externalVerificationStatus ===
                              "CONFIRMADA_FONTE_OFICIAL"
                                ? "Fonte oficial online"
                                : item.externalVerificationStatus ===
                                    "CONFIRMADA_EM_BUSCA_OFICIAL"
                                  ? "Match em base oficial"
                                : item.externalVerificationStatus ===
                                    "PORTAL_OFICIAL_COM_RESTRICAO"
                                  ? "Portal oficial com restrição"
                                : item.externalVerificationStatus ===
                                    "FONTE_OFICIAL_SEM_MATCH"
                                  ? "Fonte sem match"
                                : item.externalVerificationStatus ===
                                    "LINK_OFICIAL_DE_PESQUISA"
                                  ? "Pesquisa oficial"
                                  : item.externalVerificationStatus ===
                                      "FONTE_EXTERNA_INDISPONIVEL"
                                    ? "Fonte indisponível"
                                    : "Sem confirmação externa"}
                            </Chip>
                          ) : null}
                        </div>
                      </div>
                      <p className="mt-3 text-sm text-default-700">{item.rationale}</p>
                      <p className="mt-2 text-xs text-default-500">{item.guidance}</p>
                      {item.externalVerificationNote ? (
                        <p className="mt-2 text-xs text-default-500">
                          {item.externalVerificationNote}
                        </p>
                      ) : null}
                      {item.externalVerificationExcerpt ? (
                        <div className="mt-3 rounded-2xl border border-default-200/60 bg-content1/60 px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-default-500">
                            Trecho localizado na fonte
                          </p>
                          <p className="mt-2 text-xs leading-6 text-default-600">
                            {item.externalVerificationExcerpt}
                          </p>
                        </div>
                      ) : null}
                      {item.verificationLinks?.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.verificationLinks.map((link) => (
                            <a
                              key={`${item.normalizedReference}-${link.href}`}
                              className="inline-flex items-center gap-1 rounded-full border border-default-200/70 px-3 py-1.5 text-xs font-medium text-default-700 transition hover:border-primary/40 hover:text-primary"
                              href={link.href}
                              rel={link.kind === "EXTERNAL" ? "noreferrer" : undefined}
                              target={link.kind === "EXTERNAL" ? "_blank" : undefined}
                            >
                              <ArrowUpRight className="h-3.5 w-3.5" />
                              <span>{link.label}</span>
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {result.data.researchPlan ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                    Plano de pesquisa
                  </p>
                  <div className="mt-3 space-y-4 text-sm text-default-700">
                    <div>
                      <p className="font-semibold text-foreground">Objetivo</p>
                      <p className="mt-1">{result.data.researchPlan.objective}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">Consultas principais</p>
                      <ul className="mt-2 space-y-2">
                        {result.data.researchPlan.primaryQueries.map((item) => (
                          <li key={item}>• {item}</li>
                        ))}
                      </ul>
                    </div>
                    {result.data.researchPlan.alternateQueries.length > 0 ? (
                      <div>
                        <p className="font-semibold text-foreground">Consultas alternativas</p>
                        <ul className="mt-2 space-y-2">
                          {result.data.researchPlan.alternateQueries.map((item) => (
                            <li key={item}>• {item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                      Tribunais e recortes
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {result.data.researchPlan.targetCourts.map((item) => (
                        <Chip key={item} size="sm" variant="flat">
                          {item}
                        </Chip>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                      Ângulos favoráveis
                    </p>
                    <ul className="mt-3 space-y-2 text-sm text-default-700">
                      {result.data.researchPlan.favorableAngles.map((item) => (
                        <li key={item}>• {item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                      Contrapontos e validação
                    </p>
                    <ul className="mt-3 space-y-2 text-sm text-default-700">
                      {result.data.researchPlan.opposingAngles.map((item) => (
                        <li key={item}>• {item}</li>
                      ))}
                      {result.data.researchPlan.validationChecklist.map((item) => (
                        <li key={item} className="text-default-600">
                          • {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function CaseMemoryCard({
  memory,
  allowCaseMemory,
  isLoading,
}: {
  memory?: JuridicalAiCaseMemoryView | null;
  allowCaseMemory: boolean;
  isLoading: boolean;
}) {
  if (!allowCaseMemory) {
    return (
      <Card className="border border-warning/20 bg-warning/5">
        <CardBody className="gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-warning">
            Memória por caso
          </p>
          <p className="text-sm font-semibold text-foreground">
            Disponível a partir do plano Profissional
          </p>
          <p className="text-xs leading-6 text-default-500">
            O workspace continua funcional, mas não mantém resumo contínuo do caso entre execuções.
          </p>
        </CardBody>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="border border-default-200/70 bg-content1/80">
        <CardBody className="items-center justify-center py-6">
          <Spinner size="sm" />
        </CardBody>
      </Card>
    );
  }

  if (!memory) {
    return (
      <Card className="border border-dashed border-default-200/70 bg-content1/80">
        <CardBody className="gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
            Memória por caso
          </p>
          <p className="text-sm font-semibold text-foreground">
            Este processo ainda não tem memória persistida
          </p>
          <p className="text-xs leading-6 text-default-500">
            Gere uma peça, análise ou estratégia vinculada ao processo para iniciar a memória contínua do caso.
          </p>
        </CardBody>
      </Card>
    );
  }

  const latestTaskKey =
    typeof memory.memory.latestTaskKey === "string" ? memory.memory.latestTaskKey : null;
  const latestPieceType =
    typeof memory.memory.latestPieceType === "string" ? memory.memory.latestPieceType : null;
  const latestObjective =
    typeof memory.memory.latestObjective === "string" ? memory.memory.latestObjective : null;
  const latestDocumentName =
    typeof memory.memory.latestDocumentName === "string"
      ? memory.memory.latestDocumentName
      : null;
  const thesis =
    typeof memory.memory.thesis === "string" ? memory.memory.thesis : null;
  const recommendations = Array.isArray(memory.memory.recommendations)
    ? (memory.memory.recommendations as string[])
    : [];

  return (
    <Card className="border border-secondary/20 bg-secondary/5">
      <CardBody className="gap-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-secondary">
            Memória por caso
          </p>
          <p className="text-lg font-semibold text-foreground">{memory.title}</p>
          <p className="text-xs text-default-500">
            Atualizada em {formatDateTime(memory.updatedAt)}
          </p>
        </div>

        {memory.summary ? (
          <div className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
              Resumo consolidado
            </p>
            <p className="mt-3 text-sm leading-7 text-default-700">{memory.summary}</p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {latestPieceType ? (
            <Chip color="primary" size="sm" variant="flat">
              {latestPieceType}
            </Chip>
          ) : null}
          {latestTaskKey ? (
            <Chip color="secondary" size="sm" variant="flat">
              {JURIDICAL_AI_TASK_LABELS[latestTaskKey as JuridicalAiTaskKey] ?? latestTaskKey}
            </Chip>
          ) : null}
          {latestDocumentName ? (
            <Chip size="sm" variant="flat">
              {latestDocumentName}
            </Chip>
          ) : null}
        </div>

        {latestObjective || thesis ? (
          <div className="space-y-3 rounded-3xl border border-default-200/70 bg-default-50/40 p-4">
            {latestObjective ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                  Objetivo mais recente
                </p>
                <p className="mt-2 text-sm text-default-700">{latestObjective}</p>
              </div>
            ) : null}
            {thesis ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                  Tese registrada
                </p>
                <p className="mt-2 text-sm text-default-700">{thesis}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {recommendations.length > 0 ? (
          <div className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
              Recomendações persistidas
            </p>
            <ul className="mt-3 space-y-2 text-sm text-default-700">
              {recommendations.slice(0, 4).map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

export function MagicAiContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedTab, setSelectedTab] = useState<JuridicalAiWorkspaceTab>(
    normalizeTabFromSearchParams(searchParams),
  );
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(
    searchParams.get("processId"),
  );
  const [selectedGenericTask, setSelectedGenericTask] = useState<JuridicalAiTaskKey>(
    resolveInitialGenericTask(searchParams),
  );
  const [workspaceResult, setWorkspaceResult] = useState<WorkspaceResult>(null);
  const [historyQuery, setHistoryQuery] = useState("");
  const [activeHistoryBucket, setActiveHistoryBucket] = useState<
    "sessoes" | "rascunhos" | "memorias"
  >("sessoes");
  const [loadingDraftId, setLoadingDraftId] = useState<string | null>(null);
  const [creatingModelDraftId, setCreatingModelDraftId] = useState<string | null>(null);
  const [creatingDocumentDraftId, setCreatingDocumentDraftId] = useState<string | null>(null);
  const [creatingPeticaoDraftId, setCreatingPeticaoDraftId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const trackedWorkspaceViewRef = useRef<string | null>(null);
  const deferredHistoryQuery = useDeferredValue(historyQuery.trim().toLowerCase());

  const returnTo = searchParams.get("returnTo");
  const actionFromQuery = searchParams.get("action");

  const [pieceForm, setPieceForm] = useState({
    title: "",
    pieceType: "",
    modelId: "",
    documentId: "",
    objective: "",
    thesis: "",
    strategy: "",
    facts: "",
    notes: "",
  });
  const [analysisForm, setAnalysisForm] = useState({
    documentId: "",
    documentName: "",
    documentText: "",
    objective: "",
    notes: "",
  });
  const [genericForm, setGenericForm] = useState({
    question: "",
    objective: "",
    notes: "",
  });

  const bootstrapQuery = useSWR<JuridicalAiWorkspaceBootstrap>(
    "magic-ai-workspace-bootstrap",
    buildWorkspaceFetcher,
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    },
  );
  const caseMemoryQuery = useSWR<JuridicalAiCaseMemoryView | null>(
    selectedProcessId ? ["magic-ai-case-memory", selectedProcessId] : null,
    ([, processId]: [string, string]) =>
      getJuridicalAiCaseMemory(processId).then((response) => {
        if (!response.success) {
          throw new Error(response.error ?? "Nao foi possivel carregar a memoria do caso.");
        }

        return response.data ?? null;
      }),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    },
  );
  const { processos, isLoading: isLoadingProcessos } = useAllProcessos();
  const { documentos, isLoading: isLoadingDocumentos } =
    useDocumentosProcesso(selectedProcessId);
  const { modelos, isLoading: isLoadingModelos } = useModelosPeticaoAtivos();

  useEffect(() => {
    const nextTab = normalizeTabFromSearchParams(searchParams);
    setSelectedTab(nextTab);
  }, [searchParams]);

  useEffect(() => {
    const nextProcessId = searchParams.get("processId");
    if (nextProcessId) {
      setSelectedProcessId(nextProcessId);
    }
  }, [searchParams]);

  useEffect(() => {
    const nextTask = resolveInitialGenericTask(searchParams);
    if (
      nextTask === "QUESTION_ANSWERING" ||
      nextTask === "PROCESS_SUMMARY" ||
      nextTask === "CASE_STRATEGY"
    ) {
      setSelectedGenericTask(nextTask);
    }
  }, [searchParams]);

  useEffect(() => {
    const trackingKey = `${selectedTab}:${actionFromQuery ?? "workspace"}:${pathname}`;
    if (trackedWorkspaceViewRef.current === trackingKey) {
      return;
    }

    trackedWorkspaceViewRef.current = trackingKey;
    void trackJuridicalAiInteraction({
      scope: "tenant",
      interaction: "WORKSPACE_OPENED",
      actionId: actionFromQuery,
      route: `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
      tab: selectedTab,
      processId: searchParams.get("processId"),
    });
  }, [actionFromQuery, pathname, searchParams, selectedTab]);

  useEffect(() => {
    const selectedDocument = documentos.find((item) => item.id === analysisForm.documentId);
    if (selectedDocument && !analysisForm.documentName) {
      setAnalysisForm((current) => ({
        ...current,
        documentName: selectedDocument.nome,
      }));
    }
  }, [analysisForm.documentId, analysisForm.documentName, documentos]);

  const processOptions = useMemo<SearchableSelectOption[]>(
    () =>
      processos.map((processo) => ({
        key: processo.id,
        label: processo.titulo?.trim() || processo.numero,
        textValue: [
          processo.numero,
          processo.numeroCnj ?? "",
          processo.titulo ?? "",
          processo.status ?? "",
        ]
          .filter(Boolean)
          .join(" "),
        description: [processo.numeroCnj, processo.status, processo.fase]
          .filter(Boolean)
          .join(" • "),
      })),
    [processos],
  );

  const documentOptions = useMemo<SearchableSelectOption[]>(
    () =>
      documentos.map((documento) => ({
        key: documento.id,
        label: documento.nome,
        textValue: [documento.nome, documento.tipo ?? "", documento.descricao ?? ""]
          .filter(Boolean)
          .join(" "),
        description: [documento.tipo, documento.descricao].filter(Boolean).join(" • "),
      })),
    [documentos],
  );

  const modelOptions = useMemo<SearchableSelectOption[]>(
    () =>
      modelos.map((modelo) => ({
        key: modelo.id,
        label: modelo.nome,
        textValue: [modelo.nome, modelo.tipo ?? "", modelo.categoria ?? ""]
          .filter(Boolean)
          .join(" "),
        description: [modelo.tipo, modelo.categoria].filter(Boolean).join(" • "),
      })),
    [modelos],
  );

  const filteredSessions = useMemo(() => {
    const sessions = bootstrapQuery.data?.recentSessions ?? [];
    if (!deferredHistoryQuery) {
      return sessions;
    }

    return sessions.filter((session) =>
      [session.title, session.action, session.contextLabel]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(deferredHistoryQuery),
    );
  }, [bootstrapQuery.data?.recentSessions, deferredHistoryQuery]);

  const filteredDrafts = useMemo(() => {
    const drafts = bootstrapQuery.data?.recentDrafts ?? [];
    if (!deferredHistoryQuery) {
      return drafts;
    }

    return drafts.filter((draft) =>
      [draft.title, draft.draftType, draft.summary, draft.contextLabel]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(deferredHistoryQuery),
    );
  }, [bootstrapQuery.data?.recentDrafts, deferredHistoryQuery]);

  const filteredMemories = useMemo(() => {
    const memories = bootstrapQuery.data?.recentMemories ?? [];
    if (!deferredHistoryQuery) {
      return memories;
    }

    return memories.filter((memory) =>
      [memory.title, memory.summary, memory.scopeType]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(deferredHistoryQuery),
    );
  }, [bootstrapQuery.data?.recentMemories, deferredHistoryQuery]);

  const handleTabChange = (key: Key) => {
    const tab = key as JuridicalAiWorkspaceTab;
    setSelectedTab(tab);

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("tab", tab);
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  };

  const refreshWorkspace = () => {
    void bootstrapQuery.mutate();
    void caseMemoryQuery.mutate();
  };

  const handleCopyWorkspaceOutput = async (content: string) => {
    try {
      await copyMarkdownOutput(content);
      addToast({
        color: "success",
        title: "Conteúdo copiado",
        description: "A saída do workspace foi copiada para a área de transferência.",
      });
    } catch {
      addToast({
        color: "danger",
        title: "Falha ao copiar",
        description: "Não foi possível copiar a saída do workspace.",
      });
    }
  };

  const handleDownloadWorkspaceOutput = (content: string, filename: string) => {
    downloadMarkdownOutput(content, filename);
    addToast({
      color: "success",
      title: "Download iniciado",
      description: "O arquivo markdown do workspace está sendo baixado.",
    });
  };

  const handleOpenDraft = (draftId: string) => {
    setLoadingDraftId(draftId);

    startTransition(async () => {
      const response = await getJuridicalAiDraftDetail(draftId);
      setLoadingDraftId(null);

      if (!response.success || !response.data) {
        addToast({
          color: "danger",
          title: "Falha ao abrir rascunho",
          description: response.error ?? "Nao foi possivel carregar o rascunho salvo.",
        });
        return;
      }

      setWorkspaceResult({ kind: "piece", data: response.data });
      setSelectedTab("historico");
      setActiveHistoryBucket("rascunhos");
      addToast({
        color: "success",
        title: "Rascunho reaberto",
        description: "O conteúdo voltou para o painel de resultado do workspace.",
      });
    });
  };

  const handleCreateModelFromDraft = (draftId: string) => {
    setCreatingModelDraftId(draftId);

    startTransition(async () => {
      const response = await createJuridicalAiModelFromDraft(draftId);
      setCreatingModelDraftId(null);

      if (!response.success || !response.data) {
        addToast({
          color: "danger",
          title: "Falha ao salvar modelo",
          description: response.error ?? "Nao foi possivel enviar o rascunho para modelos de peticao.",
        });
        return;
      }

      addToast({
        color: "success",
        title: "Modelo criado",
        description: `${response.data.modelName} entrou no catálogo nativo de modelos.`,
      });
    });
  };

  const handleCreatePeticaoFromDraft = (draftId: string) => {
    setCreatingPeticaoDraftId(draftId);

    startTransition(async () => {
      const response = await createJuridicalAiPeticaoFromDraft(draftId);
      setCreatingPeticaoDraftId(null);

      if (!response.success || !response.data) {
        addToast({
          color: "danger",
          title: "Falha ao criar petição",
          description: response.error ?? "Nao foi possivel enviar o rascunho para peticoes.",
        });
        return;
      }

      addToast({
        color: "success",
        title: "Petição criada",
        description: `${response.data.peticaoTitle} entrou em Petições como rascunho.`,
      });
    });
  };

  const handleCreateDocumentFromDraft = (draftId: string) => {
    setCreatingDocumentDraftId(draftId);

    startTransition(async () => {
      const response = await createJuridicalAiDocumentFromDraft(draftId);
      setCreatingDocumentDraftId(null);

      if (!response.success || !response.data) {
        addToast({
          color: "danger",
          title: "Falha ao salvar documento",
          description:
            response.error ?? "Nao foi possivel enviar o rascunho para documentos.",
        });
        return;
      }

      addToast({
        color: "success",
        title: "Documento criado",
        description: `${response.data.documentoTitle} entrou em Documentos.`,
      });
    });
  };

  const handlePieceDraft = () => {
    startTransition(async () => {
      const response = await executeJuridicalAiPieceDraft({
        action: actionFromQuery ?? "nova-peca",
        title: pieceForm.title,
        pieceType: pieceForm.pieceType,
        processId: selectedProcessId,
        documentId: pieceForm.documentId || null,
        modelId: pieceForm.modelId || null,
        objective: pieceForm.objective,
        thesis: pieceForm.thesis,
        strategy: pieceForm.strategy,
        facts: pieceForm.facts,
        notes: pieceForm.notes,
        returnTo: returnTo ?? "/magic-ai",
      });

      if (!response.success || !response.data) {
        addToast({
          color: "danger",
          title: "Falha ao gerar peça",
          description: response.error ?? "Nao foi possivel gerar o rascunho.",
        });
        return;
      }

      setWorkspaceResult({ kind: "piece", data: response.data });
      refreshWorkspace();
      addToast({
        color: "success",
        title: "Rascunho gerado",
        description: "A peça foi registrada no workspace com histórico e trilha de revisão.",
      });
    });
  };

  const handleDocumentAnalysis = () => {
    startTransition(async () => {
      const selectedDocument = documentos.find((item) => item.id === analysisForm.documentId);
      const response = await executeJuridicalAiDocumentAnalysis({
        action: actionFromQuery ?? "analisar-documento",
        processId: selectedProcessId,
        documentId: analysisForm.documentId || null,
        documentName: analysisForm.documentName || selectedDocument?.nome || null,
        documentText: analysisForm.documentText,
        objective: analysisForm.objective,
        notes: analysisForm.notes,
        returnTo: returnTo ?? "/magic-ai",
      });

      if (!response.success || !response.data) {
        addToast({
          color: "danger",
          title: "Falha na análise documental",
          description: response.error ?? "Nao foi possivel analisar o texto informado.",
        });
        return;
      }

      setWorkspaceResult({ kind: "analysis", data: response.data });
      refreshWorkspace();
      addToast({
        color: "success",
        title: "Análise concluída",
        description: "O documento foi processado e entrou na trilha auditável do workspace.",
      });
    });
  };

  const handleGenericTask = (taskKey: JuridicalAiTaskKey) => {
    startTransition(async () => {
      const response = await executeJuridicalAiGenericTask({
        action:
          actionFromQuery ??
          (taskKey === "JURISPRUDENCE_BRIEF"
            ? "pesquisar-jurisprudencia"
            : taskKey === "CITATION_VALIDATION"
              ? "validar-citacoes"
              : taskKey === "PROCESS_SUMMARY"
                ? "resumir-processo"
                : taskKey === "CASE_STRATEGY"
                  ? "estrategia-caso"
                  : "perguntar-ia"),
        taskKey,
        processId: selectedProcessId,
        question: genericForm.question,
        objective: genericForm.objective,
        notes: genericForm.notes,
        returnTo: returnTo ?? "/magic-ai",
      });

      if (!response.success || !response.data) {
        addToast({
          color: "danger",
          title: "Falha na execução",
          description: response.error ?? "Nao foi possivel executar a acao juridica.",
        });
        return;
      }

      setWorkspaceResult({ kind: "generic", data: response.data });
      refreshWorkspace();
      addToast({
        color: "success",
        title: "Ação concluída",
        description: `${JURIDICAL_AI_TASK_LABELS[taskKey]} registrada no workspace.`,
      });
    });
  };

  const entitlement = bootstrapQuery.data?.entitlement;
  const rollout = bootstrapQuery.data?.rollout;
  const commercialOffer = bootstrapQuery.data?.commercialOffer;
  const usage = bootstrapQuery.data?.usage;
  const taskAccessMap = useMemo(
    () =>
      new Map(
        (rollout?.taskAccess ?? []).map((item) => [item.taskKey, item]),
      ),
    [rollout?.taskAccess],
  );
  const availableGenericTasks = useMemo(
    () =>
      WORKSPACE_GENERIC_TASKS.filter(
        (taskKey) => taskAccessMap.get(taskKey)?.enabled ?? true,
      ),
    [taskAccessMap],
  );

  useEffect(() => {
    if (selectedTab === "historico") {
      return;
    }

    if (selectedTab === "pergunta") {
      if (availableGenericTasks.length === 0) {
        setSelectedTab("historico");
      }
      return;
    }

    const requiredTask = WORKSPACE_PRIMARY_TASK_BY_TAB[selectedTab];
    if (requiredTask && taskAccessMap.size > 0 && !taskAccessMap.get(requiredTask)?.enabled) {
      setSelectedTab("historico");
    }
  }, [availableGenericTasks.length, selectedTab, taskAccessMap]);

  useEffect(() => {
    if (
      selectedGenericTask &&
      availableGenericTasks.length > 0 &&
      !availableGenericTasks.includes(selectedGenericTask)
    ) {
      setSelectedGenericTask(availableGenericTasks[0]);
    }
  }, [availableGenericTasks, selectedGenericTask]);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border border-primary/15 bg-gradient-to-br from-content1 via-content1 to-primary/5">
        <CardBody className="gap-6 p-6 md:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Chip color="primary" variant="flat">
                  Magic AI Jurídica
                </Chip>
                <Chip color="secondary" variant="flat">
                  Treinada para jurídico
                </Chip>
                <Chip color="warning" variant="flat">
                  Fundação operacional
                </Chip>
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                  Assistente jurídico proativo do escritório
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-default-500 md:text-base">
                  Gere peças, analise documentos, resuma processos e oriente estratégia com contexto real do tenant, trilha auditável e controle por plano.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Chip color="success" variant="flat">
                  {entitlement
                    ? `${JURIDICAL_AI_TIER_LABELS[entitlement.tier]} • ${entitlement.planName ?? "Sem plano"}`
                    : "Carregando plano"}
                </Chip>
                {rollout ? (
                  <Chip color="warning" variant="flat">
                    {JURIDICAL_AI_ROLLOUT_STAGE_LABELS[rollout.stage]}
                  </Chip>
                ) : null}
                <Chip color="primary" variant="flat">
                  {entitlement?.allowCaseMemory ? "Memória por caso ativa" : "Memória longa indisponível"}
                </Chip>
                <Chip color="secondary" variant="flat">
                  Saída auditável por sessão
                </Chip>
                {rollout?.previewAccess ? (
                  <Chip color="success" variant="flat">
                    Piloto comercial liberado
                  </Chip>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:w-[420px]">
              <Card className="border border-default-200/60 bg-content1/80">
                <CardBody className="gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                    Contexto detectado
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {actionFromQuery
                      ? JURIDICAL_AI_TASK_LABELS[getJuridicalAiTaskForAction(actionFromQuery as never)]
                      : "Workspace geral"}
                  </p>
                  <p className="text-xs text-default-500">
                    Entrada por speed dial ou acesso direto ao workspace.
                  </p>
                </CardBody>
              </Card>
              <Card className="border border-default-200/60 bg-content1/80">
                <CardBody className="gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                    Voltar ao fluxo
                  </p>
                  {returnTo ? (
                    <Button
                      color="primary"
                      startContent={<ArrowLeft className="h-4 w-4" />}
                      variant="flat"
                      onPress={() => router.push(returnTo)}
                    >
                      Retornar ao contexto
                    </Button>
                  ) : (
                    <p className="text-xs text-default-500">
                      Sem contexto de retorno informado nesta sessão.
                    </p>
                  )}
                </CardBody>
              </Card>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-5">
            {usage && entitlement
              ? JURIDICAL_AI_USAGE_METRICS.map((metric) => (
                  <UsageMetricCard
                    key={metric.key}
                    label={metric.label}
                    used={usage[metric.key]}
                    limit={entitlement.quotas[metric.quotaKey]}
                  />
                ))
              : Array.from({ length: 5 }).map((_, index) => (
                  <Card key={index} className="border border-default-200/60 bg-content1/80">
                    <CardBody className="items-center justify-center py-6">
                      <Spinner size="sm" />
                    </CardBody>
                  </Card>
                ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.95fr)]">
            <Card className="border border-default-200/60 bg-content1/80">
              <CardHeader className="border-b border-default-200/70">
                <div className="space-y-1">
                  <p className="text-lg font-semibold text-foreground">Rollout do escritório</p>
                  <p className="text-sm text-default-500">
                    Estado real de liberação, tarefas habilitadas e adoção do Magic AI neste tenant.
                  </p>
                </div>
              </CardHeader>
              <CardBody className="gap-4">
                {rollout ? (
                  <>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                          Estágio
                        </p>
                        <p className="mt-2 text-sm font-semibold text-foreground">
                          {JURIDICAL_AI_ROLLOUT_STAGE_LABELS[rollout.stage]}
                        </p>
                        <p className="text-xs text-default-500">
                          {rollout.workspaceEnabled
                            ? "Workspace habilitado para uso."
                            : "Workspace bloqueado para este tenant."}
                        </p>
                      </div>
                      <div className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                          Onboarding
                        </p>
                        <p className="mt-2 text-sm font-semibold text-foreground">
                          {rollout.onboarding.completionPercent}% concluído
                        </p>
                        <p className="text-xs text-default-500">
                          {rollout.onboarding.completedCount} de {rollout.onboarding.totalCount} marcos já foram fechados.
                        </p>
                      </div>
                      <div className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                          Próxima revisão
                        </p>
                        <p className="mt-2 text-sm font-semibold text-foreground">
                          {rollout.nextReviewAt
                            ? formatDateTime(rollout.nextReviewAt)
                            : "Sem data definida"}
                        </p>
                        <p className="text-xs text-default-500">
                          {rollout.owner ? `Dono: ${rollout.owner}` : "Sem responsável registrado."}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {rollout.taskAccess.map((item) => (
                        <div
                          key={item.taskKey}
                          className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-foreground">
                              {JURIDICAL_AI_TASK_LABELS[item.taskKey]}
                            </p>
                            <Chip
                              color={item.enabled ? "success" : "default"}
                              size="sm"
                              variant="flat"
                            >
                              {item.enabled ? "Ativa" : "Bloqueada"}
                            </Chip>
                          </div>
                          <p className="mt-2 text-xs text-default-500">{item.reason}</p>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center py-8">
                    <Spinner size="sm" />
                  </div>
                )}
              </CardBody>
            </Card>

            <Card className="border border-default-200/60 bg-content1/80">
              <CardHeader className="border-b border-default-200/70">
                <div className="space-y-1">
                  <p className="text-lg font-semibold text-foreground">Plano e próxima alavanca</p>
                  <p className="text-sm text-default-500">
                    Leitura comercial do que já está ativo e do próximo salto de valor para este escritório.
                  </p>
                </div>
              </CardHeader>
              <CardBody className="gap-4">
                {commercialOffer ? (
                  <>
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <Chip color="primary" variant="flat">
                          {commercialOffer.mode === "PILOT_OVERRIDE"
                            ? "Piloto premium"
                            : commercialOffer.mode === "UPSELL"
                              ? "Upsell recomendado"
                              : "Plano atual"}
                        </Chip>
                        {commercialOffer.targetTier ? (
                          <Chip color="secondary" variant="flat">
                            {JURIDICAL_AI_TIER_LABELS[commercialOffer.targetTier]}
                          </Chip>
                        ) : null}
                      </div>
                      <h2 className="text-xl font-semibold text-foreground">
                        {commercialOffer.title}
                      </h2>
                      <p className="text-sm leading-7 text-default-500">
                        {commercialOffer.description}
                      </p>
                    </div>
                    <div className="space-y-2">
                      {commercialOffer.bullets.map((item) => (
                        <div
                          key={item}
                          className="rounded-3xl border border-default-200/70 bg-default-50/40 px-4 py-3 text-sm text-default-600"
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                    <Button
                      color="primary"
                      endContent={<ArrowUpRight className="h-4 w-4" />}
                      onPress={() => router.push(commercialOffer.ctaHref)}
                    >
                      {commercialOffer.ctaLabel}
                    </Button>
                  </>
                ) : (
                  <div className="flex items-center justify-center py-8">
                    <Spinner size="sm" />
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        </CardBody>
      </Card>

      <Card className="border border-default-200/70 bg-content1/85">
        <CardHeader className="border-b border-default-200/70">
          <div className="space-y-1">
            <p className="text-lg font-semibold text-foreground">Workspace operacional</p>
            <p className="text-sm text-default-500">
              Cada aba executa uma tarefa auditável e grava sessão, uso e saída associada ao escritório.
            </p>
          </div>
        </CardHeader>
        <CardBody className="gap-6">
          <Tabs
            aria-label="Workspace jurídico"
            color="primary"
            selectedKey={selectedTab}
            variant="underlined"
            onSelectionChange={handleTabChange}
          >
            {WORKSPACE_TAB_ORDER.map((tab) => (
              <Tab
                key={tab}
                isDisabled={
                  tab === "historico"
                    ? false
                    : tab === "pergunta"
                      ? availableGenericTasks.length === 0
                      : (() => {
                          const requiredTask = WORKSPACE_PRIMARY_TASK_BY_TAB[tab];
                          return requiredTask
                            ? taskAccessMap.size > 0 &&
                                !taskAccessMap.get(requiredTask)?.enabled
                            : false;
                        })()
                }
                title={
                  <div className="flex items-center gap-2">
                    {WORKSPACE_ICONS[tab]}
                    <span>{JURIDICAL_AI_TAB_LABELS[tab]}</span>
                  </div>
                }
              />
            ))}
          </Tabs>

          {rollout && !rollout.workspaceEnabled ? (
            <Card className="border border-warning/25 bg-warning/5">
              <CardBody className="gap-2">
                <p className="text-sm font-semibold text-warning">
                  Workspace temporariamente bloqueado para este escritório
                </p>
                <p className="text-sm text-default-600">
                  O tenant está no estágio {JURIDICAL_AI_ROLLOUT_STAGE_LABELS[rollout.stage].toLowerCase()}
                  {" "}e ainda precisa de liberação operacional para voltar a executar tarefas.
                </p>
                <p className="text-xs text-default-500">
                  {rollout.notes || "Peça ao administrador global para revisar o rollout ou o plano comercial da IA."}
                </p>
              </CardBody>
            </Card>
          ) : null}

          {selectedTab === "peca" ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <SearchableSelect
                    items={processOptions}
                    label="Processo base"
                    placeholder="Selecione um processo"
                    selectedKey={selectedProcessId}
                    isLoading={isLoadingProcessos}
                    onSelectionChange={setSelectedProcessId}
                  />
                  <SearchableSelect
                    items={modelOptions}
                    label="Modelo de petição"
                    placeholder="Opcional"
                    selectedKey={pieceForm.modelId || null}
                    isLoading={isLoadingModelos}
                    onSelectionChange={(value) =>
                      setPieceForm((current) => ({ ...current, modelId: value ?? "" }))
                    }
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <SearchableSelect
                    items={documentOptions}
                    label="Documento de apoio"
                    placeholder="Opcional"
                    selectedKey={pieceForm.documentId || null}
                    isLoading={isLoadingDocumentos}
                    onSelectionChange={(value) =>
                      setPieceForm((current) => ({ ...current, documentId: value ?? "" }))
                    }
                  />
                  <SearchableSelect
                    items={JURIDICAL_AI_PIECE_TYPES.map((item) => ({
                      key: item,
                      label: item,
                    }))}
                    label="Tipo de peça"
                    placeholder="Escolha o tipo"
                    selectedKey={pieceForm.pieceType || null}
                    testId="magic-ai-piece-type"
                    onSelectionChange={(value) =>
                      setPieceForm((current) => ({ ...current, pieceType: value ?? "" }))
                    }
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    label="Título de trabalho"
                    placeholder="Ex.: Contestação com preliminar"
                    value={pieceForm.title}
                    onValueChange={(value) =>
                      setPieceForm((current) => ({ ...current, title: value }))
                    }
                  />
                  <Input
                    data-testid="magic-ai-piece-objective"
                    label="Objetivo principal"
                    placeholder="Ex.: impugnar penhora e pedir efeito suspensivo"
                    value={pieceForm.objective}
                    onValueChange={(value) =>
                      setPieceForm((current) => ({ ...current, objective: value }))
                    }
                  />
                </div>
                <Textarea
                  label="Fatos relevantes"
                  minRows={4}
                  placeholder="Cole os fatos principais ou descreva a situação processual."
                  value={pieceForm.facts}
                  onValueChange={(value) =>
                    setPieceForm((current) => ({ ...current, facts: value }))
                  }
                />
                <Textarea
                  label="Tese principal"
                  minRows={3}
                  placeholder="Qual tese o escritório pretende sustentar?"
                  value={pieceForm.thesis}
                  onValueChange={(value) =>
                    setPieceForm((current) => ({ ...current, thesis: value }))
                  }
                />
                <Textarea
                  label="Estratégia e observações"
                  minRows={3}
                  placeholder="Explique linha de atuação, reforços desejados e tom do documento."
                  value={pieceForm.strategy}
                  onValueChange={(value) =>
                    setPieceForm((current) => ({ ...current, strategy: value }))
                  }
                />
                <Textarea
                  label="Notas internas"
                  minRows={3}
                  placeholder="Instruções adicionais, limites ou recados do coordenador."
                  value={pieceForm.notes}
                  onValueChange={(value) =>
                    setPieceForm((current) => ({ ...current, notes: value }))
                  }
                />
                <div className="flex flex-wrap justify-end gap-3">
                  <Button
                    color="primary"
                    data-testid="magic-ai-generate-piece"
                    isDisabled={
                      !pieceForm.pieceType ||
                      !pieceForm.objective ||
                      (taskAccessMap.get("PIECE_DRAFTING")?.enabled === false)
                    }
                    isLoading={isPending}
                    onPress={handlePieceDraft}
                  >
                    Gerar rascunho auditável
                  </Button>
                </div>
              </div>
              <div className="space-y-4">
                {selectedProcessId || bootstrapQuery.data?.entitlement.allowCaseMemory === false ? (
                  <CaseMemoryCard
                    allowCaseMemory={bootstrapQuery.data?.entitlement.allowCaseMemory ?? false}
                    isLoading={caseMemoryQuery.isLoading}
                    memory={caseMemoryQuery.data}
                  />
                ) : null}
                <ResultPanel
                  result={workspaceResult}
                  onCopyContent={handleCopyWorkspaceOutput}
                  onDownloadContent={handleDownloadWorkspaceOutput}
                  onCreateModelFromDraft={handleCreateModelFromDraft}
                  onCreateDocumentFromDraft={handleCreateDocumentFromDraft}
                  onCreatePeticaoFromDraft={handleCreatePeticaoFromDraft}
                  isCreatingModel={creatingModelDraftId !== null}
                  isCreatingDocument={creatingDocumentDraftId !== null}
                  isCreatingPeticao={creatingPeticaoDraftId !== null}
                />
              </div>
            </div>
          ) : null}

          {selectedTab === "documento" ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]">
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <SearchableSelect
                    items={processOptions}
                    label="Processo relacionado"
                    placeholder="Opcional"
                    selectedKey={selectedProcessId}
                    isLoading={isLoadingProcessos}
                    onSelectionChange={setSelectedProcessId}
                  />
                  <SearchableSelect
                    items={documentOptions}
                    label="Documento cadastrado"
                    placeholder="Opcional"
                    selectedKey={analysisForm.documentId || null}
                    isLoading={isLoadingDocumentos}
                    onSelectionChange={(value) =>
                      setAnalysisForm((current) => ({ ...current, documentId: value ?? "" }))
                    }
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    label="Nome do documento"
                    placeholder="Ex.: Contrato social aditivo"
                    value={analysisForm.documentName}
                    onValueChange={(value) =>
                      setAnalysisForm((current) => ({ ...current, documentName: value }))
                    }
                  />
                  <Input
                    label="Objetivo da leitura"
                    placeholder="Ex.: localizar risco contratual e multa"
                    value={analysisForm.objective}
                    onValueChange={(value) =>
                      setAnalysisForm((current) => ({ ...current, objective: value }))
                    }
                  />
                </div>
                <Textarea
                  label="Texto do documento"
                  minRows={12}
                  placeholder="Cole aqui o conteúdo a ser analisado. Nesta fase a IA trabalha com texto informado ou contexto já conhecido."
                  value={analysisForm.documentText}
                  onValueChange={(value) =>
                    setAnalysisForm((current) => ({ ...current, documentText: value }))
                  }
                />
                <Textarea
                  label="Notas do escritório"
                  minRows={3}
                  placeholder="Ex.: foco em prazo, multa, foro, rescisão, poderes, anexos."
                  value={analysisForm.notes}
                  onValueChange={(value) =>
                    setAnalysisForm((current) => ({ ...current, notes: value }))
                  }
                />
                <div className="flex justify-end">
                  <Button
                    color="primary"
                    isDisabled={
                      !analysisForm.documentText.trim() ||
                      (taskAccessMap.get("DOCUMENT_ANALYSIS")?.enabled === false)
                    }
                    isLoading={isPending}
                    onPress={handleDocumentAnalysis}
                  >
                    Rodar análise documental
                  </Button>
                </div>
              </div>
              <div className="space-y-4">
                {selectedProcessId || bootstrapQuery.data?.entitlement.allowCaseMemory === false ? (
                  <CaseMemoryCard
                    allowCaseMemory={bootstrapQuery.data?.entitlement.allowCaseMemory ?? false}
                    isLoading={caseMemoryQuery.isLoading}
                    memory={caseMemoryQuery.data}
                  />
                ) : null}
                <ResultPanel
                  result={workspaceResult}
                  onCopyContent={handleCopyWorkspaceOutput}
                  onDownloadContent={handleDownloadWorkspaceOutput}
                  onCreateModelFromDraft={handleCreateModelFromDraft}
                  onCreateDocumentFromDraft={handleCreateDocumentFromDraft}
                  onCreatePeticaoFromDraft={handleCreatePeticaoFromDraft}
                  isCreatingModel={creatingModelDraftId !== null}
                  isCreatingDocument={creatingDocumentDraftId !== null}
                  isCreatingPeticao={creatingPeticaoDraftId !== null}
                />
              </div>
            </div>
          ) : null}

          {selectedTab === "citacoes" ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]">
              <div className="space-y-4">
                <SearchableSelect
                  items={processOptions}
                  label="Processo relacionado"
                  placeholder="Opcional"
                  selectedKey={selectedProcessId}
                  isLoading={isLoadingProcessos}
                  onSelectionChange={setSelectedProcessId}
                />
                <Textarea
                  label="Texto com citações"
                  minRows={10}
                  placeholder="Cole o trecho com leis, julgados, artigos ou fundamentos que precisam de validação."
                  value={genericForm.question}
                  onValueChange={(value) =>
                    setGenericForm((current) => ({ ...current, question: value }))
                  }
                />
                <Textarea
                  label="Orientação de revisão"
                  minRows={3}
                  placeholder="Ex.: priorizar fragilidade de precedentes e falta de fonte."
                  value={genericForm.notes}
                  onValueChange={(value) =>
                    setGenericForm((current) => ({ ...current, notes: value }))
                  }
                />
                <div className="flex justify-end">
                  <Button
                    color="primary"
                    isDisabled={
                      !genericForm.question.trim() ||
                      (taskAccessMap.get("CITATION_VALIDATION")?.enabled === false)
                    }
                    isLoading={isPending}
                    onPress={() => handleGenericTask("CITATION_VALIDATION")}
                  >
                    Validar citações
                  </Button>
                </div>
              </div>
              <div className="space-y-4">
                {selectedProcessId || bootstrapQuery.data?.entitlement.allowCaseMemory === false ? (
                  <CaseMemoryCard
                    allowCaseMemory={bootstrapQuery.data?.entitlement.allowCaseMemory ?? false}
                    isLoading={caseMemoryQuery.isLoading}
                    memory={caseMemoryQuery.data}
                  />
                ) : null}
                <ResultPanel
                  result={workspaceResult}
                  onCopyContent={handleCopyWorkspaceOutput}
                  onDownloadContent={handleDownloadWorkspaceOutput}
                  onCreateModelFromDraft={handleCreateModelFromDraft}
                  onCreateDocumentFromDraft={handleCreateDocumentFromDraft}
                  onCreatePeticaoFromDraft={handleCreatePeticaoFromDraft}
                  isCreatingModel={creatingModelDraftId !== null}
                  isCreatingDocument={creatingDocumentDraftId !== null}
                  isCreatingPeticao={creatingPeticaoDraftId !== null}
                />
              </div>
            </div>
          ) : null}

          {selectedTab === "pergunta" ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]">
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {JURIDICAL_AI_GENERIC_TASK_OPTIONS.filter((item) =>
                    availableGenericTasks.includes(item.key),
                  ).map((item) => (
                    <Button
                      key={item.key}
                      color={selectedGenericTask === item.key ? "primary" : "default"}
                      variant={selectedGenericTask === item.key ? "solid" : "flat"}
                      onPress={() => setSelectedGenericTask(item.key)}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
                <SearchableSelect
                  items={processOptions}
                  label="Processo relacionado"
                  placeholder="Opcional"
                  selectedKey={selectedProcessId}
                  isLoading={isLoadingProcessos}
                  onSelectionChange={setSelectedProcessId}
                />
                <Input
                  label={selectedGenericTask === "QUESTION_ANSWERING" ? "Pergunta" : "Objetivo da ação"}
                  placeholder={
                    selectedGenericTask === "QUESTION_ANSWERING"
                      ? "Ex.: quais riscos processuais devo revisar hoje?"
                      : "Ex.: consolidar a próxima providência do caso"
                  }
                  value={selectedGenericTask === "QUESTION_ANSWERING" ? genericForm.question : genericForm.objective}
                  onValueChange={(value) =>
                    setGenericForm((current) => ({
                      ...current,
                      [selectedGenericTask === "QUESTION_ANSWERING" ? "question" : "objective"]: value,
                    }))
                  }
                />
                <Textarea
                  label="Notas complementares"
                  minRows={4}
                  placeholder="Contexto adicional, restrições ou enfoque desejado."
                  value={genericForm.notes}
                  onValueChange={(value) =>
                    setGenericForm((current) => ({ ...current, notes: value }))
                  }
                />
                <div className="flex justify-end">
                  <Button
                    color="primary"
                    isDisabled={
                      (selectedGenericTask === "QUESTION_ANSWERING"
                        ? !genericForm.question.trim()
                        : !genericForm.objective.trim()) ||
                      (taskAccessMap.get(selectedGenericTask)?.enabled === false)
                    }
                    isLoading={isPending}
                    onPress={() => handleGenericTask(selectedGenericTask)}
                  >
                    Executar {JURIDICAL_AI_TASK_LABELS[selectedGenericTask]}
                  </Button>
                </div>
              </div>
              <div className="space-y-4">
                {selectedProcessId || bootstrapQuery.data?.entitlement.allowCaseMemory === false ? (
                  <CaseMemoryCard
                    allowCaseMemory={bootstrapQuery.data?.entitlement.allowCaseMemory ?? false}
                    isLoading={caseMemoryQuery.isLoading}
                    memory={caseMemoryQuery.data}
                  />
                ) : null}
                <ResultPanel
                  result={workspaceResult}
                  onCopyContent={handleCopyWorkspaceOutput}
                  onDownloadContent={handleDownloadWorkspaceOutput}
                  onCreateModelFromDraft={handleCreateModelFromDraft}
                  onCreateDocumentFromDraft={handleCreateDocumentFromDraft}
                  onCreatePeticaoFromDraft={handleCreatePeticaoFromDraft}
                  isCreatingModel={creatingModelDraftId !== null}
                  isCreatingDocument={creatingDocumentDraftId !== null}
                  isCreatingPeticao={creatingPeticaoDraftId !== null}
                />
              </div>
            </div>
          ) : null}

          {selectedTab === "pesquisa" ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]">
              <div className="space-y-4">
                <SearchableSelect
                  items={processOptions}
                  label="Processo relacionado"
                  placeholder="Opcional"
                  selectedKey={selectedProcessId}
                  isLoading={isLoadingProcessos}
                  onSelectionChange={setSelectedProcessId}
                />
                <Input
                  label="Tese ou objetivo de pesquisa"
                  placeholder="Ex.: responsabilidade civil por negativa de cobertura"
                  value={genericForm.objective}
                  onValueChange={(value) =>
                    setGenericForm((current) => ({ ...current, objective: value }))
                  }
                />
                <Textarea
                  label="Recortes desejados"
                  minRows={4}
                  placeholder="Informe tribunal, período, órgão julgador, termos alternativos e o que deve ser evitado."
                  value={genericForm.notes}
                  onValueChange={(value) =>
                    setGenericForm((current) => ({ ...current, notes: value }))
                  }
                />
                <div className="flex justify-end">
                  <Button
                    color="primary"
                    isDisabled={
                      !genericForm.objective.trim() ||
                      (taskAccessMap.get("JURISPRUDENCE_BRIEF")?.enabled === false)
                    }
                    isLoading={isPending}
                    onPress={() => handleGenericTask("JURISPRUDENCE_BRIEF")}
                  >
                    Montar briefing de pesquisa
                  </Button>
                </div>
              </div>
              <div className="space-y-4">
                {selectedProcessId || bootstrapQuery.data?.entitlement.allowCaseMemory === false ? (
                  <CaseMemoryCard
                    allowCaseMemory={bootstrapQuery.data?.entitlement.allowCaseMemory ?? false}
                    isLoading={caseMemoryQuery.isLoading}
                    memory={caseMemoryQuery.data}
                  />
                ) : null}
                <ResultPanel
                  result={workspaceResult}
                  onCopyContent={handleCopyWorkspaceOutput}
                  onDownloadContent={handleDownloadWorkspaceOutput}
                  onCreateModelFromDraft={handleCreateModelFromDraft}
                  onCreateDocumentFromDraft={handleCreateDocumentFromDraft}
                  onCreatePeticaoFromDraft={handleCreatePeticaoFromDraft}
                  isCreatingModel={creatingModelDraftId !== null}
                  isCreatingDocument={creatingDocumentDraftId !== null}
                  isCreatingPeticao={creatingPeticaoDraftId !== null}
                />
              </div>
            </div>
          ) : null}

          {selectedTab === "historico" ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
              <div className="space-y-4">
                <Card className="border border-default-200/70 bg-content1/80">
                  <CardBody className="gap-4">
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                      <Input
                        label="Buscar no histórico"
                        placeholder="Procure por título, ação, processo, contexto ou resumo"
                        value={historyQuery}
                        onValueChange={setHistoryQuery}
                      />
                      <div className="flex flex-wrap gap-2 pt-6">
                        <Button
                          color={activeHistoryBucket === "sessoes" ? "primary" : "default"}
                          variant={activeHistoryBucket === "sessoes" ? "solid" : "flat"}
                          onPress={() => setActiveHistoryBucket("sessoes")}
                        >
                          Sessões ({filteredSessions.length})
                        </Button>
                        <Button
                          color={activeHistoryBucket === "rascunhos" ? "primary" : "default"}
                          variant={activeHistoryBucket === "rascunhos" ? "solid" : "flat"}
                          onPress={() => setActiveHistoryBucket("rascunhos")}
                        >
                          Rascunhos ({filteredDrafts.length})
                        </Button>
                        <Button
                          color={activeHistoryBucket === "memorias" ? "primary" : "default"}
                          variant={activeHistoryBucket === "memorias" ? "solid" : "flat"}
                          onPress={() => setActiveHistoryBucket("memorias")}
                        >
                          Memórias ({filteredMemories.length})
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-default-500">
                      O histórico agora é navegável: pesquise, filtre e reabra rascunhos para continuar o trabalho no mesmo workspace.
                    </p>
                  </CardBody>
                </Card>

                <Card className="border border-default-200/70 bg-content1/80">
                  <CardHeader className="border-b border-default-200/70">
                    <div className="space-y-1">
                      <p className="text-lg font-semibold text-foreground">
                        {activeHistoryBucket === "sessoes"
                          ? "Sessões recentes"
                          : activeHistoryBucket === "rascunhos"
                            ? "Rascunhos recentes"
                            : "Memórias recentes"}
                      </p>
                      <p className="text-sm text-default-500">
                        {activeHistoryBucket === "sessoes"
                          ? "Toda execução fica registrada por sessão, com contexto, status e data de atualização."
                          : activeHistoryBucket === "rascunhos"
                            ? "Últimas peças geradas por este usuário no tenant, com reabertura imediata."
                            : "Resumos persistidos de processos que já receberam estratégia, análise ou peça auditável."}
                      </p>
                    </div>
                  </CardHeader>
                  <CardBody className="gap-3">
                    {bootstrapQuery.isLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Spinner size="sm" />
                      </div>
                    ) : (
                      <>
                        {activeHistoryBucket === "sessoes" && filteredSessions.length > 0
                          ? filteredSessions.map((session) => (
                              <div
                                key={session.id}
                                className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="space-y-1">
                                    <p className="text-sm font-semibold text-foreground">
                                      {session.title || JURIDICAL_AI_TASK_LABELS.PROCESS_SUMMARY}
                                    </p>
                                    <p className="text-xs text-default-500">
                                      {session.action} • {session.contextLabel || "Workspace IA"}
                                    </p>
                                  </div>
                                  <Chip
                                    color={session.status === "COMPLETED" ? "success" : "warning"}
                                    size="sm"
                                    variant="flat"
                                  >
                                    {session.status}
                                  </Chip>
                                </div>
                                <Divider className="my-3" />
                                <p className="text-xs text-default-500">
                                  Criada em {formatDateTime(session.createdAt)} • Atualizada em {formatDateTime(session.updatedAt)}
                                </p>
                              </div>
                            ))
                          : null}

                        {activeHistoryBucket === "rascunhos" && filteredDrafts.length > 0
                          ? filteredDrafts.map((draft) => (
                              <div
                                key={draft.id}
                                className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="space-y-1">
                                    <p className="text-sm font-semibold text-foreground">{draft.title}</p>
                                    <p className="text-xs text-default-500">
                                      {draft.draftType}
                                      {draft.contextLabel ? ` • ${draft.contextLabel}` : ""}
                                    </p>
                                  </div>
                                  <Chip size="sm" variant="flat">
                                    {draft.status}
                                  </Chip>
                                </div>
                                {draft.summary ? (
                                  <p className="mt-3 text-sm leading-7 text-default-700">
                                    {draft.summary}
                                  </p>
                                ) : null}
                                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                                  <p className="text-xs text-default-500">
                                    Criado em {formatDateTime(draft.createdAt)} • Atualizado em {formatDateTime(draft.updatedAt)}
                                  </p>
                                  <Button
                                    color="primary"
                                    isLoading={loadingDraftId === draft.id}
                                    size="sm"
                                    variant="flat"
                                    onPress={() => handleOpenDraft(draft.id)}
                                  >
                                    Abrir rascunho
                                  </Button>
                                </div>
                              </div>
                            ))
                          : null}

                        {activeHistoryBucket === "memorias" && filteredMemories.length > 0
                          ? filteredMemories.map((memory) => (
                              <div
                                key={memory.id}
                                className="rounded-3xl border border-default-200/70 bg-default-50/40 p-4"
                              >
                                <div className="space-y-1">
                                  <p className="text-sm font-semibold text-foreground">{memory.title}</p>
                                  <p className="text-xs text-default-500">
                                    {memory.scopeType} • Atualizada em {formatDateTime(memory.updatedAt)}
                                  </p>
                                </div>
                                {memory.summary ? (
                                  <p className="mt-3 text-sm leading-7 text-default-700">
                                    {memory.summary}
                                  </p>
                                ) : (
                                  <p className="mt-3 text-sm text-default-500">
                                    Memória criada sem resumo consolidado ainda.
                                  </p>
                                )}
                              </div>
                            ))
                          : null}

                        {activeHistoryBucket === "sessoes" && filteredSessions.length === 0 ? (
                          <p className="text-sm text-default-500">
                            Nenhuma sessão encontrada para este filtro.
                          </p>
                        ) : null}
                        {activeHistoryBucket === "rascunhos" && filteredDrafts.length === 0 ? (
                          <p className="text-sm text-default-500">
                            Nenhum rascunho encontrado para este filtro.
                          </p>
                        ) : null}
                        {activeHistoryBucket === "memorias" && filteredMemories.length === 0 ? (
                          <p className="text-sm text-default-500">
                            Nenhuma memória encontrada para este filtro.
                          </p>
                        ) : null}
                      </>
                    )}
                  </CardBody>
                </Card>
              </div>

              <div className="space-y-4">
                <ResultPanel
                  result={workspaceResult}
                  onCopyContent={handleCopyWorkspaceOutput}
                  onDownloadContent={handleDownloadWorkspaceOutput}
                  onCreateModelFromDraft={handleCreateModelFromDraft}
                  onCreateDocumentFromDraft={handleCreateDocumentFromDraft}
                  onCreatePeticaoFromDraft={handleCreatePeticaoFromDraft}
                  isCreatingModel={creatingModelDraftId !== null}
                  isCreatingDocument={creatingDocumentDraftId !== null}
                  isCreatingPeticao={creatingPeticaoDraftId !== null}
                />

                <Card className="border border-default-200/70 bg-content1/80">
                  <CardHeader className="border-b border-default-200/70">
                    <div className="space-y-1">
                      <p className="text-lg font-semibold text-foreground">Como usar o histórico</p>
                      <p className="text-sm text-default-500">
                        Reabra rascunhos para continuar a revisão, use memórias para contextualizar peças e monitore sessões para auditoria operacional.
                      </p>
                    </div>
                  </CardHeader>
                  <CardBody className="gap-3 text-sm text-default-600">
                    <p>• Sessões mostram a trilha operacional do que foi pedido e quando foi executado.</p>
                    <p>• Rascunhos permitem retomar peça pronta e exportar em markdown para revisão humana.</p>
                    <p>• Memórias consolidam o histórico estratégico por processo e sustentam continuidade.</p>
                  </CardBody>
                </Card>
              </div>
            </div>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
