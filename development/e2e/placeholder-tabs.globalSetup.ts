import type { FullConfig } from "@playwright/test";

/**
 * @file Logs in ONCE before any test in `playwright.placeholder-tabs.config.ts` runs, and saves the
 * resulting session cookie as a Playwright `storageState` file every test in that suite reuses.
 *
 * Copied from `adversarial.globalSetup.ts`'s own pattern (see that file's header for the full
 * `LOGIN_STRICT` rationale) rather than driving `Login.tsx` once via `browser.newPage()` inside a
 * `test.beforeAll` in the spec file itself — that shape was tried first here and failed: a
 * describe-level `test.use({ storageState: PATH })` applies to `beforeAll`'s own `browser.newPage()`
 * too, so the very call meant to CREATE the storage-state file tried to READ it first and hit
 * `ENOENT`. `globalSetup` runs before the config's `use.storageState` is ever consulted by any
 * fixture, which is what actually breaks that chicken-and-egg ordering.
 *
 * Written to the OS temp directory, never into the repo — same reasoning as the file this is copied
 * from: it carries a live, dev-only session cookie, and `development/e2e/` is version-controlled.
 */
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const LOGIN_PATH = "/api/admin/v1/auth/login";
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "tovu-dev";

/** Fixed path, not `mkdtempSync` — same reasoning `adversarial.globalSetup.ts` documents: every
 *  worker process re-imports this module fresh and must derive the identical path `globalSetup`
 *  (main process) already wrote to, with no IPC between them. */
const STORAGE_STATE_DIR = path.join(tmpdir(), "tovu-placeholder-tabs-auth");
mkdirSync(STORAGE_STATE_DIR, { recursive: true });
export const STORAGE_STATE_PATH = path.join(STORAGE_STATE_DIR, "storage-state.json");

function requireBaseUrl(config: FullConfig): string {
  const baseURL = config.projects[0]?.use?.baseURL;
  if (!baseURL) throw new Error("placeholder-tabs globalSetup: no baseURL on the first project");
  return baseURL;
}

/** Absorbs the same daemon-boot-vs-http-listen race `adversarial.globalSetup.ts` documents — the
 *  very first request or two after `webServer.url` first answers can transiently 5xx. */
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
  if (!login.ok) throw new Error(`placeholder-tabs globalSetup: login failed (${login.status})`);

  const setCookie = login.headers.getSetCookie?.() ?? [];
  if (setCookie.length === 0) throw new Error("placeholder-tabs globalSetup: login returned no Set-Cookie");

  const url = new URL(baseURL);
  const cookies = setCookie.map((raw) => {
    const [pair] = raw.split(";");
    const eq = pair.indexOf("=");
    return {
      name: pair.slice(0, eq),
      value: pair.slice(eq + 1),
      domain: url.hostname,
      path: "/",
      // `secure: false` deliberately does not mirror the real cookie's `Secure` flag — same reason
      // `adversarial.globalSetup.ts` documents: this suite's `webServer` is plain `http://localhost`,
      // and a `Secure` cookie would be silently dropped by Playwright's storageState loader there.
      expires: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      httpOnly: true,
      secure: false,
      sameSite: "Strict" as const,
    };
  });

  const { writeFileSync } = await import("node:fs");
  writeFileSync(STORAGE_STATE_PATH, JSON.stringify({ cookies, origins: [] }, null, 2));
}
