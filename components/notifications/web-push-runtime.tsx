"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

import {
  getMyWebPushStatus,
  registerMyWebPushSubscription,
} from "@/app/actions/notifications";
import {
  ensureWebPushSubscription,
  getBrowserPushPermission,
  isWebPushSupported,
} from "@/app/lib/notifications/web-push-client";

export function WebPushRuntime() {
  const { data: session, status } = useSession();
  const didSyncRef = useRef(false);

  useEffect(() => {
    if (status !== "authenticated") {
      didSyncRef.current = false;
      return;
    }

    const userId = (session?.user as { id?: string | null } | undefined)?.id;
    const tenantId = (session?.user as { tenantId?: string | null } | undefined)
      ?.tenantId;

    if (!userId || !tenantId || didSyncRef.current || !isWebPushSupported()) {
      return;
    }

    if (getBrowserPushPermission() !== "granted") {
      return;
    }

    let cancelled = false;

    const syncSubscription = async () => {
      try {
        const pushStatus = await getMyWebPushStatus();

        if (
          cancelled ||
          !pushStatus.success ||
          !pushStatus.configured ||
          !pushStatus.publicKey
        ) {
          return;
        }

        const subscription = await ensureWebPushSubscription({
          publicKey: pushStatus.publicKey,
          requestPermission: false,
        });

        if (!subscription || cancelled) {
          return;
        }

        await registerMyWebPushSubscription(subscription);
        didSyncRef.current = true;
      } catch (error) {
        console.warn("[WebPushRuntime] Falha ao sincronizar subscription", error);
      }
    };

    void syncSubscription();

    return () => {
      cancelled = true;
    };
  }, [session, status]);

  return null;
}
