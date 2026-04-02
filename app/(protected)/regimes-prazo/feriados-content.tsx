"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
  Button,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Pagination,
  Select,
  SelectItem,
  Skeleton,
  Switch,
  Textarea,
} from "@heroui/react";
import {
  Calendar,
  CalendarCheck2,
  Download,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  TimerReset,
} from "lucide-react";

import {
  createFeriado,
  deleteFeriado,
  getDashboardFeriados,
  getTiposFeriado,
  importarFeriadosOficiais,
  listFeriados,
  type FeriadoCreateInput,
  type FeriadoFilters,
  updateFeriado,
} from "@/app/actions/feriados";
import { DateInput } from "@/components/ui/date-input";
import {
  PeopleEntityCard,
  PeopleEntityCardBody,
  PeopleEntityCardHeader,
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";
import { toast } from "@/lib/toast";
import { getEstadosBrasilCached } from "@/lib/api/brazil-states";
import { TipoFeriado } from "@/generated/prisma";

interface Feriado {
  id: string;
  nome: string;
  data: Date | string;
  tipo: TipoFeriado;
  uf: string | null;
  municipio: string | null;
  descricao: string | null;
  recorrente: boolean;
  tribunal: {
    id: string;
    nome: string;
    sigla: string | null;
  } | null;
  tenantId?: string | null;
}

interface DashboardData {
  total: number;
  ano: number;
  porTipo: Array<{
    tipo: TipoFeriado;
    _count: number;
  }>;
  proximosFeriados: Feriado[];
  feriadosHoje: Feriado[];
  autoSeed?: {
    seeded: boolean;
    source: string | null;
    created: number;
    updated: number;
    ignored: number;
  };
}

interface EstadoOption {
  id: number;
  sigla: string;
  nome: string;
}

interface FeriadoModalProps {
  isOpen: boolean;
  mode: "create" | "edit" | "view";
  feriado: Feriado | null;
  tipos: TipoFeriado[];
  estados: EstadoOption[];
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

const PER_PAGE_OPTIONS = [8, 12, 20];

function getTipoLabel(tipo: TipoFeriado): string {
  switch (tipo) {
    case "NACIONAL":
      return "Nacional";
    case "ESTADUAL":
      return "Estadual";
    case "MUNICIPAL":
      return "Municipal";
    case "JUDICIARIO":
      return "Judiciário";
    default:
      return tipo;
  }
}

function getTipoChipColor(tipo: TipoFeriado) {
  switch (tipo) {
    case "NACIONAL":
      return "success";
    case "ESTADUAL":
      return "primary";
    case "MUNICIPAL":
      return "secondary";
    case "JUDICIARIO":
      return "warning";
    default:
      return "default";
  }
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateLong(date: Date | string): string {
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    weekday: "short",
  });
}

export default function FeriadosContent() {
  const currentYear = new Date().getFullYear();
  const autoSeedToastRef = useRef<string | null>(null);

  const [filters, setFilters] = useState<FeriadoFilters>({
    ano: currentYear,
  });
  const [searchInput, setSearchInput] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(PER_PAGE_OPTIONS[0]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit" | "view">(
    "create",
  );
  const [selectedFeriado, setSelectedFeriado] = useState<Feriado | null>(null);
  const [isSyncingOfficial, setIsSyncingOfficial] = useState(false);

  const yearOptions = useMemo(
    () => [currentYear - 1, currentYear, currentYear + 1, currentYear + 2],
    [currentYear],
  );

  const {
    data: feriadosData,
    mutate: mutateFeriados,
    isLoading: isLoadingFeriados,
  } = useSWR(["regimes-feriados", filters], () => listFeriados(filters));

  const {
    data: dashboardResult,
    mutate: mutateDashboard,
    isLoading: isLoadingDashboard,
  } = useSWR(["regimes-feriados-dashboard", filters.ano], () =>
    getDashboardFeriados(filters.ano),
  );

  const { data: tiposResult } = useSWR("regimes-feriados-tipos", getTiposFeriado);
  const { data: estados } = useSWR("regimes-feriados-estados", getEstadosBrasilCached);

  const feriados = useMemo(
    () => ((feriadosData?.success ? feriadosData.data : []) as Feriado[]),
    [feriadosData],
  );
  const dashboard = dashboardResult?.success
    ? (dashboardResult.data as DashboardData)
    : undefined;
  const tipos = (tiposResult?.success ? tiposResult.data : []) as TipoFeriado[];
  const estadoOptions = (estados ?? []) as EstadoOption[];
  const hasList = feriados.length > 0;

  const filteredFeriados = useMemo(() => {
    return feriados;
  }, [feriados]);

  const totalPages = Math.max(1, Math.ceil(filteredFeriados.length / perPage));
  const pagedFeriados = useMemo(() => {
    const start = (currentPage - 1) * perPage;
    return filteredFeriados.slice(start, start + perPage);
  }, [currentPage, perPage, filteredFeriados]);

  const pageStart =
    filteredFeriados.length === 0 ? 0 : (currentPage - 1) * perPage + 1;
  const pageEnd = Math.min(currentPage * perPage, filteredFeriados.length);
  const hasActiveFilters = Boolean(
    searchInput.trim() ||
      filters.tipo ||
      filters.uf ||
      filters.municipio ||
      filters.tribunalId,
  );

  const totalNacionais =
    dashboard?.porTipo.find((item) => item.tipo === "NACIONAL")?._count ?? 0;
  const totalHoje = dashboard?.feriadosHoje?.length ?? 0;
  const totalProximos = dashboard?.proximosFeriados?.length ?? 0;

  useEffect(() => {
    setCurrentPage(1);
  }, [filters, perPage]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (!dashboard?.autoSeed?.seeded) return;

    const autoSeedKey = `${dashboard.ano}:${dashboard.autoSeed.created}:${dashboard.autoSeed.updated}:${dashboard.autoSeed.ignored}`;
    if (autoSeedToastRef.current === autoSeedKey) {
      return;
    }

    autoSeedToastRef.current = autoSeedKey;
    toast.success("Feriados oficiais atualizados automaticamente", {
      description: `${dashboard.autoSeed.created} novo(s), ${dashboard.autoSeed.updated} atualizado(s). Base compartilhada otimizada para multi-tenant.`,
    });
  }, [dashboard]);

  const openCreateModal = () => {
    setModalMode("create");
    setSelectedFeriado(null);
    setModalOpen(true);
  };

  const openEditModal = (feriado: Feriado) => {
    setModalMode("edit");
    setSelectedFeriado(feriado);
    setModalOpen(true);
  };

  const openViewModal = (feriado: Feriado) => {
    setModalMode("view");
    setSelectedFeriado(feriado);
    setModalOpen(true);
  };

  const refreshAll = async () => {
    await Promise.all([mutateFeriados(), mutateDashboard()]);
  };

  const handleDelete = async (feriadoId: string) => {
    if (!confirm("Deseja excluir este feriado?")) return;

    const result = await deleteFeriado(feriadoId);
    if (!result.success) {
      toast.error(result.error || "Falha ao excluir feriado");
      return;
    }

    toast.success("Feriado excluído com sucesso.");
    await refreshAll();
  };

  const handleSyncOfficial = async () => {
    const ano = filters.ano || currentYear;
    setIsSyncingOfficial(true);
    try {
      const result = await importarFeriadosOficiais({
        ano,
        uf: filters.uf,
        municipio: filters.municipio,
      });

      if (!result.success) {
        toast.error(result.error || "Falha ao sincronizar feriados oficiais");
        return;
      }

      const created = result.data?.created ?? 0;
      const updated = result.data?.updated ?? 0;
      const ignored = result.data?.ignored ?? 0;
      const scopeLabel = filters.municipio?.trim()
        ? `${filters.municipio.trim()}/${filters.uf || ""}`
        : filters.uf?.trim()
          ? filters.uf.trim()
          : "base nacional";

      toast.success("Sincronização concluída", {
        description: `${created} novo(s), ${updated} atualizado(s), ${ignored} reaproveitado(s) para ${scopeLabel}.`,
      });

      if (result.data?.warning) {
        toast.warning("Sincronizacao parcial", {
          description: result.data.warning,
        });
      }

      await refreshAll();
    } catch {
      toast.error("Erro inesperado na sincronização de feriados.");
    } finally {
      setIsSyncingOfficial(false);
    }
  };

  return (
    <div className="space-y-6">
      <PeoplePageHeader
        tag="Operacional"
        title="Feriados"
        description="Calendário jurídico centralizado para cálculo de prazos. A integração oficial usa a Feriados API: no plano free, cobrimos feriados nacionais, estaduais e municipais das 27 capitais."
        actions={
          <>
            <Button
              color="secondary"
              isLoading={isSyncingOfficial}
              startContent={!isSyncingOfficial ? <Download className="h-4 w-4" /> : null}
              variant="flat"
              onPress={handleSyncOfficial}
            >
              Sincronizar oficiais
            </Button>
            <Button
              color="primary"
              startContent={<Plus className="h-4 w-4" />}
              onPress={openCreateModal}
            >
              Novo feriado
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <PeopleMetricCard
          helper={`Ano ${filters.ano || currentYear}`}
          icon={<Calendar className="h-4 w-4" />}
          label="Total no ano"
          tone="primary"
          value={dashboard?.total ?? 0}
        />
        <PeopleMetricCard
          helper="Base nacional compartilhada"
          icon={<CalendarCheck2 className="h-4 w-4" />}
          label="Nacionais"
          tone="success"
          value={totalNacionais}
        />
        <PeopleMetricCard
          helper="Atualização ao abrir a aba"
          icon={<TimerReset className="h-4 w-4" />}
          label="Hoje"
          tone={totalHoje > 0 ? "warning" : "default"}
          value={totalHoje}
        />
        <PeopleMetricCard
          helper="Próximos eventos relevantes"
          icon={<Calendar className="h-4 w-4" />}
          label="Próximos"
          tone="secondary"
          value={totalProximos}
        />
      </div>

      <PeoplePanel
        title="Feriados de hoje"
        description="Ao abrir esta aba, o sistema verifica e atualiza automaticamente os feriados oficiais do ano de forma compartilhada. Municípios do interior seguem por cadastro manual ou plano pago."
      >
        {isLoadingDashboard ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {[1, 2].map((key) => (
              <Skeleton key={key} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : dashboard?.feriadosHoje?.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {dashboard.feriadosHoje.map((feriado) => (
              <PeopleEntityCard
                key={feriado.id}
                isPressable
                onPress={() => openViewModal(feriado)}
              >
                <PeopleEntityCardBody className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-white">{feriado.nome}</p>
                    <Chip color={getTipoChipColor(feriado.tipo)} size="sm" variant="flat">
                      {getTipoLabel(feriado.tipo)}
                    </Chip>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-default-400">
                    <span>{formatDateLong(feriado.data)}</span>
                    {feriado.uf ? <span>• {feriado.uf}</span> : null}
                    {feriado.municipio ? <span>• {feriado.municipio}</span> : null}
                  </div>
                </PeopleEntityCardBody>
              </PeopleEntityCard>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/15 bg-white/5 p-5 text-sm text-default-400">
            Nenhum feriado aplicável para hoje.
          </div>
        )}
      </PeoplePanel>

      <PeoplePanel
        title="Filtros"
        description="Refine por ano, tipo e estado. Busca textual procura no nome e descrição."
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          <Input
            label="Buscar"
            placeholder="Nome ou descrição"
            startContent={<Search className="h-4 w-4 text-default-400" />}
            value={searchInput}
            onValueChange={(value) => {
              setSearchInput(value);
              setFilters((prev) => ({
                ...prev,
                searchTerm: value.trim().length >= 2 ? value : undefined,
              }));
            }}
          />

          <Select
            label="Ano"
            selectedKeys={
              filters.ano && yearOptions.includes(filters.ano)
                ? [String(filters.ano)]
                : []
            }
            onSelectionChange={(keys) => {
              const [value] = Array.from(keys);
              if (typeof value !== "string") return;

              const nextYear = Number(value);
              if (!Number.isNaN(nextYear)) {
                setFilters((prev) => ({ ...prev, ano: nextYear }));
              }
            }}
          >
            {yearOptions.map((ano) => (
              <SelectItem key={String(ano)} textValue={String(ano)}>
                {ano}
              </SelectItem>
            ))}
          </Select>

          <Select
            label="Por página"
            selectedKeys={PER_PAGE_OPTIONS.includes(perPage) ? [String(perPage)] : []}
            onSelectionChange={(keys) => {
              const [value] = Array.from(keys);
              if (typeof value !== "string") return;

              const parsed = Number(value);
              if (!Number.isNaN(parsed) && PER_PAGE_OPTIONS.includes(parsed)) {
                setPerPage(parsed);
              }
            }}
          >
            {PER_PAGE_OPTIONS.map((option) => (
              <SelectItem key={String(option)} textValue={String(option)}>
                {option}
              </SelectItem>
            ))}
          </Select>

          <div className="flex items-end gap-2">
            <Button
              className="flex-1"
              color={showAdvancedFilters ? "primary" : "default"}
              variant={showAdvancedFilters ? "flat" : "bordered"}
              onPress={() => setShowAdvancedFilters((prev) => !prev)}
            >
              Filtros avançados
            </Button>
            <Button
              isDisabled={!hasActiveFilters}
              variant="flat"
              onPress={() => {
                setFilters({ ano: currentYear });
                setSearchInput("");
                setShowAdvancedFilters(false);
              }}
            >
              Limpar
            </Button>
          </div>
        </div>

        {showAdvancedFilters ? (
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
            <Select
              label="Tipo"
              selectedKeys={
                filters.tipo && tipos.includes(filters.tipo) ? [filters.tipo] : []
              }
              onSelectionChange={(keys) => {
                const [value] = Array.from(keys);
                setFilters((prev) => ({
                  ...prev,
                  tipo: typeof value === "string" ? (value as TipoFeriado) : undefined,
                }));
              }}
            >
              {tipos.map((tipo) => (
                <SelectItem key={tipo} textValue={getTipoLabel(tipo)}>
                  {getTipoLabel(tipo)}
                </SelectItem>
              ))}
            </Select>

            <Select
              label="Estado (UF)"
              selectedKeys={
                filters.uf &&
                estadoOptions.some((estado) => estado.sigla === filters.uf)
                  ? [filters.uf]
                  : []
              }
              onSelectionChange={(keys) => {
                const [value] = Array.from(keys);
                setFilters((prev) => ({
                  ...prev,
                  uf: typeof value === "string" ? value : undefined,
                }));
              }}
            >
              {estadoOptions.map((estado) => (
                <SelectItem key={estado.sigla} textValue={estado.nome}>
                  {estado.nome} ({estado.sigla})
                </SelectItem>
              ))}
            </Select>

            <Input
              label="Município"
              placeholder="Ex.: Salvador"
              value={filters.municipio || ""}
              onValueChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  municipio: value.trim() ? value : undefined,
                }))
              }
            />
          </div>
        ) : null}
      </PeoplePanel>

      <PeoplePanel
        title="Calendário de feriados"
        description={`${filteredFeriados.length} registro(s) no filtro atual.`}
      >
        {isLoadingFeriados ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((key) => (
              <Skeleton key={key} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : !hasList ? (
          <div className="rounded-xl border border-dashed border-white/15 bg-white/5 p-8 text-center">
            <p className="text-base font-medium text-white">Nenhum feriado encontrado</p>
            <p className="mt-1 text-sm text-default-400">
              Ajuste os filtros ou sincronize a base oficial.
            </p>
            <Button
              className="mt-4"
              color="primary"
              startContent={<Download className="h-4 w-4" />}
              variant="flat"
              onPress={handleSyncOfficial}
            >
              Sincronizar oficiais
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {pagedFeriados.map((feriado) => (
                <PeopleEntityCard
                  key={feriado.id}
                  isPressable
                  onPress={() => openViewModal(feriado)}
                >
                  <PeopleEntityCardHeader className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <p className="text-sm text-default-400">{formatDateLong(feriado.data)}</p>
                      <h3 className="text-base font-semibold text-white">{feriado.nome}</h3>
                    </div>
                    <Chip color={getTipoChipColor(feriado.tipo)} size="sm" variant="flat">
                      {getTipoLabel(feriado.tipo)}
                    </Chip>
                  </PeopleEntityCardHeader>
                  <PeopleEntityCardBody className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-default-400">
                      {feriado.uf ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {feriado.uf}
                          {feriado.municipio ? ` • ${feriado.municipio}` : ""}
                        </span>
                      ) : (
                        <span>Aplicação nacional</span>
                      )}
                      {feriado.recorrente ? (
                        <Chip size="sm" variant="bordered">
                          Recorrente
                        </Chip>
                      ) : null}
                    </div>

                    {feriado.descricao ? (
                      <p className="line-clamp-2 text-sm text-default-300">
                        {feriado.descricao}
                      </p>
                    ) : (
                      <p className="text-sm text-default-500">
                        Sem descrição complementar.
                      </p>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <Button
                        isIconOnly
                        size="sm"
                        variant="flat"
                        onPress={() => openEditModal(feriado)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        color="danger"
                        isIconOnly
                        size="sm"
                        variant="flat"
                        onPress={() => handleDelete(feriado.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </PeopleEntityCardBody>
                </PeopleEntityCard>
              ))}
            </div>

            {filteredFeriados.length > perPage ? (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-default-500">
                  Exibindo {pageStart}-{pageEnd} de {filteredFeriados.length} registro(s)
                </p>
                <Pagination
                  color="primary"
                  page={currentPage}
                  total={totalPages}
                  onChange={setCurrentPage}
                />
              </div>
            ) : null}
          </>
        )}
      </PeoplePanel>

      <FeriadoModal
        estados={estadoOptions}
        feriado={selectedFeriado}
        isOpen={modalOpen}
        mode={modalMode}
        tipos={tipos}
        onClose={() => {
          setModalOpen(false);
          setSelectedFeriado(null);
        }}
        onSuccess={refreshAll}
      />
    </div>
  );
}

function FeriadoModal({
  isOpen,
  mode,
  feriado,
  tipos,
  estados,
  onClose,
  onSuccess,
}: FeriadoModalProps) {
  const isReadOnly = mode === "view";
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    data: new Date().toISOString().slice(0, 10),
    tipo: "NACIONAL" as TipoFeriado,
    uf: "",
    municipio: "",
    descricao: "",
    recorrente: true,
  });

  const selectedTipoKeys = tipos.includes(formData.tipo) ? [formData.tipo] : [];
  const selectedUfKeys =
    formData.uf && estados.some((estado) => estado.sigla === formData.uf)
      ? [formData.uf]
      : [];
  const mustSetUf = formData.tipo === "ESTADUAL" || formData.tipo === "MUNICIPAL";
  const mustSetMunicipio = formData.tipo === "MUNICIPAL";

  useEffect(() => {
    if (!isOpen) return;

    if (mode === "create" || !feriado) {
      setFormData({
        nome: "",
        data: new Date().toISOString().slice(0, 10),
        tipo: "NACIONAL",
        uf: "",
        municipio: "",
        descricao: "",
        recorrente: true,
      });
      return;
    }

    setFormData({
      nome: feriado.nome,
      data: new Date(feriado.data).toISOString().slice(0, 10),
      tipo: feriado.tipo,
      uf: feriado.uf || "",
      municipio: feriado.municipio || "",
      descricao: feriado.descricao || "",
      recorrente: feriado.recorrente,
    });
  }, [feriado, isOpen, mode]);

  const handleSubmit = async () => {
    if (isReadOnly) {
      onClose();
      return;
    }

    if (!formData.nome.trim() || !formData.data || !formData.tipo) {
      toast.error("Preencha os campos obrigatórios.");
      return;
    }

    if (mustSetUf && !formData.uf) {
      toast.error("Selecione a UF para este tipo de feriado.");
      return;
    }

    if (mustSetMunicipio && !formData.municipio.trim()) {
      toast.error("Informe o município para feriado municipal.");
      return;
    }

    const payload: FeriadoCreateInput = {
      nome: formData.nome.trim(),
      data: new Date(formData.data),
      tipo: formData.tipo,
      uf: formData.uf || undefined,
      municipio: formData.municipio.trim() || undefined,
      descricao: formData.descricao.trim() || undefined,
      recorrente: formData.recorrente,
    };

    setSaving(true);
    try {
      const result =
        mode === "create" || !feriado
          ? await createFeriado(payload)
          : await updateFeriado(feriado.id, payload);

      if (!result.success) {
        toast.error(result.error || "Falha ao salvar feriado.");
        return;
      }

      toast.success(
        mode === "create"
          ? "Feriado criado com sucesso."
          : "Feriado atualizado com sucesso.",
      );
      await onSuccess();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} size="2xl" onClose={onClose}>
      <ModalContent>
        <ModalHeader>
          {mode === "create" && "Novo feriado"}
          {mode === "edit" && "Editar feriado"}
          {mode === "view" && "Detalhes do feriado"}
        </ModalHeader>
        <ModalBody className="space-y-4">
          <Input
            isRequired
            isReadOnly={isReadOnly}
            label="Nome"
            placeholder="Ex.: Dia do Trabalho"
            value={formData.nome}
            onValueChange={(value) =>
              setFormData((prev) => ({ ...prev, nome: value }))
            }
          />

          <DateInput
            isRequired
            isReadOnly={isReadOnly}
            label="Data"
            value={formData.data}
            onValueChange={(value) =>
              setFormData((prev) => ({ ...prev, data: value }))
            }
          />

          <Select
            isRequired
            isDisabled={isReadOnly}
            label="Tipo"
            selectedKeys={selectedTipoKeys}
            onSelectionChange={(keys) => {
              const [value] = Array.from(keys);
              if (typeof value !== "string") return;
              setFormData((prev) => ({
                ...prev,
                tipo: value as TipoFeriado,
                uf: value === "NACIONAL" ? "" : prev.uf,
                municipio: value === "MUNICIPAL" ? prev.municipio : "",
              }));
            }}
          >
            {tipos.map((tipo) => (
              <SelectItem key={tipo} textValue={getTipoLabel(tipo)}>
                {getTipoLabel(tipo)}
              </SelectItem>
            ))}
          </Select>

          {mustSetUf ? (
            <Select
              isDisabled={isReadOnly}
              isRequired={mustSetUf}
              label="UF"
              selectedKeys={selectedUfKeys}
              onSelectionChange={(keys) => {
                const [value] = Array.from(keys);
                setFormData((prev) => ({
                  ...prev,
                  uf: typeof value === "string" ? value : "",
                }));
              }}
            >
              {estados.map((estado) => (
                <SelectItem key={estado.sigla} textValue={estado.nome}>
                  {estado.nome} ({estado.sigla})
                </SelectItem>
              ))}
            </Select>
          ) : null}

          {mustSetMunicipio ? (
            <Input
              isRequired
              isReadOnly={isReadOnly}
              label="Município"
              placeholder="Ex.: Salvador"
              value={formData.municipio}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, municipio: value }))
              }
            />
          ) : null}

          <Textarea
            isReadOnly={isReadOnly}
            label="Descrição"
            minRows={3}
            placeholder="Observações internas e regras específicas."
            value={formData.descricao}
            onValueChange={(value) =>
              setFormData((prev) => ({ ...prev, descricao: value }))
            }
          />

          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <Switch
              isDisabled={isReadOnly}
              isSelected={formData.recorrente}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, recorrente: value }))
              }
            >
              Repetir todo ano (recorrente)
            </Switch>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>
            {isReadOnly ? "Fechar" : "Cancelar"}
          </Button>
          {!isReadOnly ? (
            <Button color="primary" isLoading={saving} onPress={handleSubmit}>
              {mode === "create" ? "Criar feriado" : "Salvar alterações"}
            </Button>
          ) : null}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

