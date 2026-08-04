import type { FullConfig } from "@playwright/test";

/**
 * @file Logs in ONCE before any spec in `playwright.adversarial.config.ts` runs, and saves the
 * resulting session cookie as a Playwright `storageState` file every test in this suite reuses.
 *
 * Why this exists rather than each test calling `POST /api/admin/v1/auth/login` itself (the pattern
 * `a2ui-transport-contract.spec.ts` uses, one login per file): `LOGIN_STRICT`
 * (`server/middleware/rate-limit.ts`) caps login at 10 requests/60s per client IP. This suite's
 * `surface-abuse.spec.ts` alone has more than 10 individual `test()` cases; each opening its own
 * `request` fixture (a fresh, empty cookie jar — NOT shared with `test.beforeAll`'s own `request`,
 * confirmed by running it: every test after the 10th 429'd on login before reaching the attack it was
 * meant to run). One login here, reused via `storageState` everywhere, sidesteps the limiter entirely
 * instead of tuning tests around it.
 *
 * Written to the OS temp directory, never into the repo: this file carries a live, if short-lived
 * and dev-only, session cookie, and `development/e2e/` is a committed, version-controlled directory.
 */
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const LOGIN_PATH = "/api/admin/v1/auth/login";
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "tovu-dev";

/**
 * Read by the config's `use.storageState` after `globalSetup` completes.
 *
 * Deliberately a FIXED path, not one derived from `mkdtempSync` — Playwright re-`require`s the
 * config module (and therefore re-imports this one) once per worker process, each a fresh Node
 * module realm with no memory of what the main runner process's `globalSetup` call already computed.
 * A random per-import temp dir would give every worker a different, nonexistent path. A fixed path
 * that every realm derives identically, with `mkdirSync(..., {recursive:true})` idempotently
 * ensuring it exists, is what lets `globalSetup` (main process, runs once) and every worker's own
 * config load (separate processes, run per worker) agree on the same file without any IPC.
 */
const STORAGE_STATE_DIR = path.join(tmpdir(), "tovu-adversarial-auth");
mkdirSync(STORAGE_STATE_DIR, { recursive: true });
export const STORAGE_STATE_PATH = path.join(STORAGE_STATE_DIR, "storage-state.json");

function requireBaseUrl(config: FullConfig): string {
  const baseURL = config.projects[0]?.use?.baseURL;
  if (!baseURL) throw new Error("adversarial globalSetup: no baseURL on the first project");
  return baseURL;
}

/** Absorbs the same daemon-boot-vs-http-listen race `a2ui-transport-contract.spec.ts` documents:
 * `app.listen()`'s callback returns before its own `spawnAgentDaemon()` call resolves, so the very
 * first request or two after `webServer.url` first answers can 502 from `forwardToAgentDaemon`'s
 * `ECONNREFUSED` catch. Login itself does not touch the daemon, so it is not what races here — but
 * retrying past a transient 5xx keeps this setup from flaking on a cold CI box regardless. */
async function loginWithRetry(baseURL: string): Promise<Response> {
  let last: Response | undefined;
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await fetch(`${baseURL}${LOGIN_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
    });
    if (response.status < 500) return response;
    last = response;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return last!;
}

export default async function loginOnceAndSaveStorageState(config: FullConfig): Promise<void> {
  const baseURL = requireBaseUrl(config);

  const login = await loginWithRetry(baseURL);
  if (!login.ok) throw new Error(`adversarial globalSetup: login failed (${login.status})`);

  const setCookie = login.headers.getSetCookie?.() ?? [];
  if (setCookie.length === 0) throw new Error("adversarial globalSetup: login returned no Set-Cookie");

  const url = new URL(baseURL);
  const cookies = setCookie.map((raw) => {
    const [pair] = raw.split(";");
    const eq = pair.indexOf("=");
    return {
      name: pair.slice(0, eq),
      value: pair.slice(eq + 1),
      domain: url.hostname,
      path: "/",
      // Playwright's storageState schema requires every one of these fields explicitly — no
      // per-field defaulting — even though the real cookie (`dev-auth.ts`) sets them all too
      // (`HttpOnly; SameSite=Strict; Secure`). `expires` has no real Max-Age to copy (a session
      // cookie), so 24h out is used instead: well past any single test run, short enough not to
      // matter if it lingers in the OS temp dir. `secure: false` deliberately does NOT mirror the
      // real cookie's `Secure` flag — this suite's `webServer` listens on plain `http://localhost`,
      // and a `Secure` cookie would be silently dropped by Playwright's own storageState loader
      // against a non-TLS origin, reintroducing the exact 401s this file exists to eliminate.
      expires: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      httpOnly: true,
      secure: false,
      sameSite: "Strict" as const,
    };
  });

  const { writeFileSync } = await import("node:fs");
  writeFileSync(STORAGE_STATE_PATH, JSON.stringify({ cookies, origins: [] }, null, 2));
}
