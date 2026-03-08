"use client";

import type {
  ComponentProps,
  KeyboardEventHandler,
  MouseEventHandler,
  ReactNode,
} from "react";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Divider } from "@heroui/divider";

type PeopleTone =
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "secondary"
  | "default";

const toneMap: Record<
  PeopleTone,
  { card: string; value: string; iconWrap: string; label: string }
> = {
  primary: {
    card: "border-primary/20 bg-primary/5",
    value: "text-primary",
    iconWrap: "bg-primary/20 text-primary",
    label: "text-primary/80",
  },
  success: {
    card: "border-success/20 bg-success/5",
    value: "text-success",
    iconWrap: "bg-success/20 text-success",
    label: "text-success/80",
  },
  warning: {
    card: "border-warning/20 bg-warning/5",
    value: "text-warning",
    iconWrap: "bg-warning/20 text-warning",
    label: "text-warning/80",
  },
  danger: {
    card: "border-danger/20 bg-danger/5",
    value: "text-danger",
    iconWrap: "bg-danger/20 text-danger",
    label: "text-danger/80",
  },
  secondary: {
    card: "border-secondary/20 bg-secondary/5",
    value: "text-secondary",
    iconWrap: "bg-secondary/20 text-secondary",
    label: "text-secondary/80",
  },
  default: {
    card: "border-white/10 bg-background/50",
    value: "text-foreground",
    iconWrap: "bg-white/10 text-default-300",
    label: "text-default-500",
  },
};

interface PeoplePageHeaderProps {
  title: string;
  description: string;
  actions?: ReactNode;
  tag?: string;
}

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type PeopleEntityCardProps = Omit<
  ComponentProps<typeof Card>,
  | "children"
  | "isPressable"
  | "onPress"
  | "onClick"
  | "onKeyDown"
  | "role"
  | "tabIndex"
> & {
  children: ReactNode;
  isSelected?: boolean;
  isPressable?: boolean;
  onPress?: () => void;
  onClick?: MouseEventHandler<HTMLDivElement>;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  role?: string;
  tabIndex?: number;
};

export function PeopleEntityCard({
  children,
  className,
  isSelected = false,
  isPressable = false,
  onPress,
  onClick,
  onKeyDown,
  role,
  tabIndex,
  ...cardProps
}: PeopleEntityCardProps) {
  const isInteractiveElement = (
    target: EventTarget | null,
    currentTarget: EventTarget | null,
  ) => {
    if (!(target instanceof Element) || !(currentTarget instanceof Element)) {
      return false;
    }

    if (target === currentTarget) {
      return false;
    }

    return Boolean(
      target.closest(
        "button,a,input,select,textarea,[role='menuitem'],[role='checkbox'],[data-react-aria-pressable='true'],[data-stop-card-press='true']",
      ),
    );
  };

  const handleClick: MouseEventHandler<HTMLDivElement> = (event) => {
    onClick?.(event);

    if (
      !event.defaultPrevented &&
      isPressable &&
      !isInteractiveElement(event.target, event.currentTarget)
    ) {
      onPress?.();
    }
  };

  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
    onKeyDown?.(event);

    if (event.defaultPrevented || !isPressable) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onPress?.();
    }
  };

  return (
    <div
      role={isPressable ? "button" : role}
      tabIndex={isPressable ? 0 : tabIndex}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <Card
        className={joinClasses(
          "group border border-white/10 bg-background/60 transition-all duration-300 hover:border-primary/40 hover:bg-background/80",
          isSelected && "border-primary/50 bg-primary/10",
          isPressable && "cursor-pointer ml-wave-surface",
          className,
        )}
        {...cardProps}
      >
        {children}
      </Card>
    </div>
  );
}

type PeopleEntityCardHeaderProps = Omit<
  ComponentProps<typeof CardHeader>,
  "children"
> & {
  children: ReactNode;
};

export function PeopleEntityCardHeader({
  children,
  className,
  ...headerProps
}: PeopleEntityCardHeaderProps) {
  return (
    <CardHeader
      className={joinClasses("border-b border-white/10 p-4", className)}
      {...headerProps}
    >
      {children}
    </CardHeader>
  );
}

type PeopleEntityCardBodyProps = Omit<ComponentProps<typeof CardBody>, "children"> & {
  children: ReactNode;
};

export function PeopleEntityCardBody({
  children,
  className,
  ...bodyProps
}: PeopleEntityCardBodyProps) {
  return (
    <CardBody className={joinClasses("p-4", className)} {...bodyProps}>
      {children}
    </CardBody>
  );
}

export function PeoplePageHeader({
  title,
  description,
  actions,
  tag = "Gestao de pessoas",
}: PeoplePageHeaderProps) {
  return (
    <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
      <CardBody className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            {tag}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {title}
          </h1>
          <p className="max-w-3xl text-sm text-default-400 sm:text-base">
            {description}
          </p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </CardBody>
    </Card>
  );
}

interface PeopleMetricCardProps {
  label: string;
  value: string | number;
  helper?: string;
  icon?: ReactNode;
  tone?: PeopleTone;
}

export function PeopleMetricCard({
  label,
  value,
  helper,
  icon,
  tone = "default",
}: PeopleMetricCardProps) {
  const toneStyle = toneMap[tone];

  return (
    <Card className={`border ${toneStyle.card}`}>
      <CardBody className="flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${toneStyle.label}`}>
            {label}
          </p>
          {icon ? (
            <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${toneStyle.iconWrap}`}>
              {icon}
            </span>
          ) : null}
        </div>
        <p className={`text-2xl font-semibold ${toneStyle.value}`}>{value}</p>
        {helper ? <p className="text-xs text-default-400">{helper}</p> : null}
      </CardBody>
    </Card>
  );
}

interface PeoplePanelProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function PeoplePanel({
  title,
  description,
  actions,
  children,
}: PeoplePanelProps) {
  return (
    <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
      <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {description ? (
            <p className="text-sm text-default-400">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex gap-2">{actions}</div> : null}
      </CardHeader>
      <Divider className="border-white/10" />
      <CardBody>{children}</CardBody>
    </Card>
  );
}
