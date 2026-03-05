"use server";

import { getServerSession } from "next-auth/next";

import prisma from "@/app/lib/prisma";
import { authOptions } from "@/auth";
import { checkPermission } from "@/app/actions/equipe";
import { UserRole } from "@/generated/prisma";

type DisponibilidadeAction = "visualizar" | "editar";

export interface AgendaDisponibilidadeInput {
  diaSemana: number;
  ativo: boolean;
  horaInicio: string;
  horaFim: string;
  intervaloInicio?: string | null;
  intervaloFim?: string | null;
  observacoes?: string | null;
}

export interface AgendaDisponibilidadeView extends AgendaDisponibilidadeInput {
  id?: string;
  nomeDia: string;
}

const DIA_LABELS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
] as const;

function defaultWeekSchedule(): AgendaDisponibilidadeView[] {
  return DIA_LABELS.map((nomeDia, diaSemana) => ({
    diaSemana,
    nomeDia,
    ativo: diaSemana >= 1 && diaSemana <= 5,
    horaInicio: "08:00",
    horaFim: "18:00",
    intervaloInicio: "12:00",
    intervaloFim: "13:00",
    observacoes: null,
  }));
}

function normalizeTimeString(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (!/^\d{2}:\d{2}$/.test(trimmed)) {
    throw new Error(`Horário inválido: ${trimmed}. Use o formato HH:mm.`);
  }

  const [hoursText, minutesText] = trimmed.split(":");
  const hours = Number.parseInt(hoursText, 10);
  const minutes = Number.parseInt(minutesText, 10);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error(`Horário inválido: ${trimmed}. Use o formato HH:mm.`);
  }

  return `${hoursText}:${minutesText}`;
}

function timeToMinutes(value: string) {
  const [hoursText, minutesText] = value.split(":");
  return Number.parseInt(hoursText, 10) * 60 + Number.parseInt(minutesText, 10);
}

async function resolveAgendaIdentity(action: DisponibilidadeAction) {
  const session = await getServerSession(authOptions);
  const sessionUser = (session?.user as any) ?? {};
  const userId = sessionUser.id as string | undefined;

  if (!userId) {
    throw new Error("Usuário não autenticado.");
  }

  const role = (sessionUser.role as string | undefined) ?? "";
  const isAdmin = role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
  const isCliente = role === UserRole.CLIENTE;

  if (isCliente) {
    throw new Error("Clientes não podem gerenciar disponibilidade de agenda.");
  }

  const tenantIdFromSession = sessionUser.tenantId as string | undefined;
  const userDb = await prisma.usuario.findUnique({
    where: { id: userId },
    select: { tenantId: true },
  });
  const tenantId = tenantIdFromSession || userDb?.tenantId;

  if (!tenantId) {
    throw new Error("Tenant não encontrado.");
  }

  if (!isAdmin) {
    const hasPermission = await checkPermission("agenda", action);
    if (!hasPermission) {
      throw new Error(
        action === "editar"
          ? "Sem permissão para editar disponibilidade da agenda."
          : "Sem permissão para visualizar disponibilidade da agenda.",
      );
    }
  }

  return {
    userId,
    tenantId,
  };
}

function validateDisponibilidades(
  disponibilidades: AgendaDisponibilidadeInput[],
): AgendaDisponibilidadeInput[] {
  if (!Array.isArray(disponibilidades) || disponibilidades.length === 0) {
    throw new Error("Informe ao menos um dia de disponibilidade.");
  }

  const seenDays = new Set<number>();

  return disponibilidades.map((item) => {
    if (!Number.isInteger(item.diaSemana) || item.diaSemana < 0 || item.diaSemana > 6) {
      throw new Error("Dia da semana inválido. Use valores de 0 (domingo) a 6 (sábado).");
    }

    if (seenDays.has(item.diaSemana)) {
      throw new Error("Dias da semana duplicados na disponibilidade.");
    }
    seenDays.add(item.diaSemana);

    const horaInicio = normalizeTimeString(item.horaInicio);
    const horaFim = normalizeTimeString(item.horaFim);
    const intervaloInicio = normalizeTimeString(item.intervaloInicio ?? null);
    const intervaloFim = normalizeTimeString(item.intervaloFim ?? null);

    if (item.ativo) {
      if (!horaInicio || !horaFim) {
        throw new Error(`Preencha hora inicial e final para ${DIA_LABELS[item.diaSemana]}.`);
      }

      if (timeToMinutes(horaInicio) >= timeToMinutes(horaFim)) {
        throw new Error(`Faixa inválida em ${DIA_LABELS[item.diaSemana]}: início deve ser menor que fim.`);
      }

      if ((intervaloInicio && !intervaloFim) || (!intervaloInicio && intervaloFim)) {
        throw new Error(
          `Intervalo incompleto em ${DIA_LABELS[item.diaSemana]}. Informe início e fim do intervalo.`,
        );
      }

      if (intervaloInicio && intervaloFim) {
        const startMinutes = timeToMinutes(horaInicio);
        const endMinutes = timeToMinutes(horaFim);
        const intervaloStartMinutes = timeToMinutes(intervaloInicio);
        const intervaloEndMinutes = timeToMinutes(intervaloFim);

        if (intervaloStartMinutes >= intervaloEndMinutes) {
          throw new Error(`Intervalo inválido em ${DIA_LABELS[item.diaSemana]}.`);
        }

        if (
          intervaloStartMinutes < startMinutes ||
          intervaloEndMinutes > endMinutes
        ) {
          throw new Error(
            `Intervalo fora da jornada em ${DIA_LABELS[item.diaSemana]}.`,
          );
        }
      }
    }

    return {
      diaSemana: item.diaSemana,
      ativo: !!item.ativo,
      horaInicio: horaInicio || "08:00",
      horaFim: horaFim || "18:00",
      intervaloInicio,
      intervaloFim,
      observacoes: item.observacoes?.trim() || null,
    };
  });
}

export async function getMinhaDisponibilidadeAgenda() {
  try {
    const identity = await resolveAgendaIdentity("visualizar");

    const defaults = defaultWeekSchedule();
    const rows = await prisma.agendaDisponibilidade.findMany({
      where: {
        tenantId: identity.tenantId,
        usuarioId: identity.userId,
      },
      orderBy: { diaSemana: "asc" },
    });

    if (rows.length === 0) {
      return {
        success: true,
        data: defaults,
        fromDefault: true,
      };
    }

    const byDay = new Map(rows.map((row) => [row.diaSemana, row]));
    const merged = defaults.map((day) => {
      const row = byDay.get(day.diaSemana);
      if (!row) {
        return day;
      }

      return {
        id: row.id,
        diaSemana: row.diaSemana,
        nomeDia: DIA_LABELS[row.diaSemana],
        ativo: row.ativo,
        horaInicio: row.horaInicio,
        horaFim: row.horaFim,
        intervaloInicio: row.intervaloInicio,
        intervaloFim: row.intervaloFim,
        observacoes: row.observacoes,
      };
    });

    return {
      success: true,
      data: merged,
      fromDefault: false,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro interno ao buscar disponibilidade da agenda.",
    };
  }
}

export async function salvarMinhaDisponibilidadeAgenda(
  disponibilidades: AgendaDisponibilidadeInput[],
) {
  try {
    const identity = await resolveAgendaIdentity("editar");
    const normalized = validateDisponibilidades(disponibilidades);
    const advogado = await prisma.advogado.findFirst({
      where: {
        tenantId: identity.tenantId,
        usuarioId: identity.userId,
      },
      select: { id: true },
    });

    await prisma.$transaction(async (tx) => {
      await tx.agendaDisponibilidade.deleteMany({
        where: {
          tenantId: identity.tenantId,
          usuarioId: identity.userId,
          diaSemana: {
            notIn: normalized.map((item) => item.diaSemana),
          },
        },
      });

      for (const item of normalized) {
        await tx.agendaDisponibilidade.upsert({
          where: {
            tenantId_usuarioId_diaSemana: {
              tenantId: identity.tenantId,
              usuarioId: identity.userId,
              diaSemana: item.diaSemana,
            },
          },
          create: {
            tenantId: identity.tenantId,
            usuarioId: identity.userId,
            advogadoId: advogado?.id || null,
            diaSemana: item.diaSemana,
            ativo: item.ativo,
            horaInicio: item.horaInicio,
            horaFim: item.horaFim,
            intervaloInicio: item.intervaloInicio,
            intervaloFim: item.intervaloFim,
            observacoes: item.observacoes,
          },
          update: {
            advogadoId: advogado?.id || null,
            ativo: item.ativo,
            horaInicio: item.horaInicio,
            horaFim: item.horaFim,
            intervaloInicio: item.intervaloInicio,
            intervaloFim: item.intervaloFim,
            observacoes: item.observacoes,
          },
        });
      }
    });

    const updated = await getMinhaDisponibilidadeAgenda();
    if (!updated.success) {
      return updated;
    }

    return {
      success: true,
      data: updated.data,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro interno ao salvar disponibilidade da agenda.",
    };
  }
}
