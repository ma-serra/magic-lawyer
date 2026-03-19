"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Filter,
  Search,
  User,
} from "lucide-react";
import {
  Button,
  Chip,
  Input,
  Pagination,
  Select,
  SelectItem,
  Spinner,
} from "@heroui/react";

import { getPrazosWorkspace } from "@/app/actions/prazos";
import { updateProcessoPrazo } from "@/app/actions/processos";
import {
  PeopleEmptyState,
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/searchable-select";
import { usePermissionCheck } from "@/app/hooks/use-permission-check";
import { DateUtils } from "@/app/lib/date-utils";
import {
  formatPrazoRelativeLabel,
  getPrazoOperationalBucket,
  type PrazoOperationalBucket,
} from "@/app/lib/prazos/workspace";
import { ProcessoPrazoStatus } from "@/generated/prisma";
import { toast } from "@/lib/toast";

const STATUS_OPTIONS: SearchableSelectOption[] = [
  { key: "all", label: "Todos os status" },
  { key: ProcessoPrazoStatus.ABERTO, label: "Abertos" },
  { key: ProcessoPrazoStatus.PRORROGADO, label: "Prorrogados" },
  { key: ProcessoPrazoStatus.CONCLUIDO, label: "Concluídos" },
  { key: ProcessoPrazoStatus.CANCELADO, label: "Cancelados" },
];

const HORIZON_OPTIONS: SearchableSelectOption[] = [
  { key: "all", label: "Toda a carteira" },
  { key: "overdue", label: "Vencidos" },
  { key: "today", label: "Vence hoje" },
  { key: "next_7d", label: "Próximos 7 dias" },
  { key: "next_30d", label: "8 a 30 dias" },
  { key: "future", label: "Depois de 30 dias" },
  { key: "completed", label: "Concluídos" },
];

const PAGE_SIZE_OPTIONS = [12, 24, 48];

function getStatusTone(status: ProcessoPrazoStatus) {
  switch (status) {
    case ProcessoPrazoStatus.ABERTO:
      return "warning" as const;
    case ProcessoPrazoStatus.PRORROGADO:
      return "secondary" as const;
    case ProcessoPrazoStatus.CONCLUIDO:
      return "success" as const;
    case ProcessoPrazoStatus.CANCELADO:
      return "default" as const;
    default:
      return "default" as const;
  }
}

function getStatusLabel(status: ProcessoPrazoStatus) {
  switch (status) {
    case ProcessoPrazoStatus.ABERTO:
      return "Aberto";
    case ProcessoPrazoStatus.PRORROGADO:
      return "Prorrogado";
    case ProcessoPrazoStatus.CONCLUIDO:
      return "Concluído";
    case ProcessoPrazoStatus.CANCELADO:
      return "Cancelado";
    default:
      return status;
  }
}

function getBucketTone(bucket: PrazoOperationalBucket) {
  switch (bucket) {
    case "overdue":
      return "danger" as const;
    case "today":
      return "warning" as const;
    case "next_7d":
      return "secondary" as const;
    case "next_30d":
      return "primary" as const;
    case "completed":
      return "success" as const;
    case "canceled":
      return "default" as const;
    default:
      return "default" as const;
  }
}

function getBucketLabel(bucket: PrazoOperationalBucket) {
  switch (bucket) {
    case "overdue":
      return "Em atraso";
    case "today":
      return "Hoje";
    case "next_7d":
      return "Próximos 7 dias";
    case "next_30d":
      return "Até 30 dias";
    case "completed":
      return "Concluído";
    case "canceled":
      return "Cancelado";
    default:
      return "No radar";
  }
}

export function PrazosContent() {
  const router = useRouter();
  const { hasPermission: canEditPrazos } = usePermissionCheck(
    "processos",
    "editar",
    {
      enableEarlyAccess: true,
    },
  );

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [horizon, setHorizon] = useState<string>("all");
  const [processoId, setProcessoId] = useState<string | null>(null);
  const [responsavelId, setResponsavelId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(12);
  const [actionPrazoId, setActionPrazoId] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [search, status, horizon, processoId, responsavelId, perPage]);

  const swrKey = useMemo(
    () => [
      "prazos-workspace",
      search,
      status,
      horizon,
      processoId,
      responsavelId,
      page,
      perPage,
    ],
    [search, status, horizon, processoId, responsavelId, page, perPage],
  );

  const { data, error, isLoading, mutate } = useSWR(swrKey, async () => {
    const result = await getPrazosWorkspace({
      search,
      status:
        status === "all" ? "all" : (status as ProcessoPrazoStatus),
      horizon: horizon as
        | "all"
        | "overdue"
        | "today"
        | "next_7d"
        | "next_30d"
        | "future"
        | "completed",
      processoId,
      responsavelId,
      page,
      perPage,
    });

    if (!result.success || !result.data) {
      throw new Error(result.error || "Erro ao carregar central de prazos");
    }

    return result.data;
  });

  const processOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { key: "all", label: "Todos os processos" },
      ...(data?.filters.processos ?? []).map((processo) => ({
        key: processo.id,
        label: processo.numero,
        textValue: `${processo.numero} ${processo.clienteNome}`,
        description: processo.clienteNome,
      })),
    ],
    [data?.filters.processos],
  );

  const responsavelOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { key: "all", label: "Todos os responsáveis" },
      ...(data?.filters.responsaveis ?? []).map((responsavel) => ({
        key: responsavel.id,
        label: responsavel.nome,
        textValue: `${responsavel.nome} ${responsavel.email}`,
        description: responsavel.email,
      })),
    ],
    [data?.filters.responsaveis],
  );

  const handleOpenProcessoPrazo = (nextProcessoId: string, prazoId: string) => {
    router.push(`/processos/${nextProcessoId}?tab=prazos&prazoId=${encodeURIComponent(prazoId)}`);
  };

  const handleTogglePrazoStatus = async (
    prazoId: string,
    statusAtual: ProcessoPrazoStatus,
  ) => {
    setActionPrazoId(prazoId);
    try {
      const result = await updateProcessoPrazo(prazoId, {
        status:
          statusAtual === ProcessoPrazoStatus.CONCLUIDO
            ? ProcessoPrazoStatus.ABERTO
            : ProcessoPrazoStatus.CONCLUIDO,
        dataCumprimento:
          statusAtual === ProcessoPrazoStatus.CONCLUIDO ? null : new Date(),
      });

      if (!result.success) {
        throw new Error(result.error || "Não foi possível atualizar o prazo");
      }

      toast.success(
        statusAtual === ProcessoPrazoStatus.CONCLUIDO
          ? "Prazo reaberto com sucesso."
          : "Prazo concluído com sucesso.",
      );
      await mutate();
    } catch (actionError) {
      toast.error(
        actionError instanceof Error
          ? actionError.message
          : "Falha ao atualizar o prazo.",
      );
    } finally {
      setActionPrazoId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PeoplePageHeader
        title="Central de prazos"
        description="Uma carteira própria para o escritório operar vencimentos, donos, regimes e urgências sem depender de entrar processo por processo."
        tag="Operacional jurídico"
        actions={
          <>
            <Button
              color="primary"
              startContent={<CalendarClock className="h-4 w-4" />}
              variant="flat"
              onPress={() => router.push("/agenda")}
            >
              Abrir agenda
            </Button>
            <Button
              startContent={<Clock3 className="h-4 w-4" />}
              variant="bordered"
              onPress={() => router.push("/regimes-prazo")}
            >
              Regimes de prazo
            </Button>
          </>
        }
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        <PeopleMetricCard
          helper="Carteira aberta e prorrogada."
          icon={<Clock3 className="h-4 w-4" />}
          label="Abertos"
          tone="warning"
          value={data?.summary.abertos ?? 0}
        />
        <PeopleMetricCard
          helper="Prazos que já romperam o vencimento."
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Vencidos"
          tone="danger"
          value={data?.summary.vencidos ?? 0}
        />
        <PeopleMetricCard
          helper="Exigem ação ainda hoje."
          icon={<CalendarClock className="h-4 w-4" />}
          label="Vence hoje"
          tone="danger"
          value={data?.summary.venceHoje ?? 0}
        />
        <PeopleMetricCard
          helper="Radar imediato da próxima semana."
          icon={<Filter className="h-4 w-4" />}
          label="Próx. 7 dias"
          tone="secondary"
          value={data?.summary.proximos7Dias ?? 0}
        />
        <PeopleMetricCard
          helper="Faixa que precisa de planejamento."
          icon={<CalendarClock className="h-4 w-4" />}
          label="8 a 30 dias"
          tone="primary"
          value={data?.summary.proximos30Dias ?? 0}
        />
        <PeopleMetricCard
          helper="Concluídos na carteira acessível."
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Concluídos"
          tone="success"
          value={data?.summary.concluidos ?? 0}
        />
        <PeopleMetricCard
          helper="Pontos cegos que precisam de dono."
          icon={<User className="h-4 w-4" />}
          label="Sem responsável"
          tone="secondary"
          value={data?.summary.semResponsavel ?? 0}
        />
        <PeopleMetricCard
          helper="Volume considerando o recorte atual."
          icon={<Search className="h-4 w-4" />}
          label="Na lista"
          tone="default"
          value={data?.summary.total ?? 0}
        />
      </div>

      <PeoplePanel
        title="Tres frentes de prazo"
        description="A cadencia agora escala em tres camadas: monitoramento, atencao e critica. Quanto mais perto do limite, mais forte fica o disparo."
      >
        <div className="grid gap-3 xl:grid-cols-3">
          <div className="rounded-3xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center gap-2">
              <Chip color="primary" size="sm" variant="flat">
                Frente 1
              </Chip>
              <p className="text-sm font-semibold text-foreground">
                Monitoramento
              </p>
            </div>
            <p className="mt-3 text-sm text-default-400">
              Lista gerencial em 30 dias para organizar a carteira com antecedencia.
            </p>
          </div>
          <div className="rounded-3xl border border-secondary/20 bg-secondary/5 p-4">
            <div className="flex items-center gap-2">
              <Chip color="secondary" size="sm" variant="flat">
                Frente 2
              </Chip>
              <p className="text-sm font-semibold text-foreground">
                Atencao
              </p>
            </div>
            <p className="mt-3 text-sm text-default-400">
              Lista em 10 dias e reforcos individuais em 7 e 3 dias para tirar o prazo do piloto automatico.
            </p>
          </div>
          <div className="rounded-3xl border border-danger/20 bg-danger/5 p-4">
            <div className="flex items-center gap-2">
              <Chip color="danger" size="sm" variant="flat">
                Frente 3
              </Chip>
              <p className="text-sm font-semibold text-foreground">
                Critica
              </p>
            </div>
            <p className="mt-3 text-sm text-default-400">
              Disparo pesado em 1 dia, 2 horas e vencido, com popup obrigatorio, in-app, email e Telegram.
            </p>
          </div>
        </div>
      </PeoplePanel>

      <PeoplePanel
        title="Radar imediato"
        description="Os prazos que mais ameaçam a operação ficam em evidência aqui, para o advogado agir antes de abrir a lista completa."
      >
        {isLoading && !data ? (
          <div className="flex min-h-40 items-center justify-center">
            <Spinner label="Carregando radar de prazos..." />
          </div>
        ) : error ? (
          <PeopleEmptyState
            title="Não foi possível carregar o radar"
            description={error instanceof Error ? error.message : "Erro inesperado ao carregar prazos."}
            icon={<AlertTriangle className="h-5 w-5" />}
          />
        ) : !data?.highlights.length ? (
          <PeopleEmptyState
            title="Nenhum prazo urgente no radar"
            description="Quando houver vencidos, vencendo hoje ou nos próximos dias, eles aparecem aqui com prioridade."
            icon={<CheckCircle2 className="h-5 w-5" />}
          />
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {data.highlights.map((prazo) => {
              const bucket = getPrazoOperationalBucket({
                status: prazo.status,
                dataVencimento: prazo.dataVencimento,
                responsavelId: prazo.responsavelId,
              });

              return (
                <div
                  key={prazo.id}
                  className="rounded-3xl border border-white/10 bg-background/40 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip color={getBucketTone(bucket)} size="sm" variant="flat">
                          {getBucketLabel(bucket)}
                        </Chip>
                        <Chip
                          color={getStatusTone(prazo.status)}
                          size="sm"
                          variant="flat"
                        >
                          {getStatusLabel(prazo.status)}
                        </Chip>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {prazo.titulo}
                        </p>
                        <p className="text-xs text-default-400">
                          {prazo.processo.clienteNome} • {prazo.processo.numero}
                        </p>
                      </div>
                      <div className="text-xs text-default-400">
                        <p>
                          Vencimento:{" "}
                          <span className="font-medium text-default-200">
                            {DateUtils.formatDate(prazo.dataVencimento)}
                          </span>
                        </p>
                        <p>{formatPrazoRelativeLabel(prazo.dataVencimento, prazo.status)}</p>
                        {prazo.responsavel ? (
                          <p>Responsável: {prazo.responsavel.nome}</p>
                        ) : (
                          <p className="text-warning">Sem responsável definido</p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        color="primary"
                        size="sm"
                        startContent={<ExternalLink className="h-3.5 w-3.5" />}
                        variant="flat"
                        onPress={() =>
                          handleOpenProcessoPrazo(prazo.processo.id, prazo.id)
                        }
                      >
                        Abrir processo
                      </Button>
                      {canEditPrazos ? (
                        <Button
                          color={
                            prazo.status === ProcessoPrazoStatus.CONCLUIDO
                              ? "warning"
                              : "success"
                          }
                          isLoading={actionPrazoId === prazo.id}
                          size="sm"
                          variant="bordered"
                          onPress={() =>
                            handleTogglePrazoStatus(prazo.id, prazo.status)
                          }
                        >
                          {prazo.status === ProcessoPrazoStatus.CONCLUIDO
                            ? "Reabrir"
                            : "Concluir"}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PeoplePanel>

      <PeoplePanel
        title="Carteira operacional"
        description="Filtre por responsável, processo, horizonte e texto livre para tratar a carteira de prazos como uma fila de trabalho."
        actions={
          data ? (
            <Chip variant="flat">
              {data.pagination.total} prazo{data.pagination.total === 1 ? "" : "s"}
            </Chip>
          ) : null
        }
      >
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-5">
          <Input
            label="Buscar"
            placeholder="Cliente, processo, prazo ou fundamento"
            startContent={<Search className="h-4 w-4 text-default-400" />}
            value={search}
            onValueChange={setSearch}
          />

          <SearchableSelect
            items={STATUS_OPTIONS}
            label="Status"
            placeholder="Todos os status"
            selectedKey={status}
            onSelectionChange={(key) => setStatus(key ?? "all")}
          />

          <SearchableSelect
            items={HORIZON_OPTIONS}
            label="Horizonte"
            placeholder="Toda a carteira"
            selectedKey={horizon}
            onSelectionChange={(key) => setHorizon(key ?? "all")}
          />

          <SearchableSelect
            items={processOptions}
            isLoading={isLoading && !data}
            label="Processo"
            placeholder="Todos os processos"
            selectedKey={processoId ?? "all"}
            onSelectionChange={(key) =>
              setProcessoId(key && key !== "all" ? key : null)
            }
          />

          <SearchableSelect
            items={responsavelOptions}
            isLoading={isLoading && !data}
            label="Responsável"
            placeholder="Todos os responsáveis"
            selectedKey={responsavelId ?? "all"}
            onSelectionChange={(key) =>
              setResponsavelId(key && key !== "all" ? key : null)
            }
          />
        </div>

        <div className="mt-5">
          {isLoading && !data ? (
            <div className="flex min-h-64 items-center justify-center">
              <Spinner label="Carregando carteira de prazos..." />
            </div>
          ) : error ? (
            <PeopleEmptyState
              title="Falha ao carregar a carteira"
              description={error instanceof Error ? error.message : "Erro inesperado ao carregar a lista de prazos."}
              icon={<AlertTriangle className="h-5 w-5" />}
            />
          ) : !data?.items.length ? (
            <PeopleEmptyState
              title="Nenhum prazo encontrado"
              description="Ajuste os filtros ou aguarde novos prazos entrarem na carteira do escritório."
              icon={<CheckCircle2 className="h-5 w-5" />}
            />
          ) : (
            <div className="space-y-3">
              {data.items.map((prazo) => {
                const bucket = getPrazoOperationalBucket({
                  status: prazo.status,
                  dataVencimento: prazo.dataVencimento,
                  responsavelId: prazo.responsavelId,
                });

                return (
                  <div
                    key={prazo.id}
                    className="rounded-3xl border border-white/10 bg-background/40 p-4 transition-colors hover:border-primary/30"
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Chip
                            color={getStatusTone(prazo.status)}
                            size="sm"
                            variant="flat"
                          >
                            {getStatusLabel(prazo.status)}
                          </Chip>
                          <Chip
                            color={getBucketTone(bucket)}
                            size="sm"
                            variant="flat"
                          >
                            {getBucketLabel(bucket)}
                          </Chip>
                          {prazo.regimePrazo ? (
                            <Chip size="sm" variant="bordered">
                              {prazo.regimePrazo.nome}
                            </Chip>
                          ) : null}
                        </div>

                        <div>
                          <p className="text-base font-semibold text-foreground">
                            {prazo.titulo}
                          </p>
                          <p className="text-sm text-default-400">
                            {prazo.processo.clienteNome} • {prazo.processo.numero}
                          </p>
                        </div>

                        <div className="grid gap-2 text-sm text-default-400 md:grid-cols-2 xl:grid-cols-4">
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.16em] text-default-500">
                              Vencimento
                            </p>
                            <p className="text-default-200">
                              {DateUtils.formatDate(prazo.dataVencimento)}
                            </p>
                            <p className="text-xs">
                              {formatPrazoRelativeLabel(
                                prazo.dataVencimento,
                                prazo.status,
                              )}
                            </p>
                          </div>

                          <div>
                            <p className="text-[11px] uppercase tracking-[0.16em] text-default-500">
                              Responsável
                            </p>
                            <p className="text-default-200">
                              {prazo.responsavel?.nome ?? "Sem responsável"}
                            </p>
                            <p className="text-xs">
                              {prazo.processo.advogadoResponsavelNome
                                ? `Adv. do processo: ${prazo.processo.advogadoResponsavelNome}`
                                : "Sem advogado responsável definido"}
                            </p>
                          </div>

                          <div>
                            <p className="text-[11px] uppercase tracking-[0.16em] text-default-500">
                              Origem
                            </p>
                            <p className="text-default-200">
                              {prazo.origemMovimentacao?.titulo ??
                                "Lançamento manual"}
                            </p>
                            {prazo.origemMovimentacao ? (
                              <p className="text-xs">
                                Movimentação em{" "}
                                {DateUtils.formatDate(
                                  prazo.origemMovimentacao.dataMovimentacao,
                                )}
                              </p>
                            ) : null}
                          </div>

                          <div>
                            <p className="text-[11px] uppercase tracking-[0.16em] text-default-500">
                              Contexto
                            </p>
                            <p className="text-default-200">
                              {prazo.fundamentoLegal || "Sem fundamento jurídico informado"}
                            </p>
                          </div>
                        </div>

                        {prazo.descricao ? (
                          <p className="text-sm text-default-400">
                            {prazo.descricao}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2 xl:w-[220px] xl:justify-end">
                        <Button
                          color="primary"
                          size="sm"
                          startContent={<ExternalLink className="h-3.5 w-3.5" />}
                          variant="flat"
                          onPress={() =>
                            handleOpenProcessoPrazo(prazo.processo.id, prazo.id)
                          }
                        >
                          Abrir no processo
                        </Button>
                        {canEditPrazos ? (
                          <Button
                            color={
                              prazo.status === ProcessoPrazoStatus.CONCLUIDO
                                ? "warning"
                                : "success"
                            }
                            isLoading={actionPrazoId === prazo.id}
                            size="sm"
                            variant="bordered"
                            onPress={() =>
                              handleTogglePrazoStatus(prazo.id, prazo.status)
                            }
                          >
                            {prazo.status === ProcessoPrazoStatus.CONCLUIDO
                              ? "Reabrir"
                              : "Concluir"}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="flex flex-col gap-3 border-t border-white/10 pt-4 md:flex-row md:items-center md:justify-between">
                <p className="text-sm text-default-400">
                  Página {data.pagination.page} de {data.pagination.totalPages} •{" "}
                  {data.pagination.total} prazo
                  {data.pagination.total === 1 ? "" : "s"} no recorte atual
                </p>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Select
                    className="w-full sm:w-40"
                    label="Itens por página"
                    selectedKeys={[String(perPage)]}
                    size="sm"
                    onSelectionChange={(keys) => {
                      const [value] = Array.from(keys) as string[];
                      setPerPage(Number(value) || 12);
                    }}
                  >
                    {PAGE_SIZE_OPTIONS.map((value) => (
                      <SelectItem key={String(value)} textValue={`${value}`}>
                        {value} por página
                      </SelectItem>
                    ))}
                  </Select>

                  <Pagination
                    page={page}
                    total={data.pagination.totalPages}
                    onChange={setPage}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </PeoplePanel>
    </div>
  );
}
