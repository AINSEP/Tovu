import {
  ApiError,
  type AdminCustomConnectionInput,
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
import { MEDIA_PROVIDER_CATALOG } from "../media/media-provider-catalog";

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
 *
 * ## One list, all eight stores — the 2026-08-16 owner ruling
 *
 * The page used to split into a 7-provider "Tier 1" list plus a banner naming six more stores it
 * didn't read yet. The owner, shown that shape next to a single filtered list, chose the list: "from
 * a person's point of view a Cloudinary key and a GitHub token are the same kind of thing — a secret
 * this install holds." {@link ACCESS_TOKEN_CATEGORIES} is the filter that replaces the tier split —
 * every provider AND every {@link OtherCredentialStoreInfo} carries a `category`, and `AccessTokensTab.tsx`
 * renders both kinds of row through the same list, filtered by the same search box and the same
 * category row. The Tier 1 / Tier 2 vocabulary survives only as a CAPABILITY difference now (Tier 1
 * gets `[+ Add]` and multiple named rows; Tier 2 gets `[Replace]`/`[Remove]` and a deep link, never a
 * second Create), not as two separate surfaces — see `OTHER_CREDENTIAL_STORES`'s own doc below.
 */

/**
 * This screen's name on `lib/content-refresh-bus.ts` — see `../taxonomy/rules.ts`'s
 * `TAXONOMY_RESOURCE` for why this is a plain colocated constant rather than a shared registry.
 * `custom_credential_set_username`/`custom_credential_set_token`
 * (`apps/website/src/features/custom-credentials/agent-tools.ts`) are agent-callable — an assistant
 * repairing a saved credential's username after a 401 is exactly the "wrote something this screen
 * cannot see" case `use-taxonomy.hooks.ts` first fixed for taxonomies. One resource for all three
 * merged stores (publish/source-control/custom), matching that this is one screen with one list, per
 * this file's own "2026-08-16 owner ruling" section above.
 */
export const ACCESS_TOKENS_RESOURCE = "access-tokens";

/** The permission that gates the Site Token tab's very visibility, not just its actions — mirrors
 *  `apps/website/src/features/identity/site-token-permission.ts`'s `SITE_TOKEN_MANAGE_PERMISSION`
 *  literal. Duplicated as a plain string rather than imported: this app cannot import server code,
 *  the same reason `use-external-mcp-admissions.hooks.ts` duplicates `"system.write"` rather than
 *  importing it. */
export const SITE_TOKEN_MANAGE_PERMISSION = "admin.security.tokens.manage";

/** Which credential store a row belongs to. `"custom"` (2026-08-17) is the odd one out — see
 *  {@link AccessTokenRow.category}'s own doc: it has no fixed provider catalog behind it at all, an
 *  operator-typed row IS its own provider identity. */
export type AccessTokenKind = "publish" | "source-control" | "custom";

/** The category filter row's own ids — `"all"` plus one bucket per real category. Every provider
 *  and every {@link OtherCredentialStoreInfo} lands in exactly one of the non-`"all"` ids (the owner's
 *  own requirement, 2026-08-16 ruling). `"general"` (2026-08-17) is the sixth bucket, added
 *  specifically for "Add custom provider" rows whose vendor doesn't fit the other five (that
 *  capability is also the only thing that can ever set it — no built-in provider uses it). */
export type AccessTokenCategoryId = "all" | "source-control" | "hosting" | "media" | "ai" | "ops" | "general";

/** The category actually stored on a row — never `"all"`, which exists only as the filter's own
 *  "show everything" option and would be meaningless as a row's own classification. */
export type AccessTokenRowCategoryId = Exclude<AccessTokenCategoryId, "all">;

export interface AccessTokenCategoryInfo {
  readonly id: AccessTokenCategoryId;
  readonly label: string;
}

/**
 * The filter row's fixed order — `All` first and default (owner's own list, 2026-08-16 ruling:
 * "All / Source control / Hosting / Media / AI / Ops"). Split from the seven Tier 1 providers'
 * `purposeLabel` ("Publishing"/"Source Control"), which is a per-provider DISAMBIGUATOR shown next to
 * a name, not a filter bucket — `github-pages` and `vercel` share the `"hosting"` category here even
 * though only `github-pages` needed a purpose subtitle to tell it apart from source-control's own
 * `github`.
 */
export const ACCESS_TOKEN_CATEGORIES: readonly AccessTokenCategoryInfo[] = [
  { id: "all", label: "All" },
  { id: "source-control", label: "Source control" },
  { id: "hosting", label: "Hosting" },
  { id: "media", label: "Media" },
  { id: "ai", label: "AI" },
  { id: "ops", label: "Ops" },
  { id: "general", label: "General" },
] as const;

/** A category id's own display label — `"general"`'s row-heading counterpart to
 *  {@link AccessTokenProviderInfo.purposeLabel} for a custom row, which has no static catalog entry
 *  to read a `purposeLabel` from (see {@link accessTokenRowProviderInfo}). Falls back to the id
 *  itself only if the category table is somehow missing an entry (defensive — every
 *  {@link AccessTokenRowCategoryId} value has a matching row in {@link ACCESS_TOKEN_CATEGORIES} by
 *  construction). @complexity O(1) — six-entry table. */
export function accessTokenCategoryLabel(id: AccessTokenRowCategoryId): string {
  return ACCESS_TOKEN_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

/** Whether `rowCategory` should show under the active category filter — `"all"` matches everything,
 *  every other id matches only its own bucket. @complexity O(1). */
export function accessTokenCategoryMatches(rowCategory: AccessTokenRowCategoryId, activeCategory: AccessTokenCategoryId): boolean {
  return activeCategory === "all" || rowCategory === activeCategory;
}

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
  /** The company an operator actually authenticates to when creating or revoking this token —
   *  deliberately a SEPARATE field from {@link label}. For most providers the two are the same
   *  string, but `github-pages` and `cloudflare-pages` name a PLACE the credential publishes to, not
   *  the company running the token console: there is no revoke page "at GitHub Pages" or "at
   *  Cloudflare Pages", only at github.com / cloudflare.com. Copy that tells an operator where to
   *  create or revoke a token must read this field; copy that says what a saved credential is FOR
   *  (row/group headings, "Add another X token" affordances) keeps reading {@link label} — collapsing
   *  the two into one field is exactly the bug this one exists to prevent. See
   *  {@link PROVIDER_VENDOR_LABEL_OVERRIDES} for the two providers where they diverge. */
  readonly vendorLabel: string;
  /** Set for every provider today: `github-pages`/`github` need it to disambiguate, and the other
   *  five get it anyway rather than making disambiguation conditional on which OTHER providers this
   *  workspace happens to have connected — a static fact per provider is simpler to reason about
   *  than one that depends on the rest of the list. */
  readonly purposeLabel: string;
  /** The category-filter bucket this provider lands in — see {@link ACCESS_TOKEN_CATEGORIES}. All
   *  four publish providers are `"hosting"` (they publish a static export TO a host); all three
   *  source-control providers are `"source-control"` (they read/write a repository, never a
   *  deploy target) — the same axis {@link AccessTokenProviderInfo.purposeLabel} already names in
   *  prose for the one provider pair that needs disambiguating (github-pages vs github). */
  readonly category: AccessTokenRowCategoryId;
  readonly tokenPageUrl: string;
  readonly scopeGuidanceKey: string;
  readonly requiredFields: readonly AccessTokenExtraFieldKey[];
  /** Fields `TokenInputFields` should render but NOT gate readiness on — unset (equivalent to
   *  empty) for every one of the seven catalog providers, which have no optional-but-shown extra
   *  field today. {@link accessTokenRowProviderInfo}'s synthetic custom-row info is this field's
   *  one real user: a custom row's Username is always optional (brief's own requirement), so it
   *  cannot live in {@link requiredFields} (which gates the Save button), yet still needs to render. */
  readonly optionalFields?: readonly AccessTokenExtraFieldKey[];
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
/** Providers whose {@link AccessTokenProviderInfo.label} names a destination rather than the vendor
 *  itself, keyed by provider id. Every provider NOT listed here already has vendor === label
 *  (Vercel, Netlify, and all three source-control providers are already company names) — verified
 *  against each provider's own `tokenPageUrl` host: `github-pages` and source-control's `github`
 *  both resolve to `github.com`; `cloudflare-pages` resolves to `cloudflare.com`. */
const PROVIDER_VENDOR_LABEL_OVERRIDES: Readonly<Record<string, string>> = {
  "github-pages": "GitHub",
  "cloudflare-pages": "Cloudflare",
};

/** Resolves {@link AccessTokenProviderInfo.vendorLabel} for one provider — the override table when
 *  this provider's destination name differs from its vendor, `destinationLabel` unchanged otherwise.
 *  @complexity O(1). */
function vendorLabelFor(providerId: string, destinationLabel: string): string {
  return PROVIDER_VENDOR_LABEL_OVERRIDES[providerId] ?? destinationLabel;
}

export const ACCESS_TOKEN_PROVIDERS: readonly AccessTokenProviderInfo[] = [
  ...PUBLISH_CREDENTIAL_PROVIDERS.map(
    (provider): AccessTokenProviderInfo => ({
      kind: "publish",
      providerId: provider.id,
      label: provider.label,
      vendorLabel: vendorLabelFor(provider.id, provider.label),
      purposeLabel: "Publishing",
      category: "hosting",
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
      vendorLabel: vendorLabelFor(provider.id, provider.label),
      purposeLabel: "Source Control",
      category: "source-control",
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

/** {@link accessTokenProviderInfo}'s row-aware counterpart — the one `AccessTokensTab.tsx` call
 *  site (`TokenRow`) actually needs, since a `kind: "custom"` row has no catalog entry
 *  {@link accessTokenProviderInfo} could look up (its `providerId` is the row's own id, never
 *  reused by any other row). Every other kind delegates straight through, unchanged. Builds a
 *  SYNTHETIC info from the row's own {@link AccessTokenRow.category}/{@link AccessTokenRow.baseUrl}/
 *  `name` for `"custom"`: `label`/`vendorLabel` both read `row.name` (a custom row has no
 *  destination-vs-vendor split — see {@link AccessTokenProviderInfo.vendorLabel}'s own doc, which
 *  only applies to the two catalog providers it names), `purposeLabel` is the category's own
 *  display label, `tokenPageUrl` is the operator's own base URL (the closest analog this row has to
 *  "where would I go to get/revoke this token"), `requiredFields` is empty and `optionalFields` is
 *  `["username"]` — a custom row's Replace form asks for Name + Token + an always-optional Username,
 *  never re-collects the base URL (see this file's own header on why baseUrl is create-only).
 *  @complexity O(1). */
export function accessTokenRowProviderInfo(row: AccessTokenRow): AccessTokenProviderInfo {
  if (row.kind !== "custom") return accessTokenProviderInfo(row);
  const category = row.category ?? "general";
  return {
    kind: "custom",
    providerId: row.providerId,
    label: row.name,
    vendorLabel: row.name,
    purposeLabel: accessTokenCategoryLabel(category),
    category,
    tokenPageUrl: row.baseUrl ?? "",
    scopeGuidanceKey: "Paste the access token this provider issued from its own dashboard.",
    requiredFields: [],
    optionalFields: ["username"],
  };
}

/** `ProviderGroup`'s own `agentHandle` label (`AccessTokensTab.tsx`) — moved here alongside this
 *  file's other label/fact builders (house rule: no functions in a `.tsx` component; a pure
 *  formatter with no hook state belongs in `rules.ts`, not `*.hooks.ts`, matching
 *  {@link maskedTailFact}/{@link connectedAsFact}'s own placement below). */
export function providerGroupHandleLabel(info: AccessTokenProviderInfo, connectedCount: number): string {
  return `${info.label}'s saved access tokens — ${connectedCount} connected`;
}

/** `TokenRow`'s own `agentHandle` label (`AccessTokensTab.tsx`) — see {@link providerGroupHandleLabel}
 *  for why this lives here rather than in the component. */
export function tokenRowHandleLabel(name: string, providerLabel: string): string {
  return `${name} — ${providerLabel}, connected`;
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
 *  or a computed {@link friendlyLegacyName} for a legacy sentinel-labeled row, resolved fresh on
 *  every render — see `AccessTokensTab.tsx`'s header for why this replaced a write-on-load rename);
 *  `rawLabel` is kept alongside it so a genuine uniqueness check can compare against what the server
 *  actually has stored rather than only against display names. */
export interface AccessTokenRow {
  readonly kind: AccessTokenKind;
  readonly providerId: string;
  readonly id: string;
  readonly name: string;
  readonly rawLabel: string;
  readonly isDefault: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Set only for `kind: "custom"` rows — a catalog provider's category lives on its
   *  {@link AccessTokenProviderInfo} entry instead (`ACCESS_TOKEN_PROVIDERS`), since every one of
   *  its rows shares the same provider. A custom row has no catalog entry to read one from (its
   *  `providerId` IS its own row id — see {@link buildCustomCredentialRows}), so the category the
   *  operator picked at creation is carried on the row itself. */
  readonly category?: AccessTokenRowCategoryId;
  /** Set only for `kind: "custom"` rows — the API base URL the operator typed at creation. */
  readonly baseUrl?: string;
  /** Set only for `kind: "custom"` rows that actually have a saved username — the account login the
   *  operator typed at creation, carried on the row so the edit form can PREFILL it. Absent (never
   *  `""`) otherwise. Before 2026-09-01 this could not exist at any price: `username` lived inside
   *  the row's sealed ciphertext, the list route never decrypts, so every edit form rendered a saved
   *  username as blank and the operator had to retype it. It is a plaintext column now. */
  readonly username?: string;
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

/** The wire shape `AdminCustomCredentialSummary` (`lib/api.ts`) carries — kept as a locally-declared
 *  structural subset (like {@link RawCredentialSummary}) so this file's pure functions stay
 *  independently testable without importing the API client's own type for its own sake. */
export interface RawCustomCredentialSummary {
  readonly id: string;
  readonly label: string;
  readonly category: AccessTokenRowCategoryId;
  readonly baseUrl: string;
  /** Absent when the credential has no saved username — see {@link AccessTokenRow.username}. */
  readonly username?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * {@link buildAccessTokenRows}'s counterpart for custom-provider rows — much simpler, since a
 * custom row has no shared provider to group under (no legacy-sentinel numbering, no provider-id
 * lookup): `providerId` is set to the row's OWN `id` (unique by construction — see
 * {@link AccessTokenRow.providerId}'s doc on the `AccessTokenProviderRef` grouping-key contract this
 * satisfies trivially, one row per "provider"), `isDefault` is always `false` (no default concept
 * applies — see `types.ts`'s own header on this table's server side), and `category`/`baseUrl`/
 * `username` carry straight through as the row's own plaintext fields.
 * @complexity O(n) in this workspace's own (small) custom-credential count.
 */
export function buildCustomCredentialRows(raws: readonly RawCustomCredentialSummary[]): AccessTokenRow[] {
  return raws.map((raw) => ({
    kind: "custom",
    providerId: raw.id,
    id: raw.id,
    name: raw.label,
    rawLabel: raw.label,
    isDefault: false,
    category: raw.category,
    baseUrl: raw.baseUrl,
    // Spread conditionally so a credential without a username has no key at all, matching the
    // server's own "absent, never empty string" contract end to end.
    ...(raw.username !== undefined ? { username: raw.username } : {}),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  }));
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

/** One "Add custom provider" form's fields — the dedicated dialog's own shape, kept separate from
 *  {@link AccessTokenFormFields} (used by the seven catalog providers' Create/Replace) rather than
 *  widened onto it: a custom row collects `category`/`baseUrl`, which no catalog provider's form
 *  ever asks for, and has no `ref`/`accountId` to carry. */
export interface CustomCredentialFormFields {
  readonly name: string;
  readonly category: AccessTokenRowCategoryId;
  readonly baseUrl: string;
  /** Raw textarea input for extra allowed hosts beyond `baseUrl` (e.g. fly.io needs both
   *  `api.fly.io` and `api.machines.dev`) — one URL per line or comma-separated, operator's
   *  choice; see {@link parseAdditionalHostsInput}. Always optional: a blank value means "no
   *  extra hosts", matching `src/features/custom-credentials/types.ts`'s server-side
   *  `allowedOriginsFor`/`validateAdditionalHosts` omitted-is-not-an-error contract. */
  readonly additionalHosts: string;
  readonly token: string;
  readonly username: string;
}

/** Whether `value` parses as an absolute `http`/`https` URL — the client-side twin of
 *  `features/custom-credentials/store.ts`'s own `validateBaseUrl` (same accept/reject rule,
 *  duplicated rather than shared since server code never imports from the admin app). Checked
 *  explicitly rather than trusting "`new URL()` did not throw" — that constructor accepts far more
 *  schemes than this field should (`javascript:`, `mailto:`, a bare `file:`).
 *  @complexity O(1). */
export function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Splits {@link CustomCredentialFormFields.additionalHosts}'s raw textarea text into individual
 *  candidate host strings — one per line OR comma-separated (operator's choice, so pasting a
 *  provider's own docs either way just works), trimmed, with blank entries dropped. Does NOT
 *  validate each entry as a URL — see {@link invalidAdditionalHostsEntries} for that, kept
 *  separate so a caller that only needs the parsed list (e.g. building the wire payload) does not
 *  pay for a validation pass it does not need.
 *  @complexity O(n) in the raw text's own length. */
export function parseAdditionalHostsInput(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

/** The parsed entries that fail {@link isValidHttpUrl} — surfaced as the "Additional hosts" field's
 *  own inline `.field-error`, the same pattern `baseUrlInvalid` already uses for Base URL. An empty
 *  field parses to zero entries and is never invalid (this field is entirely optional).
 *  @complexity O(n) in the number of parsed entries. */
export function invalidAdditionalHostsEntries(raw: string): string[] {
  return parseAdditionalHostsInput(raw).filter((entry) => !isValidHttpUrl(entry));
}

/** Whether the "Add custom provider" dialog has enough typed to save — Name, a valid `http(s)`
 *  Base URL, and a non-blank Access token are all required; Category always has a value (the select
 *  defaults to one, never blank); Username stays optional (this file's own header on why it can
 *  never gate readiness the way {@link accessTokenRowReadyToSave}'s per-provider `requiredFields`
 *  do); Additional hosts stays optional too, but every entry typed (if any) must itself be a valid
 *  `http(s)` URL — a half-typed host list should not silently save with the bad entry dropped.
 *  @complexity O(n) in the number of typed additional-host entries. */
export function customCredentialReadyToSave(fields: CustomCredentialFormFields): boolean {
  if (fields.name.trim() === "") return false;
  if (fields.token.trim() === "") return false;
  if (!isValidHttpUrl(fields.baseUrl.trim())) return false;
  return invalidAdditionalHostsEntries(fields.additionalHosts).length === 0;
}

/** Whether `name` collides with another saved custom credential — workspace-wide (unlike
 *  {@link accessTokenNameTaken}, which scopes by `providerId`): the server's own
 *  `(workspaceId, label)` UNIQUE constraint has no provider dimension for this table at all (every
 *  custom row's `providerId` is already unique — see {@link buildCustomCredentialRows}'s doc — so
 *  scoping by it the way {@link accessTokenNameTaken} does would never find a real collision). Same
 *  client-side-pre-check-not-a-replacement-for-the-server's-409 posture as that function.
 *  @complexity O(n) in this workspace's own (small) custom-credential count. */
export function customCredentialNameTaken(rows: readonly AccessTokenRow[], name: string, excludeId?: string): boolean {
  const trimmed = name.trim().toLowerCase();
  return rows.some((row) => row.kind === "custom" && row.id !== excludeId && row.name.trim().toLowerCase() === trimmed);
}

/**
 * {@link accessTokenReplaceReadyToSave}'s counterpart for a saved CUSTOM credential row — a separate
 * function rather than a widening of that shared one, because the two gates diverge on a case the
 * shared one must never allow: a bare, no-token Username edit. For the seven catalog providers,
 * `fields.username` only exists to satisfy Bitbucket's `requiredFields` alongside a FRESH token
 * (`replaceToken`'s own header note: `row.username` is always `undefined` for a non-custom row, so
 * there is no persisted value a lone Username edit could even be a change FROM); folding a
 * bare-username check into the shared gate would make a stray character typed into that field on a
 * rename-only Save incorrectly enable a `PUT` with nothing else to send. A custom row is the opposite:
 * `AccessTokenRow.username` (2026-09-01) is a REAL persisted, independently-editable fact, and
 * `use-access-tokens.hooks.ts`'s `replaceCustomCredential` needs a Save button that lights up for
 * "operator only fixed the username" the exact way it already does for "operator only renamed it" —
 * the live incident this whole field exists for (a saved credential with a wrong/missing username,
 * token already correct).
 *
 * Same three-way shape as {@link accessTokenReplaceReadyToSave} otherwise: nothing typed/changed →
 * not ready. A name change, a username change (typed OR cleared — see
 * {@link buildCustomCredentialUpdatePatch}'s own doc for how a cleared field becomes the server's
 * `null` clear sentinel), or both, with no token → ready. A new token → always ready; unlike the
 * catalog gate there is no `info.requiredFields` completeness check left to run here, since a custom
 * row's synthetic info (`accessTokenRowProviderInfo`) declares none.
 *
 * @complexity O(1).
 */
export function customCredentialReplaceReadyToSave(fields: AccessTokenFormFields, currentName: string, currentUsername: string | undefined): boolean {
  if (fields.name.trim() === "") return false;
  if (fields.token.trim() !== "") return true;
  const nameChanged = fields.name.trim() !== currentName.trim();
  const usernameChanged = fields.username.trim() !== (currentUsername ?? "").trim();
  return nameChanged || usernameChanged;
}

/** Builds the wire connection input for a custom-provider create/update call — just
 *  `{token, username?}`, no provider dispatch (this table has none — see `types.ts`'s own header on
 *  the server side). `username` is omitted entirely when blank, never sent as `""` (mirrors every
 *  other optional-field builder in this file). @complexity O(1). */
export function buildCustomProviderConnectionInput(fields: Pick<CustomCredentialFormFields, "token" | "username">): AdminCustomConnectionInput {
  const username = fields.username.trim();
  return { token: fields.token, ...(username !== "" ? { username } : {}) };
}

/**
 * {@link buildAccessTokenUpdatePatch}'s counterpart for a saved CUSTOM credential row — same "send
 * only what actually changed" shape, plus the one field a custom row's Replace form can now change
 * independently of a token retype: `username` (2026-09-01). `label`/`connection` inclusion follows
 * the shared builder's own rules verbatim (see that function's doc). `username` is included whenever
 * the draft's trimmed value differs from what this row currently has saved — a non-blank value sends
 * the new string, a blank value sends the server's documented clear sentinel (`null`, NOT `""` — see
 * `store.ts`'s `UpdateCustomCredentialInput.username` doc server-side for why a blank string is
 * rejected rather than treated as either "clear" or "leave alone"). Included even when `hasToken` is
 * also true and `connection` therefore already carries its own `username` member: the server's own
 * precedence rule makes the top-level field win in that case, and since both are built from the same
 * `fields.username` here, they always agree — see `store.ts`'s `updateCustomCredential` doc for the
 * full precedence writeup.
 *
 * @complexity O(1).
 */
export function buildCustomCredentialUpdatePatch(
  fields: AccessTokenFormFields,
  nameChanged: boolean,
  hasToken: boolean,
  currentUsername: string | undefined
): { label?: string; connection?: AdminCustomConnectionInput; username?: string | null } {
  const trimmedUsername = fields.username.trim();
  const usernameChanged = trimmedUsername !== (currentUsername ?? "").trim();
  return {
    ...(nameChanged ? { label: fields.name.trim() } : {}),
    ...(hasToken ? { connection: buildCustomProviderConnectionInput(fields) } : {}),
    ...(usernameChanged ? { username: trimmedUsername === "" ? null : trimmedUsername } : {}),
  };
}

/** Builds the wire `additionalHosts` value for a custom-provider create/update call —
 *  `undefined` when the field parses to no entries, so the request omits it entirely rather than
 *  sending `[]` (matches `buildCustomProviderConnectionInput`'s own "omit rather than send an
 *  empty/blank value" convention, and the server's own "omitted = no extra hosts" contract).
 *  @complexity O(n) in the raw text's own length. */
export function buildAdditionalHostsInput(raw: string): readonly string[] | undefined {
  const parsed = parseAdditionalHostsInput(raw);
  return parsed.length > 0 ? parsed : undefined;
}

/** A stable id for one of the six Tier-2 credential stores — `AccessTokenRow.id`'s counterpart for
 *  the stores this page reads through a completely different set of endpoints (see
 *  `hooks/other-credentials-port.hooks.ts`). Not a union of the underlying table names on purpose:
 *  `composio-connector`/`composio-project` are two different reads of the SAME `composio_config`/
 *  `composio_connector_credentials` pair (`ADS-memory/reports/design/2026-08-16-access-tokens-visual-
 *  spec.md` §1's eight-row table), and this id names the ROW this page renders, not the table. */
export type OtherCredentialStoreId = "site-assistant" | "admin-byok" | "media-provider" | "composio-project" | "composio-connector" | "external-mcp";

/**
 * One Tier-2 credential store — single connection per scope, or per-connector/per-server, but never
 * *named* the way Tier 1 is (no operator-typed label, so no Name field and no `[+ Add]` — see
 * `Security.tsx`'s own header for why Create stays on each store's OWN screen). Read + Replace +
 * Remove + a deep link is the 2026-08-16 owner ruling for every row this produces
 * (`ACCESS-TOKENS-VISUAL-SPEC.md`'s "OWNER RULING" section) — `supportsReplace` narrows that for the
 * two stores where "replace" has no honest single-field meaning:
 *
 * - `composio-connector`: an OAuth-connected account, not a typed-in secret — there is no field to
 *   retype. "Replace" for this row is "reconnect," which only the Connectors screen's own OAuth popup
 *   can do; the deep link covers it, Remove (`disconnectConnector`) still applies here directly.
 * - `external-mcp`: a multi-field server config (transport, command, args, allowed tools), not a
 *   single token — a real "Replace" would have to reproduce that whole form, which is exactly the
 *   second-entry-point risk the session-6 handoff warns against for a cross-cutting page. Remove
 *   (`deleteExternalMcpServer`) still applies; editing the rest stays on Settings → External MCP.
 *
 * The other four (`site-assistant`, `admin-byok`, `media-provider`, `composio-project`) are all a
 * single `apiKey` field end to end — `supportsReplace: true`, wired through the same
 * retype-and-save shape Tier 1's own Replace already uses.
 */
export interface OtherCredentialStoreInfo {
  readonly id: OtherCredentialStoreId;
  /** The store's own generic label — shown as a row's heading only when the store has nothing
   *  configured yet (a "— none —" placeholder needs SOME name to search on); a configured row is
   *  headed by its OWN item name instead (a media provider's catalog label, a connector's own name,
   *  an MCP server's own label) — see `use-other-credentials.hooks.ts` for where that split happens. */
  readonly label: string;
  /** The category-filter bucket this store's rows land in — see {@link ACCESS_TOKEN_CATEGORIES}. */
  readonly category: AccessTokenRowCategoryId;
  /** Shown next to a row's name the same way Tier 1's `purposeLabel` is (`" · {purposeLabel}"`) — the
   *  human-readable form of {@link category}, e.g. "Media", "AI", "Ops". */
  readonly purposeLabel: string;
  readonly supportsReplace: boolean;
  /** Deep-link text, e.g. "Manage on AI Assistant". */
  readonly screenLabel: string;
  /** In-app route for the deep link (`lib/router.ts`'s route-path shape, e.g. `/ai-assistant`) —
   *  always this store's OWN screen, since Create/the full field set lives there and nowhere else. */
  readonly screenPath: string;
}

/**
 * The six Tier-2 stores, in the order this page renders them within each category —
 * `development/todos.md:1208`'s eight-store inventory minus the two Tier 1 already covers
 * (`publish_credential_sets`, `source_control_credential_sets`). All eight are read in v1 (the
 * 2026-08-16 owner ruling deleted the old "showing 7 of 8" partial-inventory disclosure along with
 * the two-surface layout it was disclosing a gap in — see `AccessTokensTab.tsx`'s header).
 */
export const OTHER_CREDENTIAL_STORES: readonly OtherCredentialStoreInfo[] = [
  {
    id: "site-assistant",
    label: "Site assistant model key",
    category: "ai",
    purposeLabel: "AI",
    supportsReplace: true,
    screenLabel: "AI Assistant",
    screenPath: "/ai-assistant",
  },
  {
    id: "admin-byok",
    label: "Admin AI Assistant key (BYOK)",
    category: "ai",
    purposeLabel: "AI",
    supportsReplace: true,
    screenLabel: "Settings · Execution mode",
    screenPath: "/settings?tab=execution",
  },
  {
    id: "media-provider",
    label: "Media provider keys",
    category: "media",
    purposeLabel: "Media",
    supportsReplace: true,
    screenLabel: "Providers · Media",
    screenPath: "/providers?tab=media",
  },
  {
    id: "composio-project",
    label: "Composio project key",
    category: "ops",
    purposeLabel: "Ops",
    supportsReplace: true,
    screenLabel: "Providers · Composio",
    screenPath: "/providers?tab=composio",
  },
  {
    id: "composio-connector",
    label: "Composio connector accounts",
    category: "ops",
    purposeLabel: "Ops",
    supportsReplace: false,
    screenLabel: "Providers · Composio",
    screenPath: "/providers?tab=composio",
  },
  {
    id: "external-mcp",
    label: "External MCP servers",
    category: "ai",
    purposeLabel: "AI",
    supportsReplace: false,
    screenLabel: "Providers · External MCP",
    screenPath: "/providers?tab=external-mcp",
  },
] as const;

/** Looks up one store's registry entry, falling back to the first — same "the row list can never
 *  render something absent from its own table" guarantee {@link accessTokenProviderInfo} gives Tier 1.
 *  @complexity O(1) — the array has exactly six entries. */
export function otherCredentialStoreInfo(id: OtherCredentialStoreId): OtherCredentialStoreInfo {
  return OTHER_CREDENTIAL_STORES.find((store) => store.id === id) ?? OTHER_CREDENTIAL_STORES[0]!;
}

/** Whether a Tier-2 store (or, for a multi-item store, one of its own item names) matches an active
 *  search `query` — mirrors {@link accessTokenProviderMatchesQuery} exactly: the store's generic
 *  label, its purpose subtitle, or (when given) the specific configured item's own name.
 *  @complexity O(1). */
export function otherCredentialMatchesQuery(store: OtherCredentialStoreInfo, itemName: string | undefined, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  if (store.label.toLowerCase().includes(q) || store.purposeLabel.toLowerCase().includes(q)) return true;
  return itemName !== undefined && itemName.toLowerCase().includes(q);
}

/** A media provider's human catalog label (e.g. `"grok"` → `"xAI Grok Imagine"`) — same
 *  `MEDIA_PROVIDER_CATALOG` lookup `Media.tsx` itself uses, so a media-provider row on this page
 *  reads with the identical name an operator already sees on the Media → External Providers tab. Falls
 *  back to the raw provider id for one this workspace has a stored key under but the catalog no
 *  longer lists (a removed vendor) — a stale id is still a fact worth showing, not a reason to hide
 *  the row. @complexity O(n) in the catalog's own (small, fixed) size. */
export function mediaProviderLabel(providerId: string): string {
  return MEDIA_PROVIDER_CATALOG.find((provider) => provider.id === providerId)?.label ?? providerId;
}

/** The masked-tail value fact for a configured single-`apiKey` row (`site-assistant`/`admin-byok`/
 *  `media-provider`/`composio-project` — the four stores whose GET response carries a precomputed
 *  last-4, per the visual spec §10: "that's ALL they ever return"). `tail` is already the last 4
 *  characters with no leading `••••` — every one of those four API shapes name the field
 *  differently (`masked`, `apiKeyTail`) but agree on the bare-tail contract, so this is the one place
 *  that prefix gets added. @complexity O(1). */
export function maskedTailFact(tail: string): string {
  return `••••${tail}`;
}

/** The value fact for an OAuth-connected `composio-connector` row — "Connected as: {label}" when
 *  Composio returned a human account label, or a bare "Connected" when it did not (a real, observed
 *  case: some connectors report status with no `accountLabel`). @complexity O(1). */
export function connectedAsFact(accountLabel: string | undefined): string {
  return accountLabel ? `Connected as: ${accountLabel}` : "Connected";
}

/** The value fact for an `external-mcp` row — there is no single token to characterize (§10: "no
 *  per-field tail"), so this reports how many environment variable NAMES are set instead (`envNames`,
 *  already plaintext — see `AdminExternalMcpServer.envNames`'s own doc in `lib/api.ts`). Zero reads as
 *  a fact, not an error: an MCP server can be fully configured with no secrets at all (a local stdio
 *  tool needing no credentials). @complexity O(1). */
export function envNamesFact(envNames: readonly string[]): string {
  if (envNames.length === 0) return "No environment variables set";
  return envNames.length === 1 ? "1 environment variable set" : `${envNames.length} environment variables set`;
}
