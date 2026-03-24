const bcrypt = require("bcryptjs");

async function seedTenantInternalTest(prisma) {
  console.log("🧪 Criando tenant interno de testes...");

  const tenant = await prisma.tenant.upsert({
    where: { slug: "ml-test" },
    update: {
      name: "Magic Lawyer - Tenant Interno de Testes",
      status: "ACTIVE",
      isTestEnvironment: true,
      email: "interno-testes@magiclawyer.com.br",
      telefone: "(71) 3999-9999",
    },
    create: {
      slug: "ml-test",
      name: "Magic Lawyer - Tenant Interno de Testes",
      status: "ACTIVE",
      isTestEnvironment: true,
      email: "interno-testes@magiclawyer.com.br",
      telefone: "(71) 3999-9999",
    },
  });

  const passwordHash = await bcrypt.hash("Teste@123", 10);

  await prisma.usuario.upsert({
    where: {
      email_tenantId: {
        email: "admin.testes@magiclawyer.com.br",
        tenantId: tenant.id,
      },
    },
    update: {
      passwordHash,
      firstName: "Admin",
      lastName: "Testes",
      role: "ADMIN",
      active: true,
    },
    create: {
      tenantId: tenant.id,
      email: "admin.testes@magiclawyer.com.br",
      passwordHash,
      firstName: "Admin",
      lastName: "Testes",
      role: "ADMIN",
      active: true,
    },
  });

  console.log("✅ Tenant interno de testes pronto (isTestEnvironment=true)");
  return tenant;
}

module.exports = { seedTenantInternalTest };
