"use client";

import type { CepData, CnpjData } from "@/types/brazil";

import { useCallback, useEffect, useMemo, useState, type Key } from "react";
import { Button } from "@heroui/button";
import { Input, Textarea } from "@heroui/input";
import { Checkbox } from "@heroui/checkbox";
import { Card, CardBody } from "@heroui/card";
import { Spinner } from "@heroui/spinner";
import {
  Modal as HeroUIModal,
  ModalBody,
  ModalContent,
  ModalFooter,
  Select,
  SelectItem,
  Tab,
  Tabs,
} from "@heroui/react";
import {
  Building2,
  CheckCircle,
  Copy,
  FileText,
  Key as KeyIcon,
  Mail,
  Phone,
  User,
} from "lucide-react";

import { useUserPermissions } from "@/app/hooks/use-user-permissions";
import { useAdvogadosParaSelect } from "@/app/hooks/use-advogados-select";
import { createCliente, type Cliente, type ClienteCreateInput } from "@/app/actions/clientes";
import { buscarCepAction } from "@/app/actions/brazil-apis";
import { TipoPessoa } from "@/generated/prisma";
import { Modal } from "@/components/ui/modal";
import { CpfInput } from "@/components/cpf-input";
import { CnpjInput } from "@/components/cnpj-input";
import { DateInput } from "@/components/ui/date-input";
import { ModalHeaderGradient } from "@/components/ui/modal-header-gradient";
import { ModalSectionCard } from "@/components/ui/modal-section-card";
import { toast } from "@/lib/toast";

interface ClienteCreateModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (cliente: Cliente) => void | Promise<void>;
}

function formatDateToInput(value?: Date | string | null) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseDateFromInput(value: string) {
  if (!value) {
    return undefined;
  }

  const [year, month, day] = value.split("-").map((part) => Number(part));

  if (!year || !month || !day) {
    return undefined;
  }

  return new Date(year, month - 1, day);
}

function formatCepForInput(value: string) {
  const digitsOnly = value.replace(/\D/g, "").slice(0, 8);

  if (digitsOnly.length <= 5) {
    return digitsOnly;
  }

  return `${digitsOnly.slice(0, 5)}-${digitsOnly.slice(5)}`;
}

const INITIAL_ENDERECO_PRINCIPAL: NonNullable<
  ClienteCreateInput["enderecoPrincipal"]
> = {
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  pais: "Brasil",
};

function normalizeEnderecoPrincipalForPayload(
  endereco?: ClienteCreateInput["enderecoPrincipal"],
): ClienteCreateInput["enderecoPrincipal"] {
  if (!endereco) {
    return undefined;
  }

  const payload = {
    cep: endereco.cep?.trim() || "",
    logradouro: endereco.logradouro?.trim() || "",
    numero: endereco.numero?.trim() || "",
    complemento: endereco.complemento?.trim() || "",
    bairro: endereco.bairro?.trim() || "",
    cidade: endereco.cidade?.trim() || "",
    estado: endereco.estado?.trim().toUpperCase() || "",
    pais: endereco.pais?.trim() || "Brasil",
  };

  const hasEndereco =
    payload.cep ||
    payload.logradouro ||
    payload.numero ||
    payload.complemento ||
    payload.bairro ||
    payload.cidade ||
    payload.estado;

  return hasEndereco ? payload : undefined;
}

function hasPrimaryPhoneContact(input: {
  telefone?: string | null;
  celular?: string | null;
}) {
  return Boolean(input.telefone?.trim() || input.celular?.trim());
}

type EnderecoPrincipalField = keyof NonNullable<
  ClienteCreateInput["enderecoPrincipal"]
>;

const INITIAL_CLIENTE_FORM_STATE: ClienteCreateInput = {
  tipoPessoa: TipoPessoa.FISICA,
  nome: "",
  documento: "",
  email: "",
  telefone: "",
  celular: "",
  dataNascimento: undefined,
  inscricaoEstadual: "",
  nomePai: "",
  documentoPai: "",
  nomeMae: "",
  documentoMae: "",
  observacoes: "",
  responsavelNome: "",
  responsavelEmail: "",
  responsavelTelefone: "",
  enderecoPrincipal: INITIAL_ENDERECO_PRINCIPAL,
  advogadosIds: undefined,
};

export function ClienteCreateModal({
  isOpen,
  onOpenChange,
  onCreated,
}: ClienteCreateModalProps) {
  const { isSuperAdmin, isAdmin } = useUserPermissions();
  const canManageAllClients = isAdmin || isSuperAdmin;
  const { advogados, isLoading: isLoadingAdvogados } = useAdvogadosParaSelect();

  const [formState, setFormState] = useState<ClienteCreateInput>(
    INITIAL_CLIENTE_FORM_STATE,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isSearchingCep, setIsSearchingCep] = useState(false);
  const [criarUsuario, setCriarUsuario] = useState(false);
  const [credenciaisModal, setCredenciaisModal] = useState<{
    email: string;
    maskedEmail: string;
    primeiroAcessoEnviado: boolean;
    erroEnvio?: string;
  } | null>(null);

  const advogadoIdSet = useMemo(
    () => new Set((advogados || []).map((advogado) => advogado.id)),
    [advogados],
  );
  const selectedAdvogadosKeys = useMemo(
    () => (formState.advogadosIds || []).filter((id) => advogadoIdSet.has(id)),
    [advogadoIdSet, formState.advogadosIds],
  );

  const resetForm = useCallback(() => {
    setFormState(INITIAL_CLIENTE_FORM_STATE);
    setCriarUsuario(false);
    setIsSearchingCep(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      resetForm();
    }
  }, [isOpen, resetForm]);

  const handleCepFound = useCallback((cepData: CepData) => {
    setFormState((prev) => ({
      ...prev,
      enderecoPrincipal: {
        ...(prev.enderecoPrincipal || INITIAL_ENDERECO_PRINCIPAL),
        cep: formatCepForInput(
          cepData.cep || prev.enderecoPrincipal?.cep || "",
        ),
        logradouro:
          cepData.logradouro || prev.enderecoPrincipal?.logradouro || "",
        bairro: cepData.bairro || prev.enderecoPrincipal?.bairro || "",
        cidade: cepData.localidade || prev.enderecoPrincipal?.cidade || "",
        estado: (
          cepData.uf ||
          prev.enderecoPrincipal?.estado ||
          ""
        ).toUpperCase(),
      },
    }));
  }, []);

  const handleCnpjFound = useCallback((cnpjData: CnpjData) => {
    const primeiroSocio = cnpjData.qsa?.[0]?.nome_socio || "";

    setFormState((prev) => ({
      ...prev,
      nome: cnpjData.razao_social || prev.nome,
      documento: cnpjData.cnpj || prev.documento,
      email: cnpjData.email || prev.email,
      telefone: cnpjData.ddd_telefone_1 || prev.telefone,
      responsavelNome: primeiroSocio || prev.responsavelNome,
      enderecoPrincipal: {
        ...(prev.enderecoPrincipal || INITIAL_ENDERECO_PRINCIPAL),
        cep: formatCepForInput(cnpjData.cep || prev.enderecoPrincipal?.cep || ""),
        logradouro: cnpjData.logradouro || prev.enderecoPrincipal?.logradouro || "",
        numero: cnpjData.numero || prev.enderecoPrincipal?.numero || "",
        complemento:
          cnpjData.complemento || prev.enderecoPrincipal?.complemento || "",
        bairro: cnpjData.bairro || prev.enderecoPrincipal?.bairro || "",
        cidade: cnpjData.municipio || prev.enderecoPrincipal?.cidade || "",
        estado: (cnpjData.uf || prev.enderecoPrincipal?.estado || "").toUpperCase(),
        pais: prev.enderecoPrincipal?.pais || "Brasil",
      },
    }));
  }, []);

  const handleAdvogadosSelectionChange = useCallback(
    (keys: "all" | Set<Key>) => {
      if (keys === "all") {
        const allAdvogados = (advogados || []).map((advogado) => advogado.id);

        setFormState((prev) => ({
          ...prev,
          advogadosIds: allAdvogados.length > 0 ? allAdvogados : undefined,
        }));

        return;
      }

      const selected = Array.from(keys)
        .filter((key): key is string => typeof key === "string")
        .filter((id) => advogadoIdSet.has(id));

      setFormState((prev) => ({
        ...prev,
        advogadosIds: selected.length > 0 ? selected : [],
      }));
    },
    [advogadoIdSet, advogados],
  );

  const handleEnderecoPrincipalChange = useCallback(
    (field: EnderecoPrincipalField, value: string) => {
      setFormState((prev) => ({
        ...prev,
        enderecoPrincipal: {
          ...(prev.enderecoPrincipal || INITIAL_ENDERECO_PRINCIPAL),
          [field]: field === "cep" ? formatCepForInput(value) : value,
        },
      }));
    },
    [],
  );

  const handleEnderecoCepBlur = useCallback(async () => {
    const cep = formState.enderecoPrincipal?.cep || "";
    const cepNumerico = cep.replace(/\D/g, "");

    if (!cepNumerico) {
      return;
    }

    if (cepNumerico.length !== 8) {
      toast.error("CEP deve ter 8 digitos");
      return;
    }

    try {
      setIsSearchingCep(true);
      const result = await buscarCepAction(cepNumerico);

      if (result.success && result.cepData) {
        handleCepFound(result.cepData);
      } else {
        toast.error(result.error || "CEP nao encontrado");
      }
    } catch {
      toast.error("Erro ao buscar CEP");
    } finally {
      setIsSearchingCep(false);
    }
  }, [formState.enderecoPrincipal?.cep, handleCepFound]);

  const applyTipoPessoaChange = useCallback((selectedTipo: TipoPessoa) => {
    setFormState((prev) => ({
      ...prev,
      tipoPessoa: selectedTipo,
      dataNascimento:
        selectedTipo === TipoPessoa.JURIDICA ? undefined : prev.dataNascimento,
      inscricaoEstadual:
        selectedTipo === TipoPessoa.JURIDICA ? prev.inscricaoEstadual : "",
      nomePai: selectedTipo === TipoPessoa.JURIDICA ? "" : prev.nomePai,
      documentoPai:
        selectedTipo === TipoPessoa.JURIDICA ? "" : prev.documentoPai,
      nomeMae: selectedTipo === TipoPessoa.JURIDICA ? "" : prev.nomeMae,
      documentoMae:
        selectedTipo === TipoPessoa.JURIDICA ? "" : prev.documentoMae,
      responsavelNome:
        selectedTipo === TipoPessoa.JURIDICA ? prev.responsavelNome : "",
      responsavelEmail:
        selectedTipo === TipoPessoa.JURIDICA ? prev.responsavelEmail : "",
      responsavelTelefone:
        selectedTipo === TipoPessoa.JURIDICA ? prev.responsavelTelefone : "",
    }));
  }, []);

  const handleTipoPessoaSelectionChange = useCallback(
    (keys: unknown) => {
      if (keys === "all" || keys == null) {
        return;
      }

      let selectedTipo: TipoPessoa | undefined;

      if (typeof keys === "string") {
        if (keys === TipoPessoa.FISICA || keys === TipoPessoa.JURIDICA) {
          selectedTipo = keys;
        }
      } else if (keys instanceof Set) {
        selectedTipo = Array.from(keys).find(
          (key): key is TipoPessoa =>
            key === TipoPessoa.FISICA || key === TipoPessoa.JURIDICA,
        );
      } else if (
        typeof keys === "object" &&
        keys !== null &&
        Symbol.iterator in keys
      ) {
        selectedTipo = Array.from(keys as Iterable<Key>).find(
          (key): key is TipoPessoa =>
            key === TipoPessoa.FISICA || key === TipoPessoa.JURIDICA,
        );
      } else if (
        typeof keys === "object" &&
        keys !== null &&
        "currentKey" in keys
      ) {
        const currentKey = (keys as { currentKey?: Key | null }).currentKey;

        if (
          currentKey === TipoPessoa.FISICA ||
          currentKey === TipoPessoa.JURIDICA
        ) {
          selectedTipo = currentKey;
        }
      }

      if (!selectedTipo) {
        return;
      }

      applyTipoPessoaChange(selectedTipo);
    },
    [applyTipoPessoaChange],
  );

  const handleModalOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        resetForm();
      }

      onOpenChange(open);
    },
    [onOpenChange, resetForm],
  );

  const handleCreateCliente = useCallback(async () => {
    if (!formState.nome) {
      toast.error("Nome e obrigatorio");
      return;
    }

    if (!hasPrimaryPhoneContact(formState)) {
      toast.error("Informe ao menos um telefone ou celular");
      return;
    }

    if (criarUsuario && !formState.email) {
      toast.error("Email e obrigatorio para criar usuario de acesso");
      return;
    }

    setIsSaving(true);

    try {
      const payload: ClienteCreateInput = {
        ...formState,
        criarUsuario,
        dataNascimento:
          formState.tipoPessoa === TipoPessoa.FISICA
            ? formState.dataNascimento || undefined
            : undefined,
        inscricaoEstadual:
          formState.tipoPessoa === TipoPessoa.JURIDICA
            ? formState.inscricaoEstadual || undefined
            : undefined,
        nomePai:
          formState.tipoPessoa === TipoPessoa.FISICA
            ? formState.nomePai || undefined
            : undefined,
        documentoPai:
          formState.tipoPessoa === TipoPessoa.FISICA
            ? formState.documentoPai || undefined
            : undefined,
        nomeMae:
          formState.tipoPessoa === TipoPessoa.FISICA
            ? formState.nomeMae || undefined
            : undefined,
        documentoMae:
          formState.tipoPessoa === TipoPessoa.FISICA
            ? formState.documentoMae || undefined
            : undefined,
        enderecoPrincipal: normalizeEnderecoPrincipalForPayload(
          formState.enderecoPrincipal,
        ),
        advogadosIds:
          canManageAllClients && (formState.advogadosIds || []).length > 0
            ? formState.advogadosIds
            : undefined,
      };

      const result = await createCliente(payload);

      if (!result.success || !result.cliente) {
        toast.error(result.error || "Erro ao criar cliente");
        return;
      }

      toast.success("Cliente criado com sucesso!");
      handleModalOpenChange(false);
      await onCreated?.(result.cliente);

      if (result.usuario) {
        setCredenciaisModal(result.usuario);

        if (!result.usuario.primeiroAcessoEnviado) {
          toast.warning(
            "Cliente criado, mas o e-mail de primeiro acesso nao foi enviado automaticamente.",
          );
        }
      }
    } catch {
      toast.error("Erro ao criar cliente");
    } finally {
      setIsSaving(false);
    }
  }, [
    canManageAllClients,
    criarUsuario,
    formState,
    handleModalOpenChange,
    onCreated,
  ]);

  return (
    <>
      <HeroUIModal
        isOpen={isOpen}
        scrollBehavior="inside"
        size="5xl"
        onOpenChange={handleModalOpenChange}
      >
        <ModalContent>
          <ModalHeaderGradient
            description="Complete as informacoes para cadastrar um novo cliente"
            icon={Building2}
            title="Novo Cliente"
          />
          <ModalBody className="px-0">
            <Tabs
              aria-label="Formulario do cliente"
              classNames={{
                tabList:
                  "gap-6 w-full relative rounded-none px-6 pt-6 pb-0 border-b border-divider",
                cursor: "w-full bg-primary",
                tab: "max-w-fit px-0 h-12",
                tabContent:
                  "group-data-[selected=true]:text-primary font-medium text-sm tracking-wide",
                panel: "px-6 pb-6 pt-4",
              }}
              color="primary"
              variant="underlined"
            >
              <Tab
                key="dados-gerais"
                title={
                  <div className="flex items-center gap-2">
                    <div className="rounded-md bg-blue-100 p-1 dark:bg-blue-900">
                      <User className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                    </div>
                    <span>Dados Gerais</span>
                  </div>
                }
              >
                <div className="space-y-6">
                  <ModalSectionCard
                    description="Informacoes basicas do cliente"
                    title="Identificacao"
                  >
                    <div className="space-y-4">
                      <Select
                        label="Tipo de Pessoa"
                        placeholder="Selecione"
                        popoverProps={{
                          classNames: {
                            base: "z-[10000]",
                            content: "z-[10000]",
                          },
                        }}
                        selectedKeys={new Set([formState.tipoPessoa])}
                        onSelectionChange={handleTipoPessoaSelectionChange}
                      >
                        <SelectItem
                          key={TipoPessoa.FISICA}
                          textValue="Pessoa Fisica"
                        >
                          Pessoa Fisica
                        </SelectItem>
                        <SelectItem
                          key={TipoPessoa.JURIDICA}
                          textValue="Pessoa Juridica"
                        >
                          Pessoa Juridica
                        </SelectItem>
                      </Select>

                      <Input
                        isRequired
                        label={
                          formState.tipoPessoa === TipoPessoa.FISICA
                            ? "Nome Completo"
                            : "Razao Social"
                        }
                        placeholder={
                          formState.tipoPessoa === TipoPessoa.FISICA
                            ? "Nome completo"
                            : "Razao Social"
                        }
                        startContent={
                          formState.tipoPessoa === TipoPessoa.FISICA ? (
                            <User className="h-4 w-4 text-default-400" />
                          ) : (
                            <Building2 className="h-4 w-4 text-default-400" />
                          )
                        }
                        value={formState.nome}
                        onValueChange={(value) =>
                          setFormState((prev) => ({ ...prev, nome: value }))
                        }
                      />

                      {formState.tipoPessoa === TipoPessoa.FISICA ? (
                        <CpfInput
                          value={formState.documento}
                          onChange={(value) =>
                            setFormState((prev) => ({
                              ...prev,
                              documento: value,
                            }))
                          }
                        />
                      ) : (
                        <CnpjInput
                          value={formState.documento}
                          onChange={(value) =>
                            setFormState((prev) => ({
                              ...prev,
                              documento: value,
                            }))
                          }
                          onCnpjFound={handleCnpjFound}
                        />
                      )}

                      {formState.tipoPessoa === TipoPessoa.FISICA ? (
                        <DateInput
                          label="Data de Nascimento"
                          value={formatDateToInput(formState.dataNascimento)}
                          onValueChange={(value) =>
                            setFormState((prev) => ({
                              ...prev,
                              dataNascimento: parseDateFromInput(value),
                            }))
                          }
                        />
                      ) : (
                        <Input
                          label="Inscricao Estadual"
                          placeholder="Informe a inscricao estadual"
                          value={formState.inscricaoEstadual}
                          onValueChange={(value) =>
                            setFormState((prev) => ({
                              ...prev,
                              inscricaoEstadual: value,
                            }))
                          }
                        />
                      )}
                    </div>
                  </ModalSectionCard>

                  <ModalSectionCard
                    description="Cadastro do endereco principal para comunicacao e cobrancas."
                    title="Endereco Principal"
                  >
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <Input
                          endContent={
                            isSearchingCep ? <Spinner size="sm" /> : null
                          }
                          label="CEP"
                          placeholder="00000-000"
                          value={formState.enderecoPrincipal?.cep || ""}
                          onBlur={handleEnderecoCepBlur}
                          onValueChange={(value) =>
                            handleEnderecoPrincipalChange("cep", value)
                          }
                        />
                        <Input
                          label="Logradouro"
                          placeholder="Rua, avenida, etc."
                          value={formState.enderecoPrincipal?.logradouro || ""}
                          onValueChange={(value) =>
                            handleEnderecoPrincipalChange("logradouro", value)
                          }
                        />
                        <Input
                          label="Numero"
                          placeholder="123"
                          value={formState.enderecoPrincipal?.numero || ""}
                          onValueChange={(value) =>
                            handleEnderecoPrincipalChange("numero", value)
                          }
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <Input
                          label="Complemento"
                          placeholder="Apto, sala, bloco..."
                          value={formState.enderecoPrincipal?.complemento || ""}
                          onValueChange={(value) =>
                            handleEnderecoPrincipalChange("complemento", value)
                          }
                        />
                        <Input
                          label="Bairro"
                          placeholder="Bairro"
                          value={formState.enderecoPrincipal?.bairro || ""}
                          onValueChange={(value) =>
                            handleEnderecoPrincipalChange("bairro", value)
                          }
                        />
                        <Input
                          label="Cidade"
                          placeholder="Cidade"
                          value={formState.enderecoPrincipal?.cidade || ""}
                          onValueChange={(value) =>
                            handleEnderecoPrincipalChange("cidade", value)
                          }
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Input
                          label="UF"
                          maxLength={2}
                          placeholder="SP"
                          value={formState.enderecoPrincipal?.estado || ""}
                          onValueChange={(value) =>
                            handleEnderecoPrincipalChange(
                              "estado",
                              value.toUpperCase(),
                            )
                          }
                        />
                        <Input
                          label="Pais"
                          placeholder="Brasil"
                          value={formState.enderecoPrincipal?.pais || "Brasil"}
                          onValueChange={(value) =>
                            handleEnderecoPrincipalChange("pais", value)
                          }
                        />
                      </div>
                    </div>
                  </ModalSectionCard>

                  {formState.tipoPessoa === TipoPessoa.FISICA ? (
                    <ModalSectionCard
                      description="Dados de filiacao importantes para qualificacao completa do cliente."
                      title="Genitores"
                    >
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Input
                          label="Nome do Pai"
                          placeholder="Informe o nome do pai"
                          startContent={
                            <User className="h-4 w-4 text-default-400" />
                          }
                          value={formState.nomePai}
                          onValueChange={(value) =>
                            setFormState((prev) => ({ ...prev, nomePai: value }))
                          }
                        />
                        <Input
                          label="Documento do Pai"
                          placeholder="CPF ou outro documento"
                          startContent={
                            <FileText className="h-4 w-4 text-default-400" />
                          }
                          value={formState.documentoPai}
                          onValueChange={(value) =>
                            setFormState((prev) => ({
                              ...prev,
                              documentoPai: value,
                            }))
                          }
                        />
                        <Input
                          label="Nome da Mae"
                          placeholder="Informe o nome da mae"
                          startContent={
                            <User className="h-4 w-4 text-default-400" />
                          }
                          value={formState.nomeMae}
                          onValueChange={(value) =>
                            setFormState((prev) => ({ ...prev, nomeMae: value }))
                          }
                        />
                        <Input
                          label="Documento da Mae"
                          placeholder="CPF ou outro documento"
                          startContent={
                            <FileText className="h-4 w-4 text-default-400" />
                          }
                          value={formState.documentoMae}
                          onValueChange={(value) =>
                            setFormState((prev) => ({
                              ...prev,
                              documentoMae: value,
                            }))
                          }
                        />
                      </div>
                    </ModalSectionCard>
                  ) : null}

                  {canManageAllClients ? (
                    <ModalSectionCard
                      description="Defina quais advogados terao gestao direta deste cliente."
                      title="Vinculo de Advogados"
                    >
                      <Select
                        className="w-full"
                        isLoading={isLoadingAdvogados}
                        label="Advogados vinculados"
                        placeholder="Selecione um ou mais advogados"
                        popoverProps={{
                          classNames: {
                            base: "z-[10000]",
                            content: "z-[10000]",
                          },
                        }}
                        selectedKeys={selectedAdvogadosKeys}
                        selectionMode="multiple"
                        onSelectionChange={handleAdvogadosSelectionChange}
                      >
                        {(advogados || []).map((advogado) => (
                          <SelectItem
                            key={advogado.id}
                            textValue={`${advogado.label} ${advogado.oab || ""}`.trim()}
                          >
                            {advogado.label}
                            {advogado.oab ? ` (${advogado.oab})` : ""}
                          </SelectItem>
                        ))}
                      </Select>
                    </ModalSectionCard>
                  ) : null}
                </div>
              </Tab>
              <Tab
                key="contato"
                title={
                  <div className="flex items-center gap-2">
                    <div className="rounded-md bg-green-100 p-1 dark:bg-green-900">
                      <Phone className="h-4 w-4 text-green-600 dark:text-green-300" />
                    </div>
                    <span>Contato</span>
                  </div>
                }
              >
                <div className="space-y-6">
                  <ModalSectionCard
                    description="Informe ao menos um telefone. O email so e obrigatorio se criar acesso."
                    title="Informacoes de Contato"
                  >
                    <div className="space-y-4">
                      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                        <Checkbox
                          isSelected={criarUsuario}
                          onValueChange={setCriarUsuario}
                        >
                          <div>
                            <p className="text-sm font-semibold">
                              Criar acesso do cliente ao sistema
                            </p>
                            <p className="mt-1 text-xs text-default-500">
                              {criarUsuario
                                ? "O cliente recebera link de primeiro acesso por email."
                                : "O cadastro ficara sem login por enquanto."}
                            </p>
                          </div>
                        </Checkbox>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <Input
                          description={
                            criarUsuario
                              ? "Obrigatorio para criar usuario"
                              : undefined
                          }
                          isRequired={criarUsuario}
                          label="Email"
                          placeholder="email@exemplo.com"
                          startContent={
                            <Mail className="h-4 w-4 text-default-400" />
                          }
                          type="email"
                          value={formState.email}
                          onValueChange={(value) =>
                            setFormState((prev) => ({ ...prev, email: value }))
                          }
                        />
                        <Input
                          label="Telefone"
                          placeholder="(00) 0000-0000"
                          startContent={
                            <Phone className="h-4 w-4 text-default-400" />
                          }
                          value={formState.telefone}
                          onValueChange={(value) =>
                            setFormState((prev) => ({ ...prev, telefone: value }))
                          }
                        />
                      </div>

                      <Input
                        label="Celular/WhatsApp"
                        placeholder="(00) 00000-0000"
                        startContent={
                          <Phone className="h-4 w-4 text-default-400" />
                        }
                        value={formState.celular}
                        onValueChange={(value) =>
                          setFormState((prev) => ({ ...prev, celular: value }))
                        }
                      />
                    </div>
                  </ModalSectionCard>

                  {formState.tipoPessoa === TipoPessoa.JURIDICA ? (
                    <ModalSectionCard
                      description="Dados do responsavel legal"
                      title="Responsavel pela Empresa"
                    >
                      <div className="space-y-4">
                        <Input
                          label="Nome do Responsavel"
                          placeholder="Nome completo"
                          startContent={
                            <User className="h-4 w-4 text-default-400" />
                          }
                          value={formState.responsavelNome}
                          onValueChange={(value) =>
                            setFormState((prev) => ({
                              ...prev,
                              responsavelNome: value,
                            }))
                          }
                        />
                        <div className="grid grid-cols-2 gap-4">
                          <Input
                            label="Email do Responsavel"
                            placeholder="email@exemplo.com"
                            startContent={
                              <Mail className="h-4 w-4 text-default-400" />
                            }
                            type="email"
                            value={formState.responsavelEmail}
                            onValueChange={(value) =>
                              setFormState((prev) => ({
                                ...prev,
                                responsavelEmail: value,
                              }))
                            }
                          />
                          <Input
                            label="Telefone do Responsavel"
                            placeholder="(00) 00000-0000"
                            startContent={
                              <Phone className="h-4 w-4 text-default-400" />
                            }
                            value={formState.responsavelTelefone}
                            onValueChange={(value) =>
                              setFormState((prev) => ({
                                ...prev,
                                responsavelTelefone: value,
                              }))
                            }
                          />
                        </div>
                      </div>
                    </ModalSectionCard>
                  ) : null}
                </div>
              </Tab>

              <Tab
                key="observacoes"
                title={
                  <div className="flex items-center gap-2">
                    <div className="rounded-md bg-amber-100 p-1 dark:bg-amber-900">
                      <FileText className="h-4 w-4 text-amber-600 dark:text-amber-300" />
                    </div>
                    <span>Observacoes</span>
                  </div>
                }
              >
                <div className="space-y-6">
                  <ModalSectionCard
                    description="Anotacoes e observacoes sobre o cliente"
                    title="Informacoes Adicionais"
                  >
                    <Textarea
                      label="Observacoes"
                      minRows={4}
                      placeholder="Informacoes adicionais sobre o cliente..."
                      value={formState.observacoes}
                      onValueChange={(value) =>
                        setFormState((prev) => ({
                          ...prev,
                          observacoes: value,
                        }))
                      }
                    />
                  </ModalSectionCard>
                </div>
              </Tab>
            </Tabs>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => handleModalOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              color="primary"
              isLoading={isSaving}
              onPress={handleCreateCliente}
            >
              Criar Cliente
            </Button>
          </ModalFooter>
        </ModalContent>
      </HeroUIModal>

      <Modal
        footer={
          <div className="flex justify-end">
            <Button
              color="primary"
              startContent={<CheckCircle className="h-4 w-4" />}
              onPress={() => setCredenciaisModal(null)}
            >
              Entendi
            </Button>
          </div>
        }
        isOpen={!!credenciaisModal}
        size="lg"
        title={credenciaisModal ? "Primeiro acesso do cliente" : ""}
        onOpenChange={() => setCredenciaisModal(null)}
      >
        {credenciaisModal ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-success/20 bg-success/10 p-4">
              <div className="flex items-start gap-3">
                <KeyIcon className="mt-0.5 h-5 w-5 text-success" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-success">
                    Usuario de acesso criado
                  </p>
                  <p className="mt-1 text-xs text-default-600">
                    O cliente deve definir a propria senha pelo link de primeiro
                    acesso enviado por e-mail.
                  </p>
                </div>
              </div>
            </div>

            <Card className="border border-default-200">
              <CardBody className="gap-3">
                <div>
                  <p className="mb-1 text-xs text-default-400">Email</p>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      classNames={{
                        input: "font-mono",
                      }}
                      value={credenciaisModal.email}
                    />
                    <Button
                      isIconOnly
                      size="sm"
                      variant="flat"
                      onPress={() => {
                        navigator.clipboard.writeText(credenciaisModal.email);
                        toast.success("Email copiado!");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <p className="mb-1 text-xs text-default-400">
                    Email mascarado
                  </p>
                  <Input readOnly value={credenciaisModal.maskedEmail} />
                </div>
              </CardBody>
            </Card>

            {credenciaisModal.primeiroAcessoEnviado ? (
              <div className="rounded-lg border border-primary/20 bg-primary/10 p-3">
                <p className="text-xs text-primary-700 dark:text-primary-300">
                  Link de primeiro acesso enviado para{" "}
                  {credenciaisModal.maskedEmail}.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-warning/20 bg-warning/10 p-3">
                <p className="text-xs text-warning-700 dark:text-warning-300">
                  Cliente criado, mas o e-mail de primeiro acesso nao foi enviado
                  automaticamente.
                  {credenciaisModal.erroEnvio
                    ? ` Motivo: ${credenciaisModal.erroEnvio}`
                    : ""}
                </p>
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
