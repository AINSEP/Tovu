# Session 4 — agent reports as they land

Session: Coordinator (Claude Opus 5, 1M) + 3 Sonnet subagents, 2026-08-15 evening.
Branch `general-work`. Dispatched from `5b035a9`.

Track chosen by the owner: **B5 → A2/A3 → C1+C2**, per the session-3 handoff's priority order.

Reports are persisted here on arrival rather than at session end, so a restart does not
re-buy the analysis.

---

## Coordinator, inline — B5 DONE (`5b035a9`)

GitHub Pages / Vercel env-var aliases. `ENV_VAR_ALIASES_BY_TARGET` accepted only
`GITHUB_TOKEN` / `VERCEL_TOKEN`; Netlify and Cloudflare had alias lists, the two the owner
actually uses did not. This is the trap the owner hit three times
(`VERCEL_ACCESS_TOKEN`, `GITHUB_ACCESS_TOKEN`).

Now: `github-pages: [GITHUB_TOKEN, GH_TOKEN, GITHUB_ACCESS_TOKEN]`,
`vercel: [VERCEL_TOKEN, VERCEL_ACCESS_TOKEN]`. `GH_TOKEN` included because it is the `gh`
CLI's documented name, so an operator already authenticated for `gh` needs no new variable.

Seven regression tests added, **all confirmed failing first**, e.g.:
`actual: 'GITHUB_TOKEN is not set — …', expected: /GH_TOKEN/`. 34/34 pass after.
Multi-alias failure messages now name every alias checked — the old single-name message
told an operator to set a variable they already had.

## Coordinator, inline — E3 DONE (no commit needed)

Five stale audit worktrees removed (`git worktree remove --force`).

**Two corrections to the session-3 handoff:**
- All five directories **still existed on disk**. The handoff guessed they might not, and
  recommended `git worktree prune` — which would have been a **no-op**, because prune only
  clears records for *missing* directories. `remove --force` was required.
- All five HEADs (`3d36d44`, `e2d0a0f`, `72c5455`, `df9a835`, `e3d41aa`) were already
  **ancestors of `general-work`**. No orphaned commits existed.

Nothing was committed from them because nothing in them was work: the only diff in all five
was the same three deletions — `AGENTS.md`, `CLAUDE.md`, `START-HERE.md` — which is the
documented peer-CLI-dispatch workaround (`AI-Dev-Shop/` is gitignored so it is absent from
every worktree, while the tracked root files tell a dispatched peer to stop and bootstrap).

---

## DeploymentTestSweep (Sonnet, testrunner persona) — D2 DONE (`cad8e9c9`)

**All six never-run deployment suites are green: 38/38.** One test fixed, zero source
defects found. The agent's own summary: "the 10-minute-not-2-hour case."

| File | Tests | Result |
|---|---|---|
| `src/export/__tests__/route-manifest.test.ts` | 10 | clean first run |
| `src/export/__tests__/site-exporter.test.ts` | 8 | 1 failed first run, fixed |
| `src/server/__tests__/routes/export-site-route.test.ts` | 5 | clean first run |
| `src/server/__tests__/routes/deployments-list-route.test.ts` | 4 | clean first run |
| `src/server/__tests__/routes/deployment-overview-route.test.ts` | 4 | clean first run |
| `src/server/__tests__/routes/dockerfile-source-route.test.ts` | 7 | clean first run |

Per-file negative verification was done properly: the agent read every test body before
running rather than trusting the aggregate count, and re-ran all six back-to-back after the
fix. `dockerfile-source-route.test.ts` mutates the repo-root `Dockerfile` and restores it —
verified byte-identical (md5) before and after, twice.

### The one failure — classified as *test wrong*, not code wrong

Test: `exportSite: reports theme files present on disk but never rendered or crawled…`

Pre-fix failure observed:
```
AssertionError: 'pages/about.html' was rendered/crawled by this export and must not be
reported as unreferenced — true !== false   (site-exporter.test.ts:170:12)
```

Cause: commit `25850029` (tri-state slug-collision override) landed *after* `3a83cf99`, the
last commit to touch this test. Before the flip, a theme page won a slug collision with a
post; after it, the colliding post wins by default. The seeded "about" post has no explicit
`overridesThemePage`, so the theme's `about.html` is now genuinely never rendered and is
correctly reported unreferenced. The test still asserted the pre-flip behaviour.

Fix was test-only: swapped `pages/about.html` for `pages/pricing.html` (a theme page with no
colliding post — the same canonical example `route-manifest.test.ts` already uses), and added
a positive assertion that `about.html` IS now unreferenced.

**Coordinator independently verified this triage** rather than accepting it: the guard
`overridesThemePage !== false` appears identically at `src/export/route-manifest.ts:154` and
`src/server/routes/site/pages.ts:780`, so the manifest and the live site genuinely agree —
intentional behaviour, not a defect. `git show --stat cad8e9c9` confirms one file, +13/-2.

### Explicitly not verified by that agent
- Coverage / mutation gates — out of scope, not run.
- The listed pre-existing failures (post-template-site-serving, database-recovery,
  menus.test.ts, admin tsc errors) — untouched, outside its file set.
- No full `npm test` or full typecheck; scoped `tsc --noEmit` clean for its six files.

---

## PublishToolProof (Sonnet, programmer persona) — A2/A3/A4 ALL DONE (`c15a4f4a`, `a1a1de25`)

48/48 across the four files it touched. `npx tsc -p tsconfig.json --noEmit` clean, full tree.

### A2 — 19/19, no fixes needed

The 542 lines of in-flight tests from `9d1339f` were correct as written; they had simply never
been executed. Coverage is broader than the handoff implied: all three tools; wiring shape;
risk-map / `sideEffects` agreement; no-token-in-schema; preview and capabilities read paths
(including "never calls `resolve()`"); and execute's full state machine — no-emitSurface
refusal, no-credential short-circuit *before* the dialog, permission check *before* the
dialog, cancel, expire, abort/abandon, confirm → export → publish, provider-error hygiene,
concurrent dialogs, dialog content.

### A3 — was NOT already provable; the trap was real and had burned this exact file

Traced: `staticPublishAgentToolCatalog` → `buildStaticPublishRegistrations` → `DOMAIN_SLICES`
→ `buildAssistantToolRegistrations` → **two independent real consumers**, both registering
every returned item with no filter of any kind:
- `agent-daemon-server.ts:282-288` — `registry.register()` loop, then `createToolExecutor`
  and `buildToolCatalogQuery` (backs `search_tools`/`describe_tool` for the MCP/spawned-CLI path)
- `byok-tool-surface.ts:279-284` — same builder, independent registry, BYOK mode

`UNWIRED_STATIC_PUBLISH_TOOL_IDS` grepped tree-wide: **zero hits, confirmed gone.** No
allowlist/denylist/risk-tier gate exists anywhere between catalog and `registry.list()`.

**The wrong-reason-pass it ruled out:** `tool-registrations.contracts.test.ts` already had a
`WIRED_CATALOGS` array built from `staticPublishAgentToolCatalog` *directly*, and its own
comment said asserting against that array is "harmless" even when a tool is unwired — because
`deployment_execute_static_publish` sat in that exact catalog for weeks while deliberately
unwired. Asserting presence against the catalog array would have proven nothing.

What it wrote instead: a **real** `ToolRegistry` via `createToolRegistry()` + `.register()`
loop (line-for-line what the daemon does, not a hand-rolled Map); the **real**
`buildToolCatalogQuery(registry)` asserted via exact-id `.describe()` (not fuzzy `.search()`,
which could false-positive); and an actual **execution** of
`deployment_get_static_publish_capabilities` through a real `createToolExecutor` with the
seeded owner principal, asserting `status: "completed"` with real 4-provider output.

Also corrected a stale comment claiming "only preview is wired... execute is never-wired —
harmless." True before this dispatch, false after — the kind of evidence-shaped comment that
encodes a stale observation and misleads the next reader.

### A4 — the gate genuinely had ZERO enforcement-level coverage

The mechanism is **not** `actorClassRule`/`ExecutionDelegate` (that transport isn't used
here). It is the MCP-UI held-open surface-exchange mechanism (ADR-055), the same one
`content_post_delete` proved out, gated by `MCP_UI_REDEEMABLE_TOOL_IDS` in
`mcp-ui-tool-calls.ts`. `deployment_execute_static_publish` is on the allowlist (added in
`f96da9d`); preview and capabilities are correctly absent.

**The gap:** all 19 of A2's tests call `surfaceExchanges.deliver(...)` directly — the store's
own API. That never touches `isMcpUiToolCallAllowed` or the real HTTP route, which checks the
allowlist before anything else. **A tool missing from the allowlist would have passed every
one of A2's tests.**

New file `mcp-ui-tool-calls-route.static-publish.integration.test.ts` (real Express app, real
route, real executor, real HTTP): full confirm round trip asserting 202 and a real export;
a security test proving the read tool gets **403 TOOL_NOT_ALLOWLISTED** from actual route
logic; and confirmation that the read tool still executes fine on the ordinary path.

**Verified by induced failure** — commented `deployment_execute_static_publish` out of
`MCP_UI_REDEEMABLE_TOOL_IDS`, reran, got the expected RED (`403 !== 202`,
`TOOL_NOT_ALLOWLISTED`), restored the file, confirmed `git diff` byte-identical to HEAD, reran
green. Real RED→GREEN evidence that the test is sensitive to the actual gate, not a tautology.

### Not verified by that agent
- No full-suite run (scoped-test policy); only files it touched.
- BYOK path's `search_tools`/`describe_tool` meta-tool dispatch not exercised end to end —
  only the shared `buildToolCatalogQuery` underneath it.
- No real provider publish (hard rule).

### Shared-index note
Had to `git restore --staged` **3 `apps/admin` files** that another agent's index entry picked
up before its A3 commit. Second confirmed instance of shared-index cross-contamination this
session; the verify-before-commit step caught it both times. Coordinator independently audited
all four commits since dispatch — **no cross-agent bleed landed.**

---

## PublishRaceFixes (Sonnet, programmer persona) — C1–C4 ALL DONE (4 commits)

Full deployment feature suite **222/222 pass** (11 files). `tsc --noEmit` clean for
`deployment/`, zero new errors.

- `d81f4218` — export hook C1 + C2
- `f21fb1fa` — publish hook C1
- `8707e067` — publish hook C2 + C3 + C4
- `03fd5230` — `StaticSiteTab.tsx` C4 UI half + fixture fix

### C1 — delayed bootstrap GET clobbers a locally-started run
Mechanism: both hooks' `seededRef` effect fires whenever `query.data` first resolves while
`seededRef.current` is still false. If `trigger()`/`publish()` set `run` to "running" before
that first GET resolves, the late GET still calls `setRun(query.data)` — overwriting "running"
with stale "idle" and killing the poll loop, since `isRunning`/`isPublishing` derive from
`run.status`.

Fix: `seededRef.current = true` set **synchronously at the top** of `trigger()`/`publish()`,
before the network `await`. JS being single-threaded, that happens-before any later resolution
of the bootstrap promise. No restructuring needed.

Pre-fix RED observed: `expected {status:'idle',...} to deeply equal {status:'running',...}`
(export); same shape with `target: null` vs `"vercel"` (publish).

Wrong-reason-pass ruled out: asserts **both** `run` equality and `isRunning`/`isPublishing`,
and explicitly `resolveInitialStatus()` + flushes two `setTimeout(0)` macrotasks — otherwise a
test that passed because the bootstrap GET *secretly never fired* would be indistinguishable.

### C2 — poll retries forever behind a stuck spinner
Mechanism: the poll `catch` block called `scheduleNext()` unconditionally, forever.

Fix: consecutive-failure ref bound at **3 (~4.5s at the 1.5s interval)** — chosen to absorb a
`tsx watch` restart blip without stranding a genuine permanent failure. Past the bound:
scheduling stops, a translated `pollError` surfaces, and `isRunning`/`isPublishing` now also
require `pollError === null` so the action button re-enables. A fresh trigger clears both.

Pre-fix RED observed: `pollError` was `undefined` (field didn't exist) and `.toContain()` threw
— deliberately chosen over `.not.toBeNull()`, which `undefined` would have satisfied.

Wrong-reason-pass ruled out: asserts `run?.status` is **still** `"running"` post-bound (proving
the outcome wasn't faked by mutating `run`), and that the call count stops changing after 6
more seconds of advanced timers (proving the loop actually stopped rather than reporting an
error while still polling).

### C3 — stale preview repopulates after editing the target
Mechanism: `checkPreview()` awaited the port then called `setPreview(result)` unconditionally.
`invalidatePreview()` clears preview on edit but never cancels an in-flight request.

Fix: `previewGenerationRef` bumped inside `invalidatePreview()` (already called by every field
setter — no new call sites). `checkPreview()` captures the generation and discards a result
whose generation moved on. **Deliberately did NOT guard the `finally` block's
`setPreviewLoading(false)`** — a discarded stale response must still stop its own spinner, or a
single edit-during-preview strands `previewLoading: true` forever.

Pre-fix RED observed: `expected {target:'github-pages', basePath:'/old', ...} to be undefined`.

Wrong-reason-pass ruled out: asserts `previewLoading` is false at the end (a stuck spinner would
otherwise masquerade as fixed) and `repo === "new"` (proving the edit really took effect).

### C4 — double-click sends two POSTs; the second's 409 clobbers the first's success
Mechanism: `publish()` had zero in-flight guard, and `publishing` (internal state) was tracked
but **never returned on the controller** — so the UI's `busy` derivation used only
server-confirmed `isPublishing`, leaving the button live for the whole click→response window.

Fix, both halves: (1) a **synchronous `publishingRef`** guards the top of `publish()` — not the
`publishing` state, because two calls in the same tick both read stale state before either
write commits. A second call is now a silent no-op, so no second POST is sent, so no 409 can
land, so a false failure message is impossible *by construction*. (2) `publishing` exposed on
the controller; `busy = controller.isPublishing || controller.publishing` in `StaticSiteTab.tsx`,
matching the export hook's existing `triggering || isRunning` pattern.

Pre-fix RED observed: `expected "vi.fn()" to be called 1 times, but got 2 times` (hook);
`getByRole('button', {name: 'Publishing…'})` not found (UI).

Wrong-reason-pass ruled out: both `publish()` calls are made inside the **same synchronous
`act()` callback** with no `await` between them, so a real double-click race is exercised rather
than two well-spaced calls that would trivially serialize.

### C5 — spec only, NOT implemented (needs a server half outside the file boundary)
Current shape confirmed on both sides: client `apps/admin/src/lib/api.ts`
`getDockerfileSource()`/`setDockerfileSource(contents)` → `GET`/`PUT
/api/admin/v1/workspaces/:id/system/dockerfile`, body `{contents}` only. Server
`src/server/routes/admin/system/dockerfile-source.ts` →
`readDockerfileSource()`/`writeDockerfileSource()` in `src/features/deployments/dockerfile.ts`.
**No revision, mtime, or hash tracked anywhere** — `writeFileSync` overwrites unconditionally.

1. Server `GET` adds an **`ETag`** — a content hash (sha256 of `contents`, or a sentinel like
   `W/"missing"` when `exists: false`). Derived, not persisted; no new storage.
2. Server `PUT` requires **`If-Match`**, compared against a **fresh** read of current disk
   contents at write time (recompute inline, never a cached value). Mismatch → **412** with a
   body carrying the current contents (or their hash) so the client can offer a real diff,
   not "try again blind."
3. **Open decision, deliberately not made by the agent:** a `PUT` with no `If-Match` should
   probably be rejected (400) rather than silently overwriting — otherwise an unpatched caller
   reintroduces the race. Note `deployment_set_dockerfile` is a **separate agent-tool caller**
   of `writeDockerfileSource`.
4. Client (not done): `use-dockerfile-source.hooks.ts` stores the ETag alongside `snapshot`,
   sends `If-Match` on `save()`, and on 412 **preserves the local draft** and surfaces a real
   conflict state with the server's current contents to compare against.

### Noticed, not fixed
- `use-dockerfile-source.hooks.ts`'s `save()` has the **exact same missing in-flight guard C4
  had** — nothing stops two rapid Saves. Natural follow-on once C5 lands.
- The two poll-bound constants are deliberately per-file, matching this codebase's existing
  choice not to share `EXPORT_POLL_INTERVAL_MS`/`PUBLISH_POLL_INTERVAL_MS` either.
- **Correction to the handoff:** the pre-existing `Mock<Procedure|Constructable>` tsc errors in
  `apps/admin` number **37, not "~20"** — verified by grep before and after. Unrelated to scope.

---

## Coordinator verification of the whole session

All **7 commits** since dispatch audited with `git show --stat`: every commit contains only its
owning agent's files. **No cross-agent bleed landed**, despite two confirmed shared-index
collisions (PublishRaceFixes lost its staging once; PublishToolProof had to
`git restore --staged` 3 `apps/admin` files). Verify-before-commit caught both.
Index empty, no unstaged tracked changes.

---

## DECISION LOG — owner decisions made this session

Recorded here durably because the SendMessage channel to running agents has failed 7+ times
tonight while reporting `success: true`. If a spec or brief does not reflect one of these, the
decision below is authoritative and the artifact needs annotating.

### D-1. Custom publish provider: S3-compatible ships first
Three options were weighed — a generic contract the host implements, a known-protocol adapter,
and a webhook passthrough. **S3-compatible wins** because it is the only one that delivers "any
host" in practice (AWS S3, Cloudflare R2, Backblaze B2, DigitalOcean Spaces, Wasabi, MinIO all
speak it) and it matches the owner's stated priority that AWS comes first. Generic contract is a
plausible second; webhook passthrough probably never.

### D-2. Protocols do NOT share a narrow field set
An earlier framing assumed every custom provider would be "base URL + access token." **The owner
explicitly dropped this**: *"they don't all have to be the same thing… separate sections with
their own fields that work independently… having five fields is fine because it's just limited to
this unique case."* Design each protocol as its own section with the fields it genuinely needs.

This matters because the original field set did not fit the winning option: S3 needs endpoint +
access key id + secret access key + bucket + region.

### D-3. SigV4 via `aws4fetch`, NOT `@aws-sdk/client-s3`
Recon (CustomProviderSpec) confirmed **no S3/SigV4 client exists anywhere in the stack** — zero
`aws-sdk`/`@aws-sdk` references in `package.json`, `node_modules`, or `src`.
`@jini-ai/devops/deploy` v0.1.2 exports only the four existing targets, `undici` its only dep.

**Decided: `aws4fetch`** (65KB unpacked, zero dependencies, 9 files).

- `@aws-sdk/client-s3` rejected on **correctness first, size second**: it encodes AWS-hosted
  conventions (region-to-endpoint resolution, credential provider chain, virtual-hosted-style
  bucket addressing) that do not reliably hold for R2/B2/Spaces/Wasabi/MinIO — so it is partly
  wrong for the exact case S3-compatible was chosen to serve. Also 3.3MB unpacked, 11 direct deps,
  tens transitive, into a Docker image that has never successfully built and already carries 22
  `file:` deps + 3 native modules.
- Hand-rolled SigV4 via `node:crypto` considered and rejected: needs only HMAC-SHA256/SHA256, but
  is easy to get *almost* right and subtly wrong (canonical request construction, payload hashing,
  URI encoding), and signing bugs surface as opaque 403s. 65KB with zero transitive deps is close
  enough to free that owning that risk is not worth it.
- `aws4fetch` being 9 files is part of the rationale: it handles the user's **secret access key**,
  so hand-auditability is a security property, not a nicety.

Implementation shape: a Tovu-local `S3CompatibleDeployTarget` against Jini's structural
`DeployTarget` interface (`{id, publish(), checkReachability()}`).

### D-4. The AWS CLI is NOT an option
Considered (owner asked directly whether the agent could download and drive it) and **rejected**:
- reintroduces `child_process.spawn` — the exact thing that blocks Tovu on Vercel/Cloudflare
- containers are ephemeral and often read-only, so a runtime download re-runs every restart
- an unsigned binary fetched at runtime and executed by an AI agent is an unacceptable attack surface
- the Docker image has still never built successfully; a runtime binary fetch makes that harder

Supporting precedent already in the codebase: `execution-mode.ts` explicitly forbids deriving the
execution mode by PATH-sniffing for a CLI binary, reasoning that *"a container with `gh` baked into
its image but no interactive shell would falsely read as self-hosted-capable."* The download idea
makes that same mistake one step later.

**Correction to a natural misreading:** `"self-hosted-cli"` mode means **a human has a real
terminal**, NOT that Tovu shells out to CLIs. There is no existing CLI-spawning publish path.

### D-5. A bucket is not a website — must be resolved in the spec
Uploading objects to S3 does not produce a served static site. It needs either S3 static website
hosting enabled (bucket website endpoint + public-read policy) or CloudFront in front. **Open:**
whether Tovu configures that, or the guidance walks the user through the AWS console. Materially
different amounts of work. Failure mode to design against: a novice whose site 403s after a
"successful" publish.

Related requirement: the per-field guidance must be **honest that AWS is harder than Vercel** —
bucket + hosting/CDN decision + IAM policy scoped to that bucket — rather than implying five
fields is the whole job.

### D-6. Dockerfile concurrency: STRICT If-Match
A `PUT` with no `If-Match` is **rejected (400)**, not silently allowed. Permissive would keep
unpatched callers working but leaves the race open through `deployment_set_dockerfile` — the agent
tool, which is a separate caller of `writeDockerfileSource` — and gives the agent no signal it
could act on. Strict + updating the agent tool in the same change is what makes this
"agent check and fix" per the owner's request. 412 carries the current contents so both the human
UI and the assistant can reconcile rather than retry blind.

### D-7. Complexity bar for new hook work: under 10, by convention not by gate
Owner asked for cyclomatic AND cognitive complexity under 10, plus ~100% on all four coverage
metrics, for hooks work. **The repo's configured gate is 15, severity `warn`** (`eslint.config.mjs`
lines 46-47), with a tracked debt file (`development/scripts/admin-complexity-debt.json`) and a
`check:admin-complexity-drift` script. So the owner's bar is **stricter than CI enforces** and
nothing will automatically catch a function landing at 12.

Applies to new work, **not** retroactively to all of `apps/admin` — tightening the rule to 10
would turn every existing 10-15 function into a new warning and require regenerating the debt file.

Verified for `features/workspace/hooks`: **zero violations at threshold 10** for both
`complexity` and `sonarjs/cognitive-complexity`. No refactor was needed.

### D-8. Agent-assisted credential entry: `buildFormSurface`, secret never reaches the model
The settings-write exclusion turned out **narrower than assumed**. It is not "no settings-write is
agent-reachable" — only the four GENERIC write tools (`settings_set`/`clear`/`reset`/
`register_definitions`) are excluded, while a curated narrow write (`settings_set_ui_preference`) is
directly model-callable with no gate. Publish credentials are a third category.

Mechanism: `@jini-ai/ui/mcp-ui/surfaces` ships **`buildFormSurface`** — an editable form with
pre-filled fields and per-field hints — not merely the `buildConfirmationSurface` used by
`content_post_delete` and `deployment_execute_static_publish`. Already wired end to end and proven by
a real tool (`src/assistant/demo-choices-tool.ts`), not a mock.

**Approved design:** the assistant proposes non-secret pre-fill only (bucket, region). **There is no
field for the secret in the tool's input schema at all** — the same structural guarantee the publish
tool already uses for tokens. The human types the secret into the rendered form inside their own
authenticated session; the handler returns only `{saved, providerId, label, connected}` and never
echoes the secret. The model never sees or supplies it at any point.

This is a **structural** guarantee, not a convention — state it that way anywhere it is documented,
or a later reader will be tempted to "simplify" it.

### D-9. Masked secret field is BLOCKING — fix `@jini-ai/ui` first
`@jini-ai/ui`'s form-surface `StringField`/`TextInputProps` has **no masked/password input type**
(verified by reading both `.d.ts` files in full). A `secretAccessKey` typed into the proposed form
would render as **plain visible text**.

**Decided: blocking.** Add `secret?: boolean` → renders `type="password"` upstream before the S3 flow
ships. Rationale: it is a straight regression against the existing admin credential row (already
`type="password"`); the owner screenshots this UI constantly (38 loose PNGs cleared from the repo
root tonight), so a plaintext secret lands in screenshots and screen shares; and `@jini-ai/ui` is the
owner's own package, so the cost of doing it right is low.

### D-10. Guidance-table backfill DEFERRED; labeled/multi-connection UX REJECTED
- **Backfill:** build the server-side FieldGuidance table for **S3-compatible only**. Backfill the
  other four providers later if the pattern holds. Refactoring four working publish paths to serve
  one unshipped provider widens the blast radius of a design that has never run.
- **Labels:** **No.** The owner killed labels explicitly on 2026-08-15 (*"why is there a label there?
  that's completely useless"*) and the flat one-row-per-provider shape was a deliberate redesign
  (`9eaa935`). Do not reintroduce a second UX pattern in the same tab for S3 alone. Revisit for ALL
  providers at once if a real multi-bucket need appears.

### D-11. `publicUrl` is a REQUIRED 6th field — "five fields is fine" was not a cap
`DeployPublishResult.url` and `StaticPublishOutcome.url` are both **non-optional** in existing code,
and S3 PUT responses carry no public URL the way the Vercel/Netlify APIs do. The owner's *"having
five fields is fine"* was permission to exceed a narrow shared shape, **not a limit**. Agent pushback
on this was correct and is accepted.

### Harness note
SendMessage delivered on **attempt 8** after 7 consecutive silent failures that all returned
`success: true`. The channel is **unreliable, not dead** — worth retrying, never worth relying on.
The spawn prompt remains the only dependable channel.

---

## Still open

Unchanged from the session-3 handoff's NOT-DONE list except as marked above.

**A1 — the real publish — is now the only untested link in the chain**, and it needs the owner:
it deploys live to the public internet with their tokens, with no draft step. Safe shape is a
NEW project name (e.g. `tovu-publish-test`), never one of the four existing Vercel projects.

Other open items: **B1** (custom provider — blocked on a design choice, not capacity),
**B2/B3/B4** (the UX pass — now unblocked, `StaticSiteTab.tsx` is free), **C5** (spec'd above),
**C6/C8**, **D1/D3/D4/D5**, **E1/E2/E4/E5/E6/E7**.
