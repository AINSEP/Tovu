# G19: ON HOLD (owner decision OD-N13) - may `collections_entry_update` change an entry's `bodyJson`?

## Revision 3 (authoritative; the whole sheet was rewritten in place, no older step text remains)

**Do not dispatch.** Gate (prints a line only once the owner decides yes):

```bash
grep -nE "^\| OD-N13 .*\| DECIDED: yes" notes-second-app/INDEX.md
```

No line: this sheet does not run, and nothing else in this plan waits for it (`../INDEX.md` section 00, item 5).
N3, N4 and N5 do **not** depend on it: their assistant round trip changes a note's **title**, which the update
tool already forwards.

**Why it is an owner decision, not a defect** (Opus review, judge 11 revisited). The update tool's schema leaves out
`bodyJson` **on purpose**: `packages/cms/src/entries/agent-tools.ts:35-41` ("Deliberate absences ... exposing it here
would invent capability beyond what the human admin UI's own Collections editor exposes"). Server-side body changes go
through `widgets/embed-service.ts`'s guardrailed path (`write-service.ts:359-369`). The tool is classed
`mutates-durable-state` (`tool-registrations.ts:62`), and Tovu registers the same tools, so a yes here also gives
Tovu's assistant body edits. The revision-2 text called this "the defect" and widened the tool; that is withdrawn.

**Facts corrected from revision 2:**
- the field is **`bodyJson`** (TipTap JSON, `unknown`), not `body` (string);
- the input schema lives in **`agent-tools.ts`** (`collections_entry_update` at `:128`); the handler that forwards
  fields is `tool-registrations.ts:177-191`;
- `updateEntry` keeps the stored value when `bodyJson` is `undefined` and stores what it is given otherwise
  (`write-service.ts:399`), so **clear = `bodyJson: null`**, not `""`.

## If OD-N13 is decided yes (sheet to run then)

Inherits `COMMON.md`. Repo: Jini, `packages/cms`. Branch: `feat/gap-g19-entry-tool-body`. Estimate: ~70k Sonnet.
Lane check at dispatch: lane S sheet S2 moves entry storage, not the tool catalog or registrations:

```bash
git ls-files packages/cms/src/entries/agent-tools.ts packages/cms/src/entries/tool-registrations.ts
```

and confirm neither path is in the S lane's file list (X4).

**Characterization (passes today, committed alone):** through the registration's handler with a fake repo, an
update input carrying `bodyJson` is refused or ignored exactly as today (pin the real outcome: schema rejection
or a dropped field; do not assume which).

**Red-first** (title of test 1 is the landed check other sheets may grep for: `forwards bodyJson to updateEntry`):
1. `forwards bodyJson to updateEntry`: `bodyJson` in the input reaches `updateEntry`, the stored body changes, and
   `expectedVersion` still guards it.
2. `bodyJson` absent: body unchanged. `bodyJson: null`: body cleared (the service's own rule, `write-service.ts:399`).
3. the input schema in `agent-tools.ts` lists `bodyJson` with a description; the risk (`mutates-durable-state`) and the
   permission are unchanged (assert both).
4. a stale `expectedVersion` with a `bodyJson`: no write (zero repo writes).

**Change:** one schema property in `agent-tools.ts`, one forwarded field in `tool-registrations.ts`, and the
"Deliberate absences" comment rewritten to say what the owner decided and why (COMMON: why-comments are moved or
rewritten, never just deleted). No new tool, no policy change, no storage change.

**Acceptance:** `cms` tests green, counts not lower; Tovu linked typecheck and Tovu's entry-tool tests green; the
changed tool description reported old -> new.
