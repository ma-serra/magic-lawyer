"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Skeleton,
  Switch,
  useDisclosure,
} from "@heroui/react";
import {
  Building2,
  Globe,
  Landmark,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/toast";

import {
  createTribunal,
  deleteTribunal,
  listTribunais,
  updateTribunal,
} from "@/app/actions/tribunais";
import { getEstadosBrasilCached } from "@/lib/api/brazil-states";
import { PeopleMetricCard, PeoplePageHeader } from "@/components/people-ui";

type TribunalItem = {
  id: string;
  tenantId?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  isGlobal?: boolean;
  isOwnedByTenant?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  nome: string;
  sigla?: string | null;
  esfera?: string | null;
  uf?: string | null;
  siteUrl?: string | null;
  _count?: {
    processos?: number;
    juizes?: number;
  };
};

type EstadoBrasil = {
  sigla: string;
  nome: string;
};

const ESFERAS = [
  { key: "Federal", label: "Federal" },
  { key: "Estadual", label: "Estadual" },
  { key: "Municipal", label: "Municipal" },
] as const;

function toSingleSelectionValue(selection: "all" | Set<React.Key>) {
  if (selection === "all") return "";

  const key = Array.from(selection)[0];
  return typeof key === "string" ? key : "";
}

function normalizeUrl(value: string) {
  if (!value.trim()) return "";

  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function formatDateTimeBrasilia(value?: string | Date | null) {
  if (!value) return "Não informado";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Não informado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default function TribunaisPage() {
  const [search, setSearch] = useState("");
  const [filtroUf, setFiltroUf] = useState("");
  const [filtroEsfera, setFiltroEsfera] = useState("");
  const [apenasVinculados, setApenasVinculados] = useState(false);
  const [tribunalSelecionado, setTribunalSelecionado] =
    useState<TribunalItem | null>(null);
  const [tribunalDetalhe, setTribunalDetalhe] = useState<TribunalItem | null>(
    null,
  );
  const [formData, setFormData] = useState({
    nome: "",
    sigla: "",
    esfera: "",
    uf: "",
    siteUrl: "",
  });
  const [salvando, setSalvando] = useState(false);

  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();
  const {
    isOpen: isDetalhesOpen,
    onOpen: onDetalhesOpen,
    onOpenChange: onDetalhesOpenChange,
    onClose: onDetalhesClose,
  } = useDisclosure();

  const { data, isLoading, isValidating, mutate } = useSWR(
    "configuracoes-tribunais-list",
    () => listTribunais(),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    },
  );
  const { data: estadosData } = useSWR("estados-brasil", () =>
    getEstadosBrasilCached(),
  );

  const tribunais = useMemo<TribunalItem[]>(
    () => (data?.success ? ((data.tribunais as TribunalItem[]) ?? []) : []),
    [data],
  );
  const estados = useMemo<EstadoBrasil[]>(
    () => ((estadosData as EstadoBrasil[] | undefined) ?? []).slice(),
    [estadosData],
  );

  const errorMessage =
    data && !data.success ? (data.error ?? "Erro ao carregar tribunais") : null;

  const filteredTribunais = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return tribunais.filter((tribunal) => {
      if (filtroUf && tribunal.uf !== filtroUf) return false;
      if (filtroEsfera && tribunal.esfera !== filtroEsfera) return false;

      const totalVinculos =
        (tribunal._count?.processos ?? 0) + (tribunal._count?.juizes ?? 0);
      if (apenasVinculados && totalVinculos === 0) return false;

      if (!normalizedSearch) return true;

      const haystack = [
        tribunal.nome,
        tribunal.sigla ?? "",
        tribunal.esfera ?? "",
        tribunal.uf ?? "",
        tribunal.siteUrl ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [apenasVinculados, filtroEsfera, filtroUf, search, tribunais]);

  const totalComSite = useMemo(
    () => filteredTribunais.filter((item) => !!item.siteUrl).length,
    [filteredTribunais],
  );
  const totalComVinculos = useMemo(
    () =>
      filteredTribunais.filter(
        (item) => (item._count?.processos ?? 0) + (item._count?.juizes ?? 0) > 0,
      ).length,
    [filteredTribunais],
  );
  const totalGlobais = useMemo(
    () => filteredTribunais.filter((item) => !item.tenantId).length,
    [filteredTribunais],
  );
  const ultimaAtualizacaoOficial = useMemo(() => {
    let lastTimestamp = 0;

    for (const tribunal of tribunais) {
      if (!tribunal.updatedAt) continue;

      const timestamp = new Date(tribunal.updatedAt).getTime();
      if (Number.isFinite(timestamp) && timestamp > lastTimestamp) {
        lastTimestamp = timestamp;
      }
    }

    if (!lastTimestamp) {
      return null;
    }

    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(lastTimestamp));
  }, [tribunais]);

  const ufFilterSelectedKeys = useMemo(() => {
    if (!filtroUf || !estados.some((estado) => estado.sigla === filtroUf)) {
      return [];
    }
    return [filtroUf];
  }, [estados, filtroUf]);

  const esferaFilterSelectedKeys = useMemo(() => {
    if (!filtroEsfera || !ESFERAS.some((item) => item.key === filtroEsfera)) {
      return [];
    }
    return [filtroEsfera];
  }, [filtroEsfera]);

  const formUfSelectedKeys = useMemo(() => {
    if (!formData.uf || !estados.some((estado) => estado.sigla === formData.uf)) {
      return [];
    }
    return [formData.uf];
  }, [estados, formData.uf]);

  const formEsferaSelectedKeys = useMemo(() => {
    if (
      !formData.esfera ||
      !ESFERAS.some((item) => item.key === formData.esfera)
    ) {
      return [];
    }
    return [formData.esfera];
  }, [formData.esfera]);

  const openNewModal = useCallback(() => {
    setTribunalSelecionado(null);
    setFormData({
      nome: "",
      sigla: "",
      esfera: "",
      uf: "",
      siteUrl: "",
    });
    onOpen();
  }, [onOpen]);

  const openEditModal = useCallback(
    (tribunal: TribunalItem) => {
      setTribunalSelecionado(tribunal);
      setFormData({
        nome: tribunal.nome ?? "",
        sigla: tribunal.sigla ?? "",
        esfera: tribunal.esfera ?? "",
        uf: tribunal.uf ?? "",
        siteUrl: tribunal.siteUrl ?? "",
      });
      onOpen();
    },
    [onOpen],
  );

  const openDetalhesModal = useCallback(
    (tribunal: TribunalItem) => {
      setTribunalDetalhe(tribunal);
      onDetalhesOpen();
    },
    [onDetalhesOpen],
  );

  const clearFilters = useCallback(() => {
    setSearch("");
    setFiltroUf("");
    setFiltroEsfera("");
    setApenasVinculados(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!formData.nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }

    setSalvando(true);
    try {
      const payload = {
        nome: formData.nome.trim(),
        sigla: formData.sigla.trim() || null,
        esfera: formData.esfera || null,
        uf: formData.uf || null,
        siteUrl: normalizeUrl(formData.siteUrl) || null,
      };

      const result = tribunalSelecionado
        ? await updateTribunal(tribunalSelecionado.id, payload)
        : await createTribunal(payload);

      if (!result.success) {
        toast.error(result.error || "Não foi possível salvar o tribunal");
        return;
      }

      toast.success(
        tribunalSelecionado
          ? "Tribunal atualizado com sucesso."
          : "Tribunal criado com sucesso.",
      );
      await mutate();
      onClose();
    } catch (error) {
      toast.error("Erro inesperado ao salvar tribunal");
    } finally {
      setSalvando(false);
    }
  }, [formData, mutate, onClose, tribunalSelecionado]);

  const handleDelete = useCallback(
    async (tribunal: TribunalItem) => {
      const confirmDelete = window.confirm(
        `Excluir tribunal "${tribunal.nome}"? Esta ação não pode ser desfeita.`,
      );
      if (!confirmDelete) return;

      const result = await deleteTribunal(tribunal.id);
      if (!result.success) {
        toast.error(result.error || "Não foi possível excluir o tribunal");
        return;
      }

      toast.success("Tribunal excluído com sucesso.");
      await mutate();
    },
    [mutate],
  );

  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-3 py-8 sm:px-6">
      <PeoplePageHeader
        tag="Administração"
        title="Tribunais"
        description="Catálogo de tribunais do escritório para padronizar processos, juízes e integrações."
        actions={
          <Button
            color="primary"
            radius="full"
            startContent={<Plus className="h-4 w-4" />}
            onPress={openNewModal}
          >
            Novo tribunal
          </Button>
        }
      />
      <p className="text-xs text-default-500">
        {ultimaAtualizacaoOficial
          ? `Atualizado por último às ${ultimaAtualizacaoOficial} (horário oficial de Brasília), com base em fontes oficiais.`
          : "Aguardando primeira atualização oficial em horário de Brasília."}
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PeopleMetricCard
          helper="Tribunais no resultado atual"
          icon={<Landmark className="h-4 w-4" />}
          label="Tribunais"
          tone="primary"
          value={filteredTribunais.length}
        />
        <PeopleMetricCard
          helper="Com portal oficial cadastrado"
          icon={<Globe className="h-4 w-4" />}
          label="Com site"
          tone="success"
          value={totalComSite}
        />
        <PeopleMetricCard
          helper="Usados em processos ou juízes"
          icon={<Building2 className="h-4 w-4" />}
          label="Com vínculo"
          tone="warning"
          value={totalComVinculos}
        />
        <PeopleMetricCard
          helper="Itens compartilhados do catálogo"
          icon={<MapPin className="h-4 w-4" />}
          label="Globais"
          tone="secondary"
          value={totalGlobais}
        />
      </div>

      <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Filtros</p>
            <p className="text-xs text-default-400">
              Localize tribunais por nome, sigla, esfera e UF.
            </p>
          </div>
          <Button
            isDisabled={!search && !filtroUf && !filtroEsfera && !apenasVinculados}
            size="sm"
            variant="light"
            onPress={clearFilters}
          >
            Limpar filtros
          </Button>
        </CardHeader>
        <CardBody className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          <Input
            placeholder="Buscar por nome, sigla ou site"
            startContent={<Search className="h-4 w-4 text-default-400" />}
            value={search}
            variant="bordered"
            onValueChange={setSearch}
          />
          <Select
            disallowEmptySelection={false}
            placeholder="UF"
            selectedKeys={ufFilterSelectedKeys}
            variant="bordered"
            onSelectionChange={(selection) =>
              setFiltroUf(toSingleSelectionValue(selection as "all" | Set<React.Key>))
            }
          >
            {estados.map((estado) => (
              <SelectItem
                key={estado.sigla}
                textValue={`${estado.sigla} - ${estado.nome}`}
              >
                {estado.sigla} - {estado.nome}
              </SelectItem>
            ))}
          </Select>
          <Select
            disallowEmptySelection={false}
            placeholder="Esfera"
            selectedKeys={esferaFilterSelectedKeys}
            variant="bordered"
            onSelectionChange={(selection) =>
              setFiltroEsfera(
                toSingleSelectionValue(selection as "all" | Set<React.Key>),
              )
            }
          >
            {ESFERAS.map((esfera) => (
              <SelectItem key={esfera.key} textValue={esfera.label}>
                {esfera.label}
              </SelectItem>
            ))}
          </Select>
          <div className="flex items-center rounded-xl border border-white/10 px-3">
            <Switch
              isSelected={apenasVinculados}
              size="sm"
              onValueChange={setApenasVinculados}
            >
              Apenas com vínculos
            </Switch>
          </div>
        </CardBody>
      </Card>

      {errorMessage ? (
        <Card className="border border-danger/20 bg-danger/10">
          <CardBody className="space-y-3 p-4">
            <p className="text-sm text-danger">{errorMessage}</p>
            <div>
              <Button color="danger" size="sm" variant="flat" onPress={() => mutate()}>
                Tentar novamente
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoading
          ? Array.from({ length: 6 }).map((_, index) => (
              <Card
                key={`tribunais-skeleton-${index}`}
                className="border border-white/10 bg-background/70"
              >
                <CardBody>
                  <Skeleton className="h-40 w-full rounded-xl" />
                </CardBody>
              </Card>
            ))
          : filteredTribunais.map((tribunal) => {
              const totalProcessos = tribunal._count?.processos ?? 0;
              const totalJuizes = tribunal._count?.juizes ?? 0;
              const isGlobal = tribunal.isGlobal ?? !tribunal.tenantId;
              const canEdit = Boolean(tribunal.canEdit);
              const canDelete = Boolean(tribunal.canDelete);
              const originLabel = isGlobal
                ? "Global"
                : tribunal.isOwnedByTenant
                  ? "Seu escritório"
                  : "Outro escritório";

              return (
                <Card
                  key={tribunal.id}
                  className="border border-white/10 bg-background/70 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-lg hover:shadow-primary/15"
                >
                  <CardBody className="space-y-4 p-4 sm:p-5">
                    <button
                      className="w-full space-y-4 rounded-xl text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                      type="button"
                      onClick={() => openDetalhesModal(tribunal)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {tribunal.nome}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-default-500">
                            {tribunal.sigla ? <span>{tribunal.sigla}</span> : null}
                            {tribunal.esfera ? <span>• {tribunal.esfera}</span> : null}
                            {tribunal.uf ? <span>• {tribunal.uf}</span> : null}
                          </div>
                        </div>
                        <Chip
                          color={isGlobal ? "secondary" : "primary"}
                          size="sm"
                          variant="flat"
                        >
                          {originLabel}
                        </Chip>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-lg border border-white/10 p-2">
                          <p className="text-default-500">Processos</p>
                          <p className="font-semibold text-foreground">{totalProcessos}</p>
                        </div>
                        <div className="rounded-lg border border-white/10 p-2">
                          <p className="text-default-500">Juízes</p>
                          <p className="font-semibold text-foreground">{totalJuizes}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-default-500">
                          {tribunal.siteUrl
                            ? "Portal oficial cadastrado"
                            : "Sem fonte oficial informada"}
                        </p>
                        <p className="text-xs text-primary">Clique para ver detalhes</p>
                      </div>
                    </button>

                    <div className="flex items-center justify-end gap-2 border-t border-white/10 pt-2">
                      <Button
                        isIconOnly
                        aria-label={`Editar ${tribunal.nome}`}
                        isDisabled={!canEdit}
                        size="sm"
                        variant="flat"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!canEdit) return;
                          openEditModal(tribunal);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        isIconOnly
                        aria-label={`Excluir ${tribunal.nome}`}
                        color="danger"
                        isDisabled={!canDelete}
                        size="sm"
                        variant="flat"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!canDelete) return;
                          handleDelete(tribunal);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
      </div>

      {!isLoading && filteredTribunais.length === 0 ? (
        <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
          <CardBody className="py-10 text-center">
            <p className="text-base font-semibold text-foreground">
              Nenhum tribunal encontrado
            </p>
            <p className="mt-1 text-sm text-default-400">
              Ajuste os filtros ou cadastre um novo tribunal para o escritório.
            </p>
          </CardBody>
        </Card>
      ) : null}

      <Modal isOpen={isDetalhesOpen} size="xl" onOpenChange={onDetalhesOpenChange}>
        <ModalContent>
          <ModalHeader>Detalhes do tribunal</ModalHeader>
          <ModalBody>
            {tribunalDetalhe ? (
              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="text-base font-semibold">{tribunalDetalhe.nome}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-default-500">
                    {tribunalDetalhe.sigla ? <span>{tribunalDetalhe.sigla}</span> : null}
                    {tribunalDetalhe.esfera ? <span>• {tribunalDetalhe.esfera}</span> : null}
                    {tribunalDetalhe.uf ? <span>• {tribunalDetalhe.uf}</span> : null}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-white/10 p-2">
                    <p className="text-default-500">Processos vinculados</p>
                    <p className="font-semibold text-foreground">
                      {tribunalDetalhe._count?.processos ?? 0}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 p-2">
                    <p className="text-default-500">Juízes vinculados</p>
                    <p className="font-semibold text-foreground">
                      {tribunalDetalhe._count?.juizes ?? 0}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Chip
                    color={tribunalDetalhe.isGlobal ? "secondary" : "primary"}
                    size="sm"
                    variant="flat"
                  >
                    {tribunalDetalhe.isGlobal ? "Catálogo global" : "Seu escritório"}
                  </Chip>
                </div>

                <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                  <div className="rounded-lg border border-white/10 p-3">
                    <p className="text-default-500">Sigla</p>
                    <p className="font-semibold text-foreground">
                      {tribunalDetalhe.sigla || "Não informado"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 p-3">
                    <p className="text-default-500">Esfera</p>
                    <p className="font-semibold text-foreground">
                      {tribunalDetalhe.esfera || "Não informado"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 p-3">
                    <p className="text-default-500">UF</p>
                    <p className="font-semibold text-foreground">
                      {tribunalDetalhe.uf || "Não informado"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 p-3">
                    <p className="text-default-500">Portal oficial</p>
                    <p className="font-semibold text-foreground">
                      {tribunalDetalhe.siteUrl ? "Cadastrado" : "Não informado"}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                  <div className="rounded-lg border border-white/10 p-3">
                    <p className="text-default-500">Criado em</p>
                    <p className="font-semibold text-foreground">
                      {formatDateTimeBrasilia(tribunalDetalhe.createdAt)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 p-3">
                    <p className="text-default-500">Atualizado em</p>
                    <p className="font-semibold text-foreground">
                      {formatDateTimeBrasilia(tribunalDetalhe.updatedAt)}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onDetalhesClose}>
              Fechar
            </Button>
            {tribunalDetalhe?.canEdit ? (
              <Button
                color="primary"
                onPress={() => {
                  if (!tribunalDetalhe) return;
                  onDetalhesClose();
                  openEditModal(tribunalDetalhe);
                }}
              >
                Editar
              </Button>
            ) : null}
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={isOpen} size="lg" onOpenChange={onOpenChange}>
        <ModalContent>
          <ModalHeader>
            {tribunalSelecionado ? "Editar tribunal" : "Novo tribunal"}
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                isRequired
                label="Nome do tribunal"
                placeholder="Ex.: Tribunal de Justiça da Bahia"
                value={formData.nome}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, nome: event.target.value }))
                }
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Sigla"
                  placeholder="Ex.: TJBA"
                  value={formData.sigla}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, sigla: event.target.value }))
                  }
                />
                <Select
                  disallowEmptySelection={false}
                  label="UF"
                  placeholder="Selecione a UF"
                  selectedKeys={formUfSelectedKeys}
                  onSelectionChange={(selection) =>
                    setFormData((prev) => ({
                      ...prev,
                      uf: toSingleSelectionValue(
                        selection as "all" | Set<React.Key>,
                      ),
                    }))
                  }
                >
                  {estados.map((estado) => (
                    <SelectItem
                      key={estado.sigla}
                      textValue={`${estado.sigla} - ${estado.nome}`}
                    >
                      {estado.sigla} - {estado.nome}
                    </SelectItem>
                  ))}
                </Select>
              </div>

              <Select
                disallowEmptySelection={false}
                label="Esfera"
                placeholder="Federal, Estadual ou Municipal"
                selectedKeys={formEsferaSelectedKeys}
                onSelectionChange={(selection) =>
                  setFormData((prev) => ({
                    ...prev,
                    esfera: toSingleSelectionValue(
                      selection as "all" | Set<React.Key>,
                    ),
                  }))
                }
              >
                {ESFERAS.map((esfera) => (
                  <SelectItem key={esfera.key} textValue={esfera.label}>
                    {esfera.label}
                  </SelectItem>
                ))}
              </Select>

              <Input
                label="Site oficial"
                placeholder="https://www.tjba.jus.br"
                type="url"
                value={formData.siteUrl}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, siteUrl: event.target.value }))
                }
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClose}>
              Cancelar
            </Button>
            <Button color="primary" isLoading={salvando} onPress={handleSave}>
              {tribunalSelecionado ? "Salvar alterações" : "Criar tribunal"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {isValidating ? (
        <div className="text-right text-xs text-default-500">Sincronizando lista...</div>
      ) : null}
    </section>
  );
}
