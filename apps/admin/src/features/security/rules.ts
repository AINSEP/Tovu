import { type AccessTokenProviderInfo } from "./access-token-providers";
/**
 * @file Pure data and computation for the Security page's Access Tokens tab — no React, no fetch,
 * no `t()` calls (every function here returns a dictionary key or plain fact for a caller to
 * translate/render). Same `rules.ts`-holds-the-logic convention `deployment/rules.ts`/
 * `source-control/rules.ts` follow.
 *
 * ## What this file does NOT reinvent
 *
 * This page is a UI consolidation over two credential stores that already exist and already work —
 * `publish_credential_sets` (hosts from the deploy registry's descriptors, `GET .../system/publish-targets`)
 * and `source_control_credential_sets` (hosts from plugins, `GET .../system/source-control/providers`). Every
 * provider's display label, token-creation URL, and scope-guidance copy is READ from those two
 * sources, never redeclared here — the owner's 2026-08-15 narrowing of that guidance text
 * (`source-control/rules.ts`'s own header records it) stays the one place it's written. Connection
 * shaping is the same story: {@link buildAccessTokenConnectionInput} below dispatches to
 * `buildCredentialConnectionInput`/`buildSourceControlConnectionInput` rather than re-deriving either
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
 * two into one row — {@link accessTokenProviders} lists both as separate entries even though they
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

/** The permission that gates the site key tab's very visibility, not just its actions — mirrors
 *  `apps/website/src/features/identity/site-key-permission.ts`'s `SITE_KEY_MANAGE_PERMISSION`
 *  literal. Duplicated as a plain string rather than imported: this app cannot import server code,
 *  the same reason `use-external-mcp-admissions.hooks.ts` duplicates `"system.write"` rather than
 *  importing it. */
export const SITE_KEY_MANAGE_PERMISSION = "admin.security.site-key.manage";

/** Which credential store a row belongs to. `"custom"` (2026-08-17) is the odd one out — see
 *  {@link AccessTokenRow.category}'s own doc: it has no fixed provider catalog behind it at all, an
 *  operator-typed row IS its own provider identity. */
/** The one id shared by the source-control token kind and its category. */
export const SOURCE_CONTROL = "source-control";

export type AccessTokenKind = "publish" | typeof SOURCE_CONTROL | "custom";

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
 * `purposeLabel` ("Hosting"/"Source control"), which is a per-provider DISAMBIGUATOR shown next to
 * a name, not a filter bucket — `github-pages` and `vercel` share the `"hosting"` category here even
 * though only `github-pages` needed a purpose subtitle to tell it apart from source-control's own
 * `github`. `purposeLabel` used to read "Publishing" for the four hosting providers, and "Source
 * Control" (title case) for the three source-control providers — the owner's 2026-09-21 ruling
 * collapsed BOTH onto the exact same string as this filter chip's own label ("Hosting"/"Source
 * control"), so a row's subtitle and the category chip that filters it always agree, letter for
 * letter (round 2 of that same ruling caught the source-control half: a custom row's `purposeLabel`
 * already read this table's own "Source control" via {@link accessTokenCategoryLabel}, so only the
 * three hardcoded catalog entries below were still out of step).
 */
export const ACCESS_TOKEN_CATEGORIES: readonly AccessTokenCategoryInfo[] = [
  { id: "all", label: "All" },
  { id: SOURCE_CONTROL, label: "Source control" },
  { id: "hosting", label: "Hosting" },
  { id: "media", label: "Media" },
  { id: "ai", label: "AI" },
  { id: "ops", label: "Ops" },
  { id: "general", label: "General" },
] as const;

/** Each row category's label and its position among the row categories in
 *  {@link ACCESS_TOKEN_CATEGORIES}. A `Record` keyed by {@link AccessTokenRowCategoryId}, so a
 *  lookup by a row's category always hits: every id has a matching table row by construction. */
const ROW_CATEGORY_INDEX = Object.fromEntries(
  ACCESS_TOKEN_CATEGORIES.filter((c) => c.id !== "all").map((c, rank) => [c.id, { label: c.label, rank }]),
) as Record<AccessTokenRowCategoryId, { readonly label: string; readonly rank: number }>;

/** A category id's own display label — `"general"`'s row-heading counterpart to
 *  {@link AccessTokenProviderInfo.purposeLabel} for a custom row, which has no static catalog entry
 *  to read a `purposeLabel` from (see {@link accessTokenRowProviderInfo}). Every {@link AccessTokenRowCategoryId} value has a matching row in
 *  {@link ACCESS_TOKEN_CATEGORIES} by construction (see {@link ROW_CATEGORY_INDEX}), so this never
 *  falls back. @complexity O(1). */
export function accessTokenCategoryLabel({ id }: { id: AccessTokenRowCategoryId }, _optional: Record<string, never> = {}): string {
  return ROW_CATEGORY_INDEX[id].label;
}

/** Whether `rowCategory` should show under the active category filter — `"all"` matches everything,
 *  every other id matches only its own bucket. @complexity O(1). */
export function accessTokenCategoryMatches({ rowCategory, activeCategory }: { rowCategory: AccessTokenRowCategoryId; activeCategory: AccessTokenCategoryId }, _optional: Record<string, never> = {}): boolean {
  return activeCategory === "all" || rowCategory === activeCategory;
}

/** The minimal shape {@link sortAccessTokenGroups} needs from a provider group — a structural
 *  subset of `AccessTokenProviderGroupState` (`use-access-tokens.hooks.ts`) so this pure sort has
 *  no dependency on that hook's own types (this file's own convention: `rules.ts` is never imported
 *  BY the reverse direction — see this file's header). `rows` is read only for its `.length` (is
 *  there at least one saved token for this group), never its contents. */
export interface AccessTokenGroupSortInput {
  readonly info: Pick<AccessTokenProviderInfo, "category" | "label">;
  readonly rows: readonly unknown[];
}

/**
 * The Secrets page's provider-group order — owner's 2026-09-21 ruling. Two tiers: every group with
 * at least one saved row (`rows.length > 0`) first, every "Not connected" group after. Within each
 * tier, grouped by category in the SAME order the filter chips render ({@link ACCESS_TOKEN_CATEGORIES},
 * minus `"all"`, which is the chip row's own "show everything" option and never a row's real
 * category — see {@link AccessTokenRowCategoryId}'s own doc), then alphabetical by the provider's
 * own `label`, locale-aware and case-insensitive (`toLocaleLowerCase()` before `localeCompare()` —
 * same "read like a human alphabetizing a shelf" convention `media/rules.ts`'s `sortMediaByOrder`
 * already uses for its own `"alphabetical"` order).
 *
 * A provider moving from zero saved rows to one (a Save that just succeeded) needs no special case
 * here: {@link AccessTokenGroupSortInput.rows}'s own length IS the tier a caller feeds in on every
 * render (`use-access-tokens.hooks.ts`'s `groups` is rebuilt from scratch whenever the underlying
 * row list changes), so a provider crossing that boundary simply sorts into the other tier the next
 * time this runs. Applies equally whether `groups` is the full catalog (`"All"` chip), narrowed to
 * one category (a single chip active), or narrowed by an active search query — this function only
 * ever reads each entry's own category/label/saved-count, never the set's size or the active
 * filter, so a smaller or single-category input sorts by the identical rule.
 *
 * Returns a NEW array — never mutates `groups` (same "caller's own array survives" contract
 * `sortMediaByOrder` documents for the identical reason: a caller may still need the unsorted list).
 *
 * @complexity Time O(n log n) in the group count (small — one entry per catalog provider plus one
 * per saved custom credential), space O(n) for the shallow copy.
 */
export function sortAccessTokenGroups<T extends AccessTokenGroupSortInput>({ groups }: { groups: readonly T[] }, _optional: Record<string, never> = {}): T[] {
  const sorted = [...groups];
  sorted.sort((a, b) => {
    const savedDiff = Number(b.rows.length > 0) - Number(a.rows.length > 0);
    if (savedDiff !== 0) return savedDiff;
    const categoryDiff = ROW_CATEGORY_INDEX[a.info.category].rank - ROW_CATEGORY_INDEX[b.info.category].rank;
    if (categoryDiff !== 0) return categoryDiff;
    return a.info.label.trim().toLocaleLowerCase().localeCompare(b.info.label.trim().toLocaleLowerCase());
  });
  return sorted;
}
