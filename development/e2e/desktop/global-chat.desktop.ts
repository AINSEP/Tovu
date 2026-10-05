// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import { expect, test, type ElectronApplication } from "@playwright/test";
import fs from "node:fs";

import { closeDesktop, guestEval, guestInsertText, launchDesktop, makeSite, openSiteTab, scratchDir, startSite } from "./_fixtures.js";

/**
 * D4 (SCOPE.md §3.3), narrowed to what is built. The app-level "global chat" (one-chat FAB, 900 px
 * panel) does NOT exist: `App.tsx` (~line 189) documents that the host page carries no chat FAB on
 * purpose, `WORKSPACE_CHAT_CHANNELS` has no `ipcMain.handle`, and `WorkspaceChatPane` has zero call
 * sites. So this file covers:
 *  - the host sites home has no `.chat-fab` and no `aside[aria-label="Runner chat"]` (a regression
 *    guard against reintroducing a dead control over the guest's own FAB);
 *  - the SITE's own assistant, inside the tab's `<webview>` guest, answers a stubbed run.
 *
 * The run is stubbed in the GUEST through the Chrome DevTools Protocol, because Playwright's
 * `page.route` cannot reach a `<webview>` guest: the main process attaches `webContents.debugger`
 * to the guest and enables `Fetch` for `*\/api/runs*`. `POST /api/runs` answers a running run, the
 * EventSource GET answers one `text_delta` agent frame and an `end` frame, and the status GET says
 * `succeeded`. Everything else under the pattern continues to the real site server. Frame shape:
 * `journeys/assistant.journey.ts` (`frame()`), end frame: `admin-composer-agent-plugin-chip.spec.ts`.
 */
const SITE = "journey-chat";
const RUN_ID = "desktop-journey-run-1";
const REPLY = "Hello from the stubbed desktop run.";
let root: string;
let siteDir: string;

test.beforeAll(async () => {
  test.setTimeout(240_000);
  root = scratchDir("chat-sites");
  siteDir = await makeSite(root, SITE);
});
test.afterAll(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

function agentFrame(payload: Record<string, unknown>, eventId: number): string {
  const data = {
    runId: RUN_ID,
    eventId: String(eventId),
    opaqueCursor: String(eventId),
    protocolVersion: 1,
    ts: new Date(0).toISOString(),
    kind: "agent",
    payload,
    durability: "durable",
  };
  return `event: agent\ndata: ${JSON.stringify(data)}\n\n`;
}

interface RunStubCounts {
  starts: number;
  streams: number;
}

/**
 * Installs the CDP Fetch stub on the first `<webview>` guest. `mode: "fail"` answers the run start
 * with a 500 instead. Counts land in the main process's `globalThis.__runStub`.
 */
async function stubGuestRuns(app: ElectronApplication, mode: "reply" | "fail"): Promise<void> {
  const streamBody = `retry: 3600000\n\n${agentFrame({ type: "text_delta", delta: REPLY }, 1)}event: end\ndata: {"status":"succeeded","code":0}\n\n`;
  await app.evaluate(
    async ({ webContents }, { runId, body, fail }) => {
      type Debugger = {
        attach(version: string): void;
        on(event: "message", listener: (event: unknown, method: string, params: Record<string, any>) => void): void;
        sendCommand(method: string, params?: Record<string, unknown>): Promise<unknown>;
      };
      const guest = webContents.getAllWebContents().find((c: { getType(): string }) => c.getType() === "webview") as unknown as { debugger: Debugger } | undefined;
      if (!guest) throw new Error("no <webview> guest");
      const state = globalThis as typeof globalThis & { __runStub?: { starts: number; streams: number } };
      state.__runStub = { starts: 0, streams: 0 };
      const dbg = guest.debugger;
      dbg.attach("1.3");
      const fulfill = (requestId: string, status: number, contentType: string, text: string) =>
        dbg.sendCommand("Fetch.fulfillRequest", {
          requestId,
          responseCode: status,
          responseHeaders: [
            { name: "content-type", value: contentType },
            { name: "cache-control", value: "no-cache" },
          ],
          body: Buffer.from(text, "utf8").toString("base64"),
        });
      dbg.on("message", (_event, method, params) => {
        if (method !== "Fetch.requestPaused") return;
        const requestId = params.requestId as string;
        const request = params.request as { url: string; method: string };
        const pathname = new URL(request.url).pathname;
        if (request.method === "POST" && pathname.endsWith("/api/runs")) {
          state.__runStub!.starts += 1;
          void (fail
            ? fulfill(requestId, 500, "application/json", JSON.stringify({ error: "internal error", code: "INTERNAL_ERROR" }))
            : fulfill(requestId, 200, "application/json", JSON.stringify({ run: { id: runId, state: "running" } })));
          return;
        }
        if (request.method === "GET" && pathname.endsWith(`/api/runs/${runId}/events`)) {
          state.__runStub!.streams += 1;
          void fulfill(requestId, 200, "text/event-stream", body);
          return;
        }
        if (request.method === "GET" && pathname.endsWith(`/api/runs/${runId}`)) {
          void fulfill(requestId, 200, "application/json", JSON.stringify({ run: { id: runId, state: "succeeded" } }));
          return;
        }
        void dbg.sendCommand("Fetch.continueRequest", { requestId });
      });
      await dbg.sendCommand("Fetch.enable", { patterns: [{ urlPattern: "*/api/runs*", requestStage: "Request" }] });
    },
    { runId: RUN_ID, body: streamBody, fail: mode === "fail" },
  );
}

async function runStubCounts(app: ElectronApplication): Promise<RunStubCounts> {
  return app.evaluate(() => {
    const state = globalThis as typeof globalThis & { __runStub?: { starts: number; streams: number } };
    return { ...(state.__runStub ?? { starts: 0, streams: 0 }) };
  });
}

/** Opens the guest dock, types `text` through Chromium's input path, and presses Send. */
async function sendFromGuestDock(app: ElectronApplication, text: string): Promise<void> {
  await expect
    .poll(() => guestEval<boolean>(app, `(() => { const b = document.querySelector('button.chat-fab'); if (!b) return false; b.click(); return true; })()`), { timeout: 30_000 })
    .toBe(true);
  await expect.poll(() => guestEval<boolean>(app, `!!document.querySelector('.admin-chat-dock')`)).toBe(true);
  await expect
    .poll(() => guestEval<boolean>(app, `(() => { const t = document.querySelector('textarea.jini-composer-input'); if (!t) return false; t.focus(); return document.activeElement === t; })()`))
    .toBe(true);
  await guestInsertText(app, text);
  await expect
    .poll(() => guestEval<boolean>(app, `(() => { const b = document.querySelector('button[aria-label="Send"]'); if (!b || b.disabled) return false; b.click(); return true; })()`))
    .toBe(true);
}

function dockText(app: ElectronApplication): Promise<string> {
  return guestEval<string>(app, `(document.querySelector('.admin-chat-dock')?.textContent ?? "")`);
}

test("the host sites home carries no app-level chat FAB or Runner chat pane (not built)", { tag: ["@unrun"] }, async () => {
  const launch = await launchDesktop({ trackedSites: [siteDir] });
  const { win } = launch;
  try {
    await expect(win.locator(".chat-fab")).toHaveCount(0);
    await expect(win.locator('aside[aria-label="Runner chat"]')).toHaveCount(0);
    await expect(win.getByRole("button", { name: /chat/i })).toHaveCount(0);
  } finally {
    await closeDesktop(launch);
  }
});

test("the site's own assistant in the tab answers a stubbed run, with exactly one run start", { tag: ["@unrun"] }, async () => {
  const launch = await launchDesktop({ trackedSites: [siteDir] });
  const { app, win } = launch;
  try {
    await startSite(win, SITE);
    await openSiteTab(app, win, SITE);
    await stubGuestRuns(app, "reply");
    await sendFromGuestDock(app, "Say hello");

    await expect.poll(() => dockText(app), { timeout: 30_000 }).toContain(REPLY);
    const counts = await runStubCounts(app);
    expect(counts.starts, "one Send must start exactly one run").toBe(1);
    expect(counts.streams).toBeGreaterThanOrEqual(1);
    // The host chrome is untouched by the guest's dock: still no host-level chat surface.
    await expect(win.locator(".chat-fab")).toHaveCount(0);
  } finally {
    await closeDesktop(launch);
  }
});

test("a run start that fails shows an error inside the guest dock, sends nothing twice, and keeps the window drawn", { tag: ["@unrun"] }, async () => {
  const launch = await launchDesktop({ trackedSites: [siteDir] });
  const { app, win } = launch;
  try {
    await startSite(win, SITE);
    await openSiteTab(app, win, SITE);
    await stubGuestRuns(app, "fail");
    await sendFromGuestDock(app, "This start will fail");

    await expect
      .poll(() => guestEval<number>(app, `document.querySelectorAll('.admin-chat-dock .jini-message-error').length`), { timeout: 30_000 })
      .toBeGreaterThan(0);
    expect(await dockText(app)).not.toContain(REPLY);
    expect((await runStubCounts(app)).starts, "a failed start must not be retried behind the user's back").toBe(1);
    await expect(win.locator("webview")).toBeVisible();
  } finally {
    await closeDesktop(launch);
  }
});
