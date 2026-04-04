"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@heroui/button";
import { Tooltip } from "@heroui/tooltip";
import {
  BrainCircuit,
  FileSearch,
  FileText,
  Radar,
  Scale,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";

import {
  buildJuridicalAiWorkspaceHref,
  getJuridicalAiDockActions,
  resolveJuridicalAiDockContext,
  type JuridicalAiDockActionId,
  type JuridicalAiDockScope,
} from "@/app/lib/juridical-ai/assistant-dock";
import { trackJuridicalAiInteraction } from "@/app/actions/juridical-ai";

type FloatingAssistantDockProps = {
  scope: JuridicalAiDockScope;
};

type DockPosition = {
  right: number;
  bottom: number;
};

const DOCK_MARGIN_PX = 16;
const DOCK_STORAGE_KEY_PREFIX = "magiclawyer:floating-assistant-dock";
const DEFAULT_DOCK_POSITION: DockPosition = {
  right: DOCK_MARGIN_PX,
  bottom: DOCK_MARGIN_PX,
};
const DRAG_THRESHOLD_PX = 6;

function getActionIcon(actionId: JuridicalAiDockActionId) {
  switch (actionId) {
    case "nova-peca":
      return <ScrollText className="h-4 w-4" />;
    case "analisar-documento":
      return <FileSearch className="h-4 w-4" />;
    case "pesquisar-jurisprudencia":
      return <Scale className="h-4 w-4" />;
    case "validar-citacoes":
      return <ShieldCheck className="h-4 w-4" />;
    case "resumir-processo":
      return <FileText className="h-4 w-4" />;
    case "estrategia-caso":
      return <Radar className="h-4 w-4" />;
    case "governanca-ia":
      return <ShieldCheck className="h-4 w-4" />;
    case "monetizacao-premium":
      return <Wallet className="h-4 w-4" />;
    case "auditar-uso":
      return <BrainCircuit className="h-4 w-4" />;
    default:
      return <Sparkles className="h-4 w-4" />;
  }
}

function shouldHideFloatingAssistant(
  _pathname: string,
  _scope: JuridicalAiDockScope,
  _role?: string,
) {
  return false;
}

function getTriggerTone(scope: JuridicalAiDockScope) {
  if (scope === "admin") {
    return {
      title: "Assistente",
      accentClass:
        "border-secondary/25 bg-secondary/10 text-secondary group-hover:border-secondary/40 group-hover:bg-secondary/15",
    };
  }

  return {
    title: "Assistente",
    accentClass:
      "border-primary/25 bg-primary/10 text-primary group-hover:border-primary/40 group-hover:bg-primary/15",
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampDockPosition(position: DockPosition): DockPosition {
  if (typeof window === "undefined") {
    return position;
  }

  return {
    right: clamp(
      position.right,
      DOCK_MARGIN_PX,
      Math.max(DOCK_MARGIN_PX, window.innerWidth - 96),
    ),
    bottom: clamp(
      position.bottom,
      DOCK_MARGIN_PX,
      Math.max(DOCK_MARGIN_PX, window.innerHeight - 96),
    ),
  };
}

function getDockStorageKey(scope: JuridicalAiDockScope) {
  return `${DOCK_STORAGE_KEY_PREFIX}:${scope}`;
}

function DockNeonFrame({
  children,
  radiusClass,
  glowClass,
  className = "",
}: {
  children: ReactNode;
  radiusClass: string;
  glowClass: string;
  className?: string;
}) {
  return (
    <div className={`group/neon relative ${className}`}>
      <span
        className={`pointer-events-none absolute -inset-[3px] ${radiusClass} ${glowClass} opacity-45 blur-xl transition-all duration-300 motion-safe:animate-[pulse_4.6s_ease-in-out_infinite] group-hover/neon:opacity-90`}
      />
      <span
        className={`pointer-events-none absolute -inset-[1.5px] ${radiusClass} bg-[conic-gradient(from_180deg_at_50%_50%,rgba(76,29,149,0.05),rgba(168,85,247,0.98),rgba(244,114,182,0.6),rgba(91,33,182,0.95),rgba(76,29,149,0.05))] opacity-0 transition-opacity duration-300 group-hover/neon:opacity-100 motion-safe:group-hover/neon:animate-[spin_2.8s_linear_infinite]`}
      />
      <div className={`relative ${radiusClass}`}>{children}</div>
    </div>
  );
}

export function FloatingAssistantDock({
  scope,
}: FloatingAssistantDockProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [isExpanded, setIsExpanded] = useState(false);
  const [dockPosition, setDockPosition] = useState<DockPosition>(
    DEFAULT_DOCK_POSITION,
  );
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startRight: number;
    startBottom: number;
  } | null>(null);
  const movedBeyondThresholdRef = useRef(false);
  const suppressToggleRef = useRef(false);

  const context = useMemo(
    () => resolveJuridicalAiDockContext(pathname, scope),
    [pathname, scope],
  );
  const actions = useMemo(
    () => getJuridicalAiDockActions(pathname, scope),
    [pathname, scope],
  );
  const triggerTone = useMemo(() => getTriggerTone(scope), [scope]);

  const hasAiAccess = session?.user?.role !== "CLIENTE";
  const visibleActions = hasAiAccess ? actions.slice(0, 4) : [];

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const storedPosition = window.localStorage.getItem(getDockStorageKey(scope));
      if (!storedPosition) {
        return;
      }

      const parsedPosition = JSON.parse(storedPosition) as Partial<DockPosition>;
      if (
        typeof parsedPosition.right !== "number" ||
        typeof parsedPosition.bottom !== "number"
      ) {
        return;
      }

      setDockPosition(
        clampDockPosition({
          right: parsedPosition.right,
          bottom: parsedPosition.bottom,
        }),
      );
    } catch {
      // Ignora erro de leitura do localStorage
    }
  }, [scope]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      getDockStorageKey(scope),
      JSON.stringify(dockPosition),
    );
  }, [dockPosition, scope]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleResize = () => {
      setDockPosition((current) => clampDockPosition(current));
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;

      if (!movedBeyondThresholdRef.current) {
        if (
          Math.abs(deltaX) < DRAG_THRESHOLD_PX &&
          Math.abs(deltaY) < DRAG_THRESHOLD_PX
        ) {
          return;
        }

        movedBeyondThresholdRef.current = true;
        setIsDragging(true);
      }

      setDockPosition(
        clampDockPosition({
          right: dragState.startRight - deltaX,
          bottom: dragState.startBottom - deltaY,
        }),
      );
    };

    const finishDrag = (pointerId: number) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== pointerId) {
        return;
      }

      dragStateRef.current = null;

      if (movedBeyondThresholdRef.current) {
        suppressToggleRef.current = true;
        window.setTimeout(() => {
          suppressToggleRef.current = false;
        }, 120);
      }

      movedBeyondThresholdRef.current = false;
      setIsDragging(false);
    };

    const handlePointerUp = (event: PointerEvent) => {
      finishDrag(event.pointerId);
    };

    const handlePointerCancel = (event: PointerEvent) => {
      finishDrag(event.pointerId);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, []);

  useEffect(() => {
    setIsExpanded(false);
  }, [pathname]);

  const handleNavigate = (actionId: JuridicalAiDockActionId) => {
    setIsExpanded(false);
    void trackJuridicalAiInteraction({
      scope,
      interaction: "DOCK_ACTION_CLICKED",
      actionId,
      route: pathname,
    });
    router.push(
      buildJuridicalAiWorkspaceHref({
        pathname,
        scope,
        actionId,
      }),
    );
  };

  const handleLauncherPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (event.button !== 0) {
      return;
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRight: dockPosition.right,
      startBottom: dockPosition.bottom,
    };
    movedBeyondThresholdRef.current = false;
  };

  const handleLauncherPress = () => {
    if (isDragging || suppressToggleRef.current) {
      return;
    }

    const nextValue = !isExpanded;

    setIsExpanded(nextValue);

    if (nextValue) {
      void trackJuridicalAiInteraction({
        scope,
        interaction: "FAB_OPENED",
        route: pathname,
      });
    }
  };

  if (
    shouldHideFloatingAssistant(pathname, scope, session?.user?.role) ||
    visibleActions.length === 0
  ) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed z-[74] flex flex-col items-end gap-2.5"
      style={{
        right: dockPosition.right,
        bottom: dockPosition.bottom,
      }}
    >
      {visibleActions.map((action, index) => (
        <div
          key={action.id}
          className="flex flex-col items-end gap-1.5 transform-gpu transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none"
          style={{
            opacity: isExpanded ? 1 : 0,
            pointerEvents: isExpanded ? "auto" : "none",
            transform: isExpanded
              ? "translate3d(0, 0, 0)"
              : `translate3d(0, ${10 * (index + 1)}px, 0)`,
            transitionDelay: isExpanded ? `${index * 24}ms` : "0ms",
            willChange: "transform, opacity",
          }}
        >
          <Tooltip
            className="max-w-xs"
            content={
              <div className="space-y-1 p-1">
                <p className="text-xs font-semibold">{action.title}</p>
                <p className="text-xs text-default-400">{action.tooltip}</p>
              </div>
            }
            placement="left"
          >
            <DockNeonFrame
              className="pointer-events-auto"
              glowClass="bg-violet-500/28"
              radiusClass="rounded-[18px]"
            >
              <Button
                aria-label={action.title}
                className="h-12 min-h-12 w-14 min-w-14 transform-gpu rounded-[18px] border border-violet-300/20 bg-[linear-gradient(180deg,rgba(35,13,73,0.96),rgba(18,6,38,0.96))] px-2 py-1 text-violet-50 shadow-[0_18px_38px_-22px_rgba(139,92,246,0.85)] transition-[transform,colors,box-shadow,border-color] duration-200 ease-out hover:-translate-y-1 hover:border-fuchsia-300/55 hover:text-white motion-reduce:transition-none"
                onPress={() => handleNavigate(action.id)}
              >
                <span className="flex flex-col items-center gap-1 text-center">
                  {getActionIcon(action.id)}
                  <span className="text-[9px] font-semibold uppercase tracking-[0.14em] leading-none text-violet-100/95">
                    {action.shortLabel}
                  </span>
                </span>
              </Button>
            </DockNeonFrame>
          </Tooltip>
        </div>
      ))}

      <div className="pointer-events-auto">
        <Tooltip
          className="max-w-xs"
          content={
            <div className="space-y-1 p-1">
              <p className="text-xs font-semibold">Assistente</p>
              <p className="text-xs text-default-400">
                Assistente juridico contextual para pecas, documentos, estrategia e suporte.
              </p>
              <p className="text-[11px] text-violet-200/90">{context.label}</p>
            </div>
          }
          placement="left"
        >
          <DockNeonFrame
            className="pointer-events-auto"
            glowClass="bg-fuchsia-500/35"
            radiusClass="rounded-[24px]"
          >
            <Button
              aria-label="Abrir assistente"
              className="group h-[60px] min-h-[60px] w-[60px] min-w-[60px] cursor-grab touch-none rounded-[24px] border border-violet-300/25 bg-[linear-gradient(180deg,rgba(49,17,112,0.96),rgba(23,7,50,0.96))] px-0 py-0 text-left shadow-[0_24px_60px_-28px_rgba(139,92,246,1)] transition-[transform,colors,box-shadow,border-color] duration-200 ease-out hover:-translate-y-1 hover:border-fuchsia-300/60 hover:text-white active:cursor-grabbing motion-reduce:transition-none"
              onPointerDown={handleLauncherPointerDown}
              onPress={handleLauncherPress}
            >
              <div className="flex h-full items-center justify-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full border border-violet-300/35 bg-violet-400/12 text-violet-50 transition duration-200 ${triggerTone.accentClass}`}
                >
                  {isExpanded ? (
                    <X className="h-3.5 w-3.5" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                </div>
              </div>
            </Button>
          </DockNeonFrame>
        </Tooltip>
      </div>
    </div>
  );
}
