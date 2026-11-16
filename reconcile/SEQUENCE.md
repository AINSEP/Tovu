# Sequence — one order for every shared file and concept

Reconcile run A, 2026-11-16. Covers: size designs 01–10 (07 dropped), daemon R7 / R8 / C6 / lane K, run finalizer,
import cycles, AG-UI, lost updates, error system, ACP, publish engine, env schema, security A03/A06.
Sources: the designs, `AMENDMENTS-A.md` (this run), `AMENDMENTS-B.md` (`04164cfa`, its X1–X7 are taken as written),
both cross-checks, and the running build branches. An arrow `A → B` means **B starts from a tree that contains A**.
Each arrow has its reason. Steps not joined by an arrow may run at the same time.

State today: **running** = size-02 steps 1–3, size-03, size-05, daemon prereqs; **done** = R8a steps 0–3 and the shell
deletion of step 4 (Jini `a20e47d5`); C-ORIGIN-PORT, G-HTTP-AUTH, C4-a/b/e are on `refactor/daemon-prereqs` (Jini `79b19ffd`).

## H1. Tovu composition: `composition/deps.ts`, `composition/app.ts`, their slices, `server/routes/types.ts`

| # | Step | → next, because |
|---|---|---|
| 1 | size-02 steps 1–3 (running: boot helpers, mounts) | they take `createApp`'s body apart; 2 edits the same function's signature line |
| 2 | size-02 **3a–3c** (`createInMemoryApp`, 27 call sites, default removed — AMENDMENTS-A A1.3) | removes the `app.ts` ↔ memory-root cycle, which step 4 needs to move the root out |
| 3 | R8a step 5's one use line for `composition/jini-daemon-runtime.ts`, **if it is ready**; otherwise it waits for 6 | size 01 needs `deps.ts` frozen (size INDEX rule "never during a wave") |
| 4 | **freeze** → size 01 (`deps.ts`) | size-02 step 6 needs size-01 step 6 (shared `guarded-outbound-http.ts`); step 5 needs 01 step 8 only if the apply ports are shared |
| 5 | size-02 steps 4–7 (memory root; `createRouteDeps` joins `memory-route-deps.ts`) → **unfreeze** | from here every addition goes into a slice file, inside the limits |
| 6 | import-cycle **S3a-types** → S3b → S4 → S5b | S3a-types makes room in `types.ts` (A7.1); S3b before S4 because both add a required field to the same 16 fixtures; they go first because each is one property and later lanes edit the same feature files |
| 7 | error-system E3 (one catalog, one reporter, one logger factory in the root) | E4–E11 hang on it; it rewrites 17 logger calls, so it should not meet half-landed ports |
| 8 | publish-engine P0.4 / P0.7 use lines (coordinator applies them) | import and use lines only; re-take the text guards |
| 9 | env-schema T3 (`deps.ts` 25 sites, `app.ts` 13 sites receive `config`) | its own rule D2: after 01/02; it needs J0, J1, T0 first, which take longer than 6–8 |
| 10 | run-finalizer C-1 → C-2 | longest prerequisites (Phase B, OD-2); C-1 sits beside the `chatRunLedger` line size 01 re-homes; C-2 edits the `registerSiteIdlePark` line that step 1 moves |

Parallel with 1–5, no shared file: import-cycle S0, S1, S2, S3a; publish-engine P0.1–P0.3, P0.5, P0.6, P0.8; run-finalizer
Phase 0, X, A; env-schema J0, J1, T0, T1, T7. One coordinator applies 6–10, one unit at a time, guards re-taken after each.

## H2. Jini daemon launcher: `agent-executor/launch.ts`, `contracts.ts`, `events.ts`, `mcp-bridge.ts`, per-CLI folders

| # | Step | → next, because |
|---|---|---|
| 1 | R8a steps 0–4 (done) | pins exist (R1, R2, R5, R14) |
| 2 | C6 **and** R8a step 5 (with step 4's patch folded in, A6.3), strictly one after the other. The R8a build was told to wait for C6, so the dispatched order C6 → step 5 stands. AMENDMENTS-B X6 names step 5 first; R8 §12.5 allows either. | both edit `launch.ts` and `contracts.ts`; R8a's missing step-0 cases (R7, R8, R4a, R12) are written before step 5 |
| 3 | R8b (steps 6–9; uses `defs.capabilities`, A6.1) | needs C6's port |
| 4 | import-cycle **J2** (leaf `mcp-json-file.ts`, K-movable, A7.4) | breaks the daemon cycle and gives lane K one file to move instead of five names inside `mcp-bridge.ts` |
| 5 | **lane K** (K0: shared types to core; per-CLI folders and the leaf to `agent-runtime`) | owner: K after R8. Lesson 10: an untangle lane that touches the file comes before its size split |
| 6 | size 10 (0a, 0b, **0c `RunStagingPort`**, 1–6; A4) | its sheet is made once, on the file K leaves |
| 7 | env-schema J3, daemon part | its rule: after C6 and the R lanes; after 6 so it edits small files once |
| 8 | ACP A-daemon (A2, A3, A7, A8, A9), then ACP phases B and C | AMENDMENTS-B X6; ACP §6 already puts B and C after lane K |
| 9 | error-system E8 daemon part (`runError` for the 12 error emits) | after 6 (final paths) and after the AG-UI field map (H6) |

Parallel with 2–6: ACP parts that touch only `agent-runtime/agent-protocol/acp/*` (file-disjoint Phase A, AMENDMENTS-B X6); J1, J3, J4 of import cycles.

## H3. Tovu daemon scope: `composition/agent-daemon-scope.ts`, `composition/jini-routes.ts`, `apps/desktop/src/desktop-agent.ts`

C-ORIGIN-PORT (landed; the desktop-agent hunk is held as a patch, `df058a36`) → R8a step 5 host binding → C6 / R8b binding
→ R7 P0 (parser-chain and gate characterization on the real file) → **R7 P1** (creates `jini-routes.ts`) → R7 G1 → G2 → G3 → Z
→ xai / model-proxy leave daemon (owner: after R7) → env-schema T3/T4 lines in this file → ACP catalog changes.

- AG-UI S2.5 needs **R7 P1** only (A8). Its later edits *inside* `agent-daemon-scope.ts` (frontend relay, canary) come after R7 Z, because R7 moves the lines around them.
- Reasons: bindings first because R7's host object reads them; P0 before any move so every gate has a test that fails when it is removed; security assertions D1–D3 stay green at each arrow.
- The desktop-agent patch is applied by the coordinator between C-ORIGIN-PORT and R8a step 5 (both touch that file, daemon INDEX `:199`).

## H4. Jini `server` preset: `builtin-features.ts`, `kernel-base.ts`, `create-local-node-daemon.ts`, `compose-jini-kernel.ts`

R8a step 3 (done) → R8a step 5 (runtime ports) → C6 / R8b → R7 P1 (preset `mount-routes.ts`) → R7 packs, one at a time (§11.9)
→ size-10 0c (one line, `staging`) → env-schema J3 server part → error-system E3 Jini half.
Reason: each step adds or changes one construction line in the same factory; R8 wiring before R7 because R7's packs receive the runtime the preset builds.

Row files (`scripts/size-debt.json`, `scripts/injection-debt.json`, Tovu `development/scripts/size-debt.json`, package `exports`):
every lane edits only its own rows; on a rebase conflict the row is recomputed by the check script, never merged by hand; values only go down.

## H5. Core server contracts and the bridge

| File | Order | Reason |
|---|---|---|
| `core/contracts/server/sse.ts` | C4-e (landed) → AG-UI 2.1 `drained()` | same file; both test sets kept (A8) |
| `http-kit/node-bridge.ts` | P-NODE-BRIDGE **with A5's helper and header rule** (or P-NODE-BRIDGE-b) → R7 P0 | T4's expansion fixtures need the helper |
| `RouteHostContext`, `json-route.ts`, `statusForError` | C-ORIGIN-PORT (landed) → error-system E5a-1 → R7 G1–G3 → E5a-2 → E5a-3 (while http-kit has consumers) | AMENDMENTS-B X7: the caller map is recomputed on the post-R7 tree |

## H6. Chat (`@jini-ai/chat`, Tovu AG-UI bridge)

C6 + R4-chat → size 08 → size 09 (its two `@jini-ai/ui` consumers move in a follow-up after R4) → error-system E6 chat card.
C6 + R4-chat row 390 + finalizer Phase A → finalizer B1 (Jini) → B2 (Tovu).
AG-UI S1 moves → agreed error/status field map (AMENDMENTS-B X4) → error-system E8 on the final paths.
Reasons: size 09 needs 08's result type path; B1's engine must not import `agent-runtime`, which R4-chat removes; E8 targets files S1 moves.

## H7. Admin client and other single-design lanes

- `apps/admin/src/lib/api.ts`: size 06 phase 1 (0a → 3, one sitting) → then size 06 P2 (A2) **and** error-system E6a side by side (P2: client signatures and callers; E6a: `lib/admin-http/*` readers) → error-system E6 sweep of admin sites. Reason: E6a must edit the transport at its final path; the sweep must not meet a half-moved client.
- size 03 (running) → size 04. Reason: pages import the renderer's new files.
- size 05 (running) → its banner-extraction lane.

## H8. Publish baseline, conflict codes, visitor reporting (from AMENDMENTS-B; restated so one file holds every order)

- publish P0.1–P0.8 → lost-updates S13 → publish B01 → F1, F2 → B02 → B03 (X5: change the port while it is still one repo).
- lost-updates domain guards → error-system E5 keeping the existing codes → optional S11 (X1).
- security A03 fixes → A06 on the one chosen reporter → AG-UI S5 site cutover (X2).

## Lanes that can run in parallel now

| Lane | Blocked by nothing in this file |
|---|---|
| size-02 1–3, size-03, size-05, daemon prereqs (running) | — |
| import-cycle S0, S1, S2, S3a; J1, J3, J4 | touch no composition root and no launcher file |
| publish-engine P0 except the use lines; run-finalizer Phase 0, X, A; env-schema J0, J1, T0, T1, T7 | Tovu feature folders and new files only |
| size 06 phase 1 | admin only |
| AG-UI S1; AG-UI 2.1–2.4 once P-NODE-BRIDGE is in | Jini files R7 does not edit, except `sse.ts` (H5) |
| error-system E0, E1, E2 | new core folder, gate in warn mode |

Never in parallel: any two steps in the same H table; anything with H1 steps 4–5 that writes `deps.ts` or `app.ts`.
