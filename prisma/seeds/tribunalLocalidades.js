const {
  TRIBUNAL_JUDICIAL_LOCATION_DEFAULTS,
} = require("../../app/lib/tribunais/judicial-location-defaults");

function normalizeText(value) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

async function seedTribunalLocalidades(prisma) {
  const tribunais = await prisma.tribunal.findMany({
    where: {
      deletedAt: null,
    },
    select: {
      id: true,
      sigla: true,
    },
  });

  const tribunalBySigla = new Map(
    tribunais
      .filter((tribunal) => normalizeText(tribunal.sigla))
      .map((tribunal) => [normalizeText(tribunal.sigla), tribunal]),
  );

  for (const defaults of TRIBUNAL_JUDICIAL_LOCATION_DEFAULTS) {
    const tribunal = tribunalBySigla.get(normalizeText(defaults.tribunalSigla));

    if (!tribunal) {
      continue;
    }

    const existingLocalidades = await prisma.tribunalLocalidade.findMany({
      where: {
        tribunalId: tribunal.id,
      },
      select: {
        id: true,
        slug: true,
        nome: true,
        sigla: true,
        tipo: true,
        ordem: true,
        ativo: true,
      },
    });

    const existingBySlug = new Map(
      existingLocalidades.map((item) => [item.slug, item]),
    );
    const missing = defaults.localidades.filter(
      (item) => !existingBySlug.has(item.slug),
    );

    if (missing.length > 0) {
      await prisma.tribunalLocalidade.createMany({
        data: missing.map((item) => ({
          tribunalId: tribunal.id,
          slug: item.slug,
          nome: item.nome,
          sigla: item.sigla ?? null,
          tipo: item.tipo ?? null,
          ordem: item.ordem ?? null,
          ativo: true,
        })),
        skipDuplicates: true,
      });
    }

    for (const item of defaults.localidades) {
      const existing = existingBySlug.get(item.slug);

      if (!existing) {
        continue;
      }

      const nextData = {};

      if (!existing.ativo) {
        nextData.ativo = true;
      }
      if (!existing.nome?.trim()) {
        nextData.nome = item.nome;
      }
      if (!existing.sigla?.trim() && item.sigla) {
        nextData.sigla = item.sigla;
      }
      if (!existing.tipo?.trim() && item.tipo) {
        nextData.tipo = item.tipo;
      }
      if (existing.ordem == null && item.ordem != null) {
        nextData.ordem = item.ordem;
      }

      if (Object.keys(nextData).length > 0) {
        await prisma.tribunalLocalidade.update({
          where: {
            id: existing.id,
          },
          data: nextData,
        });
      }
    }
  }
}

module.exports = seedTribunalLocalidades;
