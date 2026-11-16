# Size designs — 2026-11-16

Ten designs for the hardest oversized files. Base: Tovu and Jini `origin/integ/wave-b-fixed`. Docs only; no source edited. Line counts verified on that base (raw lines; "code" = non-blank, non-comment).

Two targets in the brief were replaced, as instructed:
- `AssistantDock.tsx` — DONE on `origin/refactor/size-tovu` (4c3d6f46) → replaced by `apps/admin/src/lib/api.ts`, hotspot #2 overall.
- "agent-runtime launch.ts (93 lines)" — true for `packages/agent-runtime/src/launch.ts`, but the hotspot is `packages/daemon/src/agent-executor/launch.ts`, 1,710 lines and unsplit → designed that file (see owner decision 1).

Two paths in the brief lacked a segment: `render.ts` and `pages.ts` live under `server/inbound/public-http/…`.

| # | target | lines (code) | files after | commits | risk | est. Sonnet tokens | conflicts / ordering |
|---|---|---|---|---|---|---|---|
| 01 | Tovu `composition/deps.ts` | 3,168 (1,949) | ~45 | ~45 | high | 1.05M | shared file of every untangle lane (coordinator-serialized); 11 source-reading tests |
| 02 | Tovu `composition/app.ts` | 2,690 (1,709) | ~38 | ~40 | high | 780k | after 01; 465 test importers; before wave E (R7) |
| 03 | Tovu `http/site/render.ts` | 3,683 (1,645) | 28 | ~30 | medium | 520k | none; before 04 |
| 04 | Tovu `routes/site/pages.ts` | 2,994 (1,376) | 24 | ~27 | medium-high | 480k | after 03 |
| 05 | Tovu admin `PostEditor.tsx` | 2,106 (1,590) | 27 | ~30 | medium-low | 340k | before the banner move to `@jini-ai/ui/panel-kit` |
| 06 | Tovu admin `lib/api.ts` | 4,484 (2,522) | ~70 | ~40 | medium-high | 720k | 660 importers; run on a quiet branch |
| 07 | Jini chat-pane `styles.ts` | 2,035 | 12 | 2-3 | low | 60k (25k scripted) | accepted exception today; none |
| 08 | Jini `useChatPane.hooks.ts` | 1,239 (946) | 13 | ~14 | high | 300k | R4 / C9b blob guards; C0 gate on new files |
| 09 | Jini `ChatPane.tsx` | 941 (766) | 14 | ~14 | medium-low | 170k | same lane as 08, after it |
| 10 | Jini daemon `agent-executor/launch.ts` | 1,710 (1,048) | 15 | ~16 | high | 380k | after untangle R8 (wave E) |

**Total ≈ 4.8M Sonnet executor tokens**, ≈260 commits. Add one batched Opus review per lane (≈40k each, as in `LANES.md`).

## Recommended order

1. **03 → 04** (site render, then pages): no lane conflicts, pure functions, strongest pins. Start here.
2. **05** (PostEditor) and **07** (styles) in parallel with 1: independent, low risk.
3. **01 → 02** (composition roots): before wave C if the coordinator can freeze `deps.ts`/`app.ts` for the run; otherwise after wave E. Never during a wave.
4. **06** (admin API client): alone, on a quiet admin branch.
5. **08 → 09** (chat pane): before the R4 sheets are generated or after R4 lands.
6. **10** (daemon launcher): after R8.

## Shape rules every design follows

- Feature-sliced folder with a small composition root at the old path where the old path is a public entry (`pages.ts`, `PostEditor.tsx`, `styles.ts`, `useChatPane.hooks.ts`, `ChatPane.tsx`, `launch.ts`); otherwise the old file is deleted and importers are repointed (`deps.ts`, `app.ts`, `render.ts`, `api.ts`). No barrels, no forwarders; existing re-export lines are removed (`render.ts` 71-91, `pages.ts` 387, `api.ts` 58/60).
- A characterization pin is added **before** any move (key/shape snapshot, route table, golden HTML, response matrix, DOM snapshot, request-shape table, CSS hash, effect-order log, port-call transcript).
- Moves are verbatim, comments travel with code, one file per commit, test count never drops; source-reading tests are repointed, not deleted.
- Slices land in an existing feature folder when `check-architecture` allows it without a new baseline entry; otherwise they stay beside the root and are reported.

## Generic code flagged for Jini (not moved by these designs)

`late-ref.ts`, `createLazyProxy` → `@jini-ai/core` · doc → HTML renderer and URL/CSS sanitizers → `@jini-ai/cms` · widget IR renderers → `@jini-ai/cms/widgets/html` · collection-list resolution → `@jini-ai/cms` `widgets/resolvers` · autosave/conflict banners → `@jini-ai/ui/panel-kit` · TipTap toolbar → `@jini-ai/ui` (new dependency) · admin HTTP transport → `@jini-ai/ui/fetch-query`.

## Owner decisions needed

1. **Target 10:** confirm the daemon `agent-executor/launch.ts` is the intended file (the brief named the 93-line agent-runtime file).
2. **Composition twins (01/02):** designs keep the SQLite and in-memory roots separate with identical slice names and share only provably identical literal fragments. Merging the slices is a follow-up — approve that staging, or ask for a merge design.
3. **`styles.ts` (07):** it is an accepted exception; splitting buys reviewability only. Do it, or keep the exception.
4. **`api.ts` DTOs (06):** move 2,280 lines of hand-written types verbatim (designed), or replace them with `packages/contracts`/`openapi` types first.
5. **Timing of 01/02 and 10 against the untangle waves**, and whether a pure re-key of `injection-debt.json` is allowed if 08-10 run before their R lanes.
6. `refactor/size-jini-chat-runtime` says chat/daemon were deferred because "another run is on them": name that branch so 08-10 do not collide with it.

## Not verified in this run

No code was executed or tested. Line ranges come from a TypeScript-AST outline of each file; `deps.ts` lines 1500-2264 and most function bodies in the other files were mapped by statement outline, not read line by line. The `render.ts`/`api.ts` "breakdown" notes referenced by `CLASSIFY-files.tsv` were not among the inputs. Token estimates are judgment, not measurement.
