"use client";

import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Avatar } from "@heroui/avatar";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Calendar,
  MessageSquare,
  Paperclip,
  CheckSquare,
  AlertCircle,
  Clock,
} from "lucide-react";
import dayjs from "dayjs";

interface TarefaCardProps {
  tarefa: any;
  onClick?: () => void;
  isDragging?: boolean;
}

const prioridadeConfig = {
  BAIXA: { color: "default" as const, label: "Baixa", icon: "⚪" },
  MEDIA: { color: "primary" as const, label: "Média", icon: "🔵" },
  ALTA: { color: "warning" as const, label: "Alta", icon: "🟡" },
  CRITICA: { color: "danger" as const, label: "Crítica", icon: "🔴" },
};

export function TarefaCard({ tarefa, onClick, isDragging }: TarefaCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({
    id: tarefa.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging || isSortableDragging ? 0.4 : 1,
  };

  const isAtrasada =
    tarefa.dataLimite && dayjs(tarefa.dataLimite).isBefore(dayjs());
  const totalChecklists =
    tarefa.checklists?.length ?? tarefa._count?.checklists ?? 0;
  const checklistsConcluidos =
    tarefa.checklists?.filter((checklist: any) => checklist.concluida).length ??
    0;
  const totalComentarios = tarefa._count?.comentarios || 0;
  const totalAnexos = tarefa._count?.anexos || 0;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      isPressable
      className="cursor-grab active:cursor-grabbing hover:shadow-lg hover:scale-[1.02] transition-all duration-200 border border-default-200 bg-background"
      onPress={onClick}
    >
      <CardBody className="p-4 space-y-3">
        {/* Título e Prioridade */}
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <h4 className="font-semibold text-sm leading-snug mb-1">
              {tarefa.titulo}
            </h4>
            {tarefa.descricao && (
              <p className="text-xs text-default-500 line-clamp-2 leading-relaxed">
                {tarefa.descricao}
              </p>
            )}
          </div>
          {tarefa.prioridade !== "MEDIA" && (
            <div
              className="text-lg"
              title={
                prioridadeConfig[
                  tarefa.prioridade as keyof typeof prioridadeConfig
                ].label
              }
            >
              {
                prioridadeConfig[
                  tarefa.prioridade as keyof typeof prioridadeConfig
                ].icon
              }
            </div>
          )}
        </div>

        {/* Tags */}
        {tarefa.tags && tarefa.tags.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {tarefa.tags.slice(0, 3).map((rel: any) => (
              <Chip
                key={rel.id}
                className="text-xs font-medium"
                size="sm"
                style={{
                  backgroundColor: rel.tag.cor + "15",
                  color: rel.tag.cor,
                  borderLeft: `3px solid ${rel.tag.cor}`,
                }}
                variant="flat"
              >
                {rel.tag.nome}
              </Chip>
            ))}
            {tarefa.tags.length > 3 && (
              <Chip className="text-xs" size="sm" variant="flat">
                +{tarefa.tags.length - 3}
              </Chip>
            )}
          </div>
        )}

        {/* Metadata Icons */}
        {(totalChecklists > 0 || totalComentarios > 0 || totalAnexos > 0) && (
          <div className="flex items-center gap-2 text-xs">
            {totalChecklists > 0 && (
              <div className="flex items-center gap-1 bg-default-100 px-2 py-1 rounded-md">
                <CheckSquare className="text-success" size={14} />
                <span className="font-medium text-default-600">
                  {checklistsConcluidos}/{totalChecklists}
                </span>
              </div>
            )}
            {totalComentarios > 0 && (
              <div className="flex items-center gap-1 bg-default-100 px-2 py-1 rounded-md">
                <MessageSquare className="text-primary" size={14} />
                <span className="font-medium text-default-600">
                  {totalComentarios}
                </span>
              </div>
            )}
            {totalAnexos > 0 && (
              <div className="flex items-center gap-1 bg-default-100 px-2 py-1 rounded-md">
                <Paperclip className="text-warning" size={14} />
                <span className="font-medium text-default-600">
                  {totalAnexos}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Footer: Data e Responsável */}
        <div className="flex items-center justify-between pt-2 border-t border-default-100">
          <div className="flex items-center gap-2">
            {tarefa.dataLimite && (
              <Chip
                className="font-medium"
                color={isAtrasada ? "danger" : "default"}
                size="sm"
                startContent={
                  isAtrasada ? (
                    <AlertCircle size={12} />
                  ) : (
                    <Calendar size={12} />
                  )
                }
                variant="flat"
              >
                {dayjs(tarefa.dataLimite).format("DD/MM")}
              </Chip>
            )}
            {tarefa.estimativaHoras && (
              <Chip
                className="text-default-600"
                size="sm"
                startContent={<Clock size={12} />}
                variant="flat"
              >
                {tarefa.estimativaHoras}h
              </Chip>
            )}
          </div>

          {tarefa.responsavel && (
            <Avatar
              className="w-7 h-7 text-xs ring-2 ring-background"
              name={`${tarefa.responsavel.firstName} ${tarefa.responsavel.lastName}`}
              size="sm"
              src={tarefa.responsavel.avatarUrl || undefined}
            />
          )}
        </div>

        {/* Categoria Badge (Barra colorida no final) */}
        {tarefa.categoria && (
          <div className="flex items-center gap-1 -mx-4 -mb-4 mt-3 px-4 py-2 bg-default-50">
            <div
              className="w-1 h-4 rounded-full"
              style={{ backgroundColor: tarefa.categoria.corHex || "#3B82F6" }}
            />
            <span className="text-xs font-medium text-default-600">
              {tarefa.categoria.nome}
            </span>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
