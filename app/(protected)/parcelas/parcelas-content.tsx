"use client";

import { useMemo, useState } from "react";
import {
  Card, CardBody, CardHeader, Button, Input, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Chip, Spinner, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Textarea, Tabs, Tab, Switch, Select, SelectItem } from "@heroui/react";
import {
  PlusIcon,
  EyeIcon,
  PencilIcon,
  TrashIcon,
  ReceiptIcon,
  CalendarIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
  RefreshCwIcon,
  TrendingUpIcon,
  DollarSignIcon,
  FileTextIcon,
  CreditCardIcon,
  ArrowUpDownIcon,
  ShieldIcon,
  ChevronDownIcon,
  SettingsIcon,
  CalendarDaysIcon,
  HashIcon,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { motion, AnimatePresence } from "motion/react";

import {
  useParcelasContrato,
  useDashboardParcelas,
  useStatusParcelas,
  useProcessosComParcelas,
} from "@/app/hooks/use-parcelas-contrato";
import { useContratosComParcelas } from "@/app/hooks/use-contratos";
import {
  createParcelaContrato,
  updateParcelaContrato,
  deleteParcelaContrato,
  gerarParcelasAutomaticamente,
} from "@/app/actions/parcelas-contrato";
import { PeopleMetricCard, PeoplePageHeader } from "@/components/people-ui";
import { SearchableSelect } from "@/components/searchable-select";
import { DadosBancariosParcela } from "@/components/dados-bancarios-parcela";
// import { ComprovantePagamentoUpload } from "@/components/comprovante-pagamento-upload";
import { ValidacaoContaPrincipal } from "@/components/validacao-conta-principal";
import { DateInput } from "@/components/ui/date-input";
import { DateRangeInput } from "@/components/ui/date-range-input";
import {
  ContratoParcela,
  ContratoParcelaStatus,
  Contrato,
  Cliente,
  Advogado,
  Usuario,
} from "@/generated/prisma";

interface ProcessoComParcelas {
  id: string;
  numero: string;
  titulo: string;
  _count: {
    contratos: number;
  };
}

interface ParcelaFormData {
  contratoId: string;
  numeroParcela: number;
  titulo?: string;
  descricao?: string;
  valor: number;
  dataVencimento: Date;
  status: ContratoParcelaStatus;
  formaPagamento?: string;
  dataPagamento?: Date;
}


type ParcelaComContrato = ContratoParcela & {
  contrato: Contrato & {
    cliente: Cliente;
    advogadoResponsavel?: Advogado & {
      usuario: Usuario;
    };
  };
};

export default function ParcelasContratoPage() {
  // Estados
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<{
    contratoId?: string;
    status?: ContratoParcelaStatus;
    processoId?: string;
    valorMinimo?: number;
    valorMaximo?: number;
    dataVencimentoInicio?: Date;
    dataVencimentoFim?: Date;
    formaPagamento?: string;
    apenasVencidas?: boolean;
  }>({});
  const [contaValida, setContaValida] = useState<boolean | null>(null);
  const [filtrosAvancados, setFiltrosAvancados] = useState(false);

  // Formulário
  const [formData, setFormData] = useState<ParcelaFormData>({
    contratoId: "",
    numeroParcela: 1,
    titulo: "",
    descricao: "",
    valor: 0,
    dataVencimento: new Date(),
    status: "PENDENTE",
    formaPagamento: "",
    dataPagamento: undefined,
  });

  // Hooks
  const { parcelas, isLoading, mutate } = useParcelasContrato(filters);
  const { dashboard, isLoading: loadingDashboard } = useDashboardParcelas();
  const { status: statusList } = useStatusParcelas();
  const { contratos, isLoading: loadingContratos } = useContratosComParcelas();
  const { processos, isLoading: loadingProcessos } = useProcessosComParcelas();

  // Funções auxiliares
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formasPagamento = [
    { key: "PIX", label: "PIX" },
    { key: "DINHEIRO", label: "Dinheiro" },
    { key: "CARTAO", label: "Cartão" },
  ];
  const processoOptions = useMemo(
    () =>
      (processos || []).map((processo: ProcessoComParcelas) => ({
        key: processo.id,
        label: processo.numero,
        textValue: [processo.numero, processo.titulo || ""]
          .filter(Boolean)
          .join(" "),
        description: processo.titulo || undefined,
      })),
    [processos],
  );
  const contratoOptions = useMemo(
    () =>
      (contratos || []).map((contrato) => ({
        key: contrato.id,
        label: contrato.titulo,
        textValue: [
          contrato.titulo,
          contrato.cliente.nome,
          formatCurrency(contrato.valorDisponivel),
        ]
          .filter(Boolean)
          .join(" "),
        description: `${contrato.cliente.nome} - ${formatCurrency(
          contrato.valorDisponivel,
        )} disponível`,
      })),
    [contratos],
  );

  const handleLimparFiltros = () => {
    setFilters({});
    setFiltrosAvancados(false);
  };

  // Funções
  const handleContratoChange = (contratoId: string) => {
    const contratoSelecionado = contratos?.find((c) => c.id === contratoId);

    if (contratoSelecionado) {
      setFormData({
        ...formData,
        contratoId,
        valor: contratoSelecionado.valorDisponivel || 0,
      });
    } else {
      setFormData({
        ...formData,
        contratoId,
        valor: 0,
      });
    }
  };

  const getContratoSelecionado = () => {
    return contratos?.find((c) => c.id === formData.contratoId);
  };

  const handleOpenModal = (parcela?: ParcelaComContrato) => {
    if (parcela) {
      setEditingId(parcela.id);
      setFormData({
        contratoId: parcela.contratoId,
        numeroParcela: parcela.numeroParcela,
        titulo: parcela.titulo || "",
        descricao: parcela.descricao || "",
        valor: Number(parcela.valor),
        dataVencimento: new Date(parcela.dataVencimento),
        status: parcela.status,
        formaPagamento: parcela.formaPagamento || "",
        dataPagamento: parcela.dataPagamento
          ? new Date(parcela.dataPagamento)
          : undefined,
      });
    } else {
      setEditingId(null);
      setFormData({
        contratoId: "",
        numeroParcela: 1,
        titulo: "",
        descricao: "",
        valor: 0,
        dataVencimento: new Date(),
        status: "PENDENTE",
        formaPagamento: "",
        dataPagamento: undefined,
      });
    }
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setFormData({
      contratoId: "",
      numeroParcela: 1,
      titulo: "",
      descricao: "",
      valor: 0,
      dataVencimento: new Date(),
      status: "PENDENTE",
      formaPagamento: "",
      dataPagamento: undefined,
    });
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);

      // Validar campos obrigatórios
      if (!formData.contratoId) {
        toast.error("ID do contrato é obrigatório");

        return;
      }

      if (formData.valor <= 0) {
        toast.error("Valor deve ser maior que zero");

        return;
      }

      // Validar se o valor não excede o disponível no contrato
      const contratoSelecionado = getContratoSelecionado();

      if (
        contratoSelecionado &&
        formData.valor > contratoSelecionado.valorDisponivel
      ) {
        toast.error(
          `Valor da parcela (${formatCurrency(formData.valor)}) não pode ser maior que o valor disponível no contrato (${formatCurrency(contratoSelecionado.valorDisponivel)})`,
        );

        return;
      }

      let result;

      if (editingId) {
        result = await updateParcelaContrato(editingId, formData);
      } else {
        result = await createParcelaContrato(formData);
      }

      if (result.success) {
        toast.success(result.message || "Parcela salva com sucesso!");
        mutate();
        handleCloseModal();
      } else {
        toast.error(result.error || "Erro ao salvar parcela");
      }
    } catch (error) {
      toast.error("Erro inesperado ao salvar parcela");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setLoading(true);
      const result = await deleteParcelaContrato(id);

      if (result.success) {
        toast.success("Parcela removida com sucesso!");
        mutate();
      } else {
        toast.error(result.error || "Erro ao remover parcela");
      }
    } catch (error) {
      toast.error("Erro inesperado ao remover parcela");
    } finally {
      setLoading(false);
    }
  };

  const handleGerarAutomaticamente = async () => {
    try {
      setLoading(true);

      // Para demonstração, usar valores padrão
      const result = await gerarParcelasAutomaticamente(formData.contratoId, {
        valorTotal: formData.valor * 12, // 12 parcelas
        numeroParcelas: 12,
        dataPrimeiroVencimento: formData.dataVencimento,
        intervaloDias: 30,
        tituloBase: "Parcela",
      });

      if (result.success) {
        toast.success(result.message || "Parcelas geradas com sucesso!");
        mutate();
      } else {
        toast.error(result.error || "Erro ao gerar parcelas");
      }
    } catch (error) {
      toast.error("Erro inesperado ao gerar parcelas");
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: ContratoParcelaStatus) => {
    switch (status) {
      case "PENDENTE":
        return <ClockIcon size={16} />;
      case "PAGA":
        return <CheckCircleIcon size={16} />;
      case "ATRASADA":
        return <AlertTriangleIcon size={16} />;
      case "CANCELADA":
        return <XCircleIcon size={16} />;
      default:
        return <ClockIcon size={16} />;
    }
  };

  const getStatusColor = (status: ContratoParcelaStatus) => {
    switch (status) {
      case "PENDENTE":
        return "warning";
      case "PAGA":
        return "success";
      case "ATRASADA":
        return "danger";
      case "CANCELADA":
        return "default";
      default:
        return "default";
    }
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("pt-BR");
  };

  const isVencida = (
    dataVencimento: Date | string,
    status: ContratoParcelaStatus,
  ) => {
    return status === "PENDENTE" && new Date(dataVencimento) < new Date();
  };

  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-3 py-8 sm:px-6">
      <PeoplePageHeader
        tag="Financeiro"
        title="Parcelas de contrato"
        description="Controle parcelamento, vencimentos, atraso e pagamentos com visão operacional completa."
        actions={
          <Button
            color="primary"
            radius="full"
            startContent={<PlusIcon size={18} />}
            onPress={() => handleOpenModal()}
          >
            Nova parcela
          </Button>
        }
      />

      {/* Dashboard */}
      {loadingDashboard ? (
        <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
          <CardBody className="flex items-center justify-center py-12">
            <Spinner color="primary" size="lg" />
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <PeopleMetricCard
            helper="Total no contexto atual"
            icon={<ReceiptIcon className="h-4 w-4" />}
            label="Total de parcelas"
            tone="primary"
            value={dashboard?.totalParcelas || 0}
          />
          <PeopleMetricCard
            helper="Aguardando pagamento"
            icon={<ClockIcon className="h-4 w-4" />}
            label="Pendentes"
            tone="warning"
            value={dashboard?.parcelasPendentes || 0}
          />
          <PeopleMetricCard
            helper="Quitadas com sucesso"
            icon={<CheckCircleIcon className="h-4 w-4" />}
            label="Pagas"
            tone="success"
            value={dashboard?.parcelasPagas || 0}
          />
          <PeopleMetricCard
            helper="Exigem cobrança imediata"
            icon={<AlertTriangleIcon className="h-4 w-4" />}
            label="Atrasadas"
            tone="danger"
            value={dashboard?.parcelasAtrasadas || 0}
          />
        </div>
      )}

      <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
        <CardHeader className="pb-0">
          <div className="flex w-full flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Filtros operacionais
              </h2>
              <p className="text-sm text-default-500">
                Localize rapidamente parcelas por processo, status, período e
                forma de pagamento.
              </p>
            </div>
            <Button
              radius="full"
              size="sm"
              startContent={
                filtrosAvancados ? (
                  <ChevronDownIcon size={16} />
                ) : (
                  <SettingsIcon size={16} />
                )
              }
              variant="light"
              onPress={() => setFiltrosAvancados(!filtrosAvancados)}
            >
              {filtrosAvancados ? "Ocultar avançado" : "Mostrar avançado"}
            </Button>
          </div>
        </CardHeader>
        <CardBody className="pt-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SearchableSelect
              className="w-full"
              emptyContent="Nenhum processo encontrado"
              items={processoOptions}
              isLoading={loadingProcessos}
              label="Processo"
              placeholder="Todos os processos"
              selectedKey={filters.processoId ?? null}
              startContent={
                <FileTextIcon className="text-default-400" size={16} />
              }
              variant="bordered"
              onSelectionChange={(processoId) => {
                setFilters({ ...filters, processoId: processoId || undefined });
              }}
            />

            <Select
              className="w-full"
              label="Status"
              placeholder="Todos os status"
              selectedKeys={filters.status ? [filters.status] : []}
              startContent={
                <ArrowUpDownIcon className="text-default-400" size={16} />
              }
              variant="bordered"
              onSelectionChange={(keys) => {
                const status = Array.from(keys)[0] as ContratoParcelaStatus;
                setFilters({ ...filters, status: status || undefined });
              }}
            >
              {statusList.map((status) => (
                <SelectItem key={status.value} textValue={status.label}>
                  <div className="flex items-center gap-2">
                    <span>{status.icon}</span>
                    <span>{status.label}</span>
                  </div>
                </SelectItem>
              ))}
            </Select>

            <div className="flex items-center rounded-xl border border-white/10 bg-background/40 px-3">
              <Switch
                isSelected={filters.apenasVencidas || false}
                size="sm"
                onValueChange={(value) =>
                  setFilters({ ...filters, apenasVencidas: value })
                }
              >
                <div className="flex items-center gap-2 text-sm">
                  <AlertTriangleIcon className="text-warning-500" size={14} />
                  Apenas vencidas
                </div>
              </Switch>
            </div>

            <Button
              className="font-medium md:self-end"
              radius="full"
              startContent={<RefreshCwIcon size={16} />}
              variant="flat"
              onPress={handleLimparFiltros}
            >
              Limpar filtros
            </Button>
          </div>

          <AnimatePresence>
            {filtrosAvancados && (
              <motion.div
                animate={{ opacity: 1, height: "auto" }}
                className="mt-4 overflow-hidden border-t border-white/10 pt-4"
                exit={{ opacity: 0, height: 0 }}
                initial={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
              >
                <motion.div
                  animate={{ y: 0 }}
                  className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
                  initial={{ y: -20 }}
                  transition={{ delay: 0.1, duration: 0.3 }}
                >
                  <Input
                    label="Valor mínimo"
                    placeholder="Ex: 1000"
                    size="sm"
                    startContent={
                      <DollarSignIcon className="text-default-400" size={12} />
                    }
                    type="number"
                    value={filters.valorMinimo?.toString() || ""}
                    variant="bordered"
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        valorMinimo: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                  />

                  <Input
                    label="Valor máximo"
                    placeholder="Ex: 5000"
                    size="sm"
                    startContent={
                      <DollarSignIcon className="text-default-400" size={12} />
                    }
                    type="number"
                    value={filters.valorMaximo?.toString() || ""}
                    variant="bordered"
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        valorMaximo: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                  />

                  <DateRangeInput
                    label="Período de vencimento"
                    size="sm"
                    startContent={
                      <CalendarDaysIcon className="text-default-400" size={12} />
                    }
                    variant="bordered"
                    onRangeChange={({ start, end }) => {
                      if (start && end) {
                        setFilters({
                          ...filters,
                          dataVencimentoInicio: new Date(`${start}T00:00:00`),
                          dataVencimentoFim: new Date(`${end}T23:59:59`),
                        });
                      } else {
                        setFilters({
                          ...filters,
                          dataVencimentoInicio: undefined,
                          dataVencimentoFim: undefined,
                        });
                      }
                    }}
                  />

                  <Select
                    label="Forma de pagamento"
                    placeholder="Todas as formas"
                    selectedKeys={
                      filters.formaPagamento ? [filters.formaPagamento] : []
                    }
                    size="sm"
                    startContent={
                      <CreditCardIcon className="text-default-400" size={12} />
                    }
                    variant="bordered"
                    onSelectionChange={(keys) => {
                      const forma = Array.from(keys)[0] as string;
                      setFilters({
                        ...filters,
                        formaPagamento: forma || undefined,
                      });
                    }}
                  >
                    {formasPagamento.map((forma) => (
                      <SelectItem key={forma.key} textValue={forma.label}>
                        {forma.label}
                      </SelectItem>
                    ))}
                  </Select>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-4 flex items-center gap-2">
            <Chip
              color="primary"
              size="sm"
              startContent={<HashIcon size={10} />}
              variant="flat"
            >
              {parcelas.length} resultado{parcelas.length !== 1 ? "s" : ""}
            </Chip>
          </div>
        </CardBody>
      </Card>

      <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
        <CardHeader className="border-b border-white/10">
          <div className="flex w-full flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Lista de parcelas
              </h2>
              <p className="text-sm text-default-500">
                Gerencie todas as parcelas dos contratos com visão de status e
                vencimento.
              </p>
            </div>
            <Chip
              color="primary"
              size="sm"
              startContent={<ReceiptIcon size={12} />}
              variant="flat"
            >
              {parcelas.length} parcela{parcelas.length !== 1 ? "s" : ""}
            </Chip>
          </div>
        </CardHeader>
        <CardBody className="space-y-4 p-4 sm:p-5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Spinner color="primary" size="lg" />
              <p className="mt-4 text-default-500">Carregando parcelas...</p>
            </div>
          ) : parcelas.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-background/40 p-8 text-center">
              <ReceiptIcon className="mx-auto mb-4 text-default-300" size={48} />
              <h3 className="mb-2 text-lg font-semibold text-foreground">
                Nenhuma parcela encontrada
              </h3>
              <p className="mx-auto mb-6 max-w-md text-sm text-default-500">
                Crie a primeira parcela para iniciar o controle financeiro dos
                contratos.
              </p>
              <Button
                className="font-semibold"
                color="primary"
                radius="full"
                startContent={<PlusIcon size={16} />}
                onPress={() => handleOpenModal()}
              >
                Criar primeira parcela
              </Button>
            </div>
          ) : (
            <div className="grid gap-3">
              {parcelas.map((parcela: ParcelaComContrato) => (
                <Card
                  key={parcela.id}
                  className="border border-white/10 bg-background/40 transition-colors hover:border-primary/40"
                >
                  <CardBody className="p-4 sm:p-5">
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-center">
                      <div className="lg:col-span-4">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {parcela.contrato.cliente.nome}
                        </p>
                        <p className="truncate text-xs text-default-500">
                          {parcela.contrato.advogadoResponsavel?.usuario
                            ? `${parcela.contrato.advogadoResponsavel.usuario.firstName} ${parcela.contrato.advogadoResponsavel.usuario.lastName}`
                            : "Sem advogado responsável"}
                        </p>
                      </div>

                      <div className="lg:col-span-2">
                        <p className="text-sm font-medium text-foreground">
                          {parcela.titulo || `Parcela ${parcela.numeroParcela}`}
                        </p>
                        {parcela.descricao && (
                          <p className="truncate text-xs text-default-500">
                            {parcela.descricao}
                          </p>
                        )}
                      </div>

                      <div className="lg:col-span-2">
                        <p className="text-sm font-semibold text-foreground">
                          {formatCurrency(Number(parcela.valor))}
                        </p>
                        <p className="text-xs text-default-500">Valor</p>
                      </div>

                      <div className="lg:col-span-2">
                        <p
                          className={`text-sm font-semibold ${
                            isVencida(parcela.dataVencimento, parcela.status)
                              ? "text-danger-500"
                              : "text-foreground"
                          }`}
                        >
                          {formatDate(parcela.dataVencimento)}
                        </p>
                        <p className="text-xs text-default-500">
                          {isVencida(parcela.dataVencimento, parcela.status)
                            ? "Vencida"
                            : "Vencimento"}
                        </p>
                      </div>

                      <div className="lg:col-span-2">
                        <div className="flex items-center justify-between gap-2 lg:justify-end">
                          <Chip
                            color={getStatusColor(parcela.status)}
                            size="sm"
                            startContent={getStatusIcon(parcela.status)}
                            variant="flat"
                          >
                            {
                              statusList.find((s) => s.value === parcela.status)
                                ?.label
                            }
                          </Chip>

                          <Dropdown>
                            <DropdownTrigger>
                              <Button
                                className="font-medium"
                                size="sm"
                                startContent={<ArrowUpDownIcon size={14} />}
                                variant="light"
                              >
                                Ações
                              </Button>
                            </DropdownTrigger>
                            <DropdownMenu
                              aria-label="Ações da parcela"
                              variant="flat"
                            >
                              <DropdownItem
                                key="view"
                                className="text-default-700"
                                startContent={<EyeIcon size={16} />}
                                onPress={() => handleOpenModal(parcela)}
                              >
                                Ver detalhes
                              </DropdownItem>
                              <DropdownItem
                                key="edit"
                                className="text-primary"
                                startContent={<PencilIcon size={16} />}
                                onPress={() => handleOpenModal(parcela)}
                              >
                                Editar
                              </DropdownItem>
                              <DropdownItem
                                key="delete"
                                className="text-danger"
                                color="danger"
                                startContent={<TrashIcon size={16} />}
                                onPress={() => handleDelete(parcela.id)}
                              >
                                Remover
                              </DropdownItem>
                            </DropdownMenu>
                          </Dropdown>
                        </div>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Modal de Criação/Edição com Tabs */}
      <Modal
        isOpen={modalOpen}
        scrollBehavior="inside"
        size="5xl"
        onClose={handleCloseModal}
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <ReceiptIcon className="text-primary" size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold">
                  {editingId ? "Editar Parcela" : "Nova Parcela"}
                </h3>
                <p className="text-sm text-default-500">
                  Complete as informações da parcela
                </p>
              </div>
            </div>
          </ModalHeader>

          <ModalBody className="px-0">
            <Tabs
              aria-label="Formulário de parcela"
              classNames={{
                tabList:
                  "gap-8 w-full relative rounded-none p-6 pb-0 border-b border-divider",
                cursor: "w-full bg-primary",
                tab: "max-w-fit px-4 h-12",
                tabContent:
                  "group-data-[selected=true]:text-primary font-medium",
                panel: "pt-6",
              }}
              color="primary"
              variant="underlined"
            >
              <Tab
                key="basico"
                title={
                  <div className="flex items-center space-x-3">
                    <div className="p-1 rounded-md bg-blue-100 dark:bg-blue-900">
                      <FileTextIcon
                        className="text-blue-600 dark:text-blue-400"
                        size={16}
                      />
                    </div>
                    <span>Básico</span>
                  </div>
                }
              >
                <div className="px-6 pb-6 space-y-6">
                  <div className="rounded-lg border border-white/10 bg-background/50 p-4">
                    <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                      <FileTextIcon size={20} />
                      Informações Básicas
                    </h3>

                    <div className="grid grid-cols-2 gap-4">
                      <SearchableSelect
                        emptyContent="Nenhum contrato encontrado"
                        items={contratoOptions}
                        isRequired
                        isLoading={loadingContratos}
                        label="Contrato"
                        placeholder="Selecione um contrato"
                        selectedKey={formData.contratoId || null}
                        startContent={
                          <FileTextIcon
                            className="text-default-400"
                            size={16}
                          />
                        }
                        onSelectionChange={(contratoId) => {
                          if (contratoId) {
                            handleContratoChange(contratoId);
                          }
                        }}
                      />
                      <Input
                        isRequired
                        label="Número da Parcela"
                        min="1"
                        placeholder="1"
                        startContent={
                          <TrendingUpIcon
                            className="text-default-400"
                            size={16}
                          />
                        }
                        type="number"
                        value={formData.numeroParcela.toString()}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            numeroParcela: parseInt(e.target.value) || 1,
                          })
                        }
                      />
                    </div>

                    <div className="mt-4">
                      <Input
                        label="Título"
                        placeholder="Ex: Parcela 1/12"
                        startContent={
                          <FileTextIcon
                            className="text-default-400"
                            size={16}
                          />
                        }
                        value={formData.titulo}
                        onChange={(e) =>
                          setFormData({ ...formData, titulo: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </div>
              </Tab>

              <Tab
                key="valores"
                title={
                  <div className="flex items-center space-x-3">
                    <div className="p-1 rounded-md bg-green-100 dark:bg-green-900">
                      <DollarSignIcon
                        className="text-green-600 dark:text-green-400"
                        size={16}
                      />
                    </div>
                    <span>Valores</span>
                  </div>
                }
              >
                <div className="px-6 pb-6 space-y-6">
                  <div className="rounded-lg border border-white/10 bg-background/50 p-4">
                    <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                      <DollarSignIcon size={20} />
                      Valores e Status
                    </h3>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Input
                          isRequired
                          className="font-semibold"
                          label="Valor"
                          max={
                            getContratoSelecionado()?.valorDisponivel ||
                            undefined
                          }
                          placeholder="0,00"
                          startContent={
                            <DollarSignIcon
                              className="text-green-500"
                              size={16}
                            />
                          }
                          step="0.01"
                          type="number"
                          value={formData.valor.toString()}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              valor: parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                        {getContratoSelecionado() && (
                          <div className="text-xs space-y-1">
                            <p className="text-green-600 flex items-center gap-1">
                              <DollarSignIcon size={12} />
                              <strong>Valor disponível:</strong>{" "}
                              {formatCurrency(
                                getContratoSelecionado().valorDisponivel,
                              )}
                            </p>
                            <p className="text-blue-600 flex items-center gap-1">
                              <FileTextIcon size={12} />
                              Total do contrato:{" "}
                              {formatCurrency(getContratoSelecionado().valor)}
                            </p>
                            <p className="text-orange-600 flex items-center gap-1">
                              <ReceiptIcon size={12} />
                              Valor comprometido (pendentes):{" "}
                              {formatCurrency(
                                getContratoSelecionado().valorComprometido || 0,
                              )}
                            </p>
                            <p className="text-gray-600 flex items-center gap-1">
                              <ReceiptIcon size={12} />
                              Parcelas existentes:{" "}
                              {getContratoSelecionado().totalParcelas} (
                              {formatCurrency(
                                getContratoSelecionado().valorTotalParcelas,
                              )}
                              )
                            </p>
                          </div>
                        )}
                      </div>
                      <Select
                        isRequired
                        label="Status"
                        placeholder="Selecione o status"
                        selectedKeys={[formData.status]}
                        startContent={
                          <TrendingUpIcon
                            className="text-default-400"
                            size={16}
                          />
                        }
                        onSelectionChange={(keys) => {
                          const status = Array.from(
                            keys,
                          )[0] as ContratoParcelaStatus;

                          setFormData({ ...formData, status });
                        }}
                      >
                        {statusList.map((status) => (
                          <SelectItem
                            key={status.value}
                            textValue={status.label}
                          >
                            <div className="flex items-center gap-2">
                              <span>{status.icon}</span>
                              <span>{status.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </Select>
                    </div>
                  </div>
                </div>
              </Tab>

              <Tab
                key="datas"
                title={
                  <div className="flex items-center space-x-3">
                    <div className="p-1 rounded-md bg-orange-100 dark:bg-orange-900">
                      <CalendarIcon
                        className="text-orange-600 dark:text-orange-400"
                        size={16}
                      />
                    </div>
                    <span>Datas</span>
                  </div>
                }
              >
                <div className="px-6 pb-6 space-y-6">
                  <div className="rounded-lg border border-white/10 bg-background/50 p-4">
                    <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                      <CalendarIcon size={20} />
                      Datas e Pagamento
                    </h3>

                    <div className="space-y-4">
                      <DateInput
                        isRequired
                        label="Data de Vencimento"
                        startContent={
                          <CalendarIcon className="text-orange-500" size={16} />
                        }
                        value={
                          formData.dataVencimento.toISOString().split("T")[0]
                        }
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            dataVencimento: new Date(e.target.value),
                          })
                        }
                      />

                      {formData.status === "PAGA" && (
                        <DateInput
                          label="Data de Pagamento"
                          startContent={
                            <CheckCircleIcon
                              className="text-success-500"
                              size={16}
                            />
                          }
                          value={
                            formData.dataPagamento
                              ? formData.dataPagamento
                                  .toISOString()
                                  .split("T")[0]
                              : ""
                          }
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              dataPagamento: e.target.value
                                ? new Date(e.target.value)
                                : undefined,
                            })
                          }
                        />
                      )}

                      <Input
                        label="Forma de Pagamento"
                        placeholder="Ex: PIX, Transferência, Boleto"
                        startContent={
                          <CreditCardIcon
                            className="text-default-400"
                            size={16}
                          />
                        }
                        value={formData.formaPagamento}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            formaPagamento: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              </Tab>

              <Tab
                key="adicional"
                title={
                  <div className="flex items-center space-x-3">
                    <div className="p-1 rounded-md bg-purple-100 dark:bg-purple-900">
                      <FileTextIcon
                        className="text-purple-600 dark:text-purple-400"
                        size={16}
                      />
                    </div>
                    <span>Adicional</span>
                  </div>
                }
              >
                <div className="px-6 pb-6 space-y-6">
                  <div className="rounded-lg border border-white/10 bg-background/50 p-4">
                    <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                      <FileTextIcon size={20} />
                      Informações Adicionais
                    </h3>

                    <Textarea
                      classNames={{ input: "resize-none" }}
                      label="Descrição"
                      placeholder="Descrição opcional da parcela"
                      rows={4}
                      value={formData.descricao}
                      onChange={(e) =>
                        setFormData({ ...formData, descricao: e.target.value })
                      }
                    />

                    {!editingId && (
                      <div className="mt-6 p-4 bg-primary/5 rounded-lg border border-primary/20">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="p-2 rounded-md bg-primary/10">
                            <RefreshCwIcon className="text-primary" size={16} />
                          </div>
                          <div>
                            <p className="font-medium">
                              Gerar Parcelas Automaticamente
                            </p>
                            <p className="text-sm text-default-500">
                              Crie múltiplas parcelas baseadas nos valores
                              informados
                            </p>
                          </div>
                        </div>
                        <Button
                          color="primary"
                          isLoading={loading}
                          startContent={
                            !loading ? <RefreshCwIcon size={16} /> : undefined
                          }
                          variant="flat"
                          onPress={handleGerarAutomaticamente}
                        >
                          {loading ? "Gerando..." : "Gerar 12 Parcelas"}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </Tab>

              {/* Aba de Integração - apenas se contrato selecionado */}
              {formData.contratoId && (
                <Tab
                  key="integracao"
                  title={
                    <div className="flex items-center space-x-3">
                      <div className="p-1 rounded-md bg-cyan-100 dark:bg-cyan-900">
                        <CreditCardIcon
                          className="text-cyan-600 dark:text-cyan-400"
                          size={16}
                        />
                      </div>
                      <span>Integração</span>
                    </div>
                  }
                >
                  <div className="px-6 pb-6 space-y-6">
                    {/* Validação da Conta */}
                    <div className="rounded-lg border border-white/10 bg-background/50 p-4">
                      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                        <ShieldIcon className="text-cyan-600" size={20} />
                        Validação da Conta Bancária
                      </h3>
                      <ValidacaoContaPrincipal
                        contratoId={formData.contratoId}
                        onContaValidada={setContaValida}
                      />
                    </div>

                    {/* Dados Bancários - apenas se valor > 0 e conta válida */}
                    {formData.valor > 0 && contaValida && (
                      <div className="rounded-lg border border-white/10 bg-background/50 p-4">
                        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                          <CreditCardIcon size={20} />
                          Dados Bancários para Pagamento
                        </h3>
                        <DadosBancariosParcela
                          contratoId={formData.contratoId}
                          descricao={
                            formData.descricao ||
                            formData.titulo ||
                            "Pagamento de parcela"
                          }
                          parcelaId={editingId || undefined}
                          valor={formData.valor}
                          vencimento={formData.dataVencimento}
                        />
                      </div>
                    )}

                    {/* Aviso se conta inválida */}
                    {formData.valor > 0 && contaValida === false && (
                      <div className="bg-danger-50 border border-danger-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <XCircleIcon className="h-5 w-5 text-danger" />
                          <span className="text-sm font-medium text-danger-700">
                            Conta Bancária Inválida
                          </span>
                        </div>
                        <p className="text-sm text-danger-600">
                          A conta bancária do contrato não passou na validação.
                          Corrija os problemas antes de prosseguir com o
                          pagamento.
                        </p>
                      </div>
                    )}

                    {/* Comprovante de Pagamento - apenas para parcelas existentes */}
                    {editingId && (
                      <div className="rounded-lg border border-white/10 bg-background/50 p-4">
                        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                          <FileTextIcon size={20} />
                          Comprovante de Pagamento
                        </h3>
                        {/* <ComprovantePagamentoUpload
                          parcelaId={editingId}
                          readonly={formData.status === "PAGA"}
                        /> */}
                        <div className="text-center py-8 text-default-500">
                          Componente de comprovante temporariamente desabilitado
                        </div>
                      </div>
                    )}
                  </div>
                </Tab>
              )}
            </Tabs>
          </ModalBody>

          <ModalFooter className="px-6">
            <Button variant="light" onPress={handleCloseModal}>
              Cancelar
            </Button>
            <Button
              color="primary"
              isLoading={loading}
              startContent={
                !loading ? <CheckCircleIcon size={16} /> : undefined
              }
              onPress={handleSubmit}
            >
              {editingId ? "Atualizar" : "Criar"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </section>
  );
}
