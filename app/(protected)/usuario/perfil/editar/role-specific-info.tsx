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
      <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
        <CardHeader className="flex flex-col gap-2 pb-0">
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold">Informações Profissionais</h3>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {profile.advogado.oabNumero && (
              <div>
                <p className="text-sm font-medium text-default-600">OAB</p>
                <p className="text-white">
                  {profile.advogado.oabUf} {profile.advogado.oabNumero}
                </p>
              </div>
            )}

            {profile.advogado.telefone && (
              <div>
                <p className="text-sm font-medium text-default-600">
                  Telefone Profissional
                </p>
                <p className="text-white">{profile.advogado.telefone}</p>
              </div>
            )}
          </div>

          {profile.advogado.especialidades.length > 0 && (
            <div>
              <p className="text-sm font-medium text-default-600 mb-2 block">
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
            <div>
              <p className="text-sm font-medium text-default-600">Biografia</p>
              <p className="text-white text-sm mt-1">{profile.advogado.bio}</p>
            </div>
          )}

          {profile.advogado.whatsapp && (
            <div>
              <p className="text-sm font-medium text-default-600">WhatsApp</p>
              <p className="text-white">{profile.advogado.whatsapp}</p>
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
      <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
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
        <Divider className="border-white/10" />
        <CardBody className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-background/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-default-500">
                Escritório
              </p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {tenantName}
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-background/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-default-500">
                Identificador do tenant
              </p>
              <p className="mt-2 font-mono text-sm text-foreground">
                {tenantSlug}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-background/40 p-4">
            <p className="text-sm font-medium text-default-300 mb-3">
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
      <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
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
        <Divider className="border-white/10" />

        <CardBody className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-background/50 p-4">
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

            <div className="rounded-xl border border-white/10 bg-background/50 p-4">
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
              <div className="rounded-xl border border-white/10 bg-background/50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <h5 className="font-semibold text-foreground">Meus documentos</h5>
                </div>
                <p className="text-sm text-default-400">
                  Acesse seus contratos, procurações e documentos jurídicos
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-background/50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <h5 className="font-semibold text-foreground">Meus processos</h5>
                </div>
                <p className="text-sm text-default-400">
                  Acompanhe o andamento dos seus processos jurídicos
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-background/50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-primary" />
                  <h5 className="font-semibold text-foreground">Minhas faturas</h5>
                </div>
                <p className="text-sm text-default-400">
                  Visualize e gerencie suas faturas e pagamentos
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-background/50 p-4">
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
      <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
        <CardHeader className="flex flex-col gap-2 pb-0">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold">
              Informações do Super Administrador
            </h3>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-default-600">
                Nível de Acesso
              </p>
              <Badge color="warning" variant="flat">
                <Shield className="w-3 h-3 mr-1" />
                Super Administrador
              </Badge>
            </div>

            <div>
              <p className="text-sm font-medium text-default-600">
                Status da Conta
              </p>
              <Badge
                color={profile.active ? "success" : "danger"}
                variant="flat"
              >
                {profile.active ? "Ativo" : "Inativo"}
              </Badge>
            </div>
          </div>

          <Divider />

          <div>
            <p className="text-sm font-medium text-default-600 mb-2 block">
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
