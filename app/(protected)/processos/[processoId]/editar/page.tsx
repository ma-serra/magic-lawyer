"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Textarea } from "@heroui/input";

import { Checkbox } from "@heroui/checkbox";
import { Divider } from "@heroui/divider";
import { Spinner } from "@heroui/spinner";
import { Chip } from "@heroui/chip";
import {
  ArrowLeft,
  Save,
  Scale,
  Gavel,
  User,
  Building2,
  MapPin,
  Calendar,
  DollarSign,
  Flag,
  Layers,
  Landmark,
  Link2,
  Clock,
  Users,
} from "lucide-react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import useSWR from "swr";

import { title } from "@/components/primitives";
import { useClientesParaSelect } from "@/app/hooks/use-clientes";
import { useAdvogadosParaSelect } from "@/app/hooks/use-advogados-select";
import { useJuizes } from "@/app/hooks/use-juizes";
import { useProcessoDetalhado } from "@/app/hooks/use-processos";
import { listAreasProcesso } from "@/app/actions/areas-processo";
import { listTribunaisParaVinculo } from "@/app/actions/tribunais";
import {
  updateProcesso,
  type ProcessoCreateInput,
  type ProcessoUpdateInput,
} from "@/app/actions/processos";
import {
  ProcessoArquivamentoTipo,
  ProcessoStatus,
  ProcessoFase,
  ProcessoGrau,
} from "@/generated/prisma";
import { Select, SelectItem } from "@heroui/react";
import { DateInput } from "@/components/ui/date-input";
import { SearchableSelect } from "@/components/searchable-select";

export default function EditarProcessoPage() {
  const params = useParams();
  const router = useRouter();
  const processoId = params.processoId as string;

  const { processo, isLoading, isError, mutate } =
    useProcessoDetalhado(processoId);
  const { clientes, isLoading: isLoadingClientes } = useClientesParaSelect();
  const { advogados, isLoading: isLoadingAdvogados } = useAdvogadosParaSelect();
  const { juizes: juizesDisponiveis, isLoading: isLoadingJuizes } = useJuizes();
  const { data: areasData, isLoading: isLoadingAreas } = useSWR(
    "areas-processo-select",
    () => listAreasProcesso({ ativo: true }),
  );
  const { data: tribunaisData, isLoading: isLoadingTribunais } = useSWR(
    "tribunais-vinculo-processos-editar",
    () => listTribunaisParaVinculo(),
  );
  const areas = useMemo(() => {
    if (!areasData?.success) {
      return [];
    }

    return areasData.areas ?? [];
  }, [areasData]);
  const tribunais = useMemo(() => {
    if (!tribunaisData?.success) {
      return [];
    }

    return tribunaisData.tribunais ?? [];
  }, [tribunaisData]);
  const clienteKeys = useMemo(
    () => new Set((clientes || []).map((cliente) => cliente.id)),
    [clientes],
  );
  const areaKeys = useMemo(
    () => new Set((areas || []).map((area) => area.id)),
    [areas],
  );
  const advogadoKeys = useMemo(
    () => new Set((advogados || []).map((advogado) => advogado.id)),
    [advogados],
  );
  const juizKeys = useMemo(
    () => new Set((juizesDisponiveis || []).map((juiz) => juiz.id)),
    [juizesDisponiveis],
  );
  const tribunalKeys = useMemo(
    () => new Set((tribunais || []).map((tribunal) => tribunal.id)),
    [tribunais],
  );

  const [formData, setFormData] = useState<ProcessoCreateInput | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [, startTransition] = useTransition();

  const fases = useMemo(() => Object.values(ProcessoFase), []);
  const graus = useMemo(() => Object.values(ProcessoGrau), []);
  const selectedClienteKeys = useMemo(
    () =>
      formData
        ? (
            formData.clienteIds?.length
              ? formData.clienteIds
              : formData.clienteId
                ? [formData.clienteId]
                : []
          ).filter((clienteId) => clienteKeys.has(clienteId))
        : [],
    [clienteKeys, formData],
  );
  const selectedAdvogadoKeys = useMemo(
    () =>
      formData
        ? (
            formData.advogadoResponsavelIds?.length
              ? formData.advogadoResponsavelIds
              : formData.advogadoResponsavelId
                ? [formData.advogadoResponsavelId]
                : []
          ).filter((advogadoId) => advogadoKeys.has(advogadoId))
        : [],
    [advogadoKeys, formData],
  );
  const selectedAreaKeys =
    formData?.areaId && areaKeys.has(formData.areaId) ? [formData.areaId] : [];
  const selectedArquivamentoKeys =
    formData?.arquivamentoTipo && formData.status === ProcessoStatus.ARQUIVADO
      ? [formData.arquivamentoTipo]
      : [];
  const selectedJuizKeys =
    formData?.juizId && juizKeys.has(formData.juizId) ? [formData.juizId] : [];
  const selectedTribunalKeys =
    formData?.tribunalId && tribunalKeys.has(formData.tribunalId)
      ? [formData.tribunalId]
      : [];
  const clienteOptions = useMemo(
    () =>
      (clientes || []).map((cliente) => ({
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
  const advogadoOptions = useMemo(
    () =>
      (advogados || []).map((advogado) => ({
        key: advogado.id,
        label: advogado.label,
        textValue: [advogado.label, advogado.oab || ""]
          .filter(Boolean)
          .join(" "),
      })),
    [advogados],
  );
  const juizOptions = useMemo(
    () =>
      (juizesDisponiveis || []).map((juiz) => ({
        key: juiz.id,
        label: juiz.nome,
        textValue: [
          juiz.nome,
          juiz.vara || "",
          juiz.comarca || "",
          juiz.tipoAutoridade || "",
        ]
          .filter(Boolean)
          .join(" "),
        description:
          [juiz.vara, juiz.comarca].filter(Boolean).join(" • ") ||
          "Sem vara/comarca informada",
      })),
    [juizesDisponiveis],
  );
  const tribunalOptions = useMemo(
    () =>
      (tribunais || []).map((tribunal) => ({
        key: tribunal.id,
        label: tribunal.sigla
          ? `${tribunal.sigla} - ${tribunal.nome}`
          : tribunal.nome,
        textValue: [
          tribunal.sigla || "",
          tribunal.nome,
          tribunal.esfera || "",
          tribunal.uf || "",
        ]
          .filter(Boolean)
          .join(" "),
        description:
          [tribunal.esfera, tribunal.uf].filter(Boolean).join(" • ") ||
          "Sem esfera/UF",
      })),
    [tribunais],
  );

  useEffect(() => {
    if (!processo || formData) return;

    const mapped: ProcessoCreateInput = {
      numero: processo.numero,
      numeroCnj: processo.numeroCnj || "",
      titulo: processo.titulo || "",
      descricao: processo.descricao || "",
      status: processo.status,
      arquivamentoTipo: processo.arquivamentoTipo ?? null,
      classeProcessual: processo.classeProcessual || "",
      orgaoJulgador: processo.orgaoJulgador || "",
      vara: processo.vara || "",
      comarca: processo.comarca || "",
      foro: processo.foro || "",
      rito: processo.rito || "",
      numeroInterno: processo.numeroInterno || "",
      pastaCompartilhadaUrl: processo.pastaCompartilhadaUrl || "",
      clienteId: processo.cliente.id,
      clienteIds:
        processo.clientesVinculados?.map((cliente) => cliente.id) ??
        [processo.cliente.id],
      segredoJustica: processo.segredoJustica,
      advogadoResponsavelId: processo.advogadoResponsavel?.id || "",
      advogadoResponsavelIds:
        processo.advogadosResponsaveis?.map((advogado) => advogado.id) ??
        (processo.advogadoResponsavel?.id
          ? [processo.advogadoResponsavel.id]
          : []),
      juizId: processo.juiz?.id || "",
      tribunalId: processo.tribunal?.id || "",
    };

    if (processo.valorCausa !== null && processo.valorCausa !== undefined) {
      mapped.valorCausa = Number(processo.valorCausa);
    }
    if (processo.fase) mapped.fase = processo.fase;
    if (processo.grau) mapped.grau = processo.grau;
    if (processo.area?.id) mapped.areaId = processo.area.id;
    if (processo.dataDistribuicao)
      mapped.dataDistribuicao = new Date(processo.dataDistribuicao);
    if (processo.prazoPrincipal)
      mapped.prazoPrincipal = new Date(processo.prazoPrincipal);
    setFormData(mapped);
  }, [processo, formData]);

  const getFaseLabel = (fase: ProcessoFase) => {
    switch (fase) {
      case ProcessoFase.PETICAO_INICIAL:
        return "Petição Inicial";
      case ProcessoFase.CITACAO:
        return "Citação";
      case ProcessoFase.INSTRUCAO:
        return "Instrução";
      case ProcessoFase.SENTENCA:
        return "Sentença";
      case ProcessoFase.RECURSO:
        return "Recurso";
      case ProcessoFase.EXECUCAO:
        return "Execução";
      default:
        return fase;
    }
  };

  const getGrauLabel = (grau: ProcessoGrau) => {
    switch (grau) {
      case ProcessoGrau.PRIMEIRO:
        return "1º Grau";
      case ProcessoGrau.SEGUNDO:
        return "2º Grau";
      case ProcessoGrau.SUPERIOR:
        return "Tribunal Superior";
      default:
        return grau;
    }
  };

  const handleSubmit = async () => {
    if (!formData) return;

    if (!formData.numero.trim()) {
      toast.error("Número do processo é obrigatório");

      return;
    }

    if (selectedClienteKeys.length === 0) {
      toast.error("Selecione pelo menos um cliente");

      return;
    }

    if (!formData.juizId) {
      toast.error("Selecione o juiz do caso");

      return;
    }

    if (!formData.tribunalId) {
      toast.error("Selecione o tribunal do caso");

      return;
    }

    setIsSaving(true);

    try {
      const payload: ProcessoUpdateInput = {
        numero: formData.numero.trim(),
        clienteId: selectedClienteKeys[0],
        clienteIds: selectedClienteKeys,
        status: formData.status,
        segredoJustica: formData.segredoJustica,
      };

      if (formData.numeroCnj?.trim())
        payload.numeroCnj = formData.numeroCnj.trim();
      else payload.numeroCnj = undefined;
      payload.titulo = formData.titulo?.trim()
        ? formData.titulo.trim()
        : undefined;
      payload.descricao = formData.descricao?.trim()
        ? formData.descricao.trim()
        : undefined;
      payload.classeProcessual = formData.classeProcessual?.trim()
        ? formData.classeProcessual.trim()
        : undefined;
      payload.rito = formData.rito?.trim() ? formData.rito.trim() : undefined;
      payload.vara = formData.vara?.trim() ? formData.vara.trim() : undefined;
      payload.comarca = formData.comarca?.trim()
        ? formData.comarca.trim()
        : undefined;
      payload.foro = formData.foro?.trim() ? formData.foro.trim() : undefined;
      payload.orgaoJulgador = formData.orgaoJulgador?.trim()
        ? formData.orgaoJulgador.trim()
        : undefined;
      payload.numeroInterno = formData.numeroInterno?.trim()
        ? formData.numeroInterno.trim()
        : undefined;
      payload.pastaCompartilhadaUrl = formData.pastaCompartilhadaUrl?.trim()
        ? formData.pastaCompartilhadaUrl.trim()
        : undefined;
      payload.dataDistribuicao = formData.dataDistribuicao ?? undefined;
      payload.prazoPrincipal = formData.prazoPrincipal ?? undefined;
      payload.areaId = formData.areaId;
      if (selectedAdvogadoKeys.length > 0) {
        payload.advogadoResponsavelId = selectedAdvogadoKeys[0];
        payload.advogadoResponsavelIds = selectedAdvogadoKeys;
      } else {
        payload.advogadoResponsavelId = undefined;
        payload.advogadoResponsavelIds = [];
      }
      payload.juizId = formData.juizId;
      payload.tribunalId = formData.tribunalId;
      payload.fase = formData.fase;
      payload.grau = formData.grau;
      payload.arquivamentoTipo =
        formData.status === ProcessoStatus.ARQUIVADO
          ? formData.arquivamentoTipo ?? null
          : null;
      if (
        formData.valorCausa !== undefined &&
        !Number.isNaN(formData.valorCausa)
      ) {
        payload.valorCausa = formData.valorCausa;
      } else {
        payload.valorCausa = undefined;
      }

      const result = await updateProcesso(processoId, payload);

      if (result.success) {
        toast.success("Processo atualizado com sucesso!");
        startTransition(() => {
          mutate();
        });
        router.push(`/processos/${processoId}`);
      } else {
        toast.error(result.error || "Erro ao atualizar processo");
      }
    } catch (error) {
      toast.error("Erro ao atualizar processo");
    } finally {
      setIsSaving(false);
    }
  };

  if (
    isLoading ||
    !formData ||
    (isLoadingClientes && !clientes.length) ||
    (isLoadingAdvogados && !advogados?.length)
  ) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Spinner label="Carregando dados do processo..." size="lg" />
      </div>
    );
  }

  if (isError || !processo) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
        <p className="text-lg font-semibold text-danger">
          Não foi possível carregar o processo
        </p>
        <Button
          color="primary"
          onPress={() => router.push(`/processos/${processoId}`)}
        >
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={title()}>Editar Processo</h1>
          <p className="text-sm text-default-500 mt-1">
            Atualize as informações do processo jurídico
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            as={Link}
            href={`/processos/${processoId}`}
            startContent={<ArrowLeft className="h-4 w-4" />}
            variant="light"
          >
            Cancelar
          </Button>
          <Button
            color="primary"
            isLoading={isSaving}
            startContent={!isSaving ? <Save className="h-4 w-4" /> : undefined}
            onPress={handleSubmit}
          >
            Salvar alterações
          </Button>
        </div>
      </div>

      <Card className="border border-default-200">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Informações do Processo</h2>
          </div>
        </CardHeader>
        <Divider />
        <CardBody className="gap-6">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-default-600">
              📋 Dados Básicos
            </h3>

            <Select
              description="Vincule um ou mais advogados responsáveis a este processo."
              items={advogadoOptions}
              isLoading={isLoadingAdvogados}
              label="Advogados responsáveis"
              placeholder="Selecione um ou mais advogados"
              selectedKeys={new Set(selectedAdvogadoKeys)}
              selectionMode="multiple"
              startContent={<Scale className="h-4 w-4 text-default-400" />}
              onSelectionChange={(keys) => {
                const nextKeys = Array.from(keys).map(String);

                setFormData((prev) =>
                  prev
                    ? {
                        ...prev,
                        advogadoResponsavelId: nextKeys[0] || "",
                        advogadoResponsavelIds: nextKeys,
                      }
                    : prev,
                );
              }}
            >
              {advogadoOptions.map((item) => (
                <SelectItem key={item.key} textValue={item.textValue ?? item.label}>
                  {item.label}
                </SelectItem>
              ))}
            </Select>
            {selectedAdvogadoKeys.length > 0 ? (
              <div className="flex flex-wrap gap-2 lg:col-span-3">
                {selectedAdvogadoKeys.map((advogadoId) => {
                  const advogado = (advogados || []).find(
                    (item) => item.id === advogadoId,
                  );

                  if (!advogado) {
                    return null;
                  }

                  return (
                    <Chip
                      key={advogadoId}
                      color="secondary"
                      size="sm"
                      variant="flat"
                    >
                      {advogado.label}
                    </Chip>
                  );
                })}
              </div>
            ) : null}

            <Select
              isRequired
              description="Selecione um ou mais clientes vinculados a este processo."
              items={clienteOptions}
              isLoading={isLoadingClientes}
              label="Clientes vinculados *"
              placeholder="Selecione um ou mais clientes"
              selectedKeys={new Set(selectedClienteKeys)}
              selectionMode="multiple"
              startContent={<Users className="h-4 w-4 text-default-400" />}
              onSelectionChange={(keys) => {
                const nextKeys = Array.from(keys).map(String);

                setFormData((prev) =>
                  prev
                    ? {
                        ...prev,
                        clienteId: nextKeys[0] || "",
                        clienteIds: nextKeys,
                      }
                    : prev,
                );
              }}
            >
              {clienteOptions.map((item) => (
                <SelectItem key={item.key} textValue={item.textValue ?? item.label}>
                  {item.label}
                </SelectItem>
              ))}
            </Select>
            {selectedClienteKeys.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {selectedClienteKeys.map((clienteId) => {
                  const cliente = clientes.find((item) => item.id === clienteId);

                  if (!cliente) {
                    return null;
                  }

                  return (
                    <Chip
                      key={clienteId}
                      color="primary"
                      size="sm"
                      variant="flat"
                    >
                      {cliente.nome}
                    </Chip>
                  );
                })}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                isRequired
                description="Identificador principal do processo para busca e controle interno."
                label="Número do Processo *"
                placeholder="0000000-00.0000.0.00.0000"
                value={formData.numero}
                onValueChange={(value) =>
                  setFormData((prev) =>
                    prev ? { ...prev, numero: value } : prev,
                  )
                }
              />

              <Input
                description="Informe se houver diferença do número principal"
                label="Número CNJ (oficial)"
                placeholder="0000000-00.0000.0.00.0000"
                value={formData.numeroCnj || ""}
                onValueChange={(value) =>
                  setFormData((prev) =>
                    prev ? { ...prev, numeroCnj: value } : prev,
                  )
                }
              />

              <Input
                description="Código interno para organização do escritório (opcional)."
                label="Número Interno"
                placeholder="Ex: 2024/001"
                value={formData.numeroInterno || ""}
                onValueChange={(value) =>
                  setFormData((prev) =>
                    prev ? { ...prev, numeroInterno: value } : prev,
                  )
                }
              />
            </div>

            <Input
              description="Nome curto para identificar rapidamente o caso nas listagens."
              label="Título"
              placeholder="Ex: Ação de Despejo, Divórcio, etc."
              value={formData.titulo || ""}
              onValueChange={(value) =>
                setFormData((prev) =>
                  prev ? { ...prev, titulo: value } : prev,
                )
              }
            />

            <Textarea
              description="Resumo do contexto, estratégia ou observações importantes do caso."
              label="Descrição"
              minRows={3}
              placeholder="Resumo do caso..."
              value={formData.descricao || ""}
              onValueChange={(value) =>
                setFormData((prev) =>
                  prev ? { ...prev, descricao: value } : prev,
                )
              }
            />
          </div>

          <Divider />

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-default-600">
              ⚖️ Classificação e Status
            </h3>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SearchableSelect
              description="Juiz responsável para rastrear padrão de decisões e produtividade."
              emptyContent="Nenhuma autoridade encontrada"
              isLoading={isLoadingJuizes}
              isRequired
              items={juizOptions}
              label="Juiz do Caso *"
              placeholder="Selecione o juiz responsável pelo caso"
              selectedKey={selectedJuizKeys[0] ?? null}
              startContent={<Gavel className="h-4 w-4 text-default-400" />}
              onSelectionChange={(selectedKey) =>
                setFormData((prev) =>
                  prev ? { ...prev, juizId: selectedKey || "" } : prev,
                )
              }
            />

            <div className="-mt-1 flex justify-end">
              <Button
                as={Link}
                color="secondary"
                href="/juizes"
                size="sm"
                variant="light"
              >
                Nao encontrou a autoridade? Cadastre em Juizes
              </Button>
            </div>

            <SearchableSelect
              description="Tribunal onde o processo tramita."
              emptyContent="Nenhum tribunal encontrado"
              isLoading={isLoadingTribunais}
              isRequired
              items={tribunalOptions}
              label="Tribunal *"
              placeholder="Selecione o tribunal"
              selectedKey={selectedTribunalKeys[0] ?? null}
              startContent={<Landmark className="h-4 w-4 text-default-400" />}
              onSelectionChange={(selectedKey) =>
                setFormData((prev) =>
                  prev ? { ...prev, tribunalId: selectedKey || "" } : prev,
                )
              }
            />

            <Select
              description="Situação atual do processo no escritório."
              label="Status"
                placeholder="Selecione o status"
                selectedKeys={formData.status ? [formData.status] : []}
                onSelectionChange={(keys) =>
                  setFormData((prev) =>
                    prev
                      ? {
                          ...prev,
                          status: Array.from(keys)[0] as ProcessoStatus,
                          arquivamentoTipo:
                            Array.from(keys)[0] === ProcessoStatus.ARQUIVADO
                              ? prev.arquivamentoTipo ?? null
                              : null,
                        }
                      : prev,
                  )
                }
              >
                <SelectItem key={ProcessoStatus.RASCUNHO} textValue="Rascunho">Rascunho</SelectItem>
                <SelectItem key={ProcessoStatus.EM_ANDAMENTO} textValue="Em Andamento">
                  Em Andamento
                </SelectItem>
                <SelectItem key={ProcessoStatus.SUSPENSO} textValue="Suspenso">Suspenso</SelectItem>
                <SelectItem key={ProcessoStatus.ENCERRADO} textValue="Encerrado">
                  Encerrado
                </SelectItem>
                <SelectItem key={ProcessoStatus.ARQUIVADO} textValue="Arquivado">
                  Arquivado
                </SelectItem>
              </Select>

              {formData.status === ProcessoStatus.ARQUIVADO ? (
                <Select
                  description="Classifique se o arquivamento ainda pode ser reaberto ou se ja encerrou definitivamente."
                  label="Tipo de arquivamento"
                  placeholder="Selecione o tipo"
                  selectedKeys={selectedArquivamentoKeys}
                  onSelectionChange={(keys) =>
                    setFormData((prev) =>
                      prev
                        ? {
                            ...prev,
                            arquivamentoTipo:
                              (Array.from(keys)[0] as ProcessoArquivamentoTipo) ??
                              null,
                          }
                        : prev,
                    )
                  }
                >
                  <SelectItem
                    key={ProcessoArquivamentoTipo.PROVISORIO}
                    textValue="Arquivado provisoriamente"
                  >
                    Arquivado provisoriamente
                  </SelectItem>
                  <SelectItem
                    key={ProcessoArquivamentoTipo.DEFINITIVO}
                    textValue="Arquivado definitivamente"
                  >
                    Arquivado definitivamente
                  </SelectItem>
                </Select>
              ) : null}

              <Input
                description="Classe jurídica informada no tribunal (ex.: Procedimento Comum)."
                label="Classe Processual"
                placeholder="Ex: Procedimento Comum"
                value={formData.classeProcessual || ""}
                onValueChange={(value) =>
                  setFormData((prev) =>
                    prev ? { ...prev, classeProcessual: value } : prev,
                  )
                }
              />

              <Select
                description="Classificação por área de atuação (opcional). Configure áreas em Configurações."
                isClearable
                isLoading={isLoadingAreas}
                label="Área do processo"
                placeholder="Selecione uma área"
                selectedKeys={selectedAreaKeys}
                onSelectionChange={(keys) => {
                  const selectedKey = Array.from(keys)[0] as string | undefined;

                  setFormData((prev) =>
                    prev
                      ? {
                          ...prev,
                          areaId: selectedKey || undefined,
                        }
                      : prev,
                  );
                }}
              >
                {areas.map((area) => (
                  <SelectItem key={area.id} textValue={area.nome}>
                    {area.nome}
                  </SelectItem>
                ))}
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                description="Etapa do processo para orientar prazos e prioridade."
                label="Fase processual"
                placeholder="Selecione a fase"
                selectedKeys={formData.fase ? [formData.fase] : []}
                startContent={<Flag className="h-4 w-4 text-default-400" />}
                onSelectionChange={(keys) => {
                  const key = Array.from(keys)[0];

                  setFormData((prev) =>
                    prev
                      ? {
                          ...prev,
                          fase: key ? (key as ProcessoFase) : undefined,
                        }
                      : prev,
                  );
                }}
              >
                {fases.map((fase) => (
                  <SelectItem key={fase} textValue={getFaseLabel(fase)}>{getFaseLabel(fase)}</SelectItem>
                ))}
              </Select>

              <Select
                description="Instância de tramitação (1º grau, 2º grau ou tribunal superior)."
                label="Grau"
                placeholder="Selecione o grau"
                selectedKeys={formData.grau ? [formData.grau] : []}
                startContent={<Layers className="h-4 w-4 text-default-400" />}
                onSelectionChange={(keys) => {
                  const key = Array.from(keys)[0];

                  setFormData((prev) =>
                    prev
                      ? {
                          ...prev,
                          grau: key ? (key as ProcessoGrau) : undefined,
                        }
                      : prev,
                  );
                }}
              >
                {graus.map((grau) => (
                  <SelectItem key={grau} textValue={getGrauLabel(grau)}>{getGrauLabel(grau)}</SelectItem>
                ))}
              </Select>
            </div>

            <Input
              description="Câmara, turma ou órgão responsável pelo julgamento."
              label="Órgão Julgador"
              placeholder="Ex: 2ª Câmara de Direito Público"
              startContent={<Landmark className="h-4 w-4 text-default-400" />}
              value={formData.orgaoJulgador || ""}
              onValueChange={(value) =>
                setFormData((prev) =>
                  prev ? { ...prev, orgaoJulgador: value } : prev,
                )
              }
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                description="Procedimento aplicado ao caso (ordinário, sumário, especial etc.)."
                label="Rito"
                placeholder="Ex: Ordinário, Sumário"
                value={formData.rito || ""}
                onValueChange={(value) =>
                  setFormData((prev) =>
                    prev ? { ...prev, rito: value } : prev,
                  )
                }
              />

              <Input
                description="Valor econômico da ação, quando houver."
                label="Valor da Causa (R$)"
                placeholder="0,00"
                startContent={
                  <DollarSign className="h-4 w-4 text-default-400" />
                }
                type="number"
                value={
                  formData.valorCausa !== undefined &&
                  !Number.isNaN(formData.valorCausa)
                    ? String(formData.valorCausa)
                    : ""
                }
                onValueChange={(value) => {
                  const normalized = value.replace(/,/g, ".");
                  const numericValue =
                    normalized.trim() === "" ? undefined : Number(normalized);

                  setFormData((prev) =>
                    prev
                      ? {
                          ...prev,
                          valorCausa:
                            numericValue !== undefined &&
                            !Number.isNaN(numericValue)
                              ? numericValue
                              : undefined,
                        }
                      : prev,
                  );
                }}
              />
            </div>
          </div>

          <Divider />

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-default-600">
              📍 Localização
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                description="Cidade/comarca em que o processo tramita."
                label="Comarca"
                placeholder="Ex: São Paulo"
                startContent={<MapPin className="h-4 w-4 text-default-400" />}
                value={formData.comarca || ""}
                onValueChange={(value) =>
                  setFormData((prev) =>
                    prev ? { ...prev, comarca: value } : prev,
                  )
                }
              />

              <Input
                description="Foro ou regional do tribunal."
                label="Foro"
                placeholder="Ex: Foro Central"
                value={formData.foro || ""}
                onValueChange={(value) =>
                  setFormData((prev) =>
                    prev ? { ...prev, foro: value } : prev,
                  )
                }
              />
            </div>

            <Input
              description="Vara ou juizado específico onde o processo corre."
              label="Vara"
              placeholder="Ex: 1ª Vara Cível"
              value={formData.vara || ""}
              onValueChange={(value) =>
                setFormData((prev) => (prev ? { ...prev, vara: value } : prev))
              }
            />
          </div>

          <Divider />

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-default-600">
              📅 Outras Informações
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <DateInput
                description="Data oficial de distribuição do processo."
                label="Data de Distribuição"
                startContent={<Calendar className="h-4 w-4 text-default-400" />}
                value={
                  formData.dataDistribuicao
                    ? new Date(formData.dataDistribuicao)
                        .toISOString()
                        .split("T")[0]
                    : ""
                }
                onValueChange={(value) =>
                  setFormData((prev) =>
                    prev
                      ? {
                          ...prev,
                          dataDistribuicao: value ? new Date(value) : undefined,
                        }
                      : prev,
                  )
                }
              />

              <DateInput
                description="Próximo prazo estratégico para acompanhamento da equipe."
                label="Prazo Principal"
                startContent={<Clock className="h-4 w-4 text-default-400" />}
                value={
                  formData.prazoPrincipal
                    ? new Date(formData.prazoPrincipal)
                        .toISOString()
                        .split("T")[0]
                    : ""
                }
                onValueChange={(value) =>
                  setFormData((prev) =>
                    prev
                      ? {
                          ...prev,
                          prazoPrincipal: value ? new Date(value) : undefined,
                        }
                      : prev,
                  )
                }
              />
            </div>

            <Input
              description="Cole aqui o link da pasta de documentos do caso (Google Drive, OneDrive etc.)."
              label="Pasta de Documentos Compartilhada"
              placeholder="Ex: https://drive.google.com/drive/folders/..."
              startContent={<Link2 className="h-4 w-4 text-default-400" />}
              type="url"
              value={formData.pastaCompartilhadaUrl || ""}
              onValueChange={(value) =>
                setFormData((prev) =>
                  prev ? { ...prev, pastaCompartilhadaUrl: value } : prev,
                )
              }
            />

            <Checkbox
              isSelected={!!formData.segredoJustica}
              onValueChange={(checked) =>
                setFormData((prev) =>
                  prev ? { ...prev, segredoJustica: checked } : prev,
                )
              }
            >
              <div className="flex flex-col">
                <span className="text-sm font-semibold">
                  Segredo de Justiça
                </span>
                <span className="text-xs text-default-400">
                  Marque se este processo corre em segredo de justiça
                </span>
              </div>
            </Checkbox>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
