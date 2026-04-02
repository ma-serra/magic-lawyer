"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  listComarcasPorTribunal,
  listTribunaisParaVinculo,
  listVarasPorTribunal,
} from "@/app/actions/tribunais";
import { listClassesProcessuais } from "@/app/actions/classes-processuais";
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
import { AuthorityQuickCreateModal } from "@/components/processos/authority-quick-create-modal";
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

export default function EditarProcessoPage() {
  const params = useParams();
  const router = useRouter();
  const processoId = params.processoId as string;

  const { processo, isLoading, isError, mutate } =
    useProcessoDetalhado(processoId);
  const { clientes, isLoading: isLoadingClientes } = useClientesParaSelect();
  const { advogados, isLoading: isLoadingAdvogados } = useAdvogadosParaSelect();
  const {
    juizes: juizesDisponiveis,
    isLoading: isLoadingJuizes,
    mutate: mutateJuizes,
  } = useJuizes();
  const [formData, setFormData] = useState<ProcessoCreateInput | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isAuthorityModalOpen, setIsAuthorityModalOpen] = useState(false);
  const [inlineJuizes, setInlineJuizes] = useState<JuizSerializado[]>([]);
  const [redirectTo, setRedirectTo] = useState<string | null>(null);
  const { data: areasData, isLoading: isLoadingAreas } = useSWR(
    "areas-processo-select",
    () => listAreasProcesso({ ativo: true }),
  );
  const { data: tribunaisData, isLoading: isLoadingTribunais } = useSWR(
    "tribunais-vinculo-processos-editar",
    () => listTribunaisParaVinculo(),
  );
  const { data: comarcasData, isLoading: isLoadingComarcas } = useSWR(
    formData?.tribunalId
      ? ["comarcas-processo-editar", formData.tribunalId]
      : null,
    ([, tribunalId]) => listComarcasPorTribunal(tribunalId),
  );
  const { data: varasData, isLoading: isLoadingVaras } = useSWR(
    formData?.tribunalId
      ? ["varas-processo-editar", formData.tribunalId, formData.comarca || ""]
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

    const currentValue = formData?.classeProcessual?.trim();

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
        description: "Classe legada jÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ informada neste processo",
      },
      ...baseOptions,
    ];
  }, [classesProcessuais, formData?.classeProcessual]);
  const selectedClasseProcessualKey = useMemo(() => {
    const currentValue = formData?.classeProcessual?.trim();

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
  }, [classProcessualOptions, formData?.classeProcessual]);
  const advogadoKeys = useMemo(
    () => new Set((advogados || []).map((advogado) => advogado.id)),
    [advogados],
  );
  const tribunalKeys = useMemo(
    () => new Set((tribunais || []).map((tribunal) => tribunal.id)),
    [tribunais],
  );

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

  const juizKeys = useMemo(
    () => new Set(juizesDoFormulario.map((juiz) => juiz.id)),
    [juizesDoFormulario],
  );

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
          [juiz.vara, juiz.comarca].filter(Boolean).join(" ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ ") ||
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
          [tribunal.esfera, tribunal.uf].filter(Boolean).join(" ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ ") ||
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
      const currentValue = formData?.comarca?.trim();

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
    [comarcas, formData?.comarca],
  );
  const varaOptions = useMemo(
    () => {
      const baseOptions = varas.map((vara) => ({
        key: vara,
        label: vara,
        textValue: vara,
      }));
      const currentValue = formData?.vara?.trim();

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
    [formData?.vara, varas],
  );
  const selectedOrgaoJulgadorKey = useMemo(() => {
    const currentValue = formData?.orgaoJulgador?.trim();

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
  }, [formData?.orgaoJulgador, selectedTribunalKeys, tribunalOptions]);
  const selectedComarcaKey = useMemo(() => {
    const currentValue = formData?.comarca?.trim();

    if (!currentValue) {
      return null;
    }

    return comarcaOptions.find((item) => item.label === currentValue)?.key ?? null;
  }, [comarcaOptions, formData?.comarca]);
  const selectedVaraKey = useMemo(() => {
    const currentValue = formData?.vara?.trim();

    if (!currentValue) {
      return null;
    }

    return varaOptions.find((item) => item.label === currentValue)?.key ?? null;
  }, [formData?.vara, varaOptions]);

  useEffect(() => {
    if (!processo || formData) return;

    const clientesVinculadosIds = Array.isArray(processo.clientesVinculados)
      ? processo.clientesVinculados
          .map((cliente) => cliente?.id)
          .filter((clienteId): clienteId is string => Boolean(clienteId))
      : processo.cliente?.id
        ? [processo.cliente.id]
        : [];
    const advogadosResponsaveisIds = Array.isArray(
      processo.advogadosResponsaveis,
    )
      ? processo.advogadosResponsaveis
          .map((advogado) => advogado?.id)
          .filter((advogadoId): advogadoId is string => Boolean(advogadoId))
      : processo.advogadoResponsavel?.id
        ? [processo.advogadoResponsavel.id]
        : [];

    const mapped: ProcessoCreateInput = {
      numero: processo.numero,
      numeroCnj: processo.numeroCnj || "",
      titulo: processo.titulo || "",
      descricao: processo.descricao || "",
      status: processo.status,
      arquivamentoTipo: processo.arquivamentoTipo ?? null,
      classeProcessual: processo.classeProcessual || "",
      orgaoJulgador:
        processo.orgaoJulgador ||
        buildTribunalLabel(processo.tribunal || undefined),
      vara: processo.vara || "",
      comarca: processo.comarca || "",
      foro: processo.foro || "",
      rito: processo.rito || "",
      numeroInterno: processo.numeroInterno || "",
      pastaCompartilhadaUrl: processo.pastaCompartilhadaUrl || "",
      clienteId: processo.cliente.id,
      clienteIds: clientesVinculadosIds,
      segredoJustica: processo.segredoJustica,
      advogadoResponsavelId: processo.advogadoResponsavel?.id || "",
      advogadoResponsavelIds: advogadosResponsaveisIds,
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

  useEffect(() => {
    if (!redirectTo || typeof window === "undefined") {
      return;
    }

    window.location.replace(redirectTo);
  }, [redirectTo]);

  const getFaseLabel = (fase: ProcessoFase) => {
    switch (fase) {
      case ProcessoFase.PETICAO_INICIAL:
        return "PetiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o Inicial";
      case ProcessoFase.CITACAO:
        return "CitaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o";
      case ProcessoFase.INSTRUCAO:
        return "InstruÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o";
      case ProcessoFase.SENTENCA:
        return "SentenÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§a";
      case ProcessoFase.RECURSO:
        return "Recurso";
      case ProcessoFase.EXECUCAO:
        return "ExecuÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o";
      default:
        return fase;
    }
  };

  const getGrauLabel = (grau: ProcessoGrau) => {
    switch (grau) {
      case ProcessoGrau.PRIMEIRO:
        return "1ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âº Grau";
      case ProcessoGrau.SEGUNDO:
        return "2ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âº Grau";
      case ProcessoGrau.SUPERIOR:
        return "Tribunal Superior";
      default:
        return grau;
    }
  };

  const handleSubmit = async () => {
    if (!formData) return;

    if (!formData.numero.trim()) {
      toast.error("NÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºmero do processo ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â© obrigatÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³rio");

      return;
    }

    if (selectedClienteKeys.length === 0) {
      toast.error("Selecione pelo menos um cliente");

      return;
    }

    if (!formData.juizId) {
      toast.error("Selecione a autoridade do caso");

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
        const destino = `/processos/${processoId}`;

        toast.success("Processo atualizado com sucesso!");
        setRedirectTo(destino);
        router.replace(destino);
        router.refresh();
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
          NÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o foi possÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­vel carregar o processo
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
            Atualize as informaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµes do processo jurÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­dico
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
            Salvar alteraÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµes
          </Button>
        </div>
      </div>

      <Card className="border border-default-200">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">InformaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµes do Processo</h2>
          </div>
        </CardHeader>
        <Divider />
        <CardBody className="gap-6">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-default-600">
              ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¹ Dados BÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡sicos
            </h3>

            <Select
              description="Vincule um ou mais advogados responsÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡veis a este processo."
              items={advogadoOptions}
              isLoading={isLoadingAdvogados}
              label="Advogados responsÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡veis"
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
                label="NÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºmero do Processo *"
                placeholder="0000000-00.0000.0.00.0000"
                value={formData.numero}
                onValueChange={(value) =>
                  setFormData((prev) =>
                    prev ? { ...prev, numero: value } : prev,
                  )
                }
              />

              <Input
                description="Informe se houver diferenÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§a do nÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºmero principal"
                label="NÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºmero CNJ (oficial)"
                placeholder="0000000-00.0000.0.00.0000"
                value={formData.numeroCnj || ""}
                onValueChange={(value) =>
                  setFormData((prev) =>
                    prev ? { ...prev, numeroCnj: value } : prev,
                  )
                }
              />

              <Input
                description="CÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³digo interno para organizaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o do escritÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³rio (opcional)."
                label="NÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºmero Interno"
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
              label="TÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­tulo"
              placeholder="Ex: AÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o de Despejo, DivÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³rcio, etc."
              value={formData.titulo || ""}
              onValueChange={(value) =>
                setFormData((prev) =>
                  prev ? { ...prev, titulo: value } : prev,
                )
              }
            />

            <Textarea
              description="Resumo do contexto, estratÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©gia ou observaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµes importantes do caso."
              label="DescriÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o"
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
              ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ClassificaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o e Status
            </h3>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SearchableSelect
              description="Juiz responsÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡vel para rastrear padrÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o de decisÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµes e produtividade."
              emptyContent="Nenhuma autoridade encontrada"
              isLoading={isLoadingJuizes}
              isRequired
              items={juizOptions}
              label="Juiz do Caso *"
              placeholder="Selecione o juiz responsÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡vel pelo caso"
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
                color="secondary"
                size="sm"
                variant="light"
                onPress={() => setIsAuthorityModalOpen(true)}
              >
                Nao encontrou a autoridade? Cadastre agora
              </Button>
            </div>

            <SearchableSelect
              description="Tribunal onde o processo tramita."
              emptyContent="Nenhum tribunal encontrado"
              isLoading={isLoadingTribunais}
              isRequired
              isVirtualized={false}
              items={tribunalOptions}
              label="Tribunal *"
              placeholder="Selecione o tribunal"
              selectedKey={selectedTribunalKeys[0] ?? null}
              startContent={<Landmark className="h-4 w-4 text-default-400" />}
              onSelectionChange={(selectedKey) =>
                setFormData((prev) => {
                  if (!prev) {
                    return prev;
                  }

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

            <Select
              description="SituaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o atual do processo no escritÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³rio."
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

              <div className="space-y-2">
                <SearchableSelect
                  description="Classe processual padrao do escritorio. Configure o catalogo em Configuracoes."
                  emptyContent="Nenhuma classe processual cadastrada"
                  isClearable
                  isDisabled={!formData}
                  isLoading={isLoadingClassesProcessuais}
                  items={classProcessualOptions}
                  label="Classe Processual"
                  placeholder="Selecione uma classe processual"
                  selectedKey={selectedClasseProcessualKey}
                  onSelectionChange={(key) => {
                    setFormData((prev) =>
                      prev
                        ? {
                            ...prev,
                            classeProcessual:
                              classProcessualOptions.find(
                                (item) => item.key === key,
                              )?.label ?? undefined,
                          }
                        : prev,
                    );
                  }}
                />
                <div className="flex justify-end">
                  <Button
                    as={Link}
                    color="primary"
                    href="/configuracoes?tab=classes-processuais"
                    size="sm"
                    variant="light"
                  >
                    Gerenciar classes processuais
                  </Button>
                </div>
              </div>

              <Select
                description="ClassificaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o por ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡rea de atuaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o (opcional). Configure ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡reas em ConfiguraÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµes."
                isClearable
                isLoading={isLoadingAreas}
                label="ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Ârea do processo"
                placeholder="Selecione uma ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡rea"
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
                description="InstÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ncia de tramitaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o (1ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âº grau, 2ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âº grau ou tribunal superior)."
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
                setFormData((prev) =>
                  prev
                    ? {
                        ...prev,
                        orgaoJulgador:
                          tribunalOptions.find((item) => item.key === selectedKey)
                            ?.label || "",
                      }
                    : prev,
                )
              }
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                description="Procedimento aplicado ao caso (ordinario, sumario, especial etc.)."
                label="Rito"
                placeholder="Ex: Ordinario, Sumario"
                value={formData.rito || ""}
                onValueChange={(value) =>
                  setFormData((prev) =>
                    prev ? { ...prev, rito: value } : prev,
                  )
                }
              />

              <Input
                description="Valor economico da acao, quando houver."
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
              Localizacao
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

                  setFormData((prev) =>
                    prev
                      ? {
                          ...prev,
                          comarca: option?.label || "",
                          vara: "",
                        }
                      : prev,
                  );
                }}
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

            <SearchableSelect
              description="Vara ou juizado disponível para a comarca selecionada."
              emptyContent="Nenhuma vara encontrada"
              isDisabled={!formData.tribunalId || !formData.comarca}
              isLoading={isLoadingVaras}
              items={varaOptions}
              label="Vara"
              placeholder="Digite para buscar a vara"
              selectedKey={selectedVaraKey}
              onSelectionChange={(selectedKey) =>
                setFormData((prev) =>
                  prev
                    ? {
                        ...prev,
                        vara:
                          varaOptions.find((item) => item.key === selectedKey)
                            ?.label || "",
                      }
                    : prev,
                )
              }
            />
          </div>

          <Divider />

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-default-600">
              ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ Outras InformaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµes
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <DateInput
                description="Data oficial de distribuiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o do processo."
                label="Data de DistribuiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o"
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
                description="PrÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ximo prazo estratÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©gico para acompanhamento da equipe."
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
                  Segredo de JustiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§a
                </span>
                <span className="text-xs text-default-400">
                  Marque se este processo corre em segredo de justiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§a
                </span>
              </div>
            </Checkbox>
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
          setFormData((prev) =>
            prev
              ? {
                  ...prev,
                  juizId: juiz.id,
                }
              : prev,
          );
          await mutateJuizes();
          setIsAuthorityModalOpen(false);
        }}
      />
    </div>
  );
}

