"use client";

import { useState } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Divider } from "@heroui/divider";
import { Spinner } from "@heroui/spinner";
import { Tabs, Tab } from "@heroui/tabs";
import { Avatar } from "@heroui/avatar";
import {
  Gavel,
  MapPin,
  Phone,
  Mail,
  Calendar,
  Award,
  BookOpen,
  Users,
  Scale,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  Target,
  ExternalLink,
  GraduationCap,
  Briefcase,
  Globe,
  Linkedin,
  Twitter,
  Instagram,
  Heart,
  HeartOff,
  DollarSign,
  FileText,
  User,
  Building2,
  Flag,
  Layers,
} from "lucide-react";
import { toast } from "@/lib/toast";

import {
  useJuizDetalhado,
  useProcessosDoJuiz,
  useJulgamentosDoJuiz,
  useFavoritoJuiz,
} from "@/app/hooks/use-juizes";
import {
  adicionarFavoritoJuiz,
  removerFavoritoJuiz,
} from "@/app/actions/juizes";
import { DateUtils } from "@/app/lib/date-utils";
import { JuizNivel, JuizStatus } from "@/generated/prisma";

interface JuizModalProps {
  juizId: string;
  isOpen: boolean;
  onClose: () => void;
}

const getStatusColor = (status: JuizStatus) => {
  switch (status) {
    case JuizStatus.ATIVO:
      return "success";
    case JuizStatus.APOSENTADO:
      return "default";
    case JuizStatus.SUSPENSO:
      return "danger";
    case JuizStatus.INATIVO:
    default:
      return "warning";
  }
};

const getStatusLabel = (status: JuizStatus) => {
  switch (status) {
    case JuizStatus.ATIVO:
      return "Ativo";
    case JuizStatus.APOSENTADO:
      return "Aposentado";
    case JuizStatus.SUSPENSO:
      return "Suspenso";
    case JuizStatus.INATIVO:
    default:
      return "Inativo";
  }
};

const getNivelLabel = (nivel: JuizNivel) => {
  switch (nivel) {
    case JuizNivel.JUIZ_SUBSTITUTO:
      return "Juiz Substituto";
    case JuizNivel.JUIZ_TITULAR:
      return "Juiz Titular";
    case JuizNivel.DESEMBARGADOR:
      return "Desembargador";
    case JuizNivel.MINISTRO:
      return "Ministro";
    case JuizNivel.OUTROS:
    default:
      return "Outros";
  }
};

export default function JuizModal({ juizId, isOpen, onClose }: JuizModalProps) {
  const [isFavoritoLoading, setIsFavoritoLoading] = useState(false);

  // Debug removido para produção

  const {
    juiz,
    isLoading,
    isError,
    mutate: mutateJuiz,
  } = useJuizDetalhado(juizId);
  const { isFavorito, mutate: mutateFavorito } = useFavoritoJuiz(juizId);

  // Debug removido para produção
  const { processos, isLoading: isLoadingProcessos } =
    useProcessosDoJuiz(juizId);
  const { julgamentos, isLoading: isLoadingJulgamentos } =
    useJulgamentosDoJuiz(juizId);

  const handleToggleFavorito = async () => {
    if (!juiz) return;

    setIsFavoritoLoading(true);
    try {
      let result;

      if (isFavorito) {
        result = await removerFavoritoJuiz(juiz.id);
      } else {
        result = await adicionarFavoritoJuiz(juiz.id);
      }

      if (result.success) {
        // Atualizar o cache do SWR otimisticamente
        await mutateFavorito(!isFavorito, false);
        toast.success(
          isFavorito ? "Removido dos favoritos" : "Adicionado aos favoritos",
        );
        // Revalidar os dados do juiz
        mutateJuiz();
      } else {
        toast.error(result.error || "Erro ao atualizar favoritos");
      }
    } catch (error) {
      toast.error("Erro ao atualizar favoritos");
    } finally {
      setIsFavoritoLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Modal
        isOpen={isOpen}
        scrollBehavior="inside"
        size="5xl"
        onClose={onClose}
      >
        <ModalContent>
          <div className="flex min-h-[400px] items-center justify-center">
            <Spinner label="Carregando informações do juiz..." size="lg" />
          </div>
        </ModalContent>
      </Modal>
    );
  }

  if (isError || !juiz) {
    return (
      <Modal isOpen={isOpen} size="5xl" onClose={onClose}>
        <ModalContent>
          <ModalBody className="flex min-h-[400px] flex-col items-center justify-center gap-4">
            <Gavel className="h-12 w-12 text-danger" />
            <p className="text-lg font-semibold text-danger">
              Erro ao carregar informações do juiz
            </p>
            <Button color="primary" onPress={onClose}>
              Fechar
            </Button>
          </ModalBody>
        </ModalContent>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} scrollBehavior="inside" size="5xl" onClose={onClose}>
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <Avatar
              className="flex-shrink-0"
              name={juiz.nome}
              size="lg"
              src={juiz.foto || undefined}
            />
            <div className="flex-1">
              <h3 className="text-xl font-semibold">
                {juiz.nomeCompleto || juiz.nome}
              </h3>
              <p className="text-sm text-default-500">
                {getNivelLabel(juiz.nivel)}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <Chip
                  color={getStatusColor(juiz.status)}
                  size="sm"
                  variant="flat"
                >
                  {getStatusLabel(juiz.status)}
                </Chip>
                {juiz.tribunal && (
                  <Chip color="secondary" size="sm" variant="flat">
                    {juiz.tribunal.nome}
                  </Chip>
                )}
              </div>
            </div>
            <Button
              color={isFavorito ? "danger" : "default"}
              isLoading={isFavoritoLoading}
              startContent={
                isFavorito ? (
                  <HeartOff className="h-4 w-4" />
                ) : (
                  <Heart className="h-4 w-4" />
                )
              }
              variant="bordered"
              onPress={handleToggleFavorito}
            >
              {isFavorito ? "Remover Favorito" : "Adicionar Favorito"}
            </Button>
          </div>
        </ModalHeader>

        <ModalBody>
          <Tabs
            aria-label="Informações do Juiz"
            color="primary"
            variant="underlined"
          >
            <Tab
              key="informacoes"
              title={
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span>Informações</span>
                </div>
              }
            >
              <div className="space-y-6 mt-4">
                {/* Informações Básicas */}
                <Card className="border border-default-200">
                  <CardHeader>
                    <h4 className="text-lg font-semibold flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Informações Básicas
                    </h4>
                  </CardHeader>
                  <Divider />
                  <CardBody className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      {juiz.cpf && (
                        <div>
                          <p className="text-xs font-semibold uppercase text-default-400">
                            CPF
                          </p>
                          <p className="mt-1 text-sm text-default-600">
                            {juiz.cpf}
                          </p>
                        </div>
                      )}

                      {juiz.oab && (
                        <div>
                          <p className="text-xs font-semibold uppercase text-default-400">
                            OAB
                          </p>
                          <p className="mt-1 text-sm text-default-600">
                            {juiz.oab}
                          </p>
                        </div>
                      )}

                      {juiz.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-default-400" />
                          <div>
                            <p className="text-xs font-semibold uppercase text-default-400">
                              E-mail
                            </p>
                            <a
                              className="mt-1 text-sm text-primary hover:underline"
                              href={`mailto:${juiz.email}`}
                            >
                              {juiz.email}
                            </a>
                          </div>
                        </div>
                      )}

                      {juiz.telefone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-default-400" />
                          <div>
                            <p className="text-xs font-semibold uppercase text-default-400">
                              Telefone
                            </p>
                            <a
                              className="mt-1 text-sm text-primary hover:underline"
                              href={`tel:${juiz.telefone}`}
                            >
                              {juiz.telefone}
                            </a>
                          </div>
                        </div>
                      )}

                      {juiz.dataNascimento && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-default-400" />
                          <div>
                            <p className="text-xs font-semibold uppercase text-default-400">
                              Data de Nascimento
                            </p>
                            <p className="mt-1 text-sm text-default-600">
                              {DateUtils.formatDate(juiz.dataNascimento)}
                            </p>
                          </div>
                        </div>
                      )}

                      {juiz.dataPosse && (
                        <div className="flex items-center gap-2">
                          <Award className="h-4 w-4 text-default-400" />
                          <div>
                            <p className="text-xs font-semibold uppercase text-default-400">
                              Data de Posse
                            </p>
                            <p className="mt-1 text-sm text-default-600">
                              {DateUtils.formatDate(juiz.dataPosse)}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardBody>
                </Card>

                {/* Localização e Tribunal */}
                <Card className="border border-default-200">
                  <CardHeader>
                    <h4 className="text-lg font-semibold flex items-center gap-2">
                      <MapPin className="h-5 w-5" />
                      Localização e Tribunal
                    </h4>
                  </CardHeader>
                  <Divider />
                  <CardBody className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      {juiz.vara && (
                        <div>
                          <p className="text-xs font-semibold uppercase text-default-400">
                            Vara
                          </p>
                          <p className="mt-1 text-sm text-default-600">
                            {juiz.vara}
                          </p>
                        </div>
                      )}

                      {juiz.comarca && (
                        <div>
                          <p className="text-xs font-semibold uppercase text-default-400">
                            Comarca
                          </p>
                          <p className="mt-1 text-sm text-default-600">
                            {juiz.comarca}
                          </p>
                        </div>
                      )}

                      {juiz.endereco && (
                        <div className="md:col-span-2">
                          <p className="text-xs font-semibold uppercase text-default-400">
                            Endereço
                          </p>
                          <p className="mt-1 text-sm text-default-600">
                            {juiz.endereco}
                          </p>
                          {juiz.cidade && juiz.estado && (
                            <p className="mt-1 text-sm text-default-500">
                              {juiz.cidade}, {juiz.estado}
                              {juiz.cep && ` - CEP: ${juiz.cep}`}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {juiz.tribunal && (
                      <div className="border-t border-default-200 pt-4">
                        <h5 className="text-sm font-semibold text-default-700 mb-3 flex items-center gap-2">
                          <Scale className="h-4 w-4" />
                          Tribunal
                        </h5>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <p className="text-xs font-semibold uppercase text-default-400">
                              Nome
                            </p>
                            <p className="mt-1 text-sm text-default-600">
                              {juiz.tribunal.nome}
                            </p>
                          </div>

                          {juiz.tribunal.sigla && (
                            <div>
                              <p className="text-xs font-semibold uppercase text-default-400">
                                Sigla
                              </p>
                              <p className="mt-1 text-sm text-default-600">
                                {juiz.tribunal.sigla}
                              </p>
                            </div>
                          )}

                          {juiz.tribunal.esfera && (
                            <div>
                              <p className="text-xs font-semibold uppercase text-default-400">
                                Esfera
                              </p>
                              <p className="mt-1 text-sm text-default-600">
                                {juiz.tribunal.esfera}
                              </p>
                            </div>
                          )}

                          {juiz.tribunal.uf && (
                            <div>
                              <p className="text-xs font-semibold uppercase text-default-400">
                                UF
                              </p>
                              <p className="mt-1 text-sm text-default-600">
                                {juiz.tribunal.uf}
                              </p>
                            </div>
                          )}

                          {juiz.tribunal.siteUrl && (
                            <div className="md:col-span-2">
                              <p className="text-xs font-semibold uppercase text-default-400">
                                Site
                              </p>
                              <a
                                className="mt-1 text-sm text-primary hover:underline flex items-center gap-1"
                                href={juiz.tribunal.siteUrl}
                                rel="noopener noreferrer"
                                target="_blank"
                              >
                                {juiz.tribunal.siteUrl}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardBody>
                </Card>

                {/* Especialidades */}
                {juiz.especialidades && juiz.especialidades.length > 0 && (
                  <Card className="border border-default-200">
                    <CardHeader>
                      <h4 className="text-lg font-semibold flex items-center gap-2">
                        <BookOpen className="h-5 w-5" />
                        Especialidades
                      </h4>
                    </CardHeader>
                    <Divider />
                    <CardBody>
                      <div className="flex flex-wrap gap-2">
                        {juiz.especialidades.map((especialidade) => (
                          <Chip
                            key={especialidade}
                            color="primary"
                            variant="flat"
                          >
                            {especialidade}
                          </Chip>
                        ))}
                      </div>
                    </CardBody>
                  </Card>
                )}

                {/* Formação e Experiência */}
                {(juiz.formacao || juiz.experiencia || juiz.biografia) && (
                  <Card className="border border-default-200">
                    <CardHeader>
                      <h4 className="text-lg font-semibold flex items-center gap-2">
                        <GraduationCap className="h-5 w-5" />
                        Formação e Experiência
                      </h4>
                    </CardHeader>
                    <Divider />
                    <CardBody className="space-y-4">
                      {juiz.formacao && (
                        <div>
                          <p className="text-xs font-semibold uppercase text-default-400">
                            Formação
                          </p>
                          <p className="mt-1 text-sm text-default-600 whitespace-pre-line">
                            {juiz.formacao}
                          </p>
                        </div>
                      )}

                      {juiz.experiencia && (
                        <div>
                          <p className="text-xs font-semibold uppercase text-default-400">
                            Experiência
                          </p>
                          <p className="mt-1 text-sm text-default-600 whitespace-pre-line">
                            {juiz.experiencia}
                          </p>
                        </div>
                      )}

                      {juiz.biografia && (
                        <div>
                          <p className="text-xs font-semibold uppercase text-default-400">
                            Biografia
                          </p>
                          <p className="mt-1 text-sm text-default-600 whitespace-pre-line">
                            {juiz.biografia}
                          </p>
                        </div>
                      )}
                    </CardBody>
                  </Card>
                )}

                {/* Premios e Publicações */}
                {(juiz.premios || juiz.publicacoes) && (
                  <Card className="border border-default-200">
                    <CardHeader>
                      <h4 className="text-lg font-semibold flex items-center gap-2">
                        <Award className="h-5 w-5" />
                        Prêmios e Publicações
                      </h4>
                    </CardHeader>
                    <Divider />
                    <CardBody className="space-y-4">
                      {juiz.premios && (
                        <div>
                          <p className="text-xs font-semibold uppercase text-default-400">
                            Prêmios
                          </p>
                          <p className="mt-1 text-sm text-default-600 whitespace-pre-line">
                            {juiz.premios}
                          </p>
                        </div>
                      )}

                      {juiz.publicacoes && (
                        <div>
                          <p className="text-xs font-semibold uppercase text-default-400">
                            Publicações
                          </p>
                          <p className="mt-1 text-sm text-default-600 whitespace-pre-line">
                            {juiz.publicacoes}
                          </p>
                        </div>
                      )}
                    </CardBody>
                  </Card>
                )}

                {/* Links e Redes Sociais */}
                {(juiz.website ||
                  juiz.linkedin ||
                  juiz.twitter ||
                  juiz.instagram) && (
                  <Card className="border border-default-200">
                    <CardHeader>
                      <h4 className="text-lg font-semibold flex items-center gap-2">
                        <Globe className="h-5 w-5" />
                        Links e Redes Sociais
                      </h4>
                    </CardHeader>
                    <Divider />
                    <CardBody>
                      <div className="flex flex-wrap gap-3">
                        {juiz.website && (
                          <a
                            className="flex items-center gap-2 text-sm text-primary hover:underline"
                            href={juiz.website}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            <Globe className="h-4 w-4" />
                            Website
                          </a>
                        )}

                        {juiz.linkedin && (
                          <a
                            className="flex items-center gap-2 text-sm text-primary hover:underline"
                            href={juiz.linkedin}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            <Linkedin className="h-4 w-4" />
                            LinkedIn
                          </a>
                        )}

                        {juiz.twitter && (
                          <a
                            className="flex items-center gap-2 text-sm text-primary hover:underline"
                            href={juiz.twitter}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            <Twitter className="h-4 w-4" />
                            Twitter
                          </a>
                        )}

                        {juiz.instagram && (
                          <a
                            className="flex items-center gap-2 text-sm text-primary hover:underline"
                            href={juiz.instagram}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            <Instagram className="h-4 w-4" />
                            Instagram
                          </a>
                        )}
                      </div>
                    </CardBody>
                  </Card>
                )}

                {/* Observações */}
                {juiz.observacoes && (
                  <Card className="border border-default-200">
                    <CardHeader>
                      <h4 className="text-lg font-semibold flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Observações
                      </h4>
                    </CardHeader>
                    <Divider />
                    <CardBody>
                      <p className="text-sm text-default-600 whitespace-pre-line">
                        {juiz.observacoes}
                      </p>
                    </CardBody>
                  </Card>
                )}
              </div>
            </Tab>

            <Tab
              key="processos"
              title={
                <div className="flex items-center gap-2">
                  <Scale className="h-4 w-4" />
                  <span>Processos</span>
                  {processos.length > 0 && (
                    <Chip size="sm" variant="flat">
                      {processos.length}
                    </Chip>
                  )}
                </div>
              }
            >
              <div className="mt-4 space-y-4">
                {isLoadingProcessos ? (
                  <div className="flex justify-center py-8">
                    <Spinner />
                  </div>
                ) : processos.length === 0 ? (
                  <Card className="border border-default-200">
                    <CardBody className="py-12 text-center">
                      <Scale className="mx-auto h-12 w-12 text-default-300" />
                      <p className="mt-4 text-lg font-semibold text-default-600">
                        Nenhum processo encontrado
                      </p>
                      <p className="text-sm text-default-500">
                        Este juiz não possui processos cadastrados no sistema.
                      </p>
                    </CardBody>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {processos.map((processo) => (
                      <Card
                        key={processo.id}
                        className="border border-default-200"
                      >
                        <CardBody className="gap-2">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Chip color="primary" size="sm" variant="flat">
                                  {processo.status}
                                </Chip>
                                <span className="text-sm font-semibold text-default-700">
                                  {processo.numero}
                                </span>
                                {processo.numeroCnj &&
                                  processo.numeroCnj !== processo.numero && (
                                    <span className="text-xs text-default-500">
                                      CNJ: {processo.numeroCnj}
                                    </span>
                                  )}
                              </div>

                              {processo.titulo && (
                                <p className="text-sm text-default-600 mt-1">
                                  {processo.titulo}
                                </p>
                              )}

                              <div className="flex flex-wrap gap-3 text-xs text-default-500 mt-2">
                                <span className="flex items-center gap-1">
                                  {processo.cliente.tipoPessoa ===
                                  "JURIDICA" ? (
                                    <Building2 className="h-3 w-3" />
                                  ) : (
                                    <User className="h-3 w-3" />
                                  )}
                                  {processo.cliente.nome}
                                </span>

                                {processo.area && (
                                  <span className="flex items-center gap-1">
                                    <Briefcase className="h-3 w-3" />
                                    {processo.area.nome}
                                  </span>
                                )}

                                {processo.fase && (
                                  <span className="flex items-center gap-1">
                                    <Flag className="h-3 w-3" />
                                    {processo.fase}
                                  </span>
                                )}

                                {processo.grau && (
                                  <span className="flex items-center gap-1">
                                    <Layers className="h-3 w-3" />
                                    {processo.grau}
                                  </span>
                                )}

                                {processo.dataDistribuicao && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {DateUtils.formatDate(
                                      processo.dataDistribuicao,
                                    )}
                                  </span>
                                )}

                                {processo.valorCausa && (
                                  <span className="flex items-center gap-1">
                                    <DollarSign className="h-3 w-3" />
                                    {Number(processo.valorCausa).toLocaleString(
                                      "pt-BR",
                                      {
                                        style: "currency",
                                        currency: "BRL",
                                      },
                                    )}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardBody>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </Tab>

            <Tab
              key="julgamentos"
              title={
                <div className="flex items-center gap-2">
                  <Gavel className="h-4 w-4" />
                  <span>Decisões</span>
                  {julgamentos.length > 0 && (
                    <Chip size="sm" variant="flat">
                      {julgamentos.length}
                    </Chip>
                  )}
                </div>
              }
            >
              <div className="mt-4 space-y-4">
                {isLoadingJulgamentos ? (
                  <div className="flex justify-center py-8">
                    <Spinner />
                  </div>
                ) : julgamentos.length === 0 ? (
                  <Card className="border border-default-200">
                    <CardBody className="py-12 text-center">
                      <Gavel className="mx-auto h-12 w-12 text-default-300" />
                      <p className="mt-4 text-lg font-semibold text-default-600">
                        Nenhuma decisão encontrada
                      </p>
                      <p className="text-sm text-default-500">
                        Este juiz não possui decisões cadastradas no sistema.
                      </p>
                    </CardBody>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {julgamentos.map((julgamento) => (
                      <Card
                        key={julgamento.id}
                        className="border border-default-200"
                      >
                        <CardBody className="gap-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Chip
                                  color="secondary"
                                  size="sm"
                                  variant="flat"
                                >
                                  {julgamento.tipoJulgamento}
                                </Chip>
                                <span className="text-sm font-semibold text-default-700">
                                  {julgamento.titulo}
                                </span>
                                <span className="text-xs text-default-400">
                                  {DateUtils.formatDate(
                                    julgamento.dataJulgamento,
                                  )}
                                </span>
                              </div>

                              {julgamento.descricao && (
                                <p className="text-sm text-default-600 mt-2">
                                  {julgamento.descricao}
                                </p>
                              )}

                              {julgamento.resultado && (
                                <div className="mt-2">
                                  <p className="text-xs font-semibold uppercase text-default-400">
                                    Resultado
                                  </p>
                                  <p className="text-sm text-default-600 mt-1">
                                    {julgamento.resultado}
                                  </p>
                                </div>
                              )}

                              {julgamento.processo && (
                                <div className="mt-2">
                                  <p className="text-xs font-semibold uppercase text-default-400">
                                    Processo
                                  </p>
                                  <p className="text-sm text-default-600 mt-1">
                                    {julgamento.processo.numero} -{" "}
                                    {julgamento.processo.titulo || "Sem título"}
                                  </p>
                                </div>
                              )}

                              <div className="flex flex-wrap gap-2 mt-3">
                                {julgamento.valorCausa && (
                                  <Chip
                                    className="whitespace-nowrap"
                                    color="default"
                                    size="sm"
                                    variant="flat"
                                  >
                                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                                      <DollarSign className="h-3 w-3 shrink-0" />
                                      <span>
                                        Causa:{" "}
                                        {Number(
                                          julgamento.valorCausa,
                                        ).toLocaleString("pt-BR", {
                                          style: "currency",
                                          currency: "BRL",
                                        })}
                                      </span>
                                    </span>
                                  </Chip>
                                )}

                                {julgamento.valorCondenacao && (
                                  <Chip
                                    className="whitespace-nowrap"
                                    color="success"
                                    size="sm"
                                    variant="flat"
                                  >
                                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                                      <DollarSign className="h-3 w-3 shrink-0" />
                                    Condenação:{" "}
                                    {Number(
                                      julgamento.valorCondenacao,
                                    ).toLocaleString("pt-BR", {
                                      style: "currency",
                                      currency: "BRL",
                                    })}
                                    </span>
                                  </Chip>
                                )}
                              </div>

                              {julgamento.tags &&
                                julgamento.tags.length > 0 && (
                                  <div className="mt-3">
                                    <p className="text-xs font-semibold uppercase text-default-400 mb-2">
                                      Tags
                                    </p>
                                    <div className="flex flex-wrap gap-1">
                                      {julgamento.tags.map((tag) => (
                                        <Chip
                                          key={tag}
                                          color="primary"
                                          size="sm"
                                          variant="flat"
                                        >
                                          {tag}
                                        </Chip>
                                      ))}
                                    </div>
                                  </div>
                                )}
                            </div>
                          </div>

                          {/* Pontos Positivos e Negativos */}
                          {(julgamento.pontosPositivos.length > 0 ||
                            julgamento.pontosNegativos.length > 0) && (
                            <div className="grid gap-3 md:grid-cols-2 mt-4">
                              {julgamento.pontosPositivos.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold uppercase text-default-400 mb-2 flex items-center gap-1">
                                    <TrendingUp className="h-3 w-3" />
                                    Pontos Positivos
                                  </p>
                                  <ul className="space-y-1">
                                    {julgamento.pontosPositivos.map(
                                      (ponto, index) => (
                                        <li
                                          key={index}
                                          className="text-xs text-success-600 flex items-start gap-2"
                                        >
                                          <span className="text-success-500 mt-1">
                                            •
                                          </span>
                                          {ponto}
                                        </li>
                                      ),
                                    )}
                                  </ul>
                                </div>
                              )}

                              {julgamento.pontosNegativos.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold uppercase text-default-400 mb-2 flex items-center gap-1">
                                    <TrendingDown className="h-3 w-3" />
                                    Pontos Negativos
                                  </p>
                                  <ul className="space-y-1">
                                    {julgamento.pontosNegativos.map(
                                      (ponto, index) => (
                                        <li
                                          key={index}
                                          className="text-xs text-danger-600 flex items-start gap-2"
                                        >
                                          <span className="text-danger-500 mt-1">
                                            •
                                          </span>
                                          {ponto}
                                        </li>
                                      ),
                                    )}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Estratégias e Recomendações */}
                          {(julgamento.estrategias.length > 0 ||
                            julgamento.recomendacoes.length > 0) && (
                            <div className="grid gap-3 md:grid-cols-2 mt-4">
                              {julgamento.estrategias.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold uppercase text-default-400 mb-2 flex items-center gap-1">
                                    <Target className="h-3 w-3" />
                                    Estratégias
                                  </p>
                                  <ul className="space-y-1">
                                    {julgamento.estrategias.map(
                                      (estrategia, index) => (
                                        <li
                                          key={index}
                                          className="text-xs text-primary-600 flex items-start gap-2"
                                        >
                                          <span className="text-primary-500 mt-1">
                                            •
                                          </span>
                                          {estrategia}
                                        </li>
                                      ),
                                    )}
                                  </ul>
                                </div>
                              )}

                              {julgamento.recomendacoes.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold uppercase text-default-400 mb-2 flex items-center gap-1">
                                    <Lightbulb className="h-3 w-3" />
                                    Recomendações
                                  </p>
                                  <ul className="space-y-1">
                                    {julgamento.recomendacoes.map(
                                      (recomendacao, index) => (
                                        <li
                                          key={index}
                                          className="text-xs text-warning-600 flex items-start gap-2"
                                        >
                                          <span className="text-warning-500 mt-1">
                                            •
                                          </span>
                                          {recomendacao}
                                        </li>
                                      ),
                                    )}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}

                          {julgamento.observacoes && (
                            <div className="mt-4">
                              <p className="text-xs font-semibold uppercase text-default-400 mb-2">
                                Observações
                              </p>
                              <p className="text-xs text-default-500 whitespace-pre-line">
                                {julgamento.observacoes}
                              </p>
                            </div>
                          )}
                        </CardBody>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </Tab>

            <Tab
              key="estatisticas"
              title={
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  <span>Estatísticas</span>
                </div>
              }
            >
              <div className="mt-4 space-y-4">
                <Card className="border border-default-200">
                  <CardHeader>
                    <h4 className="text-lg font-semibold flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Resumo de Atividades
                    </h4>
                  </CardHeader>
                  <Divider />
                  <CardBody>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-primary">
                          {juiz._count?.processos || 0}
                        </div>
                        <div className="text-xs text-default-500">
                          Processos
                        </div>
                      </div>

                      <div className="text-center">
                        <div className="text-2xl font-bold text-secondary">
                          {juiz._count?.julgamentos || 0}
                        </div>
                        <div className="text-xs text-default-500">
                          Julgamentos
                        </div>
                      </div>

                      <div className="text-center">
                        <div className="text-2xl font-bold text-warning">
                          {juiz._count?.analises || 0}
                        </div>
                        <div className="text-xs text-default-500">Análises</div>
                      </div>

                      <div className="text-center">
                        <div className="text-2xl font-bold text-success">
                          {juiz._count?.favoritos || 0}
                        </div>
                        <div className="text-xs text-default-500">
                          Favoritos
                        </div>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              </div>
            </Tab>
          </Tabs>
        </ModalBody>

        <ModalFooter>
          <Button color="primary" onPress={onClose}>
            Fechar
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
