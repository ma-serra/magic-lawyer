"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Button, Chip, Input, Spinner, Switch } from "@heroui/react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ScaleIcon,
  ShieldCheckIcon,
  ShieldXIcon,
  TestTube2Icon,
  WebhookIcon,
} from "lucide-react";

import {
  configurarJusbrasilTenant,
  obterConfiguracaoJusbrasil,
  testarConexaoJusbrasil,
} from "@/app/actions/jusbrasil";
import { toast } from "@/lib/toast";
import {
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";

type JusbrasilConfigData = {
  id: string | null;
  integracaoAtiva: boolean;
  dataConfiguracao: Date | string | null;
  ultimaValidacao: Date | string | null;
  lastWebhookAt: Date | string | null;
  lastWebhookEvent: string | null;
  globalConfigured: boolean;
  planSlug: string | null;
  planName: string | null;
  planEligible: boolean;
  planEligibilityReason: string;
  baseUrl: string;
  expectedWebhookUrl: string;
  effectiveEnabled: boolean;
  usingGlobalAccount: boolean;
};

function formatDateTimeBrasilia(value?: Date | string | null) {
  if (!value) return "Nao informado";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Nao informado";

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default function ConfiguracaoJusbrasilPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [integracaoAtiva, setIntegracaoAtiva] = useState(false);

  const { data, isLoading, mutate } = useSWR(
    "configuracoes-jusbrasil",
    () => obterConfiguracaoJusbrasil(),
    {
      onSuccess(result) {
        if (result?.success && result.data) {
          setIntegracaoAtiva(Boolean(result.data.integracaoAtiva));
        }
      },
      revalidateOnFocus: false,
    },
  );

  const config = useMemo<JusbrasilConfigData | null>(() => {
    if (!data?.success || !data.data) return null;
    return data.data as JusbrasilConfigData;
  }, [data]);

  const statusIntegracao = useMemo(() => {
    if (config?.effectiveEnabled) {
      return "Ativa";
    }

    if (config && !config.planEligible && config.integracaoAtiva) {
      return "Bloqueada pelo plano atual";
    }

    if (config && !config.planEligible) {
      return "Disponivel a partir do Pro";
    }

    if (config && !config.integracaoAtiva) {
      return "Desativada pelo escritorio";
    }

    if (config && !config.globalConfigured) {
      return "Indisponivel na plataforma";
    }

    return "Pendente";
  }, [config]);

  const statusTone = useMemo(() => {
    if (config?.effectiveEnabled) return "success" as const;
    if (config && !config.planEligible && config.integracaoAtiva) {
      return "warning" as const;
    }
    if (config && !config.planEligible) return "warning" as const;
    if (config && !config.integracaoAtiva) return "danger" as const;
    if (config && !config.globalConfigured) return "warning" as const;
    return "default" as const;
  }, [config]);

  const saveBlockedByPlan = Boolean(
    config && !config.planEligible && integracaoAtiva,
  );

  const handleSave = async () => {
    setIsSubmitting(true);

    try {
      const result = await configurarJusbrasilTenant({
        integracaoAtiva,
      });

      if (!result.success) {
        toast.error(result.error || "Erro ao salvar configuracao Jusbrasil");
        return;
      }

      toast.success("Preferencia do Jusbrasil salva com sucesso");
      await mutate();
    } catch {
      toast.error("Erro interno ao salvar configuracao Jusbrasil");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);

    try {
      const result = await testarConexaoJusbrasil();

      if (!result.success) {
        toast.error(result.error || "Falha ao validar conexao com Jusbrasil");
        return;
      }

      toast.success("Conexao global com Jusbrasil validada com sucesso");
      await mutate();
    } catch {
      toast.error("Erro ao executar teste de conexao");
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-3 py-8 sm:px-6">
      <PeoplePageHeader
        tag="Juridico externo"
        title="Integracao Jusbrasil"
        description="Controle manual de uso do Jusbrasil por escritorio. A integracao nasce desligada e so pode ser ativada em planos Pro, Enterprise e Ultra."
        actions={
          <Button
            color="primary"
            isDisabled={!config?.planEligible}
            isLoading={isTesting}
            radius="full"
            startContent={
              isTesting ? undefined : <TestTube2Icon className="h-4 w-4" />
            }
            onPress={handleTestConnection}
          >
            {isTesting ? "Testando..." : "Testar conexao"}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PeopleMetricCard
          helper="Status efetivo do Jusbrasil para este escritorio"
          icon={
            config?.effectiveEnabled ? (
              <CheckCircle2Icon className="h-4 w-4" />
            ) : (
              <AlertTriangleIcon className="h-4 w-4" />
            )
          }
          label="Integracao"
          tone={statusTone}
          value={statusIntegracao}
        />
        <PeopleMetricCard
          helper="Plano atual do escritorio"
          icon={<ScaleIcon className="h-4 w-4" />}
          label="Plano"
          tone="secondary"
          value={config?.planName || "Sem plano"}
        />
        <PeopleMetricCard
          helper="Disponibilidade da credencial global em producao"
          icon={
            config?.globalConfigured ? (
              <ShieldCheckIcon className="h-4 w-4" />
            ) : (
              <ShieldXIcon className="h-4 w-4" />
            )
          }
          label="Credencial"
          tone={config?.globalConfigured ? "success" : "danger"}
          value={config?.globalConfigured ? "Configurada" : "Ausente"}
        />
        <PeopleMetricCard
          helper="Ultimo webhook observado para este tenant"
          icon={<WebhookIcon className="h-4 w-4" />}
          label="Webhook"
          tone={config?.lastWebhookAt ? "primary" : "default"}
          value={
            config?.lastWebhookAt
              ? formatDateTimeBrasilia(config.lastWebhookAt)
              : "Sem registro"
          }
        />
      </div>

      <PeoplePanel
        title="Como a regra funciona"
        description="Esse controle e por escritorio. Ele nao altera a credencial global da plataforma, mas muda o comportamento deste tenant."
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-content2/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
              Quando esta ativo
            </p>
            <div className="mt-2 space-y-1 text-sm text-default-300">
              <p>1. Sincronizacoes por OAB usam Jusbrasil quando disponivel.</p>
              <p>2. Processos novos ou atualizados podem registrar monitoramento dedicado.</p>
              <p>3. Webhooks de movimentacoes, publicacoes e mudancas entram no banco.</p>
              <p>4. A ativacao e sempre manual pelo admin do escritorio.</p>
            </div>
          </div>
          <div className="rounded-xl border border-warning/20 bg-warning/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-warning">
              Quando esta desativado
            </p>
            <div className="mt-2 space-y-1 text-sm text-default-300">
              <p>- O tenant deixa de registrar novos monitores no Jusbrasil.</p>
              <p>- A sincronizacao por OAB volta ao fluxo alternativo disponivel.</p>
              <p>- Webhooks recebidos para este tenant sao ignorados e nao poluem a base.</p>
              <p>- Planos abaixo de Pro nao podem religar essa integracao.</p>
            </div>
          </div>
        </div>
      </PeoplePanel>

      <PeoplePanel
        title="Estado atual"
        description="Resumo do que a plataforma enxerga hoje para o seu escritorio."
      >
        <div className="flex flex-wrap gap-2">
          <Chip color={statusTone} size="sm" variant="flat">
            Integracao do tenant: {config?.integracaoAtiva ? "Ativa" : "Desativada"}
          </Chip>
          <Chip
            color={config?.globalConfigured ? "success" : "warning"}
            size="sm"
            variant="flat"
          >
            API global: {config?.globalConfigured ? "Disponivel" : "Indisponivel"}
          </Chip>
          <Chip
            color={config?.planEligible ? "success" : "warning"}
            size="sm"
            variant="flat"
          >
            Elegibilidade do plano: {config?.planEligible ? "Pro+" : "Abaixo de Pro"}
          </Chip>
          <Chip size="sm" variant="flat">
            Ultima validacao: {formatDateTimeBrasilia(config?.ultimaValidacao)}
          </Chip>
          <Chip size="sm" variant="flat">
            Ultimo evento webhook: {config?.lastWebhookEvent || "Nao informado"}
          </Chip>
        </div>

        {config && !config.globalConfigured ? (
          <div className="mt-4 rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-default-300">
            <p className="font-medium text-foreground">
              A credencial global do Jusbrasil nao esta disponivel neste ambiente.
            </p>
            <p className="mt-1">
              Enquanto isso nao for corrigido no deploy, nenhum tenant conseguira
              operar com Jusbrasil mesmo que a chave local esteja marcada como ativa.
            </p>
          </div>
        ) : null}

        {config && !config.planEligible ? (
          <div className="mt-4 rounded-xl border border-warning/20 bg-warning/5 p-4 text-sm text-default-300">
            <p className="font-medium text-foreground">
              Esta integracao so pode ser ativada em planos Pro, Enterprise e Ultra.
            </p>
            <p className="mt-1">{config.planEligibilityReason}</p>
          </div>
        ) : null}
      </PeoplePanel>

      <PeoplePanel
        title="Preferencia do escritorio"
        description="O padrao agora e desligado. O admin precisa ligar manualmente quando o plano do escritorio for Pro ou superior."
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner label="Carregando configuracao..." size="lg" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Input
              isReadOnly
              description="Base da API global usada pela plataforma."
              label="API base"
              value={config?.baseUrl || ""}
              variant="bordered"
            />

            <Input
              isReadOnly
              description="URL que o Jusbrasil deve usar para este deployment."
              label="Webhook esperado"
              value={config?.expectedWebhookUrl || ""}
              variant="bordered"
            />

            <div className="rounded-xl border border-white/10 px-4 py-3">
              <p className="text-xs text-default-500">Primeira configuracao</p>
              <p className="mt-1 text-sm text-default-300">
                {formatDateTimeBrasilia(config?.dataConfiguracao)}
              </p>
              <p className="mt-2 text-xs text-default-500">Ultimo webhook</p>
              <p className="mt-1 text-sm text-default-300">
                {formatDateTimeBrasilia(config?.lastWebhookAt)}
              </p>
            </div>

            <div className="rounded-xl border border-white/10 px-4 py-3">
              <p className="text-xs text-default-500">Efeito do toggle</p>
              <p className="mt-1 text-sm text-default-300">
                A decisao vale apenas para este tenant e nao altera outros
                escritorios da plataforma.
              </p>
              <p className="mt-2 text-xs text-default-500">Regra comercial</p>
              <p className="mt-1 text-sm text-default-300">
                Liberado somente para planos Pro, Enterprise e Ultra.
              </p>
            </div>

            <div className="rounded-xl border border-white/10 px-4 py-3 lg:col-span-2">
              <Switch
                isDisabled={!config?.planEligible && !integracaoAtiva}
                isSelected={integracaoAtiva}
                onValueChange={setIntegracaoAtiva}
              >
                Integracao Jusbrasil ativa para este escritorio
              </Switch>
              <p className="mt-2 text-sm text-default-400">
                Desative quando o escritorio nao quiser receber dados do
                Jusbrasil. O sistema passa a ignorar webhooks desse tenant e para
                de criar novos monitoramentos.
              </p>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            color="primary"
            isDisabled={saveBlockedByPlan}
            isLoading={isSubmitting}
            radius="full"
            onPress={handleSave}
          >
            {isSubmitting ? "Salvando..." : "Salvar preferencia"}
          </Button>
        </div>
      </PeoplePanel>
    </section>
  );
}
