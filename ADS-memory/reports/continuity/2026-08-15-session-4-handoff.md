# Handoff — session 4: publish credentials proven, races fixed, custom-provider spec, UI redesign in flight

Generated: 2026-08-15 (late evening)
Source: Coordinator (Claude Opus 5, 1M) + 9 Sonnet subagents
Target: Claude Code, same repo
Branch: `general-work` · **34 commits this session** · **24 unpushed** · 37 files, +5173/−450

> **Saved here, not `.local-artifacts/`** — that directory is gitignored and one `git clean` from
> gone. Continuity handoffs belong in a committed path.

---

## Next-Agent Prompt

```
Read AI-Dev-Shop/AGENTS.md, then this handoff.

START AT "DO THIS FIRST". The tree has ONE red test file (11 failures) committed deliberately
at 34a5ba0-ish HEAD — read that commit's message before touching anything; the failures are
unfinished test rewrites, not broken behaviour, and they must be REWRITTEN not reverted.

Do NOT re-derive: the sealed-credential design, the four-provider set, the custom-provider S3
contract, the aws4fetch decision, or the bucket-hosting permission split. All settled and
recorded in ADS-memory/reports/continuity/2026-08-15-session-4-agent-reports.md (decision log
D-1..D-15) and ADS-memory/specs/custom-publish-provider-contract.md.

Messages to running agents deliver UNRELIABLY (1 of 9 attempts landed early in the session,
better later). Put everything in the spawn prompt. TaskStop kills only ONE task per call when
names collide — call it until it errors; the error lists every live teammate.
```

---

## DO THIS FIRST — three UI bugs the owner found, all in the WIP commit

Owner's words and screenshots, on the redesigned Static Site tab:

| # | Bug | Detail |
|---|---|---|
| **U1** | **CLI block contradicts itself** | It shows `GitHub CLI · gh · Detected on this server` AND, directly below, `"Install the GitHub CLI, then confirm it's on my PATH."` with a Copy button. If the CLI is detected, the install instruction must not render. **Owner explicitly wants this generalised to every provider with a CLI path, not just GitHub.** |
| **U2** | **Connected summary has no expand affordance** | The line `GitHub Pages connected · token stored, encrypted · updated 2026-08-16 03:15` is clickable (it opens to let you enter a new token) but nothing on screen says so. A user with a rotated token has no way to discover how to replace it. Owner: *"these are just UI bugs that shouldn't happen."* |
| **U3** | **Copy says "updated", must say "saved"** | That timestamp is when the ROW WAS WRITTEN. "updated" implies Tovu verified the token recently — it did not, and a revoked token still shows it. Change to "saved"/"last saved". **Do NOT add a verification indicator**; a token-liveness check is a real feature and is not in scope. |

U3 was instructed to the UI agent before it was stopped and never applied.

---

## THE RED TESTS — read this before you run anything

`apps/admin/src/features/deployment/__tests__/StaticSiteTab.unit.test.tsx` — **11 failed, 58 passed.**

Committed deliberately at HEAD (`wip(deployment): numbered-step Getting it online — 11 TESTS RED`).
The page **renders correctly** — owner screenshots confirm. Every failure asserts the **OLD**
structure the commit replaced:

- the `<details>` `"Advanced"` summary contract (self-hosted-cli open-by-default / hosted-api-only notice)
- the old connected-row markup (`'Connected · updated <date>'`)
- the agent-tagging assertions that follow that markup

**Rewrite them to the new state-dependent step contract. Do not revert the feature to make them pass.**

---

## What the UI looks like now (2 commits)

**`571852cf` — first pass, green.** Only the selected provider's credential row renders (was: all
four stacked regardless of tab). Connected-dot + accessible "Connected" suffix on each TabBar tab.
Real hierarchy — only "Where this publish goes" keeps the `--primary` accent; CLI block and no-CLI
note demoted to a quiet unaccented treatment. **Page height 2931px → 2112px.** 173 tests green,
54 more in Themes/Pages confirming the shared `TabBar.tsx` change is additive-only.

**HEAD — second pass, WIP/red.** Numbered steps: step 1 "Connect your `<Provider>` account" with a
done/not-done marker, collapsing to a settled summary once connected; CLI block moved above as a
labelled alternative with an OR divider. **This is where U1–U3 live.**

---

## Owner decision this session: SOURCE CONTROL IS ITS OWN PAGE

The owner asked whether GitHub belongs as a 6th Deployment tab (Overview / Static Site / Full Site /
Dockerfile / History / **Source Control**) with GitHub/GitLab/Bitbucket sub-tabs, or its own page
under Operations.

**Recommended and accepted direction: its own page under Operations, with FLAT provider rows, not
sub-tabs.** Reasoning:
1. **GitLab and Bitbucket are not deploy targets.** Filing them under Deployment lists providers that
   cannot deploy anything.
2. **Tabs inside tabs is what this session just paid to remove.** Deployment already has 5 tabs; a 6th
   containing 3 sub-tabs is two levels of nesting, and nested disclosure is part of why the Static
   Site tab read badly.
3. Source control is broader than deployment — repo listing, versioning, sync — and filing it under
   Deployment locks it to one use.

Use the same flat one-row-per-provider pattern just built for publish credentials, for consistency.

**STILL UNDECIDED — ask before building.** Which is it:
- **(a) a connection/identity page** — connect a git account so Tovu can read repos and push. Small,
  and it is what makes the repo-picker below possible.
- **(b) real git integration** — content versioned in git, history, rollback, sync. Large feature.

The owner leaned (a) but did not confirm.

## Related owner request: REPO PICKER

The owner wants the manual `GITHUB OWNER OR ORG` / `REPOSITORY` text inputs in step 2 replaced with a
picker populated from their GitHub account — *"get my profile and fill it in for me and save."*
Needs a GitHub identity/repo-list API call and a tool exposing it; **neither exists today** (verified:
no profile-fetch tool is registered, and no tool writes a credential).

The owner also clarified they want the assistant to do this by **reading the page via
`data-agent-element` / `agentHandle()` tagging**, not via new bespoke API tools.
`StaticSiteTab.tsx` has **24 `agentHandle(` call sites**, so the page is already tagged. **Whether the
assistant can currently READ those handles is UNVERIFIED — check before designing.**

---

## Completed and verified this session

Coordinator independently re-ran these; they are not agent claims.

| Work | Evidence |
|---|---|
| **B5** env-var aliases — `GH_TOKEN`, `GITHUB_ACCESS_TOKEN`, `VERCEL_ACCESS_TOKEN` | `5b035a93`, 7 tests RED-first |
| **A2/A3/A4** assistant can find, invoke, and is gated on publish tools | `c15a4f4a`, `a1a1de25` — re-ran 43/43 |
| **C1–C4** four publish/export races | `d81f4218` `f21fb1fa` `8707e067` `03fd5230` — re-ran 29/29 |
| **C5** Dockerfile ETag/If-Match, strict | `cbf7f1f1` `0260631b` `0f67d0ce` `b6ac735e` `8459a8b0` — 46/46 |
| **D2** six never-run deployment suites | `cad8e9c9` — 38/38 |
| **Coverage** workspace hooks 5.12% → **100%** all four metrics | `0ab5ec6a` — re-verified 39/39, 3/3, 14/14, 38/38 |
| `coverage.reportOnFailure: true` | `e4211aac` — a failing run produced ZERO artifacts before |
| **Custom-provider spec, zero open items** | `832a8f5f` + `aac50250` `9b23bb3f` `d450c521` |
| **`@jini-ai/ui` masked field** (S3 prerequisite) | Jini repo `738d151c` |
| E3 five stale worktrees removed · E2 38 root PNGs deleted · E1 pushed once | — |

**Backend typecheck clean.** Real linter on `apps/admin/src/features/deployment/` + `TabBar.tsx`:
**exit 0, zero errors** (2 pre-existing `noInlineConfig` warnings in off-limits hook files).

---

## Key artifacts

- `ADS-memory/reports/continuity/2026-08-15-session-4-agent-reports.md` — **all agent reports + decision log D-1..D-15.** Read before re-deciding anything.
- `ADS-memory/specs/custom-publish-provider-contract.md` — complete S3-compatible contract, zero open items.
- `ADS-memory/reports/2026-08-15-admin-coverage-triage.md` — ranked coverage gaps.
- `ADS-memory/reports/continuity/2026-08-15-coverage-and-tests-worklist.md` — tasks 1–5 all now DONE.
- `ADS-memory/reports/external-audit/runs/2026-08-15-terra-xhigh-deployment-slug-code-review.md` — C6/C8 still unfixed.

---

## Constraints that bit this session — do not rediscover

1. **`apps/admin` complexity gate is `error`/**9**, not 15/warn.** `eslint.config.mjs:163-179` overrides the repo-wide block. Tests/`__measurements__` excluded outright. `noInlineConfig` is set — **eslint-disable comments do not work**. Debt list is a dated 08-10 snapshot, not an escape hatch.
2. **`packages/ui/dist/` is gitignored.** The Jini masked-field SOURCE is committed; the BUILD is not. A fresh clone or CI needs `npm run build` in `packages/ui` or Tovu silently sees the old types.
3. **`--coverage.reporter=text` REPLACES the config's reporter array**, so lcov silently never gets written. Second, unrelated cause of "coverage vanished."
4. **`git commit -- <path>` fails on brand-new untracked files.** `git add` first.
5. Inline `git commit -m "$(cat <<'EOF'...)"` breaks on apostrophes in this shell — use `-F <file>`.
6. **Concurrent agents share ONE git index.** Verify `git diff --cached --name-only` before every commit. Two clobbers happened; verify-before-commit caught both.
7. **Express auto-generates a weak ETag** on any response that doesn't set one — a loose "an ETag exists" assertion passes against wholly unfixed code.
8. **The `request-volume` flake is cold-import cost AND load**, both. Only a *dynamic* `await import()` of a heavy not-yet-loaded module inside a test body can eat a `testTimeout`; a static top-level import pays before the clock starts. Surveyed — **not systemic**, only that one file.

---

## Risks and open questions

- **A1 — a real publish has still NEVER run.** Every link is now tested except the one touching the internet. Irreversible, live, no draft step. Use a NEW project name (`tovu-publish-test`), never an existing Vercel project. GitHub Pages additionally needs the fine-grained PAT to carry **Contents: write + Pages: write**.
- **Credential save path is REAL and verified** — `publish_credential_sets` in `infra/content.db` has a `github-pages` row, default, sealed AES-GCM (`sealed_ciphertext`/`sealed_nonce`/`sealed_alg`; **no plaintext column exists in the schema**). Owner may have added a second row after this was written — if a second `github-pages` row exists, that is a BUG: the flat design permits one per provider.
- **Custom/S3 provider: spec complete, prerequisite shipped, NOT BUILT.** Dispatched then stopped for cost before writing anything. Nothing lost.
- **Terra C6** (backfill false-negative, already applied to live DB) and **C8** (`verify.ts` rejects legal `NULL`) still unfixed.
- **D1 Docker build has still never succeeded.** Do not pipe it through `tail` — you get `tail`'s exit code and a failure reads as success.
- **D3/D4/D5** untouched: Full Site deploy, provider registry, broken BYOK surface.
- Pre-existing, not ours: 6 `post-template-site-serving`, 5 `database-recovery`, 2 `menus`, ~37 `Mock<Procedure|Constructable>` tsc errors in `apps/admin`.

---

## Coordinator errors this session, recorded so they are not repeated

1. **Reported the complexity gate as 15/warn.** Found the repo-wide block, missed the narrower `apps/admin` 9/error block. CI was already stricter than the owner's request.
2. **Committed "contention refuted" to a decision log** on one agent's report before anyone measured under load. Wrong — contention is real and compounds.
3. **Briefed the UI agent with a defect list instead of a redesign mandate**, activated none of its conditional skills, and never switched its scope to implement. Result: the owner saw no visible change and said so. **This is the expensive one.**
4. **Spec'd the custom provider and said "unblocked" three times instead of dispatching it.**

(1) and (2) were caught by agents volunteering evidence against their own claims, not by the Coordinator.

**Framework fix already applied** (`AI-Dev-Shop/agents/web-design/skills.md`, uncommitted): the
web-design agent now implements its own visual work by default (boundary is *behaviour*, not code),
and self-assesses its own conditional-skill activation conditions rather than depending on the
dispatcher naming them.

---

## Next steps, ordered

1. **U1–U3** — the three UI bugs. Small, visible, owner-reported.
2. **Rewrite the 11 red tests** to the new step contract.
3. **Confirm Source Control scope (a) or (b)** with the owner, then build the Operations page with flat provider rows.
4. **Repo picker** — first verify whether the assistant can read `agentHandle()` tags; that determines the whole approach.
5. **Custom/S3 provider backend** — spec is complete, prerequisite shipped, just needs dispatching. Do NOT touch `apps/admin` if UI work is concurrent.
6. **A1 real publish** — owner decision, irreversible.
7. Push the 24 unpushed commits.

---

## Handoff Contract

- **Inputs:** the session conversation; `git status`/`log`/`show --stat` on all 34 commits; independent re-runs of the C1–C4, A2–A4, workspace-coverage, and Dockerfile suites; the real ESLint gate; direct `sqlite3` queries against `infra/content.db`; owner screenshots.
- **Output:** the publish-credential vertical proven end to end short of a real publish; four races fixed; Dockerfile lost-update closed; the coverage worklist completed; a complete custom-provider contract with its cross-package prerequisite shipped; the Static Site tab redesigned once cleanly and once WIP.
- **Risks:** one red test file at HEAD (deliberate, explained); no real publish has ever run; Source Control scope undecided; the assistant's ability to read page tags is unverified.
- **Suggested next assignee:** web-design agent for U1–U3 and the red tests (it now implements by default); then Coordinator to confirm Source Control scope with the owner.
