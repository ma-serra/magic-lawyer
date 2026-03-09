"use client";

import type { JuizSerializado } from "@/app/actions/juizes";

import React from "react";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Divider } from "@heroui/divider";
import { Button } from "@heroui/button";
import { Badge } from "@heroui/badge";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/table";
import useSWR from "swr";

import { PeoplePageHeader } from "@/components/people-ui";
import {
  getPlanos,
  getEstatisticasPlanos,
  getAssinaturas,
} from "@/app/actions/planos";
import {
  getPacotesJuiz,
  getEstatisticasPacotesJuiz,
} from "@/app/actions/pacotesJuiz";
import { getJuizesAdmin } from "@/app/actions/juizes";

export function PacotesContent() {
  // Buscar dados reais dos PLANOS e PACOTES DE JUÍZES
  const { data: planosResponse, isLoading: loadingPlanos } = useSWR(
    "planos",
    getPlanos,
  );
  const { data: pacotesJuizResponse, isLoading: loadingPacotesJuiz } = useSWR(
    "pacotes-juiz",
    getPacotesJuiz,
  );
  const { data: statsResponse, isLoading: loadingStats } = useSWR(
    "stats-planos",
    getEstatisticasPlanos,
  );
  const { data: statsPacotesResponse, isLoading: loadingStatsPacotes } = useSWR(
    "stats-pacotes-juiz",
    getEstatisticasPacotesJuiz,
  );
  const { data: assinaturasResponse, isLoading: loadingAssinaturas } = useSWR(
    "assinaturas",
    getAssinaturas,
  );

  const planos = planosResponse?.data || [];
  const pacotesJuiz = pacotesJuizResponse?.data || [];
  const assinaturas = assinaturasResponse?.data || [];
  const stats = statsResponse?.data || {
    totalPlanos: 0,
    planosAtivos: 0,
    totalAssinaturas: 0,
    assinaturasAtivas: 0,
    faturamentoMensal: 0,
  };
  const statsPacotes = statsPacotesResponse?.data || {
    totalPacotes: 0,
    pacotesAtivos: 0,
    totalAssinaturas: 0,
    assinaturasAtivas: 0,
    faturamentoMensal: 0,
  };

  const {
    data: juizesPremiumResponse,
    error: errorJuizesPremium,
    isLoading: loadingJuizesPremium,
    mutate: mutateJuizesPremium,
  } = useSWR(
    ["admin-juizes-premium", { isPremium: true }],
    ([, filters]) => getJuizesAdmin(filters),
    {
      revalidateOnFocus: false,
      refreshInterval: 0,
    },
  );

  const juizesPremium: JuizSerializado[] = juizesPremiumResponse?.data ?? [];

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) {
      return "Sob consulta";
    }

    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getPlanoColor = (nome: string) => {
    switch (nome.toLowerCase()) {
      case "starter":
        return "success";
      case "professional":
        return "secondary";
      case "enterprise":
        return "primary";
      default:
        return "default";
    }
  };

  const getPlanoIcon = (nome: string) => {
    switch (nome.toLowerCase()) {
      case "starter":
        return "🚀";
      case "professional":
        return "💼";
      case "enterprise":
        return "🏢";
      default:
        return "📦";
    }
  };

  return (
    <section className="space-y-6">
      <PeoplePageHeader
        tag="Administração"
        title="Planos e pacotes premium"
        description="Gerencie planos comerciais e monetização da base premium de autoridades."
        actions={
          <>
            <Button color="primary" size="sm" variant="flat">
              Relatórios
            </Button>
            <Button color="secondary" size="sm" variant="flat">
              Configurar
            </Button>
          </>
        }
      />

      {/* Métricas Principais */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
          <CardBody className="flex items-center">
            <span className="text-3xl text-purple-600 mr-4">💎</span>
            <div>
              <p className="text-sm font-medium text-default-500">
                Juízes Premium
              </p>
              <p className="text-2xl font-bold text-foreground">
                {loadingJuizesPremium ? "—" : juizesPremium.length}
              </p>
              <p className="text-sm text-purple-600">Monetizáveis</p>
            </div>
          </CardBody>
        </Card>

        <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
          <CardBody className="flex items-center">
            <span className="text-3xl text-green-600 mr-4">💰</span>
            <div>
              <p className="text-sm font-medium text-default-500">
                Faturamento Mensal
              </p>
              <p className="text-2xl font-bold text-foreground">
                {formatCurrency(stats.faturamentoMensal)}
              </p>
              <p className="text-sm text-green-600">Receita atual</p>
            </div>
          </CardBody>
        </Card>

        <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
          <CardBody className="flex items-center">
            <span className="text-3xl text-blue-600 mr-4">📦</span>
            <div>
              <p className="text-sm font-medium text-default-500">Planos Ativos</p>
              <p className="text-2xl font-bold text-foreground">
                {stats.planosAtivos}
              </p>
              <p className="text-sm text-blue-600">
                de {stats.totalPlanos} total
              </p>
            </div>
          </CardBody>
        </Card>

        <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
          <CardBody className="flex items-center">
            <span className="text-3xl text-yellow-600 mr-4">👥</span>
            <div>
              <p className="text-sm font-medium text-default-500">
                Assinaturas Ativas
              </p>
              <p className="text-2xl font-bold text-foreground">
                {stats.assinaturasAtivas}
              </p>
              <p className="text-sm text-yellow-600">
                de {stats.totalAssinaturas} total
              </p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Planos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {loadingPlanos ? (
          <div className="col-span-3 text-center py-12">
            <div className="text-6xl mb-4">⏳</div>
            <h3 className="text-lg font-medium text-white mb-2">
              Carregando planos...
            </h3>
            <p className="text-default-400">
              Buscando dados dos planos disponíveis
            </p>
          </div>
        ) : planos.length === 0 ? (
          <div className="col-span-3 text-center py-12">
            <div className="text-6xl mb-4">📦</div>
            <h3 className="text-lg font-medium text-white mb-2">
              Nenhum plano encontrado
            </h3>
            <p className="text-default-400 mb-4">
              Crie planos para começar a monetizar o sistema
            </p>
            <Button color="primary">➕ Criar Primeiro Plano</Button>
          </div>
        ) : (
          planos.map((plano) => (
            <Card
              key={plano.id}
              className="border border-white/10 bg-background/70 backdrop-blur-xl hover:border-white/20 transition-colors"
            >
              <CardHeader className="flex flex-col gap-2 pb-2">
                <div className="flex items-center justify-between">
                  <span className="text-3xl">{getPlanoIcon(plano.nome)}</span>
                  <Badge
                    color={getPlanoColor(plano.nome) as any}
                    size="sm"
                    variant="flat"
                  >
                    {plano.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
                <h3 className="text-lg font-semibold text-white">
                  {plano.nome}
                </h3>
                <p className="text-sm text-default-400">{plano.descricao}</p>
              </CardHeader>
              <Divider className="border-white/10" />
              <CardBody className="space-y-4">
                <div className="flex items-baseline">
                  <span className="text-3xl font-bold text-white">
                    {plano.valorMensal
                      ? formatCurrency(plano.valorMensal)
                      : "Sob consulta"}
                  </span>
                  {plano.valorMensal && (
                    <span className="text-default-400 ml-2">/mês</span>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center text-sm text-default-400">
                    <span className="mr-2">👥</span>
                    <span>{plano.limiteUsuarios || "Ilimitado"} usuários</span>
                  </div>
                  <div className="flex items-center text-sm text-default-400">
                    <span className="mr-2">📄</span>
                    <span>
                      {plano.limiteProcessos || "Ilimitado"} processos
                    </span>
                  </div>
                  <div className="flex items-center text-sm text-default-400">
                    <span className="mr-2">💾</span>
                    <span>
                      {plano.limiteStorageMb
                        ? `${plano.limiteStorageMb} MB`
                        : "Ilimitado"}{" "}
                      armazenamento
                    </span>
                  </div>
                  <div className="flex items-center text-sm text-default-400">
                    <span className="mr-2">⚙️</span>
                    <span>Recursos avançados</span>
                  </div>
                </div>

                <Button
                  className="w-full"
                  color={getPlanoColor(plano.nome) as any}
                  variant={plano.valorMensal ? "solid" : "flat"}
                >
                  {plano.valorMensal ? "Editar Plano" : "Configurar Preço"}
                </Button>
              </CardBody>
            </Card>
          ))
        )}
      </div>

      {/* Pacotes de Juízes */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">
              📦 Pacotes de Juízes Premium
            </h2>
            <p className="text-default-400">
              Add-ons que escritórios podem comprar para acessar dados
              específicos de juízes
            </p>
          </div>
          <Button color="secondary" variant="solid">
            ➕ Novo Pacote de Juízes
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {loadingPacotesJuiz ? (
            <div className="col-span-4 text-center py-12">
              <div className="text-6xl mb-4">⏳</div>
              <h3 className="text-lg font-medium text-white mb-2">
                Carregando pacotes...
              </h3>
              <p className="text-default-400">
                Buscando pacotes de juízes disponíveis
              </p>
            </div>
          ) : pacotesJuiz.length === 0 ? (
            <div className="col-span-4 text-center py-12">
              <div className="text-6xl mb-4">📦</div>
              <h3 className="text-lg font-medium text-white mb-2">
                Nenhum pacote de juízes encontrado
              </h3>
              <p className="text-default-400 mb-4">
                Crie pacotes de juízes para monetizar o acesso a dados
                específicos
              </p>
              <Button color="secondary">➕ Criar Primeiro Pacote</Button>
            </div>
          ) : (
            pacotesJuiz.map((pacote) => (
              <Card
                key={pacote.id}
                className="border border-white/10 bg-background/70 backdrop-blur-xl hover:border-white/20 transition-colors"
              >
                <CardHeader className="flex flex-col gap-2 pb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-3xl">{pacote.icone}</span>
                    <Badge
                      color={getPlanoColor(pacote.cor) as any}
                      size="sm"
                      variant="flat"
                    >
                      {pacote.status}
                    </Badge>
                  </div>
                  <h3 className="text-lg font-semibold text-white">
                    {pacote.nome}
                  </h3>
                  <p className="text-sm text-default-400">{pacote.descricao}</p>
                </CardHeader>
                <Divider className="border-white/10" />
                <CardBody className="space-y-4">
                  <div className="flex items-baseline">
                    <span className="text-3xl font-bold text-white">
                      {formatCurrency(pacote.preco)}
                    </span>
                    <span className="text-default-400 ml-2">
                      {pacote.duracaoDias
                        ? `/${pacote.duracaoDias} dias`
                        : "/permanente"}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center text-sm text-default-400">
                      <span className="mr-2">👨‍⚖️</span>
                      <span>{pacote._count?.juizes || 0} juízes incluídos</span>
                    </div>
                    <div className="flex items-center text-sm text-default-400">
                      <span className="mr-2">👥</span>
                      <span>{pacote.limiteUsuarios || "Todos"} usuários</span>
                    </div>
                    <div className="flex items-center text-sm text-default-400">
                      <span className="mr-2">🔍</span>
                      <span>
                        {pacote.limiteConsultas || "Ilimitadas"} consultas/mês
                      </span>
                    </div>
                    <div className="flex items-center text-sm text-default-400">
                      <span className="mr-2">👥</span>
                      <span>
                        {pacote._count?.assinaturas || 0} assinaturas ativas
                      </span>
                    </div>
                  </div>

                  <Button
                    className="w-full"
                    color={getPlanoColor(pacote.cor) as any}
                    variant="solid"
                  >
                    Gerenciar Pacote
                  </Button>
                </CardBody>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Assinaturas Ativas */}
      <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
        <CardHeader className="flex flex-col gap-2 pb-2">
          <h2 className="text-lg font-semibold text-white">
            📋 Assinaturas Ativas
          </h2>
          <p className="text-sm text-default-400">
            Tenants que possuem planos ativos no sistema.
          </p>
        </CardHeader>
        <Divider className="border-white/10" />
        <CardBody>
          {loadingAssinaturas ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-2">⏳</div>
              <p className="text-default-400">Carregando assinaturas...</p>
            </div>
          ) : assinaturas.length > 0 ? (
            <Table aria-label="Tabela de Assinaturas">
              <TableHeader>
                <TableColumn>Tenant</TableColumn>
                <TableColumn>Plano</TableColumn>
                <TableColumn>Status</TableColumn>
                <TableColumn>Início</TableColumn>
                <TableColumn>Fim</TableColumn>
                <TableColumn>Ações</TableColumn>
              </TableHeader>
              <TableBody>
                {assinaturas.map((assinatura) => (
                  <TableRow key={assinatura.id}>
                    <TableCell>{assinatura.tenant.name}</TableCell>
                    <TableCell>
                      {assinatura.plano?.nome || "Sem plano"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        color={
                          assinatura.status === "ATIVA" ? "success" : "warning"
                        }
                        variant="flat"
                      >
                        {assinatura.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(assinatura.dataInicio).toLocaleDateString(
                        "pt-BR",
                      )}
                    </TableCell>
                    <TableCell>
                      {assinatura.dataFim
                        ? new Date(assinatura.dataFim).toLocaleDateString(
                            "pt-BR",
                          )
                        : "N/A"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button color="primary" size="sm" variant="light">
                          Editar
                        </Button>
                        <Button color="danger" size="sm" variant="light">
                          Cancelar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📋</div>
              <h3 className="text-lg font-medium text-white mb-2">
                Nenhuma assinatura encontrada
              </h3>
              <p className="text-default-400 mb-4">
                As assinaturas dos tenants aparecerão aqui
              </p>
              <Button color="primary">➕ Gerenciar Assinaturas</Button>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Juízes Premium Table */}
      <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
        <CardHeader className="flex flex-col gap-2 pb-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">
                💎 Juízes Premium Disponíveis
              </h2>
              <p className="text-sm text-default-400">
                Juízes que podem ser incluídos em pacotes premium.
              </p>
            </div>
            <Button
              color="default"
              isDisabled={loadingJuizesPremium}
              size="sm"
              variant="flat"
              onPress={() => mutateJuizesPremium()}
            >
              🔄 Atualizar
            </Button>
          </div>
        </CardHeader>
        <Divider className="border-white/10" />
        <CardBody>
          {errorJuizesPremium ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">⚠️</div>
              <h3 className="text-lg font-medium text-white mb-2">
                Não foi possível carregar os juízes premium
              </h3>
              <p className="text-default-400">
                {(errorJuizesPremium as Error)?.message ||
                  "Recarregue os dados para tentar novamente."}
              </p>
            </div>
          ) : loadingJuizesPremium ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">⏳</div>
              <h3 className="text-lg font-medium text-white mb-2">
                Carregando juízes premium...
              </h3>
              <p className="text-default-400">
                Buscando juízes monetizáveis cadastrados pelo super admin.
              </p>
            </div>
          ) : juizesPremium.length > 0 ? (
            <Table aria-label="Tabela de Juízes Premium">
              <TableHeader>
                <TableColumn>Juiz</TableColumn>
                <TableColumn>Comarca</TableColumn>
                <TableColumn>Especialidades</TableColumn>
                <TableColumn>Preço</TableColumn>
                <TableColumn>Processos</TableColumn>
                <TableColumn>Ações</TableColumn>
              </TableHeader>
              <TableBody>
                {juizesPremium.map((juiz) => (
                  <TableRow key={juiz.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-white">
                          {juiz.nome}
                        </span>
                        {juiz.nomeCompleto && (
                          <span className="text-xs text-default-400">
                            {juiz.nomeCompleto}
                          </span>
                        )}
                        <span className="text-xs text-primary">
                          {juiz.comarca || "—"}
                          {juiz.vara ? ` - ${juiz.vara}` : ""}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{juiz.comarca || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {juiz.especialidades.slice(0, 2).map((esp) => (
                          <Badge
                            key={esp}
                            color="default"
                            size="sm"
                            variant="flat"
                          >
                            {esp.replace(/_/g, " ")}
                          </Badge>
                        ))}
                        {juiz.especialidades.length > 2 && (
                          <Badge color="default" size="sm" variant="flat">
                            +{juiz.especialidades.length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{formatCurrency(juiz.precoAcesso)}</TableCell>
                    <TableCell>{juiz._count?.processos ?? 0}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button color="primary" size="sm" variant="light">
                          Editar
                        </Button>
                        <Button color="secondary" size="sm" variant="light">
                          Incluir
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">👨‍⚖️</div>
              <h3 className="text-lg font-medium text-white mb-2">
                Nenhum juiz premium encontrado
              </h3>
              <p className="text-default-400 mb-4">
                Configure juízes como premium para criar pacotes pagos
              </p>
              <Button color="secondary">👨‍⚖️ Gerenciar Juízes</Button>
            </div>
          )}
        </CardBody>
      </Card>
    </section>
  );
}
