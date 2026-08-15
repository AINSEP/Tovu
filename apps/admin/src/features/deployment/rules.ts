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
 *  this app); `descriptionKey` and `costKey` are looked up in `deployment-i18n`. `status` is always
 *  `"planned"` — there is no backend to store credentials yet, so nothing here can honestly claim
 *  `"connected"`. */
export interface FullSiteProviderRow {
  readonly id: string;
  readonly name: string;
  readonly descriptionKey: string;
  /** What the host costs, as its own field rather than a clause buried at the end of
   *  `descriptionKey`. Six rows whose only visible difference is a sentence of prose all read the
   *  same at a glance; pulling the one value that actually differs into its own right-hand column
   *  is what makes the list scannable. Not a number — "AWS pricing" and "Already paid for" are the
   *  honest values for the two rows that have no published figure, and inventing one for them
   *  would be worse than an uneven column. */
  readonly costKey: string;
  readonly status: "planned";
}

/** The six self-hosted-server providers named in the brief, in display order. The wording is the
 *  same copy this tab already shipped, split at its own em-dash into what-it-is and what-it-costs —
 *  no new claim about any provider is introduced here. See `deployment-i18n.tsx` for translations. */
export const FULL_SITE_PROVIDERS: readonly FullSiteProviderRow[] = [
  {
    id: "fly",
    name: "Fly.io",
    status: "planned",
    costKey: "~$2–9/mo",
    descriptionKey: "A small always-on machine close to your visitors.",
  },
  {
    id: "railway",
    name: "Railway",
    status: "planned",
    costKey: "From $5/mo",
    descriptionKey: "A managed container platform with a simple deploy flow — Hobby plan.",
  },
  {
    id: "render",
    name: "Render",
    status: "planned",
    costKey: "From $7/mo",
    descriptionKey: "A managed container platform with persistent disks — Starter plan, one service per disk.",
  },
  {
    id: "aws",
    name: "AWS",
    status: "planned",
    costKey: "AWS pricing",
    descriptionKey: "Full control over the machine, at AWS's own complexity.",
  },
  {
    id: "digitalocean",
    name: "DigitalOcean",
    status: "planned",
    costKey: "~$4–6/mo",
    descriptionKey: "A straightforward virtual machine (Droplet), on a basic plan.",
  },
  {
    id: "vps",
    name: "VPS (SSH)",
    status: "planned",
    costKey: "Already paid for",
    descriptionKey: "Any server you already have SSH access to.",
  },
] as const;

/** The four static-hosting destinations named in the brief. Proper nouns, never translated. */
export const STATIC_HOSTS: readonly string[] = ["GitHub Pages", "Vercel", "Netlify", "Cloudflare Pages"] as const;

/** One row of the two paths' capability comparison. `supported` is a fact about the PATH, not about
 *  whether Tovu can currently deploy to it — see {@link STATIC_SITE_CAPABILITIES}. */
export interface DeploymentCapability {
  readonly id: string;
  readonly labelKey: string;
  readonly supported: boolean;
}

/**
 * What a static export can and cannot serve.
 *
 * Every row restates something this panel already asserted in prose, so the list adds legibility
 * and no new claims: the three `false` rows are the three items in the tab's own existing warning
 * ("No checkout, no admin online, no assistant, no dynamic anything"), and the one `true` row is
 * what `src/export/route-manifest.ts` actually resolves — home, products and theme pages plus every
 * published post, which is also exactly what the Static Site tab's own build copy says the exporter
 * writes.
 *
 * This describes the OUTPUT of an export, which exists and works today from the CLI. It is not a
 * claim that this screen can trigger one — that is the disabled action's own separate, stated
 * reason.
 */
export const STATIC_SITE_CAPABILITIES: readonly DeploymentCapability[] = [
  { id: "content", labelKey: "Pages, posts & products", supported: true },
  { id: "checkout", labelKey: "Checkout & orders", supported: false },
  { id: "admin", labelKey: "Admin panel, online", supported: false },
  { id: "assistant", labelKey: "AI assistant", supported: false },
] as const;

/**
 * What the full server serves — the same four rows, all supported, which is the whole point of
 * showing them side by side: the difference between the two paths becomes a shape you can see
 * rather than two sentences you have to hold in your head and diff.
 *
 * "Everything works" is a claim about the SOFTWARE, which is true and is the copy this tab already
 * shipped. What does not exist yet is provisioning — no route on this instance can reach
 * `features/deployments/`, which is why the path card's own footer says so and why the Providers
 * list below carries a `"planned"` status on every row.
 */
export const FULL_SITE_CAPABILITIES: readonly DeploymentCapability[] = STATIC_SITE_CAPABILITIES.map((row) => ({
  ...row,
  supported: true,
}));

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
