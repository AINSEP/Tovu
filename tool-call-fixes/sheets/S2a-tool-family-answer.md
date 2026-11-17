# S2a. A tool family answers as a group; the product name leaves Jini (C1a, mechanism M1)

Repos: Jini (`daemon`), then Tovu. Estimate: 150k Sonnet. Prerequisites: S1.
Blocking decision: none.
Landed check: `rg -n "resolveToolTarget" ../Jini/packages/daemon/src/core/tool-target.ts`.
**No routing in this sheet.** A family id never executes anything here, so no host gate changes. Routing is S2b.

## Read first
`../DESIGN.md` §2.1, M1. Jini `rg -n "candidateTarget|content_read" packages/daemon/src/core/tool-candidates.ts`,
`daemon/src/core/tool-target.ts` (S1), `rg -n "targetToolIds" packages/daemon/src/http/tool-catalog.ts`.
Tovu `rg -n "describeContentReadFamily|targetToolIds" apps/website/src/assistant/tool-catalog-query.ts`,
`rg -n "delegatedToolRouteDeps" apps/website/src/server/inbound/assistant/agent-daemon-scope.ts`.

## Characterization (passes today, after S1)
- Jini: `toolCandidates({ toolId: 'content_read', input: { resource: 'theme' }, tools })` returns today's list (pin it).
- Tovu integration (`agent-daemon-server.typed-tools.integration.test.ts` style): executing `content_read` with
  `{ resource: "menu" }` answers `404 UNKNOWN_TOOL` with S1's sentence.

## Red-first
- Jini `tool-target.unit.test.ts`: fake `ToolFamilyPort.describeFamily` returns
  `{ members: ['fam.a', 'fam.b'], selector: { keys: ['kind'], byValue: { a: 'fam.a', b: 'fam.b' } } }` → the answer is
  404 `UNKNOWN_TOOL`, message exactly `"fam" is a group of tools, not one tool. Call one of: fam.a, fam.b.`, and
  `details` exactly `{ family: { id: 'fam', members: ['fam.a', 'fam.b'], selector: { keys: ['kind'], byValue: { a: 'fam.a', b: 'fam.b' } } } }`.
  Fails: no port.
- Visibility: the port names `fam.c`, which is **not** in the registry given to the route → `fam.c` is absent from the
  message, from `details.family.members` and from `selector.byValue` (the route filters by its own registry; the
  port is never trusted for visibility).
- Read-only gateway: same answer, same status (a family is not a refusal).
- Guard: add to the `scripts/guard.ts` product-string data that `content_read` may not appear in `packages/**`
  non-test source. Fails today on `tool-candidates.ts`.

## Change
1. Jini `tool-target.ts`: `ToolFamilyPort` and the `families` option (DESIGN M1). `details` built only from port data
   that survives the registry filter; `byValue` keys must be own, string, ≤ 64 chars; at most 64 members.
2. Jini `DelegatedToolsHttpDeps`: optional `toolFamilies?: ToolFamilyPort` (absent = no families; S1 behaviour).
3. Jini `toolCandidates`: takes an optional `target` hint from its caller instead of deriving it from a product id;
   delete `candidateTarget`. Guard rule green in this commit.
4. Tovu: build the port from the same catalog snapshot `describeContentReadFamily` uses (members = `targetToolIds`;
   selector keys `resource`, `type`, `entity`, `kind`; `byValue[v] = "content_read.<v>"` only when that exact member
   exists). New file `apps/website/src/assistant/tool-family-port.ts` (pure, unit-tested); one deps line in
   `delegatedToolRouteDeps`. The scope file grows by one line at most (`check:size`).

## Acceptance
- The family answer is covered with exact text and exact `details` in Jini and by one Tovu integration test over the
  real route, on both gateways. Nothing executes: `resolvePrincipal`, executor and the durable-guard fake record zero calls.
- Guard green; no Tovu name in Jini source. Gate green in both repos.
