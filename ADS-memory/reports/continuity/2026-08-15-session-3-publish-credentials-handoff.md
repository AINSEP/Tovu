# Handoff — session 3: publish credentials, the UI that still needs design, and the custom provider

Generated: 2026-08-15 (evening)
Session: Coordinator (Claude Opus 5, 1M) + 7 Sonnet subagents + 1 Terra 5.6 xhigh peer review
Branch: `general-work`, ~500 commits ahead of `origin/main`, **nothing pushed**

> **The point of this feature, in the owner's words:** *"a user using this admin section to drive
> everything"* — they enter access tokens in the admin UI, those persist to the database, and **the
> AI assistant in the admin uses them to drive deployment.** Not env vars. Not the CLI. Not the
> operator's shell. Anything that solves it another way is missing the point.

---

## Next-Agent Prompt

```
Read AI-Dev-Shop/AGENTS.md, then this handoff.

Do NOT re-derive: the sealed-credential design, the four-provider set, Contract v2's connection
union, or the tri-state slug work. All settled and recorded.

Two things are queued and NOT started: the UX pass on the Static Site tab (owner: "it looks just
awful"), and the CUSTOM PROVIDER tab. Both are described below with the owner's own requirements.

Messages to running agents DO NOT DELIVER in this harness. Put everything in the spawn prompt.
```

---

## What the owner asked for that is NOT built

### 1. Custom provider — the last tab. Not started.

The owner's requirement, verbatim in intent: *"if it's not one of these — GitHub Pages, Vercel,
Netlify, Cloudflare — we need a way that they can just add it. So custom providers, the last tab,
and that should have, like, the base URL and then the access token."*

Shape: a fifth tab after the four built-ins, whose credential is **base URL + access token** rather
than a provider-specific field set.

**Open design question that must be answered before building.** Session 2 recorded that
custom/any-provider was "impossible" under the no-CLIs-in-Docker decision, on the reasoning that a
custom host would need its own CLI. A base-URL + token adapter is a different proposal and that
objection may not apply — but "base URL + token" does not by itself say *what HTTP calls to make*.
A deploy is not one request. Before implementing, decide which of these it is:

- a **generic contract** the custom host must implement (Tovu POSTs files to a documented endpoint shape)
- a **known-protocol adapter** (e.g. anything Netlify-API-compatible, S3-compatible, or WebDAV/SFTP)
- a **passthrough** where the base URL is a webhook Tovu notifies after export, and the host pulls

These have very different costs and very different failure modes. Do not start coding until the
owner picks one. `2026-08-15-session-2-unfinished-work-handoff.md` §"Settled" has the Docker
context that constrains it.

### 2. UX pass on the Static Site tab. Owner: *"it looks just awful."*

A dedicated UI/UX agent is to go over this whole tab. Known specifics the owner named:

- **"Publish directly from here" is not self-explanatory.** It is the *publish target* — where this
  particular publish goes (owner/repo/branch for GitHub Pages) — as opposed to the credential, which
  is *who you are*. Nothing on screen says that. Rename and explain it.
- **The `Project name` field means two different things.** It renders for every provider and its own
  `agentHandle` label admits it: *"becomes the commit message or Vercel project name."* On a GitHub
  Pages publish the user is asked for a "Project name" that is actually a commit message.
- **Layout generally.** The tab now stacks: CLI recommendation → credential section → publish form,
  with a nested `<details>`. The owner finds it hard to read.

### 3. The real publish has never been run

No token has ever been used to deploy anything. Every green test either mocks HTTP or explicitly
avoids the network — `static-site-tab-credentials.spec.ts`'s own header says *"This suite never
reaches the real internet."* The credential CRUD is proven; **the publish path is not.**

Both of the owner's tokens were verified to authenticate (read-only calls, 2026-08-15):

| Provider | Result |
|---|---|
| Vercel `/v2/user` | **200** — `leonaburime-8834`; projects: `hawke-media-leon`, `aifolio-angular`, `aifolio`, `aifolio-vue` |
| GitHub `/user` | **200** — `leonaburime-ucla`; fine-grained PAT (no `x-oauth-scopes` header) |

When the real publish is run: use a **new** project name (e.g. `tovu-publish-test`), never one of
the four existing Vercel projects. There is no draft step — it is live on the public internet the
moment it finishes. GitHub Pages additionally needs that fine-grained PAT to carry **Contents: write
+ Pages: write** on the target repo, which is a second independent failure point.

---

## What shipped and is verified

- **`publish_credential_sets`** — sealed with AES-GCM, per-row AAD bound to
  `workspaceId + providerId + credentialSetId`, keyed `(workspace_id, id)`, UNIQUE
  `(workspace_id, provider_id, label)`, `is_default` per provider. Migrations `0040` + `0041`.
- **CRUD routes** `GET/POST/PUT/DELETE .../system/publish/credentials` (`ef6fc56`).
- **All four providers** reach the publish adapter (`8cad6b0`) via Jini's existing tested REST
  adapters. `STATIC_PUBLISH_TARGETS` and `PUBLISH_CREDENTIAL_PROVIDERS` are now alias-locked to the
  same id union so they cannot drift again.
- **`describeCredential`/`listPublishCredentials` never decrypt**; `resolveForPublish` is the only
  decrypter. The publish *preview* used to decrypt a real credential just to return a boolean —
  split in `deea97d`, with a `resolveCallCount` regression test.
- **Sealer AAD** is now optional per call (`b77252f`), so the two pre-existing sealed tables keep
  opening unchanged while the new table binds AAD.
- **Env-var aliases** for the vendor-official names (`76b0705`).
- **4/4 e2e** through real routes: create, reload, edit, delete, a real 409 on duplicate label, and
  github-pages-is-token-only.

## In flight at handoff time

- `CredUxFlatten` — replacing the add/edit/list credential UI with one always-visible row per
  provider: no **Add credential** button, no provider `<select>`, **no Label field** (owner:
  *"why is there a label there? that's completely useless"*), hints moved below inputs so nothing
  reads as pre-filled.
- `AssistantPublishWiring` — building `deployment_get_static_publish_capabilities` and **wiring
  `deployment_execute_static_publish`**, gated behind approval.

---

## Two corrections the Coordinator got wrong, recorded so they are not repeated

1. **The execute tool was kept unwired across five briefs.** `deployment_execute_static_publish` was
   declared but listed in `UNWIRED_STATIC_PUBLISH_TOOL_IDS`, carried forward from an earlier design
   where publishing was judged too irreversible to hand an agent. That directly defeats the stated
   purpose of the feature. Gated ≠ disabled; it should have been gated from the start.
2. **The credential union initially duplicated the publish config.** GitHub's `owner`/`repo` and
   Vercel's `teamId` already live on `GitHubPagesPublishConfig`/`VercelPublishConfig`
   (`static-publish/types.ts:38-49`). Putting them in the credential too created a "which copy wins"
   bug, and Netlify `siteId`/Cloudflare `projectName` were invented for hooks Jini does not have.
   Corrected to: token only, plus Cloudflare's `accountId`.

---

## Harness traps that cost this session real time — read before dispatching anything

1. **Messages to running agents DO NOT DELIVER.** Three agents reported "no pushback received" while
   the send reported success. **The spawn prompt is the only reliable channel.** Change scope by
   checkpoint-commit → stop → respawn.
2. **`TaskStop` kills only ONE task when several share a name**, and still reports success. Two
   ghost agents kept writing old-contract code next to their replacements for ~15 minutes. **Call
   `TaskStop` repeatedly until it errors** — the error also lists every live teammate.
3. **A detached worktree always blocks peer-CLI dispatch.** `AI-Dev-Shop/` is gitignored so it is
   absent from every worktree, while tracked root `CLAUDE.md`/`AGENTS.md` tell the peer to stop.
   `<<PEER_DISPATCH>>` + `--ignore-rules` did not prevent it. Exit code was **0** with zero errors —
   it reads as success. Fix: delete both files from the throwaway worktree *and* say so in the packet.
   Correct model id is `gpt-5.6-terra` with `-c model_reasoning_effort="xhigh"`.
4. **`npm run dev:server` is `tsx watch`** — every agent save restarts the owner's dev server, and a
   non-compiling tree kills it. The owner sees a wall of `ECONNREFUSED` from Vite. Agents must never
   leave `src/` non-compiling across a gap.
5. **`.env` OVERRIDES exported shell variables.** `development/scripts/dev.mjs:44-50` uses
   `process.loadEnvFile`, which re-reads over anything already exported. A stale token written to
   `.env` silently beat the owner's freshly-rotated exported one.
6. **A throwaway Playwright config must live inside `development/`** — the committed configs restrict
   `testMatch`, and a config in a temp dir outside the repo fails module resolution.

---

## Still open / pre-existing

- **Terra 5.6 xhigh review of the session-2 range** is committed at
  `ADS-memory/reports/external-audit/runs/2026-08-15-terra-xhigh-deployment-slug-code-review.md`.
  **7 CONFIRMED findings, none fixed yet.** The two that matter most both sit in
  `use-static-publish.hooks.ts` and will bite during the first real publish:
  a delayed initial status GET overwrites a run you just started and stops polling it; and poll
  errors retry forever behind a stuck spinner with no actionable error.
- The slug backfill ran with `--apply` (58 rows `false` → `NULL`, 2 explicit `true` preserved).
  Terra flagged a false-negative in its collision heuristic; the mitigating fact is that the old
  column was `.notNull().default(false)`, so "deliberate false" and "never touched" were never
  distinguishable in the data. Pre-backfill DB copy exists in the session scratchpad.
- **Nothing is pushed.** ~500 commits local only.
- Untracked debris in the repo root: ~35 loose `.png` screenshots now (several added this session),
  `explore-snapshot.md`, `ops/database-journal.db`.
- Five stale git worktrees from earlier sessions are still registered, pointing at scratchpad paths
  that may not exist. `git worktree prune` is safe.
- Pre-existing failures, not caused here: 6 in `post-template-site-serving.test.ts`, 5 in
  `assistant/__tests__/database-recovery.test.ts`, 2 in `menus.test.ts`, ~20
  `Mock<Procedure|Constructable>` tsc errors in `apps/admin`.

## Handoff contract

- **Inputs:** the session conversation; `git log`/`status`/`show`; one Terra 5.6 xhigh peer review on
  a frozen worktree; seven Sonnet subagents; live read-only calls to the Vercel and GitHub APIs.
- **Output:** the sealed publish-credential vertical end to end — table, migrations, store, CRUD
  routes, four-provider adapter wiring, admin UI, e2e — plus a committed external code review.
- **Risks:** the publish path has never made a real provider call; the assistant still cannot execute
  a publish as of this writing; the Static Site tab needs a real design pass; custom provider is
  unspecified.
- **Next assignee:** UI/UX agent for the tab, then Software Architect for the custom-provider contract.
