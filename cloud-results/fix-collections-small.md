PARTIAL: collections named-mutation evidence for the cms entries/site + taxonomy/site moved slices (rv-a C5 tail) not recorded — tool-call cap; every rv-a FIX item is otherwise applied

# rv-a fix run — collections + small (resume after the weekly-limit stop)

Source: Tovu `origin/plan/whats-left-1122:reviews/rv-a-collections-small.md`. Branch commits since 2026-11-23T07:30Z were read first; items already committed there were skipped, not redone.

## Per item

| item | status | Jini commit(s) | Tovu commit(s) |
|---|---|---|---|
| C1 re-export shells | already fixed (prior run) — skipped | `1d3b1b67`, `b3fbec87` (api) | `5456cf787`, `85c065878` |
| C2 TaxonomyRowMenu hook + `jini-*` classes | already fixed — skipped | `63c66029` | `fdb4fbf7d`, `85c065878` |
| C3 entry-ref warning at host | already fixed — skipped | `1d3b1b67` | `ab89ff8ae` |
| C4 gated envelopes → `@jini-ai/core/contracts/site/gated-results` | already fixed — skipped | `7b176d46` | `e7ba7afdc` |
| C5 drop size exceptions / defer dictionaries | already fixed — skipped | `6f826bde` | `c597916c3` |
| C5 tail: other slices' named mutations | **partial** (this run) — see Mutations; `useJsonFieldControl` survivor closed with a new test | `25e61a37` | — |
| S1 Forms DTOs vs Express adapter | already fixed (prior run) — skipped | `78269057` | `c8d166647` |
| S2 media console reporter + salt warning + RuntimeMode | **fixed** | `2e8bba97`, `ae07d937` (api) | `e7fe3f0d8` |
| S3 MenuPageLinkFields hook + `jini-*` classes | **fixed** | `91fc1a6b`, `ae07d937` (api) | `072b03c30` |
| S4 named-mutation gaps (small) | **fixed** — evidence below; 2 survivors closed with new tests | `38050da2`, `6b9a66a5` | — |

### S2 details
- `media-html-log.ts` and its three console suites returned verbatim to Tovu `apps/website/src/features/widgets/` (restored from `c97e7bd02^`). `render/widgets/media.ts` passes it through the existing `report` option. The Jini file, its `exports`/`jini.entries`, the API-baseline entry and the changeset mention are removed.
- `resolveCommentsIpHashSalt`: `warn` is now a **required** port (no `console.warn` default). Tovu `visitor-submit.ts` supplies the current sink (`console.warn(line)`), so the production fallback and its warning text are unchanged. The Jini test now also asserts the package itself never calls `console.warn`.
- K4-seam-9 type-only move done. New `@jini-ai/core/contracts/site/core-runtime-mode` (`RuntimeMode`, types only, plus exports, `jini.entries` and changeset `p9-ex5-core-runtime-mode.md`). `ip-hash-salt.ts` uses it. In Tovu, all 12 `RuntimeMode` type importers now read it from core. `contracts/core/runtime-mode.ts` imports it for `resolveRuntimeMode`'s return type and no longer exports it, so it is not a shell.

### S3 details
- `MenuPageLinkFields` takes a required `useMenuPageLinkFields` (type-only import, no default). Its classes are `jini-menu-page-link-{label,visually-hidden,unavailable}`.
- Tovu `MenuEditor.tsx` and `page-link-fields.unit.test.tsx` pass the hook explicitly.
- The new classes are aliased in Tovu CSS: `.a11y-label-wrap` (`styles/editor.css`), `.visually-hidden` and `.muted-cell` (`styles.css`), so layout and hidden text stay as they are. Contextual rules (`.assistant-toggles .muted-cell` and similar) do not touch menus.
- Tests first: new Jini `MenuPageLinkFields.unit.test.tsx` was red (`a11y-label-wrap` ≠ `jini-menu-page-link-label`) before the component change.

## Mutations (each red, restored byte-identical with `cmp`, green again)

**Small lane (S4):**
- `cms/admin-http/http/forms.ts`: returning the original `fields` array → 1 failed. Sharing field objects (`map(f => f)`) → 1 failed. Returning the original `notify.recipients` → 1 failed. Restored: 4/4.
- `comments/site/ip-hash-salt.ts`: `required.warn` → `console.warn` → 2 failed, restored 6/6.
- `screens/menus/MenuPageLinkFields.tsx`: unavailable class back to `muted-cell` → 1 failed, restored 2/2.
- Jini | cms/src/forms/site/form-destination-manifest.ts | drop the active-only filter | mutated: 1 failed | 10 passed (11) | restored(cmp=identical): 11 passed (11) |
- Jini | cms/src/forms/destinations/pull.ts | invert the hasMore stop | mutated: 4 failed | 10 passed (14) | restored(cmp=identical): 14 passed (14) |
- Jini | cms/src/forms/destinations/select.ts | never pick an external receiver | mutated: 1 failed | 5 passed (6) | restored(cmp=identical): 6 passed (6) |
- Jini | cms/src/comments/site/comment-targets.ts | ignore the post fallback | mutated: 1 failed (1) | restored(cmp=identical): 1 passed (1) |
- Jini | cms/src/public-http/http/site/form-validation-i18n.ts | drop the pt -> pt-BR fallback | mutated: 1 failed | 3 passed (4) | restored(cmp=identical): 4 passed (4) |
- Jini | admin/src/screens/forms/index-aligned-translations.ts | blank instead of key fallback | mutated: 1 failed | 2 passed (3) | restored(cmp=identical): 3 passed (3) |
- Jini | admin/src/screens/menus/page-link-rules.ts | never treat an untyped entryRef as a page | mutated: 1 failed | 14 passed (15) | restored(cmp=identical): 15 passed (15) |
- Jini | admin/src/screens/menus/MenuPageLinkFields.hooks.ts | invert isPage | mutated: 1 failed | 4 passed (5) | restored(cmp=identical): 5 passed (5) |
- Jini | admin/src/screens/menus/MenuEditor.hooks.tsx | count direct children only | mutated: 3 passed (3) | restored(cmp=identical): 3 passed (3) |
- Jini | cms/src/public-http/http/site/render/widgets/placeholder.ts | drop the placeholder class | mutated: 1 failed (1) | restored(cmp=identical): 1 passed (1) |
- Jini | cms/src/forms/site/mail-outbox-readiness.ts | invert the forms check | mutated: 1 failed (1) | restored(cmp=identical): 1 passed (1) |
- Jini `form-label-inspection.ts`: aria-label no longer wins → 1 failed. Label text descending into style/script → 1 failed after the fixture gained `<style>` inside a label (survived on the first fixture). Skipping script/template in `elements` is an **equivalent mutant**: parse5 keeps their content out of `childNodes`. This is documented in the test.
- `MenuEditor.hooks.tsx` (count direct children only) **survived** the moved suite. A new test pins the recursive count: 1 failed under the mutation, restored 4/4.
- `placeholder.ts` (drop the class) **survived** Tovu's `render-doc-widget-port` test. A new Jini characterization test catches it (1 failed). New Jini tests were also added for `form-label-inspection` and `mail-outbox-readiness`.
- Built output, run through the Tovu suites:
  - | admin/dist/screens/menus/html-rules.js (built output, via Tovu html-embed.unit.test.tsx menu-html-mode.unit.test.tsx) | drop the lastKnownHref starter fallback | before: 21 passed (21) | mutated: 3 failed | 18 passed (21) | restored(cmp=identical): 21 passed (21) |
  - | admin/dist/screens/forms/forms-leave-guard-i18n.js (built output, via Tovu forms-leave-guard-i18n.unit.test.ts) | misalign keys and translations by one | before: 3 passed (3) | mutated: 1 failed | 2 passed (3) | restored(cmp=identical): 3 passed (3) |
  - | admin/dist/screens/forms/forms-field-settings-i18n.js (built output, via Tovu forms-field-settings-i18n.unit.test.ts) | misalign keys and translations by one | before: 4 passed (4) | mutated: 1 failed | 3 passed (4) | restored(cmp=identical): 4 passed (4) |
  - | cms/dist/public-http/http/site/render/widgets/placeholder.js (built output, via Tovu render-doc-widget-port.unit.test.ts) | drop the placeholder class | before: pass 4 fail 0 | mutated: pass 4 fail 0 | restored(cmp=identical): pass 4 fail 0 |
  - | cms/dist/forms/site/mail-outbox-readiness.js (built output, via Tovu forms-notification-retry.test.ts) | invert the forms capability check | before: pass 2 fail 2 | mutated: pass 1 fail 3 | restored(cmp=identical): pass 2 fail 2 |
  - The base for `forms-notification-retry` is pass 2 / fail 2 before the mutation: it was already red (environment), and the mutation adds 1 more failure. This slice is now also pinned by the new Jini test.
- Types-only slices (`*-api.types`, `forms/site/import-remote-submissions`, `menus-port.hooks`) have no behavior, so no mutation applies.

**Collections (C5 tail, partial):**
- Jini | admin/src/screens/taxonomy/html-rules.ts | duplicate taxonomy names still embed by name | mutated: 1 failed | 4 passed (5) | restored(cmp=identical): 5 passed (5) |
- Jini | admin/src/screens/taxonomy/TaxonomyRowMenu.tsx | unprefixed trigger class (C2) | mutated: 1 failed | 7 passed (8) | restored(cmp=identical): 8 passed (8) |
- `use-json-field-control.hooks.ts` (stringify `undefined` directly) **survived** (6/6) the moved suite. A new test catches it: 1 failed / 7, restored 7/7 (`25e61a37`).
- The earlier run recorded the dictionaries' common-fallback mutation (red 2/2). Those dictionary moves are now deferred.
- **Not recorded (left):** cms `entries/site/{contracts,tool-registrations,tool-metadata,public-list,system-content-types}`, `widgets/site/declared-content-type-owners`, `content-types/site/tool-metadata` and `taxonomy/site/{tool-metadata,content-targets}`.

## Tests and gates

**Setup:**
- Jini: `pnpm install --frozen-lockfile` 0; `pnpm -r build` 0, with 0 `error TS`.
- Tovu: `npm ci --ignore-scripts` (root, admin, desktop, site-chat) 0; `link-jini` 0. `@tovu/sdk` was built so the composition tests could load.

**Jini small** (tip `ae07d937`):
- core/cms/admin build 0; `pnpm api:update` (baseline committed).
- `pnpm guard` 0 ("zero violations"; it prints one pre-existing hardwiring note: 2 stale `env-access-debt.json` rows).
- `pnpm typecheck` 0.
- vitest: cms comments/site, forms.characterization, public-http/site, forms/site, forms/destinations 10 files / 50 tests green; admin screens/menus + screens/forms 5 files / 29 green.

**Jini collections** (tip `25e61a37`):
- build of core/cms/admin and their dependents 0; `pnpm guard` 0; `pnpm typecheck` 0.
- vitest: core 219 files / 2978 green; admin screens/taxonomy 28/28; cms entries + widgets 1108/1109.
- The one red is `expand-partials.test.ts`, failing with `RegExp.escape is not a function`. This is the container's Node version, not this change. Tovu's `no-silent-drops.test.ts` is red for the same reason.

**Tovu small** (tip `072b03c30`):
- website `tsc -p tsconfig.json` 0.
- admin `tsc` shows the 4 known host-kit-field errors only (`jini-kits.ts` Icon/useT, `main.tsx` values, `render-with-jini-kits.tsx`). The review notes these are pre-existing and wait on A-K2-0a.T.
- admin vitest `features/menus` (--maxWorkers=2): 13 files / 203 green.
- website node:test: the restored media-html suites, runtime-mode unit and visitor-capabilities pin: 30/31. The 1 red is the `RegExp.escape` env failure above.

**Tovu collections** (tip `85c065878`, unchanged this run):
- website tsc 0; admin tsc has the same 4 known errors.
- admin vitest taxonomy/collections/database/recovery plus two i18n suites: 44 files / 940 green.
- website entry-refs suites, including integration: 63/63.

## FILES MOVED (this run)
- Jini → Tovu (move reverted): `packages/cms/src/widgets/site/media-html-log.ts` → `apps/website/src/features/widgets/media-html-log.ts`. The three suites `media-html-{characterization,events,report-drops}.unit.test.ts` returned to `features/widgets/__tests__/unit/`.
- New in Jini: `packages/core/src/contracts/site/core-runtime-mode.ts` (type `RuntimeMode`; Tovu keeps `resolveRuntimeMode`).
- New tests (Jini):
  - `admin/screens/menus/__tests__/MenuPageLinkFields.unit.test.tsx`
  - `cms/public-http/http/site/render/widgets/__tests__/placeholder.unit.test.ts`
  - `cms/public-http/http/site/__tests__/form-label-inspection.unit.test.ts`
  - `cms/forms/site/__tests__/mail-outbox-readiness.unit.test.ts`
  - extra cases in `MenuEditor.remove-hook.unit.test.tsx` and `use-json-field-control.unit.test.ts`

## Wiring docs
- `## Wiring` sections were added to Tovu `contracts/core/INFO.md`, `features/{origin,post,webhooks}/INFO.md` and `features/menus/README.md`.
- `features/widgets` has no INFO.md/README, so none was created there.

## Merge notes
- Both lanes now add a type-only core contract: collections adds `gated-results`, small adds `core-runtime-mode`. Expect an adjacent-line conflict in `packages/core/package.json` (`jini.entries` and `exports`) and in `api-baseline/jini-ai__core.json`. Keep both entries and regenerate.
