import type { CredentialTokenHint } from "@jini-ai/core/contracts/site/secrets-credential-token";
import { PUBLISH_CREDENTIAL_ROW_LABEL } from "../deployment/rules";
import { SOURCE_CONTROL_CREDENTIAL_ROW_LABEL } from "../source-control/rules";
import { type AccessTokenKind, type AccessTokenRowCategoryId } from "./rules";
import { accessTokenProviderInfo, type AccessTokenProviderInfo, type AccessTokenProviderRef } from "./access-token-providers";
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
function friendlyLegacyName({ providerLabel, indexAmongLegacyRows }: { providerLabel: string; indexAmongLegacyRows: number }, _options = {}): string {
  return indexAmongLegacyRows === 0 ? `${providerLabel} token` : `${providerLabel} token ${indexAmongLegacyRows + 1}`;
}

/** The wire shape both `AdminPublishCredentialSummary` and `AdminSourceControlCredentialSummary`
 *  already share field-for-field except `providerId`'s literal union — the common subset this file
 *  operates on so {@link buildAccessTokenRows} needs only one implementation for both stores. */
export interface RawCredentialSummary {
  readonly credentialType?: "vendor" | "custom";
  readonly worksFor?: string[];
  readonly tokenHint?: CredentialTokenHint | null;
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
  readonly scope?: "project" | "site";
  readonly usedBy?: readonly string[];
  readonly usedByThisSite?: boolean;
  readonly credentialType?: "vendor" | "custom";
  readonly worksFor?: string[];
  readonly tokenHint?: CredentialTokenHint | null;
  readonly kind: AccessTokenKind;
  readonly providerId: string;
  readonly id: string;
  readonly name: string;
  readonly rawLabel: string;
  readonly isDefault: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Set only for `kind: "custom"` rows — a catalog provider's category lives on its
   *  {@link AccessTokenProviderInfo} entry instead ({@link accessTokenProviders}), since every one of
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
 *   `VendorCredentialSetRepoPort.listByWorkspace`'s own doc for why no cap is needed).
 */
export function buildAccessTokenRows(
  { kind, raws, providers }: {
    kind: AccessTokenKind;
    raws: readonly RawCredentialSummary[];
    providers: readonly AccessTokenProviderInfo[];
  },
  _options = {},
): AccessTokenRow[] {
  const sentinel = legacySentinelLabel(kind);
  const legacyIndexByProvider = new Map<string, number>();
  return raws.map((raw) => {
    // Chat-saved project keys are `default-<id>` (unique per project); they read like the sentinel row.
    const isLegacy = raw.label === sentinel || raw.label.startsWith(`${sentinel}-`);
    let name = raw.label;
    if (isLegacy) {
      const index = legacyIndexByProvider.get(raw.providerId) ?? 0;
      legacyIndexByProvider.set(raw.providerId, index + 1);
      name = friendlyLegacyName({ providerLabel: accessTokenProviderInfo({ providers, ref: { kind, providerId: raw.providerId } }).label, indexAmongLegacyRows: index });
    }
    return { kind, ...(raw.credentialType ? { credentialType: raw.credentialType } : {}), ...(raw.worksFor ? { worksFor: raw.worksFor } : {}), providerId: raw.providerId, id: raw.id, ...(raw.tokenHint ? { tokenHint: raw.tokenHint } : {}), name, rawLabel: raw.label, isDefault: raw.isDefault, createdAt: raw.createdAt, updatedAt: raw.updatedAt };
  });
}

/** The wire shape `AdminCustomCredentialSummary` (`lib/api.ts`) carries — kept as a locally-declared
 *  structural subset (like {@link RawCredentialSummary}) so this file's pure functions stay
 *  independently testable without importing the API client's own type for its own sake. */
export interface RawCustomCredentialSummary {
  readonly scope?: "project" | "site";
  readonly usedBy?: readonly string[];
  readonly usedByThisSite?: boolean;
  readonly credentialType?: "vendor" | "custom";
  readonly worksFor?: string[];
  readonly tokenHint?: CredentialTokenHint | null;
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
export function buildCustomCredentialRows({ raws }: { raws: readonly RawCustomCredentialSummary[] }, _optional: Record<string, never> = {}): AccessTokenRow[] {
  return raws.map((raw) => ({
    scope: raw.scope,
    usedBy: raw.usedBy,
    usedByThisSite: raw.usedByThisSite,
    kind: "custom",
    ...(raw.credentialType ? { credentialType: raw.credentialType } : {}),
    ...(raw.worksFor ? { worksFor: raw.worksFor } : {}),
    ...(raw.tokenHint ? { tokenHint: raw.tokenHint } : {}),
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
 *  ("GitHub", "Cloudflare Pages"), its purpose subtitle ("Hosting", "Source control"), and the
 *  row's own display name ("Production", "30-day test token"). Case-insensitive, whitespace-trimmed;
 *  an empty query matches everything (the "no filter active" state).
 *  @complexity O(1) per row — three substring checks against already-short strings. */
export function accessTokenRowMatchesQuery({ row, info, query }: { row: AccessTokenRow; info: AccessTokenProviderInfo; query: string }, _options = {}): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  return info.label.toLowerCase().includes(q) || info.purposeLabel.toLowerCase().includes(q) || row.name.toLowerCase().includes(q);
}

/** Whether ANY provider row in a `kind`/`providerId` group matches — a group with no saved rows
 *  (the "Not connected" state) still matches whenever its own provider label/purpose does, so an
 *  unconnected provider is still findable by searching its name (e.g. searching "Netlify" before
 *  ever connecting it should still surface the row inviting a first connection).
 *  @complexity O(1). */
export function accessTokenProviderMatchesQuery({ info, query }: { info: AccessTokenProviderInfo; query: string }, _options = {}): boolean {
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
export function accessTokenNameTaken(
  { rows, ref, name }: {
    rows: readonly AccessTokenRow[];
    ref: AccessTokenProviderRef;
    name: string;
  },
  { excludeId }: { excludeId?: string } = {},
): boolean {
  const trimmed = name.trim().toLowerCase();
  return rows.some(
    (row) => row.kind === ref.kind && row.providerId === ref.providerId && row.id !== excludeId && row.name.trim().toLowerCase() === trimmed
  );
}

/** Every saved row for one provider, in the order the server returned them.
 *  @complexity O(n) in this workspace's total saved-credential count (small). */
export function accessTokenRowsForProvider({ rows, ref }: { rows: readonly AccessTokenRow[]; ref: AccessTokenProviderRef }, _optional: Record<string, never> = {}): AccessTokenRow[] {
  return rows.filter((row) => row.kind === ref.kind && row.providerId === ref.providerId);
}
