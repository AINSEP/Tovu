# Three pushed commits carry another commit's message — correction record, 2026-09-06

**Agent:** dispatched subagent, via `team-lead`
**Branch:** `restructure/apps-website-phased` (all three affected commits are ancestors of `origin/main`)
**Scope:** investigation and non-destructive correction only. No commit object was rewritten, no history was touched, no product code was edited.

## Plain-language verdict

Three commits on `main` carry a subject and body that describe a **different commit's diff**. The one that actually costs something is `64e6c029`: its diff is a credential-redaction **security fix**, but its message describes taxonomy rendering, so anyone auditing what security work has shipped will not find it. The other two are mislabeled refactors — annoying, not dangerous.

All three are already pushed. Correcting them in place would mean rewriting public history for three commit messages, which is not worth it. This file is the correction, because it is the only form of the correction that survives a clone.

## The three affected commits

| Mislabeled commit | Subject it wrongly carries | What its diff actually is | Rightful owner of that message |
|---|---|---|---|
| `64e6c029` (2026-09-03 10:23) | `fix(website): resolve assigned taxonomy terms on the ... render tiers` | **Credential-redaction security fix** in `apps/website/src/features/custom-credentials/credentialed-request.ts` | `ab3c01cc` (10:20) |
| `72c4f95e` (2026-08-16 20:48) | `fix(publish-credentials): heal existing rows' account_label ...` | export↔server decoupling, edge 2 — theme resolution moved into `src/features/theme/active-theme.ts` | `87d7a4c5` (20:49) |
| `10d9ff9d` (2026-08-11 21:11) | `refactor(admin/media): convert media hooks to the useWiredX DI convention` | the same useWiredX conversion applied to **admin/collections**, not media | `0fb53f10` (21:12) |

In each case the bad message is a **verbatim duplicate** of a neighbouring commit made seconds earlier or later — that duplication is the detection signature.

### What `64e6c029` actually fixed

`custom_credential_make_request` returned the provider's response headers and body verbatim, so any endpoint that reflects request headers back handed the injected credential straight to the model. The fix strips `Authorization`/`Proxy-Authorization`/`Set-Cookie`/`Cookie` from the response, drops any other header whose value echoes the injected secret, and scrubs those secrets out of the body text. Status and non-secret content pass through unchanged. `922f2ef6` (10:28) is the follow-up that withholds the body rather than over-scrubbing a short token.

### `72c4f95e` also has heredoc corruption

Its message ends with a stray `EOF` and `)` — a heredoc terminator captured as message text. Same root cause, different symptom.

## Checked and ruled out

`358721f6` and `d22d1c8f` share the subject `refactor(platform/oauth): extract steps to clear the complexity ceiling`, but each body accurately describes its own diff (`device-code.ts` vs `discovery.ts`). Legitimate sibling refactors from one session, not this defect. Recorded so a future sweep does not re-investigate them.

## Root cause

Concurrent agents in one shared worktree, committing via `git commit -F <msgfile>` against a **shared message-file path**. Agent A writes its message, agent B overwrites it, and one of them commits a message that is not its own. `git commit -F` never validates that the message describes the staged diff, so the error is silent and permanent once pushed. The shared index makes this easy to hit; the shared *filename* is what actually causes it.

## What was done

`git notes` were attached to all three commits in this clone, each naming the real change and the commit the message was stolen from. The `64e6c029` note was added 2026-09-03 (three minutes after the bad commit); the `72c4f95e` and `10d9ff9d` notes were added 2026-09-06 as part of this investigation. `git log` and `git show` surface them automatically for anyone working in this clone.

## Honest failure mode

**The notes exist only on this machine.** `origin` carries zero `refs/notes/*`, and `remote.origin.fetch` is `+refs/heads/*:refs/remotes/origin/*` — no notes refspec. `git clone` does not fetch notes, and GitHub's web UI never renders them at all. A fresh clone, CI, or anyone reading these commits on github.com still sees only the wrong subject.

`ADS-memory/knowledge/` is likewise gitignored, so the mistakes-notebook entry written alongside this report has the same limitation. `ADS-memory/reports/` is tracked, which is why the correction table lives here.

Making the notes travel would need `git push origin refs/notes/commits` plus a `+refs/notes/*:refs/notes/*` fetch refspec configured on every clone. That is **proposed, not done** — it publishes to the shared remote, and it still would not reach the GitHub web UI. The only fix that reaches a github.com reader is a history rewrite of public `main`, which is not recommended for three commit messages.

## Suggested guards (ideas only — not implemented)

- Give each agent a **uniquely named** commit-message file (agent name or pid in the filename). The root cause is the shared path.
- Detector, since the signature is a duplicated subject — run it over **full** history, as a bounded `-N` window silently finds nothing when the pair predates the window (that happened on the first pass here):

      git log --format='%H|%s' | sort -t'|' -k2 | awk -F'|' '$2==p{print} {p=$2}'

- Reject a commit message containing a lone `EOF` or `)` line in a pre-commit hook.
