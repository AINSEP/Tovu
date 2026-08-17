# Live publish through the in-app assistant — verification run

**Date:** 2026-08-16
**Run by:** `publish-verify` subagent (Sonnet 5), findings preserved and independently
re-verified by the Coordinator.
**Status:** INCOMPLETE on the last-mile checks. See "Not verified" below.

> Written by the Coordinator from the agent's own report, because the agent had committed
> nothing to disk when it blocked. Every load-bearing claim below was re-checked against
> source by the Coordinator before being recorded — those checks are marked CONFIRMED.

---

## Headline

**The owner-guessing fix works, and it is standing on something that cannot hold it.**

Asked to publish with no owner named, the assistant refused to guess and asked. That is the
primary behaviour under test and it PASSED.

But the account identity only ever reaches the assistant through a cached verification result,
that cache can only be filled by an endpoint with no UI, and it is process-memory that a restart
wipes. So in practice it is usually empty — and when it is, the assistant does not fail closed.
It falls back to suggesting the original wrong username.

---

## What was done

1. Asked the assistant, verbatim: **"Please publish this site to GitHub Pages."** No owner named.
   Naming the owner was the thing under test, so it was deliberately withheld.
2. The assistant **correctly refused to guess** and asked for the repo. **PASS** — this is the
   `8e71ff8e` fix working on the first pass.
3. It offered two ways forward: verify the token in the UI, or skip and supply the username.
4. The suggested UI path does not exist (see Finding A). The agent instead called the verify
   route directly with an authenticated browser session — an existing endpoint, nothing guessed.
   It succeeded: **GitHub confirmed the token is valid and belongs to `leonaburime-ucla`.**
5. Told the assistant "I verified it" and asked it to continue, still without naming the owner.
   It re-checked and reported **"Verified: never — the verify step didn't stick."** (Finding B.)
6. Its fallback then offered a literal example username — the original wrong one. (Finding C.)
7. The agent supplied `leonaburime-ucla` itself and reached a correct confirmation dialog
   (owner `leonaburime-ucla`, repo `tovu-demo`, target `github-pages`).
8. **Blocked at the Publish click** by the harness's auto-mode safety classifier. The agent
   stopped rather than retrying or routing around it — the correct call. Escalated to the
   Coordinator, who declined to perform the denied action on its behalf and surfaced it to the
   owner instead.

---

## Findings

### A. There is no Verify button — the assistant advertises a control that was never built

**CONFIRMED by the Coordinator.** `grep -rn "erify" apps/admin/src/features/deployment/StaticSiteTab.tsx`
returns **zero matches**. No admin frontend code calls `POST .../workspaces/:id/system/publish/credentials/:id/verify`
either; the only grep hits across `apps/admin/src` are an unrelated shadcn shell script.

The route exists and works. It simply has no UI. So the only way to populate the verification
cache is an endpoint a human cannot reach.

The assistant's instruction — "Deployment panel → Static Site → Publish and hit verify" — is a
hallucinated affordance. **It propagated:** the Coordinator repeated the same instruction to the
owner earlier in the session, having taken it from the assistant's own output.

Tracked as task #11.

### B. The verification cache is process-memory, so "verified" never sticks

**CONFIRMED by the Coordinator.** `publishCredentialVerificationCache: new InMemoryPublishCredentialVerificationCache()`
at **both** `src/server/deps.ts:819` and `src/server/app.ts:633`.

`accountLabel` reaches the assistant only via the cached verification result — `verify.ts`'s
architecture is explicit that the capabilities handler reads the cache and must never call
`verifyPublishCredential` itself (correct: it must not decrypt). So no cache entry means no
identity, and a restart means no cache entry.

During this run the daemon restarted at least twice, which is why step 5 reported "never" even
immediately after step 4 succeeded.

`verify.ts`'s header records in-memory as a deliberate trade-off (no DB column, no migration;
`checkedAt` lets callers judge staleness). That reasoning was sound in isolation but does not
survive a process that restarts — and there is now an obvious home for it, since `publish_history`
(migration 0043) already established a DB table in this domain.

Tracked as task #12.

### C. The fallback re-teaches the original bug

With discovery failed, the assistant offered: **"Type it, e.g. `leonaburime`."**

That is the exact wrong username from the morning's incident, handed back as a helpful example,
specifically *because* its self-discovery path had just failed.

The fix therefore does not degrade safely. It degrades into suggesting the error it was built to
prevent. Copy fix folded into task #12: when identity is unknown, say so and ask — never seed a
literal example.

---

## Not verified (blocked)

The Publish click was never made, so none of these were reached:

- What the human sees after clicking (the `0f9bef4b` outcome-surface fix is therefore **unproven
  end to end**, though it has unit coverage)
- Whether the assistant reports the true outcome in chat afterwards
- Whether the publish is recorded in `publish_history` with `triggeredBy = 'agent_tool'` and a
  real `commitSha`
- Whether the URL goes live from this run

---

## Environmental, not product defects

Two turns failed with `agent run failed to start (500)`, traced to the daemon restarting under a
live turn. Cause: three agents editing files in one shared working tree. **Not a bug — do not
chase it.**

The real second-order effect is worth keeping: those restarts are what exposed Finding B.

---

## Method note

The agent supplied the owner itself only after self-discovery failed, and flagged the whole thread
as a finding rather than letting it read as a clean pass. That is why this report can be trusted
on the parts it does claim.
