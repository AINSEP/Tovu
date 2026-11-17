# U2 — members auth domain (write service, access resolver, password auth, mail glue)

Facts: `U2-members-auth-domain.facts.md` (15 files, 3,469 lines, 55 test files, 54 prod importers, 12 baseline rows).
Six of the 15 files (1,785 lines) are ALREADY covered by audit2 sheet A07: `agent-tools, ports, repo.memory,
tool-registrations, types, subscriber-directory`. Do not re-plan them. This sheet covers the CLASSIFY row-54 files, which
have labels but no sheet. `capability-card.ts` (29) belongs to `sheets/delete-site-guide.gen.md` (plan/w1-sheets-d).

```
id: U2a-members-small (~120k, T-MOVE/T-DELETE)   auth-mail.ts 25, mailer.console.ts 93, trash-member.ts 24, consent-service.ts 261
    U2b-members-access (~200k, T-SPLIT)          access-resolver.ts 237, password-auth.ts 204
    U2c-members-write-service  DESIGN NEEDED, not an executable sheet (write-service.ts 677, MIXED, 3 prod + 10 tests)
jini_target: user-management ./members (A07's subpath) + ./server (auth-challenge.ts exists); platform ./mail for the console mailer
prerequisites: A07 landed. U1 landed (the resolver and password paths read through the member repos). S0 green (P2, P5).
  Error-system design status: its CODEX-JUDGE names `members/write-service.ts`, `types.ts`, `tool-registrations.ts`; if it
  schedules edits there, it runs first.
```

## U2a
- `mailer.console.ts` (CLASSIFY: MOVE -> `@jini-ai/platform/mail`; Jini has only a type alias): it logs mail to the console (facts flag `console`? re-check with `rg -n "console\." `) — COMMON 7 forbids `console.*` in Jini: the Jini adapter takes a `write(line)` port; Tovu passes `console.log`. Uses `node:crypto` -> node entry. Security: a console mailer prints sign-in links; it must stay reachable only in the modes that select it today. T0: the composition selects it exactly under today's condition (pin), and the printed link is the same URL the mail would carry.
- `auth-mail.ts` (25; imports `@jini-ai/platform/mail/email-template`): user-management may not import platform -> it takes a `renderEmail` port (CLASSIFY: "Host supplies a `renderEmailForSend` port"). MOVE the composition of the template input; Tovu binds the renderer.
- `trash-member.ts` (24; imports `@jini-ai/cms/trash`): user-management may not import cms -> stays in Tovu as the binding of the member trash adapter (STAY-WIRING; override of CLASSIFY MOVE-AFTER). Not edited.
- `consent-service.ts` (261; CLASSIFY: DELETE; 1 prod + 1 test importer; 16+ write-path baseline rows): DELETE is a claim, not a fact. Step 0: `rg -n "consent-service" apps/website/src` and read the one prod importer; if anything reachable calls it, it is NOT dead: SKIP and report. Member consent is a privacy record; deletion of its writer needs the owner (OD-7).

## U2b — security chain (verification steps: owner, port, test)
| Step | Owner after the move | Test (T0) | Mutation -> RED |
|---|---|---|---|
| Access decision for a member request: session valid -> member not trashed/disabled -> subscription/tier grants the resource (read `access-resolver.ts` for the exact order) | Jini `members/access-resolver.ts`; session, subscription and tier reads are the A07 ports; clock injected | table of (no session, expired, revoked, trashed member, no subscription, lapsed, wrong tier, ok) -> decisions as today, each denial indistinguishable to the caller if it is today | remove each step |
| Constant-time compare (`node:crypto` in access-resolver) | Jini, node entry | the compare is `timingSafeEqual` on equal-length buffers; unequal lengths do not throw | replace with `===` (test asserts via an injected comparer spy only if one exists; otherwise a source-shape assertion is NOT acceptable — add the seam) |
| Password verify + rehash + lockout (`password-auth.ts` uses `@jini-ai/user-management/server` hasher) | Jini `members/password-auth.ts` | wrong password, unknown member (same outcome and one hash spent, as API keys do), correct password under `trash:member` lock, trashed member refused | remove the lock; skip the decoy |
| Password change revokes credentials (`credentials_revoked_at`) | Jini | sessions issued before the change stop authenticating | skip the revocation write |

## U2c — why no sheet
`write-service.ts` mixes the member challenge store (label: -> `user-management/server/auth-challenge.ts`), sign-up,
magic-link issue/consume, verified-origin checks (`core/contracts/server/verified-origin`), mail sending and analytics. It is
677 lines with `node:crypto`; a contiguous split would be wrong (LESSONS 1). It needs a design: dependency graph of its
functions, the challenge-store state owner, which origin/CSRF gates sit in the route vs here. Estimate: one Opus design
(~250k) + two Sonnet runs.

Not verified while planning: bodies of all U2 files; the console-mailer selection condition; consent-service reachability.
