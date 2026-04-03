"use client";

import { Chip } from "@heroui/chip";

import {
  buildHolidayImpactDetailLines,
  hasHolidayImpactShift,
  type HolidayImpactSnapshot,
} from "@/app/lib/feriados/holiday-impact";

function formatPtBrDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR");
}

export function HolidayImpactPanel({
  impact,
  audience,
  compact = false,
  className = "",
}: {
  impact: HolidayImpactSnapshot | null | undefined;
  audience: "client" | "internal";
  compact?: boolean;
  className?: string;
}) {
  if (!impact || !hasHolidayImpactShift(impact)) {
    return null;
  }

  const detailLines = buildHolidayImpactDetailLines(impact).slice(2);

  return (
    <div
      className={`rounded-2xl border border-secondary/20 bg-secondary/5 p-3 text-sm text-secondary-900 dark:border-secondary/30 dark:bg-secondary/10 dark:text-secondary-50 ${className}`.trim()}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Chip color="secondary" size="sm" variant="flat">
          Prazo ajustado
        </Chip>
        <Chip size="sm" variant="bordered">
          {formatPtBrDate(impact.baseDate)} {"->"} {formatPtBrDate(impact.effectiveDate)}
        </Chip>
        {audience === "internal" &&
        impact.overrideMode === "TENANT_OVERRIDES_SHARED" ? (
          <Chip color="warning" size="sm" variant="flat">
            Regra local prevaleceu
          </Chip>
        ) : null}
      </div>

      {impact.summary ? (
        <p className="mt-2 text-sm font-medium">{impact.summary}</p>
      ) : null}

      {!compact && audience === "internal" && detailLines.length > 0 ? (
        <details className="mt-3 rounded-xl border border-white/20 bg-background/60 p-3 text-default-700 dark:border-white/10 dark:bg-black/10 dark:text-default-200">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-default-500">
            Como foi calculado
          </summary>
          <ul className="mt-3 space-y-2 text-sm">
            {detailLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
