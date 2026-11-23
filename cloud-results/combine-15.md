__FIRSTLINE__

# combine-15 (2026-11-23): Jini + Tovu `integ/merge-15-2026-11-23`

Unattended cloud run, Opus high. Programmer skills loaded: `AI-Dev-Shop/agents/programmer/skills.md` (v1.7.5) was read before any work. Its RED-first, named-mutation and pre-completion rules were applied to every behaviour-changing FIX; workers had to follow the same rules.

- **Bases:**
  - Jini `origin/integ/merge-14-2026-11-22` = `4902a6a1a`.
  - Tovu `origin/integ/merge-13-2026-11-22` = `f7185f153a`.
  - Tovu is linked to the Jini merge-15 tree with `link-jini.mjs` (82 links).
- **Pushed:** only `integ/merge-15-2026-11-23` on both repos, plain pushes. I made no change to any existing `integ/*` branch, `main`, `release/*` or `plan/*`.
  - Not used: force-push, `--no-verify`, tags, publish, codebase-memory tools.
- **Subagents:** at most 4 at a time, all Opus high, each with disjoint files. Workers only edited files; I did every merge and commit.
- **Reviews** `rv1123{a,b,c,d}` were read from `origin/plan/whats-left-1122`. Every numbered FIX was first checked against the current `origin/codex/*` heads and the merged tree. Codex had reviewed ~2 h old Jini refs, and most Jini-side FIXes turned out to be already fixed (see "stale").

## FILES LEFT (headline)
Measured with `plans/P9-data/tools/scan.mjs` + `plan.mjs` (from `origin/plan/whats-left-1122`). FILES-LEFT = moving + shells, using combine-13's method; the base value matches combine-13's tip exactly.

| tree | moving | shells | **FILES LEFT** (all areas) | **excl. themes** (`theme` + `adm-themes`) |
|---|---|---|---|---|
| base (Tovu merge-13 `f7185f153a`) | 2,483 | 3 | **2,486** | **2,375** |
| final (`__TOVU_SHA__`) | 2,269 | 0 | **2,269** | **2,158** |
| **delta** | −214 | −3 | **−217** | **−217** |

The theme-area files stay at 111. Themes stay in Tovu, and no theme file moved.

## Branches
Merge order as dispatched. `ex2-tovu-halves` and `visitor-chat` have no Jini branch. `ex3-c0b-jini` is an older-based copy of `c0b-build-jini`; both were merged, and git collapsed the identical adds. `ex6-*`, `ex7-*`, `p12-*`, `bugs-low-*` and `todos-*` were not touched.

Column key: FIX ap = applied, st = already fixed on the current head (dropped as stale), df = deferred.

| branch | merged? | FIX ap / st / df (why) | tests (red-first → green; mutation) |
|---|---|---|---|
| ex3-c0b-jini | ✅ J `9cba25768` | — | build/typecheck green |
| ex2-holds-jini | ✅ J `6ec1ff9d3` | — | build green; retires `@jini-ai/sqlite` |
| sec4-jini | ✅ J `ad1461046` | — (security FIX 2 asked for these commits; they are in) | admin suite 3609/3609 |
| fix-mountjson-maxbody | ✅ J `7246938c1` | — (not reviewed). Merge conflict with routes in `http-kit/src/adapter.ts`: kept both, and restored a brace lost in the merge (`c4bb848da`) | http-kit 761/761 |
| ex5-fnd-seams | ✅ J `9570642f2` · T `eb1f45ed0e` | APPROVE. Its commit `b259d7722` had deleted 11 why-comment module headers; restored (`f527535e3`) | core 3022/3022, chat 4496 pass |
| ex5-fnd-inject | ✅ J `a4621889f` · T `331873ae72` | ap FIX 1: daemon tests use `nodeProcessControl`. 22 J + 47 T conflicts with seams resolved: one owner per contract symbol; the 9 duplicated tool-metadata maps keep Inject's flat `core/tool-metadata/<name>` (Seams' `site/*` copies were identical and are deleted); Tracker compatibility exports removed as Inject's major changeset says; `FormDefinitionRepoPort` kept | daemon 4857/4858 (1 skip); `agent-executor` 418 pass |
| ex5-fnd-routes | ✅ J `0990daa68` · T `74571ab58e` | ap FIX 1: `chat.db` not committed. ap FIX 2: the sea-runtime fallback and the timeline validation predicate are injected and bound in Tovu (mutations: 2 plants → 3 red → restored 11/11) | cms suites; admin-database-timeline-route mounted 400s/500 |
| ex5-fnd-kit | ✅ J `15e915919` · T `7adb390250` | st FIX 1/2 (logger, split dictionary, browser-stream fallback, config gone). ap FIX 3: `useSettlementGeneration` is a required input, and drawer/dock/table are required `AdminShell` props; the selectors part was already done. ap FIX 4: Select pass-through removed; signatures, `typesVersions`, changesets and the echo test were already done | J admin 63/63; T admin 141 + 764 pass; pure injection, no mutation |
| c0b-build | ✅ J `74dc9a5e4` · T `bc184221d5` | df FIX 1: needs a published Core release for registry CI, and publishing is forbidden in this run | type-equality parity test in the admin suite |
| ex2-tovu-halves | ✅ T (clean, inside the foundation merges) | no review row | covered by tsc + suites |
| ex2-holds-tovu (+ `ex2-holds-tovu-jini` J `a5aa0c219`) | ✅ T `abeee1bc7a` | J FIX 1–3 st (head `13d8cba57`). **ap T FIX 1 plus a security fix:** Tovu passed `importPolicy` inside the required object, but the Jini API now reads it from the optional argument, so **every Tier-2 plugin ran with no import allowlist**. Also, Jini registered the whole `built-ins/` folder as content-analyzer's package root. Both fixed; realpath regression tests added (FIX 2) | red-first 12/25; 4 mutations (T worker drops the policy → 12/45 red; J realpath ×2; J `sourceDir` root) all red, then restored; plugins 1037/1037; T plugin-tier2 45/45 |
| st-ready (J + T) | ✅ J `640f2085e` · T `cddca27e70` | st FIX 1–5 (alias identity, runner ordering, no imports, no-follow `openDirectory`, changesets). The T `measure.test` fixture moved to the new fs port | platform 3400 pass; T measure 7/7 |
| sec5-jini | ✅ J `4eda223fb` | not reviewed | admin suite green |
| ex5-posts | ✅ J `c5cbaedf1` · T `4dc2d22fa9` | ap FIX 1: `agentHandle` is a required prop passed from `PostSettingsDialog` | J post-fields 3/3; T post tests green |
| ex5-collections | ✅ J `39d2dbe18` · T `061bcc3fe3` | df FIX 1: docs-only mutation-evidence gaps in the lane report. ap FIX 2: `jini-taxonomy-row-menu-item-{danger,warning}` plus the Tovu CSS selectors. ap FIX 3: args rule for `isCollectionListLayout` and the content-target pads. **Duplicate owner:** the `entries` and `content-types` tool-metadata now live only in core (identical copies in cms deleted) | taxonomy red 2/7 → 9/9; mutation `btn-${tone}` → 2 red → restored |
| ex5-small | ✅ J `adbf69142` · T `b29569ce9e` | st FIX 1 (runtime-mode type, required warn port, console reporter gone). st FIX 2 (MenuPageLinkFields: required hook, `jini-` classes). ap FIX 3: the forms projections take a named object and the pad | cms forms characterization; T forms routes 87/87 set |
| ex4-deploy | ✅ J `4402ea8b7` · T `0cf83b723c` | st FIX 1 (5 points verified). df FIX 2 (theme freeze): see below | T deploy/publish tests in the sweep |
| ex4-desktop | ✅ J `8f07790e3` · T `daf1eb925c` | st FIX 2 (labels; shell tests exist). **ap FIX 1 (D15):** callers repointed to `electron/navigation-policy`, the bounds store bound through `electron/usability`, and the 3 duplicate shell exports removed. FIX 3 kept partial, as the review asks | desktop tsc ×4 clean; T desktop 113/113; J desktop-host 832 pass; mutation `mkdirSync` → red → restored |
| ex4-media | ✅ J `b131ea4cd` · T `818fe9a6aa` | st FIX 1. df FIX 2 (theme freeze): see below | — |
| ex4-addons | ✅ J `3b3ad26bf` · T `f219bc892a` | st FIX 1 (`descriptor-i18n` forwarder gone) | agent-plugins 2207 pass |
| ex4-integrations | ✅ J `7a6ff41a2` · T `6a49370a25` | st FIX 1 (unused export gone; versioned write injected). FIX 2 N/A: `plans/P9-BREAKS.md` exists only on the plan branch, so do the fold there. ap FIX 3: `createKeyringBackedSigner({ keyring }, _optional)` and pads on `signPayload`/`verifySignature` | integrations 2103/2104 (1 pglite timeout under load); T signing 24/24 |
| **ex4-settings** | **❌ held** (J `c379b4a0c`, T `047fc74dd9` revert) | st FIX 1. **df FIX 2:** inject `ensureSettingDefinitions`/`getEffective` covers 14 exported functions and 104 call sites in 48 files, over 45 min. **df FIX 3:** a legacy-title prerequisite. Caller list: worker scratch (not committed) | — |
| **ex4-security** | **❌ held** (J not merged; T `348c990d53` revert of the report-only half) | **df FIX 4:** narrowing the per-route auth context per K1 is a redesign. FIX 3 (required hooks) would be applied with it. FIX 2: the SEC-4 commits are already in the merged sec4/sec5 | — |
| bugs-high | ✅ J `3f31aa273` · T `645db217a6` | ap FIX 1 (B218: separate `renamePath`/`openNote`; a dirty draft blocks the switch, and a "discard and open" confirm is left to the owner). st FIX 2 (B151 tool regression already in place; mutation now recorded). ap FIX 3 (C058: exact-prior-version CAS in SQL and memory, plus `VERSION_CONFLICT` with the reload copy) | B218 red 6/13 → 27/27, mutation → 2 red; B151 mutation → 1 red; C058 red 3/12 → 25/25, 2 mutations red; fixtures now bump `version + 1` |
| **bugs-medium** | J ✅ `4e35b53c1` (independent Jini fixes); **T ❌ held** (`b939093768`) | **FIX 1 (B176) needs an owner decision.** The required guard makes admin subscribe/import 503 and resend refuse on **every** site, because production binds `membersConsentCapability: null`. The full tested B176 + B201 FIX diff is saved at `cloud-results/combine-15-held/bugs-medium-B176-B201.patch` (red-first tests; 3 mutations) | — |
| **visitor-chat-tovu** | **❌ held** (`06b872e640`) | **FIX 4** (replay safety: an explicit pre-admission retry versus turn-ID dedupe) needs an owner decision. FIX 2 needs a Jini agent-runtime change, and there is no Jini branch for it | — |
| **p11-next** | **❌ held** (J not merged; T `c999eed8f7`) | **FIX 1** (finish ST-12a: admin expiry flow plus a new Jini `defineJsonRoute` spec) is a deferred slice, over 45 min. FIX 2/3 would ride with it | — |

**Theme freeze (deploy and media FIX 2):** 14 theme files differ from base, all by import lines only. One was restored to base (`DeclaredScript` ← `@jini-ai/cookie-consent`). The other 13 import modules that the lanes moved or deleted: trash constants (deploy), `content-hash` (inject), the media content-type store (media), `PublicThemeResources`/`ThemeSlotDescriptor`/`Tracker` (seams) and `AssistantSurfaceDeps` (inject). Reverting them would mean re-creating banned re-export shells or undoing those lanes. **Owner call:** accept the import repoints, or hold those cutovers.

## Gates (base diff; base = combine-14 Jini final / combine-13 Tovu final, both equal to these bases)
__GATES__

## Tests
__TESTS__

## New bugs found
1. **Tier-2 import allowlist silently off** (security, fixed here). The ex2-holds Tovu worker passed `importPolicy` where the reworked Jini API ignores it, so Tier-2 plugins could import `node:fs`, `child_process` or npm packages. Jini also derived the content-analyzer root as `built-ins/`. Both are fixed and pinned (see the table).
2. **Duplicate owners after independent moves.** Seams and Inject both moved the same 9 tool-metadata maps (`core/tool-metadata/site/*` and `core/tool-metadata/*`). Inject and collections both moved the entries and content-types maps (core and cms). Each now has one owner. Ask lanes to check `origin/codex/*` siblings before moving shared files.
3. **Seams commit `b259d7722` deleted 11 why-comment module headers** in chat and agent-plugins while claiming they "moved with the declarations". All are restored or recorded.
4. **user-management boundary red (Jini, new):** `src/core/types.ts` re-exports `PasskeyOptions` from `@jini-ai/core/contracts/site/user-management-react`. The headless-boundary regex matches "react" in that contract's name, although the file holds no React code. Fix: rename the core contract (for example `user-management-ui`). Owner call, because it is a public subpath.
5. **3 Jini log-safety rows (new, from the routes lane):** `cms/admin-http/http/entity-not-live.ts`, `routes/database/restore-points.ts` (2) and `routes/redirects/shared.ts` (2) copy typed domain-error messages into the API envelope. The checker forbids debt growth, and the fix needs a client-copy contract on host-injected error classes (design).
6. **Hook-injection checker versus owner rule:** the components take hooks as **required** props (owner rule), but `check-hook-injection` only accepts the defaulted `{ useX = useReal }` form. There are 2 debt rows for now. Ask the owner to update the checker.
7. From workers, not fixed:
   - `routes/members/delete.ts` maps `MemberConflictError` to a 409 with no `code`.
   - `credential-card-guidance.ts:25` `onAdminSecretRedacted` takes a positional first argument.
   - Jini `run-call.ts:79` still guesses the package root when none is passed (the policy fails closed).
   - `publishContentRefresh`'s first object still defaults to `{}` (98 call sites).
