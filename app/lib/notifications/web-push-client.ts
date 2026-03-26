export type BrowserPushPermission = NotificationPermission | "unsupported";

export type BrowserWebPushSubscription = {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent: string | null;
  deviceLabel: string;
  browserName: string | null;
  osName: string | null;
};

const WEB_PUSH_SERVICE_WORKER_URL = "/web-push-sw.js";

function readSubscriptionKey(
  subscription: PushSubscription,
  keyName: PushEncryptionKeyName,
) {
  const value = subscription.getKey(keyName);

  if (!value) {
    return null;
  }

  const bytes = new Uint8Array(value);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const normalized = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(normalized);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

function detectBrowserName(userAgent: string) {
  const source = userAgent.toLowerCase();

  if (source.includes("edg/")) {
    return "Edge";
  }

  if (source.includes("opr/") || source.includes("opera")) {
    return "Opera";
  }

  if (source.includes("firefox/")) {
    return "Firefox";
  }

  if (source.includes("safari/") && !source.includes("chrome/")) {
    return "Safari";
  }

  if (source.includes("chrome/")) {
    return "Chrome";
  }

  return null;
}

function detectOsName(userAgent: string) {
  const source = userAgent.toLowerCase();

  if (source.includes("windows")) {
    return "Windows";
  }

  if (source.includes("android")) {
    return "Android";
  }

  if (source.includes("iphone") || source.includes("ipad") || source.includes("ios")) {
    return "iOS";
  }

  if (source.includes("mac os") || source.includes("macintosh")) {
    return "macOS";
  }

  if (source.includes("linux")) {
    return "Linux";
  }

  return null;
}

function buildDeviceLabel(userAgent: string) {
  const browserName = detectBrowserName(userAgent) || "Navegador";
  const osName = detectOsName(userAgent) || "SO desconhecido";
  const deviceType =
    userAgent.toLowerCase().includes("mobile") ||
    userAgent.toLowerCase().includes("iphone") ||
    userAgent.toLowerCase().includes("android")
      ? "Mobile"
      : userAgent.toLowerCase().includes("ipad") ||
          userAgent.toLowerCase().includes("tablet")
        ? "Tablet"
        : "Desktop";

  return `${browserName} · ${osName} · ${deviceType}`;
}

function serializeSubscription(
  subscription: PushSubscription,
): BrowserWebPushSubscription {
  const userAgent =
    typeof navigator !== "undefined" ? navigator.userAgent || null : null;
  const browserName = userAgent ? detectBrowserName(userAgent) : null;
  const osName = userAgent ? detectOsName(userAgent) : null;

  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime,
    keys: {
      p256dh: readSubscriptionKey(subscription, "p256dh") || "",
      auth: readSubscriptionKey(subscription, "auth") || "",
    },
    userAgent,
    deviceLabel: buildDeviceLabel(userAgent || ""),
    browserName,
    osName,
  };
}

export function isWebPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getBrowserPushPermission(): BrowserPushPermission {
  if (!isWebPushSupported()) {
    return "unsupported";
  }

  return Notification.permission;
}

export async function getWebPushRegistration() {
  if (!isWebPushSupported()) {
    throw new Error("Web Push nao suportado neste navegador.");
  }

  const registration = await navigator.serviceWorker.register(
    WEB_PUSH_SERVICE_WORKER_URL,
    {
      scope: "/",
      updateViaCache: "none",
    },
  );

  await navigator.serviceWorker.ready;

  return registration;
}

export async function getCurrentWebPushSubscription() {
  if (!isWebPushSupported()) {
    return null;
  }

  const registration = await getWebPushRegistration();
  const subscription = await registration.pushManager.getSubscription();

  return subscription ? serializeSubscription(subscription) : null;
}

export async function ensureWebPushSubscription(params: {
  publicKey: string;
  requestPermission?: boolean;
}) {
  if (!isWebPushSupported()) {
    throw new Error("Web Push nao suportado neste navegador.");
  }

  const currentPermission = Notification.permission;

  if (currentPermission === "denied") {
    throw new Error(
      "O navegador bloqueou as notificacoes. Libere a permissao para este site nas configuracoes do navegador.",
    );
  }

  if (currentPermission === "default" && params.requestPermission !== false) {
    const granted = await Notification.requestPermission();

    if (granted !== "granted") {
      throw new Error("Permissao de notificacao nao concedida.");
    }
  } else if (currentPermission !== "granted") {
    return null;
  }

  const registration = await getWebPushRegistration();
  const existingSubscription = await registration.pushManager.getSubscription();

  if (existingSubscription) {
    return serializeSubscription(existingSubscription);
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(params.publicKey),
  });

  return serializeSubscription(subscription);
}

export async function unsubscribeCurrentWebPushSubscription() {
  if (!isWebPushSupported()) {
    return null;
  }

  const registration = await getWebPushRegistration();
  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    return null;
  }

  const endpoint = subscription.endpoint;

  await subscription.unsubscribe();

  return endpoint;
}
