# External Audit Packet

## Ask

- **User request:** Audit a 38-commit dependency-injection refactor of `apps/admin`, produced by 11 concurrent subagents on 2026-08-14. The coordinator's source catalog was later found to contain 7 errors; the final verification pass was stopped before completing.
- **Audit focus:** (1) Did any wrong conclusion from the flawed catalog survive into committed code? (2) The sweep is collectively unverified — ~10 new test files were never executed and no full `tsc`/suite run covers HEAD. (3) Three commits carry files swept in from other agents via a shared git index, so commit messages misattribute content; one commit re-lands work a concurrent reset unwound. (4) Verify the behaviour-preservation claims, specifically PostEditor's relocated 500ms debounce, ComposioKeyField's not-clear-on-failure draft, and `useAdminLocale`'s default-port exception with 44 remaining bare call sites.
- **Scope:** work-log + full diff `1c30c1e..HEAD` on branch `general-work`
- **Suggested changes mode:** patches
- **Audit target:** `git diff 1c30c1e..HEAD` — 146 files, +5960/−911, 51 new files, 44 test files touched
- **Planned auditors:** agy/`gemini-3.7-flash-high`, agy/`gemini-3.1-pro-high`, codex/`gpt-5.6-sol` (high), codex/`gpt-5.6-terra` (high), internal Sonnet 5 subagent
- **Authoring packet:** this file
- **Dispatch packet:** served via stdin (self-contained); auditors may additionally read repo files

## Threat Model & Scope Contract (frozen)

- **Threat model id:** `TM-usewired-2026-08-14` — **hash:** `sha256(this block) — freeze at round 1`
- **Audit round:** 1 (full pass)
- **Intended use / deployment context:** `apps/admin` is a Vite + React single-page admin UI served at `/admin`, operated by authenticated site administrators. It talks to a local Tovu server over `lib/api`. It is not multi-tenant-hostile; the operator is trusted. The refactor is **structural only** — it moves dependency resolution behind injectable ports and is claimed to change no runtime behaviour.
- **Allowed actors & capabilities:** (a) an authenticated admin operator using the UI normally; (b) a developer running the test suite or CI gates; (c) a future maintainer reading the code and its comments to decide a change. No untrusted network actor is in scope.
- **In-scope blocking failure domains (ALLOWLIST).** A blocking finding MUST map to exactly one:
  1. **Behavioural regression** — any admin-visible change in rendered output, request behaviour, timing, or error handling caused by this diff, when the refactor claims behaviour is preserved.
  2. **Silent coverage loss** — a test that no longer asserts what its name claims, an assertion weakened to pass, or a mock migration that left a file no longer testing its subject.
  3. **Build/gate integrity at HEAD** — type errors, lint/complexity-ratchet failures, or CI-gate breakage introduced by this diff.
  4. **Lost or corrupted work** — content dropped, duplicated, or partially applied by the shared-git-index incidents or the concurrent reset.
  5. **False committed claims** — a comment, doc, or debt-list note that asserts something contradicted by the code it describes.
- **Mandatory invariants:**
  1. Rendered output, request URLs/methods, debounce timing, and error-handling paths are identical pre- and post-diff.
  2. The real `lib/api` client is imported only by `*-dependencies.hooks.ts` files; hook and component files import it type-only (documented exceptions: pure helpers `describeApiError`, the const `CONTENT_TYPE_FIELD_KINDS`, and TipTap node views under `lib/`).
  3. `development/scripts/check-admin-complexity-drift.ts` reports OK, and `admin-complexity-debt.json` never gains an entry (shrinking is intended; it went 12 → 9).
  4. No existing test assertion was weakened to make it pass.
  5. No committed comment contradicts the code it describes.
- **Blocking impact threshold:** a finding blocks only if it would produce a wrong result for an admin operator, a false green in CI, or irrecoverable/misleading repository state. Style, naming, and taste do not block.
- **Risk tier & score floor:** **medium/high → floor 8.5** (large unverified diff touching most of a shipped UI).
- **Gate formula (deterministic):** `blocking_gate = FAIL` iff `(count(validated unresolved blockers) > 0) OR (score < 8.5)`. Independent terms; neither rescues the other. The coordinator recomputes and rejects an inconsistent returned gate.
- **Explicit non-goals:** completing the `useAdminLocale` migration (owner explicitly stopped at 44 remaining bare call sites); converting TipTap node views under `lib/`; reaching ≤9/≤9 on the 9 remaining grandfathered debt files; rewriting the three "contorted" tests; adopting the Orc-BASH `screen`/`notification` feedback contract (deliberately declined — controllers keep `error: string | null`).

## Prior-Round Disposition Ledger

_Empty — round 1._

## Work Log

**Goal.** Move leftover UI state, translation binding, and `lib/api` access out of `apps/admin` components into hooks, injected via the house `useX(port)` / `useWiredX()` pair, with components receiving the hook as a prop defaulted to the wired version. This is the Orc-BASH pattern (`AI-Dev-Shop/skills/frontend-react-orcbash/SKILL.md`) with one deliberate deviation: **no `orchestrators/` layer — `useWiredX()` is the orchestrator.** Normative local spec: `apps/admin/INFO.md` `## Hooks`. Reference implementation: `features/pages/hooks/use-theme-pages.hooks.ts`.

**Process.** 11 Sonnet subagents worked concurrently on disjoint file sets, each instructed to read `AI-Dev-Shop/agents/programmer/skills.md` and push back if the brief contradicted the disk.

**The coordinator's catalog was wrong in 7 places, all found by agents checking rather than complying.** Single root cause: regexes matching an assumed *shape* were treated as measurements of a *property*.
1. Claimed Class B components were not prop-injected — all 19 already were, defaulted to the *bare* hook (the scan required `= useWired`).
2. Claimed `use-dashboard` made 0 api calls — it makes 5 (multi-line chain `api\n  .listPosts()`).
3. Claimed `use-post-editor` had no port — it has a full 6-member port (port filename was derived from the hook filename).
4. Claimed `Collections.tsx` value-imports `lib/api` — it imports `CONTENT_TYPE_FIELD_KINDS`, a const array.
5. Claimed `Redirects.tsx` value-imports `lib/api` — it imports `describeApiError`, a pure classifier.
6. Claimed 3 URL-builder sites — there are 5.
7. Claimed 9 `useAdminLocale` consumers — several were comment-only mentions; `AgentPlugins.tsx` has zero references.
Additionally, "Class D: 16 hooks lack ports" was a phantom — re-derived from actual imports, it is **57 of 60 hooks have a full port+dependencies+fake triple**, 0 have a port without a fake, and the 3 without ports are genuinely I/O-free.

**Owner rulings applied mid-sweep:**
- **UI state:** async/API state always moves into the hook; *pure interactive DOM-chrome state stays local* (active tab, sort toggle, dialog open, focus). Reason: every controller fake in `apps/admin` is a static object, so injected setters are `vi.fn()` stubs — moving live chrome state broke 6 real-DOM assertions in `ThemeExplore.unit.test.tsx` (proven empirically, then reverted). Adopting stateful test fakes was offered and **explicitly declined**. One agent had already moved `Pages.tsx`'s `activeTab` and `Posts.tsx`'s `updatedSort` and introduced stateful fixtures; both were reverted in `41e8588`.
- **URL builders go through the port** — applied to 4 of 5 sites; TipTap node views under `lib/` excluded by scope decision, documented in `media-port.hooks.ts`.
- **`useAdminLocale`:** given a port injecting both `loadLanguage` and the refresh-bus subscription, but its `port` parameter **defaults** to the real binding (unique in this codebase) because 44 files still call it bare inside other hooks' `useWiredX()` bindings. Owner chose to stop here.

**Emergent result.** A "resolver idiom" (a small named function keeping a seam's `??` default-parameter expression out of the counted scope, e.g. `resolveCollectionEntryEditorHook()`, mirroring the pre-existing `orEmpty()` in `MenuEditor.tsx`) was discovered while working around a complexity-ratchet failure. Applied broadly it took `AssistantDock` 11→5 cyclomatic, `AiAssistant` 12/10→8/9, `App.tsx` 19→13, `SettingsUi` 14→10. **The grandfathered debt list went 12 → 9 files.** Four debt notes were also found already stale before the sweep and were corrected to fresh `eslint --rule complexity:1` measurements.

## Files And Artifacts

| Path | Why it matters |
|---|---|
| `apps/admin/INFO.md` | Normative pattern spec; **uncommitted** — contains a new `### t as a prop is not an un-migrated component` section |
| `apps/admin/src/features/pages/hooks/use-theme-pages.hooks.ts` | Reference implementation of the port/dependencies/`useX`/`useWiredX` quartet |
| `apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts` | Holds the relocated 500ms debounced preview auto-submit (concern 4) |
| `apps/admin/src/features/posts/__tests__/use-post-editor.hooks.unit.test.tsx` | Fake-timer proof of the debounce (asserts nothing at 499ms, one submit at 500ms) |
| `apps/admin/src/hooks/use-admin-locale.hooks.ts` + `admin-locale-{port,dependencies}.hooks.ts` | The default-port exception (concern 4) |
| `apps/admin/src/features/settings/ComposioKeyField.tsx` | Draft-clearing-on-failure behaviour (concern 4) |
| `development/scripts/admin-complexity-debt.json` | Ratchet state; went 12 → 9 entries |
| `ADS-memory/reports/2026-08-14-usewired-migration-catalog.md` | The catalog + its correction record |
| `ADS-memory/reports/2026-08-14-port-consistency-audit.md` | Internal audit: 0 bugs across 8 new port trios |
| `ADS-memory/reports/2026-08-14-class-d-port-coverage.md` | Re-derived port coverage (57/60) |

## Validation

- **Checks run:** `check-admin-complexity-drift.ts` → OK against the 9-file debt list. Per-batch scoped `vitest`/`tsc` were run by individual agents *before* a mid-session memory constraint stopped test execution. Negative-verification (deliberately breaking a fake and confirming the test goes RED) was run on 4 batches: 13/13, 6/6, 9/10, and 8/8 tests caught their regression.
- **Checks not run:** **No full `tsc --noEmit` or full `vitest` run covers HEAD.** The consolidated verification agent was stopped before completing. ~10 test files were written but **never executed**: `Playground.unit.test.tsx`, `use-playground.hooks.unit.test.ts`, `use-post-template-source.hooks.unit.test.ts`, an injection block in `PostTemplateModal.unit.test.tsx`, `widget-config-fields-dependencies.unit.test.ts`, `MediaPickerDialog.unit.test.tsx`, `use-edit-media-panel.hooks.unit.test.tsx`, `use-media-preview.hooks.unit.test.tsx`, `use-admin-locale.hooks.test.ts`, `admin-locale-dependencies.hooks.test.ts`, and the rewritten `.liquid` assertion in `ThemeExplore.unit.test.tsx`. No e2e/Playwright run at all.
- **Known caveats:**
  - **One confirmed vacuous test, not fixed:** `use-dashboard.hooks.unit.test.ts` → `"t falls back to the English source string for the default locale"` passes with `t` completely unwired, because `DASHBOARD_DICT` has no `en` entries so the real pipeline's `?? key` fallback and a bare identity function produce the same string. Its Spanish sibling does provide real coverage.
  - **Two tests with disclosed granularity limits:** `use-recovery`'s failure test needs *both* port calls broken to go red (the hook uses `Promise.all` and catches only the aggregate); `MenuEditor`'s seam test has two assertions, only one of which distinguishes fake from real.
  - **Shared-git-index damage:** `de44c40` (titled Database-only) also carries 3 media files; `b891763` carries an auth+dashboard quartet; a ComposioKeyField change landed inside `6c0c84d`; and `c578a77` exists solely to **re-land auth+dashboard quartets a concurrent reset unwound**. Owners verified content is present and correct; no history was rewritten.
  - `noInlineConfig` is set repo-wide, so `// eslint-disable-next-line` comments have **no effect** — they are documentary only.
  - Pre-existing `TS2348 Mock<Procedure|Constructable> is not callable` appears across ~20 test files; not introduced here.

## Out-Of-Scope Local Changes

- `development/e2e/theme-liquid-preview.spec.ts` + its snapshot — uncommitted, predates this session, already rewritten by someone else to assert the real `.liquid` render.
- `apps/admin/src/components/PlaceholderTabs.tsx`, `features/authentication/Authentication.tsx`, `styles.css`, `vitest.config.ts`, `features/plugins/agent-plugin-source-catalog.ts`, `src/themes/static/basic/pages/*.html`, `development/todos.md` — all modified before this session started.
- `apps/admin/src/__measurements__/request-volume.measurement.test.tsx` and `features/playground/__tests__/Playground.unit.test.tsx` — **partial edits from the verification agent when it was stopped mid-run.** Treat as incomplete.

## Open Questions

1. Did any of the 7 catalog errors produce a wrong edit that survived into committed code, rather than merely a wasted instruction?
2. Is the relocated 500ms debounce genuinely equivalent? It moved from `PostPreview` into `use-post-editor.hooks.ts`, changed from mount/unmount-via-conditional-render cancellation to a `view === "preview"` guard, and depends on `post?.id` rather than the whole post object.
3. Is `useAdminLocale`'s defaulted `port` parameter a sound stopping point, or does it create a trap — e.g. a caller silently getting the real network binding where a fake was intended?
4. Do the 4 URL-builder conversions preserve byte-identical URLs, and is any controller now async where it was synchronous?
5. Does the resolver idiom preserve `override ?? default` semantics exactly, including when a caller explicitly passes `undefined`?
6. Are the shared-index commits genuinely complete, or did any content get dropped rather than misattributed?
