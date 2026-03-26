export interface AdminSecurityEventSource {
  id: string;
  createdAt: string;
  tenantId: string | null;
  tenantName: string | null;
  tenantSlug: string | null;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  status: string;
  ipAddress: string | null;
  userAgent: string | null;
  payload?: unknown;
}

export interface AdminSecurityNotificationSource {
  id: string;
  createdAt: string;
  tenantId: string;
  tenantName: string | null;
  tenantSlug: string | null;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  type: string;
  readAt: string | null;
  deliveries: Array<{
    channel: string;
    status: string;
  }>;
}

export interface AdminSecurityRecentAccess {
  id: string;
  createdAt: string;
  tenantName: string;
  tenantSlug: string | null;
  actorName: string;
  actorEmail: string | null;
  action: string;
  status: string;
  ipAddress: string | null;
  locationLabel: string;
  deviceLabel: string;
  isKnownAccess: boolean | null;
}

export interface AdminSecurityUserRanking {
  actorId: string | null;
  tenantId: string | null;
  tenantName: string;
  tenantSlug: string | null;
  name: string;
  email: string | null;
  total: number;
  lastAt: string;
}

export interface AdminSecurityNotificationRecipient {
  userId: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string | null;
  name: string;
  email: string | null;
  notifications: number;
  read: number;
  emailSent: number;
  telegramSent: number;
  realtimeSent: number;
  pushSent: number;
  lastAt: string;
}

export interface AdminSecurityDeliveryByChannel {
  channel: string;
  notifications: number;
  sent: number;
  failed: number;
  read: number;
}

export interface AdminSecurityLocationRanking {
  label: string;
  total: number;
  uniqueUsers: number;
}

export interface AdminSecurityDashboardData {
  summary: {
    loginSuccesses: number;
    loginRejected: number;
    uniqueUsers: number;
    passwordChanges: number;
    incidentResponses: number;
    securityNotifications: number;
    notificationsRead: number;
    emailDeliveriesSent: number;
    emailDeliveriesFailed: number;
    readRate: number;
  };
  recentAccesses: AdminSecurityRecentAccess[];
  topAccessUsers: AdminSecurityUserRanking[];
  topPasswordChanges: AdminSecurityUserRanking[];
  notificationRecipients: AdminSecurityNotificationRecipient[];
  deliveryByChannel: AdminSecurityDeliveryByChannel[];
  topLocations: AdminSecurityLocationRanking[];
}

const PASSWORD_ACTIONS = new Set(["PASSWORD_CHANGED", "PASSWORD_DEFINED"]);
const INCIDENT_ACTIONS = new Set([
  "ACCESS_INCIDENT_REPORTED",
  "PASSWORD_RESET_FORCED",
  "SESSION_REVOKED_BY_SECURITY",
]);
const DELIVERED_STATUSES = new Set(["SENT", "DELIVERED", "READ"]);

function toTimestamp(value: string) {
  return new Date(value).getTime();
}

function asPayloadRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, unknown>;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function buildActorLabel(params: {
  actorName?: string | null;
  actorEmail?: string | null;
  actorId?: string | null;
}) {
  return params.actorName || params.actorEmail || params.actorId || "Ator desconhecido";
}

function buildTenantLabel(params: { tenantName?: string | null; tenantId?: string | null }) {
  return params.tenantName || (params.tenantId ? "Tenant sem nome" : "Magic Lawyer");
}

function aggregateUserRankings(events: AdminSecurityEventSource[]) {
  const map = new Map<string, AdminSecurityUserRanking>();

  for (const event of events) {
    const key =
      event.actorId ||
      `${event.tenantId || "global"}:${event.actorEmail || event.actorName || event.id}`;
    const current = map.get(key);
    const name = buildActorLabel({
      actorName: event.actorName,
      actorEmail: event.actorEmail,
      actorId: event.actorId,
    });
    const tenantName = buildTenantLabel({
      tenantName: event.tenantName,
      tenantId: event.tenantId,
    });

    if (!current) {
      map.set(key, {
        actorId: event.actorId,
        tenantId: event.tenantId,
        tenantName,
        tenantSlug: event.tenantSlug,
        name,
        email: event.actorEmail,
        total: 1,
        lastAt: event.createdAt,
      });
      continue;
    }

    current.total += 1;
    if (toTimestamp(event.createdAt) > toTimestamp(current.lastAt)) {
      current.lastAt = event.createdAt;
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => b.total - a.total || toTimestamp(b.lastAt) - toTimestamp(a.lastAt),
  );
}

export function buildAdminSecurityDashboard(params: {
  accessEvents: AdminSecurityEventSource[];
  securityNotifications: AdminSecurityNotificationSource[];
}): AdminSecurityDashboardData {
  const loginSuccessEvents = params.accessEvents.filter(
    (event) => event.action === "LOGIN_SUCCESS" && event.status === "SUCCESS",
  );
  const loginRejectedEvents = params.accessEvents.filter(
    (event) => event.action === "LOGIN_REJECTED",
  );
  const passwordEvents = params.accessEvents.filter((event) =>
    PASSWORD_ACTIONS.has(event.action),
  );
  const incidentEvents = params.accessEvents.filter((event) =>
    INCIDENT_ACTIONS.has(event.action),
  );

  const uniqueUsers = new Set(
    loginSuccessEvents
      .map((event) => event.actorId || event.actorEmail)
      .filter((value): value is string => Boolean(value)),
  ).size;

  const recentAccesses = params.accessEvents
    .map((event) => {
      const payload = asPayloadRecord(event.payload);

      return {
        id: event.id,
        createdAt: event.createdAt,
        tenantName: buildTenantLabel({
          tenantName: event.tenantName,
          tenantId: event.tenantId,
        }),
        tenantSlug: event.tenantSlug,
        actorName: buildActorLabel({
          actorName: event.actorName,
          actorEmail: event.actorEmail,
          actorId: event.actorId,
        }),
        actorEmail: event.actorEmail,
        action: event.action,
        status: event.status,
        ipAddress: event.ipAddress,
        locationLabel:
          readString(payload.locationLabel) || "Localizacao nao identificada",
        deviceLabel:
          readString(payload.deviceLabel) ||
          readString(payload.userAgent) ||
          readString(event.userAgent) ||
          "Dispositivo nao identificado",
        isKnownAccess: readBoolean(payload.isKnownAccess),
      };
    })
    .sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt))
    .slice(0, 120);

  const topLocationsMap = new Map<
    string,
    { label: string; total: number; users: Set<string> }
  >();
  for (const event of recentAccesses) {
    const current =
      topLocationsMap.get(event.locationLabel) || {
        label: event.locationLabel,
        total: 0,
        users: new Set<string>(),
      };

    current.total += 1;
    if (event.actorEmail || event.actorName) {
      current.users.add(event.actorEmail || event.actorName);
    }
    topLocationsMap.set(event.locationLabel, current);
  }

  const topLocations = Array.from(topLocationsMap.values())
    .map((item) => ({
      label: item.label,
      total: item.total,
      uniqueUsers: item.users.size,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const deliveryChannelMap = new Map<string, AdminSecurityDeliveryByChannel>();
  const recipientMap = new Map<string, AdminSecurityNotificationRecipient>();
  let emailDeliveriesSent = 0;
  let emailDeliveriesFailed = 0;

  for (const notification of params.securityNotifications) {
    const recipientKey = `${notification.tenantId}:${notification.userId}`;
    const recipient =
      recipientMap.get(recipientKey) || {
        userId: notification.userId,
        tenantId: notification.tenantId,
        tenantName: buildTenantLabel({
          tenantName: notification.tenantName,
          tenantId: notification.tenantId,
        }),
        tenantSlug: notification.tenantSlug,
        name:
          notification.userName || notification.userEmail || notification.userId,
        email: notification.userEmail,
        notifications: 0,
        read: 0,
        emailSent: 0,
        telegramSent: 0,
        realtimeSent: 0,
        pushSent: 0,
        lastAt: notification.createdAt,
      };

    recipient.notifications += 1;
    if (notification.readAt) {
      recipient.read += 1;
    }
    if (toTimestamp(notification.createdAt) > toTimestamp(recipient.lastAt)) {
      recipient.lastAt = notification.createdAt;
    }

    for (const delivery of notification.deliveries) {
      const channelKey = delivery.channel || "REALTIME";
      const channelStats =
        deliveryChannelMap.get(channelKey) || {
          channel: channelKey,
          notifications: 0,
          sent: 0,
          failed: 0,
          read: 0,
        };

      channelStats.notifications += 1;
      if (DELIVERED_STATUSES.has(delivery.status)) {
        channelStats.sent += 1;
      }
      if (delivery.status === "FAILED") {
        channelStats.failed += 1;
      }
      if (delivery.status === "READ") {
        channelStats.read += 1;
      }
      deliveryChannelMap.set(channelKey, channelStats);

      if (channelKey === "EMAIL") {
        if (DELIVERED_STATUSES.has(delivery.status)) {
          recipient.emailSent += 1;
          emailDeliveriesSent += 1;
        } else if (delivery.status === "FAILED") {
          emailDeliveriesFailed += 1;
        }
      }

      if (channelKey === "TELEGRAM" && DELIVERED_STATUSES.has(delivery.status)) {
        recipient.telegramSent += 1;
      }
      if (channelKey === "REALTIME" && DELIVERED_STATUSES.has(delivery.status)) {
        recipient.realtimeSent += 1;
      }
      if (channelKey === "PUSH" && DELIVERED_STATUSES.has(delivery.status)) {
        recipient.pushSent += 1;
      }
    }

    recipientMap.set(recipientKey, recipient);
  }

  const notificationRecipients = Array.from(recipientMap.values()).sort(
    (a, b) =>
      b.notifications - a.notifications || toTimestamp(b.lastAt) - toTimestamp(a.lastAt),
  );
  const notificationsRead = params.securityNotifications.filter(
    (notification) => Boolean(notification.readAt),
  ).length;
  const readRate = params.securityNotifications.length
    ? notificationsRead / params.securityNotifications.length
    : 0;

  return {
    summary: {
      loginSuccesses: loginSuccessEvents.length,
      loginRejected: loginRejectedEvents.length,
      uniqueUsers,
      passwordChanges: passwordEvents.length,
      incidentResponses: incidentEvents.length,
      securityNotifications: params.securityNotifications.length,
      notificationsRead,
      emailDeliveriesSent,
      emailDeliveriesFailed,
      readRate,
    },
    recentAccesses,
    topAccessUsers: aggregateUserRankings(loginSuccessEvents).slice(0, 10),
    topPasswordChanges: aggregateUserRankings(passwordEvents).slice(0, 10),
    notificationRecipients: notificationRecipients.slice(0, 10),
    deliveryByChannel: Array.from(deliveryChannelMap.values()).sort(
      (a, b) => b.notifications - a.notifications,
    ),
    topLocations,
  };
}
