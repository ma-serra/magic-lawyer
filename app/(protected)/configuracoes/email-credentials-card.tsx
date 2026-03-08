"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Divider } from "@heroui/divider";
import { Input } from "@heroui/input";

import {
  Table, TableBody, TableCell, TableColumn, TableHeader, TableRow, } from "@heroui/table";
import { addToast } from "@heroui/toast";
import { Tooltip, Select, SelectItem } from "@heroui/react";
import {
  Mail,
  Server,
  Info,
  CheckCircle2,
  XCircle,
  KeyRound,
  Eye,
  EyeOff,
  Plus,
  Bell,
  Shield,
  Clock,
  Users,
  Zap,
} from "lucide-react";
import { useSession } from "next-auth/react";

import {
  listTenantEmailCredentials,
  upsertTenantEmailCredential,
  deleteTenantEmailCredential,
  testTenantEmailConnection,
  sendTenantTestEmail,
} from "@/app/actions/tenant-email-credentials";

export function EmailCredentialsCard() {
  const { data: session } = useSession();
  const tenantId = (session?.user as any)?.tenantId as string | undefined;
  const role = ((session?.user as any)?.role as string | undefined) || null;

  const { data, mutate, isLoading } = useSWR(
    tenantId ? ["tenant-email-creds", tenantId] : null,
    async () => {
      if (!tenantId) return [];
      const res = await listTenantEmailCredentials(tenantId);

      if (!res.success) throw new Error(res.error || "Falha ao carregar credenciais");

      return res.data.map((cred) => ({
        id: cred.id,
        type: cred.type,
        fromAddress: cred.fromAddress,
        fromName: cred.fromName,
        createdAt: cred.createdAt.toISOString(),
        updatedAt: cred.updatedAt.toISOString(),
      }));
    },
  );

  const [formType, setFormType] = useState<"DEFAULT" | "ADMIN">("DEFAULT");
  const [formFromAddress, setFormFromAddress] = useState("");
  const [formFromName, setFormFromName] = useState("");
  const [formApiKey, setFormApiKey] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState<"DEFAULT" | "ADMIN" | null>(null);
  const [isSendingTestEmail, setIsSendingTestEmail] = useState<
    "DEFAULT" | "ADMIN" | null
  >(null);
  const [testEmailTarget, setTestEmailTarget] = useState(
    session?.user?.email || "",
  );
  const [hasExistingCredential, setHasExistingCredential] = useState(false);

  useEffect(() => {
    if (!data) return;
    const existing = data.find((c) => c.type === formType);

    setFormFromAddress(existing?.fromAddress ?? "");
    setFormFromName(existing?.fromName ?? "");
    setHasExistingCredential(!!existing);
  }, [data, formType]);

  useEffect(() => {
    if (!testEmailTarget && session?.user?.email) {
      setTestEmailTarget(session.user.email);
    }
  }, [session?.user?.email, testEmailTarget]);

  const handleSave = async () => {
    if (!tenantId) {
      addToast({
        title: "Erro",
        description: "Tenant ID não encontrado",
        color: "danger",
      });

      return;
    }

    if (!formFromAddress || (!formApiKey && !hasExistingCredential)) {
      addToast({
        title: "Campos obrigatórios",
        description: hasExistingCredential
          ? "Informe ao menos o remetente."
          : "Informe remetente e API key do Resend.",
        color: "warning",
      });

      return;
    }

    setIsSaving(true);
    try {
      const res = await upsertTenantEmailCredential({
        tenantId,
        type: formType,
        fromAddress: formFromAddress,
        apiKey: formApiKey || undefined,
        fromName: formFromName || null,
      });

      if (!res.success) throw new Error(res.error || "Falha ao salvar credenciais");
      addToast({
        title: "Credenciais salvas",
        description: `${formType} atualizado com sucesso`,
        color: "success",
      });
      setFormApiKey("");
      await mutate();
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

  const handleDelete = async (type: "DEFAULT" | "ADMIN") => {
    if (!tenantId) {
      addToast({
        title: "Erro",
        description: "Tenant ID não encontrado",
        color: "danger",
      });

      return;
    }
    try {
      const res = await deleteTenantEmailCredential(tenantId, type);
      if (!res.success) {
        throw new Error(res.error || "Falha ao remover credencial.");
      }
      addToast({
        title: "Removido",
        description: `${type} excluído com sucesso`,
        color: "success",
      });
      await mutate();
    } catch (error) {
      addToast({
        title: "Erro ao remover",
        description:
          error instanceof Error ? error.message : "Erro desconhecido",
        color: "danger",
      });
    }
  };

  const handleTest = async (type: "DEFAULT" | "ADMIN") => {
    if (!tenantId) {
      addToast({
        title: "Erro",
        description: "Tenant ID não encontrado",
        color: "danger",
      });

      return;
    }
    setIsTesting(type);
    try {
      const res = await testTenantEmailConnection(tenantId, type);

      if (res.success) {
        addToast({
          title: "✅ Conexão verificada com sucesso",
          description: `As credenciais ${type} foram validadas. O sistema pode enviar emails usando esta conta.`,
          color: "success",
          timeout: 6000,
        });
      } else {
        addToast({
          title: "❌ Falha na verificação",
          description:
            res.error ||
            `Não foi possível validar as credenciais ${type}. Verifique remetente e API key do Resend.`,
          color: "danger",
          timeout: 8000,
        });
      }
    } catch (error) {
      addToast({
        title: "❌ Erro ao testar conexão",
        description:
          error instanceof Error
            ? error.message
            : "Erro desconhecido ao verificar conexão",
        color: "danger",
        timeout: 8000,
      });
    } finally {
      setIsTesting(null);
    }
  };

  const handleSendTestEmail = async (type: "DEFAULT" | "ADMIN") => {
    if (!tenantId) return;

    setIsSendingTestEmail(type);
    try {
      const res = await sendTenantTestEmail({
        tenantId,
        type,
        toEmail: testEmailTarget,
      });

      if (!res.success) {
        throw new Error(res.error || "Falha ao enviar email de teste.");
      }

      addToast({
        title: "📨 Email de teste enviado",
        description: `Teste ${type} enviado para ${res.toEmail}.`,
        color: "success",
        timeout: 6000,
      });
    } catch (error) {
      addToast({
        title: "Erro ao enviar teste",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        color: "danger",
      });
    } finally {
      setIsSendingTestEmail(null);
    }
  };

  if (!tenantId) {
    return null;
  }

  const defaultCredential = data?.find((item) => item.type === "DEFAULT");
  const adminCredential = data?.find((item) => item.type === "ADMIN");
  const isReadyForDefault = Boolean(defaultCredential);
  const isReadyForAdmin = Boolean(adminCredential);
  const roleLabel =
    role === "SUPER_ADMIN"
      ? "Super Admin"
      : role === "ADMIN"
        ? "Administrador"
        : "Usuário";

  return (
    <div className="flex flex-col gap-6">
      <Card className="border border-primary/20 bg-primary/5 backdrop-blur">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            <h3 className="text-base font-semibold text-white">
              Tutorial rápido da aba Email
            </h3>
          </div>
        </CardHeader>
        <Divider className="border-white/10" />
        <CardBody className="space-y-2 text-sm text-default-300">
          <p>1. Cadastre credenciais DEFAULT para notificações operacionais do sistema.</p>
          <p>2. Cadastre ADMIN para comunicações administrativas críticas.</p>
          <p>3. Clique em Testar para validar API key sem disparar emails.</p>
          <p>4. Use Enviar teste para confirmar entrega no destino escolhido.</p>
          <p>
            5. Se precisar trocar remetente sem trocar API key, deixe a chave vazia ao salvar.
          </p>
          <div className="pt-1">
            <Chip color="default" size="sm" variant="flat">
              Perfil atual: {roleLabel}
            </Chip>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
          <CardBody className="gap-1">
            <p className="text-xs uppercase tracking-wide text-default-500">DEFAULT</p>
            <p className="text-sm text-default-300">Notificações operacionais</p>
            <Chip
              color={isReadyForDefault ? "success" : "warning"}
              size="sm"
              variant="flat"
            >
              {isReadyForDefault ? "Configurado" : "Pendente"}
            </Chip>
          </CardBody>
        </Card>
        <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
          <CardBody className="gap-1">
            <p className="text-xs uppercase tracking-wide text-default-500">ADMIN</p>
            <p className="text-sm text-default-300">Boas-vindas e comunicações críticas</p>
            <Chip
              color={isReadyForAdmin ? "success" : "warning"}
              size="sm"
              variant="flat"
            >
              {isReadyForAdmin ? "Configurado" : "Opcional"}
            </Chip>
          </CardBody>
        </Card>
        <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
          <CardBody className="gap-2">
            <p className="text-xs uppercase tracking-wide text-default-500">Email de teste</p>
            <Input
              labelPlacement="outside"
              placeholder="destino@dominio.com"
              type="email"
              value={testEmailTarget}
              onValueChange={setTestEmailTarget}
            />
            <p className="text-xs text-default-500">
              Usado pelos botões de envio de teste da tabela abaixo.
            </p>
          </CardBody>
        </Card>
      </div>

      {/* Card Informativo */}
      <Card className="border border-warning/20 bg-warning/5 backdrop-blur">
        <CardBody>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-warning/20 p-2">
              <Info className="h-5 w-5 text-warning" />
            </div>
            <div className="flex-1 space-y-2">
              <h3 className="text-sm font-semibold text-warning">
                📧 Configuração de Envio de Emails
              </h3>
              <p className="text-sm text-default-300">
                Esta seção configura as <strong>credenciais de envio</strong>{" "}
                que o sistema utiliza para{" "}
                <strong>enviar emails automaticamente</strong> (notificações,
                convites, faturas, lembretes, etc.). Os emails que você encontra
                em outras seções são apenas{" "}
                <strong>informações de contato</strong> e não são usados para
                envio.
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Card de Configuração */}
      <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
        <CardHeader className="flex flex-col gap-2 pb-2">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-default/20 p-2">
              <Server className="h-5 w-5 text-default-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Credenciais de Envio de Email
              </h2>
              <p className="text-sm text-default-400">
                Configure as credenciais de email para envio de notificações,
                convites e comunicações do escritório.
              </p>
            </div>
          </div>
        </CardHeader>
        <Divider className="border-white/10" />
        <CardBody className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Select
              description={
                formType === "DEFAULT"
                  ? "Uso geral (notificações, agenda, etc.)"
                  : "Comunicações administrativas"
              }
              label="Tipo de credencial"
              selectedKeys={formType ? [formType] : []}
              startContent={
                formType === "DEFAULT" ? (
                  <Bell className="h-4 w-4 text-primary" />
                ) : formType === "ADMIN" ? (
                  <Shield className="h-4 w-4 text-secondary" />
                ) : null
              }
              onSelectionChange={(keys) => {
                const value = Array.from(keys)[0] as string;

                if (typeof value === "string")
                  setFormType(value as "DEFAULT" | "ADMIN");
              }}
            >
              <SelectItem
                key="DEFAULT"
                description="Usado para envio de notificações automáticas (andamentos, lembretes, convites, faturas), emails da agenda e outras comunicações gerais do sistema."
                startContent={<Bell className="h-4 w-4 text-primary" />}
                textValue="DEFAULT - Uso Geral"
              >
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-primary" />
                  <span>DEFAULT</span>
                  <Chip color="primary" size="sm" variant="flat">
                    Uso Geral
                  </Chip>
                </div>
              </SelectItem>
              <SelectItem
                key="ADMIN"
                description="Usado exclusivamente para comunicações administrativas importantes, como boas-vindas de novos advogados, credenciais iniciais e notificações críticas do sistema."
                startContent={<Shield className="h-4 w-4 text-secondary" />}
                textValue="ADMIN - Administrativo"
              >
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-secondary" />
                  <span>ADMIN</span>
                  <Chip color="secondary" size="sm" variant="flat">
                    Administrativo
                  </Chip>
                </div>
              </SelectItem>
            </Select>
            <Input
              description="Nome que aparece como remetente"
              label="De (From Name)"
              placeholder="Ex.: Sandra Advocacia"
              startContent={<Mail className="h-4 w-4 text-primary" />}
              value={formFromName}
              onValueChange={setFormFromName}
            />
            <Input
              isRequired
              description="Endereço de remetente verificado no Resend"
              label="Remetente (From Address)"
              placeholder="noreply@seudominio.com"
              startContent={<Mail className="h-4 w-4 text-success" />}
              type="email"
              value={formFromAddress}
              onValueChange={setFormFromAddress}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-1">
            <Input
              isRequired={!hasExistingCredential}
              description="Chave de API do Resend para este tenant"
              endContent={
                formApiKey ? (
                  <Button
                    isIconOnly
                    aria-label={
                      isPasswordVisible ? "Ocultar senha" : "Mostrar senha"
                    }
                    className="min-w-6 w-6 h-6 text-default-400 hover:text-default-600"
                    size="sm"
                    variant="light"
                    onPress={() => setIsPasswordVisible(!isPasswordVisible)}
                  >
                    {isPasswordVisible ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                ) : null
              }
              label="API Key do Resend"
              placeholder={
                hasExistingCredential
                  ? "Deixe vazio para manter a chave atual"
                  : "re_xxxxxxxxxxxxxxxxxx"
              }
              startContent={<KeyRound className="h-4 w-4 text-warning" />}
              type={isPasswordVisible ? "text" : "password"}
              value={formApiKey}
              onValueChange={setFormApiKey}
            />
          </div>
          <div className="flex gap-3 justify-end">
            <Button
              color="primary"
              endContent={
                !isSaving ? <CheckCircle2 className="h-4 w-4" /> : null
              }
              isLoading={isSaving}
              radius="full"
              startContent={!isSaving ? <Plus className="h-4 w-4" /> : null}
              onPress={handleSave}
            >
              {isSaving ? "Salvando..." : "Salvar credenciais"}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Card de Credenciais Cadastradas */}
      <Card className="border border-success/20 bg-background/70 backdrop-blur-xl">
        <CardHeader className="flex flex-col gap-2 pb-2">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-success/20 p-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Credenciais cadastradas
              </h2>
              <p className="text-sm text-default-400">
                Visualize, teste e remova credenciais existentes.
              </p>
            </div>
          </div>
        </CardHeader>
        <Divider className="border-white/10" />
        <CardBody>
          {isLoading ? (
            <p className="text-sm text-default-400">Carregando...</p>
          ) : data && data.length ? (
            <Table removeWrapper aria-label="Credenciais de Envio">
              <TableHeader>
                <TableColumn>Tipo</TableColumn>
                <TableColumn>Email</TableColumn>
                <TableColumn>From Name</TableColumn>
                <TableColumn>Atualizado</TableColumn>
                <TableColumn className="text-right">Ações</TableColumn>
              </TableHeader>
              <TableBody>
                {data.map((c) => (
                  <TableRow key={c.type}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {c.type === "DEFAULT" ? (
                          <Chip
                            color="primary"
                            size="sm"
                            startContent={<Bell className="h-3 w-3" />}
                            variant="flat"
                          >
                            DEFAULT
                          </Chip>
                        ) : (
                          <Chip
                            color="secondary"
                            size="sm"
                            startContent={<Shield className="h-3 w-3" />}
                            variant="flat"
                          >
                            ADMIN
                          </Chip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-success" />
                        <span className="text-default-500">
                          {c.fromAddress}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-primary" />
                        <span className="text-default-500">
                          {c.fromName ?? "—"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-default-400" />
                        <span className="text-default-500">
                          {new Date(c.updatedAt).toLocaleString("pt-BR")}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Tooltip content="Valida a API key do Resend para este tipo de credencial sem disparar emails.">
                          <Button
                            color="success"
                            isLoading={isTesting === c.type}
                            radius="full"
                            size="sm"
                            startContent={
                              !isTesting ? <Zap className="h-4 w-4" /> : null
                            }
                            variant="solid"
                            onPress={() => handleTest(c.type)}
                          >
                            {isTesting === c.type ? "Testando..." : "Testar"}
                          </Button>
                        </Tooltip>
                        <Tooltip content="Envia email real de teste para o destino configurado acima.">
                          <Button
                            color="primary"
                            isLoading={isSendingTestEmail === c.type}
                            radius="full"
                            size="sm"
                            startContent={
                              isSendingTestEmail !== c.type ? (
                                <Mail className="h-4 w-4" />
                              ) : null
                            }
                            variant="flat"
                            onPress={() => handleSendTestEmail(c.type)}
                          >
                            {isSendingTestEmail === c.type
                              ? "Enviando..."
                              : "Enviar teste"}
                          </Button>
                        </Tooltip>
                        <Tooltip content="Remove permanentemente esta credencial. O sistema não poderá mais enviar emails usando este tipo.">
                          <Button
                            color="danger"
                            radius="full"
                            size="sm"
                            startContent={<XCircle className="h-4 w-4" />}
                            variant="bordered"
                            onPress={() => handleDelete(c.type)}
                          >
                            Remover
                          </Button>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-default-400">
              Nenhuma credencial cadastrada. Configure uma credencial acima.
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
