# Owner decisions — ANSWERED 2026-11-17 ~1:10 PM PT
Owner (11-17 ~1:08 PM PT): "for the stuff that you recommend, that you agree with, let's start doing those in the cloud."
Coordinator tovu-30 reviewed each Rec in 2026-11-17-OWNER-DECISIONS.md (full question text there). Every ID below = TAKE THE REC as written in that file.

## DECIDED = Rec
- Gate: BASE-RED (both: ratchets-green fixes base; standing rule = judge each run on NO NEW line beyond the base output)
- Daemon: DM-O12 (match Express first: opt-in case-insensitive + one trailing slash in core, bad-escape 400 via bridge), DM-OPT (bridge answers OPTIONS when no CORS layer), DM-ETAG (bridge sets Content-Length for non-stream; drop ETag/304), DM-R3-1 (500 + plain words + error ID), DM-R3-2 (no Tovu pattern unless fixed prefix), DM-R3-3 + DM-MEM (fixed sentence + ID to client, full text to sink), DM-R3-4 (keep refusal, fix design row); blanket O-3, O-5..O-11, O-13..O-15 confirmed.
- Tool-call: TC-OD1..TC-OD11 all = Rec.
- K/T: KT-DK1, KT-DK2 (cms/forms), KT-DT2 (keep in Tovu, injected), KT-DT3 (host-passed values), KT-DT4 (@jini-ai/cms posts admin react subpath, peer deps), KT-DT5, KT-DT6. KT-DT1 parked.
- Notes: NS-N8, NS-N9, NS-N10, NS-N11 = Rec; NS-N13 = NO (agent edits titles only; G19 stays held).
- Desktop: DX-OD1 (@tovu/host-shared), DX-OD2, DX-OD4, DX-OD5b (own sheet), DX-OD8, DX-OD9, DX-OD10 (snapshot per landed lane; publish is a gated release step), DX-OD12 (separate hardening sheet after D4a), DX-OD13 (design first; store stays in Tovu behind a port).
- Admin: AU-D1, AU-D2, AU-D3, AU-D7, AU-D8, AU-D9, AU-D10, AU-D11, AU-D13, AU-D14 = Rec.
- Left-out: LO-DB0 = HOLD all DB sheets; LO-DB1 = Rec (only if DB0 releases); LO-SC3 (retire), LO-SC4 (hardening sheet yes), LO-SI1, LO-ML1 = Rec.
- xpkg: XP-OD5, XP-OD8, XP-OD3c, XP-QG1 = Rec.
- Error system: ER-8, ER-E2a, ER-E2b = Rec; blanket ER-D1..D11 confirmed.
- Run finalizer: RF-OD2..OD9 incl. OD-7 (breaking Jini export in next 0.x: no external users) = Rec.
- AG-UI: AG-OD6, OD7, OD8, OD10, OD11 = Rec.
- Lost updates: LU-B1 = Rec; LU-D1..D10, D12..D14 confirmed.
- Older: OLD-CHARTS, OLD-VENDOR, OLD-FRAMEWORK, OLD-NEWLIB, OLD-QM2, OLD-SEARCH (relevance), OLD-OBS (after the moves) = Rec.

## HELD — still need the owner
- ER-6 (tracker gets original + exactSecrets: security-sensitive, coordinator wants a second look), ER-D12 (model sees incident reason).
- OLD-CLONES (permanent delete: owner confirms explicitly), OLD-KL (talk), OLD-DEDUPE (re-ask), OLD-TRASH, OLD-L2LOG, OLD-PAGETOOLS, OLD-RELEASE (no rec).
- Decide-later by design: AU-D4, AU-D6, AU-D12, XP-OD6.

## Added 2026-11-17 ~3:30 PM PT (owner)
- 03-a HREF STANDARD: use Jini's isAllowedHref as THE href check; fix Jini (refuse protocol-relative links to its own placeholder host; non-string input = not allowed, never throw; add one Jini helper next to it that returns the trimmed href or "#"), then delete BOTH Tovu safeHref helpers (platform/html/safe-url.ts and features/theme/render-contract.ts), repoint every caller, update check-menu-href-allowlist-sync.
- AU-D15 = ACCEPT the judge-2 rewrite of admin sheet T1b (route-parity step 0, full mapping, S12-S16; ~380k).

- JINI RELEASE (owner 11-17 ~3:55 PM PT): publish PRE-RELEASE snapshots 0.7.1-next.N under npm dist-tag `next` (latest stays 0.7.0) after each combine merge; one real version only when the refactor is done. This is how DX-OD10 snapshots are made.

## Lane S/U local decisions (plan/lanes-s-u-2026-11-16 INDEX-SU.md §4) — owner 2026-11-17 ~5:25 PM PT: take every recommendation

These IDs are LOCAL to lanes S/U (not the xpkg OD ids).

| ID | Answer |
|---|---|
| S/U OD-1 | YES: SQL adapters of ports declared in `@jini-ai/core` (settings, confirmation tokens, verified origin, change sets, outbox) live in `@jini-ai/db/<name>` |
| S/U OD-2 | YES: `kysely` optional peer of `@jini-ai/user-management` (S3a J1) and `@jini-ai/integrations` (S6b J1), added in those commits with the lockfile (lockfile trap until 2026-11-19 still applies: STOP if the install fails it) |
| S/U OD-3 | YES, after A07: members SQL repos move to `user-management/members/sql` |
| S/U OD-4 | YES: API keys enter `@jini-ai/user-management`; scheme prefix stays a Tovu value passed as data; stored hash format frozen, no migration |
| S/U OD-5 | DECIDED (owner rule, option C): dialect helpers reach a Jini SQL adapter as an injected port |
| S/U OD-6 | (a) one core-contract outbox port shape; unblocks S6a, S8c, move-events |
| S/U OD-7 | KEEP `members/consent-service.ts` until a reachability proof exists |
| S/U OD-8 | YES: one Tovu helper `schemaErasedKernel` holds the single schema-erasing cast |
| S/U OD-9 | YES: new Node subpath `@jini-ai/user-management/members/server` for member credential code |

## Owner answers 2026-11-17 ~11:10 PM PT

| ID | Answer |
|---|---|
| AU-D15 (admin T1b shell swap URLs) | NEW URLs only. No redirects, no legacy aliases, no backward-compatibility code. Change every internal link, route, test and doc in the same change set. |
| audit2 A10 (byte-size formatting) | Use Jini core's single `formatByteSize` style everywhere; delete the other formatters; fix every downstream label/test. |
| audit2 A01 (duplicate helpers) | Adopt Jini's behaviour (incl. copy semantics) everywhere; delete the Tovu copies; fix downstream effects. |
| Daemon changed answers (R7: POST-only remote-run-event gate -> other methods 404; model-proxy/lookup own body reader -> JSON 413; origin check before body -> 403) | Owner delegated: coordinator picks the most responsible long-term option -> KEEP all three (consistent JSON errors, origin rejected before parsing, no route-existence leak). |
| Q-WH (ui-admin-database) | Owner delegated: coordinator decides the most responsible long-term option (recorded with reasoning when decided). |
| ER-6, ER-D12, XP-OD6, OLD-CLONES, OLD-KL | Coordinator summarises; owner OK to proceed on recommendations. |
| J4 React-half home | OPEN: owner asked about `@jini-ai/core/react`; coordinator explained core is the zero-dependency kernel; awaiting owner pick (core/react subpath with optional React peer vs ui-kit exception). |
| General | No redirects / dead code / back-compat shims anywhere: fix everything now. |

## Owner answers 2026-11-17 ~11:20 PM PT (supersede the OPEN J4 row above)

| ID | Answer |
|---|---|
| J4 React half (useController, bindReact, ModulePageProps, TabViewProps) | INJECT, do not import: module packages (admin domains, cms, devops, user-management, agent-plugins, cookie-consent) state the contract (types) and receive the React helpers from the host through an injected hooks/runtime prop (grouped hooks prop, defaulted only where the package owns the default); the app (Tovu) wires the implementation. No ui-kit import exception, no @jini-ai/core/react. |
| arch-120 (cross-feature import edges) | Untangle with interfaces (ports) and keep it untangled; the app wires the implementations. No baseline waivers. |
