import { spawnSync, spawn } from "node:child_process";

import { chromium, Page, Locator } from "playwright";

type TenantLogin = {
  name: string;
  email: string;
  password: string;
  slug: string;
};

const BASE_URL = process.env.BASE_URL || "http://localhost:9192";
const DEV_SERVER_COMMAND = process.env.INPI_AUDIT_DEV_COMMAND || "PORT=9192 npx next dev --turbopack";
const SERVER_READY_TIMEOUT_MS = 180_000;
const SEARCH_TIMEOUT_MS = 240_000;

const TENANTS: Record<string, TenantLogin> = {
  sandra: {
    name: "Sandra",
    email: "sandra@adv.br",
    password: "Sandra@123",
    slug: "sandra",
  },
  salba: {
    name: "Salba",
    email: "luciano@salbaadvocacia.com.br",
    password: "Luciano@123",
    slug: "salba",
  },
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitForServerReady(timeoutMs = SERVER_READY_TIMEOUT_MS) {
  const startedAt = Date.now();
  let lastError: string | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${BASE_URL}/login`, { method: "GET" });
      if (response.ok) {
        return;
      }

      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Erro desconhecido";
    }

    await sleep(1000);
  }

  throw new Error(
    `Servidor não ficou pronto em ${Math.floor(timeoutMs / 1000)}s (${lastError || "sem detalhes"}).`,
  );
}

async function waitForServerDown(timeoutMs = 30_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await fetch(`${BASE_URL}/login`, { method: "GET" });
    } catch {
      return;
    }

    await sleep(600);
  }

  throw new Error("Servidor não caiu no tempo esperado.");
}

function getListeningPid(): number | null {
  const result = spawnSync("zsh", [
    "-lc",
    "lsof -tiTCP:9192 -sTCP:LISTEN | head -n 1",
  ]);
  const output = String(result.stdout || "").trim();

  if (!output) {
    return null;
  }

  const parsed = Number.parseInt(output, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function killPid(pid: number) {
  const killResult = spawnSync("zsh", ["-lc", `kill -9 ${pid}`]);
  if (killResult.status !== 0) {
    throw new Error(
      `Falha ao finalizar processo ${pid}: ${String(killResult.stderr || "").trim()}`,
    );
  }
}

function restartDevServerDetached() {
  const child = spawn("zsh", ["-lc", DEV_SERVER_COMMAND], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

async function login(page: Page, tenant: TenantLogin) {
  const tryLogin = async (tenantHint: string | null): Promise<{ ok: boolean; error?: string | null }> => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    const outOfLogin = !page.url().includes("/login");
    if (outOfLogin) {
      await page.waitForLoadState("networkidle").catch(() => undefined);
      return { ok: true };
    }

    const emailField = page.locator('input[type="email"]').first();
    const tenantField = page.locator('input[placeholder="meu-escritorio"], input[name="tenant"], input[name="tenantSlug"]').first();
    const passwordField = page.locator('input[type="password"]').first();
    const emailVisible = await emailField.isVisible({ timeout: 60_000 }).catch(() => false);
    if (!emailVisible) {
      const redirected = await page
        .waitForURL((url) => !url.pathname.includes("/login"), { timeout: 60_000 })
        .then(() => true)
        .catch(() => false);
      if (redirected) {
        await page.waitForLoadState("networkidle").catch(() => undefined);
        return { ok: true };
      }
      return { ok: false, error: "Formulário de login não ficou visível após restart." };
    }

    const robustFill = async (field: Locator, value: string, fieldName: string) => {
      await field.waitFor({ state: "visible", timeout: 60_000 });
      await field.click({ clickCount: 3 });
      await field.fill(value);
      let currentValue = await field.inputValue().catch(() => "");
      if (currentValue !== value) {
        await field.press("ControlOrMeta+a").catch(() => undefined);
        await field.type(value, { delay: 12 });
        currentValue = await field.inputValue().catch(() => "");
      }
      if (currentValue !== value) {
        throw new Error(
          `Falha ao preencher campo ${fieldName}. Esperado="${value}", atual="${currentValue}".`,
        );
      }
    };

    await robustFill(emailField, tenant.email, "email");
    await robustFill(tenantField, tenantHint ?? "", "tenant");
    await robustFill(passwordField, tenant.password, "password");

    // O blur do e-mail dispara checagem assíncrona de primeiro acesso.
    await passwordField.blur();

    const submit = page.getByRole("button", { name: /Entrar no sistema|Entrar/i }).first();
    const enableDeadline = Date.now() + 20_000;
    while (Date.now() < enableDeadline) {
      const disabled = await submit.isDisabled().catch(() => true);
      if (!disabled) {
        break;
      }
      await sleep(200);
    }

    await submit.click();

    const redirected = await page
      .waitForURL((url) => !url.pathname.includes("/login"), {
        timeout: 120_000,
      })
      .then(() => true)
      .catch(() => false);
    if (redirected) {
      await page.waitForLoadState("networkidle");
      return { ok: true };
    }

    const toastError = await page
      .locator('[data-slot="description"], [role="alert"]')
      .filter({ hasText: /incorret|inválid|erro|não foi possível|suspens|cancelad|credenc/i })
      .first()
      .textContent()
      .catch(() => null);
    const currentUrl = page.url();
    const submitCount = await page
      .getByRole("button", { name: /Entrar no sistema|Entrar|Login|Enviar link/i })
      .count()
      .catch(() => 0);
    const submitDisabled = await submit.isDisabled().catch(() => true);
    const debugPath = `output/playwright/inpi-login-fail-${tenant.name.toLowerCase()}-${Date.now()}.png`;
    await page.screenshot({ path: debugPath, fullPage: true }).catch(() => undefined);
    console.warn(
      `[login-debug] tenant=${tenant.name} tenantHint=${tenantHint ?? "(auto)"} url=${currentUrl} submitCount=${submitCount} submitDisabled=${submitDisabled} screenshot=${debugPath} toast=${toastError ?? "n/a"}`,
    );
    return { ok: false, error: toastError };
  };

  const first = await tryLogin(tenant.slug);
  if (first.ok) {
    return;
  }

  const fallback = await tryLogin(null);
  if (fallback.ok) {
    return;
  }

  throw new Error(
    `Falha no login de ${tenant.name}. URL final: ${page.url()}. ${
      fallback.error || first.error ? `Mensagem: ${fallback.error || first.error}` : ""
    }`,
  );
}

async function openInpi(page: Page) {
  await page.goto(`${BASE_URL}/inpi`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.getByText("INPI", { exact: false }).first().waitFor({ timeout: 20_000 });
}

async function getHistoryTotal(page: Page): Promise<number> {
  const locator = page.getByText(/Total no histórico:\s*[\d.]+/i).first();
  await locator.waitFor({ timeout: 20_000 });
  const text = (await locator.textContent()) || "";
  const match = text.match(/Total no histórico:\s*([\d.]+)/i);
  if (!match) {
    throw new Error(`Não foi possível ler total do histórico. Texto: "${text}"`);
  }

  return Number.parseInt(match[1].replace(/\./g, ""), 10);
}

async function runCatalogSearch(page: Page, term: string) {
  const input = page.getByLabel("Pesquisar nome/processo").first();
  await input.fill(term);

  const button = page.getByRole("button", { name: /Consultar catálogo/i }).first();
  await button.click();
}

async function waitCatalogSyncTerminal(page: Page, timeoutMs = SEARCH_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = "desconhecido";

  while (Date.now() < deadline) {
    const doneVisible = await page
      .getByText("Varredura completa concluída.", { exact: false })
      .first()
      .isVisible()
      .catch(() => false);
    if (doneVisible) {
      return "COMPLETED" as const;
    }

    const failedVisible = await page
      .getByText("Varredura completa falhou.", { exact: false })
      .first()
      .isVisible()
      .catch(() => false);
    if (failedVisible) {
      return "FAILED" as const;
    }

    const runningVisible = await page
      .getByText("Varredura completa em execução.", { exact: false })
      .first()
      .isVisible()
      .catch(() => false);
    const queuedVisible = await page
      .getByText("Busca enfileirada para execução.", { exact: false })
      .first()
      .isVisible()
      .catch(() => false);
    const waitingGlobalVisible = await page
      .getByText("Aguardando término de sincronização global", {
        exact: false,
      })
      .first()
      .isVisible()
      .catch(() => false);

    if (runningVisible) lastStatus = "RUNNING";
    else if (waitingGlobalVisible) lastStatus = "WAITING_GLOBAL";
    else if (queuedVisible) lastStatus = "QUEUED";

    await sleep(1200);
  }

  throw new Error(
    `Timeout aguardando status terminal da busca INPI. Último status percebido: ${lastStatus}.`,
  );
}

async function scenarioHistoryTrail(page: Page) {
  console.log("\n[1/3] Cenário: trilha de histórico (1 intenção de busca)");
  await openInpi(page);
  const term = `Audit${Date.now()}`;
  const before = await getHistoryTotal(page);
  await runCatalogSearch(page, term);

  const result = await waitCatalogSyncTerminal(page);
  assertCondition(
    result === "COMPLETED",
    `Busca do cenário de histórico finalizou com status ${result}.`,
  );

  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");

  const after = await getHistoryTotal(page);
  const delta = after - before;

  console.log(`[history] antes=${before} depois=${after} delta=${delta}`);
  assertCondition(
    delta === 2,
    `Esperado delta=2 no histórico (local + background), obtido delta=${delta}.`,
  );
}

async function scenarioConcurrency(
  pageA: Page,
  pageB: Page,
  tenantAName: string,
  tenantBName: string,
) {
  console.log("\n[2/3] Cenário: concorrência multi-tenant (mesmo termo)");
  await openInpi(pageA);
  await openInpi(pageB);

  const term = `Natos-${Date.now()}`;
  await runCatalogSearch(pageA, term);
  await sleep(650);
  await runCatalogSearch(pageB, term);

  let waitGlobalSeen = false;
  const waitDeadline = Date.now() + 45_000;
  while (Date.now() < waitDeadline) {
    const aWaiting = await pageA
      .getByText("Aguardando término de sincronização global", { exact: false })
      .first()
      .isVisible()
      .catch(() => false);
    const bWaiting = await pageB
      .getByText("Aguardando término de sincronização global", { exact: false })
      .first()
      .isVisible()
      .catch(() => false);
    if (aWaiting || bWaiting) {
      waitGlobalSeen = true;
      break;
    }

    await sleep(900);
  }

  const statusA = await waitCatalogSyncTerminal(pageA);
  const statusB = await waitCatalogSyncTerminal(pageB);

  console.log(
    `[concurrency] ${tenantAName}=${statusA} | ${tenantBName}=${statusB} | waitGlobalSeen=${waitGlobalSeen}`,
  );

  assertCondition(statusA === "COMPLETED", `${tenantAName} não concluiu busca.`);
  assertCondition(statusB === "COMPLETED", `${tenantBName} não concluiu busca.`);
  if (!waitGlobalSeen) {
    console.warn(
      "[concurrency] Aviso: estado WAITING_GLOBAL não ficou visível nesta execução (janela curta/cache).",
    );
  }
}

async function scenarioWorkerDropAndRecovery(page: Page) {
  console.log("\n[3/3] Cenário: queda no meio da sincronização + recuperação");
  await openInpi(page);

  const term = "Natos";
  await runCatalogSearch(page, term);
  const stateDeadline = Date.now() + 20_000;
  let stateSeen: "RUNNING" | "QUEUED" | "WAITING_GLOBAL" | "COMPLETED" | "UNKNOWN" = "UNKNOWN";
  while (Date.now() < stateDeadline) {
    const completedVisible = await page
      .getByText("Varredura completa concluída.", { exact: false })
      .first()
      .isVisible()
      .catch(() => false);
    if (completedVisible) {
      stateSeen = "COMPLETED";
      break;
    }

    const runningVisible = await page
      .getByText("Varredura completa em execução.", { exact: false })
      .first()
      .isVisible()
      .catch(() => false);
    if (runningVisible) {
      stateSeen = "RUNNING";
      break;
    }

    const queuedVisible = await page
      .getByText("Busca enfileirada para execução.", { exact: false })
      .first()
      .isVisible()
      .catch(() => false);
    if (queuedVisible) {
      stateSeen = "QUEUED";
      break;
    }

    const waitingGlobalVisible = await page
      .getByText("Aguardando término de sincronização global", { exact: false })
      .first()
      .isVisible()
      .catch(() => false);
    if (waitingGlobalVisible) {
      stateSeen = "WAITING_GLOBAL";
      break;
    }

    await sleep(500);
  }
  console.log(`[recovery] Estado detectado antes da queda: ${stateSeen}`);

  const pid = getListeningPid();
  assertCondition(pid, "Não foi possível identificar PID do servidor em :9192.");
  console.log(`[recovery] Derrubando servidor PID=${pid} durante sincronização...`);
  killPid(pid);

  await waitForServerDown();
  console.log("[recovery] Servidor caiu. Reiniciando...");

  restartDevServerDetached();
  await waitForServerReady();
  console.log("[recovery] Servidor voltou.");

  await login(page, TENANTS.sandra);
  await openInpi(page);

  await runCatalogSearch(page, term);
  const finalStatus = await waitCatalogSyncTerminal(page);
  assertCondition(
    finalStatus === "COMPLETED",
    `Após recovery, busca finalizou com status ${finalStatus}.`,
  );
  console.log("[recovery] Busca concluída após restart com sucesso.");
}

async function main() {
  console.log("=== INPI Heavy Audit ===");
  console.log(`Base URL: ${BASE_URL}`);

  await waitForServerReady();
  const browser = await chromium.launch({ headless: true });

  const contextSandra = await browser.newContext();
  const pageSandra = await contextSandra.newPage();
  await login(pageSandra, TENANTS.sandra);

  const contextSalba = await browser.newContext();
  const pageSalba = await contextSalba.newPage();
  await login(pageSalba, TENANTS.salba);

  const result = {
    historyTrail: "pending",
    concurrency: "pending",
    recovery: "pending",
  };

  try {
    await scenarioHistoryTrail(pageSandra);
    result.historyTrail = "ok";

    await scenarioConcurrency(
      pageSandra,
      pageSalba,
      TENANTS.sandra.name,
      TENANTS.salba.name,
    );
    result.concurrency = "ok";

    await scenarioWorkerDropAndRecovery(pageSandra);
    result.recovery = "ok";

    console.log("\n=== RESUMO FINAL ===");
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("\n=== FALHA NO AUDIT INPI ===");
  console.error(error);
  process.exit(1);
});
