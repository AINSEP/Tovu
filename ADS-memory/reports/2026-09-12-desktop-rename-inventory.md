# apps/desktop rename — verified inventory (Commits 2-6)

**Date:** 2026-09-12 · **Branch:** `restructure/apps-website-phased` · **Baseline HEAD:** `15dfc7e1`
**Verified baseline:** 469 pass (`node --test "src/**/*.test.js"`) + 22 pass (`node --import tsx --test "src/**/*.test.ts"`) = 491, 0 fail. `npm run typecheck` rc=0.

Source: `rename-recon` (read-only), live grep/read results. Superseded the retired inventory agent's
brief, whose line numbers had all drifted and whose file lists were incomplete.

## Owner rulings

- `fleet*` → `sites*` (container), `project*` → `site*` (singular one website).
- `runner.*` → `desktop.*` for the LLM-callable tool-verb namespace. `'runner.fleet.status'` →
  `desktop.status` — a DOUBLE rename; a prefix-only substitution silently keeps "fleet".
- `ProjectView` → `SiteSurface` (coordinator decision; `SiteView` would read "the site's site").
- Commit 2 renames FILES as well as symbols (`ProjectGrid.*` → `SiteGrid.*`,
  `project-status.ts` → `site-status.ts`) — coordinator decision, consistency.

## MUST NOT CHANGE (values, not names)

- Filenames `desktop-projects.json` / `open-sites.json` and row keys (`siteDir`, `origin`, `siteId`,
  `dismissed`, `createdAt`, `port`, `workspaceId`, `pid`, `updatedAt`).
- `PROJECT_ORIGIN`'s string VALUES `"created"` / `"adopted"` — frozen at `src/project-registry.js:36`,
  fail-closed via `normalizeOrigin` at `:56`. The CONSTANT may be renamed.
  - Read via the constant: `project-delete-guard.{js,test.js}`, `add-site-button-wiring.test.js`,
    `sites-mcp-tools.test.js`, `mcp-bridge.integration.test.js`, `tovu-desktop-cli.test.js`,
    `project-ipc.{js,test.js}`.
  - Read as bare literals (data-shaped, not rename candidates): `project-ipc.test.js:193,546,553`;
    `project-registry.test.js:43,88,146,148,159,228,277`; definition `project-registry.js:38,40,50`.
- `project-registry.js:3` cites Tovu-Runner's `project-registry.ts` — a DIFFERENT sibling repo. Leave.

## Findings the original brief missed

1. **`bin/` is outside `src/` and was never listed.** `bin/tovu-desktop.mjs:32` and
   `bin/mcp-bridge.mjs:42` both import `projectsFilePath` from `../src/project-registry.js`.
2. **User-facing CLI copy — behaviour-adjacent, not mechanical.** `bin/tovu-desktop.mjs:44,139,140`
   say "Projects list" / "this project" to the user.
3. **`RUNNER_PROJECT_CHANNELS` is the load-bearing symbol** for Commit 4 and was never named.
4. Missed symbols: `PROJECTS_FILE_NAME`, `openProjectExternal`, `ProjectStartPanel`,
   `ProjectLifecycleStatus`, `ProjectDesiredState`, `ProjectDatabaseSummary`,
   `CreateProjectDatabaseInput`, `PROJECT_VIEWS`.
5. **Leave alone** (no "Project" in the name, renaming them is scope creep): `discoverSiteDirs`,
   `isDiscoverableSite`, `classifiesAsSite`, `migrateLegacyDismissals`, `buildTrackedRow`,
   `readRegistryFile`.
6. `bin/tovu-desktop.mjs:18` cites `projects-mcp-tools.js`, which does not exist (real:
   `sites-mcp-tools.js`). PRE-EXISTING stale comment — do not fix as part of a rename and
   miscount it as a rename artifact.

## Commit 4 — three hand-written copies of the channel literals

Not an import relationship. All three must move together:
1. `src/contracts/project.ts:83-135` — `export const RUNNER_PROJECT_CHANNELS = {...} as const`.
2. `src/project-ipc.js:28-35` — `Object.freeze({...})`, DELIBERATELY re-declared (documented at
   `:11-13`: main-process CJS cannot rely on compiled `.ts` output at runtime).
3. `src/runner-ipc-stubs.test.js:57-65` — `IMPLEMENTED_CHANNELS`, a hardcoded `Set` that looks like
   fixture data rather than a channel declaration.

Complete file set is **7**: the above plus `preload/preload.mts` (`:28,75,76,81-87`),
`add-site-button-wiring.test.js`, `renderer/use-add-site.hooks.test.ts:74,83` (channel embedded in an
Electron `"Error invoking remote method '...'"` string it parses). No 8th file exists.

**Drift detector that WORKS:** `project-ipc.test.js` (~`:65`) reads `RUNNER_PROJECT_CHANNELS` from
`project-ipc.js` and greps `contracts/project.ts` for each value. Renaming both copies keeps it true;
renaming one correctly fails. Not a silent-pass risk.

**`add-site-button-wiring.test.js:58-67` derives the channel dynamically** — regexes `preload.mts` for
the property KEY, then `contracts/project.ts` for that key's VALUE. Both regexes spell
`RUNNER_PROJECT_CHANNELS` as literal text. A textual find/replace catches it; **an AST-based rename
tool would NOT** (it is inside a string literal, not a live reference).

## Commit 5 — `runner:chat:*` UNWIRED claim: VERIFIED TRUE

`main.js` has exactly two handler-registration calls: `registerProjectIpcHandlers` (`:1175`) and
`registerRunnerIpcStubs` (`:1181`). All five `runner:chat:*` invoke channels are in
`runner-ipc-stubs.js:35+` and throw `RUNNER_MAIN_NOT_PORTED`. The two push channels have no
`webContents.send` anywhere. `RUNNER_CONVERSATION_CHANNELS` is equally stubbed. No persistence.

### Green test that will TOLERATE the bug — `one-chat-fab-wiring.test.js:80-86`

```js
assert.doesNotMatch(mainJs, /ipcMain\.handle\(\s*RUNNER_CHAT_CHANNELS/, ...);
assert.doesNotMatch(mainJs, /["']runner:chat:/);
```

Both regexes spell the OLD names. After the rename `main.js` can never contain either spelling again,
for any reason. Both assertions become permanently vacuously true — green whether or not someone
later wires real handlers under the NEW name, which is the exact decision the comment at `:75-79` says
it exists to force. **Must be repointed at `WORKSPACE_CHAT_CHANNELS` / `workspace:chat:`.**

### `fleet-chat.ts` houses two verb-bridging functions

`runnerVerbForAgentToolName` (`:117`) and `mcpToolNameForVerb` (`:105`, its only caller) live inside
the file being renamed to `workspace-chat.ts`. The FILE move is safe; a blind "everything here is
Runner-chat, purge it" pass is not. These two belong to **Commit 6** (`runner.*` → `desktop.*`).

## Commit 3 — pure file move, no symbol renames

`site-registry.js` exports 13 symbols, **none containing "project"**. Backing file `"open-sites.json"`
confirmed at `:47`.

- `project-registry.js` importers: `bin/tovu-desktop.mjs`, `bin/mcp-bridge.mjs`, `main.js`,
  `src/project-delete-guard.js`, `src/add-site-pointer.js`, `src/project-ipc.js`,
  `src/sites-mcp-tools.js`, + 9 test files.
- `site-registry.js` importers: `main.js:109`, `project-ipc.test.js:20`,
  `add-site-button-wiring.test.js:34`, `site-registry.test.js:17`.
- ~20 non-import comment/JSDoc mentions of `project-registry.js` across 13 files.
- `main-project-wiring.test.js:43` string-matches the import path as text — fails LOUD if missed.

## Type-checked vs unchecked — where a compiler backstop exists

**Structural caveat that reframes every comment mention above:** tsc validates only live code
references (imports, type positions, calls). It NEVER validates JSDoc prose, `{@link X}` tags, or
backtick-quoted names — even inside a checked `.ts` file. "Defined in a checked file" ≠ "every
mention is checked". This codebase is unusually comment-dense with exactly those mentions.

**A — tsc-provable-total (code references only).** Commit 2's type slice (`ProjectRecord`,
`CreateProjectInput`, `ProjectView`, `OpenProjectViewInput`, `ProjectLifecycleStatus`,
`ProjectDesiredState`, `ProjectDatabaseSummary`, `CreateProjectDatabaseInput`, `PROJECT_VIEWS`,
`openProjectExternal`); Commit 5's identifier slice (`RunnerChat*`, `RunnerConversationSummary`,
`createRunnerChatTransport`, `RunnerChatPane`); and `FLEET_ONLY_*` / `FleetOnly*` /
`RunnerSectionGroupId`. Zero `.js` importers of `sections.ts` anywhere — confirmed independently.

**B — THE DANGEROUS CASE: one name, two independent declarations, one checked one not.**
`RUNNER_PROJECT_CHANNELS` is exported and checked in `contracts/project.ts`, and its importers
(`runner-api.ts`, `preload.mts`) are checked — so tsc WOULD prove that side total. But
`project-ipc.js:28` declares its **own separate object literal of the same name**, not an import, in
an unchecked `.js` file. **A rename that trusts "tsc says this identifier is fully renamed" leaves
that second copy on `runner:projects:*` forever.** Only `project-ipc.test.js`'s runtime
string-comparison keeps them in sync.

**C — no compiler net at all.** Most of Commit 2's runtime surface (`PROJECT_ORIGIN`,
`normalizeOrigin`, `projectsFilePath`, `PROJECTS_FILE_NAME`, `readTrackedProjects`,
`writeTrackedProjects`, `trackProject`, `untrackProject`, `seedDevFallbackProject`,
`readDismissedProjects`, `isProjectDirKnown`, `adoptDiscoveredProjects`, `buildProjectRecord`,
`rescanProjects`, `registerProjectIpcHandlers`, `mayEraseProjectDirectory`), ALL of Commit 3, and
half of Commit 4. **Commit 3 has no failure point earlier than running the code** — a missed import
specifier surfaces as `ERR_MODULE_NOT_FOUND` at `node --test` or app boot, never at typecheck.

**D — reached as string content; NO rename tool will ever see these. Fixed manual checklist:**
1. `one-chat-fab-wiring.test.js:83,86` — greps `main.js` for the *spelling* of
   `RUNNER_CHAT_CHANNELS` / `runner:chat:`. Fails silently-vacuous.
2. `add-site-button-wiring.test.js:60,64` — greps `preload.mts` and `contracts/project.ts` for the
   literal spelling `RUNNER_PROJECT_CHANNELS`. Fails for the wrong reason.
3. `main-project-wiring.test.js:43` — greps `main.js` for `./src/project-registry.js`. **Fails loud.**
4. `runner-ipc-stubs.test.js:57-65` — `IMPLEMENTED_CHANNELS`, hand-typed Set, does NOT self-heal.
   (Its neighbour `declaredChannels()` at `:35-47` regex-parses `.ts` contents and DOES self-heal.)

**Completeness proof available per commit:** Commits 2/5 identifier slice → `tsc --noEmit` against
both configs catches every bucket-A miss instantly. Commit 3 and most of Commit 4 → the grep-verified
importer lists above plus a full `node --test` run are the ONLY proof that exists.

## Open

- `harness-survey` (Opus) — coverage + complexity gate harness for `apps/desktop`, scoped there only.
  "CI" per the owner = the gate harness itself with a deliberate on/off, not GitHub Actions.
- MCP federation handshake against a real daemon: owned by peer session `tovu-aa`, not this session.

---

## Correction to commit `5bf2a36a`'s message (recorded 2026-09-12)

**`5bf2a36a`'s commit message states "177/178, one pre-existing failure" in the `mcp-federation`
suites. That claim is FALSE.** The real number is **178/178, zero failures.**

The failure was `t.mock.module is not a function` at `mcp-federation.bootstrap.test.ts:80` — the
runner was invoked **without `--experimental-test-module-mocks`**. Correct invocation for this tree:

```
node --import tsx --test --experimental-test-module-mocks "<path>"
```

Not amended deliberately: `0cb9181a` and `9e81258c` already sit on top, and the branch has an
upstream at `origin/restructure/apps-website-phased`. Rewriting a pushed shared branch to fix a
message is worse than the wrong message.

**The reasoning trap worth keeping:** the agent correctly ruled out its own commit as the cause (both
the test and its subject `bootstrap.ts` were unmodified and outside the diff) — and then stopped
there and labelled it a Node capability gap in the tree. "Not caused by my change" is not the same as
"pre-existing in the tree." Check the repo's own runner config before declaring an environment
limitation.

## Chat-lifecycle commits (for the record)

`1730b9dc` admin Defects 2+3 · `f5e695c1` website Defect 1 · `5bf2a36a` federation + Defect 1 wiring
(14 files, not 17). Root `tsc` 0 errors.

**The handoff's selection criterion covered only two of the three commits.** The literal phrase
`"chat-lifecycle repair"` appears in exactly 10 files repo-wide — precisely commits A and B. **No
Group C file carries it**; C's files are marked `federation hot-reload` / `Defect 1 (2026-09-11)`.
Applied literally, the guard against over-selection would have excluded the entire third commit.

**LEFT UNCOMMITTED DELIBERATELY — OAuth grant self-discovery, six files, needs its own review:**
`external-mcp-store.ts`, `external-mcp-oauth.ts`, `features/external-mcp/save-form.ts`,
`save-form.unit.test.ts`, `assistant/__tests__/external-mcp-dcr.test.ts`, and
`apps/admin/src/features/settings/rules.ts`. The handoff's triage split these across its commit list
and its exclusion list without recognising them as one feature — while `save-form.ts`'s own doc names
the excluded admin rule as "same rule, same wording". Landing only the production half would be a
silent behaviour change with its form guard, admin guard and all tests left behind.

Also uncommitted: `assistant/tool-registrations.ts` — its diff imports `AgentPluginUninstallToolDeps`,
which does not exist at HEAD, so committing it yields a commit that fails `tsc`.
