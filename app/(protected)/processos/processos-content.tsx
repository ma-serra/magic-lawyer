"use client";

import { useState, useMemo, ReactNode } from "react";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Divider } from "@heroui/divider";
import { Spinner } from "@heroui/spinner";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";

import {
  Scale, Briefcase, Calendar, Clock, AlertCircle, CheckCircle, XCircle, User, FileText, Plus, Search, Filter, X, Eye, Edit, DollarSign, MapPin, Shield, Building2, Users, Copy, UploadCloud, RefreshCw, LayoutGrid, List as ListIcon, } from "lucide-react";
import Link from "next/link";

import { useAllProcessos } from "@/app/hooks/use-processos";
import { useClientesParaSelect } from "@/app/hooks/use-clientes";
import { useAdvogadosParaSelect } from "@/app/hooks/use-advogados-select";
import { PeoplePageHeader } from "@/components/people-ui";
import {
  ProcessoStatus, ProcessoFase, ProcessoGrau, } from "@/generated/prisma";
import { DateUtils } from "@/app/lib/date-utils";
import { addToast } from "@heroui/toast";
import { ProcessosImportModal } from "./processos-import-modal";
import { ProcessosSyncOabModal } from "./processos-sync-oab-modal";
import { Pagination, Select, SelectItem } from "@heroui/react";
import { AnimatePresence, motion } from "framer-motion";
import { DateRangeInput } from "@/components/ui/date-range-input";
import { SearchableSelect } from "@/components/searchable-select";

interface ProcessoFiltros {
  busca: string;
  status: string[];
  fase: string[];
  grau: string[];
  areaId: string;
  advogadoId: string;
  clienteId: string;
  comarca: string;
  segredoJustica: boolean | null;
  valorMinimo: string;
  valorMaximo: string;
  dataDistribuicaoInicio: string;
  dataDistribuicaoFim: string;
  prazoVencimento: string;
}

interface FilterSectionProps {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: ReactNode;
}

const FilterSection = ({
  title,
  description,
  icon: Icon,
  children,
}: FilterSectionProps) => (
  <section className="space-y-3 rounded-2xl border border-default-200/70 bg-default-50/70 p-4">
    <div className="flex items-start gap-2">
      {Icon ? <Icon className="h-4 w-4 text-default-400" /> : null}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-default-400">
          {title}
        </p>
        {description ? (
          <p className="text-xs text-default-500">{description}</p>
        ) : null}
      </div>
    </div>
    {children}
  </section>
);

interface FilterToggleButtonProps {
  isActive: boolean;
  onToggle: () => void;
  label: string;
  icon?: ReactNode;
  activeColor?: "primary" | "secondary" | "success" | "warning" | "danger" | "default";
}

const FilterToggleButton = ({
  isActive,
  onToggle,
  label,
  icon,
  activeColor = "primary",
}: FilterToggleButtonProps) => (
  <Button
    radius="full"
    size="sm"
    startContent={icon}
    variant={isActive ? "solid" : "bordered"}
    color={isActive ? activeColor : "default"}
    onPress={() => onToggle()}
  >
    {label}
  </Button>
);

interface ProcessosContentProps {
  canCreateProcesso: boolean;
  canSyncOab: boolean;
}

export function ProcessosContent({
  canCreateProcesso,
  canSyncOab,
}: ProcessosContentProps) {

  const {
    processos,
    isLoading,
    isError,
    refresh: refreshProcessos,
  } = useAllProcessos();
  const { advogados } = useAdvogadosParaSelect();
  const { clientes } = useClientesParaSelect();

  const [filtros, setFiltros] = useState<ProcessoFiltros>({
    busca: "",
    status: [],
    fase: [],
    grau: [],
    areaId: "",
    advogadoId: "",
    clienteId: "",
    comarca: "",
    segredoJustica: null,
    valorMinimo: "",
    valorMaximo: "",
    dataDistribuicaoInicio: "",
    dataDistribuicaoFim: "",
    prazoVencimento: "",
  });

  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [mostrarModalImportacao, setMostrarModalImportacao] = useState(false);
  const [mostrarModalSincronizacaoOab, setMostrarModalSincronizacaoOab] =
    useState(false);
  const [modoVisualizacao, setModoVisualizacao] = useState<"cards" | "lista">(
    "cards",
  );
  const [paginaAtual, setPaginaAtual] = useState(1);
  const itensPorPagina = 9;

  const copiarNumeroProcesso = async (numero: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    try {
      await navigator.clipboard.writeText(numero);
      addToast({
        title: "Número copiado!",
        description: `O número do processo "${numero}" foi copiado para a área de transferência.`,
        color: "success",
        timeout: 3000,
      });
    } catch (error) {
      addToast({
        title: "Erro ao copiar",
        description: "Não foi possível copiar o número do processo.",
        color: "danger",
        timeout: 3000,
      });
    }
  };

  const getStatusColor = (status: ProcessoStatus) => {
    switch (status) {
      case ProcessoStatus.EM_ANDAMENTO:
        return "primary";
      case ProcessoStatus.ENCERRADO:
        return "success";
      case ProcessoStatus.ARQUIVADO:
        return "default";
      case ProcessoStatus.SUSPENSO:
        return "warning";
      case ProcessoStatus.RASCUNHO:
        return "default";
      default:
        return "default";
    }
  };

  const getStatusLabel = (status: ProcessoStatus) => {
    switch (status) {
      case ProcessoStatus.EM_ANDAMENTO:
        return "Em Andamento";
      case ProcessoStatus.ENCERRADO:
        return "Encerrado";
      case ProcessoStatus.ARQUIVADO:
        return "Arquivado";
      case ProcessoStatus.SUSPENSO:
        return "Suspenso";
      case ProcessoStatus.RASCUNHO:
        return "Rascunho";
      default:
        return status;
    }
  };

  const getStatusIcon = (status: ProcessoStatus) => {
    switch (status) {
      case ProcessoStatus.EM_ANDAMENTO:
        return <Clock className="h-4 w-4" />;
      case ProcessoStatus.ENCERRADO:
        return <CheckCircle className="h-4 w-4" />;
      case ProcessoStatus.ARQUIVADO:
        return <FileText className="h-4 w-4" />;
      case ProcessoStatus.SUSPENSO:
        return <AlertCircle className="h-4 w-4" />;
      case ProcessoStatus.RASCUNHO:
        return <Edit className="h-4 w-4" />;
      default:
        return <Scale className="h-4 w-4" />;
    }
  };

  const getFaseLabel = (fase?: ProcessoFase | null) => {
    if (!fase) return "-";
    switch (fase) {
      case ProcessoFase.PETICAO_INICIAL:
        return "Petição Inicial";
      case ProcessoFase.CITACAO:
        return "Citação";
      case ProcessoFase.INSTRUCAO:
        return "Instrução";
      case ProcessoFase.SENTENCA:
        return "Sentença";
      case ProcessoFase.RECURSO:
        return "Recurso";
      case ProcessoFase.EXECUCAO:
        return "Execução";
      default:
        return fase;
    }
  };

  const getGrauLabel = (grau?: ProcessoGrau | null) => {
    if (!grau) return "-";
    switch (grau) {
      case ProcessoGrau.PRIMEIRO:
        return "1º Grau";
      case ProcessoGrau.SEGUNDO:
        return "2º Grau";
      case ProcessoGrau.SUPERIOR:
        return "Tribunal Superior";
      default:
        return grau;
    }
  };

  const isProcessoOrigemSincronizacaoExterna = (processo: any) => {
    if (processo?.origemSincronizacaoExterna === true) {
      return true;
    }

    if (!Array.isArray(processo?.tags)) {
      return false;
    }

    return processo.tags.some(
      (tag: unknown) =>
        typeof tag === "string" &&
        tag.trim().toLowerCase() === "origem:sincronizacao_externa",
    );
  };

  // Extrair dados únicos para filtros
  const areasUnicas = useMemo(() => {
    if (!processos || !Array.isArray(processos)) return [];
    const areas = processos.map((p: any) => p.area?.nome).filter(Boolean);

    return Array.from(new Set(areas));
  }, [processos]);

  const advogadosOptions = useMemo(() => {
    return (advogados || []).map((adv) => ({
      id: adv.id,
      label: adv.label,
    }));
  }, [advogados]);

  const comarcasUnicas = useMemo(() => {
    if (!processos || !Array.isArray(processos)) return [];
    const comarcas = processos.map((p: any) => p.comarca).filter(Boolean);

    return Array.from(new Set(comarcas));
  }, [processos]);

  const areaKeys = useMemo(() => new Set(areasUnicas), [areasUnicas]);
  const selectedAreaKeys =
    filtros.areaId && areaKeys.has(filtros.areaId) ? [filtros.areaId] : [];

  const advogadoKeys = useMemo(
    () => new Set(advogadosOptions.map((adv) => adv.id)),
    [advogadosOptions],
  );
  const selectedAdvogadoKeys =
    filtros.advogadoId && advogadoKeys.has(filtros.advogadoId)
      ? [filtros.advogadoId]
      : [];

  const clienteKeys = useMemo(
    () => new Set((clientes || []).map((cliente) => cliente.id)),
    [clientes],
  );
  const selectedClienteKeys =
    filtros.clienteId && clienteKeys.has(filtros.clienteId)
      ? [filtros.clienteId]
      : [];

  const comarcaKeys = useMemo(() => new Set(comarcasUnicas), [comarcasUnicas]);
  const selectedComarcaKeys =
    filtros.comarca && comarcaKeys.has(filtros.comarca) ? [filtros.comarca] : [];
  const advogadoFilterOptions = useMemo(
    () =>
      advogadosOptions.map((adv) => ({
        key: adv.id,
        label: adv.label,
        textValue: adv.label,
      })),
    [advogadosOptions],
  );
  const clienteFilterOptions = useMemo(
    () =>
      (clientes || []).map((cliente) => ({
        key: cliente.id,
        label: cliente.nome,
        textValue: [cliente.nome, cliente.email || "", cliente.documento || ""]
          .filter(Boolean)
          .join(" "),
        description: cliente.email || undefined,
        startContent:
          cliente.tipoPessoa === "JURIDICA" ? (
            <Building2 className="h-4 w-4 text-default-400" />
          ) : (
            <User className="h-4 w-4 text-default-400" />
          ),
      })),
    [clientes],
  );

  const selectedSegredoJusticaKeys =
    filtros.segredoJustica !== null ? [filtros.segredoJustica.toString()] : [];
  const selectedPrazoVencimentoKeys = filtros.prazoVencimento
    ? [filtros.prazoVencimento]
    : [];

  // Filtrar processos
  const processosFiltrados = useMemo(() => {
    if (!processos || !Array.isArray(processos)) return [];

    return processos.filter((processo: any) => {
      // Busca geral
      if (filtros.busca) {
        const busca = filtros.busca.toLowerCase();
        const matchBusca =
          processo.numero.toLowerCase().includes(busca) ||
          processo.titulo?.toLowerCase().includes(busca) ||
          processo.cliente?.nome?.toLowerCase().includes(busca) ||
          (
            processo.advogadoResponsavel?.usuario?.firstName +
            " " +
            processo.advogadoResponsavel?.usuario?.lastName
          )
            ?.toLowerCase()
            .includes(busca);

        if (!matchBusca) return false;
      }

      // Status
      if (
        filtros.status.length > 0 &&
        !filtros.status.includes(processo.status)
      ) {
        return false;
      }

      if (
        filtros.fase.length > 0 &&
        (!processo.fase || !filtros.fase.includes(processo.fase))
      ) {
        return false;
      }

      if (
        filtros.grau.length > 0 &&
        (!processo.grau || !filtros.grau.includes(processo.grau))
      ) {
        return false;
      }

      // Área
      if (filtros.areaId && processo.area?.nome !== filtros.areaId) {
        return false;
      }

      // Advogado
      if (
        filtros.advogadoId &&
        processo.advogadoResponsavel?.id !== filtros.advogadoId
      ) {
        return false;
      }

      // Cliente
      if (filtros.clienteId && processo.clienteId !== filtros.clienteId) {
        return false;
      }

      // Comarca
      if (filtros.comarca && processo.comarca !== filtros.comarca) {
        return false;
      }

      // Segredo de justiça
      if (
        filtros.segredoJustica !== null &&
        processo.segredoJustica !== filtros.segredoJustica
      ) {
        return false;
      }

      // Valor da causa
      if (
        filtros.valorMinimo &&
        processo.valorCausa &&
        !isNaN(Number(processo.valorCausa)) &&
        Number(processo.valorCausa) < Number(filtros.valorMinimo)
      ) {
        return false;
      }
      if (
        filtros.valorMaximo &&
        processo.valorCausa &&
        !isNaN(Number(processo.valorCausa)) &&
        Number(processo.valorCausa) > Number(filtros.valorMaximo)
      ) {
        return false;
      }

      // Data de distribuição
      if (
        filtros.dataDistribuicaoInicio &&
        processo.dataDistribuicao &&
        DateUtils.isValid(processo.dataDistribuicao)
      ) {
        const dataInicio = new Date(filtros.dataDistribuicaoInicio);
        const dataProcesso = new Date(processo.dataDistribuicao);

        if (!isNaN(dataProcesso.getTime()) && dataProcesso < dataInicio)
          return false;
      }
      if (
        filtros.dataDistribuicaoFim &&
        processo.dataDistribuicao &&
        DateUtils.isValid(processo.dataDistribuicao)
      ) {
        const dataFim = new Date(filtros.dataDistribuicaoFim);
        const dataProcesso = new Date(processo.dataDistribuicao);

        if (!isNaN(dataProcesso.getTime()) && dataProcesso > dataFim)
          return false;
      }

      // Prazo de vencimento
      if (
        filtros.prazoVencimento &&
        processo.prazoPrincipal &&
        DateUtils.isValid(processo.prazoPrincipal)
      ) {
        const hoje = new Date();
        const prazo = new Date(processo.prazoPrincipal);

        if (!isNaN(prazo.getTime())) {
          const diasRestantes = Math.ceil(
            (prazo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24),
          );

          switch (filtros.prazoVencimento) {
            case "vencido":
              if (diasRestantes >= 0) return false;
              break;
            case "vencendo_hoje":
              if (diasRestantes !== 0) return false;
              break;
            case "vencendo_7_dias":
              if (diasRestantes < 0 || diasRestantes > 7) return false;
              break;
            case "vencendo_30_dias":
              if (diasRestantes < 0 || diasRestantes > 30) return false;
              break;
          }
        }
      }

      return true;
    });
  }, [processos, filtros]);

  const limparFiltros = () => {
    setFiltros({
      busca: "",
      status: [],
      fase: [],
      grau: [],
      areaId: "",
      advogadoId: "",
      clienteId: "",
      comarca: "",
      segredoJustica: null,
      valorMinimo: "",
      valorMaximo: "",
      dataDistribuicaoInicio: "",
      dataDistribuicaoFim: "",
      prazoVencimento: "",
    });
  };

  const temFiltrosAtivos = Object.values(filtros).some((valor) =>
    Array.isArray(valor) ? valor.length > 0 : valor !== "" && valor !== null,
  );

  const totalPaginas = Math.max(
    1,
    Math.ceil(processosFiltrados.length / itensPorPagina),
  );

  const processosPaginados = useMemo(() => {
    const start = (paginaAtual - 1) * itensPorPagina;
    const end = start + itensPorPagina;
    return processosFiltrados.slice(start, end);
  }, [processosFiltrados, paginaAtual]);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Spinner label="Carregando processos..." size="lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-danger mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-danger mb-2">
            Erro ao carregar processos
          </h3>
          <p className="text-default-500">Tente recarregar a página</p>
        </div>
      </div>
    );
  }

  // Se ainda não temos dados, mostrar loading
  if (!processos) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Spinner label="Carregando processos..." size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PeoplePageHeader
        tag="Atividades jurídicas"
        title="Processos"
        description={`${processosFiltrados.length} de ${processos?.length || 0} processos${temFiltrosAtivos ? " (filtrados)" : ""}`}
        actions={
          <>
            <div className="flex items-center rounded-xl border border-default-200 bg-content1 p-0.5">
              <Button
                isIconOnly
                aria-label="Visualizar em cards"
                color={modoVisualizacao === "cards" ? "primary" : "default"}
                size="sm"
                variant={modoVisualizacao === "cards" ? "solid" : "light"}
                onPress={() => {
                  setModoVisualizacao("cards");
                  setPaginaAtual(1);
                }}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                isIconOnly
                aria-label="Visualizar em lista"
                color={modoVisualizacao === "lista" ? "primary" : "default"}
                size="sm"
                variant={modoVisualizacao === "lista" ? "solid" : "light"}
                onPress={() => {
                  setModoVisualizacao("lista");
                  setPaginaAtual(1);
                }}
              >
                <ListIcon className="h-4 w-4" />
              </Button>
            </div>
            <Button
              size="sm"
              startContent={<Filter className="h-4 w-4" />}
              variant="bordered"
              onPress={() => setMostrarFiltros(!mostrarFiltros)}
            >
              Filtros
            </Button>
            {canCreateProcesso ? (
              <Button
                color="secondary"
                size="sm"
                startContent={<UploadCloud className="h-4 w-4" />}
                variant="flat"
                onPress={() => setMostrarModalImportacao(true)}
              >
                Importar
              </Button>
            ) : null}
            {canSyncOab ? (
              <Button
                color="warning"
                size="sm"
                startContent={<RefreshCw className="h-4 w-4" />}
                variant="flat"
                onPress={() => setMostrarModalSincronizacaoOab(true)}
              >
                Sincronizar OAB
              </Button>
            ) : null}
            {canCreateProcesso ? (
              <Button
                as={Link}
                color="primary"
                href="/processos/novo"
                size="sm"
                startContent={<Plus className="h-4 w-4" />}
              >
                Novo Processo
              </Button>
            ) : null}
          </>
        }
      />

      {/* Barra de Busca */}
      <Card>
        <CardBody>
          <Input
            endContent={
              filtros.busca && (
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  onPress={() => setFiltros((prev) => ({ ...prev, busca: "" }))}
                >
                  <X className="h-4 w-4" />
                </Button>
              )
            }
            placeholder="Buscar por número, título, cliente ou advogado..."
            startContent={<Search className="h-4 w-4 text-default-400" />}
            value={filtros.busca}
            onChange={(e) =>
              setFiltros((prev) => {
                setPaginaAtual(1);
                return { ...prev, busca: e.target.value };
              })
            }
          />
        </CardBody>
      </Card>

      {/* Filtros Avançados */}
      <AnimatePresence initial={false}>
        {mostrarFiltros ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <Card className="overflow-hidden">
              <CardHeader>
                <div className="flex items-center justify-between w-full">
                  <h3 className="text-lg font-semibold">Filtros Avançados</h3>
                  <Button
                    isDisabled={!temFiltrosAtivos}
                    size="sm"
                    variant="light"
                    onPress={() => {
                      limparFiltros();
                      setPaginaAtual(1);
                    }}
                  >
                    Limpar Filtros
                  </Button>
                </div>
              </CardHeader>
              <Divider />
              <CardBody>
                <div className="space-y-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                <FilterSection
                  icon={Scale}
                  title="Status e andamento"
                  description="Combine status, fase processual e grau para encontrar exatamente o caso que precisa."
                >
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-default-500">
                        Status
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {Object.values(ProcessoStatus).map((status) => {
                          const isActive = filtros.status.includes(status);
                          return (
                            <FilterToggleButton
                              key={status}
                              activeColor={getStatusColor(status)}
                              icon={getStatusIcon(status)}
                              isActive={isActive}
                              label={getStatusLabel(status)}
                              onToggle={() =>
                                setFiltros((prev) => ({
                                  ...prev,
                                  status: isActive
                                    ? prev.status.filter((s) => s !== status)
                                    : [...prev.status, status],
                                }))
                              }
                            />
                          );
                        })}
                      </div>
                    </div>
                    <Divider className="border-dashed border-default-200" />
                    <div>
                      <p className="text-xs font-semibold text-default-500">
                        Fase processual
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {Object.values(ProcessoFase).map((fase) => {
                          const isActive = filtros.fase.includes(fase);
                          return (
                            <FilterToggleButton
                              key={fase}
                              activeColor="secondary"
                              isActive={isActive}
                              label={getFaseLabel(fase)}
                              onToggle={() =>
                                setFiltros((prev) => ({
                                  ...prev,
                                  fase: isActive
                                    ? prev.fase.filter((f) => f !== fase)
                                    : [...prev.fase, fase],
                                }))
                              }
                            />
                          );
                        })}
                      </div>
                    </div>
                    <Divider className="border-dashed border-default-200" />
                    <div>
                      <p className="text-xs font-semibold text-default-500">
                        Grau do processo
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {Object.values(ProcessoGrau).map((grau) => {
                          const isActive = filtros.grau.includes(grau);
                          return (
                            <FilterToggleButton
                              key={grau}
                              isActive={isActive}
                              label={getGrauLabel(grau)}
                              onToggle={() =>
                                setFiltros((prev) => ({
                                  ...prev,
                                  grau: isActive
                                    ? prev.grau.filter((g) => g !== grau)
                                    : [...prev.grau, grau],
                                }))
                              }
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </FilterSection>

                <FilterSection
                  icon={Users}
                  title="Equipe e partes"
                  description="Refine por área, advogado responsável e cliente impactado."
                >
                  <div className="space-y-3">
                    <Select
                      label="Área"
                      placeholder="Todas as áreas"
                      selectedKeys={selectedAreaKeys}
                      onSelectionChange={(keys) => {
                        const selectedKey = Array.from(keys)[0] as string;

                        setFiltros((prev) => ({
                          ...prev,
                          areaId: selectedKey || "",
                        }));
                      }}
                    >
                      {areasUnicas.map((area) => (
                        <SelectItem key={area} textValue={area}>
                          {area}
                        </SelectItem>
                      ))}
                    </Select>

                    <SearchableSelect
                      emptyContent="Nenhum advogado encontrado"
                      items={advogadoFilterOptions}
                      label="Advogado responsável"
                      placeholder="Todos os advogados"
                      selectedKey={selectedAdvogadoKeys[0] ?? null}
                      onSelectionChange={(selectedKey) => {
                        setFiltros((prev) => ({
                          ...prev,
                          advogadoId: selectedKey || "",
                        }));
                        setPaginaAtual(1);
                      }}
                    />

                    <SearchableSelect
                      emptyContent="Nenhum cliente encontrado"
                      items={clienteFilterOptions}
                      label="Cliente"
                      placeholder="Todos os clientes"
                      selectedKey={selectedClienteKeys[0] ?? null}
                      onSelectionChange={(selectedKey) => {
                        setFiltros((prev) => ({
                          ...prev,
                          clienteId: selectedKey || "",
                        }));
                      }}
                    />
                  </div>
                </FilterSection>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <FilterSection
                  icon={MapPin}
                  title="Jurisdição e sigilo"
                  description="Selecione rapidamente a comarca e o nível de sigilo."
                >
                  <div className="space-y-3">
                    <Select
                      label="Comarca"
                      placeholder="Todas as comarcas"
                      selectedKeys={selectedComarcaKeys}
                      onSelectionChange={(keys) => {
                        const selectedKey = Array.from(keys)[0] as string;

                        setFiltros((prev) => ({
                          ...prev,
                          comarca: selectedKey || "",
                        }));
                      }}
                    >
                      {comarcasUnicas.map((comarca) => (
                        <SelectItem key={comarca} textValue={comarca}>
                          {comarca}
                        </SelectItem>
                      ))}
                    </Select>

                    <Select
                      label="Segredo de justiça"
                      placeholder="Todos"
                      selectedKeys={selectedSegredoJusticaKeys}
                      onSelectionChange={(keys) => {
                        const selectedKey = Array.from(keys)[0] as string;

                        setFiltros((prev) => ({
                          ...prev,
                          segredoJustica:
                            selectedKey === "" ? null : selectedKey === "true",
                        }));
                      }}
                    >
                      <SelectItem key="true" textValue="Em segredo">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-warning" />
                          <span>Em segredo</span>
                        </div>
                      </SelectItem>
                      <SelectItem key="false" textValue="Público">
                        <div className="flex items-center gap-2">
                          <Eye className="h-4 w-4 text-success" />
                          <span>Público</span>
                        </div>
                      </SelectItem>
                    </Select>
                  </div>
                </FilterSection>

                <FilterSection
                  icon={Calendar}
                  title="Valores e datas"
                  description="Acompanhe valores da causa, distribuição e prazos críticos."
                >
                  <div className="space-y-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input
                        label="Valor mínimo"
                        startContent={
                          <DollarSign className="h-4 w-4 text-default-400" />
                        }
                        type="number"
                        value={filtros.valorMinimo}
                        onChange={(e) =>
                          setFiltros((prev) => ({
                            ...prev,
                            valorMinimo: e.target.value,
                          }))
                        }
                      />
                      <Input
                        label="Valor máximo"
                        startContent={
                          <DollarSign className="h-4 w-4 text-default-400" />
                        }
                        type="number"
                        value={filtros.valorMaximo}
                        onChange={(e) =>
                          setFiltros((prev) => ({
                            ...prev,
                            valorMaximo: e.target.value,
                          }))
                        }
                      />
                    </div>

                    <DateRangeInput
                      label="Distribuição (de/até)"
                      startValue={filtros.dataDistribuicaoInicio}
                      endValue={filtros.dataDistribuicaoFim}
                      onRangeChange={({ start, end }) =>
                        setFiltros((prev) => ({
                          ...prev,
                          dataDistribuicaoInicio: start,
                          dataDistribuicaoFim: end,
                        }))
                      }
                     />

                    <Select
                      label="Prazos principais"
                      placeholder="Todos os prazos"
                      selectedKeys={selectedPrazoVencimentoKeys}
                      onSelectionChange={(keys) => {
                        const selectedKey = Array.from(keys)[0] as string;

                        setFiltros((prev) => ({
                          ...prev,
                          prazoVencimento: selectedKey || "",
                        }));
                      }}
                    >
                      <SelectItem key="vencido" textValue="Vencido">
                        <div className="flex items-center gap-2">
                          <XCircle className="h-4 w-4 text-danger" />
                          <span>Vencido</span>
                        </div>
                      </SelectItem>
                      <SelectItem key="vencendo_hoje" textValue="Vencendo hoje">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-warning" />
                          <span>Vencendo hoje</span>
                        </div>
                      </SelectItem>
                      <SelectItem
                        key="vencendo_7_dias"
                        textValue="Vencendo em 7 dias"
                      >
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-warning" />
                          <span>Vencendo em 7 dias</span>
                        </div>
                      </SelectItem>
                      <SelectItem
                        key="vencendo_30_dias"
                        textValue="Vencendo em 30 dias"
                      >
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-primary" />
                          <span>Vencendo em 30 dias</span>
                        </div>
                      </SelectItem>
                    </Select>
                  </div>
                </FilterSection>
                  </div>
                </div>
              </CardBody>
            </Card>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Lista de Processos */}
      <div className="grid gap-4">
        {processosFiltrados.length === 0 ? (
          <Card>
            <CardBody className="text-center py-12">
              <FileText className="h-12 w-12 text-default-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-default-500 mb-2">
                {temFiltrosAtivos
                  ? "Nenhum processo encontrado"
                  : "Nenhum processo cadastrado"}
              </h3>
              <p className="text-default-400 mb-4">
                {temFiltrosAtivos
                  ? "Tente ajustar os filtros ou limpar para ver todos os processos"
                  : "Comece criando seu primeiro processo"}
              </p>
              {temFiltrosAtivos ? (
                <Button variant="light" onPress={limparFiltros}>
                  Limpar Filtros
                </Button>
              ) : canCreateProcesso ? (
                <Button as={Link} color="primary" href="/processos/novo">
                  Criar Primeiro Processo
                </Button>
              ) : null}
            </CardBody>
          </Card>
        ) : (
          <>
            {modoVisualizacao === "cards" ? (
              <motion.div
                layout
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                <AnimatePresence>
                  {processosPaginados.map((processo: any) => (
                    <motion.div
                      key={processo.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                      <Card
                        key={processo.id}
                        isPressable
                        as={Link}
                        className="ml-wave-surface border border-default-200 hover:border-primary transition-all hover:shadow-lg cursor-pointer"
                        href={`/processos/${processo.id}`}
                      >
                        <CardHeader className="flex flex-col items-start gap-2 pb-2">
                          <div className="flex w-full items-start justify-between">
                            <Chip
                              color={getStatusColor(processo.status)}
                              size="sm"
                              startContent={getStatusIcon(processo.status)}
                              variant="flat"
                            >
                              {getStatusLabel(processo.status)}
                            </Chip>
                            {processo.segredoJustica && (
                              <Shield className="h-4 w-4 text-warning" />
                            )}
                          </div>
                          <div className="w-full">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-default-700">
                                {processo.numero}
                              </p>
                              <Button
                                isIconOnly
                                aria-label="Copiar número do processo"
                                className="min-w-6 h-6 w-6"
                                size="sm"
                                variant="light"
                                onPress={() =>
                                  copiarNumeroProcesso(processo.numero)
                                }
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  copiarNumeroProcesso(processo.numero, e);
                                }}
                              >
                                <Copy className="h-3.5 w-3.5 text-default-400 hover:text-primary transition-colors" />
                              </Button>
                            </div>
                            {processo.numeroCnj && (
                              <p className="mt-0.5 text-xs text-default-500">
                                CNJ: {processo.numeroCnj}
                              </p>
                            )}
                            {processo.titulo && (
                              <p className="mt-1 text-xs text-default-500 line-clamp-2">
                                {processo.titulo}
                              </p>
                            )}
                            {isProcessoOrigemSincronizacaoExterna(processo) && (
                              <div className="mt-2">
                                <Chip color="warning" size="sm" variant="flat">
                                  Criado via sincronização
                                </Chip>
                              </div>
                            )}
                          </div>
                        </CardHeader>
                        <Divider />
                        <CardBody className="gap-3 pt-3">
                          {processo.area && (
                            <div className="flex items-center gap-2 text-xs">
                              <Briefcase className="h-3 w-3 text-default-400" />
                              <span className="text-default-600">
                                {processo.area.nome}
                              </span>
                            </div>
                          )}
                          {processo.advogadoResponsavel && (
                            <div className="flex items-center gap-2 text-xs">
                              <User className="h-3 w-3 text-default-400" />
                              <span className="text-default-600">
                                {processo.advogadoResponsavel.usuario.firstName}{" "}
                                {processo.advogadoResponsavel.usuario.lastName}
                              </span>
                            </div>
                          )}
                          {processo.cliente && (
                            <div className="flex items-center gap-2 text-xs">
                              {processo.cliente.tipoPessoa === "JURIDICA" ? (
                                <Building2 className="h-3 w-3 text-default-400" />
                              ) : (
                                <User className="h-3 w-3 text-default-400" />
                              )}
                              <span className="text-default-600">
                                {processo.cliente.nome}
                              </span>
                            </div>
                          )}
                          {processo.comarca && (
                            <div className="flex items-center gap-2 text-xs">
                              <MapPin className="h-3 w-3 text-default-400" />
                              <span className="text-default-600">
                                {processo.comarca}
                              </span>
                            </div>
                          )}
                          {processo.dataDistribuicao &&
                            DateUtils.isValid(processo.dataDistribuicao) && (
                              <div className="flex items-center gap-2 text-xs">
                                <Calendar className="h-3 w-3 text-default-400" />
                                <span className="text-default-600">
                                  {DateUtils.formatDate(processo.dataDistribuicao)}
                                </span>
                              </div>
                            )}
                          {processo.prazoPrincipal &&
                            DateUtils.isValid(processo.prazoPrincipal) && (
                              <div className="flex items-center gap-2 text-xs">
                                <Clock className="h-3 w-3 text-warning" />
                                <span className="text-warning-600">
                                  Prazo: {DateUtils.formatDate(processo.prazoPrincipal)}
                                </span>
                              </div>
                            )}
                          {processo.valorCausa !== null &&
                            processo.valorCausa !== undefined &&
                            !isNaN(Number(processo.valorCausa)) &&
                            Number(processo.valorCausa) > 0 && (
                              <div className="flex items-center gap-2 text-xs">
                                <DollarSign className="h-3 w-3 text-success" />
                                <span className="text-success-600">
                                  R${" "}
                                  {Number(processo.valorCausa).toLocaleString(
                                    "pt-BR",
                                    {
                                      minimumFractionDigits: 2,
                                    },
                                  )}
                                </span>
                              </div>
                            )}

                          {(processo.fase || processo.grau) && (
                            <div className="flex flex-wrap gap-2 pt-1">
                              {processo.fase && (
                                <Chip color="secondary" size="sm" variant="flat">
                                  {getFaseLabel(processo.fase)}
                                </Chip>
                              )}
                              {processo.grau && (
                                <Chip color="default" size="sm" variant="flat">
                                  {getGrauLabel(processo.grau)}
                                </Chip>
                              )}
                            </div>
                          )}

                          {Array.isArray(processo.partes) &&
                            processo.partes.length > 0 && (
                              <div className="flex items-center gap-2 text-xs">
                                <Scale className="h-3 w-3 text-default-400" />
                                <span className="text-default-600">
                                  {processo.partes.length}{" "}
                                  {processo.partes.length === 1
                                    ? "parte"
                                    : "partes"}
                                </span>
                              </div>
                            )}

                          <Divider className="my-2" />

                          <div className="flex flex-wrap gap-2">
                            <Chip size="sm" variant="flat">
                              {processo._count.documentos} docs
                            </Chip>
                            <Chip size="sm" variant="flat">
                              {processo._count.eventos} eventos
                            </Chip>
                          </div>
                        </CardBody>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            ) : (
              <Card className="border border-default-200">
                <CardBody className="p-0">
                  <div className="hidden border-b border-default-200 bg-default-50 px-4 py-3 md:grid md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1fr)_auto] md:gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                      Processo
                    </p>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                      Cliente
                    </p>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                      Advogado
                    </p>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                      Status
                    </p>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                      Prazos
                    </p>
                    <p className="text-right text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                      Ações
                    </p>
                  </div>

                  <div className="divide-y divide-default-200">
                    {processosPaginados.map((processo: any) => {
                      const advogadoNome = processo.advogadoResponsavel
                        ? `${processo.advogadoResponsavel.usuario.firstName ?? ""} ${
                            processo.advogadoResponsavel.usuario.lastName ?? ""
                          }`.trim()
                        : "Não definido";
                      const prazoPrincipal = processo.prazoPrincipal &&
                        DateUtils.isValid(processo.prazoPrincipal)
                        ? DateUtils.formatDate(processo.prazoPrincipal)
                        : "-";
                      const distribuicao = processo.dataDistribuicao &&
                        DateUtils.isValid(processo.dataDistribuicao)
                        ? DateUtils.formatDate(processo.dataDistribuicao)
                        : "-";

                      return (
                        <div
                          key={processo.id}
                          className="px-4 py-3 transition-colors hover:bg-default-50/80"
                        >
                          <div className="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1fr)_auto] md:items-center md:gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-semibold text-default-700">
                                  {processo.numero}
                                </p>
                                <Button
                                  isIconOnly
                                  aria-label="Copiar número do processo"
                                  className="min-w-6 h-6 w-6"
                                  size="sm"
                                  variant="light"
                                  onPress={() =>
                                    copiarNumeroProcesso(processo.numero)
                                  }
                                >
                                  <Copy className="h-3.5 w-3.5 text-default-400 hover:text-primary transition-colors" />
                                </Button>
                                {processo.segredoJustica ? (
                                  <Shield className="h-3.5 w-3.5 text-warning" />
                                ) : null}
                              </div>
                              {processo.numeroCnj ? (
                                <p className="mt-0.5 text-xs text-default-500">
                                  CNJ: {processo.numeroCnj}
                                </p>
                              ) : null}
                              {processo.titulo ? (
                                <p className="mt-1 text-xs text-default-500 line-clamp-1">
                                  {processo.titulo}
                                </p>
                              ) : null}
                              {isProcessoOrigemSincronizacaoExterna(processo) ? (
                                <div className="mt-1">
                                  <Chip color="warning" size="sm" variant="flat">
                                    Criado via sincronização
                                  </Chip>
                                </div>
                              ) : null}
                              <p className="mt-1 text-xs text-default-400">
                                {processo.area?.nome ?? "Área não informada"}
                                {processo.comarca ? ` • ${processo.comarca}` : ""}
                              </p>
                            </div>

                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-default-400 md:hidden">
                                Cliente
                              </p>
                              <div className="flex items-center gap-2">
                                {processo.cliente?.tipoPessoa === "JURIDICA" ? (
                                  <Building2 className="h-3.5 w-3.5 text-default-400" />
                                ) : (
                                  <User className="h-3.5 w-3.5 text-default-400" />
                                )}
                                <p className="truncate text-sm text-default-600">
                                  {processo.cliente?.nome ?? "Não informado"}
                                </p>
                              </div>
                            </div>

                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-default-400 md:hidden">
                                Advogado
                              </p>
                              <p className="truncate text-sm text-default-600">
                                {advogadoNome || "Não definido"}
                              </p>
                            </div>

                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-default-400 md:hidden">
                                Status
                              </p>
                              <Chip
                                color={getStatusColor(processo.status)}
                                size="sm"
                                startContent={getStatusIcon(processo.status)}
                                variant="flat"
                              >
                                {getStatusLabel(processo.status)}
                              </Chip>
                            </div>

                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-default-400 md:hidden">
                                Prazos
                              </p>
                              <p className="text-xs text-default-500">
                                Prazo: {prazoPrincipal}
                              </p>
                              <p className="text-xs text-default-400">
                                Distrib.: {distribuicao}
                              </p>
                              {processo.valorCausa !== null &&
                              processo.valorCausa !== undefined &&
                              !isNaN(Number(processo.valorCausa)) &&
                              Number(processo.valorCausa) > 0 ? (
                                <p className="text-xs font-medium text-success-600">
                                  R${" "}
                                  {Number(processo.valorCausa).toLocaleString(
                                    "pt-BR",
                                    { minimumFractionDigits: 2 },
                                  )}
                                </p>
                              ) : null}
                            </div>

                            <div className="flex items-center justify-between gap-2 md:justify-end">
                              <div className="flex gap-2">
                                <Chip size="sm" variant="flat">
                                  {processo._count.documentos} docs
                                </Chip>
                                <Chip size="sm" variant="flat">
                                  {processo._count.eventos} eventos
                                </Chip>
                              </div>
                              <Button
                                as={Link}
                                color="primary"
                                href={`/processos/${processo.id}`}
                                size="sm"
                                startContent={<Eye className="h-3.5 w-3.5" />}
                                variant="flat"
                              >
                                Abrir
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardBody>
              </Card>
            )}
            {totalPaginas > 1 && (
              <div className="flex justify-center">
                <Pagination
                  showControls
                  showShadow
                  page={paginaAtual}
                  total={totalPaginas}
                  onChange={setPaginaAtual}
                />
              </div>
            )}
          </>
        )}
      </div>
      <ProcessosImportModal
        isOpen={mostrarModalImportacao}
        onClose={() => setMostrarModalImportacao(false)}
        onImported={() => refreshProcessos()}
      />
      <ProcessosSyncOabModal
        isOpen={mostrarModalSincronizacaoOab}
        onClose={() => setMostrarModalSincronizacaoOab(false)}
        onSynced={() => refreshProcessos()}
      />
    </div>
  );
}
