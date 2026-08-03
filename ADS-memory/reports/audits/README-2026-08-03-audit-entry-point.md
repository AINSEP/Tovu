# Audit entry point — 2026-08-03 session

**Start here.** The owner asked that this session's work be saved so it can be audited later by
other LLMs for bugs, security issues, mistakes, and bad architecture. This file is the index; it
exists so an auditor does not have to reconstruct context from a raw transcript.

Session: Coordinator (Review Mode), Claude Code / Opus 5 (1M context), interactive.
Repos: `/Users/la/Programming/Tovu` and `/Users/la/Programming/Jini`, both on branch
`refactor/jini-admin-extraction`. **Nothing from this session is committed** — see the commit plan.

---

## Read in this order

| # | Document | What it is |
|---|---|---|
| 1 | [`2026-08-03-audit-dossier-outbox-and-tool-surface.md`](./2026-08-03-audit-dossier-outbox-and-tool-surface.md) | **The main artifact.** Deliberately adversarial: what was *executed* vs what was *assumed*, plus known weaknesses. Read its "Assumed, NOT verified" and "Known weaknesses" sections first. |
| 2 | [`../recon/2026-08-03-outbox-workspaceid-and-mcp-ui-decisions.md`](../recon/2026-08-03-outbox-workspaceid-and-mcp-ui-decisions.md) | Narrative + the owner's decisions (D1, D1a, D2) with the options that were offered and declined. |
| 3 | [`../architecture/ADR-053-mcp-ui-confirmation-transport.md`](../architecture/ADR-053-mcp-ui-confirmation-transport.md) | **DRAFT, not self-approved, not in ADR-INDEX.** The MCP-UI design. |
| 4 | [`../../.local-artifacts/worklist/20260803-commit-plan-and-file-ownership.md`](../../.local-artifacts/worklist/20260803-commit-plan-and-file-ownership.md) | Which files belong to this session vs. two concurrent sessions. **Read before any `git` operation.** |
| 5 | `../../.local-artifacts/agent-reports/20260803-*.md` | Raw subagent reports (outbox regression test, image render + risk classification, cms consumers + widget inventory, cross-tenant audit). |

---

## The one thing an auditor should know about this dossier

**Four of its own claims were disproved or overstated during the session, by agents dispatched to
check them.** Each was written confidently, with specific file paths and error strings, and each read
like measured evidence:

1. `theme_delete_file` was called a genuine misclassification. **It is not a registered tool at all.**
2. A "55 widgets vs 6 shown" discrepancy was called unexplained. **The premise was invalid** — the
   admin UI passes `includeInactive: true` and shows 57 of 59. There was no gap.
3. "Four misclassified destructive tools." **At most one** survived investigation.
4. **D10 was called a confirmed live cross-tenant defect** and "the most serious finding in this
   dossier." The mechanism is real but the headline scenario is **not reachable** — `tovu serve
   --workspace B` spawns no agent daemon at all, so there are no agent tools to write to the wrong
   tenant. The genuine defect is a narrower **latent** one on a different entrypoint.

**The pattern is consistent and worth naming:** a real mechanism, correctly traced link by link, then
extrapolated one step further into a scenario nobody checked was reachable. Every individual fact was
verified. The conclusion still outran the evidence. **Reachability is the check that kept getting
skipped** — when auditing this dossier, ask of every finding: *is there an actual code path that
arrives here?*

A fourth false claim was found in the *codebase itself*: `src/widgets/entry-payload.ts` asserted a
specific `NOT NULL constraint failed: outbox_events.id` error on a code path that **never enqueues at
all**, so it could not have thrown. Corrected in place with a dated note.

**Treat confident, specific, evidence-shaped claims in this repo's comments, handoffs, and reports as
unverified until re-derived** — including the ones in these documents. That is the single most
transferable lesson of the session.

---

## Verification blind spots — why "green" means less here than it looks

Three independent gaps, all confirmed by execution:

1. **Every domain test stubs the outbox** with an accept-anything double. `SqliteOutboxAdapter`
   appears in only 2 non-production files, both testing it in isolation. A green suite said nothing
   about the bug that broke every admin write.
2. **`tsx --test` is transpile-only** — it strips types and never validates them. Demonstrated: a
   missing type-union member produced a fully green test run and a failing `npm run typecheck`.
3. **The static bridge guard is a shape check, not a type check** — deliberately, because the type
   system provably cannot catch the original bug (method-parameter bivariance).

So `npm run typecheck`, the scoped tests, and exercising the running app are **three separate
claims**. None substitutes for another. The original bug shipped green.

---

## What changed (all uncommitted)

- **Outbox `workspaceId` fix** — 3 `@jini-ai/cms` bridges (BREAKING: `workspaceId` now required) + 4
  Tovu widget call sites. Every admin write through those chokepoints previously returned 500 while
  still committing the row. Verified live; regression test added with red/green proven.
- **Inline images no longer silently dropped** from published pages (`renderDocNode` gained
  `case "image"`).
- **`check:outbox-bridge`** taught to resolve spread composition; self-tested in both directions.
- **`integrations_delete_subscription`** reclassified to `deletes-durable-state`, establishing the
  precedent *"no agent-reachable undo ⇒ `deletes-durable-state`"*. **Zero runtime effect today** —
  metadata prep, not a security fix.
- **Widget list skip visibility** — in flight at time of writing.

## Known-open, deliberately

- **`content_post_delete` is self-approvable.** The model can read its own confirmation token out of
  its tool result (flattened by `okResult`'s `JSON.stringify`), and **nothing renders the dialog**, so
  no human is ever asked. Owner decision D2: no stopgap, fix properly via MCP-UI. **This is an
  accepted, informed, open risk** — the alternative was offered and declined.
- **The agent tool surface is ~88 tools / ~50 mutating**, against a stated intent of read-only
  (search / navigate / answer) for the front-end assistant.
- **No real asset pipeline.** The image fix is an honest placeholder; `src` is never emitted, so no
  URL-scheme validation exists. **Revisit the moment a real `<img>` path is built.**

## Housekeeping

`ADS-memory/sessions/CURRENT-SESSION.md` is dated **2026-07-28** and was never archived, so the
`session-record.sh` archival hook is not firing. Not touched this session — it holds an unarchived
record. Worth fixing separately.
