const { chromium } = require("playwright");

const ROOMTONE_URL = process.env.ROOMTONE_URL || "http://roomtone-server:5670";
const ROOMTONE_NAME = process.env.ROOMTONE_NAME || "Roomtone Client";
const ROOMTONE_TIMEOUT_MS = Number(process.env.ROOMTONE_TIMEOUT_MS || "45000");
const NO_INTERNET_URL = process.env.NO_INTERNET_URL || "https://example.com";

async function assertNoInternetAccess() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(NO_INTERNET_URL, {
      signal: controller.signal
    });
    throw new Error(
      `Internet access detected (${NO_INTERNET_URL} -> ${response.status}).`
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Internet access")) {
      throw error;
    }
  } finally {
    clearTimeout(timer);
  }
}

async function run() {
  await assertNoInternetAccess();

  // Recent Chromium (143+) gates navigator.mediaDevices on secure-context
  // origins. The harness serves over http://roomtone-it-server-* which
  // isn't HTTPS or localhost, so by default `navigator.mediaDevices` is
  // undefined, App.tsx's isBaseSupported is false, and the join-button
  // stays disabled.
  //
  // Use launchPersistentContext with an explicit user-data-dir: a
  // fresh profile is required for --unsafely-treat-insecure-origin-as-secure
  // to populate the origin allowlist (the flag has no effect when merged
  // with an existing profile). Also pass --disable-features for the
  // StorageAccess API to avoid noise.
  const os = require("os");
  const path = require("path");
  const fs = require("fs");
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "roomtone-chromium-"));
  const secureOrigin = new URL(ROOMTONE_URL).origin;

  const context = await chromium.launchPersistentContext(userDataDir, {
    permissions: ["camera", "microphone"],
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
      `--unsafely-treat-insecure-origin-as-secure=${secureOrigin}`,
      // Without the matching enable-features the allowlist is ignored in
      // newer Chromium. See https://crbug.com/1330037 for the dance.
      "--enable-features=UnsafelyTreatInsecureOriginAsSecure"
    ]
  });
  const page = await context.newPage();

  await page.goto(ROOMTONE_URL, { waitUntil: "domcontentloaded" });

  // Diagnostic: log why the join-button would be disabled, so future CI
  // failures aren't a mystery.
  const support = await page.evaluate(() => ({
    hasWebSocket: typeof WebSocket !== "undefined",
    hasMediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
    hasMediaRecorder: typeof MediaRecorder !== "undefined",
    hasMediaSource: typeof MediaSource !== "undefined",
    hasWebrtc: typeof RTCPeerConnection !== "undefined",
    isSecureContext: window.isSecureContext
  }));
  console.log(`[smoke] browser support: ${JSON.stringify(support)}`);

  await page.getByTestId("join-name").fill(ROOMTONE_NAME);
  await page.getByTestId("join-button").click();

  await page.waitForFunction(() => {
    const countEl = document.querySelector(
      "[data-testid=\"participant-count\"]"
    );
    const count = countEl ? Number(countEl.textContent || "0") : 0;
    return count >= 2;
  }, { timeout: ROOMTONE_TIMEOUT_MS });

  await page.waitForFunction(() => {
    const localVideo = document.querySelector("video.tile__video--local");
    if (!localVideo) {
      return false;
    }
    const stream = localVideo.srcObject;
    if (!stream || typeof stream.getAudioTracks !== "function") {
      return false;
    }
    const hasAudio = stream.getAudioTracks().length > 0;
    const hasVideo = stream.getVideoTracks().length > 0;
    return hasAudio && hasVideo;
  }, { timeout: ROOMTONE_TIMEOUT_MS });

  await page.waitForFunction(() => {
    const videos = Array.from(document.querySelectorAll("video.tile__video"));
    const remoteVideo = videos.find(
      (node) => !node.classList.contains("tile__video--local")
    );
    if (!remoteVideo) {
      return false;
    }
    const hasSource = Boolean(remoteVideo.srcObject || remoteVideo.src);
    if (!hasSource) {
      return false;
    }
    return remoteVideo.readyState >= 2 || remoteVideo.currentTime > 0;
  }, { timeout: ROOMTONE_TIMEOUT_MS });

  await context.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
