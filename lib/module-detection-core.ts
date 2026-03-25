import { promises as fs } from "fs";
import { createHash } from "crypto";
import path from "path";

import prisma from "../app/lib/prisma";

import logger from "./logger";

export type DetectedModule = {
  slug: string;
  nome: string;
  descricao: string;
  categoria: string;
  icone: string;
  ordem: number;
  ativo: boolean;
  rotas: string[];
};

export type ScanProtectedModulesResult = {
  detectedModules: DetectedModule[];
  moduleSlugs: string[];
  filesystemHash: string;
  totalRoutes: number;
};

export type AutoDetectModulesCoreResult = {
  detectedModules: DetectedModule[];
  created: number;
  updated: number;
  removed: number;
  total: number;
  totalRoutes: number;
  moduleSlugs: string[];
  filesystemHash: string;
};

const PROTECTED_FOLDER = path.join(process.cwd(), "app", "(protected)");

const MODULE_CATEGORIES: Record<string, string> = {
  // Core
  dashboard: "Core",
  processos: "Core",
  clientes: "Core",
  advogados: "Core",
  equipe: "Core",
  relatorios: "Core",

  // Produtividade
  agenda: "Produtividade",
  documentos: "Produtividade",
  tarefas: "Produtividade",
  diligencias: "Produtividade",
  andamentos: "Produtividade",

  // Financeiro
  financeiro: "Financeiro",
  contratos: "Financeiro",
  honorarios: "Financeiro",
  parcelas: "Financeiro",
  "dados-bancarios": "Financeiro",

  // Documentos
  peticoes: "Documentos",
  procuracoes: "Documentos",
  "modelos-peticao": "Documentos",
  "modelos-procuracao": "Documentos",

  // Jurídico
  causas: "Jurídico",
  juizes: "Jurídico",
  "regimes-prazo": "Jurídico",

  // Sistema
  configuracoes: "Sistema",
  usuario: "Sistema",
  help: "Sistema",

  // Teste
  "teste-modulo": "Sistema",
};

const CATEGORY_ICONS: Record<string, string> = {
  Core: "Shield",
  Produtividade: "Zap",
  Financeiro: "DollarSign",
  Documentos: "FileText",
  Jurídico: "Scale",
  Sistema: "Settings",
};

const CATEGORY_COLORS: Record<string, string> = {
  Core: "#3B82F6",
  Produtividade: "#10B981",
  Financeiro: "#F59E0B",
  Documentos: "#8B5CF6",
  Jurídico: "#EF4444",
  Sistema: "#6B7280",
};

const MODULE_DESCRIPTIONS: Record<string, string> = {
  dashboard: "Painel principal com visão geral do escritório",
  processos: "Gestão completa de processos jurídicos",
  clientes: "Cadastro e gestão de clientes",
  advogados: "Gestão de advogados e profissionais",
  equipe: "Gestão de equipe e permissões",
  agenda: "Calendário e gestão de compromissos",
  documentos: "Upload e gestão de documentos",
  tarefas: "Sistema de tarefas e lembretes",
  diligencias: "Gestão de diligências processuais",
  andamentos: "Acompanhamento de andamentos",
  financeiro: "Gestão financeira completa",
  contratos: "Criação e gestão de contratos",
  honorarios: "Cálculo e controle de honorários",
  parcelas: "Sistema de parcelas e pagamentos",
  "dados-bancarios": "Gestão de dados bancários",
  peticoes: "Criação e gestão de petições",
  procuracoes: "Gestão de procurações",
  "modelos-peticao": "Modelos de petições",
  "modelos-procuracao": "Modelos de procurações",
  causas: "Tipos de causas e áreas do direito",
  juizes: "Base de dados de juízes",
  "regimes-prazo": "Regimes de prazo processual",
  relatorios: "Relatórios e exportações",
  configuracoes: "Configurações do escritório",
  usuario: "Perfil e configurações do usuário",
  help: "Central de ajuda e suporte",
  "teste-modulo": "Módulo de teste para validação do sistema",
};

const CATEGORY_ORDER: Record<string, number> = {
  Core: 1,
  Produtividade: 2,
  Financeiro: 3,
  Documentos: 4,
  Jurídico: 5,
  Sistema: 6,
};

function formatModuleName(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function toCategorySlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function ensureDetectedCategory(nome: string) {
  const slug = toCategorySlug(nome);
  const icone = CATEGORY_ICONS[nome] || "Puzzle";
  const cor = CATEGORY_COLORS[nome] || "#6B7280";
  const ordem = CATEGORY_ORDER[nome] || 99;

  const existing = await prisma.moduloCategoria.findFirst({
    where: {
      OR: [{ slug }, { nome: { equals: nome, mode: "insensitive" } }],
    },
    select: { id: true },
  });

  if (existing) {
    return existing;
  }

  return prisma.moduloCategoria.create({
    data: {
      slug,
      nome,
      icone,
      cor,
      ordem,
      ativo: true,
    },
    select: { id: true },
  });
}

function getModuleRoutes(slug: string): string[] {
  return [`/${slug}`];
}

export async function scanProtectedModules(): Promise<ScanProtectedModulesResult> {
  let moduleDirs: string[] = [];

  try {
    const items = await fs.readdir(PROTECTED_FOLDER, { withFileTypes: true });

    moduleDirs = items
      .filter((item) => item.isDirectory())
      .map((item) => item.name)
      .filter((name) => !name.startsWith(".") && name !== "layout.tsx")
      .sort();
  } catch (error) {
    logger.warn(
      "Filesystem não acessível, usando lista estática de módulos:",
      error instanceof Error ? error.message : String(error),
    );

    moduleDirs = [
      "dashboard",
      "processos",
      "clientes",
      "advogados",
      "equipe",
      "agenda",
      "documentos",
      "tarefas",
      "diligencias",
      "andamentos",
      "financeiro",
      "contratos",
      "honorarios",
      "parcelas",
      "dados-bancarios",
      "peticoes",
      "procuracoes",
      "modelos-peticao",
      "modelos-procuracao",
      "causas",
      "juizes",
      "regimes-prazo",
      "relatorios",
      "configuracoes",
      "usuario",
      "help",
    ].sort();
  }

  const detectedModules: DetectedModule[] = moduleDirs.map((slug, index) => {
    const categoria = MODULE_CATEGORIES[slug] || "Sistema";
    const icone = CATEGORY_ICONS[categoria] || "PuzzleIcon";
    const descricao =
      MODULE_DESCRIPTIONS[slug] || `Módulo ${formatModuleName(slug)}`;
    const rotas = getModuleRoutes(slug);

    return {
      slug,
      nome: formatModuleName(slug),
      descricao,
      categoria,
      icone,
      ordem: (CATEGORY_ORDER[categoria] || 99) * 100 + index,
      ativo: true,
      rotas,
    };
  });

  const hashSource = JSON.stringify(
    detectedModules.map((module) => ({
      slug: module.slug,
      rotas: module.rotas,
    })),
  );

  const filesystemHash = createHash("sha256").update(hashSource).digest("hex");
  const totalRoutes = detectedModules.reduce(
    (acc, module) => acc + module.rotas.length,
    0,
  );

  return {
    detectedModules,
    moduleSlugs: moduleDirs,
    filesystemHash,
    totalRoutes,
  };
}

async function syncModuleRoutes(slug: string, routes: string[]): Promise<void> {
  try {
    const modulo = await prisma.modulo.findUnique({
      where: { slug },
    });

    if (!modulo) {
      return;
    }

    const existingRoutes = await prisma.moduloRota.findMany({
      where: { moduloId: modulo.id },
    });

    const existingRouteByPath = new Map(
      existingRoutes.map((route) => [route.rota, route]),
    );
    const existingRoutePaths = new Set(existingRoutes.map((r) => r.rota));
    const newRoutePaths = new Set(routes);

    const routesToAdd = routes.filter(
      (route) => !existingRoutePaths.has(route),
    );

    for (const route of routesToAdd) {
      await prisma.moduloRota.create({
        data: {
          moduloId: modulo.id,
          rota: route,
          descricao: `Rota para ${slug}`,
          ativo: true,
        },
      });
    }

    for (const route of routes) {
      const existingRoute = existingRouteByPath.get(route);
      if (!existingRoute) {
        continue;
      }

      if (!existingRoute.ativo || existingRoute.descricao !== `Rota para ${slug}`) {
        await prisma.moduloRota.update({
          where: { id: existingRoute.id },
          data: {
            ativo: true,
            descricao: `Rota para ${slug}`,
          },
        });
      }
    }

    const routesToRemove = existingRoutes.filter(
      (r) => !newRoutePaths.has(r.rota),
    );

    for (const route of routesToRemove) {
      if (!route.ativo) {
        continue;
      }

      await prisma.moduloRota.update({
        where: { id: route.id },
        data: {
          ativo: false,
        },
      });
    }
  } catch (error) {
    logger.error(`Erro ao sincronizar rotas do módulo ${slug}:`, error);
  }
}

export async function autoDetectModulesCore(): Promise<AutoDetectModulesCoreResult> {
  logger.info("Iniciando detecção automática de módulos (core)");

  const { detectedModules, moduleSlugs, filesystemHash, totalRoutes } =
    await scanProtectedModules();

  logger.info(`Módulos detectados no código: ${moduleSlugs.join(", ")}`);

  const existingModules = await prisma.modulo.findMany({
    select: { id: true, slug: true, categoriaId: true, ativo: true },
  });

  const detectedSlugs = new Set(detectedModules.map((m) => m.slug));

  let created = 0;
  let updated = 0;
  let removed = 0;

  for (const module of detectedModules) {
    const existing = existingModules.find((m) => m.slug === module.slug);
    const categoria = await ensureDetectedCategory(module.categoria);

    if (existing) {
      await prisma.modulo.update({
        where: { id: existing.id },
        data: {
          nome: module.nome,
          descricao: module.descricao,
          categoriaId: existing.categoriaId || categoria?.id || null,
          icone: module.icone,
          ordem: module.ordem,
          ativo: module.ativo,
        },
      });
      updated++;
    } else {
      await prisma.modulo.create({
        data: {
          slug: module.slug,
          nome: module.nome,
          descricao: module.descricao,
          categoriaId: categoria?.id || null,
          icone: module.icone,
          ordem: module.ordem,
          ativo: module.ativo,
        },
      });
      created++;
    }

    await syncModuleRoutes(module.slug, module.rotas);
  }

  const modulesToRemove = existingModules.filter(
    (m) => m.ativo && !detectedSlugs.has(m.slug),
  );

  for (const module of modulesToRemove) {
    const planUsage = await prisma.planoModulo.count({
      where: { moduloId: module.id },
    });

    if (planUsage === 0) {
      await prisma.moduloRota.updateMany({
        where: {
          moduloId: module.id,
          ativo: true,
        },
        data: {
          ativo: false,
        },
      });

      await prisma.modulo.update({
        where: { id: module.id },
        data: {
          ativo: false,
        },
      });

      removed++;
      logger.info(
        `Módulo inativado: ${module.slug} (não existe mais no código)`,
      );
    } else {
      logger.warn(
        `Módulo ${module.slug} não pode ser removido pois está sendo usado por ${planUsage} plano(s)`,
      );
    }
  }

  await prisma.moduleDetectionLog.create({
    data: {
      detectedAt: new Date(),
      totalModules: detectedModules.length,
      totalRoutes,
      created,
      updated,
      removed,
      filesystemHash,
    },
  });

  try {
    const { clearModuleMapCache } = await import("../app/lib/module-map");

    clearModuleMapCache();
    logger.info("Cache de module-map limpo automaticamente");
  } catch (error) {
    logger.warn(
      "Erro ao limpar cache do module-map:",
      error instanceof Error ? error.message : String(error),
    );
  }

  return {
    detectedModules,
    created,
    updated,
    removed,
    total: detectedModules.length,
    totalRoutes,
    moduleSlugs,
    filesystemHash,
  };
}
