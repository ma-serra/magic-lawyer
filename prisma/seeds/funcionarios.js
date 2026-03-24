const bcrypt = require("bcryptjs");

const DEFAULT_PASSWORD = "Funcionario@123";

async function ensureCargo(prisma, tenantId, { nome, descricao, nivel }) {
  const existing = await prisma.cargo.findFirst({
    where: { tenantId, nome },
  });

  if (existing) {
    return existing;
  }

  return prisma.cargo.create({
    data: {
      tenantId,
      nome,
      descricao,
      nivel: nivel ?? 2,
      ativo: true,
    },
  });
}

async function ensureUsuarioFuncionario(prisma, tenantId, data) {
  const existing = await prisma.usuario.findFirst({
    where: {
      tenantId,
      email: data.email,
    },
  });

  if (existing) {
    return prisma.usuario.update({
      where: { id: existing.id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        role: data.role,
        active: true,
      },
    });
  }

  const passwordHash = await bcrypt.hash(data.password || DEFAULT_PASSWORD, 10);

  return prisma.usuario.create({
    data: {
      tenantId,
      email: data.email,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      role: data.role,
      active: true,
      createdById: data.createdById || null,
    },
  });
}

async function upsertFuncionarioPerfil(prisma, Prisma, usuario, cargo, perfil) {
  return prisma.funcionarioPerfil.upsert({
    where: { usuarioId: usuario.id },
    update: {
      tenantId: usuario.tenantId,
      cargoPrincipalId: cargo?.id || null,
      ...perfil,
      salarioBase: perfil.salarioBase ? new Prisma.Decimal(perfil.salarioBase) : null,
    },
    create: {
      tenantId: usuario.tenantId,
      usuarioId: usuario.id,
      cargoPrincipalId: cargo?.id || null,
      ...perfil,
      salarioBase: perfil.salarioBase ? new Prisma.Decimal(perfil.salarioBase) : null,
    },
  });
}

async function replaceBeneficios(prisma, Prisma, funcionarioPerfil, beneficios = []) {
  await prisma.funcionarioBeneficio.deleteMany({
    where: {
      funcionarioId: funcionarioPerfil.id,
    },
  });

  if (!beneficios.length) {
    return;
  }

  await prisma.funcionarioBeneficio.createMany({
    data: beneficios.map((beneficio) => ({
      tenantId: funcionarioPerfil.tenantId,
      funcionarioId: funcionarioPerfil.id,
      tipo: beneficio.tipo,
      status: beneficio.status || "ATIVO",
      nome: beneficio.nome || null,
      valorBase: beneficio.valorBase ? new Prisma.Decimal(beneficio.valorBase) : null,
      contribuicaoEmpresa: beneficio.contribuicaoEmpresa ? new Prisma.Decimal(beneficio.contribuicaoEmpresa) : null,
      contribuicaoFuncionario: beneficio.contribuicaoFuncionario ? new Prisma.Decimal(beneficio.contribuicaoFuncionario) : null,
      dataInicio: beneficio.dataInicio || null,
      dataFim: beneficio.dataFim || null,
      observacoes: beneficio.observacoes || null,
    })),
  });
}

async function replaceDocumentos(prisma, funcionarioPerfil, documentos = []) {
  await prisma.funcionarioDocumento.deleteMany({
    where: {
      funcionarioId: funcionarioPerfil.id,
    },
  });

  if (!documentos.length) {
    return;
  }

  await prisma.funcionarioDocumento.createMany({
    data: documentos.map((documento) => ({
      tenantId: funcionarioPerfil.tenantId,
      funcionarioId: funcionarioPerfil.id,
      tipo: documento.tipo,
      titulo: documento.titulo,
      arquivoUrl: documento.arquivoUrl || null,
      emissao: documento.emissao || null,
      validade: documento.validade || null,
      numero: documento.numero || null,
      observacoes: documento.observacoes || null,
    })),
  });
}

async function linkCargo(prisma, usuario, cargo) {
  if (!cargo) return;

  const existing = await prisma.usuarioCargo.findFirst({
    where: {
      tenantId: usuario.tenantId,
      usuarioId: usuario.id,
      cargoId: cargo.id,
      ativo: true,
    },
  });

  if (existing) {
    return;
  }

  // Inativar vínculos anteriores antes de criar o principal
  await prisma.usuarioCargo.updateMany({
    where: {
      tenantId: usuario.tenantId,
      usuarioId: usuario.id,
      ativo: true,
    },
    data: {
      ativo: false,
      dataFim: new Date(),
    },
  });

  await prisma.usuarioCargo.create({
    data: {
      tenantId: usuario.tenantId,
      usuarioId: usuario.id,
      cargoId: cargo.id,
      ativo: true,
      dataInicio: new Date(),
    },
  });
}

async function seedFuncionarios(prisma, Prisma) {
  console.log("   → Criando colaboradores de exemplo");

  const tenantMap = {};

  const tenants = await prisma.tenant.findMany({
    where: {
      slug: {
        in: ["sandra"],
      },
    },
  });

  tenants.forEach((tenant) => {
    tenantMap[tenant.slug] = tenant;
  });

  if (!tenantMap.sandra) {
    console.warn("⚠️ Tenant sandra não encontrado – pulando criação de Jaqueline.");
  }

  const funcionariosPorTenant = [
    {
      slug: "sandra",
      colaboradores: [
        {
          email: "jaqueline.souza@sandraadv.br",
          firstName: "Jaqueline",
          lastName: "Souza",
          phone: "+55 11 94000-1122",
          role: "SECRETARIA",
          cargo: {
            nome: "Secretária Executiva",
            descricao: "Responsável pela agenda e comunicação com clientes.",
            nivel: 2,
          },
          perfil: {
            status: "ATIVO",
            tipoContrato: "CLT",
            dataAdmissao: new Date("2022-03-01"),
            numeroCtps: "0123456",
            serieCtps: "SP-09",
            orgaoExpedidorCtps: "MTE/SP",
            pis: "123.4567.89-0",
            salarioBase: "3200.00",
            cargaHorariaSemanal: 40,
            possuiValeTransporte: true,
            possuiValeRefeicao: true,
            possuiPlanoSaude: true,
            observacoes: "Secretária dedicada da Dra. Sandra, cuida da recepção e das pautas.",
          },
          beneficios: [
            {
              tipo: "VALE_REFEICAO",
              nome: "VR Ticket",
              valorBase: "680.00",
            },
            {
              tipo: "PLANO_SAUDE",
              nome: "Plano Saúde Premium",
              observacoes: "Amil Empresarial",
            },
          ],
          documentos: [
            {
              tipo: "CONTRATO_TRABALHO",
              titulo: "Contrato CLT Jaqueline Souza",
              numero: "CTA-2022-03",
              emissao: new Date("2022-03-01"),
            },
            {
              tipo: "CARTEIRA_TRABALHO",
              titulo: "CTPS Digital Jaqueline Souza",
              numero: "0123456-SP",
            },
          ],
        },
      ],
    },
  ];

  for (const tenantData of funcionariosPorTenant) {
    const tenant = tenantMap[tenantData.slug];
    if (!tenant) continue;

    for (const colaborador of tenantData.colaboradores) {
      const cargo = await ensureCargo(prisma, tenant.id, colaborador.cargo);
      const usuario = await ensureUsuarioFuncionario(prisma, tenant.id, colaborador);

      await linkCargo(prisma, usuario, cargo);

      const perfil = await upsertFuncionarioPerfil(prisma, Prisma, usuario, cargo, colaborador.perfil);
      await replaceBeneficios(prisma, Prisma, perfil, colaborador.beneficios);
      await replaceDocumentos(prisma, perfil, colaborador.documentos);
    }
  }

  console.log("      Funcionários de exemplo prontos.");
}

module.exports = { seedFuncionarios };
