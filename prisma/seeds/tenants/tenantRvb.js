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

async function seedTenantRvb(prisma) {
  console.log("🌱 Criando tenant RVB...");

  const tenant = await prisma.tenant.upsert({
    where: { slug: "rvb" },
    update: {
      name: "RVB Advocacia",
      razaoSocial: "RVB Advocacia e Consultoria Ltda",
      documento: "19.876.543/0001-21",
      email: "contato@rvbadvocacia.com.br",
      telefone: "(71) 3500-1100",
      status: "ACTIVE",
      isTestEnvironment: false,
    },
    create: {
      slug: "rvb",
      name: "RVB Advocacia",
      razaoSocial: "RVB Advocacia e Consultoria Ltda",
      documento: "19.876.543/0001-21",
      email: "contato@rvbadvocacia.com.br",
      telefone: "(71) 3500-1100",
      status: "ACTIVE",
      isTestEnvironment: false,
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
      logradouro: "Av. Tancredo Neves",
      numero: "274",
      complemento: "Sala 1203",
      bairro: "Caminho das Árvores",
      cidade: "Salvador",
      estado: "BA",
      cep: "41820-020",
      pais: "Brasil",
      telefone: "(71) 3500-1100",
    },
    create: {
      tenantId: tenant.id,
      apelido: "Matriz",
      tipo: "ESCRITORIO",
      principal: true,
      logradouro: "Av. Tancredo Neves",
      numero: "274",
      complemento: "Sala 1203",
      bairro: "Caminho das Árvores",
      cidade: "Salvador",
      estado: "BA",
      cep: "41820-020",
      pais: "Brasil",
      telefone: "(71) 3500-1100",
    },
  });

  const passwordHash = await bcrypt.hash("Rvb@123", 10);

  const admin = await prisma.usuario.upsert({
    where: {
      email_tenantId: {
        email: "admin@rvb.adv.br",
        tenantId: tenant.id,
      },
    },
    update: {
      passwordHash,
      firstName: "Admin",
      lastName: "RVB",
      role: "ADMIN",
      active: true,
    },
    create: {
      tenantId: tenant.id,
      email: "admin@rvb.adv.br",
      passwordHash,
      firstName: "Admin",
      lastName: "RVB",
      role: "ADMIN",
      active: true,
    },
  });

  await Promise.all([
    ensurePermission(prisma, tenant.id, admin.id, "CONFIGURACOES_ESCRITORIO"),
    ensurePermission(prisma, tenant.id, admin.id, "EQUIPE_GERENCIAR"),
    ensurePermission(prisma, tenant.id, admin.id, "FINANCEIRO_GERENCIAR"),
  ]);

  console.log("✅ Tenant RVB pronto");
  console.log("👑 ADMIN: admin@rvb.adv.br / Rvb@123");

  return tenant;
}

module.exports = { seedTenantRvb };
