# REVIEWS-1108: notes-app (Jini) and the last subagent-parity fix

Read-only review. Nothing was built, run or fixed. Everything below comes from `git show` / `git diff` against the named commits. Line numbers refer to those commits.

---

## Part 1: Jini `cloud/notes-app` (tip `ea1e0135`, base `cloud/extract` `35c4961a`)

VERDICT: MERGE AFTER FIXES

### Size: the +12,350 is not this branch's change

- Against its own base (`git diff origin/cloud/extract...origin/cloud/notes-app`), the branch is **+1,230 / −36 across 23 files**. `cloud/extract` has not moved since the branch was cut, so the two-dot diff is identical.
- **The lockfile is 25 lines (2%)**: one new `examples/notes-app` importer block that adds no new external packages. better-sqlite3 13.0.3, @types/better-sqlite3, @types/node and typescript were all already in the lockfile.
- The +12k figure appears only when the page compares against a branch that lacks `cloud/extract`:
  - `cloud/combine...notes-app` is +10,046 / −1,276, of which 70 lockfile lines.
  - `cloud/older-fixes...notes-app` is +12,728 / −1,439.
  - `main...notes-app` is +105,285.
- The real content:

  | area | lines |
  |---|---|
  | `core/server.ts` | 78 |
  | core test | 92 |
  | core typecheck lines | 15 |
  | cms `create-tables.ts` | 60 |
  | cms test | 98 |
  | cms fixture | −29 net |
  | example source (7 files) | 532 |
  | example smoke script | 79 |
  | example README | 36 |
  | report | 158 |

### Is it safe to merge?

Yes, mostly.
- No existing runtime behaviour changes. In core, the only changes are a new module, a new subpath and one barrel line. In cms, a new export is added, and the test fixture now calls it instead of holding its own copy of the DDL.
- The DDL produces the same names as the old fixture for the default table names: indexes, the foreign-key name, and the nullable `source_ip` with its partial index. A Tovu database that already exists is not touched, because Tovu does not call `createFormsTables`.
- The example is isolated.

The blockers are about the design rules, not about merge safety.

### Findings

**P1-1. The Server contract is not types-only, and it is not in `core/contracts/<area>`. Severity: medium (rule).**
- Where: `packages/core/src/server.ts:55-78`, `matchServerPath`.
- The rule says shared types live in `core/contracts/<area>`, types only, and that everything with code is passed in by the host. `server.ts` puts a runtime function into the contract module. It sits at `core/src/server.ts`, not `core/contracts/server`; no `contracts/` folder exists on this base yet.
- The header comment at `server.ts:7` even says "types plus one pure path matcher".
- Failure scenario: none at run time. The problem is that the first "contract" built under the new rules sets the opposite precedent. The next contracts will ship helpers too.
- Smallest fix:
  - Make `server.ts` types only: `ServerMethod`, `ServerHandler`, `Server`.
  - Move `matchServerPath` into the host adapter (`examples/notes-app/src/node-server.ts`). It is the adapter's job, and the contract's doc can still define the path syntax in words.
  - Optionally move the file to `core/src/contracts/server.ts` with a `./contracts/server` subpath.
  - Then cut the matcher tests at `__tests__/server.test.ts:78-92` and their uses by the fake.

**P1-2. The contract gives handlers no client address. Severity: medium (design gap, framework neutrality).**
- Where: `packages/core/src/server.ts:22-25`. `ServerHandler` receives only `{ request, params }`.
- A web `Request` has no peer address. Every adapter that has one (Node, Express, Bun, Deno) therefore has no way to pass it through the contract.
- Failure scenario:
  - `submitForm` needs `sourceIp`. It keys its rate limit with it (`cms/src/forms/rate-limit-key.ts:5`) and stores it.
  - Any route written against `Server` can only read a client-supplied header for it. The example does exactly that, at `examples/notes-app/src/app.ts:113`.
  - The neutral `resolveClientIp` (`@jini-ai/http-kit/rate-limit`) needs the socket peer, and the contract cannot give it one.
- Smallest fix: add an optional `client?: { readonly address: string }` (or `remoteAddress?: string`) to `ServerHandler`'s required-args object, and fill it in the adapter from `incoming.socket.remoteAddress`. This is additive and does not break anything.

**P1-3. Example: the form's IP comes from a client-controlled header, and the hand-written limiter map is never pruned. Severity: medium for an example meant to be copied; low while it binds to 127.0.0.1.**
- Where:
  - `examples/notes-app/src/app.ts:113` (`x-forwarded-for ?? '127.0.0.1'`)
  - `examples/notes-app/src/ports.ts:31-45` (`createFixedWindowLimiter`, a `Map` with no eviction)
- Failure scenario: anyone who can reach the port picks their own per-request key. The per-IP form limit stops applying, the `windows` map gains one entry per request for the life of the process, and the stored `source_ip` is whatever the client sent. The value can also be a comma list, not one address.
- Smallest fix:
  - Use the socket peer (after P1-2), or a hard-coded `'127.0.0.1'` while the app is local only.
  - Replace lines 31-45 with `createRateLimiter({ profile, clock, store: createMemoryCounterStore(...) })` from `@jini-ai/http-kit/rate-limit`. That limiter imports only `@jini-ai/core/primitives`, is not tied to Express, and already sweeps expired keys.

**P1-4. cms imports another Jini package (`@jini-ai/db`). Severity: low (rule; the pattern already exists).**
- Where: `packages/cms/src/forms/sql/create-tables.ts:2` (`import type { StorageDialect, StorageKernel } from "@jini-ai/db/kernel"`).
- The rule forbids package-to-package imports, types included, except from core. `forms/sql/repo.ts:2` and `submission-ip-retention-repo.ts:2` already do the same, so this adds a third occurrence rather than starting the pattern.
- Smallest fix, as a follow-up: move `StorageKernel` and `StorageDialect` into `core/contracts/db`, then re-point all three imports.

**P1-5. The root barrel re-export puts web globals into every core consumer's types. Severity: low.**
- Where: `packages/core/src/index.ts:45` (`export * from './server.js'`).
- `server.ts` is the first file in the root barrel that names the global `Request`/`Response`. Core's lib is ES2023, so those types resolve only through `@types/node` or the DOM lib (the report says so too).
- Failure scenario: a consumer of `@jini-ai/core` with neither, and with `skipLibCheck` off, now fails type-checking. Nothing used them before.
- Smallest fix: delete `index.ts:45` and keep only the `./server` subpath, which is all the example uses.

**P1-6. Small contract gaps. Severity: low.**
- `server.ts:15`: `ServerMethod` has no `HEAD` or `OPTIONS`. With the example adapter, a `HEAD` on a GET route returns 405, and a CORS preflight cannot be routed at all.
- `ServerHandler`, `ServerMethod` and `matchServerPath` carry no `@agent-note`. Only `Server` and `createFormsTables` do.

**P1-7. Example code does not follow the args rule. Severity: low (host code).**
- These helpers take positional arguments instead of `(requiredObj, optionalObj)`:
  - `pages.ts:14,20,24,29`: `html`, `json`, `redirect`, `readForm`
  - `node-server.ts:23,39,51`: `toRequest`, `writeResponse`, `plain`
  - `notes-repo.ts:13`: `parse`
- The example claims to show the conventions, so it should follow them.

**P1-8. Example: the `events` array grows forever and nothing reads it. Severity: low.**
- Where:
  - `ports.ts:22-25`: every entry change and form submission pushes an event that is never drained.
  - `app.ts:138` returns `{ events }`, which `main.ts:17` ignores.
- Smallest fix: drop the array, make the outbox a no-op that discards events, and delete `app.ts:138`.

### Are the gaps real?

The report's table has **14 rows**, not 13, and the source has 12 `// GAP:` markers.

| # | gap | verdict |
|---|---|---|
| 1 | durable entries repo | **Real.** `cms/entries` exports only `InMemoryEntryRepo` (`repo.memory.ts:13`). |
| 2 | entries table bootstrap | **Real.** The workaround is a misuse: `declareDataModule` brings plugin provenance, the `_plugin_migrations` ledger and the whole-file snapshot machinery to a host table. The snapshot runs only when DDL is needed, so there is no per-boot cost, but `main.ts` never runs the boot-time recovery that this machinery relies on. |
| 3 | revisions | **Real.** No repo for them except the in-memory one. |
| 4 | Node `http` adapter | **The need is real, but the proposed owner breaks the rules.** "core (a node-only subpath)" would put a specific web server in core. Under the rules this stays host code, so it is not a Jini gap. |
| 5 | response helpers and client IP | **Partly false.** The client-IP half exists: `resolveClientIp` in `@jini-ai/http-kit/rate-limit`, which is structural and not tied to Express. The real gap is P1-2: the contract carries no peer address. `html`/`json`/`redirect` for a web `Response` are a real but tiny gap; http-kit's `html-response` is bound to `node:http`'s `ServerResponse`. |
| 6 | server-side page rendering | **Real.** |
| 7 | in-memory form ports | **Partly false.** The rate limiter exists (`createRateLimiter` + `createMemoryCounterStore`, `@jini-ai/http-kit/rate-limit`), so the report's "tied to Express" claim is wrong. The outbox and dispatcher gaps are real: `InMemoryOutbox` exists only in `cms/forms/src/__tests__/eventing.fixture.ts:23`. |
| 8 | default `FormHtmlHooks` | **Real.** It is one line. |
| 9 | single-owner authorize | **Real, but it is 3 lines of app policy.** It should stay in the host and not be listed as a gap. |
| 10 | durable outbox and change sets in cms | **Real.** |
| 11 | persisted content types | **Real.** Only `content-types/repo.memory.ts` exists. |
| 12 | list-submissions service | **Not a gap.** Calling the repo's `listByDefinition` directly is the intended use. |
| 13 | ports needed to create a form | **Real.** |
| 14 | route metadata | **Real.** |

**Bugs in the report:**
- **Confirmed: the parse5 packaging bug.** `cms/src/forms/sql/repo.rows.ts:3` imports `html/html-authoring.ts`, which imports `parse5` at load time, but cms declares `parse5` only as an optional peer.
- **Intentional: the `source_ip` null → `""` read.** It is commented as a compatibility shim at `repo.rows.ts:75-77`. It is a typing mismatch, not a defect.
- Both are pre-existing on `cloud/extract`. This branch does not cause them.

### Excess code, with exact lines to cut

- `packages/core/src/server.ts:49-78`: `matchServerPath`. Move it to the adapter (P1-1).
- `packages/core/src/__tests__/server.test.ts:78-92`: the matcher tests. Move them with the matcher.
- `packages/core/src/index.ts:45`: the barrel re-export (P1-5).
- `examples/notes-app/src/ports.ts:31-45`: the hand-written limiter. Replace it with http-kit's (P1-3).
- `examples/notes-app/src/ports.ts:22-25,50,60` and `app.ts:138`: the unused, ever-growing `events` (P1-8).
- `examples/notes-app/src/node-server.ts:73-77`: the second route scan that builds `Allow`. Collect the methods during the first loop instead. This is cosmetic.
- `cloud/reports/notes-app.md`, gap rows 9 and 12: drop them; they are not gaps.
- Everything else is proportionate.

### Hot-path cost

- **Per request:** matching is O(routes × segments), and the route list is a linear scan. Fine for 8 routes.
- **`GET /` and `GET /api/notes`:** these read and `JSON.parse` every note on every hit, with no limit. Fine for a demo; it grows with the note count.
- **Boot:** 7 DDL statements, plus the data-module reconcile. The snapshot runs only when DDL is needed.

### Not checked

- Nothing was executed: not the tests, the smoke script, typecheck or guard. The pass claims in the report are unverified.
- The tarball run was not reproduced.
- I did not diff `create-tables.ts`'s Postgres DDL against a live Tovu Postgres schema. I compared it only against the old fixture DDL.
- Postgres's 63-byte identifier limit is not handled for long host table names; that edge case is untested.

---

## Part 2: subagent-parity final fix (Tovu `b97b3f114..d5537d310`, Jini `4b6bacb63..a9c41bc8b`)

Both are merged into `cloud/combine`, and neither file has changed since.

VERDICT: MERGE AFTER FIXES. It is already merged, so treat this as "keep, and follow up".

### Finding 1: the argv budget

**Is it fixed? Yes for the automatic path, but it over-corrects.**
- Where: `packages/agent-plugins/src/lifecycle/automatic-use.ts:203`. The primary is now inlined only when `maxPromptArgBytes === undefined`.
- Tovu passes the value from `getAgentDef({ id: run.request.agentId ?? 'claude' })?.maxPromptArgBytes`, at `assistant-tool-exec.ts:163`.
  - The `'claude'` default matches the daemon's `DEFAULT_AGENT_ID` (`agent-daemon-scope.ts:199`).
  - An unknown id falls back to claude on both sides.
  - The daemon's bound definition (`native-runtime.ts:57-59`) wraps the same static definitions, so the budget is the same on both sides.
- Every path that could still carry automatic guidance in argv was checked:
  - The preflight primary is now gated.
  - The `capabilities` path (`prepareGuidance`) returns its text as tool output, not argv.
  - Children get ids plus an instruction to call `load_agent_plugin` (`agent-daemon-scope.ts:1115`), not inlined text.
  - So the automatic primary can no longer push DeepSeek, Aider or Antigravity over 30,000 bytes.
- **Pinned guidance is still inlined in full** for argv adapters. The Tovu test asserts this: `deepseek, pinned=true` → `result.prefix === full.promptPrefix`. If the prompt plus the pins is over budget, the run fails before spawn with `AGENT_PROMPT_TOO_LARGE` (`daemon/src/agent-executor/launch.ts:362`), which carries an actionable message. This is unchanged and was outside the finding.

**P2-1. DeepSeek and Aider now get no automatic plugin guidance at all, on every platform. Severity: medium.**
- Where: `automatic-use.ts:203`. The gate is binary and ignores the platform.
- Failure scenario 1, tool-less CLIs:
  - DeepSeek and Aider have no `externalMcpInjection` (`defs/deepseek.ts:56`, `defs/aider.ts:80`). Tovu tells the user so ("can't use tools provided here", `agent-daemon-scope.ts:1182-1187`).
  - After this fix they get only the metadata note, which points at `load_agent_plugin` / `host_read_plugin`, tools they cannot call. The Tovu test asserts exactly this pointer for deepseek.
  - Before the fix they got the primary inline. The run failed only when prompt plus guidance went over the limit, and only on Windows.
- Failure scenario 2, POSIX:
  - On macOS and Linux the real argv budget is `max(30_000, 100_000)` = 100 KB (`agent-runtime/src/prompt-budget.ts:42-47`).
  - The primary is capped at 16 KB (`MAX_PRIMARY_GUIDANCE_BYTES`), so it always fit there.
  - So all three argv CLIs lost the primary on POSIX, where nothing was ever at risk. This is the "something else changed for non-Claude CLIs" the brief asked about.
- Smallest fix: make the gate size-aware, not binary.
  - Tovu computes the headroom: `resolveArgvPromptBudget(def.maxPromptArgBytes, process.platform)`, minus the bytes of `context.prompt` and `pinnedPrefix`, minus a fixed reserve for the overlay. `resolveArgvPromptBudget` would need exporting; today it is module-private.
  - Tovu passes that headroom as `maxPromptArgBytes`.
  - `automatic-use.ts` uses `Math.min(MAX_PRIMARY_GUIDANCE_BYTES, input.maxPromptArgBytes ?? Infinity)` as the primary's byte cap inside `guidanceFor`, instead of dropping the primary. The existing "deferred" pointer path already handles a primary that is too big.

**P2-2. A retried attempt reuses the first attempt's budget decision. Severity: low; whether this triggers is unconfirmed.**
- Where: `apps/website/src/features/agent-plugins/automatic-agent-plugins.ts:93`. The `entry.preflight ??=` cache is per logical turn, and `rejoin` (`:84-91`) replaces `context` but keeps the cached prefix.
- Failure scenario: if a restarted attempt of the same message can run a different `agentId` (for example claude, then deepseek), it receives the Claude-sized inline primary. I did not confirm that an attempt can change agent.
- Smallest fix: include `maxPromptArgBytes` in the cache key, or drop the cache when it differs.

### Finding 2: Off mode delivers only pinned plugins

**Is it fixed? Yes, on the preflight path and the child path.**
- With Off, `alreadyLoaded` starts empty (`automatic-use.ts:103`). `prepare` adds the current pins and then returns early (`:193-194`).
- `load` admits ids that are in `alreadyLoaded` (`:226`), so Off now admits exactly the current pins. The excluded, missing, untrusted and cancelled checks still run after that gate (`:227-231`).
- `guidanceIds` returns the pins only. The daemon passes them to children (`agent-daemon-scope.ts:1038,1115`). The children's `load_agent_plugin` calls resolve against the same run's controller (`automatic-agent-plugins.ts:178-180`), and now return `loaded` instead of `off`.
- If the pinned prefix is refused (`pinnedPrefix === null`, `assistant-tool-exec.ts:145`), no controller starts, and a child's load throws "run is unavailable". This is unchanged and fails closed.

**P2-3. The `rememberDelivery` change affects every mode, not just Off. Severity: low.**
- Where: `automatic-use.ts:175`. It now merges `decision?.delivered` into the persisted list in every mode.
- Before, in Auto and Ask, the persisted `delivered` list dropped ids that were excluded, or that `prepare` had pruned because they were disabled or uninstalled. Now it keeps them forever.
- Failure scenario: a plugin delivered earlier in a chat, then excluded or disabled, and later re-admitted, is treated as already delivered. Its primary is not inlined again (`:203`, `!alreadyLoaded.has(...)`), and it shows up in children's `guidanceIds`. That holds even if the CLI session that saw it has since been reset, for example by switching agents.
- Smallest fix: merge `decision?.delivered` only when `mode === 'off'`. That case is the reason the merge was added, to keep earlier history while `alreadyLoaded` starts empty.

### Other changes for non-Claude CLIs

- Claude's def has no `maxPromptArgBytes`, so the automatic path for Claude is byte-for-byte unchanged.
- For non-Claude CLIs, the only changes are P2-1 (argv adapters) and the Off-mode admission, which is intended and applies to all CLIs.
- P2-3 applies to all CLIs.
- The `PrepareInput` type was widened. The `prepare` signature now uses the shared type, which is fine.

**Release coupling:**
- Tovu calls `controller.prepare({ ..., maxPromptArgBytes })` and depends on `@jini-ai/agent-plugins ^0.6.23` from the registry.
- Jini's `a9c41bc8b` adds no changeset.
- Against a registry build without this commit, Tovu's object literal fails the excess-property check, and the Off integration test fails.
- So Jini must be released, or linked, before Tovu `cloud/combine` ships.

### Hot-path cost

- Each preflight does one `getAgentDef`: a linear `find` over about 30 definitions.
- `rememberDelivery` does an O(delivered) set merge per load.
- Both are negligible.

### What a signed-in real Claude run still has to prove

1. **Auto or Ask mode, Claude:** the preflight prefix still carries the full primary guidance. This shows the `undefined` budget path is unchanged in a real run, not just in the fixture.
2. **Off mode with one pinned plugin:**
   - Claude's native subagent (Task) actually calls `load_agent_plugin` through the MCP bridge, under the parent run id, and gets `status: loaded` with the guidance.
   - A non-pinned plugin id gets `off`.
3. **Off mode:** the usage event published after a child's load (`agent_plugins`, with the pinned plugin) renders correctly while the preference is Off. Before this fix, Off published only the empty strip.
4. **A second turn in the same chat after an Off-mode pinned load:** with Off it does not re-admit the earlier delivery. After switching to Auto, it does not re-inline it.
5. **Retry/restart of a Claude attempt** (`rejoin`): the cached preflight is reused, and the pinned plugin is still loadable by the child.

None of this proves anything about Windows argv CLIs. That needs a real Windows host running DeepSeek or Antigravity with a prompt near 30 KB.

### Not checked

- I ran no tests, typecheck or live run. The pass counts in `cloud/reports/subagent-parity.md` are unverified.
- I did not confirm whether a durable retry can change `agentId` (P2-2).
- I did not review the rest of the subagent-parity series before `b97b3f114` / `4b6bacb63`.

REVIEWS-1108 DONE
