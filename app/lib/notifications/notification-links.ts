type NotificationPayload = Record<string, unknown>;

export type NotificationTenantContext =
  | {
      slug: string | null;
      domain: string | null;
      branding: { customDomainText: string | null } | null;
    }
  | null
  | undefined;

function readNotificationString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getDefaultBaseUrl() {
  return (
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://magiclawyer.vercel.app"
  );
}

function getProtocol(raw: string) {
  try {
    const url = new URL(
      raw.startsWith("http://") || raw.startsWith("https://")
        ? raw
        : `https://${raw}`,
    );

    return url.protocol || "https:";
  } catch {
    return "https:";
  }
}

function ensureProtocol(value: string, protocol: string) {
  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `${protocol}//${value}`;
}

export function resolveTenantBaseUrl(
  tenant?: NotificationTenantContext,
): string | undefined {
  const defaultBase = getDefaultBaseUrl();
  const protocol = getProtocol(defaultBase);
  const candidateDomain =
    tenant?.branding?.customDomainText?.trim() || tenant?.domain?.trim();

  if (candidateDomain) {
    return ensureProtocol(candidateDomain, protocol);
  }

  if (tenant?.slug) {
    try {
      const base = new URL(
        defaultBase.startsWith("http://") || defaultBase.startsWith("https://")
          ? defaultBase
          : `https://${defaultBase}`,
      );
      const host = base.host;
      const baseProtocol = base.protocol || "https:";

      return `${baseProtocol}//${tenant.slug}.${host}`;
    } catch {
      return ensureProtocol(defaultBase, protocol);
    }
  }

  return ensureProtocol(defaultBase, protocol);
}

export function resolveNotificationPath(
  notificationType: string,
  payload: NotificationPayload,
) {
  const securityActionUrl = readNotificationString(payload.securityActionUrl);

  if (securityActionUrl) {
    return securityActionUrl;
  }

  const processoId = readNotificationString(payload.processoId);
  const clienteId = readNotificationString(payload.clienteId);
  const prazoId = readNotificationString(payload.prazoId);
  const eventoId =
    readNotificationString(payload.eventoId) ||
    readNotificationString(payload.referenciaId);
  const referenciaTipo = readNotificationString(payload.referenciaTipo);

  if (
    notificationType === "prazo.digest_30d" ||
    notificationType === "prazo.digest_10d"
  ) {
    return "/prazos";
  }

  if (
    (notificationType.startsWith("prazo.") || referenciaTipo === "prazo") &&
    processoId
  ) {
    return prazoId
      ? `/processos/${processoId}?tab=prazos&prazoId=${encodeURIComponent(
          prazoId,
        )}`
      : `/processos/${processoId}?tab=prazos`;
  }

  if (
    (notificationType.startsWith("andamento.") ||
      notificationType.startsWith("movimentacao.") ||
      referenciaTipo === "movimentacao" ||
      referenciaTipo === "andamento") &&
    processoId
  ) {
    return `/processos/${processoId}?tab=eventos`;
  }

  if (notificationType === "documento.uploaded" && processoId) {
    return `/processos/${processoId}?tab=documentos`;
  }

  if (
    notificationType.startsWith("evento.") ||
    referenciaTipo === "evento"
  ) {
    return eventoId ? `/agenda/${encodeURIComponent(eventoId)}` : "/agenda";
  }

  if (processoId) {
    return `/processos/${processoId}`;
  }

  if (clienteId) {
    return `/clientes/${clienteId}`;
  }

  return "/dashboard";
}

export function resolveNotificationUrl(
  notificationType: string,
  payload: NotificationPayload,
  baseUrl?: string,
) {
  const path = resolveNotificationPath(notificationType, payload);

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  if (!baseUrl) {
    return path;
  }

  const normalizedBase = baseUrl.replace(/\/+$/, "");

  return `${normalizedBase}${path.startsWith("/") ? path : `/${path}`}`;
}

export function resolveNotificationActionText(
  notificationType: string,
  payload: NotificationPayload,
) {
  switch (notificationType) {
    case "processo.created":
    case "processo.updated":
    case "processo.status_changed":
      return "Ver processo";

    case "prazo.digest_30d":
    case "prazo.digest_10d":
      return "Revisar lista de prazos";

    case "prazo.expiring":
    case "prazo.expiring_7d":
    case "prazo.expiring_3d":
    case "prazo.expiring_1d":
    case "prazo.expiring_2h":
    case "prazo.expired":
    case "prazo.created":
    case "prazo.updated":
      return readNotificationString(payload.prazoId) ? "Abrir prazo" : "Ver prazos";

    case "documento.uploaded":
      return "Ver documento";

    case "pagamento.paid":
    case "pagamento.pending":
    case "pagamento.overdue":
      return "Ver financeiro";

    case "evento.created":
    case "evento.updated":
    case "evento.cancelled":
    case "evento.confirmation_updated":
    case "evento.reminder_1h":
    case "evento.reminder_1d":
    case "evento.reminder_custom":
    case "evento.google_synced":
      return "Ver evento";

    case "andamento.created":
    case "andamento.updated":
      return "Ver andamento";

    case "access.login_new":
      return "Nao fui eu";

    default:
      return "Acessar plataforma";
  }
}
