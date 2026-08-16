# Handoff — session 6: A1 SHIPPED, three providers' false-negative fixed, source-control tools wired

Generated: 2026-08-16
Source: Coordinator (Claude Opus 5, 1M) + 6 Sonnet subagents + 1 Terra (gpt-5.6-terra xhigh) peer audit
Target: Claude Code, same repo
Branch: `general-work` · **31 Tovu commits + 7 Jini commits** this session

> Jini is a SEPARATE repo with its own remote. Report its SHAs separately. Its
> `packages/plugins/samples/agent-plugins/ui-ux-design/` deletions are INTENTIONAL (owner
> confirmed) — do not revert them.

---

## Next-Agent Prompt

```
Read AI-Dev-Shop/AGENTS.md, then this handoff.

Do NOT re-derive, all settled with evidence below:
- A1 is DONE. The site is LIVE. Older handoffs calling it "never run" are stale.
- Playwright CAN drive a sandboxed MCP-UI surface; the in-page agent CANNOT. Sandbox stays.
- The Security page is READ + REMOVE only, never a second place to enter a token.
- Terra finding #5 (S3 "leaks raw body") was REFUTED. Do not action it.

Test runners: root `src/**` = node:test (`node --import tsx --test`), apps/admin = vitest.
`npx vitest` at the repo root FAILS. Run test globs from the REPO ROOT over the whole
directory — a narrower path flatters the number, which is how two reports went wrong today.

Messages do NOT reach a working subagent. 3-for-3 undelivered this session; all landed only
after the agent went idle. Put everything in the spawn prompt.
```

---

## SHIPPED AND VERIFIED

Every row below was re-run or re-read by the Coordinator. These are not agent claims.

| Work | Evidence |
|---|---|
| **A1 — the first real publish, ever** | **LIVE: https://leonaburime-ucla.github.io/tovu-demo/** — 200, `gh-pages`, 36 files, `.nojekyll`, build `built`, every link rewritten to `/tovu-demo/`. Driven end-to-end by the AI assistant through the human gate. |
| **False-negative publish reporting — 3 of 4 providers** | GitHub `eaa1a7d8`, Vercel + Netlify `73ae1910` (Jini). 241/241 in `packages/devops`, re-run by Coordinator. |
| **Credential verification is real** | `c7af2422` — `valid`/`invalid`/**`unreachable`** replaces "a row exists". 78/78 + 45/45 + 11/11, tsc clean. |
| **MCP-UI dialog fixed AND live-verified** | Jini `07113b07`, `1bc8813b`; Tovu `8a1f0c48`. Before: `actuallyVisible:false`, buttons covered. After: 94px clearance. Screenshots in `development/e2e/.artifacts/`. |
| **Terra finding #1 — assistant publish had NO single-flight guard** | `e754ade6` + new `static-publish/publish-run.ts`. Test drives the HTTP route AND the tool against one `deps` object. |
| **Terra finding #2 — "Never throws" contract made true** | `7aa04821` |
| **Source Control page restructured** | `eca3a010`, `3a1a0bac` — page-header + TabBar like Deployment, not a settings card. 46/46. |
| **`source-control` is now a registered assistant domain** | `2acf8436`, `38679408` — `source_control_get_capabilities` + `source_control_execute_commit` (MCP-UI gated). 54/54. It was NOT a domain this morning. |
| **Two stale test assertions fixed** | `3c9665ed` (provider count 4→5), plus the guidance-wording one |

---

## DO THIS FIRST

### 1. The commit path is half-built — finish the GitHub adapter

`source_control_execute_commit` is wired and gated, proven against a **fake** adapter. The real
Git Data API adapter (`gitAdapter` seam) is NOT built. Requirements already decided:
- **No `force`.** `DIVERGED_BRANCH` on non-fast-forward. The publish adapter DOES force-push; copying
  it is the easy mistake. Its `gh-pages` is a disposable artifact, a user's history is not.
- `NETWORK_UNREACHABLE` vs `PROVIDER_ERROR` at two distinct catch sites.
- Anything read AFTER the ref updates must not report a hard failure on a parse error — that is
  exactly the bug `eaa1a7d8` fixed.

**BLOCKER, and it is the owner's to clear:** `source_control_credential_sets` is EMPTY. The publish
token lives in a DIFFERENT table (`publish_credential_sets`, provider id `github-pages`, not
`github`). **No agent may acquire a token** — not from the shell profile, not from `gh auth token`.
The owner saves a real PAT through the Source Control page when they choose to.

### 2. Source Control page still reads as "a lot of text" (owner, twice)

Structure is fixed; DENSITY is not. Three provider rows all expanded, each with a subtitle, an
encryption note, and a long scope-guidance paragraph. A density pass was in flight at session end —
check `ADS-memory/reports/2026-08-16-source-control-ui.md` for where it stopped.

The owner's earlier "make scope guidance prominent" decision is **superseded** by their objecting to
text volume twice. Guidance must stay reachable, not be the default view.

### 3. Security page (credential inventory) — DECIDED THIS SESSION, scope changed

Full spec: `development/todos.md:1208`. **Eight** sealed-credential stores exist; five admin screens
already accept a token; nothing can answer "what secrets does this install hold."

**The 2026-08-15 spec said READ + REMOVE ONLY. That is now SUPERSEDED — it must also REPLACE.**

The owner raised the argument that settles it and that the original spec never considered:
**rotation**. When a token is revoked, the operator needs ONE place to put the new one, not a hunt
across however many screens hold it. The Coordinator initially defended read-only on
"two entry points is the which-row-is-authoritative bug" and was **wrong** — that objection is about
COPYING a secret into multiple stores, not about rotating the one that exists.

The resolved split, and the distinction is load-bearing:

| Action | Where | Why |
|---|---|---|
| **Create** a connection | The feature flow that needs it (Static Site, Source Control) | Task-shaped. Also preserves the Static Site redesign that deliberately pulled the credential OUT of a disclosure into Step 1 — three passes were paid for that. |
| **Replace / rotate** a token | **Security page** | Cross-cutting. One door for a revoked-token emergency. |
| **Remove** a credential | **Security page** | Cross-cutting. |

**Replace is NOT a second entry point.** It edits the SAME row the feature page owns — no new row is
created, so there is no authoritative ambiguity. That is what makes this safe where a second Create
form would not be.

Still true from the original spec: the control says **"Remove from Tovu"**, never "Revoke" — deleting
Tovu's row does not revoke anything at the provider. And a complete inventory means reading all eight
stores, two of which (BYOK, Composio) are already flagged broken — either confront them or say on
screen that the list is partial rather than showing a subset as if it were everything.

---

## Still open

- **Terra finding #3** — `publish-credentials/store.ts:310`, default-credential invariant on a provider
  change. **NOT verified by the Coordinator.** Confirm or refute with a test before acting.
- **Terra findings #6, #7** — architecture back-edge, and a `as unknown as` double cast in
  `byok-tool-surface.ts:276`. Unverified.
- **Terra coverage was ~1/5** of the requested scope, and `apps/**` has had NO audit at all.
- **Publish-credential reuse** into Source Control — **NOT BUILT AT ALL.** Verified at session end:
  there is no button and no server route, only doc comments in `ProvidersTab.tsx:179` describing
  where the affordance would go. `8b7556ff` sounds related and is NOT — it only adds
  `resolveDefaultForSourceControl`, source control reading its own credential. The owner was told
  this was coming and nothing shipped; do not let the seam comment read as a partial implementation.
  Note the `"github-pages"` vs `"github"` providerId mismatch a naive reuse gets silently wrong.
- **`McpUiHost` caps height without clipping** — latent, deliberately unfixed. Anyone setting
  `maxHeight` below 720px hits visible overflow. Cost a real regression today (`8a1f0c48`).
- **Cloudflare** — narrower single-shot exposure of the non-JSON bug, assessed and deferred; 14
  `readCloudflareJson` call sites unaudited.
- **Complexity threshold stays 15.** At 10 it is 336 complexity-family violations vs 141 today; owner
  deferred the ~195 in the 10-15 band. Worst offenders (cyclomatic 76, 58, 52, 51) breach 15 anyway.
- Terra C6/C8, D1 Docker, D3/D4/D5 — untouched, carried from session 4.

---

## Traps — do not rediscover

1. **Messages do NOT reach a working subagent.** 3-for-3 undelivered. Everything in the spawn prompt;
   stop-and-respawn at a commit boundary instead.
2. **Concurrent test runs collide on a fixed fixture-DB name** and produce failures that look exactly
   like real regressions. Cost the Coordinator a wrong RED call and an unfair accusation. **Isolate
   before diagnosing** — a detached `git worktree` with symlinked `node_modules` is the instrument.
3. **The shared-index race is real and a pre-check is NOT sufficient.** Three agents hit it: a clean
   `git diff --cached` still swept in another agent's file committed in the same second. **Post-check
   every commit with `git show --stat`**; recover with `reset --soft HEAD^` + `restore --staged`.
4. **Vite's dep pre-bundle cache goes stale for `file:` deps.** Version never changes, so vite never
   invalidates. A Jini `dist` rebuild is invisible at :5173 until `apps/admin/node_modules/.vite` is
   deleted. Deleting it under a running vite is safe — it re-optimizes on its own.
5. **`apps/admin/src/**` is served from SOURCE, never pre-bundled.** Admin UI changes are never a
   caching problem. Do not blame vite for a page that looks wrong.
6. **`@jini-ai/ui` IS in the running daemon's import graph** (`demo-choices-tool.ts`,
   `component-catalog-query.ts`, `deployments/publish-agent-tools.ts`). A package-scoped `npm run build`
   is safe on a running process (Node caches resident modules; `tsx watch` ignores `node_modules`), but
   `pnpm -r build` is not the way.
7. **Test files are excluded from `tsc`** (`tsconfig.json` excludes `**/__tests__/**` and `**/*.test.ts`),
   and an ESLint parse error silently skips a whole file. Invalid TypeScript can live in a test forever.
8. **A peer auditor's "PROVEN" is a claim.** 1 of 4 spot-checked Terra findings collapsed — it dropped
   a `.slice(0, 300)` from its own evidence quote and then faulted a comment for a claim it never made.

---

## Coordinator errors this session

1. **Called a test suite RED without isolating.** Three agents were running concurrently; the failures
   were a fixture collision. I then told the owner an agent's "37/37 green" was false. It was probably
   true. Only "everything committed" was genuinely false. The fresh agent refused to build on my
   premise and reproduced 78/78 three ways — that pushback was the right call and I was wrong.
2. **Briefed the Source Control UI tentatively** — "consider… propose rather than assume" on density,
   and an explicit "NOT yours to build" on reuse. Got exactly what I asked for, which was not what the
   owner wanted. The agent did nothing wrong; the instruction did.
3. **Blamed vite for the Source Control page.** `apps/admin/src/**` is never pre-bundled. The stale
   cache was real but affected only the Jini-package fixes. The owner caught this.
4. **Dropped the AGENTS.md communication protocol** — no `AgentName(Mode):` prefix for most of the
   session, until the owner noticed and asked whether I was even the Coordinator.
5. **Defended read-only on the Security page against the wrong argument.** My objection ("two entry
   points is the which-row-is-authoritative bug") is about copying a secret between stores; the
   owner was asking about ROTATING the one that already exists. Different problem, and rotation is
   the strongest argument in that whole discussion. The original spec never considered it either.
6. **Told the owner reuse was "in progress"** when the server half was never started. I mistook
   `8b7556ff` for related work. Verified false at session end.

(1), (3), (5) and (6) were caught by evidence or by the owner, not by me. Same standing lesson as
session 5, now with more supporting data: measure, and let agents and owners contradict you.

---

## Handoff Contract

- **Inputs:** the session conversation; direct re-runs of the devops, static-publish, deployments,
  source-control, and route suites; `git show`/`git diff` verification of every relayed claim; live
  headed-Playwright measurement of the publish flow and the MCP-UI surface; the GitHub REST API for
  every publish assertion; one Terra xhigh audit against a frozen worktree snapshot.
- **Output:** A1 closed with a live site; the false-negative publish-reporting bug fixed on three
  providers; credential readiness made honest; the MCP-UI dialog fixed and live-verified; two Terra
  findings fixed; Source Control restructured and its assistant tool domain wired.
- **Risks:** the commit adapter is unbuilt and untestable until the owner saves a PAT; Terra findings
  #3/#6/#7 are unverified; audit coverage is ~1/5 with `apps/**` at zero; the Source Control page is
  still too dense by the owner's own read.
- **Suggested next assignee:** Programmer for the GitHub commit adapter (stubbed-fetch only until the
  owner supplies a credential), then web-design for the density pass, then a fresh Terra dispatch with
  explicitly named target directories — it gravitated to the publish subsystem because that is where
  it was given worked-example context.
