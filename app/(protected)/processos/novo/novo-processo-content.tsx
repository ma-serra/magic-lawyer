"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Textarea } from "@heroui/input";

import { Checkbox } from "@heroui/checkbox";
import { Divider } from "@heroui/divider";
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
import { useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import { Spinner } from "@heroui/spinner";
import { Chip } from "@heroui/chip";
import useSWR from "swr";

import { title } from "@/components/primitives";
import {
  createProcesso,
  type ProcessoCreateInput,
} from "@/app/actions/processos";
import { listTribunaisParaVinculo } from "@/app/actions/tribunais";
import { listAreasProcesso } from "@/app/actions/areas-processo";
import {
  ProcessoArquivamentoTipo,
  ProcessoStatus,
  ProcessoFase,
  ProcessoGrau,
} from "@/generated/prisma";
import { useClientesParaSelect } from "@/app/hooks/use-clientes";
import { useAdvogadosParaSelect } from "@/app/hooks/use-advogados-select";
import { useJuizes } from "@/app/hooks/use-juizes";
import { Select, SelectItem } from "@heroui/react";
import { DateInput } from "@/components/ui/date-input";
import { SearchableSelect } from "@/components/searchable-select";
import { AuthorityQuickCreateModal } from "@/components/processos/authority-quick-create-modal";
import type { JuizSerializado } from "@/app/actions/juizes";

export function NovoProcessoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clienteIdParam = searchParams.get("clienteId");

  const [isSaving, setIsSaving] = useState(false);
  const [isAuthorityModalOpen, setIsAuthorityModalOpen] = useState(false);
  const [inlineJuizes, setInlineJuizes] = useState<JuizSerializado[]>([]);
  const [formData, setFormData] = useState<ProcessoCreateInput>({
    numero: "",
    numeroCnj: "",
    titulo: "",
    descricao: "",
    status: ProcessoStatus.RASCUNHO,
    arquivamentoTipo: null,
    classeProcessual: "",
    orgaoJulgador: "",
    vara: "",
    comarca: "",
    foro: "",
    rito: "",
    numeroInterno: "",
    pastaCompartilhadaUrl: "",
    clienteId: clienteIdParam || "",
    clienteIds: clienteIdParam ? [clienteIdParam] : [],
    segredoJustica: false,
    advogadoResponsavelId: "",
    advogadoResponsavelIds: [],
    juizId: "",
    tribunalId: "",
  });

  // Buscar clientes para o select (apenas se não veio de um cliente)
  const { clientes, isLoading: isLoadingClientes } = useClientesParaSelect();
  const { advogados, isLoading: isLoadingAdvogados } = useAdvogadosParaSelect();
  const {
    juizes: juizesDisponiveis,
    isLoading: isLoadingJuizes,
    mutate: mutateJuizes,
  } = useJuizes();
  const juizesDoFormulario = useMemo(() => {
    const byId = new Map<string, JuizSerializado>();

    for (const juiz of inlineJuizes) {
      byId.set(juiz.id, juiz);
    }

    for (const juiz of juizesDisponiveis || []) {
      byId.set(juiz.id, juiz);
    }

    return Array.from(byId.values());
  }, [inlineJuizes, juizesDisponiveis]);
  const { data: areasData, isLoading: isLoadingAreas } = useSWR(
    "areas-processo-select",
    () => listAreasProcesso({ ativo: true }),
  );
  const { data: tribunaisData, isLoading: isLoadingTribunais } = useSWR(
    "tribunais-vinculo-processos-novo",
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
  const tribunalKeys = useMemo(
    () => new Set((tribunais || []).map((tribunal) => tribunal.id)),
    [tribunais],
  );
  const juizKeys = useMemo(
    () => new Set(juizesDoFormulario.map((juiz) => juiz.id)),
    [juizesDoFormulario],
  );
  const selectedClienteKeys = useMemo(
    () =>
      (formData.clienteIds?.length
        ? formData.clienteIds
        : formData.clienteId
          ? [formData.clienteId]
          : []
      ).filter((clienteId) => clienteKeys.has(clienteId)),
    [clienteKeys, formData.clienteId, formData.clienteIds],
  );
  const selectedAdvogadoKeys = useMemo(
    () =>
      (formData.advogadoResponsavelIds?.length
        ? formData.advogadoResponsavelIds
        : formData.advogadoResponsavelId
          ? [formData.advogadoResponsavelId]
          : []
      ).filter((advogadoId) => advogadoKeys.has(advogadoId)),
    [
      advogadoKeys,
      formData.advogadoResponsavelId,
      formData.advogadoResponsavelIds,
    ],
  );
  const selectedTribunalKeys =
    formData.tribunalId && tribunalKeys.has(formData.tribunalId)
      ? [formData.tribunalId]
      : [];
  const selectedJuizKeys =
    formData.juizId && juizKeys.has(formData.juizId) ? [formData.juizId] : [];
  const selectedAreaKeys =
    formData.areaId && areaKeys.has(formData.areaId) ? [formData.areaId] : [];
  const selectedArquivamentoKeys =
    formData.arquivamentoTipo && formData.status === ProcessoStatus.ARQUIVADO
      ? [formData.arquivamentoTipo]
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
  const juizOptions = useMemo(
    () =>
      juizesDoFormulario.map((juiz) => ({
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
    [juizesDoFormulario],
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
  const advogadoOptions = useMemo(
    () =>
      (advogados || []).map((advogado) => ({
        key: advogado.id,
        label: advogado.label,
        textValue: [advogado.label, advogado.oab || ""].filter(Boolean).join(" "),
        description: advogado.oab ? `OAB ${advogado.oab}` : undefined,
      })),
    [advogados],
  );

  const fases = Object.values(ProcessoFase);
  const graus = Object.values(ProcessoGrau);

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
    if (!formData.numero.trim()) {
      toast.error("Número do processo é obrigatório");

      return;
    }

    if (selectedClienteKeys.length === 0) {
      toast.error("Selecione pelo menos um cliente");

      return;
    }

    if (!formData.juizId) {
      toast.error("Selecione a autoridade do caso (juiz ou promotor)");

      return;
    }

    if (!formData.tribunalId) {
      toast.error("Selecione o tribunal do caso");

      return;
    }

    setIsSaving(true);

    try {
      const payload: ProcessoCreateInput = {
        numero: formData.numero.trim(),
        clienteId: selectedClienteKeys[0],
        clienteIds: selectedClienteKeys,
        status: formData.status,
        segredoJustica: formData.segredoJustica,
      };

      if (formData.numeroCnj?.trim())
        payload.numeroCnj = formData.numeroCnj.trim();
      if (formData.titulo?.trim()) payload.titulo = formData.titulo.trim();
      if (formData.descricao?.trim())
        payload.descricao = formData.descricao.trim();
      if (formData.classeProcessual?.trim())
        payload.classeProcessual = formData.classeProcessual.trim();
      if (formData.rito?.trim()) payload.rito = formData.rito.trim();
      if (formData.vara?.trim()) payload.vara = formData.vara.trim();
      if (formData.comarca?.trim()) payload.comarca = formData.comarca.trim();
      if (formData.foro?.trim()) payload.foro = formData.foro.trim();
      if (formData.orgaoJulgador?.trim())
        payload.orgaoJulgador = formData.orgaoJulgador.trim();
      if (formData.numeroInterno?.trim())
        payload.numeroInterno = formData.numeroInterno.trim();
      if (formData.pastaCompartilhadaUrl?.trim())
        payload.pastaCompartilhadaUrl = formData.pastaCompartilhadaUrl.trim();
      if (formData.dataDistribuicao)
        payload.dataDistribuicao = formData.dataDistribuicao;
      if (formData.prazoPrincipal)
        payload.prazoPrincipal = formData.prazoPrincipal;
      if (
        formData.valorCausa !== undefined &&
        !Number.isNaN(formData.valorCausa)
      )
        payload.valorCausa = formData.valorCausa;
      if (formData.areaId) payload.areaId = formData.areaId;
      if (formData.fase) payload.fase = formData.fase;
      if (formData.grau) payload.grau = formData.grau;
      if (selectedAdvogadoKeys.length > 0) {
        payload.advogadoResponsavelId = selectedAdvogadoKeys[0];
        payload.advogadoResponsavelIds = selectedAdvogadoKeys;
      }
      if (formData.juizId) payload.juizId = formData.juizId;
      if (formData.tribunalId) payload.tribunalId = formData.tribunalId;
      if (formData.status === ProcessoStatus.ARQUIVADO) {
        payload.arquivamentoTipo = formData.arquivamentoTipo ?? null;
      }

      const result = await createProcesso(payload);

      if (result.success) {
        toast.success("Processo criado com sucesso!");

        const destino = clienteIdParam
          ? `/clientes/${clienteIdParam}`
          : "/processos";

        router.replace(destino);
        router.refresh();

        if (typeof window !== "undefined") {
          window.setTimeout(() => {
            if (window.location.pathname === "/processos/novo") {
              window.location.assign(destino);
            }
          }, 250);
        }
      } else {
        toast.error(result.error || "Erro ao criar processo");
      }
    } catch (error) {
      toast.error("Erro ao criar processo");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingClientes && clientes.length === 0) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Spinner label="Carregando dados..." size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={title()}>Novo Processo</h1>
          <p className="text-sm text-default-500 mt-1">
            Cadastrar novo processo jurídico
          </p>
        </div>
        <Button
          as={Link}
          href={clienteIdParam ? `/clientes/${clienteIdParam}` : "/processos"}
          startContent={<ArrowLeft className="h-4 w-4" />}
          variant="light"
        >
          Voltar
        </Button>
      </div>

      {/* Aviso se veio de um cliente */}
      {clienteIdParam && (
        <Card className="border border-primary/20 bg-primary/5">
          <CardBody className="flex flex-row items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            <p className="text-sm text-primary">
              Este processo começará com este cliente já vinculado. Você pode adicionar outros abaixo.
            </p>
          </CardBody>
        </Card>
      )}

      {/* Formulário */}
      <Card className="border border-default-200">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Informações do Processo</h2>
          </div>
        </CardHeader>
        <Divider />
        <CardBody className="gap-6">
          {/* Seção: Dados Básicos */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-default-600">
              📋 Dados Básicos
            </h3>

            {/* Select de Cliente (se não veio de um cliente) */}
            <Select
                isRequired
                description="Selecione um ou mais clientes vinculados a este processo. Todos aparecem no caso."
                items={clienteOptions}
                label="Clientes vinculados *"
                placeholder="Selecione um ou mais clientes"
                selectedKeys={new Set(selectedClienteKeys)}
                selectionMode="multiple"
                startContent={<Users className="h-4 w-4 text-default-400" />}
                onSelectionChange={(keys) => {
                  const nextKeys = Array.from(keys).map(String);

                  setFormData((prev) => ({
                    ...prev,
                    clienteId: nextKeys[0] || "",
                    clienteIds: nextKeys,
                  }));
                }}
              >
                {clienteOptions.map((item) => (
                  <SelectItem
                    key={item.key}
                    textValue={item.textValue ?? item.label}
                  >
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

            <SearchableSelect
              isRequired
              description="Obrigatório para análise de perfil de julgamento e histórico estratégico."
              emptyContent="Nenhuma autoridade encontrada"
              items={juizOptions}
              isLoading={isLoadingJuizes}
              label="Autoridade do Caso *"
              placeholder="Selecione o juiz ou promotor responsável"
              selectedKey={selectedJuizKeys[0] ?? null}
              startContent={<Gavel className="h-4 w-4 text-default-400" />}
              onSelectionChange={(selectedKey) =>
                setFormData((prev) => ({
                  ...prev,
                  juizId: selectedKey || "",
                }))
              }
            />

            <div className="-mt-1 flex justify-end">
              <Button
                color="secondary"
                size="sm"
                variant="light"
                onPress={() => setIsAuthorityModalOpen(true)}
              >
                Nao encontrou a autoridade? Cadastre agora
              </Button>
            </div>

            <Select
              description="Tribunal ao qual o processo está vinculado. Pode ser global (oficial) ou do seu escritório."
              items={tribunalOptions}
              isLoading={isLoadingTribunais}
              isRequired
              label="Tribunal *"
              placeholder="Selecione o tribunal do caso"
              selectedKeys={new Set(selectedTribunalKeys)}
              startContent={<Landmark className="h-4 w-4 text-default-400" />}
              onSelectionChange={(keys) =>
                setFormData((prev) => ({
                  ...prev,
                  tribunalId: Array.from(keys)[0]?.toString() || "",
                }))
              }
            >
              {tribunalOptions.map((item) => (
                <SelectItem key={item.key} textValue={item.textValue ?? item.label}>
                  {item.label}
                </SelectItem>
              ))}
            </Select>

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

                setFormData((prev) => ({
                  ...prev,
                  advogadoResponsavelId: nextKeys[0] || "",
                  advogadoResponsavelIds: nextKeys,
                }));
              }}
            >
              {advogadoOptions.map((item) => (
                <SelectItem key={item.key} textValue={item.textValue ?? item.label}>
                  {item.label}
                </SelectItem>
              ))}
            </Select>
            {selectedAdvogadoKeys.length > 0 ? (
              <div className="flex flex-wrap gap-2">
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

            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                isRequired
                description="Identificador principal do processo para busca e controle interno."
                label="Número do Processo *"
                placeholder="0000000-00.0000.0.00.0000"
                value={formData.numero}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, numero: value }))
                }
              />

              <Input
                description="Informe se houver diferença do número principal"
                label="Número CNJ (oficial)"
                placeholder="0000000-00.0000.0.00.0000"
                value={formData.numeroCnj || ""}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, numeroCnj: value }))
                }
              />

              <Input
                description="Código interno para organização do escritório (opcional)."
                label="Número Interno"
                placeholder="Ex: 2024/001"
                value={formData.numeroInterno || ""}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, numeroInterno: value }))
                }
              />
            </div>

            <Input
              description="Nome curto para identificar rapidamente o caso nas listagens."
              label="Título"
              placeholder="Ex: Ação de Despejo, Divórcio, etc."
              value={formData.titulo || ""}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, titulo: value }))
              }
            />

            <Textarea
              description="Resumo do contexto, estratégia ou observações importantes do caso."
              label="Descrição"
              minRows={3}
              placeholder="Resumo do caso..."
              value={formData.descricao || ""}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, descricao: value }))
              }
            />
          </div>

          <Divider />

          {/* Seção: Classificação */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-default-600">
              ⚖️ Classificação e Status
            </h3>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Select
                description="Situação atual do processo no escritório."
                label="Status"
                placeholder="Selecione o status"
                selectedKeys={formData.status ? [formData.status] : []}
                onSelectionChange={(keys) =>
                  setFormData((prev) => ({
                    ...prev,
                    status: Array.from(keys)[0] as ProcessoStatus,
                    arquivamentoTipo:
                      Array.from(keys)[0] === ProcessoStatus.ARQUIVADO
                        ? prev.arquivamentoTipo ?? null
                        : null,
                  }))
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
                    setFormData((prev) => ({
                      ...prev,
                      arquivamentoTipo:
                        (Array.from(keys)[0] as ProcessoArquivamentoTipo) ??
                        null,
                    }))
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
                  setFormData((prev) => ({ ...prev, classeProcessual: value }))
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

                  setFormData((prev) => ({
                    ...prev,
                    areaId: selectedKey || undefined,
                  }));
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

                  setFormData((prev) => ({
                    ...prev,
                    fase: key ? (key as ProcessoFase) : undefined,
                  }));
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

                  setFormData((prev) => ({
                    ...prev,
                    grau: key ? (key as ProcessoGrau) : undefined,
                  }));
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
                setFormData((prev) => ({ ...prev, orgaoJulgador: value }))
              }
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                description="Procedimento aplicado ao caso (ordinário, sumário, especial etc.)."
                label="Rito"
                placeholder="Ex: Ordinário, Sumário"
                value={formData.rito || ""}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, rito: value }))
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

                  setFormData((prev) => ({
                    ...prev,
                    valorCausa:
                      numericValue !== undefined && !Number.isNaN(numericValue)
                        ? numericValue
                        : undefined,
                  }));
                }}
              />
            </div>
          </div>

          <Divider />

          {/* Seção: Localização */}
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
                  setFormData((prev) => ({ ...prev, comarca: value }))
                }
              />

              <Input
                description="Foro ou regional do tribunal."
                label="Foro"
                placeholder="Ex: Foro Central"
                value={formData.foro || ""}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, foro: value }))
                }
              />
            </div>

            <Input
              description="Vara ou juizado específico onde o processo corre."
              label="Vara"
              placeholder="Ex: 1ª Vara Cível"
              value={formData.vara || ""}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, vara: value }))
              }
            />
          </div>

          <Divider />

          {/* Seção: Outras Informações */}
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
                  setFormData((prev) => ({
                    ...prev,
                    dataDistribuicao: value ? new Date(value) : undefined,
                  }))
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
                  setFormData((prev) => ({
                    ...prev,
                    prazoPrincipal: value ? new Date(value) : undefined,
                  }))
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
                setFormData((prev) => ({
                  ...prev,
                  pastaCompartilhadaUrl: value,
                }))
              }
            />

            <Checkbox
              isSelected={formData.segredoJustica}
              onValueChange={(checked) =>
                setFormData((prev) => ({ ...prev, segredoJustica: checked }))
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

          {/* Informação */}
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
            <p className="text-xs text-primary-600">
              💡 Após criar o processo, você poderá adicionar documentos,
              eventos, movimentações e vincular procurações.
            </p>
          </div>

          {/* Botões de Ação */}
          <div className="flex gap-3 justify-end">
            <Button
              variant="light"
              onPress={() =>
                router.push(
                  clienteIdParam ? `/clientes/${clienteIdParam}` : "/processos",
                )
              }
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
              Criar Processo
            </Button>
          </div>
        </CardBody>
      </Card>

      <AuthorityQuickCreateModal
        isOpen={isAuthorityModalOpen}
        tribunais={tribunais}
        onClose={() => setIsAuthorityModalOpen(false)}
        onCreated={async (juiz) => {
          setInlineJuizes((current) => [
            juiz,
            ...current.filter((item) => item.id !== juiz.id),
          ]);
          setFormData((prev) => ({
            ...prev,
            juizId: juiz.id,
          }));
          await mutateJuizes();
          setIsAuthorityModalOpen(false);
        }}
      />
    </div>
  );
}
