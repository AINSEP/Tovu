import {
  ApiError,
  type AdminDeployCliStatus,
  type AdminDeploymentEnvVarStatus,
  type AdminDeploymentOverview,
  type AdminExportRunSnapshot,
  type AdminPublishConnectionInput,
  type AdminPublishCredentialProviderId,
  type AdminPublishCredentialSummary,
  type AdminPublishRunSnapshot,
  type AdminStaticPublishTargetId,
} from "../../lib/api";

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

/** The six self-hosted-server providers named in the brief, in display order. AWS leads the list
 *  (owner's own call: "it's going to be most popular") — every other row keeps its prior relative
 *  order, so this is purely a reordering, not a re-ranking of anything else. The wording is the same
 *  copy this tab already shipped, split at its own em-dash into what-it-is and what-it-costs — no
 *  new claim about any provider is introduced here. See `deployment-i18n.tsx` for translations. */
export const FULL_SITE_PROVIDERS: readonly FullSiteProviderRow[] = [
  {
    id: "aws",
    name: "AWS",
    status: "planned",
    costKey: "AWS pricing",
    descriptionKey: "Full control over the machine, at AWS's own complexity.",
  },
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

/**
 * One command-line tool the assistant can drive to publish a static export, keyed 1:1 to a
 * {@link StaticPublishTargetInfo.cliToolId} and to `AdminDeployCliStatus.name` — the same id
 * threads through `rules.ts`, the server's `DEPLOY_CLI_NAMES`, and the wire shape, so a lookup by
 * `id` never needs a second translation table.
 *
 * `installed` used to be permanently absent here ("the server cannot see its own PATH" was true
 * through this tab's first pass on 2026-08-15). It stopped being true the same day:
 * `deployment-overview.ts`'s `isOnPath` landed and is real, committed detection — `id` is what a
 * caller joins against the live `AdminDeployCliStatus[]` from `GET .../system/deployment-overview`
 * (see {@link cliInstalledStatus}) to get a real `true`/`false`, never a third "unknown" state.
 */
export interface PublishCliTool {
  readonly id: string;
  /** Human name, e.g. "GitHub CLI". Brand noun — rendered verbatim, never translated. */
  readonly name: string;
  /** The binary as typed, e.g. `gh`. A code token — rendered verbatim and `translate="no"`. */
  readonly command: string;
  /** What this specific tool publishes to. Names its destination explicitly so the list cannot be
   *  read as covering all four `STATIC_HOSTS` — `gh` and `vercel` reach two of them, not Netlify or
   *  Cloudflare Pages. */
  readonly descriptionKey: string;
}

/**
 * The two CLIs worth having installed before publishing a static export.
 *
 * Why these two and why a CLI at all: Tovu's assistant is a spawned coding-agent CLI (project
 * memory: `@jini-ai/agent-runtime` PATH detection, no API key), so it has a real shell. If a tool
 * is present it can run it directly — which needs no token pasted into this admin, no credential
 * stored, and no provider adapter. That is a smaller and more capable path than the token-based
 * one, which is why the tab presents it first, PER PROVIDER (see {@link STATIC_PUBLISH_TARGETS} —
 * a reader who only has `gh` installed and only wants GitHub Pages must see just this one row, not
 * both, so callers look up a single tool by {@link StaticPublishTargetInfo.cliToolId} rather than
 * rendering this whole list together).
 */
export const PUBLISH_CLI_TOOLS: readonly PublishCliTool[] = [
  {
    id: "gh",
    name: "GitHub CLI",
    command: "gh",
    descriptionKey: "Creates the repo, pushes the exported folder, and switches GitHub Pages on.",
  },
  {
    id: "vercel",
    name: "Vercel CLI",
    command: "vercel",
    descriptionKey: "Deploys the exported folder straight to Vercel.",
  },
] as const;

/** Looks up whether one CLI is on the server's PATH from the live `deployClis` array
 *  (`AdminDeploymentOverview.deployClis`) — the real, per-tool boolean {@link PublishCliTool}'s own
 *  doc comment describes. `false` (never `undefined`) when the name is absent, since the server's
 *  fixed `DEPLOY_CLI_NAMES` list always reports both known tools once the overview snapshot has
 *  loaded at all — an absent entry only happens before that first load, which callers already gate
 *  on separately (same "snapshot undefined = still loading" convention every other tab in this
 *  panel follows).
 *  @complexity O(1) — the array has exactly two entries. */
export function cliInstalledStatus(deployClis: readonly AdminDeployCliStatus[], toolId: string): boolean {
  return deployClis.find((cli) => cli.name === toolId)?.installed ?? false;
}

/**
 * The exact sentence to say to the assistant to install ONE tool, kept here rather than inline in
 * the component because it is the one string on this screen people copy verbatim and paste
 * elsewhere. Per-tool rather than the two-tool joint sentence this used to be
 * ("Install the GitHub CLI and the Vercel CLI…") — a reader who only wants GitHub Pages should
 * never be handed a request that also asks the assistant to install Vercel's CLI (this file's own
 * "SPLIT the two CLIs" brief item).
 *
 * The trailing "confirm it's on my PATH" is doing real work, not padding: `deployment-overview.ts`
 * checks this SERVER process's PATH, which is not necessarily the same shell the assistant's own
 * spawned CLI runs in — the assistant, running in that actual shell, can give a second, definitive
 * answer the admin's own detection cannot.
 * @complexity O(1).
 */
export function publishAssistantRequestForTool(tool: PublishCliTool): string {
  return `Install the ${tool.name}, then confirm it's on my PATH.`;
}

/** One static-publish destination this tab's provider picker can select — pairs a
 *  `StaticPublishConfig["target"]` wire value with its display name and the {@link PublishCliTool}
 *  id its own CLI-first path uses. Order here is the provider picker's display order. */
export interface StaticPublishTargetInfo {
  readonly id: AdminStaticPublishTargetId;
  /** Proper noun — rendered verbatim, never translated, same treatment `STATIC_HOSTS` gets. */
  readonly label: string;
  readonly cliToolId: string;
}

export const STATIC_PUBLISH_TARGETS: readonly StaticPublishTargetInfo[] = [
  { id: "github-pages", label: "GitHub Pages", cliToolId: "gh" },
  { id: "vercel", label: "Vercel", cliToolId: "vercel" },
] as const;

/**
 * A field the credential form can show for one provider's connection, beyond the universal `token`
 * (rendered unconditionally, never listed as any one provider's field). Cloudflare Pages' `accountId`
 * is the ONLY member — see {@link AdminPublishConnectionInput}'s own doc for why the other three
 * providers' account scoping (GitHub's `owner`/`repo`, Vercel's `teamId`) lives on the publish TARGET
 * config instead of the credential: a field with somewhere else to live does not get a second, driftable
 * copy here. Kept as a union (of one) rather than inlined as a string literal so a future provider that
 * needs its own extra field extends this type in one place, matching every other per-provider table in
 * this file.
 */
export type PublishCredentialFieldKey = "accountId";

/**
 * One provider the credential-management section can save a connection for — WIDER than
 * {@link STATIC_PUBLISH_TARGETS}: the SERVER now has a real publish adapter for all four providers
 * (`static-publish/adapter.ts`'s `buildJiniTarget` wraps Jini's `NetlifyDeployTarget`/
 * `CloudflarePagesDeployTarget` exactly like it does `GitHubPagesDeployTarget`/`VercelDeployTarget`,
 * and `publish-site.ts`'s trigger route already parses all four `target` values), but THIS admin's
 * own "Publish directly from here" trigger UI (`AdminStaticPublishTargetId`, `STATIC_PUBLISH_TARGETS`
 * below) still only has a provider tab, config-building, and preview wiring for github-pages/vercel —
 * a credential for Netlify/Cloudflare Pages can be saved and validated today (this section), ahead
 * of a later UI pass that adds their own trigger tab. See `AdminPublishCredentialProviderId`'s own
 * doc in `lib/api.ts` for why the credential store is intentionally the wider of the two sets. Order
 * here is the provider picker's display order in the credential form.
 */
export interface PublishCredentialProviderInfo {
  readonly id: AdminPublishCredentialProviderId;
  /** Proper noun — rendered verbatim, never translated, same treatment `StaticPublishTargetInfo.label` gets. */
  readonly label: string;
  /** Where to create a token for this provider. Always opened in a new tab — a third-party
   *  account-security page has no business rendering inside this admin. */
  readonly tokenPageUrl: string;
  /** Short, inline scope guidance shown under this provider's form — a dictionary key, translated
   *  the same as every other chrome string on this tab. States what KIND of token is needed, not
   *  how OAuth or PATs work in general. */
  readonly scopeGuidanceKey: string;
  /** Fields (beyond the universal `token`) this provider cannot function without —
   *  {@link publishCredentialFormReadyToSubmit}'s per-provider gate. Empty for every provider except
   *  Cloudflare Pages, which cannot resolve a project without its `accountId` — see
   *  {@link AdminPublishConnectionInput}'s doc for why every other provider's account scoping moved
   *  off the credential entirely rather than staying here as an optional field (there is no longer
   *  an "optional" field on this form at all: a field is either required, or it isn't part of the
   *  credential). */
  readonly requiredFields: readonly PublishCredentialFieldKey[];
}

/**
 * The four providers a publish credential can be saved for, verified against each provider's own
 * token-creation docs (design doc header, 2026-08-15; field set narrowed the same day — see
 * {@link AdminPublishConnectionInput}'s doc for why `owner`/`repo`/`teamId`/`siteId`/`projectName`
 * are NOT credential fields). `requiredFields` is the single source both
 * {@link buildPublishConnectionInput} and {@link publishCredentialFormReadyToSubmit} read from — a
 * field that should gate submission belongs there, never hardcoded again at either call site.
 */
export const PUBLISH_CREDENTIAL_PROVIDERS: readonly PublishCredentialProviderInfo[] = [
  {
    id: "github-pages",
    label: "GitHub Pages",
    tokenPageUrl: "https://github.com/settings/tokens",
    scopeGuidanceKey:
      'Needs a classic personal access token with the "repo" scope, or a fine-grained token with Contents and Pages permissions set to Read and write.',
    requiredFields: [],
  },
  {
    id: "vercel",
    label: "Vercel",
    tokenPageUrl: "https://vercel.com/account/tokens",
    scopeGuidanceKey: "An access token from your Vercel account.",
    requiredFields: [],
  },
  {
    id: "netlify",
    label: "Netlify",
    tokenPageUrl: "https://app.netlify.com/user/applications#personal-access-tokens",
    scopeGuidanceKey: "A personal access token from your Netlify account.",
    requiredFields: [],
  },
  {
    id: "cloudflare-pages",
    label: "Cloudflare Pages",
    tokenPageUrl: "https://dash.cloudflare.com/profile/api-tokens",
    scopeGuidanceKey:
      "Needs an API token with Cloudflare Pages Edit permission, plus the account ID shown on your Cloudflare dashboard's own sidebar — Cloudflare cannot resolve a project without it.",
    requiredFields: ["accountId"],
  },
] as const;

/** Looks up one provider's registry entry, falling back to the first (GitHub Pages) — the same
 *  "the picker can never select something absent from its own list" guarantee
 *  `STATIC_PUBLISH_TARGETS.find(...) ?? STATIC_PUBLISH_TARGETS[0]!` already relies on in
 *  `StaticSiteTab.tsx`. @complexity O(1) — the array has exactly four entries. */
export function publishCredentialProviderInfo(id: AdminPublishCredentialProviderId): PublishCredentialProviderInfo {
  return PUBLISH_CREDENTIAL_PROVIDERS.find((provider) => provider.id === id) ?? PUBLISH_CREDENTIAL_PROVIDERS[0]!;
}

/** The credential form's full field set, kept together as one shape so
 *  {@link buildPublishConnectionInput} and {@link publishCredentialFormReadyToSubmit} share a single
 *  parameter type — mirrors `use-static-publish.hooks.ts`'s own `buildConfig` fields parameter.
 *  `accountId` is the only per-provider field left (Cloudflare Pages only) now that GitHub's
 *  `owner`/`repo` and Vercel's `teamId` live on the publish target config instead — see
 *  {@link AdminPublishConnectionInput}'s doc. */
export interface PublishCredentialFormFields {
  providerId: AdminPublishCredentialProviderId;
  token: string;
  accountId: string;
}

/**
 * Builds the wire {@link AdminPublishConnectionInput} from the form's current field values — the one
 * function that decides which fields matter for which provider, mirroring `buildConfig` in
 * `use-static-publish.hooks.ts`. `accountId` is trimmed and included only for `cloudflare-pages`
 * (required there, absent everywhere else — there is no blank-omits-it case left since it is the
 * only remaining per-provider field, and it is required whenever it applies).
 *
 * Always trims and includes `token`, even when blank — detecting "no new token typed" is
 * {@link publishCredentialFormReadyToSubmit}'s job (in edit mode a blank token means "leave
 * unchanged", which is a decision about whether to send a `connection` at ALL, not about how to
 * shape one once the caller has decided to).
 * @complexity O(1).
 */
export function buildPublishConnectionInput(fields: PublishCredentialFormFields): AdminPublishConnectionInput {
  const token = fields.token.trim();
  switch (fields.providerId) {
    case "github-pages":
      return { providerId: "github-pages", token };
    case "vercel":
      return { providerId: "vercel", token };
    case "netlify":
      return { providerId: "netlify", token };
    case "cloudflare-pages":
      return { providerId: "cloudflare-pages", token, accountId: fields.accountId.trim() };
  }
}

/**
 * Every saved credential for one provider, in the order the server returned them — the shared lookup
 * behind two independent decisions that both need the SAME count: whether
 * {@link PublishCredentialList}'s per-row "Default"/"Make default" chrome should render at all (never
 * for a provider with only one saved connection — see that component's own header for why), and
 * whether the add/edit form's "set as default" checkbox should render (never when this credential
 * would be the only one saved for its provider, for the identical reason). A single function so both
 * call sites can never drift on what "only one" means.
 * @complexity O(n) in this workspace's total saved-credential count (small — see
 *   `PublishCredentialSetRepoPort.listByWorkspace`'s own doc for why no cap is needed).
 */
export function credentialsForProvider(
  credentials: readonly AdminPublishCredentialSummary[],
  providerId: AdminPublishCredentialProviderId
): AdminPublishCredentialSummary[] {
  return credentials.filter((credential) => credential.providerId === providerId);
}

/**
 * Whether the credential form has enough filled in to submit. `mode: "add"` always requires a
 * non-blank token (there is no stored secret yet to fall back to); `mode: "edit"` treats a blank
 * token as "leave the stored secret untouched" and, in that case, skips the per-provider field
 * checks entirely — those fields describe a NEW connection this half-filled form is not sending, so
 * requiring them would block a pure label rename. See `use-publish-credentials.hooks.ts`'s header
 * for why blank-token-means-unchanged is the only way this form can ever express "edit the label,
 * keep the secret" — the alternative (a stored credential's fields round-tripping into this form)
 * is exactly what "never readable back" forbids.
 * @complexity O(k) in this provider's own required-field count (at most one — `accountId` for
 *   Cloudflare Pages; every other provider needs nothing beyond the already-checked token).
 */
export function publishCredentialFormReadyToSubmit(
  fields: PublishCredentialFormFields,
  mode: "add" | "edit",
  label: string
): boolean {
  if (label.trim() === "") return false;
  const token = fields.token.trim();
  if (mode === "add" && token === "") return false;
  if (mode === "edit" && token === "") return true;
  const info = publishCredentialProviderInfo(fields.providerId);
  return info.requiredFields.every((field) => fields[field].trim() !== "");
}

/** What a rejected credential create/update means for the FORM — a dictionary-key-shaped result
 *  for `use-publish-credentials.hooks.ts` to translate and apply, same "return a fact, never call
 *  `t()`" convention this file's own header states. `"generic"` is the catch-all every other kind
 *  falls back to (an unreachable server, an unexpected 500, …), handled by the caller's own
 *  `describeApiError`-wrapped template rather than by this function. */
export type PublishCredentialSubmitFailure = { kind: "duplicate-label" } | { kind: "validation"; detail: string } | { kind: "generic" };

/**
 * Classifies a rejected `createCredential`/`updateCredential` call. Checks BOTH `e.code` and
 * `e.message` for the two known markers (`DUPLICATE_LABEL`, `VALIDATION`) rather than only one:
 * this app's usual server shape is `{ error: <human message>, code: <MACHINE_CODE> }` (see
 * `workspace/rules.ts`'s own `describeApiError` override for the precedent), but the dispatched API
 * contract for this route writes `409 -> { error: "DUPLICATE_LABEL" }` and
 * `400 -> { error: "VALIDATION", detail }` with no separate `code` field at all — `request()`
 * (`lib/api.ts`) puts `body.error` into `e.message` and `body.code` into `e.code`, so whichever
 * shape the concurrently-built backend actually sends, one of the two carries the marker.
 * @complexity O(1).
 */
export function classifyPublishCredentialSubmitError(e: unknown): PublishCredentialSubmitFailure {
  if (!(e instanceof ApiError)) return { kind: "generic" };
  const marker = e.code ?? e.message;
  if (marker === "DUPLICATE_LABEL") return { kind: "duplicate-label" };
  if (marker === "VALIDATION") {
    const detail = typeof e.body?.detail === "string" ? e.body.detail : e.message;
    return { kind: "validation", detail };
  }
  return { kind: "generic" };
}

/** Whether the publish form has enough filled in to ask for a PREVIEW — `owner`/`repo` are the only
 *  fields `validateStaticPublishConfig` (server-side, `static-publish/adapter.ts`) actually requires
 *  for `github-pages`; `branch`/`teamId` are always optional, and `vercel` needs nothing at all
 *  beyond picking it. Mirrors `parsePreviewQuery`'s own required-field set so this button never
 *  enables for a request the server would 400 on shape alone. @complexity O(1). */
export function staticPublishFormReadyForPreview(
  target: AdminStaticPublishTargetId,
  fields: { owner: string; repo: string }
): boolean {
  if (target === "vercel") return true;
  return fields.owner.trim() !== "" && fields.repo.trim() !== "";
}

/** Whether the form has enough to ask for a real PUBLISH — everything
 *  {@link staticPublishFormReadyForPreview} requires, plus a non-blank `projectName` (required for
 *  both targets; the preview endpoint has no equivalent field at all, since it never starts a run).
 *  @complexity O(1). */
export function staticPublishFormReadyToPublish(
  target: AdminStaticPublishTargetId,
  fields: { owner: string; repo: string; projectName: string }
): boolean {
  return fields.projectName.trim() !== "" && staticPublishFormReadyForPreview(target, fields);
}

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

/** The `.status` tone a run's pill should use, shared between the export and publish run slots —
 *  both are `"idle"|"running"|"completed"|"errored"`, and only the "completed" case needs a second
 *  input (`ok`) to tell a real success apart from a completed-but-failed outcome (an export whose
 *  routes failed, or a publish `StaticPublishOutcome` with `ok: false`). @complexity O(1). */
export function runStatusTone(
  status: "idle" | "running" | "completed" | "errored",
  ok: boolean | undefined
): "neutral" | "warning" | "ok" | "error" {
  if (status === "idle") return "neutral";
  if (status === "running") return "warning";
  if (status === "errored") return "error";
  return ok === false ? "error" : "ok";
}

/** The Static Site tab's export-run status label key — `run` is `undefined` before the first poll
 *  has resolved, which reads the same as `"idle"` (nothing has ever run in THIS browser session's
 *  view of it either). @complexity O(1). */
export function exportRunStatusLabelKey(run: Pick<AdminExportRunSnapshot, "status" | "ok"> | undefined): string {
  const status = run?.status ?? "idle";
  if (status === "idle") return "Not started";
  if (status === "running") return "Exporting…";
  if (status === "errored") return "Export failed";
  return run?.ok === false ? "Finished with failures" : "Export finished";
}

/** The Static Site tab's publish-run status label key — same `undefined`-reads-as-idle convention
 *  {@link exportRunStatusLabelKey} documents, and the same `result.ok` distinction for a completed
 *  run that nonetheless failed (bad config, no credential, a rejected provider call — see
 *  `StaticPublishOutcome`'s own `code` union). @complexity O(1). */
export function publishRunStatusLabelKey(run: Pick<AdminPublishRunSnapshot, "status" | "result"> | undefined): string {
  const status = run?.status ?? "idle";
  if (status === "idle") return "Not started";
  if (status === "running") return "Publishing…";
  if (status === "errored") return "Publish failed";
  return run?.result?.ok === false ? "Publish failed" : "Published";
}
