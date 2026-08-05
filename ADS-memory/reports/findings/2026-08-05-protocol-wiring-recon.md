# `@jini-ai/protocol` wiring recon — 2026-08-05

Recon only, per Coordinator dispatch. No `package.json`, lockfile, or `node_modules` change was
made or should be inferred from this report — everything below is a diff **to apply**, not applied.

**Headline: the wiring is worth doing, but its actual runtime footprint is much smaller than the
spec's own follow-up comment implies — this can be a type-only `devDependency`, not a runtime
dependency, and the two shapes have not drifted today.** A negative-leaning nuance is flagged in
Q5.

## Q1/Q2 — do the two shapes agree today?

**Real shape** (`Jini/packages/protocol/src/events.ts`):

```ts
export interface RunEvent<Name extends string, Payload> {
  runId: string;
  eventId: string;
  opaqueCursor: string;
  readonly protocolVersion: typeof RUN_PROTOCOL_VERSION;
  ts: number;
  kind: Name;
  payload: Payload;
  durability: 'durable' | 'ephemeral';
}

export type RunProtocolEvent =
  | RunEvent<'start', RunStartPayload>
  | RunEvent<'agent', RunAgentPayload>
  | RunEvent<'stdout', RunChunkPayload>
  | RunEvent<'stderr', RunChunkPayload>
  | RunEvent<'error', RunErrorPayload>
  | RunEvent<'end', RunEndPayload>;

// RunAgentPayload (for kind:'agent') is a 13-way discriminated union. The two variants this
// spec reads:
| { type: 'tool_result'; toolUseId: string; content: string; isError?: boolean }
| { type: 'mcp-ui'; toolUseId: string; resource: unknown }   // <- see Q5

// RunEndPayload (for kind:'end'):
export interface RunEndPayload {
  code: number | null;
  signal?: string | null;
  status?: 'succeeded' | 'failed' | 'canceled';
  resumable?: boolean;
  sessionRef?: string;
}
```

**Spec's hand-mirrored shape** (`development/e2e/surface-live-agent.spec.ts:72-82`):

```ts
interface RunWireEvent {
  kind: string;
  payload?: {
    type?: string;
    toolUseId?: string;
    resource?: { resource?: { text?: string } };
    content?: unknown;
    isError?: boolean;
    status?: string;
  };
}
```

**Verdict: no drift.** The spec is a loose, non-discriminated, all-optional subset (it drops
`runId`/`eventId`/`opaqueCursor`/`protocolVersion`/`ts`/`durability` entirely — it never reads
them, so their absence isn't drift). Every field the spec's own logic actually branches on:

- `kind` values checked: `"agent"`, `"end"`, `"error"` (`surface-live-agent.spec.ts:197,208,243,247`) — all three are real `RunProtocolEvent['kind']` members.
- `payload.type` values checked: `"mcp-ui"`, `"tool_result"` (`:197,243`) — both real `RunAgentPayload` variant tags.
- `payload.toolUseId`, `.content`, `.isError` (tool_result) and `.toolUseId` (mcp-ui) — match the real variants field-for-field.
- `payload.status` (end) doc'd as `'succeeded'|'failed'|'canceled'` — matches `RunEndPayload.status` exactly.

This is **not** the "already drifted" case the task asked me to watch for. The mirror is accurate
today. (It just isn't *enforced* — see Q5 for the one place enforcement would still fall short even
after wiring.)

## Q3 — the precise `package.json` change, and workspace-link vs versioned dependency

All ten already-wired `@jini-ai/*` packages sit in Tovu's root `package.json` **`dependencies`**
block (not `devDependencies`) as `file:../Jini/packages/<name>`, e.g.:

```
"@jini-ai/chat": "file:../Jini/packages/chat",
"@jini-ai/daemon": "file:../Jini/packages/daemon",
"@jini-ai/http-kit": "file:../Jini/packages/http-kit",
```

`node_modules/@jini-ai/<name>` is a symlink straight to `Jini/packages/<name>` (not a copy, not
just its `dist/`) — e.g. `node_modules/@jini-ai/chat -> ../../../Jini/packages/chat`. Resolution
then follows that package's own `package.json` `exports`/`main` (`./dist/index.js`,
`./dist/index.d.ts`) to find the built output. `@jini-ai/protocol`'s `package.json` already declares
the same `exports` shape (`"types": "./dist/index.d.ts", "import"/"default": "./dist/index.js"`), so
the identical `file:` link pattern will work unchanged.

**Recommended entry (devDependency, not dependency — see Q5.5 below):**

```
"@jini-ai/protocol": "file:../Jini/packages/protocol"
```

placed in `devDependencies`, not `dependencies`. Reasoning: every existing `file:` entry is in
`dependencies` because production code under `src/` imports it at runtime (`src/assistant/*.ts`
imports `@jini-ai/daemon`, `@jini-ai/chat/core`, etc. — confirmed by grep). `@jini-ai/protocol`'s
only proposed consumer is `development/e2e/surface-live-agent.spec.ts`, which is never built by
`npm run build` (that script's `tsc -p tsconfig.json` scope is `src/**/*.ts` only — see Q5.5) and
never ships in the `dist/` that becomes the published/runtime artifact. A `devDependency` correctly
signals "test-time only" the same way `@playwright/test` already does.

**Full diff to apply** (root `Tovu/package.json`, alphabetically after `"@jini-ai/http-kit"` — sorted
position confirmed against the existing block):

```diff
--- a/package.json
+++ b/package.json
@@ -46,6 +46,7 @@
     "@jini-ai/core": "file:../Jini/packages/core",
     "@jini-ai/daemon": "file:../Jini/packages/daemon",
     "@jini-ai/http-kit": "file:../Jini/packages/http-kit",
+    "@jini-ai/protocol": "file:../Jini/packages/protocol",
     "@jini-ai/mcp": "file:../Jini/packages/mcp",
     "@jini-ai/sqlite": "file:../Jini/packages/sqlite",
     "@jini-ai/ui": "file:../Jini/packages/ui",
```

Wait — the existing dependency block is alphabetical but `mcp`/`sqlite`/`ui` sort after `http-kit`
already, and `protocol` sorts after `mcp` alphabetically (`m` < `p`). Corrected placement:

```diff
--- a/package.json
+++ b/package.json
@@ -47,6 +47,7 @@
     "@jini-ai/daemon": "file:../Jini/packages/daemon",
     "@jini-ai/http-kit": "file:../Jini/packages/http-kit",
     "@jini-ai/mcp": "file:../Jini/packages/mcp",
+    "@jini-ai/protocol": "file:../Jini/packages/protocol",
     "@jini-ai/sqlite": "file:../Jini/packages/sqlite",
     "@jini-ai/ui": "file:../Jini/packages/ui",
```

Except per Q3/Q5.5's `devDependency` recommendation, this line should NOT go into the
`dependencies` block above at all — it should go into `devDependencies` instead:

```diff
--- a/package.json
+++ b/package.json
@@ -60,6 +60,7 @@
   },
   "devDependencies": {
     "@biomejs/biome": "^2.5.5",
+    "@jini-ai/protocol": "file:../Jini/packages/protocol",
     "@playwright/test": "^1.61.1",
     "@types/better-sqlite3": "^7.6.12",
```

(Only this last hunk is the actual recommendation — the two above were shown to make the
alphabetical/placement reasoning auditable, not as competing options to apply.)

**After applying, `npm install` (at root) is required** — it regenerates the
`node_modules/@jini-ai/protocol` symlink and touches `package-lock.json`. This install was
explicitly out of bounds for this dispatch (port 5173/3000 processes, shared `node_modules`); the
Coordinator should run it in the pre-agreed quiet window, then verify with
`node -e "console.log(require.resolve('@jini-ai/protocol'))"` from Tovu's root.

## Q4 — is `dist/` built and current?

Yes. `packages/protocol/dist/*.d.ts` mtimes are **Aug 5 09:50**, which post-dates every `src/*.ts`
file including the two most recently touched (`src/events.ts` Aug 3 14:17, `src/run-context.ts` Aug
5 08:21). Content-checked, not just mtime-checked: `dist/events.d.ts` contains all of `events.ts`'s
newer `RunAgentPayload` variant tags (`stage_start`, `a2ui`, `mcp-ui`, `surface_request` all present
in the compiled `.d.ts`). `dist/index.d.ts`/`dist/index.js` re-export all nine source modules
(`agent-catalog`, `common`, `errors`, `event-log`, `events`, `journal`, `registry`, `run`,
`run-context`) per `src/index.ts`'s barrel. Build is current — a source-only change would not have
had a stale-`dist/` problem to report today, but there's also no CI/pre-commit guarantee this stays
true (worth flagging to Coordinator as a separate, smaller finding: nothing currently fails if
protocol's `dist/` drifts from its `src/` before a consuming package's install; this is out of this
task's scope to fix).

## Q5 — types-only import or real runtime dependency?

**Types-only**, and this materially changes the cost/risk profile from what the spec's own comment
implies ("adding it would mean editing root `package.json` + `package-lock.json` + installing a new
symlink" — true, but it understates that this is the *only* cost; there is no runtime footprint).

The only intended consumption is:

```ts
import type { RunProtocolEvent, RunAgentPayload } from "@jini-ai/protocol";
```

`import type` is erased by every TS-compatible transpiler (tsc, esbuild, swc) unconditionally — this
is guaranteed by the syntax itself, not by a compiler flag. Playwright's test transform (esbuild-
based) will never emit a `require("@jini-ai/protocol")` for a type-only import, so:

- **No runtime resolution is needed for tests to pass.** Even without the `package.json` change
  applied, `surface-live-agent.spec.ts` would not fail to run if someone added a type-only import
  today — it would just show a red squiggle in an editor and (if anything ever type-checked the
  file) a `TS2307: Cannot find module` error. Nothing enforces that today (see Q5.5).
- Zero risk of pulling `zod` (protocol's own runtime dependency, `^3.25.76`) into Tovu's shipped
  bundle — the type import carries no value-level reference to it.

### Q5.5 — a caveat: wiring the dependency alone does not create the compile-time safety net the spec's comment wants

The spec's comment's whole motivation is "a future protocol change breaks this test at compile time
instead of silently at runtime." Checking that claim turned up a gap: **nothing in this repo
type-checks `development/e2e/**` today.**

- Root `tsconfig.json`: `"include": ["src/**/*.ts"]`, and explicitly excludes `**/__tests__/**` and
  `**/*.test.ts`. `development/e2e/*.spec.ts` is outside `include` entirely — not merely excluded.
- `npm run typecheck` = `tsc -p tsconfig.json --noEmit`, so it never touches e2e specs.
- CI (`.github/workflows/ci.yml:36`) runs exactly that same `npm run typecheck` — same scope gap.
- No `development/tsconfig.json` or equivalent exists (checked: only unrelated tsconfig found, under
  `development/experiments/jini-agent-runtime/`).
- Playwright's own test runner does transpile-only compilation (type erasure, no type-checking) —
  it will run a spec with a type error in it without complaining.

**Net effect: adding the `devDependency` and rewriting the spec to import `RunProtocolEvent`/
`RunAgentPayload` gets you real IDE-level protection (red squiggles the moment someone in Jini
renames a `kind` or payload variant) but zero CI-enforced protection**, because no automated gate
type-checks that file today. If the Coordinator wants the actual "breaks at compile time" property
in CI, this task's scope would need to grow to include either widening `npm run typecheck`'s
`include` to cover `development/e2e/**`, or adding a narrow second `tsc --noEmit` invocation scoped
to that directory. That is a real, separate decision (widening `typecheck` could surface unrelated
pre-existing e2e type errors) — flagging it rather than deciding it here, since it's outside this
recon's boundary.

### A second, smaller caveat: even the real types don't fully validate this spec's assumptions

The mcp-ui variant is `{ type: 'mcp-ui'; toolUseId: string; resource: unknown }` — `resource` is
typed `unknown` **by design** (per `events.ts`'s own doc comment: protocol sits below every feature
package and must not depend sideways on `@jini-ai/ui`'s resource shape; validation happens in
`@jini-ai/ui`'s `parseUIResource` on the consuming side). The spec reads
`event.payload.resource?.resource?.text` — that nested shape is a real MCP UI content-block
convention, but `@jini-ai/protocol`'s types cannot confirm or deny it; TypeScript will require a
cast or a type guard at that access point regardless of this wiring. So the wiring closes the gap
for `kind`, `payload.type` variant tags, `RunEndPayload.status`, and `tool_result`'s
`toolUseId`/`content`/`isError` — but the one field this spec's headline scenario most depends on
(the actual rendered mcp-ui resource shape) stays outside what `@jini-ai/protocol` can ever check.
That's an argument for also referencing `@jini-ai/ui`'s resource-parsing type if full protection is
the goal — a larger, separate wiring decision, out of scope here.

## Illustrative spec diff (not required to close Q1-5, shown for completeness)

If the Coordinator wants the type-only import applied at the same time as the `package.json` diff,
this is the minimal change consistent with the findings above — it keeps the existing loose
structural style (so `resource.resource.text` still needs a local cast) rather than switching to
the full discriminated union, since that switch is a larger refactor of the whole event-handling
loop and not required to get the "no more hand-mirrored envelope" win:

```diff
--- a/development/e2e/surface-live-agent.spec.ts
+++ b/development/e2e/surface-live-agent.spec.ts
@@ -1,5 +1,6 @@
 import { test, expect, type APIRequestContext } from "@playwright/test";
 import { waitForAgentDaemon } from "./daemon-ready";
+import type { RunProtocolEvent, RunAgentPayload } from "@jini-ai/protocol";
@@ -49,27 +50,18 @@
 }

 /**
- * Mirrors the wire envelope `@jini-ai/protocol`'s `RunEvent<Name, Payload>` actually sends
- * ...
- * (spec used to hand-mirror this — see git history / this report for the shape comparison
- * that confirmed no drift existed at the time of the rewrite that added this comment)
+ * Re-exports the real wire envelope from `@jini-ai/protocol` instead of hand-mirroring it, so a
+ * future protocol change breaks this test at compile time. Note: `RunAgentPayload`'s `mcp-ui`
+ * variant types `resource` as `unknown` by design (validated downstream by `@jini-ai/ui`'s
+ * `parseUIResource`, not by protocol) — this import cannot validate the `resource.resource.text`
+ * assumption below; that part of the shape stays a runtime assumption, same as before.
  */
-interface RunWireEvent {
-  kind: string;
-  payload?: {
-    type?: string;
-    toolUseId?: string;
-    resource?: { resource?: { text?: string } };
-    content?: unknown;
-    isError?: boolean;
-    status?: string;
-  };
-}
+type RunWireEvent = RunProtocolEvent;
```

This diff is **not verified against the rest of the file's control flow** (the loop bodies at
`:197-208` and `:243-247` narrow on `event.kind === "agent"` then read `event.payload?.type`/
`.toolUseId`/`.resource`/`.content`/`.isError` — switching `RunWireEvent` to the real discriminated
union will very likely require adding explicit narrowing (`if (event.kind === "agent" && event.payload.type === "mcp-ui")`) at each of those call sites, since a loose optional-everything interface
currently lets those reads through without narrowing that a real discriminated union would enforce).
I did not carry that follow-on refactor through — it's real implementation work belonging to a
dispatch that actually applies this change, not recon.

## Bottom line for the Coordinator

1. Wire it as a **`devDependency`**, `file:` link, type-only. No runtime cost, no `zod` bundling
   risk, matches the existing `file:` pattern the other ten packages already use.
2. The two shapes have **not drifted** — this is not an urgent fix, it's a hardening improvement.
3. The hardening is **partial**: it buys IDE-time drift detection today, and only buys CI-time
   drift detection if `npm run typecheck`'s scope is separately widened to cover
   `development/e2e/**` (a distinct, larger decision with its own blast radius).
4. It can **never** validate the mcp-ui `resource.resource.text` assumption, because protocol
   deliberately types that field `unknown`.
5. Applying the diff requires an `npm install` this dispatch was barred from running — hand this
   report's diff to whoever runs it in the next quiet window, then confirm with
   `node -e "console.log(require.resolve('@jini-ai/protocol'))"` from Tovu's root afterward.
