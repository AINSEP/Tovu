# Cloud run protocol — mandatory for every dispatched cloud agent

Read this in full before doing anything else. Every brief in `briefs/` assumes it.

## 0. Why this file exists

Cloud runs on this project have failed silently and repeatedly. `RemoteTrigger`'s `list`/`get`
actions **only echo the dispatch's own job config back** — they expose no transcript, no session
URL, no logs. From the outside, a cloud run is a black box for its entire life.

**Therefore: commits are the only telemetry, and an unpushed commit does not exist.** The sandbox is
ephemeral. When it dies, everything not pushed is irrecoverable. There is no way to retrieve it
afterwards. This has already happened — a 65-minute run produced nothing because it batched its work
into one commit at the end and never got there.

## 1. Branch

Two repos are cloned side by side: `Tovu-AI-CMS` (the Tovu product) and `Jini` (the `@jini-ai/*`
engine). Work lives on branch `refactor/jini-admin-extraction` in **BOTH**, not `main`.

In each repo you will touch:

```
git checkout refactor/jini-admin-extraction && git pull
```

If checkout fails, say so in the run log immediately and work from whatever branch you landed on,
stating clearly which one.

## 2. The run log — create it in your first 2 minutes, before any analysis

Create `ADS-memory/reports/cloud-runs/<date>-<slug>.md` in the **Tovu** repo (your brief names the
exact path), write a `STARTED` entry, then **commit and push it**. Before you read a single source
file.

The `STARTED` entry records: UTC timestamp, both repos' HEAD shas, whether each checkout succeeded,
and one line on what you are about to do.

### Rules

- **Append-only.** Never rewrite or tidy earlier entries. A messy honest log beats a clean one.
- **Push every 5 minutes minimum**, even when nothing has changed. A heartbeat with a fresh
  timestamp is how a human distinguishes "working, 3 of 8 done" from "stuck at minute two". Silence
  is indistinguishable from death.
- **Log every command that fails**: the exact command, its exit code, and the first ~20 lines of
  stderr. This is the single most important thing in this file. Do not summarize a failure as
  "the build didn't work" — paste what it actually said.
- **Log every file you could not find or read**, with the path you tried. A brief citing a path that
  has since moved is a common and easily-fixed failure, but only if you report the path.
- **Log every assumption you had to make** because the brief was ambiguous or wrong.
- **Before you stop for ANY reason** — finished, blocked, erroring, or running low on context —
  write a final entry saying which of those it is, then commit and push it **first**, before
  anything else you might be tempted to do.

### Entry format

```markdown
## <UTC timestamp> — <STARTED | PROGRESS | FAILURE | ASSUMPTION | BLOCKED | DONE>

<what happened, plainly>

<for FAILURE: the command, the exit code, the stderr>
```

## 3. Persisting the actual deliverable

- **Commit and push incrementally** — after each logical unit, not once at the end. A single
  terminal commit is all-or-nothing: an agent that completes 300 of 523 edits and then stalls loses
  all 300. Use `wip:` prefixes freely; history can be squashed later, lost work cannot be recovered.
- Push to `refactor/jini-admin-extraction`. **If the push is rejected**, push to a fallback branch
  named in your brief and **say so prominently** in both the run log and your final report.
- **Never gate a commit behind a green test suite.** Commit first, then verify, then report failures
  honestly. A previous run made "tests must be green" a precondition for committing, the tests could
  not be made green because of an unrelated setup omission, and the entire run's work was lost.
- Confirm in your final report that the push actually **succeeded** — quote the commit sha or branch
  name. Do not report "I'm done" on the assumption it worked.

## 4. Evidence standard

Every claim about existing code needs a `file:line` you actually opened and read. If you did not
verify something, label it unverified. Citations in this repo's older documents may have drifted —
spot-check the load-bearing ones rather than trusting them wholesale, and log it when one is stale.

Prefer reading source over trusting a document's description of that source.

## 5. Pushback is wanted

If a brief's premise turns out to be wrong — the thing already exists, the decision it rests on
doesn't survive contact with the code, the task is three small changes rather than a new subsystem —
that is the **most valuable** thing you can report. Put it in a `Concerns` section in your
deliverable and in the run log. Do not quietly work around it, and do not invent scope to justify
the assignment.
