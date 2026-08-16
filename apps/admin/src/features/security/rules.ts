import {
  ApiError,
  type AdminPublishConnectionInput,
  type AdminPublishCredentialProviderId,
  type AdminSourceControlConnectionInput,
  type AdminSourceControlProviderId,
} from "../../lib/api";
import {
  PUBLISH_CREDENTIAL_PROVIDERS,
  PUBLISH_CREDENTIAL_ROW_LABEL,
  buildPublishConnectionInput,
} from "../deployment/rules";
import {
  SOURCE_CONTROL_CREDENTIAL_ROW_LABEL,
  SOURCE_CONTROL_PROVIDERS,
  buildSourceControlConnectionInput,
} from "../source-control/rules";

/**
 * @file Pure data and computation for the Security page's Access Tokens tab — no React, no fetch,
 * no `t()` calls (every function here returns a dictionary key or plain fact for a caller to
 * translate/render). Same `rules.ts`-holds-the-logic convention `deployment/rules.ts`/
 * `source-control/rules.ts` follow.
 *
 * ## What this file does NOT reinvent
 *
 * This page is a UI consolidation over two credential stores that already exist and already work —
 * `publish_credential_sets` (`deployment/rules.ts`'s `PUBLISH_CREDENTIAL_PROVIDERS`) and
 * `source_control_credential_sets` (`source-control/rules.ts`'s `SOURCE_CONTROL_PROVIDERS`). Every
 * provider's display label, token-creation URL, and scope-guidance copy is READ from those two
 * files, never redeclared here — the owner's 2026-08-15 narrowing of that guidance text
 * (`source-control/rules.ts`'s own header records it) stays the one place it's written. Connection
 * shaping is the same story: {@link buildAccessTokenConnectionInput} below dispatches to
 * `buildPublishConnectionInput`/`buildSourceControlConnectionInput` rather than re-deriving either
 * provider's wire shape.
 *
 * ## The two-store "GitHub" trap this file exists to not get wrong
 *
 * `github-pages` (a publish target, `publish_credential_sets`) and `github` (a source-control
 * identity, `source_control_credential_sets`) are two different tables, two different scopes, two
 * different tokens an operator creates separately on GitHub's own site — see
 * `ADS-memory/reports/continuity/2026-08-16-session-6-handoff.md`'s "Publish-credential reuse" note
 * for the exact mismatch this has already bitten once. Every {@link AccessTokenProviderRef} and
 * {@link AccessTokenRow} below carries an explicit `kind` precisely so a caller can never merge the
 * two into one row — {@link ACCESS_TOKEN_PROVIDERS} lists both as separate entries even though they
 * share the "GitHub" proper noun.
 */

/** Which of the two credential stores a row belongs to. */
export type AccessTokenKind = "publish" | "source-control";

/** A provider extra field this page's form can show, beyond the universal Name + Access token —
 *  the union of both stores' own extra-field vocab (`deployment/rules.ts`'s
 *  `PublishCredentialFieldKey`, `source-control/rules.ts`'s `SourceControlCredentialFieldKey`). */
export type AccessTokenExtraFieldKey = "accountId" | "username";

/** Identifies one provider across either store — the minimal shape enough to look up its
 *  {@link AccessTokenProviderInfo} entry or build its connection input. `providerId` is left as
 *  `string` (not the store's own strict union) deliberately: this ref is a client-side grouping key
 *  built exhaustively from {@link ACCESS_TOKEN_PROVIDERS}' own two fixed source tables, never from
 *  free-form input, so the real type safety that matters — the wire shape a create/update actually
 *  sends — lives in {@link buildAccessTokenConnectionInput}'s dispatch to each store's own strictly
 *  typed builder, not in this grouping key. */
export interface AccessTokenProviderRef {
  readonly kind: AccessTokenKind;
  readonly providerId: string;
}

/** One provider row this page can render — a `kind`-tagged merge of `PublishCredentialProviderInfo`/
 *  `SourceControlProviderInfo`, plus `purposeLabel` (new here): the subtitle that keeps `github-pages`
 *  and `github` from reading as the same credential (this file's own header, "the two-store GitHub
 *  trap"). Omitted (undefined) for a provider whose brand name is not shared with any other store
 *  today — showing a purpose subtitle only when a name actually needs disambiguating avoids the
 *  visual-spec's own "never merge into one card" rule reading as "always show extra chrome". */
export interface AccessTokenProviderInfo {
  readonly kind: AccessTokenKind;
  readonly providerId: string;
  /** Proper noun — rendered verbatim, never translated, same treatment every provider label in this
   *  app gets. */
  readonly label: string;
  /** Set for every provider today: `github-pages`/`github` need it to disambiguate, and the other
   *  five get it anyway rather than making disambiguation conditional on which OTHER providers this
   *  workspace happens to have connected — a static fact per provider is simpler to reason about
   *  than one that depends on the rest of the list. */
  readonly purposeLabel: string;
  readonly tokenPageUrl: string;
  readonly scopeGuidanceKey: string;
  readonly requiredFields: readonly AccessTokenExtraFieldKey[];
}

/**
 * The seven providers this page can save a named token for — four from `PUBLISH_CREDENTIAL_PROVIDERS`
 * (github-pages, vercel, netlify, cloudflare-pages), three from `SOURCE_CONTROL_PROVIDERS` (github,
 * gitlab, bitbucket). `s3-compatible` (a fifth server-side publish provider,
 * `publish-credentials/types.ts`) is deliberately absent — it has no admin UI anywhere yet
 * (`AdminPublishConnectionInput`, `lib/api.ts`, only declares the same four this page's Tier 1 list
 * mirrors), so this page has nothing to read/write for it either; adding it here ahead of the rest of
 * the admin would let this page claim a capability the product does not have.
 *
 * Order: publish providers first (GitHub Pages, Vercel, Netlify, Cloudflare Pages), then
 * source-control providers (GitHub, GitLab, Bitbucket) — matches each origin table's own order,
 * concatenated rather than interleaved so a reader scanning top-to-bottom sees "deploy targets, then
 * source identities" as two recognizable blocks.
 */
export const ACCESS_TOKEN_PROVIDERS: readonly AccessTokenProviderInfo[] = [
  ...PUBLISH_CREDENTIAL_PROVIDERS.map(
    (provider): AccessTokenProviderInfo => ({
      kind: "publish",
      providerId: provider.id,
      label: provider.label,
      purposeLabel: "Publishing",
      tokenPageUrl: provider.tokenPageUrl,
      scopeGuidanceKey: provider.scopeGuidanceKey,
      requiredFields: provider.requiredFields,
    })
  ),
  ...SOURCE_CONTROL_PROVIDERS.map(
    (provider): AccessTokenProviderInfo => ({
      kind: "source-control",
      providerId: provider.id,
      label: provider.label,
      purposeLabel: "Source Control",
      tokenPageUrl: provider.tokenPageUrl,
      scopeGuidanceKey: provider.scopeGuidanceKey,
      requiredFields: provider.requiredFields,
    })
  ),
];

/** Looks up one provider's registry entry, falling back to the first (GitHub Pages) — same
 *  "the row list can never render something absent from its own table" guarantee
 *  `publishCredentialProviderInfo`/`sourceControlProviderInfo` rely on in their own files.
 *  @complexity O(1) — the array has exactly seven entries. */
export function accessTokenProviderInfo(ref: AccessTokenProviderRef): AccessTokenProviderInfo {
  return ACCESS_TOKEN_PROVIDERS.find((p) => p.kind === ref.kind && p.providerId === ref.providerId) ?? ACCESS_TOKEN_PROVIDERS[0]!;
}

/** The two stores' fixed sentinel label — every row Static Site/Source Control ever wrote before
 *  this page existed carries exactly this string (`PUBLISH_CREDENTIAL_ROW_LABEL`/
 *  `SOURCE_CONTROL_CREDENTIAL_ROW_LABEL`, both `"default"` today, kept as two separately-imported
 *  constants rather than one shared literal so a future divergence between the two stores' own
 *  constants is not silently missed here). */
function legacySentinelLabel(kind: AccessTokenKind): string {
  return kind === "publish" ? PUBLISH_CREDENTIAL_ROW_LABEL : SOURCE_CONTROL_CREDENTIAL_ROW_LABEL;
}

/** The auto-generated display name for a legacy sentinel-labeled row — brief's own requirement
 *  ("give it whatever name you want", so nobody has to re-paste a token they already saved). First
 *  row for a provider gets "{Provider} token"; any additional legacy rows (not producible by any UI
 *  today, but the naming scheme must not collide if a future migration ever runs against more than
 *  one) get "{Provider} token 2", "{Provider} token 3", ...
 *  @complexity O(1). */
function friendlyLegacyName(providerLabel: string, indexAmongLegacyRows: number): string {
  return indexAmongLegacyRows === 0 ? `${providerLabel} token` : `${providerLabel} token ${indexAmongLegacyRows + 1}`;
}

/** The wire shape both `AdminPublishCredentialSummary` and `AdminSourceControlCredentialSummary`
 *  already share field-for-field except `providerId`'s literal union — the common subset this file
 *  operates on so {@link buildAccessTokenRows} needs only one implementation for both stores. */
export interface RawCredentialSummary {
  readonly id: string;
  readonly providerId: string;
  readonly label: string;
  readonly isDefault: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** One saved token as this page renders it — `name` is always display-ready (the real saved label,
 *  or a computed {@link friendlyLegacyName} for a legacy sentinel-labeled row); `rawLabel` is kept
 *  alongside it so {@link planLegacyLabelMigrations} can tell which rows still need the one-time
 *  rename write, and so a genuine uniqueness check can compare against what the server actually has
 *  stored rather than only against display names. */
export interface AccessTokenRow {
  readonly kind: AccessTokenKind;
  readonly providerId: string;
  readonly id: string;
  readonly name: string;
  readonly rawLabel: string;
  readonly isDefault: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Builds every row for ONE store (all providers within it) from the server's own summaries, in the
 * order the server returned them. Legacy-name numbering is computed per PROVIDER, in the order rows
 * for that provider appear in `raws` — matches {@link friendlyLegacyName}'s own "first row, second
 * row, ..." framing.
 * @complexity O(n) in this store's total saved-credential count (small — see
 *   `PublishCredentialSetRepoPort.listByWorkspace`'s own doc for why no cap is needed).
 */
export function buildAccessTokenRows(kind: AccessTokenKind, raws: readonly RawCredentialSummary[]): AccessTokenRow[] {
  const sentinel = legacySentinelLabel(kind);
  const legacyIndexByProvider = new Map<string, number>();
  return raws.map((raw) => {
    const isLegacy = raw.label === sentinel;
    let name = raw.label;
    if (isLegacy) {
      const index = legacyIndexByProvider.get(raw.providerId) ?? 0;
      legacyIndexByProvider.set(raw.providerId, index + 1);
      name = friendlyLegacyName(accessTokenProviderInfo({ kind, providerId: raw.providerId }).label, index);
    }
    return { kind, providerId: raw.providerId, id: raw.id, name, rawLabel: raw.label, isDefault: raw.isDefault, createdAt: raw.createdAt, updatedAt: raw.updatedAt };
  });
}

/** One row's planned one-time rename — {@link buildAccessTokenRows} already computed the target
 *  display name; this just says which rows still have the OLD sentinel label sitting in the
 *  database and therefore need a real `PUT .../:id` (label-only) to catch up. Nothing reads
 *  `rawLabel` as a key anywhere in either store (`Static Site`/`Source Control` find their row via
 *  `isDefault`, never by label text — see `deployment/hooks/use-publish-credentials.hooks.ts`'s own
 *  header), so this rename changes only what a human reads, never what either feature page does.
 *  @complexity O(n) in the row list's own (small) size. */
export interface LegacyLabelMigration {
  readonly kind: AccessTokenKind;
  readonly id: string;
  readonly newLabel: string;
}
export function planLegacyLabelMigrations(rows: readonly AccessTokenRow[]): LegacyLabelMigration[] {
  return rows.filter((row) => row.rawLabel === legacySentinelLabel(row.kind)).map((row) => ({ kind: row.kind, id: row.id, newLabel: row.name }));
}

/** Whether `row` should show under an active search `query` — matches the provider's brand label
 *  ("GitHub", "Cloudflare Pages"), its purpose subtitle ("Publishing", "Source Control"), and the
 *  row's own display name ("Production", "30-day test token"). Case-insensitive, whitespace-trimmed;
 *  an empty query matches everything (the "no filter active" state).
 *  @complexity O(1) per row — three substring checks against already-short strings. */
export function accessTokenRowMatchesQuery(row: AccessTokenRow, info: AccessTokenProviderInfo, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  return info.label.toLowerCase().includes(q) || info.purposeLabel.toLowerCase().includes(q) || row.name.toLowerCase().includes(q);
}

/** Whether ANY provider row in a `kind`/`providerId` group matches — a group with no saved rows
 *  (the "Not connected" state) still matches whenever its own provider label/purpose does, so an
 *  unconnected provider is still findable by searching its name (e.g. searching "Netlify" before
 *  ever connecting it should still surface the row inviting a first connection).
 *  @complexity O(1). */
export function accessTokenProviderMatchesQuery(info: AccessTokenProviderInfo, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  return info.label.toLowerCase().includes(q) || info.purposeLabel.toLowerCase().includes(q);
}

/** Whether `name` collides with another saved row for the same provider — case-insensitive,
 *  whitespace-trimmed, same comparison the server's own `(workspace_id, provider_id, label)` UNIQUE
 *  constraint effectively enforces (this is a client-side pre-check so the field can show an inline
 *  `.field-error` before a round trip, not a replacement for the server's own 409). `excludeId` is
 *  the row being edited — replacing a row's OWN current name is not a collision with itself.
 *  @complexity O(n) in this provider's own (small) saved-row count. */
export function accessTokenNameTaken(rows: readonly AccessTokenRow[], ref: AccessTokenProviderRef, name: string, excludeId?: string): boolean {
  const trimmed = name.trim().toLowerCase();
  return rows.some(
    (row) => row.kind === ref.kind && row.providerId === ref.providerId && row.id !== excludeId && row.name.trim().toLowerCase() === trimmed
  );
}

/** One token form's fields, kept together as one shape so {@link buildAccessTokenConnectionInput}
 *  and {@link accessTokenRowReadyToSave} share a single parameter type — mirrors
 *  `PublishCredentialFormFields`/`SourceControlCredentialFormFields`'s exact role, plus `name` (the
 *  one genuinely new field this page introduces — see `AccessTokenRow.name`'s own doc). */
export interface AccessTokenFormFields {
  readonly ref: AccessTokenProviderRef;
  readonly name: string;
  readonly token: string;
  readonly accountId: string;
  readonly username: string;
}

/** Whether a token form has enough typed to save — a non-empty Name (new here; neither origin store's
 *  own form ever asked for one) PLUS whatever {@link accessTokenProviderInfo} says this provider
 *  cannot function without (`token`, always; `accountId` for Cloudflare Pages; `username` for
 *  Bitbucket). Does not check name uniqueness — that is {@link accessTokenNameTaken}'s job, surfaced
 *  as its own inline error rather than folded into the Save button's disabled state, so a collision
 *  reads as a specific, fixable reason rather than an unexplained disabled button.
 *  @complexity O(k) in this provider's own required-field count (at most one). */
export function accessTokenRowReadyToSave(fields: AccessTokenFormFields): boolean {
  if (fields.name.trim() === "") return false;
  if (fields.token.trim() === "") return false;
  const info = accessTokenProviderInfo(fields.ref);
  return info.requiredFields.every((field) => fields[field].trim() !== "");
}

/**
 * The Replace-flow variant of {@link accessTokenRowReadyToSave} — an EXISTING row's Save button,
 * which this page can enable in one more case neither `StaticSiteTab.tsx` nor `ProvidersTab.tsx`
 * supports today: a rename with no new token typed. Both origin pages require a fresh token on every
 * save regardless of connected state (`publishCredentialRowReadyToSave`/
 * `sourceControlCredentialRowReadyToSave` both unconditionally check `token.trim() !== ""`) — this
 * page's own new Name field makes "I just want to rename this, not rotate it" a real, common action
 * (the brief's own "give it whatever name you want" framing), so gating it behind a mandatory token
 * retype would make the rename feature it introduces effectively unusable for that case.
 *
 * Three cases: nothing typed at all → not ready (there is no diff to send). A new name only (token
 * blank) → ready, sent as a label-only `PUT` (no `connection` field, so the stored secret is
 * untouched — same "omitting `connection` keeps the secret" contract `updatePublishCredential`'s own
 * doc states). A new token (rename or not) → ready only once this provider's required extra fields
 * are ALSO filled, same as create — a token replace still needs `accountId`/`username` alongside it
 * because a fresh `connection` object is a full replacement, not a per-field patch.
 * @complexity O(k) in this provider's own required-field count (at most one).
 */
export function accessTokenReplaceReadyToSave(fields: AccessTokenFormFields, currentName: string): boolean {
  if (fields.name.trim() === "") return false;
  const nameChanged = fields.name.trim() !== currentName.trim();
  const hasToken = fields.token.trim() !== "";
  if (!hasToken) return nameChanged;
  const info = accessTokenProviderInfo(fields.ref);
  return info.requiredFields.every((field) => fields[field].trim() !== "");
}

/**
 * Builds the wire connection input for a create/update call — dispatches to
 * `buildPublishConnectionInput`/`buildSourceControlConnectionInput` by `fields.ref.kind` rather than
 * re-deriving either provider's shape (this file's own header). The cast on `providerId` is safe:
 * both builders switch exhaustively over their own store's literal union, and `fields.ref.providerId`
 * is only ever populated from {@link ACCESS_TOKEN_PROVIDERS}, which is itself built from those same
 * two unions — a value that could not satisfy the target type can never reach this call.
 * @complexity O(1).
 */
export function buildAccessTokenConnectionInput(fields: AccessTokenFormFields): AdminPublishConnectionInput | AdminSourceControlConnectionInput {
  if (fields.ref.kind === "publish") {
    return buildPublishConnectionInput({
      providerId: fields.ref.providerId as AdminPublishCredentialProviderId,
      token: fields.token,
      accountId: fields.accountId,
    });
  }
  return buildSourceControlConnectionInput({
    providerId: fields.ref.providerId as AdminSourceControlProviderId,
    token: fields.token,
    username: fields.username,
  });
}

/** Every saved row for one provider, in the order the server returned them.
 *  @complexity O(n) in this workspace's total saved-credential count (small). */
export function accessTokenRowsForProvider(rows: readonly AccessTokenRow[], ref: AccessTokenProviderRef): AccessTokenRow[] {
  return rows.filter((row) => row.kind === ref.kind && row.providerId === ref.providerId);
}

/** Builds an update patch's non-secret/secret halves independently — split out of the hook's own
 *  `replaceToken` purely so that function's own branch count (readiness guard, uniqueness guard,
 *  try/catch, kind dispatch) stays under this repo's complexity gate. `label` is included only when
 *  the operator actually changed the name (a same-value PUT is a no-op write neither store needs to
 *  see); `connection` is included only when a new token was typed — see
 *  {@link accessTokenReplaceReadyToSave}'s own doc for why either can be true alone.
 *  @complexity O(1). */
export function buildAccessTokenUpdatePatch(
  fields: AccessTokenFormFields,
  nameChanged: boolean,
  hasToken: boolean
): { label?: string; connection?: AdminPublishConnectionInput | AdminSourceControlConnectionInput } {
  return {
    ...(nameChanged ? { label: fields.name.trim() } : {}),
    ...(hasToken ? { connection: buildAccessTokenConnectionInput(fields) } : {}),
  };
}

/** What a rejected credential create/update means for the FORM — a dictionary-key-shaped result to
 *  translate and apply. Mirrors `PublishCredentialSubmitFailure`/`SourceControlCredentialSubmitFailure`
 *  exactly (both stores' routes share the identical `409 -> DUPLICATE_LABEL` / `400 -> VALIDATION`
 *  wire shape — `publish-credentials.ts`'s own header says the source-control route "mirrors" it
 *  verbatim), reimplemented here rather than imported from either feature so this page owns no code
 *  dependency on `deployment/`/`source-control/` beyond their shared, provider-agnostic `rules.ts`
 *  data tables — same boundary `ProvidersTab.tsx`'s own header draws for the identical reason (two
 *  different agents building two different features in the same session). */
export type AccessTokenSubmitFailure = { kind: "duplicate-label" } | { kind: "validation"; detail: string } | { kind: "generic" };

/**
 * Classifies a rejected create/update/delete call. Checks BOTH `e.code` and `e.message` for the two
 * known markers, same reasoning `classifyPublishCredentialSubmitError` documents.
 * @complexity O(1).
 */
export function classifyAccessTokenSubmitError(e: unknown): AccessTokenSubmitFailure {
  if (!(e instanceof ApiError)) return { kind: "generic" };
  const marker = e.code ?? e.message;
  if (marker === "DUPLICATE_LABEL") return { kind: "duplicate-label" };
  if (marker === "VALIDATION") {
    const detail = typeof e.body?.detail === "string" ? e.body.detail : e.message;
    return { kind: "validation", detail };
  }
  return { kind: "generic" };
}

/** One Tier-2 credential store this page does not yet read from — the partial-inventory disclosure's
 *  own data (`development/todos.md:1208`'s "confront or say on screen it's partial" requirement).
 *  `screenLabel` is the deep link text; `screenPath` is left undefined for stores with more than one
 *  owning screen (Composio's two stores both point at Settings → Connectors, so this is informational
 *  copy rather than a single href). @complexity n/a — static data. */
export interface OtherCredentialStoreInfo {
  readonly label: string;
  readonly screenLabel: string;
}

/** The six single-row/single-purpose credential stores NOT covered by this page's Tier 1
 *  (multi-named-token) view — `development/todos.md:1208`'s eight-store inventory minus the two this
 *  page reads (`publish_credential_sets`, `source_control_credential_sets`). Read + Replace + Remove
 *  for these is a deliberately deferred follow-up (each already has its own real Create flow and
 *  gains nothing from a second one — see this page's own `Security.tsx` header) — until that follow-up
 *  ships, {@link ACCESS_TOKEN_PROVIDERS} plus this list is what makes the page's own "showing N of 8"
 *  disclosure a fact instead of a guess. */
export const OTHER_CREDENTIAL_STORES: readonly OtherCredentialStoreInfo[] = [
  { label: "Site assistant model key", screenLabel: "Settings → AI" },
  { label: "Admin AI Assistant key (BYOK)", screenLabel: "AI Assistant dock" },
  { label: "Media provider keys", screenLabel: "Media → Media providers" },
  { label: "Composio project key", screenLabel: "Settings → Connectors" },
  { label: "Composio connector accounts", screenLabel: "Settings → Connectors" },
  { label: "External MCP servers", screenLabel: "Settings → External MCP" },
];
