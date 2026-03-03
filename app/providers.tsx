"use client";

import type { ThemeProviderProps } from "next-themes";

import * as React from "react";
import { HeroUIProvider } from "@heroui/system";
import { useRouter } from "next/navigation";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { ToastProvider } from "@heroui/toast";
import { SessionProvider } from "next-auth/react";

import { RealtimeProvider } from "./providers/realtime-provider";

export interface ProvidersProps {
  children: React.ReactNode;
  themeProps?: ThemeProviderProps;
}

declare module "@react-types/shared" {
  interface RouterConfig {
    routerOptions: NonNullable<
      Parameters<ReturnType<typeof useRouter>["push"]>[1]
    >;
  }
}

export function Providers({ children, themeProps }: ProvidersProps) {
  const router = useRouter();

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const ANIMATION_MS = 560;
    const INTERACTIVE_SELECTOR =
      "button,a,input,select,textarea,[role='menuitem'],[role='checkbox'],[data-stop-card-press='true']";

    const triggerWave = (surface: HTMLElement, x: number, y: number) => {
      const rect = surface.getBoundingClientRect();

      surface.style.setProperty("--ml-wave-x", `${x - rect.left}px`);
      surface.style.setProperty("--ml-wave-y", `${y - rect.top}px`);

      surface.removeAttribute("data-pressed");
      // Force reflow para reiniciar animação em cliques sucessivos.
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      surface.offsetWidth;
      surface.setAttribute("data-pressed", "true");

      window.setTimeout(() => {
        surface.removeAttribute("data-pressed");
      }, ANIMATION_MS);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;

      const surface = event.target.closest(".ml-wave-surface");
      if (!(surface instanceof HTMLElement)) return;

      const interactive = event.target.closest(INTERACTIVE_SELECTOR);

      if (interactive instanceof HTMLElement && interactive !== surface) {
        return;
      }

      triggerWave(surface, event.clientX, event.clientY);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (!(event.target instanceof HTMLElement)) return;
      if (!event.target.classList.contains("ml-wave-surface")) return;

      const rect = event.target.getBoundingClientRect();
      triggerWave(
        event.target,
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
    };

    window.addEventListener("pointerdown", handlePointerDown, { capture: true });
    window.addEventListener("keydown", handleKeyDown, { capture: true });

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, {
        capture: true,
      });
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, []);

  return (
    <HeroUIProvider navigate={router.push}>
      <SessionProvider>
        <RealtimeProvider>
          <NextThemesProvider {...themeProps}>{children}</NextThemesProvider>
          <ToastProvider placement="top-right" />
        </RealtimeProvider>
      </SessionProvider>
    </HeroUIProvider>
  );
}
