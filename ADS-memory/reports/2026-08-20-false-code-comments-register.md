# Register — false / stale code comments in Tovu

**Created:** 2026-08-20 · **Verified at:** `f4cc0aa6` + `99494a66` (branch `general-work`)

Every entry below was checked against the source at the time of writing, not copied from a report.
Where an entry says FIXED, the fixing commit is named. Where it says OPEN, the false text is still on
disk right now.

**Why this file exists:** in the 24 hours to 2026-08-20, seven confidently-worded, evidence-shaped
comments in this repo were proven false. One of them rationalized a CRITICAL data-loss bug by citing
a document that does not exist. Long, authoritative-sounding comments here sometimes encode
*inference* rather than *observation*, and they read identically. Treat a comment as a hypothesis
with a citation, not as evidence.

**Standing rule for anyone working in this repo:** if a comment cites a source — a file, a spec, an
ADR, a type, a commit — open that source before relying on the claim. If it asserts a guarantee
("this will fail to compile", "there is no import here", "no narrower type exists"), reproduce the
guarantee empirically before trusting it.

---

## OPEN — still false on disk, need fixing

### O1. `src/features/deployments/publish-agent-tools.ts` (~line 400)

The doc block above `VendorCredentialSummaryLike` says the hand-written mirror exists because it
"buys the zero-import property below", and points the reader at "the module-level comment above this
file's **now-absent** `vendor-credentials` import."

**Why it is false:** the import is not absent. Line 105 is
`import type { VendorCredentialSetRepoPort } from "../vendor-credentials/index.js"`, added
2026-08-20 during the RouteDeps narrowing. The file no longer has a "zero-import property" to buy.

**Fix:** rewrite the block to say the mirror is retained to avoid a *value* import and to keep the
loosened `string` vendor id, and drop the "now-absent import" reference. The sibling comment at line
114 was already corrected to "Deliberately NO **VALUE** import" — this one was missed.

**Verify:** `grep -n "vendor-credentials" src/features/deployments/publish-agent-tools.ts`

---

### O2. `src/seo/types.ts` (lines ~125-129)

```
 * Compile-time guard: `PageHeadEntryRef`'s identity fields must remain a
 * subset of the live `PostRecord`. If `PostRecord` renames/removes one of
 * these, this alias fails to typecheck — pinned to the real content record.
 */
export type EntrySnapshotIdentity = Pick<PostRecord, "id" | "workspaceId" | "slug" | "title" | "status">;
```

**Why it is false — two separate problems:**

1. **It does not guard what it claims.** The alias never references `PageHeadEntryRef` at all. It
   pins five *field names* on `PostRecord` and nothing more. Any drift between `PageHeadEntryRef`
   and `PostRecord` — the stated purpose — passes silently.
2. **It is dead.** `grep -rn "EntrySnapshotIdentity" src/` returns exactly one hit: its own
   declaration.

The narrow claim it *does* satisfy is real: a `Pick` naming a key `PostRecord` lacks is a compile
error. So this is an overstated guarantee, not a wholly imaginary one — which is precisely what makes
it dangerous to skim.

**Fix:** either make the guard real (assert the relationship it describes, and reference it from
somewhere so it cannot be deleted as dead code), or delete the alias and its comment. Do not simply
soften the wording and leave dead code behind.

**Found by:** `arch-final-backedges`, 2026-08-20, while planning Job 3. Deliberately not fixed then —
out of scope for that dispatch.

---

## FIXED — recorded for the pattern, do not re-fix

### F1. `src/features/source-control/commit-site.ts` — the data-loss rationalization

A comment justified the GitHub publishing behaviour that deleted every unrelated file on the target
branch, by citing a design document that **does not exist**. The bug had already run against a real
repository.

Fixed 2026-08-19. This is the single most expensive false comment found so far and the reason the
standing rule above exists.

*Note:* the 2026-08-19 handoff states THREE comments were proven false that session but individually
identifies only this one. The other two are not named in that document and are not reconstructed here
rather than guessed at.

---

### F2. `src/features/deployments/tool-registrations.ts` (was ~46-58) and `publish-agent-tools.ts` (was ~74) — "no honest narrower type exists"

Both files argued in prose that they must name the full `RouteDeps` god type, because
`RouteDeps.runExportSite` is `ExportEngine<RouteDeps>` and contravariance defeats any narrower
stand-in.

**The premise was true; the conclusion was false.** `types.ts:1156` really is
`runExportSite: ExportEngine<RouteDeps>`, verified independently three times. But narrowing was never
blocked — it just could not be done *with types alone*. A composition-root-bound closure
(`RouteDeps.exportSiteBound`) removed the need to name `RouteDeps` anywhere in the domain.

Two independent agents, without communicating, derived that same fix.

Fixed in `a699c833` / `04429a54`; comments rewritten.

**Pattern to note:** a comment can be factually correct in every particular and still license a wrong
conclusion. Check the inference, not only the facts.

---

### F3. `src/features/deployments/publish-agent-tools.ts` (line ~114) — the over-broad zero-import claim

Formerly: "Deliberately **NO import of any kind (type or value)** from `../vendor-credentials/**`
here — an earlier revision imported directly, which closed a real
`features/deployments <-> features/vendor-credentials` module cycle."

**Why it was false:** the historical cycle was real, but it was a *runtime* cycle. A type-only edge
cannot close one. `check-architecture` confirmed 0 module cycles / SCC 0 before and after adding the
type-only import.

Corrected to "NO **VALUE** import" in `a699c833`. See **O1** — a related comment in the same file
still carries the old assumption.

---

### F4. `.dependency-cruiser.cjs` — described a design that never shipped

A comment block described a `runSiteExport` field and `features/deployments/export-run.ts`'s
`BoundExportEngine` doc. Neither name existed anywhere in `src/` — the field had been renamed to
`exportSiteBound` and `export-run.ts` needed zero changes. Written from a superseded draft design.

Fixed in `1a483312`.

---

### F5. `src/assistant/byok-tool-surface.ts` (line ~235) — wrong owner attribution

Attributed `magicLinkPerEmailLimiter` to `IdentityToolDeps`. It is declared by `MembersToolDeps`
(`src/members/tool-registrations.ts:71`).

Fixed in `99494a66`; the comment now names `members/tool-registrations.ts` explicitly and states that
`IdentityToolDeps` declares no such field.

---

## Related, not a code comment

`ADS-memory/reports/.../theme-authoring-guide.md` §6's "3-attribute markers" claim is recorded
elsewhere as wrong and should be verified against the parser before use. Listed here only so the
pattern is not mistaken for a code-comment-only problem.

---

## How to add to this register

One entry, with: exact file and line, the quoted claim, *why* it is false (with the command or
diagnostic that shows it), the fix or the reason it was left, and who found it and when. If it is
fixed, name the commit. An entry that cannot be reproduced from its own text does not belong here.
