"use client";

import { Chip } from "@heroui/chip";
import { Button } from "@heroui/button";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";

import { TarefaCard } from "./tarefa-card";

interface KanbanColumnProps {
  column: {
    id: string;
    nome: string;
    cor: string | null;
    limite: number | null;
    _count?: {
      tarefas: number;
    };
  };
  tarefas: any[];
  onTarefaClick: (tarefa: any) => void;
  onAddTask: (columnId: string) => void;
}

export function KanbanColumn({
  column,
  tarefas,
  onTarefaClick,
  onAddTask,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  const tarefaIds = tarefas.map((t) => t.id);
  const count = tarefas.length;
  const isOverLimit = column.limite && count >= column.limite;

  return (
    <div className="flex-shrink-0 w-80">
      <div className="bg-default-50 rounded-xl border-2 border-default-200 overflow-hidden">
        {/* Header da Coluna */}
        <div className="p-4 pb-3 bg-background/80 backdrop-blur-sm border-b-2 border-default-200">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {column.cor && (
                <div
                  className="w-3 h-3 rounded-full shadow-sm"
                  style={{ backgroundColor: column.cor }}
                />
              )}
              <h3 className="font-bold text-base">{column.nome}</h3>
            </div>
            <div className="flex items-center gap-2">
              <Chip
                className="font-semibold"
                color={isOverLimit ? "danger" : "default"}
                size="sm"
                variant="flat"
              >
                {count}
                {column.limite ? `/${column.limite}` : ""}
              </Chip>
            </div>
          </div>
        </div>

        {/* Body da Coluna - Drop Zone */}
        <div
          ref={setNodeRef}
          className={`p-3 min-h-[500px] max-h-[calc(100vh-300px)] overflow-y-auto transition-all ${isOver ? "bg-primary/10 ring-2 ring-primary ring-inset" : "bg-transparent"}`}
        >
          <div className="space-y-3">
            <SortableContext
              items={tarefaIds}
              strategy={verticalListSortingStrategy}
            >
              {tarefas.map((tarefa) => (
                <TarefaCard
                  key={tarefa.id}
                  tarefa={tarefa}
                  onClick={() => onTarefaClick(tarefa)}
                />
              ))}
            </SortableContext>

            {/* Empty State */}
            {tarefas.length === 0 && !isOver && (
              <div className="flex flex-col items-center justify-center py-12 text-default-300">
                <div className="mb-2 text-4xl">📋</div>
                <p className="text-sm font-medium">Nenhuma tarefa</p>
                <p className="text-xs">Arraste ou crie aqui</p>
              </div>
            )}

            {/* Hover State */}
            {isOver && tarefas.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-primary">
                <div className="mb-2 text-4xl animate-bounce">👇</div>
                <p className="text-sm font-semibold">Solte aqui!</p>
              </div>
            )}

            {/* Botão Adicionar */}
            <Button
              fullWidth
              className="mt-2"
              color="default"
              size="sm"
              startContent={<Plus size={16} />}
              variant="flat"
              onPress={() => onAddTask(column.id)}
            >
              Adicionar tarefa
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
