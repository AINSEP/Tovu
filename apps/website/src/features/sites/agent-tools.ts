/**
 * @file The Sites domain's agent-tool catalog, instantiating SPEC-016 REQ-22's
 * naming/callability convention (the same local `AgentToolDefinition`/`AgentToolSideEffect` shape
 * `features/redirects/agent-tools.ts`, `features/recovery/agent-tools.ts`, and every other domain
 * catalog already declare for itself rather than sharing one from the kit).
 *
 * Purpose:
 * One tool, `sites_duplicate_site` — the assistant half of the "a designer/developer wants one site
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

/**
 * Every agent-callable tool this domain exposes. Wired 1-for-1 by `buildSitesRegistrations` — there
 * is no `unwiredToolIds` set here, which means any future catalog entry added without a handler is
 * a build failure.
 */
export const sitesAgentToolCatalog: readonly AgentToolDefinition[] = [
  {
    name: "sites_duplicate_site",
    description: [
      "Creates a full working copy of an EXISTING site (its content — posts/pages, workspace, settings — its uploads, and its theme) under a brand-new site directory, for standing up a new client's site from a known-good starting point.",
      "The copy gets a NEW identity: a fresh internal site id, and its own config.json (display name defaults to the new folder name; the source's custom domain and fixed port are never carried over, so the new site never silently claims the source's live domain).",
      "The copy NEVER includes the source site's AI chat/conversation history — that is excluded unconditionally, not something you can opt into.",
      "Refuses if targetName already names an existing site directory (use a different targetName, or remove that directory first through other means — this tool never overwrites an existing site). Refuses if sourceName does not name a real, valid site.",
      "This is a real, disk-affecting write — a new sites/<targetName>/ directory and database are created. It is disabled entirely on deployments where site switching is off — the same flag that gates the admin Sites screen's own Create/Activate actions.",
    ].join(" "),
    sideEffects: "mutates-durable-state",
    authorization: { permission: SITES_WRITE_PERMISSION },
    inputSchema: DUPLICATE_SITE_INPUT_SCHEMA,
  },
];
