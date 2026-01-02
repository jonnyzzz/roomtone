import { expect, test, request as playwrightRequest } from "@playwright/test";
import crypto from "crypto";
import { spawn } from "child_process";
import { once } from "events";

const PORT = 5671;
const BASE_URL = `http://localhost:${PORT}`;

let authToken = "";
let serverProcess: ReturnType<typeof spawn> | null = null;

function base64UrlEncode(input: Buffer | string): string {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signJwt(
  payload: Record<string, unknown>,
  privateKey: crypto.KeyObject
): string {
  const header = { alg: "RS256", typ: "JWT" };
  const signingInput = `${base64UrlEncode(
    JSON.stringify(header)
  )}.${base64UrlEncode(JSON.stringify(payload))}`;
  const signature = crypto.sign(
    "RSA-SHA256",
    Buffer.from(signingInput),
    privateKey
  );
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

async function waitForServer(token: string) {
  const deadline = Date.now() + 30000;
  const url = `${BASE_URL}/health?token=${encodeURIComponent(token)}`;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the server is up.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Auth test server did not start in time.");
}

test.use({ baseURL: BASE_URL });

test.beforeAll(async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048
  });
  const publicPem = publicKey
    .export({ type: "spki", format: "pem" })
    .toString();
  const nowSeconds = Math.floor(Date.now() / 1000);
  authToken = signJwt(
    { exp: nowSeconds + 300, name: "Authed User" },
    privateKey
  );

  serverProcess = spawn("node", ["dist/server/index.js"], {
    env: {
      ...process.env,
      PORT: String(PORT),
      ALLOW_INSECURE_HTTP: "true",
      AUTH_ENABLED: "true",
      AUTH_PUBLIC_KEYS: publicPem
    },
    stdio: "inherit"
  });

  await waitForServer(authToken);
});

test.afterAll(async () => {
  if (!serverProcess) {
    return;
  }
  serverProcess.kill();
  await once(serverProcess, "exit");
  serverProcess = null;
});

test("auth protects HTTP and WebSocket access", async ({ browser, request }) => {
  const unauthRoot = await request.get("/", { failOnStatusCode: false });
  expect(unauthRoot.status()).toBe(401);

  const unauthHealth = await request.get("/health", { failOnStatusCode: false });
  expect(unauthHealth.status()).toBe(200);

  const authedRoot = await request.get(
    `/?token=${encodeURIComponent(authToken)}`
  );
  expect(authedRoot.status()).toBe(200);
  const authedHtml = await authedRoot.text();
  const assetPath = extractFirstAssetPath(authedHtml);
  const unauthRequest = await playwrightRequest.newContext({ baseURL: BASE_URL });
  const unauthAsset = await unauthRequest.get(assetPath, {
    failOnStatusCode: false
  });
  expect(unauthAsset.status()).toBe(401);
  await unauthRequest.dispose();

  const authedAsset = await request.get(
    `${assetPath}${assetPath.includes("?") ? "&" : "?"}token=${encodeURIComponent(
      authToken
    )}`
  );
  expect(authedAsset.status()).toBe(200);

  const context = await browser.newContext({
    permissions: ["camera", "microphone"]
  });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/?token=${encodeURIComponent(authToken)}`);
  await page.waitForFunction(
    () => !new URL(window.location.href).searchParams.has("token")
  );
  await expect(page.getByTestId("join-name")).toHaveValue("Authed User");
  await page.getByTestId("join-button").click();
  await expect(page.getByTestId("participant-count")).toHaveText("1");

  await page.goto(`${BASE_URL}/`);
  await expect(page.getByTestId("join-name")).toBeVisible();

  await context.close();
});

function extractFirstAssetPath(html: string): string {
  const match = html.match(/(?:src|href)="(\/assets\/[^"\s]+)"/);
  if (!match) {
    throw new Error("No asset reference found in HTML.");
  }
  return match[1];
}
