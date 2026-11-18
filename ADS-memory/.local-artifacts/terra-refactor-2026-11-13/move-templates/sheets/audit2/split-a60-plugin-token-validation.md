# SPLIT-A60: bounded token-map validation + plugin-summary decoding -> `@jini-ai/agent-plugins/connect` (templates T-SPLIT, T-MOVE)

## REVISION 2 (sheet-fixes-2, 2026-11-18): S1 + S3 DONE; S2 (desktop) rewritten with the dependency + lockfile step — EXECUTABLE
Done by run `wave3/audit2-a` (report `origin/wave3/audit2-a:cloud-results/audit2-a.md`): Jini fa1d2026 (`connect/token-map.ts`, `parsePluginTokenMap`, `decodeTokenSignInEntries`, 13 tests, changeset) and the website binding (S3). Two corrections from that run hold: `constructor` is NOT refused by the id pattern (only `__proto__` is); the null-prototype result is what makes it harmless, and the Jini test pins that.
S2 stopped because `apps/desktop/package.json` does not declare `@jini-ai/agent-plugins`, so `src/jini-mcp-peers.test.ts` ("runtime source imports declare their packages instead of relying on hoisting", `:120`) fails on the new import. The fix is a declared dependency, added with its lockfile in the SAME commit (owner rule: declared deps imported statically; landing unit includes the lockfile).
**Base:** Tovu and Jini `wave3/audit2-a` (Tovu holds S3; Jini holds fa1d2026), or `origin/refactor/terra` once both contain them: `git -C {JINI} merge-base --is-ancestor fa1d2026 HEAD` exits 0, else STOP. Guards (print `b88982ef`, `e651831f`, `85e9b839`, then nothing):
```bash
for f in agent-plugin-tokens.ts agent-plugin-tokens.test.ts agent-plugin-tokens.boundaries.test.ts; do git hash-object apps/desktop/src/$f | cut -c1-8; done
rg -n '"@jini-ai/agent-plugins"' apps/desktop/package.json
```
**A60-2r (one Tovu commit; T on linked Jini; P owed: the packaged desktop must contain the `./connect` entry of a published `0.7.1-next.N` snapshot, DX-OD10).**
1. Dependency first. `apps/desktop` is its OWN npm project (`apps/desktop/package-lock.json`; it is NOT a member of the root `workspaces: ["packages/*"]`); this is npm, not the Jini pnpm lockfile. Run, from the Tovu root:
```bash
npm install --prefix apps/desktop --save "@jini-ai/agent-plugins@^0.7.0"
git diff --stat -- apps/desktop/package.json apps/desktop/package-lock.json   # both changed; nothing else
JINI_PACKAGES_DIR={JINI}/packages node development/scripts/link-jini.mjs           # npm install replaced the links: relink before any test
```
   The manifest line lands in `dependencies` beside `@jini-ai/agent-runtime` (`:31`), range `^0.7.0` like its neighbours. Never hand-edit the lockfile; on a rebase conflict in it, re-run the install instead of merging. If the install changes any OTHER dependency's resolved version in the lockfile beyond adding `@jini-ai/agent-plugins` and its own dependency tree: STOP and report the diff (no silent upgrades).
2. Apply SPLIT-A60-2 below verbatim (the `cleanCreateTokens` and `parsePluginList` bodies, `TokenSignInPlugin` type from `@jini-ai/agent-plugins/connect`, `project-ipc.ts:54` type import).
3. Tests: the two desktop token test files UNCHANGED (23 tests passed with the edit in the stopped run) and `src/jini-mcp-peers.test.ts` (must now pass; RED before step 1 is the proof the declaration is what fixes it: paste both outputs). `npm --prefix apps/desktop run typecheck` (environment note: a cloud tree without `electron` installed fails it at base; compare against the base output and judge on "no new line").
4. Commit manifest + lockfile + source together; report the lockfile diff stat.
STOP (in addition): the boundary tests need an assertion changed (as below); the install needs network the environment refuses (report, do not vendor).


Written 2026-11-16 against Tovu `integ/wave-b` (`../code`) and Jini `integ/wave-b` (`/home/user/Jini`). Row `audit2:A60`. Listed precondition "audit:B06" is a DIFFERENT job (ZIP special-entry refusal in `plugin-runtime/install-archive.ts`): it touches no file here and is NOT a blocker (B06's row text vs this row's "same sheet as prior B06" is a mislabel in the audit; verified by reading `AUDIT-ADDITIONS-2-b.tsv` B06).

Tier: Sonnet + one Opus glance at the security review points. est. executor tokens ≈ 33k (S1 18k, S2 9k, S3 6k). No Chrome look.

## Findings that change the audit row
1. **Three copies of one rule, not one.** The token-map shape check lives in `apps/desktop/src/agent-plugin-tokens.ts:44-82` AND in `apps/website/src/features/agent-plugins/new-site-agent-plugin-tokens.ts:23-52` (same pattern `/^[a-z0-9][a-z0-9-]{0,63}$/`, same `8` / `4096` limits, same trim-after-length-check order). `rg -n 'a-z0-9\]\[a-z0-9-\]\{0,63\}' apps packages` finds exactly those two sources. The sheet moves the rule once and repoints BOTH (S2 desktop, S3 website). `rg -n "MAX_TOKEN_LENGTH" packages/agent-plugins/src` finds nothing, so no Jini helper exists to reuse.
2. **Jini's own plugin-id pattern differs** (`bundled-digests.ts:100`, `activation.ts:194`: `^[a-z0-9]+(?:[-.][a-z0-9]+)*$`, dots allowed). So the pattern is a REQUIRED limit (`limits.pluginIdPattern`), never a Jini default: the Tovu bundle keeps its stricter id grammar (it is the CLI's `tovu init` re-check shape).
3. **What does NOT move** (row's STAYS list, confirmed in code): `assertTokensCanReachFolder` (an `adoptSiteDir` folder-emptiness restriction, :90-98), `initTokenOptions` (adoptSiteDir option shape, :105-112), `withCreatedTokens` + `parseCreatedTokensLine` (the `agent-plugin-tokens: saved|failed <ids>` line is the Tovu CLI grammar, :124-135), `listTokenSignInPlugins` (spawns the Tovu CLI via `buildCliSpawnPlan`, :152-188), the `tovu-token-sign-in-` scratch dir. Only `cleanCreateTokens` core (:44-82) and `parsePluginList` core (:137-147) move.
4. **Existing Jini type reused:** `connect/token-sign-in.ts:15` already exports `TokenSignInPlugin { readonly pluginId; displayName; helpUrl }`. The Tovu interface (:31-35) is structurally identical (non-readonly): Tovu deletes it and imports Jini's. `listTokenSignInPlugins` in Jini (same file, :34-44) is a different function (reads installed plugins via a port) and its NAME collides with the Tovu CLI-backed one: the Tovu function is renamed at the Jini import only if a name clash arises (`project-ipc.ts:50` already aliases it `listTokenSignInPluginsReal`), so S2 imports only the two NEW names.
5. **Security properties pinned by tests (credentials):** no token in any thrown message, never coerced (a number value is refused, not stringified), arrays and >8 entries refused, `__proto__` / `constructor` as plugin id must stay refused by the pattern and must not pollute (`Object.entries` + a null-prototype result in Jini: NEW hardening test, red first — the Tovu code builds `{}`; with `__proto__` the pattern already rejects because of the underscore, so the test pins that, and a `Object.create(null)` result guards the day a pattern admits it).

## Guards (blobs at integ/wave-b)
```
tovu_files:
  - apps/desktop/src/agent-plugin-tokens.ts | blob b88982ef420df09eb60336bc3a1774594d9a96a5 | keep-reduced
  - apps/website/src/features/agent-plugins/new-site-agent-plugin-tokens.ts | blob 41ded20ee5277bfd81624490b1f6c7e504e2be1a | keep-reduced
tovu_tests:
  - apps/desktop/src/agent-plugin-tokens.test.ts | blob e651831f14055003dcfb92fbd60f1b3524aa1ed4 | keep (14 tests; edit only the two that assert exact thrown text if the binding changes it: none expected)
  - apps/desktop/src/agent-plugin-tokens.boundaries.test.ts | blob 85e9b839001b810da4ce344540bcfd607d08a3ac | keep; tests lines 15-38 (cleanCreateTokens boundaries) are COPIED to Jini, not removed (they pin Tovu's binding limits)
  - apps/website/src/features/agent-plugins/__tests__/unit/new-site-agent-plugin-tokens.unit.test.ts | keep, unchanged
jini_guards:
  - packages/agent-plugins/src/connect/token-sign-in.ts | blob 1c71c96019474defbeaca36f00cae80a731a5fcb
  - packages/agent-plugins/package.json | blob e32f6ca94122a5aa8042e45fe4f31eb7db029d22 (NO new subpath: the new file is exported through the existing "./connect" entry)
  - `rg -n "parsePluginTokenMap|decodeTokenSignInEntries" packages --glob '!**/dist/**'` prints nothing
```
Importer census (Tovu): desktop `project-ipc.ts:50` imports `assertTokensCanReachFolder, cleanCreateTokens, initTokenOptions, listTokenSignInPlugins, withCreatedTokens, type TokenSignInPlugin` from `./agent-plugin-tokens.ts` (callers of `cleanCreateTokens` inside project-ipc: `rg -n "cleanCreateTokens" apps/desktop/src`); website `parseNewSiteAgentPluginTokens` consumers: `routes/system/sites.ts`, `features/sites/site-admin.ts:21`, `cli/commands/agent-plugin-tokens.ts:11`, `h4-sites.unit.test.ts` mock (re-run `rg -n "parseNewSiteAgentPluginTokens|NEW_SITE_AGENT_PLUGIN_TOKENS_SHAPE_ERROR" apps`; signatures are unchanged, so no importer edit).

## Contracts (Jini `packages/agent-plugins/src/connect/token-map.ts`, exported from `connect/index.ts`)
```ts
export interface TokenMapLimits {
  readonly pluginIdPattern: RegExp;      // REQUIRED: the host's id grammar
  readonly maxTokens: number;
  readonly maxTokenLength: number;
}
export type ParsedTokenMap = { readonly ok: true; readonly tokens: Readonly<Record<string, string>> } | { readonly ok: false };
/** `{ [pluginId]: token }` from untrusted input: trimmed, blanks dropped, `null`/`undefined` = none given. Never echoes a value. */
export function parsePluginTokenMap(required: { raw: unknown; limits: TokenMapLimits }, optional: Record<string, never> = {}): ParsedTokenMap;
/** Well-formed `{ pluginId, displayName, helpUrl }` entries only: the host-supplied rows are rendered as links. */
export function decodeTokenSignInEntries(
  required: { entries: unknown; pluginIdPattern: RegExp },
  optional: Record<string, never> = {},
): readonly TokenSignInPlugin[];
```
Behaviour parity with the sources: the entry limit counts BEFORE per-entry checks (`Object.keys(raw).length > maxTokens` refuses first); `value.length <= maxTokenLength` is checked on the UNtrimmed value; `helpUrl` must match `/^https:\/\//` (the https rule is generic: a plugin help link rendered in a shell must not be `http:`/`javascript:`; it stays hard-coded in Jini and is tested).

```
id: SPLIT-A60-1 .. SPLIT-A60-3
feature: plugin token validation
jini_target: agent-plugins src/connect/token-map.ts (+ export line in connect/index.ts)
changeset: @jini-ai/agent-plugins: minor | "connect: parsePluginTokenMap and decodeTokenSignInEntries, bounded untrusted-input validation for create-time tokens"
```

## SPLIT-A60-1 — Jini (commit 1)
0. Branch rule; blobs; guard `rg` prints nothing.
1. Tests first (`src/connect/__tests__/token-map.test.ts`), including EVERY case of Tovu `agent-plugin-tokens.boundaries.test.ts:15-38` rewritten with explicit `limits` (8 / 4096 / `^[a-z0-9][a-z0-9-]{0,63}$`): absent input -> `{ok:true,tokens:{}}`; trim + blank drop; 8 entries ok, 9 refused; 4096 ok, 4097 refused; 64-char id ok, 65 refused, uppercase/underscore/leading `-` refused; array, string, number, nested-object value refused; the refusal result carries no `raw` content (`JSON.stringify(result)` contains no token text: NEW); NEW: a result map is a null-prototype object (`Object.getPrototypeOf(tokens) === null`); NEW: a custom `pluginIdPattern` that admits dots is honoured. `decodeTokenSignInEntries`: cases from `agent-plugin-tokens.test.ts:219-242,274-280` (https only, non-string fields dropped, `null` entries dropped, non-array -> `[]`).
2. Code: both functions ≤ 25 lines, complexity ≤ 8, `(required, optional = {})`. No Tovu text: `rg -n -i "tovu|site|website" token-map.ts` prints nothing.
3. Export line; changeset; commit `feat(agent-plugins/connect): bounded token-map and token-sign-in entry validation`.

## SPLIT-A60-2 — Tovu desktop (commit 2, after S1)
1. `agent-plugin-tokens.ts` (edit): import `{ parsePluginTokenMap, decodeTokenSignInEntries, type TokenSignInPlugin } from '@jini-ai/agent-plugins/connect'`; delete local `interface TokenSignInPlugin` and its entry in the final `export type` line (callers `project-ipc.ts:50` take it from Jini instead: edit that import: drop `type TokenSignInPlugin` from the `./agent-plugin-tokens.ts` specifier and add a `@jini-ai/agent-plugins/connect` import; `rg -n "TokenSignInPlugin" apps/desktop/src` for any other); add `const TOKEN_LIMITS: TokenMapLimits = { pluginIdPattern: PLUGIN_ID_PATTERN, maxTokens: MAX_TOKENS, maxTokenLength: MAX_TOKEN_LENGTH }` (keeps the three constants Tovu-owned).
2. `cleanCreateTokens` body becomes: `const parsed = parsePluginTokenMap({ raw, limits: TOKEN_LIMITS }, {}); if (!parsed.ok) throw new Error('The access tokens for the new site were not in the expected shape. Nothing was created.'); return { ...parsed.tokens };` (spread restores an ordinary-prototype object: callers and `deepEqual` tests expect it). Delete `isSmallMap`, `isTokenEntry`. `parsePluginList` keeps its stdout-line extraction + `JSON.parse`, then `return [...decodeTokenSignInEntries({ entries: parsed.plugins, pluginIdPattern: PLUGIN_ID_PATTERN }, {})]`. Keep `ListChildLike`, `CreatedAgentPluginTokens`, spawn/scratch code.
3. Tests: run set = the two desktop test files unchanged (they assert exact thrown text and the exact arrays, so a drift fails them). Record that no assertion was removed.
4. Census + eslint on the 2 touched files; commit `refactor(desktop): token-map validation from @jini-ai/agent-plugins/connect`.

## SPLIT-A60-3 — Tovu website (commit 3, after S1; independent of S2)
`new-site-agent-plugin-tokens.ts:23-52` (edit): delete `isValidTokenEntry` and the loop; `parseNewSiteAgentPluginTokens` becomes `const parsed = parsePluginTokenMap({ raw, limits }, {}); return parsed.ok ? { ok: true, tokens: { ...parsed.tokens } } : { ok: false, error: NEW_SITE_AGENT_PLUGIN_TOKENS_SHAPE_ERROR }`; keep `PLUGIN_ID_PATTERN` (also used at :88 `resolveBundledAgentPlugin`) and the two constants as the `limits` const. Export signature and error constant unchanged. The file already imports from `@jini-ai/agent-plugins/connect` elsewhere (`connect-tool.ts`, `access-token-tool.ts`): use the same specifier (no new subpath). Tests unchanged (`new-site-agent-plugin-tokens.unit.test.ts`, `tw2-L224-characterization.unit.test.ts`). Commit `refactor(website): new-site token map via @jini-ai/agent-plugins/connect`.

## untangle overlap
`apps/website` agent-plugins files are in CLASSIFY rows 147 (`agent-plugins/exports`, A56 hard-blocked) and the website `agent-plugins` MOVE rows: if those rows relocate `new-site-agent-plugin-tokens.ts` before this runs, re-take the blob and apply S3 to the new path (the edit is body-only). Desktop `project-ipc.ts` is also edited by A57/A41? No: only the import line at :50 changes here.

## STOP specific to this sheet
- A rename of an exported Tovu name would be needed.
- The desktop boundary tests need an assertion changed (the spread of the null-prototype result must make them pass; if `deepEqual` still fails on prototype, STOP and report, do not drop the guard).
- A census hit of the pattern in a third file.
