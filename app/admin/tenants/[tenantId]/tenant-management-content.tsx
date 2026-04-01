"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Divider } from "@heroui/divider";
import { Input } from "@heroui/input";

import {
  Skeleton,
  Tooltip,
  Select,
  SelectItem,
  Pagination,
} from "@heroui/react";
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/table";
import { Tabs, Tab } from "@heroui/tabs";
import { addToast } from "@heroui/toast";
import {
  Building2,
  Copy,
  CreditCard,
  FileSignature,
  Users2,
  Palette,
  FileText,
  ShieldCheck,
  Sparkles,
  KeyRound,
  ToggleLeft,
  Edit,
  LogIn,
  Plus,
  Mail,
  Eye,
  EyeOff,
  Server,
  Info,
  CheckCircle2,
  XCircle,
  Bell,
  Shield,
  Clock,
  Users,
  Zap,
  LifeBuoy,
  MessageSquare,
  PlugZap,
  Search,
  Send,
  Smartphone,
} from "lucide-react";
import {
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";
import NextLink from "next/link";

import {
  getTenantManagementData,
  updateTenantDetails,
  updateTenantStatus,
  updateTenantSubscription,
  updateTenantBranding,
  updateTenantUser,
  startTenantUserImpersonation,
  type TenantManagementData,
  type UpdateTenantDetailsInput,
  type UpdateTenantSubscriptionInput,
  type UpdateTenantBrandingInput,
} from "@/app/actions/admin";
import {
  listTenantEmailCredentials,
  upsertTenantEmailCredential,
  deleteTenantEmailCredential,
  testTenantEmailConnection,
  logApiKeyView,
} from "@/app/actions/tenant-email-credentials";
import {
  testTenantAsaasConnectionAsSuperAdmin,
  testTenantClicksignConnectionAsSuperAdmin,
  testTenantChannelProviderAsSuperAdmin,
} from "@/app/actions/admin-integrations";
import { UserManagementModal } from "@/components/user-management-modal";
import {
  InvoiceStatus,
  SubscriptionStatus,
  TenantStatus,
  UserRole,
} from "@/generated/prisma";
import { DateInput } from "@/components/ui/date-input";

interface TenantManagementContentProps {
  tenantId: string;
  initialData: TenantManagementData;
}

const numberFormatter = new Intl.NumberFormat("pt-BR");
const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});

const subscriptionStatusOptions = Object.values(SubscriptionStatus).map(
  (status) => ({
    value: status,
    label: status
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (l) => l.toUpperCase()),
  }),
);

const tenantStatusOptions: Array<{
  value: TenantStatus;
  label: string;
  description: string;
}> = [
  {
    value: TenantStatus.ACTIVE,
    label: "Ativo",
    description: "Tenant com acesso total à plataforma",
  },
  {
    value: TenantStatus.SUSPENDED,
    label: "Suspenso",
    description: "Tenant temporariamente bloqueado (sem acesso)",
  },
  {
    value: TenantStatus.CANCELLED,
    label: "Cancelado",
    description: "Tenant encerrado definitivamente",
  },
];

const timezoneOptions = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Fortaleza",
  "America/Recife",
  "America/Bahia",
  "America/Campo_Grande",
  "America/Belem",
  "America/Rio_Branco",
  "America/New_York",
  "Europe/Lisbon",
];

const TENANT_ADMIN_INTEGRATION_KEYS = [
  "email",
  "clicksign",
  "certificates",
  "asaas",
  "jusbrasil",
  "whatsapp",
  "telegram",
  "sms",
] as const;

type TenantAdminIntegrationKey = (typeof TENANT_ADMIN_INTEGRATION_KEYS)[number];

const TENANT_ADMIN_INTEGRATION_OPTIONS: Array<{
  key: TenantAdminIntegrationKey;
  label: string;
  description: string;
  icon: ReactNode;
}> = [
  {
    key: "email",
    label: "Email",
    description:
      "Credenciais de envio usadas pelo tenant em notificações e mensagens transacionais.",
    icon: <Mail className="h-4 w-4" />,
  },
  {
    key: "clicksign",
    label: "ClickSign",
    description:
      "Assinatura digital por tenant com fallback controlado e isolamento de credenciais.",
    icon: <FileSignature className="h-4 w-4" />,
  },
  {
    key: "certificates",
    label: "Certificados e PJe",
    description:
      "Política de certificado do escritório e integrações PJe por tenant.",
    icon: <Shield className="h-4 w-4" />,
  },
  {
    key: "asaas",
    label: "Asaas",
    description:
      "Billing e cobrança do escritório com configuração segregada por tenant.",
    icon: <CreditCard className="h-4 w-4" />,
  },
  {
    key: "jusbrasil",
    label: "Jusbrasil",
    description:
      "Leitura administrativa da integracao juridica externa, com elegibilidade por plano e webhook esperado.",
    icon: <Search className="h-4 w-4" />,
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    description:
      "Provider omnichannel do tenant para mensagens operacionais e automações.",
    icon: <MessageSquare className="h-4 w-4" />,
  },
  {
    key: "telegram",
    label: "Telegram",
    description:
      "Bot ou provider alternativo do tenant para mensagens inbound/outbound.",
    icon: <Send className="h-4 w-4" />,
  },
  {
    key: "sms",
    label: "SMS",
    description:
      "Canal de contingência do tenant para avisos críticos e fallback transacional.",
    icon: <Smartphone className="h-4 w-4" />,
  },
] as const;

function isTenantAdminIntegrationKey(
  value: string,
): value is TenantAdminIntegrationKey {
  return (TENANT_ADMIN_INTEGRATION_KEYS as readonly string[]).includes(value);
}

const fetchTenant = async (
  _key: string,
  tenantId: string,
): Promise<TenantManagementData> => {
  const response = await getTenantManagementData(tenantId);

  if (!response.success || !response.data) {
    throw new Error(response.error ?? "Erro ao carregar tenant");
  }

  return response.data as TenantManagementData;
};

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleDateString("pt-BR");
}

function formatDateTime(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleString("pt-BR");
}

function daysUntil(value: string | null) {
  if (!value) return null;

  const target = new Date(value);

  if (Number.isNaN(target.getTime())) {
    return null;
  }

  return Math.ceil((target.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function formatDaysLabel(value: number | null) {
  if (value === null) return "Não definido";
  if (value < 0) return `Expirou há ${Math.abs(value)} dia(s)`;
  return `${value} dia(s)`;
}

function subscriptionLabel(status: SubscriptionStatus | null) {
  switch (status) {
    case SubscriptionStatus.TRIAL:
      return "Trial";
    case SubscriptionStatus.ATIVA:
      return "Ativa";
    case SubscriptionStatus.INADIMPLENTE:
      return "Inadimplente";
    case SubscriptionStatus.CANCELADA:
      return "Cancelada";
    case SubscriptionStatus.SUSPENSA:
      return "Suspensa";
    default:
      return "Sem assinatura";
  }
}

function subscriptionChipColor(status: SubscriptionStatus | null) {
  switch (status) {
    case SubscriptionStatus.TRIAL:
      return "primary";
    case SubscriptionStatus.ATIVA:
      return "success";
    case SubscriptionStatus.INADIMPLENTE:
      return "danger";
    case SubscriptionStatus.SUSPENSA:
      return "warning";
    case SubscriptionStatus.CANCELADA:
      return "default";
    default:
      return "default";
  }
}

function deriveTenantExecutiveState(
  data: TenantManagementData,
  tenantStatus: TenantStatus,
) {
  const trialDays = daysUntil(data.subscription.trialEndsAt);
  const renewalDays = daysUntil(data.subscription.renovaEm);
  const adoptionScore =
    data.metrics.usuarios + data.metrics.processos + data.metrics.clientes;

  let lifecycleLabel = "Ativo";
  let lifecycleTone:
    | "primary"
    | "secondary"
    | "success"
    | "warning"
    | "danger" = "success";
  let nextMilestoneLabel = "Renovação";
  let nextMilestoneValue = formatDate(data.subscription.renovaEm);

  if (
    tenantStatus === TenantStatus.CANCELLED ||
    data.subscription.status === SubscriptionStatus.CANCELADA
  ) {
    lifecycleLabel = "Cancelado";
    lifecycleTone = "danger";
    nextMilestoneLabel = "Encerramento";
    nextMilestoneValue = formatDate(data.tenant.updatedAt);
  } else if (
    tenantStatus === TenantStatus.SUSPENDED ||
    data.subscription.status === SubscriptionStatus.SUSPENSA
  ) {
    lifecycleLabel = "Suspenso";
    lifecycleTone = "warning";
    nextMilestoneLabel = "Reativação";
    nextMilestoneValue = "Aguardando decisão";
  } else if (data.subscription.status === SubscriptionStatus.INADIMPLENTE) {
    lifecycleLabel = "Inadimplente";
    lifecycleTone = "danger";
    nextMilestoneLabel = "Cobrança";
    nextMilestoneValue = "Ação imediata";
  } else if (data.subscription.status === SubscriptionStatus.TRIAL) {
    lifecycleLabel = "Trial";
    lifecycleTone = "primary";
    nextMilestoneLabel = "Fim do trial";
    nextMilestoneValue = formatDaysLabel(trialDays);
  } else if (!data.subscription.planId || adoptionScore <= 2) {
    lifecycleLabel = "Onboarding";
    lifecycleTone = "secondary";
    nextMilestoneLabel = "Última atividade";
    nextMilestoneValue = formatDate(data.tenant.updatedAt);
  } else if (renewalDays !== null && renewalDays <= 7) {
    lifecycleLabel = "Renovação crítica";
    lifecycleTone = "warning";
    nextMilestoneLabel = "Renovação";
    nextMilestoneValue = formatDaysLabel(renewalDays);
  }

  let healthLabel = "Saudável";
  let healthTone: "success" | "warning" | "danger" = "success";
  let healthHint =
    "Escritório operando com sinais consistentes de uso, cobrança e evolução.";
  let nextActionLabel = "Próximo passo";
  let nextActionValue = "Manter acompanhamento de renovação e expansão.";

  if (
    lifecycleLabel === "Cancelado" ||
    lifecycleLabel === "Suspenso" ||
    lifecycleLabel === "Inadimplente"
  ) {
    healthLabel = "Crítico";
    healthTone = "danger";
    healthHint =
      lifecycleLabel === "Inadimplente"
        ? "Há risco financeiro imediato. O tenant precisa de tratativa de cobrança."
        : "O tenant está fora da operação normal e exige ação administrativa.";
    nextActionLabel = "Ação prioritária";
    nextActionValue =
      lifecycleLabel === "Inadimplente"
        ? "Acionar cobrança e revisar continuidade do plano."
        : "Definir reativação ou encerramento com trilha de auditoria.";
  } else if (
    lifecycleLabel === "Trial" ||
    lifecycleLabel === "Onboarding" ||
    lifecycleLabel === "Renovação crítica" ||
    data.metrics.outstandingInvoices > 0 ||
    adoptionScore <= 4
  ) {
    healthLabel = "Acompanhar";
    healthTone = "warning";
    healthHint =
      lifecycleLabel === "Trial"
        ? "Conversão e ativação ainda não estão consolidadas."
        : "O tenant precisa de maior adoção ou atenção comercial/financeira.";
    nextActionLabel = "Ação recomendada";
    nextActionValue =
      data.metrics.outstandingInvoices > 0
        ? `Revisar ${data.metrics.outstandingInvoices} fatura(s) em aberto e confirmar plano de cobrança.`
        : "Acompanhar onboarding, ativação de equipe e uso dos módulos-chave.";
  }

  return {
    lifecycleLabel,
    lifecycleTone,
    healthLabel,
    healthTone,
    healthHint,
    nextActionLabel,
    nextActionValue,
    nextMilestoneLabel,
    nextMilestoneValue,
  };
}

export function TenantManagementContent({
  tenantId,
  initialData,
}: TenantManagementContentProps) {
  const { update: updateSession } = useSession();
  const router = useRouter();
  const { data, mutate, isValidating } = useSWR<TenantManagementData>(
    ["tenant-management", tenantId],
    () => fetchTenant("tenant-management", tenantId),
    {
      fallbackData: initialData,
      revalidateOnFocus: true,
    },
  );

  const tenantData = data ?? initialData;

  // Helper para revalidação com tratamento de erro melhorado
  const revalidateWithErrorHandling = async (context: string) => {
    try {
      await mutate(undefined, { revalidate: true });
    } catch (err) {
      addToast({
        title: "⚠️ Dados podem estar desatualizados",
        description: `Falha ao atualizar dados automaticamente. Recarregue a página se necessário.`,
        color: "warning",
        timeout: 8000,
      });
    }
  };

  const [detailsForm, setDetailsForm] = useState<UpdateTenantDetailsInput>({
    name: tenantData.tenant.name,
    slug: tenantData.tenant.slug,
    domain: tenantData.tenant.domain,
    email: tenantData.tenant.email,
    telefone: tenantData.tenant.telefone,
    documento: tenantData.tenant.documento,
    razaoSocial: tenantData.tenant.razaoSocial,
    nomeFantasia: tenantData.tenant.nomeFantasia,
    timezone: tenantData.tenant.timezone,
  });

  const [subscriptionForm, setSubscriptionForm] =
    useState<UpdateTenantSubscriptionInput>({
      planId: tenantData.subscription.planId ?? "",
      status: tenantData.subscription.status ?? SubscriptionStatus.TRIAL,
      trialEndsAt: tenantData.subscription.trialEndsAt,
      renovaEm: tenantData.subscription.renovaEm,
    });

  const [brandingForm, setBrandingForm] = useState<UpdateTenantBrandingInput>({
    primaryColor: tenantData.branding?.primaryColor ?? "",
    secondaryColor: tenantData.branding?.secondaryColor ?? "",
    accentColor: tenantData.branding?.accentColor ?? "",
    logoUrl: tenantData.branding?.logoUrl ?? "",
    faviconUrl: tenantData.branding?.faviconUrl ?? "",
  });

  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);

  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isSavingSubscription, setIsSavingSubscription] = useState(false);
  const [isSavingBranding, setIsSavingBranding] = useState(false);
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);
  const [showInternalData, setShowInternalData] = useState(false);
  const [selectedIntegration, setSelectedIntegration] =
    useState<TenantAdminIntegrationKey>("email");
  const [tenantStatusState, setTenantStatusState] = useState<TenantStatus>(
    tenantData.tenant.status,
  );

  const handleCopy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      addToast({
        title: `${label} copiado`,
        description: "Valor copiado para a área de transferência.",
        color: "success",
      });
    } catch {
      addToast({
        title: "Falha ao copiar",
        description: "Não foi possível copiar agora. Tente novamente.",
        color: "danger",
      });
    }
  };

  useEffect(() => {
    setDetailsForm({
      name: tenantData.tenant.name,
      slug: tenantData.tenant.slug,
      domain: tenantData.tenant.domain,
      email: tenantData.tenant.email,
      telefone: tenantData.tenant.telefone,
      documento: tenantData.tenant.documento,
      razaoSocial: tenantData.tenant.razaoSocial,
      nomeFantasia: tenantData.tenant.nomeFantasia,
      timezone: tenantData.tenant.timezone,
    });

    setSubscriptionForm({
      planId: tenantData.subscription.planId ?? "",
      status: tenantData.subscription.status ?? SubscriptionStatus.TRIAL,
      trialEndsAt: tenantData.subscription.trialEndsAt,
      renovaEm: tenantData.subscription.renovaEm,
    });

    setBrandingForm({
      primaryColor: tenantData.branding?.primaryColor ?? "",
      secondaryColor: tenantData.branding?.secondaryColor ?? "",
      accentColor: tenantData.branding?.accentColor ?? "",
      logoUrl: tenantData.branding?.logoUrl ?? "",
      faviconUrl: tenantData.branding?.faviconUrl ?? "",
    });
  }, [tenantData]);

  const planOptions = useMemo(
    () => [
      {
        id: "",
        nome: "Sem plano associado",
        valorMensal: null,
        valorAnual: null,
        moeda: "BRL",
      },
      ...tenantData.availablePlans,
    ],
    [tenantData.availablePlans],
  );

  const handleSaveDetails = async () => {
    if (isSavingDetails) return;

    setIsSavingDetails(true);

    try {
      const response = await updateTenantDetails(tenantId, detailsForm);

      if (!response.success) {
        addToast({
          title: "Erro ao salvar",
          description: response.error ?? "Falha ao atualizar informações",
          color: "danger",
        });

        return;
      }

      addToast({
        title: "Informações atualizadas",
        description: "Dados gerais do tenant foram salvos",
        color: "success",
      });

      await revalidateWithErrorHandling("detalhes");
    } finally {
      setIsSavingDetails(false);
    }
  };

  const handleStatusChange = async (status: TenantStatus) => {
    if (isUpdatingStatus) return;

    setIsUpdatingStatus(true);

    try {
      const response = await updateTenantStatus(tenantId, status);

      if (!response.success) {
        addToast({
          title: "Não foi possível alterar o status",
          description: response.error ?? "Tente novamente em instantes",
          color: "danger",
        });

        return;
      }

      addToast({
        title: "Status atualizado",
        description: `Tenant agora está como ${statusLabel(status)}`,
        color: "success",
      });

      setTenantStatusState(status);
      await revalidateWithErrorHandling("status");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleSaveSubscription = async () => {
    const payload: UpdateTenantSubscriptionInput = {
      planId: subscriptionForm.planId ? subscriptionForm.planId : null,
      status: subscriptionForm.status,
      trialEndsAt: subscriptionForm.trialEndsAt ?? null,
      renovaEm: subscriptionForm.renovaEm ?? null,
    };

    if (isSavingSubscription) return;

    setIsSavingSubscription(true);

    try {
      const response = await updateTenantSubscription(tenantId, payload);

      if (!response.success) {
        addToast({
          title: "Erro ao atualizar assinatura",
          description: response.error ?? "Verifique os dados informados",
          color: "danger",
        });

        return;
      }

      addToast({
        title: "Assinatura atualizada",
        description: "Configurações de cobrança foram salvas",
        color: "success",
      });

      await revalidateWithErrorHandling("assinatura");
    } finally {
      setIsSavingSubscription(false);
    }
  };

  const handleSaveBranding = async () => {
    if (isSavingBranding) return;

    setIsSavingBranding(true);

    try {
      const response = await updateTenantBranding(tenantId, brandingForm);

      if (!response.success) {
        addToast({
          title: "Erro ao atualizar branding",
          description: response.error ?? "Tente novamente",
          color: "danger",
        });

        return;
      }

      addToast({
        title: "Branding salvo",
        description: "Tema visual do tenant atualizado",
        color: "success",
      });

      await revalidateWithErrorHandling("branding");
    } finally {
      setIsSavingBranding(false);
    }
  };

  const handleToggleUserActive = async (userId: string, current: boolean) => {
    if (isUpdatingUser) return;

    setPendingUserId(userId);
    setIsUpdatingUser(true);

    try {
      const response = await updateTenantUser(tenantId, userId, {
        active: !current,
      });

      if (!response.success) {
        addToast({
          title: "Erro ao alterar status",
          description: response.error ?? "Tente novamente",
          color: "danger",
        });
      } else {
        addToast({
          title: !current ? "Usuário reativado" : "Usuário desativado",
          description: !current
            ? "Acesso liberado novamente"
            : "Usuário ficará sem acesso até nova liberação",
          color: "success",
        });
      }

      await revalidateWithErrorHandling("user active");
    } finally {
      setPendingUserId(null);
      setIsUpdatingUser(false);
    }
  };

  const handleResetUserPassword = async (userId: string) => {
    if (isUpdatingUser) return;

    setPendingUserId(userId);
    setIsUpdatingUser(true);

    try {
      const response = await updateTenantUser(tenantId, userId, {
        resetFirstAccess: true,
      });

      if (!response.success) {
        addToast({
          title: "Erro ao redefinir acesso",
          description: response.error ?? "Tente novamente",
          color: "danger",
        });
      } else {
        addToast({
          title: "Primeiro acesso redefinido",
          description: response.data?.firstAccessEmailSent
            ? `Link enviado para ${response.data?.maskedEmail ?? "o e-mail do usuário"}.`
            : response.data?.firstAccessEmailError ||
              "A senha foi invalidada. O usuário deve solicitar novo link no login.",
          color: response.data?.firstAccessEmailSent ? "success" : "warning",
          timeout: 8000,
        });
      }

      await revalidateWithErrorHandling("redefinir primeiro acesso");
    } finally {
      setPendingUserId(null);
      setIsUpdatingUser(false);
    }
  };

  const handleImpersonateTenantUser = async (userId: string) => {
    if (isUpdatingUser) return;

    setPendingUserId(userId);
    setIsUpdatingUser(true);

    try {
      const response = await startTenantUserImpersonation(tenantId, userId);

      if (!response.success || !response.data?.ticket) {
        addToast({
          title: "Falha ao iniciar sessão monitorada",
          description:
            response.error ??
            "Não foi possível entrar como este usuário neste momento.",
          color: "danger",
        });
        return;
      }

      await updateSession({
        impersonationTicket: response.data.ticket,
      });

      addToast({
        title: "Sessão monitorada iniciada",
        description:
          "Você agora está logado como o usuário selecionado. Todas as ações serão auditadas.",
        color: "warning",
        timeout: 9000,
      });

      router.push(response.data.redirectTo ?? "/dashboard");
      router.refresh();
    } catch (error) {
      addToast({
        title: "Erro ao iniciar sessão monitorada",
        description:
          error instanceof Error
            ? error.message
            : "Erro inesperado ao assumir o usuário.",
        color: "danger",
      });
    } finally {
      setPendingUserId(null);
      setIsUpdatingUser(false);
    }
  };

  const handleOpenUserModal = async (user?: any) => {
    if (user) {
      // Buscar dados completos do usuário incluindo advogado se aplicável
      const userWithDetails = {
        ...user,
        // Os dados já vêm do getTenantManagementData
      };

      setSelectedUser(userWithDetails);
    } else {
      setSelectedUser(null);
    }
    setIsUserModalOpen(true);
  };

  const handleCloseUserModal = () => {
    setIsUserModalOpen(false);
    setSelectedUser(null);
  };

  const handleUserModalSuccess = async () => {
    await mutate();
  };

  const isLoading = isValidating && !data;

  const userRoleOptions = tenantData.availableRoles.map((role) => ({
    value: role,
    label: roleLabel(role),
  }));

  const executiveState = useMemo(
    () => deriveTenantExecutiveState(tenantData, tenantStatusState),
    [tenantData, tenantStatusState],
  );

  return (
    <section className="space-y-6">
      <PeoplePageHeader
        tag="Administração"
        title={`Tenant · ${tenantData.tenant.name}`}
        description={`Cockpit operacional do escritório (${tenantData.tenant.slug}) para retenção, cobrança, suporte e governança administrativa.`}
        actions={
          <>
            <Chip
              color={statusChipColor(tenantStatusState)}
              size="sm"
              variant="flat"
            >
              {statusLabel(tenantStatusState)}
            </Chip>
            <Chip
              color={subscriptionChipColor(tenantData.subscription.status)}
              size="sm"
              variant="flat"
            >
              {subscriptionLabel(tenantData.subscription.status)}
            </Chip>
            <Chip color={executiveState.lifecycleTone} size="sm" variant="flat">
              {executiveState.lifecycleLabel}
            </Chip>
            <Chip
              color={executiveState.healthTone}
              size="sm"
              variant="bordered"
            >
              {executiveState.healthLabel}
            </Chip>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <PeopleMetricCard
          label="Plano"
          value={tenantData.subscription.planName ?? "Sem plano"}
          helper={
            tenantData.subscription.valorMensal
              ? formatCurrency(tenantData.subscription.valorMensal)
              : "Precificação não definida"
          }
          tone="primary"
        />
        <PeopleMetricCard
          label="Usuários"
          value={numberFormatter.format(tenantData.metrics.usuarios)}
          helper="Base ativa do tenant"
          tone="primary"
        />
        <PeopleMetricCard
          label="Processos"
          value={numberFormatter.format(tenantData.metrics.processos)}
          helper="Carteira processual"
          tone="secondary"
        />
        <PeopleMetricCard
          label="Clientes"
          value={numberFormatter.format(tenantData.metrics.clientes)}
          helper="Clientes cadastrados"
          tone="success"
        />
        <PeopleMetricCard
          label="Receita 30 dias"
          value={formatCurrency(tenantData.metrics.revenue30d)}
          helper={`90 dias: ${formatCurrency(tenantData.metrics.revenue90d)}`}
          tone="warning"
        />
        <PeopleMetricCard
          label={executiveState.nextMilestoneLabel}
          value={executiveState.nextMilestoneValue}
          helper={`Faturas em aberto: ${numberFormatter.format(tenantData.metrics.outstandingInvoices)}`}
          tone={
            executiveState.healthTone === "danger"
              ? "danger"
              : executiveState.healthTone === "warning"
                ? "warning"
                : "success"
          }
        />
      </div>

      <PeoplePanel
        title="Resumo executivo do tenant"
        description="Leitura rápida para decidir retenção, cobrança, suporte ou expansão antes de entrar nas tabs operacionais."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              as={NextLink}
              href={`/admin/suporte?tenantId=${tenantId}`}
              radius="full"
              size="sm"
              startContent={<LifeBuoy className="h-4 w-4" />}
              variant="flat"
            >
              Atender no suporte
            </Button>
            <Button
              radius="full"
              size="sm"
              startContent={<Copy className="h-4 w-4" />}
              variant="bordered"
              onPress={() => handleCopy(tenantData.tenant.id, "ID do tenant")}
            >
              Copiar ID
            </Button>
            <Button
              radius="full"
              size="sm"
              startContent={<Copy className="h-4 w-4" />}
              variant="bordered"
              onPress={() => handleCopy(tenantData.tenant.slug, "Slug")}
            >
              Copiar slug
            </Button>
            <Button
              radius="full"
              size="sm"
              variant="light"
              onPress={() => setShowInternalData((prev) => !prev)}
            >
              {showInternalData ? "Ocultar dados internos" : "Dados internos"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-background/30 p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Chip
                  color={executiveState.healthTone}
                  size="sm"
                  variant="flat"
                >
                  Saúde: {executiveState.healthLabel}
                </Chip>
                <Chip
                  color={executiveState.lifecycleTone}
                  size="sm"
                  variant="bordered"
                >
                  {executiveState.lifecycleLabel}
                </Chip>
              </div>
              <p className="text-sm text-default-300">
                {executiveState.healthHint}
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-background/30 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                  {executiveState.nextActionLabel}
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {executiveState.nextActionValue}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-background/30 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                  Marco principal
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {executiveState.nextMilestoneLabel}
                </p>
                <p className="mt-1 text-sm text-default-400">
                  {executiveState.nextMilestoneValue}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-background/30 p-4 text-sm text-default-400">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                Identidade operacional
              </p>
              <div className="mt-3 space-y-2">
                <p>
                  <span className="font-medium text-foreground">Slug:</span>{" "}
                  {tenantData.tenant.slug}
                </p>
                <p>
                  <span className="font-medium text-foreground">Domínio:</span>{" "}
                  {tenantData.tenant.domain ?? "Não configurado"}
                </p>
                <p>
                  <span className="font-medium text-foreground">Fuso:</span>{" "}
                  {tenantData.tenant.timezone}
                </p>
                <p>
                  <span className="font-medium text-foreground">
                    Criado em:
                  </span>{" "}
                  {formatDate(tenantData.tenant.createdAt)}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-background/30 p-4 text-sm text-default-400">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
                Financeiro e cobrança
              </p>
              <div className="mt-3 space-y-2">
                <p>
                  <span className="font-medium text-foreground">
                    Assinatura:
                  </span>{" "}
                  {subscriptionLabel(tenantData.subscription.status)}
                </p>
                <p>
                  <span className="font-medium text-foreground">Mensal:</span>{" "}
                  {tenantData.subscription.valorMensal
                    ? formatCurrency(tenantData.subscription.valorMensal)
                    : "Não definido"}
                </p>
                <p>
                  <span className="font-medium text-foreground">
                    Faturas abertas:
                  </span>{" "}
                  {tenantData.metrics.outstandingInvoices}
                </p>
                <p>
                  <span className="font-medium text-foreground">
                    Atualizado:
                  </span>{" "}
                  {formatDateTime(tenantData.tenant.updatedAt)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {showInternalData ? (
          <div className="mt-4 rounded-2xl border border-warning/30 bg-warning/5 p-4 text-xs text-default-500">
            <p className="font-semibold uppercase tracking-[0.2em] text-warning">
              Uso interno do suporte (não compartilhar)
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <span>ID do tenant: {tenantData.tenant.id}</span>
              <span>Slug: {tenantData.tenant.slug}</span>
              <span>Status: {statusLabel(tenantStatusState)}</span>
              <span>
                Subscription ID: {tenantData.subscription.id ?? "Não possui"}
              </span>
              <span>
                Plan ID: {tenantData.subscription.planId ?? "Não possui"}
              </span>
              <span>
                Atualizado em: {formatDateTime(tenantData.tenant.updatedAt)}
              </span>
            </div>
          </div>
        ) : null}
      </PeoplePanel>

      <div className="w-full">
        <Tabs
          aria-label="Painel de gerenciamento do tenant"
          classNames={{
            base: "w-full",
            tabList:
              "w-full gap-2 overflow-x-auto justify-start lg:justify-center",
            tab: "min-w-[150px] px-4 py-3 text-sm font-medium md:min-w-[180px] md:px-8 md:py-4 md:text-base",
            panel: "w-full",
          }}
          color="primary"
          variant="bordered"
        >
          <Tab
            key="overview"
            title={
              <TabTitle
                icon={<Building2 className="h-4 w-4" />}
                label="Visão geral"
              />
            }
          >
            <OverviewTab
              detailsForm={detailsForm}
              handleSaveDetails={handleSaveDetails}
              handleStatusChange={handleStatusChange}
              isSavingDetails={isSavingDetails}
              isUpdatingStatus={isUpdatingStatus}
              setDetailsForm={setDetailsForm}
              tenantStatus={tenantStatusState}
            />
          </Tab>

          <Tab
            key="integracoes"
            title={
              <TabTitle
                icon={<PlugZap className="h-4 w-4" />}
                label="Integrações"
              />
            }
          >
            <IntegrationsTab
              integrations={tenantData.integrations}
              selectedIntegration={selectedIntegration}
              tenantId={tenantId}
              onRefresh={() => revalidateWithErrorHandling("integracoes")}
              onIntegrationChange={setSelectedIntegration}
            />
          </Tab>

          <Tab
            key="finance"
            title={
              <TabTitle
                icon={<CreditCard className="h-4 w-4" />}
                label="Financeiro"
              />
            }
          >
            <FinanceTab
              handleSaveSubscription={handleSaveSubscription}
              invoices={tenantData.invoices}
              isSavingSubscription={isSavingSubscription}
              metrics={tenantData.metrics}
              planOptions={planOptions}
              setSubscriptionForm={setSubscriptionForm}
              subscriptionForm={subscriptionForm}
            />
          </Tab>

          <Tab
            key="users"
            title={
              <TabTitle
                icon={<Users2 className="h-4 w-4" />}
                label="Usuários"
              />
            }
          >
            <UsersTab
              isUpdatingUser={isUpdatingUser}
              pendingUserId={pendingUserId}
              userRoleOptions={userRoleOptions}
              users={tenantData.users}
              onImpersonateUser={handleImpersonateTenantUser}
              onOpenUserModal={handleOpenUserModal}
              onResetPassword={handleResetUserPassword}
              onToggleActive={handleToggleUserActive}
            />
          </Tab>

          <Tab
            key="branding"
            title={
              <TabTitle
                icon={<Palette className="h-4 w-4" />}
                label="Branding"
              />
            }
          >
            <BrandingTab
              brandingForm={brandingForm}
              handleSaveBranding={handleSaveBranding}
              isSavingBranding={isSavingBranding}
              setBrandingForm={setBrandingForm}
            />
          </Tab>

          <Tab
            key="auditoria"
            title={
              <TabTitle
                icon={<FileText className="h-4 w-4" />}
                label="Auditoria"
              />
            }
          >
            <AuditTab />
          </Tab>
        </Tabs>
      </div>

      {isLoading ? (
        <div className="flex justify-center">
          <Skeleton className="h-8 w-32 rounded-full" isLoaded={false} />
        </div>
      ) : null}

      <UserManagementModal
        isOpen={isUserModalOpen}
        tenantId={tenantId}
        user={selectedUser}
        onClose={handleCloseUserModal}
        onSuccess={handleUserModalSuccess}
      />
    </section>
  );
}

interface OverviewTabProps {
  detailsForm: UpdateTenantDetailsInput;
  setDetailsForm: Dispatch<SetStateAction<UpdateTenantDetailsInput>>;
  isSavingDetails: boolean;
  handleSaveDetails: () => Promise<void>;
  tenantStatus: TenantStatus;
  handleStatusChange: (status: TenantStatus) => Promise<void>;
  isUpdatingStatus: boolean;
}

function OverviewTab({
  detailsForm,
  setDetailsForm,
  isSavingDetails,
  handleSaveDetails,
  tenantStatus,
  handleStatusChange,
  isUpdatingStatus,
}: OverviewTabProps) {
  return (
    <div className="flex flex-col gap-6">
      <Card className="border border-white/10 bg-background/70 backdrop-blur">
        <CardHeader className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-foreground">
            Informações gerais
          </h2>
          <p className="text-sm text-default-400">
            Atualize dados de identificação e contato do tenant.
          </p>
        </CardHeader>
        <Divider className="border-white/10" />
        <CardBody className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              isRequired
              label="Nome do tenant"
              value={detailsForm.name ?? ""}
              onValueChange={(value) =>
                setDetailsForm((prev) => ({
                  ...prev,
                  name: value || undefined,
                }))
              }
            />
            <Input
              isRequired
              label="Slug"
              value={detailsForm.slug ?? ""}
              onValueChange={(value) =>
                setDetailsForm((prev) => ({
                  ...prev,
                  slug: value || undefined,
                }))
              }
            />
            <Input
              label="Domínio personalizado"
              description="Pode informar o host direto ou colar a URL completa. O sistema normaliza antes de salvar."
              placeholder="ex.: meu-escritorio.vercel.app ou escritorio.exemplo.com"
              value={detailsForm.domain ?? ""}
              onValueChange={(value) =>
                setDetailsForm((prev) => ({ ...prev, domain: value || null }))
              }
            />
            <Select
              label="Fuso horário"
              selectedKeys={
                new Set([detailsForm.timezone ?? "America/Sao_Paulo"])
              }
              onSelectionChange={(keys) => {
                const [value] = Array.from(keys);

                setDetailsForm((prev) => ({
                  ...prev,
                  timezone: typeof value === "string" ? value : undefined,
                }));
              }}
            >
              {timezoneOptions.map((tz) => (
                <SelectItem key={tz} textValue={tz}>
                  {tz}
                </SelectItem>
              ))}
            </Select>
            <Input
              label="Email de contato"
              type="email"
              value={detailsForm.email ?? ""}
              onValueChange={(value) =>
                setDetailsForm((prev) => ({ ...prev, email: value || null }))
              }
            />
            <Input
              label="Telefone"
              value={detailsForm.telefone ?? ""}
              onValueChange={(value) =>
                setDetailsForm((prev) => ({ ...prev, telefone: value || null }))
              }
            />
            <Input
              label="Documento (CNPJ/CPF)"
              value={detailsForm.documento ?? ""}
              onValueChange={(value) =>
                setDetailsForm((prev) => ({
                  ...prev,
                  documento: value || null,
                }))
              }
            />
            <Input
              label="Razão social"
              value={detailsForm.razaoSocial ?? ""}
              onValueChange={(value) =>
                setDetailsForm((prev) => ({
                  ...prev,
                  razaoSocial: value || null,
                }))
              }
            />
            <Input
              label="Nome fantasia"
              value={detailsForm.nomeFantasia ?? ""}
              onValueChange={(value) =>
                setDetailsForm((prev) => ({
                  ...prev,
                  nomeFantasia: value || null,
                }))
              }
            />
          </div>
          <div className="flex justify-end">
            <Button
              color="primary"
              isLoading={isSavingDetails}
              radius="full"
              onPress={handleSaveDetails}
            >
              Salvar alterações
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card className="border border-white/10 bg-background/70 backdrop-blur">
        <CardHeader className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-foreground">
            Status do tenant
          </h2>
          <p className="text-sm text-default-400">
            Controle de acesso global do tenant à plataforma.
          </p>
        </CardHeader>
        <Divider className="border-white/10" />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Chip
              color={statusChipColor(tenantStatus)}
              size="sm"
              variant="flat"
            >
              Status atual: {statusLabel(tenantStatus)}
            </Chip>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {tenantStatusOptions.map((option) => (
              <Card
                key={option.value}
                className={`border ${tenantStatus === option.value ? "border-primary/60 bg-primary/10" : "border-white/10 bg-background/60"}`}
              >
                <CardBody className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      {option.label}
                    </p>
                    <p className="text-xs text-default-400">
                      {option.description}
                    </p>
                  </div>
                  <Button
                    color={
                      tenantStatus === option.value ? "primary" : "default"
                    }
                    isDisabled={tenantStatus === option.value}
                    isLoading={isUpdatingStatus}
                    radius="full"
                    variant={
                      tenantStatus === option.value ? "flat" : "bordered"
                    }
                    onPress={() => handleStatusChange(option.value)}
                  >
                    {tenantStatus === option.value ? "Status atual" : "Aplicar"}
                  </Button>
                </CardBody>
              </Card>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

interface FinanceTabProps {
  subscriptionForm: UpdateTenantSubscriptionInput;
  setSubscriptionForm: Dispatch<SetStateAction<UpdateTenantSubscriptionInput>>;
  planOptions: Array<{
    id: string;
    nome: string;
    valorMensal: number | null;
    valorAnual: number | null;
    moeda: string;
  }>;
  handleSaveSubscription: () => Promise<void>;
  isSavingSubscription: boolean;
  metrics: TenantManagementData["metrics"];
  invoices: TenantManagementData["invoices"];
}

function FinanceTab({
  subscriptionForm,
  setSubscriptionForm,
  planOptions,
  handleSaveSubscription,
  isSavingSubscription,
  metrics,
  invoices,
}: FinanceTabProps) {
  return (
    <div className="flex flex-col gap-6">
      <Card className="border border-white/10 bg-background/70 backdrop-blur">
        <CardHeader className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Plano e assinatura
            </h2>
            <p className="text-sm text-default-400">
              Ajuste o plano, status da assinatura e datas de cobrança.
            </p>
          </div>
          <Chip color="secondary" size="sm" variant="flat">
            Receita 30 dias: {formatCurrency(metrics.revenue30d)}
          </Chip>
        </CardHeader>
        <Divider className="border-white/10" />
        <CardBody className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Select
              label="Plano"
              selectedKeys={new Set([subscriptionForm.planId ?? ""])}
              onSelectionChange={(keys) => {
                const [value] = Array.from(keys);

                setSubscriptionForm((prev) => ({
                  ...prev,
                  planId: typeof value === "string" ? value : "",
                }));
              }}
            >
              {planOptions.map((plan) => (
                <SelectItem key={plan.id} textValue={plan.nome}>
                  <div className="flex flex-col">
                    <span>{plan.nome}</span>
                    <span className="text-xs text-default-500">
                      {plan.valorMensal
                        ? `${formatCurrency(plan.valorMensal)} / mês`
                        : plan.valorAnual
                          ? `${formatCurrency(plan.valorAnual)} / ano`
                          : "Plano customizado"}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </Select>
            <Select
              label="Status da assinatura"
              selectedKeys={
                new Set([subscriptionForm.status ?? SubscriptionStatus.TRIAL])
              }
              onSelectionChange={(keys) => {
                const [value] = Array.from(keys);

                if (typeof value === "string") {
                  setSubscriptionForm((prev) => ({
                    ...prev,
                    status: value as SubscriptionStatus,
                  }));
                }
              }}
            >
              {subscriptionStatusOptions.map((option) => (
                <SelectItem key={option.value} textValue={option.label}>
                  {option.label}
                </SelectItem>
              ))}
            </Select>
            <DateInput
              label="Término do trial"
              value={subscriptionForm.trialEndsAt?.slice(0, 10) ?? ""}
              onValueChange={(value) =>
                setSubscriptionForm((prev) => ({
                  ...prev,
                  trialEndsAt: value ? new Date(value).toISOString() : null,
                }))
              }
            />
            <DateInput
              label="Próxima renovação"
              value={subscriptionForm.renovaEm?.slice(0, 10) ?? ""}
              onValueChange={(value) =>
                setSubscriptionForm((prev) => ({
                  ...prev,
                  renovaEm: value ? new Date(value).toISOString() : null,
                }))
              }
            />
          </div>
          <div className="flex justify-end">
            <Button
              color="primary"
              isLoading={isSavingSubscription}
              radius="full"
              onPress={handleSaveSubscription}
            >
              Salvar assinatura
            </Button>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="border border-white/10 bg-background/70 backdrop-blur">
          <CardHeader className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-foreground">
              Indicadores
            </h2>
            <p className="text-sm text-default-400">
              Métricas resumidas dos últimos 90 dias.
            </p>
          </CardHeader>
          <Divider className="border-white/10" />
          <CardBody>
            <div className="grid gap-4 md:grid-cols-2">
              <MetricCard
                label="Receita 90 dias"
                tone="success"
                value={formatCurrency(metrics.revenue90d)}
              />
              <MetricCard
                label="Receita 30 dias"
                tone="primary"
                value={formatCurrency(metrics.revenue30d)}
              />
              <MetricCard
                label="Usuários ativos"
                tone="secondary"
                value={numberFormatter.format(metrics.usuarios)}
              />
              <MetricCard
                label="Clientes cadastrados"
                tone="default"
                value={numberFormatter.format(metrics.clientes)}
              />
            </div>
          </CardBody>
        </Card>
        <Card className="border border-white/10 bg-background/70 backdrop-blur">
          <CardHeader className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-foreground">
              Faturas recentes
            </h2>
            <p className="text-sm text-default-400">
              {metrics.outstandingInvoices} fatura(s) aguardando pagamento.
            </p>
          </CardHeader>
          <Divider className="border-white/10" />
          <CardBody className="space-y-3">
            {invoices.length ? (
              invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="rounded-xl border border-white/10 bg-background/60 p-3"
                >
                  <div className="flex items-center justify-between text-sm font-medium text-foreground">
                    <span>
                      {invoice.numero ?? `Fatura ${invoice.id.slice(0, 6)}`}
                    </span>
                    <span>{formatCurrency(invoice.valor)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-default-500">
                    <span>Status: {invoiceStatusLabel(invoice.status)}</span>
                    <span>• Vencimento: {formatDate(invoice.vencimento)}</span>
                    <span>• Criada em: {formatDate(invoice.criadoEm)}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-default-400">
                Nenhuma fatura registrada para este tenant.
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

interface UsersTabProps {
  users: TenantManagementData["users"];
  userRoleOptions: Array<{ value: UserRole; label: string }>;
  pendingUserId: string | null;
  isUpdatingUser: boolean;
  onToggleActive: (userId: string, active: boolean) => Promise<void>;
  onResetPassword: (userId: string) => Promise<void>;
  onImpersonateUser: (userId: string) => Promise<void>;
  onOpenUserModal: (user?: any) => void;
}

function UsersTab({
  users,
  userRoleOptions,
  pendingUserId,
  isUpdatingUser,
  onToggleActive,
  onResetPassword,
  onImpersonateUser,
  onOpenUserModal,
}: UsersTabProps) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | UserRole>("ALL");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "ACTIVE" | "INACTIVE"
  >("ALL");
  const [pageSize, setPageSize] = useState<10 | 25 | 50>(10);
  const [page, setPage] = useState(1);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return users.filter((user) => {
      const matchesSearch =
        !normalizedSearch ||
        user.name.toLowerCase().includes(normalizedSearch) ||
        user.email.toLowerCase().includes(normalizedSearch);
      const matchesRole = roleFilter === "ALL" || user.role === roleFilter;
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && user.active) ||
        (statusFilter === "INACTIVE" && !user.active);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));

  const paginatedUsers = useMemo(() => {
    const start = (page - 1) * pageSize;

    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [search, roleFilter, statusFilter, pageSize]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const showingFrom = filteredUsers.length ? (page - 1) * pageSize + 1 : 0;
  const showingTo = filteredUsers.length
    ? Math.min(page * pageSize, filteredUsers.length)
    : 0;
  const roleFilterOptions = useMemo(
    () => [
      { value: "ALL" as const, label: "Todos os papeis" },
      ...userRoleOptions,
    ],
    [userRoleOptions],
  );

  return (
    <Card className="border border-white/10 bg-background/70 backdrop-blur">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Usuários do tenant
          </h2>
          <p className="text-sm text-default-400">
            Gerencie papéis, acesso e links de primeiro acesso dos usuários.
          </p>
        </div>
        <Button
          color="primary"
          size="sm"
          startContent={<Plus className="h-4 w-4" />}
          onPress={() => onOpenUserModal()}
        >
          Criar Usuário
        </Button>
      </CardHeader>
      <Divider className="border-white/10" />
      <CardBody className="space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-col gap-3 lg:flex-row">
            <Input
              className="w-full lg:max-w-sm"
              placeholder="Buscar por nome ou email"
              startContent={<Search className="h-4 w-4 text-default-400" />}
              value={search}
              onValueChange={setSearch}
            />
            <Select
              className="w-full lg:max-w-[220px]"
              items={roleFilterOptions}
              label="Papel"
              placeholder="Todos"
              selectedKeys={[roleFilter]}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as
                  | UserRole
                  | "ALL"
                  | undefined;
                setRoleFilter(selected ?? "ALL");
              }}
            >
              {(option) => (
                <SelectItem key={option.value} textValue={option.label}>
                  {option.label}
                </SelectItem>
              )}
            </Select>
            <Select
              className="w-full lg:max-w-[200px]"
              label="Status"
              placeholder="Todos"
              selectedKeys={[statusFilter]}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as
                  | "ALL"
                  | "ACTIVE"
                  | "INACTIVE"
                  | undefined;
                setStatusFilter(selected ?? "ALL");
              }}
            >
              <SelectItem key="ALL" textValue="Todos os status">
                Todos os status
              </SelectItem>
              <SelectItem key="ACTIVE" textValue="Ativo">
                Ativo
              </SelectItem>
              <SelectItem key="INACTIVE" textValue="Desativado">
                Desativado
              </SelectItem>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Chip size="sm" variant="flat">
              {numberFormatter.format(filteredUsers.length)} de{" "}
              {numberFormatter.format(users.length)} usuarios
            </Chip>
            <Select
              aria-label="Itens por pagina"
              className="w-[150px]"
              label="Itens por pagina"
              placeholder="10"
              selectedKeys={[String(pageSize)]}
              onSelectionChange={(keys) => {
                const selected = Number(Array.from(keys)[0] ?? 10) as
                  | 10
                  | 25
                  | 50;
                setPageSize(selected);
              }}
            >
              <SelectItem key="10" textValue="10 por pagina">
                10 por pagina
              </SelectItem>
              <SelectItem key="25" textValue="25 por pagina">
                25 por pagina
              </SelectItem>
              <SelectItem key="50" textValue="50 por pagina">
                50 por pagina
              </SelectItem>
            </Select>
            <Button
              size="sm"
              variant="light"
              onPress={() => {
                setSearch("");
                setRoleFilter("ALL");
                setStatusFilter("ALL");
                setPageSize(10);
              }}
            >
              Limpar filtros
            </Button>
          </div>
        </div>

        {users.length ? (
          filteredUsers.length ? (
            <>
              <Table removeWrapper aria-label="Usuários do tenant">
                <TableHeader>
                  <TableColumn>Nome Completo</TableColumn>
                  <TableColumn>Email</TableColumn>
                  <TableColumn>Função</TableColumn>
                  <TableColumn>Status</TableColumn>
                  <TableColumn className="text-right">Ações</TableColumn>
                </TableHeader>
                <TableBody>
                  {paginatedUsers.map((user) => {
                    const isPending =
                      pendingUserId === user.id && isUpdatingUser;

                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{user.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-default-500">{user.email}</span>
                        </TableCell>
                        <TableCell>
                          <Chip color="primary" size="sm" variant="flat">
                            {userRoleOptions.find((r) => r.value === user.role)
                              ?.label || user.role}
                          </Chip>
                        </TableCell>
                        <TableCell>
                          <Chip
                            color={user.active ? "success" : "warning"}
                            size="sm"
                            variant="flat"
                          >
                            {user.active ? "Ativo" : "Desativado"}
                          </Chip>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Tooltip content="Editar usuário completo">
                              <Button
                                isIconOnly
                                color="primary"
                                radius="full"
                                size="sm"
                                variant="bordered"
                                onPress={() => onOpenUserModal(user)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </Tooltip>
                            <Tooltip
                              content={
                                user.active
                                  ? "Desativar usuário"
                                  : "Reativar usuário"
                              }
                            >
                              <Button
                                isIconOnly
                                color="default"
                                isLoading={isPending}
                                radius="full"
                                size="sm"
                                variant="bordered"
                                onPress={() =>
                                  onToggleActive(user.id, user.active)
                                }
                              >
                                <ToggleLeft className="h-4 w-4" />
                              </Button>
                            </Tooltip>
                            <Tooltip content="Reenviar primeiro acesso">
                              <Button
                                isIconOnly
                                color="secondary"
                                isLoading={isPending}
                                radius="full"
                                size="sm"
                                variant="flat"
                                onPress={() => onResetPassword(user.id)}
                              >
                                <KeyRound className="h-4 w-4" />
                              </Button>
                            </Tooltip>
                            <Tooltip content="Entrar como este usuário (sessão monitorada)">
                              <Button
                                isIconOnly
                                color="warning"
                                isDisabled={!user.active}
                                isLoading={isPending}
                                radius="full"
                                size="sm"
                                variant="flat"
                                onPress={() => onImpersonateUser(user.id)}
                              >
                                <LogIn className="h-4 w-4" />
                              </Button>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="flex flex-col gap-3 border-t border-white/10 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-default-500">
                  Mostrando {showingFrom} a {showingTo} de{" "}
                  {numberFormatter.format(filteredUsers.length)} usuarios
                </p>
                <Pagination
                  showControls
                  page={page}
                  total={totalPages}
                  onChange={setPage}
                />
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-background/40 px-4 py-8 text-center">
              <p className="text-sm font-medium text-foreground">
                Nenhum usuario encontrado com os filtros atuais.
              </p>
              <p className="mt-1 text-sm text-default-500">
                Ajuste a busca, o papel ou o status para localizar o acesso.
              </p>
            </div>
          )
        ) : (
          <p className="text-sm text-default-400">Nenhum usuário encontrado.</p>
        )}
      </CardBody>
    </Card>
  );
}

interface BrandingTabProps {
  brandingForm: UpdateTenantBrandingInput;
  setBrandingForm: (
    updater: (prev: UpdateTenantBrandingInput) => UpdateTenantBrandingInput,
  ) => void;
  handleSaveBranding: () => Promise<void>;
  isSavingBranding: boolean;
}

function BrandingTab({
  brandingForm,
  setBrandingForm,
  handleSaveBranding,
  isSavingBranding,
}: BrandingTabProps) {
  return (
    <Card className="border border-white/10 bg-background/70 backdrop-blur">
      <CardHeader className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-foreground">
          Identidade visual
        </h2>
        <p className="text-sm text-default-400">
          Ajuste cores e ativos visuais do tenant.
        </p>
      </CardHeader>
      <Divider className="border-white/10" />
      <CardBody className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <ColorInput
            label="Cor primária"
            value={brandingForm.primaryColor ?? ""}
            onChange={(value) =>
              setBrandingForm((prev) => ({
                ...prev,
                primaryColor: value || null,
              }))
            }
          />
          <ColorInput
            label="Cor secundária"
            value={brandingForm.secondaryColor ?? ""}
            onChange={(value) =>
              setBrandingForm((prev) => ({
                ...prev,
                secondaryColor: value || null,
              }))
            }
          />
          <ColorInput
            label="Cor de destaque"
            value={brandingForm.accentColor ?? ""}
            onChange={(value) =>
              setBrandingForm((prev) => ({
                ...prev,
                accentColor: value || null,
              }))
            }
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            label="Logo URL"
            placeholder="https://..."
            value={brandingForm.logoUrl ?? ""}
            onValueChange={(value) =>
              setBrandingForm((prev) => ({ ...prev, logoUrl: value || null }))
            }
          />
          <Input
            label="Favicon URL"
            placeholder="https://..."
            value={brandingForm.faviconUrl ?? ""}
            onValueChange={(value) =>
              setBrandingForm((prev) => ({
                ...prev,
                faviconUrl: value || null,
              }))
            }
          />
        </div>
        <div className="flex justify-end">
          <Button
            color="primary"
            isLoading={isSavingBranding}
            radius="full"
            onPress={handleSaveBranding}
          >
            Salvar branding
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function IntegrationStatCard({
  label,
  value,
  helper,
  chipColor = "default",
}: {
  label: string;
  value: string;
  helper: string;
  chipColor?:
    | "default"
    | "primary"
    | "secondary"
    | "success"
    | "warning"
    | "danger";
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
        {label}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-base font-semibold text-foreground">{value}</span>
        <Chip color={chipColor} size="sm" variant="flat">
          {value}
        </Chip>
      </div>
      <p className="mt-2 text-sm text-default-400">{helper}</p>
    </div>
  );
}

function resolveChannelHealthColor(
  healthStatus: TenantManagementData["integrations"]["whatsapp"]["healthStatus"],
): "default" | "primary" | "secondary" | "success" | "warning" | "danger" {
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

function resolveChannelHealthLabel(
  healthStatus: TenantManagementData["integrations"]["whatsapp"]["healthStatus"],
) {
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

function ChannelProviderAdminPanel({
  title,
  description,
  summary,
  isTesting,
  onTestConnection,
}: {
  title: string;
  description: string;
  summary: TenantManagementData["integrations"]["whatsapp"];
  isTesting: boolean;
  onTestConnection: () => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="border border-white/10 bg-background/70 backdrop-blur">
        <CardHeader className="flex flex-col gap-2">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{title}</h2>
              <p className="text-sm text-default-400">{description}</p>
            </div>
            <Button
              color="primary"
              isDisabled={summary.effectiveSource === "NONE"}
              isLoading={isTesting}
              radius="full"
              startContent={!isTesting ? <Zap className="h-4 w-4" /> : null}
              onPress={onTestConnection}
            >
              {isTesting ? "Validando..." : "Validar"}
            </Button>
          </div>
        </CardHeader>
        <Divider className="border-white/10" />
        <CardBody className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <IntegrationStatCard
              chipColor={resolveChannelHealthColor(summary.healthStatus)}
              helper="Leitura administrativa do estado operacional atual"
              label="Saúde"
              value={resolveChannelHealthLabel(summary.healthStatus)}
            />
            <IntegrationStatCard
              chipColor={summary.active ? "success" : "secondary"}
              helper="Canal salvo pelo tenant como ativo ou inativo"
              label="Ativação"
              value={summary.active ? "Ativo" : "Inativo"}
            />
            <IntegrationStatCard
              chipColor={summary.hasCredentials ? "success" : "danger"}
              helper="Painel admin só indica presença da credencial"
              label="Credencial"
              value={summary.hasCredentials ? "Presente" : "Ausente"}
            />
            <IntegrationStatCard
              chipColor={summary.lastValidatedAt ? "success" : "default"}
              helper="Última validação registrada para o provider"
              label="Validação"
              value={
                summary.lastValidatedAt
                  ? formatDateTime(summary.lastValidatedAt.toISOString())
                  : "Não validado"
              }
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-default-300">
            <p className="font-medium text-foreground">
              Configuração do tenant
            </p>
            <div className="mt-2 grid gap-2 lg:grid-cols-2">
              <p>
                Provider:{" "}
                <strong>{summary.providerLabel ?? "Não configurado"}</strong>
              </p>
              <p>
                Fonte efetiva:{" "}
                <strong>
                  {summary.effectiveSource === "TENANT"
                    ? "Configuração do tenant"
                    : summary.effectiveSource === "GLOBAL"
                      ? "Bot global da plataforma"
                      : "Não configurado"}
                </strong>
              </p>
              <p>
                Nome operacional:{" "}
                <strong>{summary.displayName ?? "Não informado"}</strong>
              </p>
              <p>
                Data de configuração:{" "}
                <strong>
                  {summary.dataConfiguracao
                    ? formatDateTime(summary.dataConfiguracao.toISOString())
                    : "Não informado"}
                </strong>
              </p>
              <p>
                Modo de validação:{" "}
                <strong>{summary.lastValidationMode ?? "Não executado"}</strong>
              </p>
            </div>
            {summary.fallbackAvailable &&
            summary.effectiveSource !== "TENANT" ? (
              <p className="mt-3 text-xs text-default-400">
                Fallback disponível: <strong>{summary.fallbackLabel}</strong>
                {summary.fallbackDescription
                  ? ` • ${summary.fallbackDescription}`
                  : ""}
              </p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-default-300">
            <p className="font-medium text-foreground">
              Identificadores públicos
            </p>
            <div className="mt-2 grid gap-2 lg:grid-cols-2">
              {summary.configSummary.length > 0 ? (
                summary.configSummary.map((item) => (
                  <p key={item.key}>
                    {item.label}: <strong>{item.value}</strong>
                  </p>
                ))
              ) : (
                <p>Nenhum identificador público salvo para este canal.</p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-warning/20 bg-warning/5 p-4 text-sm text-default-300">
            <p className="font-medium text-foreground">Readiness operacional</p>
            <p className="mt-2">{summary.healthHint}</p>
            {summary.lastErrorMessage ? (
              <p className="mt-2 text-danger-300">
                Último erro: <strong>{summary.lastErrorMessage}</strong>
              </p>
            ) : null}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function ClicksignAdminPanel({
  summary,
  isTesting,
  onTestConnection,
}: {
  summary: TenantManagementData["integrations"]["clicksign"];
  isTesting: boolean;
  onTestConnection: () => Promise<void>;
}) {
  const sourceTone =
    summary.effectiveSource === "TENANT"
      ? "success"
      : summary.effectiveSource === "GLOBAL"
        ? "warning"
        : summary.effectiveSource === "MOCK"
          ? "secondary"
          : summary.effectiveSource === "DISABLED"
            ? "danger"
            : "default";

  const sourceLabel =
    summary.effectiveSource === "TENANT"
      ? "Configuração do tenant"
      : summary.effectiveSource === "GLOBAL"
        ? "Fallback global"
        : summary.effectiveSource === "MOCK"
          ? "Mock local"
          : summary.effectiveSource === "DISABLED"
            ? "Desativada"
            : "Não configurada";

  return (
    <div className="flex flex-col gap-4">
      <Card className="border border-white/10 bg-background/70 backdrop-blur">
        <CardHeader className="flex flex-col gap-2">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                ClickSign do tenant
              </h2>
              <p className="text-sm text-default-400">
                Leitura administrativa da integração de assinatura digital sem
                expor token. O tenant continua responsável pela edição da
                credencial.
              </p>
            </div>
            <Button
              color="primary"
              isDisabled={
                summary.effectiveSource === "DISABLED" ||
                summary.effectiveSource === "NONE"
              }
              isLoading={isTesting}
              radius="full"
              startContent={!isTesting ? <Zap className="h-4 w-4" /> : null}
              onPress={onTestConnection}
            >
              {isTesting ? "Testando..." : "Testar conexão"}
            </Button>
          </div>
        </CardHeader>
        <Divider className="border-white/10" />
        <CardBody className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <IntegrationStatCard
              chipColor={sourceTone}
              helper="Origem efetiva usada pelo fluxo de assinatura"
              label="Origem"
              value={sourceLabel}
            />
            <IntegrationStatCard
              chipColor={
                summary.ambiente === "PRODUCAO" ? "warning" : "secondary"
              }
              helper="Ambiente salvo ou inferido para a integração"
              label="Ambiente"
              value={summary.ambiente === "PRODUCAO" ? "Produção" : "Sandbox"}
            />
            <IntegrationStatCard
              chipColor={summary.hasAccessToken ? "success" : "danger"}
              helper="Super admin só enxerga presença da credencial, não o segredo"
              label="Credencial"
              value={summary.hasAccessToken ? "Presente" : "Ausente"}
            />
            <IntegrationStatCard
              chipColor={summary.ultimaValidacao ? "success" : "default"}
              helper="Última validação executada pelo tenant"
              label="Validação"
              value={
                summary.ultimaValidacao
                  ? formatDateTime(summary.ultimaValidacao.toISOString())
                  : "Não validado"
              }
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-default-300">
            <p className="font-medium text-foreground">
              Configuração do tenant
            </p>
            <div className="mt-2 grid gap-2 lg:grid-cols-2">
              <p>
                Configuração salva:{" "}
                <strong>{summary.hasTenantConfig ? "Sim" : "Não"}</strong>
              </p>
              <p>
                Integração ativa:{" "}
                <strong>{summary.integracaoAtiva ? "Sim" : "Não"}</strong>
              </p>
              <p>
                API base do tenant:{" "}
                <span className="font-mono text-xs">
                  {summary.apiBase ?? "Não configurada"}
                </span>
              </p>
              <p>
                Data de configuração:{" "}
                <strong>
                  {summary.dataConfiguracao
                    ? formatDateTime(summary.dataConfiguracao.toISOString())
                    : "Não informado"}
                </strong>
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-warning/20 bg-warning/5 p-4 text-sm text-default-300">
            <p className="font-medium text-foreground">Fallback disponível</p>
            <div className="mt-2 grid gap-2 lg:grid-cols-2">
              <p>
                Fallback ativo:{" "}
                <strong>{summary.fallbackAvailable ? "Sim" : "Não"}</strong>
              </p>
              <p>
                Tipo: <strong>{summary.fallbackSource}</strong>
              </p>
              <p>
                Base do fallback:{" "}
                <span className="font-mono text-xs">
                  {summary.fallbackApiBase}
                </span>
              </p>
              <p>
                Ambiente do fallback:{" "}
                <strong>
                  {summary.fallbackAmbiente === "PRODUCAO"
                    ? "Produção"
                    : "Sandbox"}
                </strong>
              </p>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function AsaasAdminPanel({
  summary,
  isTesting,
  onTestConnection,
}: {
  summary: TenantManagementData["integrations"]["asaas"];
  isTesting: boolean;
  onTestConnection: () => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="border border-white/10 bg-background/70 backdrop-blur">
        <CardHeader className="flex flex-col gap-2">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Asaas do tenant
              </h2>
              <p className="text-sm text-default-400">
                Visão operacional da integração financeira do escritório,
                incluindo ambiente, proteção de webhook e último sinal recebido.
              </p>
            </div>
            <Button
              color="primary"
              isDisabled={!summary.id || !summary.integracaoAtiva}
              isLoading={isTesting}
              radius="full"
              startContent={!isTesting ? <Zap className="h-4 w-4" /> : null}
              onPress={onTestConnection}
            >
              {isTesting ? "Testando..." : "Testar conexão"}
            </Button>
          </div>
        </CardHeader>
        <Divider className="border-white/10" />
        <CardBody className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <IntegrationStatCard
              chipColor={summary.integracaoAtiva ? "success" : "warning"}
              helper="Status operacional salvo no tenant"
              label="Integração"
              value={summary.integracaoAtiva ? "Ativa" : "Pendente"}
            />
            <IntegrationStatCard
              chipColor={
                summary.ambiente === "PRODUCAO" ? "warning" : "secondary"
              }
              helper="Ambiente financeiro em uso"
              label="Ambiente"
              value={summary.ambiente === "PRODUCAO" ? "Produção" : "Sandbox"}
            />
            <IntegrationStatCard
              chipColor={summary.hasApiKey ? "success" : "danger"}
              helper="Leitura administrativa não expõe a API key"
              label="API key"
              value={summary.hasApiKey ? "Presente" : "Ausente"}
            />
            <IntegrationStatCard
              chipColor={summary.isWebhookProtected ? "success" : "warning"}
              helper="Proteção por token do tenant ou segredo global"
              label="Webhook"
              value={summary.isWebhookProtected ? "Protegido" : "Pendente"}
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-default-300">
            <p className="font-medium text-foreground">
              Configuração do tenant
            </p>
            <div className="mt-2 grid gap-2 lg:grid-cols-2">
              <p>
                Conta Asaas:{" "}
                <strong>{summary.asaasAccountId ?? "Não informada"}</strong>
              </p>
              <p>
                Wallet ID:{" "}
                <strong>{summary.asaasWalletId ?? "Não informado"}</strong>
              </p>
              <p>
                Data de configuração:{" "}
                <strong>
                  {summary.dataConfiguracao
                    ? formatDateTime(summary.dataConfiguracao.toISOString())
                    : "Não informado"}
                </strong>
              </p>
              <p>
                Última validação:{" "}
                <strong>
                  {summary.ultimaValidacao
                    ? formatDateTime(summary.ultimaValidacao.toISOString())
                    : "Não validada"}
                </strong>
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-warning/20 bg-warning/5 p-4 text-sm text-default-300">
            <p className="font-medium text-foreground">Webhook</p>
            <div className="mt-2 grid gap-2 lg:grid-cols-2">
              <p>
                URL:{" "}
                <span className="font-mono text-xs">{summary.webhookUrl}</span>
              </p>
              <p>
                Token por tenant:{" "}
                <strong>{summary.hasWebhookAccessToken ? "Sim" : "Não"}</strong>
              </p>
              <p>
                Segredo global:{" "}
                <strong>
                  {summary.globalWebhookSecretConfigured
                    ? "Configurado"
                    : "Ausente"}
                </strong>
              </p>
              <p>
                Webhook configurado em:{" "}
                <strong>
                  {summary.webhookConfiguredAt
                    ? formatDateTime(summary.webhookConfiguredAt.toISOString())
                    : "Não informado"}
                </strong>
              </p>
              <p>
                Último webhook:{" "}
                <strong>
                  {summary.lastWebhookAt
                    ? formatDateTime(summary.lastWebhookAt.toISOString())
                    : "Nenhum"}
                </strong>
              </p>
              <p>
                Último evento:{" "}
                <strong>{summary.lastWebhookEvent ?? "Nenhum"}</strong>
              </p>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function CertificatesAdminPanel({
  summary,
}: {
  summary: TenantManagementData["integrations"]["certificates"];
}) {
  const policyLabel =
    summary.policy === "OFFICE"
      ? "Escritório"
      : summary.policy === "LAWYER"
        ? "Advogado"
        : "Híbrida";

  return (
    <div className="flex flex-col gap-4">
      <Card className="border border-white/10 bg-background/70 backdrop-blur">
        <CardHeader className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-foreground">
            Certificados e PJe
          </h2>
          <p className="text-sm text-default-400">
            Visão resumida da política do tenant, volume de certificados e
            sinais de risco operacional para integrações PJe.
          </p>
        </CardHeader>
        <Divider className="border-white/10" />
        <CardBody className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <IntegrationStatCard
              chipColor="secondary"
              helper="Política ativa de uso de certificados"
              label="Política"
              value={policyLabel}
            />
            <IntegrationStatCard
              chipColor={summary.activeCertificates > 0 ? "success" : "warning"}
              helper="Certificados ativos disponíveis no tenant"
              label="Ativos"
              value={String(summary.activeCertificates)}
            />
            <IntegrationStatCard
              chipColor={summary.expiredCertificates > 0 ? "danger" : "success"}
              helper="Certificados expirados que merecem atenção"
              label="Expirados"
              value={String(summary.expiredCertificates)}
            />
            <IntegrationStatCard
              chipColor={
                summary.hasActiveOfficeCertificate ? "success" : "warning"
              }
              helper="Presença de certificado ativo no escopo OFFICE"
              label="Escopo office"
              value={
                summary.hasActiveOfficeCertificate ? "Coberto" : "Sem ativo"
              }
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-default-300">
            <p className="font-medium text-foreground">Distribuição</p>
            <div className="mt-2 grid gap-2 lg:grid-cols-2">
              <p>
                Total de certificados:{" "}
                <strong>{summary.totalCertificates}</strong>
              </p>
              <p>
                Escopo escritório: <strong>{summary.officeCertificates}</strong>
              </p>
              <p>
                Escopo advogado: <strong>{summary.lawyerCertificates}</strong>
              </p>
              <p>
                Última validação:{" "}
                <strong>
                  {summary.latestValidationAt
                    ? formatDateTime(summary.latestValidationAt.toISOString())
                    : "Nenhuma"}
                </strong>
              </p>
              <p>
                Último uso:{" "}
                <strong>
                  {summary.latestUseAt
                    ? formatDateTime(summary.latestUseAt.toISOString())
                    : "Nenhum"}
                </strong>
              </p>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function JusbrasilAdminPanel({
  summary,
}: {
  summary: TenantManagementData["integrations"]["jusbrasil"];
}) {
  const statusLabel = summary.effectiveEnabled
    ? "Ativo"
    : !summary.planEligible && summary.integracaoAtiva
      ? "Bloqueado pelo plano"
      : !summary.globalConfigured
        ? "Indisponivel na plataforma"
        : summary.integracaoAtiva
          ? "Pendente"
          : "Desligado";

  const statusTone = summary.effectiveEnabled
    ? "success"
    : !summary.planEligible && summary.integracaoAtiva
      ? "warning"
      : !summary.globalConfigured
        ? "danger"
        : summary.integracaoAtiva
          ? "primary"
          : "default";

  return (
    <div className="flex flex-col gap-4">
      <Card className="border border-white/10 bg-background/70 backdrop-blur">
        <CardHeader className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-foreground">
            Jusbrasil do tenant
          </h2>
          <p className="text-sm text-default-400">
            Visao administrativa da integracao juridica externa, sem expor
            segredos e sem depender de abrir o tenant para conferir o estado.
          </p>
        </CardHeader>
        <Divider className="border-white/10" />
        <CardBody className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <IntegrationStatCard
              chipColor={statusTone}
              helper="Estado efetivo considerando plano, credencial global e preferencia do tenant"
              label="Status"
              value={statusLabel}
            />
            <IntegrationStatCard
              chipColor={summary.planEligible ? "success" : "warning"}
              helper="Plano atual do tenant para operacao com Jusbrasil"
              label="Plano"
              value={summary.planName ?? "Sem plano"}
            />
            <IntegrationStatCard
              chipColor={summary.globalConfigured ? "success" : "danger"}
              helper="Disponibilidade da conta global da plataforma"
              label="Credencial"
              value={summary.globalConfigured ? "Configurada" : "Ausente"}
            />
            <IntegrationStatCard
              chipColor={summary.lastWebhookAt ? "primary" : "default"}
              helper="Ultimo webhook observado para este tenant"
              label="Webhook"
              value={
                summary.lastWebhookAt
                  ? formatDateTime(summary.lastWebhookAt)
                  : "Sem registro"
              }
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-default-300">
            <p className="font-medium text-foreground">
              Configuracao do tenant
            </p>
            <div className="mt-2 grid gap-2 lg:grid-cols-2">
              <p>
                Preferencia salva:{" "}
                <strong>{summary.integracaoAtiva ? "Ativa" : "Desativada"}</strong>
              </p>
              <p>
                Conta usada:{" "}
                <strong>
                  {summary.usingGlobalAccount ? "Global da plataforma" : "Tenant"}
                </strong>
              </p>
              <p>
                Data de configuracao:{" "}
                <strong>
                  {summary.dataConfiguracao
                    ? formatDateTime(summary.dataConfiguracao)
                    : "Nao informada"}
                </strong>
              </p>
              <p>
                Ultima validacao:{" "}
                <strong>
                  {summary.ultimaValidacao
                    ? formatDateTime(summary.ultimaValidacao)
                    : "Nao validada"}
                </strong>
              </p>
              <p>
                Base da API:{" "}
                <span className="font-mono text-xs">{summary.baseUrl}</span>
              </p>
              <p>
                Ultimo evento:{" "}
                <strong>{summary.lastWebhookEvent ?? "Nenhum"}</strong>
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-default-300">
            <p className="font-medium text-foreground">Webhook esperado</p>
            <div className="mt-2 grid gap-2 lg:grid-cols-2">
              <p>
                Endpoint:{" "}
                <span className="font-mono text-xs">
                  {summary.expectedWebhookUrl}
                </span>
              </p>
              <p>
                Registro salvo: <strong>{summary.id ? "Sim" : "Nao"}</strong>
              </p>
            </div>
          </div>

          {!summary.planEligible ? (
            <div className="rounded-2xl border border-warning/20 bg-warning/5 p-4 text-sm text-default-300">
              <p className="font-medium text-foreground">
                Elegibilidade do plano
              </p>
              <p className="mt-2">{summary.planEligibilityReason}</p>
            </div>
          ) : null}

          {!summary.globalConfigured ? (
            <div className="rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm text-default-300">
              <p className="font-medium text-foreground">
                Credencial global indisponivel
              </p>
              <p className="mt-2">
                Enquanto a plataforma estiver sem `JUSBRASIL_API_KEY`, o tenant
                nao consegue operar com Jusbrasil mesmo com a preferencia ligada.
              </p>
            </div>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}

function IntegrationsTab({
  tenantId,
  integrations,
  selectedIntegration,
  onRefresh,
  onIntegrationChange,
}: {
  tenantId: string;
  integrations: TenantManagementData["integrations"];
  selectedIntegration: TenantAdminIntegrationKey;
  onRefresh: () => Promise<void>;
  onIntegrationChange: Dispatch<SetStateAction<TenantAdminIntegrationKey>>;
}) {
  const selectedOption =
    TENANT_ADMIN_INTEGRATION_OPTIONS.find(
      (option) => option.key === selectedIntegration,
    ) ?? TENANT_ADMIN_INTEGRATION_OPTIONS[0];
  const [isTestingClicksign, setIsTestingClicksign] = useState(false);
  const [isTestingAsaas, setIsTestingAsaas] = useState(false);
  const [testingChannel, setTestingChannel] = useState<
    "WHATSAPP" | "TELEGRAM" | "SMS" | null
  >(null);

  const handleTestClicksign = async () => {
    setIsTestingClicksign(true);

    try {
      const result = await testTenantClicksignConnectionAsSuperAdmin(tenantId);

      if (!result.success) {
        addToast({
          title: "Falha ao testar ClickSign",
          description: result.error || "Não foi possível validar a integração",
          color: "danger",
        });
        return;
      }

      addToast({
        title: "ClickSign validado",
        description: `Conexão confirmada via ${result.data?.source?.toLowerCase() ?? "tenant"}.`,
        color: "success",
      });
      await onRefresh();
    } finally {
      setIsTestingClicksign(false);
    }
  };

  const handleTestAsaas = async () => {
    setIsTestingAsaas(true);

    try {
      const result = await testTenantAsaasConnectionAsSuperAdmin(tenantId);

      if (!result.success) {
        addToast({
          title: "Falha ao testar Asaas",
          description: result.error || "Não foi possível validar a integração",
          color: "danger",
        });
        return;
      }

      addToast({
        title: "Asaas validado",
        description: "Conexão administrativa confirmada com sucesso.",
        color: "success",
      });
      await onRefresh();
    } finally {
      setIsTestingAsaas(false);
    }
  };

  const handleTestChannelProvider = async (
    channel: "WHATSAPP" | "TELEGRAM" | "SMS",
    label: string,
  ) => {
    setTestingChannel(channel);

    try {
      const result = await testTenantChannelProviderAsSuperAdmin(
        tenantId,
        channel,
      );

      if (!result.success) {
        addToast({
          title: `Falha ao validar ${label}`,
          description: result.error || "Não foi possível validar o provider",
          color: "danger",
        });
        return;
      }

      addToast({
        title: `${label} validado`,
        description:
          result.data?.validationMode === "MOCK"
            ? "Provider mock validado com sucesso."
            : "Configuração estrutural do provider validada.",
        color: result.data?.validationMode === "MOCK" ? "success" : "primary",
      });
      await onRefresh();
    } finally {
      setTestingChannel(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="border border-white/10 bg-background/70 backdrop-blur">
        <CardHeader className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <PlugZap className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Integrações do tenant
              </h2>
              <p className="text-sm text-default-400">
                Mesmo princípio aplicado ao tenant final: tudo que fala com
                serviços externos fica centralizado em um único domínio.
              </p>
            </div>
          </div>
        </CardHeader>
        <Divider className="border-white/10" />
        <CardBody className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="space-y-3">
            <Select
              label="Integração"
              selectedKeys={[selectedIntegration]}
              variant="bordered"
              onSelectionChange={(keys) => {
                if (keys === "all") return;
                const value = String(Array.from(keys)[0]);
                if (isTenantAdminIntegrationKey(value)) {
                  onIntegrationChange(value);
                }
              }}
            >
              {TENANT_ADMIN_INTEGRATION_OPTIONS.map((item) => (
                <SelectItem key={item.key} textValue={item.label}>
                  <div className="flex items-center gap-2">
                    <span className="text-default-500">{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                </SelectItem>
              ))}
            </Select>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-default-500">
                Integração selecionada
              </p>
              <div className="mt-2 flex items-center gap-2 text-foreground">
                <span className="text-primary">{selectedOption.icon}</span>
                <span className="text-base font-semibold">
                  {selectedOption.label}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-default-400">
                {selectedOption.description}
              </p>
            </div>
          </div>

          <div className="min-w-0">
            {selectedIntegration === "email" ? (
              <EmailTab tenantId={tenantId} />
            ) : null}

            {selectedIntegration === "clicksign" ? (
              <ClicksignAdminPanel
                isTesting={isTestingClicksign}
                summary={integrations.clicksign}
                onTestConnection={handleTestClicksign}
              />
            ) : null}

            {selectedIntegration === "certificates" ? (
              <CertificatesAdminPanel summary={integrations.certificates} />
            ) : null}

            {selectedIntegration === "asaas" ? (
              <AsaasAdminPanel
                isTesting={isTestingAsaas}
                summary={integrations.asaas}
                onTestConnection={handleTestAsaas}
              />
            ) : null}

            {selectedIntegration === "jusbrasil" ? (
              <JusbrasilAdminPanel summary={integrations.jusbrasil} />
            ) : null}

            {selectedIntegration === "whatsapp" ? (
              <ChannelProviderAdminPanel
                description="Leitura administrativa do provider omnichannel de WhatsApp do tenant, sem expor segredos."
                isTesting={testingChannel === "WHATSAPP"}
                summary={integrations.whatsapp}
                title="WhatsApp omnichannel"
                onTestConnection={() =>
                  handleTestChannelProvider("WHATSAPP", "WhatsApp")
                }
              />
            ) : null}

            {selectedIntegration === "telegram" ? (
              <ChannelProviderAdminPanel
                description="Leitura administrativa do Telegram do tenant, considerando override próprio ou fallback do bot global da plataforma."
                isTesting={testingChannel === "TELEGRAM"}
                summary={integrations.telegram}
                title="Telegram omnichannel"
                onTestConnection={() =>
                  handleTestChannelProvider("TELEGRAM", "Telegram")
                }
              />
            ) : null}

            {selectedIntegration === "sms" ? (
              <ChannelProviderAdminPanel
                description="Leitura administrativa do canal SMS de contingência, pronto para suporte operacional."
                isTesting={testingChannel === "SMS"}
                summary={integrations.sms}
                title="SMS transacional"
                onTestConnection={() => handleTestChannelProvider("SMS", "SMS")}
              />
            ) : null}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function EmailTab({ tenantId }: { tenantId: string }) {
  const { data, mutate, isLoading } = useSWR(
    ["tenant-email-creds", tenantId],
    async () => {
      const res = await listTenantEmailCredentials(tenantId, {
        includeApiKey: true,
      });

      if (!res.success) throw new Error("Falha ao carregar credenciais");

      return res.data.map((cred) => ({
        id: cred.id,
        type: cred.type,
        fromAddress: cred.fromAddress,
        apiKey: cred.apiKey,
        fromName: cred.fromName,
        createdAt: cred.createdAt.toISOString(),
        updatedAt: cred.updatedAt.toISOString(),
      }));
    },
  );

  const [formType, setFormType] = useState<"DEFAULT" | "ADMIN">("DEFAULT");
  const [formFromAddress, setFormFromAddress] = useState("");
  const [formFromName, setFormFromName] = useState("");
  const [formApiKey, setFormApiKey] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState<"DEFAULT" | "ADMIN" | null>(null);

  useEffect(() => {
    if (!data) return;
    const existing = data.find((c) => c.type === formType);

    setFormFromAddress(existing?.fromAddress ?? "");
    setFormFromName(existing?.fromName ?? "");
    setFormApiKey(existing?.apiKey ?? "");
    setIsPasswordVisible(false); // Resetar visibilidade ao mudar tipo
  }, [data, formType]);

  const handleTogglePasswordVisibility = async () => {
    if (!isPasswordVisible) {
      // Ao mostrar a API key, registrar auditoria
      await logApiKeyView(tenantId, formType);
    }
    setIsPasswordVisible(!isPasswordVisible);
  };

  const handleSave = async () => {
    if (!formFromAddress || !formApiKey) {
      addToast({
        title: "Campos obrigatórios",
        description: "Informe remetente e API key do Resend",
        color: "warning",
      });

      return;
    }
    setIsSaving(true);
    try {
      const res = await upsertTenantEmailCredential({
        tenantId,
        type: formType,
        fromAddress: formFromAddress,
        apiKey: formApiKey,
        fromName: formFromName || null,
      });

      if (!res.success) throw new Error("Falha ao salvar credenciais");
      addToast({
        title: "Credenciais salvas",
        description: `${formType} atualizado`,
        color: "success",
      });
      // Não limpar a senha após salvar - manter o valor do banco visível
      setIsPasswordVisible(false); // Ocultar novamente após salvar
      await mutate();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (type: "DEFAULT" | "ADMIN") => {
    await deleteTenantEmailCredential(tenantId, type);
    addToast({
      title: "Removido",
      description: `${type} excluído`,
      color: "success",
    });
    await mutate();
  };

  const handleTest = async (type: "DEFAULT" | "ADMIN") => {
    setIsTesting(type);
    try {
      const res = await testTenantEmailConnection(tenantId, type);

      if (res.success) {
        addToast({
          title: "✅ Conexão verificada com sucesso",
          description: `As credenciais ${type} foram validadas. O sistema pode enviar emails usando esta conta.`,
          color: "success",
          timeout: 6000,
        });
      } else {
        addToast({
          title: "❌ Falha na verificação",
          description: `Não foi possível validar as credenciais ${type}. Verifique remetente e API key do Resend.`,
          color: "danger",
          timeout: 8000,
        });
      }
    } catch (error) {
      addToast({
        title: "❌ Erro ao testar conexão",
        description:
          error instanceof Error
            ? error.message
            : "Erro desconhecido ao verificar conexão",
        color: "danger",
        timeout: 8000,
      });
    } finally {
      setIsTesting(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Card Informativo */}
      <Card className="border border-warning/20 bg-warning/5 backdrop-blur">
        <CardBody>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-warning/20 p-2">
              <Info className="h-5 w-5 text-warning" />
            </div>
            <div className="flex-1 space-y-2">
              <h3 className="text-sm font-semibold text-warning">
                📧 Configuração de Envio de Emails
              </h3>
              <p className="text-sm text-default-300">
                Esta aba configura as <strong>credenciais de envio</strong> que
                o sistema utiliza para{" "}
                <strong>enviar emails automaticamente</strong> (notificações,
                convites, faturas, lembretes, etc.). Os emails que você encontra
                em outras abas são apenas{" "}
                <strong>informações de contato</strong> e não são usados para
                envio.
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Card de Configuração */}
      <Card className="border border-white/10 bg-background/70 backdrop-blur">
        <CardHeader className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-default/20 p-2">
              <Server className="h-5 w-5 text-default-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Credenciais de Envio de Email
              </h2>
              <p className="text-sm text-default-400">
                Gerencie as credenciais DEFAULT/ADMIN usadas para envio de
                emails.
              </p>
            </div>
          </div>
        </CardHeader>
        <Divider className="border-white/10" />
        <CardBody className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Select
              description={
                formType === "DEFAULT"
                  ? "Uso geral (notificações, agenda, etc.)"
                  : "Comunicações administrativas"
              }
              label="Tipo de credencial"
              selectedKeys={formType ? [formType] : []}
              startContent={
                formType === "DEFAULT" ? (
                  <Bell className="h-4 w-4 text-primary" />
                ) : formType === "ADMIN" ? (
                  <Shield className="h-4 w-4 text-secondary" />
                ) : null
              }
              onSelectionChange={(keys) => {
                const value = Array.from(keys)[0] as string;

                if (typeof value === "string")
                  setFormType(value as "DEFAULT" | "ADMIN");
              }}
            >
              <SelectItem
                key="DEFAULT"
                description="Usado para envio de notificações automáticas (andamentos, lembretes, convites, faturas), emails da agenda e outras comunicações gerais do sistema."
                startContent={<Bell className="h-4 w-4 text-primary" />}
                textValue="DEFAULT - Uso Geral"
              >
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-primary" />
                  <span>DEFAULT</span>
                  <Chip color="primary" size="sm" variant="flat">
                    Uso Geral
                  </Chip>
                </div>
              </SelectItem>
              <SelectItem
                key="ADMIN"
                description="Usado exclusivamente para comunicações administrativas importantes, como boas-vindas de novos advogados, credenciais iniciais e notificações críticas do sistema."
                startContent={<Shield className="h-4 w-4 text-secondary" />}
                textValue="ADMIN - Administrativo"
              >
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-secondary" />
                  <span>ADMIN</span>
                  <Chip color="secondary" size="sm" variant="flat">
                    Administrativo
                  </Chip>
                </div>
              </SelectItem>
            </Select>
            <Input
              description="Nome que aparece como remetente"
              label="De (From Name)"
              placeholder="Ex.: Sandra Advocacia"
              startContent={<Mail className="h-4 w-4 text-primary" />}
              value={formFromName}
              onValueChange={setFormFromName}
            />
            <Input
              isRequired
              description="Endereço de remetente verificado no Resend"
              label="Remetente (From Address)"
              placeholder="noreply@seudominio.com"
              startContent={<Mail className="h-4 w-4 text-success" />}
              type="email"
              value={formFromAddress}
              onValueChange={setFormFromAddress}
            />
            <div className="md:col-span-3">
              <Input
                isRequired
                description="Chave de API do Resend para este tenant"
                endContent={
                  formApiKey ? (
                    <Button
                      isIconOnly
                      aria-label={
                        isPasswordVisible ? "Ocultar senha" : "Mostrar senha"
                      }
                      className="min-w-6 w-6 h-6 text-default-400 hover:text-default-600"
                      size="sm"
                      variant="light"
                      onPress={handleTogglePasswordVisibility}
                    >
                      {isPasswordVisible ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  ) : null
                }
                label="API Key do Resend"
                placeholder="re_xxxxxxxxxxxxxxxxxx"
                startContent={<KeyRound className="h-4 w-4 text-warning" />}
                type={isPasswordVisible ? "text" : "password"}
                value={formApiKey}
                onValueChange={setFormApiKey}
              />
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <Button
              color="primary"
              endContent={
                !isSaving ? <CheckCircle2 className="h-4 w-4" /> : null
              }
              isLoading={isSaving}
              radius="full"
              startContent={!isSaving ? <Plus className="h-4 w-4" /> : null}
              onPress={handleSave}
            >
              {isSaving ? "Salvando..." : "Salvar credenciais"}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Card de Credenciais Cadastradas */}
      <Card className="border border-success/20 bg-background/70 backdrop-blur">
        <CardHeader className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-success/20 p-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Credenciais cadastradas
              </h2>
              <p className="text-sm text-default-400">
                Visualize, teste e remova credenciais existentes.
              </p>
            </div>
          </div>
        </CardHeader>
        <Divider className="border-white/10" />
        <CardBody>
          {isLoading ? (
            <p className="text-sm text-default-400">Carregando...</p>
          ) : data && data.length ? (
            <Table removeWrapper aria-label="Credenciais de Envio">
              <TableHeader>
                <TableColumn>Tipo</TableColumn>
                <TableColumn>Email</TableColumn>
                <TableColumn>From Name</TableColumn>
                <TableColumn>Atualizado</TableColumn>
                <TableColumn className="text-right">Ações</TableColumn>
              </TableHeader>
              <TableBody>
                {data.map((c) => (
                  <TableRow key={c.type}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {c.type === "DEFAULT" ? (
                          <Chip
                            color="primary"
                            size="sm"
                            startContent={<Bell className="h-3 w-3" />}
                            variant="flat"
                          >
                            DEFAULT
                          </Chip>
                        ) : (
                          <Chip
                            color="secondary"
                            size="sm"
                            startContent={<Shield className="h-3 w-3" />}
                            variant="flat"
                          >
                            ADMIN
                          </Chip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-success" />
                        <span className="text-default-500">
                          {c.fromAddress}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-primary" />
                        <span className="text-default-500">
                          {c.fromName ?? "—"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-default-400" />
                        <span className="text-default-500">
                          {new Date(c.updatedAt).toLocaleString("pt-BR")}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Tooltip content="Valida a API key do Resend para este tipo de credencial sem disparar emails.">
                          <Button
                            color="success"
                            isLoading={isTesting === c.type}
                            radius="full"
                            size="sm"
                            startContent={
                              !isTesting ? <Zap className="h-4 w-4" /> : null
                            }
                            variant="solid"
                            onPress={() => handleTest(c.type)}
                          >
                            {isTesting === c.type ? "Testando..." : "Testar"}
                          </Button>
                        </Tooltip>
                        <Tooltip content="Remove permanentemente esta credencial. O sistema não poderá mais enviar emails usando este tipo.">
                          <Button
                            color="danger"
                            radius="full"
                            size="sm"
                            startContent={<XCircle className="h-4 w-4" />}
                            variant="bordered"
                            onPress={() => handleDelete(c.type)}
                          >
                            Remover
                          </Button>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-default-400">
              Nenhuma credencial cadastrada.
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function AuditTab() {
  return (
    <Card className="border border-white/10 bg-background/70 backdrop-blur">
      <CardBody className="space-y-3">
        <p className="text-sm text-default-400">
          Todas as ações executadas neste painel geram logs na auditoria de
          super admin.
        </p>
        <Chip
          color="primary"
          size="sm"
          startContent={<ShieldCheck className="h-3 w-3" />}
        >
          Segurança operacional ativa
        </Chip>
        <p className="text-xs text-default-500">
          Consulte o histórico completo em <strong>/admin/auditoria</strong>{" "}
          para verificar quem alterou dados estratégicos ou financeiros.
        </p>
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-4">
          <div className="flex items-center gap-3 text-primary">
            <Sparkles className="h-4 w-4" />
            <span className="text-sm font-semibold">Boas práticas</span>
          </div>
          <p className="mt-2 text-xs text-primary/80">
            Antes de bloquear um tenant, verifique pendências financeiras e
            comunique o contato principal para evitar disputas comerciais.
          </p>
        </div>
      </CardBody>
    </Card>
  );
}

function statusChipColor(status: TenantStatus) {
  switch (status) {
    case TenantStatus.ACTIVE:
      return "success";
    case TenantStatus.SUSPENDED:
      return "warning";
    case TenantStatus.CANCELLED:
      return "danger";
    default:
      return "default";
  }
}

function statusLabel(status: TenantStatus) {
  switch (status) {
    case TenantStatus.ACTIVE:
      return "Ativo";
    case TenantStatus.SUSPENDED:
      return "Suspenso";
    case TenantStatus.CANCELLED:
      return "Cancelado";
    default:
      return status;
  }
}

function invoiceStatusLabel(status: InvoiceStatus) {
  switch (status) {
    case InvoiceStatus.ABERTA:
      return "Aberta";
    case InvoiceStatus.RASCUNHO:
      return "Rascunho";
    case InvoiceStatus.PAGA:
      return "Paga";
    case InvoiceStatus.VENCIDA:
      return "Vencida";
    case InvoiceStatus.CANCELADA:
      return "Cancelada";
    default:
      return status;
  }
}

function roleLabel(role: UserRole) {
  const normalized = role.replace(/_/g, " ").toLowerCase();

  return normalized.replace(/\b\w/g, (l) => l.toUpperCase());
}

interface MetricCardProps {
  label: string;
  value: string;
  tone: "primary" | "success" | "secondary" | "default";
}

function MetricCard({ label, value, tone }: MetricCardProps) {
  const toneClass = {
    primary: "border-primary/30 bg-primary/10 text-primary",
    success: "border-success/30 bg-success/10 text-success",
    secondary: "border-secondary/30 bg-secondary/10 text-secondary",
    default: "border-white/10 bg-background/60 text-default-300",
  }[tone];

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <p className="text-xs uppercase tracking-wide opacity-80">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}

interface TabTitleProps {
  icon: React.ReactNode;
  label: string;
}

function TabTitle({ icon, label }: TabTitleProps) {
  return (
    <div className="flex items-center gap-2 text-sm font-medium">
      {icon}
      <span>{label}</span>
    </div>
  );
}

interface ColorInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function ColorInput({ label, value, onChange }: ColorInputProps) {
  return (
    <div className="flex items-end gap-2">
      <Input
        label={label}
        type="color"
        value={value || "#000000"}
        onValueChange={(val) => onChange(val)}
      />
      <Input
        aria-label={`${label} (hex)`}
        placeholder="#000000"
        value={value}
        onValueChange={onChange}
      />
    </div>
  );
}
