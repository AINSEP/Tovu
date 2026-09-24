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

/** The Static Site tab's export-status name on `lib/content-refresh-bus.ts` — see
 *  `taxonomy/rules.ts`'s `TAXONOMY_RESOURCE` for why this is a plain colocated constant rather than
 *  a shared registry. Agent-writable via `deployment_trigger_export`
 *  (`apps/website/src/features/deployments/agent-tools.ts`), which starts a run this tab polls.
 *  `use-static-export.hooks.ts`'s own header explains why the refresh is a bespoke re-fetch rather
 *  than the usual `useInvalidate()` one-liner — `run` seeds once and is never re-derived from the
 *  query afterward. There is deliberately NO sibling constant for `use-dockerfile-source.hooks.ts`:
 *  that tab holds a live, editable `draft` protected by its own etag/412-conflict machinery
 *  (`deployment_set_dockerfile` is the exact write that machinery exists to detect), and a
 *  bus-driven reload would either be inert against its one-shot seed guard or reintroduce the
 *  draft-clobber risk that guard prevents — see that hook's own file header. */
export const DEPLOYMENT_EXPORT_RESOURCE = "deployment-export";

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
 *
 * **Only valid for a tool that is NOT detected.** Handing this sentence to someone whose CLI is
 * already on PATH is the self-contradiction {@link publishAssistantRequest} exists to prevent —
 * callers must go through that chooser rather than calling this directly.
 * @complexity O(1).
 */
export function publishAssistantRequestForTool(tool: PublishCliTool): string {
  return `Install the ${tool.name}, then confirm it's on my PATH.`;
}

/**
 * The counterpart sentence for a tool that IS already detected: skip installing, just do the thing.
 * Names the destination rather than only the tool, because "publish with the GitHub CLI" is
 * ambiguous once a second GitHub-driven target exists, and the reader has a specific one selected.
 *
 * The PATH caveat {@link publishAssistantRequestForTool} documents does not need restating here.
 * If the assistant's own shell turns out not to have the tool that this server's PATH check found,
 * the assistant discovers that when it tries to run it and says so — which is strictly better than
 * asking a reader whose CLI is visibly detected to go install it again.
 * @complexity O(1).
 */
export function publishAssistantRequestForInstalledTool(tool: PublishCliTool, targetLabel: string): string {
  return `Publish my static export to ${targetLabel} with the ${tool.name}.`;
}

/**
 * Picks the request that matches what the screen is simultaneously CLAIMING about this tool.
 *
 * This exists because the two facts were rendered independently and contradicted each other
 * (2026-08-15, owner-reported): the row said `GitHub CLI · gh · Detected on this server` and then,
 * directly below it, offered "Install the GitHub CLI, then confirm it's on my PATH." to copy. One
 * chooser keyed on the SAME `installed` boolean the pill renders makes that state impossible to
 * reach — the detected pill and the copy line can no longer disagree, because they read one value.
 *
 * Deliberately not GitHub-specific. Every provider with a `cliToolId` routes through here, so a
 * fifth target that ships a CLI gets the fixed behaviour by existing rather than by remembering.
 * @complexity O(1).
 */
export function publishAssistantRequest(tool: PublishCliTool, targetLabel: string, installed: boolean): string {
  return installed ? publishAssistantRequestForInstalledTool(tool, targetLabel) : publishAssistantRequestForTool(tool);
}

/** One static-publish destination this tab's provider picker can select — pairs a
 *  `StaticPublishConfig["target"]` wire value with its display name and the {@link PublishCliTool}
 *  id its own CLI-first path uses. Order here is the provider picker's display order. */
export interface StaticPublishTargetInfo {
  readonly id: AdminStaticPublishTargetId;
  /** Proper noun — rendered verbatim, never translated, same treatment `STATIC_HOSTS` gets. */
  readonly label: string;
  /** Absent for Netlify and Cloudflare Pages (2026-08-15) — neither has a CLI this codebase drives
   *  (`PUBLISH_CLI_TOOLS` only ever listed `gh`/`vercel`; there is no equivalent Netlify/Wrangler CLI
   *  integration here), so there is no tool id to pair them with. `GettingItOnlineCard` in
   *  `StaticSiteTab.tsx` reads this as "this target has no CLI-first row to show" rather than falling
   *  back to some other target's tool — see that component's own doc for why an `?? PUBLISH_CLI_TOOLS[0]`
   *  fallback would have been a real bug (silently recommending the GitHub CLI for a Netlify publish). */
  readonly cliToolId?: string;
}

/**
 * The four static-publish destinations `triggerPublish` can actually reach — widened 2026-08-15
 * (from a github-pages/vercel-only pass) alongside `static-publish/adapter.ts`'s `buildJiniTarget`,
 * which already wraps Jini's `NetlifyDeployTarget`/`CloudflarePagesDeployTarget` the same way it
 * wraps the first two. This list and {@link PUBLISH_CREDENTIAL_PROVIDERS} now name the SAME four ids
 * — {@link AdminStaticPublishTargetId} is declared as a straight alias of
 * {@link AdminPublishCredentialProviderId} in `lib/api.ts` specifically so these two lists can never
 * list a different provider set again.
 */
export const STATIC_PUBLISH_TARGETS: readonly StaticPublishTargetInfo[] = [
  { id: "github-pages", label: "GitHub Pages", cliToolId: "gh" },
  { id: "vercel", label: "Vercel", cliToolId: "vercel" },
  { id: "netlify", label: "Netlify" },
  { id: "cloudflare-pages", label: "Cloudflare Pages" },
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
 * One provider the credential-management section can save a connection for — the SAME four ids
 * {@link STATIC_PUBLISH_TARGETS} publishes to (both trace back to `AdminPublishCredentialProviderId`
 * in `lib/api.ts`, which `AdminStaticPublishTargetId` is a straight alias of). The two lists were
 * briefly different sets (2026-08-15: the server's `static-publish/adapter.ts` and this credential
 * form shipped ahead of the "Publish directly from here" trigger UI's own Netlify/Cloudflare Pages
 * tab) — that gap is closed, and both now list the identical four providers, in the identical order.
 * Order here is the flat per-provider credential list's row order — there is no picker left to
 * order; every provider gets its own always-visible row (see {@link PUBLISH_CREDENTIAL_PROVIDERS}'s
 * own doc).
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
   *  {@link publishCredentialRowReadyToSave}'s per-provider gate. Empty for every provider except
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
 * {@link buildPublishConnectionInput} and {@link publishCredentialRowReadyToSave} read from — a
 * field that should gate saving belongs there, never hardcoded again at either call site.
 *
 * Order here is also the flat per-provider credential list's row order (StaticSiteTab.tsx's
 * `PublishCredentialsSection`, redesigned 2026-08-15 from an add/edit/delete list of named
 * connections to one always-visible row per provider — see that component's own header).
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

/** One provider row's connection fields, kept together as one shape so
 *  {@link buildPublishConnectionInput} and {@link publishCredentialRowReadyToSave} share a single
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
 * {@link publishCredentialRowReadyToSave}'s job (a blank token on an already-connected row means
 * "leave unchanged", which is a decision about whether to send a `connection` at ALL, not about how
 * to shape one once the caller has decided to).
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
 * The single fixed label every connection saved through the flat per-provider credential list uses
 * (2026-08-15 redesign) — the server's `publish_credential_sets` table still enforces a UNIQUE
 * `(workspace_id, provider_id, label)`, so a label is still written on every create, it is just never
 * shown or typed by an operator anymore. Because {@link STATIC_PUBLISH_TARGETS}/
 * {@link PUBLISH_CREDENTIAL_PROVIDERS} name each provider at most once, `(provider_id, "default")` can
 * never collide with itself within one workspace — see `use-publish-credentials.hooks.ts`'s header for
 * why a save only ever CREATES with this label when the provider has no saved connection yet, and
 * UPDATEs the existing one (by id, keeping whatever label it already has) otherwise.
 */
export const PUBLISH_CREDENTIAL_ROW_LABEL = "default";

/**
 * Every saved credential for one provider, in the order the server returned them.
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
 * Which saved connection (if any) a provider's flat credential row should treat as "connected" — the
 * group's DEFAULT row, which is also the exact row `resolveDefaultForPublish`/
 * `composePublishCredentialSource` (server-side `static-publish/credentials.ts`) actually publishes
 * with, so the row's own status can never claim "connected" for a saved credential a real publish
 * would not use. Falls back to the first saved row only as a defensive read for data saved before
 * this UI existed — the store's own write-path invariant (`decideCreateDefault`) guarantees at most
 * one row is ever marked default once any exist for a provider, so this fallback is unreachable
 * against data this UI itself ever wrote.
 * @complexity O(n) in this provider's own (small) saved-connection count.
 */
export function defaultCredentialForProvider(
  credentials: readonly AdminPublishCredentialSummary[],
  providerId: AdminPublishCredentialProviderId
): AdminPublishCredentialSummary | undefined {
  const forProvider = credentialsForProvider(credentials, providerId);
  return forProvider.find((credential) => credential.isDefault) ?? forProvider[0];
}

/**
 * The saved-credential list as it stands once the server has confirmed `promoted` as its provider's
 * default: that row replaced by the server's own summary, every OTHER row for the same provider
 * un-defaulted (the store's "`isDefault: true` always wins" rule), other providers untouched. Applied
 * only after the write has resolved — never optimistically — so it restates what the server did
 * rather than guessing ahead of it.
 *
 * Generic over any credential-summary shape carrying `id`/`providerId`/`isDefault` — both
 * `AdminPublishCredentialSummary` and `AdminSourceControlCredentialSummary` satisfy it field-for-
 * field, so the Security page's Access Tokens tab (`security/hooks/use-access-tokens.hooks.ts`'s
 * `makeDefault`) reuses this verbatim rather than reimplementing the same "promotion confirmed, list
 * stays honest even if the follow-up reconcile refetch fails" fix this hook already needed (terra
 * review 2026-09-20).
 * @complexity O(n) in the credential list's own length.
 */
export function withPromotedDefault<T extends { id: string; providerId: string; isDefault: boolean }>(
  credentials: readonly T[],
  promoted: T
): T[] {
  return credentials.map((credential) => {
    if (credential.id === promoted.id) return promoted;
    if (credential.providerId !== promoted.providerId) return credential;
    return { ...credential, isDefault: false };
  });
}

/**
 * Whether one provider's credential row has enough typed to save. There is no add-vs-edit mode and
 * no label to check anymore (2026-08-15 redesign — see {@link PUBLISH_CREDENTIAL_ROW_LABEL}'s doc):
 * "connected" vs. "not connected" is read directly off {@link AdminPublishCredentialSummary}
 * presence, not form state, so a blank token always means "nothing to save" whether or not the row
 * is already connected — leaving it blank on an already-connected row keeps the stored secret
 * untouched (see `use-publish-credentials.hooks.ts`'s header), so there is nothing that click could
 * change either way.
 * @complexity O(k) in this provider's own required-field count (at most one — `accountId` for
 *   Cloudflare Pages; every other provider needs nothing beyond the already-checked token).
 */
export function publishCredentialRowReadyToSave(fields: PublishCredentialFormFields): boolean {
  if (fields.token.trim() === "") return false;
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
 *  fields `validateStaticPublishConfig` (server-side, `static-publish/adapter.ts`) actually requires,
 *  and only for `github-pages`; `branch`/`teamId` are always optional, and vercel/netlify/
 *  cloudflare-pages need nothing at all beyond picking them (netlify/cloudflare-pages carry no
 *  target-specific field whatsoever — see `AdminStaticPublishConfig`'s own doc in `lib/api.ts`).
 *  Mirrors `parsePreviewQuery`'s own required-field set so this button never enables for a request
 *  the server would 400 on shape alone. One case per target, not an `if (target === "github-pages")
 *  ... else`, so a fifth target added here later must be given its own explicit answer rather than
 *  silently inheriting "needs nothing" from the `else` branch. @complexity O(1). */
export function staticPublishFormReadyForPreview(
  target: AdminStaticPublishTargetId,
  fields: { owner: string; repo: string }
): boolean {
  switch (target) {
    case "github-pages":
      return fields.owner.trim() !== "" && fields.repo.trim() !== "";
    case "vercel":
    case "netlify":
    case "cloudflare-pages":
      return true;
  }
}

/** Whether the form has enough to ask for a real PUBLISH — everything
 *  {@link staticPublishFormReadyForPreview} requires, plus a non-blank `projectName` (required for
 *  every target — see {@link staticPublishProjectNameCopy} for why that one field means something
 *  different per target; the preview endpoint has no equivalent field at all, since it never starts
 *  a run). @complexity O(1). */
export function staticPublishFormReadyToPublish(
  target: AdminStaticPublishTargetId,
  fields: { owner: string; repo: string; projectName: string }
): boolean {
  return fields.projectName.trim() !== "" && staticPublishFormReadyForPreview(target, fields);
}

/** The "Project name" field's label and help text — split per target because the SAME field means a
 *  genuinely different thing to each provider's own API, not one universal concept with four names:
 *  GitHub Pages uses it as the commit message subject on the `gh-pages` branch (never a "project" in
 *  any GitHub sense); Vercel, Netlify, and Cloudflare Pages each find-or-create their own
 *  project/site named after it (`adapter.ts`'s `publishStaticSite` passes the SAME `projectName`
 *  string to `jiniTarget.publish()` for all four — this function only changes what the FORM calls
 *  that string for the currently selected target, never the wire value itself). Netlify calls its
 *  own resource a "site", not a "project" — copying Vercel's "project" wording onto Netlify would be
 *  a fabricated claim about Netlify's own terminology, so it gets its own label rather than sharing
 *  Vercel's or Cloudflare Pages'. One case per target, matching every other per-target function in
 *  this file (`buildPublishConnectionInput`, `staticPublishFormReadyForPreview`) — a fifth target
 *  must get its own explicit copy, never inherit another provider's by falling through an `else`.
 *  @complexity O(1). */
export interface StaticPublishProjectNameCopy {
  readonly labelKey: string;
  readonly helpKey: string;
}

export function staticPublishProjectNameCopy(target: AdminStaticPublishTargetId): StaticPublishProjectNameCopy {
  switch (target) {
    case "github-pages":
      return {
        labelKey: "Commit message",
        helpKey: "Used as the commit message when Tovu pushes the export to the gh-pages branch.",
      };
    case "vercel":
      return {
        labelKey: "Vercel project name",
        helpKey: "Vercel finds or creates a project with this name on every publish.",
      };
    case "netlify":
      return {
        labelKey: "Site name",
        helpKey: "Netlify finds or creates a site with this name on every publish.",
      };
    case "cloudflare-pages":
      return {
        labelKey: "Project name",
        helpKey: "Cloudflare Pages finds or creates a project with this name on every publish.",
      };
  }
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
 * what `src/platform/export/route-manifest.ts` actually resolves — home, products and theme pages plus every
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
 * is boot-blocking in production (`REQUIRED_SECRETS` above; `boot-readiness-gate.ts`'s
 * the production readiness gate calls `process.exit(1)` when neither the env var nor a valid key
 * file resolves) but NOT in local/dev mode, where an unset value instead surfaces later as a 503 on
 * the AI Assistant screen — worded here so the note itself states that split, rather than the UI
 * inventing a severity color the underlying fact doesn't support.
 *
 * 2026-09-14: corrected from "Not required to boot" — that was true only for local/dev mode and
 * read as a blanket claim; the production boot gate has required it since `boot-readiness-gate.ts`'s
 * 2026-09-09 durability fix.
 *
 * @complexity O(1) — one map lookup.
 */
export function deploymentEnvVarNoteKey(name: string): string {
  const notes: Record<string, string> = {
    TOVU_ADMIN_PASSWORD: "Falls back to a public default.",
    TOVU_ADMIN_USER: 'Falls back to "admin".',
    TOVU_INTEGRATIONS_ROOT_KEY: "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.",
    JINI_AGENT_DAEMON_PORT: "Falls back to port 4319.",
  };
  return notes[name] ?? "";
}

/**
 * Whether an env var's row should read as a warning rather than neutral "not set" — malformed root
 * key material, and the owner-password var, since an unset/default password is the one env-var state with a real
 * safety consequence at production boot (`production-readiness-gate.ts`'s `PRODUCTION_BOOT_UNSAFE_DEFAULT`).
 * The other three vars degrade gracefully (a daemon port default, an admin username default, a
 * later 503 on one specific screen) and do not warrant the same visual weight.
 *
 * @complexity O(1).
 */
export function isEnvVarRowUnsafe(varStatus: AdminDeploymentEnvVarStatus): boolean {
  return varStatus.invalid === true || (varStatus.name === "TOVU_ADMIN_PASSWORD" && !varStatus.set);
}

/**
 * The Overview env-var row's status label key. The root key row names a generated key file as its
 * source (the keyring reads the env var OR that file) and calls malformed material invalid rather
 * than "Not set", since something IS configured there and it is broken.
 * @complexity O(1).
 */
export function envVarStatusLabelKey(varStatus: AdminDeploymentEnvVarStatus): string {
  if (varStatus.invalid) return "Invalid — the keyring rejects it";
  if (!varStatus.set) return "Not set";
  return varStatus.source === "file" ? "Set (generated key file)" : "Set";
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
