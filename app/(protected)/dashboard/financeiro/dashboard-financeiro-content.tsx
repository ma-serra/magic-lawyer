"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Divider,
  Skeleton,
} from "@heroui/react";
import { Download } from "lucide-react";

import { useDashboardFinanceiro } from "@/app/hooks/use-dashboard-financeiro";
import { MetricasCards } from "@/components/dashboard-financeiro/metricas-cards";
import { GraficoParcelasComponent } from "@/components/dashboard-financeiro/grafico-parcelas";
import { HonorariosAdvogado } from "@/components/dashboard-financeiro/honorarios-advogado";
import { FiltrosDashboardComponent } from "@/components/dashboard-financeiro/filtros-dashboard";
import { FiltrosDashboard } from "@/app/actions/dashboard-financeiro";
import { PeoplePageHeader } from "@/components/people-ui";

export default function DashboardFinanceiroPage() {
  const [filtros, setFiltros] = useState<FiltrosDashboard>({});

  const {
    metricas,
    grafico,
    honorarios,
    dadosBancarios,
    advogados,
    clientes,
    isLoading,
    error,
    mutate,
  } = useDashboardFinanceiro(filtros);

  const handleExport = () => {
    // TODO: Implementar exportação de dados
  };

  if (error) {
    return (
      <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 py-12 px-3 sm:px-6">
        <Card className="border border-danger/30 bg-danger/10 text-danger">
          <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="font-semibold">
                Não foi possível carregar o dashboard financeiro
              </p>
              <p className="text-sm text-danger/80">
                {(error as Error | undefined)?.message ||
                  "Tente atualizar a página ou recarregar os dados."}
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
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 py-12 px-3 sm:px-6">
      {/* Header */}
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
        initial={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.5 }}
      >
        <PeoplePageHeader
          title="Dashboard financeiro"
          description="Visão geral das receitas, despesas e performance financeira."
          tag="Visão geral"
          actions={
            <Button
              color="primary"
              startContent={<Download className="h-4 w-4" />}
              variant="flat"
              onPress={handleExport}
            >
              Exportar
            </Button>
          }
        />
      </motion.div>

      {/* Filtros */}
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        initial={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <FiltrosDashboardComponent
          advogados={advogados}
          clientes={clientes}
          dadosBancarios={dadosBancarios}
          filtros={filtros}
          isLoading={isLoading}
          onFiltrosChange={setFiltros}
        />
      </motion.div>

      {/* Loading State */}
      {isLoading && (
        <motion.div
          animate={{ opacity: 1 }}
          className="space-y-8"
          initial={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Skeleton para Métricas */}
          <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
            <CardHeader className="flex flex-col gap-2 pb-2">
              <Skeleton className="h-6 w-48 rounded-lg" />
              <Skeleton className="h-4 w-96 rounded-lg" />
            </CardHeader>
            <Divider className="border-white/10" />
            <CardBody>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={index} className="h-24 w-full rounded-2xl" />
                ))}
              </div>
            </CardBody>
          </Card>

          {/* Skeleton para Gráfico */}
          <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
            <CardHeader className="flex flex-col gap-2 pb-2">
              <Skeleton className="h-6 w-56 rounded-lg" />
              <Skeleton className="h-4 w-80 rounded-lg" />
            </CardHeader>
            <Divider className="border-white/10" />
            <CardBody>
              <Skeleton className="h-80 w-full rounded-lg" />
            </CardBody>
          </Card>

          {/* Skeleton para Honorários */}
          <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
            <CardHeader className="flex flex-col gap-2 pb-2">
              <Skeleton className="h-6 w-64 rounded-lg" />
              <Skeleton className="h-4 w-72 rounded-lg" />
            </CardHeader>
            <Divider className="border-white/10" />
            <CardBody>
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-32 w-full rounded-2xl" />
                ))}
              </div>
            </CardBody>
          </Card>
        </motion.div>
      )}

      {/* Content */}
      {!isLoading && (
        <motion.div
          animate={{ opacity: 1 }}
          className="space-y-8"
          initial={{ opacity: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          {/* Métricas Cards */}
          <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
            <CardHeader className="flex flex-col gap-2 pb-2">
              <h2 className="text-lg font-semibold text-foreground">
                Resumo Financeiro
              </h2>
              <p className="text-sm text-default-400">
                Indicadores consolidados de receitas, despesas e performance
              </p>
            </CardHeader>
            <Divider className="border-white/10" />
            <CardBody>
              <MetricasCards
                isLoading={isLoading}
                metricas={
                  metricas || {
                    receitas: {
                      total: 0,
                      recebido: 0,
                      pendente: 0,
                      atrasado: 0,
                    },
                    despesas: { total: 0, pago: 0, pendente: 0 },
                    saldo: { atual: 0, previsto: 0 },
                    performance: {
                      taxaInadimplencia: 0,
                      conversaoContratos: 0,
                      ticketMedio: 0,
                    },
                  }
                }
              />
            </CardBody>
          </Card>

          {/* Gráfico de Parcelas */}
          <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
            <CardHeader className="flex flex-col gap-2 pb-2">
              <h2 className="text-lg font-semibold text-foreground">
                Evolução das Parcelas
              </h2>
              <p className="text-sm text-default-400">
                Análise temporal das parcelas por status de pagamento
              </p>
            </CardHeader>
            <Divider className="border-white/10" />
            <CardBody>
              <GraficoParcelasComponent
                grafico={grafico}
                isLoading={isLoading}
              />
            </CardBody>
          </Card>

          {/* Honorários por Advogado */}
          <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
            <CardHeader className="flex flex-col gap-2 pb-2">
              <h2 className="text-lg font-semibold text-foreground">
                Honorários por Advogado
              </h2>
              <p className="text-sm text-default-400">
                Distribuição de honorários com controle de privacidade
              </p>
            </CardHeader>
            <Divider className="border-white/10" />
            <CardBody>
              <HonorariosAdvogado
                honorarios={honorarios}
                isLoading={isLoading}
              />
            </CardBody>
          </Card>

          {/* Informações Adicionais */}
          <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
            <CardHeader className="flex flex-col gap-2 pb-2">
              <h2 className="text-lg font-semibold text-foreground">
                Resumo do Sistema
              </h2>
              <p className="text-sm text-default-400">
                Estatísticas gerais de contas, advogados e clientes
              </p>
            </CardHeader>
            <Divider className="border-white/10" />
            <CardBody>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Resumo de Contas Bancárias */}
                <div className="rounded-2xl border border-white/10 bg-background/40 p-4">
                  <div className="flex items-center gap-3">
                    <span aria-hidden className="text-2xl">
                      🏦
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.2em] text-default-400">
                        Contas Bancárias
                      </p>
                      <p className="truncate text-xl font-semibold text-foreground">
                        {dadosBancarios.length}
                      </p>
                      <p className="text-xs text-default-400">
                        {dadosBancarios.filter((c) => c.principal).length}{" "}
                        conta(s) principal(is)
                      </p>
                    </div>
                  </div>
                </div>

                {/* Resumo de Advogados */}
                <div className="rounded-2xl border border-white/10 bg-background/40 p-4">
                  <div className="flex items-center gap-3">
                    <span aria-hidden className="text-2xl">
                      👨‍⚖️
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.2em] text-default-400">
                        Advogados Ativos
                      </p>
                      <p className="truncate text-xl font-semibold text-foreground">
                        {advogados.length}
                      </p>
                      <p className="text-xs text-default-400">
                        {honorarios.length} com honorários cadastrados
                      </p>
                    </div>
                  </div>
                </div>

                {/* Resumo de Clientes */}
                <div className="rounded-2xl border border-white/10 bg-background/40 p-4">
                  <div className="flex items-center gap-3">
                    <span aria-hidden className="text-2xl">
                      👥
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.2em] text-default-400">
                        Clientes Ativos
                      </p>
                      <p className="truncate text-xl font-semibold text-foreground">
                        {clientes.length}
                      </p>
                      <p className="text-xs text-default-400">
                        Clientes ativos no sistema
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>
        </motion.div>
      )}
    </section>
  );
}
