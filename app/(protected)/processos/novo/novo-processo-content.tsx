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
  FileText,
  X,
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
import {
  listComarcasPorTribunal,
  listTribunaisParaVinculo,
  listVarasPorTribunal,
} from "@/app/actions/tribunais";
import { listAreasProcesso } from "@/app/actions/areas-processo";
import { listClassesProcessuais } from "@/app/actions/classes-processuais";
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
import { ClienteCreateModal } from "@/components/clientes/cliente-create-modal";
import type { JuizSerializado } from "@/app/actions/juizes";

function buildTribunalLabel(tribunal?: {
  sigla?: string | null;
  nome: string;
}) {
  if (!tribunal) {
    return "";
  }

  return tribunal.sigla ? `${tribunal.sigla} - ${tribunal.nome}` : tribunal.nome;
}

export function NovoProcessoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clienteIdParam = searchParams.get("clienteId");

  const [isSaving, setIsSaving] = useState(false);
  const [isClienteModalOpen, setIsClienteModalOpen] = useState(false);
  const [isAuthorityModalOpen, setIsAuthorityModalOpen] = useState(false);
  const [inlineJuizes, setInlineJuizes] = useState<JuizSerializado[]>([]);
  const [advogadoPickerKey, setAdvogadoPickerKey] = useState<string | null>(
    null,
  );
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

  // Buscar clientes para o select (apenas se nÃ£o veio de um cliente)
  const {
    clientes,
    isLoading: isLoadingClientes,
    mutate: mutateClientes,
  } = useClientesParaSelect();
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
  const { data: comarcasData, isLoading: isLoadingComarcas } = useSWR(
    formData.tribunalId
      ? ["comarcas-processo-novo", formData.tribunalId]
      : null,
    ([, tribunalId]) => listComarcasPorTribunal(tribunalId),
  );
  const { data: varasData, isLoading: isLoadingVaras } = useSWR(
    formData.tribunalId
      ? ["varas-processo-novo", formData.tribunalId, formData.comarca || ""]
      : null,
    ([, tribunalId, comarca]) =>
      listVarasPorTribunal({
        tribunalId,
        comarca: typeof comarca === "string" ? comarca : undefined,
      }),
  );
  const {
    data: classesProcessuaisData,
    isLoading: isLoadingClassesProcessuais,
  } = useSWR("classes-processuais-select", () =>
    listClassesProcessuais({ ativo: true }),
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
  const comarcas = useMemo(() => {
    if (!comarcasData?.success) {
      return [];
    }

    return comarcasData.comarcas ?? [];
  }, [comarcasData]);
  const varas = useMemo(() => {
    if (!varasData?.success) {
      return [];
    }

    return varasData.varas ?? [];
  }, [varasData]);
  const classesProcessuais = useMemo(() => {
    if (!classesProcessuaisData?.success) {
      return [];
    }

    return classesProcessuaisData.classes ?? [];
  }, [classesProcessuaisData]);

  const clienteKeys = useMemo(
    () => new Set((clientes || []).map((cliente) => cliente.id)),
    [clientes],
  );
  const areaKeys = useMemo(
    () => new Set((areas || []).map((area) => area.id)),
    [areas],
  );
  const classProcessualOptions = useMemo(() => {
    const baseOptions = classesProcessuais.map((classe) => ({
      key: classe.slug,
      label: classe.nome,
      textValue: [classe.nome, classe.slug, classe.descricao || ""]
        .filter(Boolean)
        .join(" "),
      description: classe.descricao || undefined,
    }));

    const currentValue = formData.classeProcessual?.trim();

    if (!currentValue) {
      return baseOptions;
    }

    const exists = baseOptions.some(
      (item) =>
        item.label.localeCompare(currentValue, "pt-BR", {
          sensitivity: "accent",
        }) === 0,
    );

    if (exists) {
      return baseOptions;
    }

    return [
      {
        key: `legacy:${currentValue}`,
        label: currentValue,
        textValue: currentValue,
        description: "Classe legada já informada neste processo",
      },
      ...baseOptions,
    ];
  }, [classesProcessuais, formData.classeProcessual]);
  const selectedClasseProcessualKey = useMemo(() => {
    const currentValue = formData.classeProcessual?.trim();

    if (!currentValue) {
      return null;
    }

    const matched = classProcessualOptions.find(
      (item) =>
        item.label.localeCompare(currentValue, "pt-BR", {
          sensitivity: "accent",
        }) === 0,
    );

    return matched?.key ?? null;
  }, [classProcessualOptions, formData.classeProcessual]);
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
          [juiz.vara, juiz.comarca].filter(Boolean).join(" â€¢ ") ||
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
          [tribunal.esfera, tribunal.uf].filter(Boolean).join(" â€¢ ") ||
          "Sem esfera/UF",
      })),
    [tribunais],
  );
  const comarcaOptions = useMemo(
    () => {
      const baseOptions = comarcas.map((comarca) => ({
        key: comarca,
        label: comarca,
        textValue: comarca,
      }));
      const currentValue = formData.comarca?.trim();

      if (!currentValue) {
        return baseOptions;
      }

      if (baseOptions.some((item) => item.label === currentValue)) {
        return baseOptions;
      }

      return [
        {
          key: `legacy:${currentValue}`,
          label: currentValue,
          textValue: currentValue,
        },
        ...baseOptions,
      ];
    },
    [comarcas, formData.comarca],
  );
  const varaOptions = useMemo(
    () => {
      const baseOptions = varas.map((vara) => ({
        key: vara,
        label: vara,
        textValue: vara,
      }));
      const currentValue = formData.vara?.trim();

      if (!currentValue) {
        return baseOptions;
      }

      if (baseOptions.some((item) => item.label === currentValue)) {
        return baseOptions;
      }

      return [
        {
          key: `legacy:${currentValue}`,
          label: currentValue,
          textValue: currentValue,
        },
        ...baseOptions,
      ];
    },
    [formData.vara, varas],
  );
  const selectedOrgaoJulgadorKey = useMemo(() => {
    const currentValue = formData.orgaoJulgador?.trim();

    if (!currentValue) {
      return selectedTribunalKeys[0] ?? null;
    }

    const matched = tribunalOptions.find(
      (item) =>
        item.label.localeCompare(currentValue, "pt-BR", {
          sensitivity: "accent",
        }) === 0,
    );

    return matched?.key ?? null;
  }, [formData.orgaoJulgador, selectedTribunalKeys, tribunalOptions]);
  const selectedComarcaKey = useMemo(() => {
    const currentValue = formData.comarca?.trim();

    if (!currentValue) {
      return null;
    }

    return comarcaOptions.find((item) => item.label === currentValue)?.key ?? null;
  }, [comarcaOptions, formData.comarca]);
  const selectedVaraKey = useMemo(() => {
    const currentValue = formData.vara?.trim();

    if (!currentValue) {
      return null;
    }

    return varaOptions.find((item) => item.label === currentValue)?.key ?? null;
  }, [formData.vara, varaOptions]);
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
  const advogadoOptionsDisponiveis = useMemo(
    () =>
      advogadoOptions.filter(
        (option) => !selectedAdvogadoKeys.includes(option.key),
      ),
    [advogadoOptions, selectedAdvogadoKeys],
  );

  const fases = Object.values(ProcessoFase);
  const graus = Object.values(ProcessoGrau);

  const getFaseLabel = (fase: ProcessoFase) => {
    switch (fase) {
      case ProcessoFase.PETICAO_INICIAL:
        return "PetiÃ§Ã£o Inicial";
      case ProcessoFase.CITACAO:
        return "CitaÃ§Ã£o";
      case ProcessoFase.INSTRUCAO:
        return "InstruÃ§Ã£o";
      case ProcessoFase.SENTENCA:
        return "SentenÃ§a";
      case ProcessoFase.RECURSO:
        return "Recurso";
      case ProcessoFase.EXECUCAO:
        return "ExecuÃ§Ã£o";
      default:
        return fase;
    }
  };

  const getGrauLabel = (grau: ProcessoGrau) => {
    switch (grau) {
      case ProcessoGrau.PRIMEIRO:
        return "1Âº Grau";
      case ProcessoGrau.SEGUNDO:
        return "2Âº Grau";
      case ProcessoGrau.SUPERIOR:
        return "Tribunal Superior";
      default:
        return grau;
    }
  };

  const handleSubmit = async () => {
    if (!formData.numero.trim()) {
      toast.error("NÃºmero do processo Ã© obrigatÃ³rio");

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
            Cadastrar novo processo jurÃ­dico
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
              Este processo comeÃ§arÃ¡ com este cliente jÃ¡ vinculado. VocÃª pode adicionar outros abaixo.
            </p>
          </CardBody>
        </Card>
      )}

      {/* FormulÃ¡rio */}
      <Card className="border border-default-200">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">InformaÃ§Ãµes do Processo</h2>
          </div>
        </CardHeader>
        <Divider />
        <CardBody className="gap-6">
          {/* SeÃ§Ã£o: Dados BÃ¡sicos */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-default-600">
              ðŸ“‹ Dados BÃ¡sicos
            </h3>

            {/* Select de Cliente (se nÃ£o veio de um cliente) */}
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
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
              ) : (
                <p className="text-xs text-default-500">
                  Nao ha clientes cadastrados neste escritorio ainda.
                </p>
              )}
              <Button
                color="primary"
                size="sm"
                variant="light"
                onPress={() => setIsClienteModalOpen(true)}
              >
                Nao tem cliente? Criar novo cliente
              </Button>
            </div>

            <SearchableSelect
              isRequired
              description="ObrigatÃ³rio para anÃ¡lise de perfil de julgamento e histÃ³rico estratÃ©gico."
              emptyContent="Nenhuma autoridade encontrada"
              items={juizOptions}
              isLoading={isLoadingJuizes}
              label="Autoridade do Caso *"
              placeholder="Selecione o juiz ou promotor responsÃ¡vel"
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

            <SearchableSelect
              description="Tribunal ao qual o processo esta vinculado. Digite para encontrar mais rapido."
              emptyContent="Nenhum tribunal encontrado"
              items={tribunalOptions}
              isLoading={isLoadingTribunais}
              isRequired
              isVirtualized={false}
              label="Tribunal *"
              placeholder="Digite para buscar o tribunal"
              selectedKey={selectedTribunalKeys[0] ?? null}
              startContent={<Landmark className="h-4 w-4 text-default-400" />}
              onSelectionChange={(selectedKey) =>
                setFormData((prev) => {
                  const selectedTribunal = tribunais.find(
                    (tribunal) => tribunal.id === selectedKey,
                  );
                  const tribunalLabel = buildTribunalLabel(selectedTribunal);
                  const shouldSyncOrgao =
                    !prev.orgaoJulgador?.trim() ||
                    prev.orgaoJulgador ===
                      buildTribunalLabel(
                        tribunais.find(
                          (tribunal) => tribunal.id === prev.tribunalId,
                        ),
                      );

                  return {
                    ...prev,
                    tribunalId: selectedKey || "",
                    comarca: "",
                    vara: "",
                    orgaoJulgador: shouldSyncOrgao
                      ? tribunalLabel
                      : prev.orgaoJulgador,
                  };
                })
              }
            />

            <div className="space-y-3">
              <SearchableSelect
                description="Digite para localizar e adicionar advogados responsaveis."
                emptyContent="Nenhum advogado encontrado"
                items={advogadoOptionsDisponiveis}
                isLoading={isLoadingAdvogados}
                label="Advogados responsaveis"
                placeholder="Digite para buscar e adicionar"
                selectedKey={advogadoPickerKey}
                startContent={<Scale className="h-4 w-4 text-default-400" />}
                onSelectionChange={(selectedKey) => {
                  setAdvogadoPickerKey(selectedKey);

                  if (!selectedKey) {
                    return;
                  }

                  setFormData((prev) => {
                    const atuais = prev.advogadoResponsavelIds?.length
                      ? prev.advogadoResponsavelIds
                      : prev.advogadoResponsavelId
                        ? [prev.advogadoResponsavelId]
                        : [];
                    const nextKeys = Array.from(
                      new Set([...atuais, selectedKey]),
                    );

                    return {
                      ...prev,
                      advogadoResponsavelId: nextKeys[0] || "",
                      advogadoResponsavelIds: nextKeys,
                    };
                  });

                  setAdvogadoPickerKey(null);
                }}
              />
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
                      <Button
                        key={advogadoId}
                        color="secondary"
                        endContent={<X className="h-3 w-3" />}
                        size="sm"
                        variant="flat"
                        onPress={() =>
                          setFormData((prev) => {
                            const nextKeys = selectedAdvogadoKeys.filter(
                              (id) => id !== advogadoId,
                            );

                            return {
                              ...prev,
                              advogadoResponsavelId: nextKeys[0] || "",
                              advogadoResponsavelIds: nextKeys,
                            };
                          })
                        }
                      >
                        {advogado.label}
                      </Button>
                    );
                  })}
                </div>
              ) : null}
            </div>


            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                isRequired
                description="Identificador principal do processo para busca e controle interno."
                label="NÃºmero do Processo *"
                placeholder="0000000-00.0000.0.00.0000"
                value={formData.numero}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, numero: value }))
                }
              />

              <Input
                description="Informe se houver diferenÃ§a do nÃºmero principal"
                label="NÃºmero CNJ (oficial)"
                placeholder="0000000-00.0000.0.00.0000"
                value={formData.numeroCnj || ""}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, numeroCnj: value }))
                }
              />

              <Input
                description="CÃ³digo interno para organizaÃ§Ã£o do escritÃ³rio (opcional)."
                label="NÃºmero Interno"
                placeholder="Ex: 2024/001"
                value={formData.numeroInterno || ""}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, numeroInterno: value }))
                }
              />
            </div>

            <Input
              description="Nome curto para identificar rapidamente o caso nas listagens."
              label="TÃ­tulo"
              placeholder="Ex: AÃ§Ã£o de Despejo, DivÃ³rcio, etc."
              value={formData.titulo || ""}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, titulo: value }))
              }
            />

            <Textarea
              description="Resumo do contexto, estratÃ©gia ou observaÃ§Ãµes importantes do caso."
              label="DescriÃ§Ã£o"
              minRows={3}
              placeholder="Resumo do caso..."
              value={formData.descricao || ""}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, descricao: value }))
              }
            />
          </div>

          <Divider />

          {/* SeÃ§Ã£o: ClassificaÃ§Ã£o */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-default-600">
              âš–ï¸ ClassificaÃ§Ã£o e Status
            </h3>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Select
                description="SituaÃ§Ã£o atual do processo no escritÃ³rio."
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

              <div className="space-y-2">
                <SearchableSelect
                  description="Catálogo de classes processuais do escritório. Se faltar alguma, cadastre em Configurações."
                  emptyContent="Nenhuma classe processual encontrada"
                  isLoading={isLoadingClassesProcessuais}
                  items={classProcessualOptions}
                  label="Classe Processual"
                  placeholder="Digite para buscar a classe"
                  selectedKey={selectedClasseProcessualKey}
                  startContent={<FileText className="h-4 w-4 text-default-400" />}
                  onSelectionChange={(selectedKey) => {
                    const option = classProcessualOptions.find(
                      (item) => item.key === selectedKey,
                    );

                    setFormData((prev) => ({
                      ...prev,
                      classeProcessual: option?.label || "",
                    }));
                  }}
                />
                <div className="flex justify-end">
                  <Button
                    as={Link}
                    color="secondary"
                    href="/configuracoes?tab=classes-processuais"
                    size="sm"
                    variant="light"
                  >
                    Gerenciar classes processuais
                  </Button>
                </div>
              </div>

              <Select
                description="ClassificaÃ§Ã£o por Ã¡rea de atuaÃ§Ã£o (opcional). Configure Ã¡reas em ConfiguraÃ§Ãµes."
                isClearable
                isLoading={isLoadingAreas}
                label="Ãrea do processo"
                placeholder="Selecione uma Ã¡rea"
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
                description="InstÃ¢ncia de tramitaÃ§Ã£o (1Âº grau, 2Âº grau ou tribunal superior)."
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

            <SearchableSelect
              description="Por padrao, herda o mesmo tribunal acima. Se precisar, selecione outro."
              emptyContent="Nenhum tribunal encontrado"
              isLoading={isLoadingTribunais}
              isVirtualized={false}
              items={tribunalOptions}
              label="Orgao Julgador"
              placeholder="Digite para buscar o orgao julgador"
              selectedKey={selectedOrgaoJulgadorKey}
              startContent={<Landmark className="h-4 w-4 text-default-400" />}
              onSelectionChange={(selectedKey) =>
                setFormData((prev) => ({
                  ...prev,
                  orgaoJulgador:
                    tribunalOptions.find((item) => item.key === selectedKey)
                      ?.label || "",
                }))
              }
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                description="Procedimento aplicado ao caso (ordinÃ¡rio, sumÃ¡rio, especial etc.)."
                label="Rito"
                placeholder="Ex: OrdinÃ¡rio, SumÃ¡rio"
                value={formData.rito || ""}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, rito: value }))
                }
              />

              <Input
                description="Valor econÃ´mico da aÃ§Ã£o, quando houver."
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

          {/* SeÃ§Ã£o: LocalizaÃ§Ã£o */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-default-600">
              ðŸ“ LocalizaÃ§Ã£o
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <SearchableSelect
                description="Comarca vinculada ao tribunal selecionado."
                emptyContent="Nenhuma comarca encontrada"
                isDisabled={!formData.tribunalId}
                isLoading={isLoadingComarcas}
                items={comarcaOptions}
                label="Comarca"
                placeholder="Digite para buscar a comarca"
                selectedKey={selectedComarcaKey}
                startContent={<MapPin className="h-4 w-4 text-default-400" />}
                onSelectionChange={(selectedKey) => {
                  const option = comarcaOptions.find(
                    (item) => item.key === selectedKey,
                  );

                  setFormData((prev) => ({
                    ...prev,
                    comarca: option?.label || "",
                    vara: "",
                  }));
                }}
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

            <SearchableSelect
              description="Vara ou juizado disponível para a comarca selecionada."
              emptyContent="Nenhuma vara encontrada"
              isDisabled={!formData.tribunalId || !formData.comarca}
              isLoading={isLoadingVaras}
              items={varaOptions}
              label="Vara"
              placeholder="Digite para buscar a vara"
              selectedKey={selectedVaraKey}
              onSelectionChange={(selectedKey) => {
                const option = varaOptions.find((item) => item.key === selectedKey);

                setFormData((prev) => ({
                  ...prev,
                  vara: option?.label || "",
                }));
              }}
            />
          </div>

          <Divider />

          {/* SeÃ§Ã£o: Outras InformaÃ§Ãµes */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-default-600">
              ðŸ“… Outras InformaÃ§Ãµes
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <DateInput
                description="Data oficial de distribuiÃ§Ã£o do processo."
                label="Data de DistribuiÃ§Ã£o"
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
                description="PrÃ³ximo prazo estratÃ©gico para acompanhamento da equipe."
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
                  Segredo de JustiÃ§a
                </span>
                <span className="text-xs text-default-400">
                  Marque se este processo corre em segredo de justiÃ§a
                </span>
              </div>
            </Checkbox>
          </div>

          {/* InformaÃ§Ã£o */}
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
            <p className="text-xs text-primary-600">
              ðŸ’¡ ApÃ³s criar o processo, vocÃª poderÃ¡ adicionar documentos,
              eventos, movimentaÃ§Ãµes e vincular procuraÃ§Ãµes.
            </p>
          </div>

          {/* BotÃµes de AÃ§Ã£o */}
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

      <ClienteCreateModal
        isOpen={isClienteModalOpen}
        onCreated={async (cliente) => {
          await mutateClientes();
          setFormData((prev) => {
            const currentIds = prev.clienteIds?.length
              ? prev.clienteIds
              : prev.clienteId
                ? [prev.clienteId]
                : [];
            const nextIds = Array.from(new Set([...currentIds, cliente.id]));

            return {
              ...prev,
              clienteId: nextIds[0] || "",
              clienteIds: nextIds,
            };
          });
        }}
        onOpenChange={setIsClienteModalOpen}
      />

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
