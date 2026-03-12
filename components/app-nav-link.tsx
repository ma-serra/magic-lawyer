"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  type ComponentPropsWithoutRef,
} from "react";

import type { AuthenticatedNavPrefetchStrategy } from "@/app/lib/navigation/prefetch-policy";

type AppNavLinkBaseProps = Omit<
  ComponentPropsWithoutRef<typeof Link>,
  "href" | "prefetch"
>;

export interface AppNavLinkProps extends AppNavLinkBaseProps {
  href: string;
  prefetchStrategy?: AuthenticatedNavPrefetchStrategy;
}

const prefetchedHrefs = new Set<string>();

function canIntentPrefetch() {
  if (typeof navigator === "undefined") {
    return true;
  }

  const connection = (
    navigator as Navigator & {
      connection?: { effectiveType?: string; saveData?: boolean };
    }
  ).connection;

  if (!connection) {
    return true;
  }

  if (connection.saveData) {
    return false;
  }

  return connection.effectiveType !== "slow-2g" && connection.effectiveType !== "2g";
}

function isPrefetchableHref(href: string, target?: string) {
  if (!href.startsWith("/")) {
    return false;
  }

  return !target || target === "_self";
}

export const AppNavLink = forwardRef<HTMLAnchorElement, AppNavLinkProps>(
  function AppNavLink(
    {
      href,
      onFocus,
      onMouseEnter,
      onTouchStart,
      prefetchStrategy = "intent",
      target,
      ...props
    },
    ref,
  ) {
    const router = useRouter();
    const scheduledHandleRef = useRef<
      | { kind: "idle"; handle: number }
      | { kind: "timeout"; handle: ReturnType<typeof setTimeout> }
      | null
    >(null);

    const runIntentPrefetch = useCallback(() => {
      if (prefetchStrategy !== "intent") {
        return;
      }

      if (!isPrefetchableHref(href, target) || !canIntentPrefetch()) {
        return;
      }

      if (prefetchedHrefs.has(href)) {
        return;
      }

      prefetchedHrefs.add(href);
      router.prefetch(href);
    }, [href, prefetchStrategy, router, target]);

    const scheduleIntentPrefetch = useCallback(() => {
      if (prefetchStrategy !== "intent") {
        return;
      }

      if (
        !isPrefetchableHref(href, target) ||
        prefetchedHrefs.has(href) ||
        typeof window === "undefined"
      ) {
        return;
      }

      if ("requestIdleCallback" in window) {
        scheduledHandleRef.current = {
          kind: "idle",
          handle: window.requestIdleCallback(() => {
            scheduledHandleRef.current = null;
            runIntentPrefetch();
          }),
        };
        return;
      }

      scheduledHandleRef.current = {
        kind: "timeout",
        handle: globalThis.setTimeout(() => {
          scheduledHandleRef.current = null;
          runIntentPrefetch();
        }, 0),
      };
    }, [href, prefetchStrategy, runIntentPrefetch, target]);

    useEffect(() => {
      return () => {
        if (scheduledHandleRef.current === null || typeof window === "undefined") {
          return;
        }

        if (
          scheduledHandleRef.current.kind === "idle" &&
          "cancelIdleCallback" in window
        ) {
          window.cancelIdleCallback(scheduledHandleRef.current.handle);
          return;
        }

        globalThis.clearTimeout(scheduledHandleRef.current.handle);
      };
    }, []);

    return (
      <Link
        {...props}
        ref={ref}
        href={href}
        prefetch={prefetchStrategy === "viewport" ? "auto" : false}
        target={target}
        onFocus={(event) => {
          onFocus?.(event);
          scheduleIntentPrefetch();
        }}
        onMouseEnter={(event) => {
          onMouseEnter?.(event);
          scheduleIntentPrefetch();
        }}
        onTouchStart={(event) => {
          onTouchStart?.(event);
          scheduleIntentPrefetch();
        }}
      />
    );
  },
);

AppNavLink.displayName = "AppNavLink";
