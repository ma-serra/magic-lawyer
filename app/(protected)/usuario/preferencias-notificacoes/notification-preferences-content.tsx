"use client";

import type {
  NotificationChannel,
  NotificationUrgency,
} from "@/app/lib/notifications/notification-service";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  Button,
  Card,
  CardBody,
  Chip,
  Select,
  SelectItem,
  Spinner,
  Switch,
  Tooltip,
} from "@heroui/react";
import {
  AlertCircle,
  Bell,
  CheckCircle,
  Filter,
  HelpCircle,
  Info,
  Mail,
  RefreshCw,
  RotateCcw,
  SearchIcon,
  Send,
  Smartphone,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";
import { Input } from "@heroui/input";

import {
  getNotificationPreferences,
  updateNotificationPreference,
} from "@/app/actions/notifications";
import { getMyTelegramNotificationStatus } from "@/app/actions/telegram-notifications";
import {
  PeopleEmptyState,
  PeopleMetricCard,
  PeoplePanel,
} from "@/components/people-ui";
import { toast } from "@/lib/toast";

type CategoryTone =
  | "primary"
  | "danger"
  | "success"
  | "secondary"
  | "warning"
  | "default";

type EventCategory = {
  label: string;
  icon: typeof Bell;
  description: string;
  tone: CategoryTone;
  events: string[];
};

const EVENT_CATEGORIES: Record<string, EventCategory> = {
  processos: {
    label: "Processos",
    icon: TrendingUp,
    description:
      "Criação, atualização e mudanças de status em processos judiciais.",
    tone: "primary",
    events: [
      "processo.created",
      "processo.updated",
      "processo.status_changed",
      "processo.document_uploaded",
    ],
  },
  prazos: {
    label: "Prazos",
    icon: AlertCircle,
    description:
      "Alertas de criação, digests e escalonamento por proximidade de vencimento.",
    tone: "danger",
    events: [
      "prazo.created",
      "prazo.digest_30d",
      "prazo.digest_10d",
      "prazo.expiring_7d",
      "prazo.expiring_3d",
      "prazo.expiring_1d",
      "prazo.expiring_2h",
      "prazo.expired",
    ],
  },
  financeiro: {
    label: "Financeiro",
    icon: Zap,
    description: "Pagamentos, boletos, PIX e eventos de cobrança.",
    tone: "success",
    events: [
      "pagamento.created",
      "pagamento.paid",
      "pagamento.failed",
      "pagamento.overdue",
      "pagamento.estornado",
      "boleto.generated",
      "pix.generated",
    ],
  },
  contratos: {
    label: "Contratos",
    icon: CheckCircle,
    description: "Eventos de assinatura, expiração e cancelamento.",
    tone: "secondary",
    events: [
      "contrato.created",
      "contrato.signed",
      "contrato.expired",
      "contrato.expiring",
      "contrato.cancelled",
    ],
  },
  agenda: {
    label: "Agenda",
    icon: Bell,
    description: "Lembretes de audiências, reuniões e compromissos.",
    tone: "warning",
    events: [
      "evento.created",
      "evento.updated",
      "evento.cancelled",
      "evento.confirmation_updated",
      "evento.reminder_1d",
      "evento.reminder_1h",
    ],
  },
  documentos: {
    label: "Documentos",
    icon: Smartphone,
    description: "Upload, aprovação, rejeição e expiração de documentos.",
    tone: "default",
    events: [
      "documento.uploaded",
      "documento.approved",
      "documento.rejected",
      "documento.expired",
    ],
  },
};

const CATEGORY_TONE_CLASSES: Record<
  CategoryTone,
  { iconWrap: string; icon: string; box: string }
> = {
  primary: {
    iconWrap: "bg-primary/15",
    icon: "text-primary",
    box: "border-primary/20 bg-primary/5",
  },
  danger: {
    iconWrap: "bg-danger/15",
    icon: "text-danger",
    box: "border-danger/20 bg-danger/5",
  },
  success: {
    iconWrap: "bg-success/15",
    icon: "text-success",
    box: "border-success/20 bg-success/5",
  },
  secondary: {
    iconWrap: "bg-secondary/15",
    icon: "text-secondary",
    box: "border-secondary/20 bg-secondary/5",
  },
  warning: {
    iconWrap: "bg-warning/15",
    icon: "text-warning",
    box: "border-warning/20 bg-warning/5",
  },
  default: {
    iconWrap: "bg-white/10",
    icon: "text-default-300",
    box: "border-white/10 bg-background/40",
  },
};

const CHANNEL_LABELS: Record<
  NotificationChannel,
  { label: string; icon: typeof Bell; description: string }
> = {
  REALTIME: {
    label: "In-app",
    icon: Bell,
    description: "Notificação imediata dentro do sistema.",
  },
  EMAIL: {
    label: "Email",
    icon: Mail,
    description: "Entrega por email para alertas operacionais.",
  },
  TELEGRAM: {
    label: "Telegram",
    icon: Send,
    description: "Escalonamento no bot conectado do escritório/plataforma.",
  },
  PUSH: {
    label: "Push",
    icon: Smartphone,
    description: "Notificações push (canal em evolução).",
  },
};

const URGENCY_LABELS: Record<NotificationUrgency, string> = {
  CRITICAL: "Crítico",
  HIGH: "Alto",
  MEDIUM: "Médio",
  INFO: "Informativo",
};

export function NotificationPreferencesContent() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [loadingEvents, setLoadingEvents] = useState<Set<string>>(new Set());

  const { data, error, isLoading, mutate } = useSWR(
    "notification-preferences",
    getNotificationPreferences,
    {
      revalidateOnFocus: false,
    },
  );
  const { data: telegramStatusResult } = useSWR(
    "my-telegram-notification-status",
    getMyTelegramNotificationStatus,
    {
      revalidateOnFocus: false,
    },
  );

  const preferences = data?.preferences ?? [];
  const preferencesMap = useMemo(
    () => new Map(preferences.map((preference) => [preference.eventType, preference])),
    [preferences],
  );
  const telegramStatus =
    telegramStatusResult?.success && telegramStatusResult.status
      ? telegramStatusResult.status
      : null;

  const totalEvents = useMemo(
    () =>
      Object.values(EVENT_CATEGORIES).reduce(
        (sum, category) => sum + category.events.length,
        0,
      ),
    [],
  );

  const enabledEvents = preferences.filter((preference) => preference.enabled).length;
  const disabledEvents = preferences.filter((preference) => !preference.enabled).length;

  const filteredCategories = useMemo(
    () =>
      Object.entries(EVENT_CATEGORIES).filter(([categoryKey, category]) => {
        if (!searchTerm && selectedCategory === "all") {
          return true;
        }

        const normalizedSearch = searchTerm.toLowerCase();
        if (selectedCategory !== "all" && selectedCategory !== categoryKey) {
          return false;
        }

        return (
          category.label.toLowerCase().includes(normalizedSearch) ||
          category.events.some((eventType) =>
            eventType.toLowerCase().includes(normalizedSearch),
          )
        );
      }),
    [searchTerm, selectedCategory],
  );

  const handleUpdatePreference = async (
    eventType: string,
    updates: {
      enabled?: boolean;
      channels?: NotificationChannel[];
      urgency?: NotificationUrgency;
    },
  ) => {
    setLoadingEvents((previous) => new Set(previous).add(eventType));

    try {
      const result = await updateNotificationPreference({
        eventType,
        ...updates,
      });

      if (!result.success) {
        toast.error(result.error || "Erro ao atualizar preferência");
        return;
      }

      toast.success("Preferência atualizada com sucesso.");
      await mutate();
    } catch {
      toast.error("Erro ao atualizar preferência");
    } finally {
      setLoadingEvents((previous) => {
        const next = new Set(previous);
        next.delete(eventType);
        return next;
      });
    }
  };

  if (error) {
    return (
      <PeoplePanel
        title="Falha ao carregar preferências"
        description={
          error instanceof Error
            ? error.message
            : "Erro inesperado ao carregar preferências de notificação."
        }
      >
        <div className="flex justify-end">
          <Button
            color="primary"
            startContent={<RefreshCw className="h-4 w-4" />}
            variant="flat"
            onPress={() => mutate()}
          >
            Tentar novamente
          </Button>
        </div>
      </PeoplePanel>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <PeopleMetricCard
          helper="Quantidade total de eventos monitorados."
          icon={<Bell className="h-4 w-4" />}
          label="Total de eventos"
          tone="primary"
          value={totalEvents}
        />
        <PeopleMetricCard
          helper="Eventos atualmente ativos para envio."
          icon={<CheckCircle className="h-4 w-4" />}
          label="Habilitados"
          tone="success"
          value={enabledEvents}
        />
        <PeopleMetricCard
          helper="Eventos pausados para este usuário."
          icon={<XCircle className="h-4 w-4" />}
          label="Desabilitados"
          tone="danger"
          value={disabledEvents}
        />
        <PeopleMetricCard
          helper="Preferências customizadas salvas."
          icon={<TrendingUp className="h-4 w-4" />}
          label="Customizados"
          tone="secondary"
          value={preferences.length}
        />
      </div>

      <PeoplePanel
        title="Busca e recorte operacional"
        description="Filtre categorias e eventos para ajustar a matriz de notificações com rapidez."
      >
        <div className="space-y-4">
          <Input
            endContent={
              searchTerm ? (
                <button
                  className="cursor-pointer hover:opacity-70"
                  type="button"
                  onClick={() => setSearchTerm("")}
                >
                  <XCircle className="h-4 w-4 text-default-400" />
                </button>
              ) : null
            }
            placeholder="Buscar por categoria ou tipo de evento..."
            startContent={<SearchIcon className="h-4 w-4 text-default-400" />}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-default-500" />
            <Chip
              className="cursor-pointer"
              color={selectedCategory === "all" ? "primary" : "default"}
              size="sm"
              variant={selectedCategory === "all" ? "solid" : "flat"}
              onClick={() => setSelectedCategory("all")}
            >
              Todas
            </Chip>
            {Object.entries(EVENT_CATEGORIES).map(([key, category]) => (
              <Chip
                key={key}
                className="cursor-pointer"
                color={selectedCategory === key ? (category.tone as any) : "default"}
                size="sm"
                startContent={<category.icon className="h-3 w-3" />}
                variant={selectedCategory === key ? "solid" : "flat"}
                onClick={() => setSelectedCategory(key)}
              >
                {category.label}
              </Chip>
            ))}
            {(searchTerm || selectedCategory !== "all") && (
              <Button
                size="sm"
                startContent={<RotateCcw className="h-3 w-3" />}
                variant="light"
                onPress={() => {
                  setSearchTerm("");
                  setSelectedCategory("all");
                }}
              >
                Limpar
              </Button>
            )}
          </div>
        </div>
      </PeoplePanel>

      {telegramStatus && (!telegramStatus.providerReady || !telegramStatus.connected) ? (
        <PeoplePanel
          title="Telegram pendente para escalonamento"
          description={
            !telegramStatus.providerReady
              ? "O bot global/tenant ainda não está configurado."
              : "Conecte seu chat no perfil para receber alertas críticos de prazo."
          }
          actions={
            <Chip color="warning" size="sm" variant="flat">
              {!telegramStatus.providerReady ? "Bot pendente" : "Vínculo pendente"}
            </Chip>
          }
        >
          <p className="text-sm text-default-400">
            Sem Telegram pronto, os alertas continuam por canais disponíveis, mas sem escalonamento completo.
          </p>
        </PeoplePanel>
      ) : null}

      <PeoplePanel
        title="Como configurar"
        description="Cada evento pode ser ligado/desligado, receber múltiplos canais e ter sua urgência definida."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <Card className="border border-white/10 bg-background/40">
            <CardBody className="space-y-2">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Canais</p>
              </div>
              <p className="text-xs text-default-400">
                Selecione os meios de entrega por evento (in-app, email, Telegram, push).
              </p>
            </CardBody>
          </Card>
          <Card className="border border-white/10 bg-background/40">
            <CardBody className="space-y-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Urgência</p>
              </div>
              <p className="text-xs text-default-400">
                Use níveis diferentes para priorizar escalonamento e leitura na rotina.
              </p>
            </CardBody>
          </Card>
          <Card className="border border-white/10 bg-background/40">
            <CardBody className="space-y-2">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Pausar evento</p>
              </div>
              <p className="text-xs text-default-400">
                Desative tipos de evento não relevantes para evitar ruído operacional.
              </p>
            </CardBody>
          </Card>
        </div>
      </PeoplePanel>

      <PeoplePanel
        title="Matriz de notificações por categoria"
        description="Ajuste evento por evento com total controle sobre ativação, canais e urgência."
      >
        {isLoading ? (
          <div className="flex min-h-40 items-center justify-center">
            <Spinner label="Carregando preferências..." />
          </div>
        ) : filteredCategories.length === 0 ? (
          <PeopleEmptyState
            title="Nenhum evento encontrado"
            description="Ajuste os filtros para visualizar novamente as categorias de notificação."
            icon={<Filter className="h-5 w-5" />}
            action={
              <Button
                size="sm"
                startContent={<RotateCcw className="h-4 w-4" />}
                variant="flat"
                onPress={() => {
                  setSearchTerm("");
                  setSelectedCategory("all");
                }}
              >
                Limpar filtros
              </Button>
            }
          />
        ) : (
          <div className="space-y-4">
            {filteredCategories.map(([categoryKey, category]) => {
              const toneStyles = CATEGORY_TONE_CLASSES[category.tone];

              return (
                <Card key={categoryKey} className="border border-white/10 bg-background/50">
                  <CardBody className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex h-9 w-9 items-center justify-center rounded-xl ${toneStyles.iconWrap}`}
                        >
                          <category.icon className={`h-4 w-4 ${toneStyles.icon}`} />
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-semibold text-foreground">
                              {category.label}
                            </h3>
                            <Tooltip content={category.description}>
                              <HelpCircle className="h-4 w-4 cursor-help text-default-500" />
                            </Tooltip>
                          </div>
                          <p className="text-xs text-default-500">
                            {category.description}
                          </p>
                        </div>
                      </div>
                      <Chip color={category.tone as any} size="sm" variant="flat">
                        {category.events.length} evento(s)
                      </Chip>
                    </div>

                    <div className="space-y-3">
                      {category.events.map((eventType) => {
                        const preference = preferencesMap.get(eventType);
                        const isEnabled = preference?.enabled ?? true;
                        const channels = preference?.channels ?? ["REALTIME"];
                        const urgency = preference?.urgency ?? "MEDIUM";
                        const isLoadingEvent = loadingEvents.has(eventType);

                        return (
                          <div
                            key={eventType}
                            className={`rounded-2xl border p-4 transition-colors ${
                              isEnabled
                                ? `${toneStyles.box}`
                                : "border-white/10 bg-background/30 opacity-70"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <Switch
                                    color={category.tone as any}
                                    isDisabled={isLoadingEvent}
                                    isSelected={isEnabled}
                                    size="sm"
                                    onValueChange={(enabled) =>
                                      handleUpdatePreference(eventType, { enabled })
                                    }
                                  />
                                  <p className="text-sm font-medium text-foreground">
                                    {eventType
                                      .replace(/\./g, " ")
                                      .replace(/_/g, " ")
                                      .replace(/\b\w/g, (char) => char.toUpperCase())}
                                  </p>
                                </div>

                                {isEnabled ? (
                                  <div className="mt-4 space-y-4 pl-8">
                                    <div>
                                      <div className="mb-2 flex items-center gap-2">
                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                                          Canais
                                        </p>
                                        <Tooltip content="Pelo menos um canal deve permanecer selecionado.">
                                          <HelpCircle className="h-3.5 w-3.5 text-default-500" />
                                        </Tooltip>
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        {Object.entries(CHANNEL_LABELS).map(
                                          ([channelKey, channelMeta]) => {
                                            const channel = channelKey as NotificationChannel;
                                            const isSelected = channels.includes(channel);
                                            const isTelegramChannel = channel === "TELEGRAM";

                                            return (
                                              <Tooltip
                                                key={channelKey}
                                                content={channelMeta.description}
                                              >
                                                <Chip
                                                  className="cursor-pointer"
                                                  color={
                                                    isSelected
                                                      ? (category.tone as any)
                                                      : "default"
                                                  }
                                                  size="sm"
                                                  startContent={
                                                    <channelMeta.icon className="h-3.5 w-3.5" />
                                                  }
                                                  variant={isSelected ? "solid" : "flat"}
                                                  onClick={() => {
                                                    if (isTelegramChannel) {
                                                      if (!telegramStatus?.providerReady) {
                                                        toast.error(
                                                          "Telegram indisponível: bot não configurado.",
                                                        );
                                                        return;
                                                      }
                                                      if (!telegramStatus.connected) {
                                                        toast.error(
                                                          "Conecte seu Telegram no perfil para habilitar esse canal.",
                                                        );
                                                        return;
                                                      }
                                                    }

                                                    const newChannels = isSelected
                                                      ? channels.filter(
                                                          (existingChannel) =>
                                                            existingChannel !== channel,
                                                        )
                                                      : [
                                                          ...channels,
                                                          channel,
                                                        ];

                                                    if (newChannels.length === 0) {
                                                      toast.error(
                                                        "Pelo menos um canal deve estar selecionado.",
                                                      );
                                                      return;
                                                    }

                                                    handleUpdatePreference(eventType, {
                                                      channels:
                                                        newChannels as NotificationChannel[],
                                                    });
                                                  }}
                                                >
                                                  {channelMeta.label}
                                                </Chip>
                                              </Tooltip>
                                            );
                                          },
                                        )}
                                      </div>
                                    </div>

                                    <div>
                                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                                        Urgência
                                      </p>
                                      <Select
                                        className="max-w-xs"
                                        selectedKeys={[urgency]}
                                        size="sm"
                                        variant="bordered"
                                        onSelectionChange={(keys) => {
                                          const selected = Array.from(keys)[0];

                                          if (!selected || typeof selected !== "string") {
                                            return;
                                          }

                                          handleUpdatePreference(eventType, {
                                            urgency: selected as NotificationUrgency,
                                          });
                                        }}
                                      >
                                        {Object.entries(URGENCY_LABELS).map(
                                          ([urgencyKey, urgencyLabel]) => (
                                            <SelectItem
                                              key={urgencyKey}
                                              textValue={urgencyLabel}
                                            >
                                              {urgencyLabel}
                                            </SelectItem>
                                          ),
                                        )}
                                      </Select>
                                    </div>
                                  </div>
                                ) : null}
                              </div>

                              {isLoadingEvent ? <Spinner size="sm" /> : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </PeoplePanel>
    </div>
  );
}

