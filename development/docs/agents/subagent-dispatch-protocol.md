# Subagent Dispatch Protocol (project-side)

**Read this before dispatching any subagent in this repo.**

This exists because the framework's own dispatch guidance (`AI-Dev-Shop/framework/workflows/multi-agent-pipeline.md`, the Delegated Agent Bootstrap section of `AI-Dev-Shop/AGENTS.md`) is silent on the single most expensive property of this environment, and the framework is read-only during feature work. Owner asked for this to be written down on 2026-08-12; written 2026-08-15 after the same failure recurred in a five-agent session.

---

## 1. Mid-flight messages do not arrive

**A subagent that is heads-down in tool calls does not read its inbox.** `SendMessage` returns `{"success": true, "msg_id": ...}`, which proves only that the message reached a queue — never that the agent read it. Measured repeatedly: 0-for-5 in one session, 5 confirmed drops in another, and at least 2 more on 2026-08-15.

The owner has stated this flatly three times, unprompted:

> "Sub agents don't get your messages mid flight."
> "if you send an agent a message … it's probably not gonna get it. So send it after it tells you it's done."
> "Sub agents don't get your messages generally when they are in the middle of something."

Treat it as the operating model, not a risk to hedge against.

**The spawn prompt is the only channel guaranteed to be read.**

## 2. Consequences for how briefs are written

- **Never write a gated check-in.** "Message me before you do X and wait for my answer" converts a working agent into a stalled one: it asks, and the answer cannot reach it. Ask for reasoning as *output*, never as a *gate* — "make the call yourself and record your reasoning in the final report."
- Milestone check-ins are still good, but must be **non-blocking**: report and keep going.
- **Two tasks go in one spawn prompt**, never queued as a follow-up message.
- Anything you can foresee at dispatch time belongs in the brief. A mid-flight message is usually evidence of an incomplete brief, not of changed circumstances.
- Invited pushback belongs in the final report, where it arrives reliably. (It works: on 2026-08-15, four of five agents found real errors in their briefs this way.)

## 3. When you may send

Only at a **surfacing** — the agent has reported a milestone, reported done, or gone idle. Those are the moments it is provably reading. Accumulate steers in a local note and send **one consolidated message** at the next surfacing rather than three that race the same run.

## 4. Detecting a drop

In order of reliability:

1. **Measure the code.** Derive an assertion from the instruction you sent, then run it. One `grep` beats any amount of report-reading, and it is ground truth rather than the agent's account. *(2026-08-15: `ls development/e2e/ | grep password` → empty, proving an e2e request never landed, against a report that said "nothing left open.")*
2. **Diff the report against what you sent.** A detailed report that silently omits an item is strong evidence of non-receipt.
3. Never infer a drop from a report that **predates** your send. An idle agent resumes on delivery; wait one surfacing before concluding anything.

## 5. Changing scope

**Stop-and-respawn, not a message** — and only **at a commit boundary.**

- `git status --porcelain <that agent's slice>` first, reflexively. An agent with uncommitted work is not safe to kill; `TaskStop` discards it.
- Carry the complete remaining state inline in the new spawn prompt.
- **Once you `TaskStop` an agent, never message it again.** A send *resumes it from its transcript* — this has previously revived a killed agent to run concurrently with its replacement, both editing the same files.

## 6. Shared working tree

Multiple agents share one git index. Every brief must carry:

- Explicit-path commits only. Never `git add -A`, never `git commit -a`.
- `git status --short` + `git diff --cached --name-only` before each commit; unstage anything that isn't yours.
- `git show --stat HEAD` after, to confirm.
- Commit incrementally — uncommitted work is lost on stop.
- Explicit-path `git add` guards against the wrong *file*; it does nothing about the wrong *hunk*. On a shared tree, check `git diff --cached` content too.

## 7. Persist reports on arrival

Write findings to a file as they come in. It is what makes respawn cheap — the replacement reads the prior agent's report instead of re-deriving it — and agents have recovered dropped messages by reading a shared file directly. **The file is the record; SendMessage is the nudge.**

---

Fuller history, with the specific incidents behind each rule, lives in the assistant's memory under `feedback-sendmessage-may-not-deliver`.
