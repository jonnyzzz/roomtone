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
