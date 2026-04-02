"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";

import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import { Checkbox } from "@heroui/checkbox";
import { toast } from "@/lib/toast";
import {
  MapPin,
  Plus,
  Edit3,
  Trash2,
  Star,
  Home,
  Building2,
  Briefcase,
  Mail,
  Building,
} from "lucide-react";
import { useSession } from "next-auth/react";

import { CidadeSelect } from "./cidade-select";
import { CepInput } from "./cep-input";

import { TipoEndereco } from "@/generated/prisma";
import {
  getEnderecosUsuario,
  criarEndereco,
  atualizarEndereco,
  deletarEndereco,
  definirEnderecoPrincipal,
  getEnderecosUsuarioAdmin,
  criarEnderecoAdmin,
  atualizarEnderecoAdmin,
  deletarEnderecoAdmin,
  definirEnderecoPrincipalAdmin,
  EnderecoData,
  EnderecoWithId,
} from "@/app/actions/enderecos";
import { useEstadosBrasil } from "@/hooks/use-brazil-apis";
import { type CepData } from "@/types/brazil";
import { Select, SelectItem } from "@heroui/react";

// Opções de tipo de endereço para funcionários do escritório
const tipoEnderecoEscritorioOptions = [
  { key: "MATRIZ", label: "Matriz", icon: Home },
  { key: "FILIAL", label: "Filial", icon: Building2 },
  { key: "ESCRITORIO", label: "Escritório", icon: Briefcase },
];

// Opções de tipo de endereço para clientes
const tipoEnderecoClienteOptions = [
  { key: "RESIDENCIAL", label: "Residencial", icon: Home },
  { key: "COMERCIAL", label: "Comercial", icon: Building },
  { key: "CORRESPONDENCIA", label: "Correspondência", icon: Mail },
];

// Removido - agora usando EstadoSelect que busca via API

interface EnderecoManagerProps {
  className?: string;
  userId?: string; // Opcional: Se fornecido, gerencia endereços deste usuário (para Super Admin)
}

export function EnderecoManager({ className, userId }: EnderecoManagerProps) {
  const { data: session } = useSession();
  // Se userId for fornecido, usa ele. Caso contrário, usa o da sessão
  const targetUserId = userId || session?.user?.id;
  const { estados, isLoading: estadosLoading } = useEstadosBrasil();
  const [enderecos, setEnderecos] = useState<EnderecoWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEndereco, setEditingEndereco] = useState<EnderecoWithId | null>(
    null,
  );
  const [formData, setFormData] = useState<EnderecoData>({
    apelido: "",
    tipo: "RESIDENCIAL" as TipoEndereco, // Valor padrão, será atualizado baseado no role
    principal: false,
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    estado: "", // FORÇADO LIMPO
    cep: "",
    pais: "Brasil",
    telefone: "",
    observacoes: "",
  });

  // Obter opções de tipo baseadas no role do usuário
  const getTipoEnderecoOptions = () => {
    const isCliente = session?.user?.role === "CLIENTE";

    return isCliente
      ? tipoEnderecoClienteOptions
      : tipoEnderecoEscritorioOptions;
  };

  // Obter tipo padrão baseado no role do usuário
  const getDefaultTipo = (): TipoEndereco => {
    const isCliente = session?.user?.role === "CLIENTE";

    return isCliente ? "RESIDENCIAL" : "ESCRITORIO";
  };

  // Preencher dados do endereço automaticamente quando CEP for encontrado
  const handleCepFound = useCallback((cepData: CepData) => {
    setFormData((prev) => ({
      ...prev,
      logradouro: cepData.logradouro,
      bairro: cepData.bairro,
      cidade: cepData.localidade,
      estado: cepData.uf,
      cep: cepData.cep,
    }));
  }, []);

  // Carregar endereços
  useEffect(() => {
    loadEnderecos();
  }, [targetUserId]); // Incluir targetUserId nas dependências para recarregar quando mudar

  const loadEnderecos = async () => {
    try {
      setLoading(true);
      // Se userId for fornecido, usa função Admin, caso contrário usa função normal
      const result = userId
        ? await getEnderecosUsuarioAdmin(userId)
        : await getEnderecosUsuario();

      if (result.success && result.enderecos) {
        setEnderecos(result.enderecos);
      } else {
        toast.error(result.error || "Erro ao carregar endereços");
      }
    } catch (error) {
      toast.error("Erro ao carregar endereços");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (endereco?: EnderecoWithId) => {
    if (endereco) {
      setEditingEndereco(endereco);
      setFormData({
        apelido: endereco.apelido,
        tipo: endereco.tipo,
        principal: endereco.principal,
        logradouro: endereco.logradouro,
        numero: endereco.numero || "",
        complemento: endereco.complemento || "",
        bairro: endereco.bairro || "",
        cidade: endereco.cidade,
        estado: endereco.estado,
        cep: endereco.cep || "",
        pais: endereco.pais || "Brasil",
        telefone: endereco.telefone || "",
        observacoes: endereco.observacoes || "",
      });
    } else {
      setEditingEndereco(null);
      setFormData({
        apelido: "",
        tipo: getDefaultTipo(),
        principal: false,
        logradouro: "",
        numero: "",
        complemento: "",
        bairro: "",
        cidade: "",
        estado: "",
        cep: "",
        pais: "Brasil",
        telefone: "",
        observacoes: "",
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingEndereco(null);
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      let result;

      if (editingEndereco) {
        // Se userId for fornecido, usa função Admin
        result = userId
          ? await atualizarEnderecoAdmin(userId, editingEndereco.id, formData)
          : await atualizarEndereco(editingEndereco.id, formData);
      } else {
        // Se userId for fornecido, usa função Admin
        result = userId
          ? await criarEnderecoAdmin(userId, formData)
          : await criarEndereco(formData);
      }

      if (result.success) {
        toast.success(
          editingEndereco ? "Endereço atualizado!" : "Endereço criado!",
        );
        await loadEnderecos();
        handleCloseModal();
      } else {
        toast.error(result.error || "Erro ao salvar endereço");
      }
    } catch (error) {
      toast.error("Erro ao salvar endereço");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (enderecoId: string) => {
    if (!confirm("Tem certeza que deseja deletar este endereço?")) return;

    try {
      setSaving(true);
      // Se userId for fornecido, usa função Admin
      const result = userId
        ? await deletarEnderecoAdmin(userId, enderecoId)
        : await deletarEndereco(enderecoId);

      if (result.success) {
        toast.success("Endereço deletado!");
        await loadEnderecos();
      } else {
        toast.error(result.error || "Erro ao deletar endereço");
      }
    } catch (error) {
      toast.error("Erro ao deletar endereço");
    } finally {
      setSaving(false);
    }
  };

  const handleSetPrincipal = async (enderecoId: string) => {
    try {
      setSaving(true);
      // Se userId for fornecido, usa função Admin
      const result = userId
        ? await definirEnderecoPrincipalAdmin(userId, enderecoId)
        : await definirEnderecoPrincipal(enderecoId);

      if (result.success) {
        toast.success("Endereço definido como principal!");
        await loadEnderecos();
      } else {
        toast.error(result.error || "Erro ao definir endereço principal");
      }
    } catch (error) {
      toast.error("Erro ao definir endereço principal");
    } finally {
      setSaving(false);
    }
  };

  const getTipoIcon = (tipo: TipoEndereco) => {
    const options = getTipoEnderecoOptions();
    const tipoOption = options.find((opt) => opt.key === tipo);

    return tipoOption ? tipoOption.icon : Home;
  };

  const getTipoLabel = (tipo: TipoEndereco) => {
    const options = getTipoEnderecoOptions();
    const tipoOption = options.find((opt) => opt.key === tipo);

    return tipoOption ? tipoOption.label : tipo;
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardBody className="flex items-center justify-center py-8">
          <Spinner size="lg" />
        </CardBody>
      </Card>
    );
  }

  return (
    <>
      <Card className={className}>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-linear-to-br from-primary/20 to-secondary/20 border border-primary/30">
              <MapPin className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                Meus Endereços
              </h3>
              <p className="text-sm text-default-400">
                Gerencie seus endereços
              </p>
            </div>
          </div>
          <Button
            color="primary"
            isDisabled={saving}
            startContent={<Plus className="w-4 h-4" />}
            variant="bordered"
            onPress={() => handleOpenModal()}
          >
            Adicionar
          </Button>
        </CardHeader>

        <CardBody className="space-y-4">
          {enderecos.length === 0 ? (
            <div className="text-center py-8">
              <MapPin className="w-12 h-12 text-default-400 mx-auto mb-4" />
              <p className="text-default-400">Nenhum endereço cadastrado</p>
              <p className="text-sm text-default-500">
                Adicione seu primeiro endereço
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {enderecos.map((endereco) => {
                const TipoIcon = getTipoIcon(endereco.tipo);

                return (
                  <Card
                    key={endereco.id}
                    className="border border-white/10 bg-background/50"
                  >
                    <CardBody className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <TipoIcon className="w-5 h-5 text-primary" />
                            <h4 className="font-semibold text-white">
                              {endereco.apelido}
                            </h4>
                            {endereco.principal && (
                              <Chip
                                className="font-medium whitespace-nowrap"
                                color="primary"
                                size="sm"
                                variant="flat"
                              >
                                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                                  <Star className="h-3 w-3 shrink-0" />
                                  Principal
                                </span>
                              </Chip>
                            )}
                            <Chip color="secondary" size="sm" variant="flat">
                              {getTipoLabel(endereco.tipo)}
                            </Chip>
                          </div>

                          <div className="text-sm text-default-300 space-y-1">
                            <p>
                              {endereco.logradouro}
                              {endereco.numero && `, ${endereco.numero}`}
                              {endereco.complemento &&
                                `, ${endereco.complemento}`}
                            </p>
                            <p>
                              {endereco.bairro && `${endereco.bairro}, `}
                              {endereco.cidade} - {endereco.estado}
                              {endereco.cep && `, ${endereco.cep}`}
                            </p>
                            {endereco.telefone && <p>📞 {endereco.telefone}</p>}
                            {endereco.observacoes && (
                              <p className="text-default-400 italic">
                                💬 {endereco.observacoes}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 ml-4">
                          {!endereco.principal && (
                            <Button
                              color="warning"
                              isDisabled={saving}
                              size="sm"
                              startContent={<Star className="w-4 h-4" />}
                              variant="ghost"
                              onPress={() => handleSetPrincipal(endereco.id)}
                            >
                              Principal
                            </Button>
                          )}
                          <Button
                            color="primary"
                            isDisabled={saving}
                            size="sm"
                            startContent={<Edit3 className="w-4 h-4" />}
                            variant="ghost"
                            onPress={() => handleOpenModal(endereco)}
                          >
                            Editar
                          </Button>
                          <Button
                            color="danger"
                            isDisabled={saving || enderecos.length <= 1}
                            size="sm"
                            startContent={<Trash2 className="w-4 h-4" />}
                            variant="ghost"
                            onPress={() => handleDelete(endereco.id)}
                          >
                            Deletar
                          </Button>
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Modal de Edição/Criação */}
      <Modal
        isOpen={isModalOpen}
        scrollBehavior="inside"
        size="2xl"
        onClose={handleCloseModal}
      >
        <ModalContent>
          <ModalHeader>
            <h2 className="text-xl font-semibold">
              {editingEndereco ? "Editar Endereço" : "Novo Endereço"}
            </h2>
          </ModalHeader>

          <ModalBody className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                isRequired
                label="Apelido"
                placeholder={
                  session?.user?.role === "CLIENTE"
                    ? "Ex: Casa, Trabalho, Comercial"
                    : "Ex: Matriz, Filial, Escritório"
                }
                value={formData.apelido}
                onChange={(e) =>
                  setFormData({ ...formData, apelido: e.target.value })
                }
              />

              <Select
                isRequired
                label="Tipo"
                placeholder="Selecione o tipo de endereço"
                selectedKeys={formData.tipo ? [formData.tipo] : []}
                onSelectionChange={(keys) => {
                  const selected = Array.from(keys)[0] as TipoEndereco;

                  setFormData({ ...formData, tipo: selected });
                }}
              >
                {getTipoEnderecoOptions().map((option) => (
                  <SelectItem key={option.key} textValue={option.label}>{option.label}</SelectItem>
                ))}
              </Select>
            </div>

            <CepInput
              isRequired
              label="CEP"
              value={formData.cep}
              onCepFound={handleCepFound}
              onChange={(value) => setFormData({ ...formData, cep: value })}
            />

            <Input
              isRequired
              label="Logradouro"
              placeholder="Rua, Avenida, etc."
              value={formData.logradouro}
              onChange={(e) =>
                setFormData({ ...formData, logradouro: e.target.value })
              }
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Número"
                placeholder="123"
                value={formData.numero}
                onChange={(e) =>
                  setFormData({ ...formData, numero: e.target.value })
                }
              />

              <Input
                label="Complemento"
                placeholder="Apto, Sala, etc."
                value={formData.complemento}
                onChange={(e) =>
                  setFormData({ ...formData, complemento: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Bairro"
                placeholder="Centro, Vila, etc."
                value={formData.bairro}
                onChange={(e) =>
                  setFormData({ ...formData, bairro: e.target.value })
                }
              />

              <CidadeSelect
                isRequired
                estadoSelecionado={formData.estado}
                label="Cidade"
                selectedKeys={formData.cidade ? [formData.cidade] : []}
                onSelectionChange={(keys) => {
                  const selected = Array.from(keys)[0] as string;

                  setFormData({ ...formData, cidade: selected });
                }}
              />

              {estadosLoading ? (
                <div className="flex items-center gap-2">
                  <Spinner size="sm" />
                  <span className="text-sm text-default-500">
                    Carregando estados...
                  </span>
                </div>
              ) : (
                <Select
                  isRequired
                  label="Estado"
                  placeholder="Selecione o estado"
                  selectedKeys={formData.estado ? [formData.estado] : []}
                  onSelectionChange={(keys) => {
                    const selected = Array.from(keys)[0] as string;

                    setFormData({ ...formData, estado: selected, cidade: "" });
                  }}
                >
                  {estados?.map((estado) => (
                    <SelectItem
                      key={estado.sigla}
                      textValue={`${estado.nome} (${estado.sigla})`}
                    >
                      {estado.nome} ({estado.sigla})
                    </SelectItem>
                  )) || []}
                </Select>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="País"
                placeholder="Brasil"
                value={formData.pais}
                onChange={(e) =>
                  setFormData({ ...formData, pais: e.target.value })
                }
              />

              <Input
                label="Telefone"
                placeholder="(11) 99999-9999"
                value={formData.telefone}
                onChange={(e) =>
                  setFormData({ ...formData, telefone: e.target.value })
                }
              />
            </div>

            <Input
              label="Observações"
              placeholder="Informações adicionais..."
              value={formData.observacoes}
              onChange={(e) =>
                setFormData({ ...formData, observacoes: e.target.value })
              }
            />

            <Checkbox
              isSelected={formData.principal}
              onValueChange={(checked) =>
                setFormData({ ...formData, principal: checked })
              }
            >
              Definir como endereço principal
            </Checkbox>
          </ModalBody>

          <ModalFooter>
            <Button variant="ghost" onPress={handleCloseModal}>
              Cancelar
            </Button>
            <Button
              color="primary"
              isDisabled={
                !formData.apelido ||
                !formData.logradouro ||
                !formData.cidade ||
                !formData.estado
              }
              isLoading={saving}
              onPress={handleSave}
            >
              {editingEndereco ? "Atualizar" : "Criar"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
