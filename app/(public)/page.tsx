import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Scale,
  ShieldCheck,
  Sparkles,
  Users2,
  Workflow,
} from "lucide-react";

import { authOptions } from "@/auth";
import { getPublicMarketingMetrics } from "@/app/lib/public-marketing-metrics";

const commandHighlights = [
  {
    title: "Operação processual centralizada",
    description:
      "Equipe, andamentos, tarefas e documentos no mesmo fluxo operacional.",
    icon: Scale,
  },
  {
    title: "Governança por tenant",
    description:
      "Branding, permissões, módulos e políticas separados por escritório.",
    icon: Building2,
  },
  {
    title: "Execução com rastreabilidade",
    description:
      "Auditoria, históricos e trilhas críticas registradas sem planilhas paralelas.",
    icon: ShieldCheck,
  },
  {
    title: "Automação preparada para escala",
    description:
      "Filas, workflows e integrações para crescer sem depender de operação manual.",
    icon: Workflow,
  },
];

const operatingMoments = [
  "Triagem e priorização de andamentos",
  "Portal do cliente com marca branca",
  "Financeiro jurídico e cobrança integrados",
  "Relatórios e auditoria para gestão do escritório",
];

export default async function Home() {
  const [session, metrics] = await Promise.all([
    getServerSession(authOptions),
    getPublicMarketingMetrics(),
  ]);

  const role = (session?.user as any)?.role as string | undefined;
  const numberFormatter = new Intl.NumberFormat("pt-BR");

  if (session?.user) {
    redirect(role === "SUPER_ADMIN" ? "/admin/dashboard" : "/dashboard");
  }

  const proofStats = [
    { label: "Processos sob controle", value: metrics.display.processos },
    { label: "Clientes ativos", value: metrics.display.clientes },
    { label: "Usuários habilitados", value: metrics.display.usuarios },
    { label: "Escritórios ativos", value: metrics.display.escritorios },
  ];

  const controlPanels = [
    {
      label: "Processos",
      value: numberFormatter.format(metrics.raw.processos),
      description:
        "Base processual real já centralizada na operação dos tenants ativos.",
    },
    {
      label: "Clientes",
      value: numberFormatter.format(metrics.raw.clientes),
      description:
        "Carteira cadastrada com histórico, vínculos e documentos nos escritórios ativos.",
    },
    {
      label: "Base multi-tenant",
      value: numberFormatter.format(metrics.raw.escritorios),
      description:
        "Escritórios já operando com branding, permissões e módulos separados.",
    },
    {
      label: "Equipe habilitada",
      value: numberFormatter.format(metrics.raw.usuarios),
      description:
        "Usuários ativos com perfis operacionais, administrativos e jurídicos em uso real.",
    },
  ];

  return (
    <section className="-mx-6 overflow-hidden pb-20">
      <div className="relative px-6 pb-20 pt-4 sm:pt-6">
        <div
          aria-hidden
          className="absolute inset-0 -z-30 bg-gradient-to-br from-amber-50 via-white to-sky-100 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-20 bg-[linear-gradient(rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:36px_36px] dark:bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)]"
        />
        <div
          aria-hidden
          className="absolute left-[-8rem] top-16 -z-10 h-72 w-72 rounded-full bg-amber-300/35 blur-3xl dark:bg-primary/18"
        />
        <div
          aria-hidden
          className="absolute bottom-0 right-[-6rem] -z-10 h-80 w-80 rounded-full bg-sky-300/35 blur-3xl dark:bg-cyan-500/16"
        />

        <div className="mx-auto flex w-full max-w-6xl flex-col gap-20">
          <div className="grid gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
            <div className="space-y-8">
              <div className="space-y-5">
                <Chip
                  className="border border-amber-200/80 bg-amber-100/80 px-4 text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-900 dark:border-primary/20 dark:bg-primary/10 dark:text-primary-200"
                  radius="full"
                  variant="flat"
                >
                  Sistema operacional para escritórios premium
                </Chip>
                <div className="space-y-4">
                  <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl lg:text-6xl dark:text-white">
                    O backoffice jurídico que organiza operação, marca e escala
                    no mesmo lugar.
                  </h1>
                  <p className="max-w-2xl text-base leading-7 text-slate-600 sm:text-lg dark:text-slate-300">
                    Magic Lawyer centraliza processos, clientes, documentos,
                    financeiro e automações em uma estrutura multi-tenant
                    preparada para escritórios que não aceitam improviso.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  as="a"
                  className="min-w-[220px] bg-slate-950 text-white shadow-[0_18px_40px_-22px_rgba(15,23,42,0.75)] hover:bg-slate-800 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90"
                  endContent={<ArrowRight className="h-4 w-4" />}
                  href="/login"
                  radius="full"
                  size="lg"
                >
                  Entrar na plataforma
                </Button>
                <Button
                  as="a"
                  className="min-w-[220px] border-slate-300 bg-white/70 text-slate-900 hover:bg-white dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                  href="/precos"
                  radius="full"
                  size="lg"
                  variant="bordered"
                >
                  Ver planos e implantação
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {operatingMoments.map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-3 rounded-2xl border border-slate-200/70 bg-white/72 px-4 py-4 shadow-[0_20px_45px_-32px_rgba(15,23,42,0.35)] backdrop-blur dark:border-white/10 dark:bg-white/6"
                  >
                    <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-primary" />
                    <p className="text-sm leading-6 text-slate-700 dark:text-slate-300">
                      {item}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <Card className="overflow-hidden border border-slate-200/80 bg-white/82 shadow-[0_35px_90px_-48px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/72">
              <CardBody className="gap-6 p-6 sm:p-8">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
                      Sala de comando
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
                      Operação jurídica visível em tempo real
                    </h2>
                  </div>
                  <div className="rounded-2xl border border-amber-200/80 bg-amber-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-amber-900 dark:border-primary/20 dark:bg-primary/12 dark:text-primary-200">
                    Multi-tenant
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {controlPanels.map((panel) => (
                    <div
                      key={panel.label}
                      className="rounded-2xl border border-slate-200/80 bg-slate-50/90 p-4 dark:border-white/10 dark:bg-white/5"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                        {panel.label}
                      </p>
                      <p className="mt-3 text-3xl font-semibold text-slate-950 dark:text-white">
                        {panel.value}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                        {panel.description}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="rounded-[1.6rem] border border-slate-200/80 bg-slate-950 px-5 py-5 text-white dark:border-white/10">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                        Timeline inteligente
                      </p>
                      <p className="mt-2 text-lg font-semibold">
                        Tudo que a plataforma consolida para a operação
                      </p>
                    </div>
                    <Sparkles className="h-5 w-5 text-amber-300" />
                  </div>
                  <div className="mt-5 space-y-3">
                    <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3">
                      <p className="text-sm font-medium">
                        Andamentos, tarefas e documentos ficam visíveis em um
                        único fluxo operacional.
                      </p>
                      <p className="mt-1 text-sm text-slate-300">
                        A equipe entende o estado do caso sem depender de
                        repasse manual entre áreas.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3">
                      <p className="text-sm font-medium">
                        Portal do cliente, auditoria e branding coexistem na
                        mesma arquitetura multi-tenant.
                      </p>
                      <p className="mt-1 text-sm text-slate-300">
                        O escritório cresce sem fragmentar identidade nem perder
                        rastreabilidade.
                      </p>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {proofStats.map((item) => (
              <Card
                key={item.label}
                className="border border-slate-200/70 bg-white/74 shadow-[0_25px_50px_-36px_rgba(15,23,42,0.42)] backdrop-blur dark:border-white/10 dark:bg-white/5"
              >
                <CardBody className="gap-2 p-5">
                  <p className="text-3xl font-semibold text-slate-950 dark:text-white">
                    {item.value}
                  </p>
                  <p className="text-sm uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                    {item.label}
                  </p>
                </CardBody>
              </Card>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr]">
            <Card className="border border-slate-200/80 bg-white/76 shadow-[0_30px_70px_-46px_rgba(15,23,42,0.48)] backdrop-blur dark:border-white/10 dark:bg-white/5">
              <CardBody className="gap-6 p-7">
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
                    Para crescer sem improviso
                  </p>
                  <h2 className="text-3xl font-semibold text-slate-950 dark:text-white">
                    A mesma base que organiza um piloto também sustenta uma
                    operação multi-escritório.
                  </h2>
                  <p className="text-base leading-7 text-slate-600 dark:text-slate-300">
                    O produto foi desenhado para escritórios que precisam
                    crescer com identidade própria, controles claros e execução
                    previsível.
                  </p>
                </div>

                <div className="rounded-3xl border border-slate-200/80 bg-slate-50/90 p-5 dark:border-white/10 dark:bg-slate-900/65">
                  <div className="flex items-center gap-3">
                    <Users2 className="h-5 w-5 text-amber-600 dark:text-primary" />
                    <div>
                      <p className="font-semibold text-slate-950 dark:text-white">
                        Marca branca por escritório
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        Domínio, identidade visual e experiência própria por
                        tenant.
                      </p>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2">
              {commandHighlights.map((item) => (
                <Card
                  key={item.title}
                  className="border border-slate-200/70 bg-white/74 shadow-[0_20px_45px_-34px_rgba(15,23,42,0.38)] backdrop-blur dark:border-white/10 dark:bg-white/5"
                >
                  <CardBody className="gap-4 p-5">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white dark:bg-primary dark:text-primary-foreground">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-950 dark:text-white">
                        {item.title}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                        {item.description}
                      </p>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          </div>

          <Card className="border border-slate-200/80 bg-slate-950 text-white shadow-[0_35px_90px_-48px_rgba(15,23,42,0.6)] dark:border-white/10">
            <CardBody className="flex flex-col gap-6 px-6 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Implantação guiada
                </p>
                <h2 className="mt-3 text-3xl font-semibold">
                  Coloque a operação inteira em uma base profissional, não em
                  uma soma de remendos.
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  Planos, migração, módulos e jornada comercial já prontos para
                  iniciar com piloto e escalar com governança.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:min-w-[240px]">
                <Button
                  as="a"
                  className="bg-white text-slate-950 hover:bg-slate-100"
                  href="/precos#lead-chat"
                  radius="full"
                  size="lg"
                >
                  Falar com especialista
                </Button>
                <Button
                  as="a"
                  className="border-white/15 text-white hover:bg-white/10"
                  href="/login"
                  radius="full"
                  size="lg"
                  variant="bordered"
                >
                  Acessar plataforma
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </section>
  );
}
