"use client";

import type {
  PacoteCheckoutPayment,
  TenantPacoteCatalogItem,
  TenantPacoteSubscriptionItem,
} from "@/app/actions/pacotesJuiz";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import useSWR from "swr";
import QRCodeLib from "qrcode";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
} from "@heroui/react";
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Clock3,
  Copy,
  CreditCard,
  Crown,
  ExternalLink,
  RefreshCcw,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

import {
  getAssinaturasPacoteJuizTenant,
  getCatalogoPacotesJuizTenant,
  getStatusCheckoutPacoteJuiz,
  iniciarCheckoutPacoteJuiz,
  processarPagamentoCartaoPacoteJuiz,
  simularPagamentoPacoteJuizDev,
} from "@/app/actions/pacotesJuiz";
import { PacoteJuizCreditCardForm } from "@/components/pacote-juiz-credit-card-form";
import {
  PeopleEmptyState,
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";
import { toast } from "@/lib/toast";

type BillingType = "PIX" | "BOLETO" | "CREDIT_CARD";

type ActiveCheckoutState = {
  checkoutId: string;
  pacoteId: string;
  pacoteNome: string;
  amount: number;
  billingType: BillingType;
  status: string;
  payment: PacoteCheckoutPayment;
};

const BILLING_OPTIONS: Array<{
  key: BillingType;
  label: string;
  description: string;
  icon: ReactNode;
}> = [
  {
    key: "PIX",
    label: "PIX",
    description: "Liberação rápida com QR Code ou código copia e cola.",
    icon: <Smartphone className="h-4 w-4" />,
  },
  {
    key: "BOLETO",
    label: "Boleto",
    description: "Cobrança formal com vencimento e histórico rastreável.",
    icon: <Banknote className="h-4 w-4" />,
  },
  {
    key: "CREDIT_CARD",
    label: "Cartão",
    description: "Pagamento imediato no fluxo interno da plataforma.",
    icon: <CreditCard className="h-4 w-4" />,
  },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(value?: Date | string | null) {
  if (!value) return "Permanente";

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Nao definido";

  return parsed.toLocaleDateString("pt-BR");
}

function resolveCheckoutStatusLabel(status: string) {
  const normalized = status.toUpperCase();

  switch (normalized) {
    case "ATIVA":
    case "PAGA":
    case "CONFIRMED":
    case "RECEIVED":
      return "Pago";
    case "INADIMPLENTE":
    case "OVERDUE":
    case "VENCIDA":
      return "Inadimplente";
    case "ABERTA":
    case "PENDENTE":
    case "PENDING":
      return "Aguardando pagamento";
    case "PROCESSING":
    case "PROCESSANDO":
      return "Processando";
    case "CANCELADA":
    case "CANCELLED":
    case "CANCELED":
      return "Cancelado";
    default:
      return status;
  }
}

function resolveCheckoutStatusColor(status: string) {
  const normalized = status.toUpperCase();

  switch (normalized) {
    case "ATIVA":
    case "PAGA":
    case "CONFIRMED":
    case "RECEIVED":
      return "success" as const;
    case "INADIMPLENTE":
    case "OVERDUE":
    case "VENCIDA":
      return "danger" as const;
    case "ABERTA":
    case "PENDENTE":
    case "PENDING":
    case "PROCESSING":
    case "PROCESSANDO":
      return "warning" as const;
    case "CANCELADA":
    case "CANCELLED":
    case "CANCELED":
      return "default" as const;
    default:
      return "secondary" as const;
  }
}

function isCheckoutResolved(status: string) {
  const normalized = status.toUpperCase();
  return ["ATIVA", "PAGA", "CONFIRMED", "RECEIVED"].includes(normalized);
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex min-h-56 items-center justify-center">
      <Spinner label={label} />
    </div>
  );
}

export function PacotesJuizStoreContent() {
  const [selectedPackage, setSelectedPackage] =
    useState<TenantPacoteCatalogItem | null>(null);
  const [selectedBillingType, setSelectedBillingType] =
    useState<BillingType>("PIX");
  const [activeCheckout, setActiveCheckout] = useState<ActiveCheckoutState | null>(
    null,
  );
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [isGeneratingCheckout, setIsGeneratingCheckout] = useState(false);
  const [isProcessingCard, setIsProcessingCard] = useState(false);
  const [isSimulatingPayment, setIsSimulatingPayment] = useState(false);
  const [copiedPix, setCopiedPix] = useState(false);
  const [pixQrCodeUrl, setPixQrCodeUrl] = useState("");

  const {
    data: catalogResponse,
    error: catalogError,
    isLoading: isCatalogLoading,
    mutate: mutateCatalog,
  } = useSWR("tenant-pacotes-catalogo", getCatalogoPacotesJuizTenant, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
  });
  const {
    data: subscriptionsResponse,
    error: subscriptionsError,
    isLoading: isSubscriptionsLoading,
    mutate: mutateSubscriptions,
  } = useSWR("tenant-pacotes-assinaturas", getAssinaturasPacoteJuizTenant, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
  });

  const {
    data: checkoutStatusResponse,
    mutate: mutateCheckoutStatus,
  } = useSWR(
    activeCheckout?.checkoutId ? ["tenant-pacote-checkout", activeCheckout.checkoutId] : null,
    ([, checkoutId]) => getStatusCheckoutPacoteJuiz(checkoutId),
    {
      refreshInterval:
        activeCheckout && !isCheckoutResolved(activeCheckout.status) ? 5000 : 0,
      revalidateOnFocus: !activeCheckout || !isCheckoutResolved(activeCheckout.status),
      revalidateOnReconnect: true,
    },
  );

  const catalog = (catalogResponse?.data ?? []) as TenantPacoteCatalogItem[];
  const subscriptions =
    (subscriptionsResponse?.data ?? []) as TenantPacoteSubscriptionItem[];
  const activeSubscriptions = subscriptions.filter((item) =>
    item.status === "ATIVA",
  );
  const pendingSubscriptions = subscriptions.filter((item) =>
    ["PENDENTE", "INADIMPLENTE"].includes(item.status),
  );

  const unlockedAuthorities = activeSubscriptions.reduce(
    (total, item) => total + item.pacote.autoridadeCount,
    0,
  );

  useEffect(() => {
    if (!checkoutStatusResponse?.success || !checkoutStatusResponse.data) {
      return;
    }

    setActiveCheckout((current) => {
      if (!current || current.checkoutId !== checkoutStatusResponse.data?.checkoutId) {
        return current;
      }

      return {
        ...current,
        status: checkoutStatusResponse.data.status,
        payment: checkoutStatusResponse.data.payment,
      };
    });
  }, [checkoutStatusResponse]);

  useEffect(() => {
    const payload = activeCheckout?.payment.pixCopyPaste;

    if (!payload) {
      setPixQrCodeUrl("");
      return;
    }

    let cancelled = false;
    QRCodeLib.toDataURL(payload, {
      width: 220,
      margin: 1,
      color: {
        dark: "#111111",
        light: "#FFFFFF",
      },
    })
      .then((value) => {
        if (!cancelled) {
          setPixQrCodeUrl(value);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPixQrCodeUrl("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeCheckout?.payment.pixCopyPaste]);

  useEffect(() => {
    if (!activeCheckout || !isCheckoutResolved(activeCheckout.status)) {
      return;
    }

    mutateCatalog();
    mutateSubscriptions();
  }, [activeCheckout, mutateCatalog, mutateSubscriptions]);

  const errors = [catalogError, subscriptionsError].filter(Boolean) as Error[];

  const openCheckoutForPackage = (pacote: TenantPacoteCatalogItem) => {
    setSelectedPackage(pacote);
    setSelectedBillingType("PIX");
    setActiveCheckout(
      pacote.assinaturaAtual
        ? {
            checkoutId: pacote.assinaturaAtual.id,
            pacoteId: pacote.id,
            pacoteNome: pacote.nome,
            amount: pacote.assinaturaAtual.precoPago,
            billingType:
              (pacote.assinaturaAtual.formaPagamento as BillingType | null) ||
              "PIX",
            status: pacote.assinaturaAtual.status,
            payment:
              pacote.assinaturaAtual.payment || {
                asaasPaymentId: null,
                billingType: "PIX",
                status: pacote.assinaturaAtual.status,
                value: pacote.assinaturaAtual.precoPago,
                dueDate: null,
                invoiceUrl: null,
                bankSlipUrl: null,
                transactionReceiptUrl: null,
                pixCopyPaste: null,
                pixQrCodeUrl: null,
                isMock: false,
              },
          }
        : null,
    );
    setIsCheckoutModalOpen(true);
  };

  const handleStartCheckout = async () => {
    if (!selectedPackage) return;

    setIsGeneratingCheckout(true);
    try {
      const result = await iniciarCheckoutPacoteJuiz({
        pacoteId: selectedPackage.id,
        billingType: selectedBillingType,
      });

      if (!result.success || !result.data) {
        toast.error(result.error || "Não foi possível iniciar a cobrança");
        return;
      }

      setActiveCheckout({
        checkoutId: result.data.checkoutId,
        pacoteId: selectedPackage.id,
        pacoteNome: selectedPackage.nome,
        amount: result.data.payment.value,
        billingType:
          (result.data.payment.billingType as BillingType | null) ||
          selectedBillingType,
        status: result.data.status,
        payment: result.data.payment,
      });

      toast.success("Cobrança preparada. Complete o pagamento para liberar o pacote.");
      mutateCatalog();
      mutateSubscriptions();
    } catch (error) {
      toast.error("Erro ao iniciar checkout do pacote");
    } finally {
      setIsGeneratingCheckout(false);
    }
  };

  const handleProcessCardPayment = async (payload: {
    cardNumber: string;
    cardName: string;
    expiryMonth: string;
    expiryYear: string;
    cvv: string;
  }) => {
    if (!activeCheckout) return;

    setIsProcessingCard(true);
    try {
      const result = await processarPagamentoCartaoPacoteJuiz({
        checkoutId: activeCheckout.checkoutId,
        paymentData: payload,
      });

      if (!result.success || !result.data) {
        toast.error(result.error || "Pagamento não aprovado");
        return;
      }

      setActiveCheckout((current) =>
        current
          ? {
              ...current,
              status: result.data!.status,
              payment: result.data!.payment,
            }
          : current,
      );

      if (isCheckoutResolved(result.data.status)) {
        toast.success("Pacote liberado com sucesso para o escritório.");
      } else {
        toast.info("Cobrança criada. Aguarde a confirmação automática.");
      }
    } catch (error) {
      toast.error("Erro ao processar pagamento no cartão");
    } finally {
      setIsProcessingCard(false);
    }
  };

  const handleSimulatePayment = async () => {
    if (!activeCheckout) return;

    setIsSimulatingPayment(true);
    try {
      const result = await simularPagamentoPacoteJuizDev(activeCheckout.checkoutId);

      if (!result.success || !result.data) {
        toast.error(result.error || "Não foi possível simular o pagamento");
        return;
      }

      setActiveCheckout((current) =>
        current
          ? {
              ...current,
              status: result.data!.status,
              payment: result.data!.payment,
            }
          : current,
      );

      toast.success("Pagamento simulado. Pacote liberado para o escritório.");
    } catch (error) {
      toast.error("Erro ao simular pagamento");
    } finally {
      setIsSimulatingPayment(false);
    }
  };

  const handleCopyPix = async () => {
    if (!activeCheckout?.payment.pixCopyPaste) return;

    try {
      await navigator.clipboard.writeText(activeCheckout.payment.pixCopyPaste);
      setCopiedPix(true);
      toast.success("Código PIX copiado.");
      window.setTimeout(() => setCopiedPix(false), 2000);
    } catch {
      toast.error("Não foi possível copiar o código PIX.");
    }
  };

  const headerActions = (
    <div className="flex flex-wrap gap-2">
      <Button
        as={Link}
        href="/juizes"
        radius="full"
        size="sm"
        startContent={<ArrowLeft className="h-4 w-4" />}
        variant="flat"
      >
        Voltar para autoridades
      </Button>
      <Button
        as={Link}
        href="/configuracoes?tab=billing"
        radius="full"
        size="sm"
        startContent={<ShieldCheck className="h-4 w-4" />}
        variant="bordered"
      >
        Ver billing da conta
      </Button>
    </div>
  );

  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-3 py-8 sm:px-6">
      <PeoplePageHeader
        tag="Monetização premium"
        title="Loja interna de autoridades"
        description="Compre pacotes de juízes e promotores sem sair do sistema. A liberação acontece por escritório, com cobrança rastreável e status de ativação visível no próprio painel."
        actions={headerActions}
      />

      {errors.length > 0 ? (
        <PeoplePanel
          title="Falha parcial no catálogo"
          description="Algumas fontes não responderam. O restante da experiência continua disponível."
        >
          <div className="space-y-2 rounded-2xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
            {errors.map((error, index) => (
              <div key={`${error.message}-${index}`}>{error.message}</div>
            ))}
          </div>
        </PeoplePanel>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PeopleMetricCard
          label="Pacotes ativos"
          value={isSubscriptionsLoading ? "..." : activeSubscriptions.length}
          helper="Assinaturas premium liberadas hoje"
          icon={<Crown className="h-4 w-4" />}
          tone="warning"
        />
        <PeopleMetricCard
          label="Cobranças pendentes"
          value={isSubscriptionsLoading ? "..." : pendingSubscriptions.length}
          helper="Pacotes aguardando pagamento ou regularização"
          icon={<Clock3 className="h-4 w-4" />}
          tone="primary"
        />
        <PeopleMetricCard
          label="Autoridades liberadas"
          value={isSubscriptionsLoading ? "..." : unlockedAuthorities}
          helper="Total de autoridades destravadas por pacote"
          icon={<ShieldCheck className="h-4 w-4" />}
          tone="success"
        />
        <PeopleMetricCard
          label="Oferta disponível"
          value={isCatalogLoading ? "..." : catalog.length}
          helper="Pacotes públicos prontos para compra"
          icon={<CreditCard className="h-4 w-4" />}
          tone="secondary"
        />
      </div>

      <PeoplePanel
        title="Pacotes contratados"
        description="Leitura operacional do que já está ativo no escritório e do que ainda depende de pagamento."
      >
        {isSubscriptionsLoading && !subscriptionsResponse ? (
          <LoadingBlock label="Carregando assinaturas..." />
        ) : subscriptions.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {subscriptions.map((assinatura) => (
              <Card
                key={assinatura.id}
                data-testid="tenant-pacote-subscription-card"
                className="border border-white/10 bg-background/40"
              >
                <CardHeader className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-foreground">
                      {assinatura.pacote.nome}
                    </p>
                    <p className="mt-1 text-sm text-default-400">
                      {assinatura.pacote.descricao || "Pacote premium do escritório."}
                    </p>
                  </div>
                  <Chip
                    color={resolveCheckoutStatusColor(assinatura.status)}
                    size="sm"
                    variant="flat"
                  >
                    {resolveCheckoutStatusLabel(assinatura.status)}
                  </Chip>
                </CardHeader>
                <CardBody className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-background/50 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-default-500">
                        Valor pago
                      </p>
                      <p className="mt-2 text-sm font-semibold text-foreground">
                        {formatCurrency(assinatura.precoPago)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-background/50 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-default-500">
                        Autoridades
                      </p>
                      <p className="mt-2 text-sm font-semibold text-foreground">
                        {assinatura.pacote.autoridadeCount}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs text-default-500">
                    <Chip size="sm" variant="bordered">
                      Inicio: {formatDate(assinatura.dataInicio)}
                    </Chip>
                    <Chip size="sm" variant="bordered">
                      Fim: {formatDate(assinatura.dataFim)}
                    </Chip>
                    {assinatura.formaPagamento ? (
                      <Chip size="sm" variant="bordered">
                        {assinatura.formaPagamento}
                      </Chip>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {!isCheckoutResolved(assinatura.status) ? (
                      <Button
                        color="primary"
                        radius="full"
                        size="sm"
                        onPress={() => {
                          const pacote = catalog.find(
                            (item) => item.id === assinatura.pacote.id,
                          );
                          if (pacote) {
                            openCheckoutForPackage(pacote);
                          }
                        }}
                      >
                        Continuar pagamento
                      </Button>
                    ) : null}

                    {assinatura.payment.invoiceUrl ? (
                      <Button
                        as="a"
                        href={assinatura.payment.invoiceUrl}
                        radius="full"
                        rel="noopener noreferrer"
                        size="sm"
                        startContent={<ExternalLink className="h-3.5 w-3.5" />}
                        target="_blank"
                        variant="bordered"
                      >
                        Ver cobrança
                      </Button>
                    ) : null}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        ) : (
          <PeopleEmptyState
            title="Nenhum pacote contratado"
            description="Quando o escritório comprar seu primeiro pacote premium, ele aparecerá aqui com status e histórico de cobrança."
            icon={<Crown className="h-6 w-6" />}
          />
        )}
      </PeoplePanel>

      <PeoplePanel
        title="Catálogo premium"
        description="Ofertas internas para ampliar a inteligência do escritório sem abrir nova negociação externa."
      >
        {isCatalogLoading && !catalogResponse ? (
          <LoadingBlock label="Carregando catálogo..." />
        ) : catalog.length > 0 ? (
          <div className="grid gap-4 xl:grid-cols-3">
            {catalog.map((pacote) => {
              const active = pacote.assinaturaAtual?.status === "ATIVA";
              const pending = pacote.assinaturaAtual?.status === "PENDENTE";

              return (
                <Card
                  key={pacote.id}
                  data-testid="tenant-pacote-card"
                  className="border border-white/10 bg-background/40"
                >
                  <CardHeader className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-foreground">
                        {pacote.nome}
                      </p>
                      <p className="mt-1 text-sm text-default-400">
                        {pacote.descricao || "Pacote premium sem descrição comercial."}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Chip
                        color={resolveCheckoutStatusColor(
                          pacote.assinaturaAtual?.status || pacote.status,
                        )}
                        size="sm"
                        variant="flat"
                      >
                        {active
                          ? "Ativo"
                          : pending
                            ? "Pendente"
                            : pacote.status === "PROMOCIONAL"
                              ? "Promocional"
                              : "Disponível"}
                      </Chip>
                      <p className="text-sm font-semibold text-primary">
                        {formatCurrency(pacote.preco)}
                      </p>
                    </div>
                  </CardHeader>
                  <CardBody className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-background/50 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-default-500">
                          Cobertura
                        </p>
                        <p className="mt-2 text-sm font-semibold text-foreground">
                          {pacote._count?.juizes ?? pacote.autoridadePreview.length} autoridade(s)
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-background/50 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-default-500">
                          Vigência
                        </p>
                        <p className="mt-2 text-sm font-semibold text-foreground">
                          {pacote.duracaoDias
                            ? `${pacote.duracaoDias} dias`
                            : "Acesso permanente"}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-default-500">
                        Autoridades incluídas
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {pacote.autoridadePreview.map((autoridade) => (
                          <Chip key={autoridade.id} size="sm" variant="bordered">
                            {autoridade.nome}
                          </Chip>
                        ))}
                      </div>
                    </div>

                    <Divider className="border-white/10" />

                    {active ? (
                      <div className="rounded-2xl border border-success/20 bg-success/5 p-3 text-sm text-success-600">
                        Este pacote já está ativo para o escritório.
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          color="primary"
                          radius="full"
                          size="sm"
                          onPress={() => openCheckoutForPackage(pacote)}
                        >
                          {pending ? "Retomar compra" : "Comprar pacote"}
                        </Button>
                        {pacote.assinaturaAtual?.payment?.invoiceUrl ? (
                          <Button
                            as="a"
                            href={pacote.assinaturaAtual.payment.invoiceUrl}
                            radius="full"
                            rel="noopener noreferrer"
                            size="sm"
                            target="_blank"
                            variant="bordered"
                          >
                            Ver cobrança
                          </Button>
                        ) : null}
                      </div>
                    )}
                  </CardBody>
                </Card>
              );
            })}
          </div>
        ) : (
          <PeopleEmptyState
            title="Nenhum pacote público liberado"
            description="Quando o catálogo premium estiver montado no painel global, as ofertas aparecerão aqui para compra interna."
            icon={<CreditCard className="h-6 w-6" />}
          />
        )}
      </PeoplePanel>

      <Modal
        isOpen={isCheckoutModalOpen}
        scrollBehavior="inside"
        size="3xl"
        onOpenChange={setIsCheckoutModalOpen}
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <p className="text-base font-semibold">
              {selectedPackage?.nome || "Checkout do pacote"}
            </p>
            <p className="text-sm text-default-500">
              Gere a cobrança, acompanhe o status e libere o pacote para o escritório.
            </p>
          </ModalHeader>
          <ModalBody className="space-y-5">
            {selectedPackage ? (
              <>
                <Card className="border border-white/10 bg-background/50">
                  <CardBody className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold text-foreground">
                          {selectedPackage.nome}
                        </p>
                        <p className="mt-1 text-sm text-default-400">
                          {selectedPackage.descricao || "Pacote premium do escritório."}
                        </p>
                      </div>
                      <p className="text-lg font-semibold text-primary">
                        {formatCurrency(selectedPackage.preco)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-default-500">
                      <Chip size="sm" variant="bordered">
                        {selectedPackage._count?.juizes ?? selectedPackage.autoridadePreview.length} autoridade(s)
                      </Chip>
                      <Chip size="sm" variant="bordered">
                        {selectedPackage.duracaoDias
                          ? `${selectedPackage.duracaoDias} dias`
                          : "Acesso permanente"}
                      </Chip>
                    </div>
                  </CardBody>
                </Card>

                {!activeCheckout ? (
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Escolha como o escritório vai pagar
                      </p>
                      <p className="mt-1 text-sm text-default-500">
                        O pacote será liberado assim que a cobrança for confirmada.
                      </p>
                    </div>
                    <div className="grid gap-3">
                      {BILLING_OPTIONS.map((option) => (
                        <button
                          key={option.key}
                          className={`rounded-2xl border p-4 text-left transition ${
                            selectedBillingType === option.key
                              ? "border-primary bg-primary/10"
                              : "border-white/10 bg-background/50"
                          }`}
                          type="button"
                          onClick={() => setSelectedBillingType(option.key)}
                        >
                          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            {option.icon}
                            {option.label}
                          </div>
                          <p className="mt-1 text-sm text-default-500">
                            {option.description}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip
                        color={resolveCheckoutStatusColor(activeCheckout.status)}
                        variant="flat"
                      >
                        {resolveCheckoutStatusLabel(activeCheckout.status)}
                      </Chip>
                      <Chip size="sm" variant="bordered">
                        {activeCheckout.billingType}
                      </Chip>
                      {activeCheckout.payment.isMock ? (
                        <Chip color="warning" size="sm" variant="flat">
                          Ambiente de desenvolvimento
                        </Chip>
                      ) : null}
                    </div>

                    {activeCheckout.billingType === "PIX" ? (
                      <Card className="border border-white/10 bg-background/50">
                        <CardBody className="space-y-4">
                          <div className="text-center">
                            <p className="text-sm font-semibold text-foreground">
                              QR Code PIX
                            </p>
                            <p className="mt-1 text-sm text-default-500">
                              Escaneie ou copie o código abaixo para concluir a compra.
                            </p>
                          </div>

                          {pixQrCodeUrl ? (
                            <div className="mx-auto rounded-2xl bg-white p-3">
                              <img
                                alt="QR Code do pacote"
                                className="h-48 w-48"
                                src={pixQrCodeUrl}
                              />
                            </div>
                          ) : null}

                          <div className="rounded-2xl border border-white/10 bg-background/80 p-3 text-xs text-default-500">
                            {activeCheckout.payment.pixCopyPaste ||
                              "Codigo PIX ainda nao disponivel."}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button
                              color="primary"
                              isDisabled={!activeCheckout.payment.pixCopyPaste}
                              radius="full"
                              size="sm"
                              startContent={<Copy className="h-3.5 w-3.5" />}
                              onPress={handleCopyPix}
                            >
                              {copiedPix ? "Copiado" : "Copiar PIX"}
                            </Button>
                            <Button
                              radius="full"
                              size="sm"
                              startContent={<RefreshCcw className="h-3.5 w-3.5" />}
                              variant="bordered"
                              onPress={() => mutateCheckoutStatus()}
                            >
                              Atualizar status
                            </Button>
                          </div>
                        </CardBody>
                      </Card>
                    ) : null}

                    {activeCheckout.billingType === "BOLETO" ? (
                      <Card className="border border-white/10 bg-background/50">
                        <CardBody className="space-y-4">
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              Boleto gerado
                            </p>
                            <p className="mt-1 text-sm text-default-500">
                              Vencimento previsto: {formatDate(activeCheckout.payment.dueDate)}
                            </p>
                          </div>
                          {activeCheckout.payment.invoiceUrl ? (
                            <Button
                              as="a"
                              color="primary"
                              href={activeCheckout.payment.invoiceUrl}
                              radius="full"
                              rel="noopener noreferrer"
                              startContent={<ExternalLink className="h-3.5 w-3.5" />}
                              target="_blank"
                            >
                              Abrir cobrança
                            </Button>
                          ) : (
                            <div className="rounded-2xl border border-warning/20 bg-warning/5 p-3 text-sm text-warning-600">
                              O boleto foi preparado, mas este ambiente não recebeu um link externo.
                            </div>
                          )}
                        </CardBody>
                      </Card>
                    ) : null}

                    {activeCheckout.billingType === "CREDIT_CARD" &&
                    !isCheckoutResolved(activeCheckout.status) ? (
                      <PacoteJuizCreditCardForm
                        amount={activeCheckout.amount}
                        isLoading={isProcessingCard}
                        onSubmit={handleProcessCardPayment}
                      />
                    ) : null}

                    {isCheckoutResolved(activeCheckout.status) ? (
                      <div className="rounded-2xl border border-success/20 bg-success/5 p-4 text-sm text-success-700">
                        <div className="flex items-center gap-2 font-semibold">
                          <CheckCircle2 className="h-4 w-4" />
                          Pacote liberado para o escritório
                        </div>
                        <p className="mt-1">
                          A compra foi confirmada e as autoridades deste pacote já podem ser usadas no módulo.
                        </p>
                      </div>
                    ) : null}
                  </div>
                )}
              </>
            ) : null}
          </ModalBody>
          <ModalFooter className="flex flex-wrap justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {activeCheckout && !isCheckoutResolved(activeCheckout.status) ? (
                <Button
                  color="warning"
                  isLoading={isSimulatingPayment}
                  radius="full"
                  size="sm"
                  variant="flat"
                  onPress={handleSimulatePayment}
                >
                  Simular confirmação
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {!activeCheckout ? (
                <Button
                  color="primary"
                  isLoading={isGeneratingCheckout}
                  radius="full"
                  size="sm"
                  onPress={handleStartCheckout}
                >
                  Gerar cobrança
                </Button>
              ) : null}
              <Button
                radius="full"
                size="sm"
                variant="light"
                onPress={() => {
                  setIsCheckoutModalOpen(false);
                  setSelectedPackage(null);
                  setActiveCheckout(null);
                }}
              >
                Fechar
              </Button>
            </div>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </section>
  );
}
