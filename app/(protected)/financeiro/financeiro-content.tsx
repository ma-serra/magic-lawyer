"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Divider } from "@heroui/divider";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import { Tabs, Tab } from "@heroui/react";
import {
  ArrowRight,
  BarChart3,
  Briefcase,
  Building2,
  FileSpreadsheet,
  Landmark,
  Shield,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";

import { type FiltrosDashboard } from "@/app/actions/dashboard-financeiro";
import { useDashboardFinanceiro } from "@/app/hooks/use-dashboard-financeiro";
import { PeopleMetricCard, PeoplePageHeader } from "@/components/people-ui";
import { FiltrosDashboardComponent } from "@/components/dashboard-financeiro/filtros-dashboard";
import { MetricasCards } from "@/components/dashboard-financeiro/metricas-cards";
import { GraficoParcelasComponent } from "@/components/dashboard-financeiro/grafico-parcelas";
import { HonorariosAdvogado } from "@/components/dashboard-financeiro/honorarios-advogado";

interface FinanceiroContentProps {
  userRole: string;
  userName?: string;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function getRoleContext(role: string) {
  switch (role) {
    case "ADMIN":
      return {
        label: "Admin do escritório",
        description:
          "Acompanhe o caixa do escritório e distribua a operação entre honorários, cobranças e carteira de processos.",
        color: "primary" as const,
      };
    case "ADVOGADO":
      return {
        label: "Advogado",
        description:
          "Sua visão prioriza carteira pessoal, honorários vinculados e saúde dos processos sob sua responsabilidade.",
        color: "success" as const,
      };
    case "SECRETARIA":
      return {
        label: "Secretaria",
        description:
          "Foque na execução de cobrança e no acompanhamento de pendências sem perder a visão do escritório.",
        color: "secondary" as const,
      };
    case "FINANCEIRO":
      return {
        label: "Equipe financeira",
        description:
          "Controle de recebíveis, inadimplência e performance operacional por cliente e processo.",
        color: "warning" as const,
      };
    default:
      return {
        label: "Visão operacional",
        description:
          "Acompanhe receitas e pendências com foco em previsibilidade e tomada de decisão.",
        color: "default" as const,
      };
  }
}

function noDataMessage(title: string, helper: string) {
  return (
    <Card className="border border-white/10 bg-background/50">
      <CardBody className="py-10 text-center">
        <p className="text-base font-semibold text-white">{title}</p>
        <p className="mt-2 text-sm text-default-400">{helper}</p>
      </CardBody>
    </Card>
  );
}

export default function FinanceiroContent({
  userRole,
  userName,
}: FinanceiroContentProps) {
  const [filtros, setFiltros] = useState<FiltrosDashboard>({});
  const roleContext = getRoleContext(userRole);

  const {
    metricas,
    grafico,
    honorarios,
    dadosBancarios,
    advogados,
    clientes,
    visoesFinanceiras,
    isLoading,
    error,
    mutate,
  } = useDashboardFinanceiro(filtros);

  const indicadores = useMemo(() => {
    if (!metricas) {
      return {
        totalProcessosFinanceiros: 0,
        totalClientesFinanceiros: 0,
        totalResponsaveisFinanceiros: 0,
      };
    }

    return {
      totalProcessosFinanceiros: visoesFinanceiras.porProcesso.length,
      totalClientesFinanceiros: visoesFinanceiras.porCliente.length,
      totalResponsaveisFinanceiros: visoesFinanceiras.porResponsavel.length,
    };
  }, [metricas, visoesFinanceiras]);

  if (error) {
    return (
      <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-3 py-8 sm:px-6">
        <Card className="border border-danger/30 bg-danger/10 text-danger">
          <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="font-semibold">
                Não foi possível carregar o cockpit financeiro
              </p>
              <p className="text-sm text-danger/80">
                {(error as Error | undefined)?.message ||
                  "Tente novamente em instantes."}
              </p>
            </div>
            <Button color="danger" variant="flat" onPress={() => mutate()}>
              Tentar novamente
            </Button>
          </CardBody>
        </Card>
      </section>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-3 py-8 sm:px-6">
      <PeoplePageHeader
        tag="Financeiro"
        title="Cockpit financeiro"
        description="Visão de escritório, profissionais e carteira processual no mesmo contexto, com controle por papel e foco operacional real."
      />

      <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
        <CardBody className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Escopo ativo
            </p>
            <p className="text-sm text-default-300">
              {userName ? `Operando como ${userName}. ` : ""}
              {roleContext.description}
            </p>
          </div>
          <Chip color={roleContext.color} variant="flat">
            {roleContext.label}
          </Chip>
        </CardBody>
      </Card>

      <FiltrosDashboardComponent
        advogados={advogados}
        clientes={clientes}
        dadosBancarios={dadosBancarios}
        filtros={filtros}
        isLoading={isLoading}
        onFiltrosChange={setFiltros}
      />

      {isLoading && (
        <Card className="border border-white/10 bg-background/60">
          <CardBody className="flex items-center justify-center py-16">
            <div className="text-center">
              <Spinner color="primary" size="lg" />
              <p className="mt-4 text-sm text-default-400">
                Consolidando indicadores financeiros...
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      {!isLoading && metricas && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <PeopleMetricCard
              tone="success"
              label="Recebido"
              value={formatCurrency(metricas.receitas.recebido)}
              helper="Valor efetivamente no caixa"
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <PeopleMetricCard
              tone="danger"
              label="Em atraso"
              value={formatCurrency(metricas.receitas.atrasado)}
              helper="Cobrança imediata necessária"
              icon={<TrendingDown className="h-4 w-4" />}
            />
            <PeopleMetricCard
              tone="primary"
              label="Ticket médio"
              value={formatCurrency(metricas.performance.ticketMedio)}
              helper="Média por contrato"
              icon={<Landmark className="h-4 w-4" />}
            />
            <PeopleMetricCard
              tone="warning"
              label="Inadimplência"
              value={`${metricas.performance.taxaInadimplencia.toFixed(1)}%`}
              helper="Percentual de parcelas em atraso"
              icon={<Shield className="h-4 w-4" />}
            />
            <PeopleMetricCard
              tone="secondary"
              label="Processos monitorados"
              value={indicadores.totalProcessosFinanceiros}
              helper="Com vínculo financeiro ativo"
              icon={<Briefcase className="h-4 w-4" />}
            />
            <PeopleMetricCard
              tone="secondary"
              label="Clientes monitorados"
              value={indicadores.totalClientesFinanceiros}
              helper="Carteira financeira ativa"
              icon={<Building2 className="h-4 w-4" />}
            />
            <PeopleMetricCard
              tone="secondary"
              label="Responsáveis ativos"
              value={indicadores.totalResponsaveisFinanceiros}
              helper="Profissionais com carteira financeira"
              icon={<Users className="h-4 w-4" />}
            />
            <PeopleMetricCard
              tone="default"
              label="Saldo previsto"
              value={formatCurrency(metricas.saldo.previsto)}
              helper="Projeção após liquidação"
              icon={<BarChart3 className="h-4 w-4" />}
            />
          </div>

          <Tabs
            aria-label="Visões financeiras"
            classNames={{
              base: "w-full",
              tabList:
                "w-full justify-start gap-2 rounded-xl border border-white/10 bg-background/40 p-2",
              tab: "h-10 px-4 data-[selected=true]:bg-primary/15 data-[selected=true]:text-primary",
              tabContent: "font-medium",
            }}
            color="primary"
            radius="full"
            variant="bordered"
          >
            <Tab
              key="escritorio"
              title={
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  <span>Escritório</span>
                </div>
              }
            >
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 space-y-6"
                initial={{ opacity: 0, y: 12 }}
              >
                <Card className="border border-white/10 bg-background/60">
                  <CardHeader className="flex flex-col gap-1 pb-2">
                    <h2 className="text-lg font-semibold text-white">
                      Panorama geral de caixa
                    </h2>
                    <p className="text-sm text-default-400">
                      Indicadores consolidados de faturamento e risco financeiro.
                    </p>
                  </CardHeader>
                  <Divider className="border-white/10" />
                  <CardBody>
                    <MetricasCards metricas={metricas} />
                  </CardBody>
                </Card>

                <Card className="border border-white/10 bg-background/60">
                  <CardHeader className="flex flex-col gap-1 pb-2">
                    <h2 className="text-lg font-semibold text-white">
                      Evolução mensal das parcelas
                    </h2>
                    <p className="text-sm text-default-400">
                      Fluxo de recebimento e pendências ao longo do tempo.
                    </p>
                  </CardHeader>
                  <Divider className="border-white/10" />
                  <CardBody>
                    <GraficoParcelasComponent grafico={grafico} />
                  </CardBody>
                </Card>
              </motion.div>
            </Tab>

            <Tab
              key="profissionais"
              title={
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span>Profissionais</span>
                </div>
              }
            >
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 space-y-6"
                initial={{ opacity: 0, y: 12 }}
              >
                <Card className="border border-white/10 bg-background/60">
                  <CardHeader className="flex flex-col gap-1 pb-2">
                    <h2 className="text-lg font-semibold text-white">
                      Honorários por profissional
                    </h2>
                    <p className="text-sm text-default-400">
                      O que cada advogado gera, recebe e ainda possui pendente.
                    </p>
                  </CardHeader>
                  <Divider className="border-white/10" />
                  <CardBody>
                    <HonorariosAdvogado honorarios={honorarios} />
                  </CardBody>
                </Card>

                <Card className="border border-white/10 bg-background/60">
                  <CardHeader className="flex items-center justify-between gap-3 pb-2">
                    <div>
                      <h2 className="text-lg font-semibold text-white">
                        Carteira financeira por responsável
                      </h2>
                      <p className="text-sm text-default-400">
                        Produção financeira ligada aos profissionais do escritório.
                      </p>
                    </div>
                    <Button
                      as={Link}
                      href="/financeiro/honorarios"
                      radius="full"
                      size="sm"
                      variant="flat"
                    >
                      Abrir honorários
                    </Button>
                  </CardHeader>
                  <Divider className="border-white/10" />
                  <CardBody className="space-y-3">
                    {visoesFinanceiras.porResponsavel.length === 0
                      ? noDataMessage(
                          "Sem carteira profissional no filtro atual",
                          "Cadastre contratos com responsável e parcelas para habilitar esta visão.",
                        )
                      : visoesFinanceiras.porResponsavel.map((item) => (
                          <Card
                            key={item.responsavelId}
                            className="border border-white/10 bg-background/40"
                          >
                            <CardBody className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-sm font-semibold text-white">
                                  {item.responsavelNome}
                                </p>
                                <p className="text-xs text-default-400">
                                  {item.contratos} contrato(s) • {item.processos}{" "}
                                  processo(s)
                                </p>
                              </div>
                              <div className="grid grid-cols-3 gap-3 text-right">
                                <div>
                                  <p className="text-[11px] uppercase tracking-[0.16em] text-success/80">
                                    Recebido
                                  </p>
                                  <p className="text-sm font-semibold text-success">
                                    {formatCurrency(item.recebido)}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[11px] uppercase tracking-[0.16em] text-warning/80">
                                    Pendente
                                  </p>
                                  <p className="text-sm font-semibold text-warning">
                                    {formatCurrency(item.pendente)}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[11px] uppercase tracking-[0.16em] text-danger/80">
                                    Atrasado
                                  </p>
                                  <p className="text-sm font-semibold text-danger">
                                    {formatCurrency(item.atrasado)}
                                  </p>
                                </div>
                              </div>
                            </CardBody>
                          </Card>
                        ))}
                  </CardBody>
                </Card>
              </motion.div>
            </Tab>

            <Tab
              key="processos-clientes"
              title={
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  <span>Processos e clientes</span>
                </div>
              }
            >
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-2"
                initial={{ opacity: 0, y: 12 }}
              >
                <Card className="border border-white/10 bg-background/60">
                  <CardHeader className="flex items-center justify-between gap-3 pb-2">
                    <div>
                      <h2 className="text-lg font-semibold text-white">
                        Processos com maior impacto financeiro
                      </h2>
                      <p className="text-sm text-default-400">
                        Combine valor recebido, pendências e risco por processo.
                      </p>
                    </div>
                    <FileSpreadsheet className="h-5 w-5 text-primary" />
                  </CardHeader>
                  <Divider className="border-white/10" />
                  <CardBody className="space-y-3">
                    {visoesFinanceiras.porProcesso.length === 0
                      ? noDataMessage(
                          "Nenhum processo financeiro no filtro atual",
                          "Vincule contratos e parcelas aos processos para desbloquear essa análise.",
                        )
                      : visoesFinanceiras.porProcesso.map((item) => (
                          <Card
                            key={item.processoId}
                            className="border border-white/10 bg-background/40"
                          >
                            <CardBody className="space-y-2 p-4">
                              <p className="text-sm font-semibold text-white">
                                {item.processoNumero}
                              </p>
                              <p className="text-xs text-default-400">
                                {item.processoTitulo}
                              </p>
                              <p className="text-xs text-default-400">
                                Cliente: {item.clienteNome} • Responsável:{" "}
                                {item.responsavelNome}
                              </p>
                              <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
                                <Chip color="success" size="sm" variant="flat">
                                  Recebido {formatCurrency(item.recebido)}
                                </Chip>
                                <Chip color="warning" size="sm" variant="flat">
                                  Pendente {formatCurrency(item.pendente)}
                                </Chip>
                                <Chip color="danger" size="sm" variant="flat">
                                  Atrasado {formatCurrency(item.atrasado)}
                                </Chip>
                              </div>
                              {item.processoId !== "sem-processo" ? (
                                <Button
                                  as={Link}
                                  className="mt-2 w-full sm:w-auto"
                                  color="primary"
                                  endContent={<ArrowRight className="h-4 w-4" />}
                                  href={`/processos/${item.processoId}`}
                                  size="sm"
                                  variant="flat"
                                >
                                  Abrir processo
                                </Button>
                              ) : null}
                            </CardBody>
                          </Card>
                        ))}
                  </CardBody>
                </Card>

                <Card className="border border-white/10 bg-background/60">
                  <CardHeader className="flex items-center justify-between gap-3 pb-2">
                    <div>
                      <h2 className="text-lg font-semibold text-white">
                        Carteira financeira por cliente
                      </h2>
                      <p className="text-sm text-default-400">
                        Quem concentra receita, pendência e exposição de cobrança.
                      </p>
                    </div>
                    <Building2 className="h-5 w-5 text-primary" />
                  </CardHeader>
                  <Divider className="border-white/10" />
                  <CardBody className="space-y-3">
                    {visoesFinanceiras.porCliente.length === 0
                      ? noDataMessage(
                          "Nenhuma carteira de cliente no filtro atual",
                          "Inclua contratos com cliente vinculado para abrir esta visão.",
                        )
                      : visoesFinanceiras.porCliente.map((item) => (
                          <Card
                            key={item.clienteId}
                            className="border border-white/10 bg-background/40"
                          >
                            <CardBody className="space-y-2 p-4">
                              <p className="text-sm font-semibold text-white">
                                {item.clienteNome}
                              </p>
                              <p className="text-xs text-default-400">
                                {item.contratos} contrato(s) • {item.processos}{" "}
                                processo(s) vinculados
                              </p>
                              <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
                                <Chip color="success" size="sm" variant="flat">
                                  Recebido {formatCurrency(item.recebido)}
                                </Chip>
                                <Chip color="warning" size="sm" variant="flat">
                                  Pendente {formatCurrency(item.pendente)}
                                </Chip>
                                <Chip color="danger" size="sm" variant="flat">
                                  Atrasado {formatCurrency(item.atrasado)}
                                </Chip>
                              </div>
                              <Button
                                as={Link}
                                className="mt-2 w-full sm:w-auto"
                                color="primary"
                                endContent={<ArrowRight className="h-4 w-4" />}
                                href={`/clientes/${item.clienteId}`}
                                size="sm"
                                variant="flat"
                              >
                                Abrir cliente
                              </Button>
                            </CardBody>
                          </Card>
                        ))}
                  </CardBody>
                </Card>
              </motion.div>
            </Tab>
          </Tabs>
        </>
      )}
    </section>
  );
}
