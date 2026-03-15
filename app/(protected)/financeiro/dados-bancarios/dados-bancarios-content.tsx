"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
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
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Textarea,
} from "@heroui/react";
import {
  Building,
  CheckCircle,
  CreditCard,
  Filter,
  Landmark,
  Pencil,
  Plus,
  Search,
  Shield,
  Star,
  Trash2,
  User,
  Wallet,
} from "lucide-react";

import { toast } from "@/lib/toast";
import {
  createDadosBancarios,
  deleteDadosBancarios,
  getDadosBancariosFilterOptions,
  getTiposChavePix,
  getTiposConta,
  getTiposContaBancaria,
  listDadosBancarios,
  updateDadosBancarios,
} from "@/app/actions/dados-bancarios";
import { PeopleMetricCard, PeoplePageHeader } from "@/components/people-ui";
import { SearchableSelect } from "@/components/searchable-select";

type DadosBancariosItem = {
  id: string;
  usuarioId: string | null;
  clienteId: string | null;
  tipoConta: "PESSOA_FISICA" | "PESSOA_JURIDICA";
  bancoCodigo: string;
  agencia: string;
  conta: string;
  digitoConta: string | null;
  tipoContaBancaria: "CORRENTE" | "POUPANCA" | "SALARIO" | "INVESTIMENTO";
  chavePix: string | null;
  tipoChavePix: "CPF" | "CNPJ" | "EMAIL" | "TELEFONE" | "ALEATORIA" | null;
  titularNome: string;
  titularDocumento: string;
  titularEmail: string | null;
  titularTelefone: string | null;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  ativo: boolean;
  principal: boolean;
  observacoes: string | null;
  usuario?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    role: string;
  } | null;
  cliente?: {
    id: string;
    nome: string;
    email: string | null;
    documento: string | null;
  } | null;
  banco?: {
    codigo: string;
    nome: string;
  } | null;
};

type FormState = {
  linkType: "ME" | "USUARIO" | "CLIENTE";
  usuarioId: string;
  clienteId: string;
  tipoConta: "PESSOA_FISICA" | "PESSOA_JURIDICA";
  bancoCodigo: string;
  agencia: string;
  conta: string;
  digitoConta: string;
  tipoContaBancaria: "CORRENTE" | "POUPANCA" | "SALARIO" | "INVESTIMENTO";
  chavePix: string;
  tipoChavePix: "CPF" | "CNPJ" | "EMAIL" | "TELEFONE" | "ALEATORIA";
  titularNome: string;
  titularDocumento: string;
  titularEmail: string;
  titularTelefone: string;
  endereco: string;
  cidade: string;
  estado: string;
  cep: string;
  ativo: boolean;
  principal: boolean;
  observacoes: string;
};

const DEFAULT_FORM: FormState = {
  linkType: "ME",
  usuarioId: "",
  clienteId: "",
  tipoConta: "PESSOA_FISICA",
  bancoCodigo: "",
  agencia: "",
  conta: "",
  digitoConta: "",
  tipoContaBancaria: "CORRENTE",
  chavePix: "",
  tipoChavePix: "CPF",
  titularNome: "",
  titularDocumento: "",
  titularEmail: "",
  titularTelefone: "",
  endereco: "",
  cidade: "",
  estado: "",
  cep: "",
  ativo: true,
  principal: false,
  observacoes: "",
};

const PAGE_SIZE = 12;

function getSingleSelection(keys: any): string {
  const selected = Array.from(keys as Set<string>)[0];

  return typeof selected === "string" ? selected : "";
}

function withOption(value: string) {
  return value ? [value] : [];
}

function formatOwner(item: DadosBancariosItem) {
  if (item.cliente) {
    return {
      label: item.cliente.nome,
      helper: "Cliente",
      color: "warning" as const,
    };
  }

  if (item.usuario) {
    const fullName = `${item.usuario.firstName || ""} ${item.usuario.lastName || ""}`.trim();

    return {
      label: fullName || item.usuario.email,
      helper: "Usuário interno",
      color: "primary" as const,
    };
  }

  return {
    label: "Sem vínculo",
    helper: "Conta sem responsável",
    color: "default" as const,
  };
}

function toForm(item: DadosBancariosItem, currentUserId: string): FormState {
  const linkType: FormState["linkType"] = item.clienteId
    ? "CLIENTE"
    : item.usuarioId && item.usuarioId !== currentUserId
      ? "USUARIO"
      : "ME";

  return {
    linkType,
    usuarioId: item.usuarioId || "",
    clienteId: item.clienteId || "",
    tipoConta: item.tipoConta,
    bancoCodigo: item.bancoCodigo,
    agencia: item.agencia,
    conta: item.conta,
    digitoConta: item.digitoConta || "",
    tipoContaBancaria: item.tipoContaBancaria,
    chavePix: item.chavePix || "",
    tipoChavePix: item.tipoChavePix || "CPF",
    titularNome: item.titularNome,
    titularDocumento: item.titularDocumento,
    titularEmail: item.titularEmail || "",
    titularTelefone: item.titularTelefone || "",
    endereco: item.endereco || "",
    cidade: item.cidade || "",
    estado: item.estado || "",
    cep: item.cep || "",
    ativo: item.ativo,
    principal: item.principal,
    observacoes: item.observacoes || "",
  };
}

export default function DadosBancariosContent() {
  const [search, setSearch] = useState("");
  const [bancoCodigo, setBancoCodigo] = useState("");
  const [tipoConta, setTipoConta] = useState("");
  const [tipoContaBancaria, setTipoContaBancaria] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("TODOS");
  const [filtroPrincipal, setFiltroPrincipal] = useState("TODOS");
  const [clienteId, setClienteId] = useState("");
  const [advogadoId, setAdvogadoId] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [page, setPage] = useState(1);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DadosBancariosItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  const { data: optionsData } = useSWR(
    "dados-bancarios-filter-options",
    getDadosBancariosFilterOptions,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    },
  );

  const options = optionsData?.data;
  const permissions = options?.permissions;
  const currentRole = permissions?.role || "";
  const canViewGlobal = Boolean(permissions?.canViewGlobal);
  const canManageGlobal = Boolean(permissions?.canManageGlobal);
  const canLinkCliente =
    canManageGlobal || currentRole === "ADVOGADO" || currentRole === "CLIENTE";
  const currentUserId = permissions?.userId || "";

  const filtersPayload = useMemo(
    () => ({
      search: search.trim() || undefined,
      bancoCodigo: bancoCodigo || undefined,
      tipoConta: (tipoConta || undefined) as
        | "PESSOA_FISICA"
        | "PESSOA_JURIDICA"
        | undefined,
      tipoContaBancaria: (tipoContaBancaria || undefined) as
        | "CORRENTE"
        | "POUPANCA"
        | "SALARIO"
        | "INVESTIMENTO"
        | undefined,
      ativo:
        filtroStatus === "ATIVOS"
          ? true
          : filtroStatus === "INATIVOS"
            ? false
            : undefined,
      principal:
        filtroPrincipal === "SIM"
          ? true
          : filtroPrincipal === "NAO"
            ? false
            : undefined,
      clienteId: clienteId || undefined,
      advogadoId: canViewGlobal ? advogadoId || undefined : undefined,
      onlyMine: canViewGlobal ? onlyMine : undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [
      advogadoId,
      bancoCodigo,
      canViewGlobal,
      clienteId,
      filtroPrincipal,
      filtroStatus,
      onlyMine,
      page,
      search,
      tipoConta,
      tipoContaBancaria,
    ],
  );

  const {
    data: listData,
    isLoading,
    error,
    mutate,
  } = useSWR(["financeiro-dados-bancarios", filtersPayload], () =>
    listDadosBancarios(filtersPayload),
  );

  const { data: tiposContaData } = useSWR("tipos-conta-bancaria-owner", getTiposConta, {
    revalidateOnFocus: false,
  });
  const { data: tiposContaBancariaData } = useSWR(
    "tipos-conta-bancaria-operacional",
    getTiposContaBancaria,
    { revalidateOnFocus: false },
  );
  const { data: tiposPixData } = useSWR("tipos-chave-pix-bancaria", getTiposChavePix, {
    revalidateOnFocus: false,
  });

  const items: DadosBancariosItem[] = listData?.data || [];
  const meta = listData?.meta;
  const resumo = meta?.resumo;

  const bancos = options?.bancos || [];
  const clientes = options?.clientes || [];
  const advogados = options?.advogados || [];
  const colaboradores = options?.colaboradores || [];

  const bancosSet = useMemo(() => new Set(bancos.map((b: any) => b.codigo)), [bancos]);
  const clientesSet = useMemo(() => new Set(clientes.map((c: any) => c.id)), [clientes]);
  const advogadosSet = useMemo(() => new Set(advogados.map((a: any) => a.id)), [advogados]);
  const colaboradoresSet = useMemo(
    () => new Set(colaboradores.map((u: any) => u.id)),
    [colaboradores],
  );

  const tipoContaItems = tiposContaData?.data || [];
  const tipoContaBancariaItems = tiposContaBancariaData?.data || [];
  const tipoPixItems = tiposPixData?.data || [];
  const clienteOptions = useMemo(
    () => [
      {
        key: "",
        label: "Todos os clientes",
        textValue: "Todos os clientes",
        description: "Remove o filtro ou vínculo de cliente",
      },
      ...clientes.map((cliente: any) => ({
        key: cliente.id,
        label: cliente.nome,
        textValue: [cliente.nome, cliente.documento || "", cliente.email || ""]
          .filter(Boolean)
          .join(" "),
        description: cliente.documento || cliente.email || undefined,
      })),
    ],
    [clientes],
  );
  const advogadoOptions = useMemo(
    () => [
      {
        key: "",
        label: "Todos os advogados",
        textValue: "Todos os advogados",
        description: "Remove o filtro de advogado",
      },
      ...advogados.map((advogado: any) => {
        const nome =
          `${advogado.usuario.firstName || ""} ${
            advogado.usuario.lastName || ""
          }`.trim() || advogado.usuario.email;

        return {
          key: advogado.id,
          label: nome,
          textValue: [nome, advogado.usuario.email || ""]
            .filter(Boolean)
            .join(" "),
          description: advogado.usuario.email || undefined,
        };
      }),
    ],
    [advogados],
  );
  const colaboradorOptions = useMemo(
    () =>
      colaboradores.map((item: any) => {
        const nome =
          `${item.firstName || ""} ${item.lastName || ""}`.trim() || item.email;

        return {
          key: item.id,
          label: nome,
          textValue: [nome, item.email || ""].filter(Boolean).join(" "),
          description: item.email || undefined,
        };
      }),
    [colaboradores],
  );
  const bancoOptions = useMemo(
    () =>
      bancos.map((banco: any) => ({
        key: banco.codigo,
        label: banco.nome,
        textValue: [banco.codigo, banco.nome].filter(Boolean).join(" "),
        description: banco.codigo || undefined,
      })),
    [bancos],
  );

  const activeFilters = [
    search,
    bancoCodigo,
    tipoConta,
    tipoContaBancaria,
    filtroStatus !== "TODOS" ? filtroStatus : "",
    filtroPrincipal !== "TODOS" ? filtroPrincipal : "",
    clienteId,
    advogadoId,
    onlyMine ? "mine" : "",
  ].filter(Boolean).length;

  const openCreateModal = () => {
    setEditingItem(null);
    setForm({ ...DEFAULT_FORM, usuarioId: currentUserId });
    setIsModalOpen(true);
  };

  const openEditModal = (item: DadosBancariosItem) => {
    setEditingItem(item);
    setForm(toForm(item, currentUserId));
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setIsModalOpen(false);
    setEditingItem(null);
    setForm(DEFAULT_FORM);
  };

  const handleDelete = async (item: DadosBancariosItem) => {
    if (!confirm(`Remover conta bancária de ${item.titularNome}?`)) {
      return;
    }

    const result = await deleteDadosBancarios(item.id);

    if (!result.success) {
      toast.error(result.error || "Erro ao remover conta bancária");
      return;
    }

    toast.success("Conta bancária removida");
    mutate();
  };

  const handleSubmit = async () => {
    if (!form.bancoCodigo || !form.agencia || !form.conta) {
      toast.error("Banco, agência e conta são obrigatórios");
      return;
    }

    if (!form.titularNome || !form.titularDocumento) {
      toast.error("Titular e documento são obrigatórios");
      return;
    }

    const payload = {
      tipoConta: form.tipoConta,
      bancoCodigo: form.bancoCodigo,
      agencia: form.agencia,
      conta: form.conta,
      digitoConta: form.digitoConta || undefined,
      tipoContaBancaria: form.tipoContaBancaria,
      chavePix: form.chavePix || undefined,
      tipoChavePix: form.chavePix ? form.tipoChavePix : undefined,
      titularNome: form.titularNome,
      titularDocumento: form.titularDocumento,
      titularEmail: form.titularEmail || undefined,
      titularTelefone: form.titularTelefone || undefined,
      endereco: form.endereco || undefined,
      cidade: form.cidade || undefined,
      estado: form.estado || undefined,
      cep: form.cep || undefined,
      ativo: form.ativo,
      principal: form.principal,
      observacoes: form.observacoes || undefined,
      usuarioId:
        form.linkType === "USUARIO"
          ? form.usuarioId || undefined
          : form.linkType === "ME"
            ? currentUserId || undefined
            : undefined,
      clienteId: form.linkType === "CLIENTE" ? form.clienteId || undefined : undefined,
    };

    if (canManageGlobal && form.linkType === "USUARIO" && !form.usuarioId) {
      toast.error("Selecione o usuário da conta");
      return;
    }

    if (form.linkType === "CLIENTE" && !form.clienteId) {
      toast.error("Selecione o cliente da conta");
      return;
    }

    setSaving(true);
    try {
      const result = editingItem
        ? await updateDadosBancarios(editingItem.id, payload)
        : await createDadosBancarios(payload);

      if (!result.success) {
        toast.error(result.error || "Erro ao salvar conta bancária");
        return;
      }

      toast.success(
        editingItem ? "Conta bancária atualizada" : "Conta bancária criada",
      );
      closeModal();
      mutate();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-3 py-8 sm:px-6">
      <PeoplePageHeader
        tag="Financeiro"
        title="Dados bancários"
        description="Gestão de contas bancárias de usuários e clientes do escritório, com escopo por papel e conta principal por vínculo."
        actions={
          <Button
            color="primary"
            radius="full"
            startContent={<Plus className="h-4 w-4" />}
            onPress={openCreateModal}
          >
            Nova conta
          </Button>
        }
      />

      {error && (
        <Card className="border border-danger/30 bg-danger/10">
          <CardBody className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base font-semibold text-danger">
                Erro ao carregar dados bancários
              </p>
              <p className="text-sm text-danger/80">
                {(error as Error).message || "Falha inesperada na listagem."}
              </p>
            </div>
            <Button color="danger" variant="flat" onPress={() => mutate()}>
              Tentar novamente
            </Button>
          </CardBody>
        </Card>
      )}

      {resumo && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <PeopleMetricCard
            helper="Contas no escopo atual"
            icon={<Landmark className="h-4 w-4" />}
            label="Total"
            tone="primary"
            value={resumo.total}
          />
          <PeopleMetricCard
            helper="Contas habilitadas para uso"
            icon={<CheckCircle className="h-4 w-4" />}
            label="Ativas"
            tone="success"
            value={resumo.ativos}
          />
          <PeopleMetricCard
            helper="Conta principal por vínculo"
            icon={<Star className="h-4 w-4" />}
            label="Principais"
            tone="warning"
            value={resumo.principais}
          />
          <PeopleMetricCard
            helper="Chave PIX cadastrada"
            icon={<Wallet className="h-4 w-4" />}
            label="Com PIX"
            tone="secondary"
            value={resumo.comPix}
          />
        </div>
      )}

      <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-semibold">Filtros</p>
              <p className="text-xs text-default-500">
                {activeFilters} filtro(s) ativo(s)
              </p>
            </div>
          </div>
          {canViewGlobal && (
            <div className="flex items-center gap-2 text-xs text-default-500">
              <Switch
                isSelected={onlyMine}
                size="sm"
                onValueChange={(value) => {
                  setOnlyMine(value);
                  setPage(1);
                }}
              />
              Mostrar só minhas contas
            </div>
          )}
        </CardHeader>
        <CardBody className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Input
            placeholder="Titular, documento, banco, chave PIX"
            startContent={<Search className="h-4 w-4 text-default-400" />}
            value={search}
            variant="bordered"
            onValueChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
          />

          <Select
            placeholder="Banco"
            selectedKeys={withOption(bancosSet.has(bancoCodigo) ? bancoCodigo : "")}
            variant="bordered"
            onSelectionChange={(keys) => {
              setBancoCodigo(getSingleSelection(keys));
              setPage(1);
            }}
          >
            <SelectItem key="" textValue="Todos os bancos">
              Todos os bancos
            </SelectItem>
            {
              bancos.map((banco: any) => (
                <SelectItem key={banco.codigo} textValue={banco.nome}>
                  {banco.nome}
                </SelectItem>
              )) as any
            }
          </Select>

          <Select
            placeholder="Tipo de titular"
            selectedKeys={withOption(tipoConta)}
            variant="bordered"
            onSelectionChange={(keys) => {
              setTipoConta(getSingleSelection(keys));
              setPage(1);
            }}
          >
            <SelectItem key="" textValue="Todos os tipos de titular">
              Todos os tipos de titular
            </SelectItem>
            {
              tipoContaItems.map((item: any) => (
                <SelectItem key={item.value} textValue={item.label}>
                  {item.label}
                </SelectItem>
              )) as any
            }
          </Select>

          <Select
            placeholder="Tipo de conta"
            selectedKeys={withOption(tipoContaBancaria)}
            variant="bordered"
            onSelectionChange={(keys) => {
              setTipoContaBancaria(getSingleSelection(keys));
              setPage(1);
            }}
          >
            <SelectItem key="" textValue="Todos os tipos de conta">
              Todos os tipos de conta
            </SelectItem>
            {
              tipoContaBancariaItems.map((item: any) => (
                <SelectItem key={item.value} textValue={item.label}>
                  {item.label}
                </SelectItem>
              )) as any
            }
          </Select>

          <Select
            placeholder="Status"
            selectedKeys={withOption(filtroStatus)}
            variant="bordered"
            onSelectionChange={(keys) => {
              setFiltroStatus(getSingleSelection(keys) || "TODOS");
              setPage(1);
            }}
          >
            <SelectItem key="TODOS" textValue="Todos os status">
              Todos os status
            </SelectItem>
            <SelectItem key="ATIVOS" textValue="Ativas">
              Ativas
            </SelectItem>
            <SelectItem key="INATIVOS" textValue="Inativas">
              Inativas
            </SelectItem>
          </Select>

          <Select
            placeholder="Principal"
            selectedKeys={withOption(filtroPrincipal)}
            variant="bordered"
            onSelectionChange={(keys) => {
              setFiltroPrincipal(getSingleSelection(keys) || "TODOS");
              setPage(1);
            }}
          >
            <SelectItem key="TODOS" textValue="Principal: todos">
              Principal: todos
            </SelectItem>
            <SelectItem key="SIM" textValue="Somente principal">
              Somente principal
            </SelectItem>
            <SelectItem key="NAO" textValue="Somente não principal">
              Somente não principal
            </SelectItem>
          </Select>

          <SearchableSelect
            emptyContent="Nenhum cliente encontrado"
            isClearable={false}
            items={clienteOptions}
            placeholder="Cliente"
            selectedKey={clientesSet.has(clienteId) ? clienteId : ""}
            variant="bordered"
            onSelectionChange={(selectedKey) => {
              setClienteId(selectedKey || "");
              setPage(1);
            }}
          />

          {canViewGlobal && (
            <SearchableSelect
              emptyContent="Nenhum advogado encontrado"
              isClearable={false}
              items={advogadoOptions}
              placeholder="Advogado"
              selectedKey={advogadosSet.has(advogadoId) ? advogadoId : ""}
              variant="bordered"
              onSelectionChange={(selectedKey) => {
                setAdvogadoId(selectedKey || "");
                setPage(1);
              }}
            />
          )}
        </CardBody>
      </Card>

      <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
        <CardHeader className="flex items-center justify-between">
          <p className="text-lg font-semibold text-white">Contas bancárias</p>
          <Chip color="primary" variant="flat">
            {meta?.total || 0} registro(s)
          </Chip>
        </CardHeader>
        <CardBody>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center">
              <CreditCard className="mx-auto mb-3 h-10 w-10 text-default-300" />
              <p className="text-base font-semibold text-white">
                Nenhuma conta encontrada no escopo atual
              </p>
              <p className="mt-1 text-sm text-default-500">
                Ajuste filtros ou cadastre uma nova conta.
              </p>
            </div>
          ) : (
            <>
              <Table aria-label="Tabela de contas bancárias">
                <TableHeader>
                  <TableColumn>TITULAR</TableColumn>
                  <TableColumn>VÍNCULO</TableColumn>
                  <TableColumn>BANCO</TableColumn>
                  <TableColumn>CONTA</TableColumn>
                  <TableColumn>PIX</TableColumn>
                  <TableColumn>STATUS</TableColumn>
                  <TableColumn>AÇÕES</TableColumn>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const owner = formatOwner(item);

                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-white">
                              {item.titularNome}
                            </p>
                            <p className="text-xs text-default-500">
                              {item.titularDocumento}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="text-sm text-white">{owner.label}</p>
                            <Chip color={owner.color} size="sm" variant="flat">
                              {owner.helper}
                            </Chip>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="text-sm text-white">
                              {item.banco?.nome || item.bancoCodigo}
                            </p>
                            <p className="text-xs text-default-500">
                              Código: {item.bancoCodigo}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="text-sm text-white">
                              Ag {item.agencia} · CC {item.conta}
                              {item.digitoConta ? `-${item.digitoConta}` : ""}
                            </p>
                            <p className="text-xs text-default-500">
                              {item.tipoContaBancaria}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {item.chavePix ? (
                            <div className="space-y-1">
                              <p className="max-w-[200px] truncate text-sm text-white">
                                {item.chavePix}
                              </p>
                              <p className="text-xs text-default-500">
                                {item.tipoChavePix || "PIX"}
                              </p>
                            </div>
                          ) : (
                            <p className="text-xs text-default-500">Não cadastrado</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Chip
                              color={item.ativo ? "success" : "default"}
                              size="sm"
                              variant="flat"
                            >
                              {item.ativo ? "Ativa" : "Inativa"}
                            </Chip>
                            {item.principal && (
                              <Chip color="warning" size="sm" variant="flat">
                                Principal
                              </Chip>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              isIconOnly
                              size="sm"
                              variant="bordered"
                              onPress={() => openEditModal(item)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              isIconOnly
                              color="danger"
                              size="sm"
                              variant="flat"
                              onPress={() => handleDelete(item)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {(meta?.totalPages || 1) > 1 && (
                <div className="mt-6 flex justify-center">
                  <Pagination
                    showControls
                    page={page}
                    total={meta?.totalPages || 1}
                    onChange={setPage}
                  />
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>

      <Modal isOpen={isModalOpen} placement="top-center" size="4xl" onClose={closeModal}>
        <ModalContent>
          <ModalHeader>
            <div>
              <p className="text-lg font-semibold text-white">
                {editingItem ? "Editar conta bancária" : "Nova conta bancária"}
              </p>
              <p className="text-xs text-default-500">
                Defina vínculo, dados da conta e sinalize a principal quando necessário.
              </p>
            </div>
          </ModalHeader>
          <ModalBody>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {canManageGlobal ? (
                <Select
                  label="Vínculo"
                  selectedKeys={withOption(form.linkType)}
                  variant="bordered"
                  onSelectionChange={(keys) => {
                    const value = (getSingleSelection(keys) || "ME") as FormState["linkType"];
                    setForm((prev) => ({ ...prev, linkType: value }));
                  }}
                >
                  <SelectItem key="ME" textValue="Minha conta">
                    Minha conta
                  </SelectItem>
                  <SelectItem key="USUARIO" textValue="Usuário interno">
                    Usuário interno
                  </SelectItem>
                  <SelectItem key="CLIENTE" textValue="Cliente">
                    Cliente
                  </SelectItem>
                </Select>
              ) : (
                <Input
                  isReadOnly
                  label="Vínculo"
                  value={form.linkType === "CLIENTE" ? "Cliente" : "Minha conta"}
                  variant="bordered"
                />
              )}

              {canManageGlobal ? (
                form.linkType === "USUARIO" ? (
                  <SearchableSelect
                    emptyContent="Nenhum usuário encontrado"
                    items={colaboradorOptions}
                    label="Usuário"
                    selectedKey={
                      colaboradoresSet.has(form.usuarioId) ? form.usuarioId : null
                    }
                    variant="bordered"
                    onSelectionChange={(selectedKey) => {
                      setForm((prev) => ({
                        ...prev,
                        usuarioId: selectedKey || "",
                        clienteId: "",
                      }));
                    }}
                  />
                ) : form.linkType === "CLIENTE" ? (
                  <SearchableSelect
                    emptyContent="Nenhum cliente encontrado"
                    items={clienteOptions.filter((item) => item.key !== "")}
                    label="Cliente"
                    selectedKey={
                      clientesSet.has(form.clienteId) ? form.clienteId : null
                    }
                    variant="bordered"
                    onSelectionChange={(selectedKey) => {
                      setForm((prev) => ({
                        ...prev,
                        clienteId: selectedKey || "",
                        usuarioId: "",
                        linkType: "CLIENTE",
                      }));
                    }}
                  />
                ) : (
                  <Input
                    isReadOnly
                    label="Vínculo selecionado"
                    value="Minha conta"
                    variant="bordered"
                  />
                )
              ) : canLinkCliente ? (
                <SearchableSelect
                  emptyContent="Nenhum cliente encontrado"
                  isClearable={false}
                  items={clienteOptions}
                  label="Vincular a cliente (opcional)"
                  selectedKey={clientesSet.has(form.clienteId) ? form.clienteId : ""}
                  variant="bordered"
                  onSelectionChange={(selected) => {
                    setForm((prev) => ({
                      ...prev,
                      clienteId: selected || "",
                      usuarioId: "",
                      linkType: selected ? "CLIENTE" : "ME",
                    }));
                  }}
                />
              ) : (
                <Input
                  isReadOnly
                  label="Vínculo"
                  value="Conta vinculada ao meu usuário"
                  variant="bordered"
                />
              )}

              <SearchableSelect
                emptyContent="Nenhum banco encontrado"
                items={bancoOptions}
                isRequired
                label="Banco"
                selectedKey={
                  bancosSet.has(form.bancoCodigo) ? form.bancoCodigo : null
                }
                startContent={<Building className="h-4 w-4 text-default-400" />}
                variant="bordered"
                onSelectionChange={(selectedKey) =>
                  setForm((prev) => ({ ...prev, bancoCodigo: selectedKey || "" }))
                }
              />

              <Select
                isRequired
                label="Tipo de titular"
                selectedKeys={withOption(form.tipoConta)}
                startContent={<User className="h-4 w-4 text-default-400" />}
                variant="bordered"
                onSelectionChange={(keys) =>
                  setForm((prev) => ({
                    ...prev,
                    tipoConta: (getSingleSelection(keys) || "PESSOA_FISICA") as FormState["tipoConta"],
                  }))
                }
              >
                {tipoContaItems.map((item: any) => (
                  <SelectItem key={item.value} textValue={item.label}>
                    {item.label}
                  </SelectItem>
                ))}
              </Select>

              <Input
                isRequired
                label="Agência"
                value={form.agencia}
                variant="bordered"
                onValueChange={(value) => setForm((prev) => ({ ...prev, agencia: value }))}
              />
              <Input
                isRequired
                label="Conta"
                value={form.conta}
                variant="bordered"
                onValueChange={(value) => setForm((prev) => ({ ...prev, conta: value }))}
              />
              <Input
                label="Dígito"
                value={form.digitoConta}
                variant="bordered"
                onValueChange={(value) => setForm((prev) => ({ ...prev, digitoConta: value }))}
              />

              <Select
                isRequired
                label="Tipo de conta bancária"
                selectedKeys={withOption(form.tipoContaBancaria)}
                startContent={<CreditCard className="h-4 w-4 text-default-400" />}
                variant="bordered"
                onSelectionChange={(keys) =>
                  setForm((prev) => ({
                    ...prev,
                    tipoContaBancaria: (getSingleSelection(keys) || "CORRENTE") as FormState["tipoContaBancaria"],
                  }))
                }
              >
                {tipoContaBancariaItems.map((item: any) => (
                  <SelectItem key={item.value} textValue={item.label}>
                    {item.label}
                  </SelectItem>
                ))}
              </Select>

              <Input
                isRequired
                label="Titular"
                value={form.titularNome}
                variant="bordered"
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, titularNome: value }))
                }
              />
              <Input
                isRequired
                label="CPF/CNPJ do titular"
                value={form.titularDocumento}
                variant="bordered"
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, titularDocumento: value }))
                }
              />

              <Input
                label="E-mail do titular"
                type="email"
                value={form.titularEmail}
                variant="bordered"
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, titularEmail: value }))
                }
              />
              <Input
                label="Telefone do titular"
                value={form.titularTelefone}
                variant="bordered"
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, titularTelefone: value }))
                }
              />

              <Select
                label="Tipo chave PIX"
                selectedKeys={withOption(form.tipoChavePix)}
                startContent={<Shield className="h-4 w-4 text-default-400" />}
                variant="bordered"
                onSelectionChange={(keys) =>
                  setForm((prev) => ({
                    ...prev,
                    tipoChavePix: (getSingleSelection(keys) || "CPF") as FormState["tipoChavePix"],
                  }))
                }
              >
                {tipoPixItems.map((item: any) => (
                  <SelectItem key={item.value} textValue={item.label}>
                    {item.label}
                  </SelectItem>
                ))}
              </Select>
              <Input
                label="Chave PIX"
                value={form.chavePix}
                variant="bordered"
                onValueChange={(value) => setForm((prev) => ({ ...prev, chavePix: value }))}
              />

              <Input
                label="CEP"
                value={form.cep}
                variant="bordered"
                onValueChange={(value) => setForm((prev) => ({ ...prev, cep: value }))}
              />
              <Input
                label="Cidade"
                value={form.cidade}
                variant="bordered"
                onValueChange={(value) => setForm((prev) => ({ ...prev, cidade: value }))}
              />
              <Input
                label="Estado"
                value={form.estado}
                variant="bordered"
                onValueChange={(value) => setForm((prev) => ({ ...prev, estado: value }))}
              />
              <Input
                className="md:col-span-2"
                label="Endereço"
                value={form.endereco}
                variant="bordered"
                onValueChange={(value) => setForm((prev) => ({ ...prev, endereco: value }))}
              />

              <div className="md:col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-white">Conta ativa</p>
                    <Switch
                      isSelected={form.ativo}
                      onValueChange={(value) =>
                        setForm((prev) => ({ ...prev, ativo: value }))
                      }
                    />
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-white">Conta principal</p>
                    <Switch
                      color="warning"
                      isSelected={form.principal}
                      onValueChange={(value) =>
                        setForm((prev) => ({ ...prev, principal: value }))
                      }
                    />
                  </div>
                </div>
              </div>

              <Textarea
                className="md:col-span-2"
                label="Observações"
                minRows={3}
                value={form.observacoes}
                variant="bordered"
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, observacoes: value }))
                }
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={closeModal}>
              Cancelar
            </Button>
            <Button
              color="primary"
              isLoading={saving}
              startContent={!saving ? <CheckCircle className="h-4 w-4" /> : undefined}
              onPress={handleSubmit}
            >
              {editingItem ? "Salvar alterações" : "Criar conta"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </section>
  );
}
