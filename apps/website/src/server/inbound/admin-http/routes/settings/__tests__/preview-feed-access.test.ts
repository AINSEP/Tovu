/** Spec/ADR: ADS-memory/.local-artifacts/theme-preview-refresh/design.md */
import assert from "node:assert/strict";
import test from "node:test";
import { authorizeChangeFeed } from "../preview-feed-access.js";

test("theme editor without settings.read can subscribe to theme notifications only", async () => {
  const calls: string[] = [];
  const access = await authorizeChangeFeed({
    authorize: async ({ permission }) => {
      calls.push(permission);
      return { allowed: permission === "theme.set", reason: "test" };
    },
    principalId: "editor",
    workspaceId: "ws",
    includePreview: true,
  });
  assert.deepEqual(access, { settings: false, preview: true, reason: "test" });
  assert.deepEqual(calls, ["settings.read", "theme.set"]);
});

test("settings-only subscription does not acquire theme permission or bypass settings denial", async () => {
  const calls: string[] = [];
  const access = await authorizeChangeFeed({
    authorize: async ({ permission }) => {
      calls.push(permission);
      return { allowed: false, reason: "revoked" };
    },
    principalId: "editor",
    workspaceId: "ws",
    includePreview: false,
  });
  assert.deepEqual(access, { settings: false, preview: false, reason: "revoked" });
  assert.deepEqual(calls, ["settings.read"]);
});

test("existing stream emits exact theme frames across writers, reauthorizes and cleans up its timers", async (t) => {
  const { registerAdminSettingsEventsRoute } = await import("../events.js");
  const { requestThemePreviewRefresh } = await import("#src/features/theme/index");
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const themesDir = fs.mkdtempSync(path.join(os.tmpdir(), "preview-feed-"));
  t.after(() => fs.rmSync(themesDir, { recursive: true, force: true }));
  const ticks = new Map<number, () => void>();
  const cleared: number[] = [];
  let handler: Function = () => {};
  const app = {
    get: (_path: string, next: Function) => {
      handler = next;
    },
  };
  let allowed = true;
  const deps = {
    workspaceId: "ws",
    themesDir,
    settingsReady: Promise.resolve(),
    settingsRepo: {
      maxRevisionSeq: async () => 0,
      listRevisionsSince: async () => assert.fail("theme-only subscriber cannot read settings"),
    },
    authorize: async ({ permission }: { permission: string }) => ({
      allowed: allowed && permission === "theme.set",
      reason: "test",
    }),
  };
  registerAdminSettingsEventsRoute(
    app as never,
    {
      ...deps,
      feedTimers: {
        scheduleInterval: (work, ms) => {
          ticks.set(ms, work);
          return ms as never;
        },
        clearScheduledInterval: (timer) => {
          cleared.push(timer as never);
        },
      },
    } as never,
  );
  const closeHandlers: Function[] = [];
  const writes: string[] = [];
  const req = {
    params: { workspaceId: "ws" },
    query: { themePreview: "1" },
    headers: {},
    httpVersionMajor: 2,
    on: (_name: string, fn: Function) => closeHandlers.push(fn),
  };
  let ended = false;
  const res = {
    locals: { principal: { id: "editor" } },
    writeHead: () => {},
    write: (data: string) => writes.push(data),
    on: (_name: string, fn: Function) => closeHandlers.push(fn),
    end: () => {
      ended = true;
    },
  };
  requestThemePreviewRefresh({ themesDir }, { revision: "first", path: "/old" });
  await handler(req, res);
  ticks.get(1000)?.();
  await new Promise(setImmediate);
  requestThemePreviewRefresh({ themesDir }, { revision: "second", path: "/create-a-theme" });
  ticks.get(1000)?.();
  await new Promise(setImmediate);
  assert.deepEqual(writes, [
    ": connected\n\n",
    'event: theme-preview-refresh\ndata: {"revision":"first"}\n\n',
    'event: theme-preview-refresh\ndata: {"revision":"second","path":"/create-a-theme"}\n\n',
  ]);
  allowed = false;
  ticks.get(30000)?.();
  await new Promise(setImmediate);
  assert.equal(ended, true);
  assert.deepEqual(
    cleared.sort((a, b) => a - b),
    [1000, 25000, 30000],
  );
  closeHandlers.forEach((fn) => fn());
  assert.equal(cleared.length, 3);
});
