# Size designs — 2026-11-16 (revision 2, after the Codex judgment)

Status: **complete** — designs 01, 02, 03, 04, 05, 06, 08, 09, 10 revised; **07 dropped by owner** (`styles.ts` stays as is; `07-jini-chat-pane-styles.md` is kept for the record only, not to be executed).

Revision 2 answers `CODEX-JUDGE-{a-composition,b-site-api,c-ui-jini}.md` finding by finding and applies `LESSONS-FOR-DESIGN-BRIEFS.md`. Every finding was re-checked against the code at Tovu `origin/integ/wave-b-r2` (65302ee5; newer than `integ/wave-b-fixed`, which is its ancestor) and Jini `origin/integ/wave-b-r2` (02edbb68). Each design ends with `## Judge response`. Designs 01 and 02 were rewritten; 03-10 keep revision 1 above a `## Revision 2` section that **overrides it where they differ** — read that section first.

| # | target | findings (blocker/major/minor) | accepted | rebutted | blockers left | commits | est. Sonnet tokens (was) | risk |
|---|---|---|---|---|---|---|---|---|
| 01 | Tovu `composition/deps.ts` | 9 (1/7/1) | 9 | 0 | 0 | ~62 | 1.35M (1.05M) | high |
| 02 | Tovu `composition/app.ts` | 8 (1/7/0) | 8 | 0 | 0 | ~52 | 1.0M (780k) | high (part A), medium (B, C) |
| 03 | Tovu `http/site/render.ts` | 8 (0/6/2) | 8 | 0 | 0 | ~30 | 560k (520k) | medium |
| 04 | Tovu `routes/site/pages.ts` | 6 (0/5/1) | 6 | 0 | 0 | ~31 | 540k (480k) | medium-high |
| 05 | Tovu admin `PostEditor.tsx` | 6 (0/5/1) | 6 | 0 | 0 | ~30 | 380k (340k) | medium-low |
| 06 | Tovu admin `lib/api.ts` | 8 (0/6/2) | 8 | 0 | 0 | ~44 (+25 phase 2) | 820k (720k) + 450k phase 2 | medium-high |
| 07 | Jini chat-pane `styles.ts` | 2 minors | — | — | — | — | — | **dropped by owner** |
| 08 | Jini `useChatPane.hooks.ts` | 5 (2/3/0) | 5 | 0 | 0 | ~20 | 420k (300k) | high |
| 09 | Jini `ChatPane.tsx` | 3 (1/2/0) | 3 | 0 | 0 | ~15 | 190k (170k) | medium-low |
| 10 | Jini daemon `agent-executor/launch.ts` | 5 (1/4/0) | 5 | 0 | 0 | ~18 | 460k (380k) | high |

**58 findings, all accepted, none rebutted** (two with a different staging than the judge proposed: 02 #8 keeps `createLazyProxy` private because it has one user; 06 #4 makes the signature migration mandatory but as a second phase). **Total ≈ 5.7M Sonnet executor tokens** (was 4.8M), ≈300 commits, plus design 06 phase 2 (≈450k) once decision 06-c is made. Add one Opus review per lane, and an extra Opus review of the step-0 sheets for 01, 08 and 10.

## What changed across all designs

- **Deferred reads are inventoried, not assumed.** `work/deferred-reads.cjs` lists every closure read of a later binding (output in `work/deferred-reads.md`). The composition roots keep statement order and mutable cells; slices get later bindings as getters. Revision 1's `LateRef` is gone.
- **Function limits are measured inside the targets.** `work/function-sizes.cjs` lists functions over 50 code lines per file; each design names the split for every one.
- **Nothing is claimed for Jini that is host code.** Feature-folder moves in 03/04 are withdrawn; the admin API clients stay in Tovu; the guarded HTTP client is host wiring. Existing owners are recorded (Jini `isAllowedHref`).
- **Migration graphs, not end states.** Each design lists commits with prerequisites; callers, mock factories, tools that read a path, and test baselines change in the same commit. Real commands only: `npm run typecheck`, `npm run typecheck:tests`, `npm run check:boundaries` (has `no-circular`), `npm run check:architecture`, `npm run check:size`, `npm run check:complexity`; admin `npx vitest run`; Jini `pnpm guard`, `pnpm typecheck`, `npm --prefix packages/<pkg> run test`.
- **Characterization tests can fail on the named risk**: pinned clock, normalised generated ids with separate association checks, headers, effect order, teardown lifetime through real override seams, stale-callback and microtask-race tests.

## Recommended order

1. **02 steps 1-3** (boot helpers, then the Express mounts): no dependency on 01, medium risk, unblocks 01's slices from importing `app.ts`.
2. **03 → 04** (site render, then pages).
3. **05** (PostEditor) in parallel with 1-2.
4. **01**, then **02 steps 4-7** (the two composition roots). Before wave C or after wave E with `deps.ts` / `app.ts` frozen; never during a wave.
5. **06** phase 1 alone on a quiet admin branch, after a green baseline.
6. **08 → 09** (chat pane). 09's two `@jini-ai/ui` consumers stay in `ChatPane.tsx` until R4 lands.
7. **10** after untangle R8 (wave E), revalidated against the code R8 leaves.

## Risks that are new in revision 2

- **Render worker module budget (03):** `render.ts` is one module in the handlebars/liquid worker graphs (budgets 165 / 125). Splitting it raises the count. The executor measures first and stops if a budget would have to be edited.
- **`no-circular` (02):** the `createApp(routeDeps = createRouteDeps())` default makes the app assembler and the in-memory root a cycle if they are put in two files. Phase 1 keeps both thin entry functions in `app.ts`.
- **Extra microtask turns (01):** awaited slices add turns; boot chains are ordered by explicit `.then`, and a fake-clock test pins the order.
- **Design 08's hook graph** is built from measured anchors, and design 10's cleanup table from cited lines; both have a step-0 sheet + skeleton gate before any body moves.

## Conflicts with the owner practices (flagged in each design's check table)

- Practice 2: `createApp(routeDeps, options)`, `mountRoutes(app, mod)`, `finishStaticTierDocument(deps, input)` (fixed in 04 step 8), 100+ admin API methods (06 phase 2).
- Practice 4: `app.ts` keeps two thin roots until 02-a is approved.
- Practice 1 / 8: admin features import a concrete API client and tests `vi.mock` it; binding every feature to a port is a per-feature follow-up, not a size split.
- Practice 7: `@jini-ai/chat` imports `@jini-ai/ui` today (R4's job).
- Practice 9: boot logs in `deps.ts` print `err.message` only; `app.ts:1828` logs a raw event payload. Not changed inside a move; listed for follow-up.

## Owner decisions needed

- **02-a** Remove the `createApp` default argument (68 zero-argument callers rewritten) so the in-memory root can leave `app.ts`.
- **02-b / 06-c** Positional public signatures: convert `createApp` (426 importers) and the zero-parameter API methods to `(required, optional = {})`, and with which empty-required form.
- **03-a** Replace Tovu's `safeHref` copy with a call to Jini `isAllowedHref` (behaviour-sensitive; separate change).
- **03-b** Allow raising a render-worker module budget when the count grows only because one module became several.
- **05-a** Whether a generic formatting toolbar (TipTap dependency) is wanted in `@jini-ai/ui` at all.
- **06-b** If the admin baseline is red on the execution base: fix first, or grant a named exception.
- **01** One-line baseline swap in `wiring-identity.test.ts` (`deps.ts` → `site-deps/slices/bootstrap.ts`, same owner, same count) — designed in; say no if the list must not change.
- Still open from revision 1: confirm target 10 is the daemon `agent-executor/launch.ts`; hand-written DTOs in `api.ts` (move verbatim, as designed, or replace with contract types first); timing of 01/02/10 against the untangle waves; name the branch that `refactor/size-jini-chat-runtime` deferred chat/daemon to.
- Closed: the "composition twins" question is now decided per invariant in 02 §2.5; 07 is dropped.

## Not verified in this run

No code or test was executed (docs-only run; no dependencies installed). `deps.ts` 1081-2265 and 2849-3066 were read statement by statement; the two route-deps literals were read as key lists. The in-memory root (`app.ts` 503-1197) was covered by the deferred-read measurement and targeted reads, not line by line. `useChatPane` (design 08) and `run` in `launch.ts` (design 10) were verified by measured anchors and the judge's cited lines, not statement by statement — their step-0 sheets are mandatory. The judge's count of 62 zero-parameter / 42 one-parameter API methods (06) was not re-measured. Revision-1 file trees in 05, 06, 09 and 10 were not re-derived line by line; their `Revision 2` sections override them and each step-0 symbol sheet is the source of truth. Token estimates are judgment, not measurement.
