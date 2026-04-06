"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Button } from "@heroui/button";
import { Checkbox } from "@heroui/checkbox";
import { Input, Textarea } from "@heroui/input";
import { Spinner } from "@heroui/spinner";
import { Switch } from "@heroui/switch";
import { Select, SelectItem } from "@heroui/react";
import { FolderTree, Link2, PencilLine } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { toast } from "@/lib/toast";
import {
  createExplorerFolder,
  getDocumentExplorerData,
  updateExplorerDocument,
  type DocumentExplorerCatalogoCausa,
  type DocumentExplorerContrato,
  type DocumentExplorerProcess,
} from "@/app/actions/documentos-explorer";
import type { CloudinaryFolderNode } from "@/lib/upload-service";

type OrganizerDocument = {
  id: string;
  nome: string;
  descricao?: string | null;
  visivelParaCliente: boolean;
  metadados?: unknown | null;
};

type OrganizerData = {
  tenantSlug: string;
  folderTree: CloudinaryFolderNode | null;
  processos: Array<Pick<DocumentExplorerProcess, "id" | "numero" | "titulo">>;
  contratos: Array<Pick<DocumentExplorerContrato, "id" | "titulo" | "processoId">>;
  causas: Array<Pick<DocumentExplorerCatalogoCausa, "id" | "nome" | "codigoCnj">>;
};

type OrganizerFormState = {
  nome: string;
  descricao: string;
  visivelParaCliente: boolean;
  processoIds: string[];
  contratoIds: string[];
  causaId: string | null;
  targetFolderSegments: string[];
};

type FolderCreatePlacement = "selected" | "root";

interface ProcessoDocumentoOrganizerModalProps {
  isOpen: boolean;
  processoId: string;
  clienteId: string | null | undefined;
  document: OrganizerDocument | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

function getStringArrayFromMetadata(
  metadata: Record<string, unknown>,
  key: string,
): string[] {
  const value = metadata[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function getBaseSegmentsFromTreePath(
  folderTree: CloudinaryFolderNode | null,
  tenantSlug: string,
): string[] {
  if (!folderTree) {
    return [];
  }

  const segments = folderTree.path.split("/").filter(Boolean);

  if (segments[0] === "magiclawyer") {
    segments.shift();
  }

  if (segments[0] === tenantSlug) {
    segments.shift();
  }

  return segments;
}

function getRelativeSegmentsFromNodePath(
  path: string,
  tenantSlug: string,
  baseSegments: string[],
): string[] {
  const segments = path.split("/").filter(Boolean);

  if (segments[0] === "magiclawyer") {
    segments.shift();
  }

  if (segments[0] === tenantSlug) {
    segments.shift();
  }

  return segments.slice(baseSegments.length);
}

function buildInitialState(
  document: OrganizerDocument | null,
  processoId: string,
): OrganizerFormState {
  const metadata =
    document?.metadados && typeof document.metadados === "object"
      ? (document.metadados as Record<string, unknown>)
      : {};

  const processIds = Array.from(
    new Set([processoId, ...getStringArrayFromMetadata(metadata, "processos")]),
  );
  const contratoIds = getStringArrayFromMetadata(metadata, "contratos");
  const subpastas = getStringArrayFromMetadata(metadata, "subpastas");

  return {
    nome: document?.nome ?? "",
    descricao: document?.descricao ?? "",
    visivelParaCliente: document?.visivelParaCliente ?? true,
    processoIds: processIds.length > 0 ? processIds : [processoId],
    contratoIds,
    causaId:
      typeof metadata.causaId === "string" && metadata.causaId.trim().length > 0
        ? metadata.causaId
        : null,
    targetFolderSegments: subpastas,
  };
}

function FolderNodeButton({
  node,
  tenantSlug,
  baseSegments,
  selectedSegments,
  depth,
  onSelect,
}: {
  node: CloudinaryFolderNode;
  tenantSlug: string;
  baseSegments: string[];
  selectedSegments: string[];
  depth: number;
  onSelect: (segments: string[]) => void;
}) {
  const relativeSegments = getRelativeSegmentsFromNodePath(
    node.path,
    tenantSlug,
    baseSegments,
  );
  const isRoot = relativeSegments.length === 0;
  const isSelected = selectedSegments.join("/") === relativeSegments.join("/");

  return (
    <div className="space-y-2">
      <button
        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
          isSelected
            ? "bg-primary/10 text-primary"
            : "text-default-600 hover:bg-default-100"
        }`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        type="button"
        onClick={() => onSelect(relativeSegments)}
      >
        <FolderTree className="h-4 w-4" />
        <span>{isRoot ? "Pasta principal" : node.name}</span>
      </button>

      {node.children.map((child) => (
        <FolderNodeButton
          key={child.path}
          baseSegments={baseSegments}
          depth={depth + 1}
          node={child}
          selectedSegments={selectedSegments}
          tenantSlug={tenantSlug}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

export function ProcessoDocumentoOrganizerModal({
  isOpen,
  processoId,
  clienteId,
  document,
  onClose,
  onSaved,
}: ProcessoDocumentoOrganizerModalProps) {
  const [form, setForm] = useState<OrganizerFormState>(() =>
    buildInitialState(document, processoId),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderPlacement, setNewFolderPlacement] =
    useState<FolderCreatePlacement>("selected");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setForm(buildInitialState(document, processoId));
    setNewFolderName("");
    setNewFolderPlacement("selected");
  }, [document, isOpen, processoId]);

  const { data, isLoading, mutate } = useSWR<OrganizerData | null>(
    isOpen && clienteId ? ["processo-document-organizer", clienteId, processoId] : null,
    async () => {
      if (!clienteId) {
        return null;
      }

      const result = await getDocumentExplorerData(clienteId, {
        processoIdForTree: processoId,
        includeCloudinaryTree: true,
        processosPageSize: 100,
      });

      if (!result.success || !result.data?.clientes.length) {
        throw new Error(result.error || "Erro ao carregar dados do documento");
      }

      const cliente = result.data.clientes[0];
      const processo = cliente.processos.find((item) => item.id === processoId);

      return {
        tenantSlug: result.data.tenantSlug,
        folderTree: processo?.folderTree ?? null,
        processos: cliente.processos.map((item) => ({
          id: item.id,
          numero: item.numero,
          titulo: item.titulo,
        })),
        contratos: cliente.contratos.map((item) => ({
          id: item.id,
          titulo: item.titulo,
          processoId: item.processoId,
        })),
        causas: result.data.catalogos.causas.map((item) => ({
          id: item.id,
          nome: item.nome,
          codigoCnj: item.codigoCnj,
        })),
      };
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    },
  );

  const baseSegments = useMemo(
    () => getBaseSegmentsFromTreePath(data?.folderTree ?? null, data?.tenantSlug ?? ""),
    [data?.folderTree, data?.tenantSlug],
  );
  const selectedCausaKeys = useMemo(() => {
    if (!form.causaId) {
      return [];
    }

    const hasSelectedCausa = (data?.causas ?? []).some(
      (causa) => causa.id === form.causaId,
    );

    return hasSelectedCausa ? [form.causaId] : [];
  }, [data?.causas, form.causaId]);
  const createFolderParentSegments =
    newFolderPlacement === "root" ? [] : form.targetFolderSegments;
  const createFolderParentLabel =
    createFolderParentSegments.length > 0
      ? createFolderParentSegments.join(" / ")
      : "Pasta principal";

  const canSubmit = form.nome.trim().length > 0 && !!document && !!clienteId;

  const handleToggleProcesso = (targetProcessoId: string, selected: boolean) => {
    setForm((prev) => {
      const next = new Set(prev.processoIds);

      if (selected) {
        next.add(targetProcessoId);
      } else if (targetProcessoId !== processoId) {
        next.delete(targetProcessoId);
      }

      next.add(processoId);

      return {
        ...prev,
        processoIds: Array.from(next),
      };
    });
  };

  const handleToggleContrato = (contratoId: string, selected: boolean) => {
    setForm((prev) => {
      const next = new Set(prev.contratoIds);

      if (selected) {
        next.add(contratoId);
      } else {
        next.delete(contratoId);
      }

      return {
        ...prev,
        contratoIds: Array.from(next),
      };
    });
  };

  const handleSubmit = async () => {
    if (!document || !clienteId) {
      return;
    }

    if (!form.nome.trim()) {
      toast.error("Informe o nome do documento");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await updateExplorerDocument({
        documentoId: document.id,
        clienteId,
        processoId,
        nome: form.nome,
        descricao: form.descricao,
        visivelParaCliente: form.visivelParaCliente,
        processoIds: form.processoIds,
        contratoIds: form.contratoIds,
        causaId: form.causaId,
        targetFolderSegments: form.targetFolderSegments,
      });

      if (!result.success) {
        toast.error(result.error || "Não foi possível atualizar o documento");
        return;
      }

      toast.success("Documento atualizado");
      await onSaved();
      onClose();
    } catch (error) {
      toast.error("Erro ao atualizar documento");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!clienteId || !data) {
      return;
    }

    if (!newFolderName.trim()) {
      toast.error("Informe o nome da nova pasta");
      return;
    }

    setIsCreatingFolder(true);
    try {
      const result = await createExplorerFolder({
        clienteId,
        processoId,
        nomePasta: newFolderName,
        parentSegments: createFolderParentSegments,
      });

      if (!result.success || !result.path) {
        toast.error(result.error || "Nao foi possivel criar a pasta");
        return;
      }

      const refreshedData = (await mutate()) ?? data;
      const refreshedTenantSlug = refreshedData?.tenantSlug ?? data.tenantSlug;
      const refreshedBaseSegments = getBaseSegmentsFromTreePath(
        refreshedData?.folderTree ?? data.folderTree,
        refreshedTenantSlug,
      );
      const createdFolderSegments = getRelativeSegmentsFromNodePath(
        result.path,
        refreshedTenantSlug,
        refreshedBaseSegments,
      );

      setForm((prev) => ({
        ...prev,
        targetFolderSegments: createdFolderSegments,
      }));
      setNewFolderName("");
      setNewFolderPlacement("selected");
      toast.success("Pasta criada");
    } catch (error) {
      toast.error("Erro ao criar pasta");
    } finally {
      setIsCreatingFolder(false);
    }
  };

  return (
    <Modal
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button isDisabled={isSubmitting} variant="light" onPress={onClose}>
            Cancelar
          </Button>
          <Button
            color="primary"
            isDisabled={!canSubmit}
            isLoading={isSubmitting}
            onPress={handleSubmit}
          >
            Salvar organização
          </Button>
        </div>
      }
      isOpen={isOpen}
      size="2xl"
      title="Editar e organizar documento"
      onClose={onClose}
    >
      {!document ? null : isLoading ? (
        <div className="flex min-h-64 items-center justify-center">
          <Spinner label="Carregando organização do documento..." />
        </div>
      ) : (
        <div className="space-y-5">
          <section className="space-y-3 rounded-xl border border-default-200 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <PencilLine className="h-4 w-4 text-primary" />
              Editar
            </div>
            <Input
              label="Nome do documento"
              placeholder="Ex.: Contrato social atualizado"
              value={form.nome}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  nome: value,
                }))
              }
            />
            <Textarea
              label="Descrição"
              minRows={2}
              placeholder="Observações internas sobre o documento"
              value={form.descricao}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  descricao: value,
                }))
              }
            />
            <Switch
              isSelected={form.visivelParaCliente}
              onValueChange={(selected) =>
                setForm((prev) => ({
                  ...prev,
                  visivelParaCliente: selected,
                }))
              }
            >
              Permitir visualização no portal do cliente
            </Switch>
          </section>

          <section className="space-y-3 rounded-xl border border-default-200 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FolderTree className="h-4 w-4 text-primary" />
              Mover para
            </div>
            <p className="text-xs text-default-500">
              Pasta atual:{" "}
              {form.targetFolderSegments.length > 0
                ? form.targetFolderSegments.join(" / ")
                : "Pasta principal"}
            </p>
            <div className="space-y-3 rounded-lg border border-dashed border-default-300 bg-default-50/40 p-3">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-default-500">
                  Criar pasta
                </p>
                <p className="text-xs text-default-500">
                  Crie uma pasta nova dentro da selecao atual ou direto fora dela,
                  na raiz do processo.
                </p>
              </div>
              <Input
                label="Nome da nova pasta"
                placeholder="Ex.: Audiências, Laudos, Contratos"
                value={newFolderName}
                onValueChange={setNewFolderName}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  color={newFolderPlacement === "selected" ? "primary" : "default"}
                  size="sm"
                  variant={newFolderPlacement === "selected" ? "flat" : "bordered"}
                  onPress={() => setNewFolderPlacement("selected")}
                >
                  Criar dentro desta pasta
                </Button>
                <Button
                  color={newFolderPlacement === "root" ? "primary" : "default"}
                  size="sm"
                  variant={newFolderPlacement === "root" ? "flat" : "bordered"}
                  onPress={() => setNewFolderPlacement("root")}
                >
                  Criar fora, na raiz
                </Button>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-default-200 bg-background px-3 py-2 text-xs text-default-500">
                <span>
                  A nova pasta sera criada em: <strong>{createFolderParentLabel}</strong>
                </span>
                <Button
                  color="primary"
                  isDisabled={!newFolderName.trim() || isCreatingFolder}
                  isLoading={isCreatingFolder}
                  size="sm"
                  variant="flat"
                  onPress={handleCreateFolder}
                >
                  Criar pasta
                </Button>
              </div>
            </div>
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-default-200 bg-default-50/60 p-2">
              {data?.folderTree ? (
                <FolderNodeButton
                  baseSegments={baseSegments}
                  depth={0}
                  node={data.folderTree}
                  selectedSegments={form.targetFolderSegments}
                  tenantSlug={data.tenantSlug}
                  onSelect={(segments) =>
                    setForm((prev) => ({
                      ...prev,
                      targetFolderSegments: segments,
                    }))
                  }
                />
              ) : (
                <button
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                    form.targetFolderSegments.length === 0
                      ? "bg-primary/10 text-primary"
                      : "text-default-600 hover:bg-default-100"
                  }`}
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      targetFolderSegments: [],
                    }))
                  }
                >
                  <FolderTree className="h-4 w-4" />
                  Pasta principal
                </button>
              )}
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-default-200 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Link2 className="h-4 w-4 text-primary" />
              Vincular a
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-default-500">
                Processos
              </p>
              <div className="space-y-2 rounded-lg border border-default-200 p-3">
                {data?.processos.length ? (
                  data.processos.map((processoOption) => (
                    <Checkbox
                      key={processoOption.id}
                      isDisabled={processoOption.id === processoId}
                      isSelected={form.processoIds.includes(processoOption.id)}
                      onValueChange={(selected) =>
                        handleToggleProcesso(processoOption.id, selected)
                      }
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">
                          {processoOption.numero}
                        </span>
                        <span className="text-xs text-default-500">
                          {processoOption.id === processoId
                            ? "Processo atual"
                            : processoOption.titulo || "Sem título"}
                        </span>
                      </div>
                    </Checkbox>
                  ))
                ) : (
                  <p className="text-sm text-default-500">
                    Nenhum outro processo disponível para o cliente.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-default-500">
                Contratos
              </p>
              <div className="space-y-2 rounded-lg border border-default-200 p-3">
                {data?.contratos.length ? (
                  data.contratos.map((contrato) => (
                    <Checkbox
                      key={contrato.id}
                      isSelected={form.contratoIds.includes(contrato.id)}
                      onValueChange={(selected) =>
                        handleToggleContrato(contrato.id, selected)
                      }
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">
                          {contrato.titulo}
                        </span>
                        <span className="text-xs text-default-500">
                          {contrato.processoId
                            ? `Ligado ao processo ${contrato.processoId}`
                            : "Sem processo principal"}
                        </span>
                      </div>
                    </Checkbox>
                  ))
                ) : (
                  <p className="text-sm text-default-500">
                    Nenhum contrato disponível para o cliente.
                  </p>
                )}
              </div>
            </div>

            <Select
              label="Causa"
              placeholder="Opcional"
              selectedKeys={selectedCausaKeys}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as string | undefined;

                setForm((prev) => ({
                  ...prev,
                  causaId: selected || null,
                }));
              }}
            >
              {[
                <SelectItem key="" textValue="Sem causa específica">
                  Sem causa específica
                </SelectItem>,
                ...(data?.causas ?? []).map((causa) => (
                  <SelectItem
                    key={causa.id}
                    textValue={`${causa.nome}${causa.codigoCnj ? ` ${causa.codigoCnj}` : ""}`}
                  >
                    {causa.nome}
                    {causa.codigoCnj ? ` · ${causa.codigoCnj}` : ""}
                  </SelectItem>
                )),
              ]}
            </Select>
          </section>
        </div>
      )}
    </Modal>
  );
}
