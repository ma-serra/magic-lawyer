"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
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
  pathname: string,
  scope: JuridicalAiDockScope,
  role?: string,
) {
  if (role === "CLIENTE") {
    return true;
  }

  if (scope === "admin") {
    return (
      pathname.startsWith("/admin/suporte") ||
      pathname.startsWith("/admin/suporte/chat/")
    );
  }

  return pathname.startsWith("/suporte") || pathname.startsWith("/help");
}

function getTriggerTone(scope: JuridicalAiDockScope) {
  if (scope === "admin") {
    return {
      badge: "Governanca",
      title: "Neon Lex",
      subtitle: "IA juridica do Magic AI",
      accentClass:
        "border-secondary/25 bg-secondary/10 text-secondary group-hover:border-secondary/40 group-hover:bg-secondary/15",
    };
  }

  return {
    badge: "Contextual",
    title: "Neon Lex",
    subtitle: "IA juridica do Magic AI",
    accentClass:
      "border-primary/25 bg-primary/10 text-primary group-hover:border-primary/40 group-hover:bg-primary/15",
  };
}

export function FloatingAssistantDock({
  scope,
}: FloatingAssistantDockProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [isExpanded, setIsExpanded] = useState(false);

  const context = useMemo(
    () => resolveJuridicalAiDockContext(pathname, scope),
    [pathname, scope],
  );
  const actions = useMemo(
    () => getJuridicalAiDockActions(pathname, scope),
    [pathname, scope],
  );
  const triggerTone = useMemo(() => getTriggerTone(scope), [scope]);

  const visibleActions = actions.slice(0, 4);

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

  if (
    shouldHideFloatingAssistant(pathname, scope, session?.user?.role) ||
    visibleActions.length === 0
  ) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-24 right-4 z-[74] flex flex-col items-end gap-3">
      {isExpanded ? (
        <div className="pointer-events-auto hidden max-w-[280px] rounded-3xl border border-default-200/70 bg-content1/95 p-4 text-right shadow-xl backdrop-blur-md sm:block">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Neon Lex
            </p>
            <p className="text-sm font-semibold text-foreground">{context.label}</p>
            <p className="text-xs leading-6 text-default-400">
              {context.description}
            </p>
          </div>
          <div className="mt-3 flex justify-end">
            <Chip color="secondary" size="sm" variant="flat">
              Magic AI contextual
            </Chip>
          </div>
        </div>
      ) : null}

      {visibleActions.map((action, index) => (
        <div
          key={action.id}
          className="flex items-center gap-3 transform-gpu transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none"
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
          <div className="hidden max-w-[250px] rounded-full border border-default-200/70 bg-content1/95 px-3 py-2 text-right shadow-lg backdrop-blur-md sm:block">
            <p className="text-xs font-semibold text-foreground">{action.title}</p>
            <p className="text-[11px] text-default-400">{action.tooltip}</p>
          </div>
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
            <Button
              isIconOnly
              aria-label={action.title}
              className="h-11 w-11 transform-gpu rounded-2xl border border-default-200/70 bg-content1/95 text-foreground shadow-lg backdrop-blur-md transition-[transform,colors,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:border-primary/40 hover:bg-content2/80 hover:text-primary motion-reduce:transition-none"
              onPress={() => handleNavigate(action.id)}
            >
              {getActionIcon(action.id)}
            </Button>
          </Tooltip>
        </div>
      ))}

      <div className="pointer-events-auto">
        <Tooltip
          className="max-w-xs"
          content={
            <div className="space-y-1 p-1">
              <p className="text-xs font-semibold">Neon Lex</p>
              <p className="text-xs text-default-400">
                IA juridica contextual para pecas, documentos e estrategia.
              </p>
            </div>
          }
          placement="left"
        >
          <Button
            aria-label="Abrir dock da Neon Lex"
            className="group h-auto min-h-[64px] transform-gpu rounded-[28px] border border-default-200/70 bg-content1/95 px-3 py-3 text-left shadow-xl backdrop-blur-md transition-[transform,colors,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:border-primary/30 hover:bg-content1 motion-reduce:transition-none"
            onPress={() => {
              setIsExpanded((current) => {
                const nextValue = !current;
                if (nextValue) {
                  void trackJuridicalAiInteraction({
                    scope,
                    interaction: "FAB_OPENED",
                    route: pathname,
                  });
                }

                return nextValue;
              });
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-2xl border transition ${triggerTone.accentClass}`}
              >
                {isExpanded ? (
                  <X className="h-4 w-4" />
                ) : (
                  <BrainCircuit className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0 text-left">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    {triggerTone.title}
                  </p>
                  <Chip
                    className="border border-default-200/70 bg-default-100/70 text-[10px] font-semibold uppercase tracking-[0.12em] text-default-600"
                    size="sm"
                    variant="flat"
                  >
                    {triggerTone.badge}
                  </Chip>
                </div>
                <p className="text-xs text-default-500">{triggerTone.subtitle}</p>
              </div>
            </div>
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
