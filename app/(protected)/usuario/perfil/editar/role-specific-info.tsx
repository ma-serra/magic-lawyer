"use client";

import { Card, CardHeader, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Divider } from "@heroui/divider";
import { Badge } from "@heroui/badge";
import {
  Scale,
  Building2,
  FileText,
  Shield,
  Users,
  DollarSign,
  Phone,
} from "lucide-react";

import { UserProfile } from "@/app/actions/profile";

interface RoleSpecificInfoProps {
  profile: UserProfile;
}

export function RoleSpecificInfo({ profile }: RoleSpecificInfoProps) {
  const renderAdvogadoInfo = () => {
    if (!profile.advogado) return null;

    return (
      <Card className="border border-default-200/70 bg-content1 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2 text-primary">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                Informações Profissionais
              </h3>
              <p className="text-sm text-default-500">
                Dados públicos e operacionais usados no seu exercício
                profissional.
              </p>
            </div>
          </div>
        </CardHeader>
        <Divider className="border-default-200/70" />
        <CardBody className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {profile.advogado.oabNumero && (
              <div className="rounded-xl border border-default-200/70 bg-default-50/80 p-4 dark:bg-default-100/10">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                  OAB
                </p>
                <p className="mt-2 text-base font-semibold text-foreground">
                  {profile.advogado.oabUf} {profile.advogado.oabNumero}
                </p>
              </div>
            )}

            {profile.advogado.telefone && (
              <div className="rounded-xl border border-default-200/70 bg-default-50/80 p-4 dark:bg-default-100/10">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                  Telefone Profissional
                </p>
                <p className="mt-2 text-base font-semibold text-foreground">
                  {profile.advogado.telefone}
                </p>
              </div>
            )}
          </div>

          {profile.advogado.especialidades.length > 0 && (
            <div className="rounded-xl border border-default-200/70 bg-default-50/70 p-4 dark:bg-default-100/10">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                Especialidades
              </p>
              <div className="flex flex-wrap gap-2">
                {profile.advogado.especialidades.map((especialidade) => (
                  <Chip
                    key={especialidade}
                    color="secondary"
                    size="sm"
                    variant="flat"
                  >
                    {especialidade}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {profile.advogado.bio && (
            <div className="rounded-xl border border-default-200/70 bg-default-50/70 p-4 dark:bg-default-100/10">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                Biografia
              </p>
              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-default-700 dark:text-default-300">
                {profile.advogado.bio}
              </p>
            </div>
          )}

          {profile.advogado.whatsapp && (
            <div className="rounded-xl border border-default-200/70 bg-default-50/80 p-4 dark:bg-default-100/10">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                WhatsApp
              </p>
              <p className="mt-2 text-base font-semibold text-foreground">
                {profile.advogado.whatsapp}
              </p>
            </div>
          )}
        </CardBody>
      </Card>
    );
  };

  const renderAdminInfo = () => {
    const tenantName = profile.tenant?.name || "Escritório não identificado";
    const tenantSlug = profile.tenant?.slug || "sem-slug";

    return (
      <Card className="border border-default-200/70 bg-content1 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-primary" />
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                Contexto administrativo do escritório
              </h3>
              <p className="text-sm text-default-500">
                Identificação do tenant e escopo operacional da sua conta.
              </p>
            </div>
          </div>
        </CardHeader>
        <Divider className="border-default-200/70" />
        <CardBody className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-default-200/70 bg-default-50/80 p-4 dark:bg-default-100/10">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-default-500">
                Escritório
              </p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {tenantName}
              </p>
            </div>

            <div className="rounded-xl border border-default-200/70 bg-default-50/80 p-4 dark:bg-default-100/10">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-default-500">
                Identificador do tenant
              </p>
              <p className="mt-2 font-mono text-sm text-foreground">
                {tenantSlug}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-default-200/70 bg-default-50/70 p-4 dark:bg-default-100/10">
            <p className="mb-3 text-sm font-medium text-default-600 dark:text-default-300">
              Escopo administrativo disponível neste perfil
            </p>
            <div className="flex flex-wrap gap-2.5">
              <Badge color="default" variant="flat">
                <Shield className="w-3 h-3 mr-1" />
                Gestão de equipe
              </Badge>
              <Badge color="default" variant="flat">
                <FileText className="w-3 h-3 mr-1" />
                Configurações do tenant
              </Badge>
              <Badge color="default" variant="flat">
                <DollarSign className="w-3 h-3 mr-1" />
                Operação financeira
              </Badge>
            </div>
          </div>
        </CardBody>
      </Card>
    );
  };

  const renderClienteInfo = () => {
    return (
      <Card className="border border-default-200/70 bg-content1 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                Informações do cliente
              </h3>
              <p className="text-sm text-default-500">
                Escopo de acesso do portal do cliente vinculado ao escritório.
              </p>
            </div>
          </div>
        </CardHeader>
        <Divider className="border-default-200/70" />

        <CardBody className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-default-200/70 bg-default-50/80 p-4 dark:bg-default-100/10">
              <div className="mb-2 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                  Escritório Vinculado
                </p>
              </div>
              <p className="text-base font-semibold text-foreground">
                {profile.tenant?.name || "N/A"}
              </p>
            </div>

            <div className="rounded-xl border border-default-200/70 bg-default-50/80 p-4 dark:bg-default-100/10">
              <div className="mb-2 flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                  Status da Conta
                </p>
              </div>
              <Badge
                className="font-semibold"
                color={profile.active ? "success" : "danger"}
                size="lg"
                variant="flat"
              >
                {profile.active ? "Ativo" : "Inativo"}
              </Badge>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-default-500">
              Acesso permitido
            </h4>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-default-200/70 bg-default-50/80 p-4 dark:bg-default-100/10">
                <div className="mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <h5 className="font-semibold text-foreground">
                    Meus documentos
                  </h5>
                </div>
                <p className="text-sm text-default-400">
                  Acesse seus contratos, procurações e documentos jurídicos
                </p>
              </div>

              <div className="rounded-xl border border-default-200/70 bg-default-50/80 p-4 dark:bg-default-100/10">
                <div className="mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <h5 className="font-semibold text-foreground">
                    Meus processos
                  </h5>
                </div>
                <p className="text-sm text-default-400">
                  Acompanhe o andamento dos seus processos jurídicos
                </p>
              </div>

              <div className="rounded-xl border border-default-200/70 bg-default-50/80 p-4 dark:bg-default-100/10">
                <div className="mb-3 flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-primary" />
                  <h5 className="font-semibold text-foreground">
                    Minhas faturas
                  </h5>
                </div>
                <p className="text-sm text-default-400">
                  Visualize e gerencie suas faturas e pagamentos
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-default-200/70 bg-default-50/80 p-4 dark:bg-default-100/10">
            <div className="mb-3 flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" />
              <h5 className="font-semibold text-foreground">Contato</h5>
            </div>
            <p className="text-sm text-default-400">
              Para dúvidas ou suporte, entre em contato com seu escritório de
              advocacia.
            </p>
          </div>
        </CardBody>
      </Card>
    );
  };

  const renderSuperAdminInfo = () => {
    return (
      <Card className="border border-default-200/70 bg-content1 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-warning/10 p-2 text-warning">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                Informações do Super Administrador
              </h3>
              <p className="text-sm text-default-500">
                Visão institucional com acesso ampliado sobre a plataforma.
              </p>
            </div>
          </div>
        </CardHeader>
        <Divider className="border-default-200/70" />
        <CardBody className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-default-200/70 bg-default-50/80 p-4 dark:bg-default-100/10">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                Nível de Acesso
              </p>
              <Badge className="mt-2" color="warning" variant="flat">
                <Shield className="w-3 h-3 mr-1" />
                Super Administrador
              </Badge>
            </div>

            <div className="rounded-xl border border-default-200/70 bg-default-50/80 p-4 dark:bg-default-100/10">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                Status da Conta
              </p>
              <Badge
                className="mt-2"
                color={profile.active ? "success" : "danger"}
                variant="flat"
              >
                {profile.active ? "Ativo" : "Inativo"}
              </Badge>
            </div>
          </div>

          <Divider className="border-default-200/70" />

          <div className="rounded-xl border border-default-200/70 bg-default-50/70 p-4 dark:bg-default-100/10">
            <p className="mb-3 text-sm font-medium text-default-600 dark:text-default-300">
              Permissões do Sistema
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge color="warning" variant="flat">
                <Building2 className="w-3 h-3 mr-1" />
                Gerenciar Tenants
              </Badge>
              <Badge color="warning" variant="flat">
                <Users className="w-3 h-3 mr-1" />
                Gerenciar Usuários
              </Badge>
              <Badge color="warning" variant="flat">
                <Scale className="w-3 h-3 mr-1" />
                Gerenciar Juízes
              </Badge>
              <Badge color="warning" variant="flat">
                <DollarSign className="w-3 h-3 mr-1" />
                Configurações de Preço
              </Badge>
            </div>
          </div>
        </CardBody>
      </Card>
    );
  };

  const renderRoleSpecificContent = () => {
    switch (profile.role) {
      case "ADVOGADO":
        return renderAdvogadoInfo();
      case "ADMIN":
        return renderAdminInfo();
      case "CLIENTE":
        return renderClienteInfo();
      case "SUPER_ADMIN":
        return renderSuperAdminInfo();
      default:
        return null;
    }
  };

  return <>{renderRoleSpecificContent()}</>;
}
