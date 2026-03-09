"use client";

import React from "react";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Divider } from "@heroui/divider";
import { Button } from "@heroui/button";
import { Badge } from "@heroui/badge";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/table";
import useSWR from "swr";

import { PeoplePageHeader } from "@/components/people-ui";
import {
  getEstatisticasFinanceiras,
  getResumoMensal,
  getTopTenants,
  getFaturasRecentes,
  getPagamentosRecentes,
  getComissoesPendentes,
} from "@/app/actions/financeiro";

export function FinanceiroContent() {
  // Buscar dados reais do banco
  const { data: statsResponse, isLoading: loadingStats } = useSWR(
    "estatisticas-financeiras",
    getEstatisticasFinanceiras,
  );
  const { data: resumoResponse, isLoading: loadingResumo } = useSWR(
    "resumo-mensal",
    getResumoMensal,
  );
  const { data: topTenantsResponse, isLoading: loadingTopTenants } = useSWR(
    "top-tenants",
    getTopTenants,
  );
  const { data: faturasResponse, isLoading: loadingFaturas } = useSWR(
    "faturas-recentes",
    getFaturasRecentes,
  );
  const { data: pagamentosResponse, isLoading: loadingPagamentos } = useSWR(
    "pagamentos-recentes",
    getPagamentosRecentes,
  );
  const { data: comissoesResponse, isLoading: loadingComissoes } = useSWR(
    "comissoes-pendentes",
    getComissoesPendentes,
  );

  const estatisticas = statsResponse?.data || {
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

  const resumoMensal = resumoResponse?.data || [];
  const topTenants = topTenantsResponse?.data || [];
  const faturasRecentes = faturasResponse?.data || [];
  const pagamentosRecentes = pagamentosResponse?.data || [];
  const comissoesPendentes = comissoesResponse?.data || [];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("pt-BR");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ATIVA":
      case "PAGA":
      case "PAGO":
        return "success";
      case "PENDENTE":
      case "ABERTA":
        return "warning";
      case "VENCIDA":
      case "INADIMPLENTE":
        return "danger";
      case "CANCELADA":
        return "default";
      default:
        return "default";
    }
  };

  return (
    <section className="space-y-6">
      <PeoplePageHeader
        tag="Administração"
        title="Financeiro global"
        description="Acompanhe receita, assinaturas, faturas, pagamentos e comissões da plataforma."
        actions={
          <>
            <Button color="primary" size="sm" variant="flat">
              Relatórios
            </Button>
            <Button color="secondary" size="sm" variant="flat">
              Cobrança
            </Button>
          </>
        }
      />

      {/* Métricas Principais */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
          <CardBody className="flex items-center">
            <span className="text-3xl text-green-600 mr-4">💰</span>
            <div>
              <p className="text-sm font-medium text-default-500">Receita Total</p>
              <p className="text-2xl font-bold text-foreground">
                {loadingStats
                  ? "..."
                  : formatCurrency(estatisticas.receitaTotal)}
              </p>
              <p className="text-sm text-green-600">Acumulada</p>
            </div>
          </CardBody>
        </Card>

        <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
          <CardBody className="flex items-center">
            <span className="text-3xl text-blue-600 mr-4">📈</span>
            <div>
              <p className="text-sm font-medium text-default-500">
                Receita Mensal
              </p>
              <p className="text-2xl font-bold text-foreground">
                {loadingStats
                  ? "..."
                  : formatCurrency(estatisticas.receitaMensal)}
              </p>
              <p className="text-sm text-blue-600">Este mês</p>
            </div>
          </CardBody>
        </Card>

        <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
          <CardBody className="flex items-center">
            <span className="text-3xl text-purple-600 mr-4">👥</span>
            <div>
              <p className="text-sm font-medium text-default-500">
                Assinaturas Ativas
              </p>
              <p className="text-2xl font-bold text-foreground">
                {loadingStats ? "..." : estatisticas.assinaturasAtivas}
              </p>
              <p className="text-sm text-purple-600">
                de {estatisticas.totalAssinaturas} total
              </p>
            </div>
          </CardBody>
        </Card>

        <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
          <CardBody className="flex items-center">
            <span className="text-3xl text-yellow-600 mr-4">💳</span>
            <div>
              <p className="text-sm font-medium text-default-500">Faturas Pagas</p>
              <p className="text-2xl font-bold text-foreground">
                {loadingStats ? "..." : estatisticas.faturasPagas}
              </p>
              <p className="text-sm text-yellow-600">
                de {estatisticas.totalFaturas} total
              </p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Resumo Mensal */}
      <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
        <CardHeader className="flex flex-col gap-2 pb-2">
          <h2 className="text-lg font-semibold text-white">
            📊 Resumo dos Últimos 12 Meses
          </h2>
          <p className="text-sm text-default-400">
            Evolução da receita e volume de transações
          </p>
        </CardHeader>
        <Divider className="border-white/10" />
        <CardBody>
          {loadingResumo ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">⏳</div>
              <h3 className="text-lg font-medium text-white mb-2">
                Carregando resumo...
              </h3>
              <p className="text-default-400">
                Buscando dados dos últimos 12 meses
              </p>
            </div>
          ) : resumoMensal.length > 0 ? (
            <Table aria-label="Tabela de Resumo Mensal">
              <TableHeader>
                <TableColumn>Mês</TableColumn>
                <TableColumn>Receita</TableColumn>
                <TableColumn>Assinaturas</TableColumn>
                <TableColumn>Faturas</TableColumn>
                <TableColumn>Pagamentos</TableColumn>
              </TableHeader>
              <TableBody>
                {resumoMensal.map((mes, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{mes.mes}</TableCell>
                    <TableCell className="text-green-600 font-semibold">
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
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📊</div>
              <h3 className="text-lg font-medium text-white mb-2">
                Nenhum dado encontrado
              </h3>
              <p className="text-default-400">
                Não há dados financeiros para exibir
              </p>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Top Tenants */}
      <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
        <CardHeader className="flex flex-col gap-2 pb-2">
          <h2 className="text-lg font-semibold text-white">
            🏆 Top Tenants por Receita
          </h2>
          <p className="text-sm text-default-400">
            Escritórios com maior faturamento
          </p>
        </CardHeader>
        <Divider className="border-white/10" />
        <CardBody>
          {loadingTopTenants ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">⏳</div>
              <h3 className="text-lg font-medium text-white mb-2">
                Carregando tenants...
              </h3>
              <p className="text-default-400">
                Buscando dados dos maiores clientes
              </p>
            </div>
          ) : topTenants.length > 0 ? (
            <Table aria-label="Tabela de Top Tenants">
              <TableHeader>
                <TableColumn>Escritório</TableColumn>
                <TableColumn>Receita Total</TableColumn>
                <TableColumn>Assinaturas Ativas</TableColumn>
                <TableColumn>Status</TableColumn>
              </TableHeader>
              <TableBody>
                {topTenants.map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell className="font-medium">{tenant.name}</TableCell>
                    <TableCell className="text-green-600 font-semibold">
                      {formatCurrency(tenant.receitaTotal)}
                    </TableCell>
                    <TableCell>{tenant.assinaturasAtivas}</TableCell>
                    <TableCell>
                      <Badge
                        color={getStatusColor(tenant.status) as any}
                        variant="flat"
                      >
                        {tenant.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🏢</div>
              <h3 className="text-lg font-medium text-white mb-2">
                Nenhum tenant encontrado
              </h3>
              <p className="text-default-400">
                Não há dados de receita para exibir
              </p>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Faturas Recentes */}
      <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
        <CardHeader className="flex flex-col gap-2 pb-2">
          <h2 className="text-lg font-semibold text-white">
            📄 Faturas Recentes
          </h2>
          <p className="text-sm text-default-400">
            Últimas faturas emitidas no sistema
          </p>
        </CardHeader>
        <Divider className="border-white/10" />
        <CardBody>
          {loadingFaturas ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">⏳</div>
              <h3 className="text-lg font-medium text-white mb-2">
                Carregando faturas...
              </h3>
              <p className="text-default-400">Buscando faturas recentes</p>
            </div>
          ) : faturasRecentes.length > 0 ? (
            <Table aria-label="Tabela de Faturas Recentes">
              <TableHeader>
                <TableColumn>Número</TableColumn>
                <TableColumn>Tenant</TableColumn>
                <TableColumn>Valor</TableColumn>
                <TableColumn>Status</TableColumn>
                <TableColumn>Vencimento</TableColumn>
                <TableColumn>Pago em</TableColumn>
              </TableHeader>
              <TableBody>
                {faturasRecentes.map((fatura) => (
                  <TableRow key={fatura.id}>
                    <TableCell className="font-medium">
                      {fatura.numero}
                    </TableCell>
                    <TableCell>{fatura.tenant.name}</TableCell>
                    <TableCell className="font-semibold">
                      {formatCurrency(fatura.valor)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        color={getStatusColor(fatura.status) as any}
                        variant="flat"
                      >
                        {fatura.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {fatura.vencimento
                        ? formatDate(fatura.vencimento)
                        : "N/A"}
                    </TableCell>
                    <TableCell>
                      {fatura.pagoEm ? formatDate(fatura.pagoEm) : "N/A"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📄</div>
              <h3 className="text-lg font-medium text-white mb-2">
                Nenhuma fatura encontrada
              </h3>
              <p className="text-default-400">Não há faturas para exibir</p>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Pagamentos Recentes */}
      <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
        <CardHeader className="flex flex-col gap-2 pb-2">
          <h2 className="text-lg font-semibold text-white">
            💳 Pagamentos Recentes
          </h2>
          <p className="text-sm text-default-400">
            Últimos pagamentos confirmados
          </p>
        </CardHeader>
        <Divider className="border-white/10" />
        <CardBody>
          {loadingPagamentos ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">⏳</div>
              <h3 className="text-lg font-medium text-white mb-2">
                Carregando pagamentos...
              </h3>
              <p className="text-default-400">Buscando pagamentos recentes</p>
            </div>
          ) : pagamentosRecentes.length > 0 ? (
            <Table aria-label="Tabela de Pagamentos Recentes">
              <TableHeader>
                <TableColumn>Fatura</TableColumn>
                <TableColumn>Tenant</TableColumn>
                <TableColumn>Valor</TableColumn>
                <TableColumn>Status</TableColumn>
                <TableColumn>Método</TableColumn>
                <TableColumn>Confirmado em</TableColumn>
              </TableHeader>
              <TableBody>
                {pagamentosRecentes.map((pagamento) => (
                  <TableRow key={pagamento.id}>
                    <TableCell className="font-medium">
                      {pagamento.fatura.numero}
                    </TableCell>
                    <TableCell>{pagamento.fatura.tenant.name}</TableCell>
                    <TableCell className="font-semibold">
                      {formatCurrency(pagamento.valor)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        color={getStatusColor(pagamento.status) as any}
                        variant="flat"
                      >
                        {pagamento.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{pagamento.metodo}</TableCell>
                    <TableCell>
                      {pagamento.confirmadoEm
                        ? formatDate(pagamento.confirmadoEm)
                        : "N/A"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">💳</div>
              <h3 className="text-lg font-medium text-white mb-2">
                Nenhum pagamento encontrado
              </h3>
              <p className="text-default-400">Não há pagamentos para exibir</p>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Comissões Pendentes */}
      <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
        <CardHeader className="flex flex-col gap-2 pb-2">
          <h2 className="text-lg font-semibold text-white">
            ⚖️ Comissões Pendentes
          </h2>
          <p className="text-sm text-default-400">
            Comissões de advogados aguardando pagamento
          </p>
        </CardHeader>
        <Divider className="border-white/10" />
        <CardBody>
          {loadingComissoes ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">⏳</div>
              <h3 className="text-lg font-medium text-white mb-2">
                Carregando comissões...
              </h3>
              <p className="text-default-400">Buscando comissões pendentes</p>
            </div>
          ) : comissoesPendentes.length > 0 ? (
            <Table aria-label="Tabela de Comissões Pendentes">
              <TableHeader>
                <TableColumn>Advogado</TableColumn>
                <TableColumn>OAB</TableColumn>
                <TableColumn>Fatura</TableColumn>
                <TableColumn>Tenant</TableColumn>
                <TableColumn>Valor Comissão</TableColumn>
                <TableColumn>%</TableColumn>
                <TableColumn>Status</TableColumn>
              </TableHeader>
              <TableBody>
                {comissoesPendentes.map((comissao) => (
                  <TableRow key={comissao.id}>
                    <TableCell className="font-medium">
                      {comissao.advogado.nome}
                    </TableCell>
                    <TableCell>{comissao.advogado.oab}</TableCell>
                    <TableCell>{comissao.pagamento.fatura.numero}</TableCell>
                    <TableCell>
                      {comissao.pagamento.fatura.tenant.name}
                    </TableCell>
                    <TableCell className="text-green-600 font-semibold">
                      {formatCurrency(comissao.valorComissao)}
                    </TableCell>
                    <TableCell>{comissao.percentualComissao}%</TableCell>
                    <TableCell>
                      <Badge
                        color={getStatusColor(comissao.status) as any}
                        variant="flat"
                      >
                        {comissao.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">⚖️</div>
              <h3 className="text-lg font-medium text-white mb-2">
                Nenhuma comissão pendente
              </h3>
              <p className="text-default-400">
                Todas as comissões estão em dia
              </p>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Ações Rápidas */}
      <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
        <CardHeader className="flex flex-col gap-2 pb-2">
          <h2 className="text-lg font-semibold text-white">⚡ Ações Rápidas</h2>
          <p className="text-sm text-default-400">
            Operações financeiras frequentes
          </p>
        </CardHeader>
        <Divider className="border-white/10" />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Button className="h-16" color="primary" variant="solid">
              <div className="text-center">
                <div className="text-2xl mb-1">💳</div>
                <div className="text-sm">Emitir Fatura</div>
              </div>
            </Button>
            <Button className="h-16" color="secondary" variant="solid">
              <div className="text-center">
                <div className="text-2xl mb-1">📊</div>
                <div className="text-sm">Relatório Mensal</div>
              </div>
            </Button>
            <Button className="h-16" color="success" variant="solid">
              <div className="text-center">
                <div className="text-2xl mb-1">💰</div>
                <div className="text-sm">Pagar Comissão</div>
              </div>
            </Button>
            <Button className="h-16" color="warning" variant="solid">
              <div className="text-center">
                <div className="text-2xl mb-1">📧</div>
                <div className="text-sm">Lembrar Cobrança</div>
              </div>
            </Button>
          </div>
        </CardBody>
      </Card>
    </section>
  );
}
