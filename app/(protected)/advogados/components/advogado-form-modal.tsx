"use client";
import type { CreateAdvogadoInput } from "@/app/actions/advogados";
import type { CepData } from "@/types/brazil";

import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Tabs, Tab, Button, Input, Textarea, Checkbox, Switch, Card, CardHeader, CardBody, Chip, Popover, PopoverTrigger, PopoverContent, Tooltip, Select, SelectItem } from "@heroui/react";
import { motion } from "framer-motion";
import {
  ScaleIcon,
  UserIcon,
  MailIcon,
  PhoneIcon,
  Smartphone,
  Percent,
  Globe,
  Linkedin,
  Twitter,
  Instagram,
  MapPinIcon,
  HomeIcon,
  ShieldIcon,
  PlusIcon,
  TrashIcon,
  CreditCardIcon,
  WalletIcon,
  BuildingIcon,
  Info,
  Key,
  CalendarIcon,
  StickyNote,
  IdCard,
  Hash,
  Layers,
} from "lucide-react";

import { type EnderecoFormData, type DadosBancariosFormData } from "./types";

import { CepInput } from "@/components/cep-input";
import { CpfInput } from "@/components/cpf-input";
import { CnpjInput } from "@/components/cnpj-input";
import { EspecialidadeJuridica } from "@/generated/prisma";
import { CidadeSelect } from "@/components/cidade-select";
import { EstadoSelect } from "@/components/estado-select";
import { DateInput } from "@/components/ui/date-input";

interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: string;
}

interface EspecialidadeOption {
  key: string;
  label: string;
}

interface BancoOption {
  codigo: string;
  nome: string;
}

interface AdvogadoFormModalProps {
  mode: "create" | "edit";
  isOpen: boolean;
  isSaving: boolean;
  title: string;
  description?: string;
  primaryActionLabel: string;
  formState: CreateAdvogadoInput;
  setFormState: React.Dispatch<React.SetStateAction<CreateAdvogadoInput>>;
  enderecos: EnderecoFormData[];
  setEnderecos: React.Dispatch<React.SetStateAction<EnderecoFormData[]>>;
  contasBancarias: DadosBancariosFormData[];
  setContasBancarias: React.Dispatch<
    React.SetStateAction<DadosBancariosFormData[]>
  >;
  bancos: BancoOption[];
  tiposConta: SelectOption[];
  tiposContaBancaria: SelectOption[];
  tiposChavePix: SelectOption[];
  especialidades: EspecialidadeOption[];
  onCepLookup?: (cepData: CepData, index: number) => void;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: () => void;
}

const enderecoTipoOptions: SelectOption[] = [
  { value: "ESCRITORIO", label: "Escritório" },
  { value: "RESIDENCIAL", label: "Residencial" },
  { value: "CORRESPONDENCIA", label: "Correspondência" },
  { value: "OUTRO", label: "Outro" },
];

const primeiraLetraMaiuscula = (value?: string) => {
  if (!value) return "";

  return value.charAt(0).toUpperCase() + value.slice(1);
};

export function AdvogadoFormModal({
  mode,
  isOpen,
  isSaving,
  title,
  description,
  primaryActionLabel,
  formState,
  setFormState,
  enderecos,
  setEnderecos,
  contasBancarias,
  setContasBancarias,
  bancos,
  tiposConta,
  tiposContaBancaria,
  tiposChavePix,
  especialidades,
  onCepLookup,
  onOpenChange,
  onSubmit,
}: AdvogadoFormModalProps) {
  const updateEndereco = (
    index: number,
    field: keyof EnderecoFormData,
    value: string | boolean,
  ) => {
    setEnderecos((prev) => {
      const clone = [...prev];

      clone[index] = {
        ...clone[index],
        [field]: value,
      };

      if (field === "principal" && value === true) {
        return clone.map((item, idx) => ({
          ...item,
          principal: idx === index,
        }));
      }

      return clone;
    });
  };

  const handleCepFound = (cepData: CepData, index: number) => {
    setEnderecos((prev) => {
      const clone = [...prev];
      const endereco = clone[index];

      clone[index] = {
        ...endereco,
        logradouro: cepData.logradouro || endereco.logradouro || "",
        bairro: cepData.bairro || endereco.bairro || "",
        cidade: cepData.localidade || endereco.cidade || "",
        estado: cepData.uf || endereco.estado || "",
        cep: cepData.cep || endereco.cep || "",
      };

      return clone;
    });
    onCepLookup?.(cepData, index);
  };

  const addEndereco = () => {
    setEnderecos((prev) => [
      ...prev,
      {
        apelido: `Endereço ${prev.length + 1}`,
        tipo: "ESCRITORIO",
        principal: prev.length === 0,
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
      },
    ]);
  };

  const removeEndereco = (index: number) => {
    setEnderecos((prev) => {
      if (prev.length <= 1) return prev;

      const clone = prev.filter((_, idx) => idx !== index);

      if (!clone.some((item) => item.principal) && clone.length > 0) {
        clone[0].principal = true;
      }

      return clone;
    });
  };

  const updateConta = (
    index: number,
    field: keyof DadosBancariosFormData,
    value: string | boolean,
  ) => {
    setContasBancarias((prev) => {
      const clone = [...prev];

      clone[index] = {
        ...clone[index],
        [field]: value,
      };

      if (field === "principal" && value === true) {
        return clone.map((item, idx) => ({
          ...item,
          principal: idx === index,
        }));
      }

      return clone;
    });
  };

  const addConta = () => {
    setContasBancarias((prev) => [
      ...prev,
      {
        tipoConta: "PESSOA_FISICA",
        bancoCodigo: "",
        agencia: "",
        conta: "",
        digitoConta: "",
        tipoContaBancaria: "CORRENTE",
        chavePix: "",
        tipoChavePix: "CPF",
        titularNome:
          `${formState.firstName || ""} ${formState.lastName || ""}`.trim(),
        titularDocumento: formState.cpf || "",
        titularEmail: formState.email || "",
        titularTelefone: formState.phone || "",
        endereco: "",
        cidade: "",
        estado: "",
        cep: "",
        principal: prev.length === 0,
        observacoes: "",
      },
    ]);
  };

  const removeConta = (index: number) => {
    setContasBancarias((prev) => {
      if (prev.length <= 1) return prev;

      const clone = prev.filter((_, idx) => idx !== index);

      if (!clone.some((item) => item.principal) && clone.length > 0) {
        clone[0].principal = true;
      }

      return clone;
    });
  };

  const tabsClassNames = {
    tabList:
      "gap-6 w-full relative rounded-none px-6 pt-6 pb-0 border-b border-divider",
    cursor: "w-full bg-primary",
    tab: "max-w-fit px-0 h-12",
    tabContent:
      "group-data-[selected=true]:text-primary font-medium text-sm tracking-wide",
    panel: "px-6 pb-6 pt-4",
  };

  const cardMotionProps = {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, ease: "easeOut" },
  };

  return (
    <Modal
      isOpen={isOpen}
      scrollBehavior="inside"
      size="5xl"
      onOpenChange={onOpenChange}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <ScaleIcon className="text-primary" size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-default-900">{title}</h3>
              <p className="text-sm text-default-500">
                {description ||
                  (mode === "create"
                    ? "Complete as informações para cadastrar um advogado"
                    : "Atualize os dados do advogado")}
              </p>
            </div>
          </div>
        </ModalHeader>

        <ModalBody className="px-0">
          <Tabs
            aria-label="Formulário do advogado"
            classNames={tabsClassNames}
            color="primary"
            variant="underlined"
          >
            <Tab
              key="dados-pessoais"
              title={
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-md bg-blue-100 dark:bg-blue-900">
                    <UserIcon
                      className="text-blue-600 dark:text-blue-300"
                      size={16}
                    />
                  </div>
                  <span>Dados Pessoais</span>
                </div>
              }
            >
              <div className="space-y-6">
                <motion.div
                  {...cardMotionProps}
                  whileHover={{ translateY: -4 }}
                >
                  <Card className="border border-white/10 bg-background/50">
                    <CardHeader className="flex flex-col items-start gap-1">
                      <Chip
                        color="primary"
                        startContent={<UserIcon size={14} />}
                        variant="flat"
                      >
                        Identificação
                      </Chip>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        Informações básicas do advogado
                      </p>
                    </CardHeader>
                    <CardBody className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                          isRequired
                          label="Nome"
                          placeholder="Nome completo"
                          startContent={
                            <UserIcon className="w-4 h-4 text-default-400" />
                          }
                          value={formState.firstName}
                          onValueChange={(value) =>
                            setFormState((prev) => ({
                              ...prev,
                              firstName: value,
                            }))
                          }
                        />
                        <Input
                          isRequired
                          label="Sobrenome"
                          placeholder="Sobrenome"
                          startContent={
                            <UserIcon className="w-4 h-4 text-default-400" />
                          }
                          value={formState.lastName}
                          onValueChange={(value) =>
                            setFormState((prev) => ({
                              ...prev,
                              lastName: value,
                            }))
                          }
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                          isRequired
                          label="Email"
                          placeholder="email@exemplo.com"
                          startContent={
                            <MailIcon className="w-4 h-4 text-default-400" />
                          }
                          type="email"
                          value={formState.email}
                          onValueChange={(value) =>
                            setFormState((prev) => ({ ...prev, email: value }))
                          }
                        />
                        <Input
                          label="Telefone"
                          placeholder="(11) 99999-9999"
                          startContent={
                            <PhoneIcon className="w-4 h-4 text-default-400" />
                          }
                          value={formState.phone || ""}
                          onValueChange={(value) =>
                            setFormState((prev) => ({ ...prev, phone: value }))
                          }
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <CpfInput
                          label="CPF"
                          placeholder="000.000.000-00"
                          value={formState.cpf || ""}
                          onChange={(value) =>
                            setFormState((prev) => ({ ...prev, cpf: value }))
                          }
                        />
                        <Input
                          label="RG"
                          placeholder="RG"
                          startContent={
                            <IdCard className="w-4 h-4 text-default-400" />
                          }
                          value={formState.rg || ""}
                          onValueChange={(value) =>
                            setFormState((prev) => ({ ...prev, rg: value }))
                          }
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <DateInput
                          label="Data de Nascimento"
                          startContent={
                            <CalendarIcon className="w-4 h-4 text-default-400" />
                          }
                          value={formState.dataNascimento || ""}
                          onValueChange={(value) =>
                            setFormState((prev) => ({
                              ...prev,
                              dataNascimento: value,
                            }))
                          }
                        />
                        <Input
                          label="Observações"
                          placeholder="Notas internas"
                          startContent={
                            <StickyNote className="w-4 h-4 text-default-400" />
                          }
                          value={formState.observacoes || ""}
                          onValueChange={(value) =>
                            setFormState((prev) => ({
                              ...prev,
                              observacoes: value,
                            }))
                          }
                        />
                      </div>
                    </CardBody>
                  </Card>
                </motion.div>
              </div>
            </Tab>

            <Tab
              key="perfil-profissional"
              title={
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-md bg-purple-100 dark:bg-purple-900">
                    <ScaleIcon
                      className="text-purple-600 dark:text-purple-300"
                      size={16}
                    />
                  </div>
                  <span>Perfil Profissional</span>
                </div>
              }
            >
              <div className="space-y-6">
                <motion.div
                  {...cardMotionProps}
                  whileHover={{ translateY: -6 }}
                >
                  <Card className="border border-white/10 bg-background/50">
                    <CardHeader className="flex flex-col items-start gap-1">
                      <Chip
                        color="secondary"
                        startContent={<ScaleIcon size={14} />}
                        variant="flat"
                      >
                        OAB & Contato
                      </Chip>
                      <p className="text-sm text-purple-700 dark:text-purple-300">
                        Registros profissionais e canais de contato
                      </p>
                    </CardHeader>
                    <CardBody className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Input
                          label="Número da OAB"
                          placeholder="123456"
                          startContent={
                            <ScaleIcon className="w-4 h-4 text-default-400" />
                          }
                          value={formState.oabNumero || ""}
                          onValueChange={(value) =>
                            setFormState((prev) => ({
                              ...prev,
                              oabNumero: value,
                            }))
                          }
                        />
                        <EstadoSelect
                          className="w-full"
                          label="UF da OAB"
                          placeholder="Selecione"
                          selectedKeys={
                            formState.oabUf ? [formState.oabUf] : []
                          }
                          onSelectionChange={(keys) => {
                            const value = Array.from(keys)[0] as
                              | string
                              | undefined;

                            setFormState((prev) => ({
                              ...prev,
                              oabUf: value || "",
                            }));
                          }}
                        />
                        <Input
                          label="WhatsApp"
                          placeholder="(11) 99999-9999"
                          startContent={
                            <Smartphone className="w-4 h-4 text-default-400" />
                          }
                          value={formState.whatsapp || ""}
                          onValueChange={(value) =>
                            setFormState((prev) => ({
                              ...prev,
                              whatsapp: value,
                            }))
                          }
                        />
                      </div>

                      <Textarea
                        label="Biografia"
                        placeholder="Conte um pouco sobre a história e áreas de atuação do advogado"
                        value={formState.bio || ""}
                        onValueChange={(value) =>
                          setFormState((prev) => ({ ...prev, bio: value }))
                        }
                      />

                      <Select
                        label="Especialidades"
                        placeholder="Selecione as especialidades"
                        selectedKeys={new Set(formState.especialidades || [])}
                        selectionMode="multiple"
                        onSelectionChange={(keys) => {
                          const values = Array.from(keys).map(
                            (value) => value as EspecialidadeJuridica,
                          );

                          setFormState((prev) => ({
                            ...prev,
                            especialidades: values,
                          }));
                        }}
                      >
                        {especialidades
                          .filter((opt) => opt.key !== "all")
                          .map((option) => (
                            <SelectItem
                              key={option.key}
                              textValue={option.label}
                            >
                              {option.label}
                            </SelectItem>
                          ))}
                      </Select>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Input
                          label="Comissão Padrão (%)"
                          placeholder="0"
                          startContent={
                            <Percent className="w-4 h-4 text-default-400" />
                          }
                          type="number"
                          value={(formState.comissaoPadrao ?? 0).toString()}
                          onValueChange={(value) =>
                            setFormState((prev) => ({
                              ...prev,
                              comissaoPadrao: parseFloat(value) || 0,
                            }))
                          }
                        />
                        <Input
                          label="Comissão Ação Ganha (%)"
                          placeholder="0"
                          startContent={
                            <Percent className="w-4 h-4 text-default-400" />
                          }
                          type="number"
                          value={(formState.comissaoAcaoGanha ?? 0).toString()}
                          onValueChange={(value) =>
                            setFormState((prev) => ({
                              ...prev,
                              comissaoAcaoGanha: parseFloat(value) || 0,
                            }))
                          }
                        />
                        <Input
                          label="Comissão Honorários (%)"
                          placeholder="0"
                          startContent={
                            <Percent className="w-4 h-4 text-default-400" />
                          }
                          type="number"
                          value={(formState.comissaoHonorarios ?? 0).toString()}
                          onValueChange={(value) =>
                            setFormState((prev) => ({
                              ...prev,
                              comissaoHonorarios: parseFloat(value) || 0,
                            }))
                          }
                        />
                      </div>
                    </CardBody>
                  </Card>
                </motion.div>

                <motion.div
                  {...cardMotionProps}
                  whileHover={{ translateY: -6 }}
                >
                  <Card className="border border-purple-200 dark:border-purple-700 bg-white/70 dark:bg-default-50/10">
                    <CardHeader>
                      <p className="text-sm font-semibold text-default-600">
                        Trajetória e presença digital
                      </p>
                    </CardHeader>
                    <CardBody className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Textarea
                          label="Formação Acadêmica"
                          placeholder="Graduação, pós-graduação, especializações..."
                          value={formState.formacao || ""}
                          onValueChange={(value) =>
                            setFormState((prev) => ({
                              ...prev,
                              formacao: value,
                            }))
                          }
                        />
                        <Textarea
                          label="Experiência Profissional"
                          placeholder="Experiências, áreas de atuação..."
                          value={formState.experiencia || ""}
                          onValueChange={(value) =>
                            setFormState((prev) => ({
                              ...prev,
                              experiencia: value,
                            }))
                          }
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Textarea
                          label="Prêmios e Reconhecimentos"
                          placeholder="Destaques da carreira..."
                          value={formState.premios || ""}
                          onValueChange={(value) =>
                            setFormState((prev) => ({
                              ...prev,
                              premios: value,
                            }))
                          }
                        />
                        <Textarea
                          label="Publicações e Artigos"
                          placeholder="Artigos, livros, publicações..."
                          value={formState.publicacoes || ""}
                          onValueChange={(value) =>
                            setFormState((prev) => ({
                              ...prev,
                              publicacoes: value,
                            }))
                          }
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                          label="Website"
                          placeholder="https://www.exemplo.com"
                          startContent={
                            <Globe className="w-4 h-4 text-default-400" />
                          }
                          value={formState.website || ""}
                          onValueChange={(value) =>
                            setFormState((prev) => ({
                              ...prev,
                              website: value,
                            }))
                          }
                        />
                        <Input
                          label="LinkedIn"
                          placeholder="https://linkedin.com/in/usuario"
                          startContent={
                            <Linkedin className="w-4 h-4 text-default-400" />
                          }
                          value={formState.linkedin || ""}
                          onValueChange={(value) =>
                            setFormState((prev) => ({
                              ...prev,
                              linkedin: value,
                            }))
                          }
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                          label="Twitter / X"
                          placeholder="https://twitter.com/usuario"
                          startContent={
                            <Twitter className="w-4 h-4 text-default-400" />
                          }
                          value={formState.twitter || ""}
                          onValueChange={(value) =>
                            setFormState((prev) => ({
                              ...prev,
                              twitter: value,
                            }))
                          }
                        />
                        <Input
                          label="Instagram"
                          placeholder="https://instagram.com/usuario"
                          startContent={
                            <Instagram className="w-4 h-4 text-default-400" />
                          }
                          value={formState.instagram || ""}
                          onValueChange={(value) =>
                            setFormState((prev) => ({
                              ...prev,
                              instagram: value,
                            }))
                          }
                        />
                      </div>
                    </CardBody>
                  </Card>
                </motion.div>
              </div>
            </Tab>

            <Tab
              key="enderecos"
              title={
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-md bg-green-100 dark:bg-green-900">
                    <HomeIcon
                      className="text-green-600 dark:text-green-300"
                      size={16}
                    />
                  </div>
                  <span>Endereços</span>
                </div>
              }
            >
              <div className="space-y-6">
                {enderecos.map((endereco, index) => (
                  <motion.div
                    key={`endereco-${index}`}
                    {...cardMotionProps}
                    whileHover={{ translateY: -6 }}
                  >
                    <Card
                      className={`border ${endereco.principal ? "border-primary/50 shadow-lg" : "border-white/10"} bg-background/50`}
                    >
                      <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/40">
                            <MapPinIcon
                              className="text-green-600 dark:text-green-300"
                              size={18}
                            />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-green-800 dark:text-green-200">
                              {endereco.apelido || `Endereço ${index + 1}`}
                            </p>
                            <p className="text-xs text-green-700/80 dark:text-green-300/80">
                              {primeiraLetraMaiuscula(endereco.tipo)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            color="success"
                            isSelected={endereco.principal}
                            size="sm"
                            onValueChange={(value) =>
                              updateEndereco(index, "principal", value)
                            }
                          >
                            Principal
                          </Switch>
                          {enderecos.length > 1 && (
                            <Button
                              isIconOnly
                              color="danger"
                              size="sm"
                              variant="light"
                              onPress={() => removeEndereco(index)}
                            >
                              <TrashIcon className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </CardHeader>
                      <CardBody className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <Input
                            label="Apelido"
                            placeholder="Principal, Escritório..."
                            startContent={
                              <HomeIcon className="w-4 h-4 text-default-400" />
                            }
                            value={endereco.apelido}
                            onValueChange={(value) =>
                              updateEndereco(index, "apelido", value)
                            }
                          />
                          <Select
                            label="Tipo"
                            placeholder="Selecione o tipo"
                            selectedKeys={endereco.tipo ? [endereco.tipo] : []}
                            onSelectionChange={(keys) => {
                              const value = Array.from(keys)[0] as
                                | string
                                | undefined;

                              updateEndereco(
                                index,
                                "tipo",
                                value || "ESCRITORIO",
                              );
                            }}
                          >
                            {enderecoTipoOptions.map((option) => (
                              <SelectItem
                                key={option.value}
                                textValue={option.label}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </Select>
                          <Input
                            label="Telefone"
                            placeholder="(11) 3333-4444"
                            startContent={
                              <PhoneIcon className="w-4 h-4 text-default-400" />
                            }
                            value={endereco.telefone || ""}
                            onValueChange={(value) =>
                              updateEndereco(index, "telefone", value)
                            }
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <CepInput
                            label="CEP"
                            placeholder="00000-000"
                            value={endereco.cep || ""}
                            onCepFound={(cepData) =>
                              handleCepFound(cepData, index)
                            }
                            onChange={(value) =>
                              updateEndereco(index, "cep", value)
                            }
                          />
                          <Input
                            label="Logradouro"
                            placeholder="Rua, Avenida..."
                            startContent={
                              <MapPinIcon className="w-4 h-4 text-default-400" />
                            }
                            value={endereco.logradouro}
                            onValueChange={(value) =>
                              updateEndereco(index, "logradouro", value)
                            }
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <Input
                            label="Número"
                            placeholder="123"
                            startContent={
                              <Hash className="w-4 h-4 text-default-400" />
                            }
                            value={endereco.numero || ""}
                            onValueChange={(value) =>
                              updateEndereco(index, "numero", value)
                            }
                          />
                          <Input
                            label="Complemento"
                            placeholder="Apto, Sala..."
                            startContent={
                              <Layers className="w-4 h-4 text-default-400" />
                            }
                            value={endereco.complemento || ""}
                            onValueChange={(value) =>
                              updateEndereco(index, "complemento", value)
                            }
                          />
                          <Input
                            label="Bairro"
                            placeholder="Nome do bairro"
                            startContent={
                              <MapPinIcon className="w-4 h-4 text-default-400" />
                            }
                            value={endereco.bairro || ""}
                            onValueChange={(value) =>
                              updateEndereco(index, "bairro", value)
                            }
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <EstadoSelect
                            className="w-full"
                            selectedKeys={
                              endereco.estado ? [endereco.estado] : []
                            }
                            onSelectionChange={(keys) => {
                              const value = Array.from(keys)[0] as
                                | string
                                | undefined;

                              setEnderecos((prev) => {
                                const clone = [...prev];
                                const previous = clone[index];
                                const nextEstado = value || "";

                                clone[index] = {
                                  ...previous,
                                  estado: nextEstado,
                                  cidade:
                                    previous.estado === nextEstado
                                      ? previous.cidade
                                      : "",
                                };

                                return clone;
                              });
                            }}
                          />
                          <CidadeSelect
                            className="w-full"
                            estadoSelecionado={endereco.estado || null}
                            selectedKeys={
                              endereco.cidade ? [endereco.cidade] : []
                            }
                            onSelectionChange={(keys) => {
                              const value = Array.from(keys)[0] as
                                | string
                                | undefined;

                              updateEndereco(index, "cidade", value || "");
                            }}
                          />
                          <Input
                            label="País"
                            placeholder="Brasil"
                            startContent={
                              <Globe className="w-4 h-4 text-default-400" />
                            }
                            value={endereco.pais || "Brasil"}
                            onValueChange={(value) =>
                              updateEndereco(index, "pais", value)
                            }
                          />
                          <Input
                            label="Observações"
                            placeholder="Referências, horários..."
                            startContent={
                              <StickyNote className="w-4 h-4 text-default-400" />
                            }
                            value={endereco.observacoes || ""}
                            onValueChange={(value) =>
                              updateEndereco(index, "observacoes", value)
                            }
                          />
                        </div>
                      </CardBody>
                    </Card>
                  </motion.div>
                ))}
                <Button
                  color="success"
                  startContent={<PlusIcon className="w-4 h-4" />}
                  variant="flat"
                  onPress={addEndereco}
                >
                  Adicionar outro endereço
                </Button>
              </div>
            </Tab>

            <Tab
              key="dados-bancarios"
              title={
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-md bg-teal-100 dark:bg-teal-900">
                    <CreditCardIcon
                      className="text-teal-600 dark:text-teal-300"
                      size={16}
                    />
                  </div>
                  <span>Dados Bancários</span>
                </div>
              }
            >
              <div className="space-y-6">
                {contasBancarias.map((conta, index) => (
                  <motion.div
                    key={`conta-${index}`}
                    {...cardMotionProps}
                    whileHover={{ translateY: -6 }}
                  >
                    <Card
                      className={`border ${conta.principal ? "border-primary/50 shadow-lg" : "border-white/10"} bg-background/50`}
                    >
                      <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-teal-100 dark:bg-teal-900/40">
                            <WalletIcon
                              className="text-teal-600 dark:text-teal-300"
                              size={18}
                            />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-teal-800 dark:text-teal-200">
                              {conta.bancoCodigo
                                ? bancos.find(
                                    (banco) =>
                                      banco.codigo === conta.bancoCodigo,
                                  )?.nome || conta.bancoCodigo
                                : `Conta ${index + 1}`}
                            </p>
                            <p className="text-xs text-teal-700/80 dark:text-teal-300/80">
                              {conta.tipoConta === "PESSOA_JURIDICA"
                                ? "Pessoa Jurídica"
                                : "Pessoa Física"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            color="success"
                            isSelected={conta.principal}
                            size="sm"
                            onValueChange={(value) =>
                              updateConta(index, "principal", value)
                            }
                          >
                            Principal
                          </Switch>
                          {contasBancarias.length > 1 && (
                            <Button
                              isIconOnly
                              color="danger"
                              size="sm"
                              variant="light"
                              onPress={() => removeConta(index)}
                            >
                              <TrashIcon className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </CardHeader>
                      <CardBody className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Select
                            label="Tipo de Conta"
                            placeholder="Selecione"
                            selectedKeys={[conta.tipoConta]}
                            onSelectionChange={(keys) => {
                              const value = Array.from(keys)[0] as string;

                              setContasBancarias((prev) => {
                                const clone = [...prev];

                                clone[index] = {
                                  ...clone[index],
                                  tipoConta:
                                    value as DadosBancariosFormData["tipoConta"],
                                  titularDocumento: "",
                                };

                                return clone;
                              });
                            }}
                          >
                            {tiposConta.map((option) => (
                              <SelectItem
                                key={option.value}
                                textValue={option.label}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </Select>
                          <Select
                            label="Banco"
                            placeholder="Selecione"
                            selectedKeys={
                              conta.bancoCodigo ? [conta.bancoCodigo] : []
                            }
                            onSelectionChange={(keys) => {
                              const value = Array.from(keys)[0] as
                                | string
                                | undefined;

                              updateConta(index, "bancoCodigo", value || "");
                            }}
                          >
                            {bancos.map((banco) => (
                              <SelectItem
                                key={banco.codigo}
                                textValue={banco.nome}
                              >
                                <div className="flex flex-col">
                                  <span className="font-medium">
                                    {banco.nome}
                                  </span>
                                  <span className="text-xs text-default-400">
                                    Código: {banco.codigo}
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </Select>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <Input
                            label="Agência"
                            placeholder="0000"
                            startContent={
                              <BuildingIcon className="w-4 h-4 text-default-400" />
                            }
                            value={conta.agencia}
                            onValueChange={(value) =>
                              updateConta(index, "agencia", value)
                            }
                          />
                          <Input
                            label="Conta"
                            placeholder="000000"
                            startContent={
                              <CreditCardIcon className="w-4 h-4 text-default-400" />
                            }
                            value={conta.conta}
                            onValueChange={(value) =>
                              updateConta(index, "conta", value)
                            }
                          />
                          <Input
                            label="Dígito"
                            placeholder="0"
                            startContent={
                              <Hash className="w-4 h-4 text-default-400" />
                            }
                            value={conta.digitoConta || ""}
                            onValueChange={(value) =>
                              updateConta(index, "digitoConta", value)
                            }
                          />
                        </div>

                        <Select
                          label="Tipo de Conta Bancária"
                          placeholder="Selecione"
                          selectedKeys={[conta.tipoContaBancaria]}
                          onSelectionChange={(keys) => {
                            const value = Array.from(keys)[0] as string;

                            updateConta(index, "tipoContaBancaria", value);
                          }}
                        >
                          {tiposContaBancaria.map((option) => (
                            <SelectItem
                              key={option.value}
                              textValue={option.label}
                            >
                              {option.label}
                            </SelectItem>
                          ))}
                        </Select>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Select
                            label="Tipo de Chave PIX"
                            placeholder="Selecione"
                            selectedKeys={
                              conta.tipoChavePix ? [conta.tipoChavePix] : []
                            }
                            onSelectionChange={(keys) => {
                              const value = Array.from(keys)[0] as
                                | string
                                | undefined;

                              updateConta(index, "tipoChavePix", value || "");
                            }}
                          >
                            {tiposChavePix.map((option) => (
                              <SelectItem
                                key={option.value}
                                textValue={option.label}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </Select>
                          <Input
                            label="Chave PIX"
                            placeholder="CPF, e-mail..."
                            startContent={
                              <Key className="w-4 h-4 text-default-400" />
                            }
                            value={conta.chavePix || ""}
                            onValueChange={(value) =>
                              updateConta(index, "chavePix", value)
                            }
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Input
                            label="Titular"
                            placeholder="Nome do titular"
                            startContent={
                              <UserIcon className="w-4 h-4 text-default-400" />
                            }
                            value={conta.titularNome}
                            onValueChange={(value) =>
                              updateConta(index, "titularNome", value)
                            }
                          />
                          {conta.tipoConta === "PESSOA_JURIDICA" ? (
                            <CnpjInput
                              className="w-full"
                              label="Documento do Titular"
                              placeholder="00.000.000/0000-00"
                              value={conta.titularDocumento || ""}
                              onChange={(value) =>
                                updateConta(index, "titularDocumento", value)
                              }
                            />
                          ) : (
                            <CpfInput
                              label="Documento do Titular"
                              placeholder="000.000.000-00"
                              value={conta.titularDocumento || ""}
                              onChange={(value) =>
                                updateConta(index, "titularDocumento", value)
                              }
                            />
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Input
                            label="Email do Titular"
                            placeholder="email@exemplo.com"
                            startContent={
                              <MailIcon className="w-4 h-4 text-default-400" />
                            }
                            value={conta.titularEmail || ""}
                            onValueChange={(value) =>
                              updateConta(index, "titularEmail", value)
                            }
                          />
                          <Input
                            label="Telefone do Titular"
                            placeholder="(11) 99999-9999"
                            startContent={
                              <PhoneIcon className="w-4 h-4 text-default-400" />
                            }
                            value={conta.titularTelefone || ""}
                            onValueChange={(value) =>
                              updateConta(index, "titularTelefone", value)
                            }
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <Input
                            label="Endereço"
                            placeholder="Rua, número..."
                            startContent={
                              <MapPinIcon className="w-4 h-4 text-default-400" />
                            }
                            value={conta.endereco || ""}
                            onValueChange={(value) =>
                              updateConta(index, "endereco", value)
                            }
                          />
                          <EstadoSelect
                            className="w-full"
                            selectedKeys={conta.estado ? [conta.estado] : []}
                            onSelectionChange={(keys) => {
                              const value = Array.from(keys)[0] as
                                | string
                                | undefined;

                              setContasBancarias((prev) => {
                                const clone = [...prev];
                                const previous = clone[index];
                                const nextEstado = value || "";

                                clone[index] = {
                                  ...previous,
                                  estado: nextEstado,
                                  cidade:
                                    previous.estado === nextEstado
                                      ? previous.cidade
                                      : "",
                                };

                                return clone;
                              });
                            }}
                          />
                          <CidadeSelect
                            className="w-full"
                            estadoSelecionado={conta.estado || null}
                            selectedKeys={conta.cidade ? [conta.cidade] : []}
                            onSelectionChange={(keys) => {
                              const value = Array.from(keys)[0] as
                                | string
                                | undefined;

                              updateConta(index, "cidade", value || "");
                            }}
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <CepInput
                            label="CEP"
                            placeholder="00000-000"
                            value={conta.cep || ""}
                            onChange={(value) =>
                              updateConta(index, "cep", value)
                            }
                          />
                          <Textarea
                            label="Observações"
                            placeholder="Informações adicionais..."
                            value={conta.observacoes || ""}
                            onValueChange={(value) =>
                              updateConta(index, "observacoes", value)
                            }
                          />
                        </div>
                      </CardBody>
                    </Card>
                  </motion.div>
                ))}
                <Button
                  color="primary"
                  startContent={<PlusIcon className="w-4 h-4" />}
                  variant="flat"
                  onPress={addConta}
                >
                  Adicionar conta bancária
                </Button>
              </div>
            </Tab>

            <Tab
              key="preferencias"
              title={
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-md bg-amber-100 dark:bg-amber-900">
                    <ShieldIcon
                      className="text-amber-600 dark:text-amber-300"
                      size={16}
                    />
                  </div>
                  <span>Preferências</span>
                </div>
              }
            >
              <div className="space-y-6 px-1">
                <motion.div
                  {...cardMotionProps}
                  whileHover={{ translateY: -6 }}
                >
                  <Card className="border border-amber-200 dark:border-amber-700 bg-amber-50/80 dark:bg-amber-900/20">
                    <CardHeader className="flex flex-col gap-1">
                      <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                        Configurações de Acesso
                      </p>
                      <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
                        Controle como o advogado utilizará o sistema
                      </p>
                    </CardHeader>
                    <CardBody className="space-y-4">
                      <div className="flex flex-wrap gap-4 items-center">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            color="warning"
                            isSelected={formState.isExterno ?? false}
                            onValueChange={(checked) =>
                              setFormState((prev) => ({
                                ...prev,
                                isExterno: checked,
                              }))
                            }
                          >
                            Advogado Externo
                          </Checkbox>
                          <Popover showArrow placement="top">
                            <PopoverTrigger>
                              <Button
                                isIconOnly
                                className="min-w-0"
                                size="sm"
                                variant="light"
                              >
                                <Info className="w-4 h-4 text-warning-500" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="max-w-xs space-y-2 p-4">
                              <p className="text-sm text-default-600">
                                Advogados externos não possuem credenciais de
                                acesso. Eles aparecem apenas como participantes
                                de processos, mas podem ser habilitados no
                                futuro se ingressarem na equipe.
                              </p>
                              <p className="text-xs text-default-500">
                                Use esta opção para mapear profissionais citados
                                em ações ou parceiros ocasionais. A vida é cheia
                                de mistérios: se o vínculo evoluir, basta
                                remover o status externo e liberar o acesso.
                              </p>
                            </PopoverContent>
                          </Popover>
                        </div>

                        <div className="flex items-center gap-2">
                          <Checkbox
                            color="primary"
                            isDisabled={formState.isExterno}
                            isSelected={formState.criarAcessoUsuario ?? true}
                            onValueChange={(checked) =>
                              setFormState((prev) => ({
                                ...prev,
                                criarAcessoUsuario: checked,
                              }))
                            }
                          >
                            Criar acesso ao sistema
                          </Checkbox>
                          <Popover showArrow placement="top">
                            <PopoverTrigger>
                              <Button
                                isIconOnly
                                className="min-w-0"
                                size="sm"
                                variant="light"
                              >
                                <Key className="w-4 h-4 text-primary-500" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="max-w-xs space-y-2 p-4">
                              <p className="text-sm text-default-600">
                                Ao criar o acesso, o advogado recebe um usuário
                                ativo com permissões padrão para atuar no
                                sistema.
                              </p>
                              <p className="text-xs text-default-500">
                                Ideal para integrantes fixos da equipe. Para
                                colaboradores externos mantenha desmarcado.
                              </p>
                            </PopoverContent>
                          </Popover>
                        </div>

                        {formState.criarAcessoUsuario &&
                          !formState.isExterno && (
                            <div className="flex items-center gap-2">
                              <Checkbox
                                color="primary"
                                isSelected={
                                  formState.enviarEmailCredenciais ?? true
                                }
                                onValueChange={(checked) =>
                                  setFormState((prev) => ({
                                    ...prev,
                                    enviarEmailCredenciais: checked,
                                  }))
                                }
                              >
                                Enviar link de primeiro acesso por email
                              </Checkbox>
                              <Popover showArrow placement="top">
                                <PopoverTrigger>
                                  <Button
                                    isIconOnly
                                    className="min-w-0"
                                    size="sm"
                                    variant="light"
                                  >
                                    <Info className="w-4 h-4 text-primary-500" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="max-w-xs space-y-2 p-4">
                                  <p className="text-sm text-default-600">
                                    Envie automaticamente um e-mail para o
                                    advogado definir a própria senha no primeiro
                                    acesso.
                                  </p>
                                  <p className="text-xs text-default-500">
                                    Caso prefira, desmarque e solicite que ele
                                    use a opção de primeiro acesso na tela de
                                    login.
                                  </p>
                                </PopoverContent>
                              </Popover>
                            </div>
                          )}
                      </div>
                    </CardBody>
                  </Card>
                </motion.div>

                <motion.div
                  {...cardMotionProps}
                  whileHover={{ translateY: -6 }}
                >
                  <Card className="border border-blue-200 dark:border-blue-700 bg-blue-50/80 dark:bg-blue-900/20">
                    <CardHeader className="flex flex-col gap-1">
                      <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                        Notificações
                      </p>
                      <p className="text-xs text-blue-700/80 dark:text-blue-300/80">
                        Defina como o advogado receberá atualizações
                      </p>
                    </CardHeader>
                    <CardBody className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <Checkbox
                        color="primary"
                        isSelected={formState.notificarEmail ?? true}
                        onValueChange={(checked) =>
                          setFormState((prev) => ({
                            ...prev,
                            notificarEmail: checked,
                          }))
                        }
                      >
                        Email
                      </Checkbox>
                      <Checkbox
                        color="success"
                        isSelected={formState.notificarWhatsapp ?? true}
                        onValueChange={(checked) =>
                          setFormState((prev) => ({
                            ...prev,
                            notificarWhatsapp: checked,
                          }))
                        }
                      >
                        WhatsApp
                      </Checkbox>
                      <Checkbox
                        color="secondary"
                        isSelected={formState.notificarSistema ?? true}
                        onValueChange={(checked) =>
                          setFormState((prev) => ({
                            ...prev,
                            notificarSistema: checked,
                          }))
                        }
                      >
                        Sistema
                      </Checkbox>
                    </CardBody>
                  </Card>
                </motion.div>

                <motion.div
                  {...cardMotionProps}
                  whileHover={{ translateY: -6 }}
                >
                  <Card className="border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-default-50/5">
                    <CardHeader className="flex flex-col gap-1">
                      <p className="text-sm font-semibold text-default-700 dark:text-default-200">
                        Permissões
                      </p>
                      <p className="text-xs text-default-500">
                        Controle de funcionalidades liberadas
                      </p>
                    </CardHeader>
                    <CardBody className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Tooltip content="Habilita o cadastro de novos processos e ações jurídicas.">
                        <Switch
                          isSelected={formState.podeCriarProcessos ?? true}
                          size="sm"
                          onValueChange={(checked) =>
                            setFormState((prev) => ({
                              ...prev,
                              podeCriarProcessos: checked,
                            }))
                          }
                        >
                          Pode criar processos
                        </Switch>
                      </Tooltip>
                      <Tooltip content="Permite editar informações de processos existentes.">
                        <Switch
                          isSelected={formState.podeEditarProcessos ?? true}
                          size="sm"
                          onValueChange={(checked) =>
                            setFormState((prev) => ({
                              ...prev,
                              podeEditarProcessos: checked,
                            }))
                          }
                        >
                          Pode editar processos
                        </Switch>
                      </Tooltip>
                      <Tooltip content="Autoriza a remover processos do sistema. Use com cautela.">
                        <Switch
                          isSelected={formState.podeExcluirProcessos ?? false}
                          size="sm"
                          onValueChange={(checked) =>
                            setFormState((prev) => ({
                              ...prev,
                              podeExcluirProcessos: checked,
                            }))
                          }
                        >
                          Pode excluir processos
                        </Switch>
                      </Tooltip>
                      <Tooltip content="Libera a gestão de clientes, contatos e informações sensíveis.">
                        <Switch
                          isSelected={formState.podeGerenciarClientes ?? true}
                          size="sm"
                          onValueChange={(checked) =>
                            setFormState((prev) => ({
                              ...prev,
                              podeGerenciarClientes: checked,
                            }))
                          }
                        >
                          Pode gerenciar clientes
                        </Switch>
                      </Tooltip>
                      <Tooltip content="Permite visualizar dashboards, relatórios e registros financeiros.">
                        <Switch
                          isSelected={formState.podeAcessarFinanceiro ?? false}
                          size="sm"
                          onValueChange={(checked) =>
                            setFormState((prev) => ({
                              ...prev,
                              podeAcessarFinanceiro: checked,
                            }))
                          }
                        >
                          Pode acessar financeiro
                        </Switch>
                      </Tooltip>
                    </CardBody>
                  </Card>
                </motion.div>
              </div>
            </Tab>
          </Tabs>
        </ModalBody>

        <ModalFooter>
          <Button variant="light" onPress={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button color="primary" isLoading={isSaving} onPress={onSubmit}>
            {primaryActionLabel}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
