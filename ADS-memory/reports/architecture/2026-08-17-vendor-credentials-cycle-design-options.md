# Vendor-credentials cycle — design options

- **Author:** Software Architect (dispatched investigation)
- **Date:** 2026-08-17
- **Status:** Design analysis only. **Nothing in this document has been implemented.** This is a
  go/no-go input for the repo owner; no files outside this report were touched during this
  investigation.
- **Scope:** Why `source-control`, `deployments`, and `static-publish` cannot yet convert from
  `assistant/tool-registrations.ts`'s static `DOMAIN_SLICES` array to the
  `tool-contribution-registry.ts` pattern, and what would need to change to unblock them.

## 1. Confirmed cycle (verified against current code, not just the trailing comments)

The three blocked domains all trace to one root cause: `assistant`'s own real
`VendorCredentialPort` wiring reaches into `features/vendor-credentials`, which reaches into
`features/source-control`, which reaches into `features/deployments`. Converting any of the three
domains to the registry reverses one of those modules' edges to point back at `assistant`,
closing a cycle.

Exact, file-verified chain (all value imports — none of this is erased by `check:architecture`'s
type-only exclusion):

```
src/assistant/tool-registrations.ts  (line 123-128)
  imports { createVendorCredential, listVendorCredentials, PUBLISH_PROVIDER_TO_VENDOR,
            updateVendorCredential } from "../features/vendor-credentials/index"
      |
      v
src/features/vendor-credentials/index.ts  (line 47-52)
  re-exports resolveDefaultForVendorDualRead from "./dual-read"
      |
      v
src/features/vendor-credentials/dual-read.ts  (line 6)
  imports { resolveDefaultForSourceControl } from "../source-control/store"
      |
      v
src/features/source-control/store.ts  (line 3)
  imports { extractGitHubLogin } from "../deployments/static-publish/index"
      |
      v
src/features/deployments/static-publish/index.ts
```

`check:architecture` (`development/scripts/check-architecture.ts`) computes cycles at
per-directory granularity (`moduleOf()`, line 164-169: `src/features/<dir>` is one module
regardless of how many files it has) on the **runtime/value-only** import graph (`import type`
edges are excluded — see the script's own header, lines 21-33). Both of the above edges are plain
value imports, so both count.

This produces two distinct sub-cycles once a domain's own `tool-registrations.ts` starts calling
`registerToolContributor` (imported from `assistant/index.ts`, itself inside the `assistant`
module — confirmed by `comments/tool-registrations.ts:30`, the working example):

- **3-module cycle** if `source-control` converts alone: `assistant -> features/vendor-credentials
  -> features/source-control -> assistant`.
- **4-module cycle** if `deployments`/`static-publish` convert: `assistant ->
  features/vendor-credentials -> features/source-control -> features/deployments -> assistant`
  (same root chain, one hop further; `deployments` and `static-publish` share the `features/deployments`
  module at this granularity, so both are blocked identically).

Both are confirmed live in the trailing comments of `features/source-control/tool-registrations.ts`
(lines 397-415) and `features/deployments/tool-registrations.ts`/`publish-agent-tools.ts`, each
recording a real `check:architecture --list` run going `0 -> 3` / `0 -> 4`. I re-read every file on
the chain directly rather than trusting the comments, and the import chain is exactly as described
— nothing has shifted since last session.

**One correction to the mental model going in:** `assistant`'s own `REAL_VENDOR_CREDENTIAL_PORT`
(the object it constructs from the vendor-credentials import) only wires `list`/`create`/`update`/
`providerToVendor`. **None of those four functions touch `dual-read.ts` at all.** The entire
`vendor-credentials -> source-control -> deployments` leg of the chain exists solely because
`vendor-credentials/index.ts` re-exports `dual-read.ts`, and `dual-read.ts` is the one file in the
whole feature that reaches into the two legacy tables. This matters for scoping a fix (§2).

**Second finding, load-bearing for risk assessment:** `resolveDefaultForVendorDualRead` — the
function `dual-read.ts` exists to provide — has **zero real callers today**. I grepped the whole
`src/` tree excluding tests: the only non-test reference is a doc comment in
`server/routes/types.ts:736` describing it as "the seam that lets a **future** caller read this
table first." It is fully built, tested, and exported, but nothing in production calls it yet. Any
change to its shape carries no production runtime risk today — only a mechanical test-file update.

## 2. Option A — move `assistant`'s `VendorCredentialPort` wiring to `server/`

**What changes:** Delete `REAL_VENDOR_CREDENTIAL_PORT` and its vendor-credentials import from
`assistant/tool-registrations.ts`. Construct the same object in `src/server/` instead (e.g.
`server/tool-catalog-manifest.ts`, which both real boot paths already import for
`installFirstPartyToolContributors()`), and pass it in explicitly as
`routeDeps.vendorCredentials` before calling `buildAssistantToolRegistrations`.

**Why it would work:** `check:architecture` confirms `server -> assistant` is one-directional today
— `assistant/tool-contribution-registry.ts`'s own header (lines 27-38) documents this was a
deliberate 2026-08-17 fix ("Candidate 1 of the 2026-08-17 back-edges plan"): `assistant` carries no
runtime edge back into `server`. So moving the vendor-credentials import from `assistant` to
`server` relocates the whole `vendor-credentials -> source-control -> deployments` chain to
terminate at `assistant` (via the new `registerToolContributor` edges) with no path back to
`server`. No cycle.

**Cost / risk:**
- Touches at minimum: `assistant/tool-registrations.ts` (remove wiring, make `vendorCredentials`
  a required field or keep optional-with-no-default), a new/existing `server/`-owned file to
  construct the port, and both real boot paths that call `buildAssistantToolRegistrations` —
  `server/agent-daemon/agent-daemon-server.ts:329` and `server/modules/assistant-byok.ts`
  (confirmed both currently rely on the fallback default; neither passes `vendorCredentials`
  explicitly today).
- **28 test files** call `buildAssistantToolRegistrations` directly and **none** pass
  `vendorCredentials` explicitly — all 28 currently ride the module-scope fallback. Since
  `StaticPublishToolDeps.vendorCredentials` is optional, removing the fallback is compile-safe for
  all 28 (I confirmed none of them look like they exercise the static-publish handler that would
  need a real port), but it is a wide blast radius to reason about by inspection rather than by
  type system, and a **silent** one: a future caller that forgets to pass `vendorCredentials` gets
  no compile error, only a runtime "wiring bug" throw the first time an agent actually calls
  `deployment_execute_static_publish`/`deployment_get_static_publish_capabilities`. The existing
  module-scope default in `assistant/tool-registrations.ts` was deliberately built to make that
  class of mistake impossible (its own doc comment: "this is the ONE place allowed to construct
  it"). Option A gives that guarantee up.
- Contradicts the documented intent of the current design (`tool-registrations.ts` lines 472-478:
  "This IS the one place allowed to see both sides"). Not fatal, but it's a real design reversal,
  not a local patch.

**Unblocks themes/post:** yes, indirectly — once `source-control`/`deployments`/`static-publish`
convert cleanly (whichever fix enables it), their entries leave `DOMAIN_SLICES`, which removes
`assistant`'s direct static import of `features/deployments` too. `themes`' own blocker (`assistant`
reaching `export` transitively through the still-static `deployments`/`source-control` entries) goes
away as a side effect, not because Option A itself touches anything on that path.

## 3. Option B — inject the two legacy-read functions into `dual-read.ts` (recommended)

**What changes:** `dual-read.ts` currently value-imports `resolveDefaultForPublish` (from
`../deployments/publish-credentials/store`) and `resolveDefaultForSourceControl` (from
`../source-control/store`) and calls them directly. Instead, add them to
`VendorCredentialDualReadDeps` as injected functions, typed with a **local structural signature**
(not an imported function type) — the exact same technique
`features/deployments/publish-agent-tools.ts` already uses for `VendorCredentialPort` to avoid
importing `features/vendor-credentials` (that file's own header, lines 106-122, explains why: "an
`assistant <-> ... <-> features/vendor-credentials` module cycle"). This is the *same* pattern
already proven in this exact chain, one hop further down:

```ts
type ResolveLegacyPublish = (
  deps: { repo: PublishCredentialSetRepoPort; sealer: SecretSealerPort },
  input: { workspaceId: UUID; providerId: PublishProviderId },
) => Promise<{ id: UUID; label: string; connection: PublishConnectionInput } | null>;

type ResolveLegacySourceControl = (
  deps: { repo: SourceControlCredentialSetRepoPort; sealer: SecretSealerPort },
  input: { workspaceId: UUID; providerId: SourceControlProviderId },
) => Promise<{ id: UUID; label: string; connection: SourceControlConnectionInput } | null>;
```

(`PublishCredentialSetRepoPort`/`SourceControlCredentialSetRepoPort`/the three connection-input
types are already `import type`-only in `dual-read.ts` today — erased, so they're free.) Add
`resolveLegacyPublish: ResolveLegacyPublish` and `resolveLegacySourceControl:
ResolveLegacySourceControl` to `VendorCredentialDualReadDeps`, replace the two direct calls with
`deps.resolveLegacyPublish(...)` / `deps.resolveLegacySourceControl(...)`, and delete the two value
imports. That deletion is what removes the `vendor-credentials -> source-control` and
`vendor-credentials -> features/deployments` edges.

**Cost / risk — much smaller than Option A:**
- **One production file changed:** `features/vendor-credentials/dual-read.ts`.
- **One test file updated:** `__tests__/dual-read.unit.test.ts` — I read it; its `makeDeps()`
  helper already constructs a `VendorCredentialDualReadDeps`-shaped object by hand, so adding two
  more fields (`resolveLegacyPublish: resolveDefaultForPublish, resolveLegacySourceControl:
  resolveDefaultForSourceControl`, imported directly in the test file) is a small, mechanical
  change. Test files are excluded from `check:architecture`'s graph (`isTestFile()`, confirmed in
  the script), so the test importing both store functions directly is not itself a problem.
- **Zero production callers to update**, because `resolveDefaultForVendorDualRead` has none today
  (§1). Nothing needs to be rewired at any real boot path right now.
- Leaves the `assistant -> features/vendor-credentials` edge fully intact for its actual, currently
  load-bearing purpose (`list`/`create`/`update`/`providerToVendor`) — that edge was never part of
  the cycle's root cause; only `dual-read.ts`'s two imports were. Nothing about `assistant`'s
  existing, documented "one place allowed to see both sides" design needs to change.
- **Deferred cost, called out explicitly for whoever revives this seam:** the day a real caller
  finally adopts `resolveDefaultForVendorDualRead` (the Phase 3 cutover this file's header already
  describes as pending), whoever wires the real `resolveLegacyPublish`/`resolveLegacySourceControl`
  implementations into it must do so from a module that does **not** sit downstream of
  `source-control`'s/`deployments`'s own `registerToolContributor` edge — i.e. not from `assistant`
  itself. `server/` (same shape as Option A's port) is the safe place. This needs a short comment
  in `dual-read.ts` at the deps interface, not a design decision made now — I'd write it as part of
  this change even though it has no caller yet, specifically so the next person doesn't reopen this
  exact cycle by wiring the real functions back through `assistant`.

**Unblocks themes/post:** same as Option A — once `source-control`/`deployments`/`static-publish`
convert, their `DOMAIN_SLICES` entries (and the static `assistant -> features/deployments` import)
go away, which is what actually unblocks `themes`. Option B doesn't touch that path directly either;
it just removes the specific edge that currently makes conversion illegal.

## 4. Third option — none found beyond B

I checked whether any already-converted domain solved a comparable "assistant already reaches
INTO me transitively" problem with a different mechanism. Two precedents exist, neither directly
applicable as a *third* option:

- **`recovery`** converted safely because its only imports of `features/database` were
  `import type` — erased from the runtime graph, so there was no real edge to begin with. Not
  applicable here: `dual-read.ts`'s imports are genuine value imports (it calls the functions).
- **`widgets`** converted first, specifically to remove the `assistant -> widgets` static edge
  *before* `content-types`/`forms`/`entries` (which `widgets` itself imports) converted — an
  ordering trick, not a structural decoupling. Doesn't apply here: no ordering of
  source-control/deployments conversions removes the shared root cause, because the edge that
  closes the loop (`vendor-credentials -> source-control -> deployments`) doesn't originate from
  either of those two domains' own files — it originates from `vendor-credentials/dual-read.ts`,
  a third module neither of them controls.

The one real precedent — a locally-declared structural port replacing a cross-module value import,
injected at a composition root that sees both sides — is `VendorCredentialPort` itself
(`publish-agent-tools.ts`). Option B is that same technique applied one hop further down the same
chain, not a genuinely different third option.

## 5. Recommendation

**Option B.** It fixes the actual edge that closes both cycles, costs one production file and one
test file, carries zero production risk today (no real caller exists to break), and reuses a
pattern this codebase has already validated for the identical problem one hop upstream
(`VendorCredentialPort`). Option A is not wrong — it's architecturally sound and `check:architecture`
would agree it also resolves the cycle — but it's a larger, riskier change (2+ boot-path files, an
implicit reliance on 28 tests continuing to compile-and-pass by inspection rather than by design,
and it gives up a deliberately-built safety guarantee) to fix a problem that a one-file change
already fixes cleanly. I'd only reach for Option A if the team separately decides, as a matter of
policy, that `assistant` should never import any `features/*` module directly for its own tool-deps
construction — that's a bigger, independent architectural stance beyond what this cycle requires.

Both options are compatible with each other and not mutually exclusive; Option A could still be
done later as a broader cleanup without conflicting with Option B having already landed.

## 6. Explicit non-implementation note

This document is design analysis only, produced as a read-only investigation. No source files were
modified. The two options above (and the recommendation) are inputs to a go/no-go decision by the
repo owner; implementation, if approved, is separate follow-up work.
