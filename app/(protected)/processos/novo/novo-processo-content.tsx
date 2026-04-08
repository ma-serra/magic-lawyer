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
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
import { listCausas } from "@/app/actions/causas";
import {
  ProcessoArquivamentoTipo,
  ProcessoStatus,
  ProcessoFase,
  ProcessoGrau,
  ProcessoPolo,
} from "@/generated/prisma";
import { useClientesParaSelect } from "@/app/hooks/use-clientes";
import { useAdvogadosParaSelect } from "@/app/hooks/use-advogados-select";
import { useJuizes } from "@/app/hooks/use-juizes";
import { useUserPermissions } from "@/app/hooks/use-user-permissions";
import { Select, SelectItem } from "@heroui/react";
import { DateInput } from "@/components/ui/date-input";
import { SearchableSelect } from "@/components/searchable-select";
import { AuthorityQuickCreateModal } from "@/components/processos/authority-quick-create-modal";
import { ProcessAreaQuickCreateModal } from "@/components/processos/process-area-quick-create-modal";
import { ProcessClassQuickCreateModal } from "@/components/processos/process-class-quick-create-modal";
import { ProcessCauseQuickCreateModal } from "@/components/processos/process-cause-quick-create-modal";
import { ProcessClassificationSection } from "@/components/processos/process-classification-section";
import { ClienteCreateModal } from "@/components/clientes/cliente-create-modal";
import type { JuizSerializado } from "@/app/actions/juizes";
import { doesAreaRequireProcedimento } from "@/app/lib/processos/procedimento-processual";
import { resolveAutoSelectedJudicialLocation } from "@/app/lib/tribunais/judicial-location-defaults";

function buildTribunalLabel(tribunal?: {
  sigla?: string | null;
  nome: string;
}) {
  if (!tribunal) {
    return "";
  }

  return tribunal.sigla ? `${tribunal.sigla} - ${tribunal.nome}` : tribunal.nome;
}

type ParteInicialDraft = NonNullable<ProcessoCreateInput["partesIniciais"]>[number];

const INITIAL_PARTE_ADICIONAL: ParteInicialDraft = {
  tipoPolo: ProcessoPolo.REU,
  nome: "",
};

export function NovoProcessoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clienteIdParam = searchParams.get("clienteId");
  const { permissions, isAdmin, isSuperAdmin } = useUserPermissions();

  const [isSaving, setIsSaving] = useState(false);
  const [isClienteModalOpen, setIsClienteModalOpen] = useState(false);
  const [isAuthorityModalOpen, setIsAuthorityModalOpen] = useState(false);
  const [isAreaModalOpen, setIsAreaModalOpen] = useState(false);
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [isCauseModalOpen, setIsCauseModalOpen] = useState(false);
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
    causaIds: [],
    orgaoJulgador: "",
    vara: "",
    comarca: "",
    numeroInterno: "",
    pastaCompartilhadaUrl: "",
    clienteId: clienteIdParam || "",
    clienteIds: clienteIdParam ? [clienteIdParam] : [],
    segredoJustica: false,
    advogadoResponsavelId: "",
    advogadoResponsavelIds: [],
    juizId: "",
    tribunalId: "",
    partesIniciais: [],
  });

  // Buscar clientes para o select (apenas se não veio de um cliente)
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
  const {
    data: areasData,
    isLoading: isLoadingAreas,
    mutate: mutateAreas,
  } = useSWR(
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
    mutate: mutateClassesProcessuais,
  } = useSWR("classes-processuais-select", () =>
    listClassesProcessuais({ ativo: true }),
  );
  const {
    data: causasData,
    isLoading: isLoadingCausas,
    mutate: mutateCausas,
  } = useSWR("causas-processo-select", () =>
    listCausas({
      status: "ativas",
      orderBy: "nome",
      orderDirection: "asc",
    }),
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
  const causas = useMemo(() => {
    if (!causasData?.success) {
      return [];
    }

    return causasData.causas ?? [];
  }, [causasData]);

  const clienteKeys = useMemo(
    () => new Set((clientes || []).map((cliente) => cliente.id)),
    [clientes],
  );
  const areaKeys = useMemo(
    () => new Set((areas || []).map((area) => area.id)),
    [areas],
  );
  const causaOptionKeys = useMemo(
    () => new Set(causas.map((causa) => causa.id)),
    [causas],
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
  const selectedCausaKeys = useMemo(
    () =>
      (formData.causaIds ?? []).filter((causaId) =>
        causaOptionKeys.has(causaId),
      ),
    [causaOptionKeys, formData.causaIds],
  );
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
  const comarcaOptions = useMemo(
    () => {
      const baseOptions = comarcas.map((comarca) => ({
        key: comarca.id,
        label: comarca.label,
        textValue: [comarca.sigla || "", comarca.nome, comarca.label]
          .filter(Boolean)
          .join(" "),
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
        key: vara.id,
        label: vara.label,
        textValue: [vara.sigla || "", vara.nome, vara.label]
          .filter(Boolean)
          .join(" "),
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
  const assuntosSelecionadosResumo = useMemo(() => {
    const names = causas
      .filter((causa) => selectedCausaKeys.includes(causa.id))
      .map((causa) => causa.nome);

    return names.join(" • ");
  }, [causas, selectedCausaKeys]);
  const polos = useMemo(() => Object.values(ProcessoPolo), []);
  const canQuickCreateArea =
    isSuperAdmin || isAdmin || permissions.canManageOfficeSettings;
  const canQuickCreateCatalog =
    isSuperAdmin || isAdmin || permissions.canManageOfficeSettings;
  const selectedArea = useMemo(
    () => areas.find((area) => area.id === formData.areaId),
    [areas, formData.areaId],
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
      case ProcessoFase.ALEGACOES_FINAIS:
        return "Alegações finais";
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

  const grauDescription = `Instancia de tramitacao (1${String.fromCharCode(186)} grau, 2${String.fromCharCode(186)} grau ou tribunal superior).`;

  const formatGrauLabel = (grau: ProcessoGrau) => {
    switch (grau) {
      case ProcessoGrau.PRIMEIRO:
        return `1${String.fromCharCode(186)} Grau`;
      case ProcessoGrau.SEGUNDO:
        return `2${String.fromCharCode(186)} Grau`;
      case ProcessoGrau.SUPERIOR:
        return "Tribunal Superior";
      default:
        return grau;
    }
  };

  useEffect(() => {
    if (!formData.tribunalId || formData.comarca?.trim() || comarcas.length === 0) {
      return;
    }

    const autoridadeSelecionada = juizesDoFormulario.find(
      (juiz) => juiz.id === formData.juizId,
    );
    const autoSelectedComarca = resolveAutoSelectedJudicialLocation(comarcas, [
      autoridadeSelecionada?.comarca,
      formData.orgaoJulgador,
    ]);

    if (!autoSelectedComarca) {
      return;
    }

    setFormData((prev) => {
      if (prev.comarca?.trim()) {
        return prev;
      }

      return {
        ...prev,
        comarca: autoSelectedComarca.label,
        vara: "",
      };
    });
  }, [
    comarcas,
    formData.comarca,
    formData.juizId,
    formData.orgaoJulgador,
    formData.tribunalId,
    juizesDoFormulario,
  ]);

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

    if (
      doesAreaRequireProcedimento(selectedArea?.slug) &&
      !formData.procedimentoProcessual
    ) {
      toast.error("Selecione o rito / procedimento compatível com a área");

      return;
    }

    const partesIniciais = (formData.partesIniciais ?? []).map((parte) => ({
      tipoPolo: parte.tipoPolo,
      nome: (parte.nome ?? "").trim(),
    }));
    const parteSemNomeIndex = partesIniciais.findIndex((parte) => !parte.nome);

    if (parteSemNomeIndex !== -1) {
      toast.error(
        `Informe o nome da parte adicional ${parteSemNomeIndex + 1}`,
      );

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
      payload.causaIds = selectedCausaKeys;
      if (formData.procedimentoProcessual)
        payload.procedimentoProcessual = formData.procedimentoProcessual;
      if (formData.vara?.trim()) payload.vara = formData.vara.trim();
      if (formData.comarca?.trim()) payload.comarca = formData.comarca.trim();
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
      if (partesIniciais.length > 0) payload.partesIniciais = partesIniciais;
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

            <div className="space-y-3 rounded-lg border border-default-200 bg-default-50/60 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-default-700">
                    Partes adicionais do processo
                  </h4>
                  <p className="text-xs text-default-500">
                    Cadastre reus, reclamados, autores extras e outras partes ja
                    no primeiro cadastro.
                  </p>
                </div>
                <Button
                  color="secondary"
                  size="sm"
                  startContent={<Plus className="h-4 w-4" />}
                  variant="flat"
                  onPress={() =>
                    setFormData((prev) => ({
                      ...prev,
                      partesIniciais: [
                        ...(prev.partesIniciais ?? []),
                        { ...INITIAL_PARTE_ADICIONAL },
                      ],
                    }))
                  }
                >
                  Adicionar parte
                </Button>
              </div>

              {(formData.partesIniciais ?? []).length > 0 ? (
                <div className="space-y-3">
                  {(formData.partesIniciais ?? []).map((parte, index) => (
                    <div
                      key={`${parte.tipoPolo}-${index}`}
                      className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)_auto]"
                    >
                      <Select
                        label={`Tipo da parte ${index + 1}`}
                        selectedKeys={[parte.tipoPolo]}
                        onSelectionChange={(keys) => {
                          const key = Array.from(keys)[0] as
                            | ProcessoPolo
                            | undefined;

                          setFormData((prev) => ({
                            ...prev,
                            partesIniciais: (prev.partesIniciais ?? []).map(
                              (item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      tipoPolo: key ?? item.tipoPolo,
                                    }
                                  : item,
                            ),
                          }));
                        }}
                      >
                        {polos.map((polo) => (
                          <SelectItem key={polo} textValue={polo}>
                            {polo}
                          </SelectItem>
                        ))}
                      </Select>

                      <Input
                        isRequired
                        label={`Nome da parte ${index + 1}`}
                        placeholder="Nome completo da parte"
                        value={parte.nome}
                        onValueChange={(value) =>
                          setFormData((prev) => ({
                            ...prev,
                            partesIniciais: (prev.partesIniciais ?? []).map(
                              (item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, nome: value }
                                  : item,
                            ),
                          }))
                        }
                      />

                      <div className="flex items-end">
                        <Button
                          isIconOnly
                          aria-label={`Remover parte adicional ${index + 1}`}
                          color="danger"
                          variant="light"
                          onPress={() =>
                            setFormData((prev) => ({
                              ...prev,
                              partesIniciais: (prev.partesIniciais ?? []).filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            }))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-default-500">
                  Use este bloco quando o processo tiver mais de uma parte alem
                  dos clientes vinculados.
                </p>
              )}
            </div>

            <SearchableSelect
              isRequired
              description="Selecione a autoridade do caso para histórico, estratégia e acompanhamento do processo."
              emptyContent="Nenhuma autoridade encontrada"
              items={juizOptions}
              isLoading={isLoadingJuizes}
              label="Autoridade do caso *"
              placeholder="Selecione a autoridade responsável pelo caso"
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
                Não encontrou a autoridade? Cadastre agora
              </Button>
            </div>

            <SearchableSelect
              description="Tribunal de referência do processo e da autoridade do caso."
              emptyContent="Nenhum tribunal encontrado"
              items={tribunalOptions}
              isLoading={isLoadingTribunais}
              isRequired
              isVirtualized={false}
              label="Tribunal do caso *"
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

            </div>

              <ProcessClassificationSection
                areas={areas}
                canQuickCreateArea={canQuickCreateArea}
                canQuickCreateCatalog={canQuickCreateCatalog}
                causas={causas}
                classProcessualOptions={classProcessualOptions}
                fases={fases}
                getFaseLabel={getFaseLabel}
                grauDescription={grauDescription}
                graus={graus}
                isLoadingAreas={isLoadingAreas}
                isLoadingCausas={isLoadingCausas}
                isLoadingClassesProcessuais={isLoadingClassesProcessuais}
                isLoadingTribunais={isLoadingTribunais}
                tribunalOptions={tribunalOptions}
                value={formData}
                formatGrauLabel={formatGrauLabel}
                onOpenAreaModal={() => setIsAreaModalOpen(true)}
                onOpenCauseModal={() => setIsCauseModalOpen(true)}
                onOpenClassModal={() => setIsClassModalOpen(true)}
                onPatch={(patch) =>
                  setFormData((prev) => ({
                    ...prev,
                    ...patch,
                  }))
                }
              />
          </div>

          <Divider />

          {/* Seção: Localização */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-default-600">
              📍 Localização
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <SearchableSelect
                description="Comarca ou seção judiciária vinculada ao tribunal selecionado."
                emptyContent="Nenhuma comarca encontrada"
                isDisabled={!formData.tribunalId}
                isLoading={isLoadingComarcas}
                items={comarcaOptions}
                label="Comarca / Seção"
                placeholder="Digite para buscar a comarca ou seção"
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
            </div>

            <SearchableSelect
              description={
                isLoadingVaras
                  ? "Carregando varas da comarca ou seção selecionada."
                  : "Vara ou juizado disponível para a comarca selecionada."
              }
              emptyContent={
                isLoadingVaras ? "Carregando varas..." : "Nenhuma vara encontrada"
              }
              isDisabled={
                !formData.tribunalId || !formData.comarca || isLoadingVaras
              }
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
      <ProcessClassQuickCreateModal
        isOpen={isClassModalOpen}
        onClose={() => setIsClassModalOpen(false)}
        onCreated={async (classe) => {
          await mutateClassesProcessuais();
          setFormData((prev) => ({
            ...prev,
            classeProcessual: classe.nome,
          }));
          setIsClassModalOpen(false);
        }}
      />
      <ProcessCauseQuickCreateModal
        isOpen={isCauseModalOpen}
        onClose={() => setIsCauseModalOpen(false)}
        onCreated={async (causa) => {
          await mutateCausas();
          setFormData((prev) => {
            const nextIds = Array.from(
              new Set([...(prev.causaIds ?? []), causa.id]),
            );

            return {
              ...prev,
              causaIds: nextIds,
            };
          });
          setIsCauseModalOpen(false);
        }}
      />
      <ProcessAreaQuickCreateModal
        isOpen={isAreaModalOpen}
        onClose={() => setIsAreaModalOpen(false)}
        onCreated={async (area) => {
          await mutateAreas();
          setFormData((prev) => ({
            ...prev,
            areaId: area.id,
          }));
          setIsAreaModalOpen(false);
        }}
      />
    </div>
  );
}
