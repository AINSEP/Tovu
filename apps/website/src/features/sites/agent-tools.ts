/**
 * @file The Sites domain's agent-tool catalog, instantiating SPEC-016 REQ-22's
 * naming/callability convention (the same local `AgentToolDefinition`/`AgentToolSideEffect` shape
 * `features/redirects/agent-tools.ts`, `features/recovery/agent-tools.ts`, and every other domain
 * catalog already declare for itself rather than sharing one from the kit).
 *
 * Purpose:
 * `sites_create_site` and `sites_switch_site` (2026-10-05) call `site-admin.ts`'s `createSiteForOwner` /
 * `activateSite`, the same functions the admin Sites screen's Create/Activate routes call.
 *
 * `sites_duplicate_site` — the assistant half of the "a designer/developer wants one site
 * per client" workflow `platform/site-dir/site-registry.ts`'s own `listSites`/`createSite` already
 * serve for the admin Sites screen (2026-09-04 sites-switcher decision). It maps 1:1 onto
 * `platform/site-dir/duplicate-site.ts`'s `duplicateSite`, the same function a future admin-HTTP
 * "Duplicate" button would call — there is no separate, tool-only implementation of what
 * "duplicate a site" means.
 *
 * Deliberately a NEW standalone domain (like `site-inspection`/`site-evidence`/
 * `custom-credentials` before it — see `server/runtime/composition/tool-catalog-manifest.ts`'s own
 * header for that precedent) rather than an addition to any existing catalog: multi-site management
 * is not part of any other domain's own subject matter.
 */

export type AgentToolSideEffect = "none" | "mutates-durable-state" | "mints-token";

export interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  inputSchema?: Readonly<Record<string, unknown>>;
}

/**
 * Reused rather than invented: `system.write` is exactly what the admin Sites HTTP route already
 * gates Create/Activate on (`server/inbound/admin-http/routes/system/sites.ts`'s own header —
 * "Create/Activate are exactly the kind of system-process-affecting write `assistant-daemon.ts`'s
 * restart route already gates on `system.write`"). Duplicating a site is the same risk class: it
 * creates a new, real site directory on disk, exactly like Create does.
 */
export const SITES_WRITE_PERMISSION = "system.write";

const DUPLICATE_SITE_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sourceName", "targetName"],
  properties: {
    sourceName: {
      type: "string",
      minLength: 1,
      maxLength: 100,
      pattern: "^[a-z0-9-]+$",
      description:
        "The EXISTING site's folder name under sites/ to duplicate (as listed by the admin Sites screen) — never a filesystem path. Lowercase letters, digits, and dashes only.",
    },
    targetName: {
      type: "string",
      minLength: 1,
      maxLength: 100,
      pattern: "^[a-z0-9-]+$",
      description:
        "The NEW site's folder name under sites/. Must not already exist. Lowercase letters, digits, and dashes only — the same rule the admin Sites screen's own Create action (createSite) uses.",
    },
    displayName: {
      type: "string",
      minLength: 1,
      maxLength: 200,
      description: "The new site's display name (config.json.name). Defaults to targetName when omitted.",
    },
  },
} as const;

const CREATE_SITE_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name"],
  properties: {
    name: {
      type: "string",
      minLength: 1,
      maxLength: 100,
      pattern: "^[a-z0-9-]+$",
      description: "The NEW site's folder name under sites/. Must not already exist. Lowercase letters, digits, and dashes only.",
    },
  },
} as const;

const SWITCH_SITE_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name"],
  properties: {
    name: {
      type: "string",
      minLength: 1,
      maxLength: 100,
      pattern: "^[a-z0-9-]+$",
      description: "The folder name of an EXISTING registered site under sites/ (as returned by sites_list).",
    },
    restartNow: {
      type: "boolean",
      description: "Default true: when running under `npm run dev`, restart the dev server onto the new site a few seconds after this call. false = only save the choice.",
    },
  },
} as const;

/**
 * Every agent-callable tool this domain exposes. Wired 1-for-1 by `buildSitesRegistrations` — there
 * is no `unwiredToolIds` set here, which means any future catalog entry added without a handler is
 * a build failure.
 */
export const sitesAgentToolCatalog: readonly AgentToolDefinition[] = [
  {
    name: "sites_duplicate_site",
    description: [
      "Creates a full working copy of an EXISTING site (its content — posts/pages, workspace, settings — its uploads, themes, plugins, overrides, skills, and agent-plugins) under a brand-new site directory, for standing up a new client's site from a known-good starting point.",
      "The copy gets a NEW identity: a fresh internal site id, and its own config.json (display name defaults to the new folder name; the source's custom domain and fixed port are never carried over, so the new site never silently claims the source's live domain).",
      "The copy carries only that portable content. It NEVER includes the source site's AI chat/conversation history, its database backups or restore-point snapshots, its operational journals, or its previously published/exported output — all of those are left behind unconditionally, not something you can opt into.",
      "Refuses if targetName already names an existing site directory (use a different targetName, or remove that directory first through other means — this tool never overwrites an existing site). Refuses if sourceName does not name a real, valid site.",
      "This is a real, disk-affecting write — a new sites/<targetName>/ directory and database are created. It is disabled entirely on deployments where site switching is off — the same flag that gates the admin Sites screen's own Create/Activate actions.",
    ].join(" "),
    sideEffects: "mutates-durable-state",
    authorization: { permission: SITES_WRITE_PERMISSION },
    inputSchema: DUPLICATE_SITE_INPUT_SCHEMA,
  },
  {
    name: "sites_create_site",
    description: [
      "Creates a brand-new, empty site under sites/<name>/ from the starter template — the same thing the admin Sites screen's Create button and `tovu init` do.",
      "Does NOT switch to it: call sites_switch_site afterwards to serve it. To start from a copy of an existing site instead, use sites_duplicate_site.",
      "Refuses if name already names a site directory. Returns {name, dir, siteId}.",
      "A real, disk-affecting write. Disabled where site switching is off (the desktop app, where each site is its own window, and hosted sites).",
    ].join(" "),
    sideEffects: "mutates-durable-state",
    authorization: { permission: SITES_WRITE_PERMISSION },
    inputSchema: CREATE_SITE_INPUT_SCHEMA,
  },
  {
    name: "sites_switch_site",
    description: [
      "Makes another existing site the one this local dev server serves — the same thing the admin Sites screen's Activate button does.",
      "Saves the choice (TOVU_SITE in the repo's .env). With restartNow (default true) under `npm run dev`, the dev server then restarts onto the new site by itself a few seconds later — the chat and admin reconnect on their own; reply in one short line and stop.",
      "Without a dev supervisor (a hand-started `tovu serve`), nothing restarts. Returns {activeSiteName, restartRequired, restartInstructions, restarting} — restarting says whether a restart was started; tell the person the restartInstructions.",
      "Refuses if name is not a registered site (call sites_list first). Disabled where site switching is off (the desktop app, where each site is its own window, and hosted sites).",
    ].join(" "),
    sideEffects: "mutates-durable-state",
    authorization: { permission: SITES_WRITE_PERMISSION },
    inputSchema: SWITCH_SITE_INPUT_SCHEMA,
  },
];
