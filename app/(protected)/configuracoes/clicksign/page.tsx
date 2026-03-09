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
  Switch,
} from "@heroui/react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  FileSignatureIcon,
  KeyRoundIcon,
  ServerIcon,
  ShieldCheckIcon,
  ShieldXIcon,
  TestTube2Icon,
} from "lucide-react";

import {
  configurarClicksignTenant,
  obterConfiguracaoClicksign,
  testarConexaoClicksign,
} from "@/app/actions/clicksign";
import {
  type ClicksignAmbiente,
  getDefaultClicksignApiBase,
} from "@/app/lib/clicksign-config";
import { toast } from "@/lib/toast";
import {
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";

type ClicksignEffectiveSource = "TENANT" | "GLOBAL" | "MOCK" | "DISABLED" | "NONE";

type ClicksignConfigData = {
  id: string | null;
  apiBase: string | null;
  ambiente: ClicksignAmbiente;
  integracaoAtiva: boolean;
  dataConfiguracao: Date | string | null;
  ultimaValidacao: Date | string | null;
  hasAccessToken: boolean;
  effectiveSource: ClicksignEffectiveSource;
  fallbackAvailable: boolean;
  fallbackSource: "GLOBAL" | "MOCK";
  mockMode: boolean;
  fallbackApiBase: string;
  fallbackAmbiente: ClicksignAmbiente;
};

const AMBIENTES = [
  { key: "SANDBOX", label: "Sandbox (teste)" },
  { key: "PRODUCAO", label: "Produção" },
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

function ambienteLabel(ambiente: ClicksignAmbiente) {
  return ambiente === "PRODUCAO" ? "Produção" : "Sandbox";
}

function sourceLabel(source: ClicksignEffectiveSource) {
  switch (source) {
    case "TENANT":
      return "Configuração do tenant";
    case "GLOBAL":
      return "Fallback global";
    case "MOCK":
      return "Mock local";
    case "DISABLED":
      return "Desativada no tenant";
    default:
      return "Não configurada";
  }
}

function sourceTone(source: ClicksignEffectiveSource) {
  switch (source) {
    case "TENANT":
      return "success" as const;
    case "GLOBAL":
      return "warning" as const;
    case "MOCK":
      return "secondary" as const;
    case "DISABLED":
      return "danger" as const;
    default:
      return "default" as const;
  }
}

export default function ConfiguracaoClicksignPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [formData, setFormData] = useState({
    apiBase: getDefaultClicksignApiBase("SANDBOX"),
    accessToken: "",
    ambiente: "SANDBOX" as ClicksignAmbiente,
    integracaoAtiva: true,
  });

  const { data, isLoading, mutate } = useSWR(
    "configuracoes-clicksign",
    () => obterConfiguracaoClicksign(),
    {
      onSuccess(result) {
        if (result?.success && result.data) {
          const config = result.data as ClicksignConfigData;
          setFormData((prev) => ({
            ...prev,
            apiBase:
              config.apiBase ||
              config.fallbackApiBase ||
              getDefaultClicksignApiBase(config.ambiente),
            ambiente: config.ambiente,
            integracaoAtiva:
              config.effectiveSource === "GLOBAL" ||
              config.effectiveSource === "MOCK"
                ? true
                : config.integracaoAtiva,
            accessToken: "",
          }));
        }
      },
      revalidateOnFocus: false,
    },
  );

  const config = useMemo<ClicksignConfigData | null>(() => {
    if (!data?.success || !data.data) return null;
    return data.data as ClicksignConfigData;
  }, [data]);

  const ambienteSelectedKeys = useMemo(() => {
    if (!AMBIENTES.some((item) => item.key === formData.ambiente)) {
      return [];
    }
    return [formData.ambiente];
  }, [formData.ambiente]);

  const statusIntegracao = useMemo(() => {
    if (config?.effectiveSource === "TENANT" && config.integracaoAtiva) {
      return "Ativa";
    }

    if (config?.effectiveSource === "GLOBAL") {
      return "Fallback global";
    }

    if (config?.effectiveSource === "MOCK") {
      return "Mock local";
    }

    if (config?.effectiveSource === "DISABLED") {
      return "Desativada";
    }

    return "Pendente";
  }, [config?.effectiveSource, config?.integracaoAtiva]);

  const handleSave = async () => {
    setIsSubmitting(true);

    try {
      const result = await configurarClicksignTenant({
        apiBase: formData.apiBase.trim(),
        accessToken: formData.accessToken.trim() || undefined,
        ambiente: formData.ambiente,
        integracaoAtiva: formData.integracaoAtiva,
      });

      if (!result.success) {
        toast.error(result.error || "Erro ao salvar configuração ClickSign");
        return;
      }

      toast.success("Integração ClickSign salva com sucesso");
      setFormData((prev) => ({
        ...prev,
        accessToken: "",
      }));
      await mutate();
    } catch {
      toast.error("Erro interno ao salvar configuração ClickSign");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);

    try {
      const result = await testarConexaoClicksign();

      if (!result.success) {
        toast.error(result.error || "Falha ao validar conexão ClickSign");
        return;
      }

      const source =
        result.data?.source === "GLOBAL"
          ? "fallback global"
          : result.data?.source === "MOCK"
            ? "mock local"
          : "configuração do tenant";
      toast.success(`Conexão ClickSign validada via ${source}`);
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
        tag="Assinatura digital"
        title="Integração ClickSign"
        description="Configure o ClickSign por tenant, com token criptografado, fallback global apenas para compatibilidade e isolamento real entre escritórios."
        actions={
          <Button
            color="primary"
            isDisabled={!config?.id && !config?.fallbackAvailable}
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
          helper="Fonte efetiva usada pelo fluxo de assinatura"
          icon={
            config?.effectiveSource === "TENANT" ? (
              <CheckCircle2Icon className="h-4 w-4" />
            ) : (
              <AlertTriangleIcon className="h-4 w-4" />
            )
          }
          label="Integração"
          tone={
            config?.effectiveSource === "TENANT"
              ? "success"
              : config?.effectiveSource === "GLOBAL"
                ? "warning"
                : config?.effectiveSource === "MOCK"
                  ? "secondary"
                : config?.effectiveSource === "DISABLED"
                  ? "danger"
                  : "default"
          }
          value={statusIntegracao}
        />
        <PeopleMetricCard
          helper={
            config?.effectiveSource === "GLOBAL"
              ? "Hoje o tenant ainda depende do env global"
              : config?.effectiveSource === "MOCK"
                ? "Provider local simulado para desenvolvimento"
              : "Ambiente salvo para o tenant"
          }
          icon={<ServerIcon className="h-4 w-4" />}
          label="Ambiente"
          tone={formData.ambiente === "PRODUCAO" ? "warning" : "secondary"}
          value={ambienteLabel(config?.ambiente ?? formData.ambiente)}
        />
        <PeopleMetricCard
          helper="Token do tenant não é exposto após salvar"
          icon={
            config?.hasAccessToken ? (
              <ShieldCheckIcon className="h-4 w-4" />
            ) : (
              <ShieldXIcon className="h-4 w-4" />
            )
          }
          label="Credencial"
          tone={config?.hasAccessToken ? "success" : "danger"}
          value={config?.hasAccessToken ? "Token salvo" : "Pendente"}
        />
        <PeopleMetricCard
          helper="Tenant tem prioridade; fallback global é só compatibilidade"
          icon={<FileSignatureIcon className="h-4 w-4" />}
          label="Origem efetiva"
          tone={sourceTone(config?.effectiveSource ?? "NONE")}
          value={sourceLabel(config?.effectiveSource ?? "NONE")}
        />
      </div>

      <PeoplePanel
        title="Estratégia de resolução"
        description="A aplicação primeiro procura configuração ativa do tenant. Só usa o ClickSign global quando o tenant ainda não possui configuração própria."
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-content2/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
              Ordem usada pelo sistema
            </p>
            <div className="mt-2 space-y-1 text-sm text-default-300">
              <p>1. Configuração ativa do tenant.</p>
              <p>2. Se não existir, fallback global por `env`.</p>
              <p>3. Sem chave real, `CLICKSIGN_MOCK_MODE=true` ativa mock local.</p>
              <p>4. Se o tenant desativar explicitamente, não há fallback.</p>
              <p>5. Toda troca fica auditada.</p>
            </div>
          </div>
          <div className="rounded-xl border border-warning/20 bg-warning/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-warning">
              Compatibilidade atual
            </p>
            <div className="mt-2 space-y-1 text-sm text-default-300">
              <p>• Esta integração usa a API legada `/api/v1` do ClickSign.</p>
              <p>• Recomendado migrar cada escritório para credencial própria.</p>
              <p>• O botão de teste valida a configuração salva, não rascunho em tela.</p>
              <p>• O mock local existe para dev e testes sem API externa.</p>
            </div>
          </div>
        </div>
      </PeoplePanel>

      <PeoplePanel
        title="Estado atual"
        description="Use estes indicadores para saber se o tenant já está isolado do fallback global."
      >
        <div className="flex flex-wrap gap-2">
          <Chip
            color={config?.hasAccessToken ? "success" : "warning"}
            size="sm"
            variant="flat"
          >
            Token do tenant: {config?.hasAccessToken ? "Configurado" : "Pendente"}
          </Chip>
          <Chip
            color={config?.fallbackAvailable ? "warning" : "default"}
            size="sm"
            variant="flat"
          >
            Fallback global: {config?.fallbackAvailable ? "Disponível" : "Ausente"}
          </Chip>
          <Chip
            color={sourceTone(config?.effectiveSource ?? "NONE")}
            size="sm"
            variant="flat"
          >
            Origem efetiva: {sourceLabel(config?.effectiveSource ?? "NONE")}
          </Chip>
          <Chip size="sm" variant="flat">
            Última validação: {formatDateTimeBrasilia(config?.ultimaValidacao)}
          </Chip>
        </div>

        {(config?.fallbackAvailable ||
          config?.effectiveSource === "GLOBAL" ||
          config?.effectiveSource === "MOCK") && (
          <div className="mt-4 rounded-xl border border-warning/20 bg-warning/5 p-4 text-sm text-default-300">
            <p className="font-medium text-foreground">
              {config?.fallbackSource === "MOCK"
                ? "Modo mock local detectado"
                : "Fallback global detectado"}
            </p>
            <p className="mt-1">
              Base atual: <span className="font-mono text-xs">{config?.fallbackApiBase}</span>
            </p>
            <p className="mt-1">
              Ambiente do fallback: {ambienteLabel(config?.fallbackAmbiente ?? "SANDBOX")}
            </p>
            {config?.mockMode ? (
              <p className="mt-1">
                Ative no ambiente local com{" "}
                <span className="font-mono text-xs">CLICKSIGN_MOCK_MODE=true</span>
              </p>
            ) : null}
          </div>
        )}
      </PeoplePanel>

      <PeoplePanel
        title={config?.id ? "Atualizar configuração ClickSign" : "Configurar ClickSign"}
        description="O token é armazenado criptografado por tenant. Ao salvar com integração ativa, o sistema valida a conexão antes de persistir."
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
                  ? "Opcional ao editar. Preencha apenas se quiser trocar o token."
                  : "Obrigatório na primeira configuração."
              }
              label="Access token"
              placeholder="Cole o token do ClickSign"
              startContent={<KeyRoundIcon className="h-4 w-4 text-default-400" />}
              type="password"
              value={formData.accessToken}
              variant="bordered"
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, accessToken: value }))
              }
            />

            <Input
              description="Base da API legada usada pela integração atual."
              label="API base"
              placeholder="https://sandbox.clicksign.com/api/v1"
              value={formData.apiBase}
              variant="bordered"
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, apiBase: value }))
              }
            />

            <Select
              description="Sandbox para homologação; Produção para contas reais."
              label="Ambiente"
              selectedKeys={ambienteSelectedKeys}
              variant="bordered"
              onSelectionChange={(keys) => {
                if (keys === "all") return;
                const selected = Array.from(keys)[0];

                if (selected === "PRODUCAO" || selected === "SANDBOX") {
                  setFormData((prev) => {
                    const defaultCurrentApiBase = getDefaultClicksignApiBase(
                      prev.ambiente,
                    );
                    const shouldSwapApiBase =
                      !prev.apiBase || prev.apiBase === defaultCurrentApiBase;

                    return {
                      ...prev,
                      ambiente: selected,
                      apiBase: shouldSwapApiBase
                        ? getDefaultClicksignApiBase(selected)
                        : prev.apiBase,
                    };
                  });
                }
              }}
            >
              {AMBIENTES.map((item) => (
                <SelectItem key={item.key} textValue={item.label}>
                  {item.label}
                </SelectItem>
              ))}
            </Select>

            <div className="rounded-xl border border-white/10 px-4 py-3">
              <p className="text-xs text-default-500">Última validação</p>
              <p className="mt-1 text-sm text-default-300">
                {formatDateTimeBrasilia(config?.ultimaValidacao)}
              </p>
              <p className="mt-2 text-xs text-default-500">
                Primeira configuração: {formatDateTimeBrasilia(config?.dataConfiguracao)}
              </p>
            </div>

            <div className="lg:col-span-2 rounded-xl border border-white/10 px-4 py-3">
              <Switch
                isSelected={formData.integracaoAtiva}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, integracaoAtiva: value }))
                }
              >
                Integração ativa para este tenant
              </Switch>
              <p className="mt-2 text-sm text-default-400">
                Quando desativado, o tenant deixa de usar ClickSign mesmo que exista fallback
                global ou mock local.
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
                accessToken: "",
              }))
            }
          >
            Limpar token em tela
          </Button>
        </div>
      </PeoplePanel>
    </section>
  );
}
