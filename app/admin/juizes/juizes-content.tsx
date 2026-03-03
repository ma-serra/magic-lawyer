"use client";

import type { JuizSerializado } from "@/app/actions/juizes";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Input } from "@heroui/input";
import { Chip } from "@heroui/chip";
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
} from "lucide-react";

import { getJuizesAdmin } from "@/app/actions/juizes";
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

export function JuizesContent() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tipoFilter, setTipoFilter] = useState("all");
  const [escopoFilter, setEscopoFilter] = useState("all");

  const { data, error, isLoading, mutate } = useSWR(
    "admin-juizes",
    () => getJuizesAdmin(),
    {
      revalidateOnFocus: false,
      refreshInterval: 0,
    },
  );

  const juizes: JuizSerializado[] = data?.data ?? [];

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
          <Card className="border border-white/10 bg-background/55">
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
                <Card key={juiz.id} className="border border-white/10 bg-background/55">
                  <CardBody className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{juiz.nome}</p>
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
                        <p className="text-base font-semibold text-white">
                          {juiz._count?.processos ?? 0}
                        </p>
                      </div>
                      <div className="rounded-lg border border-secondary/20 bg-secondary/5 px-2.5 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-secondary/80">
                          Preço
                        </p>
                        <p className="truncate text-sm font-semibold text-white">
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
                </TableHeader>
                <TableBody emptyContent="Nenhuma autoridade corresponde aos filtros aplicados.">
                  {filteredJuizes.map((juiz) => (
                    <TableRow key={juiz.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-white">{juiz.nome}</span>
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
                          <span className="text-sm text-default-200">{juiz.comarca || "-"}</span>
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </PeoplePanel>
    </section>
  );
}
