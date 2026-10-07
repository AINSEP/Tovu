// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import type { FullConfig } from "@playwright/test";

import { writeFileSync } from "node:fs";

import { JOURNEY_ADMIN_PASSWORD, JOURNEY_ADMIN_USER, type IsolatedJourneySite } from "../support/isolated-journey-site.js";
import { waitForAgentDaemon } from "../daemon-ready.js";
import { CODEX_JOURNEY } from "../support/assistant-journey-state.js";

/**
 * Logs in ONCE per isolated site through the real login route and writes the session cookie as
 * the `storageState` its projects reuse (`adversarial.globalSetup.ts` pattern). This keeps the suite
 * under `LOGIN_STRICT` (10 logins / 60s / IP); only `smoke.journey.ts` drives the login form itself.
 */
async function loginWithRetry(baseURL: string): Promise<Response> {
  let last: Response | undefined;
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await fetch(`${baseURL}/api/admin/v1/auth/login`, {
      method: "POST",
      redirect: "error",
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
  const sites = new Map<string, IsolatedJourneySite>();
  // Validate provenance BEFORE submitting credentials. FullConfig.webServer is null for an
  // array of servers, so use the runner-owned descriptor rather than that normalized field.
  for (const project of config.projects) {
    const site = (project.metadata.isolatedJourneySite ?? config.metadata.isolatedJourneySite) as IsolatedJourneySite | undefined;
    if (!site || site.ownerPid !== process.pid || project.use.baseURL !== site.adminURL
      || site.adminURL !== `http://127.0.0.1:${site.ports.admin}`
      || project.use.storageState !== site.storageState) {
      throw new Error("journeys globalSetup requires the isolated site created by its config");
    }
    sites.set(site.runtimeDir, site);
  }
  if (!sites.size) throw new Error("journeys globalSetup requires the isolated site created by its config");
  for (const site of sites.values()) await loginToSite(site);
}

async function loginToSite(site: IsolatedJourneySite): Promise<void> {
  const baseURL = site.adminURL;
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
  writeFileSync(site.storageState, JSON.stringify({ cookies, origins: [] }, null, 2), { mode: 0o600 });
  if (site.runtime === "local-cli") {
    process.env.E2E_API_PORT = String(site.ports.api);
    process.env.E2E_AGENT_DAEMON_PORT = String(site.ports.daemon);
    // The daemon starts only after all first-boot seeders (including settings) have settled.
    await waitForAgentDaemon();
    const cookie = cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
    // Persist the runtime explicitly through the real settings route. The fresh seed normally
    // defaults to Local CLI, but pin the requested agent so another installed CLI cannot become
    // the selection. Unset keeps the existing live chat suite's Claude selection.
    const agentId = CODEX_JOURNEY ? "codex" : "claude";
    for (const [key, valueJson] of [["mode", "local-cli"], ["localCli.agentId", agentId]]) {
      const saved = await fetch(`${baseURL}/api/admin/v1/workspaces/workspace-local/settings/value`, {
        method: "PUT", redirect: "error",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ namespace: "core.execution", key, scope: "workspace", valueJson }),
      });
      if (!saved.ok) throw new Error(`journeys globalSetup: could not select ${agentId} Local CLI (${key}, ${saved.status})`);
    }
    console.log(`[isolated chat] ${CODEX_JOURNEY ? "Codex" : "Claude Code"} Local CLI; admin ${site.adminURL}; API ${site.apiURL}; site ${site.siteDir}`);
  }
}
