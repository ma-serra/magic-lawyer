"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Textarea } from "@heroui/input";

import { Divider } from "@heroui/divider";
import {
  ArrowLeft,
  Save,
  FileText,
  User,
  DollarSign,
  Calendar,
  Building2,
  Upload,
  Link as LinkIcon,
} from "lucide-react";
import Link from "next/link";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { Spinner } from "@heroui/spinner";
import { Switch } from "@heroui/switch";
import { UploadProgress } from "@/components/ui/upload-progress";

import { title } from "@/components/primitives";
import {
  createContratoComArquivo,
  vincularContratoProcuracao,
  type ContratoCreateInput,
} from "@/app/actions/contratos";
import { ContratoStatus } from "@/generated/prisma";
import {
  useClientesParaSelect,
  useProcuracoesDisponiveis,
} from "@/app/hooks/use-clientes";
import { useDadosBancariosAtivos } from "@/app/hooks/use-dados-bancarios";
import {
  useModelosContrato,
  useTiposModeloContrato,
} from "@/app/hooks/use-modelos-contrato";
import { Select, SelectItem } from "@heroui/react";
import { DateRangeInput } from "@/components/ui/date-range-input";
import { SearchableSelect } from "@/components/searchable-select";

export default function NovoContratoPage() {
  const formatBancoLabel = (conta: any) => {
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
  };
  const router = useRouter();
  const searchParams = useSearchParams();
  const clienteIdParam = searchParams.get("clienteId");
  const returnProcuracaoId = searchParams.get("returnProcuracaoId");
  const autoVincularProcuracao =
    searchParams.get("autoVincularProcuracao") === "1";

  const [isSaving, setIsSaving] = useState(false);
  const [selectedContratoArquivo, setSelectedContratoArquivo] =
    useState<File | null>(null);
  const contratoArquivoInputRef = useRef<HTMLInputElement>(null);
  const [vincularProcuracao, setVincularProcuracao] = useState(false);
  const [procuracaoSelecionada, setProcuracaoSelecionada] = useState("");
  const [formData, setFormData] = useState<ContratoCreateInput>({
    titulo: "",
    resumo: "",
    status: ContratoStatus.RASCUNHO,
    clienteId: clienteIdParam || "",
    observacoes: "",
  });

  // Buscar clientes para o select (apenas se não veio de um cliente)
  const { clientes, isLoading: isLoadingClientes } = useClientesParaSelect();
  const { procuracoes, isLoading: isLoadingProcuracoes } =
    useProcuracoesDisponiveis(formData.clienteId || null);
  const { dadosBancarios, isLoading: isLoadingDadosBancarios } =
    useDadosBancariosAtivos();
  const { tipos, isLoading: isLoadingTiposContrato } = useTiposModeloContrato();
  const { modelos, isLoading: isLoadingModelosContrato } = useModelosContrato({
    ativo: true,
    tipoId: formData.tipoContratoId || undefined,
  });
  const clienteKeys = useMemo(
    () => new Set((clientes || []).map((cliente: any) => cliente.id)),
    [clientes],
  );
  const dadosBancariosKeys = useMemo(
    () => new Set((dadosBancarios || []).map((conta: any) => conta.id)),
    [dadosBancarios],
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
  const tipoContratoKeySet = useMemo(
    () => new Set((tipos || []).map((tipo) => tipo.id)),
    [tipos],
  );
  const modeloContratoKeySet = useMemo(
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
    procuracaoSelecionada &&
    procuracoes.some((procuracao: any) => procuracao.id === procuracaoSelecionada)
      ? [procuracaoSelecionada]
      : [];
  const clienteOptions = useMemo(
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
  const tipoContratoOptions = useMemo(
    () =>
      (tipos || []).map((tipo) => ({
        key: tipo.id,
        label: tipo.nome,
        textValue: tipo.nome,
      })),
    [tipos],
  );
  const modeloContratoOptions = useMemo(
    () =>
      (modelos || []).map((modelo) => ({
        key: modelo.id,
        label: modelo.nome,
        textValue: [modelo.nome, modelo.categoria || ""].filter(Boolean).join(" "),
        description: modelo.categoria || undefined,
      })),
    [modelos],
  );
  const procuracaoOptions = useMemo(
    () =>
      procuracoes.map((procuracao: any) => ({
        key: procuracao.id,
        label: procuracao.numero || `Procuração ${procuracao.id}`,
        textValue: [
          procuracao.numero || procuracao.id,
          procuracao.titulo || "",
        ]
          .filter(Boolean)
          .join(" "),
        description: procuracao.titulo || undefined,
      })),
    [procuracoes],
  );

  const createProcuracaoLink = useMemo(() => {
    if (!formData.clienteId) {
      return "/procuracoes/novo";
    }

    const returnTo = encodeURIComponent(
      "/contratos/novo?clienteId=" + formData.clienteId,
    );

    return `/procuracoes/novo?clienteId=${formData.clienteId}&returnTo=${returnTo}`;
  }, [formData.clienteId]);

  useEffect(() => {
    if (!formData.clienteId) {
      setProcuracaoSelecionada("");
      setVincularProcuracao(false);

      return;
    }

    if (isLoadingProcuracoes) {
      return;
    }

    if (
      procuracaoSelecionada &&
      !procuracoes.some((p: any) => p.id === procuracaoSelecionada)
    ) {
      setProcuracaoSelecionada("");
    }
  }, [formData.clienteId, procuracoes, procuracaoSelecionada, isLoadingProcuracoes]);

  useEffect(() => {
    if (!formData.clienteId) {
      return;
    }

    if (returnProcuracaoId) {
      setProcuracaoSelecionada(returnProcuracaoId);
    }

    if (autoVincularProcuracao) {
      setVincularProcuracao(true);
    }
  }, [formData.clienteId, returnProcuracaoId, autoVincularProcuracao]);

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

  if (isLoadingClientes && !clienteIdParam) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Spinner label="Carregando dados..." size="lg" />
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!formData.titulo.trim()) {
      toast.error("Título do contrato é obrigatório");

      return;
    }

    if (!formData.clienteId) {
      toast.error("Selecione um cliente");

      return;
    }

    if (vincularProcuracao && !procuracaoSelecionada) {
      toast.error("Selecione uma procuração para vincular ou desative a opção.");

      return;
    }

    setIsSaving(true);

    try {
      const createPayload = new FormData();
      createPayload.set("titulo", formData.titulo.trim());
      createPayload.set("resumo", formData.resumo?.trim() || "");
      createPayload.set("clienteId", formData.clienteId);
      createPayload.set(
        "status",
        (formData.status || ContratoStatus.RASCUNHO) as string,
      );

      if (formData.valor !== undefined) {
        createPayload.set("valor", formData.valor.toString());
      }

      if (formData.dataInicio) {
        createPayload.set(
          "dataInicio",
          typeof formData.dataInicio === "string"
            ? formData.dataInicio
            : new Date(formData.dataInicio).toISOString(),
        );
      }

      if (formData.dataFim) {
        createPayload.set(
          "dataFim",
          typeof formData.dataFim === "string"
            ? formData.dataFim
            : new Date(formData.dataFim).toISOString(),
        );
      }

      if (formData.tipoContratoId) {
        createPayload.set("tipoContratoId", formData.tipoContratoId);
      }

      if (formData.modeloContratoId) {
        createPayload.set("modeloContratoId", formData.modeloContratoId);
      }

      if (formData.advogadoId) {
        createPayload.set("advogadoId", formData.advogadoId);
      }

      if (formData.processoId) {
        createPayload.set("processoId", formData.processoId);
      }

      if (formData.dadosBancariosId) {
        createPayload.set("dadosBancariosId", formData.dadosBancariosId);
      }

      if (formData.observacoes?.trim()) {
        createPayload.set("observacoes", formData.observacoes.trim());
      }

      if (selectedContratoArquivo) {
        createPayload.set("arquivoContrato", selectedContratoArquivo);
      }

      const result = await createContratoComArquivo(createPayload);

      if (result.success) {
        const contratoCriado = "contrato" in result ? result.contrato : null;

        if (
          vincularProcuracao &&
          procuracaoSelecionada &&
          contratoCriado?.id
        ) {
          const vinculacao = await vincularContratoProcuracao(
            contratoCriado.id,
            procuracaoSelecionada,
          );

          if (!vinculacao.success) {
            toast.success("Contrato criado com sucesso.");
            toast.warning(
              vinculacao.error ||
                "Não foi possível vincular a procuração agora, faça isso depois.",
            );
          } else {
            toast.success("Contrato criado e procuração vinculada com sucesso!");
          }
        } else {
          toast.success("Contrato criado com sucesso!");
        }

        // Redirecionar baseado em onde veio
        if (clienteIdParam) {
          router.push(`/clientes/${clienteIdParam}`);
        } else {
          router.push("/contratos");
        }
      } else {
        toast.error(result.error || "Erro ao criar contrato");
      }
    } catch (error) {
      toast.error("Erro ao criar contrato");
    } finally {
      setIsSaving(false);
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
  };

  const clearArquivoContrato = () => {
    setSelectedContratoArquivo(null);
    if (contratoArquivoInputRef.current) {
      contratoArquivoInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={title()}>Novo Contrato</h1>
          <p className="text-sm text-default-500 mt-1">
            Cadastrar novo contrato
          </p>
        </div>
        <Button
          as={Link}
          href={clienteIdParam ? `/clientes/${clienteIdParam}` : "/contratos"}
          startContent={<ArrowLeft className="h-4 w-4" />}
          variant="light"
        >
          Voltar
        </Button>
      </div>

      {/* Aviso se veio de um cliente */}
      {clienteIdParam && (
        <Card className="border border-secondary/20 bg-secondary/5">
          <CardBody className="flex flex-row items-center gap-2">
            <User className="h-5 w-5 text-secondary" />
            <p className="text-sm text-secondary">
              Este contrato será vinculado ao cliente selecionado
            </p>
          </CardBody>
        </Card>
      )}

      {/* Formulário */}
      <Card className="border border-default-200">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-secondary" />
            <h2 className="text-lg font-semibold">Informações do Contrato</h2>
          </div>
        </CardHeader>
        <Divider />
        <CardBody className="gap-6">
          {/* Dados Básicos */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-default-600">
              📋 Dados Básicos
            </h3>

            {/* Select de Cliente (se não veio de um cliente) */}
            {!clienteIdParam && (
              <SearchableSelect
                isRequired
                description="Selecione o cliente vinculado a este contrato"
                emptyContent="Nenhum cliente encontrado"
                items={clienteOptions}
                isLoading={isLoadingClientes}
                label="Cliente *"
                placeholder="Selecione um cliente"
                selectedKey={selectedClienteKeys[0] ?? null}
                startContent={<User className="h-4 w-4 text-default-400" />}
                onSelectionChange={(selectedKey) =>
                  setFormData((prev) => ({
                    ...prev,
                    clienteId: selectedKey || "",
                  }))
                }
              />
            )}

            <Input
              isRequired
              label="Título do Contrato *"
              placeholder="Ex: Contrato de Prestação de Serviços Jurídicos"
              value={formData.titulo}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, titulo: value }))
              }
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <SearchableSelect
                description="Classificação para relatórios e filtros operacionais."
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
                description="Modelo pronto para iniciar o texto-base do contrato."
                emptyContent="Nenhum modelo encontrado"
                items={modeloContratoOptions}
                isDisabled={!formData.tipoContratoId || isLoadingModelosContrato}
                isLoading={isLoadingModelosContrato}
                label="Modelo de contrato"
                placeholder={
                  formData.tipoContratoId
                    ? "Selecione um modelo"
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

            {/* Nota sobre vinculação de procuração */}
            {formData.clienteId && (
              <div className="p-4 rounded-lg border border-default-200 bg-default-50">
                <p className="text-sm text-default-600">
                  💡 <strong>Dica:</strong> Você pode vincular uma procuração
                  existente na criação do contrato.
                </p>

                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-default-700">
                      Vincular procuração existente
                    </p>
                    <p className="text-xs text-default-500 mt-1">
                      A procuração será associada automaticamente durante a criação.
                    </p>
                  </div>
                  <Switch
                    isSelected={vincularProcuracao}
                    onValueChange={setVincularProcuracao}
                  >
                    Quero vincular agora
                  </Switch>
                </div>

                <p className="mt-2 text-xs text-default-500">
                  Não encontrou a procuração? Crie agora e retorne aqui para
                  vincular a nova procuração imediatamente.
                </p>

                <Button
                  as={Link}
                  href={createProcuracaoLink}
                  className="mt-2"
                  size="sm"
                  startContent={<LinkIcon className="h-3.5 w-3.5" />}
                  variant="flat"
                >
                  Criar nova procuração
                </Button>

                {vincularProcuracao && (
                  <div className="mt-3">
                    <SearchableSelect
                      emptyContent="Nenhuma procuração disponível"
                      items={procuracaoOptions}
                      isDisabled={isLoadingProcuracoes || procuracoes.length === 0}
                      isLoading={isLoadingProcuracoes}
                      label="Procuração"
                      placeholder={
                        procuracoes.length === 0
                          ? "Nenhuma procuração disponível"
                          : "Selecione uma procuração"
                      }
                      selectedKey={selectedProcuracaoKeys[0] ?? null}
                      onSelectionChange={(selectedKey) =>
                        setProcuracaoSelecionada(selectedKey || "")
                      }
                    />
                  </div>
                )}

                <p className="text-xs text-default-500 mt-3">
                  Ao salvar a procuração criada aqui, o formulário já voltará com
                  ela pré-selecionada para vínculo.
                </p>
              </div>
            )}

            <Textarea
              label="Resumo"
              minRows={3}
              placeholder="Resumo do objeto do contrato..."
              value={formData.resumo || ""}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, resumo: value }))
              }
            />
          </div>

          <Divider />

          {/* Status e Valores */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-default-600">
              💰 Valores e Status
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Status"
                placeholder="Selecione o status"
                selectedKeys={formData.status ? [formData.status] : []}
                onSelectionChange={(keys) =>
                  setFormData((prev) => ({
                    ...prev,
                    status: Array.from(keys)[0] as ContratoStatus,
                  }))
                }
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
                value={formData.valor?.toString() || ""}
                onValueChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    valor: parseFloat(value) || undefined,
                  }))
                }
              />
            </div>

            <Select
              description="Conta onde os pagamentos deste contrato serão recebidos"
              isLoading={isLoadingDadosBancarios}
              label="Conta Bancária para Recebimento"
              placeholder="Selecione uma conta (opcional)"
              selectedKeys={selectedDadosBancariosKeys}
              onSelectionChange={(keys) =>
                setFormData((prev) => ({
                  ...prev,
                  dadosBancariosId: Array.from(keys)[0] as string,
                }))
              }
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

            <DateRangeInput
              label="Período do contrato"
              startContent={<Calendar className="h-4 w-4 text-default-400" />}
              startValue={
                formData.dataInicio
                  ? typeof formData.dataInicio === "string"
                    ? formData.dataInicio.split("T")[0]
                    : new Date(formData.dataInicio).toISOString().split("T")[0]
                  : ""
              }
              endValue={
                formData.dataFim
                  ? typeof formData.dataFim === "string"
                    ? formData.dataFim.split("T")[0]
                    : new Date(formData.dataFim).toISOString().split("T")[0]
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
          </div>

          <Divider />

          {/* Arquivo principal do contrato */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-default-600">
              📎 Contrato em PDF
            </h3>
            <p className="text-xs text-default-500">
              Anexe o contrato assinado ou minuta em PDF para que já fique
              disponível na visualização do contrato.
            </p>
            <input
              accept=".pdf"
              className="hidden"
              id="arquivo-contrato"
              ref={contratoArquivoInputRef}
              type="file"
              onChange={handleArquivoContratoChange}
            />
            <div className="rounded-lg border-2 border-dashed border-default-300 p-6 text-center">
              {selectedContratoArquivo ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-success">
                    {selectedContratoArquivo.name}
                  </p>
                  <p className="text-xs text-default-500">
                    {(selectedContratoArquivo.size / 1024).toFixed(2)} KB
                  </p>
                  <Button
                    color="danger"
                    size="sm"
                    variant="flat"
                    onPress={clearArquivoContrato}
                  >
                    Remover arquivo
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Upload className="mx-auto h-8 w-8 text-default-400" />
                  <p className="text-sm text-default-600">
                    Clique para selecionar o contrato em PDF
                  </p>
                  <p className="text-xs text-default-400">
                    Máximo 10MB, apenas .pdf
                  </p>
                  <Button
                    size="sm"
                    onPress={() => contratoArquivoInputRef.current?.click()}
                  >
                    Escolher arquivo
                  </Button>
                </div>
              )}
            </div>
            {isSaving && selectedContratoArquivo ? (
              <UploadProgress
                label="Enviando contrato"
                description="O PDF será salvo junto com o cadastro do contrato."
              />
            ) : null}
          </div>

          <Divider />

          {/* Observações */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-default-600">
              📝 Observações
            </h3>

            <Textarea
              label="Observações"
              minRows={3}
              placeholder="Informações adicionais..."
              value={formData.observacoes || ""}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, observacoes: value }))
              }
            />
          </div>

          {/* Informação */}
          <div className="rounded-lg bg-secondary/5 border border-secondary/20 p-4">
            <p className="text-xs text-secondary-600">
              💡 O contrato pode ser criado sem anexo inicial. Você também pode
              anexar mais documentos na tela de edição do contrato.
            </p>
          </div>

          {/* Botões de Ação */}
          <div className="flex gap-3 justify-end">
            <Button
              variant="light"
              onPress={() =>
                router.push(
                  clienteIdParam ? `/clientes/${clienteIdParam}` : "/contratos",
                )
              }
            >
              Cancelar
            </Button>
            <Button
              color="secondary"
              isLoading={isSaving}
              startContent={
                !isSaving ? <Save className="h-4 w-4" /> : undefined
              }
              onPress={handleSubmit}
            >
              Criar Contrato
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
