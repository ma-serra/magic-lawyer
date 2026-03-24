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
        <div className="hidden max-w-[260px] rounded-3xl border border-white/10 bg-content1/92 p-4 text-right shadow-2xl backdrop-blur sm:block">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Treinada para jurídico
            </p>
            <p className="text-sm font-semibold text-foreground">{context.label}</p>
            <p className="text-xs leading-6 text-default-400">
              {context.description}
            </p>
          </div>
          <div className="mt-3 flex justify-end">
            <Chip color="secondary" size="sm" variant="flat">
              Speed dial contextual
            </Chip>
          </div>
        </div>
      ) : null}

      {visibleActions.map((action, index) => (
        <div
          key={action.id}
          className="flex items-center gap-3 transition-all duration-300"
          style={{
            opacity: isExpanded ? 1 : 0,
            pointerEvents: isExpanded ? "auto" : "none",
            transform: isExpanded
              ? "translateY(0) scale(1)"
              : `translateY(${12 * (index + 1)}px) scale(0.92)`,
            transitionDelay: isExpanded ? `${index * 35}ms` : "0ms",
          }}
        >
          <div className="hidden max-w-[240px] rounded-full border border-white/10 bg-content1/90 px-3 py-2 text-right shadow-xl backdrop-blur sm:block">
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
              className="h-11 w-11 rounded-full border border-white/10 bg-content1/90 text-foreground shadow-xl backdrop-blur transition hover:scale-[1.04] hover:border-primary/50 hover:text-primary"
              onPress={() => handleNavigate(action.id)}
            >
              {getActionIcon(action.id)}
            </Button>
          </Tooltip>
        </div>
      ))}

      <Tooltip
        className="max-w-xs"
        content={
          <div className="space-y-1 p-1">
            <p className="text-xs font-semibold">Treinada para jurídico</p>
            <p className="text-xs text-default-400">
              Gere peças, analise documentos e receba sugestões sobre seus processos.
            </p>
          </div>
        }
        placement="left"
      >
        <Button
          isIconOnly
          aria-label="Abrir speed dial do assistente jurídico"
          className="h-16 w-16 rounded-full border-4 border-content1 bg-gradient-to-br from-primary via-sky-500 to-cyan-400 text-white shadow-[0_22px_48px_rgba(37,99,235,0.35)] transition hover:scale-[1.03]"
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
          {isExpanded ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
        </Button>
      </Tooltip>
    </div>
  );
}
