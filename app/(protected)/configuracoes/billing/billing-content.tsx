"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import dayjs from "dayjs";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Input,
  Pagination,
  Select,
  SelectItem,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/react";
import {
  Building2,
  CalendarClock,
  DollarSign,
  ExternalLink,
  FileSpreadsheet,
  Landmark,
  Search,
} from "lucide-react";

import { getTenantBillingFaturas } from "@/app/actions/billing";
import { PeopleMetricCard, PeoplePageHeader } from "@/components/people-ui";

const STATUS_OPTIONS = [
  { key: "TODOS", label: "Todos os status" },
  { key: "PAGA", label: "Paga" },
  { key: "ABERTA", label: "Aberta" },
  { key: "VENCIDA", label: "Vencida" },
  { key: "RASCUNHO", label: "Rascunho" },
  { key: "CANCELADA", label: "Cancelada" },
] as const;

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "-";
  const parsed = dayjs(value);

  return parsed.isValid() ? parsed.format("DD/MM/YYYY") : "-";
}

function getStatusColor(status: string) {
  switch (status) {
    case "PAGA":
      return "success" as const;
    case "ABERTA":
      return "warning" as const;
    case "VENCIDA":
      return "danger" as const;
    case "CANCELADA":
      return "default" as const;
    default:
      return "secondary" as const;
  }
}

export default function BillingContent() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("TODOS");
  const [paginaAtual, setPaginaAtual] = useState(1);
  const itensPorPagina = 10;

  const filtros = useMemo(
    () => ({
      search: search.trim() || undefined,
      status: status !== "TODOS" ? status : undefined,
      pagina: paginaAtual,
      itensPorPagina,
    }),
    [itensPorPagina, paginaAtual, search, status],
  );

  const { data, isLoading, error, mutate } = useSWR(
    ["tenant-billing", filtros],
    () => getTenantBillingFaturas(filtros),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    },
  );

  const responseError =
    data && !data.success ? data.error || "Falha ao carregar billing" : null;
  const resumo = data?.success ? data.data?.resumo : null;
  const assinatura = data?.success ? data.data?.assinatura : null;
  const faturas = data?.success ? data.data?.faturas || [] : [];
  const totalPaginas = data?.success ? data.data?.totalPaginas || 1 : 1;

  const clearFilters = () => {
    setSearch("");
    setStatus("TODOS");
    setPaginaAtual(1);
  };

  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-3 py-8 sm:px-6">
      <PeoplePageHeader
        tag="Administração"
        title="Billing da assinatura"
        description="Faturas do escritório com a Magic Lawyer. Este painel é separado dos recibos operacionais de clientes."
        actions={
          <Button
            as={Link}
            href="/financeiro/recibos"
            radius="full"
            startContent={<FileSpreadsheet className="h-4 w-4" />}
            variant="flat"
          >
            Voltar para recibos
          </Button>
        }
      />

      {assinatura && (
        <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
          <CardBody className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                Assinatura ativa
              </p>
              <p className="text-sm text-default-300">
                Plano: <span className="font-medium">{assinatura.plano || "-"}</span>
              </p>
              <p className="text-xs text-default-500">
                Renovação: {formatDate(assinatura.renovaEm)} • Trial até{" "}
                {formatDate(assinatura.trialEndsAt)}
              </p>
            </div>
            <Chip color={getStatusColor(assinatura.status)} variant="flat">
              {assinatura.status}
            </Chip>
          </CardBody>
        </Card>
      )}

      {resumo && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <PeopleMetricCard
            helper="Total de faturas de assinatura"
            icon={<Landmark className="h-4 w-4" />}
            label="Faturas"
            tone="primary"
            value={resumo.totalFaturas}
          />
          <PeopleMetricCard
            helper={`${resumo.totalPago} fatura(s) quitada(s)`}
            icon={<DollarSign className="h-4 w-4" />}
            label="Valor pago"
            tone="success"
            value={formatCurrency(resumo.valorPago)}
          />
          <PeopleMetricCard
            helper={`${resumo.totalAberto} fatura(s) em aberto`}
            icon={<CalendarClock className="h-4 w-4" />}
            label="Valor em aberto"
            tone="warning"
            value={formatCurrency(resumo.valorAberto)}
          />
          <PeopleMetricCard
            helper={`${resumo.totalVencido} fatura(s) vencida(s)`}
            icon={<Building2 className="h-4 w-4" />}
            label="Valor vencido"
            tone="danger"
            value={formatCurrency(resumo.valorVencido)}
          />
        </div>
      )}

      <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Filtros</p>
            <p className="text-xs text-default-400">
              Refine a listagem de faturas da assinatura.
            </p>
          </div>
          <Button
            isDisabled={!search && status === "TODOS"}
            size="sm"
            variant="light"
            onPress={clearFilters}
          >
            Limpar filtros
          </Button>
        </CardHeader>
        <CardBody className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Input
            placeholder="Número, descrição ou invoice ID"
            startContent={<Search className="h-4 w-4 text-default-400" />}
            value={search}
            variant="bordered"
            onValueChange={(value) => {
              setSearch(value);
              setPaginaAtual(1);
            }}
          />
          <Select
            selectedKeys={status ? [status] : ["TODOS"]}
            variant="bordered"
            onSelectionChange={(keys) => {
              const selected = (Array.from(keys)[0] as string) || "TODOS";
              setStatus(selected);
              setPaginaAtual(1);
            }}
          >
            {STATUS_OPTIONS.map((item) => (
              <SelectItem key={item.key} textValue={item.label}>
                {item.label}
              </SelectItem>
            ))}
          </Select>
        </CardBody>
      </Card>

      <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
        <CardHeader className="flex items-center justify-between">
          <p className="text-lg font-semibold text-white">Faturas da assinatura</p>
          {data?.success && (
            <Chip color="primary" variant="flat">
              {data.data?.total || 0} registro(s)
            </Chip>
          )}
        </CardHeader>
        <CardBody>
          {(error || responseError) && (
            <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
              {responseError || (error as Error)?.message || "Erro inesperado"}
              <div className="mt-3">
                <Button color="danger" size="sm" variant="flat" onPress={() => mutate()}>
                  Tentar novamente
                </Button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : faturas.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-base font-semibold text-white">
                Nenhuma fatura encontrada
              </p>
              <p className="mt-1 text-sm text-default-400">
                Ajuste os filtros ou aguarde a emissão de novas cobranças.
              </p>
            </div>
          ) : (
            <>
              <Table aria-label="Tabela de billing da assinatura">
                <TableHeader>
                  <TableColumn>FATURA</TableColumn>
                  <TableColumn>STATUS</TableColumn>
                  <TableColumn>VALOR</TableColumn>
                  <TableColumn>VENCIMENTO</TableColumn>
                  <TableColumn>PAGAMENTO</TableColumn>
                  <TableColumn>AÇÕES</TableColumn>
                </TableHeader>
                <TableBody>
                  {faturas.map((fatura) => (
                    <TableRow key={fatura.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-white">
                            {fatura.numero}
                          </p>
                          <p className="text-xs text-default-400">
                            {fatura.descricao || "Sem descrição"}
                          </p>
                          {fatura.externalInvoiceId && (
                            <p className="text-[11px] text-default-500">
                              Invoice ID: {fatura.externalInvoiceId}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Chip
                          color={getStatusColor(fatura.status)}
                          size="sm"
                          variant="flat"
                        >
                          {fatura.status}
                        </Chip>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-semibold text-success">
                          {formatCurrency(fatura.valor)}
                        </p>
                      </TableCell>
                      <TableCell>{formatDate(fatura.vencimento)}</TableCell>
                      <TableCell>{formatDate(fatura.pagoEm)}</TableCell>
                      <TableCell>
                        {fatura.urlBoleto ? (
                          <Button
                            as="a"
                            href={fatura.urlBoleto}
                            rel="noopener noreferrer"
                            size="sm"
                            startContent={<ExternalLink className="h-3.5 w-3.5" />}
                            target="_blank"
                            variant="flat"
                          >
                            Abrir cobrança
                          </Button>
                        ) : (
                          <span className="text-xs text-default-500">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalPaginas > 1 && (
                <div className="mt-6 flex justify-center">
                  <Pagination
                    showControls
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
    </section>
  );
}
