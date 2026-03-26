self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function resolveTargetUrl(data, action) {
  if (action === "security-review" && data.securityActionUrl) {
    return data.securityActionUrl;
  }

  if (typeof data.url === "string" && data.url) {
    return data.url;
  }

  return "/";
}

self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  let payload = {
    title: "Magic Lawyer",
    body: "Voce recebeu uma nova notificacao.",
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    data: {
      url: "/dashboard",
    },
    actions: [],
  };

  try {
    payload = {
      ...payload,
      ...event.data.json(),
    };
  } catch (error) {
    try {
      payload.body = event.data.text();
    } catch (innerError) {
      payload.body = "Voce recebeu uma nova notificacao.";
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      badge: payload.badge,
      tag: payload.tag,
      data: payload.data,
      renotify: Boolean(payload.renotify),
      requireInteraction: Boolean(payload.requireInteraction),
      actions: Array.isArray(payload.actions) ? payload.actions : [],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data =
    event.notification && typeof event.notification.data === "object"
      ? event.notification.data
      : {};
  const targetUrl = resolveTargetUrl(data || {}, event.action);

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          const clientUrl = new URL(client.url);
          const requestedUrl = new URL(targetUrl, self.location.origin);

          if (clientUrl.origin === requestedUrl.origin) {
            client.postMessage({
              type: "notification-click",
              action: event.action || "open",
              targetUrl: requestedUrl.toString(),
            });

            return client.focus().then(() => {
              if ("navigate" in client) {
                return client.navigate(requestedUrl.toString());
              }

              return undefined;
            });
          }
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    }),
  );
});
