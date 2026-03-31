"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/react";
import { Building2, MapPinned, Scale, Users, ArrowUpRight } from "lucide-react";
import Link from "next/link";

import type {
  BrazilCoverageLocationItem,
  BrazilCoverageMetricKey,
  BrazilCoverageOverview,
} from "@/app/lib/geo/brazil-coverage";
import { PeopleEmptyState, PeopleMetricCard } from "@/components/people-ui";

const metricMeta: Record<
  BrazilCoverageMetricKey,
  {
    label: string;
    shortLabel: string;
    icon: typeof Scale;
    chipColor:
      | "default"
      | "primary"
      | "secondary"
      | "success"
      | "warning"
      | "danger";
    bubbleClass: string;
    selectedClass: string;
  }
> = {
  processos: {
    label: "Processos",
    shortLabel: "processos",
    icon: Scale,
    chipColor: "primary",
    bubbleClass:
      "border-primary/40 bg-primary/15 text-primary shadow-[0_0_0_1px_rgba(59,130,246,0.1)]",
    selectedClass: "ring-4 ring-primary/20",
  },
  advogados: {
    label: "Advogados",
    shortLabel: "advogados",
    icon: Users,
    chipColor: "success",
    bubbleClass:
      "border-success/40 bg-success/15 text-success shadow-[0_0_0_1px_rgba(34,197,94,0.1)]",
    selectedClass: "ring-4 ring-success/20",
  },
  escritorios: {
    label: "Escritorios",
    shortLabel: "escritorios",
    icon: Building2,
    chipColor: "warning",
    bubbleClass:
      "border-warning/40 bg-warning/15 text-warning shadow-[0_0_0_1px_rgba(245,158,11,0.1)]",
    selectedClass: "ring-4 ring-warning/20",
  },
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value || 0);
}

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getMetricLocations(
  state: BrazilCoverageOverview["states"][number] | undefined,
  metric: BrazilCoverageMetricKey,
) {
  if (!state) {
    return [] as BrazilCoverageLocationItem[];
  }

  return state.details?.[metric] ?? [];
}

interface BrazilCoverageMapProps {
  overview: BrazilCoverageOverview | null | undefined;
  audienceLabel: string;
  showOfficeMetric?: boolean;
}

export function BrazilCoverageMap({
  overview,
  audienceLabel,
  showOfficeMetric = true,
}: BrazilCoverageMapProps) {
  const totals = overview?.totals;
  const states = overview?.states ?? [];

  const availableMetrics = useMemo(() => {
    const metrics: BrazilCoverageMetricKey[] = [];

    if ((totals?.processos ?? 0) > 0) {
      metrics.push("processos");
    }

    if ((totals?.advogados ?? 0) > 0) {
      metrics.push("advogados");
    }

    if (showOfficeMetric && (totals?.escritorios ?? 0) > 0) {
      metrics.push("escritorios");
    }

    return metrics.length > 0
      ? metrics
      : ([
          "processos",
          "advogados",
          ...(showOfficeMetric ? (["escritorios"] as const) : []),
        ] as BrazilCoverageMetricKey[]);
  }, [showOfficeMetric, totals?.advogados, totals?.escritorios, totals?.processos]);

  const [activeMetric, setActiveMetric] = useState<BrazilCoverageMetricKey>(
    availableMetrics[0] ?? "processos",
  );
  const [selectedUf, setSelectedUf] = useState<string | null>(
    states[0]?.uf ?? null,
  );
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);

  useEffect(() => {
    if (!availableMetrics.includes(activeMetric)) {
      setActiveMetric(availableMetrics[0] ?? "processos");
    }
  }, [activeMetric, availableMetrics]);

  const sortedStates = useMemo(() => {
    return [...states].sort((left, right) => {
      const metricDelta = right[activeMetric] - left[activeMetric];

      if (metricDelta !== 0) {
        return metricDelta;
      }

      const secondaryDelta =
        right.processos +
        right.advogados * 3 +
        right.escritorios * 5 -
        (left.processos + left.advogados * 3 + left.escritorios * 5);

      if (secondaryDelta !== 0) {
        return secondaryDelta;
      }

      return left.uf.localeCompare(right.uf);
    });
  }, [activeMetric, states]);

  useEffect(() => {
    if (!sortedStates.length) {
      setSelectedUf(null);
      return;
    }

    const currentSelection = selectedUf
      ? sortedStates.find((state) => state.uf === selectedUf)
      : null;
    const shouldResetSelection =
      !currentSelection ||
      !sortedStates.some((state) => state.uf === selectedUf) ||
      (currentSelection[activeMetric] === 0 && sortedStates[0]?.[activeMetric] > 0);

    if (shouldResetSelection) {
      setSelectedUf(sortedStates[0]?.uf ?? null);
    }
  }, [activeMetric, selectedUf, sortedStates]);

  const selectedState =
    sortedStates.find((state) => state.uf === selectedUf) ?? sortedStates[0];
  const maxMetricValue = Math.max(
    ...sortedStates.map((state) => state[activeMetric]),
    0,
  );
  const topStates = sortedStates.filter((state) => state[activeMetric] > 0).slice(0, 6);
  const ActiveIcon = metricMeta[activeMetric].icon;
  const activeLocations = getMetricLocations(selectedState, activeMetric);

  const handleStateFocus = (uf: string, shouldOpenLocations = false) => {
    setSelectedUf(uf);

    if (shouldOpenLocations) {
      setIsLocationModalOpen(true);
    }
  };

  if (!overview || states.length === 0) {
    return (
      <PeopleEmptyState
        icon={<MapPinned className="h-6 w-6" />}
        title="Sem pegada geografica suficiente ainda"
        description={`Assim que ${audienceLabel} tiver processos, advogados ou escritorios com UF registrada, o mapa do Brasil passa a aparecer aqui.`}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <PeopleMetricCard
          label="UFs com cobertura"
          value={formatNumber(overview.totals.coveredStates)}
          helper="Estados com operacao registrada"
          tone="secondary"
          icon={<MapPinned className="h-4 w-4" />}
        />
        <PeopleMetricCard
          label="Processos mapeados"
          value={formatNumber(overview.totals.processos)}
          helper="Base territorial de processos"
          tone="primary"
          icon={<Scale className="h-4 w-4" />}
        />
        <PeopleMetricCard
          label="Advogados mapeados"
          value={formatNumber(overview.totals.advogados)}
          helper="Equipe com OAB por UF"
          tone="success"
          icon={<Users className="h-4 w-4" />}
        />
        <PeopleMetricCard
          label="Escritorios mapeados"
          value={formatNumber(overview.totals.escritorios)}
          helper="Unidades registradas com endereco"
          tone="warning"
          icon={<Building2 className="h-4 w-4" />}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {availableMetrics.map((metric) => {
          const meta = metricMeta[metric];
          const Icon = meta.icon;

          return (
            <Button
              key={metric}
              color={meta.chipColor}
              size="sm"
              variant={activeMetric === metric ? "solid" : "flat"}
              onPress={() => setActiveMetric(metric)}
            >
              <Icon className="h-4 w-4" />
              {meta.label}
            </Button>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.95fr]">
        <div className="rounded-3xl border border-default-200/70 bg-default-50/80 p-4 dark:border-white/10 dark:bg-background/20">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                Mapa do Brasil
              </p>
              <p className="text-sm text-default-600 dark:text-default-400">
                Distribuicao atual por {metricMeta[activeMetric].shortLabel}.
              </p>
            </div>
            <Chip color={metricMeta[activeMetric].chipColor} size="sm" variant="flat">
              <ActiveIcon className="h-3.5 w-3.5" />
              {formatNumber(selectedState?.[activeMetric] ?? 0)}{" "}
              {metricMeta[activeMetric].shortLabel}
            </Chip>
          </div>

          <div className="relative min-h-[360px] overflow-hidden rounded-[28px] border border-default-200/70 bg-white/70 dark:border-white/10 dark:bg-background/40">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(14,165,233,0.14),transparent_34%),radial-gradient(circle_at_80%_82%,rgba(34,197,94,0.12),transparent_34%),radial-gradient(circle_at_52%_45%,rgba(245,158,11,0.12),transparent_36%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:26px_26px]" />
            <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-default-200/80 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-default-500 dark:border-white/10 dark:bg-background/60">
              Brasil
            </div>
            <div className="pointer-events-none absolute bottom-4 left-4 max-w-[220px] text-xs text-default-500 dark:text-default-400">
              Bolhas maiores indicam concentracao mais forte na metrica ativa.
            </div>

            {sortedStates.map((state) => {
              const value = state[activeMetric];
              const bubbleSize =
                maxMetricValue > 0
                  ? Math.max(14, Math.min(42, 14 + (value / maxMetricValue) * 28))
                  : 14;
              const meta = metricMeta[activeMetric];
              const isSelected = selectedState?.uf === state.uf;

              return (
                <button
                  key={state.uf}
                  type="button"
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{
                    left: `${state.mapX}%`,
                    top: `${state.mapY}%`,
                  }}
                  title={`${state.label} • ${formatNumber(state.processos)} processos • ${formatNumber(state.advogados)} advogados • ${formatNumber(state.escritorios)} escritorios`}
                  onClick={() => handleStateFocus(state.uf, true)}
                >
                  <span
                    className={joinClasses(
                      "flex items-center justify-center rounded-full border text-[10px] font-semibold transition-transform duration-200 hover:scale-105",
                      meta.bubbleClass,
                      isSelected && meta.selectedClass,
                    )}
                    style={{
                      width: bubbleSize,
                      height: bubbleSize,
                    }}
                  >
                    {bubbleSize >= 24 ? state.uf : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-default-200/70 bg-default-50/80 p-4 dark:border-white/10 dark:bg-background/20">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                  Estado em foco
                </p>
                <h3 className="text-lg font-semibold text-foreground">
                  {selectedState?.stateName ?? "Sem destaque"}
                </h3>
              </div>
              {selectedState ? (
                <Chip size="sm" variant="flat">
                  {selectedState.uf}
                </Chip>
              ) : null}
            </div>

            {selectedState ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
                  <div className="rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-primary/80">
                      Processos
                    </p>
                    <p className="mt-1 text-xl font-semibold text-primary">
                      {formatNumber(selectedState.processos)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-success/15 bg-success/5 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-success/80">
                      Advogados
                    </p>
                    <p className="mt-1 text-xl font-semibold text-success">
                      {formatNumber(selectedState.advogados)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-warning/15 bg-warning/5 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-warning/80">
                      Escritorios
                    </p>
                    <p className="mt-1 text-xl font-semibold text-warning">
                      {formatNumber(selectedState.escritorios)}
                    </p>
                  </div>
                </div>

                <p className="text-sm text-default-600 dark:text-default-400">
                  {selectedState.label} concentra{" "}
                  <span className="font-semibold text-foreground">
                    {formatNumber(selectedState[activeMetric])}
                  </span>{" "}
                  {metricMeta[activeMetric].shortLabel} na leitura atual.
                </p>
                <Button
                  color={metricMeta[activeMetric].chipColor}
                  variant="flat"
                  onPress={() => setIsLocationModalOpen(true)}
                >
                  Abrir locais deste estado
                  {activeLocations.length > 0 ? ` (${activeLocations.length})` : ""}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-default-500">
                Nenhum estado selecionado.
              </p>
            )}
          </div>

          <div className="rounded-3xl border border-default-200/70 bg-default-50/80 p-4 dark:border-white/10 dark:bg-background/20">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <MapPinned className="h-4 w-4 text-primary" />
              Top UFs por {metricMeta[activeMetric].shortLabel}
            </div>
            <div className="space-y-2">
              {topStates.length === 0 ? (
                <p className="text-sm text-default-500">
                  Ainda sem dados para esta leitura.
                </p>
              ) : (
                topStates.map((state, index) => (
                  <button
                    key={`top-${state.uf}`}
                    type="button"
                    className={joinClasses(
                      "flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left transition-colors",
                      selectedState?.uf === state.uf
                        ? "border-primary/25 bg-primary/5"
                        : "border-default-200/70 bg-white/75 hover:border-primary/20 hover:bg-primary/5 dark:border-white/10 dark:bg-white/[0.03]",
                    )}
                    onClick={() => handleStateFocus(state.uf, true)}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {index + 1}. {state.stateName}
                      </p>
                      <p className="text-xs text-default-500">
                        {formatNumber(state.processos)} processos •{" "}
                        {formatNumber(state.advogados)} advogados •{" "}
                        {formatNumber(state.escritorios)} escritorios
                      </p>
                    </div>
                    <Chip
                      color={metricMeta[activeMetric].chipColor}
                      size="sm"
                      variant="flat"
                    >
                      {formatNumber(state[activeMetric])}
                    </Chip>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal
        isOpen={isLocationModalOpen}
        placement="center"
        scrollBehavior="inside"
        size="3xl"
        onOpenChange={setIsLocationModalOpen}
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-default-500">
              Locais mapeados
            </span>
            <span className="text-lg font-semibold text-foreground">
              {selectedState?.stateName ?? "Estado"} • {selectedState?.uf ?? "--"}
            </span>
            <span className="text-sm font-normal text-default-500">
              Itens reais usados para compor o mapa nesta UF.
            </span>
          </ModalHeader>
          <ModalBody className="space-y-5">
            {(["processos", "advogados", "escritorios"] as BrazilCoverageMetricKey[]).map(
              (metric) => {
                const items = getMetricLocations(selectedState, metric);
                const meta = metricMeta[metric];
                const Icon = meta.icon;

                return (
                  <section key={metric} className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Chip color={meta.chipColor} size="sm" variant="flat">
                          <Icon className="h-3.5 w-3.5" />
                          {meta.label}
                        </Chip>
                        <span className="text-sm text-default-500">
                          {formatNumber(selectedState?.[metric] ?? 0)} no total
                        </span>
                      </div>
                    </div>
                    {items.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-default-300 bg-default-50 px-4 py-4 text-sm text-default-500 dark:border-white/10 dark:bg-white/[0.03]">
                        Ainda nao encontramos itens detalhados para {meta.shortLabel} nesta UF.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {items.map((item) => {
                          const content = (
                            <div className="flex min-w-0 items-start justify-between gap-3 rounded-2xl border border-default-200/80 bg-default-50/80 px-4 py-3 transition-colors hover:border-primary/20 hover:bg-primary/5 dark:border-white/10 dark:bg-white/[0.03]">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-foreground">
                                  {item.title}
                                </p>
                                {item.subtitle ? (
                                  <p className="mt-1 text-sm text-default-500">
                                    {item.subtitle}
                                  </p>
                                ) : null}
                              </div>
                              {item.href ? (
                                <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-default-400" />
                              ) : null}
                            </div>
                          );

                          return item.href ? (
                            <Link key={item.id} className="block" href={item.href}>
                              {content}
                            </Link>
                          ) : (
                            <div key={item.id}>{content}</div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              },
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setIsLocationModalOpen(false)}>
              Fechar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
