# Terra (gpt-5.6-terra, xhigh) backend audit — 2026-08-16

Dispatched against a **frozen worktree snapshot at `65b77bc9`** (two agents were editing the live
tree). Scope: final source state of `src/features/**`, `src/server/**`, `src/assistant/**` only,
per this repo's `AGENTS.md` audit-scope rule. Run was clean: `turn.completed`, zero `error`/
`turn.failed` events, 92 `command_execution` events.

Terra labelled all 7 findings **PROVEN**. The coordinator independently spot-checked four.
**One of the four did not survive.** Confidence labels from a peer are claims, not evidence —
the annotations below are what the coordinator verified directly against the source.

## Verified

| # | Finding | Terra | Coordinator verdict |
|---|---|---|---|
| 1 | Assistant publish bypasses the admin route's single-flight guard | PROVEN/high | **CONFIRMED** |
| 2 | `export-run.ts` `currentRun` is process-local; server + daemon can export into one dir | PROVEN/high | **CONFIRMED — but self-documented** |
| 3 | `publishStaticSite` violates its own "Never throws" contract | PROVEN/medium | **CONFIRMED, and worse than reported** |
| 5 | S3 target leaks raw upstream response body; comment denies it | PROVEN/medium | **NOT SUSTAINED** |
| 4, 6, 7 | see below | PROVEN | not yet verified |

### 1 — CONFIRMED. Assistant publish has no single-flight guard.

`server/routes/admin/system/publish-site.ts:210` guards with `if (currentRun.status === "running")`.
`features/deployments/tool-registrations.ts:101` applies the same guard to
`deployment_trigger_export`. But `publish-agent-tools.ts:824` calls `publishStaticSite` directly
with **no** equivalent check. Two publishes to the same target clean and rewrite the same per-target
export directory. Real, and newly relevant now that the assistant publish path is live.

### 2 — CONFIRMED, but the codebase already says so.

`export-run.ts:43` carries a comment headed **"DISCLOSED CROSS-PROCESS GAP"** describing this exact
scenario, naming both processes, and concluding "there is no cross-process lock." Terra re-surfaced
a documented caveat rather than discovering one. Still unfixed, still worth fixing — but it is a
known-and-accepted gap, not a latent bug, and should be triaged as such.

### 3 — CONFIRMED, and the blast radius is larger than Terra said.

`static-publish/adapter.ts:291` documents "Never throws: every failure ...". But
`credentialSource.resolve(...)` runs at line **310**, before the first `try` at **319**; and
`buildJiniTarget(...)` at **352**, before the `try` at **354**. The credential resolver's own doc
says `@throws Whatever SecretSealerPort.open() throws`.

What Terra missed: `publish-site.ts:68` **relies on** the false contract in its own doc — "never a
thrown error re-surfaced here; `publishStaticSite` itself never throws". So an incorrect contract
has already propagated into a second module's reasoning. That raises this above medium.

### 5 — NOT SUSTAINED. Terra's evidence quote was materially incomplete.

Terra quoted `safeErrorBody` as `return (await resp.text());` and asserted the neighbouring comment
"Never leaks the response body raw" is false and should be corrected.

Actual source, `s3-compatible-target.ts:110`:
```ts
return (await resp.text()).slice(0, 300);
```
And the full comment at line 120 reads: *"Never leaks the response body raw — capped to 300 chars,
the same 'actionable but bounded' shape ..."*. The cap exists and the comment states it. Terra
dropped `.slice(0, 300)` from its quote and then criticised the comment for a claim it does not
make.

A weaker real question survives — whether 300 chars of upstream error text should reach a user or an
agent at all — but that is a design preference, not the defect reported, and nothing about the
comment needs correcting.

## Not yet verified (do not action as fact)

- **4** — `publish-credentials/store.ts:310`: changing a credential's provider on update can leave
  the old provider group with rows but no default. medium/bug.
- **6** — `deployments/tool-registrations.ts:23`: feature imports `RouteDeps` from the server
  composition root and uses a runtime `require("#src/export/index")`; the source itself documents
  the resulting cycle. medium/architecture. Consistent with the known back-edge count tracked by
  `npm run check:architecture`.
- **7** — `assistant/byok-tool-surface.ts:276`: `as unknown as AssistantToolRegistryDeps` double
  cast defeats a 24-domain intersection contract, so an under-provisioned composition compiles and
  fails only at tool-execution time. medium/refactor.

## Coverage — roughly a fifth of the requested scope

Terra disclosed this without being asked, which is the right behaviour. **Not** substantively
audited:

- `src/features/{agent-plugins,commerce,content-types,database,entries,pages,plugin-runtime,plugins,post,presentation,recovery,settings,site-glue,taxonomy,theme,tool-audit,workspace}/**`
- most of `src/server/{boot,http,middleware,modules,routes}/**`
- `src/assistant/{mcp-federation,persistence,site}/**` and the remaining assistant root modules

`apps/**` was excluded from this dispatch by design and has had no audit at all.

## Fix pass — finding #1 (2026-08-16, publish-correctness-2)

**Status: FIXED. Commit `e754ade6`.**

Confirmed by direct read: `deployment_execute_static_publish` (`publish-agent-tools.ts:858`, pre-fix)
called `publishStaticSite` directly with nothing to check — the admin route's own `currentRun` slot
(`publish-site.ts`) was a private, un-exported module variable, so there was structurally nothing for
the tool handler to check even if it had tried.

New `static-publish/publish-run.ts` extracts the shared slot, mirroring `features/deployments/
export-run.ts`'s own established pattern for the identical problem class (a domain tool-registrations
file must never import `src/server/**`, so the shared state has to live on the `features/` side for
BOTH a `src/server/**` route and a domain tool file to import it). Two entry points: `startPublishRun`
(fire-and-forget, `publish-site.ts`'s existing 202/poll shape) and `runPublishAndAwait` (blocks and
returns the outcome, for `deployment_execute_static_publish`, which has no separate poll step —
the tool call itself blocks on the human's confirmation AND the publish). Both write the ONE shared
`currentRun` slot, so either caller now sees the other's in-flight run.

Guard placement in the tool handler: immediately before the actual publish call (right after
`decision === "confirm"`, no `await` in between), NOT before the confirmation dialog opens. The
dialog can sit open for an arbitrary time awaiting a human's answer, during which another publish
could start and finish — a check made before `askOnce` would not actually close the race; this is
the last synchronous point before the real work starts.

**RED-first**, without touching git state: temporarily hand-reverted just the guard + `runPublishAndAwait`
call back to a direct `publishStaticSite` call (Edit tool only, no stash — avoids any shared-index
risk), ran the new cross-path regression test, confirmed it failed with the tool call racing straight
into the intercepted Vercel API (`PROVIDER_ERROR`) instead of being refused, then restored the fix.

New test: `publish-site-route.test.ts`'s `"a concurrent call through the ASSISTANT TOOL while the
HTTP route's own publish is in flight is refused, not raced"` — drives BOTH the real HTTP route
(`createApp`/`createRouteDeps`) and the assistant tool (`buildStaticPublishRegistrations`) against the
SAME `deps` object a single server process would actually share, proving the guard is genuinely
cross-caller, not merely within one of them.

**Deliberately NOT touched**: the separate, already-disclosed cross-process gap
(`export-run.ts`'s "DISCLOSED CROSS-PROCESS GAP" comment, replicated in `publish-run.ts`'s own header
for the same reason) — this slot is still only single-flight-correct within one OS process; the admin
server and the standalone agent daemon each load their own copy. Per the brief: closing that needs a
cross-process lock or routing the daemon's call back over HTTP, a design change to propose separately,
not a patch to fold into this fix.

**Fresh evidence, current HEAD (`e754ade6`)**:
- `npx tsc -p tsconfig.json --noEmit` — 0 errors, full project.
- `node --import tsx --test "src/features/deployments/__tests__/*.test.ts"
  "src/features/deployments/static-publish/__tests__/*.test.ts"` — 123/123 pass.
- `node --import tsx --test "src/server/__tests__/routes/export-site-route.test.ts"
  "src/server/__tests__/routes/publish-site-route.test.ts"
  "src/server/__tests__/routes/publish-credentials-route.test.ts"` — 29/30 pass. The one failure
  (`publish-site preview: github-pages ... credentialGuidance` wording mismatch) is PRE-EXISTING and
  UNRELATED — traced to commit `5b035a93` ("accept GH_TOKEN/GITHUB_ACCESS_TOKEN... aliases"), which
  changed the real guidance string without updating this test. Confirmed present both before AND
  after this fix (same assertion, same diff, reproduced by temporarily reverting my own changes).
  Not touched — outside this finding's scope; flagging for whoever owns that area next.

## Method note for the next dispatch

Terra gravitated to the publish/credential subsystem — the area it was given the most context
about — and produced 7 findings concentrated there. Future dispatches should either name the target
directories explicitly per run, or withhold the worked-example context that biases it toward one
subsystem.

One in four spot-checked findings was wrong. Budget verification into the plan; do not queue peer
findings straight into a backlog as facts.
