"use client";

import { Progress } from "@heroui/progress";

type UploadProgressProps = {
  label: string;
  description?: string;
  ariaLabel?: string;
  className?: string;
  color?: "default" | "primary" | "secondary" | "success" | "warning" | "danger";
  size?: "sm" | "md" | "lg";
  value?: number;
  maxValue?: number;
  valueLabel?: string;
  showValueLabel?: boolean;
};

export function UploadProgress({
  label,
  description,
  ariaLabel,
  className,
  color = "primary",
  size = "sm",
  value,
  maxValue = 100,
  valueLabel,
  showValueLabel,
}: UploadProgressProps) {
  const isDeterminate = typeof value === "number";

  return (
    <div className={className}>
      <Progress
        aria-label={ariaLabel ?? label}
        classNames={{
          base: "max-w-full gap-1.5",
          label: "text-xs font-medium text-default-700 dark:text-default-200",
          value: "text-[11px] text-default-500",
          track: "h-2",
        }}
        color={color}
        isIndeterminate={!isDeterminate}
        isStriped={!isDeterminate}
        label={label}
        maxValue={maxValue}
        showValueLabel={showValueLabel ?? isDeterminate}
        size={size}
        value={isDeterminate ? value : undefined}
        valueLabel={valueLabel}
      />
      {description ? (
        <p className="mt-1 text-xs text-default-500">{description}</p>
      ) : null}
    </div>
  );
}
