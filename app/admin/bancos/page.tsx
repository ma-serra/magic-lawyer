"use client";

import type { Key, ReactNode } from "react";
import { useState } from "react";
import useSWR from "swr";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Progress,
  Select,
  SelectItem,
  Spinner,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  useDisclosure,
} from "@heroui/react";
import {
  AlertTriangle,
  BadgeInfo,
  Building2,
  CircleOff,
  Eye,
  FileDigit,
  Globe,
  Landmark,
  Pencil,
  Phone,
  Plus,
  Power,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
  WalletCards,
} from "lucide-react";

import {
  createBanco,
  deleteBanco,
  getDashboardBancos,
  listBancos,
  toggleBancoStatus,
  updateBanco,
} from "@/app/actions/bancos";
import type {
  BancoCatalogRow,
  BancoCreateInput,
  BancoDashboardData,
  BancoListFilters,
  BancoQualityFilter,
  BancoUsageFilter,
} from "@/app/actions/bancos";
import { toast } from "@/lib/toast";

type StatusFilter = "all" | "active" | "inactive";
type ModalMode = "create" | "edit" | "view";

const STATUS_OPTIONS: Array<{ key: StatusFilter; label: string }> = [
  { key: "all", label: "Todos os status" },
  { key: "active", label: "Ativos" },
  { key: "inactive", label: "Inativos" },
];

const USAGE_OPTIONS: Array<{ key: "all" | BancoUsageFilter; label: string }> = [
  { key: "all", label: "Todo o catálogo" },
  { key: "used", label: "Somente em uso" },
  { key: "unused", label: "Sem uso" },
];

const QUALITY_OPTIONS: Array<{ key: "all" | BancoQualityFilter; label: string }> =
  [
    { key: "all", label: "Toda a qualidade" },
    { key: "anomaly", label: "Com anomalia" },
    { key: "clean", label: "Sem anomalia" },
  ];

function getSingleSelection<T extends string>(value: unknown, fallback: T): T {
  const selected = Array.from(value as Iterable<Key>)[0];

  return typeof selected === "string" ? (selected as T) : fallback;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function compactText(value: string | null | undefined) {
  return value?.trim() || "Nao informado";
}

function getQualityTone(
  severity: "warning" | "danger",
): "warning" | "danger" {
  return severity === "danger" ? "danger" : "warning";
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="space-y-1 rounded-2xl border border-default-100 bg-default-50/40 p-3 dark:border-white/10 dark:bg-background/40">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
        {label}
      </p>
      <p className="text-sm text-foreground">{value || "Nao informado"}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  helper,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  helper: string;
  icon: ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClasses =
    tone === "success"
      ? "border-success/25 bg-success/5"
      : tone === "warning"
        ? "border-warning/25 bg-warning/5"
        : tone === "danger"
          ? "border-danger/25 bg-danger/5"
          : "border-default-100 bg-default-50/50 dark:border-white/10 dark:bg-background/40";

  return (
    <Card className={`border ${toneClasses}`}>
      <CardBody className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="rounded-2xl border border-white/10 bg-background/60 p-3 text-default-600">
            {icon}
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
            {label}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-3xl font-semibold text-foreground">{value}</p>
          <p className="text-sm text-default-500">{helper}</p>
        </div>
      </CardBody>
    </Card>
  );
}

function EmptyPanel({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-3xl border border-dashed border-default-200 bg-default-50/30 px-6 py-10 text-center dark:border-white/10 dark:bg-background/30">
      <div className="mb-4 rounded-3xl border border-default-200 bg-background p-4 text-default-500 dark:border-white/10">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-xl text-sm text-default-500">{description}</p>
    </div>
  );
}

export default function BancosAdminPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [usageFilter, setUsageFilter] = useState<"all" | BancoUsageFilter>("all");
  const [qualityFilter, setQualityFilter] = useState<"all" | BancoQualityFilter>(
    "all",
  );
  const [selectedBanco, setSelectedBanco] = useState<BancoCatalogRow | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<
    BancoCreateInput & { ativo?: boolean }
  >({
    codigo: "",
    nome: "",
    nomeCompleto: "",
    site: "",
    telefone: "",
    cnpj: "",
    ispb: "",
    ativo: true,
  });

  const { isOpen, onOpen, onClose } = useDisclosure();

  const bancoFilters: BancoListFilters = {
    search: searchTerm || undefined,
    ativo:
      statusFilter === "all"
        ? undefined
        : statusFilter === "active"
          ? true
          : false,
    usage: usageFilter === "all" ? undefined : usageFilter,
    quality: qualityFilter === "all" ? undefined : qualityFilter,
    limit: 100,
  };

  const {
    data: bancosResponse,
    isLoading: loadingBancos,
    mutate: mutateBancos,
  } = useSWR(["admin-bancos", bancoFilters], () => listBancos(bancoFilters), {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    focusThrottleInterval: 1500,
  });

  const {
    data: dashboardResponse,
    isLoading: loadingDashboard,
    mutate: mutateDashboard,
  } = useSWR("admin-bancos-dashboard", getDashboardBancos, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    focusThrottleInterval: 1500,
  });

  const bancos: BancoCatalogRow[] =
    bancosResponse && bancosResponse.success && Array.isArray(bancosResponse.bancos)
      ? bancosResponse.bancos
      : [];
  const dashboard = dashboardResponse?.success
    ? (dashboardResponse.dashboard as BancoDashboardData)
    : null;

  function resetForm() {
    setFormData({
      codigo: "",
      nome: "",
      nomeCompleto: "",
      site: "",
      telefone: "",
      cnpj: "",
      ispb: "",
      ativo: true,
    });
  }

  function openModal(mode: ModalMode, banco?: BancoCatalogRow) {
    setModalMode(mode);
    setSelectedBanco(banco || null);

    if (!banco) {
      resetForm();
    } else {
      setFormData({
        codigo: banco.codigo,
        nome: banco.nome,
        nomeCompleto: banco.nomeCompleto || "",
        site: banco.site || "",
        telefone: banco.telefone || "",
        cnpj: banco.cnpj || "",
        ispb: banco.ispb || "",
        ativo: banco.ativo,
      });
    }

    onOpen();
  }

  function closeModal() {
    onClose();
    setSelectedBanco(null);
    resetForm();
  }

  async function refreshAll() {
    await Promise.all([mutateBancos(), mutateDashboard()]);
  }

  async function handleSubmit() {
    setSubmitting(true);

    try {
      const result =
        modalMode === "create"
          ? await createBanco(formData)
          : selectedBanco
            ? await updateBanco(selectedBanco.codigo, formData)
            : null;

      if (!result) {
        toast.error("Nenhum banco selecionado para atualizar.");

        return;
      }

      if (!result.success) {
        toast.error(result.error || "Nao foi possivel salvar a instituicao.");

        return;
      }

      toast.success(
        modalMode === "create"
          ? "Instituicao adicionada ao catalogo."
          : "Catalogo bancario atualizado.",
      );
      closeModal();
      await refreshAll();
    } catch (error) {
      toast.error("Erro interno ao salvar a instituicao.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(banco: BancoCatalogRow) {
    if (banco.linkedAccounts > 0) {
      toast.error(
        "Esse banco ainda esta em uso. Desative para novos cadastros em vez de excluir.",
      );

      return;
    }

    if (
      !confirm(
        `Excluir ${banco.nome} do catalogo? Essa acao remove a instituicao apenas porque ela nao possui nenhum vinculo ativo.`,
      )
    ) {
      return;
    }

    setSubmitting(true);

    try {
      const result = await deleteBanco(banco.codigo);

      if (!result.success) {
        toast.error(result.error || "Nao foi possivel excluir a instituicao.");

        return;
      }

      toast.success("Instituicao removida do catalogo.");
      await refreshAll();
    } catch (error) {
      toast.error("Erro interno ao excluir a instituicao.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStatus(banco: BancoCatalogRow) {
    const actionLabel = banco.ativo ? "desativar" : "reativar";
    const warning =
      banco.linkedAccounts > 0 && banco.ativo
        ? " Ela continuara vinculada aos cadastros existentes, mas deixara de aparecer para novos registros."
        : "";

    if (
      !confirm(
        `Deseja ${actionLabel} ${banco.nome}?${warning}`,
      )
    ) {
      return;
    }

    setSubmitting(true);

    try {
      const result = await toggleBancoStatus(banco.codigo);

      if (!result.success) {
        toast.error(result.error || "Nao foi possivel alterar o status.");

        return;
      }

      toast.success(
        banco.ativo
          ? "Instituicao desativada para novos cadastros."
          : "Instituicao reativada no catalogo.",
      );
      await refreshAll();
    } catch (error) {
      toast.error("Erro interno ao alterar o status.");
    } finally {
      setSubmitting(false);
    }
  }

  const loading = loadingBancos || loadingDashboard;

  return (
    <div className="space-y-6 p-6">
      <Card className="border border-default-100 dark:border-white/10">
        <CardBody className="gap-6 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
                <Landmark className="h-3.5 w-3.5" />
                Catalogo bancario
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold text-foreground">
                  Instituicoes financeiras que alimentam o produto
                </h1>
                <p className="text-sm leading-6 text-default-500">
                  Esse catalogo existe para padronizar o banco exibido em dados
                  bancarios de escritorio, usuarios, clientes, contratos,
                  honorarios e parcelas. Alterar aqui impacta novos cadastros e
                  a leitura operacional do sistema inteiro.
                </p>
              </div>
            </div>

            <Button
              color="primary"
              startContent={<Plus className="h-4 w-4" />}
              onPress={() => openModal("create")}
            >
              Adicionar instituicao
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-default-100 bg-default-50/40 p-5 dark:border-white/10 dark:bg-background/30">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl border border-default-200 bg-background p-3 text-default-600 dark:border-white/10">
                  <BadgeInfo className="h-5 w-5" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">
                    Quando essa tela faz sentido
                  </p>
                  <p className="text-sm leading-6 text-default-500">
                    Sempre que o sistema precisar reconhecer corretamente uma
                    instituicao financeira em selects, fichas de conta, fluxo de
                    recebimento ou geracao de dados de pagamento.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-warning/20 bg-warning/5 p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl border border-warning/30 bg-background p-3 text-warning">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">
                    Regra operacional
                  </p>
                  <p className="text-sm leading-6 text-default-500">
                    Excluir so faz sentido para instituicao sem uso. Para bancos
                    ja vinculados, o fluxo correto e desativar para novos
                    cadastros e corrigir metadados com cuidado.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {dashboard ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            helper="Instituicoes ativas e inativas no catalogo"
            icon={<Building2 className="h-5 w-5" />}
            label="Catalogo"
            value={formatNumber(dashboard.totalBancos)}
          />
          <MetricCard
            helper={`${formatNumber(dashboard.contasVinculadas)} conta(s) e ${formatNumber(dashboard.tenantsImpactados)} escritorio(s) impactado(s)`}
            icon={<WalletCards className="h-5 w-5" />}
            label="Em uso"
            tone="success"
            value={formatNumber(dashboard.bancosEmUso)}
          />
          <MetricCard
            helper="Instituicoes hoje sem nenhum cadastro vinculado"
            icon={<CircleOff className="h-5 w-5" />}
            label="Sem uso"
            value={formatNumber(dashboard.bancosSemUso)}
          />
          <MetricCard
            helper={`${formatNumber(dashboard.distribuicaoCadastros.cliente)} cadastro(s) de clientes usam esse catalogo`}
            icon={<Users className="h-5 w-5" />}
            label="Cadastros vinculados"
            value={formatNumber(dashboard.contasVinculadas)}
          />
          <MetricCard
            helper={`${formatNumber(dashboard.contasEmAnomalia)} conta(s) vinculada(s) a bancos com conflito de qualidade`}
            icon={<ShieldAlert className="h-5 w-5" />}
            label="Anomalias"
            tone={dashboard.anomaliasCatalogo > 0 ? "warning" : "success"}
            value={formatNumber(dashboard.anomaliasCatalogo)}
          />
        </div>
      ) : loading ? (
        <Card className="border border-default-100 dark:border-white/10">
          <CardBody className="flex min-h-40 items-center justify-center">
            <Spinner label="Carregando panorama do catalogo bancario..." />
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border border-default-100 dark:border-white/10">
          <CardHeader className="flex flex-col items-start gap-1">
            <h2 className="text-lg font-semibold text-foreground">
              Instituicoes mais usadas
            </h2>
            <p className="text-sm text-default-500">
              Priorize revisao de metadados nas instituicoes com mais contas
              vinculadas.
            </p>
          </CardHeader>
          <CardBody className="space-y-4">
            {dashboard?.bancosMaisUsados.length ? (
              dashboard.bancosMaisUsados.map((banco) => {
                const maxValue =
                  dashboard.bancosMaisUsados[0]?.linkedAccounts || 1;
                const progress = (banco.linkedAccounts / maxValue) * 100;

                return (
                  <div
                    key={banco.codigo}
                    className="space-y-2 rounded-2xl border border-default-100 bg-default-50/40 p-4 dark:border-white/10 dark:bg-background/30"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {banco.nome}
                        </p>
                        <p className="text-xs text-default-500">
                          COMPE {banco.codigo} · {formatNumber(banco.impactedTenants)}{" "}
                          escritorio(s)
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-foreground">
                        {formatNumber(banco.linkedAccounts)} conta(s)
                      </p>
                    </div>
                    <Progress
                      aria-label={`Uso do banco ${banco.nome}`}
                      className="max-w-full"
                      color="primary"
                      value={progress}
                    />
                  </div>
                );
              })
            ) : (
              <EmptyPanel
                description="O ranking de uso aparecera assim que houver contas vinculadas ao catalogo."
                icon={<WalletCards className="h-6 w-6" />}
                title="Nenhuma instituicao em uso"
              />
            )}
          </CardBody>
        </Card>

        <Card className="border border-default-100 dark:border-white/10">
          <CardHeader className="flex flex-col items-start gap-1">
            <h2 className="text-lg font-semibold text-foreground">
              Saude do catalogo
            </h2>
            <p className="text-sm text-default-500">
              Conflitos de ISPB ou de identidade devem ser resolvidos antes de
              tratar esta base como fonte oficial.
            </p>
          </CardHeader>
          <CardBody className="space-y-4">
            {dashboard?.bancosComAnomalia.length ? (
              dashboard.bancosComAnomalia.map((banco) => (
                <div
                  key={banco.codigo}
                  className="space-y-3 rounded-2xl border border-warning/20 bg-warning/5 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {banco.nome}
                      </p>
                      <p className="text-xs text-default-500">
                        COMPE {banco.codigo} · {formatNumber(banco.linkedAccounts)}{" "}
                        conta(s) vinculada(s)
                      </p>
                    </div>
                    <Chip color="warning" size="sm" variant="flat">
                      Revisar
                    </Chip>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {banco.qualitySignals.map((signal) => (
                      <Chip
                        key={`${banco.codigo}-${signal.code}`}
                        color={getQualityTone(signal.severity)}
                        size="sm"
                        variant="flat"
                      >
                        {signal.label}
                      </Chip>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-3xl border border-success/25 bg-success/5 p-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl border border-success/20 bg-background p-3 text-success">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      Sem anomalias detectadas
                    </p>
                    <p className="text-sm text-default-500">
                      O catalogo atual nao possui conflitos internos de nome ou
                      ISPB.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {dashboard ? (
              <div className="grid gap-3 rounded-2xl border border-default-100 bg-default-50/40 p-4 dark:border-white/10 dark:bg-background/30">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                  Distribuicao dos cadastros vinculados
                </p>
                <div className="flex flex-wrap gap-2">
                  <Chip size="sm" variant="flat">
                    Escritorio: {formatNumber(dashboard.distribuicaoCadastros.escritorio)}
                  </Chip>
                  <Chip size="sm" variant="flat">
                    Equipe: {formatNumber(dashboard.distribuicaoCadastros.usuario)}
                  </Chip>
                  <Chip size="sm" variant="flat">
                    Cliente: {formatNumber(dashboard.distribuicaoCadastros.cliente)}
                  </Chip>
                </div>
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <Card className="border border-default-100 dark:border-white/10">
        <CardBody className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_220px_220px_220px]">
          <Input
            aria-label="Buscar bancos"
            placeholder="Buscar por codigo COMPE, nome, ISPB ou CNPJ..."
            startContent={<Search className="h-4 w-4 text-default-400" />}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />

          <Select
            label="Status"
            selectedKeys={[statusFilter]}
            onSelectionChange={(keys) =>
              setStatusFilter(getSingleSelection(keys, "all"))
            }
          >
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.key} textValue={option.label}>
                {option.label}
              </SelectItem>
            ))}
          </Select>

          <Select
            label="Uso"
            selectedKeys={[usageFilter]}
            onSelectionChange={(keys) =>
              setUsageFilter(getSingleSelection(keys, "all"))
            }
          >
            {USAGE_OPTIONS.map((option) => (
              <SelectItem key={option.key} textValue={option.label}>
                {option.label}
              </SelectItem>
            ))}
          </Select>

          <Select
            label="Qualidade"
            selectedKeys={[qualityFilter]}
            onSelectionChange={(keys) =>
              setQualityFilter(getSingleSelection(keys, "all"))
            }
          >
            {QUALITY_OPTIONS.map((option) => (
              <SelectItem key={option.key} textValue={option.label}>
                {option.label}
              </SelectItem>
            ))}
          </Select>
        </CardBody>
      </Card>

      <Card className="border border-default-100 dark:border-white/10">
        <CardHeader className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              Catalogo operacional de bancos
            </h2>
            <p className="text-sm text-default-500">
              {loadingBancos
                ? "Atualizando leitura do catalogo..."
                : `${formatNumber(bancos.length)} instituicao(oes) exibida(s) no recorte atual.`}
            </p>
          </div>
          {dashboard?.bancoMaisUsado ? (
            <Chip color="primary" variant="flat">
              Mais usado hoje: {dashboard.bancoMaisUsado.nome} ·{" "}
              {formatNumber(dashboard.bancoMaisUsado.linkedAccounts)} conta(s)
            </Chip>
          ) : null}
        </CardHeader>
        <CardBody>
          {loading ? (
            <div className="flex min-h-72 items-center justify-center">
              <Spinner label="Carregando catalogo bancario..." />
            </div>
          ) : bancos.length === 0 ? (
            <EmptyPanel
              description="Nenhuma instituicao corresponde ao filtro atual. Ajuste busca ou filtros para retomar a analise."
              icon={<Landmark className="h-6 w-6" />}
              title="Nenhum banco encontrado"
            />
          ) : (
            <Table aria-label="Catalogo de bancos" removeWrapper>
              <TableHeader>
                <TableColumn>COMPE / ISPB</TableColumn>
                <TableColumn>INSTITUICAO</TableColumn>
                <TableColumn>USO NO SISTEMA</TableColumn>
                <TableColumn>DISTRIBUICAO</TableColumn>
                <TableColumn>QUALIDADE</TableColumn>
                <TableColumn>STATUS</TableColumn>
                <TableColumn>AÇÕES</TableColumn>
              </TableHeader>
              <TableBody>
                {bancos.map((banco) => (
                  <TableRow key={banco.codigo}>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-mono text-sm font-semibold text-foreground">
                          {banco.codigo}
                        </p>
                        <p className="text-xs text-default-500">
                          ISPB {compactText(banco.ispb)}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">
                          {banco.nome}
                        </p>
                        <p className="text-xs text-default-500">
                          {compactText(banco.nomeCompleto)}
                        </p>
                        {banco.cnpj ? (
                          <p className="text-xs text-default-400">
                            CNPJ {banco.cnpj}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">
                          {formatNumber(banco.linkedAccounts)} conta(s)
                        </p>
                        <p className="text-xs text-default-500">
                          {formatNumber(banco.impactedTenants)} escritorio(s)
                          impactado(s)
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {banco.usageBreakdown.escritorio > 0 ? (
                          <Chip size="sm" variant="flat">
                            Escritorio {formatNumber(banco.usageBreakdown.escritorio)}
                          </Chip>
                        ) : null}
                        {banco.usageBreakdown.usuario > 0 ? (
                          <Chip size="sm" variant="flat">
                            Equipe {formatNumber(banco.usageBreakdown.usuario)}
                          </Chip>
                        ) : null}
                        {banco.usageBreakdown.cliente > 0 ? (
                          <Chip size="sm" variant="flat">
                            Cliente {formatNumber(banco.usageBreakdown.cliente)}
                          </Chip>
                        ) : null}
                        {banco.linkedAccounts === 0 ? (
                          <Chip size="sm" variant="flat">
                            Sem uso
                          </Chip>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      {banco.qualitySignals.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {banco.qualitySignals.map((signal) => (
                            <Chip
                              key={`${banco.codigo}-${signal.code}`}
                              color={getQualityTone(signal.severity)}
                              size="sm"
                              variant="flat"
                            >
                              {signal.label}
                            </Chip>
                          ))}
                        </div>
                      ) : (
                        <Chip color="success" size="sm" variant="flat">
                          Catalogo interno consistente
                        </Chip>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        color={banco.ativo ? "success" : "default"}
                        size="sm"
                        variant="flat"
                      >
                        {banco.ativo ? "Disponivel" : "Fora de novos cadastros"}
                      </Chip>
                    </TableCell>
                    <TableCell>
                      <Dropdown>
                        <DropdownTrigger>
                          <Button isIconOnly size="sm" variant="light">
                            ⋯
                          </Button>
                        </DropdownTrigger>
                        <DropdownMenu
                          disabledKeys={banco.linkedAccounts > 0 ? ["delete"] : []}
                        >
                          <DropdownItem
                            key="view"
                            startContent={<Eye className="h-4 w-4" />}
                            onPress={() => openModal("view", banco)}
                          >
                            Ver impacto
                          </DropdownItem>
                          <DropdownItem
                            key="edit"
                            startContent={<Pencil className="h-4 w-4" />}
                            onPress={() => openModal("edit", banco)}
                          >
                            Editar metadados
                          </DropdownItem>
                          <DropdownItem
                            key="toggle"
                            startContent={<Power className="h-4 w-4" />}
                            onPress={() => handleToggleStatus(banco)}
                          >
                            {banco.ativo
                              ? "Desativar para novos cadastros"
                              : "Reativar no catalogo"}
                          </DropdownItem>
                          <DropdownItem
                            key="delete"
                            className="text-danger"
                            color="danger"
                            startContent={<Trash2 className="h-4 w-4" />}
                            onPress={() => handleDelete(banco)}
                          >
                            Excluir do catalogo
                          </DropdownItem>
                        </DropdownMenu>
                      </Dropdown>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Modal
        isOpen={isOpen}
        scrollBehavior="inside"
        size="3xl"
        onClose={closeModal}
      >
        <ModalContent>
          <ModalHeader>
            <div className="flex items-center gap-2">
              <Landmark className="h-5 w-5 text-primary" />
              {modalMode === "create" && "Adicionar instituicao ao catalogo"}
              {modalMode === "edit" && "Editar metadados do banco"}
              {modalMode === "view" && "Impacto operacional da instituicao"}
            </div>
          </ModalHeader>
          <ModalBody>
            {modalMode === "view" && selectedBanco ? (
              <div className="space-y-5">
                <div className="rounded-3xl border border-default-100 bg-default-50/40 p-5 dark:border-white/10 dark:bg-background/30">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">
                        {selectedBanco.nome}
                      </h3>
                      <p className="text-sm text-default-500">
                        {compactText(selectedBanco.nomeCompleto)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Chip variant="flat">COMPE {selectedBanco.codigo}</Chip>
                      <Chip variant="flat">
                        ISPB {compactText(selectedBanco.ispb)}
                      </Chip>
                      <Chip
                        color={selectedBanco.ativo ? "success" : "default"}
                        variant="flat"
                      >
                        {selectedBanco.ativo ? "Disponivel" : "Desativado"}
                      </Chip>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <DetailItem
                    label="Contas vinculadas"
                    value={formatNumber(selectedBanco.linkedAccounts)}
                  />
                  <DetailItem
                    label="Escritorios impactados"
                    value={formatNumber(selectedBanco.impactedTenants)}
                  />
                  <DetailItem
                    label="Site"
                    value={selectedBanco.site}
                  />
                  <DetailItem
                    label="Telefone"
                    value={selectedBanco.telefone}
                  />
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  <DetailItem
                    label="Uso em escritorio"
                    value={formatNumber(selectedBanco.usageBreakdown.escritorio)}
                  />
                  <DetailItem
                    label="Uso em equipe"
                    value={formatNumber(selectedBanco.usageBreakdown.usuario)}
                  />
                  <DetailItem
                    label="Uso em cliente"
                    value={formatNumber(selectedBanco.usageBreakdown.cliente)}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <DetailItem label="CNPJ" value={selectedBanco.cnpj} />
                  <DetailItem
                    label="Ultima atualizacao"
                    value={new Date(selectedBanco.updatedAt).toLocaleString("pt-BR")}
                  />
                </div>

                <div className="rounded-3xl border border-default-100 bg-default-50/40 p-5 dark:border-white/10 dark:bg-background/30">
                  <p className="text-sm font-semibold text-foreground">
                    Qualidade do catalogo
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedBanco.qualitySignals.length > 0 ? (
                      selectedBanco.qualitySignals.map((signal) => (
                        <Chip
                          key={`${selectedBanco.codigo}-${signal.code}`}
                          color={getQualityTone(signal.severity)}
                          variant="flat"
                        >
                          {signal.label}
                        </Chip>
                      ))
                    ) : (
                      <Chip color="success" variant="flat">
                        Sem conflito interno detectado
                      </Chip>
                    )}
                  </div>
                  {selectedBanco.qualitySignals.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      {selectedBanco.qualitySignals.map((signal) => (
                        <p
                          key={`${selectedBanco.codigo}-${signal.code}-description`}
                          className="text-sm text-default-500"
                        >
                          {signal.description}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    isDisabled={modalMode === "edit"}
                    isRequired
                    label="Codigo COMPE"
                    placeholder="Ex: 341"
                    startContent={<FileDigit className="h-4 w-4 text-default-400" />}
                    value={formData.codigo}
                    onChange={(event) =>
                      setFormData((current) => ({
                        ...current,
                        codigo: event.target.value,
                      }))
                    }
                  />
                  <Input
                    label="ISPB"
                    placeholder="Ex: 60701190"
                    startContent={<WalletCards className="h-4 w-4 text-default-400" />}
                    value={formData.ispb}
                    onChange={(event) =>
                      setFormData((current) => ({
                        ...current,
                        ispb: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    isRequired
                    label="Nome curto"
                    placeholder="Ex: Itau"
                    startContent={<Building2 className="h-4 w-4 text-default-400" />}
                    value={formData.nome}
                    onChange={(event) =>
                      setFormData((current) => ({
                        ...current,
                        nome: event.target.value,
                      }))
                    }
                  />
                  <Input
                    label="Nome completo"
                    placeholder="Ex: Itau Unibanco S.A."
                    value={formData.nomeCompleto}
                    onChange={(event) =>
                      setFormData((current) => ({
                        ...current,
                        nomeCompleto: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    label="Site"
                    placeholder="https://www.instituicao.com.br"
                    startContent={<Globe className="h-4 w-4 text-default-400" />}
                    value={formData.site}
                    onChange={(event) =>
                      setFormData((current) => ({
                        ...current,
                        site: event.target.value,
                      }))
                    }
                  />
                  <Input
                    label="Telefone"
                    placeholder="0800 000 0000"
                    startContent={<Phone className="h-4 w-4 text-default-400" />}
                    value={formData.telefone}
                    onChange={(event) =>
                      setFormData((current) => ({
                        ...current,
                        telefone: event.target.value,
                      }))
                    }
                  />
                </div>

                <Input
                  label="CNPJ"
                  placeholder="00.000.000/0000-00"
                  startContent={<FileDigit className="h-4 w-4 text-default-400" />}
                  value={formData.cnpj}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      cnpj: event.target.value,
                    }))
                  }
                />

                <div className="rounded-3xl border border-default-100 bg-default-50/40 p-4 dark:border-white/10 dark:bg-background/30">
                  <Switch
                    isSelected={Boolean(formData.ativo)}
                    onValueChange={(checked) =>
                      setFormData((current) => ({
                        ...current,
                        ativo: checked,
                      }))
                    }
                  >
                    Disponivel para novos cadastros
                  </Switch>
                  <p className="mt-2 text-sm text-default-500">
                    Desativar remove a instituicao dos selects novos, mas nao
                    mexe nas contas ja existentes.
                  </p>
                </div>

                {selectedBanco?.linkedAccounts ? (
                  <div className="rounded-3xl border border-warning/20 bg-warning/5 p-4">
                    <p className="text-sm font-semibold text-foreground">
                      Instituicao em uso no produto
                    </p>
                    <p className="mt-1 text-sm text-default-500">
                      {selectedBanco.linkedAccounts} conta(s) vinculada(s) em{" "}
                      {selectedBanco.impactedTenants} escritorio(s). Revise
                      alteracoes com cuidado para nao degradar a leitura
                      operacional.
                    </p>
                  </div>
                ) : null}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={closeModal}>
              {modalMode === "view" ? "Fechar" : "Cancelar"}
            </Button>
            {modalMode !== "view" ? (
              <Button
                color="primary"
                isLoading={submitting}
                onPress={handleSubmit}
              >
                {modalMode === "create" ? "Adicionar ao catalogo" : "Salvar ajustes"}
              </Button>
            ) : null}
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
