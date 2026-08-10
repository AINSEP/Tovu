# `@jini-ai/renderers-react` → `@jini-ai/ui/renderers` — handoff report

Repo: `/Users/la/Programming/Jini`, branch `refactor/jini-admin-extraction`. Agent Direct Mode
(Programmer role) — no spec/ADR artifact; this prompt is the authoritative requirement.

**Correction to the original brief:** the brief stated Tovu has zero references to
`@jini-ai/renderers-react`. That was wrong — see "Downstream / not done here" below. Tovu was
never edited by me; the coordinator handled that side directly, in parallel with this work.

## Downstream / not done here (Tovu repo — explicitly out of scope, not edited by me)

Real Tovu-side consumers of the moved package, found by the coordinator mid-task and independently
re-confirmed by me (read-only) before finalizing this report:

- `apps/admin/src/features/pages/PageEditor.tsx:2` — `import { SrcDocSandbox } from "..."`, plus a
  doc-comment mention at line 273. **Verified from the Jini side:** `SrcDocSandbox` is present in
  `packages/ui/src/renderers/index.ts`'s barrel (unchanged, moved verbatim), in the built
  `dist/renderers/index.js` runtime export list, and resolves live via
  `node --input-type=module -e "import('@jini-ai/ui/renderers')"` → `typeof SrcDocSandbox ===
  'function'`. As of my last check this file already imports from `@jini-ai/ui/renderers`, not the
  retired package name.
- `apps/admin/package.json` and `apps/site-chat/package.json` (the latter not named in the original
  brief — found independently while re-checking) both declared
  `"@jini-ai/renderers-react": "file:../../../Jini/packages/renderers-react"`. As of my last check
  neither file declares it anymore (both already point only at
  `"@jini-ai/ui": "file:../../../Jini/packages/ui"`, which was already present in both). This state
  was observed to be in flux during my check (one read showed the line present, a subsequent read
  moments later showed it removed) — consistent with concurrent edits happening outside this
  session. Treat my observation as a snapshot, not a guarantee of final state; verify directly
  before relying on it.
- `apps/admin/vite.config.ts:46` — one stale comment listing `renderers-react` among packages that
  "carry their own `node_modules/react`". Not functional (comment only), left as-is since it's
  Tovu source.
- `apps/admin/package-lock.json` and `apps/site-chat/package-lock.json` still contain
  `renderers-react` lockfile entries; expected to resolve on Tovu's next `npm install` and not
  independently concerning.

None of the above was edited by me — Jini-side verification only, reported for the coordinator's
awareness per their explicit correction.

## Files changed

**Step 1 (break the `ui ↔ chat` cycle), before the move:**
- `packages/renderers-react/src/registry.ts` — dropped `@jini-ai/chat` imports; `resolveArtifactManifest` now `return file.manifest ?? null`; added a doc comment explaining inference is a caller concern.
- `packages/renderers-react/src/types.ts` — `ArtifactManifest`/`ArtifactKind`/`ArtifactRendererId`/`ArtifactExportKind`/`ArtifactStatus` defined locally (copied verbatim from `packages/chat/src/core/util/types.ts`), replacing the `@jini-ai/chat` re-export.
- `packages/renderers-react/package.json` — removed `@jini-ai/chat` dependency.
- Test updates enumerated in its own section below.

**Step 2 (the move):** `git mv` of the entire `packages/renderers-react/src/**` tree into `packages/ui/src/renderers/**` (67 files, history preserved — see `R`/`RM` status). `vitest-env.d.ts`/`vitest-jest-dom.d.ts` dropped from the incoming side (byte-identical to ui's existing copies — `diff` confirmed). `source-map.md`, `README.md`, `CHANGELOG.md` moved alongside; `CHANGELOG.md` got a one-line provenance header; `README.md` content updated (install command, import paths, the manifest-inference removal, a corrected usage example that now needs an explicit `manifest`). `packages/renderers-react/` deleted entirely (`package.json`, `tsconfig.json`, `vitest.config.ts`, `vitest.setup.ts`, plus gitignored `dist/`/`node_modules/`, both confirmed via `git check-ignore -v` before `rm -rf`).

**Step 3:** `packages/ui/package.json` — added `"./renderers"` export (3-key shape matching every other subpath); removed `@jini-ai/renderers-react` dependency; added `"shiki": "^1.24.4"` (renderers-react's exact declared version). `micromark`/`micromark-extension-gfm` versions already matched exactly (`^4.0.0`/`^3.0.0`) — no mismatch. All needed devDependencies (`@testing-library/*`, `jsdom`, `@vitest/coverage-v8`, `@types/react*`, `react`/`react-dom`) were already present at identical versions — nothing added, no mismatch. `peerDependencies` react/react-dom ranges already identical. Did not add `jini.entries` (would require a key for all ~12 existing subpaths, out of scope; ui's existing top-level `runtime: "browser"` already covers the new subpath, and renderers-react was also `runtime: "browser"`). Edit was a minimal targeted diff — did not touch the other in-flight modifications already in this file.

**Step 4:** `packages/ui/tsconfig.json` — **no change**; `lib`/`jsx`/`types` already identical to renderers-react's. `packages/ui/vitest.config.ts` — re-rooted the two type-only coverage excludes (`src/renderers/types.ts`, `src/renderers/preview-modal-shell/types.ts`), re-verified zero-runtime-declaration via the same grep before adding. `packages/ui/vitest.setup.ts` — merged renderers-react's `vitest.setup.ts` stubs (matchMedia, `URL.createObjectURL`/`revokeObjectURL`, `window.CanvasRenderingContext2D`, `HTMLCanvasElement.toBlob`, `Image`) into ui's existing setup, unioning the canvas-2D-context fake's method set with ui's pre-existing Excalidraw-probe stub rather than letting one unconditional assignment silently clobber the other. This was **load-bearing, not cosmetic**: `shiki.ts`'s tests and every `annotation-canvas` test call these APIs with no per-test stub, relying entirely on the package-wide default; skipping the merge would have crashed ~15+ moved tests. Verified safe against every pre-existing ui test that touches these same globals (all use `vi.stubGlobal`/`vi.spyOn`, which fully replace the global for that test regardless of the ambient default — including the one test that explicitly asserts the *absence* of `URL.createObjectURL`, `vi.stubGlobal('URL', {})`, which is unaffected).

**Step 5:** `packages/ui/src/features/html-viewer/dependencies.ts`, `.../react/hooks/useDeckNavigation.ts` — `@jini-ai/renderers-react` → relative imports (`../../renderers/index.js` and `../../../../renderers/index.js` respectively — different depths, computed per file, not pattern-matched). `.../features/html-viewer/__tests__/dependencies.test.ts` — same, plus both the `vi.mock(...)` factory specifier and the `vi.importActual<typeof import(...)>` type argument updated to the identical relative specifier (verified the mock still takes effect: `openSandboxedPreviewInNewTab` assertion in that file still passes). `packages/chat/package.json` — removed the dead `@jini-ai/renderers-react` dependency (never imported; chat's own `artifact-types.ts` uses a local stub — untouched, out of scope per the brief). `.changeset/fold-renderers-react-into-ui.md` — new changeset, `@jini-ai/ui: minor` / `@jini-ai/chat: patch`.

**Doc-comment updates** (describing current identity, in `packages/ui/src/**`): `features/memory/react/render-markdown.tsx`, `features/memory/react/components/MemoryEntryCard.tsx`, `browser/useGlobalKeydown.ts`, `src/renderers/__tests__/shiki.ssr.test.ts` (fixed a stale `packages/renderers-react/source-map.md` path pointer).

**Scope-violation caught and reverted mid-task:** I initially also edited a doc comment in `packages/ui/src/features/interactive-ui/registry.ts` and `.../interactive-ui/README.md`. Both files turned out to be entirely untracked (`git ls-files --error-unmatch` fails on them) — part of the concurrent agent's in-flight `interactive-ui` work explicitly named off-limits in the brief. Caught via a full tracked/untracked audit of every file I'd touched before finishing verification; both edits reverted to their original text byte-for-byte. No other file I touched is untracked.

## Step-1 test assertion changes (enumerated)

`resolveArtifactManifest`'s inference removal ripples into every test that exercised default-registry routing via a bare file name with no explicit `manifest` (the four bundled renderers gate `canRender` on a resolvable manifest *before* their own `file.kind`/extension fallback, so removing inference makes that gate fail-closed for any file without one):

- `registry.test.ts`: `resolveArtifactManifest` describe block — 1 test renamed to assert the inference case now returns `null`; 2 others' assertions unchanged (still valid under the new contract), retitled for accuracy. `RendererRegistry` describe block — 3 of 6 tests needed an explicit manifest attached to `file()` to keep exercising the renderer-matching path (`resolve()`) at all, not just its manifest-gate early return; without it they'd still pass but would stop covering the `!renderer` / matched-renderer branches.
- `renderers/__tests__/html.test.ts`, `markdown.test.ts`, `react-component.test.ts`: 1 test each flipped `true`→`false` (a bare recognized-extension file no longer resolves); renamed to say so.
- `renderers/__tests__/svg.test.ts`: 2 tests flipped `true`→`false`, same reason; 1 stale comment referencing "always legacy-infers" corrected.
- `renderers/__tests__/index.test.ts` (`createDefaultRendererRegistry`): the 3-case `it.each` and the "host registers its own deck-html renderer" test both previously routed via inference on a bare file name — rewritten to attach an explicit manifest matching what inference used to produce, so the test still proves the four renderers are wired correctly into one registry, not just that the registry no-ops.
- `react/components/__tests__/ArtifactView.test.tsx`: 6 of 13 tests needed an explicit `manifest` added to their `ArtifactFile` literal — without it, `ArtifactView` renders its fallback message instead of the intended renderer, and two "missing content" assertions (`not.toContain('undefined')`) were passing **vacuously** against the fallback text rather than the intended render path. All 6 fixed by attaching a `htmlManifest`/`markdownManifest` constant.

No test was deleted or weakened; every changed assertion either tests the new documented contract, or restores a manifest to keep testing what it always meant to test.

## Verification (fresh, this session)

```
cd /Users/la/Programming/Jini
pnpm install                                    # after confirming integrations-collapse signature — see below
```
- `pnpm --filter @jini-ai/renderers-react run typecheck && run test` (BEFORE the move, gating Step 2): typecheck clean; **496/496 tests pass** (29 files) — same count as the pre-existing baseline, confirms Step 1 introduced no regressions.
- `pnpm --filter @jini-ai/ui run typecheck`: clean (0 errors) after `pnpm install` linked `shiki`. Before install: 2 expected `Cannot find module 'shiki/bundle/web'` errors (dependency not yet linked) — resolved by install, not a real issue.
- `pnpm --filter @jini-ai/ui run test`: **5775/5775 tests pass, 424/424 files green.** Baseline was ui's ≈5236 + renderers-react's 496 ≈ 5732; actual 5775 is *above* that, explained by other in-flight untracked feature work (a2ui/html-editor/interactive-ui) already present in the tree adding its own tests — not something I added or dropped.
- `pnpm --filter @jini-ai/ui run test:coverage`: **see Coverage section below — below threshold, not lowered, flagged for your decision.**
- `pnpm --filter @jini-ai/ui run build`: succeeds. `dist/renderers/index.js` (2911 bytes) and `dist/renderers/index.d.ts` (4034 bytes) confirmed present on disk via `ls -la`, not inferred from exit code.
- **Subpath resolution proof** (real Node ESM resolution, not just a clean build):
  ```
  node --input-type=module -e "import('@jini-ai/ui/renderers').then(m => ...)"
  ```
  → 77 exports; `ArtifactView`, `RendererRegistry`, `openSandboxedPreviewInNewTab`, `useSandboxBridge` all present. Confirms the `exports` map path is not typo'd.
- `pnpm --filter @jini-ai/chat run typecheck`: clean.
- `pnpm --filter @jini-ai/chat run test`: **965/965 pass, 67/67 files** — after `ui`'s fresh build (a first run against the *stale* `dist/` correctly failed 6 files, since it still imported `@jini-ai/renderers-react`; this is expected pre-build state, not a bug — rerunning after `pnpm --filter @jini-ai/ui run build` fixed it).
- `pnpm run guard`: **17 violations — matches the documented pre-existing baseline exactly, zero attributable to this change.** Full list: `InteractiveHtmlEditor.tsx` (admin, R5/R2 — other agent's WIP), `admin/react/index.ts` (R5), 6× `chat-pane/**` files importing `@jini-ai/chat/core` (R2 — pre-existing, unrelated package), `cms/settings/dictionaries/index.ts` (R5), `ui/features/html-editor/**` ×2 (R5 — other agent's WIP), `ui/features/i18n/dictionaries/index.ts` (R5), `ui/features/settings/dialog/react/components/SettingsDialogShell.tsx` (R5), `agentic/tsconfig*.json` ×2 (R9, unrelated package). None reference `packages/ui/src/renderers/**`, the new `./renderers` export, or any file I edited. In particular, **no R2 violation from the Step-5 relative-import conversion** — R2 fires on package-qualified deep imports, not same-package relative ones, exactly as intended.

## Coverage — the one open decision

**Renderers/ subtree alone (my moved code): 100% lines / 100% statements / 100% functions / 100% branches** (2669/2669 lines, 222/222 functions, 1180/1180 branches) — a net *improvement* over renderers-react's own prior standalone measurement (100/99.82/100/100). Zero coverage regression from this move.

**Package-wide `@jini-ai/ui` total: 98.61% lines/statements (threshold 99.98%), 98.94% functions (threshold 100%), 99.20% branches (threshold 99.8%) — below threshold.** Per your instruction, **I did not lower any threshold.**

Root cause, isolated by attribution:
- Excluding the other agent's untracked in-flight WIP (`features/a2ui/`, `features/html-editor/`, `features/interactive-ui/` — confirmed via `git ls-files --error-unmatch`, all fully untracked) still leaves ui at **99.25%/99.25%/99.39%/99.33%** — still below every threshold.
- That remaining gap (262 uncovered lines) is concentrated in already-committed, already-tracked code that predates this task and that I did not touch: `features/external-mcp/react/components/ExternalMcpTab.tsx` (101 uncovered lines, 1.94% covered) and `features/memory/react/components/MemorySettingsPanel.tsx` (75 uncovered lines, 2.59% covered) alone account for 176/262 (67%) of it. The rest is scattered across `features/execution/**`, `react/components/WorkingDirPicker.tsx`, `features/connectors/hooks/useConnectorAuthorization.ts`, and a few others.
- Including the WIP directories (all effectively 0% — `core.ts`, `a2ui/index.ts`, `html-editor/index.ts`, `interactive-ui/{index,manifests}.ts`, `interactive-ui/providers/*/index.ts`) drags the total down further to the 98.61%/98.94%/99.20% figures above.

**Conclusion: coverage was already red on this branch's HEAD before this task started, for reasons entirely unrelated to the renderers-react merge.** The documented 99.98%-era baseline in `vitest.config.ts`'s own comment (17,723 statements, dated 2026-07-22) is stale — the package is now at 35,329 statements, more than double, from committed feature work landed since without matching tests. Recommendation: do not lower the threshold; the gate is correctly catching a real, pre-existing gap that has nothing to do with this move. Whether to backfill tests for `ExternalMcpTab`/`MemorySettingsPanel` now, or track it separately, is your call.

## Architecture Audit

**Status: PASS.** ADR rules checked: FSD placement (`src/renderers/` is top-level, not nested under `features/`, per its own internal feature-directory structure — confirmed no pre-existing `src/renderers/` collision before the move), R2 (no new deep-path cross-package imports — verified via guard), no upward/sideways layer imports introduced, public-API-only cross-slice access preserved (the `./renderers` subpath's own `index.ts` barrel unchanged in shape). Files audited: all 67 moved files, both edited config files, all 5 consumer edits, both package.json diffs. No violations found attributable to this change.

## Pre-Completion Checklist

- Requirements re-verified against the full brief (Steps 1–5, verification list, scope boundaries) — complete except the coverage-threshold decision, which is explicitly yours per the brief.
- Fresh evidence commands: all listed above, run this session, not inferred from prior reports.
- No certified test deleted or weakened — Step-1 changes enumerated in full above; every other test passed unmodified.
- Scope: one violation (interactive-ui doc comments) caught and reverted before finishing — see above. Everything else stayed within the stated boundaries (`packages/integrations/**`, `packages/admin/**`, `examples/reference-web/**`, `pnpm-workspace.yaml`, existing `.changeset/*` all untouched; no `git commit`; no `pnpm changeset version`/`npm publish`).
- Open item: coverage threshold decision (above).

## Deviations from plan

1. The interactive-ui scope violation (caught and self-corrected, see above) — flagging even though reverted, since it happened.
2. `ArtifactView.test.tsx`'s ripple was larger than the brief's registry/renderers-test examples implied — 6 of 13 tests needed a manifest, not just the ones that visibly threw. Two ("missing content" assertions) were passing *vacuously* pre-fix (asserting against fallback text, not the intended render path) rather than failing outright — worth flagging since a green run there would have silently hidden a real coverage/intent gap.
3. README.md content (install command, usage example, a new paragraph on the inference removal) was updated beyond the literal "current-identity" package-name swaps, since its stated purpose is current usage instructions, not history — judged in-scope under the brief's "describing current identity" language.

## Ambiguous doc references left alone (with reasoning)

- `packages/ui/src/features/version-manager/ports.ts`, `.../features/html-viewer/types.ts`: both describe an "eventual"/"not yet built" `@jini-ai/renderers-react` core as a claim entangled with a broader architectural statement ("does not exist yet", "stays deferred") that may already be independently stale (html-viewer's own `dependencies.ts` already wires the sandboxed-iframe piece these files call "deferred") — fixing just the package name without addressing the larger claim would leave the comment still wrong in a different way. Left for separate review.
- `packages/chat/src/core/tools.ts`: names both `@jini-ai/chat-react` and `@jini-ai/renderers-react` in one sentence describing where a registry-like extension point belongs; the former was never a real package name either. Fixing only the latter leaves an inconsistent sentence.
- `packages/chat/src/core/util/types.ts`: references `@jini-ai/artifacts-react` (a different, never-real pre-lock name, not literally "@jini-ai/renderers-react") — out of the literal scope of this task.
- `packages/chat/src/react/artifact-types.ts`, `.../hooks/useArtifactStream.ts`: both tightly entangled with chat's own `TODO(renderers-react)`, explicitly out of scope per the brief.
- All `source-map.md`/`CHANGELOG.md` mentions across `ui/src/renderers/`, `chat/src/core/`, `chat/src/react/`: dated provenance/build-log narrative, left untouched per "leave historically-accurate references alone."
