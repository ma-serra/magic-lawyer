"use client";

import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Divider } from "@heroui/divider";
import {
  Calendar,
  Edit,
  ExternalLink,
  Gavel,
  History,
  MapPin,
  Plus,
  User,
  Video,
} from "lucide-react";

import { DateUtils } from "@/app/lib/date-utils";
import { EventoStatus } from "@/generated/prisma";

type ResponsavelAudiencia = {
  usuario?: {
    firstName?: string | null;
    lastName?: string | null;
  } | null;
} | null;

export interface ProcessoAudienciaListItem {
  id: string;
  titulo: string;
  descricao?: string | null;
  status?: EventoStatus | string | null;
  dataInicio: Date | string;
  dataFim: Date | string;
  local?: string | null;
  isOnline?: boolean | null;
  linkAcesso?: string | null;
  advogadoResponsavel?: ResponsavelAudiencia;
}

export interface ProcessoAudienciasOverview {
  proximas: ProcessoAudienciaListItem[];
  historico: ProcessoAudienciaListItem[];
  proximaAudiencia: ProcessoAudienciaListItem | null;
}

interface ProcessoAudienciasListProps {
  audiencias: ProcessoAudienciaListItem[];
  canCreate?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActionLabel?: string;
  now?: Date;
  onCreate?: () => void;
  onEdit?: (audiencia: ProcessoAudienciaListItem) => void;
}

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function getAudienciaStatusColor(status?: EventoStatus | string | null) {
  switch (status) {
    case EventoStatus.CONFIRMADO:
      return "success";
    case EventoStatus.CANCELADO:
      return "danger";
    case EventoStatus.REALIZADO:
      return "default";
    case EventoStatus.ADIADO:
      return "warning";
    case EventoStatus.AGENDADO:
    default:
      return "primary";
  }
}

function getResponsavelLabel(audiencia: ProcessoAudienciaListItem) {
  const firstName = audiencia.advogadoResponsavel?.usuario?.firstName?.trim();
  const lastName = audiencia.advogadoResponsavel?.usuario?.lastName?.trim();

  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function sortAscByStartDate(
  left: ProcessoAudienciaListItem,
  right: ProcessoAudienciaListItem,
) {
  return toDate(left.dataInicio).getTime() - toDate(right.dataInicio).getTime();
}

function sortDescByStartDate(
  left: ProcessoAudienciaListItem,
  right: ProcessoAudienciaListItem,
) {
  return toDate(right.dataInicio).getTime() - toDate(left.dataInicio).getTime();
}

export function deriveProcessoAudienciasOverview(
  audiencias: ProcessoAudienciaListItem[],
  now = new Date(),
): ProcessoAudienciasOverview {
  const proximas = audiencias
    .filter((audiencia) => toDate(audiencia.dataFim).getTime() >= now.getTime())
    .sort(sortAscByStartDate);
  const historico = audiencias
    .filter((audiencia) => toDate(audiencia.dataFim).getTime() < now.getTime())
    .sort(sortDescByStartDate);

  return {
    proximas,
    historico,
    proximaAudiencia: proximas[0] ?? null,
  };
}

function AudienciaCard({
  audiencia,
  onEdit,
}: {
  audiencia: ProcessoAudienciaListItem;
  onEdit?: (audiencia: ProcessoAudienciaListItem) => void;
}) {
  const responsavel = getResponsavelLabel(audiencia);

  return (
    <Card className="border border-default-200">
      <CardBody className="gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-foreground">
                {audiencia.titulo}
              </span>
              {audiencia.status ? (
                <Chip
                  color={getAudienciaStatusColor(audiencia.status)}
                  size="sm"
                  variant="flat"
                >
                  {audiencia.status}
                </Chip>
              ) : null}
            </div>
            <div className="flex items-center gap-1 text-xs text-default-500">
              <Calendar className="h-3.5 w-3.5" />
              <span>
                {DateUtils.formatDateTime(toDate(audiencia.dataInicio))}
              </span>
            </div>
          </div>

          {onEdit ? (
            <Button
              color="primary"
              size="sm"
              startContent={<Edit className="h-3.5 w-3.5" />}
              variant="flat"
              onPress={() => onEdit(audiencia)}
            >
              Editar
            </Button>
          ) : null}
        </div>

        {audiencia.descricao ? (
          <p className="text-xs text-default-500">{audiencia.descricao}</p>
        ) : null}

        <div className="flex flex-col gap-2 text-xs text-default-500">
          {audiencia.local ? (
            <div className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              <span>{audiencia.local}</span>
            </div>
          ) : null}

          {audiencia.isOnline && audiencia.linkAcesso ? (
            <div className="flex items-center gap-1">
              <Video className="h-3.5 w-3.5 text-primary" />
              <a
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                href={audiencia.linkAcesso}
                rel="noreferrer"
                target="_blank"
              >
                Abrir link da audiência
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          ) : null}

          {responsavel ? (
            <div className="flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              <span>Responsável: {responsavel}</span>
            </div>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

function AudienciaSection({
  title,
  description,
  icon,
  items,
  onEdit,
}: {
  title: string;
  description: string;
  icon: typeof Calendar;
  items: ProcessoAudienciaListItem[];
  onEdit?: (audiencia: ProcessoAudienciaListItem) => void;
}) {
  const Icon = icon;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">{title}</p>
          </div>
          <p className="text-xs text-default-500">{description}</p>
        </div>
        <Chip size="sm" variant="flat">
          {items.length}
        </Chip>
      </div>

      <div className="space-y-3">
        {items.map((audiencia) => (
          <AudienciaCard
            key={audiencia.id}
            audiencia={audiencia}
            onEdit={onEdit}
          />
        ))}
      </div>
    </section>
  );
}

export function ProcessoAudienciasList({
  audiencias,
  canCreate = false,
  emptyTitle = "Nenhuma audiência cadastrada",
  emptyDescription = "Assim que uma audiência for registrada na agenda com vínculo a este processo, ela aparecerá aqui.",
  emptyActionLabel = "Nova audiência",
  now,
  onCreate,
  onEdit,
}: ProcessoAudienciasListProps) {
  const overview = deriveProcessoAudienciasOverview(audiencias, now);

  if (audiencias.length === 0) {
    return (
      <Card className="border border-default-200">
        <CardBody className="py-12 text-center">
          <Gavel className="mx-auto h-12 w-12 text-default-300" />
          <p className="mt-4 text-lg font-semibold text-default-600">
            {emptyTitle}
          </p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-default-500">
            {emptyDescription}
          </p>
          {canCreate && onCreate ? (
            <div className="mt-5">
              <Button
                color="primary"
                startContent={<Plus className="h-4 w-4" />}
                onPress={onCreate}
              >
                {emptyActionLabel}
              </Button>
            </div>
          ) : null}
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {overview.proximas.length > 0 ? (
        <AudienciaSection
          description="Audiências futuras ou em andamento vinculadas a este processo."
          icon={Calendar}
          items={overview.proximas}
          title="Próximas audiências"
          onEdit={onEdit}
        />
      ) : null}

      {overview.historico.length > 0 ? (
        <>
          {overview.proximas.length > 0 ? <Divider /> : null}
          <AudienciaSection
            description="Audiências já realizadas, encerradas ou passadas."
            icon={History}
            items={overview.historico}
            title="Histórico de audiências"
            onEdit={onEdit}
          />
        </>
      ) : null}
    </div>
  );
}
