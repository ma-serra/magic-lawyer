const { PrismaClient } = require("../../generated/prisma");

const prisma = new PrismaClient();

/**
 * Seed para o sistema de notificações
 */
async function seedNotifications() {
  console.log("🌱 Iniciando seed do sistema de notificações...");

  try {
    // 1. Criar templates padrão para cada tenant
    const tenants = await prisma.tenant.findMany({
      select: { id: true, name: true },
    });

    for (const tenant of tenants) {
      await createDefaultTemplates(tenant.id);
      console.log(`✅ Templates criados para tenant: ${tenant.name}`);
    }

    // 2. Criar preferências padrão para todos os usuários
    const users = await prisma.usuario.findMany({
      select: { id: true, tenantId: true, role: true, firstName: true, lastName: true },
    });

    for (const user of users) {
      await createDefaultPreferences(user.tenantId, user.id, user.role);
    }

    console.log(`✅ Preferências criadas para ${users.length} usuários`);

    console.log("🎉 Seed do sistema de notificações concluído!");
  } catch (error) {
    console.error("❌ Erro no seed do sistema de notificações:", error);
    throw error;
  }
}

/**
 * Cria templates padrão para um tenant
 */
async function createDefaultTemplates(tenantId) {
  const templates = [
    {
      eventType: "processo.created",
      title: "Novo processo criado",
      message: "Processo {numero} foi criado para {cliente}",
      variables: { numero: "string", cliente: "string", advogado: "string" },
    },
    {
      eventType: "processo.updated",
      title: "Processo atualizado",
      message: "Processo {numero} foi atualizado: {changesSummary}",
      variables: {
        numero: "string",
        changesSummary: "string",
        diff: "json",
      },
    },
    {
      eventType: "access.login_new",
      title: "Novo acesso identificado",
      message:
        "Detectamos um novo acesso na sua conta em {locationLabel} ({ipAddress}) em {loggedAt}.",
      variables: {
        locationLabel: "string",
        ipAddress: "string",
        userAgent: "string",
        loggedAt: "string",
      },
    },
    {
      eventType: "processo.status_changed",
      title: "Status do processo alterado",
      message: "Processo {numero} mudou de {oldStatusLabel} para {newStatusLabel}",
      variables: {
        numero: "string",
        oldStatusLabel: "string",
        newStatusLabel: "string",
        oldStatus: "string",
        newStatus: "string",
        additionalChangesSummary: "string",
      },
    },
    {
      eventType: "prazo.expiring_7d",
      title: "Prazo próximo do vencimento",
      message: "Prazo do processo {numero} vence em 7 dias",
      variables: { numero: "string", descricao: "string", vencimento: "string" },
    },
    {
      eventType: "prazo.expiring",
      title: "Prazo próximo do vencimento",
      message: "Prazo do processo {numero} está próximo do vencimento",
      variables: { numero: "string", descricao: "string", vencimento: "string" },
    },
    {
      eventType: "prazo.expiring_3d",
      title: "Prazo próximo do vencimento",
      message: "Prazo do processo {numero} vence em 3 dias",
      variables: { numero: "string", descricao: "string", vencimento: "string" },
    },
    {
      eventType: "prazo.expiring_1d",
      title: "Prazo próximo do vencimento",
      message: "Prazo do processo {numero} vence em 1 dia",
      variables: { numero: "string", descricao: "string", vencimento: "string" },
    },
    {
      eventType: "prazo.expired",
      title: "Prazo vencido",
      message: "Prazo do processo {numero} venceu",
      variables: { numero: "string", descricao: "string", vencimento: "string" },
    },
    {
      eventType: "cliente.created",
      title: "Novo cliente cadastrado",
      message: "Cliente {nome} foi cadastrado",
      variables: { nome: "string", documento: "string", advogado: "string" },
    },
    {
      eventType: "cliente.updated",
      title: "Cliente atualizado",
      message: "Cliente {nome} foi atualizado",
      variables: { nome: "string", alteracoes: "string" },
    },
    {
      eventType: "contrato.created",
      title: "Novo contrato criado",
      message: "Contrato {numero} foi criado para {cliente}",
      variables: { numero: "string", cliente: "string", valor: "number", advogado: "string" },
    },
    {
      eventType: "contrato.signed",
      title: "Contrato assinado",
      message: "Contrato {numero} foi assinado",
      variables: { numero: "string", cliente: "string", assinadoPor: "string" },
    },
    {
      eventType: "contrato.expired",
      title: "Contrato expirado",
      message: "Contrato {numero} expirou",
      variables: { numero: "string", cliente: "string", dataExpiracao: "string" },
    },
    {
      eventType: "pagamento.paid",
      title: "Pagamento confirmado",
      message: "Pagamento de R$ {valor} foi confirmado",
      variables: { valor: "number", formaPagamento: "string", cliente: "string" },
    },
    {
      eventType: "pagamento.overdue",
      title: "Pagamento em atraso",
      message: "Pagamento de R$ {valor} está em atraso",
      variables: { valor: "number", cliente: "string", diasAtraso: "number" },
    },
    {
      eventType: "evento.created",
      title: "Novo evento agendado",
      message: "Evento {titulo} foi agendado para {data}",
      variables: { titulo: "string", data: "string", hora: "string", tipo: "string" },
    },
    {
      eventType: "evento.reminder_1h",
      title: "Lembrete de evento",
      message: "Evento {titulo} em 1 hora",
      variables: { titulo: "string", data: "string", hora: "string" },
    },
    {
      eventType: "evento.reminder_1d",
      title: "Lembrete de evento",
      message: "Evento {titulo} amanhã",
      variables: { titulo: "string", data: "string", hora: "string" },
    },
    {
      eventType: "equipe.user_invited",
      title: "Novo convite de equipe",
      message: "Convite enviado para {email}",
      variables: { email: "string", nome: "string", cargo: "string", enviadoPor: "string" },
    },
    {
      eventType: "equipe.user_joined",
      title: "Novo membro da equipe",
      message: "{nome} aceitou o convite e entrou na equipe",
      variables: { nome: "string", email: "string", cargo: "string" },
    },
    {
      eventType: "equipe.permissions_changed",
      title: "Permissões alteradas",
      message: "Permissões de {nome} foram alteradas",
      variables: { nome: "string", permissoesAntigas: "array", permissoesNovas: "array", alteradoPor: "string" },
    },
    {
      eventType: "tarefa.created",
      title: "Nova tarefa criada",
      message: "Tarefa {titulo} foi criada",
      variables: { titulo: "string", descricao: "string", categoria: "string", criadoPor: "string" },
    },
    {
      eventType: "tarefa.assigned",
      title: "Tarefa atribuída",
      message: "Tarefa {titulo} foi atribuída para você",
      variables: { titulo: "string", atribuidoPor: "string" },
    },
    {
      eventType: "tarefa.completed",
      title: "Tarefa concluída",
      message: "Tarefa {titulo} foi concluída",
      variables: { titulo: "string", concluidoPor: "string", tempoGasto: "number" },
    },
    {
      eventType: "documento.uploaded",
      title: "Documento enviado",
      message: "Documento {nome} foi enviado",
      variables: { nome: "string", tipo: "string", tamanho: "number", uploadadoPor: "string" },
    },
    {
      eventType: "documento.approved",
      title: "Documento aprovado",
      message: "Documento {nome} foi aprovado",
      variables: { nome: "string", aprovadoPor: "string", observacoes: "string" },
    },
    {
      eventType: "documento.rejected",
      title: "Documento rejeitado",
      message: "Documento {nome} foi rejeitado",
      variables: { nome: "string", rejeitadoPor: "string", motivo: "string" },
    },
    {
      eventType: "relatorio.generated",
      title: "Relatório gerado",
      message: "Relatório {nome} foi gerado",
      variables: { nome: "string", tipo: "string", formato: "string", tamanho: "number" },
    },
    {
      eventType: "relatorio.failed",
      title: "Falha na geração de relatório",
      message: "Falha ao gerar relatório {nome}",
      variables: { nome: "string", tipo: "string", erro: "string" },
    },
  ];

  for (const template of templates) {
    await prisma.notificationTemplate.upsert({
      where: {
        tenantId_eventType: {
          tenantId,
          eventType: template.eventType,
        },
      },
      update: {
        title: template.title,
        message: template.message,
        variables: template.variables,
      },
      create: {
        tenantId,
        eventType: template.eventType,
        title: template.title,
        message: template.message,
        variables: template.variables,
        isDefault: true,
      },
    });
  }
}

/**
 * Cria preferências padrão para um usuário baseadas no seu role
 */
async function createDefaultPreferences(tenantId, userId, role) {
  const preferences = getDefaultPreferencesByRole(role);

  for (const [eventType, config] of Object.entries(preferences)) {
    await prisma.notificationPreference.upsert({
      where: {
        tenantId_userId_eventType: {
          tenantId,
          userId,
          eventType,
        },
      },
      update: {
        enabled: config.enabled,
        channels: config.channels,
        urgency: config.urgency,
      },
      create: {
        tenantId,
        userId,
        eventType,
        enabled: config.enabled,
        channels: config.channels,
        urgency: config.urgency,
      },
    });
  }
}

/**
 * Garante tenant/usuário de teste e preferências específicas para canais de teste
 */
/**
 * Retorna preferências padrão baseadas no role
 */
function getDefaultPreferencesByRole(role) {
  const preferences = {
    SUPER_ADMIN: {
      default: { enabled: true, channels: ["REALTIME", "EMAIL"], urgency: "HIGH" },
      "processo.*": { enabled: true, channels: ["REALTIME", "EMAIL"], urgency: "HIGH" },
      "cliente.*": { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
      "financeiro.*": { enabled: true, channels: ["REALTIME", "EMAIL"], urgency: "HIGH" },
      "equipe.*": { enabled: true, channels: ["REALTIME", "EMAIL"], urgency: "HIGH" },
      "prazo.*": { enabled: true, channels: ["REALTIME", "EMAIL"], urgency: "CRITICAL" },
      "evento.*": { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
      "tarefa.*": { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
      "documento.*": { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
      "relatorio.*": { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
      "access.*": { enabled: true, channels: ["REALTIME", "EMAIL", "TELEGRAM"], urgency: "HIGH" },
    },
    ADMIN: {
      default: { enabled: true, channels: ["REALTIME", "EMAIL"], urgency: "HIGH" },
      "processo.*": { enabled: true, channels: ["REALTIME", "EMAIL"], urgency: "HIGH" },
      "cliente.*": { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
      "financeiro.*": { enabled: true, channels: ["REALTIME", "EMAIL"], urgency: "HIGH" },
      "equipe.*": { enabled: true, channels: ["REALTIME", "EMAIL"], urgency: "HIGH" },
      "prazo.*": { enabled: true, channels: ["REALTIME", "EMAIL"], urgency: "CRITICAL" },
      "evento.*": { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
      "tarefa.*": { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
      "documento.*": { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
      "relatorio.*": { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
      "access.*": { enabled: true, channels: ["REALTIME", "EMAIL", "TELEGRAM"], urgency: "HIGH" },
    },
    ADVOGADO: {
      default: { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
      "processo.*": { enabled: true, channels: ["REALTIME", "EMAIL"], urgency: "HIGH" },
      "cliente.*": { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
      "prazo.*": { enabled: true, channels: ["REALTIME", "EMAIL"], urgency: "CRITICAL" },
      "evento.*": { enabled: true, channels: ["REALTIME", "EMAIL"], urgency: "HIGH" },
      "contrato.*": { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
      "pagamento.*": { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
      "tarefa.*": { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
      "documento.*": { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
      "access.*": { enabled: true, channels: ["REALTIME", "EMAIL", "TELEGRAM"], urgency: "HIGH" },
    },
    SECRETARIA: {
      default: { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
      "processo.*": { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
      "cliente.*": { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
      "prazo.*": { enabled: true, channels: ["REALTIME", "EMAIL"], urgency: "HIGH" },
      "evento.*": { enabled: true, channels: ["REALTIME"], urgency: "HIGH" },
      "equipe.*": { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
      "tarefa.*": { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
      "documento.*": { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
      "access.*": { enabled: true, channels: ["REALTIME", "EMAIL", "TELEGRAM"], urgency: "HIGH" },
    },
    FINANCEIRO: {
      default: { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
      "financeiro.*": { enabled: true, channels: ["REALTIME", "EMAIL"], urgency: "HIGH" },
      "contrato.*": { enabled: true, channels: ["REALTIME", "EMAIL"], urgency: "HIGH" },
      "pagamento.*": { enabled: true, channels: ["REALTIME", "EMAIL"], urgency: "CRITICAL" },
      "honorario.*": { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
      "relatorio.*": { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
      "access.*": { enabled: true, channels: ["REALTIME", "EMAIL", "TELEGRAM"], urgency: "HIGH" },
    },
    CLIENTE: {
      default: { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
      "processo.*": { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
      "contrato.*": { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
      "pagamento.*": { enabled: true, channels: ["REALTIME"], urgency: "HIGH" },
      "evento.*": { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
      "documento.*": { enabled: true, channels: ["REALTIME"], urgency: "MEDIUM" },
      "access.*": { enabled: true, channels: ["REALTIME", "EMAIL", "TELEGRAM"], urgency: "HIGH" },
    },
  };

  return preferences[role] || preferences.SECRETARIA;
}

module.exports = { seedNotifications };
