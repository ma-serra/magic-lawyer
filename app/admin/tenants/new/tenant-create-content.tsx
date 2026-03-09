"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";

import { Checkbox } from "@heroui/checkbox";
import { addToast } from "@heroui/toast";

import { createTenant, type CreateTenantData } from "@/app/actions/admin";
import { Select, SelectItem } from "@heroui/react";
import { PeoplePageHeader, PeoplePanel } from "@/components/people-ui";

const timezoneOptions = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Fortaleza",
  "America/Recife",
  "America/Bahia",
  "America/Campo_Grande",
  "America/Belem",
  "America/Rio_Branco",
];

const tipoPessoaOptions = [
  { value: "FISICA", label: "Pessoa Física" },
  { value: "JURIDICA", label: "Pessoa Jurídica" },
];

interface TenantCreateFormState {
  name: string;
  slug: string;
  domain: string;
  email: string;
  telefone: string;
  documento: string;
  razaoSocial: string;
  nomeFantasia: string;
  timezone: string;
  tipoPessoa: "FISICA" | "JURIDICA";
  adminFirstName: string;
  adminLastName: string;
  adminEmail: string;
  adminPassword: string;
  // Configuração Asaas
  configurarAsaas: boolean;
  asaasApiKey: string;
  asaasAccountId: string;
  asaasWalletId: string;
  asaasAmbiente: "SANDBOX" | "PRODUCAO";
}

const initialFormState: TenantCreateFormState = {
  name: "",
  slug: "",
  domain: "",
  email: "",
  telefone: "",
  documento: "",
  razaoSocial: "",
  nomeFantasia: "",
  timezone: "America/Sao_Paulo",
  tipoPessoa: "JURIDICA",
  adminFirstName: "",
  adminLastName: "",
  adminEmail: "",
  adminPassword: "",
  // Configuração Asaas
  configurarAsaas: false,
  asaasApiKey: "",
  asaasAccountId: "",
  asaasWalletId: "",
  asaasAmbiente: "SANDBOX",
};

export function TenantCreateContent() {
  const router = useRouter();
  const [form, setForm] = useState(initialFormState);
  const [isCreating, startCreating] = useTransition();

  const handleChange = <K extends keyof TenantCreateFormState>(
    field: K,
    value: TenantCreateFormState[K],
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = () => {
    if (!form.name.trim() || !form.slug.trim()) {
      addToast({
        title: "Campos obrigatórios",
        description: "Preencha pelo menos nome e slug do tenant.",
        color: "warning",
      });

      return;
    }

    if (!form.email.trim()) {
      addToast({
        title: "Email do tenant",
        description: "Informe um email de contato para o tenant.",
        color: "warning",
      });

      return;
    }

    if (!form.adminEmail.trim() || !form.adminPassword.trim()) {
      addToast({
        title: "Admin do tenant",
        description: "Preencha email e senha para o administrador inicial.",
        color: "warning",
      });

      return;
    }

    if (form.adminPassword.length < 8) {
      addToast({
        title: "Senha muito curta",
        description:
          "Use pelo menos 8 caracteres para a senha do administrador.",
        color: "warning",
      });

      return;
    }

    const payload: CreateTenantData = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      domain: form.domain.trim() || undefined,
      email: form.email.trim(),
      telefone: form.telefone.trim() || undefined,
      documento: form.documento.trim() || undefined,
      razaoSocial: form.razaoSocial.trim() || undefined,
      nomeFantasia: form.nomeFantasia.trim() || undefined,
      tipoPessoa: form.tipoPessoa,
      timezone: form.timezone,
      adminUser: {
        firstName: form.adminFirstName.trim() || "Administrador",
        lastName: form.adminLastName.trim() || "",
        email: form.adminEmail.trim(),
        password: form.adminPassword,
      },
      // Configuração Asaas
      asaasConfig: form.configurarAsaas
        ? {
            configurarAsaas: form.configurarAsaas,
            asaasApiKey: form.asaasApiKey,
            asaasAccountId: form.asaasAccountId,
            asaasWalletId: form.asaasWalletId || undefined,
            asaasAmbiente: form.asaasAmbiente,
          }
        : undefined,
    };

    startCreating(async () => {
      const response = await createTenant(payload);

      if (!response.success || !response.data?.tenant) {
        addToast({
          title: "Erro ao criar tenant",
          description: response.error ?? "Verifique os dados informados",
          color: "danger",
        });

        return;
      }

      addToast({
        title: "Tenant criado",
        description: "O novo tenant foi cadastrado com sucesso",
        color: "success",
      });

      setForm(initialFormState);

      router.push(`/admin/tenants/${response.data.tenant.id}`);
    });
  };

  return (
    <section className="space-y-6">
      <PeoplePageHeader
        tag="Administração"
        title="Cadastrar novo tenant"
        description="Crie um novo escritório na plataforma e já configure o administrador inicial."
      />

      <PeoplePanel
        title="Dados de provisionamento"
        description="Preencha identificação do escritório, usuário administrador e integrações iniciais."
      >
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-default-500">
              Dados do tenant
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                isRequired
                label="Nome do tenant"
                value={form.name}
                onValueChange={(value) => handleChange("name", value)}
              />
              <Input
                isRequired
                label="Slug"
                placeholder="ex.: silva-advocacia"
                value={form.slug}
                onValueChange={(value) => handleChange("slug", value)}
              />
              <Input
                label="Domínio personalizado"
                placeholder="ex.: escritorio.minhaempresa.com"
                value={form.domain}
                onValueChange={(value) => handleChange("domain", value)}
              />
              <Select
                label="Fuso horário"
                selectedKeys={new Set([form.timezone])}
                onSelectionChange={(keys) => {
                  const [value] = Array.from(keys);

                  if (typeof value === "string") {
                    handleChange("timezone", value);
                  }
                }}
              >
                {timezoneOptions.map((option) => (
                  <SelectItem key={option} textValue={option}>{option}</SelectItem>
                ))}
              </Select>
              <Input
                isRequired
                label="Email de contato"
                type="email"
                value={form.email}
                onValueChange={(value) => handleChange("email", value)}
              />
              <Input
                label="Telefone"
                value={form.telefone}
                onValueChange={(value) => handleChange("telefone", value)}
              />
              <Input
                label="Documento (CNPJ/CPF)"
                value={form.documento}
                onValueChange={(value) => handleChange("documento", value)}
              />
              <Select
                label="Tipo de pessoa"
                selectedKeys={new Set([form.tipoPessoa])}
                onSelectionChange={(keys) => {
                  const [value] = Array.from(keys);

                  if (value === "FISICA" || value === "JURIDICA") {
                    handleChange("tipoPessoa", value);
                  }
                }}
              >
                {tipoPessoaOptions.map((option) => (
                  <SelectItem key={option.value} textValue={option.label}>{option.label}</SelectItem>
                ))}
              </Select>
              <Input
                label="Razão social"
                value={form.razaoSocial}
                onValueChange={(value) => handleChange("razaoSocial", value)}
              />
              <Input
                label="Nome fantasia"
                value={form.nomeFantasia}
                onValueChange={(value) => handleChange("nomeFantasia", value)}
              />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-default-500">
              Administrador inicial
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                label="Nome"
                value={form.adminFirstName}
                onValueChange={(value) => handleChange("adminFirstName", value)}
              />
              <Input
                label="Sobrenome"
                value={form.adminLastName}
                onValueChange={(value) => handleChange("adminLastName", value)}
              />
              <Input
                isRequired
                label="Email do administrador"
                type="email"
                value={form.adminEmail}
                onValueChange={(value) => handleChange("adminEmail", value)}
              />
              <Input
                isRequired
                label="Senha provisória"
                type="password"
                value={form.adminPassword}
                onValueChange={(value) => handleChange("adminPassword", value)}
              />
            </div>
          </section>

          {/* Configuração Asaas */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <Checkbox
                isSelected={form.configurarAsaas}
                onValueChange={(checked) =>
                  handleChange("configurarAsaas", checked)
                }
              >
                <span className="text-sm font-semibold">
                  Configurar integração Asaas
                </span>
              </Checkbox>
            </div>

            {form.configurarAsaas && (
              <div className="space-y-4 p-4 bg-primary/5 rounded-lg border border-primary/20">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 bg-primary rounded-full" />
                  <h3 className="text-sm font-semibold text-primary">
                    Configuração Asaas
                  </h3>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    description="Começa com $aact_"
                    label="API Key"
                    placeholder="Cole a API Key do Asaas"
                    type="password"
                    value={form.asaasApiKey}
                    onValueChange={(value) =>
                      handleChange("asaasApiKey", value)
                    }
                  />
                  <Input
                    description="ID da conta no painel Asaas"
                    label="Account ID"
                    placeholder="ID da conta Asaas"
                    value={form.asaasAccountId}
                    onValueChange={(value) =>
                      handleChange("asaasAccountId", value)
                    }
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    description="Para carteiras digitais"
                    label="Wallet ID (Opcional)"
                    placeholder="ID da carteira digital"
                    value={form.asaasWalletId}
                    onValueChange={(value) =>
                      handleChange("asaasWalletId", value)
                    }
                  />
                  <Select
                    label="Ambiente"
                    placeholder="Selecione o ambiente"
                    selectedKeys={new Set([form.asaasAmbiente])}
                    onSelectionChange={(keys) => {
                      const [value] = Array.from(keys);
                      if (value === "SANDBOX" || value === "PRODUCAO") {
                        handleChange("asaasAmbiente", value);
                      }
                    }}
                  >
                    <SelectItem key="SANDBOX" textValue="Sandbox (Teste)">Sandbox (Teste)</SelectItem>
                    <SelectItem key="PRODUCAO" textValue="Produção">Produção</SelectItem>
                  </Select>
                </div>

                <div className="p-3 bg-warning/10 rounded-lg">
                  <p className="text-xs text-warning">
                    <strong>Importante:</strong> A configuração Asaas será salva
                    após a criação do tenant. Certifique-se de que as
                    credenciais estão corretas.
                  </p>
                </div>
              </div>
            )}
          </section>

          <div className="flex justify-end">
            <Button
              color="primary"
              isLoading={isCreating}
              radius="full"
              onPress={handleSubmit}
            >
              Criar tenant
            </Button>
          </div>
        </div>
      </PeoplePanel>
    </section>
  );
}
