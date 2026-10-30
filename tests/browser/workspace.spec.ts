import { test, expect } from "@playwright/test";

test("employee creation, routing, fixed chrome and mobile studio remain usable", async ({
  page,
}) => {
  const stamp = Date.now();
  await page.goto("/sign-in");
  await page
    .getByRole("button", { name: "New here? Create an account", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("Experience smoke test");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`experience-${stamp}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Experience-test-passphrase-1234");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.waitForURL("**/onboarding");
  await page.getByLabel("Organization name").fill(`Experience test ${stamp}`);
  await page
    .getByRole("button", { name: "Create organization", exact: true })
    .click();
  await expect(page.locator(".workspace-body[aria-busy=false]")).toBeVisible();
  await page.getByRole("button", { name: "Agents", exact: true }).click();
  await page.getByRole("button", { name: "Create agent", exact: true }).click();
  const studio = page.getByRole("dialog");
  await studio.getByLabel("Name", { exact: true }).fill("Launch operator");
  await studio
    .getByLabel("Description", { exact: true })
    .fill("Prepare launch briefs with sources and clear owners.");
  await studio
    .getByLabel("Instructions", { exact: true })
    .fill(
      "Search company knowledge before answering. Cite documents, clarify owners, and never invent company facts.",
    );
  const footer = await studio.locator(".builder-footer").boundingBox();
  expect(footer!.y + footer!.height).toBeLessThanOrEqual(900);
  await studio
    .getByRole("button", { name: "Create agent", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Launch operator", level: 1 }),
  ).toBeVisible();
  await expect(page.locator(".employee-rail")).toContainText("Launch operator");
  const employeeUrl = page.url();
  expect(new URL(employeeUrl).pathname).toMatch(/^\/agents\/[^/]+$/);
  await page.reload();
  await expect(page.locator(".employee-heading")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Launch operator", level: 1 }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "New conversation", exact: true })
    .click();
  await page
    .getByLabel("Message your agent")
    .fill("Keep this task until my model is connected.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Connect Anthropic Claude" }),
  ).toBeVisible();
  await expect(page.getByLabel("Message your agent")).toHaveValue(
    "Keep this task until my model is connected.",
  );
  await page
    .getByRole("link", { name: "Organization settings", exact: true })
    .click();
  await page
    .locator(".workspace-body")
    .evaluate((node) => (node.scrollTop = node.scrollHeight));
  expect((await page.locator(".topbar").boundingBox())!.y).toBe(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByRole("tab", { name: "Team", exact: true }).click();
  await page.reload();
  await expect(page.locator(".workspace-body[aria-busy=false]")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Organization & members", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Agents", exact: true }).click();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Organization & members", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByRole("button", { name: "Agents", exact: true }).click();
  await page.getByRole("button", { name: "Create agent", exact: true }).click();
  const mobileFooter = await page.locator(".builder-footer").boundingBox();
  expect(mobileFooter!.y + mobileFooter!.height).toBeLessThanOrEqual(844);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
});
