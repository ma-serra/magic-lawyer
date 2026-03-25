"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

const PRESENCE_HEARTBEAT_MS = 45 * 1000;

async function sendPresenceHeartbeat() {
  try {
    await fetch("/api/session/presence", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    // heartbeat best effort
  }
}

export function useSessionPresenceHeartbeat() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id;

  useEffect(() => {
    if (status !== "authenticated" || !userId) {
      return;
    }

    let isCancelled = false;

    const heartbeat = () => {
      if (isCancelled) {
        return;
      }

      void sendPresenceHeartbeat();
    };

    heartbeat();

    const interval = window.setInterval(heartbeat, PRESENCE_HEARTBEAT_MS);
    const onFocus = () => heartbeat();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        heartbeat();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      isCancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [status, userId]);
}
