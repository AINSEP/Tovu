# ADR-064: Agent-Guided Deployment — "Deploy My Site" From the Admin Chat

- Status: PROPOSED — requires owner sign-off. No implementation exists; nothing here has been built.
- Date: 2026-08-31
- Author: Claude Opus 5 / Leon Aburime
- Supersedes: nothing.
- Relates: `development/docs/deployment/deployment-constraints.md` (the governing doc this ADR builds
  directly on top of — its §9 product-audience split and §6 forms-cost table are load-bearing here,
  not re-derived), ADR-053/055 (MCP-UI confirmation transport and return path — the exchange mechanism
  this ADR's new credential tool reuses verbatim), ADR-058 (site-assistant credential store — the
  precedent for "a secret must never transit the model," reused here for a different credential
  class), ADR-041/ADR-045 (the human-only-lever discipline the existing `deployment_set_dockerfile`
  tool already observes for `docker build`/`docker push`, which this ADR extends rather than revokes).

## Context

The ask: a non-technical owner types "deploy my site" in the admin chat and is guided to a working
deployment, including collecting whatever credentials that requires — with one hard invariant: **a
credential must never pass through the agent's message stream.** A token typed into chat lands in the
transcript, the run events, `ai_chat_messages`, and the model provider's logs. The collection surface
must POST directly to Tovu's server; the agent learns only an opaque result.

This is not greenfield. Most of the hard infrastructure already exists and has already solved this
exact secret-handling problem once:

- **`assistant_ask_choice`** (`apps/website/src/assistant/ask-choice-tool.ts`, shipped `c8e54ddd`) —
  a held-open MCP-UI form the agent calls to ask the operator a real single/multi-select question and
  block until answered. Timeout and abandonment are already first-class, not edge cases bolted on:
  `awaitAskChoiceSubmission` distinguishes `expired` (the form's TTL elapsed with no answer) from
  `cancelled` (the operator explicitly dismissed it) from a run-ending abort, and returns a
  `submitted:false` result naming which, with an explicit instruction baked into the response text —
  *"Do not assume any answer"* — so the model cannot silently treat a timeout as a "no." This ADR's
  flow reuses this tool as-is for every yes/no and pick-one moment; it needs no changes.
- **`deployment_propose_custom_provider_credential`** (`features/deployments/publish-agent-tools.ts`)
  is the existing, shipped answer to "how does a credential-collection surface avoid the model" — and
  it is the single most important piece of prior art for this ADR, because it already solves this
  ADR's hardest constraint for one vendor family (S3-compatible). Its shape: the agent calls it with
  no secret fields at all (its schema has no `accessKeyId`/`secretAccessKey` property for the model to
  fill in, correctly or otherwise); it opens a `SurfaceExchangeStore` exchange and renders an MCP-UI
  form; the operator's browser submits that form as a POST to
  `/api/admin/v1/mcp-ui/tool-calls` (Tovu's session-authenticated proxy in front of the agent
  daemon); that route's Shape-1 branch (`mcp-ui-tool-calls-route.ts`) **never calls
  `toolExecutor.execute()`** — it calls `surfaceExchanges.deliver()` directly, which resolves the
  parked `askOnce()` promise inside the tool's own Node.js handler with the raw form params. The
  secret is read by `answer.params` inside that handler, sealed via `createVendorCredential`, and
  never returns to the model — the tool's own return value is `{ saved: true, providerId, connected }`
  or a failure shape that never echoes a field value. This is precisely the "opaque result like
  `credential saved, id=cred-7`" the dispatch specified, already built and already shipped. §Decision
  below extends this exact pattern rather than inventing a second one.
- **`vendor-credentials`** (`features/vendor-credentials/types.ts`) — `VendorId` is a closed union:
  `github | gitlab | bitbucket | vercel | netlify | cloudflare | s3-compatible`. Fly, Railway, and
  Render are not modeled. The union, its per-vendor `*VendorConnectionInput` interfaces, and its
  `VendorCredentialSetRepoPort` are all designed for exactly this kind of extension (each existing
  vendor is its own closed-union arm plus one interface), not a one-off.
- **`features/deployments/static-publish/`** wraps `@jini-ai/devops/deploy` for five targets
  (`github-pages`, `vercel`, `netlify`, `cloudflare-pages`, `s3-compatible`) via
  `deployment_get_static_publish_capabilities` / `deployment_execute_static_publish` — a complete,
  already-shipped conversational flow for the static-export branch of this ADR's decision tree. No new
  work is needed for that branch beyond conversational sequencing (§Decision D1–D2).
- **`apps/admin`'s Deployment panel already has three tabs — Overview, Static Site, Dockerfile** — not
  the "Home / Providers / History" shape `deployment-constraints.md` §9 described as merely agreed;
  that shape has partly landed under different names, and a fourth, `Full Site` (`rules.ts`), already
  lists GitHub/Railway/Render/Fly-shaped rows as `status: "planned"` with the comment "there is no
  backend to store credentials yet, so nothing here can honestly claim [connected]." This ADR is the
  design that turns Railway/Render (and Fly) from `planned` into real.
- **The Overview tab's backend, `buildDeploymentOverviewSnapshot()`
  (`server/inbound/admin-http/routes/system/deployment-overview.ts`), already reads every env var this
  ADR cares about** — `TOVU_ADMIN_PASSWORD`, `TOVU_ADMIN_USER`, `TOVU_INTEGRATIONS_ROOT_KEY`,
  `JINI_AGENT_DAEMON_PORT` — presence-only, never value, plus `resolveRuntimeMode()`, the default-owner-
  password check, DB/uploads paths, and which publish CLIs (`gh`, `vercel`) are on `PATH`. **It has no
  agent-tool wrapper today** — only the admin UI's `OverviewTab.tsx` reads it. §Decision D1 makes this
  data agent-readable by wrapping the same function, not by rebuilding it.
- **A real, shipped `Dockerfile` and `Dockerfile.dockerignore` already exist at the repo root**
  (`development/docs/deployment/deployment-constraints.md` §3's "No Dockerfile" row is now stale on
  this point, the same way its static-exporter row went stale before it — flagged in
  §Corrections-to-ground-truth below). The Dockerfile's own header is the authoritative confirmation of
  the dispatch's git-based-deploy claim (§Corrections). It is a **multi-stage build whose context must
  be the PARENT directory** (`docker build -f Tovu/Dockerfile ..`), producing a runtime image that
  expects `/workspace/Tovu/sites` mounted as a volume, listens on `PORT` (default 3000), and requires
  `TOVU_ADMIN_PASSWORD`/`TOVU_INTEGRATIONS_ROOT_KEY` to be set for a safe production boot.
- **`docker build`/`docker push` are already, deliberately, a human-only terminal step** —
  `agent-tools.ts`'s own header states it: a Dockerfile edit "still needs a human to run
  `docker build`/`docker push` in a terminal," and neither `deployment_get_dockerfile` nor
  `deployment_set_dockerfile` (both already shipped) touch the build process. `DockerfileTab.tsx`
  repeats this to the human twice in its own copy: *"Building is a terminal command… not a button
  here"* and *"Saving here only replaces the file's contents — it does not build or deploy anything."*
  This is a **standing architectural decision**, not an accidental gap. §Decision D3 explicitly
  preserves it rather than silently reopening it.

## Corrections to the dispatch's ground-truth list

1. **Claim 3 ("Git-based deploy on Railway/Render cannot work… build locally → push an image →
   deploy the image") is correct, and stronger evidence exists than asked for: the Dockerfile that
   would prove it already exists**, not merely inferable from `package.json`. Its own header states
   the exact numbers precisely (22 `file:` deps total: 12 root + 10 `apps/admin`, not just "13 root")
   and independently rules out two other fixes (`npm pack`-then-rewrite, `--install-links`) because
   Jini's internal deps use pnpm's `workspace:*` protocol, which npm cannot resolve either way. Verdict
   unchanged, evidence upgraded.
2. **`development/docs/deployment/deployment-constraints.md` §3's "Container packaging: No
   Dockerfile…" row is now stale**, the same way its static-exporter row was flagged stale and
   corrected in the same document. A real `Dockerfile`/`Dockerfile.dockerignore` ship today. This is
   worth a companion correction pass on that doc (not done here — out of scope, report-only).
3. **The env-var list is confirmed exactly as given, with the exact same names, in
   `deployment-overview.ts`'s own `REQUIRED_ENV_VAR_NAMES`** — plus `JINY_AGENT_DAEMON_PORT`, not named
   in the dispatch but already surfaced by the existing Overview tab (worth including in this ADR's own
   readiness check for consistency, §Decision D1).
4. **Two more pieces of infrastructure than the dispatch named are directly relevant and already
   shipped**: the Overview tab's env-var/CLI-presence snapshot (no agent-tool wrapper yet — a real
   gap this ADR closes) and the Full Site tab's already-stubbed Fly/Railway/Render rows (confirms the
   dispatch's "not modeled at all" claim for `VendorId`, but shows the admin UI already anticipated
   these three specifically — this ADR is not choosing new vendors, it is completing a choice already
   visible in the UI).
5. **Nothing in this codebase runs `docker build`, `docker push`, `flyctl`, or a Railway/Render deploy
   CLI anywhere** — verified by grep across `apps/website/src` and `apps/admin/src`. The "build locally,
   push an image" path is 100% unautomated today; §Decision D3 is a real design decision, not
   ratification of existing behavior.

## Decision

### D1 — The agent's very first move is a read, never a question

Before asking the operator anything, the agent calls a new read-only tool,
**`deployment_get_deploy_readiness`**, which wraps `buildDeploymentOverviewSnapshot()` verbatim (same
function, new agent-tool registration in `features/deployments/agent-tools.ts` — zero duplicated logic)
plus one additional read: whether the current site has any of the five server-dependent surfaces wired
(a published contact form, newsletter signup, comments enabled, or a payments provider configured —
each a cheap existence check against that domain's own repo, not a new subsystem). This tells the agent,
before it says a word: current mode, whether the default owner password is still active, whether a
Dockerfile exists, which publish CLIs are on `PATH`, and — critically — **whether the forms tradeoff
is even live for this specific site**, not a generic warning.

Why a read first, not a question first: the pivotal question in §D2 is dishonest if asked generically.
"Static hosting drops your contact form" said to an owner whose site has no contact form is scary and
false-alarming; said to one whose site has three forms and a paid newsletter, it is the single most
important sentence in the whole conversation. `deployment_get_deploy_readiness` is what lets the agent
say the true, specific version.

### D2 — The pivotal question, asked once, in plain language, informed by D1

The agent asks — via `assistant_ask_choice`, single-select, **before** collecting any credential —
something in the shape of:

> "Your site currently uses: [contact form, newsletter signup]. These need a real running server to
> work — they will stop working if you publish a static copy instead. Two ways to put your site
> online:
> - **Static copy** — faster to set up, cheaper or free hosting, but [contact form, newsletter
>   signup] will break.
> - **Full server** — everything keeps working, needs more setup (a hosting account that can run a
>   container, and a few things I'll walk you through).
>
> Which do you want?"

If D1 found no server-dependent features in use, the static branch's downside line is omitted entirely
rather than shown as a hedge ("might not apply to you") — an owner with a brochure site should not be
frightened by a caveat that provably does not apply to them.

**Timeout/abandonment (the dispatch's named limitation, handled explicitly):** `assistant_ask_choice`
already returns `{submitted:false, reason:"expired"|"cancelled"}` on a lapsed or dismissed form, with
the built-in instruction not to assume an answer. This ADR's system-overlay addition (§D6) instructs
the agent: on `expired`, say plainly that the question is still open and ask again in the same message
turn, once; on a second `expired` or on `cancelled`, stop and tell the operator in prose that deployment
is paused and to say "deploy my site" again when ready — never silently pick a default, and never retry
a third time unattended (this is also required by the shop's own "never dispatch an agent that can
loop" discipline, applied here to a chat turn rather than a subagent). **Resume is free**: because
`assistant_ask_choice` "writes nothing, deliberately" (its own header), there is no partial state to
reconcile — a fresh "deploy my site" message re-runs D1 and re-asks D2 with no cleanup required. The
same is true of every held-open credential exchange this ADR adds in D4: they are asked again from
scratch on resume, not resumed mid-form, matching `assistant_ask_choice`'s own posture exactly.

### D3 — Branch A: static export. Reuse wholesale, add nothing but conversation

If the operator picks static, the agent drives the **already-shipped** flow:
`deployment_get_static_publish_capabilities` → `assistant_ask_choice` to pick a target among the five
→ if `s3-compatible` and no credential exists, `deployment_propose_custom_provider_credential` (already
handles the secret-never-transits-the-model requirement) → `deployment_execute_static_publish`. No new
tool, route, table, or credential type is needed for this branch. The only new work is system-overlay
copy (§D6) sequencing these calls in the right order and stating the forms tradeoff from D2 one more
time, concretely, right before the publish call — a last-chance confirmation, not a new mechanism.

### D4 — Branch B: full server. Model Fly/Railway/Render as real vendors; reuse the exchange pattern; do not reopen the docker-build boundary

This is where real new work is needed. Four pieces, each modeled tightly on an existing precedent:

**D4a — Add `fly | railway | render` to `VendorId`.** Three new closed-union arms in
`vendor-credentials/types.ts`, mirroring the existing ones exactly:

```ts
export interface FlyVendorConnectionInput {
  readonly vendorId: "fly";
  readonly token: string; // `flyctl auth token`
}
export interface RailwayVendorConnectionInput {
  readonly vendorId: "railway";
  readonly token: string; // a Railway API token (account- or project-scoped)
}
export interface RenderVendorConnectionInput {
  readonly vendorId: "render";
  readonly token: string; // a Render API key
}
```

Cost: three interfaces, three `VENDOR_IDS`/union entries, three branches in `store.ts`'s validation
switch, three rows in the admin's Full Site tab moving from `status: "planned"` to real, three
`tokenPageUrl` entries for the "where to get one" links `StaticSiteTab.tsx`'s sibling pattern already
establishes for the five static targets. This is additive and bounded — no migration of existing rows,
no change to any existing vendor's shape, the same kind of extension the S3-compatible-is-a-protocol-
not-a-company exception already anticipated this union would need to absorb.

**D4b — One new tool, not three, and not a widened existing one — `deployment_propose_host_credential`.**
Same reasoning `ask-choice-tool.ts`'s own header gives for why it is a new tool rather than a widened
`assistant_demo_choices`: `deployment_propose_custom_provider_credential`'s fixed two-secret-field
S3 form has a different shape and a different write target (`vendor-credentials` via the S3-only path)
than a single-token host credential needs, and forcing one schema to serve both would either break the
S3 form's fixed shape or force every future vendor through S3's field set. The new tool:

- Input schema: `{ vendorId: "fly" | "railway" | "render" }` — **no secret field**, identical posture
  to `deployment_propose_custom_provider_credential`'s own schema comment ("THIS SCHEMA HAS NO FIELD
  FOR [secrets] — you cannot supply, see, or guess them").
- Handler: opens a `SurfaceExchangeStore` exchange exactly like the S3 tool, renders a one-field MCP-UI
  form ("Paste your Fly/Railway/Render API token"), and is delivered via the **same**
  `/api/admin/v1/mcp-ui/tool-calls` Shape-1 path — no new transport, no new route.
- **Must be added to `MCP_UI_REDEEMABLE_TOOL_IDS` (`mcp-ui-tool-calls.ts`) in the same change that
  registers it.** This is not a stylistic note — `assistant_ask_choice` itself shipped on 2026-08-31
  with this exact omission: the form rendered correctly and every submission 403'd, unusable in
  production from day one, caught only by a follow-up integration test. The identical mistake on this
  tool would fail *silently from the operator's point of view* in the worst possible way: the operator
  pastes a real hosting-provider token into a form that appears to work, submits, and gets a 403 — at
  which point the token has already left their clipboard into a browser `fetch` body. It is not logged
  or stored anywhere (the 403 happens before any write), but the UX failure is severe enough that this
  ADR calls it out as the single highest-risk implementation step, not a footnote.
- Return value: `{ saved: true, vendorId, credentialId }` or the same
  `{saved:false, cancelled|expired|abandoned|invalid}` shapes the S3 tool already defines — reused
  verbatim, not redesigned.

**D4c — Setting Tovu's own env vars on the chosen platform is a SERVER-TO-PLATFORM call, never a
chat-visible value.** A new tool, `deployment_configure_host_environment`, takes the saved
`credentialId` from D4b (never the raw token) and:

- Generates `TOVU_INTEGRATIONS_ROOT_KEY` **itself**, server-side, via `randomBytes(32).toString("hex")`
  — never asks the operator to type or invent one. This is the single most consequential value in the
  whole flow (§Honest failure modes) and the agent must never treat it as something a human supplies.
- Sets `TOVU_ADMIN_PASSWORD` to either an operator-chosen value (collected through the *same* held-open
  MCP-UI exchange pattern as D4b, a password field instead of a token field — reusing the mechanism,
  not the specific tool) or a server-generated one if the operator declines to choose, but never a
  hardcoded default — this tool's whole job is to make sure the shipped default (`tovu-dev`,
  `DEFAULT_OWNER_PASSWORD`) never reaches a production deploy, closing `deployment-constraints.md`
  §4.2 for the one path this ADR controls.
- Calls the target platform's own "set app secret/env var" API (Fly's `flyctl secrets set` equivalent
  REST call, Railway's variables API, Render's environment-variable API) using the decrypted vendor
  token — decrypted only inside this handler, never returned.
- Returns only `{ configured: true, envVarsSet: ["TOVU_RUNTIME_MODE", "TOVU_ADMIN_PASSWORD", ...] }` —
  names, never values, matching `DeploymentEnvVarStatus`'s existing "presence only, never value"
  convention from `deployment-overview.ts`.
- **Must show the operator the root key exactly once, outside the chat transcript, with an explicit
  acknowledgment gate.** See §Honest failure modes — this is the one value in the entire flow this ADR
  does NOT try to keep server-side-only, because the alternative (never showing it to the human at all)
  makes it unrecoverable by construction with no human copy anywhere. The mechanism: a dedicated
  one-time admin-UI screen (not chat, not MCP-UI-in-chat — a real admin route, session-authenticated,
  rendered once from a value that is never written to any log or transcript), analogous to a wallet
  seed-phrase reveal, gated behind an `assistant_ask_choice` confirmation ("I have saved this key
  somewhere safe") before the deploy proceeds to D4d. This is new UI surface this ADR is naming, not
  claiming already exists.

**D4d — `docker build`/`docker push`/`flyctl deploy` stay human-terminal operations. This ADR does not
reopen that boundary.** The agent's job is to make the commands exact and copy-paste-safe, not to run
them. A new read-only tool, `deployment_generate_container_deploy_commands`, composes (never applies —
same posture as the already-shipped `deployment_generate_bucket_hosting_setup`) the literal command
block, parameterized with: the correct build context (`docker build -f Tovu/Dockerfile -t <tag> ..`,
run from the parent directory, per the Dockerfile's own documented invocation), the chosen platform's
push/deploy command using the app identity the operator confirmed, and the volume-creation step for
that platform (Fly: `fly volumes create`; Railway: attach a volume in project settings, which has no
CLI equivalent — the agent must say so and link the exact console step rather than inventing a
nonexistent command; Render: Render's own persistent-disk config, same caveat). The agent relays this
as prose plus copyable code blocks — the same relay pattern `deployment_generate_bucket_hosting_setup`'s
own tool description already prescribes — and explicitly tells the operator building/pushing happens
in their own terminal.

Why preserve this boundary rather than have the agent run it (it technically could — Tovu's assistant
is a spawned coding-agent CLI with real shell access, not an API-constrained tool list): this is an
**existing, deliberate** decision (`agent-tools.ts`'s own header, ADR-041/045's human-only-lever
framing) made for a real reason — a container build/push is a long-running, resource-intensive,
failure-prone operation with no natural confirmation point partway through, unlike the discrete,
individually-confirmable writes (`deployment_execute_static_publish`, `content_post_delete`) this
codebase already gates through the exchange mechanism. Reopening it is a bigger decision than this ADR
was asked to make, and the dispatch's own hard constraint (no credential in the message stream) does
not require it — every credential this ADR collects is consumed server-side in D4c, before D4d ever
runs; the terminal commands D4d generates carry no secret at all, only public identifiers (app name,
image tag, registry host).

**D4e — Verification is a poll, not a "trust me."** After the operator confirms (in prose, or via a
final `assistant_ask_choice` "I ran the commands — check it now?") that they ran the D4d commands, a
new tool, `deployment_verify_host_deployment`, does two checks using the saved credential
(server-side): (1) the platform API confirms the app/service is running and a volume is attached — a
missing volume is reported as a **blocking** finding, not a warning, because ground-truth item 5 means
the very next deploy silently destroys the site; (2) an HTTP call to the deployed URL's `/readyz` (never
`/health` alone — `/readyz` is 503 until migrations/seeding finish, so it is the honest "actually ready"
signal, not merely "the process started"). The agent's own return message must never say "your site is
live" without both checks passing; a `/readyz` timeout after the platform reports the volume attached
correctly is reported as "the container may still be starting (~60s first boot) — I'll check again," not
silence or a false positive.

### D5 — What is NOT in this first slice

- **Any change to `VendorId`'s five static-publish targets or the S3-compatible flow** — untouched.
- **OAuth/device-code connection for Fly/Railway/Render** — v1 is PAT paste, matching every existing
  vendor in this union; none of the seven existing vendors use OAuth here either.
- **Running `docker build`/`docker push`/`flyctl deploy` from the agent** — deliberately out (§D4d).
- **Root-key rotation** — `TOVU_INTEGRATIONS_ROOT_KEY` is generated once at D4c and never rotated by
  this flow, matching ADR-058 §8's identical "set once, never rotates" posture for the same env var.
- **Re-deploy / update flow.** This ADR designs the FIRST deploy only. A second "deploy my site" on an
  already-deployed instance should detect that state (via D1's readiness read extended to check for an
  existing saved host credential) and route to a different, unbuilt "push an update" conversation —
  named here as a real gap, not designed.
- **Multi-tenant hosted SaaS** (`deployment-constraints.md` §9 audience 1, blocked on §4.1) — entirely
  out of scope; this ADR is squarely audience 2 (self-hosted, one instance, one owner) even though the
  point of an agent-guided flow is to make that audience's setup approachable to someone non-technical.
- **Automated backup/restore of the `sites` volume** — named as a gap in §Honest failure modes, not
  solved.
- **A companion correction pass on `deployment-constraints.md` §3's stale Dockerfile row** — noted in
  §Corrections, not performed (report-only dispatch).

## Honest failure modes

- **Wrong host chosen.** Once a Fly/Railway/Render app or an S3 bucket has real state (an app created,
  a credential saved), switching hosts mid-flow means orphaned platform-side state the operator may not
  know how to clean up themselves. Mitigation: `assistant_ask_choice` re-confirms the specific host by
  name (not just "static vs. server") **before** D4b collects a credential — matching the existing
  GitHub-owner-confirmation pattern in `deployment_execute_static_publish`'s own schema, which already
  refuses to guess an identity and always asks the human to confirm explicitly.
- **Forms silently broken.** Solved structurally by making it D1→D2's first question rather than a
  disclaimer, and repeated once more immediately before `deployment_execute_static_publish` runs
  (§D3). Residual risk: a site that gains a form or newsletter block *after* a static deploy has no
  ongoing check — this ADR does not design a "you added a form, your static deploy is now stale"
  detector; that is a real, separate gap.
- **`TOVU_INTEGRATIONS_ROOT_KEY` lost.** Every vendor credential and the site-assistant credential
  (ADR-058) sealed under it become permanently undecryptable — this is not a soft failure, there is no
  recovery path, by the same design ADR-058 §9 already accepts for this exact env var. This ADR's D4c
  is the first time this key is minted for a human who did not choose to set it themselves, which
  raises the stakes on the operator actually seeing and saving it once — hence the mandatory one-time
  reveal-and-acknowledge gate in D4c, not a "we'll show it in Settings later" deferral.
- **Disk/volume not mounted.** Silently loses `content.db`, uploads, and edited themes on the platform's
  next redeploy — a WordPress-class data-loss bug with no error at deploy time. D4e treats a missing
  volume as blocking specifically because this failure mode produces no symptom until it is too late to
  matter.
- **Docker not installed / build fails on the operator's machine.** A real, likely-common failure this
  ADR does not solve: a non-technical owner asked to run `docker build` may not have Docker Desktop
  installed at all. The agent's honest move is to say so plainly and point at Docker's install page —
  not to attempt a workaround (there isn't one that avoids the "build locally, push an image" constraint
  from §Corrections item 1) and not to silently fall back to the static branch as if it were equivalent
  (it is not, per D2's whole premise).
- **Platform-side env var API rejects the write** (bad token scope, rate limit, platform outage). D4c
  must fail closed and report which specific env var failed to set, never claim partial success as
  complete — same discipline `mcp-ui-tool-calls.ts`'s own header credits `runner-tools.ts` for: "a
  silent no-op… is worse than either" outcome.

## Rejected alternatives

- **Widen `deployment_propose_custom_provider_credential` to accept any vendor.** Rejected per D4b:
  different field shape (one secret vs. two), different write target semantics, and the exact
  "why a new tool, not a widened one" precedent `assistant_ask_choice`'s own header already established
  for an analogous choice on this same codebase.
- **Let the agent run `docker build`/`docker push`/`flyctl deploy` itself**, using its existing
  shell-spawning capability. Rejected in D4d: reopens a standing, deliberate architectural boundary
  (ADR-041/045-class human-only-lever reasoning already applied to this exact operation) for a
  long-running, hard-to-confirm-partway operation, and is not required by the dispatch's actual hard
  constraint (no credential in the message stream) — every secret is already consumed before D4d runs.
- **Never show `TOVU_INTEGRATIONS_ROOT_KEY` to the human at all** (generate and store it purely
  server-side, e.g. in a file next to the deploy config). Rejected: makes the key unrecoverable *and*
  unbacked-up by construction — worse than a wallet-seed-phrase UX, not better, and directly at odds
  with the fact that this key protects real, paid-for credentials the operator has just entered.
- **Ask the operator to paste `TOVU_INTEGRATIONS_ROOT_KEY` or `TOVU_ADMIN_PASSWORD` into chat.**
  Rejected outright — exactly the invariant this whole ADR exists to prevent, and already explicitly
  called out as forbidden in `deployment_get_static_publish_capabilities`'s own shipped tool
  description ("Do NOT ask the user to paste an API token… into this chat, ever, for any reason").

## Re-evaluation triggers

- A second `SecretSealerPort`/held-open-credential consumer pattern emerges that this ADR's
  `deployment_propose_host_credential` doesn't cleanly cover (e.g., a vendor needing more than one
  secret field) — re-evaluate whether a single generalized credential-proposal tool (parameterized by a
  field-schema, not a fixed vendor list) is now worth the complexity it would have cost to build here
  first.
- ADR-058's "root key set once, never rotates" assumption changes — this ADR's D4c would need a rewrap
  step for every already-deployed instance, not just newly-deployed ones.
- `deployment-constraints.md` §4.1 (multi-workspace hosting) gets built — reopens whether this ADR's
  entire "one instance, one owner" framing should widen toward the hosted-SaaS audience it explicitly
  scoped out.
- A re-deploy/update conversation gets designed (§D5) — should reuse D1's readiness read and D4's
  credential store, not duplicate them.

## Handoff

Locked: the decision-flow order (D1 read → D2 ask → branch), reuse of `assistant_ask_choice` and
`deployment_propose_custom_provider_credential`'s exchange mechanism verbatim, the three new `VendorId`
arms, the five new tool names and their I/O shapes (D4b–D4e), and the D4d human-terminal boundary.
Not locked, and owned by implementation: exact MCP-UI form copy/field labels, the one-time root-key
reveal screen's concrete admin route and component, and the precise platform-API calls for each of
Fly/Railway/Render's "set env var" and "check volume" operations (verify each against that platform's
current API before coding — not verified here, out of this ADR's research budget). **The single
highest-risk implementation step, called out explicitly so it is not missed twice**: whichever change
registers `deployment_propose_host_credential` (and the password-collection variant in D4c) MUST add
those tool ids to `MCP_UI_REDEEMABLE_TOOL_IDS` in `mcp-ui-tool-calls.ts` in the same commit — this is
the exact mistake `assistant_ask_choice` already made once, and it fails in the worst place: after a
real secret has left the operator's browser.
