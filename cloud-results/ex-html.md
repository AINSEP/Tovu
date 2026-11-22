PARTIAL: T-post-1.J moved 2 of 6 files — post-tool-schemas.ts, tiptap-block-schema.ts, tiptap-text-schema.ts, tiptap-doc-schema.ts are BLOCKED (host tool name `content_read` in agent-facing description literals, Jini guard R5-neutrality); C-platform-html-1.J is complete; all .T halves were out of scope for this run.

# ex-html — C-platform-html-1.J + T-post-1.J (Opus implementer, unattended)

Run date 2026-11-22. Node 24.22.3 (`/opt/node24`), pnpm 10.33.2.

## Branches and SHAs (both pushed with a plain push and confirmed with `git ls-remote`)

| repo | branch | base | commits |
|---|---|---|---|
| Jini | `codex/ex-html-jini` | `origin/integ/merge-12-2026-11-22` `6b8e0d48a` | `b63496240` C-platform-html-1.J · `2d7b65720` T-post-1.J · `5fab76617` test follow-up for the slugify dependency |
| Tovu | `codex/ex-html-tovu` | `origin/integ/merge-12-2026-11-22` `41e948ee4` | this report only. No Tovu source changes, because C-platform-html-1.T and T-post-1.T were not in this run. |

Plan inputs: `origin/plan/whats-left-1122` §1, the step sheets, and `plans/P9-codex-verify-N1-N4.md`. Codex's FIX corrections were applied over the sheets.

## Jini baseline on the unmodified tree (6b8e0d48a, after `pnpm install --frozen-lockfile` and `pnpm --no-bail -r build`, which were green)

| gate | baseline | after both steps |
|---|---|---|
| `pnpm guard` | ok, 0 violations | ok, 0 violations |
| `pnpm typecheck` | exit 0 | exit 0 |
| `pnpm api:check` | exit 0 | exit 0 after `api:update` (additive: 4 subpaths, listed below) |
| `pnpm check:hooks` | exit 0 | exit 0 |
| `pnpm check:size` | **red already**: 3 pre-existing (daemon `createAgentExecutor`, sidecar stale debt) | identical output |
| `pnpm check:complexity` | **red already**: 4 pre-existing (agent-runtime, chat, core, ui) | identical output |
| `pnpm check:cross-package` | **red already**: pre-existing XP5 rows (server, ui). It needs `git fetch --unshallow` for base `35c4961af` | identical output |
| `pnpm install --frozen-lockfile` | pass | pass with the new lockfile |

## Step 1 — C-platform-html-1.J (Codex N1 FIX scope)

**Files moved (verbatim, `diff` against the Tovu source is empty):**
- `apps/website/src/platform/html/slug.ts` -> `packages/cms/src/html/site/slug.ts`. Export `./html/site/slug` is `universal`.
- `apps/website/src/platform/html/source-edits.ts` -> `packages/cms/src/html/site/source-edits.ts`. Export `./html/site/source-edits` is **`node`**, which differs from Codex's "universal". cms `jini.isolation.forbidden.universal` lists `parse5`, and guard reported `SI-domain … ./html/site/source-edits: forbidden runtime import parse5` while it was universal. No code changed.
- Test: `apps/website/src/platform/html/__tests__/slug.test.ts` -> `packages/cms/src/html/site/__tests__/slug.test.ts`. The only edit is `import test from "node:test"` -> `import { test } from "vitest"`. 4/4 green.

**Not moved, as Codex ordered:** `escape.ts` retires to `@jini-ai/core/text` in .T, and `escape.test.ts` stays in Tovu. `menu-render.ts`, `published-webmcp-strip.ts` and `safe-url.ts` STAY in Tovu (product markers and the YouTube embed policy). No literals were renamed, so no rows were added to P9-BREAKS.

**Dependency:** `@sindresorhus/slugify: ^3.0.1` added to `packages/cms` `dependencies`. `pnpm-lock.yaml` is additive: slugify 3.0.1, transliterate 2.3.1, escape-string-regexp 5.0.0. `pnpm install --frozen-lockfile` passes afterwards.

**API baseline delta (`api-baseline/jini-ai__cms.json`):** added `./html/site/slug` and `./html/site/source-edits`. The changeset is `.changeset/p9-c-platform-html-1.md` (patch).

**Mutation (Codex: the ASCII corpus test, `decamelize: false` -> `true`):** this turned the test red. `× toSlug: every ASCII corpus string matches the old rule byte for byte` and `× …10,000 seeded random ASCII strings…` failed, 2 failed / 2 passed. After the revert it was green again (4/4), and the file is byte-identical to the Tovu source.

**Jini tests my move broke, now fixed (commit `5fab76617`):**
- `src/__tests__/identity-extraction.boundary.test.ts` and `src/__tests__/integration-package.contract.test.ts` pin cms's exact production dependency map. I added `"@sindresorhus/slugify": "^3.0.1"` with a why-comment. This expected value changed because the manifest changed on purpose.
- `src/content-types/__tests__/universal-entries.boundary.test.ts` threw `Unresolved universal-entry dependency … -> @sindresorhus/slugify`. Before this step, no universal cms entry imported any npm package. The guard now follows a bare import only when it is a **declared production dependency**, or when the import comes from inside an installed dependency. It resolves the import into node_modules, so it also checks the slugify -> transliterate / escape-string-regexp closure for Node builtins. An undeclared bare import still throws. The check got stronger, not weaker. Keeping slug `universal` is right because the host admin (browser) imports it.

## Step 2 — T-post-1.J (Codex N4 FIX scope; prerequisite "Jini CMS slug export lands" was met by `b63496240`)

**Files moved:**
- `apps/website/src/features/post/post-before-save.ts` -> `packages/cms/src/posts/post-before-save.ts`. Export `./posts/post-before-save` is `universal`. Edits: `@jini-ai/cms/core` -> `../core/index.js` (the same-package import made relative), and the comment `` `@tovu/sdk`'s `` -> `the host SDK's` (the why-sentence is kept).
- `apps/website/src/features/post/slug.ts` -> `packages/cms/src/posts/slug.ts`. Export `./posts/slug` is `universal`. Edit: `../../platform/html/slug.js` -> `../html/site/slug.js`.
- Test: `apps/website/src/features/post/__tests__/slug.test.ts` -> `packages/cms/src/posts/__tests__/slug.test.ts`. The only edit is the vitest import. 3/3 green.
- `packages/cms` `jini.isolation.shared` gets `src/html/site/slug.ts`. Guard SI-domain reported that `./posts/*` reaches `src/html/site/slug.ts (html)`. This uses the existing shared-path mechanism, the same one used by `src/navigation/href.ts`. No new layer or port.

**BLOCK found (STOP rule 2/3; these stay in Tovu):**
- `post-tool-schemas.ts` (lines 31, 48) and `tiptap-block-schema.ts` (lines 128, 167) contain `content_read.media_asset`, `content_post_create` and `media_generate_asset` inside **agent-facing tool-description string literals**. Guard `R5-neutrality: host tool name "content_read"` rejects them. These literals are host assistant guidance and use the host's tool vocabulary. Rewording them would change agent-visible behaviour, so they cannot move verbatim. Neither the sheet nor Codex foresaw this.
- `tiptap-doc-schema.ts` imports both of those files, and `tiptap-text-schema.ts` is used only by doc-schema. They cannot move without a Jini -> host edge, so they stay with them. The sheet's `./posts/post-tool-schemas` and `./posts/tiptap-doc-schema` exports were therefore **not** added.
- Codex's existing corrections still apply: `contracts/core/tool-metadata/post.ts` stays in Tovu, and `rendering.ts` is a shell that .T deletes.
- To unblock: an owner decision is needed on whether agent-facing schema descriptions may name host tools. If they may, add the names to Jini's `HOST_TOOL_NAMES` allowance. If not, the host must inject the description strings, which is a new injection point and needs a revised sheet.

**API baseline delta:** added `./posts/post-before-save` and `./posts/slug`. The changeset is `.changeset/p9-t-post-1.md` (patch).

**Mutation (Codex: the long-slug assertion proves the collision-suffix reservation):** I changed `slice(0, MAX_SLUG_LENGTH - DERIVED_SLUG_SUFFIX_ROOM)` -> `slice(0, MAX_SLUG_LENGTH)`. The test went red: `× derivePostSlugBase leaves room for a collision suffix…`, `AssertionError: Expected values to be strictly equal`, 1 failed / 2 passed. After the revert it was green (3/3), and the only diff from the Tovu source is the import line.

## Wider Jini checks

- `packages/cms` full vitest run: **5016 / 5017 passed**. The one remaining failure, `forms/src/__tests__/package-boundary.test.ts` (it expects version `0.7.3-next.2` and gets `0.7.2`), is pre-existing. This branch changes nothing under `packages/cms/forms` or `src/forms` and no version field. `create-tables.reference.test.ts` (pglite) failed once in the first full run and passed in the second, so it is flaky and does not touch these files.
- `npm --prefix packages/cms run check:packaging` reports 1 problem in `src/media/video-frames.ffmpeg.ts` (`process.env`). That is pre-existing and unrelated.
- `scripts/__tests__/check-subpath-isolation.test.ts` is green. `scripts/__tests__/optional-peer-contract.test.ts` has 3 pre-existing failures, all in agentic, platform (parse5), ui (lexical) and daemon (express). None involve cms or slugify.

## Tovu gates

None ran. No Tovu code changed in this run, because both .T halves are out of scope. When C-platform-html-1.T and T-post-1.T run, they need linked typecheck, tests, check:hooks, size and complexity, using the Codex rewrites plus this report's BLOCK list. T-post-1.T must **not** rewrite the post-tool-schemas, tiptap-doc-schema or tool-metadata importers, and the `features/post/index.ts:12` / `contracts.ts:2` BeforeSaveHookPort forwards plus Codex's 9 extra consumers do apply.

## FILES-LEFT (Jini-bound files still in Tovu, measured with `plans/P9-data/tools/scan.mjs` + `plan.mjs` on Tovu `41e948ee4`)

| | count |
|---|---|
| before this run | **2,509** (2,488 to move + 21 shells; the same total as the plan) |
| after this run | **2,509**. Tovu is unchanged: J steps only copy code into Jini, and the sources are deleted by the .T halves, which were not in this run. |
| removable by the pending .T halves | 6: `platform/html/slug.ts`, `platform/html/source-edits.ts`, `platform/html/escape.ts` (retires to `@jini-ai/core/text`), `features/post/slug.ts`, `features/post/post-before-save.ts`, `features/post/rendering.ts` (shell). After those land the count would be **2,503**. Codex also reclassifies 3 platform-html files and `tool-metadata/post.ts` as STAYS, and this run blocks 4 post schema files. |
