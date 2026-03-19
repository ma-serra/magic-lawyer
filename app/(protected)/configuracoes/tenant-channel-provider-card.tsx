"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Divider } from "@heroui/divider";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/react";
import { Switch } from "@heroui/switch";
import { addToast } from "@heroui/toast";
import {
  CheckCircle2,
  MessageSquare,
  Send,
  Shield,
  Smartphone,
  Zap,
} from "lucide-react";

import {
  configurarTenantChannelProvider,
  obterTenantChannelProvider,
  testarTenantChannelProvider,
} from "@/app/actions/tenant-channel-providers";
import {
  getTenantChannelProviderDefinition,
  getTenantChannelProviderOptionsForChannel,
  type TenantChannelProviderChannel,
  type TenantChannelProviderType,
} from "@/app/lib/omnichannel-config";

function resolveChannelMeta(channel: TenantChannelProviderChannel) {
  switch (channel) {
    case "WHATSAPP":
      return {
        label: "WhatsApp",
        icon: <MessageSquare className="h-4 w-4" />,
        accent: "Canal principal do roadmap omnichannel para mensagens operacionais.",
      };
    case "TELEGRAM":
      return {
        label: "Telegram",
        icon: <Send className="h-4 w-4" />,
        accent:
          "Por padrão o tenant usa o bot global da plataforma. Configure aqui apenas se este escritório precisar de um bot próprio.",
      };
    case "SMS":
      return {
        label: "SMS",
        icon: <Smartphone className="h-4 w-4" />,
        accent: "Canal de contingência para eventos críticos e fallback transacional.",
      };
  }
}

function resolveHealthColor(
  healthStatus: string,
): "default" | "success" | "warning" | "danger" | "secondary" {
  switch (healthStatus) {
    case "HEALTHY":
      return "success";
    case "PENDING":
      return "warning";
    case "ERROR":
      return "danger";
    case "INACTIVE":
      return "secondary";
    default:
      return "default";
  }
}

function resolveHealthLabel(healthStatus: string) {
  switch (healthStatus) {
    case "HEALTHY":
      return "Saudável";
    case "PENDING":
      return "Estrutural";
    case "ERROR":
      return "Erro";
    case "INACTIVE":
      return "Inativo";
    default:
      return "Não configurado";
  }
}

function formatDateTime(value: Date | null) {
  if (!value) {
    return "Não validado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function TenantChannelProviderCard({
  channel,
}: {
  channel: TenantChannelProviderChannel;
}) {
  const channelMeta = resolveChannelMeta(channel);
  const providerOptions = useMemo(
    () => getTenantChannelProviderOptionsForChannel(channel),
    [channel],
  );
  const [selectedProvider, setSelectedProvider] =
    useState<TenantChannelProviderType>(providerOptions[0].provider);
  const [displayName, setDisplayName] = useState("");
  const [active, setActive] = useState(false);
  const [publicConfig, setPublicConfig] = useState<Record<string, string>>({});
  const [secretConfig, setSecretConfig] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const { data, mutate, isLoading } = useSWR(
    ["tenant-channel-provider", channel],
    async () => {
      const response = await obterTenantChannelProvider(channel);

      if (!response.success || !response.data) {
        throw new Error(response.error || "Falha ao carregar canal");
      }

      return response.data;
    },
  );

  useEffect(() => {
    if (!data) {
      return;
    }

    const nextProvider = data.provider ?? providerOptions[0].provider;
    const providerIsValid = providerOptions.some(
      (option) => option.provider === nextProvider,
    );
    const resolvedProvider = providerIsValid
      ? nextProvider
      : providerOptions[0].provider;

    setSelectedProvider(resolvedProvider);
    setDisplayName(data.displayName ?? "");
    setActive(data.active);
    setPublicConfig(data.publicConfig ?? {});
    setSecretConfig({});
  }, [data, providerOptions]);

  const providerDefinition = getTenantChannelProviderDefinition(selectedProvider);
  const selectedKeys = providerOptions.some(
    (option) => option.provider === selectedProvider,
  )
    ? [selectedProvider]
    : [providerOptions[0].provider];

  const handleProviderChange = (provider: TenantChannelProviderType) => {
    setSelectedProvider(provider);
    setSecretConfig({});

    if (data?.provider === provider) {
      setPublicConfig(data.publicConfig ?? {});
      return;
    }

    setPublicConfig({});
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      const response = await configurarTenantChannelProvider({
        channel,
        provider: selectedProvider,
        displayName,
        active,
        publicConfig,
        secretConfig,
      });

      if (!response.success) {
        throw new Error(response.error || "Falha ao salvar canal");
      }

      addToast({
        title: `${channelMeta.label} atualizado`,
        description: response.validation?.warnings?.[0]
          ? `${response.validation.message} ${response.validation.warnings[0]}`
          : response.validation?.message ||
            "Configuração do canal salva com sucesso.",
        color: response.validation?.mode === "MOCK" ? "success" : "primary",
      });

      setSecretConfig({});
      await mutate();
    } catch (error) {
      addToast({
        title: `Erro ao salvar ${channelMeta.label}`,
        description: error instanceof Error ? error.message : "Erro desconhecido",
        color: "danger",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);

    try {
      const response = await testarTenantChannelProvider(channel);

      if (!response.success) {
        throw new Error(response.error || "Falha ao validar canal");
      }

      addToast({
        title: `${channelMeta.label} validado`,
        description:
          response.data?.validationMode === "MOCK"
            ? "Provider mock respondeu corretamente."
            : "Configuração estrutural validada com sucesso.",
        color: response.data?.validationMode === "MOCK" ? "success" : "primary",
      });

      await mutate();
    } catch (error) {
      addToast({
        title: `Falha ao testar ${channelMeta.label}`,
        description: error instanceof Error ? error.message : "Erro desconhecido",
        color: "danger",
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border border-primary/20 bg-primary/5">
        <CardBody className="space-y-2 text-sm text-default-300">
          <div className="flex flex-wrap items-center gap-2">
            <Chip color="primary" size="sm" variant="flat">
              Omnichannel
            </Chip>
            <Chip
              color={resolveHealthColor(data?.healthStatus ?? "NOT_CONFIGURED")}
              size="sm"
              variant="flat"
            >
              {resolveHealthLabel(data?.healthStatus ?? "NOT_CONFIGURED")}
            </Chip>
          </div>
          <p className="font-medium text-foreground">{channelMeta.label} por tenant</p>
          <p>{channelMeta.accent}</p>
        </CardBody>
      </Card>

      <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
        <CardHeader className="flex flex-col gap-3 pb-2 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-foreground">
              <span className="text-primary">{channelMeta.icon}</span>
              <h3 className="text-lg font-semibold">{channelMeta.label}</h3>
            </div>
            <p className="text-sm text-default-400">
              {providerDefinition.description}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              isDisabled={!data?.provider && !selectedProvider}
              isLoading={isTesting}
              radius="full"
              startContent={!isTesting ? <Shield className="h-4 w-4" /> : null}
              variant="flat"
              onPress={handleTest}
            >
              {isTesting ? "Validando..." : "Validar"}
            </Button>
            <Button
              color="primary"
              isLoading={isSaving}
              radius="full"
              startContent={!isSaving ? <Zap className="h-4 w-4" /> : null}
              onPress={handleSave}
            >
              {isSaving ? "Salvando..." : "Salvar canal"}
            </Button>
          </div>
        </CardHeader>
        <Divider className="border-white/10" />
        <CardBody className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Nome operacional"
                placeholder={`${channelMeta.label} institucional`}
                value={displayName}
                onValueChange={setDisplayName}
              />
              <Select
                label="Provider"
                selectedKeys={selectedKeys}
                variant="bordered"
                onSelectionChange={(keys) => {
                  if (keys === "all") return;
                  const provider = String(Array.from(keys)[0]);
                  if (
                    providerOptions.some((option) => option.provider === provider)
                  ) {
                    handleProviderChange(provider as TenantChannelProviderType);
                  }
                }}
              >
                {providerOptions.map((option) => (
                  <SelectItem key={option.provider} textValue={option.label}>
                    {option.label}
                  </SelectItem>
                ))}
              </Select>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Ativar canal para uso operacional
                  </p>
                  <p className="text-xs text-default-400">
                    Quando desligado, a credencial fica salva, mas o canal não entra
                    em produção.
                  </p>
                </div>
                <Switch isSelected={active} size="sm" onValueChange={setActive} />
              </div>
            </div>

            {providerDefinition.publicFields.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {providerDefinition.publicFields.map((field) => (
                  <Input
                    key={field.key}
                    description={field.description}
                    label={field.label}
                    placeholder={field.placeholder}
                    value={publicConfig[field.key] ?? ""}
                    onValueChange={(value) =>
                      setPublicConfig((current) => ({
                        ...current,
                        [field.key]: value,
                      }))
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-success/20 bg-success/5 p-4 text-sm text-default-300">
                <p className="font-medium text-foreground">Provider sem segredo externo</p>
                <p className="mt-1">
                  Este provider funciona em modo local. Ele existe para preparar o
                  fluxo do tenant antes da entrada da credencial definitiva.
                </p>
              </div>
            )}

            {providerDefinition.secretFields.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {providerDefinition.secretFields.map((field) => (
                  <Input
                    key={field.key}
                    description={`${field.description} Deixe em branco para preservar o valor já salvo.`}
                    label={field.label}
                    placeholder={field.placeholder}
                    type="password"
                    value={secretConfig[field.key] ?? ""}
                    onValueChange={(value) =>
                      setSecretConfig((current) => ({
                        ...current,
                        [field.key]: value,
                      }))
                    }
                  />
                ))}
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                Estado atual
              </p>
              <div className="mt-3 space-y-2 text-sm text-default-300">
                <p>
                  Provider atual:{" "}
                  <strong>{data?.providerLabel ?? providerDefinition.label}</strong>
                </p>
                <p>
                  Ativo: <strong>{data?.active ? "Sim" : "Não"}</strong>
                </p>
                <p>
                  Última validação:{" "}
                  <strong>{formatDateTime(data?.lastValidatedAt ?? null)}</strong>
                </p>
                <p>
                  Modo de validação:{" "}
                  <strong>{data?.lastValidationMode ?? providerDefinition.validationMode}</strong>
                </p>
                <p>
                  Segredos salvos:{" "}
                  <strong>{data?.hasCredentials ? "Sim" : "Não"}</strong>
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                Preview operacional
              </p>
              <div className="mt-3 space-y-2 text-sm text-default-300">
                {data?.summaryItems?.length ? (
                  data.summaryItems.map((item) => (
                    <p key={item.key}>
                      {item.label}: <strong>{item.value}</strong>
                    </p>
                  ))
                ) : (
                  <p>Nenhum identificador público salvo ainda.</p>
                )}
              </div>
            </div>

            {data?.secretItems?.length ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                  Segredos persistidos
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {data.secretItems.map((item) => (
                    <Chip
                      key={item.key}
                      color={item.present ? "success" : "default"}
                      size="sm"
                      startContent={
                        item.present ? <CheckCircle2 className="h-3.5 w-3.5" /> : null
                      }
                      variant="flat"
                    >
                      {item.label}: {item.present ? item.preview : "Ausente"}
                    </Chip>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-warning/20 bg-warning/5 p-4 text-sm text-default-300">
              <p className="font-medium text-foreground">Observação de readiness</p>
              <p className="mt-2">{data?.healthHint ?? providerDefinition.healthHint}</p>
              {data?.lastErrorMessage ? (
                <p className="mt-2 text-danger-300">
                  Último erro: <strong>{data.lastErrorMessage}</strong>
                </p>
              ) : null}
            </div>
          </div>
        </CardBody>
      </Card>

      {isLoading ? (
        <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
          <CardBody className="py-6 text-sm text-default-400">
            Carregando configuração do canal...
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
