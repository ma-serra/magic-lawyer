"use client";

import type {
  NotificationChannel,
  NotificationUrgency,
} from "@/app/lib/notifications/notification-service";

import { useState } from "react";
import useSWR from "swr";
import { motion, AnimatePresence } from "framer-motion";
import {
  Card, CardBody, CardHeader, Button, Switch, Chip, Spinner, Tooltip, Select, SelectItem } from "@heroui/react";
import {
  SearchIcon,
  Bell,
  Mail,
  Smartphone,
  Send,
  RefreshCw,
  HelpCircle,
  Info,
  Filter,
  XCircle,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  Zap,
  TrendingUp,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Input } from "@heroui/input";

import {
  getNotificationPreferences,
  updateNotificationPreference,
} from "@/app/actions/notifications";
import { getMyTelegramNotificationStatus } from "@/app/actions/telegram-notifications";

// Agrupar eventos por categoria com ícones e descrições
const EVENT_CATEGORIES: Record<
  string,
  {
    label: string;
    icon: any;
    description: string;
    color: string;
    events: string[];
  }
> = {
  processos: {
    label: "Processos",
    icon: TrendingUp,
    description:
      "Notificações sobre criação, atualização e mudanças de status em processos judiciais",
    color: "primary",
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
      "Alertas sobre prazos judiciais: criação, avisos de expiração e vencidos",
    color: "danger",
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
    description:
      "Avisos sobre pagamentos, boletos gerados, PIX e questões financeiras",
    color: "success",
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
    description:
      "Informações sobre contratos: assinatura, expiração e cancelamento",
    color: "secondary",
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
    description: "Lembretes de eventos, audiências, reuniões e compromissos",
    color: "warning",
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
    description:
      "Notificações sobre upload, aprovação, rejeição e expiração de documentos",
    color: "default",
    events: [
      "documento.uploaded",
      "documento.approved",
      "documento.rejected",
      "documento.expired",
    ],
  },
};

const CHANNEL_LABELS: Record<
  NotificationChannel,
  { label: string; icon: any; description: string }
> = {
  REALTIME: {
    label: "In-app",
    icon: Bell,
    description: "Notificações em tempo real dentro do sistema",
  },
  EMAIL: {
    label: "Email",
    icon: Mail,
    description: "Receba notificações por email",
  },
  TELEGRAM: {
    label: "Telegram",
    icon: Send,
    description: "Escalonamento via bot do Telegram do escritório",
  },
  PUSH: {
    label: "Push",
    icon: Smartphone,
    description: "Notificações push no dispositivo móvel",
  },
};

const URGENCY_LABELS: Record<NotificationUrgency, string> = {
  CRITICAL: "Crítico",
  HIGH: "Alto",
  MEDIUM: "Médio",
  INFO: "Informativo",
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
    },
  },
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

  const preferences = data?.preferences || [];
  const preferencesMap = new Map(preferences.map((p) => [p.eventType, p]));
  const telegramStatus =
    telegramStatusResult?.success && telegramStatusResult.status
      ? telegramStatusResult.status
      : null;

  const handleUpdatePreference = async (
    eventType: string,
    updates: {
      enabled?: boolean;
      channels?: NotificationChannel[];
      urgency?: NotificationUrgency;
    },
  ) => {
    setLoadingEvents((prev) => new Set(prev).add(eventType));

    try {
      const result = await updateNotificationPreference({
        eventType,
        ...updates,
      });

      if (result.success) {
        toast.success("Preferência atualizada com sucesso");
        await mutate();
      } else {
        toast.error(result.error || "Erro ao atualizar preferência");
      }
    } catch (error) {
      toast.error("Erro ao atualizar preferência");
    } finally {
      setLoadingEvents((prev) => {
        const next = new Set(prev);

        next.delete(eventType);

        return next;
      });
    }
  };

  const filteredCategories = Object.entries(EVENT_CATEGORIES).filter(
    ([_, category]) => {
      if (!searchTerm && selectedCategory === "all") return true;
      const searchLower = searchTerm.toLowerCase();

      if (
        selectedCategory !== "all" &&
        selectedCategory !== category.label.toLowerCase()
      ) {
        return false;
      }

      return (
        category.label.toLowerCase().includes(searchLower) ||
        category.events.some((event) =>
          event.toLowerCase().includes(searchLower),
        )
      );
    },
  );

  if (error) {
    return (
      <motion.div
        animate={{ opacity: 1, scale: 1 }}
        initial={{ opacity: 0, scale: 0.95 }}
      >
        <Card className="border border-danger/20 bg-danger/5">
          <CardBody>
            <p className="text-danger">
              Erro ao carregar preferências:{" "}
              {error instanceof Error ? error.message : "Erro desconhecido"}
            </p>
            <Button
              className="mt-4"
              color="primary"
              startContent={<RefreshCw size={16} />}
              variant="flat"
              onPress={() => mutate()}
            >
              Tentar novamente
            </Button>
          </CardBody>
        </Card>
      </motion.div>
    );
  }

  const totalEvents = Object.values(EVENT_CATEGORIES).reduce(
    (sum, cat) => sum + cat.events.length,
    0,
  );

  return (
    <div className="space-y-6">
      {/* Resumo com Animação */}
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        initial={{ opacity: 0, y: -20 }}
      >
        <Card className="bg-linear-to-br from-primary/10 via-secondary/10 to-warning/10 border border-primary/20">
          <CardBody>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-default-600 dark:text-default-400 mb-1 flex items-center gap-1">
                  <Bell className="w-3 h-3" />
                  Total de eventos
                </p>
                <motion.p
                  animate={{ scale: 1 }}
                  className="text-3xl font-bold text-default-900"
                  initial={{ scale: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  {totalEvents}
                </motion.p>
              </div>
              <div>
                <p className="text-xs text-default-600 dark:text-default-400 mb-1 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  Habilitados
                </p>
                <motion.p
                  animate={{ scale: 1 }}
                  className="text-3xl font-bold text-success"
                  initial={{ scale: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  {preferences.filter((p) => p.enabled).length}
                </motion.p>
              </div>
              <div>
                <p className="text-xs text-default-600 dark:text-default-400 mb-1 flex items-center gap-1">
                  <XCircle className="w-3 h-3" />
                  Desabilitados
                </p>
                <motion.p
                  animate={{ scale: 1 }}
                  className="text-3xl font-bold text-danger"
                  initial={{ scale: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  {preferences.filter((p) => !p.enabled).length}
                </motion.p>
              </div>
              <div>
                <p className="text-xs text-default-600 dark:text-default-400 mb-1 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  Customizados
                </p>
                <motion.p
                  animate={{ scale: 1 }}
                  className="text-3xl font-bold text-primary"
                  initial={{ scale: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  {preferences.length}
                </motion.p>
              </div>
            </div>
          </CardBody>
        </Card>
      </motion.div>

      {/* Busca e Filtros Melhorados */}
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        initial={{ opacity: 0, y: 20 }}
        transition={{ delay: 0.1 }}
      >
        <Card>
          <CardBody className="gap-4">
            <Input
              endContent={
                searchTerm ? (
                  <button
                    className="cursor-pointer hover:opacity-70"
                    type="button"
                    onClick={() => setSearchTerm("")}
                  >
                    <XCircle className="w-4 h-4 text-default-400" />
                  </button>
                ) : null
              }
              placeholder="Buscar por categoria ou evento..."
              startContent={
                <SearchIcon className="text-default-400" size={20} />
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />

            {/* Filtro por Categoria */}
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-4 h-4 text-default-500" />
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
                  color={
                    selectedCategory === category.label.toLowerCase()
                      ? (category.color as any)
                      : "default"
                  }
                  size="sm"
                  startContent={<category.icon className="w-3 h-3" />}
                  variant={
                    selectedCategory === category.label.toLowerCase()
                      ? "solid"
                      : "flat"
                  }
                  onClick={() =>
                    setSelectedCategory(category.label.toLowerCase())
                  }
                >
                  {category.label}
                </Chip>
              ))}
              {(searchTerm || selectedCategory !== "all") && (
                <Button
                  size="sm"
                  startContent={<RotateCcw className="w-3 h-3" />}
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
          </CardBody>
        </Card>
      </motion.div>

      {telegramStatus && (!telegramStatus.providerReady || !telegramStatus.connected) ? (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 20 }}
          transition={{ delay: 0.15 }}
        >
          <Card className="border border-warning/20 bg-warning/5">
            <CardBody>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">
                    Telegram ainda não está pronto para escalonamento total
                  </p>
                  <p className="text-xs text-default-400">
                    {!telegramStatus.providerReady
                      ? "A plataforma ainda precisa configurar o bot global do Telegram."
                      : "Conecte seu chat no perfil para receber alertas críticos de prazo via Telegram."}
                  </p>
                </div>
                <Chip color="warning" size="sm" variant="flat">
                  {!telegramStatus.providerReady ? "Bot pendente" : "Vínculo pendente"}
                </Chip>
              </div>
            </CardBody>
          </Card>
        </motion.div>
      ) : null}

      {/* Legendas e Ajuda */}
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        initial={{ opacity: 0, y: 20 }}
        transition={{ delay: 0.2 }}
      >
        <Card className="bg-default-50 border border-default-200">
          <CardBody>
            <div className="flex items-start gap-4">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Info className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold mb-2">Como funciona?</h4>
                <ul className="space-y-2 text-sm text-default-600">
                  <li className="flex items-start gap-2">
                    <span className="font-bold">•</span>
                    <span>
                      <strong>Canais:</strong> Escolha como receber cada
                      notificação
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold">•</span>
                    <span>
                      <strong>Urgência:</strong> Defina a prioridade de cada
                      tipo de evento
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold">•</span>
                    <span>
                      <strong>Desabilitar:</strong> Desative eventos que não
                      deseja receber
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </CardBody>
        </Card>
      </motion.div>

      {/* Categorias com Animação */}
      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div
            key="loading"
            animate={{ opacity: 1 }}
            className="flex justify-center py-12"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
          >
            <Spinner size="lg" />
          </motion.div>
        ) : (
          <motion.div
            key="categories"
            animate="visible"
            className="space-y-6"
            initial="hidden"
            variants={containerVariants}
          >
            {filteredCategories.length === 0 ? (
              <Card className="border border-default-200">
                <CardBody className="text-center py-8">
                  <Filter className="w-12 h-12 mx-auto text-default-400 mb-4" />
                  <p className="text-default-600">
                    Nenhum evento encontrado com esses filtros
                  </p>
                  <Button
                    className="mt-4"
                    startContent={<RotateCcw className="w-4 h-4" />}
                    variant="flat"
                    onPress={() => {
                      setSearchTerm("");
                      setSelectedCategory("all");
                    }}
                  >
                    Limpar filtros
                  </Button>
                </CardBody>
              </Card>
            ) : (
              filteredCategories.map(([categoryKey, category]) => (
                <motion.div key={categoryKey} variants={itemVariants}>
                  <Card className="border border-default-200 hover:border-primary/50 transition-colors">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3 w-full">
                        <div
                          className={`p-2 rounded-lg bg-${category.color}/10`}
                        >
                          <category.icon
                            className={`w-5 h-5 text-${category.color}`}
                          />
                        </div>
                        <div className="flex-1">
                          <h2 className="text-xl font-semibold flex items-center gap-2">
                            {category.label}
                            <Tooltip content={category.description}>
                              <HelpCircle className="w-4 h-4 text-default-400 hover:text-primary cursor-help" />
                            </Tooltip>
                          </h2>
                        </div>
                        <Chip
                          color={category.color as any}
                          size="sm"
                          variant="flat"
                        >
                          {category.events.length} eventos
                        </Chip>
                      </div>
                    </CardHeader>
                    <CardBody className="pt-0">
                      <div className="space-y-3">
                        {category.events.map((eventType, index) => {
                          const preference = preferencesMap.get(eventType);
                          const isEnabled = preference?.enabled ?? true;
                          const channels = preference?.channels ?? ["REALTIME"];
                          const urgency = preference?.urgency ?? "MEDIUM";
                          const isLoadingEvent = loadingEvents.has(eventType);

                          return (
                            <motion.div
                              key={eventType}
                              animate={{ opacity: 1, x: 0 }}
                              className={`flex items-start justify-between gap-4 p-4 rounded-lg border transition-all ${
                                isEnabled
                                  ? "border-default-200 bg-default-50/50"
                                  : "border-default-100 bg-default-50/20 opacity-60"
                              }`}
                              initial={{ opacity: 0, x: -20 }}
                              transition={{ delay: index * 0.02 }}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-3">
                                  <Switch
                                    color={category.color as any}
                                    isDisabled={isLoadingEvent}
                                    isSelected={isEnabled}
                                    size="sm"
                                    onValueChange={(enabled) =>
                                      handleUpdatePreference(eventType, {
                                        enabled,
                                      })
                                    }
                                  />
                                  <span className="font-medium text-sm">
                                    {eventType
                                      .replace(/\./g, " ")
                                      .replace(/_/g, " ")
                                      .replace(/\b\w/g, (c) => c.toUpperCase())}
                                  </span>
                                </div>

                                <AnimatePresence>
                                  {isEnabled && (
                                    <motion.div
                                      animate={{ opacity: 1, height: "auto" }}
                                      className="space-y-3 ml-8 mt-3"
                                      exit={{ opacity: 0, height: 0 }}
                                      initial={{ opacity: 0, height: 0 }}
                                    >
                                      {/* Canais */}
                                      <div>
                                        <label className="text-xs font-semibold text-default-600 dark:text-default-400 mb-2 flex items-center gap-1">
                                          Canais
                                          <Tooltip content="Clique nos canais para ativar/desativar. Deve haver pelo menos um selecionado.">
                                            <HelpCircle className="w-3 h-3" />
                                          </Tooltip>
                                        </label>
                                        <div className="flex gap-2 flex-wrap">
                                          {Object.entries(CHANNEL_LABELS).map(
                                            ([
                                              channelKey,
                                              {
                                                label,
                                                icon: Icon,
                                                description,
                                              },
                                            ]) => {
                                              const channel =
                                                channelKey as NotificationChannel;
                                              const isSelected =
                                                channels.includes(channel);

                                              return (
                                                <Tooltip
                                                  key={channelKey}
                                                  content={description}
                                                >
                                                  <motion.div
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.95 }}
                                                  >
                                                    <Chip
                                                      className="cursor-pointer transition-all"
                                                      color={
                                                        isSelected
                                                          ? (category.color as any)
                                                          : "default"
                                                      }
                                                      size="sm"
                                                      startContent={
                                                        <Icon size={14} />
                                                      }
                                                      variant={
                                                        isSelected
                                                          ? "solid"
                                                          : "flat"
                                                      }
                                                      onClick={() => {
                                                        const newChannels =
                                                          isSelected
                                                            ? channels.filter(
                                                                (c) =>
                                                                  c !== channel,
                                                              )
                                                            : [
                                                                ...channels,
                                                                channel,
                                                              ];

                                                        if (
                                                          newChannels.length > 0
                                                        ) {
                                                          handleUpdatePreference(
                                                            eventType,
                                                            {
                                                              channels:
                                                                newChannels as NotificationChannel[],
                                                            },
                                                          );
                                                        } else {
                                                          toast.error(
                                                            "Pelo menos um canal deve estar selecionado",
                                                          );
                                                        }
                                                      }}
                                                    >
                                                      {label}
                                                    </Chip>
                                                  </motion.div>
                                                </Tooltip>
                                              );
                                            },
                                          )}
                                        </div>
                                      </div>

                                      {/* Urgência */}
                                      <div>
                                        <label className="text-xs font-semibold text-default-600 dark:text-default-400 mb-2 block">
                                          Nível de Urgência
                                        </label>
                                        <Select
                                          className="max-w-xs"
                                          selectedKeys={[urgency]}
                                          size="sm"
                                          variant="bordered"
                                          onSelectionChange={(keys) => {
                                            const selected = Array.from(
                                              keys,
                                            )[0] as NotificationUrgency;

                                            handleUpdatePreference(eventType, {
                                              urgency: selected,
                                            });
                                          }}
                                        >
                                          {Object.entries(URGENCY_LABELS).map(
                                            ([key, label]) => (
                                              <SelectItem key={key} textValue={label}>
                                                {label}
                                              </SelectItem>
                                            ),
                                          )}
                                        </Select>
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>

                              <AnimatePresence>
                                {isLoadingEvent && (
                                  <motion.div
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    initial={{ opacity: 0 }}
                                  >
                                    <Spinner className="mt-1" size="sm" />
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </motion.div>
                          );
                        })}
                      </div>
                    </CardBody>
                  </Card>
                </motion.div>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
