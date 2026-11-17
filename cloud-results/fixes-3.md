# fixes-3 / item 2: `fix/safehref-isallowedhref` — STOPPED: Jini's `isAllowedHref` is not behaviour-equal to Tovu's `safeHref`

Base: `origin/refactor/terra` = `232764af` (Tovu), Jini `65d73b0d`. Node 24.22.3. Item 1 is on `fix/link-jini-desktop` (its own `cloud-results/fixes-3.md`).

Per the brief ("if Jini's function differs on any input, STOP and list the differences"), **no `safeHref` was replaced, deleted or repointed.** The only change on this branch is the
characterization test below, which pins today's behaviour and the exact divergences so the owner's decision can be made on facts.

## What exists

There are **two** Tovu helpers (the size-03 split already moved the first one to `platform/html`, so the `render.ts:safeHref` named in the plan no longer exists):
1. `apps/website/src/platform/html/safe-url.ts` `safeHref({ value: JsonValue | undefined })`: 9 callers (render/components/layout, marketing, doc/marks, widgets/menu, widgets/social-entries, ...), placeholder base `https://tovu-safehref.invalid/`.
2. `apps/website/src/features/theme/render-contract.ts` `safeHref({ value: string })`: callers `static-render.ts` (also re-exported at `static-render.ts:182`), `entry-list-render.ts`; placeholder base `https://tovu-safehref.invalid/` with `protocol = "http:"` (so default-port normalization is HTTP's).
Plus `development/scripts/check-menu-href-allowlist-sync.ts` (gate) reads these by function text, and `features/site-export/site-exporter.ts` carries a doc-mention of a byte-identical copy.
Jini: `isAllowedHref({ rawHref })` (`packages/cms/src/navigation/menu-service.ts:199`) returns a boolean, placeholder base `http://safehref.invalid/`.

## Differences (the STOP list), measured by running all three over 52 inputs

Same decision on every ordinary input (all schemes, `javascript:`/`data:`/`file:`/`blob:`/`about:`, tab/newline/CR smuggling, `//evil.example`, `/\evil`, `///`, trim, case, `mailto:`, `#`, relative). Differences:

| # | difference | Tovu platform | Tovu theme | Jini (composed `isAllowedHref ? trim : "#"`) |
|---|---|---|---|---|
| 1 | `//tovu-safehref.invalid/x`, `/\tovu-safehref.invalid/x` (Tovu's own placeholder host) | accepted | accepted | **refused** |
| 2 | `//safehref.invalid/x`, `/\safehref.invalid/x`, `//safehref.invalid:80/x` (Jini's placeholder host) | refused | refused (`:80`: refused) | **accepted** (off-origin protocol-relative form, to a reserved `.invalid` host) |
| 3 | `//tovu-safehref.invalid:443/x` | accepted | refused | refused |
| 4 | `//tovu-safehref.invalid:80/x` | refused | accepted | refused |
| 5 | non-string input (`undefined`, `null`, number, object) | returns `"#"` | n/a (typed `string`) | **throws `TypeError`** (`rawHref.trim`) |
| 6 | return shape | trimmed href or `"#"` | same | boolean only; every caller would need its own trim + fallback (a coercing wrapper, i.e. the helper being deleted) |

Security reading (for the owner, not a decision): 1-4 only involve reserved `.invalid` placeholder hosts, so real attacker hosts are refused identically everywhere; difference 2 is the one that
loosens (a protocol-relative off-origin link is accepted, albeit to an unresolvable host). Difference 5 is a crash instead of `"#"` for raw widget-prop JSON, so callers handing `JsonValue` (widgets/menu, social-entries, doc marks) need a `typeof` guard. Differences 3 and 4 already exist **between the two Tovu copies today** (the `http:` protocol patch in render-contract), so the sync script's accept/reject table never exercises them.

## Done

- `apps/website/src/features/theme/__tests__/safe-href-characterization.test.ts` (new, 6 tests): exact output tables for both Tovu helpers (accepted-trimmed / refused-`#`), non-string coercion, and a Jini comparison that asserts agreement on every shared input and pins the exact divergent set above.
- Mutation proof: replacing the origin check in `platform/html/safe-url.ts` with `return href;` turns the file red (4 failures: `//evil.example`, ...); restored -> green (6/6). The mutation was reverted, nothing else in `src` changed.

## Gates

| command | result |
|---|---|
| `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test apps/website/src/features/theme/__tests__/safe-href-characterization.test.ts` | 6 pass, 0 fail |
| `npx eslint` on the new test | clean |
| `npx tsc -p tsconfig.tests.json --noEmit` filtered to the new file | no error |

## Left / next (owner decision needed)

Rule on differences 1-5. Suggested path if accepted: make the Jini placeholder host the single one (rows 1-4 then become intentional), add an `isAllowedHref`-based coercion at the 15 call sites with a `typeof` guard where raw JSON reaches them, repoint the sync script, then delete both Tovu `safeHref` functions. Alternatively fix Jini first (accept/refuse by comparing against the real origin rather than a placeholder, which removes rows 1-4 entirely) and re-run this test.
