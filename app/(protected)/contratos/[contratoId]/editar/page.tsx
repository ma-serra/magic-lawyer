"use client";

import React, { type ChangeEvent, use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Textarea } from "@heroui/input";

import { Divider } from "@heroui/divider";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/modal";
import {
  ArrowLeft,
  Save,
  FileText,
  User,
  DollarSign,
  Calendar,
  Building2,
  AlertCircle,
  LinkIcon,
  Upload,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { Spinner } from "@heroui/spinner";

import { title } from "@/components/primitives";
import {
  getContratoById,
  updateContratoComArquivo,
  vincularContratoProcuracao,
  type ContratoCreateInput,
} from "@/app/actions/contratos";
import { ContratoStatus } from "@/generated/prisma";
import {
  useClientesParaSelect,
  useProcuracoesDisponiveis,
} from "@/app/hooks/use-clientes";
import { useContratoDetalhado } from "@/app/hooks/use-contratos";
import { useDadosBancariosAtivos } from "@/app/hooks/use-dados-bancarios";
import {
  useModelosContrato,
  useTiposModeloContrato,
} from "@/app/hooks/use-modelos-contrato";
import { Select, SelectItem } from "@heroui/react";
import { DateRangeInput } from "@/components/ui/date-range-input";
import { SearchableSelect } from "@/components/searchable-select";

export default function EditarContratoPage({
  params,
}: {
  params: Promise<{ contratoId: string }>;
}) {
  const formatBancoLabel = React.useCallback((conta: any) => {
    if (!conta || !conta.banco) {
      return "Banco não informado";
    }

    if (typeof conta.banco === "string") {
      return conta.banco;
    }

    if (typeof conta.banco?.nome === "string" && conta.banco.nome.trim()) {
      return conta.banco.nome;
    }

    if (typeof conta.banco?.codigo === "string" && conta.banco.codigo.trim()) {
      return `Banco ${conta.banco.codigo}`;
    }

    return "Banco não informado";
  }, []);
  const router = useRouter();
  const resolvedParams = use(params);
  const contratoId = resolvedParams.contratoId;

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedContratoArquivo, setSelectedContratoArquivo] =
    useState<File | null>(null);
  const [removerArquivoAtual, setRemoverArquivoAtual] = useState(false);
  const contratoArquivoInputRef = React.useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState<ContratoCreateInput>({
    titulo: "",
    resumo: "",
    status: ContratoStatus.RASCUNHO,
    clienteId: "",
    observacoes: "",
  });

  const [selectedProcuracao, setSelectedProcuracao] = useState("");
  const [isLinking, setIsLinking] = useState(false);
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  const { clientes, isLoading: isLoadingClientes } = useClientesParaSelect();
  const { procuracoes, isLoading: isLoadingProcuracoes } =
    useProcuracoesDisponiveis(formData.clienteId || null);
  const { contrato, mutate } = useContratoDetalhado(contratoId);
  const { dadosBancarios, isLoading: isLoadingDadosBancarios } =
    useDadosBancariosAtivos();
  const { tipos, isLoading: isLoadingTiposContrato } = useTiposModeloContrato();
  const { modelos, isLoading: isLoadingModelosContrato } = useModelosContrato({
    ativo: true,
    tipoId: formData.tipoContratoId || undefined,
  });
  const clienteKeys = React.useMemo(
    () => new Set((clientes || []).map((cliente: any) => cliente.id)),
    [clientes],
  );
  const dadosBancariosKeys = React.useMemo(
    () => new Set((dadosBancarios || []).map((conta: any) => conta.id)),
    [dadosBancarios],
  );
  const procuracaoKeys = React.useMemo(
    () => new Set((procuracoes || []).map((procuracao: any) => procuracao.id)),
    [procuracoes],
  );
  const selectedClienteKeys =
    formData.clienteId && clienteKeys.has(formData.clienteId)
      ? [formData.clienteId]
      : [];
  const selectedDadosBancariosKeys =
    formData.dadosBancariosId &&
    dadosBancariosKeys.has(formData.dadosBancariosId)
      ? [formData.dadosBancariosId]
      : [];
  const tipoContratoKeySet = React.useMemo(
    () => new Set((tipos || []).map((tipo) => tipo.id)),
    [tipos],
  );
  const modeloContratoKeySet = React.useMemo(
    () => new Set((modelos || []).map((modelo) => modelo.id)),
    [modelos],
  );
  const selectedTipoContratoKeys =
    formData.tipoContratoId && tipoContratoKeySet.has(formData.tipoContratoId)
      ? [formData.tipoContratoId]
      : [];
  const selectedModeloContratoKeys =
    formData.modeloContratoId && modeloContratoKeySet.has(formData.modeloContratoId)
      ? [formData.modeloContratoId]
      : [];
  const selectedProcuracaoKeys =
    selectedProcuracao && procuracaoKeys.has(selectedProcuracao)
      ? [selectedProcuracao]
      : [];
  const clienteOptions = React.useMemo(
    () =>
      (clientes || []).map((cliente: any) => ({
        key: cliente.id,
        label: cliente.nome,
        textValue: [cliente.nome, cliente.email || "", cliente.documento || ""]
          .filter(Boolean)
          .join(" "),
        description: cliente.email || undefined,
        startContent:
          cliente.tipoPessoa === "JURIDICA" ? (
            <Building2 className="h-4 w-4 text-default-400" />
          ) : (
            <User className="h-4 w-4 text-default-400" />
          ),
      })),
    [clientes],
  );
  const tipoContratoOptions = React.useMemo(
    () =>
      (tipos || []).map((tipo) => ({
        key: tipo.id,
        label: tipo.nome,
        textValue: tipo.nome,
      })),
    [tipos],
  );
  const modeloContratoOptions = React.useMemo(
    () =>
      (modelos || []).map((modelo) => ({
        key: modelo.id,
        label: modelo.nome,
        textValue: [modelo.nome, modelo.categoria || ""].filter(Boolean).join(" "),
        description: modelo.categoria || undefined,
      })),
    [modelos],
  );
  const procuracaoOptions = React.useMemo(
    () =>
      procuracoes.map((procuracao: any) => ({
        key: procuracao.id,
        label:
          procuracao.numero || `Procuração ${procuracao.id.slice(-8)}`,
        textValue: [
          procuracao.numero || procuracao.id,
          `${procuracao.processos.length} processo(s)`,
        ]
          .filter(Boolean)
          .join(" "),
        description: `${procuracao.processos.length} processo(s) vinculado(s)`,
      })),
    [procuracoes],
  );

  useEffect(() => {
    async function loadContrato() {
      setIsLoading(true);
      try {
        const result = await getContratoById(contratoId);

        if (result.success && result.contrato) {
          const contrato = result.contrato;

          setFormData({
            titulo: contrato.titulo,
            resumo: contrato.resumo || "",
            status: contrato.status,
            valor: contrato.valor,
            dataInicio: contrato.dataInicio
              ? new Date(contrato.dataInicio).toISOString().split("T")[0]
              : undefined,
            dataFim: contrato.dataFim
              ? new Date(contrato.dataFim).toISOString().split("T")[0]
              : undefined,
            clienteId: contrato.clienteId,
            tipoContratoId: contrato.tipo?.id || undefined,
            modeloContratoId: contrato.modelo?.id || undefined,
            advogadoId: contrato.advogadoResponsavel?.id || undefined,
            processoId: contrato.processo?.id || undefined,
            dadosBancariosId: contrato.dadosBancariosId || undefined,
            observacoes: contrato.observacoes || "",
          });
          setSelectedContratoArquivo(null);
          setRemoverArquivoAtual(false);
        } else {
          setError(result.error || "Erro ao carregar contrato");
        }
      } catch (err) {
        setError("Erro ao carregar contrato");
      } finally {
        setIsLoading(false);
      }
    }

    loadContrato();
  }, [contratoId]);

  useEffect(() => {
    if (
      formData.modeloContratoId &&
      !modeloContratoKeySet.has(formData.modeloContratoId)
    ) {
      setFormData((prev) => ({
        ...prev,
        modeloContratoId: undefined,
      }));
    }
  }, [formData.modeloContratoId, modeloContratoKeySet]);

  const handleVincularProcuracao = async () => {
    if (!selectedProcuracao) {
      toast.error("Selecione uma procuração");

      return;
    }

    setIsLinking(true);
    try {
      const result = await vincularContratoProcuracao(
        contratoId,
        selectedProcuracao,
      );

      if (result.success) {
        toast.success(
          result.message || "Contrato vinculado à procuração com sucesso!",
        );
        mutate(); // Atualizar dados do contrato
        onOpenChange();
        setSelectedProcuracao("");
      } else {
        toast.error(result.error || "Erro ao vincular procuração");
      }
    } catch (error) {
      toast.error("Erro ao processar vinculação");
    } finally {
      setIsLinking(false);
    }
  };

  const handleArquivoContratoChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0] ?? null;

    if (!file) {
      setSelectedContratoArquivo(null);

      return;
    }

    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      toast.error("Apenas arquivos PDF são permitidos.");
      if (contratoArquivoInputRef.current) {
        contratoArquivoInputRef.current.value = "";
      }
      setSelectedContratoArquivo(null);

      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 10MB.");
      if (contratoArquivoInputRef.current) {
        contratoArquivoInputRef.current.value = "";
      }
      setSelectedContratoArquivo(null);

      return;
    }

    setSelectedContratoArquivo(file);
    setRemoverArquivoAtual(false);
  };

  const clearArquivoContrato = () => {
    setSelectedContratoArquivo(null);
    if (contratoArquivoInputRef.current) {
      contratoArquivoInputRef.current.value = "";
    }
  };

  const handleSubmit = async () => {
    if (!formData.titulo.trim()) {
      toast.error("Título do contrato é obrigatório");

      return;
    }

    if (!formData.clienteId) {
      toast.error("Selecione um cliente");

      return;
    }

    setIsSaving(true);

    try {
      const payload = new FormData();
      payload.set("contratoId", contratoId);
      payload.set("titulo", formData.titulo.trim());
      payload.set("resumo", formData.resumo?.trim() || "");
      payload.set("status", (formData.status || ContratoStatus.RASCUNHO) as string);
      payload.set("clienteId", formData.clienteId);
      payload.set("tipoContratoId", formData.tipoContratoId || "");
      payload.set("modeloContratoId", formData.modeloContratoId || "");
      payload.set("dadosBancariosId", formData.dadosBancariosId || "");
      payload.set("advogadoId", formData.advogadoId || "");
      payload.set("processoId", formData.processoId || "");
      payload.set("observacoes", formData.observacoes?.trim() || "");
      payload.set("removerArquivoContrato", removerArquivoAtual ? "true" : "false");
      if (formData.valor !== undefined) {
        payload.set("valor", String(formData.valor));
      } else {
        payload.set("valor", "");
      }
      if (formData.dataInicio) {
        payload.set(
          "dataInicio",
          formData.dataInicio instanceof Date
            ? formData.dataInicio.toISOString()
            : String(formData.dataInicio),
        );
      } else {
        payload.set("dataInicio", "");
      }
      if (formData.dataFim) {
        payload.set(
          "dataFim",
          formData.dataFim instanceof Date
            ? formData.dataFim.toISOString()
            : String(formData.dataFim),
        );
      } else {
        payload.set("dataFim", "");
      }
      if (selectedContratoArquivo) {
        payload.set("arquivoContrato", selectedContratoArquivo);
      }

      const result = await updateContratoComArquivo(payload);

      if (result.success) {
        toast.success("Contrato atualizado com sucesso!");
        router.push(`/contratos/${contratoId}`);
      } else {
        toast.error(result.error || "Erro ao atualizar contrato");
      }
    } catch (error) {
      toast.error("Erro ao atualizar contrato");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || isLoadingClientes) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Spinner label="Carregando dados..." size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertCircle className="h-12 w-12 text-danger" />
        <p className="text-lg font-semibold text-danger">{error}</p>
        <Button color="primary" onPress={() => router.push("/contratos")}>
          Voltar para Contratos
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={title()}>Editar Contrato</h1>
          <p className="text-sm text-default-500 mt-1">
            Atualizar informações do contrato
          </p>
        </div>
        <Button
          as={Link}
          href={`/contratos/${contratoId}`}
          startContent={<ArrowLeft className="h-4 w-4" />}
          variant="light"
        >
          Voltar
        </Button>
      </div>

      {/* Formulário */}
      <Card>
        <CardHeader className="flex gap-3">
          <FileText className="h-5 w-5 text-primary" />
          <div className="flex flex-col">
            <p className="text-md font-semibold">Informações do Contrato</p>
            <p className="text-small text-default-500">
              Preencha as informações básicas do contrato
            </p>
          </div>
        </CardHeader>
        <Divider />
        <CardBody className="gap-4">
          {/* Dados Básicos */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-default-600">
              📋 Dados Básicos
            </h3>

            {/* Cliente */}
            <SearchableSelect
              isRequired
              emptyContent="Nenhum cliente encontrado"
              items={clienteOptions}
              label="Cliente"
              placeholder="Selecione o cliente"
              selectedKey={selectedClienteKeys[0] ?? null}
              startContent={<User className="h-4 w-4 text-default-400" />}
              onSelectionChange={(selected) => {
                setFormData((prev) => ({ ...prev, clienteId: selected || "" }));
              }}
            />

            {/* Título */}
            <Input
              isRequired
              label="Título do Contrato"
              placeholder="Ex: Contrato de Prestação de Serviços"
              startContent={<FileText className="h-4 w-4 text-default-400" />}
              value={formData.titulo}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, titulo: value }))
              }
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <SearchableSelect
                description="Classificação para relatórios e filtros do módulo."
                emptyContent="Nenhum tipo encontrado"
                items={tipoContratoOptions}
                isLoading={isLoadingTiposContrato}
                label="Tipo de contrato"
                placeholder="Selecione o tipo"
                selectedKey={selectedTipoContratoKeys[0] ?? null}
                onSelectionChange={(selected) => {
                  setFormData((prev) => ({
                    ...prev,
                    tipoContratoId: selected || undefined,
                    modeloContratoId:
                      selected && selected === prev.tipoContratoId
                        ? prev.modeloContratoId
                        : undefined,
                  }));
                }}
              />

              <SearchableSelect
                description="Modelo base opcional para padrão de conteúdo."
                emptyContent="Nenhum modelo encontrado"
                items={modeloContratoOptions}
                isDisabled={!formData.tipoContratoId || isLoadingModelosContrato}
                isLoading={isLoadingModelosContrato}
                label="Modelo de contrato"
                placeholder={
                  formData.tipoContratoId
                    ? "Selecione o modelo"
                    : "Escolha o tipo primeiro"
                }
                selectedKey={selectedModeloContratoKeys[0] ?? null}
                onSelectionChange={(selected) => {
                  setFormData((prev) => ({
                    ...prev,
                    modeloContratoId: selected || undefined,
                  }));
                }}
              />
            </div>

            {/* Status e Valor */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                isRequired
                label="Status"
                placeholder="Selecione o status"
                selectedKeys={formData.status ? [formData.status] : []}
                onSelectionChange={(keys) => {
                  const selected = Array.from(keys)[0] as ContratoStatus;

                  setFormData((prev) => ({ ...prev, status: selected }));
                }}
              >
                <SelectItem key={ContratoStatus.RASCUNHO} textValue="Rascunho">Rascunho</SelectItem>
                <SelectItem key={ContratoStatus.ATIVO} textValue="Ativo">Ativo</SelectItem>
                <SelectItem key={ContratoStatus.SUSPENSO} textValue="Suspenso">Suspenso</SelectItem>
                <SelectItem key={ContratoStatus.CANCELADO} textValue="Cancelado">
                  Cancelado
                </SelectItem>
                <SelectItem key={ContratoStatus.ENCERRADO} textValue="Encerrado">
                  Encerrado
                </SelectItem>
              </Select>

              <Input
                label="Valor (R$)"
                placeholder="0,00"
                startContent={
                  <DollarSign className="h-4 w-4 text-default-400" />
                }
                type="number"
                value={formData.valor ? String(formData.valor) : ""}
                onValueChange={(value) => {
                  const numericValue = value ? parseFloat(value) : undefined;

                  setFormData((prev) => ({ ...prev, valor: numericValue }));
                }}
              />
            </div>

            {/* Conta Bancária */}
            <Select
              description="Conta onde os pagamentos deste contrato serão recebidos"
              isLoading={isLoadingDadosBancarios}
              label="Conta Bancária para Recebimento"
              placeholder="Selecione uma conta (opcional)"
              selectedKeys={selectedDadosBancariosKeys}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as string | undefined;
                setFormData((prev) => ({
                  ...prev,
                  dadosBancariosId: selected || undefined,
                }));
              }}
            >
              {dadosBancarios.map((conta: any) => {
                const bancoNome = formatBancoLabel(conta);

                return (
                  <SelectItem
                    key={conta.id}
                    textValue={`${bancoNome} - ${conta.titularNome}`}
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{bancoNome}</span>
                        {conta.principal && (
                          <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded">
                            Principal
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-default-500">
                        Ag: {conta.agencia} - CC: {conta.conta}
                        {conta.digitoConta && `-${conta.digitoConta}`}
                      </span>
                      <span className="text-xs text-default-400">
                        {conta.titularNome}
                      </span>
                      {conta.chavePix && (
                        <span className="text-xs text-default-400">
                          PIX: {conta.chavePix}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                );
              })}
            </Select>

            {/* Datas */}
            <DateRangeInput
              label="Período do contrato"
              startContent={<Calendar className="h-4 w-4 text-default-400" />}
              startValue={
                formData.dataInicio
                  ? formData.dataInicio instanceof Date
                    ? formData.dataInicio.toISOString().split("T")[0]
                    : formData.dataInicio.toString().split("T")[0]
                  : ""
              }
              endValue={
                formData.dataFim
                  ? formData.dataFim instanceof Date
                    ? formData.dataFim.toISOString().split("T")[0]
                    : formData.dataFim.toString().split("T")[0]
                  : ""
              }
              onRangeChange={({ start, end }) =>
                setFormData((prev) => ({
                  ...prev,
                  dataInicio: start || undefined,
                  dataFim: end || undefined,
                }))
              }
             />

            <div className="space-y-3 rounded-lg border border-default-200 p-4">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-default-700">Contrato em PDF</p>
                <p className="text-xs text-default-500">
                  Substitua o PDF atual ou remova o arquivo para manter apenas o cadastro.
                </p>
              </div>

              <input
                ref={contratoArquivoInputRef}
                accept=".pdf"
                className="hidden"
                type="file"
                onChange={handleArquivoContratoChange}
              />

              {selectedContratoArquivo ? (
                <div className="rounded-lg border border-success/30 bg-success/5 p-3">
                  <p className="text-sm font-semibold text-success">
                    {selectedContratoArquivo.name}
                  </p>
                  <p className="text-xs text-default-500">
                    {(selectedContratoArquivo.size / 1024).toFixed(2)} KB
                  </p>
                  <Button
                    className="mt-2"
                    color="danger"
                    size="sm"
                    startContent={<Trash2 className="h-3.5 w-3.5" />}
                    variant="flat"
                    onPress={clearArquivoContrato}
                  >
                    Remover arquivo selecionado
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    startContent={<Upload className="h-4 w-4" />}
                    variant="flat"
                    onPress={() => contratoArquivoInputRef.current?.click()}
                  >
                    Selecionar novo PDF
                  </Button>
                  {contrato?.arquivoUrl ? (
                    <>
                      <Button
                        as="a"
                        href={contrato.arquivoUrl}
                        rel="noopener noreferrer"
                        size="sm"
                        target="_blank"
                        variant="light"
                      >
                        Ver PDF atual
                      </Button>
                      <Button
                        color={removerArquivoAtual ? "danger" : "default"}
                        size="sm"
                        variant={removerArquivoAtual ? "solid" : "flat"}
                        onPress={() => setRemoverArquivoAtual((prev) => !prev)}
                      >
                        {removerArquivoAtual ? "Arquivo será removido" : "Remover PDF atual"}
                      </Button>
                    </>
                  ) : (
                    <span className="text-xs text-default-500">
                      Sem PDF anexado.
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Resumo */}
            <Textarea
              label="Resumo"
              minRows={3}
              placeholder="Breve resumo do contrato..."
              value={formData.resumo || ""}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, resumo: value }))
              }
            />

            {/* Observações */}
            <Textarea
              label="Observações"
              minRows={3}
              placeholder="Observações adicionais..."
              value={formData.observacoes || ""}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, observacoes: value }))
              }
            />

            {/* Procuração Vinculada */}
            <div className="p-4 rounded-lg border border-default-200 bg-default-50">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-default-700">
                  Vinculação de Procuração
                </h4>
                {contrato?.processo && (
                  <Button
                    color="primary"
                    size="sm"
                    startContent={<LinkIcon className="h-3 w-3" />}
                    variant="flat"
                    onPress={onOpen}
                  >
                    {contrato.processo.procuracoesVinculadas &&
                    contrato.processo.procuracoesVinculadas.length > 0
                      ? "Vincular Outra Procuração"
                      : "Vincular Procuração"}
                  </Button>
                )}
              </div>

              {contrato?.processo ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 text-sm">
                    <FileText className="h-4 w-4 text-primary mt-0.5" />
                    <div>
                      <p className="text-default-600">
                        Este contrato está vinculado ao processo:
                      </p>
                      <p className="font-semibold text-default-900">
                        {contrato.processo.numero}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-default-200 pt-2">
                    {contrato.processo.procuracoesVinculadas &&
                    contrato.processo.procuracoesVinculadas.length > 0 ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-success">
                          <span className="font-medium">
                            ✓ {contrato.processo.procuracoesVinculadas.length}{" "}
                            procuração(ões) vinculada(s):
                          </span>
                        </div>
                        <div className="ml-4 space-y-1">
                          {contrato.processo.procuracoesVinculadas.map(
                            (pp: any, index: number) => (
                              <div
                                key={pp.procuracao.id}
                                className="flex items-center gap-2 text-xs text-default-600"
                              >
                                <span className="w-2 h-2 rounded-full bg-success" />
                                <span>
                                  {pp.procuracao.numero ||
                                    `Procuração ${index + 1}`}
                                </span>
                                {pp.procuracao.ativa ? (
                                  <span className="px-1 py-0.5 bg-success/20 text-success rounded text-xs">
                                    Ativa
                                  </span>
                                ) : (
                                  <span className="px-1 py-0.5 bg-warning/20 text-warning rounded text-xs">
                                    Inativa
                                  </span>
                                )}
                              </div>
                            ),
                          )}
                        </div>
                        <p className="text-xs text-default-500 mt-2">
                          💡 Você pode vincular mais procurações ao mesmo
                          processo
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-warning">
                          <AlertCircle className="h-4 w-4" />
                          <span className="font-medium">
                            Este processo ainda não possui procurações
                            vinculadas
                          </span>
                        </div>
                        <p className="text-xs text-default-500 ml-6">
                          Clique em &quot;Vincular Procuração&quot; para
                          conectar uma procuração ao processo
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-default-500">
                    <AlertCircle className="h-4 w-4" />
                    <span className="font-medium">
                      Este contrato não está vinculado a nenhum processo
                    </span>
                  </div>
                  <p className="text-xs text-default-400 ml-6">
                    Para vincular uma procuração, primeiro é necessário vincular
                    o contrato a um processo
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Botões de ação */}
          <div className="flex gap-3 justify-end mt-4">
            <Button
              variant="light"
              onPress={() => router.push(`/contratos/${contratoId}`)}
            >
              Cancelar
            </Button>
            <Button
              color="primary"
              isLoading={isSaving}
              startContent={
                !isSaving ? <Save className="h-4 w-4" /> : undefined
              }
              onPress={handleSubmit}
            >
              Salvar Alterações
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Modal Vincular Procuração */}
      <Modal isOpen={isOpen} size="md" onOpenChange={onOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold">Vincular Procuração</h3>
                <p className="text-sm text-default-500">
                  {contrato?.processo ? (
                    <>
                      Verificar vinculação da procuração ao processo{" "}
                      <strong>{contrato.processo.numero}</strong>
                    </>
                  ) : (
                    <>
                      Selecione uma procuração para vincular ao contrato através
                      de um processo
                    </>
                  )}
                </p>
              </ModalHeader>
              <ModalBody>
                {isLoadingProcuracoes ? (
                  <div className="flex justify-center py-8">
                    <Spinner label="Carregando procurações..." size="lg" />
                  </div>
                ) : procuracoes.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-default-500">
                      Nenhuma procuração ativa encontrada para este cliente.
                    </p>
                  </div>
                ) : (
                  <SearchableSelect
                    emptyContent="Nenhuma procuração encontrada"
                    items={procuracaoOptions}
                    label="Selecione uma procuração"
                    placeholder="Escolha uma procuração"
                    selectedKey={selectedProcuracaoKeys[0] ?? null}
                    onSelectionChange={(selectedKey) => {
                      setSelectedProcuracao(selectedKey || "");
                    }}
                  />
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Cancelar
                </Button>
                <Button
                  color="primary"
                  isDisabled={!selectedProcuracao || isLoadingProcuracoes}
                  isLoading={isLinking}
                  onPress={handleVincularProcuracao}
                >
                  Vincular
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
