"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import useSWR from "swr";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Input,
  Select,
  SelectItem,
  Spinner,
  Textarea,
} from "@heroui/react";
import { addToast } from "@heroui/toast";
import {
  Building2,
  CalendarDays,
  History,
  RefreshCw,
  Search,
  ShieldCheck,
  Workflow,
} from "lucide-react";

import {
  getHolidayExperienceAdminDashboard,
  updateHolidayExperienceGlobalRollout,
  updateHolidayExperienceTenantRollout,
  type HolidayExperienceAdminDashboard,
} from "@/app/actions/admin-feriados";
import {
  HOLIDAY_EXPERIENCE_SURFACES,
  type HolidayExperienceSurface,
} from "@/app/lib/feriados/experience-rollout";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/searchable-select";
import { PeoplePageHeader } from "@/components/people-ui";

type OverrideMode = "inherit" | "enabled" | "disabled";

const SURFACE_LABELS: Record<HolidayExperienceSurface, string> = {
  dashboard: "Dashboard",
  process: "Processo",
  andamentos: "Andamentos",
  agenda: "Agenda",
  notifications: "Notificacoes",
};

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Sem registro";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Sem registro";
  }

  return parsed.toLocaleString("pt-BR");
}

function buildAdminFetcher() {
  return getHolidayExperienceAdminDashboard().then((response) => {
    if (!response.success || !response.data) {
      throw new Error(
        response.error ?? "Nao foi possivel carregar o cockpit de feriados.",
      );
    }

    return response.data;
  });
}

function MetricCard({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "primary" | "success" | "warning" | "secondary";
  icon: ReactNode;
}) {
  const toneClasses =
    tone === "primary"
      ? "bg-primary/10 text-primary"
      : tone === "success"
        ? "bg-success/10 text-success"
        : tone === "warning"
          ? "bg-warning/10 text-warning"
          : "bg-secondary/10 text-secondary";

  return (
    <Card className="border border-default-200/70 bg-content1/80">
      <CardBody className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className={`rounded-2xl p-3 ${toneClasses}`}>{icon}</div>
          <Chip color={tone} size="sm" variant="flat">
            Feriados
          </Chip>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
            {label}
          </p>
          <p className="text-2xl font-semibold text-foreground">{value}</p>
          <p className="text-xs text-default-500">{hint}</p>
        </div>
      </CardBody>
    </Card>
  );
}

export function AdminFeriadosContent() {
  const dashboardQuery = useSWR<HolidayExperienceAdminDashboard>(
    "holiday-experience-admin-dashboard",
    buildAdminFetcher,
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    },
  );
  const [isPending, startTransition] = useTransition();
  const [tenantSearch, setTenantSearch] = useState("");
  const [tenantStatusFilter, setTenantStatusFilter] = useState("ALL");
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [globalEnabled, setGlobalEnabled] = useState(false);
  const [globalNotes, setGlobalNotes] = useState("");
  const [globalSurfaces, setGlobalSurfaces] = useState<
    Record<HolidayExperienceSurface, boolean>
  >({
    dashboard: true,
    process: true,
    andamentos: true,
    agenda: true,
    notifications: true,
  });
  const [tenantEnabledMode, setTenantEnabledMode] =
    useState<OverrideMode>("inherit");
  const [tenantNotes, setTenantNotes] = useState("");
  const [tenantSurfaceModes, setTenantSurfaceModes] = useState<
    Record<HolidayExperienceSurface, OverrideMode>
  >({
    dashboard: "inherit",
    process: "inherit",
    andamentos: "inherit",
    agenda: "inherit",
    notifications: "inherit",
  });

  useEffect(() => {
    if (!dashboardQuery.data) {
      return;
    }

    setGlobalEnabled(dashboardQuery.data.rollout.globalEnabled);
    setGlobalNotes(dashboardQuery.data.rollout.notes ?? "");
    setGlobalSurfaces({ ...dashboardQuery.data.rollout.surfaces });
  }, [dashboardQuery.data]);

  useEffect(() => {
    const firstTenant = dashboardQuery.data?.rolloutTenants[0]?.tenantId ?? null;

    if (!selectedTenantId && firstTenant) {
      setSelectedTenantId(firstTenant);
    }
  }, [dashboardQuery.data, selectedTenantId]);

  const tenantOptions = useMemo<SearchableSelectOption[]>(
    () =>
      (dashboardQuery.data?.rolloutTenants ?? []).map((tenant) => ({
        key: tenant.tenantId,
        label: tenant.tenantName,
        textValue: `${tenant.tenantName} ${tenant.tenantSlug} ${tenant.tenantStatus}`,
        description: `${tenant.tenantSlug} - ${tenant.tenantStatus}`,
      })),
    [dashboardQuery.data?.rolloutTenants],
  );

  const selectedTenant = useMemo(
    () =>
      dashboardQuery.data?.rolloutTenants.find(
        (tenant) => tenant.tenantId === selectedTenantId,
      ) ?? null,
    [dashboardQuery.data?.rolloutTenants, selectedTenantId],
  );

  useEffect(() => {
    if (!selectedTenant) {
      return;
    }

    setTenantEnabledMode(
      selectedTenant.overrideEnabled === null
        ? "inherit"
        : selectedTenant.overrideEnabled
          ? "enabled"
          : "disabled",
    );
    setTenantNotes(selectedTenant.notes ?? "");
    setTenantSurfaceModes(
      HOLIDAY_EXPERIENCE_SURFACES.reduce<
        Record<HolidayExperienceSurface, OverrideMode>
      >((acc, surface) => {
        const override = selectedTenant.surfaceOverrides[surface];
        acc[surface] =
          typeof override === "boolean"
            ? override
              ? "enabled"
              : "disabled"
            : "inherit";
        return acc;
      }, {
        dashboard: "inherit",
        process: "inherit",
        andamentos: "inherit",
        agenda: "inherit",
        notifications: "inherit",
      }),
    );
  }, [selectedTenant]);

  const filteredTenants = useMemo(() => {
    const normalizedSearch = tenantSearch.trim().toLowerCase();

    return (dashboardQuery.data?.rolloutTenants ?? []).filter((tenant) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        `${tenant.tenantName} ${tenant.tenantSlug}`.toLowerCase().includes(
          normalizedSearch,
        );
      const matchesStatus =
        tenantStatusFilter === "ALL" ||
        tenant.tenantStatus === tenantStatusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [dashboardQuery.data?.rolloutTenants, tenantSearch, tenantStatusFilter]);

  const activeTenantRollouts = useMemo(
    () =>
      dashboardQuery.data?.rolloutTenants.filter((tenant) => tenant.rolloutEnabled)
        .length ?? 0,
    [dashboardQuery.data?.rolloutTenants],
  );

  const handleToggleGlobalSurface = (surface: HolidayExperienceSurface) => {
    setGlobalSurfaces((current) => ({
      ...current,
      [surface]: !current[surface],
    }));
  };

  const handleSaveGlobal = () => {
    startTransition(async () => {
      const response = await updateHolidayExperienceGlobalRollout({
        globalEnabled,
        surfaces: globalSurfaces,
        notes: globalNotes,
      });

      if (!response.success) {
        addToast({
          title: "Falha ao salvar rollout global",
          description:
            response.error ?? "Nao foi possivel atualizar a governanca global.",
          color: "danger",
        });
        return;
      }

      addToast({
        title: "Rollout global atualizado",
        description: "As superficies passam a respeitar o baseline salvo em banco.",
        color: "success",
      });
      await dashboardQuery.mutate();
    });
  };

  const handleSaveTenant = () => {
    if (!selectedTenant) {
      return;
    }

    startTransition(async () => {
      const surfaces = HOLIDAY_EXPERIENCE_SURFACES.reduce<
        Partial<Record<HolidayExperienceSurface, boolean>>
      >((acc, surface) => {
        const mode = tenantSurfaceModes[surface];

        if (mode === "enabled") {
          acc[surface] = true;
        } else if (mode === "disabled") {
          acc[surface] = false;
        }

        return acc;
      }, {});

      const response = await updateHolidayExperienceTenantRollout({
        tenantId: selectedTenant.tenantId,
        enabled:
          tenantEnabledMode === "inherit"
            ? null
            : tenantEnabledMode === "enabled",
        surfaces,
        notes: tenantNotes,
      });

      if (!response.success) {
        addToast({
          title: "Falha ao salvar override",
          description:
            response.error ?? "Nao foi possivel atualizar o tenant selecionado.",
          color: "danger",
        });
        return;
      }

      addToast({
        title: "Override salvo",
        description: `${selectedTenant.tenantName} recebeu a governanca atualizada.`,
        color: "success",
      });
      await dashboardQuery.mutate();
    });
  };

  if (dashboardQuery.isLoading && !dashboardQuery.data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner color="primary" label="Carregando cockpit de feriados" />
      </div>
    );
  }

  if (dashboardQuery.error || !dashboardQuery.data) {
    return (
      <div className="space-y-4">
        <PeoplePageHeader
          description="Nao foi possivel carregar a governanca de feriados."
          title="Feriados"
        />
        <Card className="border border-danger/20 bg-danger/5">
          <CardBody className="gap-3">
            <p className="text-sm text-danger">
              {dashboardQuery.error instanceof Error
                ? dashboardQuery.error.message
                : "Falha ao carregar o painel administrativo."}
            </p>
            <div>
              <Button
                color="danger"
                startContent={<RefreshCw className="h-4 w-4" />}
                variant="flat"
                onPress={() => void dashboardQuery.mutate()}
              >
                Tentar novamente
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PeoplePageHeader
        actions={
          <Button
            color="primary"
            isLoading={dashboardQuery.isValidating}
            startContent={<RefreshCw className="h-4 w-4" />}
            variant="flat"
            onPress={() => void dashboardQuery.mutate()}
          >
            Atualizar
          </Button>
        }
        description="Catalogo compartilhado, overrides por tenant e trilha de auditoria da experiencia de prazos ajustados por feriados."
        title="Feriados"
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          hint="Feriados oficiais no catalogo compartilhado"
          icon={<CalendarDays className="h-5 w-5" />}
          label="Catalogo compartilhado"
          tone="primary"
          value={String(dashboardQuery.data.catalog.sharedCount)}
        />
        <MetricCard
          hint="Cadastros manuais feitos diretamente pelos escritorios"
          icon={<Building2 className="h-5 w-5" />}
          label="Feriados por tenant"
          tone="warning"
          value={String(dashboardQuery.data.catalog.tenantCount)}
        />
        <MetricCard
          hint="Tenants com pelo menos uma superficie habilitada"
          icon={<Workflow className="h-5 w-5" />}
          label="Rollouts ativos"
          tone="success"
          value={String(activeTenantRollouts)}
        />
        <MetricCard
          hint="Ultimas mudancas auditadas no rollout"
          icon={<ShieldCheck className="h-5 w-5" />}
          label="Auditoria recente"
          tone="secondary"
          value={String(dashboardQuery.data.audit.length)}
        />
      </div>

      <Card className="border border-default-200/70 bg-content1/80">
        <CardHeader className="flex flex-col items-start gap-2">
          <h2 className="text-lg font-semibold">Catalogo atual</h2>
          <p className="text-sm text-default-500">
            Distribuicao entre catalogo compartilhado e regras locais dos tenants.
          </p>
        </CardHeader>
        <CardBody className="gap-3">
          <div className="flex flex-wrap gap-2">
            {dashboardQuery.data.catalog.byType.map((item) => (
              <Chip key={item.tipo} size="sm" variant="flat">
                {item.tipo}: {item.total} total - {item.shared} shared - {item.tenant} tenant
              </Chip>
            ))}
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.05fr,1fr]">
        <Card className="border border-default-200/70 bg-content1/80">
          <CardHeader className="flex flex-col items-start gap-2">
            <h2 className="text-lg font-semibold">Baseline global</h2>
            <p className="text-sm text-default-500">
              Estado base salvo em banco. Tenants sem override seguem este desenho.
            </p>
          </CardHeader>
          <CardBody className="space-y-4">
            <Select
              label="Estado global"
              selectedKeys={[globalEnabled ? "enabled" : "disabled"]}
              onSelectionChange={(keys) => {
                const value = Array.from(keys)[0] as string | undefined;
                setGlobalEnabled(value === "enabled");
              }}
            >
              <SelectItem key="enabled" textValue="enabled">
                Habilitado
              </SelectItem>
              <SelectItem key="disabled" textValue="disabled">
                Desabilitado
              </SelectItem>
            </Select>

            <div className="grid gap-3 sm:grid-cols-2">
              {HOLIDAY_EXPERIENCE_SURFACES.map((surface) => (
                <Button
                  key={surface}
                  className="justify-between"
                  color={globalSurfaces[surface] ? "secondary" : "default"}
                  variant={globalSurfaces[surface] ? "flat" : "bordered"}
                  onPress={() => handleToggleGlobalSurface(surface)}
                >
                  <span>{SURFACE_LABELS[surface]}</span>
                  <span>{globalSurfaces[surface] ? "Ligada" : "Desligada"}</span>
                </Button>
              ))}
            </div>

            <Textarea
              label="Notas operacionais"
              minRows={4}
              placeholder="Ex: liberar primeiro para tenants com calendario regional mais completo."
              value={globalNotes}
              onValueChange={setGlobalNotes}
            />

            <div className="flex flex-wrap items-center gap-2 text-xs text-default-500">
              <Chip size="sm" variant="flat">
                Atualizado em {formatDateTime(dashboardQuery.data.rollout.updatedAt)}
              </Chip>
              {dashboardQuery.data.rollout.updatedBy ? (
                <Chip size="sm" variant="flat">
                  Por {dashboardQuery.data.rollout.updatedBy}
                </Chip>
              ) : null}
            </div>

            <div className="flex justify-end">
              <Button
                color="primary"
                isLoading={isPending}
                onPress={handleSaveGlobal}
              >
                Salvar baseline global
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card className="border border-default-200/70 bg-content1/80">
          <CardHeader className="flex flex-col items-start gap-2">
            <h2 className="text-lg font-semibold">Override por tenant</h2>
            <p className="text-sm text-default-500">
              Restrinja, libere ou deixe cada superficie herdar o baseline global.
            </p>
          </CardHeader>
          <CardBody className="space-y-4">
            <SearchableSelect
              emptyContent="Nenhum tenant encontrado"
              items={tenantOptions}
              label="Tenant"
              placeholder="Selecione um tenant"
              selectedKey={selectedTenantId ?? ""}
              onSelectionChange={(value) => setSelectedTenantId(value ?? null)}
            />

            {selectedTenant ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Chip color={selectedTenant.rolloutEnabled ? "success" : "default"} size="sm" variant="flat">
                    {selectedTenant.rolloutEnabled ? "Experiencia ativa" : "Experiencia desativada"}
                  </Chip>
                  <Chip size="sm" variant="flat">
                    {selectedTenant.manualHolidayCount} feriados manuais
                  </Chip>
                  <Chip size="sm" variant="flat">
                    {selectedTenant.tenantSlug}
                  </Chip>
                </div>

                <Select
                  label="Modo geral do tenant"
                  selectedKeys={[tenantEnabledMode]}
                  onSelectionChange={(keys) => {
                    const value = Array.from(keys)[0] as OverrideMode | undefined;
                    if (value) {
                      setTenantEnabledMode(value);
                    }
                  }}
                >
                  <SelectItem key="inherit" textValue="inherit">
                    Herdar baseline global
                  </SelectItem>
                  <SelectItem key="enabled" textValue="enabled">
                    Forcar habilitado
                  </SelectItem>
                  <SelectItem key="disabled" textValue="disabled">
                    Forcar desligado
                  </SelectItem>
                </Select>

                <div className="grid gap-3 sm:grid-cols-2">
                  {HOLIDAY_EXPERIENCE_SURFACES.map((surface) => (
                    <Select
                      key={surface}
                      label={SURFACE_LABELS[surface]}
                      selectedKeys={[tenantSurfaceModes[surface]]}
                      onSelectionChange={(keys) => {
                        const value = Array.from(keys)[0] as OverrideMode | undefined;
                        if (!value) {
                          return;
                        }

                        setTenantSurfaceModes((current) => ({
                          ...current,
                          [surface]: value,
                        }));
                      }}
                    >
                      <SelectItem key="inherit" textValue="inherit">
                        Herdar
                      </SelectItem>
                      <SelectItem key="enabled" textValue="enabled">
                        Habilitar
                      </SelectItem>
                      <SelectItem key="disabled" textValue="disabled">
                        Desabilitar
                      </SelectItem>
                    </Select>
                  ))}
                </div>

                <Textarea
                  label="Notas do tenant"
                  minRows={4}
                  placeholder="Ex: liberar notificacoes antes da agenda para este escritorio."
                  value={tenantNotes}
                  onValueChange={setTenantNotes}
                />

                <div className="flex flex-wrap items-center gap-2 text-xs text-default-500">
                  <Chip size="sm" variant="flat">
                    Atualizado em {formatDateTime(selectedTenant.updatedAt)}
                  </Chip>
                  {selectedTenant.updatedBy ? (
                    <Chip size="sm" variant="flat">
                      Por {selectedTenant.updatedBy}
                    </Chip>
                  ) : null}
                </div>

                <div className="flex justify-end">
                  <Button
                    color="primary"
                    isLoading={isPending}
                    onPress={handleSaveTenant}
                  >
                    Salvar override do tenant
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-default-500">
                Selecione um tenant para editar o rollout local.
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="border border-default-200/70 bg-content1/80">
        <CardHeader className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Tenants monitorados</h2>
            <p className="text-sm text-default-500">
              Filtre por status, localize um escritorio e abra o override no painel lateral.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row">
            <Input
              className="md:min-w-[260px]"
              placeholder="Buscar por nome ou slug"
              startContent={<Search className="h-4 w-4 text-default-400" />}
              value={tenantSearch}
              onValueChange={setTenantSearch}
            />
            <Select
              className="md:min-w-[180px]"
              selectedKeys={[tenantStatusFilter]}
              onSelectionChange={(keys) => {
                const value = Array.from(keys)[0] as string | undefined;
                setTenantStatusFilter(value ?? "ALL");
              }}
            >
              <SelectItem key="ALL" textValue="ALL">
                Todos os status
              </SelectItem>
              <SelectItem key="ACTIVE" textValue="ACTIVE">
                ACTIVE
              </SelectItem>
              <SelectItem key="INACTIVE" textValue="INACTIVE">
                INACTIVE
              </SelectItem>
              <SelectItem key="SUSPENDED" textValue="SUSPENDED">
                SUSPENDED
              </SelectItem>
            </Select>
          </div>
        </CardHeader>
        <CardBody className="gap-3">
          {filteredTenants.length === 0 ? (
            <p className="text-sm text-default-500">
              Nenhum tenant corresponde ao filtro atual.
            </p>
          ) : (
            filteredTenants.map((tenant) => (
              <button
                key={tenant.tenantId}
                className={`rounded-2xl border p-4 text-left transition ${
                  tenant.tenantId === selectedTenantId
                    ? "border-primary bg-primary/5"
                    : "border-default-200 hover:border-primary/30 hover:bg-default-50"
                }`}
                type="button"
                onClick={() => setSelectedTenantId(tenant.tenantId)}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">
                        {tenant.tenantName}
                      </span>
                      <Chip size="sm" variant="flat">
                        {tenant.tenantStatus}
                      </Chip>
                      <Chip
                        color={tenant.rolloutEnabled ? "success" : "default"}
                        size="sm"
                        variant="flat"
                      >
                        {tenant.rolloutEnabled ? "Ativo" : "Inativo"}
                      </Chip>
                    </div>
                    <p className="text-sm text-default-500">
                      {tenant.tenantSlug} - {tenant.manualHolidayCount} feriados manuais
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {tenant.enabledSurfaces.map((surface) => (
                        <Chip key={`${tenant.tenantId}-${surface}`} color="secondary" size="sm" variant="flat">
                          {SURFACE_LABELS[surface]}
                        </Chip>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1 text-xs text-default-500">
                    <p>Atualizado em {formatDateTime(tenant.updatedAt)}</p>
                    <p>{tenant.notes ?? "Sem notas operacionais"}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </CardBody>
      </Card>

      <Card className="border border-default-200/70 bg-content1/80">
        <CardHeader className="flex items-center gap-2">
          <History className="h-5 w-5 text-default-500" />
          <div>
            <h2 className="text-lg font-semibold">Auditoria recente</h2>
            <p className="text-sm text-default-500">
              Mudancas globais e overrides por tenant registradas em Super Admin Audit.
            </p>
          </div>
        </CardHeader>
        <CardBody className="gap-3">
          {dashboardQuery.data.audit.length === 0 ? (
            <p className="text-sm text-default-500">
              Nenhum evento de auditoria encontrado para o rollout de feriados.
            </p>
          ) : (
            dashboardQuery.data.audit.map((entry) => (
              <div
                key={entry.id}
                className="rounded-2xl border border-default-200 bg-default-50 px-4 py-3 dark:border-white/10 dark:bg-white/5"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium text-foreground">{entry.action}</p>
                    <p className="text-sm text-default-500">
                      Entidade alvo: {entry.entityId ?? "global"}
                    </p>
                  </div>
                  <div className="text-xs text-default-500">
                    <p>{formatDateTime(entry.createdAt)}</p>
                    <p>Ator: {entry.actorId}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardBody>
      </Card>
    </div>
  );
}
