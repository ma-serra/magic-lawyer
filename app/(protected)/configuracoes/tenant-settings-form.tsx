"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Divider } from "@heroui/divider";
import { Input } from "@heroui/input";
import { Select, SelectItem, Tooltip } from "@heroui/react";
import { addToast } from "@heroui/toast";
import {
  Building2,
  Clock3,
  Edit2,
  Mail,
  Phone,
  Save,
  X,
} from "lucide-react";

import {
  updateTenantBasicData,
  type UpdateTenantBasicDataInput,
} from "@/app/actions/tenant-config";
import type { BrazilTimezoneOption } from "@/app/lib/timezones/brazil-timezones";

interface TenantSettingsFormProps {
  initialData: {
    id: string;
    name: string;
    slug: string;
    domain: string | null;
    documento: string | null;
    tipoPessoa: "FISICA" | "JURIDICA";
    email: string | null;
    telefone: string | null;
    razaoSocial: string | null;
    nomeFantasia: string | null;
    timezone: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  timezoneOptions: BrazilTimezoneOption[];
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function formatCpf(value: string) {
  const digits = onlyDigits(value).slice(0, 11);

  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  }

  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatCnpj(value: string) {
  const digits = onlyDigits(value).slice(0, 14);

  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  }
  if (digits.length <= 12) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  }

  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function formatDocumento(value: string, tipoPessoa: "FISICA" | "JURIDICA") {
  const digits = onlyDigits(value);

  if (tipoPessoa === "FISICA" && digits.length <= 11) {
    return formatCpf(digits);
  }

  return formatCnpj(digits);
}

function formatPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 11);

  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function getStatusPresentation(status: string) {
  switch (status) {
    case "ACTIVE":
      return {
        color: "success" as const,
        label: "ATIVO",
        description: "Conta do escritório ativa para uso da plataforma.",
      };
    case "SUSPENDED":
    case "CANCELLED":
      return {
        color: "warning" as const,
        label: "DESATIVADO",
        description: "Conta com acesso restrito até regularização administrativa.",
      };
    default:
      return {
        color: "default" as const,
        label: status,
        description: "Status administrativo da conta do escritório.",
      };
  }
}

export function TenantSettingsForm({
  initialData,
  timezoneOptions,
}: TenantSettingsFormProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: initialData.name,
    email: initialData.email || "",
    telefone: formatPhone(initialData.telefone || ""),
    documento: formatDocumento(initialData.documento || "", initialData.tipoPessoa),
    razaoSocial: initialData.razaoSocial || "",
    nomeFantasia: initialData.nomeFantasia || "",
    timezone: initialData.timezone,
  });

  useEffect(() => {
    if (!isEditing) {
      setFormData({
        name: initialData.name,
        email: initialData.email || "",
        telefone: formatPhone(initialData.telefone || ""),
        documento: formatDocumento(
          initialData.documento || "",
          initialData.tipoPessoa,
        ),
        razaoSocial: initialData.razaoSocial || "",
        nomeFantasia: initialData.nomeFantasia || "",
        timezone: initialData.timezone,
      });
    }
  }, [isEditing, initialData]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updatePayload: UpdateTenantBasicDataInput = {};

      if (formData.name !== initialData.name) {
        updatePayload.name = formData.name;
      }
      if (formData.email !== (initialData.email || "")) {
        updatePayload.email = formData.email || undefined;
      }
      if (onlyDigits(formData.telefone) !== onlyDigits(initialData.telefone || "")) {
        updatePayload.telefone = formData.telefone || undefined;
      }
      if (onlyDigits(formData.documento) !== onlyDigits(initialData.documento || "")) {
        updatePayload.documento = formData.documento || undefined;
      }
      if (formData.razaoSocial !== (initialData.razaoSocial || "")) {
        updatePayload.razaoSocial = formData.razaoSocial || undefined;
      }
      if (formData.nomeFantasia !== (initialData.nomeFantasia || "")) {
        updatePayload.nomeFantasia = formData.nomeFantasia || undefined;
      }
      if (formData.timezone !== initialData.timezone) {
        updatePayload.timezone = formData.timezone;
      }

      const result = await updateTenantBasicData(updatePayload);

      if (result.success) {
        addToast({
          title: "Configurações salvas",
          description: "Os dados do escritório foram atualizados com sucesso.",
          color: "success",
        });
        setIsEditing(false);
        // Refresh page data
        router.refresh();
      } else {
        throw new Error(result.error || "Erro ao salvar");
      }
    } catch (error) {
      addToast({
        title: "Erro ao salvar",
        description:
          error instanceof Error ? error.message : "Erro desconhecido",
        color: "danger",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      name: initialData.name,
      email: initialData.email || "",
      telefone: formatPhone(initialData.telefone || ""),
      documento: formatDocumento(initialData.documento || "", initialData.tipoPessoa),
      razaoSocial: initialData.razaoSocial || "",
      nomeFantasia: initialData.nomeFantasia || "",
      timezone: initialData.timezone,
    });
    setIsEditing(false);
  };

  const statusPresentation = getStatusPresentation(initialData.status);
  const documentLabel =
    initialData.tipoPessoa === "FISICA" ? "CPF/CNPJ" : "CNPJ";
  const safeTimezoneOptions = timezoneOptions.some(
    (option) => option.key === formData.timezone,
  )
    ? timezoneOptions
    : [
        ...timezoneOptions,
        {
          key: formData.timezone,
          label: `${formData.timezone} (personalizado)`,
        },
      ];

  return (
    <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
      <CardHeader className="flex flex-col gap-2 pb-2">
        <div className="flex items-center justify-between w-full">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Informações do Escritório
            </h2>
            <p className="text-sm text-default-400">
              {isEditing
                ? "Edite os dados básicos do seu escritório."
                : "Dados cadastrais e operacionais do escritório."}
            </p>
          </div>
          {!isEditing && (
            <Tooltip content="Editar informações do escritório">
              <Button
                isIconOnly
                color="primary"
                radius="full"
                variant="flat"
                onPress={() => setIsEditing(true)}
              >
                <Edit2 className="h-4 w-4" />
              </Button>
            </Tooltip>
          )}
        </div>
      </CardHeader>
      <Divider className="border-white/10" />
      <CardBody className="space-y-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-background/50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-default-500">
              Slug do escritório
            </p>
            <p className="mt-1 text-sm font-medium text-white">
              {initialData.slug}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-background/50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-default-500">
              Domínio principal
            </p>
            <p className="mt-1 text-sm font-medium text-white">
              {initialData.domain || "Não configurado"}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-background/50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-default-500">
              Documento fiscal
            </p>
            <p className="mt-1 text-sm font-medium text-white">
              {formatDocumento(initialData.documento || "", initialData.tipoPessoa) ||
                "Não informado"}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-background/50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-default-500">
              Status da conta
            </p>
            <div className="mt-1 flex items-center gap-2">
              <Chip color={statusPresentation.color} size="sm" variant="flat">
                {statusPresentation.label}
              </Chip>
            </div>
            <p className="mt-2 text-xs text-default-400">
              {statusPresentation.description}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            isRequired
            description="Nome oficial apresentado no sistema."
            isDisabled={!isEditing}
            label="Nome"
            value={formData.name}
            onValueChange={(value) =>
              setFormData((prev) => ({ ...prev, name: value }))
            }
          />

          <Input
            description="Canal principal de contato administrativo."
            isDisabled={!isEditing}
            label="Email"
            startContent={<Mail className="h-4 w-4 text-default-400" />}
            type="email"
            value={formData.email}
            onValueChange={(value) =>
              setFormData((prev) => ({ ...prev, email: value }))
            }
          />

          <Input
            description="Número principal para contato (WhatsApp ou telefone fixo)."
            isDisabled={!isEditing}
            label="Telefone/WhatsApp principal"
            placeholder="(00) 00000-0000"
            startContent={<Phone className="h-4 w-4 text-default-400" />}
            value={formData.telefone}
            onValueChange={(value) =>
              setFormData((prev) => ({ ...prev, telefone: formatPhone(value) }))
            }
          />

          <Input
            description="Documento fiscal principal do escritório."
            isDisabled={!isEditing}
            label={documentLabel}
            placeholder={
              initialData.tipoPessoa === "FISICA"
                ? "000.000.000-00"
                : "00.000.000/0000-00"
            }
            startContent={<Building2 className="h-4 w-4 text-default-400" />}
            value={formData.documento}
            onValueChange={(value) =>
              setFormData((prev) => ({
                ...prev,
                documento: formatDocumento(value, initialData.tipoPessoa),
              }))
            }
          />

          <Input
            description="Razão social usada em documentos fiscais."
            isDisabled={!isEditing}
            label="Razão Social"
            value={formData.razaoSocial}
            onValueChange={(value) =>
              setFormData((prev) => ({ ...prev, razaoSocial: value }))
            }
          />

          <Input
            description="Nome comercial usado na operação."
            isDisabled={!isEditing}
            label="Nome Fantasia"
            value={formData.nomeFantasia}
            onValueChange={(value) =>
              setFormData((prev) => ({ ...prev, nomeFantasia: value }))
            }
          />

          <Select
            description="Usado para agenda, prazos e envio de notificações."
            isDisabled={!isEditing}
            label="Fuso horário do escritório"
            selectedKeys={
              formData.timezone ? [formData.timezone] : ["America/Sao_Paulo"]
            }
            startContent={<Clock3 className="h-4 w-4 text-default-400" />}
            onSelectionChange={(keys) => {
              const selected = Array.from(keys)[0] as string | undefined;
              if (!selected) return;
              setFormData((prev) => ({ ...prev, timezone: selected }));
            }}
          >
            {safeTimezoneOptions.map((timezone) => (
              <SelectItem key={timezone.key} textValue={timezone.label}>
                {timezone.label}
              </SelectItem>
            ))}
          </Select>
        </div>

        <div className="rounded-xl border border-white/10 bg-background/50 p-3 text-xs text-default-400">
          <p>
            Criado em{" "}
            {new Date(initialData.createdAt).toLocaleString("pt-BR")} ·
            Última atualização em{" "}
            {new Date(initialData.updatedAt).toLocaleString("pt-BR")}
          </p>
        </div>

        {isEditing && (
          <div className="flex gap-3 justify-end pt-4 border-t border-white/10">
            <Button
              color="danger"
              radius="full"
              startContent={<X className="h-4 w-4" />}
              variant="flat"
              onPress={handleCancel}
            >
              Cancelar
            </Button>
            <Button
              color="primary"
              isLoading={isSaving}
              radius="full"
              startContent={!isSaving ? <Save className="h-4 w-4" /> : null}
              onPress={handleSave}
            >
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
