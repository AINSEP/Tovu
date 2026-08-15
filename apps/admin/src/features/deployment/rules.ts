import type { AdminDeploymentEnvVarStatus, AdminDeploymentOverview } from "../../lib/api";

/**
 * @file Pure data and computation for the Deployment panel — no React, no fetch, no `t()` calls
 * (every function here returns a DICTIONARY KEY for a caller to translate, same convention
 * `use-page-editor.hooks.ts`'s `themeExploreSaveLabel`-style helpers follow elsewhere in this app).
 * Kept separate from the five tab components per this app's `rules.ts`-holds-the-logic convention
 * (see `integrations/rules.ts`, `recovery/rules.ts`).
 */

/** One row in the Full Site tab's provider list. `name` is a proper noun and is never translated
 *  (matches how a webhook's own `label` or a connector's own name renders verbatim elsewhere in
 *  this app); `descriptionKey` is looked up in `deployment-i18n`. `status` is always `"planned"` —
 *  there is no backend to store credentials yet, so nothing here can honestly claim `"connected"`. */
export interface FullSiteProviderRow {
  readonly id: string;
  readonly name: string;
  readonly descriptionKey: string;
  readonly status: "planned";
}

/** The six self-hosted-server providers named in the brief, in display order. One combined
 *  what-it-is/what-it-costs sentence per row — see `deployment-i18n.tsx` for the translated text. */
export const FULL_SITE_PROVIDERS: readonly FullSiteProviderRow[] = [
  {
    id: "fly",
    name: "Fly.io",
    status: "planned",
    descriptionKey: "A small always-on machine close to your visitors — roughly $2–9/mo.",
  },
  {
    id: "railway",
    name: "Railway",
    status: "planned",
    descriptionKey: "A managed container platform with a simple deploy flow — Hobby plan from $5/mo.",
  },
  {
    id: "render",
    name: "Render",
    status: "planned",
    descriptionKey:
      "A managed container platform with persistent disks — Starter plan from $7/mo (one service per disk).",
  },
  {
    id: "aws",
    name: "AWS",
    status: "planned",
    descriptionKey: "Full control over the machine, at AWS's own complexity and pricing.",
  },
  {
    id: "digitalocean",
    name: "DigitalOcean",
    status: "planned",
    descriptionKey: "A straightforward virtual machine (Droplet) — basic plans from around $4–6/mo.",
  },
  {
    id: "vps",
    name: "VPS (SSH)",
    status: "planned",
    descriptionKey: "Any server you already have SSH access to — whatever it already costs you.",
  },
] as const;

/** The four static-hosting destinations named in the brief. Proper nouns, never translated. */
export const STATIC_HOSTS: readonly string[] = ["GitHub Pages", "Vercel", "Netlify", "Cloudflare Pages"] as const;

/**
 * The Overview tab's per-env-var explanatory note, as a dictionary key. `TOVU_INTEGRATIONS_ROOT_KEY`
 * carries the "warning, not error" framing the brief asks for: unset does not fail boot, it surfaces
 * later as a 503 on the AI Assistant screen — worded here so the note itself states that, rather
 * than the UI inventing a severity color the underlying fact doesn't support.
 *
 * @complexity O(1) — one map lookup.
 */
export function deploymentEnvVarNoteKey(name: string): string {
  const notes: Record<string, string> = {
    TOVU_ADMIN_PASSWORD: "Falls back to a public default.",
    TOVU_ADMIN_USER: 'Falls back to "admin".',
    TOVU_INTEGRATIONS_ROOT_KEY: "Not required to boot — enables the AI Assistant. Missing shows there as a 503, not here.",
    JINI_AGENT_DAEMON_PORT: "Falls back to port 4319.",
  };
  return notes[name] ?? "";
}

/**
 * Whether an env var's row should read as a warning rather than neutral "not set" — currently just
 * the owner-password var, since an unset/default password is the one env-var state with a real
 * safety consequence at production boot (`production-readiness-gate.ts`'s `PRODUCTION_BOOT_UNSAFE_DEFAULT`).
 * The other three vars degrade gracefully (a daemon port default, an admin username default, a
 * later 503 on one specific screen) and do not warrant the same visual weight.
 *
 * @complexity O(1).
 */
export function isEnvVarRowUnsafe(varStatus: AdminDeploymentEnvVarStatus): boolean {
  return varStatus.name === "TOVU_ADMIN_PASSWORD" && !varStatus.set;
}

/** The Overview tab's runtime-mode label key. @complexity O(1). */
export function runtimeModeLabelKey(mode: AdminDeploymentOverview["mode"]): string {
  return mode === "production" ? "Production" : "Local";
}

/** The Overview tab's production-readiness-gate label key. `applicable: false` means the gate never
 *  ran (local mode) — see `DeploymentOverviewSnapshot.productionReadinessGate`'s own doc comment for
 *  why a request reaching this route in production mode already proves the gate passed.
 *  @complexity O(1). */
export function productionGateLabelKey(gate: AdminDeploymentOverview["productionReadinessGate"]): string {
  return gate.applicable ? "Passed" : "Not applicable (local mode)";
}

/** The Overview tab's agent-daemon status label key. @complexity O(1). */
export function daemonStatusLabelKey(daemonKnownFailed: boolean): string {
  return daemonKnownFailed ? "Known failure — check server logs." : "No known failure";
}

/** The Overview tab's owner-password status label key. @complexity O(1). */
export function ownerPasswordLabelKey(defaultOwnerPasswordUnsafe: boolean): string {
  return defaultOwnerPasswordUnsafe ? "Still the default — set TOVU_ADMIN_PASSWORD." : "Changed from the default.";
}
