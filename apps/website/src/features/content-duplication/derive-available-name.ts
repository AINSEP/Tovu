/**
 * @file Resource-agnostic naming policy for `content_duplicate`'s DEFAULT copy name — shared by
 * post/page, form, and media. None of their repo ports has a `findByTitle` lookup (only
 * `findById`/`findBySlug`/`list` — confirmed by reading `PostRepoPort`, `FormDefinitionRepoPort`, and
 * `MediaRepoPort` directly), so every caller of {@link deriveDuplicateName} answers `isTaken` with an
 * O(n) `list()` scan. That is a deliberate, RECORDED scale-bounded choice, not something slipped in:
 * at current scale (read live, 2026-09-08) this workspace holds 78 pages, 64 posts, 3 forms, and 17
 * media rows. Adding a `findByTitle` port method to three domains was explicitly out of scope for
 * this change; revisit this file if any of those counts grows into the thousands.
 *
 * ## The owner's ruling this file implements (2026-09-08)
 *
 * A copy with no name given is an exact copy of the source except for its name (and slug, which
 * follows the name for post/page and form — see each resource's own duplicate handler), which gets a
 * numeric suffix: `Landing sample — xai` -> `Landing sample — xai 2`; copy again -> `... 3`. Never
 * `Copy of ...`, which produces `Copy of Copy of X` on a second copy and is untranslatable.
 *
 * ## `deriveAvailableName` — the collision-search loop
 *
 * Generalizes `features/forms/duplicate-slug.ts`'s `deriveAvailableFormSlug` loop (bounded suffix
 * search, an injected `isTaken`, a BASE that shrinks to make room for the suffix rather than the
 * suffix itself) so the one loop is shared rather than reinvented for names: `deriveAvailableFormSlug`
 * now delegates here for its own hyphenated, length-capped slug search (see that file), and every
 * `content_duplicate` resource handler calls it directly (via {@link deriveDuplicateName} below) for
 * the plain, space-suffixed NAME search this file's header describes.
 *
 * ## `deriveDuplicateName` — the trailing-number rule
 *
 * A trailing integer already on the source's own name is read as an existing copy counter — and so
 * is stripped before searching from it — ONLY when the stripped base itself already exists as a name
 * in the same resource (that is the evidence it really is a copy counter, not part of the name).
 * `Landing 2` increments to `Landing 3` only if something named `Landing` exists. `Blog 2024` with no
 * `Blog` row becomes `Blog 2024 2`, because `2024` is read from the data as part of the name, never
 * guessed at from the number's own magnitude.
 */

/**
 * Bound on the suffix search, so a pathological workspace (or a buggy `isTaken`) can never spin
 * forever. Mirrors `duplicate-slug.ts`'s own former `MAX_SUFFIX_ATTEMPTS` in both spirit and value:
 * generous enough that reaching it means something is genuinely wrong, not that a resource has many
 * legitimate copies.
 */
export const MAX_SUFFIX_ATTEMPTS = 1000;

/**
 * Bounded suffix search over candidate names: tries `base` itself, then `withSuffix(base, 2)`,
 * `withSuffix(base, 3)`, … until `isTaken` reports one free.
 *
 * @param required.base - The first candidate tried, unmodified.
 * @param options.isTaken - Whether a candidate is already in use. This loop makes no distinction
 * between "taken" and "otherwise unusable" — fold in any other skip rule (a reserved word, a format
 * check) by also returning `true` for it, mirroring how `duplicate-slug.ts` folds in its reserved-slug
 * and pattern checks.
 * @param options.withSuffix - Builds every candidate after the first. Defaults to a plain
 * space-separated number (`"${base} ${suffix}"`), matching the owner's own examples above. Pass a
 * different one (`duplicate-slug.ts` passes a hyphenated, length-capped version) to reuse this same
 * loop for a differently-shaped candidate space.
 * @param options.onExhausted - Called instead of throwing the generic exhaustion error once every
 * attempt is taken, so a caller can raise its own domain-specific message (e.g. "give the copy an
 * explicit slug" rather than "...an explicit name"). Must throw; if it returns, the generic error is
 * thrown anyway.
 * @returns The first candidate `isTaken` reports free.
 * @throws {Error} If {@link MAX_SUFFIX_ATTEMPTS} candidates are all taken and no `onExhausted` is
 * given (or it returns without throwing).
 * @complexity O(k) `isTaken` calls, where k is the number of colliding candidates, bounded at
 * {@link MAX_SUFFIX_ATTEMPTS}.
 */
export async function deriveAvailableName(
  required: { base: string },
  options: {
    isTaken: (candidate: string) => Promise<boolean>;
    withSuffix?: (base: string, suffix: number) => string;
    onExhausted?: () => never;
  }
): Promise<string> {
  const withSuffix = options.withSuffix ?? defaultWithSuffix;

  for (let suffix = 1; suffix <= MAX_SUFFIX_ATTEMPTS; suffix += 1) {
    const candidate = suffix === 1 ? required.base : withSuffix(required.base, suffix);
    if (!(await options.isTaken(candidate))) return candidate;
  }

  if (options.onExhausted) options.onExhausted();
  throw new Error(
    `no free name could be derived from '${required.base}' after ${MAX_SUFFIX_ATTEMPTS} attempts — ` +
      "give the copy an explicit name"
  );
}

/** {@link deriveAvailableName}'s default `withSuffix`: a plain space then the number, matching the
 *  owner's own examples (`"Landing sample — xai 2"`) — never a hyphen or a parenthesis. */
function defaultWithSuffix(base: string, suffix: number): string {
  return `${base} ${suffix}`;
}

/**
 * Matches a name ending in a space then one or more digits, capturing the part before it — e.g.
 * `"Landing 2"` -> `["Landing 2", "Landing"]`. Requires at least one non-space character immediately
 * before the space, so a bare `"2"` (nothing to strip) does not match.
 */
const TRAILING_NUMBER_PATTERN = /^(.*\S) \d+$/;

/**
 * Derives `content_duplicate`'s default copy name for any resource, applying the trailing-number
 * rule from this file's header to decide what to search from, then delegating the actual search to
 * {@link deriveAvailableName}.
 *
 * The source's own name is never returned: it is definitionally taken (the source row itself still
 * holds it), so the first real candidate a caller sees is always a suffixed one.
 *
 * @param required.sourceName - The row being copied's own title/name, verbatim.
 * @param options.isTaken - Whether a candidate name already exists in this resource — see this file's
 * header for why every current caller answers this with a single `list()` scan rather than a
 * `findByTitle` port method.
 * @returns A name `isTaken` reports free.
 * @throws {Error} If {@link MAX_SUFFIX_ATTEMPTS} candidates are all taken.
 * @complexity One extra `isTaken` call (the trailing-number check, only when the source name matches
 * {@link TRAILING_NUMBER_PATTERN}) plus {@link deriveAvailableName}'s own O(k).
 */
export async function deriveDuplicateName(
  required: { sourceName: string },
  options: { isTaken: (candidate: string) => Promise<boolean> }
): Promise<string> {
  const match = TRAILING_NUMBER_PATTERN.exec(required.sourceName);
  const strippedBase = match?.[1];
  const base = strippedBase !== undefined && (await options.isTaken(strippedBase)) ? strippedBase : required.sourceName;

  return deriveAvailableName({ base }, { isTaken: options.isTaken });
}
