"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Button, Card, CardBody, CardHeader, Chip, Avatar, Spinner, Input, Modal, ModalContent, ModalBody, ModalFooter, Textarea, Divider, Badge, Tooltip, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Pagination, Tabs, Tab, Switch, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, type ChipProps, Select, SelectItem } from "@heroui/react";
import {
  Users,
  Shield,
  Link as LinkIcon,
  Eye,
  Edit,
  Trash2,
  MoreVertical,
  Plus,
  Search,
  Filter,
  XCircle,
  RotateCcw,
  CheckCircle,
  X,
  Clock,
  Mail,
  User,
  Award,
  Crown,
  Activity,
  Download,
  Settings,
  HelpCircle,
  RefreshCw,
  Calendar,
  FileText,
  CreditCard,
  Image,
  Phone,
  TrendingUp,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { useSession } from "next-auth/react";
import { MapPin, History as HistoryIcon } from "lucide-react";
import useSWR from "swr";

import { UserRole } from "@/generated/prisma";
import {
  getCargos,
  getUsuariosEquipe,
  getDashboardEquipe,
  createCargo,
  updateCargo,
  deleteCargo,
  updateUsuarioEquipe,
  adicionarPermissaoIndividual,
  vincularUsuarioAdvogado,
  getPermissoesEfetivas,
  getEquipeHistorico,
  uploadAvatarUsuarioEquipe,
  type CargoData,
  type UsuarioEquipeData,
  type EquipeHistoricoData,
} from "@/app/actions/equipe";
import { getConvitesEquipe, createConviteEquipe, resendConviteEquipe, cancelConviteEquipe, type ConviteEquipeData, type CreateConviteData } from "@/app/actions/convites-equipe";
import { getAdvogados } from "@/app/actions/advogados";
import { EnderecoManager } from "@/components/endereco-manager";
import { useModulosTenant, useCargos } from "@/app/hooks/use-equipe";
import { ModalHeaderGradient } from "@/components/ui/modal-header-gradient";
import { ModalSectionCard } from "@/components/ui/modal-section-card";
import {
  PeopleEntityCard,
  PeopleEntityCardBody,
  PeopleEntityCardHeader,
  PeopleMetricCard,
  PeoplePageHeader,
} from "@/components/people-ui";
import { DateInput } from "@/components/ui/date-input";

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 140,
      damping: 18,
    },
  },
};

const fadeInUp = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: "easeOut" },
  },
};

function getRoleLabelPtBr(role: UserRole | string): string {
  const labels: Record<string, string> = {
    ADMIN: "Administrador",
    ADVOGADO: "Advogado (legado)",
    SECRETARIA: "Secretária",
    FINANCEIRO: "Financeiro",
    CLIENTE: "Cliente",
    SUPER_ADMIN: "Super Admin",
  };

  return labels[String(role)] || String(role);
}

function getRoleFromCargoNivel(nivel?: number): UserRole {
  if (!nivel) {
    return UserRole.SECRETARIA;
  }

  if (nivel >= 4) {
    return UserRole.ADMIN;
  }

  if (nivel === 3) {
    return UserRole.FINANCEIRO;
  }

  return UserRole.SECRETARIA;
}

// ===== COMPONENTES =====

function DashboardEquipe() {
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const data = await getDashboardEquipe();

        setDashboardData(data);
      } catch (error) {
        toast.error("Erro ao carregar dados do dashboard");
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-32">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!dashboardData) {
    return <div>Erro ao carregar dashboard</div>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <PeopleMetricCard
        helper="Funcionários ativos do escritório"
        icon={<Users className="h-4 w-4" />}
        label="Total de funcionários"
        tone="primary"
        value={dashboardData.totalUsuarios}
      />
      <PeopleMetricCard
        helper="Perfis de acesso configurados"
        icon={<Shield className="h-4 w-4" />}
        label="Cargos ativos"
        tone="success"
        value={dashboardData.totalCargos}
      />
      <PeopleMetricCard
        helper="Pendentes de aceite"
        icon={<Mail className="h-4 w-4" />}
        label="Convites pendentes"
        tone="warning"
        value={dashboardData.convitesPendentes}
      />
      <PeopleMetricCard
        helper="Relações funcionário-advogado"
        icon={<LinkIcon className="h-4 w-4" />}
        label="Vinculações ativas"
        tone="secondary"
        value={dashboardData.vinculacoesAtivas}
      />
    </div>
  );
}

function CargosTab() {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role as UserRole | undefined;
  const isAdmin = userRole === UserRole.ADMIN || userRole === UserRole.SUPER_ADMIN;

  const [cargos, setCargos] = useState<CargoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCargo, setEditingCargo] = useState<CargoData | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedNivel, setSelectedNivel] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(6);

  // Buscar módulos do tenant via hook
  const { modulos: modulosData, isLoading: modulosLoading } = useModulosTenant();

  // Transformar módulos do tenant para o formato esperado
  const modulos = useMemo(() => {
    return modulosData.map((m) => ({
      key: m.slug,
      label: m.nome,
      description: m.descricao,
    }));
  }, [modulosData]);

  const acoes = [
    { key: "visualizar", label: "Visualizar" },
    { key: "criar", label: "Criar" },
    { key: "editar", label: "Editar" },
    { key: "excluir", label: "Excluir" },
  ];

  useEffect(() => {
    loadCargos();
  }, []);

  async function loadCargos() {
    try {
      setLoading(true);
      setError(null);
      const data = await getCargos();

      setCargos(data);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao carregar cargos. Tente novamente.";

      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteCargo(cargoId: string) {
    if (!isAdmin) {
      toast.error("Apenas administradores podem excluir cargos");

      return;
    }

    // Encontrar o cargo para mostrar o nome
    const cargo = cargos.find((c) => c.id === cargoId);
    const cargoNome = cargo?.nome || "este cargo";

    if (!confirm(`Tem certeza que deseja excluir o cargo "${cargoNome}"?\n\nEsta ação não pode ser desfeita e pode afetar usuários vinculados a este cargo.`)) {
      return;
    }

    try {
      setActionLoading(cargoId);
      await deleteCargo(cargoId);
      toast.success(`Cargo "${cargoNome}" excluído com sucesso!`);
      loadCargos();
    } catch (error) {
      toast.error("Erro ao excluir cargo. Verifique se não há usuários vinculados a este cargo.");
    } finally {
      setActionLoading(null);
    }
  }

  function handleEditCargo(cargo: CargoData) {
    if (!isAdmin) {
      toast.error("Apenas administradores podem editar cargos");

      return;
    }

    setEditingCargo(cargo);
    setModalOpen(true);
  }

  function getNivelLabel(nivel: number) {
    const niveis = {
      1: "Estagiário",
      2: "Assistente",
      3: "Analista",
      4: "Coordenador",
      5: "Diretor",
    };

    return niveis[nivel as keyof typeof niveis] || "Nível " + nivel;
  }

  function getNivelColor(nivel: number): ChipProps["color"] {
    const colors: Record<number, ChipProps["color"]> = {
      1: "default",
      2: "primary",
      3: "secondary",
      4: "warning",
      5: "danger",
    };

    return colors[nivel] ?? "default";
  }

  function handleExportCargos() {
    try {
      const csvContent = [
        // Cabeçalho
        ["Nome", "Descrição", "Nível", "Status", "Usuários", "Permissões"].join(","),
        // Dados
        ...filteredCargos.map((cargo) =>
          [
            `"${cargo.nome}"`,
            `"${cargo.descricao || ""}"`,
            `"${getNivelLabel(cargo.nivel)}"`,
            `"${cargo.ativo ? "Ativo" : "Inativo"}"`,
            `"${cargo.usuariosCount}"`,
            `"${cargo.permissoes.length}"`,
          ].join(",")
        ),
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);

      link.setAttribute("href", url);
      link.setAttribute("download", `equipe-cargos-${new Date().toISOString().split("T")[0]}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success("Dados exportados com sucesso!");
    } catch (error) {
      toast.error("Erro ao exportar dados");
    }
  }

  // Filtros
  const filteredCargos = useMemo(() => {
    return cargos.filter((cargo) => {
      const matchesSearch = cargo.nome.toLowerCase().includes(searchTerm.toLowerCase()) || cargo.descricao?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesNivel = selectedNivel === "all" || cargo.nivel.toString() === selectedNivel;

      return matchesSearch && matchesNivel;
    });
  }, [cargos, searchTerm, selectedNivel]);

  // Paginação
  const totalPages = Math.ceil(filteredCargos.length / itemsPerPage);
  const paginatedCargos = filteredCargos.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (loading || modulosLoading) {
    return (
      <div className="flex justify-center items-center h-32">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <motion.div animate="visible" className="space-y-6" initial="hidden" variants={containerVariants}>
      {/* Header com busca e filtros */}
      <motion.div variants={cardVariants}>
        <Card className="border-none bg-white/90 shadow-lg backdrop-blur dark:bg-content2/80">
          <CardBody className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center flex-1">
                <div className="relative flex-1 max-w-md">
                  <Input
                    endContent={
                      searchTerm && (
                        <Button isIconOnly size="sm" variant="light" onPress={() => setSearchTerm("")}>
                          <X className="w-4 h-4" />
                        </Button>
                      )
                    }
                    placeholder="Buscar cargos..."
                    startContent={<Search className="w-4 h-4 text-default-400" />}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                <Button startContent={<Filter className="w-4 h-4" />} variant="light" onPress={() => setShowFilters(!showFilters)}>
                  Filtros
                </Button>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <Button className="w-full sm:w-auto" size="sm" startContent={<Download className="w-4 h-4" />} variant="light" onPress={() => handleExportCargos()}>
                  Exportar
                </Button>
                {isAdmin ? (
                  <Button
                    className="w-full sm:w-auto"
                    color="primary"
                    size="sm"
                    startContent={<Plus className="w-4 h-4" />}
                    onPress={() => {
                      setEditingCargo(null);
                      setModalOpen(true);
                    }}
                  >
                    <span className="hidden sm:inline">Novo Cargo</span>
                    <span className="sm:hidden">Novo</span>
                  </Button>
                ) : null}
              </div>
            </div>

            {/* Filtros expandidos */}
            <AnimatePresence>
              {showFilters && (
                <motion.div animate={{ opacity: 1, height: "auto" }} className="overflow-hidden" exit={{ opacity: 0, height: 0 }} initial={{ opacity: 0, height: 0 }}>
                  <div className="flex flex-wrap gap-2 sm:gap-3 md:gap-4 rounded-2xl border border-dashed border-default-200 bg-white/70 p-3 sm:p-4 dark:border-default-100/40 dark:bg-content1/60">
                    <Select
                      className="min-w-[140px] sm:min-w-40 flex-1 sm:flex-none"
                      label="Nível do cargo"
                      placeholder="Todos os níveis"
                      selectedKeys={selectedNivel === "all" ? [] : [selectedNivel]}
                      onSelectionChange={(keys) => {
                        const selected = Array.from(keys)[0] as string;

                        setSelectedNivel(selected || "all");
                      }}
                    >
                      <SelectItem key="all" textValue="Todos">Todos</SelectItem>
                      <SelectItem key="1" textValue="Estagiário">Estagiário</SelectItem>
                      <SelectItem key="2" textValue="Assistente">Assistente</SelectItem>
                      <SelectItem key="3" textValue="Analista">Analista</SelectItem>
                      <SelectItem key="4" textValue="Coordenador">Coordenador</SelectItem>
                      <SelectItem key="5" textValue="Diretor">Diretor</SelectItem>
                    </Select>

                    <Button
                      startContent={<RotateCcw className="w-4 h-4" />}
                      variant="light"
                      onPress={() => {
                        setSearchTerm("");
                        setSelectedNivel("all");
                      }}
                    >
                      Limpar filtros
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardBody>
        </Card>
      </motion.div>

      {/* Grid de cargos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 auto-rows-fr">
        {paginatedCargos.map((cargo) => (
          <motion.div key={cargo.id} animate={{ opacity: 1, y: 0 }} className="flex" initial={{ opacity: 0, y: 20 }} transition={{ duration: 0.3 }}>
            <Card className="h-full w-full hover:shadow-lg transition-shadow flex flex-col">
              <CardHeader
                className={`flex flex-col items-start gap-3 pb-2 flex-shrink-0 ${isAdmin ? "cursor-pointer" : ""}`}
                onClick={() => {
                  if (isAdmin) {
                    handleEditCargo(cargo);
                  }
                }}
              >
                <div className="flex w-full items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="p-2 rounded-lg bg-default-100 dark:bg-default-50 flex-shrink-0">
                      <Shield className="w-5 h-5 text-default-600 dark:text-default-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base sm:text-lg md:text-xl font-bold text-slate-900 dark:text-slate-100 mb-2 line-clamp-2 break-words">{cargo.nome}</h3>
                      <Tooltip content={`Nível ${cargo.nivel} - ${getNivelLabel(cargo.nivel)}`}>
                        <Chip color={getNivelColor(cargo.nivel)} size="sm" startContent={<Crown className="w-3 h-3" />} variant="flat">
                          {getNivelLabel(cargo.nivel)}
                        </Chip>
                      </Tooltip>
                    </div>
                  </div>
                  {isAdmin ? (
                    <Dropdown>
                      <DropdownTrigger>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownTrigger>
                      <DropdownMenu
                        onAction={(key) => {
                          if (key === "edit") {
                            handleEditCargo(cargo);
                          } else if (key === "delete") {
                            handleDeleteCargo(cargo.id);
                          }
                        }}
                      >
                        <DropdownItem key="edit" startContent={<Edit className="w-4 h-4" />}>
                          Editar
                        </DropdownItem>
                        <DropdownItem
                          key="delete"
                          className="text-danger"
                          color="danger"
                          isDisabled={actionLoading === cargo.id}
                          startContent={actionLoading === cargo.id ? <Spinner size="sm" /> : <Trash2 className="w-4 h-4" />}
                        >
                          {actionLoading === cargo.id ? "Excluindo..." : "Excluir"}
                        </DropdownItem>
                      </DropdownMenu>
                    </Dropdown>
                  ) : null}
                </div>
                {cargo.descricao && <p className="text-sm text-default-500 line-clamp-2 mt-2">{cargo.descricao}</p>}
              </CardHeader>
              <Divider />
              <CardBody className="pt-4 flex-1 flex flex-col">
                <div className="space-y-3 flex-1">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-default-400" />
                      <span className="text-sm text-default-600">{cargo.usuariosCount} usuário(s)</span>
                    </div>
                    <Badge color="primary" content={cargo.permissoes.length}>
                      <Chip color="primary" size="sm" startContent={<Shield className="w-3 h-3" />} variant="flat">
                        Permissões
                      </Chip>
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-default-200 dark:border-default-100">
                    <div className="flex items-center gap-2">
                      <Switch isDisabled color={cargo.ativo ? "success" : "default"} isSelected={cargo.ativo} size="sm" />
                      <span className="text-sm text-default-600">{cargo.ativo ? "Ativo" : "Inativo"}</span>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex justify-center">
          <Pagination showControls showShadow page={currentPage} total={totalPages} onChange={setCurrentPage} />
        </div>
      )}

      {/* Estado de erro */}
      {error && !loading && (
        <motion.div variants={cardVariants}>
          <Card className="border-none bg-danger-50/60 text-danger-700 shadow-lg dark:bg-danger-500/10 dark:text-danger-300">
            <CardBody className="flex flex-col items-start gap-3">
              <div className="flex items-center gap-2 text-sm">
                <XCircle className="h-4 w-4" />
                <span>Erro ao carregar cargos</span>
              </div>
              <p className="text-sm text-danger-600/80 dark:text-danger-200/80">{error}</p>
              <Button size="sm" startContent={<RefreshCw className="w-4 h-4" />} variant="bordered" onPress={() => loadCargos()}>
                Tentar novamente
              </Button>
            </CardBody>
          </Card>
        </motion.div>
      )}

      {/* Estado vazio */}
      {filteredCargos.length === 0 && !loading && !error && (
        <motion.div variants={cardVariants}>
          <Card className="border-none bg-dotted-pattern bg-white/90 py-12 text-center shadow-lg dark:bg-content2/80">
            <CardBody className="space-y-3">
              <Users className="mx-auto h-10 w-10 text-default-400" />
              <h3 className="text-lg font-semibold">Nenhum cargo encontrado</h3>
              <p className="text-sm text-default-500">
                {searchTerm || selectedNivel !== "all" ? "Ajuste os filtros de busca para visualizar outros cargos." : "Crie o primeiro cargo para organizar a sua equipe."}
              </p>
              {isAdmin ? (
                <Button
                  color="primary"
                  startContent={<Plus className="w-4 h-4" />}
                  onPress={() => {
                    setEditingCargo(null);
                    setModalOpen(true);
                  }}
                >
                  Criar Cargo
                </Button>
              ) : null}
            </CardBody>
          </Card>
        </motion.div>
      )}

      {/* Modal de Cargo */}
      {isAdmin ? (
        <CargoModal
          acoes={acoes}
          cargo={editingCargo}
          isOpen={modalOpen}
          modulos={modulos}
          onClose={() => setModalOpen(false)}
          onSuccess={() => {
            setModalOpen(false);
            loadCargos();
          }}
        />
      ) : null}
    </motion.div>
  );
}

function CargoModal({
  isOpen,
  onClose,
  cargo,
  onSuccess,
  modulos,
  acoes,
}: {
  isOpen: boolean;
  onClose: () => void;
  cargo: CargoData | null;
  onSuccess: () => void;
  modulos: Array<{ key: string; label: string }>;
  acoes: Array<{ key: string; label: string }>;
}) {
  const [formData, setFormData] = useState({
    nome: "",
    descricao: "",
    nivel: 1,
    ativo: true,
    permissoes: [] as string[],
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (cargo) {
      setFormData({
        nome: cargo.nome,
        descricao: cargo.descricao || "",
        nivel: cargo.nivel,
        ativo: cargo.ativo,
        permissoes: cargo.permissoes.map((p) => `${p.modulo}-${p.acao}`),
      });
    } else {
      setFormData({
        nome: "",
        descricao: "",
        nivel: 1,
        ativo: true,
        permissoes: [],
      });
    }
  }, [cargo, isOpen]);

  function hasPermissao(modulo: string, acao: string) {
    return formData.permissoes.includes(`${modulo}-${acao}`);
  }

  function togglePermissao(modulo: string, acao: string, value?: boolean) {
    const permissao = `${modulo}-${acao}`;

    setFormData((prev) => {
      const permissoes = new Set(prev.permissoes);
      const shouldEnable = typeof value === "boolean" ? value : !permissoes.has(permissao);

      if (shouldEnable) {
        permissoes.add(permissao);
      } else {
        permissoes.delete(permissao);
      }

      return {
        ...prev,
        permissoes: Array.from(permissoes),
      };
    });
  }

  function toggleModuloCompleto(modulo: string, selecionar: boolean) {
    setFormData((prev) => {
      const permissoes = new Set(prev.permissoes);

      acoes.forEach((acao) => {
        const permissao = `${modulo}-${acao.key}`;

        if (selecionar) {
          permissoes.add(permissao);
        } else {
          permissoes.delete(permissao);
        }
      });

      return {
        ...prev,
        permissoes: Array.from(permissoes),
      };
    });
  }

  function toggleTodasPermissoes(selecionar: boolean) {
    if (selecionar) {
      const todas = modulos.flatMap((modulo) => acoes.map((acao) => `${modulo.key}-${acao.key}`));

      setFormData((prev) => ({
        ...prev,
        permissoes: Array.from(new Set([...prev.permissoes, ...todas])),
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        permissoes: [],
      }));
    }
  }

  async function handleSubmit() {
    // Validações
    if (!formData.nome.trim()) {
      toast.error("Nome do cargo é obrigatório");

      return;
    }

    if (formData.nome.trim().length < 2) {
      toast.error("Nome do cargo deve ter pelo menos 2 caracteres");

      return;
    }

    if (formData.nome.trim().length > 50) {
      toast.error("Nome do cargo deve ter no máximo 50 caracteres");

      return;
    }

    if (formData.descricao && formData.descricao.length > 500) {
      toast.error("Descrição deve ter no máximo 500 caracteres");

      return;
    }

    if (formData.permissoes.length === 0) {
      toast.error("Selecione pelo menos uma permissão para o cargo");

      return;
    }

    try {
      setLoading(true);

      const permissoesData = formData.permissoes.map((p) => {
        const [modulo, acao] = p.split("-");

        return { modulo, acao, permitido: true };
      });

      if (cargo) {
        await updateCargo(cargo.id, {
          nome: formData.nome,
          descricao: formData.descricao,
          nivel: formData.nivel,
          ativo: formData.ativo,
          permissoes: permissoesData,
        });
        toast.success("Cargo atualizado com sucesso!");
      } else {
        await createCargo({
          nome: formData.nome,
          descricao: formData.descricao,
          nivel: formData.nivel,
          permissoes: permissoesData,
        });
        toast.success("Cargo criado com sucesso!");
      }

      onSuccess();
    } catch (error) {
      toast.error("Erro ao salvar cargo");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} scrollBehavior="inside" size="5xl" onClose={onClose}>
      <ModalContent>
        <ModalHeaderGradient
          description={cargo ? "Atualize as informações e permissões do cargo" : "Crie um novo cargo e configure suas permissões no sistema"}
          icon={Shield}
          title={cargo ? "Editar Cargo" : "Novo Cargo"}
        />
        <ModalBody className="px-0">
          <div className="space-y-6 px-6 pb-6">
            {/* Card de Ajuda */}
            <ModalSectionCard description="Guia rápido para configurar as permissões" title="Como configurar o cargo">
              <ul className="list-disc list-inside space-y-2 text-sm text-default-600">
                <li>Selecione as ações que este cargo pode executar em cada módulo do sistema.</li>
                <li>
                  Use <strong className="text-primary">Selecionar tudo</strong> para liberar todas as permissões ou <strong className="text-primary">Limpar tudo</strong> para recomeçar.
                </li>
                <li>Cada módulo mostra quantas ações estão liberadas (ex.: 3/4).</li>
                <li>Você pode voltar e ajustar as permissões a qualquer momento após a criação.</li>
              </ul>
            </ModalSectionCard>

            {/* Dados Básicos */}
            <ModalSectionCard description="Informações principais do cargo" title="Dados Básicos">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  isRequired
                  label="Nome do Cargo"
                  placeholder="Ex: Analista Sênior"
                  startContent={<Shield className="w-4 h-4 text-default-400" />}
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                />

                <Select
                  description="Define a hierarquia do cargo no escritório"
                  label="Nível Hierárquico"
                  selectedKeys={[formData.nivel.toString()]}
                  startContent={<Award className="w-4 h-4 text-default-400" />}
                  onSelectionChange={(keys) => {
                    const nivel = parseInt(Array.from(keys)[0] as string);

                    setFormData({ ...formData, nivel });
                  }}
                >
                  <SelectItem key="1" textValue="Estagiário">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      <span>Estagiário</span>
                    </div>
                  </SelectItem>
                  <SelectItem key="2" textValue="Assistente">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      <span>Assistente</span>
                    </div>
                  </SelectItem>
                  <SelectItem key="3" textValue="Analista">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      <span>Analista</span>
                    </div>
                  </SelectItem>
                  <SelectItem key="4" textValue="Coordenador">
                    <div className="flex items-center gap-2">
                      <Crown className="w-4 h-4" />
                      <span>Coordenador</span>
                    </div>
                  </SelectItem>
                  <SelectItem key="5" textValue="Diretor">
                    <div className="flex items-center gap-2">
                      <Award className="w-4 h-4" />
                      <span>Diretor</span>
                    </div>
                  </SelectItem>
                </Select>
              </div>

              <Textarea
                description="Descrição detalhada das responsabilidades do cargo"
                label="Descrição"
                minRows={3}
                placeholder="Descreva as responsabilidades e funções deste cargo..."
                value={formData.descricao}
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
              />

              <div className="flex items-center justify-between p-4 rounded-lg border border-default-200 bg-default-50">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-default-700">Status do Cargo</span>
                  <span className="text-xs text-default-500">Cargos inativos não podem ser atribuídos a novos usuários</span>
                </div>
                <Switch color="primary" isSelected={formData.ativo} onValueChange={(checked) => setFormData({ ...formData, ativo: checked })}>
                  <span className="text-sm font-medium">{formData.ativo ? "Ativo" : "Inativo"}</span>
                </Switch>
              </div>
            </ModalSectionCard>

            {/* Permissões */}
            <ModalSectionCard description="Configure as ações que este cargo pode executar em cada módulo" title="Permissões do Sistema">
              <div className="space-y-4">
                {/* Toolbar de Permissões */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 rounded-lg border border-default-200 bg-default-50 dark:bg-default-50/5">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary-500/10 dark:bg-primary-500/20">
                      <Shield className="w-5 h-5 text-primary dark:text-primary-300" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-default-700 dark:text-default-200">
                        {formData.permissoes.length === 1 ? "1 permissão selecionada" : `${formData.permissoes.length} permissões selecionadas`}
                      </p>
                      <p className="text-xs text-default-500 dark:text-default-400">De {modulos.length * acoes.length} disponíveis</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      color="primary"
                      isDisabled={modulos.length === 0 || modulos.every((modulo) => acoes.every((acao) => formData.permissoes.includes(`${modulo.key}-${acao.key}`)))}
                      size="sm"
                      startContent={<CheckCircle className="w-4 h-4" />}
                      variant="flat"
                      onPress={() => toggleTodasPermissoes(true)}
                    >
                      Selecionar tudo
                    </Button>
                    <Button color="danger" isDisabled={formData.permissoes.length === 0} size="sm" startContent={<X className="w-4 h-4" />} variant="flat" onPress={() => toggleTodasPermissoes(false)}>
                      Limpar tudo
                    </Button>
                  </div>
                </div>

                {/* Lista de Módulos */}
                <div className="space-y-4">
                  {modulos.map((modulo) => {
                    const permissoesModulo = acoes.filter((acao) => hasPermissao(modulo.key, acao.key));
                    const todasSelecionadas = acoes.every((acao) => hasPermissao(modulo.key, acao.key));

                    return (
                      <Card key={modulo.key} className="border border-default-200 shadow-sm">
                        <CardBody className="p-5 space-y-4">
                          {/* Header do Módulo */}
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-default-200">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/30">
                                <Shield className="w-4 h-4 text-primary" />
                              </div>
                              <div>
                                <h5 className="font-semibold text-default-700 dark:text-default-200">{modulo.label}</h5>
                                <p className="text-xs text-default-500">Módulo do sistema</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <Chip color={permissoesModulo.length === acoes.length ? "success" : permissoesModulo.length > 0 ? "warning" : "default"} size="sm" variant="flat">
                                {permissoesModulo.length}/{acoes.length}
                              </Chip>
                              <Button color={todasSelecionadas ? "danger" : "primary"} size="sm" variant="flat" onPress={() => toggleModuloCompleto(modulo.key, !todasSelecionadas)}>
                                {todasSelecionadas ? (
                                  <>
                                    <X className="w-3 h-3 mr-1" />
                                    Remover todas
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="w-3 h-3 mr-1" />
                                    Selecionar todas
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>

                          {/* Lista de Ações */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {acoes.map((acao) => {
                              const selecionada = hasPermissao(modulo.key, acao.key);

                              return (
                                <div
                                  key={acao.key}
                                  className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                                    selecionada ? "border-primary-300 bg-primary-50 dark:border-primary-600 dark:bg-primary-900/20" : "border-default-200 bg-default-50 dark:bg-default-100/50"
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    {selecionada && <CheckCircle className="w-4 h-4 text-primary" />}
                                    <span className={`text-sm font-medium ${selecionada ? "text-primary-700 dark:text-primary-300" : "text-default-600"}`}>{acao.label}</span>
                                  </div>
                                  <Switch color="primary" isSelected={selecionada} size="sm" onValueChange={(value) => togglePermissao(modulo.key, acao.key, value)} />
                                </div>
                              );
                            })}
                          </div>
                        </CardBody>
                      </Card>
                    );
                  })}
                </div>
              </div>
            </ModalSectionCard>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>
            Cancelar
          </Button>
          <Button color="primary" isDisabled={!formData.nome.trim()} isLoading={loading} onPress={handleSubmit}>
            {cargo ? "Atualizar Cargo" : "Criar Cargo"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

// Componente para aba de Histórico
function UsuarioHistoricoTab({ usuarioId }: { usuarioId: string }) {
  const {
    data: historico,
    error,
    isLoading,
    mutate,
  } = useSWR(`equipe-historico-${usuarioId}`, () => getEquipeHistorico(usuarioId), {
    refreshInterval: 0,
    revalidateOnFocus: false,
  });

  const getAcaoColor = (acao: string): ChipProps["color"] => {
    switch (acao) {
      case "criado":
        return "success";
      case "editado":
        return "primary";
      case "cargo_alterado":
        return "warning";
      case "permissao_alterada":
        return "secondary";
      case "vinculacao_alterada":
        return "default";
      default:
        return "default";
    }
  };

  const getAcaoText = (acao: string) => {
    const labels: Record<string, string> = {
      criado: "Criado",
      editado: "Editado",
      cargo_alterado: "Cargo Alterado",
      permissao_alterada: "Permissão Alterada",
      vinculacao_alterada: "Vinculação Alterada",
    };

    return labels[acao] || acao;
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <XCircle className="w-12 h-12 text-danger mb-4" />
        <h4 className="text-lg font-semibold mb-2">Erro ao carregar histórico</h4>
        <p className="text-sm text-default-500 mb-4">{error instanceof Error ? error.message : "Erro desconhecido"}</p>
        <Button color="primary" size="sm" startContent={<RefreshCw className="w-4 h-4" />} variant="flat" onPress={() => mutate()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (!historico || historico.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <HistoryIcon className="w-12 h-12 text-default-300 mb-4" />
        <h4 className="text-lg font-semibold mb-2">Nenhum histórico encontrado</h4>
        <p className="text-sm text-default-500">Este usuário ainda não possui alterações registradas</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-default-500">Total de {historico.length} registro(s)</p>
        <Button size="sm" startContent={<RefreshCw className="w-4 h-4" />} variant="light" onPress={() => mutate()}>
          Atualizar
        </Button>
      </div>
      <div className="space-y-3 max-h-[500px] overflow-y-auto">
        {historico.map((item: EquipeHistoricoData) => (
          <Card key={item.id} className="border border-default-200">
            <CardBody className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Chip color={getAcaoColor(item.acao)} size="sm" variant="flat">
                      {getAcaoText(item.acao)}
                    </Chip>
                    {item.realizadoPorUsuario && (
                      <span className="text-xs text-default-500">
                        por {item.realizadoPorUsuario.firstName} {item.realizadoPorUsuario.lastName || item.realizadoPorUsuario.email}
                      </span>
                    )}
                  </div>
                  {item.motivo && (
                    <p className="text-sm text-default-600 mb-2">
                      <strong>Motivo:</strong> {item.motivo}
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-default-500">
                    <Calendar className="w-3 h-3" />
                    <span>{formatDate(item.createdAt)}</span>
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

function UsuariosTab() {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role as UserRole | undefined;
  const isAdmin = userRole === UserRole.ADMIN || userRole === UserRole.SUPER_ADMIN;

  const [usuarios, setUsuarios] = useState<UsuarioEquipeData[]>([]);
  const [advogados, setAdvogados] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Buscar módulos do tenant via hook
  const { modulos: modulosData } = useModulosTenant();

  // Buscar cargos via hook para o select
  const { cargos } = useCargos();

  // Transformar módulos para o formato esperado
  const modulos = useMemo(() => {
    return modulosData.map((m) => ({
      key: m.slug,
      label: m.nome,
      description: m.descricao,
    }));
  }, [modulosData]);

  const acoes = [
    { key: "visualizar", label: "Visualizar" },
    { key: "criar", label: "Criar" },
    { key: "editar", label: "Editar" },
    { key: "excluir", label: "Excluir" },
  ];
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRole, setSelectedRole] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedVinculacao, setSelectedVinculacao] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [selectedUsuario, setSelectedUsuario] = useState<UsuarioEquipeData | null>(null);
  const [editFormData, setEditFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    active: true,
    cpf: "",
    rg: "",
    dataNascimento: "",
    observacoes: "",
    role: "SECRETARIA" as string,
    avatarUrl: "",
    cargoId: "" as string | undefined,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [permissionsForm, setPermissionsForm] = useState<Record<string, Record<string, boolean>>>({});
  const [permissoesEfetivas, setPermissoesEfetivas] = useState<
    Array<{
      modulo: string;
      acao: string;
      permitido: boolean;
      origem: "override" | "cargo" | "role";
    }>
  >([]);
  const [linkForm, setLinkForm] = useState({
    advogadoIds: [] as string[],
    tipo: "assistente",
    observacoes: "",
  });
  const [isSavingPermission, setIsSavingPermission] = useState(false);
  const [isSavingLink, setIsSavingLink] = useState(false);
  const [loadingPermissoes, setLoadingPermissoes] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!advancedMode && isEditModalOpen && editFormData.cargoId) {
      const cargoSelecionado = cargos.find((c) => c.id === editFormData.cargoId);
      const roleSugerido = getRoleFromCargoNivel(cargoSelecionado?.nivel);

      if (editFormData.role !== roleSugerido) {
        setEditFormData((prev) => ({
          ...prev,
          role: roleSugerido,
        }));
      }
    }
  }, [advancedMode, isEditModalOpen, editFormData.cargoId, editFormData.role, cargos]);

  const advogadosOptions = useMemo(() => {
    return advogados.map((adv) => {
      const firstName = adv.usuario?.firstName ?? "";
      const lastName = adv.usuario?.lastName ?? "";
      const fullName = firstName || lastName ? `${firstName} ${lastName}`.trim() : (adv.usuario?.email ?? "Advogado(a) sem nome");
      const oabLabel = adv.oabNumero && adv.oabUf ? ` - OAB ${adv.oabNumero}/${adv.oabUf}` : "";

      return {
        id: adv.id as string,
        fullName,
        oabLabel,
        textValue: `${fullName}${oabLabel}`,
      };
    });
  }, [advogados]);

  const advogadoKeySet = useMemo(() => new Set(advogadosOptions.map((item) => item.id)), [advogadosOptions]);

  const validatedAdvogadoKeys = useMemo(() => {
    return linkForm.advogadoIds.filter((id) => advogadoKeySet.has(id));
  }, [linkForm.advogadoIds, advogadoKeySet]);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);
      const [usuariosData, advogadosData] = await Promise.all([getUsuariosEquipe(), getAdvogados()]);

      setUsuarios(usuariosData);
      if (advogadosData && advogadosData.success) {
        setAdvogados("advogados" in advogadosData && Array.isArray(advogadosData.advogados) ? advogadosData.advogados : []);
      } else {
        setAdvogados([]);
        if (advogadosData && "error" in advogadosData && advogadosData.error) {
          toast.warning(advogadosData.error);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao carregar dados. Tente novamente.";

      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  function handleViewUsuario(usuario: UsuarioEquipeData) {
    setSelectedUsuario(usuario);
    setIsViewModalOpen(true);
  }

  function handleEditUsuario(usuario: UsuarioEquipeData) {
    setSelectedUsuario(usuario);
    setEditFormData({
      firstName: usuario.firstName || "",
      lastName: usuario.lastName || "",
      email: usuario.email || "",
      phone: usuario.phone || "",
      active: usuario.active,
      cpf: usuario.cpf || "",
      rg: usuario.rg || "",
      dataNascimento: usuario.dataNascimento ? new Date(usuario.dataNascimento).toISOString().split("T")[0] : "",
      observacoes: usuario.observacoes || "",
      role: usuario.role || "SECRETARIA",
      avatarUrl: usuario.avatarUrl || "",
      cargoId: getCargoPrincipal(usuario)?.id || "",
    });
    setIsEditModalOpen(true);
  }

  async function handleSaveUsuario() {
    if (!selectedUsuario) return;

    setIsSaving(true);
    try {
      // Atualizar dados básicos do usuário
      await updateUsuarioEquipe(selectedUsuario.id, {
        firstName: editFormData.firstName || undefined,
        lastName: editFormData.lastName || undefined,
        email: editFormData.email,
        phone: editFormData.phone || undefined,
        active: editFormData.active,
        cpf: editFormData.cpf || null,
        rg: editFormData.rg || null,
        dataNascimento: editFormData.dataNascimento ? new Date(editFormData.dataNascimento) : null,
        observacoes: editFormData.observacoes || null,
        role: editFormData.role as any,
        avatarUrl: editFormData.avatarUrl || null,
      });

      // Atualizar cargo se foi alterado
      const cargoPrincipal = getCargoPrincipal(selectedUsuario);

      if (editFormData.cargoId && editFormData.cargoId !== cargoPrincipal?.id) {
        const { atribuirCargoUsuario } = await import("@/app/actions/equipe");

        await atribuirCargoUsuario(selectedUsuario.id, editFormData.cargoId);
      } else if (!editFormData.cargoId && cargoPrincipal) {
        // Se removeu o cargo, desativar cargo atual
        const { removerCargoUsuario } = await import("@/app/actions/equipe");

        await removerCargoUsuario(selectedUsuario.id, cargoPrincipal.id);
      }

      toast.success("Usuário atualizado com sucesso");
      setIsEditModalOpen(false);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar usuário");
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePermissionsUsuario(usuario: UsuarioEquipeData) {
    // Verificar se o usuário é admin antes de abrir o modal
    if (!isAdmin) {
      toast.error("Apenas administradores podem gerenciar permissões de usuários");

      return;
    }

    setSelectedUsuario(usuario);
    setIsPermissionsModalOpen(true);
    setLoadingPermissoes(true);

    try {
      // Buscar permissões efetivas (override + cargo + role)
      const efetivas = await getPermissoesEfetivas(usuario.id);

      setPermissoesEfetivas(efetivas);

      // Inicializar form apenas com overrides individuais
      const existingPerms: Record<string, Record<string, boolean>> = {};

      usuario.permissoesIndividuais.forEach((perm) => {
        if (!existingPerms[perm.modulo]) {
          existingPerms[perm.modulo] = {};
        }
        existingPerms[perm.modulo][perm.acao] = perm.permitido;
      });
      setPermissionsForm(existingPerms);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao carregar permissões efetivas";

      toast.error(errorMessage);
      // Fechar o modal em caso de erro
      setIsPermissionsModalOpen(false);
    } finally {
      setLoadingPermissoes(false);
    }
  }

  function handleLinkUsuario(usuario: UsuarioEquipeData) {
    setSelectedUsuario(usuario);
    setLinkForm({
      advogadoIds: [],
      tipo: "assistente",
      observacoes: "",
    });
    setIsLinkModalOpen(true);
  }

  function handleUsuarioAction(usuario: UsuarioEquipeData, actionKey: string) {
    if (actionKey === "view") {
      handleViewUsuario(usuario);

      return;
    }

    if (actionKey === "edit") {
      if (!isAdmin) {
        toast.error("Apenas administradores podem editar usuários");

        return;
      }
      handleEditUsuario(usuario);

      return;
    }

    if (actionKey === "permissions") {
      if (!advancedMode) {
        toast.error("Ative o modo avançado para editar permissões individuais");

        return;
      }
      handlePermissionsUsuario(usuario);

      return;
    }

    if (actionKey === "link") {
      handleLinkUsuario(usuario);
    }
  }

  async function handleSavePermission(modulo: string, acao: string, permitido: boolean) {
    if (!selectedUsuario) return;

    // Atualização otimista do estado local
    setPermissionsForm((prev) => {
      const updated = { ...prev };

      if (!updated[modulo]) {
        updated[modulo] = {};
      }
      updated[modulo] = { ...updated[modulo], [acao]: permitido };

      return updated;
    });

    setIsSavingPermission(true);
    try {
      await adicionarPermissaoIndividual(selectedUsuario.id, modulo, acao, permitido, `Permissão ${permitido ? "concedida" : "negada"} pelo admin`);
      toast.success("Permissão atualizada com sucesso");

      // Recarregar dados e atualizar usuário selecionado
      await loadData();

      // Atualizar permissões do usuário selecionado após reload
      const updatedUsuarios = await getUsuariosEquipe();
      const updatedUsuario = updatedUsuarios.find((u) => u.id === selectedUsuario.id);

      if (updatedUsuario) {
        const existingPerms: Record<string, Record<string, boolean>> = {};

        updatedUsuario.permissoesIndividuais.forEach((perm) => {
          if (!existingPerms[perm.modulo]) {
            existingPerms[perm.modulo] = {};
          }
          existingPerms[perm.modulo][perm.acao] = perm.permitido;
        });
        setPermissionsForm(existingPerms);
        setSelectedUsuario(updatedUsuario);

        // Recarregar permissões efetivas
        const efetivas = await getPermissoesEfetivas(updatedUsuario.id);

        setPermissoesEfetivas(efetivas);
      }
    } catch (error) {
      // Reverter atualização otimista em caso de erro
      setPermissionsForm((prev) => {
        const updated = { ...prev };

        if (updated[modulo] && updated[modulo][acao] !== undefined) {
          const reverted = { ...updated[modulo] };

          delete reverted[acao];
          updated[modulo] = reverted;
          if (Object.keys(updated[modulo]).length === 0) {
            delete updated[modulo];
          }
        }

        return updated;
      });
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar permissão");
    } finally {
      setIsSavingPermission(false);
    }
  }

  async function handleSaveLink() {
    if (!selectedUsuario || linkForm.advogadoIds.length === 0) {
      toast.error("Selecione pelo menos um advogado");

      return;
    }

    setIsSavingLink(true);
    try {
      // Vincular a múltiplos advogados
      await Promise.all(linkForm.advogadoIds.map((advogadoId) => vincularUsuarioAdvogado(selectedUsuario.id, advogadoId, linkForm.tipo, linkForm.observacoes || undefined)));
      toast.success(`Usuário vinculado a ${linkForm.advogadoIds.length} advogado(s) com sucesso`);
      setIsLinkModalOpen(false);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao vincular usuário");
    } finally {
      setIsSavingLink(false);
    }
  }

  function getRoleColor(role: string): ChipProps["color"] {
    const colors: Record<string, ChipProps["color"]> = {
      ADMIN: "danger",
      ADVOGADO: "primary",
      SECRETARIA: "secondary",
      FINANCEIRO: "success",
      CLIENTE: "warning",
      SUPER_ADMIN: "warning",
    };

    return colors[role] ?? "default";
  }

  function getRoleLabel(role: string) {
    const labels = {
      ADMIN: "Administrador",
      ADVOGADO: "Advogado (legado)",
      SECRETARIA: "Secretária",
      FINANCEIRO: "Financeiro",
      CLIENTE: "Cliente",
      SUPER_ADMIN: "Super Admin",
    };

    return labels[role as keyof typeof labels] || role;
  }

  function getRoleIcon(role: string) {
    const icons: Record<string, any> = {
      ADMIN: Shield,
      ADVOGADO: User,
      SECRETARIA: Settings,
      FINANCEIRO: Award,
      CLIENTE: User,
      SUPER_ADMIN: Crown,
    };
    const IconComponent = icons[role] || User;

    return <IconComponent className="w-3 h-3" />;
  }

  // Helper functions para Cargo como identificador principal
  function getCargoPrincipal(usuario: UsuarioEquipeData) {
    // Retorna o primeiro cargo ativo
    const cargoAtivo = usuario.cargos.find((c) => c.ativo);

    return cargoAtivo || null;
  }

  function getDisplayLabel(usuario: UsuarioEquipeData) {
    const cargoPrincipal = getCargoPrincipal(usuario);

    if (cargoPrincipal) {
      const outrosCargos = usuario.cargos.filter((c) => c.ativo && c.id !== cargoPrincipal.id).length;
      const sufixo = outrosCargos > 0 ? ` +${outrosCargos}` : "";

      return `${cargoPrincipal.nome}${sufixo}`;
    }

    // Fallback para role se não houver cargo
    return getRoleLabel(usuario.role);
  }

  function getDisplayColor(usuario: UsuarioEquipeData): ChipProps["color"] {
    // Priorizar cargo, mas usar role como fallback
    const cargoPrincipal = getCargoPrincipal(usuario);

    if (cargoPrincipal) {
      // Cargos podem ter cores customizadas no futuro
      // Por enquanto, usar cor baseada no nível do cargo
      if (cargoPrincipal.nivel >= 4) return "danger"; // Coordenador/Diretor
      if (cargoPrincipal.nivel >= 3) return "primary"; // Advogado/Especialista
      if (cargoPrincipal.nivel >= 2) return "secondary"; // Assistente

      return "default"; // Estagiário/Júnior
    }

    // Fallback para role
    return getRoleColor(usuario.role);
  }

  function getDisplayIcon(usuario: UsuarioEquipeData) {
    const cargoPrincipal = getCargoPrincipal(usuario);

    if (cargoPrincipal) {
      // Por enquanto usar ícone genérico para cargo
      // No futuro pode ter ícone customizado no cargo
      return <Award className="w-3 h-3" />;
    }

    // Fallback para role
    return getRoleIcon(usuario.role);
  }

  function handleExportUsuarios() {
    try {
      const csvContent = [
        // Cabeçalho
        ["Nome", "Email", "Role", "Status", "Cargos", "Vinculações"].join(","),
        // Dados
        ...filteredUsuarios.map((usuario) =>
          [
            `"${usuario.firstName && usuario.lastName ? `${usuario.firstName} ${usuario.lastName}` : usuario.email}"`,
            `"${usuario.email}"`,
            `"${getRoleLabel(usuario.role)}"`,
            `"${usuario.active ? "Ativo" : "Inativo"}"`,
            `"${usuario.cargos.map((c) => c.nome).join("; ")}"`,
            `"${usuario.vinculacoes.map((v) => `${v.tipo} → ${v.advogadoNome}`).join("; ")}"`,
          ].join(",")
        ),
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);

      link.setAttribute("href", url);
      link.setAttribute("download", `equipe-usuarios-${new Date().toISOString().split("T")[0]}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success("Dados exportados com sucesso!");
    } catch (error) {
      toast.error("Erro ao exportar dados");
    }
  }

  // Filtros
  const filteredUsuarios = useMemo(() => {
    return usuarios.filter((usuario) => {
      const matchesSearch =
        usuario.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        usuario.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        usuario.email.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesRole = selectedRole === "all" || usuario.role === selectedRole;
      const matchesStatus = selectedStatus === "all" || (selectedStatus === "active" && usuario.active) || (selectedStatus === "inactive" && !usuario.active);

      const matchesVinculacao =
        selectedVinculacao === "all" || (selectedVinculacao === "com-vinculacao" && usuario.vinculacoes.length > 0) || (selectedVinculacao === "sem-vinculacao" && usuario.vinculacoes.length === 0);

      return matchesSearch && matchesRole && matchesStatus && matchesVinculacao;
    });
  }, [usuarios, searchTerm, selectedRole, selectedStatus, selectedVinculacao]);

  // Paginação
  const totalPages = Math.ceil(filteredUsuarios.length / itemsPerPage);
  const paginatedUsuarios = filteredUsuarios.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Estatísticas dos usuários
  const usuarioStats = useMemo(() => {
    const total = usuarios.length;
    const ativos = usuarios.filter((u) => u.active).length;
    const inativos = usuarios.filter((u) => !u.active).length;
    const porRole: Record<string, number> = {};

    usuarios.forEach((u) => {
      porRole[u.role] = (porRole[u.role] || 0) + 1;
    });
    const comCargo = usuarios.filter((u) => u.cargos.length > 0).length;
    const comVinculacao = usuarios.filter((u) => u.vinculacoes.length > 0).length;

    return {
      total,
      ativos,
      inativos,
      porRole,
      comCargo,
      comVinculacao,
    };
  }, [usuarios]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-32">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toolbar com Estatísticas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6 2xl:grid-cols-6 gap-2 sm:gap-3 md:gap-4 lg:gap-6 auto-rows-fr">
        {/* Card Total de Funcionários */}
        <motion.div animate={{ opacity: 1, y: 0 }} className="flex" initial={{ opacity: 0, y: 20 }} transition={{ duration: 0.5, delay: 0.1 }}>
          <Card className="border border-white/10 bg-background/70 backdrop-blur-xl shadow-xl hover:shadow-2xl transition-all duration-500 group h-full w-full">
            <CardBody className="p-3 sm:p-4 md:p-6">
              <div className="flex items-center justify-between mb-2 sm:mb-3 md:mb-4">
                <div className="p-2 sm:p-2.5 md:p-3 bg-blue-500 rounded-xl shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <Users className="text-white w-[18px] h-[18px] sm:w-5 sm:h-5 md:w-6 md:h-6" />
                </div>
                <div className="hidden sm:flex items-center justify-center p-1.5 rounded-full bg-blue-100 dark:bg-blue-900/30">
                  <TrendingUp className="text-blue-600 dark:text-blue-400 w-3 h-3 sm:w-4 sm:h-4" />
                </div>
              </div>
              <div className="space-y-1 sm:space-y-2">
                <p className="text-xs sm:text-sm font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide line-clamp-1">Total de Funcionários</p>
                <p className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-blue-800 dark:text-blue-200">{usuarioStats.total}</p>
                <p className="text-xs text-blue-600 dark:text-blue-400 line-clamp-1">Equipe do escritório</p>
              </div>
            </CardBody>
          </Card>
        </motion.div>

        {/* Card Ativos */}
        <motion.div animate={{ opacity: 1, y: 0 }} className="flex" initial={{ opacity: 0, y: 20 }} transition={{ duration: 0.5, delay: 0.2 }}>
          <Card className="border border-white/10 bg-background/70 backdrop-blur-xl shadow-xl hover:shadow-2xl transition-all duration-500 group h-full w-full">
            <CardBody className="p-3 sm:p-4 md:p-6">
              <div className="flex items-center justify-between mb-2 sm:mb-3 md:mb-4">
                <div className="p-2 sm:p-2.5 md:p-3 bg-green-500 rounded-xl shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <CheckCircle className="text-white w-[18px] h-[18px] sm:w-5 sm:h-5 md:w-6 md:h-6" />
                </div>
                <div className="hidden sm:flex items-center justify-center p-1.5 rounded-full bg-green-100 dark:bg-green-900/30">
                  <Activity className="text-green-600 dark:text-green-400 w-3 h-3 sm:w-4 sm:h-4" />
                </div>
              </div>
              <div className="space-y-1 sm:space-y-2">
                <p className="text-xs sm:text-sm font-semibold text-green-700 dark:text-green-300 uppercase tracking-wide line-clamp-1">Ativos</p>
                <p className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-green-800 dark:text-green-200">{usuarioStats.ativos}</p>
                <p className="text-xs text-green-600 dark:text-green-400 line-clamp-1">Em atividade</p>
              </div>
            </CardBody>
          </Card>
        </motion.div>

        {/* Card Inativos */}
        <motion.div animate={{ opacity: 1, y: 0 }} className="flex" initial={{ opacity: 0, y: 20 }} transition={{ duration: 0.5, delay: 0.3 }}>
          <Card className="border border-white/10 bg-background/70 backdrop-blur-xl shadow-xl hover:shadow-2xl transition-all duration-500 group h-full w-full">
            <CardBody className="p-3 sm:p-4 md:p-6">
              <div className="flex items-center justify-between mb-2 sm:mb-3 md:mb-4">
                <div className="p-2 sm:p-2.5 md:p-3 bg-rose-500 rounded-xl shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <X className="text-white w-[18px] h-[18px] sm:w-5 sm:h-5 md:w-6 md:h-6" />
                </div>
                <div className="hidden sm:flex items-center justify-center p-1.5 rounded-full bg-rose-100 dark:bg-rose-900/30">
                  <XCircle className="text-rose-600 dark:text-rose-400 w-3 h-3 sm:w-4 sm:h-4" />
                </div>
              </div>
              <div className="space-y-1 sm:space-y-2">
                <p className="text-xs sm:text-sm font-semibold text-rose-700 dark:text-rose-300 uppercase tracking-wide line-clamp-1">Inativos</p>
                <p className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-rose-800 dark:text-rose-200">{usuarioStats.inativos}</p>
                <p className="text-xs text-rose-600 dark:text-rose-400 line-clamp-1">Desativados</p>
              </div>
            </CardBody>
          </Card>
        </motion.div>

        {/* Card Com Cargo */}
        <motion.div animate={{ opacity: 1, y: 0 }} className="flex" initial={{ opacity: 0, y: 20 }} transition={{ duration: 0.5, delay: 0.4 }}>
          <Card className="border border-white/10 bg-background/70 backdrop-blur-xl shadow-xl hover:shadow-2xl transition-all duration-500 group h-full w-full">
            <CardBody className="p-3 sm:p-4 md:p-6">
              <div className="flex items-center justify-between mb-2 sm:mb-3 md:mb-4">
                <div className="p-2 sm:p-2.5 md:p-3 bg-purple-500 rounded-xl shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <Award className="text-white w-[18px] h-[18px] sm:w-5 sm:h-5 md:w-6 md:h-6" />
                </div>
                <div className="hidden sm:flex items-center justify-center p-1.5 rounded-full bg-purple-100 dark:bg-purple-900/30">
                  <Award className="text-purple-600 dark:text-purple-400 w-3 h-3 sm:w-4 sm:h-4" />
                </div>
              </div>
              <div className="space-y-1 sm:space-y-2">
                <p className="text-xs sm:text-sm font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wide line-clamp-1">Com Cargo</p>
                <p className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-purple-800 dark:text-purple-200">{usuarioStats.comCargo}</p>
                <p className="text-xs text-purple-600 dark:text-purple-400 line-clamp-1">Com função atribuída</p>
              </div>
            </CardBody>
          </Card>
        </motion.div>

        {/* Card Vinculados */}
        <motion.div animate={{ opacity: 1, y: 0 }} className="flex" initial={{ opacity: 0, y: 20 }} transition={{ duration: 0.5, delay: 0.5 }}>
          <Card className="border border-white/10 bg-background/70 backdrop-blur-xl shadow-xl hover:shadow-2xl transition-all duration-500 group h-full w-full">
            <CardBody className="p-3 sm:p-4 md:p-6">
              <div className="flex items-center justify-between mb-2 sm:mb-3 md:mb-4">
                <div className="p-2 sm:p-2.5 md:p-3 bg-orange-500 rounded-xl shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <LinkIcon className="text-white w-[18px] h-[18px] sm:w-5 sm:h-5 md:w-6 md:h-6" />
                </div>
                <div className="hidden sm:flex items-center justify-center p-1.5 rounded-full bg-orange-100 dark:bg-orange-900/30">
                  <LinkIcon className="text-orange-600 dark:text-orange-400 w-3 h-3 sm:w-4 sm:h-4" />
                </div>
              </div>
              <div className="space-y-1 sm:space-y-2">
                <p className="text-xs sm:text-sm font-semibold text-orange-700 dark:text-orange-300 uppercase tracking-wide line-clamp-1">Vinculados</p>
                <p className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-orange-800 dark:text-orange-200">{usuarioStats.comVinculacao}</p>
                <p className="text-xs text-orange-600 dark:text-orange-400 line-clamp-1">A advogados</p>
              </div>
            </CardBody>
          </Card>
        </motion.div>

        {/* Card Administradores */}
        <motion.div animate={{ opacity: 1, y: 0 }} className="flex" initial={{ opacity: 0, y: 20 }} transition={{ duration: 0.5, delay: 0.6 }}>
          <Card className="border border-white/10 bg-background/70 backdrop-blur-xl shadow-xl hover:shadow-2xl transition-all duration-500 group h-full w-full">
            <CardBody className="p-3 sm:p-4 md:p-6">
              <div className="flex items-center justify-between mb-2 sm:mb-3 md:mb-4">
                <div className="p-2 sm:p-2.5 md:p-3 bg-indigo-500 rounded-xl shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <Crown className="text-white w-[18px] h-[18px] sm:w-5 sm:h-5 md:w-6 md:h-6" />
                </div>
                <div className="hidden sm:flex items-center justify-center p-1.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30">
                  <Crown className="text-indigo-600 dark:text-indigo-400 w-3 h-3 sm:w-4 sm:h-4" />
                </div>
              </div>
              <div className="space-y-1 sm:space-y-2">
                <p className="text-xs sm:text-sm font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide line-clamp-1">Administradores</p>
                <p className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-indigo-800 dark:text-indigo-200">{usuarioStats.porRole.ADMIN || 0}</p>
                <p className="text-xs text-indigo-600 dark:text-indigo-400 line-clamp-1">Com acesso total</p>
              </div>
            </CardBody>
          </Card>
        </motion.div>
      </div>

      {/* Header com busca e filtros */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center flex-1">
          <div className="relative flex-1 max-w-md">
            <Input
              endContent={
                searchTerm && (
                  <Button isIconOnly size="sm" variant="light" onPress={() => setSearchTerm("")}>
                    <X className="w-4 h-4" />
                  </Button>
                )
              }
              placeholder="Buscar funcionários..."
              startContent={<Search className="w-4 h-4 text-default-400" />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <Button startContent={<Filter className="w-4 h-4" />} variant="light" onPress={() => setShowFilters(!showFilters)}>
            Filtros
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {isAdmin ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
              <span className="text-warning-700 dark:text-warning-300">
                Modo avançado
              </span>
              <Switch
                isSelected={advancedMode}
                size="sm"
                onValueChange={setAdvancedMode}
              />
            </div>
          ) : null}
          <Button className="w-full sm:w-auto" size="sm" startContent={<Download className="w-4 h-4" />} variant="light" onPress={() => handleExportUsuarios()}>
            Exportar
          </Button>
        </div>
      </div>

      <Card className="border border-divider/70 bg-content1/70">
        <CardBody className="py-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
              <HelpCircle className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                O que significa a ação <strong>Vincular</strong>?
              </p>
              <p className="text-xs text-default-500">
                Com escopo estrito: sem vínculo o colaborador não acessa
                carteira de advogados. Com vínculo, ele acessa apenas os
                advogados associados nos módulos com controle de escopo.
                Vínculo não altera cargo nem role.
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card className="border border-success/20 bg-success/5">
        <CardBody className="py-3">
          <p className="text-xs text-success-700 dark:text-success-300">
            Esta aba lista apenas funcionários do escritório (secretaria,
            financeiro, suporte e afins). Perfis de advogado devem ser geridos
            no módulo de Advogados.
          </p>
        </CardBody>
      </Card>

      {/* Filtros expandidos */}
      <AnimatePresence>
        {showFilters && (
          <motion.div animate={{ opacity: 1, height: "auto" }} className="overflow-hidden" exit={{ opacity: 0, height: 0 }} initial={{ opacity: 0, height: 0 }}>
            <Card>
              <CardBody>
                <div className="flex flex-wrap gap-2 sm:gap-3 md:gap-4">
                  <Select
                    className="min-w-[140px] sm:min-w-40 flex-1 sm:flex-none"
                    label="Role"
                    placeholder="Todos os roles"
                    selectedKeys={selectedRole === "all" ? [] : [selectedRole]}
                    onSelectionChange={(keys) => {
                      const selected = Array.from(keys)[0] as string;

                      setSelectedRole(selected || "all");
                    }}
                  >
                    <SelectItem key="all" textValue="Todos">Todos</SelectItem>
                    <SelectItem key="ADMIN" textValue="Administrador">Administrador</SelectItem>
                    <SelectItem key="SECRETARIA" textValue="Secretária">Secretária</SelectItem>
                    <SelectItem key="FINANCEIRO" textValue="Financeiro">Financeiro</SelectItem>
                  </Select>

                  <Select
                    className="min-w-[140px] sm:min-w-40 flex-1 sm:flex-none"
                    label="Status"
                    placeholder="Todos os status"
                    selectedKeys={selectedStatus === "all" ? [] : [selectedStatus]}
                    onSelectionChange={(keys) => {
                      const selected = Array.from(keys)[0] as string;

                      setSelectedStatus(selected || "all");
                    }}
                  >
                    <SelectItem key="all" textValue="Todos">Todos</SelectItem>
                    <SelectItem key="active" textValue="Ativo">Ativo</SelectItem>
                    <SelectItem key="inactive" textValue="Inativo">Inativo</SelectItem>
                  </Select>

                  <Select
                    className="min-w-[140px] sm:min-w-40 flex-1 sm:flex-none"
                    label="Vinculação"
                    placeholder="Todas as vinculações"
                    selectedKeys={selectedVinculacao === "all" ? [] : [selectedVinculacao]}
                    onSelectionChange={(keys) => {
                      const selected = Array.from(keys)[0] as string;

                      setSelectedVinculacao(selected || "all");
                    }}
                  >
                    <SelectItem key="all" textValue="Todas">Todas</SelectItem>
                    <SelectItem key="com-vinculacao" textValue="Com Vinculação">Com Vinculação</SelectItem>
                    <SelectItem key="sem-vinculacao" textValue="Sem Vinculação">Sem Vinculação</SelectItem>
                  </Select>

                  <Button
                    startContent={<RotateCcw className="w-4 h-4" />}
                    variant="light"
                    onPress={() => {
                      setSearchTerm("");
                      setSelectedRole("all");
                      setSelectedStatus("all");
                      setSelectedVinculacao("all");
                    }}
                  >
                    Limpar Filtros
                  </Button>
                </div>
              </CardBody>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabela de usuários */}
      <Card>
        <CardBody className="p-0">
          <div className="space-y-3 p-4 md:hidden">
            {paginatedUsuarios.map((usuario) => (
              <PeopleEntityCard
                key={usuario.id}
                isPressable
                onPress={() => handleViewUsuario(usuario)}
              >
                <PeopleEntityCardHeader className="p-3">
                  <div className="flex w-full items-center justify-between gap-3">
                    <div className="min-w-0 flex items-center gap-3">
                      <Avatar name={usuario.firstName || usuario.email} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {usuario.firstName && usuario.lastName
                            ? `${usuario.firstName} ${usuario.lastName}`
                            : usuario.email}
                        </p>
                        <p className="truncate text-xs text-default-500">
                          {usuario.email}
                        </p>
                      </div>
                    </div>
                    <Dropdown>
                      <DropdownTrigger>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownTrigger>
                      <DropdownMenu
                        onAction={(key) =>
                          handleUsuarioAction(usuario, String(key))
                        }
                      >
                        <DropdownItem
                          key="view"
                          startContent={<Eye className="w-4 h-4" />}
                        >
                          Visualizar
                        </DropdownItem>
                        {isAdmin ? (
                          <DropdownItem
                            key="edit"
                            startContent={<Edit className="w-4 h-4" />}
                          >
                            Editar
                          </DropdownItem>
                        ) : null}
                        {isAdmin && advancedMode ? (
                          <DropdownItem
                            key="permissions"
                            startContent={<Shield className="w-4 h-4" />}
                          >
                            Permissões
                          </DropdownItem>
                        ) : null}
                        {isAdmin ? (
                          <DropdownItem
                            key="link"
                            startContent={<LinkIcon className="w-4 h-4" />}
                          >
                            Vincular advogado(s)
                          </DropdownItem>
                        ) : null}
                      </DropdownMenu>
                    </Dropdown>
                  </div>
                </PeopleEntityCardHeader>
                <PeopleEntityCardBody className="space-y-3 p-3">
                  <div className="flex flex-wrap gap-2">
                    <Chip
                      color={getDisplayColor(usuario)}
                      size="sm"
                      startContent={getDisplayIcon(usuario)}
                      variant="flat"
                    >
                      {getDisplayLabel(usuario)}
                    </Chip>
                    <Chip
                      color={usuario.active ? "success" : "default"}
                      size="sm"
                      startContent={
                        usuario.active ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : (
                          <X className="w-3 h-3" />
                        )
                      }
                      variant="flat"
                    >
                      {usuario.active ? "Ativo" : "Inativo"}
                    </Chip>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-default-500">
                      Cargos
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {usuario.cargos.length > 0 ? (
                        usuario.cargos.slice(0, 2).map((cargo) => (
                          <Chip
                            key={cargo.id}
                            color="primary"
                            size="sm"
                            variant="flat"
                          >
                            {cargo.nome}
                          </Chip>
                        ))
                      ) : (
                        <span className="text-xs text-default-400">
                          Sem cargos
                        </span>
                      )}
                      {usuario.cargos.length > 2 ? (
                        <Chip color="default" size="sm" variant="flat">
                          +{usuario.cargos.length - 2}
                        </Chip>
                      ) : null}
                    </div>
                  </div>
                </PeopleEntityCardBody>
              </PeopleEntityCard>
            ))}
          </div>

          <div className="hidden overflow-x-auto -mx-4 sm:mx-0 md:block">
            <Table
              aria-label="Usuários da equipe"
              className="min-w-[800px]"
              classNames={{
                wrapper: "overflow-x-auto",
                th: "text-xs sm:text-sm",
                td: "text-xs sm:text-sm",
              }}
            >
              <TableHeader>
                <TableColumn>
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    USUÁRIO
                  </div>
                </TableColumn>
                <TableColumn>
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4" />
                    FUNÇÃO
                  </div>
                </TableColumn>
                <TableColumn>
                  <div className="flex items-center gap-2">
                    <Crown className="w-4 h-4" />
                    CARGOS
                  </div>
                </TableColumn>
                <TableColumn>
                  <div className="flex items-center gap-2">
                    <LinkIcon className="w-4 h-4" />
                    VINCULAÇÕES
                  </div>
                </TableColumn>
                <TableColumn>
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    STATUS
                  </div>
                </TableColumn>
                <TableColumn>
                  <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    AÇÕES
                  </div>
                </TableColumn>
              </TableHeader>
              <TableBody>
                {paginatedUsuarios.map((usuario) => (
                  <TableRow key={usuario.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar name={usuario.firstName || usuario.email} size="sm" />
                        <div>
                          <p className="font-medium">{usuario.firstName && usuario.lastName ? `${usuario.firstName} ${usuario.lastName}` : usuario.email}</p>
                          <p className="text-sm text-default-500">{usuario.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {/* Cargo Principal ou Role como fallback */}
                        <Tooltip
                          content={
                            usuario.cargos.length > 0
                              ? `Cargos: ${usuario.cargos
                                  .filter((c) => c.ativo)
                                  .map((c) => c.nome)
                                  .join(", ")} | Role: ${getRoleLabel(usuario.role)}`
                              : `Role: ${getRoleLabel(usuario.role)} (sem cargo)`
                          }
                        >
                          <Chip className="w-fit" color={getDisplayColor(usuario)} size="sm" startContent={getDisplayIcon(usuario)} variant="flat">
                            {getDisplayLabel(usuario)}
                          </Chip>
                        </Tooltip>
                        {/* Role como informação secundária */}
                        {getCargoPrincipal(usuario) && (
                          <Chip className="w-fit text-xs opacity-70" color="default" size="sm" variant="flat">
                            {getRoleLabel(usuario.role)}
                          </Chip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {usuario.cargos.map((cargo) => (
                          <Chip key={cargo.id} color="primary" size="sm" variant="flat">
                            {cargo.nome}
                          </Chip>
                        ))}
                        {usuario.cargos.length === 0 && <span className="text-sm text-default-400">Sem cargos</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {usuario.vinculacoes.map((vinculacao) => (
                          <Tooltip key={vinculacao.id} content={vinculacao.observacoes || "Sem observações"}>
                            <Chip color="secondary" size="sm" variant="flat">
                              {vinculacao.tipo} → {vinculacao.advogadoNome}
                            </Chip>
                          </Tooltip>
                        ))}
                        {usuario.vinculacoes.length === 0 && <span className="text-sm text-default-400">Sem vinculações</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Chip color={usuario.active ? "success" : "default"} size="sm" startContent={usuario.active ? <CheckCircle className="w-3 h-3" /> : <X className="w-3 h-3" />} variant="flat">
                        {usuario.active ? "Ativo" : "Inativo"}
                      </Chip>
                    </TableCell>
	                    <TableCell>
	                      <Dropdown>
	                        <DropdownTrigger>
                          <Button isIconOnly size="sm" variant="light">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownTrigger>
	                        <DropdownMenu
	                          onAction={(key) =>
	                            handleUsuarioAction(usuario, String(key))
	                          }
	                        >
                          <DropdownItem key="view" startContent={<Eye className="w-4 h-4" />}>
                            Visualizar
                          </DropdownItem>
                          {isAdmin ? (
                            <DropdownItem key="edit" startContent={<Edit className="w-4 h-4" />}>
                              Editar
                            </DropdownItem>
                          ) : null}
                          {isAdmin && advancedMode ? (
                            <DropdownItem key="permissions" startContent={<Shield className="w-4 h-4" />}>
                              Permissões
                            </DropdownItem>
                          ) : null}
                          {isAdmin ? (
                            <DropdownItem key="link" startContent={<LinkIcon className="w-4 h-4" />}>
                              Vincular advogado(s)
                            </DropdownItem>
                          ) : null}
                        </DropdownMenu>
                      </Dropdown>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardBody>
      </Card>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex justify-center">
          <Pagination showControls showShadow page={currentPage} total={totalPages} onChange={setCurrentPage} />
        </div>
      )}

      {/* Estado de erro */}
      {error && !loading && (
        <Card className="border-danger/20 bg-danger/5">
          <CardBody className="py-6">
            <div className="flex items-start gap-3">
              <XCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-danger mb-1">Erro ao carregar usuários</h3>
                <p className="text-sm text-default-600 mb-3">{error}</p>
                <Button color="danger" size="sm" startContent={<RefreshCw className="w-4 h-4" />} variant="flat" onPress={() => loadData()}>
                  Tentar novamente
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Estado vazio */}
      {filteredUsuarios.length === 0 && !loading && !error && (
        <Card>
          <CardBody className="text-center py-12">
            <Users className="w-12 h-12 text-default-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum usuário encontrado</h3>
            <p className="text-default-500">
              {searchTerm || selectedRole !== "all" || selectedStatus !== "all" || selectedVinculacao !== "all"
                ? "Tente ajustar os filtros de busca"
                : "Nenhum usuário cadastrado na equipe"}
            </p>
          </CardBody>
        </Card>
      )}

      {/* Modal de Visualização de Usuário */}
      <Modal isOpen={isViewModalOpen} scrollBehavior="inside" size="5xl" onClose={() => setIsViewModalOpen(false)}>
        <ModalContent>
          {selectedUsuario && (
            <>
              <ModalHeaderGradient
                description="Detalhes completos do usuário"
                icon={User}
                title={selectedUsuario.firstName && selectedUsuario.lastName ? `${selectedUsuario.firstName} ${selectedUsuario.lastName}` : selectedUsuario.email}
              />
              <ModalBody className="px-0">
                <Tabs
                  aria-label="Detalhes do usuário"
                  classNames={{
                    tabList: "gap-6 w-full relative rounded-none px-6 pt-6 pb-0 border-b border-divider",
                    cursor: "w-full bg-primary",
                    tab: "max-w-fit px-0 h-12",
                    tabContent: "group-data-[selected=true]:text-primary font-medium text-sm tracking-wide",
                    panel: "px-6 pb-6 pt-4",
                  }}
                  color="primary"
                  variant="underlined"
                >
                  <Tab
                    key="resumo"
                    title={
                      <div className="flex items-center gap-2">
                        <div className="p-1 rounded-md bg-blue-100 dark:bg-blue-900">
                          <User className="text-blue-600 dark:text-blue-300 w-4 h-4" />
                        </div>
                        <span>Resumo</span>
                      </div>
                    }
                  >
                    <div className="space-y-6">
                      <ModalSectionCard description="Dados de identificação do usuário" title="Informações Básicas">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="flex items-center gap-3 p-3 bg-default-50 rounded-lg">
                            <Mail className="h-4 w-4 text-primary" />
                            <div>
                              <p className="text-xs text-default-500">Email</p>
                              <p className="text-sm font-medium">{selectedUsuario.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 p-3 bg-default-50 rounded-lg">
                            <Chip color={getRoleColor(selectedUsuario.role)} size="sm" startContent={getRoleIcon(selectedUsuario.role)} variant="flat">
                              {getRoleLabel(selectedUsuario.role)}
                            </Chip>
                            <Chip
                              color={selectedUsuario.active ? "success" : "default"}
                              size="sm"
                              startContent={selectedUsuario.active ? <CheckCircle className="w-3 h-3" /> : <X className="w-3 h-3" />}
                              variant="flat"
                            >
                              {selectedUsuario.active ? "Ativo" : "Inativo"}
                            </Chip>
                          </div>
                        </div>
                      </ModalSectionCard>

                      {selectedUsuario.cargos.length > 0 && (
                        <ModalSectionCard description="Funções do usuário no escritório" title="Cargos">
                          <div className="flex flex-wrap gap-2">
                            {selectedUsuario.cargos.map((cargo) => (
                              <Chip key={cargo.id} color="primary" size="sm" startContent={<Award className="w-3 h-3" />} variant="flat">
                                {cargo.nome}
                              </Chip>
                            ))}
                          </div>
                        </ModalSectionCard>
                      )}

                      {selectedUsuario.vinculacoes.length > 0 && (
                        <ModalSectionCard description="Relacionamentos com advogados" title="Vinculações">
                          <div className="flex flex-wrap gap-2">
                            {selectedUsuario.vinculacoes.map((vinculacao) => (
                              <Tooltip key={vinculacao.id} content={vinculacao.observacoes || "Sem observações"}>
                                <Chip color="secondary" size="sm" startContent={<LinkIcon className="w-3 h-3" />} variant="flat">
                                  {vinculacao.tipo} → {vinculacao.advogadoNome}
                                </Chip>
                              </Tooltip>
                            ))}
                          </div>
                        </ModalSectionCard>
                      )}

                      {selectedUsuario.permissoesIndividuais.length > 0 && (
                        <ModalSectionCard description="Override de permissões personalizadas" title="Permissões Individuais">
                          <div className="flex flex-wrap gap-2">
                            {selectedUsuario.permissoesIndividuais.map((perm) => (
                              <Chip key={perm.id} color={perm.permitido ? "success" : "danger"} size="sm" variant="flat">
                                {perm.modulo}/{perm.acao}
                              </Chip>
                            ))}
                          </div>
                        </ModalSectionCard>
                      )}
                    </div>
                  </Tab>

                  <Tab
                    key="contato"
                    title={
                      <div className="flex items-center gap-2">
                        <div className="p-1 rounded-md bg-green-100 dark:bg-green-900">
                          <Phone className="text-green-600 dark:text-green-300 w-4 h-4" />
                        </div>
                        <span>Contato</span>
                      </div>
                    }
                  >
                    <div className="space-y-6">
                      <ModalSectionCard description="Telefone e observações" title="Informações de Contato">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {selectedUsuario.phone && (
                            <div className="flex items-center gap-3 p-3 bg-default-50 rounded-lg">
                              <Phone className="h-4 w-4 text-primary" />
                              <div>
                                <p className="text-xs text-default-500">Telefone</p>
                                <p className="text-sm font-medium">{selectedUsuario.phone}</p>
                              </div>
                            </div>
                          )}
                          {selectedUsuario.observacoes && (
                            <div className="col-span-2">
                              <p className="text-xs text-default-500 mb-2">Observações</p>
                              <p className="text-sm text-default-700">{selectedUsuario.observacoes}</p>
                            </div>
                          )}
                        </div>
                      </ModalSectionCard>
                    </div>
                  </Tab>
                </Tabs>
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={() => setIsViewModalOpen(false)}>
                  Fechar
                </Button>
                <Button color="primary" onPress={() => handleEditUsuario(selectedUsuario)}>
                  Editar Usuário
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Modal de Edição de Usuário */}
      <Modal isOpen={isEditModalOpen} scrollBehavior="inside" size="5xl" onClose={() => setIsEditModalOpen(false)}>
        <ModalContent>
          <ModalHeaderGradient description="Atualize as informações do usuário" icon={Edit} title="Editar Usuário" />
          <ModalBody className="px-0">
            <Tabs
              aria-label="Formulário de edição do usuário"
              classNames={{
                tabList: "gap-6 w-full relative rounded-none px-6 pt-6 pb-0 border-b border-divider",
                cursor: "w-full bg-primary",
                tab: "max-w-fit px-0 h-12",
                tabContent: "group-data-[selected=true]:text-primary font-medium text-sm tracking-wide",
                panel: "px-6 pb-6 pt-4",
              }}
              color="primary"
              variant="underlined"
            >
              <Tab
                key="perfil"
                title={
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded-md bg-blue-100 dark:bg-blue-900">
                      <User className="text-blue-600 dark:text-blue-300 w-4 h-4" />
                    </div>
                    <span>Perfil</span>
                  </div>
                }
              >
                <div className="space-y-6">
                  <ModalSectionCard description="Informações básicas do usuário" title="Dados Pessoais">
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                          label="Nome"
                          placeholder="Primeiro nome"
                          value={editFormData.firstName}
                          onChange={(e) =>
                            setEditFormData({
                              ...editFormData,
                              firstName: e.target.value,
                            })
                          }
                        />
                        <Input
                          label="Sobrenome"
                          placeholder="Sobrenome"
                          value={editFormData.lastName}
                          onChange={(e) =>
                            setEditFormData({
                              ...editFormData,
                              lastName: e.target.value,
                            })
                          }
                        />
                      </div>
                      <Input
                        isRequired
                        label="Email"
                        placeholder="email@exemplo.com"
                        type="email"
                        value={editFormData.email}
                        onChange={(e) =>
                          setEditFormData({
                            ...editFormData,
                            email: e.target.value,
                          })
                        }
                      />
                      <ModalSectionCard description="Foto de perfil do usuário" title="Avatar">
                        <div className="flex flex-col items-center gap-4">
                          <Avatar
                            isBordered
                            className="w-24 h-24"
                            color="primary"
                            name={selectedUsuario ? `${selectedUsuario.firstName || ""} ${selectedUsuario.lastName || ""}`.trim() || selectedUsuario.email : ""}
                            size="lg"
                            src={editFormData.avatarUrl || undefined}
                          />
                          <div className="flex flex-col gap-3 w-full max-w-md">
                            <Input
                              description="Cole a URL da imagem ou faça upload de arquivo"
                              label="URL do Avatar"
                              placeholder="https://exemplo.com/avatar.jpg"
                              startContent={<Image className="w-4 h-4 text-default-400" />}
                              value={editFormData.avatarUrl}
                              onChange={(e) =>
                                setEditFormData({
                                  ...editFormData,
                                  avatarUrl: e.target.value,
                                })
                              }
                            />
                            <div className="flex flex-col gap-3 w-full max-w-md">
                              <div className="flex gap-2">
                                <Button
                                  color="primary"
                                  isDisabled={!editFormData.avatarUrl}
                                  size="sm"
                                  startContent={<Image className="w-4 h-4" />}
                                  variant="bordered"
                                  onPress={async () => {
                                    if (!selectedUsuario) return;
                                    if (!editFormData.avatarUrl) {
                                      toast.error("Digite uma URL válida");

                                      return;
                                    }
                                    // Criar FormData com URL
                                    const formData = new FormData();

                                    formData.append("url", editFormData.avatarUrl);
                                    const result = await uploadAvatarUsuarioEquipe(selectedUsuario.id, formData);

                                    if (result.success && result.avatarUrl) {
                                      setEditFormData({
                                        ...editFormData,
                                        avatarUrl: result.avatarUrl,
                                      });
                                      await loadData();
                                      toast.success("Avatar atualizado!");
                                    } else {
                                      toast.error(result.error || "Erro ao atualizar avatar");
                                    }
                                  }}
                                >
                                  Salvar URL
                                </Button>
                                <label htmlFor="avatar-file-upload">
                                  <Button as="span" color="secondary" size="sm" startContent={<Image className="w-4 h-4" />} variant="bordered">
                                    Upload Arquivo
                                  </Button>
                                  <input
                                    accept="image/jpeg,image/jpg,image/png,image/webp"
                                    className="hidden"
                                    id="avatar-file-upload"
                                    type="file"
                                    onChange={async (e) => {
                                      const file = e.target.files?.[0];

                                      if (!file || !selectedUsuario) return;
                                      // Converter para base64 e enviar via API route
                                      const reader = new FileReader();

                                      reader.onloadend = async () => {
                                        try {
                                          const base64 = reader.result as string;
                                          const response = await fetch("/api/equipe/upload-avatar", {
                                            method: "POST",
                                            headers: {
                                              "Content-Type": "application/json",
                                            },
                                            body: JSON.stringify({
                                              usuarioId: selectedUsuario.id,
                                              file: base64.split(",")[1], // Remover data:image/...;base64,
                                              fileName: file.name,
                                              mimeType: file.type,
                                            }),
                                          });
                                          const result = await response.json();

                                          if (result.success && result.avatarUrl) {
                                            setEditFormData({
                                              ...editFormData,
                                              avatarUrl: result.avatarUrl,
                                            });
                                            await loadData();
                                            toast.success("Avatar atualizado!");
                                          } else {
                                            toast.error(result.error || "Erro ao atualizar avatar");
                                          }
                                        } catch (error) {
                                          toast.error("Erro ao fazer upload do avatar");
                                        }
                                      };
                                      reader.readAsDataURL(file);
                                      e.target.value = ""; // Reset input
                                    }}
                                  />
                                </label>
                              </div>
                            </div>
                          </div>
                        </div>
                      </ModalSectionCard>
                    </div>
                  </ModalSectionCard>

                  <ModalSectionCard description="CPF, RG e data de nascimento" title="Documentos">
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                          label="CPF"
                          placeholder="000.000.000-00"
                          startContent={<CreditCard className="w-4 h-4 text-default-400" />}
                          value={editFormData.cpf}
                          onChange={(e) =>
                            setEditFormData({
                              ...editFormData,
                              cpf: e.target.value,
                            })
                          }
                        />
                        <Input
                          label="RG"
                          placeholder="0000000"
                          startContent={<FileText className="w-4 h-4 text-default-400" />}
                          value={editFormData.rg}
                          onChange={(e) =>
                            setEditFormData({
                              ...editFormData,
                              rg: e.target.value,
                            })
                          }
                        />
                      </div>
                      <DateInput
                        label="Data de Nascimento"
                        startContent={<Calendar className="w-4 h-4 text-default-400" />}
                        value={editFormData.dataNascimento}
                        onChange={(e) =>
                          setEditFormData({
                            ...editFormData,
                            dataNascimento: e.target.value,
                          })
                        }
                      />
                    </div>
                  </ModalSectionCard>
                </div>
              </Tab>

              <Tab
                key="contatos"
                title={
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded-md bg-green-100 dark:bg-green-900">
                      <Phone className="text-green-600 dark:text-green-300 w-4 h-4" />
                    </div>
                    <span>Contatos</span>
                  </div>
                }
              >
                <div className="space-y-6">
                  <ModalSectionCard description="Telefone e observações" title="Informações de Contato">
                    <div className="space-y-4">
                      <Input
                        label="Telefone"
                        placeholder="(00) 00000-0000"
                        value={editFormData.phone}
                        onChange={(e) =>
                          setEditFormData({
                            ...editFormData,
                            phone: e.target.value,
                          })
                        }
                      />
                      <Textarea
                        label="Observações"
                        minRows={3}
                        placeholder="Observações sobre o usuário..."
                        value={editFormData.observacoes}
                        onChange={(e) =>
                          setEditFormData({
                            ...editFormData,
                            observacoes: e.target.value,
                          })
                        }
                      />
                    </div>
                  </ModalSectionCard>
                </div>
              </Tab>

              <Tab
                key="cargo-role"
                title={
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded-md bg-purple-100 dark:bg-purple-900">
                      <Award className="text-purple-600 dark:text-purple-300 w-4 h-4" />
                    </div>
                    <span>Cargo/Role</span>
                  </div>
                }
              >
                <div className="space-y-6">
                  <ModalSectionCard description="Configure o cargo e nível base do usuário" title="Função no Escritório">
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Select
                          description="Função específica do usuário no escritório"
                          label="Cargo (Função Principal)"
                          placeholder="Selecione um cargo"
                          selectedKeys={editFormData.cargoId ? [editFormData.cargoId] : []}
                          startContent={<Award className="w-4 h-4 text-default-400" />}
                          onSelectionChange={(keys) => {
                            const cargoId = Array.from(keys)[0] as string;
                            const cargoSelecionado = cargos.find((c) => c.id === cargoId);
                            const nextRole = cargoSelecionado
                              ? getRoleFromCargoNivel(cargoSelecionado.nivel)
                              : UserRole.SECRETARIA;

                            setEditFormData({
                              ...editFormData,
                              cargoId: cargoId || "",
                              role: advancedMode ? editFormData.role : nextRole,
                            });
                          }}
                        >
                          {cargos
                            .filter((c) => c.ativo)
                            .map((cargo) => (
                              <SelectItem key={cargo.id} textValue={cargo.nome}>{cargo.nome}</SelectItem>
                            ))}
                        </Select>

                        {advancedMode ? (
                          <Select
                            description="Modo avançado ativo: altere role somente quando o cargo não cobrir o cenário"
                            label="Role (Nível Base)"
                            selectedKeys={[editFormData.role]}
                            startContent={<User className="w-4 h-4 text-default-400" />}
                            onSelectionChange={(keys) => {
                              const role = Array.from(keys)[0] as string;

                              setEditFormData({
                                ...editFormData,
                                role: role || UserRole.SECRETARIA,
                              });
                            }}
                          >
                            <SelectItem key="ADMIN" textValue={getRoleLabel("ADMIN")}>{getRoleLabel("ADMIN")}</SelectItem>
                            <SelectItem key="SECRETARIA" textValue={getRoleLabel("SECRETARIA")}>{getRoleLabel("SECRETARIA")}</SelectItem>
                            <SelectItem key="FINANCEIRO" textValue={getRoleLabel("FINANCEIRO")}>{getRoleLabel("FINANCEIRO")}</SelectItem>
                          </Select>
                        ) : (
                          <div className="space-y-2 rounded-xl border border-default-200 bg-default-50 p-3">
                            <p className="text-xs font-medium uppercase tracking-wide text-default-500">
                              Role base (automação simples)
                            </p>
                            <Chip color="default" size="sm" variant="flat">
                              {getRoleLabel(editFormData.role)}
                            </Chip>
                            <p className="text-xs text-default-500">
                              Para operação padrão, ajuste apenas o cargo. Role manual fica no modo avançado.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </ModalSectionCard>

                  <ModalSectionCard description="Controle de acesso ao sistema" title="Status do Usuário">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium mb-1">Status</p>
                        <p className="text-xs text-default-500">Usuários inativos não conseguem fazer login</p>
                      </div>
                      <Switch isSelected={editFormData.active} onValueChange={(value) => setEditFormData({ ...editFormData, active: value })}>
                        {editFormData.active ? "Ativo" : "Inativo"}
                      </Switch>
                    </div>
                  </ModalSectionCard>
                </div>
              </Tab>

              <Tab
                key="enderecos"
                title={
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded-md bg-green-100 dark:bg-green-900">
                      <MapPin className="text-green-600 dark:text-green-300 w-4 h-4" />
                    </div>
                    <span>Endereços</span>
                  </div>
                }
              >
                <div className="space-y-6">
                  <ModalSectionCard description="Adicione e gerencie os endereços do usuário" title="Gerenciar Endereços">
                    {selectedUsuario && (
                      <div key={selectedUsuario.id} className="endereco-manager-wrapper">
                        <EnderecoManager userId={selectedUsuario.id} />
                      </div>
                    )}
                  </ModalSectionCard>
                </div>
              </Tab>

              <Tab
                key="historico"
                title={
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded-md bg-purple-100 dark:bg-purple-900">
                      <HistoryIcon className="text-purple-600 dark:text-purple-300 w-4 h-4" />
                    </div>
                    <span>Histórico</span>
                  </div>
                }
              >
                <div className="space-y-6">
                  <ModalSectionCard description="Registro de todas as alterações do usuário" title="Histórico de Alterações">
                    {selectedUsuario && <UsuarioHistoricoTab usuarioId={selectedUsuario.id} />}
                  </ModalSectionCard>
                </div>
              </Tab>
            </Tabs>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setIsEditModalOpen(false)}>
              Cancelar
            </Button>
            <Button color="primary" isLoading={isSaving} onPress={handleSaveUsuario}>
              Salvar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal de Permissões */}
      <Modal isOpen={isPermissionsModalOpen} scrollBehavior="inside" size="5xl" onClose={() => setIsPermissionsModalOpen(false)}>
        <ModalContent>
          <ModalHeaderGradient description="Configure permissões individuais do usuário" icon={Shield} title={`Gerenciar Permissões - ${selectedUsuario?.firstName || selectedUsuario?.email || ""}`} />
          <ModalBody>
            {selectedUsuario && (
              <div className="space-y-6">
                {/* Legenda */}
                <Card className="bg-primary/5 border-primary/20">
                  <CardBody className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 mb-2">
                        <HelpCircle className="w-5 h-5 text-primary" />
                        <h3 className="font-semibold text-primary">Como funciona</h3>
                      </div>

                      <p className="text-sm text-default-700">As permissões são verificadas nesta ordem de precedência:</p>

                      <ol className="list-decimal list-inside space-y-2 text-sm text-default-600">
                        <li>
                          <strong className="text-primary">Override individual</strong> - Permissão personalizada criada manualmente
                        </li>
                        <li>
                          <strong className="text-secondary">Cargo</strong> - Permissão herdada do cargo ativo do usuário
                        </li>
                        <li>
                          <strong className="text-default-500">Role padrão</strong> - Permissão base do perfil (Admin, Secretária, Financeiro etc.)
                        </li>
                      </ol>

                      <div className="pt-2 border-t border-default-200">
                        <p className="text-xs text-default-600 mb-2">
                          Overrides pessoais sempre têm prioridade sobre as configurações do cargo e sobre a permissão padrão do role. Se você desligar o override, o sistema volta a usar o que está
                          definido no cargo; se o cargo também não tiver nada, usamos o fallback do role.
                        </p>

                        <p className="text-sm font-medium text-default-700 mb-2">Significado dos chips:</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div className="flex items-center gap-2">
                            <Chip color="primary" size="sm" variant="flat">
                              Override
                            </Chip>
                            <span className="text-xs text-default-600">Permissão personalizada (sobrescreve cargo/role)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Chip color="secondary" size="sm" variant="flat">
                              Herdado do cargo
                            </Chip>
                            <span className="text-xs text-default-600">Vem do cargo ativo do usuário</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Chip color="default" size="sm" variant="flat">
                              Padrão do role
                            </Chip>
                            <span className="text-xs text-default-600">Permissão padrão do role base</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Chip color="danger" size="sm" variant="flat">
                              Sem permissão
                            </Chip>
                            <span className="text-xs text-default-600">Negado em todas as camadas</span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-default-200">
                        <p className="text-sm font-medium text-default-700 mb-1">Como usar:</p>
                        <ul className="list-disc list-inside space-y-1 text-xs text-default-600">
                          <li>
                            Ligue/desligue o switch para criar um <strong>override individual</strong>
                          </li>
                          <li>
                            O override <strong>substitui</strong> a permissão do cargo e role
                          </li>
                          <li>Para remover um override, desligue o switch e ele voltará ao estado do cargo/role</li>
                          <li>
                            O switch mostra o <strong>estado efetivo atual</strong> da permissão
                          </li>
                        </ul>
                      </div>
                    </div>
                  </CardBody>
                </Card>
                <Divider />
                {loadingPermissoes ? (
                  <div className="flex justify-center py-8">
                    <Spinner size="lg" />
                  </div>
                ) : (
                  modulos.map((modulo) => (
                    <div key={modulo.key} className="space-y-3">
                      <h3 className="font-semibold text-default-700">{modulo.label}</h3>
                      {modulo.description && <p className="text-xs text-default-500">{modulo.description}</p>}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {acoes.map((acao) => {
                          // Estado efetivo da permissão
                          const permissaoEfetiva = permissoesEfetivas.find((p) => p.modulo === modulo.key && p.acao === acao.key);
                          const estaPermitido = permissaoEfetiva?.permitido ?? false;
                          const origem = permissaoEfetiva?.origem ?? "role";

                          // Override individual (se existe)
                          const temOverride = permissionsForm[modulo.key]?.[acao.key] !== undefined;
                          const overrideValue = permissionsForm[modulo.key]?.[acao.key] ?? null;

                          // Determinar se o switch deve estar ligado
                          // Se tem override, usa o override; senão, mostra o estado efetivo
                          const switchValue = temOverride ? overrideValue === true : estaPermitido;

                          // Labels para origem (incluindo estado negado)
                          const origemLabels = {
                            override: "Override",
                            cargo: "Herdado do cargo",
                            role: "Padrão do role",
                            negado: "Sem permissão",
                          };

                          const origemColors = {
                            override: "primary" as const,
                            cargo: "secondary" as const,
                            role: "default" as const,
                            negado: "danger" as const,
                          };

                          // Se a permissão está negada em todas as camadas (sem override, sem cargo, role padrão negado), destacar
                          // Só mostra "Sem permissão" se não há override explícito E a origem é role (padrão negado)
                          const mostrarNegado = !estaPermitido && !temOverride && origem === "role";
                          const labelOrigem = mostrarNegado ? "negado" : origem;
                          const chipColor = origemColors[labelOrigem as keyof typeof origemColors];
                          const chipLabel = origemLabels[labelOrigem as keyof typeof origemLabels];

                          return (
                            <div key={acao.key} className="flex items-center justify-between p-3 rounded-lg border border-default-200 bg-default-50">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <Switch
                                    isDisabled={isSavingPermission}
                                    isSelected={switchValue}
                                    onValueChange={(value) => {
                                      handleSavePermission(modulo.key, acao.key, value);
                                    }}
                                  >
                                    <span className="text-sm font-medium">{acao.label}</span>
                                  </Switch>
                                </div>
                                <div className="ml-8">
                                  <Chip color={chipColor} size="sm" variant="flat">
                                    {chipLabel}
                                  </Chip>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <Divider />
                    </div>
                  ))
                )}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setIsPermissionsModalOpen(false)}>
              Fechar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal de Vincular */}
      <Modal isOpen={isLinkModalOpen} scrollBehavior="inside" size="3xl" onClose={() => setIsLinkModalOpen(false)}>
        <ModalContent>
          <ModalHeaderGradient
            description="Crie vínculo operacional com advogado(s), sem alterar permissões do sistema"
            icon={LinkIcon}
            title={`Vincular Usuário - ${selectedUsuario?.firstName || selectedUsuario?.email || ""}`}
          />
          <ModalBody>
            <div className="space-y-6">
              <Card className="border border-divider/70 bg-content1/70">
                <CardBody className="py-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
                      <HelpCircle className="h-4 w-4" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        Para que serve o vínculo
                      </p>
                      <p className="text-xs text-default-500">
                        Use esta ação quando o colaborador apoia advogado(s)
                        específico(s) no dia a dia. O vínculo é organizacional:
                        não concede acesso extra por si só.
                      </p>
                    </div>
                  </div>
                </CardBody>
              </Card>

              <ModalSectionCard description="Escolha um ou mais advogados para organizar o atendimento deste usuário" title="Seleção do(s) Advogado(s)">
                <Select
                  description="Você pode selecionar múltiplos advogados. As permissões continuam sendo controladas por cargo, role e exceções."
                  label="Advogados"
                  placeholder="Selecione um ou mais advogados"
                  selectedKeys={new Set(validatedAdvogadoKeys)}
                  selectionMode="multiple"
                  startContent={<User className="w-4 h-4 text-default-400" />}
                  onSelectionChange={(keys) => {
                    setLinkForm({
                      ...linkForm,
                      advogadoIds: Array.from(keys) as string[],
                    });
                  }}
                >
                  {advogadosOptions.map((adv) => (
                    <SelectItem key={adv.id} textValue={adv.textValue}>
                      {adv.fullName}
                      {adv.oabLabel}
                    </SelectItem>
                  ))}
                </Select>
                {validatedAdvogadoKeys.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {validatedAdvogadoKeys.map((advId) => {
                      const adv = advogadosOptions.find((a) => a.id === advId);

                      return adv ? (
                        <Chip key={advId} color="primary" size="sm" variant="flat">
                          {adv.fullName}
                          {adv.oabLabel}
                        </Chip>
                      ) : null;
                    })}
                  </div>
                )}
              </ModalSectionCard>

              <ModalSectionCard description="Defina o tipo de relacionamento entre o usuário e o advogado" title="Tipo de Vinculação">
                <Select
                  description="Assistente: auxilia o advogado | Responsável: gerencia o usuário | Colaborador: trabalha em conjunto"
                  label="Tipo de Vinculação"
                  placeholder="Selecione o tipo"
                  selectedKeys={[linkForm.tipo]}
                  startContent={<LinkIcon className="w-4 h-4 text-default-400" />}
                  onSelectionChange={(keys) => {
                    const selected = Array.from(keys)[0] as string;

                    setLinkForm({ ...linkForm, tipo: selected });
                  }}
                >
                  <SelectItem key="assistente" textValue="Assistente">Assistente</SelectItem>
                  <SelectItem key="responsavel" textValue="Responsável">Responsável</SelectItem>
                  <SelectItem key="colaborador" textValue="Colaborador">Colaborador</SelectItem>
                </Select>
              </ModalSectionCard>

              <ModalSectionCard description="Informações adicionais sobre esta vinculação" title="Observações">
                <Textarea
                  label="Observações (opcional)"
                  minRows={3}
                  placeholder="Observações sobre esta vinculação..."
                  value={linkForm.observacoes}
                  onChange={(e) => setLinkForm({ ...linkForm, observacoes: e.target.value })}
                />
              </ModalSectionCard>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setIsLinkModalOpen(false)}>
              Cancelar
            </Button>
            <Button color="primary" isDisabled={linkForm.advogadoIds.length === 0} isLoading={isSavingLink} onPress={handleSaveLink}>
              Vincular {linkForm.advogadoIds.length > 0 ? `(${linkForm.advogadoIds.length})` : ""}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

function ConvitesTab() {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role as UserRole | undefined;
  const isAdmin = userRole === UserRole.ADMIN || userRole === UserRole.SUPER_ADMIN;

  const [convites, setConvites] = useState<ConviteEquipeData[]>([]);
  const [cargos, setCargos] = useState<CargoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [advancedInviteMode, setAdvancedInviteMode] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<CreateConviteData>({
    email: "",
    nome: "",
    cargoId: "",
    role: UserRole.SECRETARIA,
    observacoes: "",
  });

  useEffect(() => {
    if (isAdmin) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!advancedInviteMode && formData.cargoId) {
      const cargoSelecionado = cargos.find((cargo) => cargo.id === formData.cargoId);
      const roleSugerido = getRoleFromCargoNivel(cargoSelecionado?.nivel);

      if (formData.role !== roleSugerido) {
        setFormData((prev) => ({
          ...prev,
          role: roleSugerido,
        }));
      }
    }
  }, [advancedInviteMode, cargos, formData.cargoId, formData.role]);

  async function loadData() {
    try {
      setLoading(true);
      const [convitesData, cargosData] = await Promise.all([getConvitesEquipe(), getCargos()]);

      setConvites(convitesData);
      setCargos(cargosData);
    } catch (error) {
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateConvite() {
    // Validações
    if (!formData.email.trim()) {
      toast.error("Email é obrigatório");

      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(formData.email.trim())) {
      toast.error("Email inválido");

      return;
    }

    if (formData.nome && formData.nome.trim().length < 2) {
      toast.error("Nome deve ter pelo menos 2 caracteres");

      return;
    }

    if (formData.nome && formData.nome.trim().length > 100) {
      toast.error("Nome deve ter no máximo 100 caracteres");

      return;
    }

    if (formData.observacoes && formData.observacoes.length > 500) {
      toast.error("Observações devem ter no máximo 500 caracteres");

      return;
    }

    try {
      setLoading(true);
      await createConviteEquipe(formData);
      toast.success("Convite enviado com sucesso!");
      setIsModalOpen(false);
      setAdvancedInviteMode(false);
      setFormData({
        email: "",
        nome: "",
        cargoId: "",
        role: UserRole.SECRETARIA,
        observacoes: "",
      });
      loadData();
    } catch (error) {
      toast.error("Erro ao enviar convite");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendConvite(conviteId: string) {
    try {
      setActionLoading(conviteId);
      await resendConviteEquipe(conviteId);
      toast.success("Convite reenviado com sucesso!");
      loadData();
    } catch (error) {
      toast.error("Erro ao reenviar convite");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCancelConvite(conviteId: string) {
    // Encontrar o convite para mostrar o email
    const convite = convites.find((c) => c.id === conviteId);
    const email = convite?.email || "este convite";

    if (!confirm(`Tem certeza que deseja cancelar o convite para "${email}"?\n\nEsta ação não pode ser desfeita.`)) {
      return;
    }

    try {
      setActionLoading(conviteId);
      await cancelConviteEquipe(conviteId);
      toast.success(`Convite para "${email}" cancelado com sucesso!`);
      loadData();
    } catch (error) {
      toast.error("Erro ao cancelar convite");
    } finally {
      setActionLoading(null);
    }
  }

  function getStatusColor(status: string): ChipProps["color"] {
    const colors: Record<string, ChipProps["color"]> = {
      pendente: "warning",
      aceito: "success",
      rejeitado: "danger",
      expirado: "default",
    };

    return colors[status] ?? "default";
  }

  function getStatusIcon(status: string) {
    const icons = {
      pendente: Clock,
      aceito: CheckCircle,
      rejeitado: XCircle,
      expirado: X,
    };
    const IconComponent = icons[status as keyof typeof icons] || Clock;

    return <IconComponent className="w-3 h-3" />;
  }

  function getRoleLabel(role: string) {
    const labels = {
      ADMIN: "Administrador",
      ADVOGADO: "Advogado (legado)",
      SECRETARIA: "Secretária",
      FINANCEIRO: "Financeiro",
    };

    return labels[role as keyof typeof labels] || role;
  }

  function formatDate(date: Date) {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  }

  // useMemo deve ser chamado ANTES de qualquer return condicional (regra dos hooks)
  const convitesStats = useMemo(() => {
    const pendentes = convites.filter((c) => c.status === "pendente").length;
    const aceitos = convites.filter((c) => c.status === "aceito").length;
    const expirados = convites.filter((c) => c.status === "expirado").length;
    const rejeitados = convites.filter((c) => c.status === "rejeitado").length;

    return {
      pendentes,
      aceitos,
      expirados,
      rejeitados,
      total: convites.length,
    };
  }, [convites]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-32">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <Card className="border border-warning/20 bg-warning/5">
        <CardBody className="py-6">
          <p className="text-sm text-warning-600 dark:text-warning-300">
            Apenas administradores podem gerenciar convites.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <motion.div animate="visible" className="space-y-6" initial="hidden" variants={containerVariants}>
      {/* Cards de Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4 lg:gap-6 auto-rows-fr">
        {/* Card Pendentes */}
        <motion.div animate={{ opacity: 1, y: 0 }} className="flex" initial={{ opacity: 0, y: 20 }} transition={{ duration: 0.5, delay: 0.1 }}>
          <Card className="border border-white/10 bg-background/70 backdrop-blur-xl shadow-xl hover:shadow-2xl transition-all duration-500 group h-full w-full">
            <CardBody className="p-3 sm:p-4 md:p-6">
              <div className="flex items-center justify-between mb-2 sm:mb-3 md:mb-4">
                <div className="p-2 sm:p-2.5 md:p-3 bg-amber-500 rounded-xl shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <Clock className="text-white w-[18px] h-[18px] sm:w-5 sm:h-5 md:w-6 md:h-6" />
                </div>
                <div className="hidden sm:flex items-center justify-center p-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30">
                  <Clock className="text-amber-600 dark:text-amber-400 w-3 h-3 sm:w-4 sm:h-4" />
                </div>
              </div>
              <div className="space-y-1 sm:space-y-2">
                <p className="text-xs sm:text-sm font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wide line-clamp-1">Pendentes</p>
                <p className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-amber-800 dark:text-amber-200">{convitesStats.pendentes}</p>
                <p className="text-xs text-amber-600 dark:text-amber-400 line-clamp-1">Aguardando resposta</p>
              </div>
            </CardBody>
          </Card>
        </motion.div>

        {/* Card Aceitos */}
        <motion.div animate={{ opacity: 1, y: 0 }} className="flex" initial={{ opacity: 0, y: 20 }} transition={{ duration: 0.5, delay: 0.2 }}>
          <Card className="border border-white/10 bg-background/70 backdrop-blur-xl shadow-xl hover:shadow-2xl transition-all duration-500 group h-full w-full">
            <CardBody className="p-3 sm:p-4 md:p-6">
              <div className="flex items-center justify-between mb-2 sm:mb-3 md:mb-4">
                <div className="p-2 sm:p-2.5 md:p-3 bg-green-500 rounded-xl shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <CheckCircle className="text-white w-[18px] h-[18px] sm:w-5 sm:h-5 md:w-6 md:h-6" />
                </div>
                <div className="hidden sm:flex items-center justify-center p-1.5 rounded-full bg-green-100 dark:bg-green-900/30">
                  <CheckCircle className="text-green-600 dark:text-green-400 w-3 h-3 sm:w-4 sm:h-4" />
                </div>
              </div>
              <div className="space-y-1 sm:space-y-2">
                <p className="text-xs sm:text-sm font-semibold text-green-700 dark:text-green-300 uppercase tracking-wide line-clamp-1">Aceitos</p>
                <p className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-green-800 dark:text-green-200">{convitesStats.aceitos}</p>
                <p className="text-xs text-green-600 dark:text-green-400 line-clamp-1">Convites aceitos</p>
              </div>
            </CardBody>
          </Card>
        </motion.div>

        {/* Card Expirados */}
        <motion.div animate={{ opacity: 1, y: 0 }} className="flex" initial={{ opacity: 0, y: 20 }} transition={{ duration: 0.5, delay: 0.3 }}>
          <Card className="border border-white/10 bg-background/70 backdrop-blur-xl shadow-xl hover:shadow-2xl transition-all duration-500 group h-full w-full">
            <CardBody className="p-3 sm:p-4 md:p-6">
              <div className="flex items-center justify-between mb-2 sm:mb-3 md:mb-4">
                <div className="p-2 sm:p-2.5 md:p-3 bg-rose-500 rounded-xl shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <XCircle className="text-white w-[18px] h-[18px] sm:w-5 sm:h-5 md:w-6 md:h-6" />
                </div>
                <div className="hidden sm:flex items-center justify-center p-1.5 rounded-full bg-rose-100 dark:bg-rose-900/30">
                  <XCircle className="text-rose-600 dark:text-rose-400 w-3 h-3 sm:w-4 sm:h-4" />
                </div>
              </div>
              <div className="space-y-1 sm:space-y-2">
                <p className="text-xs sm:text-sm font-semibold text-rose-700 dark:text-rose-300 uppercase tracking-wide line-clamp-1">Expirados</p>
                <p className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-rose-800 dark:text-rose-200">{convitesStats.expirados}</p>
                <p className="text-xs text-rose-600 dark:text-rose-400 line-clamp-1">Convites vencidos</p>
              </div>
            </CardBody>
          </Card>
        </motion.div>

        {/* Card Total */}
        <motion.div animate={{ opacity: 1, y: 0 }} className="flex" initial={{ opacity: 0, y: 20 }} transition={{ duration: 0.5, delay: 0.4 }}>
          <Card className="border border-white/10 bg-background/70 backdrop-blur-xl shadow-xl hover:shadow-2xl transition-all duration-500 group h-full w-full">
            <CardBody className="p-3 sm:p-4 md:p-6">
              <div className="flex items-center justify-between mb-2 sm:mb-3 md:mb-4">
                <div className="p-2 sm:p-2.5 md:p-3 bg-purple-500 rounded-xl shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <Mail className="text-white w-[18px] h-[18px] sm:w-5 sm:h-5 md:w-6 md:h-6" />
                </div>
                <div className="hidden sm:flex items-center justify-center p-1.5 rounded-full bg-purple-100 dark:bg-purple-900/30">
                  <Mail className="text-purple-600 dark:text-purple-400 w-3 h-3 sm:w-4 sm:h-4" />
                </div>
              </div>
              <div className="space-y-1 sm:space-y-2">
                <p className="text-xs sm:text-sm font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wide line-clamp-1">Total</p>
                <p className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-purple-800 dark:text-purple-200">{convitesStats.total}</p>
                <p className="text-xs text-purple-600 dark:text-purple-400 line-clamp-1">Total de convites</p>
              </div>
            </CardBody>
          </Card>
        </motion.div>
      </div>

      <motion.div variants={cardVariants}>
        <Card className="border-none bg-white/90 shadow-lg backdrop-blur dark:bg-content1/80">
          <CardBody>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-start sm:items-center justify-between">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg sm:text-xl md:text-2xl font-bold">Convites de Funcionários</h2>
                <p className="text-xs sm:text-sm text-default-500">Gerencie os convites enviados para novos colaboradores do escritório</p>
              </div>
              <Button
                className="w-full sm:w-auto"
                color="primary"
                size="sm"
                startContent={<Plus className="w-4 h-4" />}
                onPress={() => {
                  setAdvancedInviteMode(false);
                  setIsModalOpen(true);
                }}
              >
                <span className="hidden sm:inline">Enviar Convite</span>
                <span className="sm:hidden">Novo</span>
              </Button>
            </div>
          </CardBody>
        </Card>
      </motion.div>

      {convites.length === 0 ? (
        <motion.div variants={cardVariants}>
          <Card className="border-none bg-dotted-pattern bg-white/90 py-12 text-center shadow-lg dark:bg-content2/80">
            <CardBody className="space-y-3">
              <Mail className="mx-auto h-10 w-10 text-default-400" />
              <h3 className="text-lg font-semibold">Nenhum convite encontrado</h3>
              <p className="text-sm text-default-500">Envie um convite para adicionar novos colaboradores à equipe</p>
              <Button
                color="primary"
                startContent={<Plus className="w-4 h-4" />}
                onPress={() => {
                  setAdvancedInviteMode(false);
                  setIsModalOpen(true);
                }}
              >
                Enviar Primeiro Convite
              </Button>
            </CardBody>
          </Card>
        </motion.div>
      ) : (
        <motion.div variants={cardVariants}>
          <Card className="border-none shadow-xl">
            <CardBody>
              <div className="space-y-4">
                {convites.map((convite) => (
                  <div key={convite.id} className="flex items-center justify-between p-4 rounded-lg border border-default-200 hover:bg-default-50 transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold">{convite.nome || convite.email}</h3>
                        <Chip color={getStatusColor(convite.status)} size="sm" startContent={getStatusIcon(convite.status)} variant="flat">
                          {convite.status}
                        </Chip>
                      </div>
                      <p className="text-sm text-default-500">{convite.email}</p>
                      {convite.cargo && (
                        <p className="text-xs text-default-400 mt-1">
                          Cargo: {convite.cargo.nome} | Role: {getRoleLabel(convite.role)}
                        </p>
                      )}
                      <p className="text-xs text-default-400 mt-1">Enviado em: {formatDate(convite.createdAt)}</p>
                    </div>
                    <div className="flex gap-2">
                      {convite.status === "pendente" && (
                        <>
                          <Button
                            color="primary"
                            isLoading={actionLoading === convite.id}
                            size="sm"
                            startContent={<Mail className="w-4 h-4" />}
                            variant="flat"
                            onPress={() => handleResendConvite(convite.id)}
                          >
                            Reenviar
                          </Button>
                          <Button
                            color="danger"
                            isLoading={actionLoading === convite.id}
                            size="sm"
                            startContent={<XCircle className="w-4 h-4" />}
                            variant="flat"
                            onPress={() => handleCancelConvite(convite.id)}
                          >
                            Cancelar
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </motion.div>
      )}

      {/* Modal de Novo Convite */}
      <Modal
        isOpen={isModalOpen}
        scrollBehavior="inside"
        size="5xl"
        onClose={() => {
          setIsModalOpen(false);
          setAdvancedInviteMode(false);
        }}
      >
        <ModalContent>
          <ModalHeaderGradient description="Convide um novo colaborador para a equipe" icon={Mail} title="Enviar Convite" />
          <ModalBody className="px-0">
            <Tabs
              aria-label="Formulário de convite"
              classNames={{
                tabList: "gap-6 w-full relative rounded-none px-6 pt-6 pb-0 border-b border-divider",
                cursor: "w-full bg-primary",
                tab: "max-w-fit px-0 h-12",
                tabContent: "group-data-[selected=true]:text-primary font-medium text-sm tracking-wide",
                panel: "px-6 pb-6 pt-4",
              }}
              color="primary"
              variant="underlined"
            >
              <Tab
                key="dados"
                title={
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded-md bg-blue-100 dark:bg-blue-900">
                      <User className="text-blue-600 dark:text-blue-300 w-4 h-4" />
                    </div>
                    <span>Dados</span>
                  </div>
                }
              >
                <div className="space-y-6">
                  <ModalSectionCard description="Dados do novo colaborador" title="Informações do Convite">
                    <div className="space-y-4">
                      <Input isRequired label="Email" placeholder="email@exemplo.com" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />

                      <Input label="Nome (opcional)" placeholder="Nome completo" value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} />
                    </div>
                  </ModalSectionCard>
                </div>
              </Tab>

              <Tab
                key="cargo-role"
                title={
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded-md bg-purple-100 dark:bg-purple-900">
                      <Award className="text-purple-600 dark:text-purple-300 w-4 h-4" />
                    </div>
                    <span>Cargo/Role</span>
                  </div>
                }
              >
                <div className="space-y-6">
                  <ModalSectionCard description="Configure cargo e role do novo colaborador" title="Função no Escritório">
                    <div className="space-y-4">
                      <Select
                        label="Cargo (opcional)"
                        placeholder="Selecione um cargo"
                        selectedKeys={formData.cargoId ? [formData.cargoId] : []}
                        onSelectionChange={(keys) => {
                          const selectedKey = Array.from(keys)[0] as string;
                          const cargoSelecionado = cargos.find(
                            (cargo) => cargo.id === selectedKey,
                          );
                          const roleSugerido = getRoleFromCargoNivel(
                            cargoSelecionado?.nivel,
                          );

                          setFormData({
                            ...formData,
                            cargoId: selectedKey || "",
                            role:
                              !selectedKey || advancedInviteMode
                                ? formData.role
                                : roleSugerido,
                          });
                        }}
                      >
                        {cargos.map((cargo) => (
                          <SelectItem key={cargo.id} textValue={cargo.nome}>{cargo.nome}</SelectItem>
                        ))}
                      </Select>

                      <div className="space-y-3 rounded-xl border border-default-200 bg-default-50 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-default-500">
                              Role base do convite
                            </p>
                            <p className="text-sm font-medium">
                              {getRoleLabelPtBr(formData.role)}
                            </p>
                          </div>
                          <Switch
                            isSelected={advancedInviteMode}
                            size="sm"
                            onValueChange={setAdvancedInviteMode}
                          >
                            Avançado
                          </Switch>
                        </div>

                        {advancedInviteMode ? (
                          <Select
                            label="Role manual (avançado)"
                            placeholder="Selecione o role"
                            selectedKeys={[formData.role]}
                            onSelectionChange={(keys) => {
                              const selectedKey = Array.from(keys)[0] as string;

                              setFormData({
                                ...formData,
                                role: selectedKey as UserRole,
                              });
                            }}
                          >
                            <SelectItem key="ADMIN" textValue="Administrador">Administrador</SelectItem>
                            <SelectItem key="SECRETARIA" textValue="Secretária">Secretária</SelectItem>
                            <SelectItem key="FINANCEIRO" textValue="Financeiro">Financeiro</SelectItem>
                          </Select>
                        ) : (
                          <p className="text-xs text-default-500">
                            No fluxo simples, o role acompanha o cargo para reduzir erros.
                          </p>
                        )}
                      </div>
                    </div>
                  </ModalSectionCard>
                </div>
              </Tab>

              <Tab
                key="observacoes"
                title={
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded-md bg-amber-100 dark:bg-amber-900">
                      <FileText className="text-amber-600 dark:text-amber-300 w-4 h-4" />
                    </div>
                    <span>Observações</span>
                  </div>
                }
              >
                <div className="space-y-6">
                  <ModalSectionCard description="Mensagem adicional para o convite" title="Mensagem Personalizada">
                    <Textarea
                      label="Observações (opcional)"
                      minRows={4}
                      placeholder="Mensagem personalizada para o convite..."
                      value={formData.observacoes}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          observacoes: e.target.value,
                        })
                      }
                    />
                  </ModalSectionCard>
                </div>
              </Tab>
            </Tabs>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button color="primary" isDisabled={!formData.email.trim()} isLoading={loading} onPress={handleCreateConvite}>
              Enviar Convite
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </motion.div>
  );
}

// ===== COMPONENTE PRINCIPAL =====

export default function EquipeContent() {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role as UserRole | undefined;
  const isAdmin = userRole === UserRole.ADMIN || userRole === UserRole.SUPER_ADMIN;

  const [selectedTab, setSelectedTab] = useState("cargos");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSection, setSelectedSection] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [showTutorial, setShowTutorial] = useState(true);
  const availableTabs = useMemo(
    () => (isAdmin ? ["cargos", "usuarios", "convites"] : ["cargos", "usuarios"]),
    [isAdmin],
  );

  useEffect(() => {
    if (!availableTabs.includes(selectedTab)) {
      setSelectedTab(availableTabs[0]);
    }
  }, [availableTabs, selectedTab]);

  useEffect(() => {
    try {
      const dismissed = window.localStorage.getItem("equipe:tutorial:dismissed");

      if (dismissed === "1") {
        setShowTutorial(false);
      }
    } catch {
      // noop
    }
  }, []);

  function handleDismissTutorial() {
    setShowTutorial(false);
    try {
      window.localStorage.setItem("equipe:tutorial:dismissed", "1");
    } catch {
      // noop
    }
  }

  function handleShowTutorialAgain() {
    setShowTutorial(true);
    try {
      window.localStorage.removeItem("equipe:tutorial:dismissed");
    } catch {
      // noop
    }
  }

  function handleExportAll() {
    try {
      const timestamp = new Date().toISOString().split("T")[0];
      const csvContent = [
        // Cabeçalho
        ["Tipo", "Nome", "Email", "Role", "Status", "Detalhes"].join(","),
        // Dados (será preenchido pelas tabs específicas)
        ["Equipe", "Magic Lawyer", "Exportação completa", "Sistema", "Ativo", `Exportado em ${timestamp}`].join(","),
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);

      link.setAttribute("href", url);
      link.setAttribute("download", `equipe-completa-${timestamp}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success("Dados exportados com sucesso!");
    } catch (error) {
      toast.error("Erro ao exportar dados");
    }
  }

  return (
    <div className="space-y-8">
      <motion.div animate="visible" initial="hidden" variants={fadeInUp}>
        <PeoplePageHeader
          description="Controle cargos, funcionários e convites com trilha de auditoria e padrão visual unificado."
          title="Equipe de funcionários"
          actions={
            <>
              <Button
                color="primary"
                size="sm"
                startContent={<Users className="w-4 h-4" />}
                onPress={() => setSelectedTab("usuarios")}
              >
                Gerenciar funcionários
              </Button>
              <Button
                size="sm"
                startContent={<Crown className="w-4 h-4" />}
                variant="bordered"
                onPress={() => setSelectedTab("cargos")}
              >
                Configurar cargos
              </Button>
            </>
          }
        />
      </motion.div>

      <motion.div animate="visible" initial="hidden" variants={fadeInUp}>
        {showTutorial ? (
          <Card className="border border-primary/20 bg-primary/5">
            <CardBody className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    Tutorial rápido da tela de Equipe
                  </h2>
                  <p className="text-sm text-default-500">
                    Fluxo pensado para operação simples: cargo principal, role base e exceção só no modo avançado.
                  </p>
                </div>
                <Button size="sm" variant="flat" onPress={handleDismissTutorial}>
                  Entendi, ocultar
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Card className="border border-divider/70 bg-content1/80">
                  <CardBody className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">Passo 1</p>
                    <p className="text-sm font-medium">Configure os cargos</p>
                    <p className="text-xs text-default-500">
                      Abra a aba Cargos e garanta que cada função do escritório tenha permissões corretas.
                    </p>
                  </CardBody>
                </Card>

                <Card className="border border-divider/70 bg-content1/80">
                  <CardBody className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">Passo 2</p>
                    <p className="text-sm font-medium">Ajuste o funcionário</p>
                    <p className="text-xs text-default-500">
                      Na aba Funcionários, edite o colaborador e defina o cargo principal. Esse é o controle principal de acesso.
                    </p>
                  </CardBody>
                </Card>

                <Card className="border border-divider/70 bg-content1/80">
                  <CardBody className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">Passo 3</p>
                    <p className="text-sm font-medium">Use a ação Vincular quando necessário</p>
                    <p className="text-xs text-default-500">
                      No modo estrito, sem vínculo não há acesso à carteira.
                      Vincule para liberar apenas o escopo necessário por
                      advogado.
                    </p>
                  </CardBody>
                </Card>

                <Card className="border border-divider/70 bg-content1/80">
                  <CardBody className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">Passo 4</p>
                    <p className="text-sm font-medium">Modo avançado só exceção</p>
                    <p className="text-xs text-default-500">
                      Permissão individual é exceção. Ative modo avançado apenas quando houver necessidade real e registrada.
                    </p>
                  </CardBody>
                </Card>
              </div>
            </CardBody>
          </Card>
        ) : (
          <div className="flex justify-end">
            <Button size="sm" variant="flat" onPress={handleShowTutorialAgain}>
              Mostrar tutorial da equipe
            </Button>
          </div>
        )}
      </motion.div>

      <motion.div animate="visible" initial="hidden" variants={fadeInUp}>
        <Card className="border border-divider/70 bg-content1/75 shadow-sm backdrop-blur-md">
          <CardHeader className="pb-2">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Resumo da equipe</h2>
              <p className="text-sm text-default-500">
                Indicadores consolidados de estrutura, convites e vinculações.
              </p>
            </div>
          </CardHeader>
          <Divider className="border-divider/70" />
          <CardBody>
            <DashboardEquipe />
          </CardBody>
        </Card>
      </motion.div>

      <motion.div animate="visible" initial="hidden" variants={fadeInUp}>
        <Card className="border border-divider/70 bg-content1/75 shadow-sm backdrop-blur-md">
          <CardBody className="space-y-4 p-4 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                <Filter className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground sm:text-lg">
                  Filtros operacionais
                </h3>
                <p className="text-xs text-default-500 sm:text-sm">
                  Navegue por cargos, funcionários e convites sem poluir a tela.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative flex-1">
                  <Input
                    endContent={
                      searchTerm && (
                        <Button isIconOnly size="sm" variant="light" onPress={() => setSearchTerm("")}>
                          <X className="w-4 h-4" />
                        </Button>
                      )
                    }
                    label="Buscar na equipe"
                    placeholder="Pesquise por nome, e-mail ou cargo..."
                    startContent={<Search className="w-4 h-4 text-default-400" />}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                <Button
                  className="w-full lg:w-auto"
                  startContent={<Filter className="w-4 h-4" />}
                  variant="flat"
                  onPress={() => setShowFilters(!showFilters)}
                >
                  Filtros
                </Button>
              </div>

              <div className="flex w-full gap-2 lg:w-auto">
                <Button
                  className="w-full lg:w-auto"
                  startContent={<Download className="w-4 h-4" />}
                  variant="flat"
                  onPress={() => handleExportAll()}
                >
                  Exportar visão
                </Button>
              </div>
            </div>

            <AnimatePresence>
              {showFilters && (
                <motion.div animate={{ opacity: 1, height: "auto" }} className="overflow-hidden" exit={{ opacity: 0, height: 0 }} initial={{ opacity: 0, height: 0 }}>
                  <div className="flex flex-wrap gap-4 pt-2">
                    <Select
                      className="min-w-[140px] sm:min-w-40 flex-1 sm:flex-none"
                      label="Seção"
                      placeholder="Todas as seções"
                      selectedKeys={selectedSection === "all" ? [] : [selectedSection]}
                      onSelectionChange={(keys) => {
                        const selected = Array.from(keys)[0] as string;

                        setSelectedSection(selected || "all");
                      }}
                    >
                      <SelectItem key="all" textValue="Todas">Todas</SelectItem>
                      <SelectItem key="cargos" textValue="Cargos">Cargos</SelectItem>
                      <SelectItem key="usuarios" textValue="Funcionários">Funcionários</SelectItem>
                      {isAdmin ? <SelectItem key="convites" textValue="Convites">Convites</SelectItem> : null}
                    </Select>

                    <Button
                      startContent={<RotateCcw className="w-4 h-4" />}
                      variant="light"
                      onPress={() => {
                        setSearchTerm("");
                        setSelectedSection("all");
                      }}
                    >
                      Limpar Filtros
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardBody>
        </Card>
      </motion.div>

      <motion.div animate="visible" initial="hidden" variants={fadeInUp}>
        <Card className="border border-divider/70 bg-content1/75 shadow-sm backdrop-blur-md">
          <CardBody className="p-0">
            <Tabs
              aria-label="Gestão de Equipe"
              classNames={{
                tabList:
                  "gap-4 sm:gap-6 w-full relative rounded-none px-4 sm:px-6 pt-4 pb-0 border-b border-divider",
                cursor: "w-full bg-primary",
                tab: "max-w-fit px-0 h-12",
                tabContent: "group-data-[selected=true]:text-primary font-medium text-sm tracking-wide",
                panel: "px-0",
              }}
              color="primary"
              selectedKey={selectedTab}
              variant="underlined"
              onSelectionChange={(key) => setSelectedTab(key as string)}
            >
              <Tab
                key="cargos"
                title={
                  <div className="flex items-center space-x-2">
                    <Crown className="w-4 h-4" />
                    <span>Cargos</span>
                  </div>
                }
              >
                <div className="p-4 sm:p-6">
                  <CargosTab />
                </div>
              </Tab>

              <Tab
                key="usuarios"
                title={
                  <div className="flex items-center space-x-2">
                    <Users className="w-4 h-4" />
                    <span>Funcionários</span>
                  </div>
                }
              >
                <div className="p-4 sm:p-6">
                  <UsuariosTab />
                </div>
              </Tab>

              {isAdmin ? (
                <Tab
                  key="convites"
                  title={
                    <div className="flex items-center space-x-2">
                      <Mail className="w-4 h-4" />
                      <span>Convites</span>
                    </div>
                  }
                >
                  <div className="p-4 sm:p-6">
                    <ConvitesTab />
                  </div>
                </Tab>
              ) : null}
            </Tabs>
          </CardBody>
        </Card>
      </motion.div>
    </div>
  );
}
