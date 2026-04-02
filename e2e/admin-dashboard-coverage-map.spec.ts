import { expect, test } from "@playwright/test";

import { loginAsUser } from "./helpers/auth";

const SUPER_ADMIN_EMAIL =
  process.env.TEST_SUPER_ADMIN_EMAIL || "robsonnonatoiii@gmail.com";
const SUPER_ADMIN_PASSWORD =
  process.env.TEST_SUPER_ADMIN_PASSWORD || "Robson123!";

test.describe.serial("Mapa quente admin", () => {
  test.describe.configure({ timeout: 180000 });

  test("mantem a UF clicada em foco mesmo quando ela nao lidera a metrica", async ({
    page,
  }) => {
    await loginAsUser(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);

    await page.goto("/admin/dashboard");
    await page.waitForURL("**/admin/dashboard");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.getByRole("heading", {
        name: "Cockpit executivo do Magic Lawyer",
      }),
    ).toBeVisible({ timeout: 30000 });
    await expect(
      page.getByRole("heading", {
        name: "Mapa quente de processos pelo Brasil",
      }),
    ).toBeVisible({ timeout: 30000 });

    const focusHeading = page
      .getByText("Estado em foco", { exact: true })
      .locator("..")
      .locator("h3");
    const initialFocus = (await focusHeading.textContent())?.trim() ?? "";

    const stateButtons = page.locator(
      '[data-testid^="brazil-coverage-map-state-"]',
    );
    const stateCount = await stateButtons.count();

    expect(stateCount).toBeGreaterThan(1);

    for (let index = 0; index < stateCount; index += 1) {
      await expect(stateButtons.nth(index)).not.toHaveText(/^$/);
    }

    let targetIndex = -1;
    let targetStateName = "";
    let targetUf = "";

    for (let index = 0; index < stateCount; index += 1) {
      const title = await stateButtons.nth(index).getAttribute("title");
      const match = title?.match(/^(.*?) \(([A-Z]{2})\)/);

      if (!match) {
        continue;
      }

      if (match[1] === initialFocus) {
        continue;
      }

      targetIndex = index;
      targetStateName = match[1];
      targetUf = match[2];
      break;
    }

    expect(targetIndex).toBeGreaterThanOrEqual(0);

    await stateButtons.nth(targetIndex).click();

    const locationDialog = page.getByRole("dialog");

    await expect(locationDialog).toBeVisible();
    await expect(locationDialog).toContainText(targetStateName);
    await expect(locationDialog).toContainText(targetUf);
    await expect(focusHeading).toHaveText(targetStateName);
  });
});
