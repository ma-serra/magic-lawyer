const bcrypt = require("bcryptjs");

async function ensurePermission(prisma, tenantId, usuarioId, permissao) {
  return prisma.usuarioPermissao.upsert({
    where: {
      tenantId_usuarioId_permissao: {
        tenantId,
        usuarioId,
        permissao,
      },
    },
    update: {},
    create: {
      tenantId,
      usuarioId,
      permissao,
    },
  });
}

async function cleanupLegacySalbaData(prisma, tenantId, adminEmail) {
  const adminUser = await prisma.usuario.findFirst({
    where: {
      tenantId,
      email: adminEmail,
    },
    select: {
      id: true,
    },
  });

  await prisma.$transaction(async (tx) => {
    await tx.eventoParticipante.deleteMany({ where: { tenantId } });
    await tx.evento.deleteMany({ where: { tenantId } });
    await tx.tarefa.deleteMany({ where: { tenantId } });
    await tx.processoPrazo.deleteMany({ where: { tenantId } });
    await tx.processoDocumento.deleteMany({ where: { tenantId } });
    await tx.processoParte.deleteMany({ where: { tenantId } });
    await tx.movimentacaoProcesso.deleteMany({ where: { tenantId } });
    await tx.processo.deleteMany({ where: { tenantId } });
    await tx.advogadoCliente.deleteMany({ where: { tenantId } });
    await tx.advogado.deleteMany({ where: { tenantId } });
    await tx.cliente.deleteMany({ where: { tenantId } });
    await tx.usuarioPermissao.deleteMany({
      where: adminUser
        ? {
            tenantId,
            usuarioId: {
              not: adminUser.id,
            },
          }
        : {
            tenantId,
          },
    });
    await tx.usuario.deleteMany({
      where: {
        tenantId,
        email: {
          not: adminEmail,
        },
      },
    });
  });
}

async function seedSalbaAdvocacia(prisma) {
  console.log("🌱 Criando tenant Salba Advocacia (modo produção)...");

  const adminEmail = "luciano@salbaadvocacia.com.br";
  const adminPasswordHash = await bcrypt.hash("Luciano@123", 10);

  const tenant = await prisma.tenant.upsert({
    where: { slug: "salba" },
    update: {
      name: "Salba Advocacia",
      razaoSocial: "Salba Advocacia Ltda",
      documento: "12.345.678/0001-90",
      email: "contato@salbaadvocacia.com.br",
      telefone: "(11) 3456-7890",
      status: "ACTIVE",
      domain: "salbaadvocacia.com.br",
      isTestEnvironment: false,
    },
    create: {
      slug: "salba",
      name: "Salba Advocacia",
      razaoSocial: "Salba Advocacia Ltda",
      documento: "12.345.678/0001-90",
      email: "contato@salbaadvocacia.com.br",
      telefone: "(11) 3456-7890",
      status: "ACTIVE",
      domain: "salbaadvocacia.com.br",
      isTestEnvironment: false,
    },
  });

  await cleanupLegacySalbaData(prisma, tenant.id, adminEmail);

  await prisma.tenantBranding.upsert({
    where: { tenantId: tenant.id },
    update: {
      primaryColor: "#1E40AF",
      secondaryColor: "#3B82F6",
      accentColor: "#F59E0B",
      emailFromName: "Salba Advocacia",
      emailFromAddress: "noreply@salbaadvocacia.com.br",
      customDomainText: "Portal Salba Advocacia",
    },
    create: {
      tenantId: tenant.id,
      primaryColor: "#1E40AF",
      secondaryColor: "#3B82F6",
      accentColor: "#F59E0B",
      emailFromName: "Salba Advocacia",
      emailFromAddress: "noreply@salbaadvocacia.com.br",
      customDomainText: "Portal Salba Advocacia",
    },
  });

  await prisma.tenantEndereco.upsert({
    where: {
      tenantId_apelido: {
        tenantId: tenant.id,
        apelido: "Matriz",
      },
    },
    update: {
      tipo: "ESCRITORIO",
      principal: true,
      logradouro: "Av. Paulista",
      numero: "1000",
      complemento: "Conjunto 501",
      bairro: "Bela Vista",
      cidade: "São Paulo",
      estado: "SP",
      cep: "01310-100",
      pais: "Brasil",
      telefone: "(11) 3456-7890",
    },
    create: {
      tenantId: tenant.id,
      apelido: "Matriz",
      tipo: "ESCRITORIO",
      principal: true,
      logradouro: "Av. Paulista",
      numero: "1000",
      complemento: "Conjunto 501",
      bairro: "Bela Vista",
      cidade: "São Paulo",
      estado: "SP",
      cep: "01310-100",
      pais: "Brasil",
      telefone: "(11) 3456-7890",
    },
  });

  const admin = await prisma.usuario.upsert({
    where: {
      email_tenantId: {
        email: adminEmail,
        tenantId: tenant.id,
      },
    },
    update: {
      passwordHash: adminPasswordHash,
      firstName: "Luciano",
      lastName: "Salba",
      role: "ADMIN",
      active: true,
    },
    create: {
      tenantId: tenant.id,
      email: adminEmail,
      passwordHash: adminPasswordHash,
      firstName: "Luciano",
      lastName: "Salba",
      role: "ADMIN",
      active: true,
    },
  });

  await Promise.all([
    ensurePermission(prisma, tenant.id, admin.id, "CONFIGURACOES_ESCRITORIO"),
    ensurePermission(prisma, tenant.id, admin.id, "EQUIPE_GERENCIAR"),
    ensurePermission(prisma, tenant.id, admin.id, "FINANCEIRO_GERENCIAR"),
  ]);

  console.log("✅ Tenant Salba pronto (somente admin)");
  console.log("👑 ADMIN: luciano@salbaadvocacia.com.br / Luciano@123");

  return tenant;
}

module.exports = { seedSalbaAdvocacia };
