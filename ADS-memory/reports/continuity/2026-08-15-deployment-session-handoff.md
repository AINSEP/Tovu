# Handoff: deployment shipped end-to-end, plus two outages fixed

Generated: 2026-08-15
Session: Coordinator (Claude Opus 5, 1M) + 7 Sonnet/Opus subagents, Claude Code on darwin
Branch: `general-work`, **nothing pushed**

## Next-Agent Prompt

```
Read AI-Dev-Shop/AGENTS.md, then development/docs/agents/subagent-dispatch-protocol.md
(mid-flight messages to subagents DO NOT ARRIVE — this is not optional reading before
dispatching anything), then this handoff, then
ADS-memory/reports/2026-08-15-deployment-build-session-findings.md.

Deployment now works end to end from a terminal and a live GitHub Pages test succeeded.
The open work is listed under "Do this first" below. Do not re-derive the three-unwired-
layers finding or the product decision — both are settled and recorded.
```

## What now works, proven

**A real static site was published to GitHub Pages and verified live.**
`https://leonaburime-ucla.github.io/tovu-demo/` — `/`, `/about`, the theme CSS, `sitemap.xml`
and `robots.txt` all `200`; an unknown path `404`s through the custom `404.html`.

The chain, all built today:

```
tovu init                                   →  seeded demo site
tovu export <dir> --base-path /tovu-demo    →  25 files, links rewritten
+ .nojekyll                                 →  stops Jekyll eating underscore paths
git push + gh api …/pages                   →  live
```

**Delete the test site when done:** `gh repo delete leonaburime-ucla/tovu-demo --yes`.
Standalone public repo, unconnected to `Tovu-AI-CMS`.

## Do this first

1. **Register the publish tools — one line, and it is the only thing left on that feature.**
   Add `buildStaticPublishRegistrations` / `staticPublishDerivedRisk` from
   `src/features/deployments/publish-agent-tools.ts` as one slice in `DOMAIN_SLICES`
   (`src/assistant/tool-registrations.ts`), imported like every other domain. Nothing in the
   publish module needs to change. It was left undone deliberately: that file was owned by a
   concurrent agent.

   `PublishTargets` reported after this handoff was first written, and **I verified its three
   security-relevant claims directly** — they hold:
   - **Redirect guard is real and lives in Jini**, not as a Tovu workaround: `redirect: 'manual'`
     + `assertNotRedirected` on every authenticated call site (10 in `github-pages.ts`, 3 in
     `vercel.ts`), so a 3xx can never carry `Authorization: Bearer <token>` off-host. Jini commit
     `175b94b3`, 64/64 tests. It explicitly rejected global `fetch` monkey-patching, correctly —
     a process-wide interceptor would break unrelated concurrent outbound calls for the 30–60s a
     publish poll runs.
   - **Base-path mismatch is structurally impossible**, not documented-and-hoped: `StaticPublishConfig`
     has no `basePath` field at all, `adapter.ts` derives it (`/${repo}` for Pages, `undefined` for
     Vercel), and every publish runs a **fresh** export with that value. The `basePath` you see in
     `types.ts` is on the *result* type, echoed back for display. Cost: a re-export per publish,
     accepted deliberately.
   - **`deployment_execute_static_publish` is declared but deliberately NEVER wired** — it carries
     `confirmer-must-equal-own-delegatedBy` (the same bar as `backup_execute_restore`) and sits in
     `UNWIRED_STATIC_PUBLISH_TOOL_IDS`. **The assistant cannot publish to the internet.** Only
     `deployment_preview_static_publish` (a pure read) is callable. If you ever wire the execute
     tool, that decision deserves its own conversation with the owner.

   ⚠️ **Credentials are env vars this pass** — `GITHUB_TOKEN` / `VERCEL_TOKEN`, behind an injectable
   `PublishCredentialSource` seam. The encrypted store (ADR-058) is the right eventual home but
   needs a new table + migration; swapping `createEnvPublishCredentialSource()` changes no caller.
   ✅ **`.nojekyll` IS injected** by `static-publish/adapter.ts` (verified). Jini's own adapter
   does not add it, so this is Tovu's job and Tovu does it.
2. **Make the Dockerfile tab editable in the UI — everything below it is already done.**
   `PUT /api/admin/v1/workspaces/:workspaceId/system/dockerfile` (gated on a new `system.write`),
   the `deployment_set_dockerfile` agent tool, and `api.setDockerfileSource(contents)` all exist.
   `DockerfileTab.tsx` is still a read-only `<pre>` with Copy/Download. **The AI can edit the
   Dockerfile; the human cannot.** The owner asked for this three times. Wire an editor + Save to
   `api.setDockerfileSource`, which returns `{ exists, contents }` so the view refreshes without a
   second GET. Keep the footer honest that saving does not rebuild anything.

   Path safety is genuinely settled here, don't re-audit it: `dockerfilePath()` is
   `join(process.cwd(), "Dockerfile")` with **zero parameters**, and neither read nor write accepts
   a path argument — the route only ever takes `contents`. There is no path input to traverse.
3. **Register the publish tools.** `PublishTargets` was told to write
   `src/features/deployments/publish-agent-tools.ts` but NOT to touch
   `src/assistant/tool-registrations.ts` (another agent owned it). The one-line `DOMAIN_SLICES`
   registration is probably still missing — check, and merge it.
4. **Run the full deployment test set once.** Nobody has: `src/export/__tests__/`,
   `src/server/__tests__/routes/{export-site,deployments-list,deployment-overview,dockerfile-source}-route.test.ts`,
   `apps/admin` `src/features/deployment/`, and the two e2e configs
   (`playwright.deployment-tabbar-scroll`, `playwright.users-reset-password`).

## Two outages, both fixed, both worth understanding

**1. The API server kept dying → "I can't log in."** `app.listen(port, cb)` had no `'error'`
listener, so a failed bind was an unhandled `'error'` event and a raw stack trace. Trigger:
`tsx watch` restarts on a source edit, force-kills the old process after 5s, and the replacement
hits the still-held port. Fixed in `f74eaef` — EADDRINUSE now exits 1 naming the port and the
`lsof` command. Regression test: `src/__tests__/integration/port-in-use.integration.test.ts`.
⚠️ **This will keep firing while agents edit `src/server/**` with a dev server running.**

**2. The agent daemon died on every boot → "my AI agent no longer works."** An import cycle:

```
server/app.ts → … → export/index.ts → export/site-exporter.ts → server/app.ts
```

`site-exporter.ts` imports `createApp` on purpose (export drives the real app); `app.ts` runs its
whole boot graph as a side effect of loading. Re-entering it mid-init yields half-built exports →
`TypeError: Cannot read properties of undefined (reading 'createInMemoryChatStoreFactory')`,
exit 1. **The API server stayed healthy the whole time**, so the only symptom was a dead assistant.

Latent, not new — it only bites when the entry point is *inside* `src/assistant/`, which is
exactly and only the daemon. Bisected with worktrees: clean at `dcfdd89`, dead at `a4bddce`, which
changed load **order**, not the edge. **It reproduced twice in one hour from two different callers**
(export route, then publish adapter), so the fix is at the shared back-edge in `site-exporter.ts`,
not per-caller. Fixed in `065cc79`, regression test
`src/assistant/__tests__/integration/daemon-boots.integration.test.ts`.

**If the assistant breaks again, check this first:** run that test. Every other suite enters via
`createApp` or `src/index.ts`, where the cycle is benign — which is why nothing caught it.

⚠️ **`23d1182` claims to have fixed this and only half did.** That agent hit the same cycle from
`export-run.ts`, fixed it by injecting `runExportSite` through `RouteDeps` (correct, keep it), and
recorded in `routes/types.ts` that `server/app.ts` and `server/deps.ts` are "the two places safe to
import `#src/export/index` directly, since neither is reachable from
`assistant/tool-registrations.ts`." **That sentence is false** — the daemon's entry point is
`src/assistant/agent-daemon-server.ts`, which imports `app.ts`, so both composition roots ARE
reachable from inside `src/assistant`. `065cc79` removed those two static imports and moved the
fix to the shared back-edge. **Do not restore a top-level `import { exportSite }` in either file on
the strength of that comment.**

## The assistant's deployment tools (domain `deployments`, all 5 wired)

Registered in `src/assistant/tool-registrations.ts`'s `DOMAIN_SLICES`; catalog in
`src/features/deployments/agent-tools.ts`. 63/63 tests passing at the time they landed.

| Tool | Permission | Risk |
|---|---|---|
| `deployment_trigger_export` | `system.export` | `mutates-durable-state` |
| `deployment_get_export_status` | `system.read` | none |
| `deployment_list` | `deployments.read` | none |
| `deployment_get_dockerfile` | `system.read` | none |
| `deployment_set_dockerfile` | `system.write` | `mutates-durable-state` |

The trigger tool's description tells the model that export returns immediately and must be polled,
that only one runs at a time, and — importantly — that `basePath` must exactly match the repo name
for a GitHub Pages **project** site and be left unset for a user/org or custom-domain site. That is
the single most likely thing for a model to get wrong, so check it survives any description edit.

**Untested end to end:** nobody has actually asked the assistant to run an export. That is the
cheapest high-value thing to try next — one sentence in the assistant pane.

## Settled decisions — do not re-litigate

- **Self-hosted-for-developers ships first**; hosted SaaS later.
- **Deployment tabs: Overview · Static Site · Full Site · Dockerfile · History.** Static hosts and
  server hosts are **two separate lists**, named by what the user gets.
- **Per-provider build BUTTONS yes, per-provider build PIPELINES no** — one export engine plus a
  provider profile (base path, config files, 404 naming).
- **`@jini-ai/devops` is the eventual home**, not `cms`/`capability-providers`. But **wire it in
  Tovu and prove it works before moving anything**, or you add a fourth unwired layer to the three
  that already exist.
- **CLI-first is the preferred publish path.** The assistant is a spawned coding-agent CLI, so it
  can drive `gh`/`vercel` directly — no stored tokens. The API adapters are the fallback for when
  those CLIs are absent, and are the *only* path under BYOK (an API model has no shell).
- Agent tools live at `src/features/<domain>/agent-tools.ts` + one `DOMAIN_SLICES` line. There is
  no `features/<x>/ai/` convention.

## Still open

- **Slug-collision default.** `overridesThemePage` exists (`PostEditor.tsx:880-895`, shown only on
  collision). Today the **theme wins**; the owner wants the **post** to win.
  **CORRECTED 2026-08-15 — the blocker is not "URLs change", it is that `false` is ambiguous.**
  `overrides_theme_page` is `NOT NULL DEFAULT false` (`db/schema.ts:117`, `schema.postgres.ts:799`),
  so a stored `false` means BOTH "author never saw the warning" AND "author saw the warning and
  deliberately left the theme page in charge". Those are indistinguishable, so a naive flip silently
  overrides deliberate decisions. Resolution lives at `server/routes/site/pages.ts:764-782`, and it
  only engages when the theme tier is `static`, the slug is not `index`, and `theme.pages[slug]`
  exists. The lookup is **kind-blind** — database Pages collide too, not only Posts.
  ~~Suggested fix: make the column nullable (tri-state).~~ **REFUTED by Terra 5.6 xhigh, same day**
  (`ADS-memory/reports/external-audit/runs/2026-08-15-terra-xhigh-slug-collision-default.md`):
  nullable alone does nothing, because `repo.sqlite.ts:117-119`, `server/http/shared/post.ts:29-31`
  and the editor hooks all coerce missing/null back to `false` — and it still cannot classify
  historic `false` rows.
  **Do this instead — set the new default at CREATION time and never reinterpret legacy rows.**
  Make `createPost` store `overridesThemePage: true` explicitly, leave every existing stored value
  alone. Zero existing rows change; only newly created records are post-first.
  Note option C (change `DEFAULT true` only) is a trap: `repo.sqlite.ts:117-123` writes
  `record.overridesThemePage ?? false`, so the DB default is bypassed on every normal write.
- ~~**Renaming a theme route** (`/about` → `/about-site`) does not exist.~~
  **FALSE — corrected 2026-08-15. It exists and ships.** Double-click a page in Theme Explore
  (`ThemeExplore.tsx:366` → `startRename`), or use the ⋮ menu's Rename. Renaming a page is diverted
  into a confirm dialog that states the public URL will change
  (`ThemeExplore.tsx:587-589`, `use-theme-explore.hooks.ts:155-165`). `pages/index.html`,
  `theme.json` and `tokens.json` are rename-locked; the `script` and `other` groups are read-only.
  This remains the better escape hatch than the override, because both pages stay reachable.
- **`.nojekyll` is manual.** Jini's `github-pages.ts` has zero Jekyll/base-path handling (grepped).
- **The Docker image has never been built.** Docker Desktop was shut down at the owner's request.
- **`/page-shell` is publicly reachable** — template shells served as real pages. Recorded in
  `development/todos.md`, unfixed.
- **`rebuildNavLocationBindings` fails on every boot** with a UNIQUE constraint. Non-fatal,
  pre-existing, unexplained. No duplicate rows in `nav_location_bindings` — likely a transient
  concurrent-boot race, but it recurs.
- CLI detection (`deployClis` on the overview route) has **no test**.

## Process lessons — read the protocol doc

`development/docs/agents/subagent-dispatch-protocol.md` was written this session, closing a pending
action the owner had raised on 2026-08-12 and restated twice since.

- **Mid-flight messages do not arrive.** Five were sent; at least two vanished. Both were caught by
  **measuring the code**, never by reading reports (`ls development/e2e | grep password` → empty,
  against a report saying "nothing left open").
- **Never write a gated check-in into a brief** ("message me before you fix, and wait") — the agent
  asks and the answer cannot reach it. I did this twice despite the rule.
- **Pick the persona from the work, not the finding.** A security fix dispatched at
  `security/skills.md` correctly refused: that persona is review-only.
- **Name conditional skills at dispatch.** The first Web Design pass was mediocre because I gave it
  only its persona; its own file declares `ui-ux-design` (+ premium bundle), `interface-design` and
  `vercel-web-design-guidelines`, all unloaded. The re-dispatch with them was visibly better.
- **Never revert shared files to prove a test fails.** An agent did, was interrupted mid-revert, and
  left the owner's live dev server serving an unstyled admin.
- Four of seven agents found real errors in their briefs, because pushback was invited and
  non-blocking. Keep doing that.

## Handoff contract

- **Inputs:** the session conversation; `git log`/`git status`/`git show`; direct reads of
  `app.ts`, `deps.ts`, `site-exporter.ts`, `index.ts`, `deployment-overview.ts`, `DockerfileTab.tsx`,
  the Jini `devops/deploy` package; a live GitHub Pages deploy; worktree bisection; a custom
  module-loader cycle trace.
- **Output:** a working static-export→publish chain, a five-tab Deployment panel, two admin routes,
  an agent-tool domain, an editable-by-agent Dockerfile, two outage fixes with regression tests.
- **Risks:** `PublishTargets`' output is unverified; the Dockerfile is agent-editable but not
  human-editable; nothing is pushed.
- **Next assignee:** Coordinator, then Programmer for items 1–3.
