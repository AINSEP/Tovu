# Handoff — session 5: Source Control shipped, agent page-control PROVEN, scroll bug root-caused

Generated: 2026-08-15 (late night)
Source: Coordinator (Claude Opus 5, 1M) + 5 Sonnet subagents
Target: Claude Code, same repo
Branch: `general-work` · **44 commits pushed** · working tree clean · **all agents stopped**

> Everything is committed AND pushed to `origin/general-work`. Nothing is mid-flight. `git status`
> shows only two untracked items that predate this session and belong to nobody: `explore-snapshot.md`
> and `ops/`.

---

## Next-Agent Prompt

```
Read AI-Dev-Shop/AGENTS.md, then this handoff.

START AT "DO THIS FIRST". All three items are owner-DECIDED — do not re-ask, just build.

Do NOT re-derive: whether the assistant can read agentHandle tags (YES, proven live end to end,
see "The verified capability"), the source-control table decision, the fine-grained-token
decision, or the Bitbucket API-token decision. All settled with evidence below.

Test runners: root `src/**` uses node:test (`node --import tsx --test`), apps/admin uses vitest.
`npx vitest` at the repo root FAILS — there is no root vitest binary.

Messages do NOT reach a subagent mid-run. Put everything in the spawn prompt. Confirmed again
this session: 2-for-2 delivered to an IDLE agent, 0-for-2 to a WORKING one, same tool, minutes
apart. Stop-and-respawn only at a commit boundary, and check `git status` first.
```

---

## DO THIS FIRST — three owner-decided items, none started

### U1 — Bitbucket must collect the ATLASSIAN ACCOUNT EMAIL, not the Bitbucket username

**This is a real defect in shipped code, not a preference.** Bitbucket API tokens take *different
identities for different operations*:

| Operation | Identity required |
|---|---|
| Git (clone/push) | Bitbucket *username* + token, **or** the static `x-bitbucket-api-token-auth` |
| REST API (list repos, read profile) | Atlassian account **email** + token |

`apps/admin/src/features/source-control/` currently asks for the Bitbucket username. Fine for
pushing — but **the repo picker (U3) lists repos over REST**, so Bitbucket breaks at exactly the
next feature.

**Owner's decision: collect the email.** It is strictly more capable, because the static
`x-bitbucket-api-token-auth` covers git without needing the username at all. One field, both paths.

- Rename the field and its key throughout: the `lib/api.ts` connection-input type, `rules.ts`, the
  store/route/repo validation, the component, the tests.
- Label/hint should say Atlassian **account** email and point at Email Aliases in Bitbucket personal
  settings — that is where people find it, and it is often not the email they expect.
- Validate as an email, not an opaque string: a wrong value here fails later with an opaque REST 401
  instead of at save time.
- **Record in a doc comment that git auth uses the static `x-bitbucket-api-token-auth` username.**
  This is load-bearing — without it the next reader assumes the username field was forgotten.
- Update all 21 locale dictionaries.

Source: <https://support.atlassian.com/bitbucket-cloud/docs/using-api-tokens/>

### U2 — GitLab: add the Maintainer-role requirement to the scope copy

Creating a GitLab **project** access token requires the **Maintainer** role (verified live). It was
left out to keep copy short; the owner wants it in. Without it a user discovers the requirement only
after leaving Tovu, opening GitLab, and failing. One short clause, not a paragraph.

### U3 — Repo picker (owner-approved dispatch)

Replace the manual `GITHUB OWNER OR ORG` / `REPOSITORY` text inputs in step 2 of the Static Site tab
with a picker populated from the user's own account. Owner's words: *"get my profile and fill it in
for me and save."*

**Split it in two — this is the key design finding:**

1. **Fetching the repo list is an ordinary server-side feature.** Call the provider's REST API with
   the saved credential. `page.*` has no channel for this and nothing in the owner's ask implies it
   should. Build a normal route under `src/server/routes/admin/system/`.
2. **Driving the resulting UI needs ZERO new agent tooling.** Once the picker exists and is tagged
   the normal way with `agentHandle()`, `page.find_elements` / `page.fill` / `page.click` already do
   it. This is proven, not assumed — see below.

Decide which credential it reads: the existing `publish_credential_sets` `github-pages` row (the
picker lives in the publish flow) or the new `source_control_credential_sets` row. Both exist.

---

## THE VERIFIED CAPABILITY — the assistant CAN read and drive admin pages

Previously recorded as UNVERIFIED. **It is now proven end to end, live.** Full evidence:
`ADS-memory/reports/2026-08-15-agent-page-control-readpath-verification.md` (+ its addendum).
Live spec: `development/e2e/agent-page-control-live-verification.spec.ts` with its own config on
ports 7911-7913.

Three escalation levels, all passed:

1. **DOM driver against the real hydrated SPA** — tags resolve with correct roles. The React-state
   question (does a synthetic write reach React or only the DOM?) was settled by checking a
   *state-derived* side effect: the Save button's `disabled` gate, computed from real React state,
   flipped and stayed flipped after a render tick.
2. **Transport** — the real bundled admin JS opens the SSE stream on its own after login, and the
   daemon returns a real `{type:"attached", sessionId, bindToken}` frame.
3. **Full round trip** — a real spawned `claude` CLI process called `page.find_elements` through the
   real `POST /api/delegated-tool-calls` and got back the actual live value typed into the real
   publish-owner field.

**Scope caveat, disclosed not buried:** at level 3 the test harness stands in for the bundled
`FrontendSessionBridge` (which lives inside a React closure a test process cannot reach). It is a
faithful re-implementation with identical attribute names and read semantics, and level 1 proved that
technique matches the real driver on this exact page. Every link is verified; one by a faithful
stand-in.

**Credential values are safe** — verified against the real installed package, not its comments.
Four independent layers in `@jini-ai/agentic`: `DENIED_TYPES = {password, hidden, file, image}`
(`guards.ts:41`), denied autocomplete tokens (`current-password`, `one-time-code`, all `cc-*`),
name/id substring matching normalised so `api_key`/`api-key`/`apiKey` all catch, and a **fail-closed**
default when attributes are missing (`page-executor.ts:172`). Tovu's token inputs are
`type="password"`, so an agent sees the field and its label but **never its value**.

---

## Completed and verified this session

Coordinator independently re-ran or re-measured every row — these are not agent claims.

| Work | Evidence |
|---|---|
| **U1–U3 Static Site bugs** (CLI contradiction generalised to all providers, expand affordance, "saved" not "updated") | `cd8c4486`, `0c7193fc` |
| **11 red tests rewritten** to the numbered-step contract + regressions | `0c7193fc` — re-ran 184/184 |
| **`credentials-section` agent tag restored**, asserted in all four render states | `94e3ac38` |
| **Phantom document scroll FIXED** (see below) | `116a1743` — 4-test e2e suite, verified RED first |
| **Deployment moved under Recovery** in Operations | `9acc3f82` |
| **Custom/S3 provider — all 8 spec steps** | `23275cd7` `fcf19238` `c2e5e5e5` `7c534c9a` — re-ran 183/183 + 10/10, typecheck clean |
| **Source Control page** (13 files, flat rows, no tabs) | `713e2424`, `ac02c83f` — 43 tests |
| **Source Control backend** (`source_control_credential_sets`, migration 0042) | `fd2fbcd9` — 43 node:test |
| **Fine-grained token copy** + 21 locales | `aab41024` |
| **`lib/api.ts` fold-in** — verified **0 removed lines** | `8d6057e2`, `f338db60` |
| **Agent page-control verification** | `d953c43e`, `a1e1ee00`, `19d12609` |
| **Security page backlog entry** | `eaa25353` → `development/todos.md` |
| **AI-Dev-Shop toolkit: 3 commits pushed** to its own repo | `1136937` `63b1e03` `0c8d890` |

---

## The scroll bug — root cause worth remembering

Owner: *"there's a scroll issue where if I go down there's a bunch of white space."*

`.visually-hidden` (ONE global rule, 22 uses across 8 components) was `position: absolute` with **no
`top`/`left`**, so its offsets resolved against its *static* position, measured in its containing
block — which is the **initial containing block** whenever every ancestor is `position: static`.
`.tab-bar-item` is a plain `<button>`, so TabBar's accessible `", Connected"` suffix computed
`top: 1049.67px` and stretched the document to 1050px inside a `height:100vh` shell.

**Two things that make this worth re-reading:**

1. **The obvious fix does not work.** `html, body { overflow: hidden }` was measured live and left
   document scroll at 341px. `.admin-content`'s `overflow-y: auto` could not clip it either — a
   static ancestor is not a containing block, so the span was never inside that scroll box at all.
   Fix is `top: 0; left: 0` on `.visually-hidden`.
2. **The first version of the regression test passed WITH THE FIX REVERTED.** The production trigger
   is a saved publish credential, and the hermetic `TOVU_DB=memory` server has none — so the
   offending span never rendered and green meant "this database is empty". The committed spec injects
   the DOM shape directly and depends on no seeded state. A fourth test guards the wrong fix by
   asserting both real scrollers still overflow.

---

## Constraints and traps — do not rediscover

1. **TWO test runners.** Root `src/**` = `node:test` (`node --import tsx --test "src/features/x/**/*.test.ts"`). `apps/admin` = vitest. **`npx vitest` at the root fails** — no root binary. Scoped runs only; standing owner instruction.
2. **`apps/admin` complexity gate is `error`/9, per-scope** (`eslint.config.mjs:163-179`). `noInlineConfig` is set — **eslint-disable comments DO NOT WORK.** Extract helpers. `lib/api.ts`'s own `request()` sits at 12 as grandfathered debt; do not copy that shape.
3. **`lib/api.ts` is a guaranteed contention point.** Every feature's wire types AND fetch methods live there behind one private `request<T>()`. Any feature needing live data must touch it. **Name it explicitly in every dispatch boundary** — two agents hit this today.
4. **A new spec in `development/e2e/` is silently adopted by unscoped sibling configs.** Every spec needs its own config with its own `testMatch`. Ports used this session: 7881-7883 (admin-shell-scroll), 7911-7913 (agent-page-control).
5. **`AI-Dev-Shop/` is its own git repo** with its own remote (`leonaburime-ucla/AI-Dev-Shop`). It is gitignored by Tovu because of that, NOT because it is uncommittable. Toolkit changes commit and push there.
6. **Concurrent agents share ONE git index.** Verify `git diff --cached --name-only` before every commit, `git show --stat` after.
7. **`schema.postgres.ts` drifts.** It was already out of sync with `schema.ts` at HEAD before this session (`publish_credential_sets` missing). Run the committed generator; never hand-edit.
8. **Bitbucket app passwords were permanently REMOVED 2026-07-28.** Any doc or brief saying "app password" is stale. API tokens are the only mechanism.

---

## Coordinator errors this session

1. **Sent two decisions to a working agent via `SendMessage`; neither arrived.** It built a complete 13-file frontend slice with the wrong security copy and no backend, waiting on answers already sent twice. I had this failure mode in memory and used the unreliable channel anyway. Cost: one respawn.
2. **Briefed "app password" for Bitbucket** — a mechanism deleted three weeks earlier. Caught by the agent fetching live docs and flagging the deviation rather than complying.
3. **Told the owner a GitHub App would be "a much larger build"**, which would have pushed a security decision on a false premise. `providers/github.ts` already implements full App auth — JWT minting, installation tokens, pinned origin, tested — with **zero callers outside its own tests**. Corrected before the owner decided.
4. **Wrote a regression test that passed against the unfixed code** (see the scroll bug above). Caught by running RED-first rather than trusting green.

(2) and (3) were caught by evidence, not by me. The standing lesson: measure, and let agents contradict the brief.

---

## Still open, not started

- **A1 — a real publish has still NEVER run.** Irreversible, live, no draft step. Use a NEW project name (`tovu-publish-test`). GitHub Pages needs a fine-grained PAT with Contents: write + Pages: write.
- **Security credential-inventory page** — spec'd in `development/todos.md`. Read + remove only, never a second entry point; the control says **"Remove from Tovu"**, never "Revoke", because deleting Tovu's row does not revoke the credential at the provider.
- **Wire the existing GitHub App provider.** Implemented, tested, zero callers. The expensive cryptographic half is done; what is missing is a registered App, a callback URL, and an install flow.
- **Terra C6/C8**, **D1 Docker build never succeeded**, **D3/D4/D5** (Full Site deploy, provider registry, BYOK surface) — all untouched, carried from session 4.
- Pre-existing, not ours: 41 `Mock<>` typing errors in `apps/admin` typecheck across ~20 features.

---

## Handoff Contract

- **Inputs:** the session conversation; independent re-runs of the deployment, deployments, source-control, and mcp-ui suites; direct `git show`/`git diff` verification of every agent claim relayed; live Playwright measurement of the scroll defect; Atlassian's own current docs; the real installed `@jini-ai/agentic` guard source.
- **Output:** three owner-reported UI bugs fixed; a phantom document-scroll defect root-caused and pinned; the Custom/S3 provider completed; the Source Control page shipped frontend-to-database; and the agent page-control read path proven live end to end.
- **Risks:** Bitbucket's identity field is wrong for REST until U1 lands; no real publish has ever run; the level-3 verification used a faithful stand-in for the bundled bridge.
- **Suggested next assignee:** web-design agent for U1/U2 (small, visible, copy + field), then a fresh agent for U3's server-side half before its UI half.
