import type { AdminPublishTargetCredentialSpec, AdminPublishTargetDescriptor, AdminPublishTargetField } from "../deployment/api/deployment-api.types";
import type { AdminSourceControlProviderDescriptor } from "../source-control/api/source-control-api.types";
import { sourceControlProviderInfoFromDescriptor } from "../source-control/rules";
import { SOURCE_CONTROL, accessTokenCategoryLabel, type AccessTokenKind, type AccessTokenRowCategoryId } from "./rules";
import { type AccessTokenRow } from "./access-token-rows";
/** Identifies one provider across either store — the minimal shape enough to look up its
 *  {@link AccessTokenProviderInfo} entry or build its connection input. `providerId` is left as
 *  `string` (not the store's own strict union) deliberately: this ref is a client-side grouping key
 *  built exhaustively from {@link accessTokenProviders}' own two sources, never from
 *  free-form input, so the real type safety that matters — the wire shape a create/update actually
 *  sends — lives in {@link buildAccessTokenConnectionInput}'s dispatch to each store's own strictly
 *  typed builder, not in this grouping key. */
export interface AccessTokenProviderRef {
  readonly kind: AccessTokenKind;
  readonly providerId: string;
}

/** One provider row this page can render — a `kind`-tagged merge of a deploy host's descriptor /
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
   *  For a deploy host this is its descriptor's `credential.vendorLabel` (falling back to its label). */
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
  /** Where to create (and revoke) a token; `""` when the provider names no page (the link is then
   *  not rendered). */
  readonly tokenPageUrl: string;
  /** What kind of token the provider needs, passed through the translator; `""` when none. */
  readonly scopeGuidanceKey: string;
  /** The secret input's label, a host term from its descriptor ("API token"); absent means the
   *  generic "Access token". */
  readonly tokenLabel?: string;
  /** Publish hosts only: the descriptor's credential spec — the token field's wire name and every
   *  field {@link buildAccessTokenConnectionInput} sends. */
  readonly publishCredential?: AdminPublishTargetCredentialSpec;
  /** Descriptor fields shown besides Name and the token (a host's non-token credential fields); a
   *  `required` one gates Save. Empty for custom rows. */
  readonly extraFields: readonly AdminPublishTargetField[];
  /** Custom rows only: the form shows an optional Username (brief's own requirement). */
  readonly username?: "optional";
  /** Set on the bare entry for a saved row whose provider is not listed (its plugin switched off or
   *  missing). The row stays visible and removable, but nothing new can be added for it. */
  readonly unlisted?: true;
}

/** One deploy host's Access Tokens entry, built from its descriptor. @complexity O(f). */
function publishTargetProviderInfo(target: AdminPublishTargetDescriptor, credential: AdminPublishTargetCredentialSpec): AccessTokenProviderInfo {
  const tokenField = credential.fields.find((field) => field.name === credential.tokenField);
  return {
    kind: "publish",
    providerId: target.id,
    label: target.label,
    vendorLabel: credential.vendorLabel ?? target.label,
    purposeLabel: "Hosting",
    category: "hosting",
    tokenPageUrl: credential.tokenPageUrl ?? "",
    scopeGuidanceKey: credential.userHelp ?? credential.help ?? "",
    ...(tokenField !== undefined ? { tokenLabel: tokenField.label } : {}),
    publishCredential: credential,
    extraFields: credential.fields.filter((field) => field.name !== credential.tokenField),
  };
}

/** One source-control host's Access Tokens entry, built from its plugin's descriptor. @complexity O(f). */
function sourceControlTargetProviderInfo(descriptor: AdminSourceControlProviderDescriptor): AccessTokenProviderInfo {
  const info = sourceControlProviderInfoFromDescriptor(descriptor);
  return {
    kind: SOURCE_CONTROL,
    providerId: info.id,
    label: info.label,
    vendorLabel: info.label,
    purposeLabel: "Source control",
    category: SOURCE_CONTROL,
    tokenPageUrl: info.tokenPageUrl,
    scopeGuidanceKey: info.scopeGuidanceKey,
    ...(info.tokenLabel !== undefined ? { tokenLabel: info.tokenLabel } : {}),
    extraFields: info.fields,
  };
}

/**
 * The providers this page can save a named token for: every deploy host whose descriptor takes a
 * credential (`publishTargets`, in registry order), then every source-control host plugins declare
 * (`sourceControlProviders`); none of either while it loads. Concatenated rather than interleaved
 * so a reader scanning top-to-bottom sees "deploy targets, then source identities" as two blocks.
 * @complexity O(t + s) in the host and source-control provider counts.
 */
export function accessTokenProviders(
  { publishTargets }: {
    publishTargets: readonly AdminPublishTargetDescriptor[] | undefined;
  },
  { sourceControlProviders }: { sourceControlProviders?: readonly AdminSourceControlProviderDescriptor[] } = {},
): AccessTokenProviderInfo[] {
  return [
    ...(publishTargets ?? []).flatMap((target) => (target.credential === undefined ? [] : [publishTargetProviderInfo(target, target.credential)])),
    ...(sourceControlProviders ?? []).map(sourceControlTargetProviderInfo),
  ];
}

/** Looks up one provider's entry in `providers` ({@link accessTokenProviders}). A saved row whose
 *  provider is not listed (its plugin switched off, or the host list still loading) gets a bare
 *  entry named by its own id — never another provider's label, guidance or token page.
 *  @complexity O(n) in the (small) provider count. */
export function accessTokenProviderInfo({ providers, ref }: { providers: readonly AccessTokenProviderInfo[]; ref: AccessTokenProviderRef }, _optional: Record<string, never> = {}): AccessTokenProviderInfo {
  return (
    providers.find((p) => p.kind === ref.kind && p.providerId === ref.providerId) ?? {
      kind: ref.kind,
      providerId: ref.providerId,
      label: ref.providerId,
      vendorLabel: ref.providerId,
      purposeLabel: ref.kind === SOURCE_CONTROL ? "Source control" : "Hosting",
      category: ref.kind === SOURCE_CONTROL ? SOURCE_CONTROL : "hosting",
      tokenPageUrl: "",
      scopeGuidanceKey: "",
      extraFields: [],
      unlisted: true,
    }
  );
}

/** `providers` plus a bare {@link accessTokenProviderInfo} entry for every saved publish or
 *  source-control row whose provider is not listed, so no saved credential ever drops off the page
 *  (IRON RULE: it must stay visible and removable). Custom rows group on their own.
 *  @complexity O(r * p) in the saved-row and provider counts (both small). */
export function accessTokenProvidersWithSavedRows({ providers, rows }: { providers: readonly AccessTokenProviderInfo[]; rows: readonly AccessTokenRow[] }, _optional: Record<string, never> = {}): AccessTokenProviderInfo[] {
  const all = [...providers];
  for (const row of rows) {
    if (row.kind === "custom" || all.some((p) => p.kind === row.kind && p.providerId === row.providerId)) continue;
    all.push(accessTokenProviderInfo({ providers, ref: row }));
  }
  return all;
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
 *  "where would I go to get/revoke this token"), no extra fields and an optional `username` — a custom row's Replace form asks for Name + Token + an always-optional Username,
 *  never re-collects the base URL (see this file's own header on why baseUrl is create-only).
 *  @complexity O(1). */
export function accessTokenRowProviderInfo({ providers, row }: { providers: readonly AccessTokenProviderInfo[]; row: AccessTokenRow }, _optional: Record<string, never> = {}): AccessTokenProviderInfo {
  if (row.kind !== "custom") return accessTokenProviderInfo({ providers, ref: row });
  const category = row.category ?? "general";
  return {
    kind: "custom",
    providerId: row.providerId,
    label: row.name,
    vendorLabel: row.name,
    purposeLabel: accessTokenCategoryLabel({ id: category }),
    category,
    tokenPageUrl: row.baseUrl ?? "",
    scopeGuidanceKey: "Paste the access token this provider issued from its own dashboard.",
    extraFields: [],
    username: "optional",
  };
}

/** The dictionary keys `ProviderGroup` shows after a group's name, joined with " · ". A custom
 *  credential gets "Custom credential" first, so one the operator named after a listed host
 *  ("github") never reads as that host's own group. @complexity O(1). */
export function providerGroupSubtitleKeys(info: AccessTokenProviderInfo, _optional: Record<string, never> = {}): string[] {
  return info.kind === "custom" ? ["Custom credential", info.purposeLabel] : [info.purposeLabel];
}

/** A provider's extra fields split around the secret input, keeping the host's declared order: a
 *  deploy host's fields declared before its token field (S3's Access key ID before its Secret access
 *  key) render above it, the rest below. Other kinds declare no token position, so every extra field
 *  goes below. @complexity O(f) in the field count. */
export function extraFieldsAroundToken(info: AccessTokenProviderInfo, _optional: Record<string, never> = {}): {
  before: readonly AdminPublishTargetField[];
  after: readonly AdminPublishTargetField[];
} {
  const declared = info.publishCredential?.fields ?? [];
  const tokenIndex = declared.findIndex((field) => field.name === info.publishCredential?.tokenField);
  const beforeNames = new Set(declared.slice(0, Math.max(tokenIndex, 0)).map((field) => field.name));
  return {
    before: info.extraFields.filter((field) => beforeNames.has(field.name)),
    after: info.extraFields.filter((field) => !beforeNames.has(field.name)),
  };
}

/** `ProviderGroup`'s own `agentHandle` label (`AccessTokensTab.tsx`) — moved here alongside this
 *  file's other label/fact builders (house rule: no functions in a `.tsx` component; a pure
 *  formatter with no hook state belongs in `rules.ts`, not `*.hooks.ts`, matching
 *  {@link maskedTailFact}/{@link connectedAsFact}'s own placement below). */
export function providerGroupHandleLabel({ info, connectedCount }: { info: AccessTokenProviderInfo; connectedCount: number }, _options = {}): string {
  return `${info.label}'s saved access tokens — ${connectedCount} connected`;
}

/** `TokenRow`'s own `agentHandle` label (`AccessTokensTab.tsx`) — see {@link providerGroupHandleLabel}
 *  for why this lives here rather than in the component. */
export function tokenRowHandleLabel({ name, providerLabel }: { name: string; providerLabel: string }, _options = {}): string {
  return `${name} — ${providerLabel}, connected`;
}
