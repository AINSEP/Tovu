// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import type { FullConfig } from "@playwright/test";

import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { JOURNEY_ADMIN_PASSWORD, JOURNEY_ADMIN_USER } from "./_fixtures.js";

/**
 * Logs in ONCE through the real login route and writes the session cookie as the `storageState`
 * every journey reuses (`adversarial.globalSetup.ts` pattern). One login per run keeps the suite
 * under `LOGIN_STRICT` (10 logins / 60s / IP); only `smoke.journey.ts` drives the login form itself.
 */
const STORAGE_STATE_DIR = path.join(tmpdir(), "tovu-journeys-auth");
const STORAGE_STATE_PATH = path.join(STORAGE_STATE_DIR, "storage-state.json");

async function loginWithRetry(baseURL: string): Promise<Response> {
  let last: Response | undefined;
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await fetch(`${baseURL}/api/admin/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: JOURNEY_ADMIN_USER, password: JOURNEY_ADMIN_PASSWORD }),
    });
    if (response.status < 500) return response;
    last = response;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return last!;
}

export default async function journeysGlobalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL;
  if (!baseURL) throw new Error("journeys globalSetup: no baseURL on the first project");
  const login = await loginWithRetry(baseURL);
  if (!login.ok) throw new Error(`journeys globalSetup: login failed (${login.status})`);
  const setCookie = login.headers.getSetCookie?.() ?? [];
  if (setCookie.length === 0) throw new Error("journeys globalSetup: login returned no Set-Cookie");
  const hostname = new URL(baseURL).hostname;
  const cookies = setCookie.map((raw) => {
    const [pair] = raw.split(";");
    const eq = pair.indexOf("=");
    return {
      name: pair.slice(0, eq),
      value: pair.slice(eq + 1),
      // Cookies are host-scoped, not port-scoped: this one reaches both the admin Vite origin and
      // the public site origin on the API port.
      domain: hostname,
      path: "/",
      expires: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      httpOnly: true,
      secure: false,
      sameSite: "Strict" as const,
    };
  });
  mkdirSync(STORAGE_STATE_DIR, { recursive: true });
  writeFileSync(STORAGE_STATE_PATH, JSON.stringify({ cookies, origins: [] }, null, 2));
}
