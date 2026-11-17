Persona: Software Architect (`AI-Dev-Shop/agents/software-architect/skills.md`) loaded and applied.

# Review of Codex's xpkg restructure plan (`xpkg-plan-result.md`)

Read-only review. Jini read at `origin/cloud/integ-1110` = `85377c74e`. Tovu read at its real `origin/cloud/integ-1110` = `d01e3dee0` (107 commits after Codex's fallback `3d0748bb2`). No tests, builds or installs ran. Scripts used: `count.py` and `kinds.py` in the session scratchpad (`.../scratchpad/xpkg/`).

## Verdict

Codex's inventory is accurate and most of its diagnosis is right. The plan as a whole is too big for what it buys: 28 batches and about 24,000–39,000 lines, just to remove the edges. About 40% of that (UI presentation ports, native platform ports, daemon HTTP ports) goes to 16 edges that are not tangles. The graph has **no cycles today**. Two of Codex's proposals break other owner rules. Moving Stripe, PostHog, Sentry, OTel and Langfuse adapters into `commerce`, `analytics`, `diagnostics` and `agent-runtime` breaks the "vendors are never Jini domain code" rule (owner, 10-23/10-26). Putting domain HTTP adapters in `<domain>/express` breaks the 11-07 "no specific server" rule. One proposal points the wrong way: merging `ui-kit` into `ui`. `ui-kit` is already the dependency-injection port, and the merge buries it inside a 740-file package with heavy peers. My recommendation: do the cheap, high-value 60 edges first (retire forwarders, delete the server preset, move types and pure helpers into core, add the small ports). Then the owner decides one question for the remaining ~16 edges. Either inject them (strict, about 10–17k lines) or name two leaf "foundation" packages (`ui-kit`, plus a narrow set of `platform` primitives) that may only import core.

## 1. Verification

### Counts (my own script over git objects; production = `src/**` minus tests/fixtures, plus nested `cms/forms`)

| Measure | Codex | Mine | Match |
|---|---:|---:|---|
| Production-source pairs | 75 | 75 | yes |
| Prod-source or dep/peer pairs | 78 | 78 | yes |
| Production occurrences | 689 | 689 | yes |
| Production files | 453 | 453 | yes |
| deps / peers / dev entries | 35 / 35 / 85 | 35 / 35 / 85 | yes |
| Test occurrences | 521 | 535 | close (different test-path regex) |

**78 pairs and 689 occurrences hold.** Of the 689: 470 are value imports, 202 type imports, 17 `import("…")` expressions. Only 2 of the 17 are runtime lazy loads. Only **8 pairs are type-only**. Exempting types would save little, and types move to core cheaply anyway.

Graph shape (78 runtime pairs): **no cycles**, longest chain 7 (user-management → admin → ui → … → core). Most depended-on: `platform` (16 pairs), `db` (10), `protocol` (7), `agentic`/`ui`/`agent-runtime` (5 each).

### What Codex missed

- **Shipped `.mjs` JSDoc types** name `@jini-ai/devops/deploy`, which is not declared: `agent-plugins/netlify/targets/netlify.mjs:16,17,22`, `agent-plugins/vercel/object-stores/vercel-blob.mjs:76`. These are dangling types for npm consumers.
- **Core itself breaks the rules.** `core/src/settings/express/contracts.ts:1` and `http.ts:1` import `express` types, and core does not declare `express` (core has no deps or peers). Core exports `./settings/express`. That breaks the 11-07 "no specific server" rule inside the one package everyone may import. Core also exports `./optional-peer` (`loadOptionalPeer`), the lazy-import helper the owner banned ("declare the dep, never lazy-import"). It is used in 9 places (cms media, daemon terminal/event-log, mcp, ui shiki, capability-providers ws, integrations).
- `agent-plugins/package.json` declares `@jini-ai/platform` and `@jini-ai/commerce` as **optional** peers. This is the pattern behind the 10-31 packaged-bridge breakage (optional peers never installed). Codex flags the commerce forwarder (`core/commerce-server.mjs:2`) but not the platform optional peer.

### Citations

I checked 27 of Codex's citations (22 Jini source/manifest lines, 5 Tovu paths at the real rev). **26 of 27 are exact.** `db/src/kernel/port.ts:64` is a blank line; the witness is at :66–69, so that one is off by two. At the real Tovu rev the cited files all exist. Line numbers drift slightly (`agent-daemon-scope.ts:519` is now :526–527; `getAgentDef`/`resolveAgentLaunch` destructured at :204). The Tovu claims still hold: Tovu does not use the server preset, only `@jini-ai/server/owner-store` in 3 CLI files. Tovu imports `@jini-ai/sqlite` and `@jini-ai/cms-forms` nowhere, and uses `@jini-ai/infra` only for `events/outbox` (no `infra/db`).

## 2. Proposals: agree or disagree

| Proposal | Verdict | Evidence / reason |
|---|---|---|
| Merge `ui-kit` into `ui` | **Disagree** | `ui-kit` is the port. Its exports `Button`, `TextField` and so on are facades over a kit the host injects through `KitProvider`/`createKit` (`ui-kit/src/react/index.ts`; package description: "Framework-free UI contract, injected React facades and native defaults"). It is 29 files with only `react` as a peer. `ui` has 740 files and 20 peers (lexical, excalidraw, grapesjs, shiki). After the merge, admin's 29 and user-management's 24 kit imports become `ui` imports, which are still forbidden. It removes only 3 pair labels and 0 occurrences, at 1.8–2.5k lines plus 26 Tovu files. `ui → ui-kit` is 7 imports, mostly `useOverlayContainer`: one shared React context. Keep `ui-kit` separate. |
| Retire `sqlite` | Agree | Pure forwarder (`sqlite/src/index.ts:8–16`). Tovu imports: 0 (one test asserts absence). Removes 4 pairs. |
| Retire `cms-forms` | Agree | `cms/forms/package.json:57` already says deprecated. Tovu imports: 0. |
| Remove `infra/db/*` forwarding | Agree | `infra/package.json:4` says "compatibility re-exports". Tovu uses only `infra/events/outbox`. |
| Remove the server preset | **Agree, strongly** | `createLocalNodeDaemon`/`composeJiniKernel` "assembles core, daemon, storage and http-kit" (`server/src/index.ts:4–5`). This is the "package above domains" the owner banned on 11-07. Only consumer: `examples/minimal-host`. Codex's cost (1.8–2.7k lines) is inflated. It is mostly moving ~3.5k lines into the example. |
| Keep `plugins` and `agent-plugins` separate | Agree | Different persisted format and lifecycle (`agent-plugins/src/lifecycle/activation.ts:17–19`). Their only production crossings go to `platform`/`db`, not each other. |
| Storage: `StorageKernel`/Kysely can't go to core as-is | Agree | `db/src/kernel/port.ts:1` imports Kysely, and a `unique symbol` witness sits at :63/:69. Core has zero deps and XP4 rejects this. Simpler than Codex's framing: each domain declares `kysely` and a ~20-line local `run`/`transaction` port. `db`'s kernel satisfies it structurally. Crossings are mostly types (`commerce → db`: 15 type / 1 value). I estimate about 600–1,000 lines, not Codex's 2.1–3.5k. Migrations: the host passes `runMigrations`. |
| HTTP route ports, one typed port per route family | **Partly** | The direction is right, but the shape is heavier than needed. `defineJsonRoute` is a pure spread (`http-kit/src/adapter.ts:84–87`). Only `mountJsonRoute` touches Express (:98). Better: move `JsonRouteSpec`/`Result`/`ok`/`err`/`RouteInputContext` to core as a **server-neutral** contract, without Express `Response` in `authenticate`/`onError` (`http-kit/src/types.ts:63,65`). Daemon then exports route specs, and the host mounts them with its own server adapter. That is one seam, and it is exactly the owner's `{app: Server}` rule. Per-family ports multiply wiring. |
| Domain HTTP adapters in `<domain>/express` (lanes table) | **Disagree: owner rule** | Breaks the 11-07 rule: never `<domain>/express`. The route-spec seam above covers it. |
| Provider-plugin implementations move into domain packages | **Disagree: owner rule** | Stripe → commerce, PostHog → analytics, OTel/Sentry → diagnostics, Langfuse → agent-runtime, ECharts → ui. That puts vendor code in Jini domain packages. The owner deleted `@jini-ai/payments-stripe` and `charts-recharts` for exactly this ("should be a plugin that uses the commerce"). Instead: move the contracts (payments provider, consent, chart, trace, plugin SDK types) to `core/contracts/*`. Then vendor adapters import only core, and small values (`paymentError`) are copied locally or injected. Adapters stay in `provider-plugins`/`agent-plugins`. |
| Daemon runtime deps required | Agree, cheaper | The seam already exists. Tovu passes `getAgentDef`/`resolveAgentLaunch` (`agent-daemon-scope.ts:204,526`). `daemon → agent-runtime` is 9 value, 11 type and 7 type-expression imports. Types go to core; the ~10 value functions become executor deps. About 600–1,000 lines, not 1.2–2k. |
| Pure helpers into core value subpaths | Agree, needs owner OK | `agentHandleProps`/`agentHandle`/`buildAgentListHandles`/`agentSubHandle`/`agentHandleSegment` make up 129 of the 166 imported `agentic` symbols. That removes `admin`/`user-management`/`commerce → agentic` and most of `ui`/`chat → agentic`. But plan-v6 R5.1 says literally "everything with runtime code is passed in by the host". The owner must OK "pure, dependency-free, no-I/O helpers may live in core" as a written rule, or core turns into a grab-bag. |
| Exhaustive debt gate (batch 1) | Agree, smaller | Needed: XP1–XP5 only check changed files. My full-inventory script is about 60 lines. Extend the checker with a committed baseline that can only shrink (about 100–200 lines, not 300–500). Include shipped `.mjs`/JSDoc and manifests. |
| Move cross-domain tests to a host project (batch 27) | **Skip** | R5.1: "Tests are not shipped and are not checked." Test-only pairs and sibling devDeps break no rule. The exception is `provider-plugins`, whose devDeps are bundled into shipped artifacts; those count. |
| Extraction lanes 29–36 | Out of scope | They are not edge removal. Keep them as separate lanes, and fix their homes: themes, posts and publishing go in `cms`, members in `user-management`. That part matches the owner. |

## 3. Batches: order and size

- **Most value first:** 1) retire the forwarders and delete the server preset (17 pairs, almost no Tovu cost). 2) Move handles, API errors, `Result`, literal endpoint policy and DTO types to core (about 25 pairs, mechanical). 3) Fix the 2 runtime lazy loads (`agent-runtime/src/model-discovery-adapters.ts:312`, `mcp/src/federation/adapter.http.ts:513`). They are small and already break the owner's lazy-import rule.
- **Mis-ordered:** Codex retires compatibility packages in batch 26 and removes the server preset in batch 25. They should be first: they are deletions with zero host cost.
- **Missing:** a core hygiene batch (`core/settings/express`, `optional-peer`) and the `agent-plugins` optional peers.
- **Overbuilt:** batch 17 (merge), batch 27 (tests), and per-family HTTP ports (13–15). Storage (6–7) and daemon runtime (12) are oversized.
- **Skippable or deferrable pending the owner's decision:** 9, 10, 17–20. That is native file-lock/process ports and UI presentation ports, about 10–17k lines and mostly high risk (lock identity, React context identity).

## 4. npm / semver

- `0.7.0` is right. In 0.x, `^0.6.x` will not pick up 0.7, so a minor bump is the breaking signal. Ship additive batches (new core subpaths, old paths re-exporting from core, which is allowed) as 0.6.x patches. Collect the breaking ones (required ports, deleted packages and subpaths) on an integration branch and ship one coordinated `0.7.0`. Run `npm deprecate` on `@jini-ai/sqlite`, `@jini-ai/cms-forms` and, if fully retired, `@jini-ai/server`. Never unpublish.
- **Tovu and desktop:** when a Jini package drops a sibling dependency, the host must declare that sibling itself. Today some come in transitively (for example `chat` depends on `agentic`, `db` and `diagnostics`). Every Tovu workspace that wires them must add direct deps: root, `apps/admin`, `apps/desktop`, `apps/site-chat`. `apps/desktop/package.json` declares 11 Jini packages. Its main process uses `platform`, `agent-runtime`, `daemon` and others; renderer imports of `ui` are bundled. Each breaking batch must run the existing `apps/desktop/scripts/verify-staged-closure.ts` and a packaged-app boot. A source-only green is not enough (lesson from 10-31).
- Tovu import edits: 3 CLI files (owner-store), 0 for sqlite and cms-forms, 26 files only if `ui-kit` were merged (another reason not to). Codex's 430–770 wiring lines look right for the strict plan. My plan without phase 4 needs roughly 200–400.

## 5. Recommended plan and cost

**Phase 0: guardrails (1 agent, ~300–500 lines).** Full-inventory gate that can only shrink. Clean core: move `settings/express` out to a host adapter or http-kit, and stop new `loadOptionalPeer` uses.

**Phase 1: deletions (1–2 agents, ~1.5–2.5k lines, mostly moves).** Retire `sqlite`, `cms-forms`, `infra/db/*` and the `commerce-server.mjs` forwarder. Delete the server preset into `examples/minimal-host`. Move `owner-store` and the vault SQL repo to `platform/secrets`. Drop the manifest-only peers (`chat → protocol`, `integrations → oauth`). **About 17 pairs gone.**

**Phase 2: core contracts and pure helpers (3–4 parallel agents, ~3–5k lines, mechanical).** Agent handles, API error envelope, `Result`/`ok`/`err`, literal loopback/endpoint policy, run/event/registry DTOs, trace/consent/payments/chart/plugin-SDK/admin-module contracts. Old paths re-export from core. **About 25 pairs gone.**

**Phase 3: small real ports (5–7 agents, ~5–8k lines, judgment).** The 2 lazy loads, OAuth bridge into `oauth`, CLI→sidecar wrapper, search contribution, chat redactor/runtime picker, commerce translator, local Kysely ports and injected migration runner, cms mail/origin, devops/capability-providers networking. Also the server-neutral route-spec contract and daemon executor deps. **About 20 pairs gone.**

Phases 0–3 total: **about 10–16k lines, 11–14 Opus build runs plus one batched Codex check per round. Roughly 60 of 78 pairs gone.** Rough tokens: about 2–4M per PR-sized run including review, so roughly 30–50M in total. That is an estimate, not measured.

**Phase 4: owner decision, about 16 pairs and ~300 occurrences left** (admin/user-management/chat → ui/ui-kit, ui → agentic a2ui interpreter, native fs-lock/process from platform):
- **(a) Strict:** inject them all (Codex batches 9, 10, 17–20). About 10–17k lines, 12–16 runs, high risk to lock and React-context identity. The owner gains the letter of the rule. There is no real extra reuse, because `ui-kit` is already host-injected.
- **(b) Foundation tier (my pick):** an explicit allow-list of leaf packages that import nothing but core and contain no domain logic. Candidates: `ui-kit`, and the `platform/fs`, `fs/file-lock` and `process` subpaths (or a tiny split of them). The checker enforces leaf-ness, so no cycle or umbrella can form. That is the owner's actual worry ("cycles and spaghetti"). Move `ui/fetch-query` and the `panel-kit` translate helpers into `ui-kit` or core. About 2–4k lines, 3–4 runs.

## Risks

- Core turning into a grab-bag. Write the bar down: types in `contracts/*`; values only if pure, dependency-free and no I/O. Review every addition.
- Instance identity: file locks, React contexts (`KitProvider`, overlay), error classes and kernels must stay single instances across injected boundaries.
- Packaging: dropped transitive deps break the packaged desktop unless the host declares them. Run the staged-closure check per breaking batch.
- Vendor drift: if provider adapters move into domains, vendor SDKs become transitive downloads for every site (owner 10-26: minimal downloads).
- Rule ambiguity: R5.1 forbids runtime code in core, but Codex's plan and mine both need pure helpers there. Settle that before batch work starts.
- Not verified: emitted `.d.ts` closure (needs a build), runtime behavior of any move, and the historical "80" pair figure (Codex could not reproduce it either).
