"use client";

import { type Key, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Tabs, Tab } from "@heroui/tabs";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Divider } from "@heroui/divider";
import { Chip } from "@heroui/chip";
import { Button } from "@heroui/button";
import NextLink from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3,
  Building2,
  Calendar,
  CheckSquare,
  CreditCard,
  FileSignature,
  FileText,
  Landmark,
  Mail,
  Palette,
  Scale,
  Shield,
} from "lucide-react";

import { EmailCredentialsCard } from "./email-credentials-card";
import { TenantSettingsForm } from "./tenant-settings-form";
import { TenantBrandingForm } from "./tenant-branding-form";
import { DigitalCertificatesPanel } from "./digital-certificates-panel";
import { DigitalCertificatePolicyCard } from "./digital-certificate-policy-card";
import type { DigitalCertificatePolicy } from "@/generated/prisma";

const SettingsTabLoader = () => (
  <Card className="mt-6 border border-white/10 bg-background/70 backdrop-blur-xl">
    <CardBody className="py-10 text-center text-sm text-default-400">
      Carregando configurações...
    </CardBody>
  </Card>
);

const FeriadosSettingsTab = dynamic(() => import("./feriados/page"), {
  ssr: false,
  loading: () => <SettingsTabLoader />,
});
const BillingSettingsTab = dynamic(() => import("./billing/billing-content"), {
  ssr: false,
  loading: () => <SettingsTabLoader />,
});
const TribunaisSettingsTab = dynamic(() => import("./tribunais/page"), {
  ssr: false,
  loading: () => <SettingsTabLoader />,
});
const TiposPeticaoSettingsTab = dynamic(() => import("./tipos-peticao/page"), {
  ssr: false,
  loading: () => <SettingsTabLoader />,
});
const TiposContratoSettingsTab = dynamic(() => import("./tipos-contrato/page"), {
  ssr: false,
  loading: () => <SettingsTabLoader />,
});
const AreasProcessoSettingsTab = dynamic(() => import("./areas-processo/page"), {
  ssr: false,
  loading: () => <SettingsTabLoader />,
});
const CategoriasTarefaSettingsTab = dynamic(
  () => import("./categorias-tarefa/page"),
  {
    ssr: false,
    loading: () => <SettingsTabLoader />,
  },
);
const AsaasSettingsTab = dynamic(() => import("./asaas/page"), {
  ssr: false,
  loading: () => <SettingsTabLoader />,
});

const SETTINGS_TAB_KEYS = [
  "overview",
  "tenant",
  "branding",
  "email",
  "certificates",
  "feriados",
  "billing",
  "tribunais",
  "tipos-peticao",
  "tipos-contrato",
  "areas-processo",
  "categorias-tarefa",
  "asaas",
] as const;

type SettingsTabKey = (typeof SETTINGS_TAB_KEYS)[number];

function isSettingsTabKey(value: string | null): value is SettingsTabKey {
  if (!value) return false;
  return (SETTINGS_TAB_KEYS as readonly string[]).includes(value);
}

interface TenantSettingsFormProps {
  tenant: {
    name: string;
    email: string | null;
    telefone: string | null;
    razaoSocial: string | null;
    nomeFantasia: string | null;
    timezone: string;
  };
}

interface TenantBrandingFormProps {
  branding: {
    primaryColor: string | null;
    secondaryColor: string | null;
    accentColor: string | null;
    logoUrl: string | null;
    faviconUrl: string | null;
  } | null;
}

interface SubscriptionProps {
  subscription: {
    id: string | null;
    status: string | null;
    planId: string | null;
    planName: string | null;
    valorMensal: number | null;
    valorAnual: number | null;
    moeda: string | null;
    planRevision: number;
    trialEndsAt: string | null;
    renovaEm: string | null;
    planoVersao: {
      id: string;
      numero: number;
      status: string;
      titulo: string | null;
      descricao: string | null;
      publicadoEm: string | null;
    } | null;
  } | null;
}

interface ModulesProps {
  modules: {
    accessible: string[];
    allAvailable: string[];
    moduleDetails: Array<{
      slug: string;
      name: string;
      description: string;
      accessible: boolean;
      routes: string[];
    }>;
  };
}

interface MetricsProps {
  metrics: {
    usuarios: number;
    processos: number;
    clientes: number;
    contratos: number;
  };
}

interface DigitalCertificatesProps {
  certificates?: Array<{
    id: string;
    tenantId: string;
    responsavelUsuarioId: string | null;
    label: string | null;
    tipo: string;
    scope: string;
    isActive: boolean;
    validUntil: string | null;
    lastValidatedAt: string | null;
    lastUsedAt: string | null;
    createdAt: string;
    updatedAt: string;
    responsavelUsuario: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
    } | null;
  }>;
  certificatePolicy: DigitalCertificatePolicy;
}

export function ConfiguracoesTabs({
  tenant,
  branding,
  subscription,
  modules,
  metrics,
  certificates,
  certificatePolicy,
}: TenantSettingsFormProps &
  TenantBrandingFormProps &
  SubscriptionProps &
  ModulesProps &
  MetricsProps &
  DigitalCertificatesProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabFromUrl = searchParams.get("tab");
  const normalizedTabFromUrl = isSettingsTabKey(tabFromUrl)
    ? tabFromUrl
    : ("overview" as SettingsTabKey);
  const [selectedTab, setSelectedTab] =
    useState<SettingsTabKey>(normalizedTabFromUrl);

  useEffect(() => {
    setSelectedTab(normalizedTabFromUrl);
  }, [normalizedTabFromUrl]);

  const handleTabChange = (key: Key) => {
    const nextTab = String(key);
    if (!isSettingsTabKey(nextTab)) return;

    setSelectedTab(nextTab);

    const params = new URLSearchParams(searchParams.toString());
    if (nextTab === "overview") {
      params.delete("tab");
    } else {
      params.set("tab", nextTab);
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };

  const isSubscriptionActive = subscription?.status === "ATIVA";
  const statusPillClasses = isSubscriptionActive
    ? "border-success/30 bg-success/10 text-success"
    : "border-warning/30 bg-warning/10 text-warning";
  const statusDotClasses = isSubscriptionActive
    ? "bg-success shadow-[0_0_10px_rgba(34,197,94,0.6)]"
    : "bg-warning shadow-[0_0_10px_rgba(251,191,36,0.6)]";

  return (
    <Tabs
      aria-label="Configurações"
      className="w-full"
      color="primary"
      destroyInactiveTabPanel
      selectedKey={selectedTab}
      variant="underlined"
      onSelectionChange={handleTabChange}
      classNames={{
        base: "w-full",
        tabList:
          "w-full justify-center gap-2 overflow-x-auto flex-nowrap [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]",
        tab: "max-w-fit px-3 sm:px-4 py-2 text-sm whitespace-nowrap flex-shrink-0",
        tabContent: "text-sm font-medium whitespace-nowrap",
        panel: "w-full",
      }}
    >
      {/* Tab 1: Visão Geral */}
      <Tab
        key="overview"
        title={
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span>Visão Geral</span>
          </div>
        }
      >
        <div className="space-y-6 mt-6">
          {/* Informações do Plano */}
          {subscription && (
            <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
              <CardHeader className="flex flex-col gap-4 pb-3">
                <div className="grid gap-4 md:grid-cols-[1fr_auto] items-start">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-white">
                      Plano Atual
                    </h2>
                    <p className="text-sm text-default-400">
                      Informações sobre sua assinatura e plano contratado.
                    </p>
                  </div>
                  <div className="flex flex-col items-start md:items-end gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-default-500">
                      Status
                    </span>
                    <div
                      className={`flex items-center gap-2 rounded-full border px-3 py-1 ${statusPillClasses}`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${statusDotClasses}`}
                      />
                      <span className="text-xs font-semibold uppercase tracking-[0.2em]">
                        {subscription.status}
                      </span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <Divider className="border-white/10" />
              <CardBody className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-default-400">
                      Nome do Plano
                    </p>
                    <p className="text-lg font-semibold text-white">
                      {subscription.planName || "Não definido"}
                    </p>
                  </div>

                  {subscription.valorMensal && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-default-400">
                        Valor Mensal
                      </p>
                      <p className="text-lg font-semibold text-white">
                        {subscription.moeda}{" "}
                        {subscription.valorMensal.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                  )}

                  {subscription.valorAnual && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-default-400">
                        Valor Anual
                      </p>
                      <p className="text-lg font-semibold text-white">
                        {subscription.moeda}{" "}
                        {subscription.valorAnual.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                  )}
                </div>

                {subscription.planoVersao && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-default-400">
                      Versão do Plano
                    </p>
                    <div className="flex items-center gap-2">
                      <Chip color="primary" size="sm" variant="flat">
                        v{subscription.planoVersao.numero}
                      </Chip>
                      <span className="text-sm text-default-400">
                        {subscription.planoVersao.titulo || "Versão padrão"}
                      </span>
                    </div>
                    {subscription.planoVersao.publicadoEm && (
                      <p className="text-xs text-default-500">
                        Publicado em:{" "}
                        {new Date(
                          subscription.planoVersao.publicadoEm,
                        ).toLocaleDateString("pt-BR")}
                      </p>
                    )}
                  </div>
                )}

                {subscription.trialEndsAt && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-default-400">
                      Período de Teste
                    </p>
                    <p className="text-sm text-warning">
                      Expira em:{" "}
                      {new Date(subscription.trialEndsAt).toLocaleDateString(
                        "pt-BR",
                      )}
                    </p>
                  </div>
                )}

                {subscription.renovaEm && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-default-400">
                      Próxima Renovação
                    </p>
                    <p className="text-sm text-success">
                      {new Date(subscription.renovaEm).toLocaleDateString(
                        "pt-BR",
                      )}
                    </p>
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {/* Métricas do Escritório */}
          <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
            <CardHeader className="flex flex-col gap-2 pb-2">
              <h2 className="text-lg font-semibold text-white">Métricas</h2>
              <p className="text-sm text-default-400">
                Estatísticas gerais do seu escritório.
              </p>
            </CardHeader>
            <Divider className="border-white/10" />
            <CardBody>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 rounded-lg bg-primary/10 border border-primary/20">
                  <p className="text-2xl font-bold text-primary">
                    {metrics.usuarios}
                  </p>
                  <p className="text-sm text-default-400">Usuários</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-success/10 border border-success/20">
                  <p className="text-2xl font-bold text-success">
                    {metrics.processos}
                  </p>
                  <p className="text-sm text-default-400">Processos</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-warning/10 border border-warning/20">
                  <p className="text-2xl font-bold text-warning">
                    {metrics.clientes}
                  </p>
                  <p className="text-sm text-default-400">Clientes</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-secondary/10 border border-secondary/20">
                  <p className="text-2xl font-bold text-secondary">
                    {metrics.contratos}
                  </p>
                  <p className="text-sm text-default-400">Contratos</p>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Módulos Disponíveis */}
          <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
            <CardHeader className="flex flex-col gap-2 pb-2">
              <h2 className="text-lg font-semibold text-white">
                Módulos do Sistema
              </h2>
              <p className="text-sm text-default-400">
                Módulos disponíveis no seu plano atual (
                {modules.accessible.length} de {modules.allAvailable.length}{" "}
                ativos).
              </p>
            </CardHeader>
            <Divider className="border-white/10" />
            <CardBody className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {modules.moduleDetails.map((module) => (
                  <div
                    key={module.slug}
                    className={`p-4 rounded-lg border ${module.accessible ? "bg-success/10 border-success/20" : "bg-default/10 border-default/20"}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-white">
                            {module.name}
                          </h3>
                          <Chip
                            color={module.accessible ? "success" : "default"}
                            size="sm"
                            variant="flat"
                          >
                            {module.accessible ? "Ativo" : "Inativo"}
                          </Chip>
                        </div>
                        <p className="text-sm text-default-400 mb-2">
                          {module.description}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {module.routes.slice(0, 3).map((route) => (
                            <Chip
                              key={route}
                              color="primary"
                              size="sm"
                              variant="dot"
                            >
                              {route}
                            </Chip>
                          ))}
                          {module.routes.length > 3 && (
                            <Chip color="default" size="sm" variant="dot">
                              +{module.routes.length - 3} mais
                            </Chip>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          {/* Ações */}
          <Card className="border border-white/10 bg-white/5">
            <CardBody className="flex flex-wrap items-center justify-between gap-3 text-sm text-default-400">
              <div>
                <p className="text-white">
                  Precisando de ajuda com configurações?
                </p>
                <p>Conte com nosso time para personalizar seu escritório.</p>
              </div>
              <Button as={NextLink} color="primary" href="/suporte" radius="full">
                Falar com suporte
              </Button>
            </CardBody>
          </Card>
        </div>
      </Tab>

      {/* Tab 2: Informações do Escritório */}
      <Tab
        key="tenant"
        title={
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span>Escritório</span>
          </div>
        }
      >
        <div className="mt-6">
          <TenantSettingsForm
            initialData={{
              name: tenant.name,
              email: tenant.email,
              telefone: tenant.telefone,
              razaoSocial: tenant.razaoSocial,
              nomeFantasia: tenant.nomeFantasia,
              timezone: tenant.timezone,
            }}
          />
        </div>
      </Tab>

      {/* Tab 3: Branding */}
      <Tab
        key="branding"
        title={
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            <span>Branding</span>
          </div>
        }
      >
        <div className="mt-6">
          <TenantBrandingForm
            initialData={{
              primaryColor: branding?.primaryColor || null,
              secondaryColor: branding?.secondaryColor || null,
              accentColor: branding?.accentColor || null,
              logoUrl: branding?.logoUrl || null,
              faviconUrl: branding?.faviconUrl || null,
            }}
          />
        </div>
      </Tab>

      {/* Tab 4: Email */}
      <Tab
        key="email"
        title={
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            <span>Email</span>
          </div>
        }
      >
        <div className="mt-6">
          <EmailCredentialsCard />
        </div>
      </Tab>

      {/* Tab 5: Integrações PJe */}
      <Tab
        key="certificates"
        title={
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <span>Integrações PJe</span>
          </div>
        }
      >
        <div className="mt-6">
          <div className="space-y-6">
            <DigitalCertificatePolicyCard
              initialPolicy={certificatePolicy}
            />
            <DigitalCertificatesPanel
              certificates={certificates ?? []}
              mode="office"
              policy={certificatePolicy}
            />
          </div>
        </div>
      </Tab>

      <Tab
        key="feriados"
        title={
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span>Feriados</span>
          </div>
        }
      >
        <FeriadosSettingsTab />
      </Tab>

      <Tab
        key="billing"
        title={
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4" />
            <span>Billing</span>
          </div>
        }
      >
        <div className="mt-6">
          <BillingSettingsTab />
        </div>
      </Tab>

      <Tab
        key="tribunais"
        title={
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span>Tribunais</span>
          </div>
        }
      >
        <div className="mt-6">
          <TribunaisSettingsTab />
        </div>
      </Tab>

      <Tab
        key="tipos-peticao"
        title={
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span>Tipos de petição</span>
          </div>
        }
      >
        <div className="mt-6">
          <TiposPeticaoSettingsTab />
        </div>
      </Tab>

      <Tab
        key="tipos-contrato"
        title={
          <div className="flex items-center gap-2">
            <FileSignature className="h-4 w-4" />
            <span>Tipos de contrato</span>
          </div>
        }
      >
        <div className="mt-6">
          <TiposContratoSettingsTab />
        </div>
      </Tab>

      <Tab
        key="areas-processo"
        title={
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4" />
            <span>Áreas de processo</span>
          </div>
        }
      >
        <div className="mt-6">
          <AreasProcessoSettingsTab />
        </div>
      </Tab>

      <Tab
        key="categorias-tarefa"
        title={
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4" />
            <span>Categorias de tarefa</span>
          </div>
        }
      >
        <div className="mt-6">
          <CategoriasTarefaSettingsTab />
        </div>
      </Tab>

      <Tab
        key="asaas"
        title={
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            <span>Asaas</span>
          </div>
        }
      >
        <div className="mt-6">
          <AsaasSettingsTab />
        </div>
      </Tab>
    </Tabs>
  );
}
