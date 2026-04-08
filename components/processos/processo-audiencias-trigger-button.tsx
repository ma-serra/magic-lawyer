"use client";

import { Button } from "@heroui/button";
import { Gavel } from "lucide-react";

interface ProcessoAudienciasTriggerButtonProps {
  count: number;
  onPress: () => void;
  preventNavigation?: boolean;
}

export function getProcessoAudienciasLabel(count: number) {
  return `${count} audiência${count === 1 ? "" : "s"}`;
}

export function ProcessoAudienciasTriggerButton({
  count,
  onPress,
  preventNavigation = false,
}: ProcessoAudienciasTriggerButtonProps) {
  const label = getProcessoAudienciasLabel(count);

  const handleClick = (event: any) => {
    if (preventNavigation) {
      event.preventDefault();
      event.stopPropagation();
    }

    onPress();
  };

  return (
    <Button
      color="secondary"
      size="sm"
      startContent={<Gavel className="h-3.5 w-3.5" />}
      variant="flat"
      onClick={handleClick}
    >
      {label}
    </Button>
  );
}
