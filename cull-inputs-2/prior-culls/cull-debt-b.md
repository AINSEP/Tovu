# Cull of r62t-debt-b (Tovu website features/assistant/CLI error-gate ledger)

Input `o-r62t-debt-b/r62t-debt-b.md`. Base Tovu `c-r62t-debt-b` 776ce6d0f0 (merge-6), Jini `ro-m6-jini` d3e78b387. Read-only checks:
- The eight ledger objects at lines 902–956 match the sheets' files and counts: capability-projection 2, exports/source 1, host-plugin-guidance 1, host-signals 3, new-site tokens 2, provider-plugin-link 1, soon-lock 1, supersession 1.
- Supersession's `parseJson` is already exempt as a pure parse (its count is 1), so B7 leaves it alone correctly.
- No unmerged branch touches the eight B1–B7 files. All seven sheets are **merge-6**.
- `./errors/idioms` is on Jini merge-6, and Tovu already imports it on merge-6. There is no Jini work. **CORRECTION 11-20 (see cull-debt-c.md):** the locked core 0.7.0 lacks `./errors/idioms`; Opus Cloud bumps `@jini-ai/core` in both Tovu locks before registry-installed combine checks. Executors make no lock edits.

Same test rule as debt-a. Add a test only where the edit restructures logic. A plain catch→idiom swap with an identical result needs none: the gate finding is the proof, and mutations are combine checks. Here, B1 and B4 are already covered by existing cases (missing `mcp.json`, missing `plugin.json`, throwing sources/reader). B2, B3, B6 and B7 are plain swaps.

**Counts:** KEEP 1 · CUT-TO 7 · DROP 0 · NEEDS-DECISION 0 · STILL-BLOCKED 1 (row 271) · agree-KEEP rows 36 · stale/pushed handled by the combine step · PARTIAL 104 → round 2 (11-20 decision).

## Verdicts

| Item | Verdict | Note |
|---|---|---|
| B1 MCP discovery (row 181) | **CUT-TO** | Edit as designed. **No test edits.** The existing missing-`mcp.json` case and the valid transport case without `plugin.json` already run both fallbacks. |
| B2 export manifest (row 183) | **CUT-TO** | Edit as designed. **No new test.** |
| B3 guidance frontmatter (row 184) | **CUT-TO** | Edit as designed. **No new test.** |
| B4 host signals (row 185) | **CUT-TO** | Source enumeration uses `fallback: []` and drops the early return. With no sources, `combineDeclarations({ declarations: [] })` already returns `{ signals: [] }`, so the result is identical and one branch goes. Keep the lazy `?? evaluateHostSignals(...core...)` in `resolveBundledHostSignals`; making it eager would change behaviour. No test edits (the design already only pins existing assertions). |
| B5 token discovery (row 188) | **KEEP** | As designed. No test edits. |
| B6 provider face (row 189) | **CUT-TO** | Edit as designed. **Drop the fake `unreadable` toggle and the `reads` assertion change.** |
| B7 maturity/supersession (rows 190–191) | **CUT-TO** | Edit as designed. **Drop the `soon-lock` test change.** No test edits. |
| B8 ledger reconciliation | **CUT-TO** | Not a Codex sheet. It is the same single combine Cloud step as debt-a A6. The checker deletes only real zeros, which covers B1–B7, the 16 stale rows and the 4 pushed rows, so nobody re-keys line numbers across five branches. The design says to "avoid `--update`". The guard below makes `--update` a pure shrink, which is its documented use (`check-error-gate.mjs:16–17`). |
| Stale rows 161–162, 173–174, 179, 186–187, 205, 214–215, 222, 272, 297–298, 303, 319; pushed 310, 313, 315, 317 | agree RETIRE | Removed by the combine step only if they really show zero. No sheet. |
| KEEP rows 163, 165, 167, 178, 180, 193, 195–197, 210, 217–218, 221, 226, 229–230, 235, 243–247, 249, 253–254, 268, 276, 281, 285, 288–289, 291, 293, 296, 304, 321 | agree KEEP | These ledger rows stay. |
| Row 271 publish-trust revocations | STILL-BLOCKED | E3/E4 disclosure contract. |
| 104 PARTIAL rows | Round 2 | Per the 11-20 decision: re-sheet only the optional-probe and fallback rows. The design gives no class per row, so the round-2 designer classifies them first. Row 182 (`exports/runtime.ts`, call-timing sensitive) and the share and copy rows are not optional-probe work. |
| Error holds E3–E9, exclusions | OWNED-ELSEWHERE / STILL-BLOCKED | Agree. |

No new bugs were found.

## Exact cut text

Each sheet below adds `import { orFallback } from "@jini-ai/core/errors/idioms";` (B3 and B4: `orFallbackSync`). Executors make **no ledger edit** and **no test edit**.

### B1 · merge-6 · `AP/capability-projection.ts`
"As designed. In `readInstalledMcpConfig`, `const raw = await orFallback({ work: async () => readFile(await assertContainedOnDisk({ packageRoot, entryPath: "mcp.json" }), "utf8"), fallback: null, step: "read installed MCP declaration" }); if (raw === null) return null;`. Leave the pure `JSON.parse` try/catch as it is. `const manifest: unknown = await orFallback({ work: async () => JSON.parse(await readFile(await assertContainedOnDisk({ packageRoot, entryPath: "plugin.json" }), "utf8")), fallback: undefined, step: "read installed MCP plugin manifest" });`. Keep the `// Missing/malformed extensions cannot supply read trust…` comment directly above it. Containment stays before each read. No test edits."

### B2 · merge-6 · `AP/exports/source.ts`
"As designed. `readPackage` body becomes `return orFallback({ work: async () => { <existing try body verbatim> }, fallback: undefined, step: "read plugin export manifest" });`. No test edits."

### B3 · merge-6 · `AP/host-plugin-guidance.ts`
"As designed. Replace the final `try … catch { return false; }` in `opensFrontmatter` with `return orFallbackSync({ work: () => isNonArrayRecord({ value: load(lines.slice(index + 1, end).join("\n"), { schema: FAILSAFE_SCHEMA }) }), fallback: false, step: "classify plugin guidance frontmatter" });`. No test edits."

### B4 · merge-6 · `AP/host-signals.ts`
"Keep the `// Preboot readers must not…` comment, then `const sources = orFallbackSync({ work: () => (optional.sources ?? bundledContributionSources)({ ...required, filename: "plugin.json" }), fallback: [], step: "list bundled host signal manifests" });`. Delete the `let sources` declaration and the early `return { signals: [] }`, because an empty list yields the same `{ signals: [] }` through `combineDeclarations`. Inside `flatMap`, `return orFallbackSync({ work: () => { <existing try body verbatim> }, fallback: [], step: "read bundled host signal manifest" });`. `resolveBundledHostSignals` body: `return orFallbackSync({ work: () => { <existing try body verbatim> }, fallback: undefined, step: "resolve bundled host signals" }) ?? evaluateHostSignals({ env: required.env, declaration: selectCoreHostSignalDeclaration({}) });`. No test edits."

### B5 · merge-6 · `AP/new-site-agent-plugin-tokens.ts`
"As designed. `readBundledPluginId` body: `return orFallback({ work: async () => { <existing try body verbatim> }, fallback: null, step: "read bundled token plugin ID" });`. In `listBundledAgentPluginServers`, `const entries = await orFallback<Dirent[]>({ work: () => readdir(sourceRoot, { withFileTypes: true }), fallback: [], step: "list bundled token plugins" });`, with the early `return []` gone (the empty loop returns `[]`). No test edits."

### B6 · merge-6 · `AP/provider-plugin-link.ts`
"As designed. `const provider = await orFallback({ work: async () => readProviderPluginLink({ manifest: JSON.parse(await catalog.read({ plugin, filename: "plugin.json" })) }), fallback: undefined, step: "read provider face link" }); // An unreadable manifest links nothing.`, then the existing `if (provider !== undefined) links.set(plugin.pluginId, provider);`. The ambiguity throw stays before it. **No test edits.**"

### B7 · merge-6 · `AP/soon-lock.ts`, `AP/supersession.ts`
"As designed. In soon-lock: `const manifest: unknown = await orFallback({ work: async () => JSON.parse(await catalog.readManifest({ plugin })), fallback: undefined, step: "read plugin maturity manifest" });`. In `supersession.ts`, the `readOrUndefined` body becomes `return orFallback({ work: read, fallback: undefined, step: "read plugin supersession manifest" });`. Leave `parseJson` alone. **No test edits.**"

### B8 → the shared combine Cloud step (same as debt-a A6)
"After the Tovu combine, run `node development/scripts/check-error-gate.mjs`. Only if it prints zero `New:`/`Worse:` lines, run `--update` and commit `development/scripts/error-gate-debt.json` alone, with the before and after counts. Otherwise do not update; report the lines. Never raise a row."

## Jobs
- **Jini:** none. No Jini draft.
- **`j-tv-db-DRAFT.md`** (Tovu, base merge-6 `776ce6d0f`, 7 sheets): B1 → B2 → B3 → B4 → B5 → B6 → B7. About 6k executor tokens. It runs independently of every pushed branch, and the batcher may join it with `j-tv-da-DRAFT.md` (5 sheets; together 12, so split as 6 + 6 if needed).
- **Combine owes:** the shared ledger step. Mutations from the design (each idiom bypassed → existing assertion fails) go to Cloud. A Chrome look is needed only if the public-embed or plugin-guidance flows are in the combine smoke.
