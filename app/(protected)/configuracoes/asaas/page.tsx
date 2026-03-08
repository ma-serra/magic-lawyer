"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  Button,
  Chip,
  Input,
  Select,
  SelectItem,
  Spinner,
} from "@heroui/react";
import {
  AlertTriangleIcon,
  Building2Icon,
  CheckCircle2Icon,
  CopyIcon,
  KeyRoundIcon,
  ShieldCheckIcon,
  ShieldXIcon,
  TestTube2Icon,
  WebhookIcon,
} from "lucide-react";
import { toast } from "@/lib/toast";
import {
  configurarAsaasTenant,
  obterConfiguracaoAsaas,
  testarConexaoAsaas,
} from "@/app/actions/asaas";
import {
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";

type AsaasAmbiente = "SANDBOX" | "PRODUCAO";

type AsaasConfigData = {
  id: string | null;
  asaasAccountId: string | null;
  asaasWalletId: string | null;
  ambiente: AsaasAmbiente;
  integracaoAtiva: boolean;
  dataConfiguracao: Date | string | null;
  ultimaValidacao: Date | string | null;
  hasWebhookAccessToken: boolean;
  webhookConfiguredAt: Date | string | null;
  lastWebhookAt: Date | string | null;
  lastWebhookEvent: string | null;
  webhookUrl: string;
  globalWebhookSecretConfigured: boolean;
};

const AMBIENTES = [
  { key: "SANDBOX", label: "Sandbox (teste)" },
  { key: "PRODUCAO", label: "Produção (real)" },
] as const;

function formatDateTimeBrasilia(value?: Date | string | null) {
  if (!value) return "Não informado";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Não informado";

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

function ambienteLabel(ambiente: AsaasAmbiente) {
  return ambiente === "PRODUCAO" ? "Produção" : "Sandbox";
}

export default function ConfiguracaoAsaasPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [formData, setFormData] = useState({
    asaasApiKey: "",
    asaasAccountId: "",
    asaasWalletId: "",
    webhookAccessToken: "",
    ambiente: "SANDBOX" as AsaasAmbiente,
  });

  const { data, isLoading, mutate } = useSWR(
    "configuracoes-asaas",
    () => obterConfiguracaoAsaas(),
    {
      onSuccess(result) {
        if (result?.success && result.data) {
          const config = result.data as AsaasConfigData;
          setFormData((prev) => ({
            ...prev,
            asaasAccountId: config.asaasAccountId ?? "",
            asaasWalletId: config.asaasWalletId ?? "",
            ambiente: config.ambiente,
            // nunca preencher segredos em edição
            asaasApiKey: "",
            webhookAccessToken: "",
          }));
        }
      },
      revalidateOnFocus: false,
    },
  );

  const config = useMemo<AsaasConfigData | null>(() => {
    if (!data?.success || !data.data) return null;
    return data.data as AsaasConfigData;
  }, [data]);

  const fallbackWebhookUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/api/webhooks/asaas`;
  }, []);

  const webhookUrl = config?.webhookUrl || fallbackWebhookUrl;

  const ambienteSelectedKeys = useMemo(() => {
    if (!AMBIENTES.some((item) => item.key === formData.ambiente)) {
      return [];
    }
    return [formData.ambiente];
  }, [formData.ambiente]);

  const isWebhookProtegido = Boolean(
    config?.hasWebhookAccessToken || config?.globalWebhookSecretConfigured,
  );

  const statusIntegracao = config?.integracaoAtiva ? "Ativa" : "Pendente";
  const statusWebhook = isWebhookProtegido ? "Protegido" : "Pendente";

  const handleCopyWebhookUrl = async () => {
    const url = webhookUrl;
    if (!url) {
      toast.error("URL de webhook indisponível no momento");
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      toast.success("URL do webhook copiada");
    } catch {
      toast.error("Não foi possível copiar a URL");
    }
  };

  const handleSave = async () => {
    if (!formData.asaasAccountId.trim()) {
      toast.error("ID da conta Asaas é obrigatório");
      return;
    }

    if (!config?.id && !formData.asaasApiKey.trim()) {
      toast.error("Na primeira configuração, informe a API Key");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await configurarAsaasTenant({
        asaasApiKey: formData.asaasApiKey.trim() || undefined,
        asaasAccountId: formData.asaasAccountId.trim(),
        asaasWalletId: formData.asaasWalletId.trim() || undefined,
        webhookAccessToken: formData.webhookAccessToken.trim() || undefined,
        ambiente: formData.ambiente,
      });

      if (!result.success) {
        toast.error(result.error || "Erro ao salvar configuração Asaas");
        return;
      }

      toast.success("Integração Asaas salva com sucesso");
      setFormData((prev) => ({
        ...prev,
        asaasApiKey: "",
        webhookAccessToken: "",
      }));
      await mutate();
    } catch {
      toast.error("Erro interno ao salvar configuração Asaas");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      const result = await testarConexaoAsaas();
      if (!result.success) {
        toast.error(result.error || "Falha ao testar conexão com Asaas");
        return;
      }

      toast.success("Conexão com Asaas validada com sucesso");
      await mutate();
    } catch {
      toast.error("Erro ao executar teste de conexão");
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-3 py-8 sm:px-6">
      <PeoplePageHeader
        tag="Financeiro"
        title="Integração Asaas"
        description="Conecte o Asaas do escritório para cobrança no sistema, atualização automática de pagamentos via webhook e conciliação por tenant."
        actions={
          <Button
            color="primary"
            isDisabled={!config?.id}
            isLoading={isTesting}
            radius="full"
            startContent={
              isTesting ? undefined : <TestTube2Icon className="h-4 w-4" />
            }
            onPress={handleTestConnection}
          >
            {isTesting ? "Testando..." : "Testar conexão"}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PeopleMetricCard
          helper={config?.id ? "Configuração do tenant ativa" : "Ainda não configurado"}
          icon={
            config?.integracaoAtiva ? (
              <CheckCircle2Icon className="h-4 w-4" />
            ) : (
              <AlertTriangleIcon className="h-4 w-4" />
            )
          }
          label="Integração"
          tone={config?.integracaoAtiva ? "success" : "warning"}
          value={statusIntegracao}
        />
        <PeopleMetricCard
          helper={config ? ambienteLabel(config.ambiente) : "Não definido"}
          icon={<Building2Icon className="h-4 w-4" />}
          label="Ambiente"
          tone={config?.ambiente === "PRODUCAO" ? "warning" : "secondary"}
          value={config ? ambienteLabel(config.ambiente) : "Não definido"}
        />
        <PeopleMetricCard
          helper={
            isWebhookProtegido
              ? "Token validado para autenticação"
              : "Sem token configurado"
          }
          icon={
            isWebhookProtegido ? (
              <ShieldCheckIcon className="h-4 w-4" />
            ) : (
              <ShieldXIcon className="h-4 w-4" />
            )
          }
          label="Webhook"
          tone={isWebhookProtegido ? "success" : "danger"}
          value={statusWebhook}
        />
        <PeopleMetricCard
          helper="Último evento recebido no endpoint"
          icon={<WebhookIcon className="h-4 w-4" />}
          label="Último webhook"
          tone="primary"
          value={formatDateTimeBrasilia(config?.lastWebhookAt)}
        />
      </div>

      <PeoplePanel
        title="Tutorial de integração (obrigatório)"
        description="Sem webhook ativo, o sistema pode gerar cobrança, mas não confirma pagamento em tempo real."
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-content2/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
              Passo a passo
            </p>
            <div className="mt-2 space-y-1 text-sm text-default-300">
              <p>1. Salve API Key + Account ID nesta tela.</p>
              <p>2. No Asaas, cadastre o endpoint de webhook.</p>
              <p>3. Configure no Asaas o mesmo token de acesso desta tela.</p>
              <p>4. Selecione eventos de pagamento e assinatura.</p>
              <p>5. Volte e clique em “Testar conexão”.</p>
            </div>
          </div>
          <div className="rounded-xl border border-warning/20 bg-warning/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-warning">
              Se webhook não estiver configurado
            </p>
            <div className="mt-2 space-y-1 text-sm text-default-300">
              <p>• Parcelas podem ficar sem baixa automática.</p>
              <p>• Recibos e notificações de pagamento podem atrasar.</p>
              <p>• Conciliação financeira pode exigir ajuste manual.</p>
            </div>
          </div>
        </div>
      </PeoplePanel>

      <PeoplePanel
        title="Endpoint de webhook"
        description="Use esta URL no painel do Asaas. O token deve ser exatamente o mesmo configurado abaixo."
        actions={
          <Button
            radius="full"
            size="sm"
            startContent={<CopyIcon className="h-4 w-4" />}
            variant="flat"
            onPress={handleCopyWebhookUrl}
          >
            Copiar URL
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Input
            isReadOnly
            label="URL do webhook"
            value={webhookUrl}
            variant="bordered"
          />
          <div className="rounded-xl border border-white/10 px-3 py-2">
            <p className="text-xs text-default-500">Status de autenticação</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Chip
                color={config?.hasWebhookAccessToken ? "success" : "warning"}
                size="sm"
                variant="flat"
              >
                Token do tenant: {config?.hasWebhookAccessToken ? "Configurado" : "Pendente"}
              </Chip>
              <Chip
                color={config?.globalWebhookSecretConfigured ? "success" : "default"}
                size="sm"
                variant="flat"
              >
                Fallback global:{" "}
                {config?.globalWebhookSecretConfigured ? "Configurado" : "Não configurado"}
              </Chip>
              <Chip size="sm" variant="flat">
                Último evento: {config?.lastWebhookEvent || "Não recebido"}
              </Chip>
            </div>
          </div>
        </div>
      </PeoplePanel>

      <PeoplePanel
        title={config?.id ? "Atualizar configuração Asaas" : "Configurar Asaas"}
        description="A API Key e o token de webhook são armazenados criptografados por tenant."
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner label="Carregando configuração..." size="lg" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Input
              description={
                config?.id
                  ? "Opcional ao editar. Preencha apenas se quiser trocar a API Key."
                  : "Obrigatório na primeira configuração (começa com $aact_)"
              }
              label="API Key do Asaas"
              placeholder="$aact_..."
              startContent={<KeyRoundIcon className="h-4 w-4 text-default-400" />}
              type="password"
              value={formData.asaasApiKey}
              variant="bordered"
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, asaasApiKey: value }))
              }
            />

            <Input
              isRequired
              description="ID da conta no painel Asaas."
              label="Account ID"
              placeholder="conta_xxxxx"
              value={formData.asaasAccountId}
              variant="bordered"
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, asaasAccountId: value }))
              }
            />

            <Input
              description="Opcional. Carteira específica para recebimentos."
              label="Wallet ID"
              placeholder="wallet_xxxxx"
              value={formData.asaasWalletId}
              variant="bordered"
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, asaasWalletId: value }))
              }
            />

            <Select
              description="Sandbox para homologação; Produção para cobrança real."
              label="Ambiente"
              selectedKeys={ambienteSelectedKeys}
              variant="bordered"
              onSelectionChange={(keys) => {
                if (keys === "all") return;
                const selected = Array.from(keys)[0];
                if (selected === "PRODUCAO" || selected === "SANDBOX") {
                  setFormData((prev) => ({ ...prev, ambiente: selected }));
                }
              }}
            >
              {AMBIENTES.map((item) => (
                <SelectItem key={item.key} textValue={item.label}>
                  {item.label}
                </SelectItem>
              ))}
            </Select>

            <Input
              description="Token enviado no header asaas-access-token. Use para autenticar webhooks."
              label="Token de acesso do webhook"
              placeholder="Defina um token forte"
              type="password"
              value={formData.webhookAccessToken}
              variant="bordered"
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, webhookAccessToken: value }))
              }
            />

            <div className="rounded-xl border border-white/10 px-3 py-3">
              <p className="text-xs text-default-500">Última validação de conexão</p>
              <p className="mt-1 text-sm text-default-300">
                {formatDateTimeBrasilia(config?.ultimaValidacao)}
              </p>
              <p className="mt-2 text-xs text-default-500">
                Webhook configurado em:{" "}
                {formatDateTimeBrasilia(config?.webhookConfiguredAt)}
              </p>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            color="primary"
            isLoading={isSubmitting}
            radius="full"
            onPress={handleSave}
          >
            {isSubmitting ? "Salvando..." : "Salvar integração"}
          </Button>
          <Button
            radius="full"
            variant="light"
            onPress={() =>
              setFormData((prev) => ({
                ...prev,
                asaasApiKey: "",
                webhookAccessToken: "",
              }))
            }
          >
            Limpar campos sensíveis
          </Button>
        </div>
      </PeoplePanel>
    </section>
  );
}
