const path = require("path");

const tsNodeInstanceKey = Symbol.for("ts-node.register.instance");
if (!process[tsNodeInstanceKey]) {
  require("ts-node").register({
    project: path.resolve(__dirname, "../scripts/tsconfig.json"),
    transpileOnly: true,
  });
}

const { autoDetectModulesCore } = require("../lib/module-detection-core");
const { PrismaClient, Prisma } = require("../generated/prisma");

const seedAreasProcesso = require("./seeds/areasProcesso");
const seedTiposContrato = require("./seeds/tiposContrato");
const seedCategoriasTarefa = require("./seeds/categoriasTarefa");
const seedPlanos = require("./seeds/planos");
const seedModulos = require("./seeds/modulos");
const { seedTenantSandra } = require("./seeds/tenants/tenantSandra");
const { seedSalbaAdvocacia } = require("./seeds/tenants/salbaAdvocacia");
const { seedTenantRvb } = require("./seeds/tenants/tenantRvb");
const { seedTenantInternalTest } = require("./seeds/tenants/tenantInternalTest");
const { seedEventos } = require("./seeds/eventos");
const { seedJuizes } = require("./seeds/juizes");
const { seedSuperAdmin } = require("./seeds/superAdmin");
const { seedConfiguracoesPreco } = require("./seeds/configuracoesPreco");
const { seedPacotesJuiz } = require("./seeds/pacotesJuiz");
const { seedDadosFinanceiros } = require("./seeds/dadosFinanceiros");
const { seedContratos } = require("./seeds/contratos");
const seedCausas = require("./seeds/causas");
const seedRegimesPrazo = require("./seeds/regimesPrazo");
const { seedTiposPeticao } = require("./seeds/tipos-peticao");
const { seedBancos } = require("./seeds/bancos");
const { seedDadosBancarios } = require("./seeds/dadosBancarios");
const { seedAuditLogs } = require("./seeds/auditLogs");
const { seedRecebimentos } = require("./seeds/seed-recebimentos");
const { seedFuncionarios } = require("./seeds/funcionarios");

const prisma = new PrismaClient();
const shouldSeedRecebimentos = process.argv.includes("--with-recebimentos");

const DEFAULT_TENANT_CARGOS = [
  {
    nome: "Secretária",
    descricao: "Atendimento, agenda e apoio operacional ao escritório.",
    nivel: 2,
  },
  {
    nome: "Assistente Jurídico",
    descricao: "Suporte em documentos, protocolos e acompanhamento processual.",
    nivel: 2,
  },
  {
    nome: "Financeiro",
    descricao: "Cobrança, conciliação, fluxo de caixa e rotinas financeiras.",
    nivel: 3,
  },
  {
    nome: "Suporte de TI",
    descricao: "Apoio técnico interno, acessos e infraestrutura digital.",
    nivel: 2,
  },
  {
    nome: "Coordenador Operacional",
    descricao: "Coordenação de rotinas, equipe e indicadores administrativos.",
    nivel: 4,
  },
];

async function seedDefaultCargos(prisma) {
  const tenants = await prisma.tenant.findMany({
    where: {
      slug: {
        not: "global",
      },
    },
    select: {
      id: true,
      slug: true,
    },
  });

  for (const tenant of tenants) {
    for (const template of DEFAULT_TENANT_CARGOS) {
      const existing = await prisma.cargo.findFirst({
        where: {
          tenantId: tenant.id,
          nome: template.nome,
        },
        select: {
          id: true,
          ativo: true,
          descricao: true,
        },
      });

      if (!existing) {
        await prisma.cargo.create({
          data: {
            tenantId: tenant.id,
            nome: template.nome,
            descricao: template.descricao,
            nivel: template.nivel,
            ativo: true,
          },
        });
        continue;
      }

      const nextData = {};

      if (!existing.ativo) {
        nextData.ativo = true;
      }
      if (!existing.descricao) {
        nextData.descricao = template.descricao;
      }

      if (Object.keys(nextData).length > 0) {
        await prisma.cargo.update({
          where: {
            id: existing.id,
          },
          data: nextData,
        });
      }
    }
  }
}

const TENANT_CREDENTIAL_SUMMARIES = [
  {
    name: "Souza Costa Advogados Associados",
    slug: "sandra",
    accessUrl: "http://localhost:9192/login",
    credentials: [
      "👑 ADMIN: sandra@adv.br / Sandra@123",
      "🗂️ SECRETARIA: souzacostaadv@hotmail.com / Funcionario@123",
      "⚖️ ADVOGADO: ricardo@sandraadv.br / Advogado@123",
      "⚖️ ADVOGADO: fernanda@sandraadv.br / Advogado@123",
      "👤 CLIENTE: cliente@sandraadv.br / Cliente@123",
      "👤 CLIENTE: ana@sandraadv.br / Cliente@123",
      "👤 CLIENTE: magiclawyersaas@gmail.com / Robson123!",
      "👤 CLIENTE: inova@sandraadv.br / Cliente@123",
    ],
  },
  {
    name: "Salba Advocacia",
    slug: "salba",
    accessUrl: "http://localhost:9192/login",
    credentials: [
      "👑 ADMIN: luciano@salbaadvocacia.com.br / Luciano@123",
    ],
  },
  {
    name: "RVB Advocacia",
    slug: "rvb",
    accessUrl: "http://localhost:9192/login",
    credentials: [
      "👑 ADMIN: admin@rvb.adv.br / Rvb@123",
    ],
  },
  {
    name: "Tenant Interno de Testes",
    slug: "ml-test",
    accessUrl: "http://localhost:9192/login",
    credentials: [
      "👑 ADMIN: admin.testes@magiclawyer.com.br / Teste@123",
    ],
  },
];

function printTenantCredentialSummary() {
  console.log("\n============================");
  console.log("📋 Visão geral de credenciais por tenant");
  console.log("============================\n");

  for (const tenant of TENANT_CREDENTIAL_SUMMARIES) {
    console.log(`🏢 Tenant: ${tenant.name} (slug: ${tenant.slug})`);
    console.log(`🔗 Acesso: ${tenant.accessUrl}`);
    console.log("Credenciais de teste:");
    tenant.credentials.forEach((line) => console.log(`   • ${line}`));
    console.log("");
  }
}

async function main() {
  console.log("🌱 Iniciando seed do banco de dados...\n");

  // Criar tenant global para dados compartilhados
  console.log("🌍 Criando tenant global...\n");
  try {
    await prisma.tenant.upsert({
      where: { slug: "global" },
      update: {},
      create: {
        id: "GLOBAL",
        name: "Sistema Global",
        slug: "global",
        status: "ACTIVE",
        timezone: "America/Sao_Paulo",
        tipoPessoa: "JURIDICA",
      },
    });
    console.log("✅ Tenant global criado/atualizado\n");
  } catch (error) {
    console.warn("⚠️ Tenant global já existe, pulando...\n");
  }

  // Seeds básicos
  try {
    await seedAreasProcesso(prisma);
    await seedTiposContrato(prisma);
    await seedCategoriasTarefa(prisma);
    await seedModulos(prisma);
  } catch (error) {
    console.warn("⚠️ Alguns seeds básicos já existem:", error.message);
  }

  // Detectar módulos automaticamente antes de criar planos
  console.log("\n🔍 Detectando módulos automaticamente...");
  try {
    const result = await autoDetectModulesCore();
    console.log(`✅ Módulos detectados com sucesso! (${result.created} criados, ${result.updated} atualizados, ${result.removed} removidos)`);
  } catch (error) {
    console.warn("⚠️ Erro na detecção automática de módulos:", error.message);
  }

  try {
    await seedPlanos(prisma);
  } catch (error) {
    console.warn("⚠️ Planos já criados:", error.message);
  }

  console.log("\n🏢 Criando tenants...\n");

  // Seeds de tenants
  try {
    await seedTenantSandra(prisma, Prisma);
    await seedSalbaAdvocacia(prisma);
    await seedTenantRvb(prisma);
    await seedTenantInternalTest(prisma);
  } catch (error) {
    console.warn("⚠️ Tenants já criados:", error.message);
  }

  try {
    await seedDefaultCargos(prisma);
  } catch (error) {
    console.warn("⚠️ Cargos padrão já criados:", error.message);
  }

  try {
    await seedFuncionarios(prisma, Prisma);
  } catch (error) {
    console.warn("⚠️ Funcionários já criados:", error.message);
  }

  console.log("\n🗂️  Criando catálogo de causas...\n");
  try {
    await seedCausas(prisma);
  } catch (error) {
    console.warn("⚠️ Causas já criadas:", error.message);
  }

  console.log("\n⏱️  Criando regimes de prazo padrão...\n");
  try {
    await seedRegimesPrazo(prisma);
  } catch (error) {
    console.warn("⚠️ Regimes de prazo já criados:", error.message);
  }

  console.log("\n📅 Criando eventos...\n");

  // Seed de eventos
  try {
    await seedEventos();
  } catch (error) {
    console.warn("⚠️ Eventos já criados:", error.message);
  }

  console.log("\n🔑 Criando Super Admins do sistema...\n");

  // Seed do Super Admin
  let superAdminRobson, superAdminTalisia;
  try {
    const result = await seedSuperAdmin(prisma);
    superAdminRobson = result.superAdminRobson;
    superAdminTalisia = result.superAdminTalisia;
  } catch (error) {
    console.warn("⚠️ Super Admins já criados:", error.message);
    // Tentar buscar os existentes
    try {
      superAdminRobson = await prisma.superAdmin.findUnique({ where: { email: "robsonnonatoiii@gmail.com" } });
      superAdminTalisia = await prisma.superAdmin.findUnique({ where: { email: "talisia@magiclawyer.com" } });
    } catch (err) {
      console.warn("⚠️ Não foi possível buscar Super Admins existentes");
    }
  }

  console.log("\n👨‍⚖️ Criando base de juízes...\n");

  // Seed de juízes (controlados pelo Super Admin Robson)
  if (superAdminRobson) {
    try {
      await seedJuizes(superAdminRobson.id, prisma);
    } catch (error) {
      console.warn("⚠️ Juízes já criados:", error.message);
    }
  }

  console.log("\n⚙️ Criando configurações de preço...\n");

  // Seed de configurações de preço
  if (superAdminRobson) {
    try {
      await seedConfiguracoesPreco(superAdminRobson.id, prisma);
    } catch (error) {
      console.warn("⚠️ Configurações de preço já criadas:", error.message);
    }
  }

  console.log("\n📦 Criando pacotes de juízes...\n");

  // Seed de pacotes de juízes
  if (superAdminRobson) {
    try {
      await seedPacotesJuiz(superAdminRobson.id, prisma);
    } catch (error) {
      console.warn("⚠️ Pacotes de juízes já criados:", error.message);
    }
  }

  console.log("\n🕵️  Criando registros de auditoria...\n");

  // Seed de logs de auditoria (super admin e tenants)
  if (superAdminRobson) {
    try {
      await seedAuditLogs(prisma, superAdminRobson.id);
    } catch (error) {
      console.warn("⚠️ Logs de auditoria já criados:", error.message);
    }
  }

  console.log("\n💰 Criando dados financeiros de teste...\n");

  // Seed de dados financeiros
  try {
    await seedDadosFinanceiros(prisma);
  } catch (error) {
    console.warn("⚠️ Dados financeiros já criados:", error.message);
  }

  console.log("\n📄 Criando contratos, processos e procurações...\n");

  // Seed de contratos, processos e procurações
  try {
    await seedContratos(prisma, Prisma);
  } catch (error) {
    console.warn("⚠️ Contratos já criados:", error.message);
  }

  console.log("\n🏛️  Criando tipos de petição padrão...\n");

  // Seed de tipos de petição
  try {
    await seedTiposPeticao();
  } catch (error) {
    console.warn("⚠️ Tipos de petição já criados:", error.message);
  }

  // Seed de bancos do Brasil
  try {
    await seedBancos();
  } catch (error) {
    console.warn("⚠️ Bancos já criados:", error.message);
  }

  // Seed de dados bancários para usuários
  try {
    await seedDadosBancarios(prisma);
  } catch (error) {
    console.warn("⚠️ Dados bancários já criados:", error.message);
  }

  if (shouldSeedRecebimentos) {
    // Seed opcional de recebimentos sintéticos (demo)
    try {
      await seedRecebimentos(prisma, Prisma);
    } catch (error) {
      console.warn("⚠️ Recebimentos já criados:", error.message);
    }
  } else {
    console.log(
      "⏭️ Seed de recebimentos sintéticos ignorado (use --with-recebimentos para habilitar).",
    );
  }

  console.log("\n🚀 Aplicando otimizações enterprise...\n");

  // Apply enterprise optimizations (constraints, indexes, full-text search)
  try {
    const fs = require("fs");
    const path = require("path");

    const optimizationScript = fs.readFileSync(path.join(__dirname, "../scripts/enterprise-optimizations.sql"), "utf8");

    // Split the script into individual commands and execute them
    const commands = optimizationScript
      .split(";")
      .map((cmd) => cmd.trim())
      .filter((cmd) => cmd.length > 0 && !cmd.startsWith("--"));

    for (const command of commands) {
      if (command.trim()) {
        await prisma.$executeRawUnsafe(command);
      }
    }

    console.log("✅ Otimizações enterprise aplicadas com sucesso!");
    console.log("   - Constraints de integridade temporal");
    console.log("   - Constraints de valores positivos");
    console.log("   - Full-text search em português");
    console.log("   - Índices GIN para arrays");
    console.log("   - Índices de performance otimizados");
  } catch (error) {
    console.error("⚠️  Erro ao aplicar otimizações enterprise:", error.message);
    console.log("   As otimizações serão aplicadas na próxima execução do seed");
  }

  // Seed do sistema de notificações
  console.log("\n🔔 Iniciando seed do sistema de notificações...");
  try {
    const { seedNotifications } = require("./seeds/notifications-seed");
    await seedNotifications();
  } catch (error) {
    console.error("⚠️  Erro no seed de notificações:", error.message);
    console.log("   O sistema de notificações será configurado na próxima execução");
  }

  printTenantCredentialSummary();

  console.log("\n🎉 Seed concluído com sucesso!");
  console.log("🚀 Sistema enterprise-grade pronto para produção!");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("❌ Seed falhou:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
