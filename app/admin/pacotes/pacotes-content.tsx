"use client";

import type { JuizSerializado } from "@/app/actions/juizes";

import useSWR from "swr";
import NextLink from "next/link";
import { Button } from "@heroui/button";
import { Chip, Spinner } from "@heroui/react";
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/table";
import {
  BadgeDollarSign,
  Building2,
  Crown,
  Gem,
  Layers3,
  Scale,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";

import {
  getAssinaturas,
  getEstatisticasPlanos,
  getPlanos,
} from "@/app/actions/planos";
import {
  getEstatisticasPacotesJuiz,
  getPacotesJuiz,
  type PacoteJuiz,
} from "@/app/actions/pacotesJuiz";
import { getJuizesAdmin } from "@/app/actions/juizes";
import {
  PeopleEmptyState,
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";

type PlanoCatalogItem = {
  id: string;
  nome: string;
  descricao?: string | null;
  valorMensal?: number | null;
  valorAnual?: number | null;
  moeda: string;
  limiteUsuarios?: number | null;
  limiteProcessos?: number | null;
  ativo: boolean;
};

type PlanoStats = {
  totalPlanos: number;
  planosAtivos: number;
  totalAssinaturas: number;
  assinaturasAtivas: number;
  faturamentoMensal: number;
};

type PacoteStats = {
  totalPacotes: number;
  pacotesAtivos: number;
  totalAssinaturas: number;
  assinaturasAtivas: number;
  faturamentoMensal: number;
};

type AssinaturaResumo = {
  id: string;
  status: string;
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  plano: {
    id: string;
    nome: string;
    valorMensal?: number | null;
    valorAnual?: number | null;
  } | null;
  renovaEm?: string | Date | null;
  trialEndsAt?: string | Date | null;
  createdAt: string | Date;
};

function formatCurrency(value: number | null | undefined, currency = "BRL") {
  if (value == null) return "Sob consulta";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Nao definido";
  return new Date(value).toLocaleDateString("pt-BR");
}

function getStatusColor(status: string) {
  switch (status) {
    case "ATIVA":
    case "ATIVO":
      return "success" as const;
    case "TRIAL":
    case "PROMOCIONAL":
      return "primary" as const;
    case "INATIVO":
    case "SUSPENSA":
      return "warning" as const;
    case "INADIMPLENTE":
    case "CANCELADA":
      return "danger" as const;
    default:
      return "default" as const;
  }
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex min-h-56 items-center justify-center">
      <Spinner label={label} />
    </div>
  );
}

export function PacotesContent() {
  const {
    data: planosResponse,
    error: planosError,
    isLoading: loadingPlanos,
  } = useSWR("admin-planos-catalogo", getPlanos, { revalidateOnFocus: true });
  const {
    data: pacotesResponse,
    error: pacotesError,
    isLoading: loadingPacotes,
  } = useSWR("admin-pacotes-juiz-catalogo", getPacotesJuiz, {
    revalidateOnFocus: true,
  });
  const {
    data: statsResponse,
    error: statsError,
    isLoading: loadingStats,
  } = useSWR("admin-planos-estatisticas", getEstatisticasPlanos, {
    revalidateOnFocus: true,
  });
  const {
    data: statsPacotesResponse,
    error: statsPacotesError,
    isLoading: loadingStatsPacotes,
  } = useSWR("admin-pacotes-estatisticas", getEstatisticasPacotesJuiz, {
    revalidateOnFocus: true,
  });
  const {
    data: assinaturasResponse,
    error: assinaturasError,
    isLoading: loadingAssinaturas,
  } = useSWR("admin-assinaturas-planos", getAssinaturas, {
    revalidateOnFocus: true,
  });

  const {
    data: juizesPremiumResponse,
    error: juizesError,
    isLoading: loadingJuizes,
  } = useSWR(
    ["admin-juizes-premium", { isPremium: true }],
    ([, filters]) => getJuizesAdmin(filters),
    {
      revalidateOnFocus: true,
    },
  );

  const planos: PlanoCatalogItem[] = planosResponse?.data ?? [];
  const pacotesJuiz: PacoteJuiz[] = pacotesResponse?.data ?? [];
  const assinaturas: AssinaturaResumo[] = assinaturasResponse?.data ?? [];
  const juizesPremium: JuizSerializado[] = juizesPremiumResponse?.data ?? [];

  const planoStats: PlanoStats = statsResponse?.data ?? {
    totalPlanos: 0,
    planosAtivos: 0,
    totalAssinaturas: 0,
    assinaturasAtivas: 0,
    faturamentoMensal: 0,
  };

  const pacoteStats: PacoteStats = statsPacotesResponse?.data ?? {
    totalPacotes: 0,
    pacotesAtivos: 0,
    totalAssinaturas: 0,
    assinaturasAtivas: 0,
    faturamentoMensal: 0,
  };

  const totalRevenue =
    planoStats.faturamentoMensal + pacoteStats.faturamentoMensal;
  const activeOffers = planoStats.planosAtivos + pacoteStats.pacotesAtivos;
  const activeSubscriptions =
    planoStats.assinaturasAtivas + pacoteStats.assinaturasAtivas;
  const inactiveOffers =
    planoStats.totalPlanos -
    planoStats.planosAtivos +
    (pacoteStats.totalPacotes - pacoteStats.pacotesAtivos);
  const premiumCoverage = pacotesJuiz.reduce(
    (acc, pacote) => acc + (pacote._count?.juizes ?? 0),
    0,
  );

  const errors = [
    planosError,
    pacotesError,
    statsError,
    statsPacotesError,
    assinaturasError,
    juizesError,
  ].filter(Boolean) as Error[];

  return (
    <section className="space-y-6">
      <PeoplePageHeader
        tag="Administração"
        title="Monetização e pacotes premium"
        description="Comando comercial para catálogo de planos, pacotes premium de juízes e leitura de adesão da base pagante."
        actions={
          <>
            <Button
              as={NextLink}
              color="primary"
              href="/admin/planos"
              radius="full"
              size="sm"
            >
              Planos e modulos
            </Button>
            <Button
              as={NextLink}
              href="/admin/juizes"
              radius="full"
              size="sm"
              variant="bordered"
            >
              Juizes premium
            </Button>
          </>
        }
      />

      {errors.length > 0 ? (
        <PeoplePanel
          title="Falha parcial no painel"
          description="Algumas fontes não responderam. Os blocos abaixo continuam exibindo o que foi possível carregar."
        >
          <div className="space-y-2 rounded-2xl border border-danger/30 bg-danger/5 p-4">
            {errors.map((error, index) => (
              <div
                key={`${error.message}-${index}`}
                className="text-sm text-danger"
              >
                {error.message}
              </div>
            ))}
          </div>
        </PeoplePanel>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <PeopleMetricCard
          label="Receita mensal total"
          value={
            loadingStats || loadingStatsPacotes
              ? "..."
              : formatCurrency(totalRevenue)
          }
          helper="Planos SaaS + pacotes premium"
          icon={<BadgeDollarSign className="h-4 w-4" />}
          tone="success"
        />
        <PeopleMetricCard
          label="Ofertas ativas"
          value={loadingStats || loadingStatsPacotes ? "..." : activeOffers}
          helper="Produtos atualmente vendáveis"
          icon={<Layers3 className="h-4 w-4" />}
          tone="primary"
        />
        <PeopleMetricCard
          label="Assinaturas ativas"
          value={
            loadingStats || loadingStatsPacotes ? "..." : activeSubscriptions
          }
          helper="Clientes pagando no catálogo atual"
          icon={<Building2 className="h-4 w-4" />}
          tone="secondary"
        />
        <PeopleMetricCard
          label="Juizes premium"
          value={loadingJuizes ? "..." : juizesPremium.length}
          helper="Base monetizável de autoridades"
          icon={<Crown className="h-4 w-4" />}
          tone="warning"
        />
        <PeopleMetricCard
          label="Cobertura premium"
          value={loadingPacotes ? "..." : premiumCoverage}
          helper="Vinculos de juizes em pacotes"
          icon={<Gem className="h-4 w-4" />}
          tone="primary"
        />
      </div>

      <PeoplePanel
        title="Pulso comercial"
        description="Leitura rápida do mix de monetização e das oportunidades abertas no catálogo atual."
      >
        <div className="grid gap-3 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-background/30 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
              Receita de planos
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {formatCurrency(planoStats.faturamentoMensal)}
            </p>
            <p className="mt-1 text-xs text-default-400">
              Base principal do SaaS.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-background/30 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
              Receita premium
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {formatCurrency(pacoteStats.faturamentoMensal)}
            </p>
            <p className="mt-1 text-xs text-default-400">
              Camada incremental de ticket.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-background/30 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
              Ofertas inativas
            </p>
            <p className="mt-2 text-2xl font-semibold text-warning">
              {inactiveOffers}
            </p>
            <p className="mt-1 text-xs text-default-400">
              Catálogo parado e sem gerar caixa.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-background/30 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-default-500">
              Oportunidade premium
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {Math.max(juizesPremium.length - premiumCoverage, 0)}
            </p>
            <p className="mt-1 text-xs text-default-400">
              Juizes premium ainda sem cobertura comercial direta.
            </p>
          </div>
        </div>
      </PeoplePanel>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <PeoplePanel
          title="Catálogo de planos"
          description="Planos principais do SaaS com preço, limites e status comercial."
          actions={
            <Button
              as={NextLink}
              href="/admin/planos"
              radius="full"
              size="sm"
              variant="flat"
            >
              Abrir gestão completa
            </Button>
          }
        >
          {loadingPlanos && !planosResponse ? (
            <LoadingBlock label="Carregando planos..." />
          ) : planos.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {planos.map((plano) => (
                <div
                  key={plano.id}
                  className="rounded-3xl border border-white/10 bg-background/30 p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-foreground">
                        {plano.nome}
                      </p>
                      <p className="mt-1 text-sm text-default-400">
                        {plano.descricao || "Sem copy comercial definida."}
                      </p>
                    </div>
                    <Chip
                      color={plano.ativo ? "success" : "default"}
                      size="sm"
                      variant="flat"
                    >
                      {plano.ativo ? "Ativo" : "Inativo"}
                    </Chip>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-default-500">
                        Mensal
                      </p>
                      <p className="mt-2 text-base font-semibold text-foreground">
                        {formatCurrency(plano.valorMensal, plano.moeda)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-default-500">
                        Anual
                      </p>
                      <p className="mt-2 text-base font-semibold text-foreground">
                        {formatCurrency(plano.valorAnual, plano.moeda)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-default-400">
                    <Chip size="sm" variant="bordered">
                      Usuarios: {plano.limiteUsuarios ?? "Livre"}
                    </Chip>
                    <Chip size="sm" variant="bordered">
                      Processos: {plano.limiteProcessos ?? "Livre"}
                    </Chip>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <PeopleEmptyState
              title="Nenhum plano cadastrado"
              description="Sem planos ativos não existe catálogo comercial de entrada para o SaaS."
              icon={<Layers3 className="h-6 w-6" />}
              action={
                <Button
                  as={NextLink}
                  color="primary"
                  href="/admin/planos"
                  radius="full"
                  size="sm"
                >
                  Ir para planos
                </Button>
              }
            />
          )}
        </PeoplePanel>

        <PeoplePanel
          title="Pacotes premium de juizes"
          description="Ofertas adicionais de alta margem para monetizar autoridades estratégicas."
          actions={
            <Button
              as={NextLink}
              href="/admin/juizes"
              radius="full"
              size="sm"
              variant="flat"
            >
              Gerir juizes
            </Button>
          }
        >
          {loadingPacotes && !pacotesResponse ? (
            <LoadingBlock label="Carregando pacotes premium..." />
          ) : pacotesJuiz.length > 0 ? (
            <div className="space-y-3">
              {pacotesJuiz.map((pacote) => (
                <div
                  key={pacote.id}
                  className="rounded-3xl border border-white/10 bg-background/30 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-foreground">
                        {pacote.nome}
                      </p>
                      <p className="mt-1 text-sm text-default-400">
                        {pacote.descricao ||
                          "Sem descrição comercial definida."}
                      </p>
                    </div>
                    <Chip
                      color={getStatusColor(pacote.status)}
                      size="sm"
                      variant="flat"
                    >
                      {pacote.status}
                    </Chip>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-default-500">
                        Preco
                      </p>
                      <p className="mt-2 text-base font-semibold text-foreground">
                        {formatCurrency(pacote.preco, pacote.moeda)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-default-500">
                        Cobertura
                      </p>
                      <p className="mt-2 text-base font-semibold text-foreground">
                        {pacote._count?.juizes ?? 0} juiz(es) ·{" "}
                        {pacote._count?.assinaturas ?? 0} assinatura(s)
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <PeopleEmptyState
              title="Nenhum pacote premium configurado"
              description="A camada de monetização premium ainda não foi colocada no mercado."
              icon={<Sparkles className="h-6 w-6" />}
            />
          )}
        </PeoplePanel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <PeoplePanel
          title="Assinaturas recentes"
          description="Últimas contas que entraram em planos da plataforma."
        >
          {loadingAssinaturas && !assinaturasResponse ? (
            <LoadingBlock label="Carregando assinaturas..." />
          ) : assinaturas.length > 0 ? (
            <Table removeWrapper aria-label="Assinaturas recentes de planos">
              <TableHeader>
                <TableColumn>Tenant</TableColumn>
                <TableColumn>Plano</TableColumn>
                <TableColumn>Status</TableColumn>
                <TableColumn>Criada em</TableColumn>
                <TableColumn>Renovacao / trial</TableColumn>
              </TableHeader>
              <TableBody>
                {assinaturas.slice(0, 8).map((assinatura) => (
                  <TableRow key={assinatura.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">
                          {assinatura.tenant.name}
                        </p>
                        <p className="text-xs text-default-500">
                          {assinatura.tenant.slug}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {assinatura.plano?.nome ?? "Sem plano"}
                    </TableCell>
                    <TableCell>
                      <Chip
                        color={getStatusColor(assinatura.status)}
                        size="sm"
                        variant="flat"
                      >
                        {assinatura.status}
                      </Chip>
                    </TableCell>
                    <TableCell>{formatDate(assinatura.createdAt)}</TableCell>
                    <TableCell>
                      {formatDate(
                        assinatura.renovaEm ?? assinatura.trialEndsAt,
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <PeopleEmptyState
              title="Nenhuma assinatura registrada"
              description="Quando os tenants começarem a contratar planos, o fluxo recente aparecerá aqui."
              icon={<Building2 className="h-6 w-6" />}
            />
          )}
        </PeoplePanel>

        <PeoplePanel
          title="Autoridades premium prontas para venda"
          description="Base premium que ainda pode virar pacote, upsell ou combinação comercial específica."
        >
          {loadingJuizes && !juizesPremiumResponse ? (
            <LoadingBlock label="Carregando base premium..." />
          ) : juizesPremium.length > 0 ? (
            <div className="space-y-3">
              {juizesPremium.slice(0, 6).map((juiz) => (
                <div
                  key={juiz.id}
                  className="rounded-2xl border border-white/10 bg-background/30 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {juiz.nome}
                      </p>
                      <p className="mt-1 text-xs text-default-400">
                        {[juiz.comarca, juiz.vara]
                          .filter(Boolean)
                          .join(" · ") || "Sem comarca/vara definida"}
                      </p>
                    </div>
                    <Chip color="warning" size="sm" variant="flat">
                      Premium
                    </Chip>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(juiz.especialidades ?? [])
                      .slice(0, 3)
                      .map((especialidade) => (
                        <Chip key={especialidade} size="sm" variant="bordered">
                          {especialidade}
                        </Chip>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <PeopleEmptyState
              title="Sem autoridades premium catalogadas"
              description="Quando a base de juizes premium crescer, esta área vira um radar claro de upsell."
              icon={<Scale className="h-6 w-6" />}
            />
          )}
        </PeoplePanel>
      </div>

      <PeoplePanel
        title="Leitura estratégica"
        description="Próximas decisões para melhorar receita, catálogo e monetização premium."
      >
        <div className="grid gap-3 xl:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-background/30 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">
                Catálogo vivo
              </p>
            </div>
            <p className="text-sm text-default-400">
              {activeOffers > 0
                ? `${activeOffers} oferta(s) estão ativas e prontas para venda.`
                : "Sem ofertas ativas, a frente comercial fica travada."}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-background/30 p-4">
            <div className="mb-2 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-warning" />
              <p className="text-sm font-semibold text-foreground">
                Catálogo parado
              </p>
            </div>
            <p className="text-sm text-default-400">
              {inactiveOffers > 0
                ? `${inactiveOffers} oferta(s) seguem inativas e não contribuem para a receita.`
                : "Não há ofertas inativas atrapalhando o catálogo atual."}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-background/30 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Users className="h-4 w-4 text-success" />
              <p className="text-sm font-semibold text-foreground">
                Espaço de expansão
              </p>
            </div>
            <p className="text-sm text-default-400">
              {Math.max(juizesPremium.length - premiumCoverage, 0) > 0
                ? "Ainda existe espaço claro para converter a base premium em novas ofertas ou bundles."
                : "A cobertura premium já está alta; o foco agora pode ser ticket e retenção."}
            </p>
          </div>
        </div>
      </PeoplePanel>
    </section>
  );
}
