# The deploy-ref half of "I deployed and nothing changed" — 2026-09-18

Investigator: codebase-analyzer (read-only). Scope: the **code/ref/CI side** only. Content/media
ships in a sibling report by a separate agent and is deliberately not duplicated here.

Every claim below carries its file:line or the exact command that produced it. Where I could not
get evidence, the finding says UNVERIFIED rather than asserting.

---

## Premise note — `main` is moving, and it does not close this

The owner is pushing `restructure/apps-website-phased` to `main` on `leonaburime-ucla/Tovu` while
this report is being written. Every statement below about **where `main` points** is therefore a
timestamped reading, not a claim about the present.

**Last reading, 2026-09-18T22:32:18Z** (`git ls-remote --heads origin`; `gh api
repos/leonaburime-ucla/Tovu/branches/main`):

```
main = f2997c6eaa4f2e8921891b0b9dfc2928ddc5cc10      (committed 2026-09-11T00:41:02Z)
repo pushed_at = 2026-09-11T00:48:58Z
divergence  (git rev-list --left-right --count origin/main...HEAD)  =  0  485
```

So **as of 22:32:18Z the push had not landed** — `main` still pointed at the same commit the
2026-09-18 deploy built. That is a reading, not a prediction: it may land a minute after this
sentence. I did not retry into it and did not push, fetch-and-merge, or otherwise touch the remote.

The working branch grew from 480 to 485 commits during this investigation, `2d31f59e` among them
(see §d/W2) — so the number in any single reading below is the number at that reading, and the
distance is a moving target by nature. That is the argument for reporting a **resolved SHA and its
date** rather than a count, which is what `2d31f59e` now does.

**Two things the push changes, and three it does not.**

It changes: `main`'s SHA, and the 480-commit distance between the operator's work and what is
deployable. After it lands, the *next* deploy will genuinely ship new code.

It does not change:

- **What already happened.** The deploy that prompted this investigation built `f2997c6e`, twice.
  That is history and is stated in the past tense throughout §b.
- **Cause 2 — content still never travels.** A current `main` ships the operator's *code*. Their
  pages, uploads and media remain local; `content.db` is gitignored and is not in the image. The
  next deploy will change how the site *behaves* and still not show the pages they wrote. (Owned in
  full by the sibling content report; named here so a green deploy is not mistaken for a fix.)
- **Every gap in §c except G4.** None of G1–G6 is a fact about `main`'s position. The Deployment
  screen will still say "No deploys yet"; the running commit will still be unknowable; the dispatch
  POST will still be un-gated. **G4 — nothing reporting which ref it ships — was closed on
  2026-09-18 by `2d31f59e`** (§d/W2), by the fix landing, not by the push. A current `main` makes the
  *next* deploy correct **by luck of alignment, not by design**; what changes that is `2d31f59e`
  telling the operator the SHA and its date before the dispatch, and even that reports rather than
  blocks — and §f.5 shows the live workspace may not be running it yet.

Treating this push as the fix would re-close the incident as "user pushed the wrong branch", which
is exactly what the dispatch brief says not to do.

---

## (a) What the deploy actually does, mechanism by mechanism

There is no "deploy button" anywhere in the product. The deploy is a chain of five mechanisms,
four of which are prose instructions to a model, and one of which is a generic HTTP tool.

### 1. The operator (or the assistant) fires `workflow_dispatch`

`/Users/la/Programming/Tovu/.github/workflows/fly-deploy.yml:81-84`

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch: {}
```

Run #31 was `workflow_dispatch`, not `push`:

```
$ gh api repos/leonaburime-ucla/Tovu/actions/runs/35398454111
{"actor":"leonaburime-ucla","conclusion":"success","created_at":"2026-09-18T21:46:49Z",
 "event":"workflow_dispatch","head_branch":"main",
 "head_sha":"f2997c6eaa4f2e8921891b0b9dfc2928ddc5cc10",
 "path":".github/workflows/fly-deploy.yml","triggering_actor":"leonaburime-ucla"}
```

The dispatch itself carries the ref. If it came from the assistant, the body is literally
`{"ref":"<branch>"}` — `/Users/la/Programming/Tovu/content/agent-plugins/github/skills/github/references/actions.md:38-46`.
If it came from the GitHub UI's "Run workflow" dropdown, the dropdown **defaults to the default
branch**, which `gh api repos/leonaburime-ucla/Tovu` confirms is `main`. I cannot distinguish the
two: `actor` and `triggering_actor` are both `leonaburime-ucla` either way. Either path produces
ref = `main` with no typing required, which is the point below.

### 2. GitHub resolves the ref name to a SHA

`git ls-remote --heads origin` (run at `/Users/la/Programming/Tovu`, **reading of
2026-09-18T22:19:39Z**):

```
2eeef696808fbf4e9ae6d1b94b7dbeb436893b56	refs/heads/flyio-new-files
f2997c6eaa4f2e8921891b0b9dfc2928ddc5cc10	refs/heads/main
```

`main` → `f2997c6eaa4f2e8921891b0b9dfc2928ddc5cc10`. **That is the exact mechanism that chose
`f2997c6e`: nothing chose it. A branch NAME was resolved to whatever it pointed at.**

This is the mechanism, not a fact about `main`. Late-binding a branch name at dispatch time is what
the deploy does every time; on 2026-09-18 it happened to resolve to a commit from a week earlier.
Once the owner's push lands the same mechanism will resolve to something new — with the same
absence of any report of what it resolved to (§G4).

### 3. The workflow checks out that SHA — it never pins or validates a ref

`/Users/la/Programming/Tovu/.github/workflows/fly-deploy.yml:111`

```yaml
      - uses: actions/checkout@v4
```

No `ref:` input, no `fetch-depth`, no branch check. `actions/checkout` with no `ref` checks out
`github.sha` — the SHA the dispatch resolved. The workflow has no opinion about which ref it is
building and no step that could reject one.

### 4. `flyctl deploy` on GitHub's runner, against Fly's remote builder

`/Users/la/Programming/Tovu/.github/workflows/fly-deploy.yml:121`

```yaml
      - run: flyctl deploy --remote-only --build-arg TOVU_BUILD_SHA=${{ github.sha }} --build-arg TOVU_INSTALL_BROWSER=0
```

The runner uploads its checkout as the build context. `flyctl` never runs on the operator's
machine (there is no `flyctl` on this Mac — `command -v flyctl fly` returns nothing), so the
operator's working tree is never even a candidate for what ships.

Gated on exactly one check: `/Users/la/Programming/Tovu/.github/workflows/fly-deploy.yml:104-108`
(`jini-published-typecheck`, a narrow npm-registry-drift typecheck). `ci.yml` is
`disabled_manually` and does not gate this (same file, lines 100-103).

### 5. The SHA lands in the image and is then never read by anything

`/Users/la/Programming/Tovu/Dockerfile:63-64`

```dockerfile
ARG TOVU_BUILD_SHA
ENV TOVU_BUILD_SHA=${TOVU_BUILD_SHA}
```

`/Users/la/Programming/Tovu/development/scripts/emit-dist-package-json.mjs:107,170,179` writes it
into `dist/runtime-manifest.json` as `tovuSha`, and its own header calls that field "a provenance
guarantee (ADR-020 5)".

**It has zero consumers.** `grep -rn "tovuSha"` across the repo (excluding `node_modules` and
`dist/`) returns three hits, all inside the emitter itself. No route serves it; the only ops route
is `/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/routes/ops/health.ts`,
whose `/readyz` returns `{ready, failures, daemon}` (lines 43-61) and no version or SHA.

### What no mechanism in that chain did, at the time of the deploy

**Dated, because one of these has since been fixed.** At the moment of the 2026-09-18 deploy:

- Nobody resolved the ref to a SHA **and showed it to the operator.** The github plugin's polling
  step told the model to read `id, status, conclusion, html_url, head_branch, created_at`
  (`actions.md:77` as it then stood) — `head_sha` was on that same API response and not on the list.
  **Closed 2026-09-18 by `2d31f59e`** — see §d/W2 for exactly what shipped, and for the one caveat
  about whether the live workspace is running it yet.
- Nobody compared the dispatched ref against anything. Still true of the *previous release* only in
  part — `2d31f59e` added the byte-identical-source prediction — and **permanently true of the
  operator's working branch**, which §e explains is not a gap that can be closed at this layer.
- The fly plugin's Reporting rules
  (`/Users/la/Programming/Tovu/content/agent-plugins/tovu-deploy-fly/skills/tovu-deploy-fly/SKILL.md:302-309`)
  enumerate four things the assistant must report. Which ref/commit was deployed is still not one of
  them; `2d31f59e` amended the **github** plugin, not this one. A deploy driven from the fly
  plugin's own procedure now passes through the github plugin's dispatch step, so it picks the
  behavior up in practice — but the fly plugin's Reporting rules do not require it in their own
  words.

---

## (b) The assistant's two claims

Both claims are about the **past** — the deploy that already happened. The owner's in-flight push
does not touch either one.

### Claim 1 — "Releases 15 and 16 were both built from `f2997c6e`" → **CONFIRMED in substance, UNVERIFIED in wording**

CONFIRMED: the three most recent *successful* deploy runs all built the identical commit.

```
$ gh run list --workflow=fly-deploy.yml --limit 15 --json number,headBranch,headSha,event,conclusion,createdAt
#31  workflow_dispatch  main  f2997c6eaa4f2e8921891b0b9dfc2928ddc5cc10  success  2026-09-18T21:46:49Z
#30  workflow_dispatch  main  f2997c6eaa4f2e8921891b0b9dfc2928ddc5cc10  success  2026-09-11T01:26:06Z
#29  push               main  f2997c6eaa4f2e8921891b0b9dfc2928ddc5cc10  success  2026-09-11T00:49:01Z
#28  push               main  c9f856afd111ae80dea895696caa1a51ead61c2e  failure  2026-09-10T18:04:01Z
```

So a deploy on 2026-09-18 shipped byte-identical source to one on 2026-09-11. "Nothing changed"
is the correct and expected outcome.

UNVERIFIED: the **Fly release numbers 15 and 16**. There is no `flyctl` on this machine
(deliberately — `no_vendor_clis_this_machine`), and reading Fly's API would mean using the sealed
`fly.io` credential to make a live outbound call, which is outside a read-only investigation.
Mapping run → release number is an assumption. The claim that *matters* — same code, twice — does
not depend on it and is confirmed independently above.

### Claim 2 — "`main` had not moved since 2026-09-11, and the owner's branch was not on that repo" → **CONFIRMED as of the deploy, and still true at 22:19:39Z**

Stated in the past tense deliberately: this describes the state at the moment of the 2026-09-18
deploy, which is what the claim was about. My last reading, **2026-09-18T22:19:39Z**, found it
unchanged — the owner's push had not landed yet.

```
$ gh api repos/leonaburime-ucla/Tovu                        # read 2026-09-18T22:19:39Z
{"default_branch":"main","pushed_at":"2026-09-11T00:48:58Z","updated_at":"2026-09-11T00:49:05Z"}

$ gh api repos/leonaburime-ucla/Tovu/branches/main          # read 2026-09-18T22:19:39Z
{"name":"main","sha":"f2997c6eaa4f2e8921891b0b9dfc2928ddc5cc10","date":"2026-09-11T00:41:02Z"}
```

`pushed_at` is repository-wide, not branch-specific: **as of that reading, no branch on that remote
had received a push since 2026-09-11T00:48:58Z.** That is a stronger statement than the claim made.
It will stop being true when the owner's push lands; that does not retroactively change what the
deploy built.

### Question 3 — did `restructure/apps-website-phased` exist on that remote?

**Not at the time of the deploy, and not at 22:19:39Z** — the owner is pushing it now, which is the
premise change, not a contradiction. And "this repo has more than one thing called 'the repo'" is no
longer true — there is now exactly one remote:

```
$ git remote -v
origin	https://github.com/leonaburime-ucla/Tovu.git (fetch)
origin	https://github.com/leonaburime-ucla/Tovu.git (push)
```

`git ls-remote --heads origin` listed exactly two refs, `flyio-new-files` and `main` (§a.2). At
that reading the owner's branch existed on this machine only. Divergence, measured against the
fetched `origin/main` at `f2997c6e`:

```
$ git rev-list --left-right --count origin/main...HEAD
0	480
```

`main` was 0 commits ahead of the working branch; the working branch was **480 commits ahead** of
everything deployable — a clean fast-forward, which is consistent with the push the owner is
performing. Once it lands this number goes to `0 0` and the *distance* problem is gone. The
*reporting* problem (§G4) is not: nothing measured this number for the operator, before or after.

Two stale comments worth correcting, since both have misled sessions before (and one is cited in
the other's own "this was stale" banner):

- `/Users/la/Programming/Tovu/.github/workflows/fly-deploy.yml:76-78` said the branch was "1783
  commits ahead of `main`". Measured during this investigation: **480**, then **485** a few minutes
  later. **Fixed 2026-09-18 by `2d31f59e`**, which deleted the count rather than replacing it —
  the comment now names the command that answers the question, plus the fact that a dispatch pins a
  NAME and not a commit. That is the right call: a number that had been wrong twice, and that the
  owner's in-flight push would have made wrong in the other direction, is not a number worth
  maintaining in a comment.
- The claim that the mirror is a separate repo is already corrected at
  `/Users/la/Programming/Tovu/fly.toml:2-9`, and my remote check confirms that correction.

Practical consequence at the time of the deploy: **a dispatch against
`restructure/apps-website-phased` would have 422'd**, because the ref did not exist on the remote
(`actions.md:58` documents exactly that status for a non-existent ref). The owner could not have
deployed their work even by naming it — which is why the push, not a different dispatch, is the
right immediate move. It is just not the fix for §c.

---

## (c) The gaps, ranked by how many users they hit

None of these is a fact about `main`'s position, and the owner's push resolves none of them.

**Status as of 2026-09-18T22:32Z:** G4 is closed in the bundled source by `2d31f59e` (with the
live-copy caveat in §f.5). `2d31f59e` touches three files — `actions.md`, `fly-deploy.yml` and one
unit test — and therefore **does not touch G1, G2, G3, G5 or G6 at all**. Concretely, all of the
following are still true: Deployment → History still renders "No deploys yet"; `tovuSha` is still
written into the image and read by nothing; the dispatch POST is still un-gated while DELETE is
gated; the deployment run tables still have no writer. Those were never in W2's scope and were not
silently fixed alongside it.

### G1 — The product has no deploy. The screen that says "Deployment" cannot deploy, and does not know a deploy happened. *(every user who opens that screen)*

`/Users/la/Programming/Tovu/apps/admin/src/features/deployment/` is a built, five-tab screen
(`Overview`, `Dockerfile`, `StaticSite`, `FullSite`, `History`) reached from `panels.tsx:877-893`
("Deployment is how it goes out").

- **Full Site** — every host row is hard-coded `status: "planned"`. Its own header, `FullSiteTab.tsx:7-23`:
  *"there is no ADMIN-REACHABLE backend to store credentials yet, so every row is honestly
  `status: "planned"`, never a real connection state."*
- **History** — `HistoryTab.tsx:47-50` renders, verbatim: **"No deploys yet"** / *"Nothing has been
  deployed from this screen — and nothing can be yet."*

So after a real, successful production deploy on 2026-09-18, Tovu's own Deployment → History tab
still says nothing has ever been deployed. The screen is *honest* — it is not faking data — but the
honesty is about the screen, not about the world.

### G2 — Production's running commit is unknowable from inside the product *(every operator who asks "did that change anything?")*

The provenance SHA is captured correctly at build time and read by nothing (§a.5). There is no
endpoint, no admin field, and no tool that answers "what commit is tovu.fly.dev running?" The one
fact that would have told the owner in five seconds that release 16 was release 15 again is
recorded into a file that nothing opens. **Correct primitive, zero call sites.**

### G3 — The deploy dispatch is un-gated; DELETE is gated *(every agent-driven deploy)*

`/Users/la/Programming/Tovu/apps/website/src/features/custom-credentials/tool-registrations.ts:1281-1290`

```ts
      const method = requireString(input, "method");
      …
      if (method !== "DELETE") {
        return makeModelFacingCredentialedRequest(requestDeps, { workspaceId: …, label, method, url, … });
      }
```

Only `DELETE` opens the `SurfaceExchangeStore` confirmation (line 1325 and
`delete-request-confirmation-ui.ts:38-49`). The rationale is recorded as an owner decision at
`tool-registrations.ts:92-99`: *"The only thing we maybe should be worried about is deletion…
GET/POST/PUT/PATCH run immediately with no ceremony — parity with what a human can already do from
the site."*

That reasoning is sound for the general case and wrong for exactly one URL shape. The
production deploy is a **POST**, so the single most consequential outbound call the assistant can
make — build and restart the live machine — is the one with no dialog, while a DELETE against a
throwaway DNS record gets one. Note this is an owner ruling, not an oversight: changing it is an
owner decision, not a bug fix.

The contrast is sharper still one file over: `custom_credential_write_files` gates **every** call,
and its dialog names the branch and carries an *extra* prominent warning for any
`.github/workflows/` path (`agent-tools.ts:318`). Writing the workflow is ceremonious. Firing it is
not.

### G4 — Nothing knew which ref it was deploying, at any layer — **CLOSED in the doc by `2d31f59e`, 2026-09-18**

As it stood at the deploy: not the workflow (no `ref:`, §a.3); not the fly plugin (`SKILL.md:186-197`
Step 0 establishes the *repo* and *app*, never the ref; `SKILL.md:288-298` Step 5 says only that
"the two files must be on the branch the workflow's own trigger names"; `SKILL.md:302-309` does not
require reporting it); not the polling procedure, which read `head_branch` and not `head_sha`.

A branch name is not a ref identity — `main` read as the same string on 2026-09-11 and on
2026-09-18 while meaning "your work is 480 commits away", and it will read the same again after the
owner's push while meaning the opposite. The operator was handed a name that cannot distinguish
those two situations, and never a commit.

`2d31f59e` closes exactly this, in the github plugin's `actions.md` (details and the shipped text in
§d/W2). **Two things keep it from being a finished story:**

1. The fix is in the **bundled source**; §f.5 shows the **live workspace copy still has the old
   text**. A skill the running assistant does not read is a fix that has not taken effect yet.
2. It **reports and never blocks**, by design. It makes the fact visible one line before the
   dispatch; it does not stop a deploy. That is the correct scope — but it means the outcome still
   depends on the operator reading the line.

### G5 — The five deployment tables have a reader and no writer *(anything that would record a deploy)*

`/Users/la/Programming/Tovu/apps/website/src/features/deployments/read-repo.ts:5-17`:

> *"Deliberately read-only: … a real write path (create environment/target, start a run) [is scoped]
> behind credential storage that does not exist yet … nothing this repo returns can currently get
> there any other way than a human with raw DB access."*

`deployment_list` is a registered agent tool
(`/Users/la/Programming/Tovu/apps/website/src/features/deployments/tool-registrations.ts:105`)
over tables (`deployment_environments/targets/runs/run_events/releases`, `schema.ts:2957+`) that
nothing writes. It will return empty forever. The registered deployment tools are:
`deployment_trigger_export`, `deployment_get_export_status`, `deployment_list`,
`deployment_get_dockerfile`, `deployment_set_dockerfile` (`tool-registrations.ts:101-109`) and
`deployment_preview_static_publish`, `deployment_get_static_publish_capabilities`,
`deployment_execute_static_publish`, `deployment_propose_custom_provider_credential`,
`deployment_generate_bucket_hosting_setup` (`publish-agent-tools.ts:383-401`). **None of them is
the Fly deploy.**

### G6 — The knowledge exists, in YAML comments nothing surfaces *(every operator)*

`fly-deploy.yml:74-79` explains the whole trap in prose — the trigger branch, that pushes to the
working branch do nothing, and that `workflow_dispatch` is the manual escape hatch. `fly.toml:11-14`
repeats it. Both are correct (one is numerically stale, §b). Neither is reachable at deploy time by
anyone who is not reading the YAML, and neither is the audience for a Tovu CMS.

### Not a gap: the code-vs-content rule is stated, loudly, in the right place

Credit where due — the fly plugin opens with it, before anything else, at
`/Users/la/Programming/Tovu/content/agent-plugins/tovu-deploy-fly/skills/tovu-deploy-fly/SKILL.md:8-34`:
*"**Deploying ships CODE, not CONTENT.** … Say this in your first reply, before you touch a file.
Do not bury it in a summary at the end, and do not soften it."* It even carries the outcome table
and the "that is a content migration, a different job" refusal (lines 27-34). The installed copy in
the live workspace is byte-identical to the source (`diff -rq` of `content/agent-plugins/tovu-deploy-fly`
against `sites/tovu-com/agent-plugins/ws/workspace-local/packages/sha256/c23e027b…` prints nothing),
and the plugin is enabled (`activations.json:10-15`). The content half of this incident is not a
missing instruction; the ref half genuinely is.

---

## (d) Where a warning could live — concrete call sites, with cost

Ordered cheapest first. **I wrote none of these.**

### W1 — Report the SHA and the ref in the plugins' own reporting rules *(prose; ~1 file left, <1h)* — **half done**

The `actions.md:77` half (add `head_sha` to the fields read off `workflow_runs[0]`) **shipped in
`2d31f59e`**. What remains is the **fly** plugin's own Reporting rules, `SKILL.md:302-309` — add a
rule naming the ref and the resolved commit alongside the four rules already there. Small, and worth
doing so the fly procedure states the requirement in its own words rather than inheriting it from a
neighbouring plugin. Cheapest possible fix; weakest guarantee, because prose compliance is a model
behavior, not a gate.

### W2 — A pre-dispatch ref resolution step in the github plugin — **IMPLEMENTED 2026-09-18, `2d31f59e`**

Shipped as recommended, and slightly beyond it. `git merge-base --is-ancestor 2d31f59e HEAD`
confirms it is on the working branch; it touches three files (`git show --stat`):
`content/agent-plugins/github/skills/github/references/actions.md`,
`.github/workflows/fly-deploy.yml`, and
`apps/website/src/features/agent-plugins/__tests__/unit/bundled-github-package.unit.test.ts`.

**What shipped**, in `actions.md`'s new section "Resolve the ref to a commit, and say which commit,
before you dispatch":

- One `GET /repos/<owner>/<repo>/branches/<ref>` before the dispatch POST, with `name`, `commit.sha`
  and `commit.commit.committer.date` all required to be stated, and the tip's age in plain words.
  The worked example is this incident: `Deploying main @ f2997c6e — committed 2026-09-11, 7 days ago.`
  The doc names the date as the half that does the work — *"A tip a week old, told to someone who has
  been working all week, is the visible shape of 'this is about to ship something other than what you
  just wrote'."*
- A 404 on that call is the same missing ref the dispatch would have returned as a 422, caught one
  call earlier and named plainly — a free improvement over the failure table at `actions.md:58`.
- **Beyond W2 as I wrote it:** the runs list the procedure already polls is read one call *earlier*
  too. If `workflow_runs[0].head_sha` equals the resolved SHA, the model must say the run will build
  **byte-identical source to the last one** — *before* it happens. That is this incident's exact
  outcome, predicted one call ahead of it. I had proposed an optional `compare` call; this is
  cheaper and sharper, because it needs no extra request.
- `head_sha` joins the fields read off `workflow_runs[0]` when polling, so the after-the-fact report
  can confirm what actually built against what was resolved, and a push landing between the read and
  the dispatch becomes "a fact to state, not a problem to solve".

**What deliberately did NOT ship, and should not be read as an oversight:** the dispatch POST is
untouched. The doc says in its own words — *"This step reports. It never blocks."* — and a unit
assertion pins that sentence so a later edit cannot quietly turn it into a confirm ceremony. Gating
the POST is still **W4**, still an extension of the DELETE-only gate the owner named as "the one
exception, not a template to extend", and still the owner's ruling to make.

Cost, for calibration against the estimates below: ~1-2h as estimated, RED-first, 20/20 on the
suite and 79/79 across the neighbouring plugin-packaging suites.

**Caveat that outranks all of the above: §f.5 — the live workspace copy still has the old text.**

### W3 — Expose `tovuSha` on an ops route, and read it back *(code; ~2 files + tests, ~half a day)*

`health.ts:43-61` already registers `/readyz` via a `RouteRegistrar`. Adding a sibling (or a field)
that serves `dist/runtime-manifest.json`'s `tovuSha` turns "what is live?" from unanswerable into
one HTTP GET, which is the precondition for *any* automated "you are about to ship the same code"
check. Caveat that belongs to whoever builds it: the SHA is provenance, and exposing build metadata
on an unauthenticated public route is a (small) disclosure decision — the admin API is the safer
home. This is the single unblocker for W4 and W5.

### W4 — Gate the workflow-dispatch POST the way DELETE is gated *(code; ~2-3 files, ~1 day) — needs an owner ruling*

`tool-registrations.ts:1281-1290` is the exact branch point. A narrow arm that recognizes
`…/actions/workflows/*/dispatches` and opens the same `SurfaceExchangeStore` exchange the DELETE
path uses, with a dialog modeled on `delete-request-confirmation-ui.ts:38-49`, naming: repository,
workflow file, ref, **resolved SHA and its date**, and the standing "this ships code, not content"
line. Mechanism is proven and reused; nothing new is invented.

**Do not build this without asking the owner.** `tool-registrations.ts:122` records their standing
instruction verbatim — *"no GET-only slices, no confirm ceremonies — this domain's DELETE gate is
the one owner-named exception, not a template to extend."* This is precisely extending it. The case
for asking anyway: a production deploy is not "parity with what a human can already do from the
site" in the sense that rule was written for.

**Still open after `2d31f59e`, deliberately.** That commit implemented W2 and explicitly stopped
short of this, pinning the sentence *"This step reports. It never blocks."* in `actions.md` with a
unit assertion so no later edit can drift into a gate by accident. The decision is therefore
genuinely parked with the owner, not half-made: **report-only today, and it stays report-only until
they say otherwise.**

### W5 — `deployment_verify_host_deployment` — already designed, never built *(code; several days)*

`/Users/la/Programming/Tovu/ADS-memory/reports/architecture/ADR-064-agent-guided-deployment.md:290-299`
specifies exactly this tool (platform API check + `/readyz`, with "the agent's own return message
must never say 'your site is live' without both checks passing"). Verified not implemented:
`grep -rl` for `deployment_verify_host_deployment`, `deployment_generate_container_deploy_commands`
and `deployment_propose_host_credential` across `apps/website/src` returns nothing, while the same
grep for the known-present `deployment_generate_bucket_hosting_setup` returns three files — so the
pattern works and the absence is real. A ref/SHA finding is a natural additional finding on that
tool, next to its "missing volume is blocking" one. Its natural persistence home is the
already-migrated `deployment_runs`/`releases` tables — which is also W6.

### W6 — Give the Deployment screen a real backend *(code; the largest, and the only one that fixes G1)*

`read-repo.ts:5-17` deliberately stops at read-only, and says why. A write path (one run row per
dispatch, with ref + SHA + conclusion) is what turns `HistoryTab`'s "No deploys yet" into the place
an operator learns what shipped and when. Everything downstream — "this is the same code as last
time", "you are 480 commits ahead of what is live" — falls out of having the rows. Correspondingly
the biggest piece of work, and the one ADR-064 explicitly deferred (see below).

### Prior art worth copying, not a guard that failed

`/Users/la/Programming/Tovu/apps/website/src/platform/db/drift.ts:33` already defines
`DriftStatus = "in-sync" | "ahead" | "diverged" | "behind"` for migration lineage, with a
tag-decisive rule (line 39) and its own unit suite. It has nothing to do with git refs, but it is
this codebase's existing, tested vocabulary for exactly the shape of statement the deploy path
needs to make. Reuse the words, not the module.

---

## (e) Was there a guard that should have caught this?

**No guard exists, unwired or otherwise — and the gap is a documented, deliberate deferral, not an
oversight.** ADR-064 §D5, lines 310-313:

> **Re-deploy / update flow.** This ADR designs the FIRST deploy only. A second "deploy my site" on
> an already-deployed instance should detect that state … and route to a different, unbuilt "push
> an update" conversation — **named here as a real gap, not designed.**

The owner performed the second deploy. The architecture record says, in advance and in writing,
that the flow they used was never designed. Related, same document (lines 334-337): the ADR already
recognizes the *shape* of this failure class for the static path — *"a site that gains a form … after
a static deploy has no ongoing check — this ADR does not design a 'you added a form, your static
deploy is now stale' detector; that is a real, separate gap."*

So the honest framing for the owner is not "a check broke". It is: **the re-deploy path was
deferred, the deferral was recorded, and the first real re-deploy landed on it.**

What *is* an unwired call site, in this repo's dominant-defect sense, is narrower and real: **the
provenance SHA (G2) and the deployment run tables (G5)** — both correct, both tested, both with no
caller.

### Amendment (2026-09-18, from building `2d31f59e`): one half of this can never be checked here

My §a and the dispatch brief both asked whether anything compares the deployed ref against **the
operator's current working branch**. Building W2 established that it **cannot**, at this layer, ever:
the assistant driving a dispatch has **no `git` and no shell**. It reaches GitHub through
`custom_credential_make_request` and nothing else. The human's local branch, their uncommitted work,
and whether they have pushed any of it are all structurally invisible to it.

`2d31f59e` handles that the right way — it declares the blindness in the doc ("What you cannot
compare against") and forbids the model from implying it checked, rather than leaving a gap a model
would paper over with a confident guess. That is worth recording as a correction to my own framing:
"nothing compares the deployed ref to the working branch" reads like an omission, and half of it is
a boundary. What the plugin *can* do — and now must — is state the ref, the SHA and its date, and
let the human draw the conclusion.

The comparison is possible only where both sides are visible: the **desktop app** or the **CLI**,
which run on the operator's machine with a real working tree. Nothing there does it today, and it is
outside this report's scope.

---

## (f) What I could not determine, and what it would take

1. **Fly release numbers 15 and 16, and their image digests.** No `flyctl` on this machine, and
   reading Fly's API means using the sealed `fly.io` credential for a live outbound call. *Cost to
   close:* one read-only `GET https://api.machines.dev/v1/apps/tovu/…` through
   `custom_credential_make_request`, which the fly plugin's own Step 1 (`SKILL.md:204-226`) already
   sanctions as a pre-flight read. It would confirm the run→release mapping and, separately, that
   exactly one machine is running (Rule 1).
2. **Whether the owner clicked "Run workflow" in the GitHub UI or the assistant POSTed the
   dispatch.** `actor` and `triggering_actor` are both `leonaburime-ucla` in either case. *Cost to
   close:* ask the owner, or read the chat transcript for a `custom_credential_make_request` call to
   `…/dispatches` around 21:46:49Z on 2026-09-18. It matters only for deciding whether W1/W2 (prose,
   assistant-path only) is sufficient or whether W4 (code gate) is required — a UI click bypasses
   every prose fix.
3. **Whether the live machine is serving the image built by run #31 rather than an older one.**
   The runs API proves the build and the deploy step succeeded; it does not prove which image the
   machine is currently running. Unknowable from here for the same reason as (1), and unknowable
   from *inside Tovu* for the reason in G2.
4. **Whether the owner's push landed, and what `main` points at now.** My last reading was
   2026-09-18T22:19:39Z and showed `f2997c6e` (§Premise note). I did not re-poll after that and did
   not touch the remote. *Cost to close:* one `git ls-remote --heads origin`, by whoever reads this.
5. **Whether the LIVE workspace actually runs the bundled plugin copy `2d31f59e` edited — it does
   not appear to.** This is the one open question that decides whether W2 has taken effect at all,
   so it is stated at length.

   The workspace keeps its own **content-addressed** package store. The github plugin is installed
   there as `sha256/73fe7b070ef3a136ae0a5df62fbd82f5678a54828ec463eb227aa22e11f5a6de/`, and there is
   a `superseded-2026-09-10/528d6dac…/` copy beside it. **How to tell which copy is live, in one
   command** — grep the new section's heading across both trees:

   ```
   $ grep -c "Resolve the ref to a commit" \
       sites/tovu-com/agent-plugins/ws/workspace-local/packages/sha256/73fe7b07…/skills/github/references/actions.md \
       content/agent-plugins/github/skills/github/references/actions.md
   …/packages/sha256/73fe7b07…/skills/github/references/actions.md:0      <- installed copy: OLD
   content/agent-plugins/github/skills/github/references/actions.md:1     <- bundled source: NEW
   ```

   `diff -rq` between the two trees reports exactly one differing file, `actions.md`. **So as of this
   reading the live workspace still holds the pre-fix text**, and an assistant dispatching a deploy
   right now would follow the old procedure. Per project memory, the daemon also reads plugins once
   at startup, so even replacing the files on disk would not reach a running daemon.

   **What should close it, from the repo:** `seedBundledAgentPlugins()` re-runs **on every boot** and
   is idempotent by content digest — `apps/website/src/features/agent-plugins/seed-bundled.ts:33-41`
   states that re-running exists precisely so *"a product upgrade that ships a NEW bundled plugin, or
   a new version of one, reaches existing workspaces without a migration step."* Its source root is
   `bundledAgentPluginsDir()` =
   `TOVU_BUNDLED_AGENT_PLUGINS_DIR` ?? `<productRoot>/content/agent-plugins`
   (`apps/website/src/server/runtime/composition/deps.ts:377-379`). Changed content hashes to a new
   digest, so the next boot should publish a **new `sha256/<digest>/`** directory containing the new
   text, leaving `73fe7b07…` behind as the old one.

   **What I could not verify, and why I did not:** that this actually happens, and which product root
   the running server resolved (a `dist/` run reads `dist/content/agent-plugins`, which is only as
   fresh as the last `npm run build`). Confirming it requires a site-server restart, which I am
   directed not to perform and which would also cost the owner's in-flight drafts. **The check after
   any future restart is the same grep, run across the whole package store:**
   `grep -rl "Resolve the ref to a commit" sites/tovu-com/agent-plugins/ws/workspace-local/packages/`
   — a hit under a `sha256/` directory means the live workspace has it; no hit means W2 is still
   only on disk.

6. **Why `main` and the working branch diverged to 480+ commits and stopped being merged.** Out of
   scope for this report and a question for the owner, not the code.

---

## Read-only attestation

No source file, config, workflow, or test was created, edited or deleted. No commit, push, merge,
tag or deploy. Nothing was installed. `gh` was already present and was used only for `run list` and
`api` GETs. The owner's push to `main` is theirs; I did not push, fetch-and-merge, re-run, or
otherwise act on the remote, and I did not retry into the in-flight state after the 22:32:18Z
reading. I did not author `2d31f59e` — I read it (`git show`, `git merge-base --is-ancestor`) and
revised this report around it. I did not restart the site server, the daemon, or anything else to
resolve §f.5. The single file written is this report, revised in place across three passes rather
than appended to with corrections.

---

# Addendum — "do I have to go through GitHub to deploy to Fly?" (owner question, 2026-09-18)

Short answer: **through GitHub is the only path anyone has actually used, but it is not the only
path the repo supports.** There is a committed local script that would ship your working tree
directly — it just needs `flyctl`, which is not installed here.

## 1. Is GitHub Actions the only implemented path?

Three paths exist in this repo. Only one of them has ever run.

| Path | State | File |
|---|---|---|
| CI: dispatch a workflow | **The only one used.** 31 runs. | `.github/workflows/fly-deploy.yml` |
| Local: `flyctl deploy` from this tree | **Committed, executable, never used here** (no flyctl). | `development/scripts/fly-build.sh` |
| Fly Machines API, no CLI and no CI | Documented, explicitly **not implemented**. | `content/agent-plugins/tovu-deploy-fly/skills/tovu-deploy-fly/references/machines-api-path.md` |

**The GitHub dependency is structural in the *plugin*, incidental in the *repo*.**

The `tovu-deploy-fly` plugin only knows one move: write two files into a repo and dispatch a
workflow. That is its stated reason for existing — `plugin.json:5` and `SKILL.md:40-44`: *"no CLI
installed anywhere … `flyctl` runs on GitHub's runner … Nobody downloads or installs anything
locally — that is the whole point."* Ask the assistant to deploy and it will go through GitHub,
because GitHub is the only thing it has been taught.

The repo underneath is not so limited. `/Users/la/Programming/Tovu/development/scripts/fly-build.sh`
is a real, executable, 39-line script whose last line is:

```bash
exec flyctl deploy "$TOVU_ROOT" "$@"
```

It pins the build context to the repo root regardless of cwd (lines 23, 37) and refuses to run if
`flyctl` is missing (lines 32-35) or `fly.toml` is absent (lines 25-30). Nothing about the deploy
requires GitHub — GitHub is just where the only `flyctl` currently lives.

**One thing worth knowing, because the doc that says otherwise is now stale.**
`machines-api-path.md:24-33` says the API path is blocked because *"no prebuilt, published Tovu
image exists."* That was written 2026-09-09. On 2026-09-11 a workflow that publishes exactly such
an image landed and ran green:

```
$ gh run list --workflow=publish-image.yml
#1  main  success  2026-09-11T00:49:00Z
```

`.github/workflows/publish-image.yml:1-8` describes itself as *"the missing `config.image` input
for the Fly Machines API deploy path."* So the stated blocker is closed. That does **not** make the
API path available — it is still unimplemented and still marked "do not implement", the image was
itself built by GitHub, and the versioning decision the reference calls for has not been made. It
does mean the reference file is out of date and should not be quoted as current.

## 2. What a direct `flyctl deploy` from this machine would require

- **`flyctl` is not installed.** `command -v flyctl fly` returns nothing.
- **Installing it is a vendor CLI on this machine, which is against your standing rule.** That makes
  it your call, not a recommendation from me. I am not proposing it; I am telling you what the
  local path costs.
- **Credentials.** Only one thing currently lives solely in GitHub: the repository secret
  **`FLY_API_TOKEN`** (`fly-deploy.yml:35-39, 122-123`). Locally you would need either that same
  token in the environment or an authenticated `flyctl auth login` session.
- **The three app secrets are already on the Fly app itself** — `TOVU_ADMIN_PASSWORD`,
  `ANALYTICS_ROOT_KEY_SEED`, `TOVU_INTEGRATIONS_ROOT_KEY` (`SKILL.md:121-125`). They are set with
  `fly secrets`, live on Fly, and a deploy does not re-supply them. A local deploy needs none of
  them. (Names only — no values read, printed, or handled anywhere in this investigation.)

## 3. Would a direct deploy behave the same? — the part to read carefully

**Yes on the thing you are asking about.** `flyctl deploy` uploads **the local build context**, not
a git ref. Your working tree ships, unpushed branch and all. There is no checkout step and no
branch to resolve — which is precisely why it would not have produced last night's outcome.

**Three differences from the workflow, all fixable by passing the same flags:**

| Difference | Effect |
|---|---|
| No `--build-arg TOVU_BUILD_SHA` | `.git` is excluded from the context (`Dockerfile.dockerignore:45`), so the build cannot read the commit. `runtime-manifest.json` records `tovuSha: "unknown"` with a stderr warning (`development/scripts/emit-dist-package-json.mjs:107-120`). |
| No `--build-arg TOVU_INSTALL_BROWSER=0` | The image build downloads ~150MB of headless Chromium (`fly-deploy.yml:120`). |
| No `jini-published-typecheck` gate | The one enabled check on the deploy (`fly-deploy.yml:104-108`) is skipped; an `@jini-ai/*` registry drift failure would surface 6+ minutes into the Docker build instead of before it. |

### Content, media and themes: **a local deploy changes nothing. Say this out loud before relying on it.**

Your pages would **still not ship.** Three independent barriers block them, and removing any one
still leaves the other two:

1. **Excluded from the build context.** `Dockerfile.dockerignore:38-43` itemizes
   `sites/*/content.db` and its WAL/shm sidecars, restore points and `.bak` snapshots.
2. **Wiped from the image even if it got in.** `Dockerfile:108` is an unconditional `RUN rm -rf
   sites` in the build stage, before the final image copies from it (`Dockerfile:161`). The file's
   own comment at line 102 calls this "belt and braces" for exactly this reason.
3. **Shadowed at runtime regardless.** `fly.toml:66-68` mounts the volume over
   `/workspace/Tovu/sites`, which replaces the image's entire `sites/` tree
   (`SKILL.md:92-97`). Anything the image left there is invisible the moment the mount attaches.

What a local build *would* pick up is the **seed**, not your live content: `Dockerfile:92-100`
copies each site's `content.seed.db` and its `uploads/` into `dist/content/seed-sites/`. And the
seed only ever applies **on a first boot where `content.db` does not exist** — its gate is the
file's presence, never its contents (`SKILL.md:21-31`). Production already has a `content.db` on
its volume, so an updated seed would be copied into the image and then ignored.

**So: a local deploy solves the ref problem completely and the content problem not at all.**

### One caution before anyone runs a local deploy

This repo has **no root `.dockerignore`** — only `Dockerfile.dockerignore`, which is a
**BuildKit-only** convention. `publish-image.yml:39-45` spells out the consequence: *"A classic
`docker build` ignores `Dockerfile.dockerignore` entirely and would ship `sites/` straight into
this PUBLIC image."*

**Whether `flyctl deploy --remote-only` honors `Dockerfile.dockerignore` is UNVERIFIED** — I cannot
test it without installing flyctl and firing a deploy. If it does not, the build context uploaded to
Fly's remote builder would include your real `content.db` (chat transcripts, session auth log,
sealed provider credentials — the dockerignore's own lines 28-31 list exactly this). The final image
is still protected by the `rm -rf sites` at `Dockerfile:108`; the *uploaded context* is a separate
question and the one I cannot answer from here. Check it before the first local deploy, not after.

## 4. The real options

| Option | Trade-off in one line |
|---|---|
| **Keep dispatching the workflow** (`fly-deploy.yml`) | Reproducible and fully audited — run number, resolved SHA, logs, a queue that refuses concurrent deploys — but it can only ever ship what is pushed. Since you are pushing to `main` right now, this costs you nothing extra today. |
| **`development/scripts/fly-build.sh` locally** | Ships your working tree, unpushed work included — but needs `flyctl` installed (your rule), leaves **no record anywhere** of what was deployed, writes `tovuSha: "unknown"` unless you pass the build-arg, and skips the one enabled pre-deploy check. |
| **Fly Machines API direct** (`machines-api-path.md`) | No CLI and no CI, and its stated blocker is now closed by the GHCR image — but it is unimplemented, marked "do not implement", and needs a product decision on image publishing and versioning first. |

On reproducibility and auditability, the gap is stark and worth naming plainly: the CI path leaves a
permanent, queryable record — that is how I was able to prove releases 15 and 16 were the same
commit. **A local deploy leaves nothing.** Nobody, including you a week later, could answer "what is
running in production?" — and per §G2 the product cannot answer that question today either way,
because `tovuSha` is written into the image and read by nothing.

## 5. What I could not verify without installing something or firing a deploy

1. Whether `flyctl` honors `Dockerfile.dockerignore` (§3's caution). Needs flyctl, or a careful read
   of flyctl's context-tarball behavior in its own source.
2. Whether the GHCR image from run #1 is actually pullable, and what tags it carries. Needs a
   registry call.
3. Fly release numbers and the currently-running image digest — unchanged from §f.1, no flyctl here.
4. Whether the Fly app is currently running exactly one machine (the plugin's Rule 1). One
   read-only `GET https://api.machines.dev/v1/apps/tovu/machines` through the saved credential
   would answer it; I did not make outbound calls.
