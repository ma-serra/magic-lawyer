export type AdminReportsPreset = "30D" | "90D" | "365D" | "YTD" | "ALL";
export type AdminReportsFormat = "CSV" | "XLSX" | "PDF";
export type AdminReportsMetricFormat =
  | "integer"
  | "currency"
  | "percentage"
  | "decimal";
export type AdminReportsTone =
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "secondary"
  | "default";
export type AdminReportsCatalogStatus = "DISPONIVEL" | "ATENCAO";
export type AdminReportsCategoryId =
  | "financeiro"
  | "tenants"
  | "suporte"
  | "operacao"
  | "comercial"
  | "governanca"
  | "externos";

export interface AdminReportsFilters {
  preset: AdminReportsPreset;
  tenantId: string | "ALL";
}

export interface AdminReportsTenantOption {
  key: string;
  label: string;
  slug: string;
  status: string;
}

export interface AdminReportsMetricCard {
  id: string;
  label: string;
  value: number;
  helper: string;
  tone: AdminReportsTone;
  format: AdminReportsMetricFormat;
}

export interface AdminReportsMonthlyPoint {
  id: string;
  label: string;
  faturado: number;
  recebido: number;
  ticketsAbertos: number;
  ticketsResolvidos: number;
  novosTenants: number;
  leadsGanhos: number;
}

export interface AdminReportsBreakdownPoint {
  [key: string]: string | number | undefined;
  id: string;
  label: string;
  value: number;
  tone?: AdminReportsTone;
}

export interface AdminReportsRankingItem {
  id: string;
  title: string;
  subtitle: string;
  value: number;
  format: AdminReportsMetricFormat;
  tone?: AdminReportsTone;
  badge?: string;
}

export interface AdminReportsAuditItem {
  id: string;
  action: string;
  entity: string;
  createdAt: string;
  actor: string;
}

export interface AdminReportsSupportItem {
  id: string;
  title: string;
  tenantName: string;
  status: string;
  priority: string;
  slaBreached: boolean;
  createdAt: string;
}

export interface AdminReportsCatalogItem {
  id: string;
  title: string;
  description: string;
  audience: string;
  cadence: string;
  liveMetricLabel: string;
  liveMetricValue: number;
  liveMetricFormat: AdminReportsMetricFormat;
  exports: AdminReportsFormat[];
  status: AdminReportsCatalogStatus;
  href: string;
  tags: string[];
}

export interface AdminReportsCategorySection {
  id: AdminReportsCategoryId;
  label: string;
  description: string;
  tone: AdminReportsTone;
  icon: string;
  highlights: string[];
  primaryMetricLabel: string;
  primaryMetricValue: number;
  primaryMetricFormat: AdminReportsMetricFormat;
  items: AdminReportsCatalogItem[];
}

export interface AdminReportsSummary {
  catalogReports: number;
  categories: number;
  readyExports: number;
  priorityWatchlist: number;
  scopeLabel: string;
  presetLabel: string;
}

export interface AdminReportsData {
  generatedAt: string;
  filters: AdminReportsFilters;
  summary: AdminReportsSummary;
  tenantOptions: AdminReportsTenantOption[];
  metricCards: AdminReportsMetricCard[];
  monthlySeries: AdminReportsMonthlyPoint[];
  paymentMethodBreakdown: AdminReportsBreakdownPoint[];
  supportStatusBreakdown: AdminReportsBreakdownPoint[];
  supportPriorityBreakdown: AdminReportsBreakdownPoint[];
  leadStatusBreakdown: AdminReportsBreakdownPoint[];
  tenantStatusBreakdown: AdminReportsBreakdownPoint[];
  topTenants: AdminReportsRankingItem[];
  atRiskTenants: AdminReportsRankingItem[];
  latestAudit: AdminReportsAuditItem[];
  latestSupport: AdminReportsSupportItem[];
  categories: AdminReportsCategorySection[];
  spotlightReports: AdminReportsCatalogItem[];
}

export interface AdminReportsCatalogMetrics {
  mrr: number;
  arr: number;
  billedRevenue: number;
  receivedRevenue: number;
  collectionRate: number;
  activeSubscriptions: number;
  openInvoices: number;
  overdueInvoices: number;
  premiumRevenue: number;
  premiumSubscriptions: number;
  paymentMethodCount: number;
  activeTenants: number;
  totalTenants: number;
  suspendedTenants: number;
  cancelledTenants: number;
  activeUsers: number;
  totalUsers: number;
  clients: number;
  processes: number;
  topTenants: number;
  atRiskTenants: number;
  openTickets: number;
  slaBreached: number;
  waitingCustomer: number;
  waitingExternal: number;
  avgFirstResponseMinutes: number;
  avgResolutionHours: number;
  csatAverage: number;
  ratingsCount: number;
  openTasks: number;
  completedTasks: number;
  upcomingEvents: number;
  dueSoonDeadlines: number;
  overdueDeadlines: number;
  documentsCreated: number;
  petitionProtocols: number;
  processesCreated: number;
  newLeads: number;
  qualifiedLeads: number;
  negotiationLeads: number;
  wonLeads: number;
  lostLeads: number;
  staleLeads: number;
  leadSources: number;
  adminAuditEvents: number;
  tenantAuditEvents: number;
  criticalActions: number;
  riskSignals: number;
  activePackageSubscriptions: number;
  authorityUnlocks: number;
  inpiDossiers: number;
  inpiCriticalRisk: number;
}

export const ADMIN_REPORT_PRESET_OPTIONS: Array<{
  key: AdminReportsPreset;
  label: string;
}> = [
  { key: "30D", label: "30 dias" },
  { key: "90D", label: "90 dias" },
  { key: "365D", label: "12 meses" },
  { key: "YTD", label: "Ano atual" },
  { key: "ALL", label: "Historico" },
];

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function startOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1);
}

export function toDecimalNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (
    typeof value === "object" &&
    "toString" in (value as Record<string, unknown>)
  ) {
    const parsed = Number((value as { toString(): string }).toString());
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

export function resolveAdminReportsRange(
  preset: AdminReportsPreset,
  now = new Date(),
) {
  switch (preset) {
    case "30D":
      return {
        start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        end: now,
        label: "Ultimos 30 dias",
      };
    case "90D":
      return {
        start: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
        end: now,
        label: "Ultimos 90 dias",
      };
    case "365D":
      return {
        start: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
        end: now,
        label: "Ultimos 12 meses",
      };
    case "YTD":
      return {
        start: startOfYear(now),
        end: now,
        label: "Ano atual",
      };
    case "ALL":
    default:
      return {
        start: null,
        end: now,
        label: "Historico completo",
      };
  }
}

export function buildTrendMonths(now = new Date(), months = 6) {
  return Array.from({ length: months }).map((_, index) => {
    const offset = months - index - 1;
    const start = startOfMonth(addMonths(now, -offset));
    const end = addMonths(start, 1);

    return {
      id: start.toISOString(),
      label: start.toLocaleDateString("pt-BR", {
        month: "short",
        year: "2-digit",
      }),
      start,
      end,
    };
  });
}

function createCatalogItem(
  id: string,
  title: string,
  description: string,
  audience: string,
  cadence: string,
  liveMetricLabel: string,
  liveMetricValue: number,
  liveMetricFormat: AdminReportsMetricFormat,
  exports: AdminReportsFormat[],
  status: AdminReportsCatalogStatus,
  href: string,
  tags: string[],
): AdminReportsCatalogItem {
  return {
    id,
    title,
    description,
    audience,
    cadence,
    liveMetricLabel,
    liveMetricValue,
    liveMetricFormat,
    exports,
    status,
    href,
    tags,
  };
}

export function buildAdminReportsCatalog(
  metrics: AdminReportsCatalogMetrics,
): AdminReportsCategorySection[] {
  const financeiro: AdminReportsCategorySection = {
    id: "financeiro",
    label: "Receita e cobranca",
    description:
      "Relatorios para acompanhar caixa, recorrencia, inadimplencia e monetizacao premium.",
    tone: "success",
    icon: "Wallet",
    highlights: [
      `${metrics.overdueInvoices} titulo(s) vencido(s) no radar`,
      `${metrics.premiumSubscriptions} assinatura(s) premium ativas`,
      `Taxa de cobranca em ${Math.round(metrics.collectionRate * 100)}%`,
    ],
    primaryMetricLabel: "Receita confirmada",
    primaryMetricValue: metrics.receivedRevenue,
    primaryMetricFormat: "currency",
    items: [
      createCatalogItem(
        "financeiro-receita-confirmada",
        "Receita confirmada por periodo",
        "Leitura base para recebido liquido no recorte selecionado.",
        "Financeiro / Diretoria",
        "Diaria",
        "Receita confirmada",
        metrics.receivedRevenue,
        "currency",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/financeiro",
        ["receita", "caixa", "asaas"],
      ),
      createCatalogItem(
        "financeiro-faturamento",
        "Faturamento emitido",
        "Volume bruto emitido para medir gap entre faturado e recebido.",
        "Financeiro / Diretoria",
        "Diaria",
        "Faturado",
        metrics.billedRevenue,
        "currency",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/financeiro",
        ["fatura", "billing"],
      ),
      createCatalogItem(
        "financeiro-mrr",
        "MRR contratual",
        "Receita recorrente mensal para leitura executiva SaaS.",
        "CEO / Financeiro",
        "Semanal",
        "MRR",
        metrics.mrr,
        "currency",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/financeiro",
        ["mrr", "saaas", "assinatura"],
      ),
      createCatalogItem(
        "financeiro-arr",
        "ARR projetado",
        "Projecao anual derivada das assinaturas ativas.",
        "CEO / Conselho",
        "Mensal",
        "ARR",
        metrics.arr,
        "currency",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/financeiro",
        ["arr", "planejamento"],
      ),
      createCatalogItem(
        "financeiro-inadimplencia",
        "Inadimplencia ativa",
        "Titulos vencidos que pressionam cobranca e risco de churn.",
        "Cobranca",
        "Diaria",
        "Titulos vencidos",
        metrics.overdueInvoices,
        "integer",
        ["CSV", "XLSX", "PDF"],
        metrics.overdueInvoices > 0 ? "ATENCAO" : "DISPONIVEL",
        "/admin/financeiro",
        ["inadimplencia", "aging"],
      ),
      createCatalogItem(
        "financeiro-carteira-aberta",
        "Carteira em aberto",
        "Volume total de titulos abertos aguardando conversao em caixa.",
        "Financeiro",
        "Diaria",
        "Faturas abertas",
        metrics.openInvoices,
        "integer",
        ["CSV", "XLSX", "PDF"],
        metrics.openInvoices > 0 ? "ATENCAO" : "DISPONIVEL",
        "/admin/financeiro",
        ["carteira", "receber"],
      ),
      createCatalogItem(
        "financeiro-premium",
        "Receita premium",
        "Receita adicional vinda de pacotes de autoridades e upsell.",
        "Produtos / Financeiro",
        "Semanal",
        "Receita premium",
        metrics.premiumRevenue,
        "currency",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/pacotes",
        ["premium", "upsell", "pacotes"],
      ),
      createCatalogItem(
        "financeiro-metodos",
        "Mix por metodo de pagamento",
        "Composicao do recebido entre PIX, boleto e cartao.",
        "Financeiro / Operacoes",
        "Semanal",
        "Metodos monitorados",
        metrics.paymentMethodCount,
        "integer",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/financeiro",
        ["pix", "boleto", "cartao"],
      ),
    ],
  };

  const tenants: AdminReportsCategorySection = {
    id: "tenants",
    label: "Tenants e base instalada",
    description:
      "Leitura da saude dos escritorios, uso da plataforma e densidade da base ativa.",
    tone: "primary",
    icon: "Building2",
    highlights: [
      `${metrics.activeTenants} tenant(s) em operacao`,
      `${metrics.atRiskTenants} tenant(s) com sinal de risco`,
      `${metrics.clients} cliente(s) ativos na base`,
    ],
    primaryMetricLabel: "Tenants ativos",
    primaryMetricValue: metrics.activeTenants,
    primaryMetricFormat: "integer",
    items: [
      createCatalogItem(
        "tenant-saude-carteira",
        "Saude da base de tenants",
        "Resumo executivo da base ativa, suspensa e cancelada.",
        "Diretoria / CS",
        "Diaria",
        "Tenants ativos",
        metrics.activeTenants,
        "integer",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/tenants",
        ["tenant", "carteira"],
      ),
      createCatalogItem(
        "tenant-risco",
        "Tenants em risco",
        "Escritorios com inadimplencia, SLA pressionado ou status sensivel.",
        "CS / Operacoes",
        "Diaria",
        "Tenants em risco",
        metrics.atRiskTenants,
        "integer",
        ["CSV", "XLSX", "PDF"],
        metrics.atRiskTenants > 0 ? "ATENCAO" : "DISPONIVEL",
        "/admin/tenants",
        ["risk", "churn"],
      ),
      createCatalogItem(
        "tenant-usuarios-ativos",
        "Adocao por usuarios",
        "Usuarios ativos comparados ao tamanho total da base.",
        "Produto / CS",
        "Semanal",
        "Usuarios ativos",
        metrics.activeUsers,
        "integer",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/tenants",
        ["uso", "adocao"],
      ),
      createCatalogItem(
        "tenant-clientes",
        "Carteira de clientes por escritorio",
        "Visao consolidada do volume de clientes mantidos nos tenants.",
        "CS / Operacoes",
        "Semanal",
        "Clientes ativos",
        metrics.clients,
        "integer",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/tenants",
        ["clientes", "portfolio"],
      ),
      createCatalogItem(
        "tenant-processos",
        "Carteira processual consolidada",
        "Volume de processos em operacao na base instalada.",
        "Produto / Diretoria",
        "Semanal",
        "Processos ativos",
        metrics.processes,
        "integer",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/tenants",
        ["processos", "volume"],
      ),
      createCatalogItem(
        "tenant-assinaturas",
        "Saude das assinaturas",
        "Assinaturas ativas comparadas a suspensao e cancelamento.",
        "Financeiro / CS",
        "Diaria",
        "Assinaturas ativas",
        metrics.activeSubscriptions,
        "integer",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/financeiro",
        ["assinatura", "retencao"],
      ),
      createCatalogItem(
        "tenant-top",
        "Top tenants por valor",
        "Ranking dos escritorios com maior contribuicao financeira.",
        "Diretoria",
        "Semanal",
        "Tenants no ranking",
        metrics.topTenants,
        "integer",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/financeiro",
        ["ranking", "revenue"],
      ),
      createCatalogItem(
        "tenant-cancelamentos",
        "Suspensoes e cancelamentos",
        "Lista para contencao de churn e follow-up comercial.",
        "CS / Comercial",
        "Diaria",
        "Eventos sensiveis",
        metrics.suspendedTenants + metrics.cancelledTenants,
        "integer",
        ["CSV", "XLSX", "PDF"],
        metrics.suspendedTenants + metrics.cancelledTenants > 0
          ? "ATENCAO"
          : "DISPONIVEL",
        "/admin/tenants",
        ["cancelamento", "recuperacao"],
      ),
    ],
  };

  const suporte: AdminReportsCategorySection = {
    id: "suporte",
    label: "Suporte e SLA",
    description:
      "Bloco de atendimento com backlog, filas, cumprimento de SLA e experiencia do tenant.",
    tone: "warning",
    icon: "LifeBuoy",
    highlights: [
      `${metrics.openTickets} ticket(s) em fila`,
      `${metrics.slaBreached} ticket(s) rompendo SLA`,
      `${metrics.ratingsCount} avaliacao(oes) de atendimento`,
    ],
    primaryMetricLabel: "Backlog atual",
    primaryMetricValue: metrics.openTickets,
    primaryMetricFormat: "integer",
    items: [
      createCatalogItem(
        "suporte-backlog",
        "Backlog atual de suporte",
        "Fila viva de tickets abertos e em andamento.",
        "Suporte / Operacoes",
        "Tempo real",
        "Tickets em aberto",
        metrics.openTickets,
        "integer",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/suporte",
        ["backlog", "queue"],
      ),
      createCatalogItem(
        "suporte-sla-rompido",
        "SLA de primeira resposta rompido",
        "Tickets que ja ultrapassaram a meta operacional de resposta.",
        "Coordenacao de suporte",
        "Tempo real",
        "Tickets fora do SLA",
        metrics.slaBreached,
        "integer",
        ["CSV", "XLSX", "PDF"],
        metrics.slaBreached > 0 ? "ATENCAO" : "DISPONIVEL",
        "/admin/suporte",
        ["sla", "first-response"],
      ),
      createCatalogItem(
        "suporte-primeira-resposta",
        "Tempo medio de primeira resposta",
        "Media de minutos ate o primeiro retorno do suporte.",
        "Coordenacao de suporte",
        "Diaria",
        "Minutos medios",
        metrics.avgFirstResponseMinutes,
        "decimal",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/suporte",
        ["tempo-resposta", "sla"],
      ),
      createCatalogItem(
        "suporte-resolucao",
        "Tempo medio de resolucao",
        "Media de horas ate encerramento ou resolucao util.",
        "Coordenacao de suporte",
        "Semanal",
        "Horas medias",
        metrics.avgResolutionHours,
        "decimal",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/suporte",
        ["tempo-resolucao", "efficiency"],
      ),
      createCatalogItem(
        "suporte-csat",
        "CSAT do atendimento",
        "Media consolidada das notas atribuidas pelos tenants.",
        "CS / Suporte",
        "Semanal",
        "Nota media",
        metrics.csatAverage,
        "decimal",
        ["CSV", "XLSX", "PDF"],
        metrics.csatAverage < 4 && metrics.ratingsCount > 0
          ? "ATENCAO"
          : "DISPONIVEL",
        "/admin/suporte",
        ["csat", "qualidade"],
      ),
      createCatalogItem(
        "suporte-aguardando-cliente",
        "Fila aguardando cliente",
        "Tickets parados por retorno do escritorio.",
        "Suporte / CS",
        "Diaria",
        "Aguardando cliente",
        metrics.waitingCustomer,
        "integer",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/suporte",
        ["waiting-customer", "follow-up"],
      ),
      createCatalogItem(
        "suporte-aguardando-terceiro",
        "Fila aguardando terceiro",
        "Tickets dependentes de tribunal, integrador ou fornecedor.",
        "Suporte / Operacoes",
        "Diaria",
        "Dependencias externas",
        metrics.waitingExternal,
        "integer",
        ["CSV", "XLSX", "PDF"],
        metrics.waitingExternal > 0 ? "ATENCAO" : "DISPONIVEL",
        "/admin/suporte",
        ["third-party", "bloqueio"],
      ),
      createCatalogItem(
        "suporte-capacidade",
        "Capacidade do time de suporte",
        "Comparativo entre backlog, SLA e volume de tickets monitorados.",
        "Coordenacao / Diretoria",
        "Semanal",
        "Tickets monitorados",
        metrics.openTickets + metrics.waitingCustomer + metrics.waitingExternal,
        "integer",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/suporte",
        ["capacidade", "staffing"],
      ),
    ],
  };

  const operacao: AdminReportsCategorySection = {
    id: "operacao",
    label: "Operacao interna e equipe",
    description:
      "Indicadores de produtividade, prazos, eventos e volume juridico operacional.",
    tone: "secondary",
    icon: "Briefcase",
    highlights: [
      `${metrics.openTasks} tarefa(s) abertas`,
      `${metrics.dueSoonDeadlines} prazo(s) vencendo em breve`,
      `${metrics.documentsCreated} documento(s) gerados no recorte`,
    ],
    primaryMetricLabel: "Tarefas abertas",
    primaryMetricValue: metrics.openTasks,
    primaryMetricFormat: "integer",
    items: [
      createCatalogItem(
        "operacao-backlog-tarefas",
        "Backlog de tarefas",
        "Fila aberta do time interno com leitura por volume.",
        "Operacoes / Coordenacao",
        "Diaria",
        "Tarefas abertas",
        metrics.openTasks,
        "integer",
        ["CSV", "XLSX", "PDF"],
        metrics.openTasks > 0 ? "ATENCAO" : "DISPONIVEL",
        "/admin/dashboard",
        ["tarefas", "backlog"],
      ),
      createCatalogItem(
        "operacao-entregas",
        "Entregas concluidas no periodo",
        "Volume de tarefas concluido no recorte selecionado.",
        "Operacoes / Lideranca",
        "Semanal",
        "Tarefas concluidas",
        metrics.completedTasks,
        "integer",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/dashboard",
        ["throughput", "tarefas"],
      ),
      createCatalogItem(
        "operacao-prazos-proximos",
        "Prazos proximos",
        "Controle preventivo de prazos vencendo em ate 7 dias.",
        "Operacoes / Compliance",
        "Diaria",
        "Prazos proximos",
        metrics.dueSoonDeadlines,
        "integer",
        ["CSV", "XLSX", "PDF"],
        metrics.dueSoonDeadlines > 0 ? "ATENCAO" : "DISPONIVEL",
        "/admin/dashboard",
        ["prazo", "urgencia"],
      ),
      createCatalogItem(
        "operacao-prazos-vencidos",
        "Prazos vencidos",
        "Sinal vermelho para risco operacional imediato.",
        "Operacoes / Diretoria",
        "Diaria",
        "Prazos vencidos",
        metrics.overdueDeadlines,
        "integer",
        ["CSV", "XLSX", "PDF"],
        metrics.overdueDeadlines > 0 ? "ATENCAO" : "DISPONIVEL",
        "/admin/dashboard",
        ["prazo", "risco"],
      ),
      createCatalogItem(
        "operacao-eventos",
        "Agenda operacional",
        "Eventos proximos que exigem alocacao e acompanhamento.",
        "Operacoes / Secretarias",
        "Diaria",
        "Eventos proximos",
        metrics.upcomingEvents,
        "integer",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/dashboard",
        ["agenda", "evento"],
      ),
      createCatalogItem(
        "operacao-documentos",
        "Producao documental",
        "Volume de documentos criados no recorte.",
        "Operacoes / Produto",
        "Semanal",
        "Documentos criados",
        metrics.documentsCreated,
        "integer",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/dashboard",
        ["documentos", "producao"],
      ),
      createCatalogItem(
        "operacao-peticoes",
        "Peticoes protocoladas",
        "Pipeline de protocolizacao efetiva no periodo.",
        "Juridico / Operacoes",
        "Semanal",
        "Peticoes protocoladas",
        metrics.petitionProtocols,
        "integer",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/dashboard",
        ["peticoes", "protocolo"],
      ),
      createCatalogItem(
        "operacao-processos-novos",
        "Processos novos",
        "Entrada processual no recorte para leitura de demanda.",
        "Diretoria / Operacoes",
        "Semanal",
        "Novos processos",
        metrics.processesCreated,
        "integer",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/dashboard",
        ["processos", "demanda"],
      ),
    ],
  };

  const comercial: AdminReportsCategorySection = {
    id: "comercial",
    label: "Comercial e pipeline",
    description:
      "Relatorios para acquisicao, conversao, velocidade comercial e follow-up de oportunidades.",
    tone: "primary",
    icon: "Target",
    highlights: [
      `${metrics.newLeads} lead(s) no recorte`,
      `${metrics.qualifiedLeads} oportunidade(s) qualificadas`,
      `${metrics.wonLeads} ganho(s) registrado(s)`,
    ],
    primaryMetricLabel: "Leads novos",
    primaryMetricValue: metrics.newLeads,
    primaryMetricFormat: "integer",
    items: [
      createCatalogItem(
        "comercial-leads-novos",
        "Leads novos",
        "Entradas comerciais por periodo para medir topo de funil.",
        "Comercial / Growth",
        "Diaria",
        "Leads novos",
        metrics.newLeads,
        "integer",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/leads",
        ["lead", "topo-funil"],
      ),
      createCatalogItem(
        "comercial-qualificacao",
        "Leads qualificados",
        "Leads que ja passaram do filtro inicial e pedem abordagem comercial.",
        "SDR / Comercial",
        "Diaria",
        "Qualificados",
        metrics.qualifiedLeads,
        "integer",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/leads",
        ["qualificacao", "pipeline"],
      ),
      createCatalogItem(
        "comercial-negociacao",
        "Pipeline em negociacao",
        "Oportunidades em conversa ativa de fechamento.",
        "Executivo comercial",
        "Diaria",
        "Em negociacao",
        metrics.negotiationLeads,
        "integer",
        ["CSV", "XLSX", "PDF"],
        metrics.negotiationLeads > 0 ? "ATENCAO" : "DISPONIVEL",
        "/admin/leads",
        ["negociacao", "forecast"],
      ),
      createCatalogItem(
        "comercial-ganhos",
        "Conversoes em ganho",
        "Fechamentos bem-sucedidos no recorte.",
        "Diretoria / Comercial",
        "Semanal",
        "Ganhos",
        metrics.wonLeads,
        "integer",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/leads",
        ["won", "conversao"],
      ),
      createCatalogItem(
        "comercial-perdidos",
        "Leads perdidos",
        "Visao do que saiu do pipeline e precisa retroanalise.",
        "Comercial / Produto",
        "Semanal",
        "Perdidos",
        metrics.lostLeads,
        "integer",
        ["CSV", "XLSX", "PDF"],
        metrics.lostLeads > 0 ? "ATENCAO" : "DISPONIVEL",
        "/admin/leads",
        ["lost", "insight"],
      ),
      createCatalogItem(
        "comercial-estagnados",
        "Leads sem contato recente",
        "Fila de follow-up comercial esfriando dentro do CRM.",
        "SDR / CS",
        "Diaria",
        "Estagnados",
        metrics.staleLeads,
        "integer",
        ["CSV", "XLSX", "PDF"],
        metrics.staleLeads > 0 ? "ATENCAO" : "DISPONIVEL",
        "/admin/leads",
        ["follow-up", "stale"],
      ),
      createCatalogItem(
        "comercial-fontes",
        "Origem de leads",
        "Composicao do pipeline por origem de aquisicao.",
        "Growth / Marketing",
        "Semanal",
        "Fontes ativas",
        metrics.leadSources,
        "integer",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/leads",
        ["source", "marketing"],
      ),
      createCatalogItem(
        "comercial-base-oportunidades",
        "Base total de oportunidades",
        "Visao consolidada do pipeline total acompanhado pelo time.",
        "Diretoria comercial",
        "Semanal",
        "Leads relevantes",
        metrics.qualifiedLeads + metrics.negotiationLeads + metrics.wonLeads,
        "integer",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/leads",
        ["pipeline", "coverage"],
      ),
    ],
  };

  const governanca: AdminReportsCategorySection = {
    id: "governanca",
    label: "Governanca e auditoria",
    description:
      "Controles de risco, acao sensivel, trilha administrativa e eventos de conformidade.",
    tone: "danger",
    icon: "ShieldCheck",
    highlights: [
      `${metrics.criticalActions} acao(oes) critica(s) no recorte`,
      `${metrics.riskSignals} sinal(is) de risco consolidado`,
      `${metrics.adminAuditEvents + metrics.tenantAuditEvents} log(s) auditaveis`,
    ],
    primaryMetricLabel: "Acoes criticas",
    primaryMetricValue: metrics.criticalActions,
    primaryMetricFormat: "integer",
    items: [
      createCatalogItem(
        "governanca-auditoria-admin",
        "Auditoria administrativa",
        "Acoes executadas pela camada super admin no recorte.",
        "Compliance / Diretoria",
        "Diaria",
        "Logs admin",
        metrics.adminAuditEvents,
        "integer",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/auditoria",
        ["audit", "super-admin"],
      ),
      createCatalogItem(
        "governanca-auditoria-tenant",
        "Auditoria dos tenants",
        "Eventos auditaveis gerados dentro dos escritorios.",
        "Compliance / Operacoes",
        "Diaria",
        "Logs tenant",
        metrics.tenantAuditEvents,
        "integer",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/auditoria",
        ["audit", "tenant"],
      ),
      createCatalogItem(
        "governanca-acoes-criticas",
        "Acoes sensiveis",
        "Deletes, cancelamentos, suspensoes e mudancas de alto impacto.",
        "Compliance / Diretoria",
        "Diaria",
        "Acoes criticas",
        metrics.criticalActions,
        "integer",
        ["CSV", "XLSX", "PDF"],
        metrics.criticalActions > 0 ? "ATENCAO" : "DISPONIVEL",
        "/admin/auditoria",
        ["critical", "security"],
      ),
      createCatalogItem(
        "governanca-risco-consolidado",
        "Risco operacional consolidado",
        "Concentrador de cobranca, SLA e tenants sensiveis.",
        "Diretoria / PMO",
        "Diaria",
        "Sinais de risco",
        metrics.riskSignals,
        "integer",
        ["CSV", "XLSX", "PDF"],
        metrics.riskSignals > 0 ? "ATENCAO" : "DISPONIVEL",
        "/admin/dashboard",
        ["risk", "ops"],
      ),
      createCatalogItem(
        "governanca-tenant-sensivel",
        "Tenants com status sensivel",
        "Lista de suspensos e cancelados para revisao de impacto.",
        "Diretoria / CS",
        "Diaria",
        "Tenants sensiveis",
        metrics.suspendedTenants + metrics.cancelledTenants,
        "integer",
        ["CSV", "XLSX", "PDF"],
        metrics.suspendedTenants + metrics.cancelledTenants > 0
          ? "ATENCAO"
          : "DISPONIVEL",
        "/admin/tenants",
        ["tenant", "status"],
      ),
      createCatalogItem(
        "governanca-cobranca-risco",
        "Cobranca em risco",
        "Titulos em aberto e vencidos que exigem atencao de caixa.",
        "Financeiro / Diretoria",
        "Diaria",
        "Titulos sensiveis",
        metrics.openInvoices + metrics.overdueInvoices,
        "integer",
        ["CSV", "XLSX", "PDF"],
        metrics.openInvoices + metrics.overdueInvoices > 0
          ? "ATENCAO"
          : "DISPONIVEL",
        "/admin/financeiro",
        ["billing", "risk"],
      ),
      createCatalogItem(
        "governanca-sla",
        "Governanca de SLA",
        "Visao para auditoria do atendimento com foco em rompimentos.",
        "Compliance / Suporte",
        "Diaria",
        "SLAs rompidos",
        metrics.slaBreached,
        "integer",
        ["CSV", "XLSX", "PDF"],
        metrics.slaBreached > 0 ? "ATENCAO" : "DISPONIVEL",
        "/admin/suporte",
        ["sla", "audit"],
      ),
      createCatalogItem(
        "governanca-base-auditavel",
        "Base auditavel consolidada",
        "Leitura para export formal do que ocorreu na plataforma.",
        "Juridio / Compliance",
        "Semanal",
        "Eventos auditaveis",
        metrics.adminAuditEvents + metrics.tenantAuditEvents,
        "integer",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/auditoria",
        ["compliance", "export"],
      ),
    ],
  };

  const externos: AdminReportsCategorySection = {
    id: "externos",
    label: "Entregaveis externos e premium",
    description:
      "Relatorios que sustentam loja interna, valor percebido e entregas para tenants.",
    tone: "secondary",
    icon: "Globe",
    highlights: [
      `${metrics.activePackageSubscriptions} pacote(s) premium ativos`,
      `${metrics.authorityUnlocks} autoridade(s) desbloqueada(s)`,
      `${metrics.inpiDossiers} dossie(s) de marca monitorados`,
    ],
    primaryMetricLabel: "Assinaturas premium",
    primaryMetricValue: metrics.activePackageSubscriptions,
    primaryMetricFormat: "integer",
    items: [
      createCatalogItem(
        "externo-loja-premium",
        "Vendas da loja premium",
        "Leitura de adesao de pacotes vendidos dentro da plataforma.",
        "Produto / Financeiro",
        "Semanal",
        "Assinaturas premium",
        metrics.activePackageSubscriptions,
        "integer",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/pacotes",
        ["premium", "store"],
      ),
      createCatalogItem(
        "externo-receita-premium",
        "Receita premium consolidada",
        "Receita incremental capturada com pacotes e add-ons.",
        "Diretoria / Produto",
        "Semanal",
        "Receita premium",
        metrics.premiumRevenue,
        "currency",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/financeiro",
        ["premium", "upsell"],
      ),
      createCatalogItem(
        "externo-inteligencia-juizes",
        "Uso de inteligencia sobre autoridades",
        "Volume de autoridades desbloqueadas por tenants compradores.",
        "Produto / CS",
        "Semanal",
        "Autoridades liberadas",
        metrics.authorityUnlocks,
        "integer",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/juizes",
        ["juizes", "premium"],
      ),
      createCatalogItem(
        "externo-relatorio-tenant",
        "Resumo executivo por escritorio",
        "Modelo de deliverable externo com recorte por tenant selecionado.",
        "CS / Diretoria",
        "Mensal",
        "Tenants ativos",
        metrics.activeTenants,
        "integer",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/tenants",
        ["tenant", "executive"],
      ),
      createCatalogItem(
        "externo-financeiro-tenant",
        "Extrato financeiro por tenant",
        "Base para prestar contas de cobranca e receita por escritorio.",
        "CS / Financeiro",
        "Mensal",
        "Assinaturas ativas",
        metrics.activeSubscriptions,
        "integer",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/financeiro",
        ["tenant", "billing"],
      ),
      createCatalogItem(
        "externo-sla-tenant",
        "SLA por escritorio",
        "Recorte para mostrar qualidade de atendimento por tenant.",
        "CS / Suporte",
        "Mensal",
        "Tickets monitorados",
        metrics.openTickets,
        "integer",
        ["CSV", "XLSX", "PDF"],
        "DISPONIVEL",
        "/admin/suporte",
        ["tenant", "sla"],
      ),
      createCatalogItem(
        "externo-inpi",
        "Viabilidade de marca / INPI",
        "Dossies e buscas de marca com valor percebido consultivo.",
        "Produto / Comercial",
        "Sob demanda",
        "Dossies INPI",
        metrics.inpiDossiers,
        "integer",
        ["CSV", "XLSX", "PDF"],
        metrics.inpiCriticalRisk > 0 ? "ATENCAO" : "DISPONIVEL",
        "/admin/causas",
        ["inpi", "marca"],
      ),
      createCatalogItem(
        "externo-risco-marca",
        "Radar critico de marcas",
        "Casos de colisao critica que podem exigir tratativa consultiva.",
        "Comercial / Operacoes",
        "Sob demanda",
        "Riscos criticos",
        metrics.inpiCriticalRisk,
        "integer",
        ["CSV", "XLSX", "PDF"],
        metrics.inpiCriticalRisk > 0 ? "ATENCAO" : "DISPONIVEL",
        "/admin/causas",
        ["inpi", "risco"],
      ),
    ],
  };

  return [
    financeiro,
    tenants,
    suporte,
    operacao,
    comercial,
    governanca,
    externos,
  ];
}
