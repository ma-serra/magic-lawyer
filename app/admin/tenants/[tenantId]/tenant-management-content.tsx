"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction, } from "react";
import useSWR from "swr";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Divider } from "@heroui/divider";
import { Input } from "@heroui/input";

import { Skeleton, Tooltip, Select, SelectItem } from "@heroui/react";
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
  CreditCard,
  Users2,
  Palette,
  FileText,
  ShieldCheck,
  Sparkles,
  KeyRound,
  ToggleLeft,
  Edit,
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
} from "lucide-react";

import {
  getTenantManagementData,
  updateTenantDetails,
  updateTenantStatus,
  updateTenantSubscription,
  updateTenantBranding,
  updateTenantUser,
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

export function TenantManagementContent({
  tenantId,
  initialData,
}: TenantManagementContentProps) {
  const { data, mutate, isValidating } = useSWR<TenantManagementData>(
    ["tenant-management", tenantId],
    () => fetchTenant("tenant-management", tenantId),
    {
      fallbackData: initialData,
      revalidateOnFocus: false,
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
  const [tenantStatusState, setTenantStatusState] = useState<TenantStatus>(
    tenantData.tenant.status,
  );

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

  return (
    <div className="flex flex-col gap-6">
      <Card className="border border-primary/20 bg-primary/5">
        <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-primary" />
              <p className="text-lg font-semibold text-primary">
                {tenantData.tenant.name}
              </p>
              <Chip
                color={statusChipColor(tenantStatusState)}
                size="sm"
                variant="flat"
              >
                {statusLabel(tenantStatusState)}
              </Chip>
            </div>
            <p className="text-xs text-primary/80">
              Slug: {tenantData.tenant.slug}
            </p>
            <div className="flex flex-wrap gap-2 text-xs text-primary/70">
              {tenantData.tenant.domain ? (
                <span>Domínio: {tenantData.tenant.domain}</span>
              ) : null}
              <span>Timezone: {tenantData.tenant.timezone}</span>
              <span>Criado em: {formatDate(tenantData.tenant.createdAt)}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-primary/70">
            <Chip color="secondary" size="sm" variant="flat">
              Plano atual: {tenantData.subscription.planName ?? "Custom"}
            </Chip>
            <Chip color="secondary" size="sm" variant="flat">
              Receita 90d: {formatCurrency(tenantData.metrics.revenue90d)}
            </Chip>
          </div>
        </CardBody>
      </Card>

      <div className="w-full">
        <Tabs
          aria-label="Painel de gerenciamento do tenant"
          classNames={{
            base: "w-full",
            tabList: "gap-2 justify-center w-full",
            tab: "min-w-[180px] px-8 py-4 text-base font-medium",
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
            key="email"
            title={
              <TabTitle
                icon={<Mail className="h-4 w-4" />}
                label="Envio de Email"
              />
            }
          >
            <EmailTab tenantId={tenantId} />
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
    </div>
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
          <h2 className="text-lg font-semibold text-white">
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
              placeholder="ex.: escritorio.minhaempresa.com"
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
                <SelectItem key={tz} textValue={tz}>{tz}</SelectItem>
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
          <h2 className="text-lg font-semibold text-white">Status do tenant</h2>
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
                    <p className="text-sm font-semibold text-white">
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
            <h2 className="text-lg font-semibold text-white">
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
                <SelectItem key={option.value} textValue={option.label}>{option.label}</SelectItem>
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
            <h2 className="text-lg font-semibold text-white">Indicadores</h2>
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
            <h2 className="text-lg font-semibold text-white">
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
                  <div className="flex items-center justify-between text-sm font-medium text-white">
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
  onOpenUserModal: (user?: any) => void;
}

function UsersTab({
  users,
  userRoleOptions,
  pendingUserId,
  isUpdatingUser,
  onToggleActive,
  onResetPassword,
  onOpenUserModal,
}: UsersTabProps) {
  return (
    <Card className="border border-white/10 bg-background/70 backdrop-blur">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">
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
      <CardBody>
        {users.length ? (
          <Table removeWrapper aria-label="Usuários do tenant">
            <TableHeader>
              <TableColumn>Nome Completo</TableColumn>
              <TableColumn>Email</TableColumn>
              <TableColumn>Função</TableColumn>
              <TableColumn>Status</TableColumn>
              <TableColumn className="text-right">Ações</TableColumn>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const isPending = pendingUserId === user.id && isUpdatingUser;

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
                            onPress={() => onToggleActive(user.id, user.active)}
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
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
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
        <h2 className="text-lg font-semibold text-white">Identidade visual</h2>
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
              <h2 className="text-lg font-semibold text-white">
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
              <h2 className="text-lg font-semibold text-white">
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
