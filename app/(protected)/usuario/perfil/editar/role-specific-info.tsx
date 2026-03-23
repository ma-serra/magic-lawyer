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
      <Card className="border border-white/10 bg-background/70 backdrop-blur-xl overflow-hidden">
        <CardHeader className="relative pb-4">
          <div className="absolute inset-0 bg-linear-to-r from-primary/10 via-secondary/5 to-primary/10 opacity-40" />
          <div className="relative flex items-center gap-3">
            <div className="rounded-xl border border-primary/30 bg-primary/10 p-2">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-foreground">
                Contexto administrativo do escritório
              </h3>
              <p className="text-sm text-default-400">
                Visão rápida de identificação do tenant e escopo de gestão.
              </p>
            </div>
          </div>
        </CardHeader>
        <Divider className="border-white/10" />
        <CardBody className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/70">
                Escritório
              </p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {tenantName}
              </p>
            </div>

            <div className="rounded-xl border border-secondary/20 bg-secondary/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-secondary/70">
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
              <Badge color="primary" variant="flat">
                <Shield className="w-3 h-3 mr-1" />
                Gestão de equipe
              </Badge>
              <Badge color="primary" variant="flat">
                <FileText className="w-3 h-3 mr-1" />
                Configurações do tenant
              </Badge>
              <Badge color="primary" variant="flat">
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
      <Card className="border border-white/10 bg-linear-to-br from-background/80 to-background/60 backdrop-blur-xl overflow-hidden">
        <CardHeader className="relative pb-4">
          <div className="absolute inset-0 bg-linear-to-r from-primary/10 via-secondary/5 to-primary/10 opacity-50" />
          <div className="relative flex items-center gap-3">
            <div className="p-2 rounded-lg bg-linear-to-br from-primary/20 to-secondary/20 border border-primary/30">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">
                Informações do Cliente
              </h3>
              <p className="text-sm text-primary-300">
                Portal de acesso aos seus serviços jurídicos
              </p>
            </div>
          </div>
        </CardHeader>

        <CardBody className="space-y-6">
          {/* Informações Principais */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 rounded-xl bg-linear-to-br from-primary/10 to-primary/5 border border-primary/20">
              <div className="flex items-center gap-3 mb-2">
                <Building2 className="w-5 h-5 text-primary" />
                <p className="text-sm font-medium text-primary-300">
                  Escritório Vinculado
                </p>
              </div>
              <p className="text-white font-semibold text-lg">
                {profile.tenant?.name || "N/A"}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-linear-to-br from-success/10 to-success/5 border border-success/20">
              <div className="flex items-center gap-3 mb-2">
                <Shield className="w-5 h-5 text-success" />
                <p className="text-sm font-medium text-success-300">
                  Status da Conta
                </p>
              </div>
              <Badge
                className="font-semibold"
                color={profile.active ? "success" : "danger"}
                size="lg"
                variant="flat"
              >
                {profile.active ? "✓ Ativo" : "✗ Inativo"}
              </Badge>
            </div>
          </div>

          {/* Acesso Permitido */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <h4 className="text-lg font-semibold text-white">
                Acesso Permitido
              </h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="group p-4 rounded-xl bg-linear-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 hover:border-blue-400/40 transition-all duration-300">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-blue-500/20 group-hover:bg-blue-400/30 transition-colors">
                    <FileText className="w-5 h-5 text-blue-400" />
                  </div>
                  <h5 className="font-semibold text-white">Meus Documentos</h5>
                </div>
                <p className="text-sm text-blue-300">
                  Acesse seus contratos, procurações e documentos jurídicos
                </p>
              </div>

              <div className="group p-4 rounded-xl bg-linear-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20 hover:border-purple-400/40 transition-all duration-300">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-purple-500/20 group-hover:bg-purple-400/30 transition-colors">
                    <Users className="w-5 h-5 text-purple-400" />
                  </div>
                  <h5 className="font-semibold text-white">Meus Processos</h5>
                </div>
                <p className="text-sm text-purple-300">
                  Acompanhe o andamento dos seus processos jurídicos
                </p>
              </div>

              <div className="group p-4 rounded-xl bg-linear-to-br from-green-500/10 to-green-600/5 border border-green-500/20 hover:border-green-400/40 transition-all duration-300">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-green-500/20 group-hover:bg-green-400/30 transition-colors">
                    <DollarSign className="w-5 h-5 text-green-400" />
                  </div>
                  <h5 className="font-semibold text-white">Minhas Faturas</h5>
                </div>
                <p className="text-sm text-green-300">
                  Visualize e gerencie suas faturas e pagamentos
                </p>
              </div>
            </div>
          </div>

          {/* Informações Adicionais */}
          <div className="p-4 rounded-xl bg-linear-to-r from-default/10 to-default/5 border border-default/20">
            <div className="flex items-center gap-3 mb-3">
              <Phone className="w-5 h-5 text-default-400" />
              <h5 className="font-semibold text-white">Contato</h5>
            </div>
            <p className="text-sm text-default-300">
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
