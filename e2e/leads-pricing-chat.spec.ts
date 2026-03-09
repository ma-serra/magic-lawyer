import { expect, test, type Locator, type Page } from "@playwright/test";

import { loginAsUser } from "./helpers/auth";

const SUPER_ADMIN_EMAIL =
  process.env.TEST_SUPER_ADMIN_EMAIL || "robsonnonatoiii@gmail.com";
const SUPER_ADMIN_PASSWORD =
  process.env.TEST_SUPER_ADMIN_PASSWORD || "Robson123!";

const RUN_ID =
  process.env.E2E_LEADS_RUN_ID ||
  new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);

type LeadScenario = {
  key: string;
  nome: string;
  email: string;
  telefone: string;
  empresa: string;
  cargo: string;
  objetivo: string;
  tamanhoEquipe: string;
  horizonte: string;
  plano: string;
  mensagem: string;
  canal: "WhatsApp" | "E-mail" | "Ligação";
  prioridade: "Hoje" | "Esta semana" | "Sem urgência";
  faqLabels: string[];
  requestHumanHandoff: boolean;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const scenarios: LeadScenario[] = [
  {
    key: "solo-operacao-urgente",
    nome: `E2E Lead 01 Helena Dantas ${RUN_ID}`,
    email: `e2e.lead.01.${RUN_ID}@magiclawyer.local`,
    telefone: "(71) 99111-1001",
    empresa: "Dantas Advocacia Civel",
    cargo: "Sócia fundadora",
    objetivo: "Organizar processos e prazos",
    tamanhoEquipe: "Solo (1 pessoa)",
    horizonte: "Implantar ainda esta semana",
    plano: "Básico",
    mensagem:
      "Queremos iniciar a operação até 12/03/2026. Hoje perco tempo com prazo em planilha e preciso de proposta enxuta para escritório solo com foco em contencioso cível.",
    canal: "WhatsApp",
    prioridade: "Hoje",
    faqLabels: ["Tempo de implantação"],
    requestHumanHandoff: false,
  },
  {
    key: "time-pequeno-migracao",
    nome: `E2E Lead 02 Marcos Ribeiro ${RUN_ID}`,
    email: `e2e.lead.02.${RUN_ID}@magiclawyer.local`,
    telefone: "(11) 98888-2002",
    empresa: "Ribeiro e Vasconcelos Advogados",
    cargo: "Coordenador operacional",
    objetivo: "Padronizar operação da equipe",
    tamanhoEquipe: "Pequeno (2 a 5 pessoas)",
    horizonte: "Implantar no próximo mês",
    plano: "Pro",
    mensagem:
      "Estamos planejando migrar o contencioso e o atendimento até 01/04/2026. Precisamos entender onboarding, papéis da equipe e cronograma de virada sem parar a operação.",
    canal: "E-mail",
    prioridade: "Esta semana",
    faqLabels: ["Migração de dados", "Diferença entre planos"],
    requestHumanHandoff: false,
  },
  {
    key: "financeiro-com-handoff",
    nome: `E2E Lead 03 Juliana Costa ${RUN_ID}`,
    email: `e2e.lead.03.${RUN_ID}@magiclawyer.local`,
    telefone: "(21) 97777-3003",
    empresa: "Costa Consultoria Juridica",
    cargo: "Gestora administrativa",
    objetivo: "Controlar financeiro jurídico",
    tamanhoEquipe: "Médio (6 a 15 pessoas)",
    horizonte: "Implantar no próximo mês",
    plano: "Enterprise",
    mensagem:
      "A diretoria quer validar proposta e previsibilidade financeira até 25/03/2026. Precisamos conversar com especialista humano sobre cobrança, inadimplência e visão gerencial para sócios.",
    canal: "Ligação",
    prioridade: "Hoje",
    faqLabels: ["Atendimento humano", "Tempo de implantação"],
    requestHumanHandoff: true,
  },
  {
    key: "comite-expansao-pesquisa",
    nome: `E2E Lead 04 Eduardo Nunes ${RUN_ID}`,
    email: `e2e.lead.04.${RUN_ID}@magiclawyer.local`,
    telefone: "(31) 96666-4004",
    empresa: "Nunes, Prado & Associados",
    cargo: "Diretor de operações",
    objetivo: "Centralizar tudo em um único sistema",
    tamanhoEquipe: "Grande (16+ pessoas)",
    horizonte: "Somente pesquisa por enquanto",
    plano: "Ultra",
    mensagem:
      "Estamos pesquisando fornecedores agora, mas o comitê decide em 10/04/2026 e quer uma demonstração comparativa antes disso. O desafio é centralizar atendimento, operações e visão gerencial em uma só plataforma.",
    canal: "WhatsApp",
    prioridade: "Sem urgência",
    faqLabels: ["Diferença entre planos", "Começar menor e expandir"],
    requestHumanHandoff: false,
  },
];

async function openLeadChat(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: /automação e inteligência para escritórios de advocacia premium/i,
    }),
  ).toBeVisible();

  const pricingCta = page
    .locator("a,button")
    .filter({ hasText: /ver planos e recursos/i })
    .first();

  await expect(pricingCta).toBeVisible();
  await pricingCta.click();
  await page.waitForURL(/\/precos/);

  const chatSection = page.locator("#lead-chat");

  await expect(
    chatSection.getByRole("heading", { name: /chat de qualificação de lead/i }),
  ).toBeVisible();

  return chatSection;
}

async function clickChatOption(chatSection: Locator, option: string) {
  await chatSection.getByRole("button", { name: option, exact: true }).click();
}

async function answerFaq(chatSection: Locator, faqLabel: string) {
  await chatSection
    .getByRole("button", { name: faqLabel, exact: true })
    .click();
  await expect(chatSection.getByText(faqLabel, { exact: true })).toBeVisible();
  await expect
    .poll(async () => await chatSection.getByText(/digitando/i).count())
    .toBe(0);
}

async function completeGuidedChat(
  page: Page,
  chatSection: Locator,
  scenario: LeadScenario,
) {
  await expect(
    chatSection.getByRole("button", { name: scenario.objetivo, exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await clickChatOption(chatSection, scenario.objetivo);

  await expect(
    chatSection.getByRole("button", {
      name: scenario.tamanhoEquipe,
      exact: true,
    }),
  ).toBeVisible({ timeout: 20000 });
  await clickChatOption(chatSection, scenario.tamanhoEquipe);

  await expect(
    chatSection.getByRole("button", { name: scenario.horizonte, exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await clickChatOption(chatSection, scenario.horizonte);

  await expect(
    chatSection.getByRole("button", { name: scenario.plano, exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await clickChatOption(chatSection, scenario.plano);

  const submitButton = page.locator('button:has-text("Enviar para vendas")');
  await expect(submitButton).toBeEnabled({ timeout: 20000 });
}

async function fillLeadForm(page: Page, scenario: LeadScenario) {
  await page.getByLabel("Nome").fill(scenario.nome);
  await page.getByLabel("E-mail").fill(scenario.email);
  await page.getByLabel("Telefone/WhatsApp").fill(scenario.telefone);
  await page.getByLabel("Escritório/Empresa").fill(scenario.empresa);
  await page.getByLabel("Cargo").fill(scenario.cargo);
  await page.getByLabel("Mensagem complementar").fill(scenario.mensagem);

  await page.getByRole("button", { name: scenario.canal, exact: true }).click();
  await page
    .getByRole("button", { name: scenario.prioridade, exact: true })
    .click();
}

async function submitLead(
  page: Page,
  chatSection: Locator,
  scenario: LeadScenario,
) {
  for (const faqLabel of scenario.faqLabels) {
    await answerFaq(chatSection, faqLabel);
  }

  if (scenario.requestHumanHandoff) {
    await chatSection
      .getByRole("button", { name: /quero falar com especialista/i })
      .click();
    await expect
      .poll(async () => await chatSection.getByText(/digitando/i).count())
      .toBe(0);
  }

  await fillLeadForm(page, scenario);

  await page.getByRole("button", { name: /enviar para vendas/i }).click();

  await expect(page.getByText(/lead registrado/i)).toBeVisible({
    timeout: 20000,
  });
  await expect(
    chatSection.getByText(
      `Contato enviado: ${scenario.nome} • ${scenario.email}`,
    ),
  ).toBeVisible({ timeout: 20000 });
}

async function createLeadFromPublicChat(page: Page, scenario: LeadScenario) {
  const chatSection = await openLeadChat(page);

  await completeGuidedChat(page, chatSection, scenario);
  await submitLead(page, chatSection, scenario);
}

async function openLeadInAdmin(page: Page, scenario: LeadScenario) {
  const searchInput = page.getByPlaceholder(
    "Buscar por nome, e-mail, empresa ou plano",
  );

  await searchInput.fill(scenario.email);
  await expect(page.getByText(scenario.email, { exact: true })).toBeVisible({
    timeout: 20000,
  });

  await page.getByText(scenario.email, { exact: true }).click();
  const modal = page.getByRole("dialog");

  await expect(modal).toBeVisible({ timeout: 20000 });
  await expect(modal.getByText(scenario.nome, { exact: true })).toBeVisible({
    timeout: 20000,
  });

  return modal;
}

async function verifyLeadDetails(page: Page, scenario: LeadScenario) {
  const modal = await openLeadInAdmin(page, scenario);

  await expect(
    modal.getByText(new RegExp(`E-mail:\\s*${escapeRegExp(scenario.email)}`)),
  ).toBeVisible();
  await expect(
    modal.getByText(
      new RegExp(`Empresa:\\s*${escapeRegExp(scenario.empresa)}`),
    ),
  ).toBeVisible();
  await expect(
    modal.getByText(
      new RegExp(`Plano de interesse:\\s*${escapeRegExp(scenario.plano)}`),
    ),
  ).toBeVisible();
  await expect(
    modal.getByText(
      new RegExp(`Equipe:\\s*${escapeRegExp(scenario.tamanhoEquipe)}`),
    ),
  ).toBeVisible();
  await expect(
    modal.getByText(
      new RegExp(`Horizonte:\\s*${escapeRegExp(scenario.horizonte)}`),
    ),
  ).toBeVisible();
  await expect(
    modal.getByText(scenario.objetivo, { exact: true }).nth(0),
  ).toBeVisible();
  await expect(
    modal.getByText(scenario.mensagem, { exact: true }),
  ).toBeVisible();
  await expect(
    modal.getByText(
      new RegExp(`Canal preferido:\\s*${escapeRegExp(scenario.canal)}`),
    ),
  ).toBeVisible();
  await expect(
    modal.getByText(
      new RegExp(`Prioridade:\\s*${escapeRegExp(scenario.prioridade)}`),
    ),
  ).toBeVisible();
  await expect(
    modal.getByText(
      new RegExp(
        `Trilha:\\s*${escapeRegExp(
          scenario.requestHumanHandoff ? "Handoff humano" : "Fluxo guiado",
        )}`,
      ),
    ),
  ).toBeVisible();
  await expect(
    modal.getByText(
      new RegExp(
        `Atendimento humano:\\s*${escapeRegExp(
          scenario.requestHumanHandoff ? "Solicitado" : "Não solicitado",
        )}`,
      ),
    ),
  ).toBeVisible();

  for (const faqLabel of scenario.faqLabels) {
    await expect(modal.getByText(faqLabel, { exact: true })).toBeVisible();
  }

  await expect(
    modal.getByText(/transcrição do chat de captação/i),
  ).toBeVisible();
  await expect(modal.getByText(/olá, eu sou a lia\./i)).toBeVisible();

  await modal.getByRole("button", { name: /^fechar$/i }).click();
  await expect(modal).toBeHidden();
}

test.describe.serial("Captação comercial pública -> admin/leads", () => {
  test.setTimeout(240_000);

  test("visitantes públicos enviam múltiplos leads com contextos distintos", async ({
    page,
  }) => {
    for (const scenario of scenarios) {
      await test.step(`Captar lead ${scenario.key}`, async () => {
        await createLeadFromPublicChat(page, scenario);
      });
    }
  });

  test("super admin encontra os leads no funil com transcript e contexto comercial", async ({
    page,
  }) => {
    await loginAsUser(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    await page.goto("/admin/leads");
    await expect(
      page.getByRole("heading", { name: /leads comerciais/i }),
    ).toBeVisible();

    for (const scenario of scenarios) {
      await test.step(`Validar lead ${scenario.key} no admin`, async () => {
        await verifyLeadDetails(page, scenario);
      });
    }
  });
});
