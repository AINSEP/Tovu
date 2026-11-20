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
