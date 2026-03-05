import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Kanban - Tarefas",
  description:
    "Visualização em quadros para gerenciamento de tarefas e atividades.",
};

export default function KanbanPage() {
  redirect("/tarefas?view=kanban");
}
