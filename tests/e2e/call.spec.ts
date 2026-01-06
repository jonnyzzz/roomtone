import { expect, test } from "@playwright/test";

test("two participants join the same room", async ({ browser }) => {
  const contextA = await browser.newContext({
    permissions: ["camera", "microphone"]
  });
  const contextB = await browser.newContext({
    permissions: ["camera", "microphone"]
  });

  const pageA = await contextA.newPage();
  await pageA.goto("/");
  await pageA.getByTestId("join-name").fill("Alice");
  await pageA.getByTestId("join-button").click();

  const pageB = await contextB.newPage();
  await pageB.goto("/");
  await pageB.getByTestId("join-name").fill("Bob");
  await pageB.getByTestId("join-button").click();

  await expect(pageA.getByTestId("participant-count")).toHaveText("2");
  await expect(pageB.getByTestId("participant-count")).toHaveText("2");

  await contextA.close();
  await contextB.close();
});

test("prefills name from local storage", async ({ browser }) => {
  const context = await browser.newContext({
    permissions: ["camera", "microphone"]
  });
  await context.addInitScript((storedName) => {
    window.localStorage.setItem("roomtone_name", storedName);
  }, "Saved Name");

  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByTestId("join-name")).toHaveValue("Saved Name");

  await context.close();
});

test("name query param is ignored and removed", async ({ browser }) => {
  const context = await browser.newContext({
    permissions: ["camera", "microphone"]
  });

  const page = await context.newPage();
  await page.goto("/?name=Injected");
  await page.waitForFunction(
    () => !new URL(window.location.href).searchParams.has("name")
  );
  await expect(page.getByTestId("join-name")).toHaveValue("");

  await context.close();
});

test("landscape phone view hides call chrome", async ({ browser }) => {
  const context = await browser.newContext({
    permissions: ["camera", "microphone"],
    viewport: { width: 812, height: 375 }
  });

  const page = await context.newPage();
  await page.goto("/");
  await page.getByTestId("join-name").fill("Alice");
  await page.getByTestId("join-button").click();
  await expect(page.getByTestId("participant-count")).toHaveText("1");

  await expect(page.locator(".app__header")).toBeHidden();
  await expect(page.locator(".call__header")).toBeHidden();
  await expect(page.locator(".video-grid")).toBeVisible();
  await expect(page.locator(".local-preview")).toHaveCount(0);

  await context.close();
});

test("portrait phone view keeps call chrome", async ({ browser }) => {
  const context = await browser.newContext({
    permissions: ["camera", "microphone"],
    viewport: { width: 390, height: 844 }
  });

  const page = await context.newPage();
  await page.goto("/");
  await page.getByTestId("join-name").fill("Ava");
  await page.getByTestId("join-button").click();
  await expect(page.getByTestId("participant-count")).toHaveText("1");

  await expect(page.locator(".app__header")).toBeVisible();
  await expect(page.locator(".call__header")).toBeVisible();
  await expect(page.locator(".video-grid")).toBeVisible();

  await context.close();
});

test("desktop view shows local preview when peers join", async ({ browser }) => {
  const contextA = await browser.newContext({
    permissions: ["camera", "microphone"],
    viewport: { width: 1280, height: 720 }
  });
  const contextB = await browser.newContext({
    permissions: ["camera", "microphone"],
    viewport: { width: 1280, height: 720 }
  });

  const pageA = await contextA.newPage();
  await pageA.goto("/");
  await pageA.getByTestId("join-name").fill("Rin");
  await pageA.getByTestId("join-button").click();

  const pageB = await contextB.newPage();
  await pageB.goto("/");
  await pageB.getByTestId("join-name").fill("Sol");
  await pageB.getByTestId("join-button").click();

  await expect(pageA.getByTestId("participant-count")).toHaveText("2");
  await expect(pageA.locator(".local-preview")).toBeVisible();

  await contextA.close();
  await contextB.close();
});
