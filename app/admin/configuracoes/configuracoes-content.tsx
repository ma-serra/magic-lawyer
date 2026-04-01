"use client";

import NextLink from "next/link";
import useSWR from "swr";
import { Button, Chip, Spinner } from "@heroui/react";
import {
  Building2,
  CreditCard,
  FileSignature,
  Landmark,
  Layers,
  LifeBuoy,
  Mail,
  MessageSquare,
  PlugZap,
  Puzzle,
  Send,
  ShieldCheck,
  Shield,
  Smartphone,
} from "lucide-react";

import { getSuperAdminDashboardData } from "@/app/actions/admin-dashboard";
import { getDashboardBancos } from "@/app/actions/bancos";
import { getDashboardModulos } from "@/app/actions/modulos";
import { getEstatisticasPlanos } from "@/app/actions/planos";
import { PeopleMetricCard, PeoplePageHeader, PeoplePanel } from "@/components/people-ui";

const CHECK_INTERVAL_MS = 60000;

export function ConfiguracoesContent() {
  const { data: dashboardResponse, isLoading: loadingDashboard } = useSWR(
    "admin-settings-dashboard-overview",
    getSuperAdminDashboardData,
    {
      revalidateOnFocus: false,
      refreshInterval: CHECK_INTERVAL_MS,
    },
  );

  const { data: planosResponse, isLoading: loadingPlanos } = useSWR(
    "admin-settings-planos-overview",
    getEstatisticasPlanos,
    {
      revalidateOnFocus: false,
      refreshInterval: CHECK_INTERVAL_MS,
    },
  );

  const { data: modulosResponse, isLoading: loadingModulos } = useSWR(
    "admin-settings-modulos-overview",
    getDashboardModulos,
    {
      revalidateOnFocus: false,
      refreshInterval: CHECK_INTERVAL_MS,
    },
  );

  const { data: bancosResponse, isLoading: loadingBancos } = useSWR(
    "admin-settings-bancos-overview",
    getDashboardBancos,
    {
      revalidateOnFocus: false,
      refreshInterval: CHECK_INTERVAL_MS,
    },
  );

  const dashboard = dashboardResponse?.success ? dashboardResponse.data : undefined;
  const planos = planosResponse?.success ? planosResponse.data : undefined;
  const modulos = modulosResponse?.success ? modulosResponse.data : undefined;
  const bancos = bancosResponse?.success ? bancosResponse.dashboard : undefined;

  const statusCore: Array<{
    label: string;
    ok: boolean;
    detail: string;
  }> = [
    {
      label: "Painel executivo",
      ok: Boolean(dashboardResponse?.success),
      detail: dashboardResponse?.success
        ? "Métricas globais operacionais"
        : dashboardResponse?.error || "Falha ao carregar",
    },
    {
      label: "Gestão de planos",
      ok: Boolean(planosResponse?.success),
      detail: planosResponse?.success
        ? `${planos?.totalPlanos ?? 0} plano(s) monitorados`
        : planosResponse?.error || "Falha ao carregar",
    },
    {
      label: "Catálogo de módulos",
      ok: Boolean(modulosResponse?.success),
      detail: modulosResponse?.success
        ? `${modulos?.ativos ?? 0} módulo(s) ativo(s)`
        : modulosResponse?.error || "Falha ao carregar",
    },
    {
      label: "Catálogo de bancos",
      ok: Boolean(bancosResponse?.success),
      detail: bancosResponse?.success
        ? `${bancos?.bancosAtivos ?? 0} banco(s) ativo(s)`
        : bancosResponse?.error || "Falha ao carregar",
    },
  ];

  const isLoading =
    loadingDashboard || loadingPlanos || loadingModulos || loadingBancos;

  return (
    <section className="space-y-6">
      <PeoplePageHeader
        tag="Administração"
        title="Configurações globais da plataforma"
        description="Central de governança para regras de negócio do sistema inteiro. Aqui você acompanha saúde do core e acessa os módulos responsáveis por cada configuração."
        actions={
          <>
            <Button as={NextLink} color="primary" href="/admin/dashboard" size="sm">
              Painel executivo
            </Button>
            <Button as={NextLink} href="/admin/auditoria" size="sm" variant="bordered">
              Auditoria
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <PeopleMetricCard
          label="Tenants ativos"
          value={dashboard?.totals.activeTenants ?? 0}
          helper={`${dashboard?.totals.totalTenants ?? 0} tenant(s) total`}
          tone="primary"
          icon={<Building2 className="h-4 w-4" />}
        />
        <PeopleMetricCard
          label="Planos ativos"
          value={planos?.planosAtivos ?? 0}
          helper={`${planos?.totalPlanos ?? 0} plano(s) cadastrado(s)`}
          tone="success"
          icon={<Layers className="h-4 w-4" />}
        />
        <PeopleMetricCard
          label="Módulos ativos"
          value={modulos?.ativos ?? 0}
          helper={`${modulos?.categorias ?? 0} categoria(s)`}
          tone="secondary"
          icon={<Puzzle className="h-4 w-4" />}
        />
        <PeopleMetricCard
          label="Bancos ativos"
          value={bancos?.bancosAtivos ?? 0}
          helper={`${bancos?.totalBancos ?? 0} banco(s) no catálogo`}
          tone="warning"
          icon={<Landmark className="h-4 w-4" />}
        />
      </div>

      <PeoplePanel
        title="Mapa de configuração"
        description="Cada domínio administrativo tem tela própria. Esta central evita configuração fake e concentra governança real."
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[
            {
              title: "Planos comerciais",
              description:
                "Define limites, preço e habilitação de módulos por plano.",
              href: "/admin/planos",
              icon: <Layers className="h-4 w-4" />,
            },
            {
              title: "Módulos e categorias",
              description:
                "Controla arquitetura funcional do produto e organização de features.",
              href: "/admin/modulos",
              icon: <Puzzle className="h-4 w-4" />,
            },
            {
              title: "Financeiro global",
              description:
                "Métricas de receita, assinaturas, faturas e pagamentos da plataforma.",
              href: "/admin/financeiro",
              icon: <CreditCard className="h-4 w-4" />,
            },
            {
              title: "Bancos",
              description:
                "Catálogo oficial compartilhado para dados bancários dos escritórios.",
              href: "/admin/bancos",
              icon: <Landmark className="h-4 w-4" />,
            },
            {
              title: "Suporte",
              description:
                "Fila de tickets/chats, atribuição e fechamento operacional.",
              href: "/admin/suporte",
              icon: <LifeBuoy className="h-4 w-4" />,
            },
            {
              title: "Auditoria",
              description:
                "Rastreabilidade de ações críticas do super admin e tenants.",
              href: "/admin/auditoria",
              icon: <ShieldCheck className="h-4 w-4" />,
            },
          ].map((item) => (
            <div
              key={item.href}
              className="rounded-2xl ml-admin-surface-muted p-4"
            >
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                {item.icon}
                {item.title}
              </div>
              <p className="mb-4 text-sm text-default-400">{item.description}</p>
              <Button as={NextLink} href={item.href} size="sm" variant="flat">
                Abrir
              </Button>
            </div>
          ))}
        </div>
      </PeoplePanel>

      <PeoplePanel
        title="Integrações da Plataforma"
        description="No super admin, integrações ficam agrupadas como domínio próprio. O core da plataforma não deve se misturar com provedores externos e operações por tenant."
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[
            {
              title: "Email transacional",
              description:
                "Operação por tenant. O super admin entra aqui para suporte e governança das credenciais de envio.",
              icon: <Mail className="h-4 w-4" />,
              scope: "Por tenant",
              href: "/admin/tenants",
              cta: "Abrir tenants",
            },
            {
              title: "ClickSign",
              description:
                "Base multi-tenant em evolução. O próximo passo é observabilidade e inspeção operacional sem expor segredos.",
              icon: <FileSignature className="h-4 w-4" />,
              scope: "Assinatura",
              href: "/admin/tenants",
              cta: "Ver tenants",
            },
            {
              title: "Certificados e PJe",
              description:
                "Integração sensível por tenant, com política e validade que o super admin precisa monitorar.",
              icon: <Shield className="h-4 w-4" />,
              scope: "PJe",
              href: "/admin/tenants",
              cta: "Inspecionar tenants",
            },
            {
              title: "Asaas",
              description:
                "Billing e cobrança seguem separados do core e precisam de leitura administrativa por tenant e por receita global.",
              icon: <CreditCard className="h-4 w-4" />,
              scope: "Financeiro",
              href: "/admin/financeiro",
              cta: "Abrir financeiro",
            },
            {
              title: "WhatsApp / Telegram / SMS",
              description:
                "Bloco omnichannel planejado. A navegação já está sendo organizada para receber esses canais sem multiplicar telas.",
              icon: <PlugZap className="h-4 w-4" />,
              scope: "Roadmap",
              href: null,
              cta: null,
            },
            {
              title: "Canais futuros",
              description:
                "Fallback por canal, automações e trilha de entrega serão tratados dentro do mesmo domínio de integrações.",
              icon: (
                <div className="flex items-center gap-1">
                  <MessageSquare className="h-4 w-4" />
                  <Send className="h-4 w-4" />
                  <Smartphone className="h-4 w-4" />
                </div>
              ),
              scope: "Omnichannel",
              href: null,
              cta: null,
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-2xl ml-admin-surface-muted p-4"
            >
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                {item.icon}
                {item.title}
              </div>
              <div className="mb-3">
                <Chip color="secondary" size="sm" variant="flat">
                  {item.scope}
                </Chip>
              </div>
              <p className="mb-4 text-sm text-default-400">{item.description}</p>
              {item.href && item.cta ? (
                <Button as={NextLink} href={item.href} size="sm" variant="flat">
                  {item.cta}
                </Button>
              ) : (
                <Chip color="warning" size="sm" variant="flat">
                  Estrutura preparada
                </Chip>
              )}
            </div>
          ))}
        </div>
      </PeoplePanel>

      <PeoplePanel
        title="Regra de negócio do admin"
        description="Escopo do super admin para evitar confusão com admin de tenant."
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border border-success/20 bg-success/10 p-4">
            <p className="text-sm font-semibold text-success">Super admin pode</p>
            <p className="mt-2 text-sm text-default-700 dark:text-default-200">
              Gerenciar tenant, plano, módulo, bancos, suporte global e auditoria
              completa da plataforma.
            </p>
          </div>
          <div className="rounded-2xl border border-warning/20 bg-warning/10 p-4">
            <p className="text-sm font-semibold text-warning">Admin de tenant não pode</p>
            <p className="mt-2 text-sm text-default-700 dark:text-default-200">
              Alterar configurações globais do SaaS. Ele opera apenas dados internos
              do próprio escritório.
            </p>
          </div>
        </div>
      </PeoplePanel>

      <PeoplePanel
        title="Saúde operacional do core"
        description="Validação rápida da malha administrativa principal."
      >
        {isLoading ? (
          <div className="flex items-center gap-2 py-2 text-sm text-default-400">
            <Spinner size="sm" />
            Sincronizando estado operacional...
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {statusCore.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-2xl ml-admin-surface-subtle p-3"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.label}</p>
                  <p className="text-xs text-default-400">{item.detail}</p>
                </div>
                <Chip color={item.ok ? "success" : "danger"} size="sm" variant="flat">
                  {item.ok ? "Operacional" : "Falha"}
                </Chip>
              </div>
            ))}
          </div>
        )}
      </PeoplePanel>
    </section>
  );
}
