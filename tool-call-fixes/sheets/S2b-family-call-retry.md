# S2b. A family call that names exactly one member is retried once as that member (C1a, mechanism M1)

Repos: Jini (`mcp`), then one Tovu integration test. Estimate: 140k Sonnet.
Blocking decision: **OD-2** (it must be `DECIDED: yes`; if `DECIDED: no`, do not run this sheet).
Prerequisites: S2a, S8.
Landed checks: `rg -n "toolFamilies" ../Jini/packages/daemon/src/http/delegated-tools.ts` and
`rg -n "readonly details" ../Jini/packages/mcp/src/server/daemon-client.ts` (S8 puts `code` and `details` on `DaemonHttpError`).

## Why the retry is on the caller's side (judge finding 1)
Tovu mounts a durable guard **before** the Jini route (`registerDurableToolGuard`, `durable-run-routes.ts`). It checks
stale attempts and ledgers mutations by the request's `toolId`, and skips ids that are not registered. If the Jini
route turned a family id into a member, that member would run without the stale-attempt check and without the
mutation ledger. So the server never routes. The MCP gateway tool receives S2a's `404 UNKNOWN_TOOL` with
`details.family`, and when the caller's input selects exactly one member it sends a **second, ordinary request for
that concrete member**. Every host gate (bearer, run credential, durable guard, read-only check, principal,
attenuation, executor policy, confirmation card, result capture) then sees the concrete id from the first byte.

## Read first
`../DESIGN.md` M1. `rg -n "postDaemonJson|generateToolUseId|requireReadOnly" packages/mcp/src/server/tools/delegated-tool.ts`
(341 lines: new logic goes in a sibling file).

## Characterization (passes today, after S2a and S8)
`mcp/src/server/tools/__tests__/delegated-tool.family.test.ts` with a fake `fetchImpl`: the gateway called with
`{ toolId: 'fam', input: { kind: 'a', q: 1 } }` and a daemon that answers S2a's 404 → the tool result is the error
text `HTTP 404: UNKNOWN_TOOL: "fam" is a group of tools, not one tool. Call one of: fam.a, fam.b.`; exactly one request was sent.

## Red-first (fails: one request, error result)
Same file:
1. same call → two requests. The second has `toolId: 'fam.a'`, `input: { q: 1 }` (selector key removed), a **new**
   `toolUseId`, the same `runId`, and the same `requireReadOnly` value as the first. The result is the member's result
   with the note exactly `"fam" is a group; ran fam.a` (through the existing normalization-notes channel).
2. no retry, original error returned unchanged, when: no selector key in the input; two selector keys present; the
   value is not a string; the value is not an own key of `byValue`; the mapped member is not in `details.family.members`;
   `ctx.signal` is already aborted; the second answer is itself `UNKNOWN_TOOL` (never a third request).
3. the read-only gateway retries with `requireReadOnly: true`; a member the server refuses there comes back with the
   server's refusal text unchanged.
4. the second request's failure is reported as its own failure (no text from the first answer mixed in).

## Change
1. New `mcp/src/server/tools/family-retry.ts` (pure, ≤ 80 lines): `selectFamilyMember({ error, input }, {})` →
   `{ memberId, input } | undefined`, reading only `error.code` and `error.details.family` (never the message text).
2. `delegated-tool.ts`: wrap the one `postDaemonJson` call; at most one retry. Net growth ≤ 12 lines.

## Tovu integration test (linked build; real route, real durable guard, fake durable store)
`agent-daemon-server.family-retry.integration.test.ts`, paired family / concrete cases (judge finding 1):
- stale durable attempt: the family call and the concrete member call both end in `409 STALE_RUN_ATTEMPT`, same text.
- writable member through the full gateway: the durable store fake's `guardTool` is called exactly once, with the
  **member** id; through the read-only gateway: refused with the same text the concrete call gets, `guardTool` zero calls.
- the 404 round trip itself leaves no ledger row (`guardTool` zero calls for the family id).

## Acceptance
All cases green with exact text; the server route file is unchanged by this sheet (`git diff --stat` shows no
`daemon/src/http` file); gate green in both repos.
