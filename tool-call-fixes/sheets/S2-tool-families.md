# S2. Tool families resolve through a host port; the product name leaves Jini (C1a, mechanism M1)

Repos: Jini (`daemon`), then Tovu. Estimate: 150k Sonnet. Prerequisites: S1 merged. Owner decision OD-2 decides step 4.

## Read first
`../DESIGN.md` §2.1, M1. Jini `daemon/src/core/tool-candidates.ts` (`candidateTarget` names `content_read`),
`daemon/src/core/tool-target.ts` (from S1), `daemon/src/http/tool-catalog.ts` (`targetToolIds`).
Tovu `apps/website/src/assistant/tool-catalog-query.ts` (`describeContentReadFamily`), the delegated route deps in
`apps/website/src/server/inbound/assistant/agent-daemon-scope.ts` (`delegatedToolRouteDeps`).

## Characterization (passes today)
- Jini: `toolCandidates({ toolId: 'content_read', input: { resource: 'theme' }, tools })` returns the same list as today (pin it).
- Tovu integration (`agent-daemon-server.typed-tools.integration.test.ts` style): executing `content_read` with `{ resource: "menu" }` answers `404 UNKNOWN_TOOL` after S1.

## Red-first
- Jini `tool-target.unit.test.ts`: with a fake `ToolFamilyPort` returning `{ members: ['fam.a', 'fam.b'] }`, the unknown answer is exactly
  `"fam" is a group of tools, not one tool. Call one of: fam.a, fam.b.` (fails: no port yet).
- Jini guard: add a rule to `scripts/guard.ts` data that the string `content_read` may not appear in `packages/**` non-test source (fails today on `tool-candidates.ts`).
- OD-2 = yes: port returns `{ memberId: 'fam.a', input: {} }` → target is `{ kind: 'tool', toolId: 'fam.a', notes: ['"fam" is a group; ran fam.a'] }`, and the read-only check runs against `fam.a` (test with a non-read member: the read-only gateway still refuses it with today's refusal text).

## Change
1. Jini: add `ToolFamilyPort` and the `families` option to `resolveToolTarget`. Add optional `toolFamilies?: ToolFamilyPort` to `DelegatedToolsHttpDeps`.
2. Jini: `toolCandidates` takes an optional `target` instead of deriving it from a product id; delete `candidateTarget`.
3. Tovu: build the port from the same catalog snapshot `describeContentReadFamily` uses (members = `targetToolIds`; selector keys `resource`, `type`, `entity`, `kind` map to `content_read.<value>` only when that exact member exists). Wire it into `delegatedToolRouteDeps`.
4. OD-2 = yes: the route continues with the member id and the input without the selector key, and returns the note through the existing normalization-notes channel. OD-2 = no: only the "group of tools" answer.

## Acceptance
- A read-only caller can never reach a member the read-only catalog hides (test: `visibleToolIds` narrowing still applies; the port receives only visible members).
- The family answer and the routed call are both covered with exact text in Jini and by one Tovu integration test over the real route.
- Guard rule green; no Tovu name in Jini source.
