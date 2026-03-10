"use client";

import React, { useMemo } from "react";
import useSWR from "swr";
import NextLink from "next/link";
import { Button } from "@heroui/button";
import { Chip, Spinner } from "@heroui/react";
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/table";
import {
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  Banknote,
  Building2,
  CreditCard,
  FileClock,
  HandCoins,
  Receipt,
  ShieldAlert,
  TrendingUp,
  Wallet,
} from "lucide-react";

import {
  getComissoesPendentes,
  getEstatisticasFinanceiras,
  getFaturasRecentes,
  getPagamentosRecentes,
  getResumoMensal,
  getTopTenants,
  type ComissaoResumo,
  type EstatisticasFinanceiras,
  type FaturaResumo,
  type PagamentoResumo,
  type ResumoMensal,
  type TopTenants,
} from "@/app/actions/financeiro";
import {
  PeopleEmptyState,
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";

type ActionResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});

function formatCurrency(value: number) {
  return currencyFormatter.format(value || 0);
}

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "Nao definido";
  return new Date(date).toLocaleDateString("pt-BR");
}

function formatPercent(value: number) {
  return percentFormatter.format(Number.isFinite(value) ? value : 0);
}

function getStatusColor(status: string) {
  switch (status) {
    case "ATIVA":
    case "PAGA":
    case "PAGO":
      return "success" as const;
    case "PENDENTE":
    case "ABERTA":
      return "warning" as const;
    case "VENCIDA":
    case "INADIMPLENTE":
      return "danger" as const;
    case "CANCELADA":
      return "default" as const;
    default:
      return "default" as const;
  }
}

function loadActionData<T>(action: () => Promise<ActionResponse<T>>) {
  return action().then((response) => {
    if (!response.success) {
      throw new Error(response.error ?? "Falha ao carregar dados financeiros");
    }

    return response.data as T;
  });
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex min-h-56 items-center justify-center">
      <Spinner label={label} />
    </div>
  );
}

export function FinanceiroContent() {
  const {
    data: estatisticas,
    error: statsError,
    isLoading: loadingStats,
  } = useSWR<EstatisticasFinanceiras>(
    "admin-financeiro-estatisticas",
    () => loadActionData(getEstatisticasFinanceiras),
    { revalidateOnFocus: true },
  );

  const {
    data: resumoMensal,
    error: resumoError,
    isLoading: loadingResumo,
  } = useSWR<ResumoMensal[]>(
    "admin-financeiro-resumo-mensal",
    () => loadActionData(getResumoMensal),
    { revalidateOnFocus: true },
  );

  const {
    data: topTenants,
    error: topTenantsError,
    isLoading: loadingTopTenants,
  } = useSWR<TopTenants[]>(
    "admin-financeiro-top-tenants",
    () => loadActionData(getTopTenants),
    { revalidateOnFocus: true },
  );

  const {
    data: faturasRecentes,
    error: faturasError,
    isLoading: loadingFaturas,
  } = useSWR<FaturaResumo[]>(
    "admin-financeiro-faturas-recentes",
    () => loadActionData(getFaturasRecentes),
    { revalidateOnFocus: true },
  );

  const {
    data: pagamentosRecentes,
    error: pagamentosError,
    isLoading: loadingPagamentos,
  } = useSWR<PagamentoResumo[]>(
    "admin-financeiro-pagamentos-recentes",
    () => loadActionData(getPagamentosRecentes),
    { revalidateOnFocus: true },
  );

  const {
    data: comissoesPendentes,
    error: comissoesError,
    isLoading: loadingComissoes,
  } = useSWR<ComissaoResumo[]>(
    "admin-financeiro-comissoes-pendentes",
    () => loadActionData(getComissoesPendentes),
    { revalidateOnFocus: true },
  );

  const data = estatisticas ?? {
    receitaTotal: 0,
    receitaMensal: 0,
    receitaAnual: 0,
    totalAssinaturas: 0,
    assinaturasAtivas: 0,
    assinaturasInadimplentes: 0,
    totalFaturas: 0,
    faturasPagas: 0,
    faturasPendentes: 0,
    faturasVencidas: 0,
    totalPagamentos: 0,
    pagamentosConfirmados: 0,
    comissoesPendentes: 0,
    comissoesPagas: 0,
  };

  const financialPulse = useMemo(() => {
    const collectionRate =
      data.totalFaturas > 0 ? data.faturasPagas / data.totalFaturas : 0;
    const delinquencyRate =
      data.totalAssinaturas > 0
        ? data.assinaturasInadimplentes / data.totalAssinaturas
        : 0;
    const averageRevenuePerActiveTenant =
      data.assinaturasAtivas > 0
        ? data.receitaMensal / data.assinaturasAtivas
        : 0;
    const revenueRunRate = data.receitaMensal * 12;

    const alerts: Array<{
      title: string;
      detail: string;
      tone: "success" | "warning" | "danger" | "secondary";
    }> = [];

    if (data.faturasVencidas > 0) {
      alerts.push({
        title: "Cobrança vencida em aberto",
        detail: `${data.faturasVencidas} fatura(s) vencida(s) exigem ação imediata de cobrança.`,
        tone: "danger",
      });
    }

    if (delinquencyRate >= 0.12) {
      alerts.push({
        title: "Inadimplência acima do ideal",
        detail: `A carteira de assinaturas em atraso está em ${formatPercent(delinquencyRate)}.`,
        tone: "warning",
      });
    }

    if (collectionRate >= 0.8) {
      alerts.push({
        title: "Conversão de faturas saudável",
        detail: `A taxa atual de faturas pagas está em ${formatPercent(collectionRate)}.`,
        tone: "success",
      });
    }

    if (alerts.length === 0) {
      alerts.push({
        title: "Sem alertas financeiros críticos",
        detail:
          "O painel atual não aponta pressão imediata de cobrança ou repasse.",
        tone: "secondary",
      });
    }

    return {
      collectionRate,
      delinquencyRate,
      averageRevenuePerActiveTenant,
      revenueRunRate,
      alerts: alerts.slice(0, 3),
    };
  }, [data]);

  const errors = [
    statsError,
    resumoError,
    topTenantsError,
    faturasError,
    pagamentosError,
    comissoesError,
  ].filter(Boolean) as Error[];

  return (
    <section className="space-y-6">
      <PeoplePageHeader
        tag="Administração"
        title="Receita, cobrança e repasse"
        description="Painel financeiro da plataforma com foco em caixa, pressão de cobrança, saúde da base e repasses pendentes."
        actions={
          <>
            <Button
              as={NextLink}
              color="primary"
              href="/admin/tenants"
              radius="full"
              size="sm"
            >
              Operar tenants
            </Button>
            <Button
              as={NextLink}
              href="/admin/relatorios"
              radius="full"
              size="sm"
              variant="bordered"
            >
              Relatórios
            </Button>
          </>
        }
      />

      {errors.length > 0 ? (
        <PeoplePanel
          title="Falha parcial no painel"
          description="O financeiro não deve parecer vazio quando uma consulta falha. Os blocos abaixo continuam usando os dados que conseguiram carregar."
        >
          <div className="space-y-2 rounded-2xl border border-danger/30 bg-danger/5 p-4">
            {errors.map((error, index) => (
              <div
                key={`${error.message}-${index}`}
                className="flex items-start gap-2 text-sm text-danger"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error.message}</span>
              </div>
            ))}
          </div>
        </PeoplePanel>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <PeopleMetricCard
          label="Receita total"
          value={loadingStats ? "..." : formatCurrency(data.receitaTotal)}
          helper="Acumulado confirmado pela plataforma"
          icon={<Wallet className="h-4 w-4" />}
          tone="success"
        />
        <PeopleMetricCard
          label="Receita mensal"
          value={loadingStats ? "..." : formatCurrency(data.receitaMensal)}
          helper="Entrada confirmada no mês corrente"
          icon={<TrendingUp className="h-4 w-4" />}
          tone="primary"
        />
        <PeopleMetricCard
          label="Run rate anual"
          value={
            loadingStats ? "..." : formatCurrency(financialPulse.revenueRunRate)
          }
          helper="Mensal projetado em 12 meses"
          icon={<BadgeDollarSign className="h-4 w-4" />}
          tone="secondary"
        />
        <PeopleMetricCard
          label="Assinaturas ativas"
          value={loadingStats ? "..." : data.assinaturasAtivas}
          helper={`${data.assinaturasInadimplentes} em atraso financeiro`}
          icon={<Building2 className="h-4 w-4" />}
          tone="primary"
        />
        <PeopleMetricCard
          label="Taxa de cobrança"
          value={
            loadingStats ? "..." : formatPercent(financialPulse.collectionRate)
          }
          helper={`${data.faturasPagas}/${data.totalFaturas} faturas pagas`}
          icon={<Receipt className="h-4 w-4" />}
          tone={financialPulse.collectionRate >= 0.8 ? "success" : "warning"}
        />
      </div>

      <PeoplePanel
        title="Pulso financeiro"
        description="Leituras rápidas para agir em cobrança, expansão e repasse sem abrir outras telas."
      >
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-background/30 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                Faturas abertas
              </p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {loadingStats ? "..." : data.faturasPendentes}
              </p>
              <p className="mt-1 text-xs text-default-400">
                Aguardando conversão em caixa
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-background/30 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                Faturas vencidas
              </p>
              <p className="mt-2 text-2xl font-semibold text-danger">
                {loadingStats ? "..." : data.faturasVencidas}
              </p>
              <p className="mt-1 text-xs text-default-400">
                Risco imediato de perda ou atraso
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-background/30 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                Ticket mensal por conta ativa
              </p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {loadingStats
                  ? "..."
                  : formatCurrency(
                      financialPulse.averageRevenuePerActiveTenant,
                    )}
              </p>
              <p className="mt-1 text-xs text-default-400">
                Receita mensal media por assinatura ativa
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-background/30 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                Comissões pendentes
              </p>
              <p className="mt-2 text-2xl font-semibold text-warning">
                {loadingStats ? "..." : data.comissoesPendentes}
              </p>
              <p className="mt-1 text-xs text-default-400">
                Repasse financeiro aguardando ação
              </p>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-white/10 bg-background/30 p-4">
            <p className="text-sm font-semibold text-foreground">
              Leituras prioritárias
            </p>
            {financialPulse.alerts.map((alert) => (
              <div
                key={alert.title}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"
              >
                <div className="mb-2 flex items-center gap-2">
                  <Chip color={alert.tone} size="sm" variant="flat">
                    {alert.tone === "danger"
                      ? "Risco"
                      : alert.tone === "warning"
                        ? "Atencao"
                        : alert.tone === "success"
                          ? "Saudavel"
                          : "Leitura"}
                  </Chip>
                  <p className="text-sm font-semibold text-foreground">
                    {alert.title}
                  </p>
                </div>
                <p className="text-sm text-default-400">{alert.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </PeoplePanel>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <PeoplePanel
          title="Tração dos últimos 12 meses"
          description="Receita, volume de assinaturas, faturas e pagamentos em uma leitura única."
        >
          {loadingResumo && !resumoMensal ? (
            <LoadingBlock label="Carregando tração financeira..." />
          ) : resumoMensal && resumoMensal.length > 0 ? (
            <Table removeWrapper aria-label="Resumo financeiro mensal">
              <TableHeader>
                <TableColumn>Mês</TableColumn>
                <TableColumn>Receita</TableColumn>
                <TableColumn>Assinaturas</TableColumn>
                <TableColumn>Faturas</TableColumn>
                <TableColumn>Pagamentos</TableColumn>
              </TableHeader>
              <TableBody>
                {resumoMensal.map((mes) => (
                  <TableRow key={mes.mes}>
                    <TableCell className="font-medium text-foreground">
                      {mes.mes}
                    </TableCell>
                    <TableCell className="font-semibold text-success">
                      {formatCurrency(mes.receita)}
                    </TableCell>
                    <TableCell>{mes.assinaturas}</TableCell>
                    <TableCell>{mes.faturas}</TableCell>
                    <TableCell>{mes.pagamentos}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <PeopleEmptyState
              title="Sem tração financeira registrada"
              description="Ainda não existem dados suficientes para montar a série mensal do financeiro."
              icon={<Banknote className="h-6 w-6" />}
            />
          )}
        </PeoplePanel>

        <PeoplePanel
          title="Top tenants por receita"
          description="Contas com maior geração de receita para leitura de concentração e expansão."
          actions={
            <Button
              as={NextLink}
              href="/admin/tenants"
              radius="full"
              size="sm"
              variant="flat"
            >
              Ver base completa
            </Button>
          }
        >
          {loadingTopTenants && !topTenants ? (
            <LoadingBlock label="Carregando top tenants..." />
          ) : topTenants && topTenants.length > 0 ? (
            <div className="space-y-3">
              {topTenants.slice(0, 6).map((tenant, index) => (
                <div
                  key={tenant.id}
                  className="grid gap-3 rounded-2xl border border-white/10 bg-background/30 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {index + 1}. {tenant.name}
                    </p>
                    <p className="text-xs text-default-400">
                      {tenant.assinaturasAtivas} assinatura(s) ativa(s)
                    </p>
                  </div>
                  <Chip
                    color={getStatusColor(tenant.status)}
                    size="sm"
                    variant="flat"
                  >
                    {tenant.status}
                  </Chip>
                  <p className="text-sm font-semibold text-success">
                    {formatCurrency(tenant.receitaTotal)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <PeopleEmptyState
              title="Nenhuma conta com receita acumulada"
              description="Quando houver pagamentos confirmados por tenant, esta lista passa a destacar as maiores contas."
              icon={<Building2 className="h-6 w-6" />}
            />
          )}
        </PeoplePanel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <PeoplePanel
          title="Cobrança recente"
          description="Últimas faturas emitidas com foco em vencimento e risco de atraso."
        >
          {loadingFaturas && !faturasRecentes ? (
            <LoadingBlock label="Carregando cobrança..." />
          ) : faturasRecentes && faturasRecentes.length > 0 ? (
            <Table removeWrapper aria-label="Faturas recentes">
              <TableHeader>
                <TableColumn>Fatura</TableColumn>
                <TableColumn>Tenant</TableColumn>
                <TableColumn>Valor</TableColumn>
                <TableColumn>Status</TableColumn>
                <TableColumn>Vencimento</TableColumn>
              </TableHeader>
              <TableBody>
                {faturasRecentes.map((fatura) => (
                  <TableRow key={fatura.id}>
                    <TableCell className="font-medium text-foreground">
                      {fatura.numero}
                    </TableCell>
                    <TableCell>{fatura.tenant.name}</TableCell>
                    <TableCell className="font-semibold">
                      {formatCurrency(fatura.valor)}
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
                    <TableCell>{formatDate(fatura.vencimento)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <PeopleEmptyState
              title="Nenhuma fatura emitida recentemente"
              description="A fila de cobrança recente ficará visível aqui assim que novas faturas forem geradas."
              icon={<FileClock className="h-6 w-6" />}
            />
          )}
        </PeoplePanel>

        <PeoplePanel
          title="Pagamentos confirmados"
          description="Entradas recentes de caixa confirmadas por fatura e tenant."
        >
          {loadingPagamentos && !pagamentosRecentes ? (
            <LoadingBlock label="Carregando pagamentos..." />
          ) : pagamentosRecentes && pagamentosRecentes.length > 0 ? (
            <Table removeWrapper aria-label="Pagamentos recentes">
              <TableHeader>
                <TableColumn>Fatura</TableColumn>
                <TableColumn>Tenant</TableColumn>
                <TableColumn>Valor</TableColumn>
                <TableColumn>Status</TableColumn>
                <TableColumn>Metodo</TableColumn>
                <TableColumn>Confirmado em</TableColumn>
              </TableHeader>
              <TableBody>
                {pagamentosRecentes.map((pagamento) => (
                  <TableRow key={pagamento.id}>
                    <TableCell className="font-medium text-foreground">
                      {pagamento.fatura.numero}
                    </TableCell>
                    <TableCell>{pagamento.fatura.tenant.name}</TableCell>
                    <TableCell className="font-semibold text-success">
                      {formatCurrency(pagamento.valor)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        color={getStatusColor(pagamento.status)}
                        size="sm"
                        variant="flat"
                      >
                        {pagamento.status}
                      </Chip>
                    </TableCell>
                    <TableCell>{pagamento.metodo}</TableCell>
                    <TableCell>{formatDate(pagamento.confirmadoEm)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <PeopleEmptyState
              title="Nenhum pagamento confirmado recentemente"
              description="Assim que o financeiro registrar novas confirmações de pagamento, elas aparecerão aqui."
              icon={<CreditCard className="h-6 w-6" />}
            />
          )}
        </PeoplePanel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <PeoplePanel
          title="Repasse e comissões"
          description="Pendências de repasse para advogados que já podem virar ação operacional."
        >
          {loadingComissoes && !comissoesPendentes ? (
            <LoadingBlock label="Carregando repasses..." />
          ) : comissoesPendentes && comissoesPendentes.length > 0 ? (
            <Table removeWrapper aria-label="Comissoes pendentes">
              <TableHeader>
                <TableColumn>Advogado</TableColumn>
                <TableColumn>Fatura</TableColumn>
                <TableColumn>Tenant</TableColumn>
                <TableColumn>Valor</TableColumn>
                <TableColumn>Percentual</TableColumn>
              </TableHeader>
              <TableBody>
                {comissoesPendentes.map((comissao) => (
                  <TableRow key={comissao.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">
                          {comissao.advogado.nome}
                        </p>
                        <p className="text-xs text-default-500">
                          {comissao.advogado.oab}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{comissao.pagamento.fatura.numero}</TableCell>
                    <TableCell>
                      {comissao.pagamento.fatura.tenant.name}
                    </TableCell>
                    <TableCell className="font-semibold text-warning">
                      {formatCurrency(comissao.valorComissao)}
                    </TableCell>
                    <TableCell>{comissao.percentualComissao}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <PeopleEmptyState
              title="Nenhum repasse pendente"
              description="A operação de comissões está limpa neste momento."
              icon={<HandCoins className="h-6 w-6" />}
            />
          )}
        </PeoplePanel>

        <PeoplePanel
          title="Playbook financeiro"
          description="Próximos movimentos recomendados para proteger caixa e acelerar expansão."
        >
          <div className="space-y-3">
            <div className="rounded-2xl border border-white/10 bg-background/30 p-4">
              <div className="mb-2 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-danger" />
                <p className="text-sm font-semibold text-foreground">
                  Atacar vencidos primeiro
                </p>
              </div>
              <p className="text-sm text-default-400">
                {data.faturasVencidas > 0
                  ? `${data.faturasVencidas} fatura(s) vencida(s) precisam entrar no fluxo de cobrança hoje.`
                  : "Sem vencidos críticos neste momento."}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-background/30 p-4">
              <div className="mb-2 flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">
                  Expandir contas saudáveis
                </p>
              </div>
              <p className="text-sm text-default-400">
                Use o ranking de top tenants para identificar contas com
                potencial de upgrade antes do próximo ciclo de renovação.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-background/30 p-4">
              <div className="mb-2 flex items-center gap-2">
                <Receipt className="h-4 w-4 text-warning" />
                <p className="text-sm font-semibold text-foreground">
                  Revisar mix de cobrança
                </p>
              </div>
              <p className="text-sm text-default-400">
                A inadimplência atual está em{" "}
                {formatPercent(financialPulse.delinquencyRate)}. Cruze esse dado
                com tenant health e suporte.
              </p>
            </div>
          </div>
        </PeoplePanel>
      </div>
    </section>
  );
}
