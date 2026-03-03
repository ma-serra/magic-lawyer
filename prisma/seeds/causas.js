const DEFAULT_CAUSAS = [
  {
    nome: "Ameaça",
    codigoCnj: "000104",
    descricao: "Casos envolvendo ameaça ou coação",
  },
  {
    nome: "Danos Morais",
    codigoCnj: "000235",
    descricao: "Reparação de danos morais em esfera cível",
  },
  {
    nome: "Contratos de Honorários",
    codigoCnj: null,
    descricao: "Gestão e execução de contratos de honorários",
  },
];

module.exports = async function seedCausas(prisma) {
  const tenants = await prisma.tenant.findMany({
    where: {
      status: "ACTIVE",
    },
    select: { id: true },
  });

  for (const tenant of tenants) {
    for (const causa of DEFAULT_CAUSAS) {
      await prisma.causa.upsert({
        where: {
          tenantId_nome: {
            tenantId: tenant.id,
            nome: causa.nome,
          },
        },
        update: {
          codigoCnj: causa.codigoCnj,
          descricao: causa.descricao,
          ativo: true,
          isOficial: false,
        },
        create: {
          tenantId: tenant.id,
          nome: causa.nome,
          codigoCnj: causa.codigoCnj,
          descricao: causa.descricao,
          isOficial: false,
        },
      });
    }
  }
};
