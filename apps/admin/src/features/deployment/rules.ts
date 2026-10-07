import {
  ApiError,
  type AdminDeploymentEnvVarStatus,
  type AdminDeploymentOverview,
  type AdminExportRunSnapshot,
  type AdminPublishConnectionInput,
  type AdminPublishCredentialProviderId,
  type AdminPublishCredentialSummary,
  type AdminPublishCredentialVerification,
  type AdminPublishExecutionMode,
  type AdminPublishRunSnapshot,
  type AdminPublishTargetCredentialSpec,
  type AdminPublishTargetDescriptor,
  type AdminPublishTargetField,
  type AdminStaticPublishConfig,
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

// Full Site informational provider rows retired with that tab (2026-10-03).

/**
 * The single fixed label every connection saved through the flat per-provider credential list uses
 * (2026-08-15 redesign) — the server's `publish_credential_sets` table still enforces a UNIQUE
 * `(workspace_id, provider_id, label)`, so a label is still written on every create, it is just never
 * shown or typed by an operator anymore. Because the deploy registry names each target at most once, `(provider_id, "default")` can
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

/** The descriptor for `id`, or `undefined` while the list loads or when the id is not listed.
 *  @complexity O(t) in the (small) target count. */
export function publishTargetById(
  targets: readonly AdminPublishTargetDescriptor[] | undefined,
  id: AdminStaticPublishTargetId
): AdminPublishTargetDescriptor | undefined {
  return targets?.find((target) => target.id === id);
}

/** Whether every field `fields` marks required has a non-blank value in `values` — the one
 *  readiness rule both the publish form (config fields) and the credential form (credential fields)
 *  use, mirroring the server's own descriptor validation so a button never enables for a request
 *  the server would refuse on shape alone. @complexity O(f). */
export function requiredFieldsFilled(
  fields: readonly AdminPublishTargetField[],
  values: Readonly<Record<string, string>>
): boolean {
  return fields.every((field) => !field.required || (values[field.name] ?? "").trim() !== "");
}

/** The declared fields' values, trimmed, with blank ones dropped — so a blank optional field (a
 *  branch, a team) gets the server's own default instead of an explicit empty string, and
 *  undeclared keys never reach the wire. @complexity O(f). */
export function declaredFieldValues(
  fields: readonly AdminPublishTargetField[],
  values: Readonly<Record<string, string>>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of fields) {
    // Secrets reach the store unchanged; ordinary config values retain their existing trimming.
    const raw = values[field.name] ?? "";
    const value = field.secret ? raw : raw.trim();
    if (value !== "") out[field.name] = value;
  }
  return out;
}

/** The wire config for one publish/preview: the target plus its declared config values.
 *  @complexity O(f). */
export function buildStaticPublishConfig(
  target: AdminPublishTargetDescriptor,
  values: Readonly<Record<string, string>>
): AdminStaticPublishConfig {
  return { target: target.id, fields: declaredFieldValues(target.configFields, values) };
}

/** Whether the publish form can ask for a PREVIEW: a known target with its required config
 *  fields filled. @complexity O(f). */
export function staticPublishFormReadyForPreview(
  target: AdminPublishTargetDescriptor | undefined,
  values: Readonly<Record<string, string>>
): boolean {
  return target !== undefined && requiredFieldsFilled(target.configFields, values);
}

/** Whether the form can ask for a real PUBLISH — everything a preview needs plus a non-blank
 *  `projectName` when the host declares one (the preview has no such field). @complexity O(f). */
export function staticPublishFormReadyToPublish(
  target: AdminPublishTargetDescriptor | undefined,
  values: Readonly<Record<string, string>>,
  projectName: string
): boolean {
  const projectNameReady = target?.projectName === undefined || projectName.trim() !== "";
  return projectNameReady && staticPublishFormReadyForPreview(target, values);
}

/** The `projectName` the publish request carries. The server requires a non-blank one on every
 *  publish, but a host that declares no project name (S3-compatible storage) ignores it, so the
 *  admin hides the field and sends the host's id instead. @complexity O(1). */
export function staticPublishProjectNameToSend(target: AdminPublishTargetDescriptor, projectName: string): string {
  return target.projectName === undefined ? target.id : projectName;
}

/** Whether a credential form has enough typed to save: a non-blank token (a blank one on a
 *  connected row means "keep the stored secret", so there is nothing to send) plus every required
 *  field the host's descriptor declares. @complexity O(f). */
export function credentialFormReadyToSave(
  spec: AdminPublishTargetCredentialSpec,
  values: Readonly<Record<string, string>>
): boolean {
  return (values[spec.tokenField] ?? "").trim() !== "" && requiredFieldsFilled(spec.fields, values);
}

/** The wire connection for one host's credential form: its id plus the declared fields' trimmed,
 *  non-blank values. @complexity O(f). */
export function buildCredentialConnectionInput(
  providerId: AdminPublishCredentialProviderId,
  spec: AdminPublishTargetCredentialSpec,
  values: Readonly<Record<string, string>>
): AdminPublishConnectionInput {
  const fields = declaredFieldValues(spec.fields, values);
  // tokenField is authoritative even for a descriptor that omitted its secret flag.
  const token = values[spec.tokenField] ?? "";
  if (token === "") delete fields[spec.tokenField];
  else fields[spec.tokenField] = token;
  return { ...fields, providerId };
}

/** The project-name field's label and help. The same wire field means a different thing per host
 *  (a commit message, a site, a project), so each host's descriptor names it; a host that declares
 *  none takes no project name and gets no field (`null`). Both strings are already in the viewer's
 *  locale (`localizePublishTargets`); the translator passes them through. @complexity O(1). */
export interface StaticPublishProjectNameCopy {
  readonly labelKey: string;
  readonly helpKey: string | undefined;
}

export function staticPublishProjectNameCopy(target: AdminPublishTargetDescriptor | undefined): StaticPublishProjectNameCopy | null {
  const copy = target?.projectName;
  if (copy === undefined) return null;
  return { labelKey: copy.label, helpKey: copy.help };
}

/** A descriptor field name as an `agentHandle` segment: `agentHandle()` throws on anything but
 *  lowercase words joined by single hyphens, and one throw blanks the whole admin, so a camelCase
 *  name (`accessKeyId`) becomes `access-key-id`. @complexity O(n) in the name's length. */
export function fieldNameHandleSegment(fieldName: string): string {
  return fieldName
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The `agentHandle` id of one publish-config input. Ids predate the descriptors and are pinned by
 *  agent tooling, so `teamId` keeps its old `team` id; every other field uses its own name.
 *  @complexity O(n) in the name's length. */
export function publishConfigFieldHandleId(fieldName: string): string {
  return `deployment-static-site-publish-${fieldName === "teamId" ? "team" : fieldNameHandleSegment(fieldName)}`;
}

/** The `agentHandle`/DOM id of one credential input. The token field keeps its old `token` id and
 *  `accountId` its old `account` id (both pinned by agent tooling); every other field uses its own
 *  name. @complexity O(n) in the name's length. */
export function credentialFieldHandleId(providerId: string, fieldName: string, tokenField: string): string {
  if (fieldName === tokenField) return `deployment-static-site-credentials-token-${providerId}`;
  return `deployment-static-site-credentials-${fieldName === "accountId" ? "account" : fieldNameHandleSegment(fieldName)}-${providerId}`;
}

/** How a host's credential is named mid-sentence: its token field's own label ("API token",
 *  "Secret access key"), lower-cased unless it starts with an acronym; "access token" when the
 *  descriptor has no such field. @complexity O(f) in the credential's field count. */
export function credentialNoun(credential: AdminPublishTargetCredentialSpec): string {
  const label = credential.fields.find((field) => field.name === credential.tokenField)?.label ?? "access token";
  return /^[A-Z]{2}/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1);
}

/** Step 1's subtitle — why connecting here is necessary, which depends on `executionMode` (the
 *  server's own fact about whether this WORKSPACE can reach the operator's terminal at all — see
 *  `AdminPublishExecutionMode`'s doc in `lib/api.ts`), not on whether the selected PROVIDER has a
 *  CLI route. Otherwise it names the host's own credential ({@link credentialNoun}), never a
 *  "personal access token" a host like Cloudflare or S3 does not issue. @complexity O(f). */
export function credentialStepSubtitle(executionMode: AdminPublishExecutionMode, credential: AdminPublishTargetCredentialSpec, translate: (key: string) => string): string {
  if (executionMode === "hosted-api-only") {
    return translate("This workspace can't use your computer's terminal — connecting here is the only way to publish.");
  }
  return translate("Save your {credential} so Tovu can publish on your behalf.").replace("{credential}", credentialNoun(credential));
}

/** The help a config field, credential field or credential form shows: the descriptor's
 *  person-facing `userHelp`, else its `help` (written for the agent); `undefined` when it has
 *  neither. @complexity O(1). */
export function fieldHelpText(field: AdminPublishTargetField | AdminPublishTargetCredentialSpec): string | undefined {
  return field.userHelp ?? field.help;
}

/** The label a config or credential field shows: the descriptor's label, with the generic
 *  "(optional)" suffix key when the field is optional. The caller translates `suffixKey`.
 *  @complexity O(1). */
export function fieldLabelParts(field: AdminPublishTargetField): { label: string; suffixKey: string | null } {
  return { label: field.label, suffixKey: field.required ? null : "(optional)" };
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
 * This describes the full server's capabilities for the Overview comparison. Deployment
 * provisioning is handled by the deploy plugin; the old Full Site provider list was retired.
 */
export const FULL_SITE_CAPABILITIES: readonly DeploymentCapability[] = STATIC_SITE_CAPABILITIES.map((row) => ({
  ...row,
  supported: true,
}));

/**
 * The Overview tab's per-env-var explanatory note, as a dictionary key. `TOVU_SITE_KEY`
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
    TOVU_SITE_KEY: "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.",
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
 * The Overview env-var row's status label key. The site key row names a generated key file as its
 * source (the keyring reads the env var OR that file) and calls malformed material invalid rather
 * than "Not set", since something IS configured there and it is broken.
 * @complexity O(1).
 */
export function envVarStatusLabelKey(varStatus: AdminDeploymentEnvVarStatus): string {
  if (varStatus.invalid) return "Invalid — the keyring rejects it";
  if (!varStatus.set) return "Not set";
  return varStatus.source === "file" ? "Set (generated key file)" : "Set";
}

/**
 * The Static Site Verify status line's class. `"unreachable"` means the token was NOT checked, so it
 * reads as a warning — styling it like `"valid"` told an operator an unverified token had passed.
 * @complexity O(1).
 */
export function credentialVerifyStatusClass(row: {
  verifyError: string | null;
  verification: AdminPublishCredentialVerification | undefined;
}): "save-ok" | "save-warning" | "save-error" {
  if (row.verifyError || row.verification?.status === "invalid") return "save-error";
  return row.verification?.status === "unreachable" ? "save-warning" : "save-ok";
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
