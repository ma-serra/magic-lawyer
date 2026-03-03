"use client";

import type { Selection } from "@react-types/shared";
import type { AdvogadoSelectItem } from "@/app/actions/advogados";
import type { Cliente as ClienteDTO } from "@/app/actions/clientes";
import type { Processo as ProcessoDTO } from "@/app/actions/processos";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Checkbox } from "@heroui/checkbox";
import { Divider } from "@heroui/divider";
import { Input, Textarea } from "@heroui/input";

import { Spinner } from "@heroui/spinner";
import {
  ArrowLeft,
  Calendar,
  FileSignature,
  Save,
  User,
  Building2,
  Users,
  FileText,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/toast";

import {
  createProcuracao,
  type ProcuracaoCreateInput,
} from "@/app/actions/procuracoes";
import { useClientesParaSelect } from "@/app/hooks/use-clientes";
import { useProcessosCliente } from "@/app/hooks/use-processos";
import { useModelosProcuracaoParaSelect } from "@/app/hooks/use-modelos-procuracao";
import { useAdvogadosDisponiveis } from "@/app/hooks/use-advogados";
import {
  ProcuracaoEmitidaPor,
  ProcuracaoStatus,
  TipoPessoa,
} from "@/generated/prisma";
import { title } from "@/components/primitives";
import { Select, SelectItem } from "@heroui/react";
import { DateInput } from "@/components/ui/date-input";

type ClienteSelectItem = Pick<
  ClienteDTO,
  "id" | "nome" | "tipoPessoa" | "email" | "documento"
>;
type ModeloSelectItem = { id: string; nome: string; categoria?: string | null };

const emptyPoder = { titulo: "", descricao: "" };

const formatDateInput = (value?: Date | string | null) => {
  if (!value) return "";

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().split("T")[0];
};

const parseDateInput = (value: string): Date | undefined => {
  if (!value) return undefined;

  return new Date(`${value}T00:00:00`);
};

export default function NovaProcuracaoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const clienteIdParam = searchParams.get("clienteId") ?? "";
  const modeloIdParam = searchParams.get("modeloId") ?? "";
  const processoIdsParam = searchParams.get("processoIds") ?? "";
  const retorno = searchParams.get("returnTo") ?? "";
  const getRetornoUrl = () => {
    if (!retorno) {
      return null;
    }

    try {
      return decodeURIComponent(retorno);
    } catch (_error) {
      return null;
    }
  };

  const navegarRetorno = () => {
    const retornoUrl = getRetornoUrl();

    if (retornoUrl) {
      router.push(retornoUrl);

      return;
    }

    if (clienteIdParam) {
      router.push(`/clientes/${clienteIdParam}`);
    } else {
      router.push("/procuracoes");
    }
  };

  const preselectedProcessoIds = useMemo(
    () =>
      processoIdsParam
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    [processoIdsParam],
  );

  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<ProcuracaoCreateInput>({
    numero: "",
    arquivoUrl: "",
    observacoes: "",
    status: ProcuracaoStatus.RASCUNHO,
    emitidaPor: ProcuracaoEmitidaPor.ESCRITORIO,
    ativa: true,
    clienteId: clienteIdParam,
    modeloId: modeloIdParam || undefined,
    processoIds: preselectedProcessoIds,
    advogadoIds: [],
    poderes: [emptyPoder],
  });

  const { clientes, isLoading: isLoadingClientes } = useClientesParaSelect();
  const { modelos, isLoading: isLoadingModelos } =
    useModelosProcuracaoParaSelect();
  const { advogados, isLoading: isLoadingAdvogados } =
    useAdvogadosDisponiveis();
  const { processos: processosDoCliente, isLoading: isLoadingProcessos } =
    useProcessosCliente(formData.clienteId || null);
  const clienteKeys = useMemo(
    () => new Set((clientes || []).map((cliente) => cliente.id)),
    [clientes],
  );
  const modeloKeys = useMemo(
    () => new Set((modelos || []).map((modelo) => modelo.id)),
    [modelos],
  );
  const processoKeys = useMemo(
    () => new Set((processosDoCliente || []).map((processo) => processo.id)),
    [processosDoCliente],
  );
  const advogadoKeys = useMemo(
    () => new Set((advogados || []).map((advogado) => advogado.id)),
    [advogados],
  );

  useEffect(() => {
    if (clienteIdParam) {
      setFormData((prev) => ({ ...prev, clienteId: clienteIdParam }));
    }
  }, [clienteIdParam]);

  useEffect(() => {
    if (modeloIdParam) {
      setFormData((prev) => ({ ...prev, modeloId: modeloIdParam }));
    }
  }, [modeloIdParam]);

  useEffect(() => {
    if (preselectedProcessoIds.length === 0) return;

    setFormData((prev) => ({
      ...prev,
      processoIds: preselectedProcessoIds,
    }));
  }, [preselectedProcessoIds]);

  const selectedClienteKeys =
    formData.clienteId && clienteKeys.has(formData.clienteId)
      ? [formData.clienteId]
      : [];
  const selectedModeloKeys =
    formData.modeloId && modeloKeys.has(formData.modeloId)
      ? [formData.modeloId]
      : [];
  const selectedProcessoKeys = useMemo(
    () =>
      new Set(
        (formData.processoIds ?? []).filter((processoId) =>
          processoKeys.has(processoId),
        ),
      ),
    [formData.processoIds, processoKeys],
  );

  const selectedAdvogadoKeys = useMemo(
    () =>
      new Set(
        (formData.advogadoIds ?? []).filter((advogadoId) =>
          advogadoKeys.has(advogadoId),
        ),
      ),
    [formData.advogadoIds, advogadoKeys],
  );

  const poderes = formData.poderes ?? [];

  if (isLoadingClientes && !clienteIdParam) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Spinner label="Carregando dados..." size="lg" />
      </div>
    );
  }

  const handleClienteSelection = (keys: Selection) => {
    const [key] = Array.from(keys);
    const novoClienteId = (key as string | undefined) ?? "";

    setFormData((prev) => ({
      ...prev,
      clienteId: novoClienteId,
      processoIds: [],
    }));
  };

  const handleProcessoSelectionChange = (keys: Selection) => {
    if (keys === "all") {
      const todosProcessos =
        processosDoCliente?.map((processo) => processo.id) ?? [];

      setFormData((prev) => ({
        ...prev,
        processoIds: todosProcessos,
      }));

      return;
    }

    setFormData((prev) => ({
      ...prev,
      processoIds: Array.from(keys).map(String),
    }));
  };

  const handleAdvogadoSelectionChange = (keys: Selection) => {
    if (keys === "all") {
      const todosAdvogados = advogados?.map((advogado) => advogado.id) ?? [];

      setFormData((prev) => ({
        ...prev,
        advogadoIds: todosAdvogados,
      }));

      return;
    }

    setFormData((prev) => ({
      ...prev,
      advogadoIds: Array.from(keys).map(String),
    }));
  };

  const handleAdicionarPoder = () => {
    setFormData((prev) => ({
      ...prev,
      poderes: [...(prev.poderes ?? []), emptyPoder],
    }));
  };

  const handleRemoverPoder = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      poderes: (prev.poderes ?? []).filter((_, idx) => idx !== index),
    }));
  };

  const handleAtualizarPoder = (
    index: number,
    field: "titulo" | "descricao",
    value: string,
  ) => {
    setFormData((prev) => {
      const poderesAtualizados = [...(prev.poderes ?? [])];

      poderesAtualizados[index] = {
        ...poderesAtualizados[index],
        [field]: value,
      };

      return {
        ...prev,
        poderes: poderesAtualizados,
      };
    });
  };

  const handleSubmit = async () => {
    if (!formData.clienteId) {
      toast.error("Selecione um cliente");

      return;
    }

    setIsSaving(true);

    try {
      const payload: ProcuracaoCreateInput = {
        ...formData,
        numero: formData.numero?.trim() || undefined,
        arquivoUrl: formData.arquivoUrl?.trim() || undefined,
        observacoes: formData.observacoes?.trim() || undefined,
        modeloId: formData.modeloId || undefined,
        processoIds:
          formData.processoIds && formData.processoIds.length > 0
            ? formData.processoIds
            : undefined,
        advogadoIds: formData.advogadoIds ?? [],
        poderes: (formData.poderes ?? [])
          .map((poder) => ({
            titulo: poder.titulo?.trim() || undefined,
            descricao: poder.descricao.trim(),
          }))
          .filter((poder) => poder.descricao.length > 0),
      };

      const result = await createProcuracao(payload);

      if (result.success) {
        toast.success("Procuração criada com sucesso!");

        const procuracaoId = result.procuracao?.id;

        if (!procuracaoId) {
          toast.error("Falha ao recuperar a procuração criada.");

          return;
        }

        if (retorno) {
          try {
            const retornoNormalizado = decodeURIComponent(retorno);
            const retornoComProcuracao =
              `${retornoNormalizado}${retornoNormalizado.includes("?") ? "&" : "?"}` +
              `returnProcuracaoId=${encodeURIComponent(procuracaoId)}&autoVincularProcuracao=1`;

            router.push(retornoComProcuracao);
          } catch (_error) {
            toast.error("Erro ao retornar para o contrato, tente novamente.");

            return;
          }

          return;
        }

        if (clienteIdParam) {
          router.push(`/clientes/${clienteIdParam}`);
        } else {
          router.push("/procuracoes");
        }
      } else {
        toast.error(result.error || "Erro ao criar procuração");
      }
    } catch (error) {
      toast.error("Erro ao criar procuração");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={title()}>Nova Procuração</h1>
          <p className="mt-1 text-sm text-default-500">
            Preencha os dados conforme o modelo e vincule aos responsáveis.
          </p>
        </div>
        <Button
          startContent={<ArrowLeft className="h-4 w-4" />}
          variant="light"
          onPress={navegarRetorno}
        >
          Voltar
        </Button>
      </div>

      {clienteIdParam && (
        <Card className="border border-success/20 bg-success/5">
          <CardBody className="flex flex-row items-center gap-2">
            <User className="h-5 w-5 text-success" />
            <p className="text-sm text-success">
              Esta procuração será vinculada ao cliente selecionado.
            </p>
          </CardBody>
        </Card>
      )}

      <Card className="border border-default-200">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-success" />
            <h2 className="text-lg font-semibold">Informações da Procuração</h2>
          </div>
        </CardHeader>
        <Divider />
        <CardBody className="gap-6">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-default-600">
              📋 Dados Básicos
            </h3>

            {!clienteIdParam && (
              <Select
                isRequired
                description="Selecione o cliente outorgante"
                label="Cliente *"
                placeholder="Selecione um cliente"
                selectedKeys={selectedClienteKeys}
                startContent={<User className="h-4 w-4 text-default-400" />}
                onSelectionChange={handleClienteSelection}
              >
                {clientes.map((cliente: ClienteSelectItem) => (
                  <SelectItem key={cliente.id} textValue={cliente.nome}>
                    <div className="flex items-center gap-2">
                      {cliente.tipoPessoa === TipoPessoa.JURIDICA ? (
                        <Building2 className="h-4 w-4 text-default-400" />
                      ) : (
                        <User className="h-4 w-4 text-default-400" />
                      )}
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold">
                          {cliente.nome}
                        </span>
                        {cliente.email && (
                          <span className="text-xs text-default-400">
                            {cliente.email}
                          </span>
                        )}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </Select>
            )}

            <Input
              description="Número de controle interno (opcional)"
              label="Número da Procuração"
              placeholder="Ex: PROC-2024-001"
              value={formData.numero ?? ""}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, numero: value }))
              }
            />

            <Select
              isLoading={isLoadingModelos}
              label="Modelo de Procuração"
              placeholder="Selecione um modelo (opcional)"
              selectedKeys={selectedModeloKeys}
              onSelectionChange={(keys) => {
                const [key] = Array.from(keys);

                setFormData((prev) => ({
                  ...prev,
                  modeloId: (key as string | undefined) || undefined,
                }));
              }}
            >
              {(modelos ?? []).map((modelo: ModeloSelectItem) => (
                <SelectItem key={modelo.id} textValue={modelo.nome}>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-default-700">
                      {modelo.nome}
                    </span>
                    {modelo.categoria && (
                      <span className="text-xs text-default-400">
                        {modelo.categoria}
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </Select>

            <Input
              label="URL do Documento (opcional)"
              placeholder="https://..."
              startContent={<FileText className="h-4 w-4 text-default-400" />}
              value={formData.arquivoUrl ?? ""}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, arquivoUrl: value }))
              }
            />

            <Textarea
              label="Observações"
              minRows={4}
              placeholder="Poderes outorgados, observações especiais..."
              value={formData.observacoes ?? ""}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, observacoes: value }))
              }
            />
          </div>

          <Divider />

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-default-600">
              🔗 Vinculações
            </h3>

            <Select
              isDisabled={!formData.clienteId || isLoadingProcessos}
              isLoading={isLoadingProcessos}
              label="Processos vinculados"
              placeholder={
                formData.clienteId
                  ? "Selecione os processos (opcional)"
                  : "Selecione um cliente para listar processos"
              }
              selectedKeys={selectedProcessoKeys}
              selectionMode="multiple"
              onSelectionChange={handleProcessoSelectionChange}
            >
              {(processosDoCliente ?? []).map((processo: ProcessoDTO) => (
                <SelectItem
                  key={processo.id}
                  textValue={`${processo.numero}${processo.titulo ? ` - ${processo.titulo}` : ""}`}
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-default-700">
                      {processo.numero}
                    </span>
                    {processo.titulo && (
                      <span className="text-xs text-default-400">
                        {processo.titulo}
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </Select>

            <Select
              isLoading={isLoadingAdvogados}
              label="Advogados outorgados"
              placeholder="Selecione os advogados habilitados (opcional)"
              selectedKeys={selectedAdvogadoKeys}
              selectionMode="multiple"
              startContent={<Users className="h-4 w-4 text-default-400" />}
              onSelectionChange={handleAdvogadoSelectionChange}
            >
              {(advogados ?? []).map((advogado: AdvogadoSelectItem) => (
                <SelectItem
                  key={advogado.id}
                  textValue={
                    `${advogado.usuario.firstName ?? ""} ${advogado.usuario.lastName ?? ""}`.trim() ||
                    advogado.usuario.email
                  }
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-default-700">
                      {`${advogado.usuario.firstName ?? ""} ${advogado.usuario.lastName ?? ""}`.trim() ||
                        advogado.usuario.email}
                    </span>
                    <span className="text-xs text-default-400">
                      {advogado.oabNumero && advogado.oabUf
                        ? `OAB ${advogado.oabNumero}/${advogado.oabUf}`
                        : advogado.usuario.email}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </Select>
          </div>

          <Divider />

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-default-600">
              📅 Status e Validade
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Status"
                placeholder="Selecione o status"
                selectedKeys={formData.status ? [formData.status] : []}
                onSelectionChange={(keys) => {
                  const [key] = Array.from(keys);

                  setFormData((prev) => ({
                    ...prev,
                    status:
                      (key as ProcuracaoStatus | undefined) ??
                      ProcuracaoStatus.RASCUNHO,
                  }));
                }}
              >
                <SelectItem key={ProcuracaoStatus.RASCUNHO} textValue="Rascunho">
                  Rascunho
                </SelectItem>
                <SelectItem key={ProcuracaoStatus.PENDENTE_ASSINATURA} textValue="Pendente assinatura">
                  Pendente assinatura
                </SelectItem>
                <SelectItem key={ProcuracaoStatus.VIGENTE} textValue="Vigente">Vigente</SelectItem>
                <SelectItem key={ProcuracaoStatus.REVOGADA} textValue="Revogada">
                  Revogada
                </SelectItem>
                <SelectItem key={ProcuracaoStatus.EXPIRADA} textValue="Expirada">
                  Expirada
                </SelectItem>
              </Select>

              <Select
                label="Emitida por"
                placeholder="Selecione"
                selectedKeys={formData.emitidaPor ? [formData.emitidaPor] : []}
                onSelectionChange={(keys) => {
                  const [key] = Array.from(keys);

                  setFormData((prev) => ({
                    ...prev,
                    emitidaPor:
                      (key as ProcuracaoEmitidaPor | undefined) ??
                      ProcuracaoEmitidaPor.ESCRITORIO,
                  }));
                }}
              >
                <SelectItem key={ProcuracaoEmitidaPor.ESCRITORIO} textValue="Escritório">
                  Escritório
                </SelectItem>
                <SelectItem key={ProcuracaoEmitidaPor.ADVOGADO} textValue="Advogado">
                  Advogado
                </SelectItem>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <DateInput
                label="Data de emissão"
                startContent={<Calendar className="h-4 w-4 text-default-400" />}
                value={formatDateInput(formData.emitidaEm)}
                onValueChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    emitidaEm: parseDateInput(value),
                  }))
                }
              />

              <DateInput
                label="Válida até"
                startContent={<Calendar className="h-4 w-4 text-default-400" />}
                value={formatDateInput(formData.validaAte)}
                onValueChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    validaAte: parseDateInput(value),
                  }))
                }
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <DateInput
                label="Revogada em"
                startContent={<Calendar className="h-4 w-4 text-default-400" />}
                value={formatDateInput(formData.revogadaEm)}
                onValueChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    revogadaEm: parseDateInput(value),
                  }))
                }
              />

              <DateInput
                label="Assinada pelo cliente em"
                startContent={<Calendar className="h-4 w-4 text-default-400" />}
                value={formatDateInput(formData.assinadaPeloClienteEm)}
                onValueChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    assinadaPeloClienteEm: parseDateInput(value),
                  }))
                }
              />
            </div>

            <Checkbox
              isSelected={formData.ativa ?? true}
              onValueChange={(checked) =>
                setFormData((prev) => ({ ...prev, ativa: checked }))
              }
            >
              <div className="flex flex-col">
                <span className="text-sm font-semibold">Procuração ativa</span>
                <span className="text-xs text-default-400">
                  Marque se a procuração está em vigor.
                </span>
              </div>
            </Checkbox>
          </div>

          <Divider />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-default-600">
                ⚖️ Poderes outorgados
              </h3>
              <Button
                size="sm"
                startContent={<Plus className="h-4 w-4" />}
                variant="light"
                onPress={handleAdicionarPoder}
              >
                Adicionar poder
              </Button>
            </div>

            {poderes.length === 0 ? (
              <p className="text-sm text-default-500">
                Nenhum poder cadastrado. Utilize o botão acima para adicionar.
              </p>
            ) : (
              <div className="space-y-4">
                {poderes.map((poder, index) => (
                  <Card
                    key={`poder-${index}`}
                    className="border border-default-200"
                  >
                    <CardBody className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-default-600">
                          Poder {index + 1}
                        </span>
                        <Button
                          color="danger"
                          size="sm"
                          startContent={<Trash2 className="h-4 w-4" />}
                          variant="light"
                          onPress={() => handleRemoverPoder(index)}
                        >
                          Remover
                        </Button>
                      </div>
                      <Input
                        label="Título (opcional)"
                        placeholder="Representar em audiências..."
                        value={poder.titulo ?? ""}
                        onValueChange={(value) =>
                          handleAtualizarPoder(index, "titulo", value)
                        }
                      />
                      <Textarea
                        isRequired
                        label="Descrição do poder"
                        minRows={3}
                        placeholder="Descreva o poder concedido"
                        value={poder.descricao}
                        onValueChange={(value) =>
                          handleAtualizarPoder(index, "descricao", value)
                        }
                      />
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-success/20 bg-success/5 p-4">
            <p className="text-xs text-success-600">
              💡 Dica: cadastre todos os poderes necessários e vincule os
              processos relacionados antes de salvar para evitar retrabalho.
            </p>
          </div>

          <div className="flex justify-end gap-3">
            <Button
              variant="light"
              onPress={navegarRetorno}
            >
              Cancelar
            </Button>
            <Button
              color="success"
              isLoading={isSaving}
              startContent={
                !isSaving ? <Save className="h-4 w-4" /> : undefined
              }
              onPress={handleSubmit}
            >
              Criar Procuração
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
