"use client";

import type { Selection } from "@react-types/shared";
import type { ProcuracaoListItem } from "@/app/actions/procuracoes";
import type { Processo as ProcessoDTO } from "@/app/actions/processos";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import {
  Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, } from "@heroui/dropdown";
import { Input } from "@heroui/input";

import { Spinner } from "@heroui/spinner";
import {
  AlertCircle,
  Plus,
  Search,
  MoreVertical,
  Eye,
  FileText,
  User,
  Building2,
  Calendar,
  Download,
  Link2,
  Paperclip,
  Filter,
  CheckCircle2,
  Clock3,
  ShieldCheck,
} from "lucide-react";
import { toast } from "@/lib/toast";

import { useUserPermissions } from "@/app/hooks/use-user-permissions";
import { useProcuracoesPaginated } from "@/app/hooks/use-procuracoes";
import { useClientesParaSelect } from "@/app/hooks/use-clientes";
import { useProcessosCliente } from "@/app/hooks/use-processos";
import { DateUtils } from "@/app/lib/date-utils";
import { linkProcuracaoAoProcesso } from "@/app/actions/processos";
import { generateProcuracaoPdf } from "@/app/actions/procuracoes";
import { ProcuracaoEmitidaPor, ProcuracaoStatus } from "@/generated/prisma";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
} from "@heroui/react";
import { Pagination } from "@heroui/pagination";
import { PeoplePageHeader, PeopleMetricCard, PeopleEntityCard, PeopleEntityCardHeader, PeopleEntityCardBody } from "@/components/people-ui";
import { SearchableSelect } from "@/components/searchable-select";

type ProcuracaoFiltroValue<T extends string> = T | "";

interface ProcuracaoFiltros {
  search: string;
  status: ProcuracaoFiltroValue<ProcuracaoStatus>;
  clienteId: string;
  advogadoId: string;
  emitidaPor: ProcuracaoFiltroValue<ProcuracaoEmitidaPor>;
}

const ALL_STATUS_FILTER_KEY = "__ALL_STATUS_FILTER__";
const ALL_EMITIDA_FILTER_KEY = "__ALL_EMITIDA_FILTER__";
const ALL_CLIENTE_FILTER_KEY = "__ALL_CLIENTE_FILTER__";
const PAGE_SIZE = 12;

export function ProcuracoesContent() {
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(1);
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null);

  const [filtros, setFiltros] = useState<ProcuracaoFiltros>({
    search: "",
    status: "",
    clienteId: "",
    advogadoId: "",
    emitidaPor: "",
  });

  const {
    procuracoes,
    metrics: paginatedMetrics,
    pagination,
    isLoading,
    isError,
    error,
    mutate: mutateProcuracoes,
  } = useProcuracoesPaginated({
    page: currentPage,
    pageSize: PAGE_SIZE,
    filtros,
  });
  const permissions = useUserPermissions();
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [selectedProcuracao, setSelectedProcuracao] =
    useState<ProcuracaoListItem | null>(null);
  const [selectedProcessoId, setSelectedProcessoId] = useState<string>("");
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [clienteNovaProcuracaoId, setClienteNovaProcuracaoId] =
    useState<string>("");
  const [processosNovaProcuracaoIds, setProcessosNovaProcuracaoIds] = useState<
    Set<string>
  >(new Set());
  const [isLinking, startTransition] = useTransition();
  const procuracoesList = procuracoes ?? [];

  const { clientes, isLoading: isLoadingClientes } = useClientesParaSelect();

  const {
    processos: processosClienteSelecionado,
    isLoading: isLoadingProcessosSelecionado,
    mutate: mutateProcessosCliente,
  } = useProcessosCliente(selectedProcuracao?.cliente?.id ?? null);

  const {
    processos: processosParaNovaProcuracao,
    isLoading: isLoadingProcessosNovaProcuracao,
  } = useProcessosCliente(clienteNovaProcuracaoId || null);

  const clienteNovaProcuracaoKeySet = useMemo(
    () => new Set(clientes.map((cliente) => cliente.id)),
    [clientes],
  );
  const selectedClienteNovaProcuracaoKeys = useMemo(() => {
    if (
      !clienteNovaProcuracaoId ||
      !clienteNovaProcuracaoKeySet.has(clienteNovaProcuracaoId)
    ) {
      return new Set<string>();
    }

    return new Set([clienteNovaProcuracaoId]);
  }, [clienteNovaProcuracaoId, clienteNovaProcuracaoKeySet]);

  const processosNovaProcuracaoKeySet = useMemo(
    () =>
      new Set((processosParaNovaProcuracao ?? []).map((processo) => processo.id)),
    [processosParaNovaProcuracao],
  );
  const selectedProcessosNovaProcuracaoKeys = useMemo(
    () =>
      new Set(
        Array.from(processosNovaProcuracaoIds).filter((processoId) =>
          processosNovaProcuracaoKeySet.has(processoId),
        ),
      ),
    [processosNovaProcuracaoIds, processosNovaProcuracaoKeySet],
  );

  const processosDisponiveis = useMemo<ProcessoDTO[]>(() => {
    const vinculados = new Set(
      (selectedProcuracao?.processos || []).map(
        (procuracaoProcesso) => procuracaoProcesso.processoId,
      ),
    );

    return (processosClienteSelecionado ?? []).filter(
      (processo) => !vinculados.has(processo.id),
    );
  }, [processosClienteSelecionado, selectedProcuracao]);
  const processosDisponiveisKeySet = useMemo(
    () => new Set(processosDisponiveis.map((processo) => processo.id)),
    [processosDisponiveis],
  );
  const selectedProcessoDisponivelKeys = useMemo(() => {
    if (!selectedProcessoId || !processosDisponiveisKeySet.has(selectedProcessoId)) {
      return new Set<string>();
    }

    return new Set([selectedProcessoId]);
  }, [selectedProcessoId, processosDisponiveisKeySet]);

  const procuracoesFiltradas = procuracoesList;

  const limparFiltros = () => {
    setCurrentPage(1);
    setFiltros({
      search: "",
      status: "",
      clienteId: "",
      advogadoId: "",
      emitidaPor: "",
    });
  };

  const openLinkModal = (procuracao: ProcuracaoListItem) => {
    setSelectedProcuracao(procuracao);
    setSelectedProcessoId("");
    setIsLinkModalOpen(true);
  };

  const closeLinkModal = () => {
    setIsLinkModalOpen(false);
    setSelectedProcessoId("");
    setSelectedProcuracao(null);
  };

  const handleLinkProcuracao = () => {
    if (!selectedProcuracao || !selectedProcessoId) return;

    startTransition(async () => {
      const result = await linkProcuracaoAoProcesso(
        selectedProcessoId,
        selectedProcuracao.id,
      );

      if (result.success) {
        toast.success("Procuração vinculada ao processo");
        closeLinkModal();
        await Promise.all([mutateProcuracoes(), mutateProcessosCliente?.()]);
      } else {
        toast.error(result.error || "Falha ao vincular procuração");
      }
    });
  };

  const temFiltrosAtivos = Object.values(filtros).some((valor) => valor !== "");
  const filtrosAtivosCount = useMemo(
    () => Object.values(filtros).filter((valor) => valor !== "").length,
    [filtros],
  );

  const statusFilterItems = useMemo(
    () => [
      { key: ALL_STATUS_FILTER_KEY, label: "Todos os status" },
      ...Object.values(ProcuracaoStatus).map((status) => ({
        key: status,
        label: getStatusLabel(status),
      })),
    ],
    [],
  );

  const emitidaFilterItems = useMemo(
    () => [
      { key: ALL_EMITIDA_FILTER_KEY, label: "Todas as origens" },
      ...Object.values(ProcuracaoEmitidaPor).map((emitidaPor) => ({
        key: emitidaPor,
        label: getEmitidaPorLabel(emitidaPor),
      })),
    ],
    [],
  );

  const clienteFilterItems = useMemo(
    () => [
      { key: ALL_CLIENTE_FILTER_KEY, label: "Todos os clientes" },
      ...clientes.map((cliente) => ({ key: cliente.id, label: cliente.nome })),
    ],
    [clientes],
  );
  const clienteFilterKeySet = useMemo(
    () => new Set(clienteFilterItems.map((item) => item.key)),
    [clienteFilterItems],
  );
  const selectedClienteFilterKey = clienteFilterKeySet.has(filtros.clienteId)
    ? filtros.clienteId
    : ALL_CLIENTE_FILTER_KEY;
  const clienteFilterOptions = useMemo(
    () =>
      clienteFilterItems.map((item) => {
        const cliente = clientes.find((entry) => entry.id === item.key);

        return {
          key: item.key,
          label: item.label,
          textValue: [item.label, cliente?.documento || "", cliente?.email || ""]
            .filter(Boolean)
            .join(" "),
          description:
            item.key === ALL_CLIENTE_FILTER_KEY
              ? "Remove o filtro de cliente"
              : cliente?.documento || cliente?.email || undefined,
        };
      }),
    [clienteFilterItems, clientes],
  );
  const clienteNovaProcuracaoOptions = useMemo(
    () =>
      clientes.map((cliente) => ({
        key: cliente.id,
        label: cliente.nome,
        textValue: [cliente.nome, cliente.documento || "", cliente.email || ""]
          .filter(Boolean)
          .join(" "),
        description: cliente.documento || cliente.email || undefined,
      })),
    [clientes],
  );
  const processoDisponivelOptions = useMemo(
    () =>
      processosDisponiveis.map((processo) => ({
        key: processo.id,
        label: processo.numero,
        textValue: processo.titulo
          ? `${processo.numero} - ${processo.titulo}`
          : processo.numero,
        description: processo.titulo || undefined,
      })),
    [processosDisponiveis],
  );

  const metrics = useMemo(() => {
    return (
      paginatedMetrics ?? {
        total: 0,
        vigentes: 0,
        pendentesAssinatura: 0,
        encerradas: 0,
        comProcessos: 0,
        emitidasPeloEscritorio: 0,
      }
    );
  }, [paginatedMetrics]);

  useEffect(() => {
    if (pagination && pagination.page !== currentPage) {
      setCurrentPage(pagination.page);
    }
  }, [pagination, currentPage]);

  const resetNovaProcuracaoState = () => {
    setClienteNovaProcuracaoId("");
    setProcessosNovaProcuracaoIds(new Set());
  };

  const openCreateModal = () => {
    resetNovaProcuracaoState();
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    resetNovaProcuracaoState();
  };

  const handleProcessoSelectionChange = (keys: Selection) => {
    if (keys === "all") {
      const todosProcessos =
        processosParaNovaProcuracao?.map((processo) => processo.id) ?? [];

      setProcessosNovaProcuracaoIds(new Set(todosProcessos));

      return;
    }

    setProcessosNovaProcuracaoIds(new Set(Array.from(keys).map(String)));
  };

  const handleCreateProcuracao = () => {
    if (!clienteNovaProcuracaoId) return;

    const params = new URLSearchParams();

    params.set("clienteId", clienteNovaProcuracaoId);

    if (processosNovaProcuracaoIds.size > 0) {
      params.set(
        "processoIds",
        Array.from(processosNovaProcuracaoIds).join(","),
      );
    }

    closeCreateModal();
    router.push(`/procuracoes/novo?${params.toString()}`);
  };

  const handleDownloadProcuracaoPdf = async (procuracao: ProcuracaoListItem) => {
    if (procuracao.arquivoUrl) {
      window.open(procuracao.arquivoUrl, "_blank", "noopener,noreferrer");
      return;
    }

    setDownloadingPdfId(procuracao.id);

    try {
      const result = await generateProcuracaoPdf(procuracao.id);

      if (!result.success || !result.data) {
        toast.error(result.error || "Erro ao gerar PDF");
        return;
      }

      const binary = atob(result.data);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download =
        result.fileName || `procuracao-${procuracao.numero || procuracao.id}.pdf`;
      document.body.append(link);
      link.click();
      link.remove();

      URL.revokeObjectURL(url);
      toast.success("PDF gerado com sucesso");
    } catch (error) {
      toast.error("Erro ao gerar PDF");
    } finally {
      setDownloadingPdfId(null);
    }
  };

  function getStatusColor(status: ProcuracaoStatus) {
    switch (status) {
      case ProcuracaoStatus.VIGENTE:
        return "success";
      case ProcuracaoStatus.RASCUNHO:
        return "default";
      case ProcuracaoStatus.PENDENTE_ASSINATURA:
        return "warning";
      case ProcuracaoStatus.REVOGADA:
        return "danger";
      case ProcuracaoStatus.EXPIRADA:
        return "secondary";
      default:
        return "default";
    }
  }

  function getStatusLabel(status: ProcuracaoStatus) {
    switch (status) {
      case ProcuracaoStatus.VIGENTE:
        return "Vigente";
      case ProcuracaoStatus.RASCUNHO:
        return "Rascunho";
      case ProcuracaoStatus.PENDENTE_ASSINATURA:
        return "Pendente Assinatura";
      case ProcuracaoStatus.REVOGADA:
        return "Revogada";
      case ProcuracaoStatus.EXPIRADA:
        return "Expirada";
      default:
        return status;
    }
  }

  function getEmitidaPorLabel(emitidaPor: ProcuracaoEmitidaPor) {
    switch (emitidaPor) {
      case ProcuracaoEmitidaPor.ESCRITORIO:
        return "Escritório";
      case ProcuracaoEmitidaPor.ADVOGADO:
        return "Advogado";
      default:
        return emitidaPor;
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <AlertCircle className="h-12 w-12 text-danger" />
        <p className="text-danger">Erro ao carregar procurações</p>
        <p className="text-small text-default-500">{error?.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PeoplePageHeader
        actions={
          <>
            <Button
              size="sm"
              startContent={<Filter className="h-4 w-4" />}
              variant="bordered"
              onPress={() => setMostrarFiltros(!mostrarFiltros)}
            >
              {mostrarFiltros ? "Ocultar filtros" : "Filtros"}
            </Button>
            {!permissions.isCliente ? (
              <Button
                className="bg-primary text-primary-foreground"
                size="sm"
                startContent={<Plus className="h-4 w-4" />}
                onPress={openCreateModal}
              >
                Nova procuração
              </Button>
            ) : null}
          </>
        }
        description={`${procuracoesFiltradas.length} de ${pagination?.total ?? 0} procurações${temFiltrosAtivos ? " com filtros aplicados" : ""}.`}
        tag="Atividades jurídicas"
        title="Procurações"
      />

      <div className="flex flex-wrap gap-2">
        <Button color="primary" size="sm" variant="flat">
          Procurações
        </Button>
        <Button
          as={Link}
          href="/modelos-procuracao"
          size="sm"
          variant="bordered"
        >
          Modelos de Procuração
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PeopleMetricCard
          helper="Procurações cadastradas"
          icon={<FileText className="h-4 w-4" />}
          label="Total de procurações"
          tone="primary"
          value={metrics.total}
        />
        <PeopleMetricCard
          helper="Em situação válida"
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Vigentes"
          tone="success"
          value={metrics.vigentes}
        />
        <PeopleMetricCard
          helper="Aguardando assinatura"
          icon={<Clock3 className="h-4 w-4" />}
          label="Pendentes"
          tone="warning"
          value={metrics.pendentesAssinatura}
        />
        <PeopleMetricCard
          helper="Revogadas ou expiradas"
          icon={<AlertCircle className="h-4 w-4" />}
          label="Encerradas"
          tone="danger"
          value={metrics.encerradas}
        />
        <PeopleMetricCard
          helper="Com processo vinculado"
          icon={<Link2 className="h-4 w-4" />}
          label="Com processos"
          tone="secondary"
          value={metrics.comProcessos}
        />
        <PeopleMetricCard
          helper="Origem do escritório"
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Emitidas pelo escritório"
          tone="default"
          value={metrics.emitidasPeloEscritorio}
        />
      </div>

      {/* Filtros */}
      {mostrarFiltros && (
        <Card className="border border-divider/70 bg-content1/75 shadow-sm backdrop-blur-md">
          <CardHeader className="border-b border-divider/70 px-4 py-4 sm:px-6">
            <div className="flex w-full flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-start gap-3 sm:items-center">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                  <Filter className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground sm:text-lg">
                    Filtros operacionais
                  </h3>
                  <p className="text-xs text-default-500 sm:text-sm">
                    Refine por número, cliente, status e origem da procuração.
                  </p>
                </div>
              </div>
              {temFiltrosAtivos ? (
                <Chip className="font-semibold" color="primary" size="sm" variant="flat">
                  {filtrosAtivosCount} filtro(s) ativo(s)
                </Chip>
              ) : null}
            </div>
          </CardHeader>
          <CardBody className="space-y-4 p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Input
                classNames={{
                  inputWrapper:
                    "border border-divider/80 bg-background/80 hover:bg-background/90",
                }}
                placeholder="Buscar por número ou cliente..."
                startContent={<Search className="h-4 w-4 text-default-400" />}
                value={filtros.search}
                onValueChange={(value) => {
                  setCurrentPage(1);
                  setFiltros((prev) => ({ ...prev, search: value }));
                }}
              />

              <Select
                items={statusFilterItems}
                placeholder="Status"
                selectedKeys={[filtros.status || ALL_STATUS_FILTER_KEY]}
                onSelectionChange={(keys) => {
                  const [key] = Array.from(keys);

                  setFiltros((prev) => ({
                    ...prev,
                    status:
                      key === ALL_STATUS_FILTER_KEY
                        ? ""
                        : ((key as ProcuracaoStatus | undefined) ?? ""),
                  }));
                  setCurrentPage(1);
                }}
              >
                {(item) => (
                  <SelectItem key={item.key} textValue={item.label}>
                    {item.label}
                  </SelectItem>
                )}
              </Select>

              <Select
                items={emitidaFilterItems}
                placeholder="Emitida por"
                selectedKeys={[filtros.emitidaPor || ALL_EMITIDA_FILTER_KEY]}
                onSelectionChange={(keys) => {
                  const [key] = Array.from(keys);

                  setFiltros((prev) => ({
                    ...prev,
                    emitidaPor:
                      key === ALL_EMITIDA_FILTER_KEY
                        ? ""
                        : ((key as ProcuracaoEmitidaPor | undefined) ?? ""),
                  }));
                  setCurrentPage(1);
                }}
              >
                {(item) => (
                  <SelectItem key={item.key} textValue={item.label}>
                    {item.label}
                  </SelectItem>
                )}
              </Select>

              <SearchableSelect
                emptyContent="Nenhum cliente encontrado"
                isClearable={false}
                items={clienteFilterOptions}
                placeholder="Cliente"
                selectedKey={selectedClienteFilterKey}
                onSelectionChange={(key) => {
                  setFiltros((prev) => ({
                    ...prev,
                    clienteId:
                      key === ALL_CLIENTE_FILTER_KEY
                        ? ""
                        : ((key as string | undefined) ?? ""),
                  }));
                  setCurrentPage(1);
                }}
              />
            </div>

            {temFiltrosAtivos ? (
              <div className="flex justify-end">
                <Button size="sm" variant="light" onPress={limparFiltros}>
                  Limpar Filtros
                </Button>
              </div>
            ) : null}
          </CardBody>
        </Card>
      )}

      {/* Lista de Procurações */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {procuracoesFiltradas.map((procuracao) => (
          <PeopleEntityCard
            key={procuracao.id}
            className="h-full"
            isPressable
            onPress={() => router.push(`/procuracoes/${procuracao.id}`)}
          >
            <PeopleEntityCardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="flex items-center space-x-2">
                <FileText className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">
                  {procuracao.numero || "Sem número"}
                </span>
              </div>

              <Dropdown>
                <DropdownTrigger>
                  <Button isIconOnly size="sm" variant="light">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownTrigger>
                <DropdownMenu>
                  <DropdownItem
                    key="view"
                    startContent={<Eye className="h-4 w-4" />}
                    onPress={() => router.push(`/procuracoes/${procuracao.id}`)}
                  >
                    Ver Detalhes
                  </DropdownItem>
                  {!permissions.isCliente ? (
                    <DropdownItem
                      key="link"
                      startContent={<Link2 className="h-4 w-4" />}
                      onPress={() => openLinkModal(procuracao)}
                    >
                      Vincular a Processo
                    </DropdownItem>
                  ) : null}
                  {!permissions.isCliente ? (
                    <DropdownItem
                      key="documents"
                      startContent={<Paperclip className="h-4 w-4" />}
                      onPress={() =>
                        router.push(`/procuracoes/${procuracao.id}#documentos`)
                      }
                    >
                      Anexar Documentos
                    </DropdownItem>
                  ) : null}
                  <DropdownItem
                    key="download"
                    isDisabled={downloadingPdfId === procuracao.id}
                    startContent={<Download className="h-4 w-4" />}
                    onPress={() => handleDownloadProcuracaoPdf(procuracao)}
                  >
                    {downloadingPdfId === procuracao.id
                      ? "Gerando PDF..."
                      : "Baixar PDF"}
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
            </PeopleEntityCardHeader>

            <PeopleEntityCardBody className="space-y-3">
              <div className="flex items-center space-x-2">
                {procuracao.cliente.tipoPessoa === "FISICA" ? (
                  <User className="h-4 w-4 text-default-400" />
                ) : (
                  <Building2 className="h-4 w-4 text-default-400" />
                )}
                <span className="text-sm font-medium">
                  {procuracao.cliente.nome}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <Chip
                  color={getStatusColor(procuracao.status)}
                  size="sm"
                  variant="flat"
                >
                  {getStatusLabel(procuracao.status)}
                </Chip>

                <Chip size="sm" variant="bordered">
                  {getEmitidaPorLabel(procuracao.emitidaPor)}
                </Chip>
              </div>

              {procuracao.emitidaEm && (
                <div className="flex items-center space-x-2 text-small text-default-500">
                  <Calendar className="h-3 w-3" />
                  <span>
                    Emitida em {DateUtils.formatDate(procuracao.emitidaEm)}
                  </span>
                </div>
              )}

              {procuracao.validaAte && (
                <div className="flex items-center space-x-2 text-small text-default-500">
                  <Calendar className="h-3 w-3" />
                  <span>
                    Válida até {DateUtils.formatDate(procuracao.validaAte)}
                  </span>
                </div>
              )}

              {procuracao.outorgados && procuracao.outorgados.length > 0 && (
                <div className="text-small text-default-500">
                  <span className="font-medium">Advogados:</span>{" "}
                  {procuracao.outorgados
                    .map(
                      (outorgado) =>
                        `${outorgado.advogado.usuario.firstName} ${outorgado.advogado.usuario.lastName}`,
                    )
                    .join(", ")}
                </div>
              )}
            </PeopleEntityCardBody>
          </PeopleEntityCard>
        ))}
      </div>

      {pagination && pagination.totalPages > 1 ? (
        <div className="flex justify-center">
          <Pagination
            isCompact
            page={pagination.page}
            showControls
            size="sm"
            total={pagination.totalPages}
            onChange={setCurrentPage}
          />
        </div>
      ) : null}

      {procuracoesFiltradas.length === 0 ? (
        <Card className="border border-white/10 bg-background/60">
          <CardBody className="flex min-h-[180px] flex-col items-center justify-center gap-3 text-center">
            <Search className="h-8 w-8 text-default-400" />
            <p className="text-default-500">
              {temFiltrosAtivos
                ? "Nenhuma procuração encontrada com os filtros aplicados."
                : "Nenhuma procuração cadastrada até o momento."}
            </p>
            {temFiltrosAtivos ? (
              <Button size="sm" variant="light" onPress={limparFiltros}>
                Limpar filtros
              </Button>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      <Modal
        isOpen={isCreateModalOpen}
        size="lg"
        onOpenChange={(open) => {
          if (!open) {
            closeCreateModal();
          } else {
            setIsCreateModalOpen(true);
          }
        }}
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold">Nova Procuração</h3>
                <p className="text-sm text-default-500">
                  Selecione o cliente e processos que serão vinculados ao criar
                  a procuração.
                </p>
              </ModalHeader>
              <ModalBody>
                {isLoadingClientes ? (
                  <div className="flex justify-center py-6">
                    <Spinner label="Carregando clientes..." size="lg" />
                  </div>
                ) : clientes.length === 0 ? (
                  <p className="text-sm text-default-500">
                    Nenhum cliente disponível para seleção.
                  </p>
                ) : (
                  <div className="space-y-4">
                    <SearchableSelect
                      emptyContent="Nenhum cliente encontrado"
                      items={clienteNovaProcuracaoOptions}
                      label="Cliente"
                      placeholder="Selecione o cliente"
                      popoverProps={{
                        classNames: {
                          base: "z-[10000]",
                          content: "z-[10000]",
                        },
                      }}
                      selectedKey={
                        clienteNovaProcuracaoKeySet.has(clienteNovaProcuracaoId)
                          ? clienteNovaProcuracaoId
                          : null
                      }
                      onSelectionChange={(key) => {
                        const novoClienteId = key ?? "";

                        setClienteNovaProcuracaoId(novoClienteId);
                        setProcessosNovaProcuracaoIds(new Set());
                      }}
                    />

                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase text-default-400">
                        Vincular a processos
                      </p>

                      {!clienteNovaProcuracaoId ? (
                        <p className="text-sm text-default-500">
                          Selecione um cliente para listar processos
                          disponíveis.
                        </p>
                      ) : isLoadingProcessosNovaProcuracao ? (
                        <div className="flex justify-center py-4">
                          <Spinner label="Carregando processos..." size="md" />
                        </div>
                      ) : !processosParaNovaProcuracao ||
                        processosParaNovaProcuracao.length === 0 ? (
                        <p className="text-sm text-default-500">
                          Este cliente não possui processos cadastrados.
                        </p>
                      ) : (
                        <Select
                          placeholder="Selecione os processos (opcional)"
                          popoverProps={{
                            classNames: {
                              base: "z-[10000]",
                              content: "z-[10000]",
                            },
                          }}
                          selectedKeys={selectedProcessosNovaProcuracaoKeys}
                          selectionMode="multiple"
                          onSelectionChange={handleProcessoSelectionChange}
                        >
                          {processosParaNovaProcuracao.map((processo) => {
                            const processoTextValue = processo.titulo
                              ? `${processo.numero} - ${processo.titulo}`
                              : processo.numero;

                            return (
                              <SelectItem key={processo.id} textValue={processoTextValue}>
                              <div className="flex flex-col">
                                <span className="text-sm font-semibold text-default-700">
                                  {processo.numero}
                                </span>
                                {processo.titulo && (
                                  <span className="text-xs text-default-400">
                                    {processo.titulo}
                                  </span>
                                )}
                              </div>
                              </SelectItem>
                            );
                          })}
                        </Select>
                      )}
                    </div>
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={closeCreateModal}>
                  Cancelar
                </Button>
                <Button
                  variant="flat"
                  onPress={() => {
                    closeCreateModal();
                    router.push("/procuracoes/novo");
                  }}
                >
                  Abrir formulário em branco
                </Button>
                <Button
                  color="primary"
                  isDisabled={!clienteNovaProcuracaoId}
                  onPress={handleCreateProcuracao}
                >
                  Continuar
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <Modal
        isOpen={isLinkModalOpen}
        size="md"
        onOpenChange={(open) => {
          if (!open) {
            closeLinkModal();
          } else {
            setIsLinkModalOpen(true);
          }
        }}
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold">Vincular Procuração</h3>
                {selectedProcuracao && (
                  <p className="text-sm text-default-500">
                    {selectedProcuracao.numero || "Sem número"} •{" "}
                    {selectedProcuracao.cliente?.nome}
                  </p>
                )}
              </ModalHeader>
              <ModalBody>
                {isLoadingProcessosSelecionado ? (
                  <div className="flex justify-center py-8">
                    <Spinner label="Carregando processos..." size="lg" />
                  </div>
                ) : processosDisponiveis.length === 0 ? (
                  <p className="text-sm text-default-500">
                    Nenhum processo disponível para este cliente.
                  </p>
                ) : (
                  <SearchableSelect
                    emptyContent="Nenhum processo encontrado"
                    items={processoDisponivelOptions}
                    label="Processo"
                    placeholder="Selecione o processo"
                    popoverProps={{
                      classNames: {
                        base: "z-[10000]",
                        content: "z-[10000]",
                      },
                    }}
                    selectedKey={
                      processosDisponiveisKeySet.has(selectedProcessoId)
                        ? selectedProcessoId
                        : null
                    }
                    onSelectionChange={(key) => {
                      setSelectedProcessoId(key ?? "");
                    }}
                  />
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={closeLinkModal}>
                  Cancelar
                </Button>
                <Button
                  color="primary"
                  isDisabled={
                    !selectedProcessoId || processosDisponiveis.length === 0
                  }
                  isLoading={isLinking}
                  onPress={handleLinkProcuracao}
                >
                  Vincular
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
