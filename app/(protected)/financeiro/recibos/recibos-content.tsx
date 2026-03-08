"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Card, CardBody, CardHeader, Button, Divider, Skeleton, Chip, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Pagination, Input, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure, Select, SelectItem } from "@heroui/react";
import {
  Download,
  Search,
  Filter,
  FileText,
  DollarSign,
  User,
  Building,
  CreditCard,
  Smartphone,
  Receipt,
  Eye,
  XCircle,
  RotateCcw,
  CalendarDays,
  Scale,
} from "lucide-react";
import dayjs from "dayjs";
import "dayjs/locale/pt-br";

import useSWR from "swr";
import { toast } from "@/lib/toast";

import { PeopleMetricCard, PeoplePageHeader } from "@/components/people-ui";
import {
  getRecibosPagos,
  gerarComprovanteHTML,
  getDadosFiltrosRecibos,
  type FiltrosRecibos,
  type Recibo,
} from "@/app/actions/recibos";
import { DateRangeInput } from "@/components/ui/date-range-input";
import { TENANT_PERMISSIONS } from "@/types";

type DateValueLike = {
  toDate: () => Date;
};

type PeriodoRange = {
  start: DateValueLike | null;
  end: DateValueLike | null;
};

export default function RecibosPage() {
  const { data: session } = useSession();
  const [filtros, setFiltros] = useState<FiltrosRecibos>({});
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [reciboSelecionado, setReciboSelecionado] = useState<Recibo | null>(
    null,
  );
  const [carregandoPDF, setCarregandoPDF] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [periodo, setPeriodo] = useState<PeriodoRange | null>(null);

  const { isOpen, onOpen, onClose } = useDisclosure();

  const itensPorPagina = 10;

  // Buscar recibos com paginação server-side
  const {
    data: recibosData,
    error,
    isLoading,
    mutate,
  } = useSWR(
    ["recibos", filtros, paginaAtual, itensPorPagina],
    () => getRecibosPagos({ ...filtros, pagina: paginaAtual, itensPorPagina }),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    },
  );

  // Buscar dados para filtros
  const { data: dadosFiltros } = useSWR(
    "dados-filtros-recibos",
    getDadosFiltrosRecibos,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    },
  );

  const recibos = recibosData?.data?.recibos || [];
  const resumo = recibosData?.data?.resumo;
  const total = recibosData?.data?.total || 0;
  const totalPaginas = recibosData?.data?.totalPaginas || 0;
  const canAccessBilling = useMemo(() => {
    const role = (session?.user as any)?.role as string | undefined;
    const permissions = ((session?.user as any)?.permissions ?? []) as string[];

    return (
      role === "SUPER_ADMIN" ||
      permissions.includes(TENANT_PERMISSIONS.manageOfficeSettings)
    );
  }, [session]);

  const resumoExibicao = useMemo(
    () => ({
      totalValor: resumo?.totalValor ?? 0,
      totalRecibos: total,
      totalParcelas: resumo?.totalParcelas ?? total,
      totalFaturas: resumo?.totalFaturas ?? 0,
    }),
    [resumo, total],
  );

  useEffect(() => {
    if (totalPaginas > 0 && paginaAtual > totalPaginas) {
      setPaginaAtual(totalPaginas);
    }
  }, [paginaAtual, totalPaginas]);

  // Debug removido para produção

  const handleFiltroChange = (key: keyof FiltrosRecibos, value: any) => {
    setFiltros((prev) => ({ ...prev, [key]: value }));
    setPaginaAtual(1);
  };

  const handlePeriodoChange = (value: PeriodoRange | null) => {
    setPeriodo(value);
    const dataInicio = value?.start
      ? dayjs(value.start.toDate()).startOf("day").toISOString()
      : undefined;
    const dataFim = value?.end
      ? dayjs(value.end.toDate()).endOf("day").toISOString()
      : undefined;

    setFiltros((prev) => ({
      ...prev,
      dataInicio,
      dataFim,
    }));
    setPaginaAtual(1);
  };

  const limparFiltros = () => {
    setFiltros({});
    setPeriodo(null);
    setPaginaAtual(1);
  };

  // Verificar se há filtros ativos
  const hasActiveFilters = Object.values(filtros).some(
    (value) => value !== undefined && value !== "",
  );
  const filtrosAtivosCount = Object.values(filtros).filter(
    (value) => value !== undefined && value !== "",
  ).length;

  // Função para renderizar clientes
  const renderClientes = () => {
    const clientes = dadosFiltros?.data?.clientes;

    if (!clientes) return [];

    // Converter objeto para array se necessário
    const clientesArray = Array.isArray(clientes)
      ? clientes
      : Object.values(clientes);

    return clientesArray.map((cliente: any) => (
      <SelectItem
        key={cliente.id}
        textValue={`${cliente.nome}${cliente.documento ? ` - ${cliente.documento}` : ""}`}
      >
        {cliente.nome} {cliente.documento && `- ${cliente.documento}`}
      </SelectItem>
    )) as any;
  };

  // Função para renderizar processos
  const renderProcessos = () => {
    const processos = dadosFiltros?.data?.processos;

    if (!processos) return [];

    // Converter objeto para array se necessário
    const processosArray = Array.isArray(processos)
      ? processos
      : Object.values(processos);

    return processosArray.map((processo: any) => (
      <SelectItem
        key={processo.id}
        textValue={`${processo.numero}${processo.titulo ? ` - ${processo.titulo}` : ""}`}
      >
        {processo.numero} {processo.titulo && `- ${processo.titulo}`}
      </SelectItem>
    )) as any;
  };

  // Função para renderizar advogados
  const renderAdvogados = () => {
    const advogados = dadosFiltros?.data?.advogados;

    if (!advogados) return [];

    // Converter objeto para array se necessário
    const advogadosArray = Array.isArray(advogados)
      ? advogados
      : Object.values(advogados);

    return advogadosArray.map((advogado: any) => (
      <SelectItem
        key={advogado.id}
        textValue={`${advogado.usuario.firstName} ${advogado.usuario.lastName}`}
      >
        {advogado.usuario.firstName} {advogado.usuario.lastName}
      </SelectItem>
    )) as any;
  };

  const abrirModalRecibo = async (recibo: Recibo) => {
    setReciboSelecionado(recibo);
    onOpen();
  };

  const gerarPDF = async (recibo: Recibo) => {
    setCarregandoPDF(true);
    try {
      // Gerar HTML do comprovante via Server Action
      const result = await gerarComprovanteHTML(recibo.id, recibo.tipo);

      if (result.success && result.data) {
        // Criar blob com o HTML
        const blob = new Blob([result.data.html], { type: "text/html" });
        const url = URL.createObjectURL(blob);

        // Abrir em nova aba
        const newWindow = window.open(url, "_blank");

        if (newWindow) {
          newWindow.document.title = result.data.filename;
        }

        // Limpar URL após um tempo
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        toast.error("Erro ao gerar comprovante");
      }
    } catch (error) {
      toast.error("Erro ao gerar PDF");
    } finally {
      setCarregandoPDF(false);
    }
  };

  const formatarValor = (valor: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(valor);
  };

  const formatarData = (data: Date | null) => {
    if (!data) return "-";

    return dayjs(data).locale("pt-br").format("DD/MM/YYYY");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "PAGA":
        return "success";
      case "PENDENTE":
        return "warning";
      case "ATRASADA":
        return "danger";
      case "CANCELADA":
        return "default";
      default:
        return "default";
    }
  };

  const getFormaPagamentoIcon = (forma: string | null) => {
    switch (forma) {
      case "PIX":
        return <Smartphone className="w-4 h-4" />;
      case "CARTAO":
      case "CREDIT_CARD":
        return <CreditCard className="w-4 h-4" />;
      case "DINHEIRO":
        return <DollarSign className="w-4 h-4" />;
      default:
        return <DollarSign className="w-4 h-4" />;
    }
  };

  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-3 py-8 sm:px-6">
      <PeoplePageHeader
        tag="Financeiro"
        title="Recibos"
        description="Histórico consolidado de pagamentos confirmados das parcelas contratuais do escritório."
      />
      {canAccessBilling && (
        <p className="-mt-4 text-[11px] text-default-500">
          Deseja encontrar as faturas da assinatura da Magic Lawyer?{" "}
          <Link
            className="font-medium text-primary/90 underline-offset-2 transition hover:text-primary hover:underline"
            href="/configuracoes?tab=billing"
          >
            clique aqui
          </Link>
          .
        </p>
      )}

      {error && (
        <Card className="border border-danger/30 bg-danger/10">
          <CardBody className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base font-semibold text-danger">
                Erro ao carregar recibos
              </p>
              <p className="text-sm text-danger/80">
                {error.message || "Ocorreu um erro inesperado"}
              </p>
            </div>
            <Button color="danger" variant="flat" onPress={() => mutate()}>
              Tentar novamente
            </Button>
          </CardBody>
        </Card>
      )}

      {/* Resumo */}
      {resumo && (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
          initial={{ opacity: 0, y: 20 }}
        >
          <PeopleMetricCard
            helper="Somatório de pagamentos confirmados"
            icon={<DollarSign className="h-4 w-4" />}
            label="Total recebido"
            tone="success"
            value={formatarValor(resumoExibicao.totalValor)}
          />
          <PeopleMetricCard
            helper="Comprovantes válidos no filtro"
            icon={<FileText className="h-4 w-4" />}
            label="Total de recibos"
            tone="primary"
            value={resumoExibicao.totalRecibos}
          />
          <PeopleMetricCard
            helper="Recibos de parcelas"
            icon={<Receipt className="h-4 w-4" />}
            label="Parcelas"
            tone="warning"
            value={resumoExibicao.totalParcelas}
          />
          <PeopleMetricCard
            helper="Média por recibo no filtro"
            icon={<Building className="h-4 w-4" />}
            label="Ticket médio"
            tone="secondary"
            value={
              resumoExibicao.totalRecibos > 0
                ? formatarValor(
                    resumoExibicao.totalValor / resumoExibicao.totalRecibos,
                  )
                : formatarValor(0)
            }
          />
        </motion.div>
      )}

      {/* Filtros Avançados */}
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        initial={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">Filtros</h3>
              {hasActiveFilters && (
                <Chip color="primary" size="sm" variant="flat">
                  {filtrosAtivosCount} ativo(s)
                </Chip>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                isDisabled={!hasActiveFilters}
                size="sm"
                startContent={<RotateCcw className="w-4 h-4" />}
                variant="light"
                onPress={limparFiltros}
              >
                Limpar
              </Button>
              <Button
                size="sm"
                startContent={
                  showFilters ? (
                    <XCircle className="w-4 h-4" />
                  ) : (
                    <Filter className="w-4 h-4" />
                  )
                }
                variant="light"
                onPress={() => setShowFilters(!showFilters)}
              >
                {showFilters ? "Ocultar" : "Mostrar"}
              </Button>
            </div>
          </CardHeader>

          <AnimatePresence>
            {showFilters && (
              <motion.div
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                initial={{ height: 0, opacity: 0 }}
                style={{ overflow: "hidden" }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
              >
                <CardBody>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {/* Filtro por Período */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium flex items-center gap-2">
                        <CalendarDays className="w-4 h-4" />
                        Período
                      </label>
                      <DateRangeInput
                        className="w-full"
                        label="Selecione o período"
                        rangeValue={periodo as any}
                        size="sm"
                        variant="bordered"
                        onRangeValueChange={(value) =>
                          handlePeriodoChange(value as PeriodoRange | null)
                        }
                      />
                    </div>

                    {/* Filtro por Busca */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium flex items-center gap-2">
                        <Search className="w-4 h-4" />
                        Busca
                      </label>
                      <Input
                        placeholder="Buscar por número, cliente..."
                        size="sm"
                        startContent={
                          <Search className="w-4 h-4 text-default-400" />
                        }
                        value={filtros.search || ""}
                        variant="bordered"
                        onValueChange={(value) =>
                          handleFiltroChange("search", value)
                        }
                      />
                    </div>

                    {/* Filtro por Status */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium flex items-center gap-2">
                        <Receipt className="w-4 h-4" />
                        Status
                      </label>
                      <Select
                        placeholder="Selecione um status"
                        selectedKeys={filtros.status ? [filtros.status] : []}
                        size="sm"
                        variant="bordered"
                        onSelectionChange={(keys) => {
                          const selected = Array.from(keys)[0] as string;

                          handleFiltroChange("status", selected || undefined);
                        }}
                      >
                        <SelectItem key="" textValue="Todos os status">
                          Todos os status
                        </SelectItem>
                        <SelectItem key="PAGA" textValue="Paga">
                          Paga
                        </SelectItem>
                        <SelectItem key="PENDENTE" textValue="Pendente">
                          Pendente
                        </SelectItem>
                        <SelectItem key="ATRASADA" textValue="Atrasada">
                          Atrasada
                        </SelectItem>
                        <SelectItem key="CANCELADA" textValue="Cancelada">
                          Cancelada
                        </SelectItem>
                      </Select>
                    </div>

                    {/* Filtro por Cliente */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium flex items-center gap-2">
                        <User className="w-4 h-4" />
                        Cliente
                      </label>
                      <Select
                        placeholder="Selecione um cliente"
                        selectedKeys={
                          filtros.clienteId ? [filtros.clienteId] : []
                        }
                        size="sm"
                        variant="bordered"
                        onSelectionChange={(keys) => {
                          const selected = Array.from(keys)[0] as string;

                          handleFiltroChange(
                            "clienteId",
                            selected || undefined,
                          );
                        }}
                      >
                        <SelectItem key="" textValue="Todos os clientes">
                          Todos os clientes
                        </SelectItem>
                        {...renderClientes()}
                      </Select>
                    </div>

                    {/* Filtro por Processo */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium flex items-center gap-2">
                        <Scale className="w-4 h-4" />
                        Processo
                      </label>
                      <Select
                        placeholder="Selecione um processo"
                        selectedKeys={
                          filtros.processoId ? [filtros.processoId] : []
                        }
                        size="sm"
                        variant="bordered"
                        onSelectionChange={(keys) => {
                          const selected = Array.from(keys)[0] as string;

                          handleFiltroChange(
                            "processoId",
                            selected || undefined,
                          );
                        }}
                      >
                        <SelectItem key="" textValue="Todos os processos">
                          Todos os processos
                        </SelectItem>
                        {...renderProcessos()}
                      </Select>
                    </div>

                    {/* Filtro por Advogado */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium flex items-center gap-2">
                        <Building className="w-4 h-4" />
                        Advogado
                      </label>
                      <Select
                        placeholder="Selecione um advogado"
                        selectedKeys={
                          filtros.advogadoId ? [filtros.advogadoId] : []
                        }
                        size="sm"
                        variant="bordered"
                        onSelectionChange={(keys) => {
                          const selected = Array.from(keys)[0] as string;

                          handleFiltroChange(
                            "advogadoId",
                            selected || undefined,
                          );
                        }}
                      >
                        <SelectItem key="" textValue="Todos os advogados">
                          Todos os advogados
                        </SelectItem>
                        {...renderAdvogados()}
                      </Select>
                    </div>
                  </div>
                </CardBody>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </motion.div>

      {/* Lista de Recibos */}
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        initial={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                <h3 className="text-lg font-semibold">Recibos Pagos</h3>
              </div>
              <Chip color="primary" variant="flat">
                {total} registros
              </Chip>
            </div>
          </CardHeader>
          <Divider />
          <CardBody>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : recibos.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-16 h-16 mx-auto text-default-300 mb-4" />
                <h3 className="text-lg font-semibold text-default-500 mb-2">
                  Nenhum recibo encontrado
                </h3>
                <p className="text-default-400">
                  Não há recibos pagos que correspondam aos filtros selecionados
                </p>
              </div>
            ) : (
              <>
                <Table aria-label="Lista de recibos">
                  <TableHeader>
                    <TableColumn>RECIBO</TableColumn>
                    <TableColumn>CLIENTE</TableColumn>
                    <TableColumn>PROCESSO</TableColumn>
                    <TableColumn>ADVOGADO</TableColumn>
                    <TableColumn>VALOR</TableColumn>
                    <TableColumn>PAGAMENTO</TableColumn>
                    <TableColumn>STATUS</TableColumn>
                    <TableColumn>AÇÕES</TableColumn>
                  </TableHeader>
                  <TableBody>
                    {recibos.map((recibo) => (
                      <TableRow key={recibo.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-semibold text-sm">
                              {recibo.numero}
                            </p>
                            <p className="text-xs text-default-500">
                              {recibo.titulo}
                            </p>
                            <Chip
                              color="primary"
                              size="sm"
                              variant="flat"
                            >
                              {recibo.tipo}
                            </Chip>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-semibold text-sm">
                              {recibo.contrato?.cliente.nome || "N/A"}
                            </p>
                            <p className="text-xs text-default-500">
                              Contrato: {recibo.contrato?.numero || "N/A"}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {recibo.contrato?.processo ? (
                              <>
                                <p className="text-sm font-medium text-blue-600">
                                  {recibo.contrato.processo.numero}
                                </p>
                                {recibo.contrato.processo.titulo && (
                                  <p
                                    className="text-xs text-default-500 truncate max-w-32"
                                    title={recibo.contrato.processo.titulo}
                                  >
                                    {recibo.contrato.processo.titulo}
                                  </p>
                                )}
                              </>
                            ) : (
                              <p className="text-sm text-default-400">N/A</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {recibo.contrato?.advogadoResponsavel ? (
                              <>
                                <p className="text-sm font-medium text-green-600">
                                  {
                                    recibo.contrato.advogadoResponsavel.usuario
                                      .firstName
                                  }{" "}
                                  {
                                    recibo.contrato.advogadoResponsavel.usuario
                                      .lastName
                                  }
                                </p>
                                <p className="text-xs text-default-500">
                                  {
                                    recibo.contrato.advogadoResponsavel.usuario
                                      .email
                                  }
                                </p>
                              </>
                            ) : (
                              <p className="text-sm text-default-400">N/A</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="font-semibold text-success text-sm">
                            {formatarValor(recibo.valor)}
                          </p>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {recibo.tipo === "PARCELA" &&
                              recibo.formaPagamento && (
                                <div className="flex items-center gap-1">
                                  {getFormaPagamentoIcon(recibo.formaPagamento)}
                                  <span className="text-xs">
                                    {recibo.formaPagamento}
                                  </span>
                                </div>
                              )}
                            <p className="text-xs text-default-500">
                              {formatarData(recibo.dataPagamento)}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Chip
                            color={getStatusColor(recibo.status)}
                            size="sm"
                            variant="flat"
                          >
                            {recibo.status}
                          </Chip>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              isIconOnly
                              size="sm"
                              title="Ver detalhes"
                              variant="bordered"
                              onPress={() => abrirModalRecibo(recibo)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              isIconOnly
                              color="primary"
                              isLoading={carregandoPDF}
                              size="sm"
                              title="Baixar PDF"
                              onPress={() => gerarPDF(recibo)}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {totalPaginas > 1 && (
                  <div className="flex justify-center mt-6">
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
          </CardBody>
        </Card>
      </motion.div>

      {/* Modal de Detalhes do Recibo */}
      <AnimatePresence>
        {isOpen && (
          <Modal isOpen={isOpen} size="2xl" onClose={onClose}>
            <ModalContent>
              {(onClose) => (
                <>
                  <ModalHeader className="flex flex-col gap-1">
                    <h3 className="text-lg font-semibold">
                      Detalhes do Recibo
                    </h3>
                    {reciboSelecionado && (
                      <p className="text-sm text-default-500">
                        {reciboSelecionado.numero} - {reciboSelecionado.titulo}
                      </p>
                    )}
                  </ModalHeader>
                  <ModalBody>
                    {reciboSelecionado && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm font-semibold text-default-600">
                              Tipo
                            </p>
                            <Chip
                              color={
                                reciboSelecionado.tipo === "PARCELA"
                                  ? "primary"
                                  : "secondary"
                              }
                              variant="flat"
                            >
                              {reciboSelecionado.tipo}
                            </Chip>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-default-600">
                              Status
                            </p>
                            <Chip
                              color={getStatusColor(reciboSelecionado.status)}
                              variant="flat"
                            >
                              {reciboSelecionado.status}
                            </Chip>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm font-semibold text-default-600">
                              Valor
                            </p>
                            <p className="text-lg font-semibold text-success">
                              {formatarValor(reciboSelecionado.valor)}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-default-600">
                              Data de Pagamento
                            </p>
                            <p className="text-sm">
                              {formatarData(reciboSelecionado.dataPagamento)}
                            </p>
                          </div>
                        </div>

                        {reciboSelecionado.contrato && (
                          <>
                            <div>
                              <p className="text-sm font-semibold text-default-600">
                                Cliente
                              </p>
                              <div className="bg-default-50 p-3 rounded-lg">
                                <p className="font-semibold">
                                  {reciboSelecionado.contrato.cliente.nome}
                                </p>
                                <p className="text-sm text-default-500">
                                  {reciboSelecionado.contrato.cliente.documento}
                                </p>
                                <p className="text-sm text-default-500">
                                  {reciboSelecionado.contrato.cliente.email}
                                </p>
                                <p className="text-sm text-default-500">
                                  {reciboSelecionado.contrato.cliente
                                    .telefone ||
                                    reciboSelecionado.contrato.cliente
                                      .celular ||
                                    "N/A"}
                                </p>
                              </div>
                            </div>

                            {reciboSelecionado.contrato.processo && (
                              <div>
                                <p className="text-sm font-semibold text-default-600">
                                  Processo
                                </p>
                                <div className="bg-blue-50 p-3 rounded-lg">
                                  <p className="font-semibold text-blue-800">
                                    {reciboSelecionado.contrato.processo.numero}
                                  </p>
                                  {reciboSelecionado.contrato.processo
                                    .numeroCnj && (
                                    <p className="text-sm text-blue-600">
                                      CNJ:{" "}
                                      {
                                        reciboSelecionado.contrato.processo
                                          .numeroCnj
                                      }
                                    </p>
                                  )}
                                  {reciboSelecionado.contrato.processo
                                    .titulo && (
                                    <p className="text-sm text-blue-600">
                                      {
                                        reciboSelecionado.contrato.processo
                                          .titulo
                                      }
                                    </p>
                                  )}
                                  {reciboSelecionado.contrato.processo
                                    .valorCausa && (
                                    <p className="text-sm text-blue-600">
                                      Valor da Causa:{" "}
                                      {formatarValor(
                                        reciboSelecionado.contrato.processo
                                          .valorCausa,
                                      )}
                                    </p>
                                  )}
                                  {reciboSelecionado.contrato.processo
                                    .orgaoJulgador && (
                                    <p className="text-sm text-blue-600">
                                      {
                                        reciboSelecionado.contrato.processo
                                          .orgaoJulgador
                                      }
                                    </p>
                                  )}
                                  {reciboSelecionado.contrato.processo.vara && (
                                    <p className="text-sm text-blue-600">
                                      Vara:{" "}
                                      {reciboSelecionado.contrato.processo.vara}
                                    </p>
                                  )}
                                  {reciboSelecionado.contrato.processo
                                    .comarca && (
                                    <p className="text-sm text-blue-600">
                                      Comarca:{" "}
                                      {
                                        reciboSelecionado.contrato.processo
                                          .comarca
                                      }
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}

                            {reciboSelecionado.contrato.advogadoResponsavel && (
                              <div>
                                <p className="text-sm font-semibold text-default-600">
                                  Advogado Responsável
                                </p>
                                <div className="bg-green-50 p-3 rounded-lg">
                                  <p className="font-semibold text-green-800">
                                    {
                                      reciboSelecionado.contrato
                                        .advogadoResponsavel.usuario.firstName
                                    }{" "}
                                    {
                                      reciboSelecionado.contrato
                                        .advogadoResponsavel.usuario.lastName
                                    }
                                  </p>
                                  <p className="text-sm text-green-600">
                                    {
                                      reciboSelecionado.contrato
                                        .advogadoResponsavel.usuario.email
                                    }
                                  </p>
                                </div>
                              </div>
                            )}
                          </>
                        )}

                        {reciboSelecionado.tipo === "PARCELA" &&
                          reciboSelecionado.formaPagamento && (
                            <div>
                              <p className="text-sm font-semibold text-default-600">
                                Forma de Pagamento
                              </p>
                              <div className="flex items-center gap-2">
                                {getFormaPagamentoIcon(
                                  reciboSelecionado.formaPagamento,
                                )}
                                <span>{reciboSelecionado.formaPagamento}</span>
                              </div>
                            </div>
                          )}

                        {reciboSelecionado.descricao && (
                          <div>
                            <p className="text-sm font-semibold text-default-600">
                              Descrição
                            </p>
                            <p className="text-sm">
                              {reciboSelecionado.descricao}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </ModalBody>
                  <ModalFooter>
                    <Button variant="light" onPress={onClose}>
                      Fechar
                    </Button>
                    {reciboSelecionado && (
                      <Button
                        color="primary"
                        isLoading={carregandoPDF}
                        startContent={<Download className="w-4 h-4" />}
                        onPress={() => {
                          gerarPDF(reciboSelecionado);
                          onClose();
                        }}
                      >
                        Baixar PDF
                      </Button>
                    )}
                  </ModalFooter>
                </>
              )}
            </ModalContent>
          </Modal>
        )}
      </AnimatePresence>
    </section>
  );
}
