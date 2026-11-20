BOOTSTRAP: dispatched job (<<PEER_DISPATCH>>). This clone has no AI-Dev-Shop folder; that is expected. This prompt is complete; proceed.
DRAFT (coordinator review before dispatch; cull 11-20).
You are a refactor programmer. Read <repos>/Tovu/AI-Dev-Shop/agents/refactor/skills.md and <repos>/Tovu/AI-Dev-Shop/skills/refactor-patterns/SKILL.md first.
REPO: your cwd = private Tovu clone, branch codex/tv-er-features, HEAD = Tovu integ/merge-6-2026-11-19 (776ce6d0f).
TASK (Tovu ONLY; in this order; no sidekicks/subagents): B01, B02, B03, B04, B05, B06 EXACTLY as the OVER-ENGINEERING CULL (section at the end) defines them; the CULL wins over the design. Sheets the cull DROPs or BLOCKs are NOT done. Each edit replaces a named catch with the named idiom from `@jini-ai/core/errors/idioms` (the only new import per file). Zero new tests (the gate count + mutation run in cloud). No "Chrome look"/"Electron look" step. `observe` never changes state.
BASES per sheet: B01–B04, B06 merge-6; B05 needs origin/codex/tv-b2 (SKIP it if your HEAD lacks it).
STOP rules per sheet: STOP the sheet if the named catch is not at (or near, same symbol) the named line, if an edited fallback becomes broader, a primary action becomes optional, a caller would receive a different promise, a cast or non-null assertion is needed, or a function grows past 50 lines / complexity 10. B03: no key contents or diagnostics may enter the result.
COMMIT-PLAN.md: one entry per sheet (B01, B02, B03, B04, B05, B06) with its base, the ledger key (path, catch-reads-error) and the expected finding reduction. Commit per sheet; message `er: <sheet id> …`.

## NO OVER-ENGINEERING (owner rule, HARD — read before every edit)
- Do EXACTLY what the sheet names. If the sheet does not name it, do not add it.
- No new helpers, wrappers, adapters, ports, interfaces, types, generics, options, config flags or abstraction layers unless the sheet lists them by name.
- No "just in case" code: no extra validation, defensive checks, fallbacks, try/catch, null guards, retries or default values the moved code did not already have.
- No speculative generality: no parameters "for later", no unused exports, no optional args nobody passes, no `_optional` pads.
- Moves are VERBATIM: same statements, same order, same names. Do not rewrite, rename, "clean up", reformat or modernize the code you move.
- Tests: only the cases the sheet lists (+ the named mutation). No extra test scaffolding, fixtures or factories beyond what those cases need.
- Comments: move existing why-comments verbatim; add NO new comments except a one-line neutral note where the sheet asks for one.
- Smallest diff that satisfies the sheet. If something seems to need more, STOP that step and report it instead of building it.
- Before finishing, re-read your diff and DELETE anything not required by the sheet. List any deletions in COMMIT-PLAN.md.

## OWNER RULES (HARD)
Behaviour identical except the bug fix a sheet names (failing test first); errors never generic (plain words + redacted details; follow the error disclosure contract quoted in the sheet); never raise a debt number; API args (required, optional = {}) for NEW functions only, framework-dictated signatures (Express handlers, React events, comparators, type guards) exempt; every custom hook injected as a prop defaulted to the real hook; no re-export shells (delete + repoint); no new deps; no vendor code in Jini core; no specific server framework in Jini domain code; no product names (Tovu, tovu.dev) anywhere in Jini; no new eslint-disable/@ts-ignore/as any/as never; functions <= 50 lines, complexity <= 10 (HARD). A file over 500 lines is NOT a stop reason: note it in COMMIT-PLAN.md and continue. STOP a sheet (continue the others) if a named declaration is missing, an unlisted PRODUCTION importer appears (`git grep -n -F '<symbol>' -- apps/ development/ packages/`; unlisted TEST importers needing only the same repoint are fine, record in REFRESH.md), a cast is needed, or a hard limit is exceeded. MACHINE RULE: no other repo-wide scans; NO tests, builds, installs, type-checks, linters (Codex 6.1 Sol executors run none; cloud runs them); no codebase-memory-mcp; .git read-only; COMMIT-PLAN.md at repo root, one entry per sheet (sheet ID, base, files touched, tests written, the mutation to run in cloud, STOP/skip reason if any, deletions made in the final diff re-read).

## REPORT (<= 300 words)
Per sheet: DONE / STOPPED (why, file:line) / SKIPPED. List every file touched, every REFRESH.md entry, and anything the cull text did not cover.

## DESIGN (Codex 6.2, r62t-err-rows) — sheets for this job only
## 2. Ready sheets

**Paste these rules into every job brief.** Behavior identical. New public functions use `(required, optional = {})`, with framework signatures exempt. No re-export shells, new dependencies, `eslint-disable`, `@ts-ignore`, `as any` or `as never`. Functions ≤50 lines and complexity ≤10. Record files over 500 lines in root `COMMIT-PLAN.md` and continue. STOP only the affected sheet if a declaration is missing, an unlisted production importer appears, a cast is required, or a function exceeds either cap. Use `git grep -n -F '<symbol>' -- apps/ development/ packages/` for importer checks. Record incidental test importers needing the same repoint in `REFRESH.md`. Hooks are injected as props. Jini domain code is vendor- and server-framework-independent. Use existing dependencies. Package, dependency and lock changes are OPUS-CLOUD. Targeted lookups only, no tests, builds, installs, type checks, linters or graph tools. `.git` is read-only. Source and named test edits only.

**Apply the owner’s minimal-diff rule before every edit.** Do exactly the named edits. Add no unlisted helper, wrapper, adapter, port, interface, type, generic, option, flag, validation, guard, retry or default. Preserve existing statements, ordering, names and why-comments. Add only named tests and comments. Re-read the diff, remove extraneous edits and record deletions in `COMMIT-PLAN.md`.

**Shared instructions for these sheets.** Every source path and line below is on its repo’s merge-6 base unless a branch anchor is given. Edit in place. The sole new import per file is `import { <named idiom(s)> } from '@jini-ai/core/errors/idioms';`, using local quote style and merging an existing import. No callers or tests change imports, and no package exports or injection, API or manifest rows change. The expected ledger key for each listed file is `(path, catch-reads-error)`. Verify the named reduction in the combine gate and retain any residual findings. Each sheet has zero new tests. The listed behavior is the combine witness. Restoring each affected catch, or moving the validation back inside the parse try, is the gate mutation. STOP if an edited fallback becomes broader, a primary action becomes optional, or an original promise is replaced for its consumers.

Jini’s implementations are at `packages/core/src/errors/idioms.ts:23,32,46,52,62,81`; the export is at `packages/core/package.json:419`. Tovu already imports it at `apps/desktop/src/tracked-site-relocation.ts:27`. **Every Tovu sheet compiles against linked Jini until the approved artifact and lockfile run.**

### Tovu website `776ce6d0f0`

Paths are relative to `apps/website/src/`. “Wrap” means replace the named try with the indicated idiom, retaining its work statements verbatim and moving its existing why-comment beside the idiom. Where a `.catch` is called on a promise from an injected port, evaluate the call in the same branch before wrapping the returned promise, so a synchronous throw retains its current outcome.

| Sheet | Source edit and combine witness |
|---|---|

| **B01 · Assistant preferences · 1,250 tokens** | B158 `assistant/assistant-vault.ts:107–110`, B164 `assistant/runtime-preferences.ts:36–42`, B273 `contracts/core/operator-locale.ts:27,33–41`: wrap async bodies in `orFallback` with `null`, `undefined`, `FALLBACK_LOCALE`, steps `Read assistant credential hint`, `Read assistant preference`, `Read operator locale`. B168 `assistant/tool-approval-policy.ts:55–61`: set `const locale` from `orFallback` around `localeFor({ ctx })`, `'en'`, `Read approval locale`; keep disclosure and safety decision order. |
| **B02 · Plugin and capability discovery · 1,650 tokens** | B169 `assistant/tool-search-keywords.ts:22–38`: source enumeration `orFallbackSync`, `[]`, `List tool keyword manifests`; per-source try body `orFallbackSync`, `undefined`, `Read tool keyword manifest`. B172 `cli/commands/deploy-config.ts:80–84`: wrap existing body with `undefined`, `Read deployment target help`, then lazy `?? formatTargetOptionHelp({ ids: [] })`. B199 `features/custom-credentials/tool-registrations.ts:295–305`: individually wrap the two loops with `orFallback`, `undefined`, `Read hosting credential choices` and `Read source-control credential choices`. B203 `features/deployments/deploy-ops/registry.ts:58–64,91–94`: wrap the sync body with `[]`, `Read bundled deployment operations`, and the inactive-manifest read with `""`, `Read inactive deployment operations`. C392 `server/inbound/assistant/assistant-runtime-guidance.ts:153–165`: wrap the async probe with `false`, `Probe assistant Chrome capability`. Failed enrichment leaves manual choices and active routes usable. |
| **B03 · Owner and site metadata · 950 tokens** | B177 `cli/commands/owner-store.ts:223–227`: wrap only the dry-run promise, `null`, `Probe owner store import plan`. Keep the invalid-input refusal at `:270–273`. B325 `features/webhooks/site-key-sources.ts:137–150`: wrap the metadata read with `orFallbackSync`, `undefined`, `Read site key metadata`; return early on undefined, keeping the separate pure JSON parse. No key contents or diagnostics enter the result. |
| **B04 · Analytics enrichment · 650 tokens** | B192 `features/analytics/forwarding.ts:107,114–122`: read `(await required.loadProviders()).hooks` with `orFallback`, `null`, `Read analytics enrichment hooks`. On `null`, return `hit` as before. Keep the chain and existing reporter outside the idiom. Provider loading failure leaves the original hit. |
| **B05 · Publish inspection · 1,600 tokens · after `tv-b2`** | B258 `features/publish-content/composite-blob-source.ts:68–75` on `tv-b2`: `orFallback`, `null`, `Read indexed publish blob`, with the original null return before hashing. B265 `raw-file-contributor.ts:168–173` and B266 `raw-row-contributor.ts:160–168` on `tv-b2`, same directory: wrap the inspection reads with `null`, `Inspect publish file` and `Inspect publish row`; leave primary reads and apply handling. B266 `decodeId:15–25` on that branch: wrap the existing synchronous body with `null`, `Decode publish row address`, keeping the private-column policy. B267 `seed-hash.ts:50–72`: wrap seed-deps load with `orFallbackSync`, `null`, `Read publish seed dependencies`; wrap async inspect body with `orFallback`, `null`, `Inspect publish seed hash`. B294 `features/site-export/public-origin-policy.ts:17–20`: wrap only the origin probe, `undefined`, `Read configured export origin`; preserve verification and source selection. |
| **B06 · Preview cache and theme reads · 1,150 tokens** | B300 `features/sites/site-preview/site-preview-store.ts:67–83`: synchronous wrappers around mtime and byte reads, `null`, `Read preview cache timestamp` and `Read preview cache image`. Leave both write-side catches. B316 `features/theme/theme-preview-image.ts:35–45`: wrap `walkThemeContent` with `orFallbackSync`, `undefined`, `Inspect theme preview content`; preserve accumulated `walk.newest`. B318 `features/theme/validation/validate-theme-package.ts:196,202–208`: wrap markup read, `undefined`, `Read theme markup for validation`. Keep the existing validity checks. **Chrome look owed.** |

## OVER-ENGINEERING CULL (Opus) - WINS
The CULL wins over the design text above wherever they differ. Sheets the cull marks DROP / BLOCKED / NEEDS-DECISION / OWNED-ELSEWHERE are NOT done.

# Cull of r62t-err-rows (error-gate ledger round 2 + Jini catch-only census) — over-engineering judge

Input: `cull-inputs-2/designs/r62t-err-rows.md`. Bases: Jini `d3e78b387`, Tovu `776ce6d0f` (merge-6); `origin/codex/jy-core` for J06. Idioms verified at Jini `core/src/errors/idioms.ts` (`observed`, `afterSettled`, `orFallback`, `orFallbackSync`, `bestEffort`, `absentWhen`); Tovu admin/desktop/website already resolve `@jini-ai/core/errors/idioms` at `^0.7.0` (`apps/desktop/src/tracked-site-relocation.ts:27`). Spot-checked anchors: J01–J06, A02 (A3, A4), A05 (A90), A07 (A99), D01, D05 (A146), C01 (C334), B04 (B192). All matched merge-6. Read-only; no tests or builds.

Counts (33 sheets): **KEEP 28** / **CUT-TO 3** (A02, A05, D01) / **DROP 1** (J01) / **BLOCKED 1** (§4 census + U/W groups, not a dispatch). Section-1 PARTIAL/BLOCKED rows: agree.

## Rules added to every sheet (cuts that apply to all)
1. **Delete every "Chrome look owed" / "Electron look owed".** These are like-for-like catch-to-idiom swaps with nothing visible changing; the combine witness is the gate count, not a screenshot.
2. **`observe` never changes state.** `FallbackOptions.observe` is "for a caller that wants it counted or logged" (`idioms.ts:14`). A catch whose body sets state or evicts a cache is either rewritten so the `fallback` value produces the same state (A3), or left as is (D01 cache eviction).
3. A wrap that only re-derives a refusal from a sentinel is not a fallback: leave that catch and its ledger entry (J01).
4. Zero new tests per sheet (as design). The gate mutation stays cloud-side.

## Verdicts

| Sheet | Verdict | Base | Reason |
|---|---|---|---|
| J01 O74 | DROP | — | `adapter-descriptors.ts:167–173` catch returns `credentialCardRefusal` — a refusal, not a fallback. The design's own census keeps the same file's JSON refusal (`:85`). Wrapping it in `orFallbackSync(null)` then `if (null) return refusal` adds a sentinel for gate count only. |
| J02 O333 | KEEP | merge-6 | `page-work-budget.ts:82` `void closing.catch(() => {})` → `observed`. Verified. |
| J03 O344 | KEEP | merge-6 | `worker.ts:365` verified. |
| J04 O363 | KEEP | merge-6 | `config.ts:278` (`prev.catch(() => {})` → `afterSettled`) and `:302–307` verified. |
| J05 O364 | KEEP | merge-6 | `opencode/config.ts:116–121` verified. |
| J06 O455 | KEEP | needs `jy-core` | `runtime-core.ts:384` on `origin/codex/jy-core` (same line on merge-6). |
| A01 | KEEP | merge-6 | Storage wraps. |
| A02 | CUT-TO | merge-6 | A3 as written moves the catch's `setByokModels([])` into `observe` (rule 2). A4's "save the promise first" is unneeded. |
| A03, A04, A06, A07 | KEEP | merge-6 | A99 (`settings-tabs.ts:309,314`) verified: event order unchanged. |
| A05 | CUT-TO | merge-6 | Destructuring `openChannel` rewrites the guard; an optional call keeps the guard verbatim. |
| D01 | CUT-TO | merge-6 | Keep A103 + A104; drop the `:53–58` cache-eviction rewrite (rule 2). |
| D02 | KEEP | needs `tv-split`, `tv-tq` | As design. |
| D03–D06 | KEEP | merge-6 | A146 helpers are 9–15-line functions (`tracked-sites.ts:579,599,622,644`), no size risk. |
| C01–C05, C07, C08 | KEEP | merge-6 | |
| C06 | KEEP | needs `tv-b2` | |
| B01–B04, B06 | KEEP | merge-6 | |
| B05 | KEEP | needs `tv-b2` | |
| §4 Jini catch-only census (287 rows), U (82), W (111) | BLOCKED (E3/E4/E6a) | — | Not executable: owner/audience unpinned for most rows; also behind err-sys E3/E4/E6 (still BLOCKED in `cull-err-sys.md`). Keep the per-site notes as design input only. U521 `ResourceRowList.tsx:93` `observed(...)` and U550 `afterSettled` are fine shapes when unblocked. |

## Exact cut text

### A02 (Tovu `apps/admin/src/components/AssistantDock/hooks/`)
- **A3** `byok-runtime.hooks.ts:41–50` becomes:
```ts
    const discovery = executionPort.current
      .listModels?.({ ...byokConfig.current, apiKey: byokApiKey, baseUrl: byokBaseUrl, protocol: byokProtocol });
    // Silent: a failed discovery must not put an error in a chat composer. The visible
    // consequence is only that the model row stays a plain value instead of a picker.
    if (discovery) void orFallback({ work: () => discovery, fallback: [], step: "Discover BYOK models" }).then((models) => {
      if (!cancelled) setByokModels(models.map((id) => ({ id, label: id })));
    });
```
  A failed discovery yields `[]`, which sets `[]` exactly as the old catch did. No `observe`.
- **A4** `agents-inventory.hooks.ts:170`: `const rescanned = inventory === null ? null : await orFallback({ work: () => readAgentsResponse({ inventory, label: \`POST ${AGENTS_URL}/rescan\` }), fallback: null, step: "Decode rescanned agents" });`. Leave `:164` and the lazy `fetchAgents()`.
- **A6** as design.

### A05 (Tovu `apps/admin/src/lib/`)
- **A90** `browser-stream.ts:220–223` becomes:
```ts
  const channel = orFallbackSync({ work: () => ports.openChannel?.({ name: `browser-stream:${key}` }), fallback: undefined, step: "Open browser stream channel" });
  if (!channel) return undefined; // Storage-denied hosts use the visibility-managed fallback.
```
  Guard at `:219` unchanged; no destructuring, no assertion. Lock recovery at `:142` untouched.
- **A97** as design.

### D01 (Tovu `apps/desktop/src/`)
- **A103** as design. **A104** as design.
- **Do not** touch `desktop-agent-inventory.ts:53–58` (`pending.catch(() => { if (cached === pending) cached = null; })`): its catch evicts the cache; that ledger finding stays.

### J01
Not done. Ledger entry for `agent-plugins/src/lifecycle/mail/adapter-descriptors.ts` stays.

### Combine (cloud, unchanged from design §3 except)
Run `--update` only with zero `New:`/`Worse:` lines and confirm every stored value went down (merge-6 `check-error-gate.mjs:115` writes the ledger unconditionally — see err-sys BUGS 5).

## BUGS
None confirmed in the 33 sheets' sites. (Checked and cleared: `frontmatter.ts:60` `isNonArrayRecord(parsed)` reads correctly because `isRecord(required)` inspects `required.value`, `core/src/records.ts:6–8,20`.)

## NEEDS-DECISION
- **D01 / A3-style cache or state catches** — leave such catches in the ledger rather than fold state changes into `observe`? **Recommend: yes** (rule 2); revisit if the gate later gets a named "evict on failure" idiom — not now.
- **J01-style refusal catches** — should the gate stop counting a catch that returns a refusal? **Recommend: no gate change now; keep them as ledger entries** (never raise debt; the count does not grow).
