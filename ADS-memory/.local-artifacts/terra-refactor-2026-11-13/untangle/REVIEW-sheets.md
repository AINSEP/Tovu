# Review of the untangle contract sheets before wave B (2026-11-15)

**Verdict: FIX FIRST.** Five blockers, all small sheet edits except B1, which needs an owner answer. C2, C7, C1-plus, C2-addendum and C8 are GO as written once the general executor notes (N1–N4) are in the briefs.

Read-only review. Jini `jini-terra-base` @ `7f28bbcfc`, Tovu `tovu-codex-trial-terra`. Scripts are in the session scratchpad (`blobs.py`, `tsv.py`, `own.py`).

**What I checked mechanically:**
- Every blob guard in C2, C3, C4, C6, C7, C8, C9a and C10 matches HEAD. The only gaps are files that are edited without a guard (H4).
- Every row in the 12 repoint TSVs (1,759 rows) names a file that exists and an `old_spec` that is present. C3's `line` column is correct.

**Not reached (context cap):**
- C5. It was not in the dispatch list. It has no no-shells revision and no repoint TSV.
- C9a `kit.tsx` body lines 120–340.
- A per-name check of the C6 TSV.
- Unique-file counts across the TSVs.

## Blockers (fix before dispatch)

| # | Sheet / § | Finding | Smallest fix | Who |
|---|---|---|---|---|
| B1 | C3 "OWNER OVERRIDE" + C3t | **The re-stamp's premise is false.** Tovu's ledger stores the *pinned literal*, not a source hash. `migrations/index.ts:73` `pinned(id)` gives `step.checksum`. db `runner.ts:138` compares `step.checksum` and `:151` inserts it. Only `__tests__/checksums.test.ts` derives a value from the source. So editing the import lines changes no stored checksum, and **no DB re-stamp is needed**. Use C3's own D5 split for Tovu: `MIGRATION_CHECKSUMS` stays byte-identical as the ledger identity, a new source-digest map becomes the test's edit guard, and the facades are deleted. This means zero prod-DB writes. **Also:** the override cannot be executed as written. `C3.repoint.tsv` has **0 rows** for the facade importers (`platform/db/kernel/port.ts`, `migrations/step.ts`, `kernel/dialect.ts`): about 55 migration files plus about 130 other importers. No file names the re-stamp code either. | Tell the owner (better idea than the spec). Then re-census the 3 facades into a `C3t.repoint.tsv` and replace the override paragraph with the D5-for-Tovu steps (Opus ~30k). | coordinator → owner; sheet edit |
| B2 | C6 (whole) | **Not executable.** Its own header says STILL OPEN: the `assistantRuntime` binding name is a TODO, the `filesystem` group of `createAgentRuntimeBindings` is not written, and `launch: { … /* … */ }` is incomplete. LANES puts C6 in **wave C**, not B. | Keep it out of wave B. An Opus fill (~25k) before wave C, which also fixes H6. | coordinator |
| B3 | C10 no-shells §3 | **zod in the protocol public API.** The owner has already ruled "zod only as an internal runtime detail", but the sheet still says "owner to confirm". It also keeps exported `*Schema` values "where they are the wire contract", which is a hidden exception. | Adopt the clean option as the plan: `propsSchema: A2uiPropsValidator`, and `parseDynamicValue()` instead of the exported `DynamicValueSchema`. Record separately that **protocol already exports zod schemas** from its existing subpaths. That violation predates this work, needs its own lane, and is not wave B. | sheet edit |
| B4 | C10 guards | `agentic/package.json` is guarded at **`2297b5ad` (the pre-C2 blob)**, and C2 edits that file, so C10 STOPs by construction. C10 also edits `agentic/src/core/index.ts`, `protocol/package.json` and `protocol/src/mcp-ui.ts`, all owned by C2, with no guard. | Change the guard on these 4 files to "re-read after C2 lands; STOP only if C2's listed edits are missing". Run C10 strictly after C2. | sheet edit |
| B5 | — (pass tooling) | **No applier exists for the "per-wave scripted repoint pass".** `scripts/` has `repoint-census.cjs`, `repoint-post.py` and `repoint-summary.py`, but nothing applies a TSV. Every no-shell lane depends on that pass. | One Sonnet job (~40k plus an Opus look) writes `repoint-apply`, which must: (a) dry-run first and report skipped rows; (b) apply MOVE/DROP/KEEP/`rename` per the C2.md semantics; (c) leave MANUAL rows to people; (d) honour N1–N3. | new small lane |

## High

| # | Sheet / § | Finding | Fix | Who |
|---|---|---|---|---|
| H1 | C9-ui × C10 | Both edit **`ui/package.json`** in wave B: C9-ui adds the `./react-kit` entry and C10 adds the protocol dependency. | Run them serially (C9-ui, then C10), or have the coordinator apply both lines. | coordinator |
| H2 | C4 §2.4, §2.2 | The L6 gate will fire mid-lane. C0 already counts default-argument `setTimeout`/`fetch` calls in core as violations (`fetch/cache.ts` debt). C4 adds a `defaultScheduler` that calls `setInterval`, and a `reportInternalError` default that calls `crypto.randomUUID()`. Each creates a new debt key, so the gate fails. | Decide now: `scheduler` and `reportInternalError` become **required**. Delete that STOP. | sheet edit |
| H3 | C4 §10, C8 §9, C9-ui, C10, C9a dec. 2 | Bodies still say "re-export / old path keeps", and an appended revision overrides them. A Sonnet executor has to merge the two. C4's §10 overrides 7 sections. | Fold the revisions in, or put a top banner on each sheet: "Revision sections win. Never write a re-export, alias, `@deprecated` or forwarder." | sheet edit (banner) / executor note |
| H4 | C4 §1 guards | `http-kit/src/{adapter,origin,sse}.ts` are edited in §10 but have no blob guard. | Add the three blobs. | sheet edit |
| H5 | — (rule) | **Express is still in Jini after wave B.** Core `src/settings/express/*` has 5 `express` imports, and core's devDependencies include `express`/`@types/express` (L6 debt lane `L-BASE-PURITY`). C4 also keeps http-kit's Express `mountJsonRoute` family until server-port O6. The other `L-BASE-PURITY` debt has no lane either: `approval.ts` setTimeout, `fetch/cache`, `ids`/`records` globalThis, settings coercers, `LOGGABLE_CODES`. | Add an explicit `L-BASE-PURITY` lane, plus O4/O6 with a wave (E) in LANES, so "no framework in Jini" has an end date. These are not shells, but they are unowned debt. | coordinator (LANES) |
| H6 | C6 §1(b), §3 | **Vendor name in a core contract:** `RuntimeBuildOptions.codexDisablePlugins`. **Shell kept:** `agent-runtime/types.ts:758-769` (the protocol `AgentDiagnostic*` re-export) is marked "not in scope". **Stale:** edit (d) `requestInit…dispatcher` matches nothing at HEAD. | Keep the codex field in `defs/codex` as a local extension of `RuntimeBuildOptions`. Census and delete the 758–769 shell. Drop edit (d). Do all three in the B2 Opus fill. | sheet edit |
| H7 | C10 KEEP rows, C8 §9.3 | **Tovu shells kept:** C10 keeps `apps/website/src/assistant/mcp-ui.ts` and `assistant/index.ts` re-exporting Jini names. C8 keeps 3 `packages/sdk` re-exports "with the new spec". The owner rule covers Tovu shells too. | Make the assistant barrels DROP and repoint them. Keep the sdk rows only if the sdk is a deliberate public plugin-author API (say so in C8). Otherwise drop them too. | coordinator call |
| H8 | C3 D6 | The `L8-storage-adapter` gate and the `jini.storageAdapters` globs are "coordinator applies". That is real gate code plus fixture tests, with no sheet. | Write a mini-sheet (Sonnet ~30k) after C0, or defer it and say so. | coordinator |

## Medium / executor notes

- **N1 (ratchet keys).** Debt is keyed `file+spec+kind`. The pass must keep each statement's form. If `import { type X }` becomes `import type { X }` (or the reverse), the key is new and the gate fails. An edit that only lowers a count is fine (warn-stale). Map the debt `lane` names to the sheets: `L-HANDLES`=C2, `L-STORAGE`=C3, `L-ROUTES`=C4, `L-AGENTS`=C6, `L-REG-ADMIN`=C7, `L-PROV`/`L-ADMIN-PORTS`=C8, `L-KIT-*`=C9, `L-SURF`=C10.
- **N2 (duplicate rows).** C9-ui and C2-addendum both repoint `ui/src/react/components/SecretInput.tsx` `secretControlAttrs`: delete the C9-ui row. C9a has 2 rows whose `new_spec` is the string `C1+ (see C1-plus.repoint.tsv)`. The applier must treat any non-spec `new_spec` as SKIP and must not write it. The other 39 "name with more than one target" hits are only the expected DROP/KEEP rows on barrels.
- **N3 (a row whose line is already gone).** The applier skips and reports it, as C3 states. The same rule applies to every TSV.
- **N4 (mount lists).** After C9-ui, C9a and C10, every ui `Select`/`SecretInput`, admin screen and chat card throws without its provider. The mount lists cover the 3 Tovu roots (admin, site-chat, desktop). They miss Jini **`examples/reference-web`**: `src/main.tsx`, `src/verify-mcpui-swap.tsx` and the `e2e/*.tsx` roots. Add those roots. Tovu tests that render admin screens need the `render-with-jini-kits` wrapper (C9a R1 risk a).
- **N5.** Kysely in domain adapter subpaths: C3 SK-CORE adds `import type { Kysely }` to 28 domain files. B1 allows it, because only `@jini-ai/*` imports are restricted, and D6/L8 confines it. The owner should see it once against "vendor code lives in its plugin". It is not a blocker.
- **N6.** C2 has not landed yet (`packages/core/src/agent-handles` does not exist at HEAD), but C10, C2-addendum and the C9a/R1 rows depend on it. C2 runs first in wave B.
- **N7.** `injection-debt.json` still has 2 `L-TEXT` entries (the commerce `@jini-ai/ui` peer, and `user-management/.../Users.tsx` importing `@jini-ai/ui/panel-kit`). C1's handoff asked for them to be shrunk. Re-check them in the wave-B gate run.

## C0 count mismatch (item 5), explained from `scripts/injection-debt.json`
The **773 is entries**. The 632/13/225 figures are **sums of `count`**:

| Rule | Entries | Sum of `count` |
|---|---|---|
| L5 | 578 | 632 |
| L6 | 12 | 13 |
| L7 | 183 | 225 |
| **Total** | **773** | **870** |

Entries are keyed by file+spec+kind, so several import lines of the same spec in one file collapse into one entry with a higher count. For L5 the import kind alone has 345 entries holding 388 lines. For L6, `records.ts` globalThis is one entry with count 2. The handoff mixed the two units. Nothing is missing.

## Cost and size vs LANES (item 6)

**Bigger than LANES assumed:**
- **C3 is 380k Sonnet against LANES' 90k**, before B1's re-census of about 185 Tovu importers (+~40k).
- **The no-shell repoint pass is not priced at all.** LANES assumed re-exports. It is 1,759 TSV rows plus 98 MANUAL rows, plus the applier (B5). Price it per wave once the applier's dry run gives unique-file counts.
- The 45 MANUAL rows in C9a are test-harness decisions that belong to R1, not wave B.

**Trim candidates:**
- C4's `testing.ts`/`conformance.ts` and `createSseStream` are server-port O1/O3 scope, not untangle. Keep them only if O1 is meant to land inside C4. Otherwise move them to O1.
- The C8 §2 worked providers belong to R12. C8 should land only the contracts, the context hook and the OTel move.

## Wave B dispatch order
1. **C2** (agentic, protocol and the core `agent-handles` folder).
2. **In parallel:**
   - C2-addendum and C1-plus, after C2.
   - C7.
   - C8.
   - C9a.
   - C4, after H2/H4.
   - C3a and C3b, after B1. Run C3t only once the owner answers B1.
3. **C9-ui, then C10**, after C2 and B3/B4. The two touch `ui/package.json` one after the other (H1).
4. **Repoint pass**, with the applier (B5). Apply the TSVs one after another, re-resolving each statement, in this order: C2, C2-addendum, C1-plus, C7, C3, C4 (`wave` rows only; `route-conversion` rows wait for O5/O7), C8, C10 + C10-shell, C9-ui, C9a (`wave` rows; MANUAL rows go to R1).
   - **Why this order:** a contract must exist before any row points at it. C10 needs C2's `protocol/mcp-ui`. C9a's C1+ rows need C1-plus.
5. **Batched checks:** one cloud run (Jini gates, typecheck of touched packages, then Tovu typecheck) and one batched Opus reviewer.

C6 and C5 are wave C. C6 waits for the B2 fill. C5 still needs its no-shells revision and its TSV.
