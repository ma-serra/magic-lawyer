"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { BellRing } from "lucide-react";

import { useRealtime } from "@/app/providers/realtime-provider";
import { NOTIFICATION_CENTER_OPEN_EVENT } from "@/app/lib/notifications/ui-events";
import { toast } from "@/lib/toast";

type IncomingRealtimeNotification = {
  id: string;
  userId: string | null;
  title: string;
  message: string;
  urgency: string | null;
};

type BrowserAudioContext = AudioContext;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function getAudioContextCtor():
  | (new () => BrowserAudioContext)
  | null {
  if (typeof window === "undefined") {
    return null;
  }

  const windowWithWebkit = window as typeof window & {
    webkitAudioContext?: new () => BrowserAudioContext;
  };

  return window.AudioContext || windowWithWebkit.webkitAudioContext || null;
}

function ensureAudioContext(
  audioContextRef: React.MutableRefObject<BrowserAudioContext | null>,
) {
  if (audioContextRef.current) {
    return audioContextRef.current;
  }

  const AudioContextCtor = getAudioContextCtor();

  if (!AudioContextCtor) {
    return null;
  }

  const nextContext = new AudioContextCtor();

  audioContextRef.current = nextContext;

  return nextContext;
}

async function playNotificationSound(
  audioContextRef: React.MutableRefObject<BrowserAudioContext | null>,
) {
  const audioContext = ensureAudioContext(audioContextRef);

  if (!audioContext) {
    return;
  }

  if (audioContext.state !== "running") {
    try {
      await audioContext.resume();
    } catch {
      return;
    }
  }

  const startAt = audioContext.currentTime + 0.01;
  const gain = audioContext.createGain();

  gain.connect(audioContext.destination);
  gain.gain.setValueAtTime(0.0001, startAt);

  const notes = [
    { frequency: 987.77, offset: 0, duration: 0.08 },
    { frequency: 1318.51, offset: 0.1, duration: 0.12 },
  ];

  notes.forEach((note) => {
    const oscillator = audioContext.createOscillator();
    const noteStart = startAt + note.offset;
    const noteEnd = noteStart + note.duration;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(note.frequency, noteStart);
    oscillator.connect(gain);

    gain.gain.cancelScheduledValues(noteStart);
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(0.08, noteStart + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

    oscillator.start(noteStart);
    oscillator.stop(noteEnd);
  });

  window.setTimeout(() => {
    try {
      gain.disconnect();
    } catch {
    }
  }, 400);
}

function extractNotificationFromEvent(
  event: {
    userId: string | null;
    payload: Record<string, unknown>;
  },
): IncomingRealtimeNotification | null {
  const envelope = asRecord(event.payload);
  const notification = asRecord(envelope.payload);
  const id = asText(notification.id);

  if (!id) {
    return null;
  }

  return {
    id,
    userId: asText(event.userId) || asText(envelope.userId),
    title: asText(notification.title) || "Nova notificacao",
    message: asText(notification.message) || "Voce recebeu uma nova atualizacao.",
    urgency: asText(notification.urgency),
  };
}

function resolveToastMethod(urgency: string | null) {
  switch (urgency) {
    case "CRITICAL":
    case "HIGH":
      return toast.warning;
    default:
      return toast;
  }
}

export function InAppNotificationAnnouncer() {
  const { data: session } = useSession();
  const { subscribe } = useRealtime();
  const seenNotificationsRef = useRef<Set<string>>(new Set());
  const audioContextRef = useRef<BrowserAudioContext | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const prepareAudio = () => {
      const audioContext = ensureAudioContext(audioContextRef);

      if (!audioContext || audioContext.state === "running") {
        return;
      }

      void audioContext.resume().catch(() => undefined);
    };

    window.addEventListener("pointerdown", prepareAudio, { capture: true });
    window.addEventListener("keydown", prepareAudio, { capture: true });

    return () => {
      window.removeEventListener("pointerdown", prepareAudio, {
        capture: true,
      });
      window.removeEventListener("keydown", prepareAudio, {
        capture: true,
      });
    };
  }, []);

  useEffect(() => {
    const currentUserId = session?.user?.id;

    if (!currentUserId) {
      return;
    }

    const unsubscribe = subscribe("notification.new", (event) => {
      const incomingNotification = extractNotificationFromEvent(event);

      if (!incomingNotification) {
        return;
      }

      if (
        incomingNotification.userId &&
        incomingNotification.userId !== currentUserId
      ) {
        return;
      }

      if (seenNotificationsRef.current.has(incomingNotification.id)) {
        return;
      }

      seenNotificationsRef.current.add(incomingNotification.id);

      if (seenNotificationsRef.current.size > 100) {
        const firstSeenId = seenNotificationsRef.current.values().next().value;

        if (typeof firstSeenId === "string") {
          seenNotificationsRef.current.delete(firstSeenId);
        }
      }

      void playNotificationSound(audioContextRef);

      const notify = resolveToastMethod(incomingNotification.urgency);

      notify(incomingNotification.title, {
        description: incomingNotification.message,
        duration: 7000,
        icon: <BellRing className="h-4 w-4" />,
        action: {
          label: "Abrir",
          onClick: () => {
            window.dispatchEvent(
              new CustomEvent(NOTIFICATION_CENTER_OPEN_EVENT),
            );
          },
        },
      });
    });

    return unsubscribe;
  }, [session?.user?.id, subscribe]);

  useEffect(() => {
    return () => {
      if (!audioContextRef.current) {
        return;
      }

      void audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    };
  }, []);

  return null;
}
