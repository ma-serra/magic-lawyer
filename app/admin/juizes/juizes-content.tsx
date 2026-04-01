"use client";

import type {
  JuizAdminDetalhesSerializado,
  JuizSerializado,
} from "@/app/actions/juizes";

import { useMemo, useState } from "react";
import useSWR from "swr";
import NextLink from "next/link";
import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Divider } from "@heroui/divider";
import { Input } from "@heroui/input";
import { Chip } from "@heroui/chip";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/modal";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Select,
  SelectItem,
  Spinner,
} from "@heroui/react";
import {
  Scale,
  Search,
  Filter,
  Globe2,
  Star,
  BarChart3,
  MapPin,
  Briefcase,
  Eye,
  Building2,
  Boxes,
  Gavel,
  Wallet,
  Users2,
  FileSearch,
  Sparkles,
  CalendarDays,
} from "lucide-react";

import { getJuizAdminDetails, getJuizesAdmin } from "@/app/actions/juizes";
import {
  PeopleMetricCard,
  PeoplePageHeader,
  PeoplePanel,
} from "@/components/people-ui";

function formatCurrency(value: number | null) {
  if (!value) return "Gratuito";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDateTime(value: string | null) {
  if (!value) return "Nao informado";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Nao informado";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function formatDate(value: string | null) {
  if (!value) return "Nao informado";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Nao informado";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}

export function JuizesContent() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tipoFilter, setTipoFilter] = useState("all");
  const [escopoFilter, setEscopoFilter] = useState("all");
  const [selectedJuizId, setSelectedJuizId] = useState<string | null>(null);

  const { data, error, isLoading, mutate } = useSWR(
    "admin-juizes",
    () => getJuizesAdmin(),
    {
      revalidateOnFocus: false,
      refreshInterval: 0,
    },
  );

  const juizes: JuizSerializado[] = data?.data ?? [];

  const {
    data: juizDetalheResponse,
    error: juizDetalheError,
    isLoading: isLoadingJuizDetalhe,
    mutate: mutateJuizDetalhe,
  } = useSWR(
    selectedJuizId ? ["admin-juiz-detalhe", selectedJuizId] : null,
    ([, juizId]) => getJuizAdminDetails(juizId),
    {
      revalidateOnFocus: false,
      refreshInterval: 0,
    },
  );

  const juizDetalhe: JuizAdminDetalhesSerializado | null =
    juizDetalheResponse?.data ?? null;

  const resumo = useMemo(() => {
    const total = juizes.length;
    const globais = juizes.filter((juiz) => juiz.isPublico || juiz.isPremium).length;
    const promotores = juizes.filter(
      (juiz) => juiz.tipoAutoridade === "PROMOTOR",
    ).length;
    const processos = juizes.reduce(
      (sum, juiz) => sum + (juiz._count?.processos ?? 0),
      0,
    );

    return { total, globais, promotores, processos };
  }, [juizes]);

  const filteredJuizes = useMemo(() => {
    return juizes.filter((juiz) => {
      const matchesSearch = searchTerm
        ? [
            juiz.nome,
            juiz.nomeCompleto ?? "",
            juiz.comarca ?? "",
            juiz.vara ?? "",
          ]
            .join(" ")
            .toLowerCase()
            .includes(searchTerm.toLowerCase())
        : true;

      const matchesStatus =
        statusFilter === "all" ? true : juiz.status === statusFilter;

      const matchesTipo =
        tipoFilter === "all" ? true : juiz.tipoAutoridade === tipoFilter;

      const matchesEscopo =
        escopoFilter === "all"
          ? true
          : escopoFilter === "globais"
            ? juiz.isPublico || juiz.isPremium
            : escopoFilter === "premium"
              ? juiz.isPremium
              : escopoFilter === "publico"
                ? juiz.isPublico
                : !juiz.isPublico && !juiz.isPremium;

      return matchesSearch && matchesStatus && matchesTipo && matchesEscopo;
    });
  }, [juizes, searchTerm, statusFilter, tipoFilter, escopoFilter]);

  const errorMessage =
    error instanceof Error
      ? error.message
      : "Não foi possível carregar os juízes globais.";

  const detalheErrorMessage =
    juizDetalheError instanceof Error
      ? juizDetalheError.message
      : juizDetalheResponse?.error || "Nao foi possivel carregar os detalhes.";

  const juizSelecionadoResumo = useMemo(
    () => juizes.find((juiz) => juiz.id === selectedJuizId) ?? null,
    [juizes, selectedJuizId],
  );

  const hasActiveFilters =
    searchTerm.trim().length > 0 ||
    statusFilter !== "all" ||
    tipoFilter !== "all" ||
    escopoFilter !== "all";

  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 py-8 px-3 sm:px-6">
      <PeoplePageHeader
        description="Administre o catálogo global de juízes e promotores, além da base premium compartilhada entre escritórios."
        tag="Administracao"
        title="Catálogo Global de Autoridades"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PeopleMetricCard
          helper="Base total global"
          icon={<Scale className="h-4 w-4" />}
          label="Total de autoridades"
          tone="primary"
          value={resumo.total}
        />
        <PeopleMetricCard
          helper="Publicos + premium"
          icon={<Globe2 className="h-4 w-4" />}
          label="Perfis globais"
          tone="success"
          value={resumo.globais}
        />
        <PeopleMetricCard
          helper="Vínculos de Ministério Público"
          icon={<Star className="h-4 w-4" />}
          label="Promotores"
          tone="warning"
          value={resumo.promotores}
        />
        <PeopleMetricCard
          helper="Carga total da base"
          icon={<BarChart3 className="h-4 w-4" />}
          label="Processos mapeados"
          tone="secondary"
          value={resumo.processos}
        />
      </div>

      <PeoplePanel
        title="Filtros operacionais"
        description="Refine a visualização do catálogo por tipo, status e escopo de publicação."
        actions={
          <Button
            isDisabled={!hasActiveFilters}
            size="sm"
            startContent={<Filter className="h-4 w-4" />}
            variant="flat"
            onPress={() => {
              setSearchTerm("");
              setStatusFilter("all");
              setTipoFilter("all");
              setEscopoFilter("all");
            }}
          >
            Limpar filtros
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
          <Input
            className="lg:col-span-2"
            placeholder="Buscar por nome, vara ou comarca"
            startContent={<Search className="h-4 w-4 text-default-400" />}
            value={searchTerm}
            onValueChange={setSearchTerm}
          />

          <Select
            label="Status"
            selectedKeys={[statusFilter]}
            onSelectionChange={(keys) =>
              setStatusFilter(Array.from(keys)[0] as string)
            }
          >
            <SelectItem key="all" textValue="Todos">
              Todos
            </SelectItem>
            <SelectItem key="ATIVO" textValue="Ativo">
              Ativo
            </SelectItem>
            <SelectItem key="INATIVO" textValue="Inativo">
              Inativo
            </SelectItem>
            <SelectItem key="APOSENTADO" textValue="Aposentado">
              Aposentado
            </SelectItem>
            <SelectItem key="SUSPENSO" textValue="Suspenso">
              Suspenso
            </SelectItem>
          </Select>

          <Select
            label="Tipo"
            selectedKeys={[tipoFilter]}
            onSelectionChange={(keys) =>
              setTipoFilter(Array.from(keys)[0] as string)
            }
          >
            <SelectItem key="all" textValue="Todos">
              Todos
            </SelectItem>
            <SelectItem key="JUIZ" textValue="Juiz">
              Juiz
            </SelectItem>
            <SelectItem key="PROMOTOR" textValue="Promotor">
              Promotor
            </SelectItem>
          </Select>

          <Select
            label="Escopo"
            selectedKeys={[escopoFilter]}
            onSelectionChange={(keys) =>
              setEscopoFilter(Array.from(keys)[0] as string)
            }
          >
            <SelectItem key="all" textValue="Todos">
              Todos
            </SelectItem>
            <SelectItem key="globais" textValue="Globais">
              Globais
            </SelectItem>
            <SelectItem key="premium" textValue="Premium">
              Premium
            </SelectItem>
            <SelectItem key="publico" textValue="Públicos">
              Públicos
            </SelectItem>
            <SelectItem key="privado" textValue="Privados">
              Privados
            </SelectItem>
          </Select>
        </div>
      </PeoplePanel>

      <PeoplePanel
        title="Lista de autoridades"
        description={`${filteredJuizes.length} ${filteredJuizes.length === 1 ? "autoridade encontrada" : "autoridades encontradas"}`}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <Card className="border border-danger/40 bg-danger/5">
            <CardBody className="py-8 text-center">
              <p className="text-sm text-danger">{errorMessage}</p>
              <div className="mt-4">
                <Button size="sm" variant="flat" onPress={() => mutate()}>
                  Tentar novamente
                </Button>
              </div>
            </CardBody>
          </Card>
        ) : filteredJuizes.length === 0 ? (
          <Card className="border border-default-200/80 bg-content1/80 shadow-sm shadow-black/5 dark:border-white/10 dark:bg-background/55 dark:shadow-black/20">
            <CardBody className="py-10 text-center">
              <p className="text-sm text-default-400">
                Nenhuma autoridade corresponde aos filtros aplicados.
              </p>
            </CardBody>
          </Card>
        ) : (
          <>
            <div className="space-y-3 lg:hidden">
              {filteredJuizes.map((juiz) => (
                <Card
                  key={juiz.id}
                  className="border border-default-200/80 bg-content1/80 shadow-sm shadow-black/5 dark:border-white/10 dark:bg-background/55 dark:shadow-black/20"
                >
                  <CardBody className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{juiz.nome}</p>
                        {juiz.nomeCompleto ? (
                          <p className="text-xs text-default-400">{juiz.nomeCompleto}</p>
                        ) : null}
                      </div>
                      <Chip
                        color={juiz.tipoAutoridade === "PROMOTOR" ? "warning" : "primary"}
                        size="sm"
                        variant="flat"
                      >
                        {juiz.tipoAutoridade === "PROMOTOR" ? "Promotor" : "Juiz"}
                      </Chip>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Chip
                        color={juiz.status === "ATIVO" ? "success" : "default"}
                        size="sm"
                        variant="flat"
                      >
                        {juiz.status}
                      </Chip>
                      {juiz.isPublico ? (
                        <Chip color="success" size="sm" variant="flat">
                          Público
                        </Chip>
                      ) : null}
                      {juiz.isPremium ? (
                        <Chip color="warning" size="sm" variant="flat">
                          Premium
                        </Chip>
                      ) : null}
                      {!juiz.isPublico && !juiz.isPremium ? (
                        <Chip size="sm" variant="flat">
                          Privado
                        </Chip>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-primary/80">
                          Processos
                        </p>
                        <p className="text-base font-semibold text-foreground">
                          {juiz._count?.processos ?? 0}
                        </p>
                      </div>
                      <div className="rounded-lg border border-secondary/20 bg-secondary/5 px-2.5 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-secondary/80">
                          Preço
                        </p>
                        <p className="truncate text-sm font-semibold text-foreground">
                          {formatCurrency(juiz.precoAcesso)}
                        </p>
                      </div>
                    </div>

                    <p className="flex items-start gap-2 text-xs text-default-400">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                      <span>{juiz.comarca || "-"} · {juiz.vara || "-"}</span>
                    </p>

                    <div className="flex flex-wrap gap-1">
                      {juiz.especialidades.slice(0, 2).map((esp) => (
                        <Chip key={esp} color="primary" size="sm" variant="flat">
                          {esp.replace(/_/g, " ")}
                        </Chip>
                      ))}
                      {juiz.especialidades.length > 2 ? (
                        <Chip size="sm" variant="flat">
                          +{juiz.especialidades.length - 2}
                        </Chip>
                      ) : null}
                    </div>

                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        startContent={<Eye className="h-4 w-4" />}
                        variant="flat"
                        onPress={() => setSelectedJuizId(juiz.id)}
                      >
                        Ver detalhes
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <Table aria-label="Tabela de autoridades globais">
                <TableHeader>
                  <TableColumn>AUTORIDADE</TableColumn>
                  <TableColumn>TIPO</TableColumn>
                  <TableColumn>STATUS</TableColumn>
                  <TableColumn>ESCOPO</TableColumn>
                  <TableColumn>COMARCA / VARA</TableColumn>
                  <TableColumn>ESPECIALIDADES</TableColumn>
                  <TableColumn>PREÇO</TableColumn>
                  <TableColumn>PROCESSOS</TableColumn>
                  <TableColumn>AÇÕES</TableColumn>
                </TableHeader>
                <TableBody emptyContent="Nenhuma autoridade corresponde aos filtros aplicados.">
                  {filteredJuizes.map((juiz) => (
                    <TableRow key={juiz.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground">{juiz.nome}</span>
                          {juiz.nomeCompleto ? (
                            <span className="text-xs text-default-400">{juiz.nomeCompleto}</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Chip
                          color={
                            juiz.tipoAutoridade === "PROMOTOR" ? "warning" : "primary"
                          }
                          size="sm"
                          variant="flat"
                        >
                          {juiz.tipoAutoridade === "PROMOTOR" ? "Promotor" : "Juiz"}
                        </Chip>
                      </TableCell>
                      <TableCell>
                        <Chip
                          color={juiz.status === "ATIVO" ? "success" : "default"}
                          size="sm"
                          variant="flat"
                        >
                          {juiz.status}
                        </Chip>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {juiz.isPublico ? (
                            <Chip color="success" size="sm" variant="flat">
                              Público
                            </Chip>
                          ) : null}
                          {juiz.isPremium ? (
                            <Chip color="warning" size="sm" variant="flat">
                              Premium
                            </Chip>
                          ) : null}
                          {!juiz.isPublico && !juiz.isPremium ? (
                            <Chip size="sm" variant="flat">
                              Privado
                            </Chip>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm text-foreground">{juiz.comarca || "-"}</span>
                          <span className="text-xs text-default-400">{juiz.vara || "-"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {juiz.especialidades.slice(0, 2).map((esp) => (
                            <Chip key={esp} color="primary" size="sm" variant="flat">
                              {esp.replace(/_/g, " ")}
                            </Chip>
                          ))}
                          {juiz.especialidades.length > 2 ? (
                            <Chip size="sm" variant="flat">
                              +{juiz.especialidades.length - 2}
                            </Chip>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{formatCurrency(juiz.precoAcesso)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Briefcase className="h-3.5 w-3.5 text-default-400" />
                          {juiz._count?.processos ?? 0}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          startContent={<Eye className="h-4 w-4" />}
                          variant="flat"
                          onPress={() => setSelectedJuizId(juiz.id)}
                        >
                          Ver detalhes
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </PeoplePanel>

      <Modal
        backdrop="blur"
        isOpen={Boolean(selectedJuizId)}
        scrollBehavior="inside"
        size="5xl"
        onOpenChange={(open) => {
          if (!open) {
            setSelectedJuizId(null);
          }
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-2 border-b border-default-200/80 pb-4 dark:border-white/10">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                      Autoridade
                    </p>
                    <h3 className="text-xl font-semibold text-foreground">
                      {juizDetalhe?.nome ?? juizSelecionadoResumo?.nome ?? "Carregando detalhes"}
                    </h3>
                    <p className="text-sm text-default-400">
                      {juizDetalhe?.nomeCompleto ||
                        juizSelecionadoResumo?.nomeCompleto ||
                        "Relacoes comerciais, uso por tenants e citacoes em processos."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Chip
                      color={
                        (juizDetalhe?.tipoAutoridade ?? juizSelecionadoResumo?.tipoAutoridade) ===
                        "PROMOTOR"
                          ? "warning"
                          : "primary"
                      }
                      size="sm"
                      variant="flat"
                    >
                      {(juizDetalhe?.tipoAutoridade ?? juizSelecionadoResumo?.tipoAutoridade) ===
                      "PROMOTOR"
                        ? "Promotor"
                        : "Juiz"}
                    </Chip>
                    {juizDetalhe?.status ? (
                      <Chip
                        color={juizDetalhe.status === "ATIVO" ? "success" : "default"}
                        size="sm"
                        variant="flat"
                      >
                        {juizDetalhe.status}
                      </Chip>
                    ) : null}
                  </div>
                </div>
              </ModalHeader>

              <ModalBody className="space-y-6 py-6">
                {isLoadingJuizDetalhe && !juizDetalhe ? (
                  <div className="flex items-center justify-center py-16">
                    <Spinner size="lg" />
                  </div>
                ) : !juizDetalhe ? (
                  <Card className="border border-danger/40 bg-danger/5">
                    <CardBody className="space-y-4 py-8 text-center">
                      <p className="text-sm text-danger">{detalheErrorMessage}</p>
                      <div className="flex justify-center">
                        <Button size="sm" variant="flat" onPress={() => mutateJuizDetalhe()}>
                          Tentar novamente
                        </Button>
                      </div>
                    </CardBody>
                  </Card>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <PeopleMetricCard
                        helper="Tenants com qualquer relacao registrada"
                        icon={<Building2 className="h-4 w-4" />}
                        label="Tenants relacionados"
                        tone="primary"
                        value={juizDetalhe.resumoRelacionamentos.tenantsRelacionados}
                      />
                      <PeopleMetricCard
                        helper="Processos em que a autoridade foi citada"
                        icon={<Briefcase className="h-4 w-4" />}
                        label="Processos citados"
                        tone="success"
                        value={juizDetalhe.resumoRelacionamentos.processos}
                      />
                      <PeopleMetricCard
                        helper="Pacotes comerciais com esta autoridade"
                        icon={<Boxes className="h-4 w-4" />}
                        label="Pacotes relacionados"
                        tone="warning"
                        value={juizDetalhe.resumoRelacionamentos.pacotes}
                      />
                      <PeopleMetricCard
                        helper="Preco base de acesso ou venda avulsa"
                        icon={<Wallet className="h-4 w-4" />}
                        label="Valor de venda"
                        tone="secondary"
                        value={formatCurrency(juizDetalhe.precoAcesso)}
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                      <Card className="border border-default-200/80 bg-content1/80 shadow-sm shadow-black/5 dark:border-white/10 dark:bg-background/60 dark:shadow-black/20">
                        <CardBody className="space-y-3 p-4">
                          <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-primary" />
                            <h4 className="text-sm font-semibold text-foreground">
                              Origem do cadastro
                            </h4>
                          </div>
                          <div className="space-y-2 text-sm text-default-500">
                            <p>
                              <span className="font-medium text-foreground">Origem:</span>{" "}
                              {juizDetalhe.origemCadastro === "SUPER_ADMIN"
                                ? "Base global"
                                : juizDetalhe.origemCadastro === "TENANT"
                                  ? "Contribuicao de tenant"
                                  : "Nao identificada"}
                            </p>
                            <p>
                              <span className="font-medium text-foreground">Criador global:</span>{" "}
                              {juizDetalhe.superAdminCriador?.nome ?? "Nao informado"}
                            </p>
                            <p>
                              <span className="font-medium text-foreground">Tenant de origem:</span>{" "}
                              {juizDetalhe.primeiroTenantContribuinte ? (
                                <NextLink
                                  className="text-primary hover:underline"
                                  href={`/admin/tenants/${juizDetalhe.primeiroTenantContribuinte.id}`}
                                >
                                  {juizDetalhe.primeiroTenantContribuinte.nome}
                                </NextLink>
                              ) : (
                                "Nao informado"
                              )}
                            </p>
                            <p>
                              <span className="font-medium text-foreground">Primeiro envio:</span>{" "}
                              {formatDateTime(
                                juizDetalhe.primeiroTenantContribuinte?.criadoEm ?? null,
                              )}
                            </p>
                          </div>
                        </CardBody>
                      </Card>

                      <Card className="border border-default-200/80 bg-content1/80 shadow-sm shadow-black/5 dark:border-white/10 dark:bg-background/60 dark:shadow-black/20">
                        <CardBody className="space-y-3 p-4">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-primary" />
                            <h4 className="text-sm font-semibold text-foreground">
                              Identificacao institucional
                            </h4>
                          </div>
                          <div className="space-y-2 text-sm text-default-500">
                            <p>
                              <span className="font-medium text-foreground">Tribunal:</span>{" "}
                              {juizDetalhe.tribunal?.sigla || juizDetalhe.tribunal?.nome || "Nao informado"}
                            </p>
                            <p>
                              <span className="font-medium text-foreground">Comarca:</span>{" "}
                              {juizDetalhe.comarca || "Nao informada"}
                            </p>
                            <p>
                              <span className="font-medium text-foreground">Vara:</span>{" "}
                              {juizDetalhe.vara || "Nao informada"}
                            </p>
                            <p>
                              <span className="font-medium text-foreground">Especialidades:</span>{" "}
                              {juizDetalhe.especialidades.length > 0
                                ? juizDetalhe.especialidades
                                    .map((item) => item.replace(/_/g, " "))
                                    .join(", ")
                                : "Nao informadas"}
                            </p>
                          </div>
                        </CardBody>
                      </Card>

                      <Card className="border border-default-200/80 bg-content1/80 shadow-sm shadow-black/5 dark:border-white/10 dark:bg-background/60 dark:shadow-black/20">
                        <CardBody className="space-y-3 p-4">
                          <div className="flex items-center gap-2">
                            <Wallet className="h-4 w-4 text-primary" />
                            <h4 className="text-sm font-semibold text-foreground">
                              Comercial e uso
                            </h4>
                          </div>
                          <div className="space-y-2 text-sm text-default-500">
                            <p>
                              <span className="font-medium text-foreground">Preco de acesso:</span>{" "}
                              {formatCurrency(juizDetalhe.precoAcesso)}
                            </p>
                            <p>
                              <span className="font-medium text-foreground">Tenants com acesso:</span>{" "}
                              {juizDetalhe.resumoRelacionamentos.tenantsComAcesso}
                            </p>
                            <p>
                              <span className="font-medium text-foreground">Favoritos ativos:</span>{" "}
                              {juizDetalhe.resumoRelacionamentos.favoritos}
                            </p>
                            <p>
                              <span className="font-medium text-foreground">Acessos registrados:</span>{" "}
                              {juizDetalhe.resumoRelacionamentos.acessosRegistrados}
                            </p>
                          </div>
                        </CardBody>
                      </Card>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Users2 className="h-4 w-4 text-primary" />
                        <h4 className="text-base font-semibold text-foreground">
                          Tenants relacionados
                        </h4>
                      </div>
                      {juizDetalhe.tenantsRelacionadosDetalhados.length === 0 ? (
                        <Card className="border border-default-200/80 bg-content1/70 dark:border-white/10 dark:bg-background/50">
                          <CardBody className="py-6 text-sm text-default-400">
                            Nenhum tenant relacionado foi encontrado para esta autoridade.
                          </CardBody>
                        </Card>
                      ) : (
                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                          {juizDetalhe.tenantsRelacionadosDetalhados.map((tenant) => (
                            <Card
                              key={tenant.tenantId}
                              className="border border-default-200/80 bg-content1/80 shadow-sm shadow-black/5 dark:border-white/10 dark:bg-background/60 dark:shadow-black/20"
                            >
                              <CardBody className="space-y-3 p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-semibold text-foreground">
                                        {tenant.tenantNome}
                                      </p>
                                      {tenant.possuiAcesso ? (
                                        <Chip color="success" size="sm" variant="flat">
                                          Com acesso
                                        </Chip>
                                      ) : null}
                                    </div>
                                    <p className="text-xs text-default-400">
                                      Status do tenant: {tenant.tenantStatus}
                                    </p>
                                  </div>
                                  <Button
                                    as={NextLink}
                                    href={`/admin/tenants/${tenant.tenantId}`}
                                    size="sm"
                                    variant="flat"
                                  >
                                    Abrir tenant
                                  </Button>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-sm">
                                  <div className="rounded-xl border border-default-200/80 bg-default-100/60 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                                    <p className="text-[11px] uppercase tracking-[0.16em] text-default-500">
                                      Processos
                                    </p>
                                    <p className="mt-1 font-semibold text-foreground">
                                      {tenant.totalProcessos}
                                    </p>
                                  </div>
                                  <div className="rounded-xl border border-default-200/80 bg-default-100/60 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                                    <p className="text-[11px] uppercase tracking-[0.16em] text-default-500">
                                      Contribuicoes
                                    </p>
                                    <p className="mt-1 font-semibold text-foreground">
                                      {tenant.totalContribuicoes}
                                    </p>
                                  </div>
                                  <div className="rounded-xl border border-default-200/80 bg-default-100/60 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                                    <p className="text-[11px] uppercase tracking-[0.16em] text-default-500">
                                      Julgamentos
                                    </p>
                                    <p className="mt-1 font-semibold text-foreground">
                                      {tenant.totalJulgamentos}
                                    </p>
                                  </div>
                                  <div className="rounded-xl border border-default-200/80 bg-default-100/60 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                                    <p className="text-[11px] uppercase tracking-[0.16em] text-default-500">
                                      Analises
                                    </p>
                                    <p className="mt-1 font-semibold text-foreground">
                                      {tenant.totalAnalises}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  {tenant.niveisAcesso.map((nivel) => (
                                    <Chip key={`${tenant.tenantId}-${nivel}`} size="sm" variant="flat">
                                      {nivel}
                                    </Chip>
                                  ))}
                                  {tenant.pacotes.map((pacote) => (
                                    <Chip
                                      key={`${tenant.tenantId}-${pacote}`}
                                      color="warning"
                                      size="sm"
                                      variant="flat"
                                    >
                                      {pacote}
                                    </Chip>
                                  ))}
                                </div>
                              </CardBody>
                            </Card>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Boxes className="h-4 w-4 text-primary" />
                          <h4 className="text-base font-semibold text-foreground">
                            Pacotes relacionados
                          </h4>
                        </div>
                        {juizDetalhe.pacotesRelacionados.length === 0 ? (
                          <Card className="border border-default-200/80 bg-content1/70 dark:border-white/10 dark:bg-background/50">
                            <CardBody className="py-6 text-sm text-default-400">
                              Esta autoridade ainda nao faz parte de nenhum pacote.
                            </CardBody>
                          </Card>
                        ) : (
                          juizDetalhe.pacotesRelacionados.map((pacote) => (
                            <Card
                              key={pacote.id}
                              className="border border-default-200/80 bg-content1/80 shadow-sm shadow-black/5 dark:border-white/10 dark:bg-background/60 dark:shadow-black/20"
                            >
                              <CardBody className="space-y-3 p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold text-foreground">
                                      {pacote.nome}
                                    </p>
                                    <p className="text-xs text-default-400">
                                      {pacote.descricao || "Pacote sem descricao detalhada."}
                                    </p>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <Chip
                                      color={pacote.ativoNoPacote ? "success" : "default"}
                                      size="sm"
                                      variant="flat"
                                    >
                                      {pacote.ativoNoPacote ? "Ativo no pacote" : "Inativo"}
                                    </Chip>
                                    {pacote.isPublico ? (
                                      <Chip color="primary" size="sm" variant="flat">
                                        Publico
                                      </Chip>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-sm">
                                  <div className="rounded-xl border border-default-200/80 bg-default-100/60 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                                    <p className="text-[11px] uppercase tracking-[0.16em] text-default-500">
                                      Preco
                                    </p>
                                    <p className="mt-1 font-semibold text-foreground">
                                      {formatCurrency(pacote.preco)}
                                    </p>
                                  </div>
                                  <div className="rounded-xl border border-default-200/80 bg-default-100/60 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                                    <p className="text-[11px] uppercase tracking-[0.16em] text-default-500">
                                      Assinaturas
                                    </p>
                                    <p className="mt-1 font-semibold text-foreground">
                                      {pacote.totalAssinaturas}
                                    </p>
                                  </div>
                                  <div className="rounded-xl border border-default-200/80 bg-default-100/60 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                                    <p className="text-[11px] uppercase tracking-[0.16em] text-default-500">
                                      Tenants ativos
                                    </p>
                                    <p className="mt-1 font-semibold text-foreground">
                                      {pacote.tenantsAtivos}
                                    </p>
                                  </div>
                                </div>
                              </CardBody>
                            </Card>
                          ))
                        )}
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <FileSearch className="h-4 w-4 text-primary" />
                          <h4 className="text-base font-semibold text-foreground">
                            Processos recentes em que foi citada
                          </h4>
                        </div>
                        {juizDetalhe.processosRecentes.length === 0 ? (
                          <Card className="border border-default-200/80 bg-content1/70 dark:border-white/10 dark:bg-background/50">
                            <CardBody className="py-6 text-sm text-default-400">
                              Nenhum processo vinculado foi encontrado.
                            </CardBody>
                          </Card>
                        ) : (
                          juizDetalhe.processosRecentes.map((processo) => (
                            <Card
                              key={processo.id}
                              className="border border-default-200/80 bg-content1/80 shadow-sm shadow-black/5 dark:border-white/10 dark:bg-background/60 dark:shadow-black/20"
                            >
                              <CardBody className="space-y-3 p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold text-foreground">
                                      {processo.numero}
                                    </p>
                                    <p className="text-xs text-default-400">
                                      {processo.titulo || processo.areaNome || "Processo sem titulo"}
                                    </p>
                                  </div>
                                  <Chip size="sm" variant="flat">
                                    {processo.status}
                                  </Chip>
                                </div>
                                <div className="space-y-1 text-sm text-default-500">
                                  <p>
                                    <span className="font-medium text-foreground">Tenant:</span>{" "}
                                    {processo.tenantNome}
                                  </p>
                                  <p>
                                    <span className="font-medium text-foreground">Cliente principal:</span>{" "}
                                    {processo.clientePrincipal}
                                  </p>
                                  {processo.clientesRelacionados.length > 0 ? (
                                    <p>
                                      <span className="font-medium text-foreground">Demais clientes:</span>{" "}
                                      {processo.clientesRelacionados.join(", ")}
                                    </p>
                                  ) : null}
                                  <p>
                                    <span className="font-medium text-foreground">Atualizado em:</span>{" "}
                                    {formatDateTime(processo.updatedAt)}
                                  </p>
                                </div>
                              </CardBody>
                            </Card>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-primary" />
                          <h4 className="text-base font-semibold text-foreground">
                            Contribuicoes recentes
                          </h4>
                        </div>
                        {juizDetalhe.contribuicoesRecentes.length === 0 ? (
                          <Card className="border border-default-200/80 bg-content1/70 dark:border-white/10 dark:bg-background/50">
                            <CardBody className="py-6 text-sm text-default-400">
                              Nenhuma contribuicao recente foi encontrada.
                            </CardBody>
                          </Card>
                        ) : (
                          juizDetalhe.contribuicoesRecentes.map((contribuicao) => (
                            <Card
                              key={contribuicao.id}
                              className="border border-default-200/80 bg-content1/80 shadow-sm shadow-black/5 dark:border-white/10 dark:bg-background/60 dark:shadow-black/20"
                            >
                              <CardBody className="space-y-2 p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold text-foreground">
                                      {contribuicao.tenantNome}
                                    </p>
                                    <p className="text-xs text-default-400">
                                      {contribuicao.criadoPorNome}
                                    </p>
                                  </div>
                                  <Chip size="sm" variant="flat">
                                    {contribuicao.status}
                                  </Chip>
                                </div>
                                <p className="text-sm text-default-500">
                                  Campos:{" "}
                                  {contribuicao.campos.length > 0
                                    ? contribuicao.campos.join(", ")
                                    : "Sem campos mapeados"}
                                </p>
                                <p className="text-xs text-default-400">
                                  Criado em {formatDateTime(contribuicao.criadoEm)}
                                </p>
                              </CardBody>
                            </Card>
                          ))
                        )}
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Gavel className="h-4 w-4 text-primary" />
                          <h4 className="text-base font-semibold text-foreground">
                            Julgamentos recentes
                          </h4>
                        </div>
                        {juizDetalhe.julgamentosRecentes.length === 0 ? (
                          <Card className="border border-default-200/80 bg-content1/70 dark:border-white/10 dark:bg-background/50">
                            <CardBody className="py-6 text-sm text-default-400">
                              Nenhum julgamento recente foi encontrado.
                            </CardBody>
                          </Card>
                        ) : (
                          juizDetalhe.julgamentosRecentes.map((julgamento) => (
                            <Card
                              key={julgamento.id}
                              className="border border-default-200/80 bg-content1/80 shadow-sm shadow-black/5 dark:border-white/10 dark:bg-background/60 dark:shadow-black/20"
                            >
                              <CardBody className="space-y-2 p-4">
                                <p className="text-sm font-semibold text-foreground">
                                  {julgamento.titulo}
                                </p>
                                <p className="text-sm text-default-500">
                                  {julgamento.tenantNome}
                                  {julgamento.processoNumero
                                    ? ` · Processo ${julgamento.processoNumero}`
                                    : ""}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  <Chip size="sm" variant="flat">
                                    {julgamento.tipoJulgamento}
                                  </Chip>
                                  {julgamento.resultado ? (
                                    <Chip color="primary" size="sm" variant="flat">
                                      {julgamento.resultado}
                                    </Chip>
                                  ) : null}
                                </div>
                                <p className="text-xs text-default-400">
                                  {formatDate(julgamento.dataJulgamento)}
                                </p>
                              </CardBody>
                            </Card>
                          ))
                        )}
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <CalendarDays className="h-4 w-4 text-primary" />
                          <h4 className="text-base font-semibold text-foreground">
                            Analises recentes
                          </h4>
                        </div>
                        {juizDetalhe.analisesRecentes.length === 0 ? (
                          <Card className="border border-default-200/80 bg-content1/70 dark:border-white/10 dark:bg-background/50">
                            <CardBody className="py-6 text-sm text-default-400">
                              Nenhuma analise recente foi encontrada.
                            </CardBody>
                          </Card>
                        ) : (
                          juizDetalhe.analisesRecentes.map((analise) => (
                            <Card
                              key={analise.id}
                              className="border border-default-200/80 bg-content1/80 shadow-sm shadow-black/5 dark:border-white/10 dark:bg-background/60 dark:shadow-black/20"
                            >
                              <CardBody className="space-y-2 p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <p className="text-sm font-semibold text-foreground">
                                    {analise.titulo}
                                  </p>
                                  {analise.isPublico ? (
                                    <Chip color="success" size="sm" variant="flat">
                                      Publica
                                    </Chip>
                                  ) : null}
                                </div>
                                <p className="text-sm text-default-500">
                                  {analise.tenantNome} · {analise.tipoAnalise}
                                </p>
                                <p className="text-xs text-default-400">
                                  {formatDateTime(analise.createdAt)}
                                </p>
                              </CardBody>
                            </Card>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </ModalBody>

              <ModalFooter className="border-t border-default-200/80 pt-4 dark:border-white/10">
                <Button variant="flat" onPress={onClose}>
                  Fechar
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </section>
  );
}
