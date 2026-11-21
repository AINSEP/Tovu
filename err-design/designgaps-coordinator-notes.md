# r62t-designgaps — coordinator notes for the owner (tovu-e0, 2026-11-20 19:35 PT)
Plan: SCR/o-r62t-designgaps/r62t-designgaps.md (PLANS ONLY; nothing runs without owner OK).

## Gap 1 (composition deps) CONFLICTS with the owner's constraint (addendum item 9)
- Plan's "after": `registerFeature({ app, deps: { clock, repo, authorize } })` — each registrar gets its own hand-picked ports. That is the per-route explicit wiring the owner dislikes (every change re-wires the root).
- Coordinator recommendation: feature-level modules. Each feature (e.g. identity, publishing, assistant, media) exports ONE factory `createXFeature(deps: XFeatureDeps)` with a small typed deps object built once at the root; its routes/workers/tools take the feature module, not ports. Root passes whole modules (`registerRoutes({ app, features: { identity, publishing, ... } })`). Adding a route inside a feature changes nothing at the root; only a NEW cross-feature need touches the feature's deps type.
- Keep from the plan: kill the 135-field RouteDeps bag; ban `RouteDeps` imports below composition; one store/bus; preserve start/close order; startup test that subscribers are ready before the drainer.
- Re-sheet gap 1 (and gap 2's injection pilot) on this shape before execution.

## Rest
Order looks right (3 + 8 first, 6 in parallel). Gap 6 sweep sized after triage (156 candidates). Gap 7 waits for the reporter handoff (errfix1). No other conflicts with owner rules spotted.

## Gap 5 (argument patterns): STRUCK by owner 11-20 ~8 PM. Not on the morning list; args rule unchanged.

## tovu-be calls the owner is reviewing (forward any reversal to the owning job)
no fallback for third-party tovu-*.json (tv-c7a) · stricter consent sheet dropped (banner-off keeps cookieless + declared analytics) · moved-tools golden re-record in combine-8 (tovu-be's call) · Soon plugin switch behind padlock (d6eb434e1b/7d70cdf8d7) · 25 agent-plugin patch bumps (release c0dc30184) · newsletter bodyJson persisted (DB migration) · plugin sign-in Skip · embed widget needs host ChatSurfaces (Jini API change, bg-jini) · import cancel = AbortError · per-item batch results · credential-label approach (open; r62t-breaks) · disclosure contract incl. ER-6 (errfix1) · AG-UI D1–D4 yes incl. replacing /chat in place · cull recs (captions not now, send-log paging later, env renames deferred, audits blocking after lock run) · KEEP lists · designgaps items (deps bundles, API deprecation, golden/wording-pin replacement).
## Publish (owner-run): `bash /Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/3cff03f5-3ab0-4154-901e-983730e0ff4f/scratchpad/publish-jini-final.sh` (clone jini-publish @ b73045ba8; asks an npm one-time code per package, or an owner-made granular token with 2FA bypass).
