# P-publish-trust-1 — publish-trust → @jini-ai/cms (Jini step J then Tovu step T)

Lane P. Batch J:5 T:6. Depends on: none (only already-Jini code). Est: J 61 min, T 58 min.

## J — move verbatim into Jini (5 files, 1312 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/features/publish-trust/grant.ts` | `packages/cms/src/publish/trust/grant.ts` | 319 | W2 |
| `apps/website/src/features/publish-trust/provisioning.ts` | `packages/cms/src/publish/trust/provisioning.ts` | 491 | W4 |
| `apps/website/src/features/publish-trust/provisioning-status.ts` | `packages/cms/src/publish/trust/provisioning-status.ts` | 113 |  |
| `apps/website/src/features/publish-trust/provisioning.node-io.ts` | `packages/cms/src/publish/trust/provisioning.node-io.ts` | 84 | W9 |
| `apps/website/src/features/publish-trust/revocations.ts` | `packages/cms/src/publish/trust/revocations.ts` | 305 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./publish/trust/grant"]
- "@jini-ai/cms" exports["./publish/trust/provisioning"]
- "@jini-ai/cms" exports["./publish/trust/provisioning.node-io"]
- "@jini-ai/cms" exports["./publish/trust/revocations"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (7, 1706 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/features/publish-trust/__tests__/grant-parse.unit.test.ts`
- `apps/website/src/features/publish-trust/__tests__/grant.test.ts`
- `apps/website/src/features/publish-trust/__tests__/provisioning.file-port.characterization.test.ts`
- `apps/website/src/features/publish-trust/__tests__/provisioning.test.ts`
- `apps/website/src/features/publish-trust/__tests__/revocations.test.ts`
- `apps/website/src/features/publish-trust/__tests__/provisioning.node-io.test.ts`
- `apps/website/src/features/publish-trust/__tests__/revocations-store.unit.test.ts`


## T — Tovu repoint: delete the 5 sources, rewrite every importer (46 lines)

```
apps/website/src/features/publish-content/ui/__tests__/sections.test.ts:14  '#src/features/publish-trust/grant' -> '@jini-ai/cms/publish/trust/grant'
apps/website/src/features/publish-trust/__tests__/challenge.unit.test.ts:16  '../grant.js' -> '@jini-ai/cms/publish/trust/grant'
apps/website/src/features/publish-trust/__tests__/frozen-values.pins.test.ts:10  '../grant.js' -> '@jini-ai/cms/publish/trust/grant'
apps/website/src/features/publish-trust/__tests__/grant-backstop.test.ts:4  '../grant.js' -> '@jini-ai/cms/publish/trust/grant'
apps/website/src/features/publish-trust/__tests__/handshake.test.ts:14  '../grant.js' -> '@jini-ai/cms/publish/trust/grant'
apps/website/src/features/publish-trust/challenge.ts:6  './grant.js' -> '@jini-ai/cms/publish/trust/grant'
apps/website/src/features/publish-trust/connect.ts:10  './grant.js' -> '@jini-ai/cms/publish/trust/grant'
apps/website/src/features/publish-trust/handshake-client.ts:5  './grant.js' -> '@jini-ai/cms/publish/trust/grant'
apps/website/src/features/publish-trust/session.ts:3  './grant.js' -> '@jini-ai/cms/publish/trust/grant'
apps/website/src/server/__tests__/routes/publish-trust-gate-predicates.characterization.test.ts:11  '#src/features/publish-trust/grant' -> '@jini-ai/cms/publish/trust/grant'
apps/website/src/server/__tests__/routes/publish-trust-gate.test.ts:12  '#src/features/publish-trust/grant' -> '@jini-ai/cms/publish/trust/grant'
apps/website/src/server/__tests__/routes/publish-trust-revocation-gate.test.ts:12  '#src/features/publish-trust/grant' -> '@jini-ai/cms/publish/trust/grant'
apps/website/src/server/inbound/admin-http/publish-trust-auth.ts:10  '#src/features/publish-trust/grant' -> '@jini-ai/cms/publish/trust/grant'
apps/website/src/server/inbound/admin-http/routes/publish-content/bundle-create.ts:5  '#src/features/publish-trust/grant' -> '@jini-ai/cms/publish/trust/grant'
apps/website/src/server/inbound/admin-http/routes/publish-content/capabilities.ts:3  '#src/features/publish-trust/grant' -> '@jini-ai/cms/publish/trust/grant'
apps/website/src/server/inbound/public-http/routes/publish-trust/handshake.ts:13  '#src/features/publish-trust/grant' -> '@jini-ai/cms/publish/trust/grant'
apps/website/src/features/publish-content/__tests__/disconnect-tool.test.ts:7  '#src/features/publish-trust/provisioning' -> '@jini-ai/cms/publish/trust/provisioning'
apps/website/src/features/publish-content/__tests__/publish-agent-tools.test.ts:12  '../../publish-trust/provisioning.js' -> '@jini-ai/cms/publish/trust/provisioning'
apps/website/src/features/publish-content/tool-deps.ts:8  '../publish-trust/provisioning.js' -> '@jini-ai/cms/publish/trust/provisioning'
apps/website/src/features/publish-content/tool-registrations.ts:40  '../publish-trust/provisioning.js' -> '@jini-ai/cms/publish/trust/provisioning'
apps/website/src/features/publish-trust/__tests__/frozen-values.pins.test.ts:13  '../provisioning.js' -> '@jini-ai/cms/publish/trust/provisioning'
apps/website/src/features/publish-trust/__tests__/grant-backstop.test.ts:6  '../provisioning.js' -> '@jini-ai/cms/publish/trust/provisioning'
apps/website/src/features/publish-trust/connect.ts:18  './provisioning.js' -> '@jini-ai/cms/publish/trust/provisioning'
apps/website/src/server/__tests__/routes/publish-trust-gate-predicates.characterization.test.ts:12  '#src/features/publish-trust/provisioning' -> '@jini-ai/cms/publish/trust/provisioning'
apps/website/src/server/__tests__/routes/publish-trust-gate.test.ts:14  '#src/features/publish-trust/provisioning' -> '@jini-ai/cms/publish/trust/provisioning'
apps/website/src/server/__tests__/routes/publish-trust-revocation-gate.test.ts:14  '#src/features/publish-trust/provisioning' -> '@jini-ai/cms/publish/trust/provisioning'
apps/website/src/server/__tests__/routes/publish-zero-setup-end-to-end.test.ts:25  '#src/features/publish-trust/provisioning' -> '@jini-ai/cms/publish/trust/provisioning'
apps/website/src/server/inbound/admin-http/publish-trust-auth.ts:11  '#src/features/publish-trust/provisioning' -> '@jini-ai/cms/publish/trust/provisioning'
apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/destination.routes.test.ts:15  '#src/features/publish-trust/provisioning' -> '@jini-ai/cms/publish/trust/provisioning'
apps/website/src/server/inbound/admin-http/routes/publish-content/destination.ts:17  '#src/features/publish-trust/provisioning' -> '@jini-ai/cms/publish/trust/provisioning'
apps/website/src/server/inbound/public-http/routes/publish-trust/__tests__/handshake-keyless.unit.test.ts:8  '#src/features/publish-trust/provisioning' -> '@jini-ai/cms/publish/trust/provisioning'
apps/website/src/server/inbound/public-http/routes/publish-trust/handshake.ts:14  '#src/features/publish-trust/provisioning' -> '@jini-ai/cms/publish/trust/provisioning'
apps/website/src/server/runtime/composition/modules/publish-content.ts:22  '#src/features/publish-trust/provisioning' -> '@jini-ai/cms/publish/trust/provisioning'
apps/website/src/server/runtime/composition/publish-trust-grants.ts:12  '#src/features/publish-trust/provisioning' -> '@jini-ai/cms/publish/trust/provisioning'
apps/website/src/features/publish-content/tool-registrations.ts:41  '../publish-trust/provisioning.node-io.js' -> '@jini-ai/cms/publish/trust/provisioning.node-io'
apps/website/src/server/__tests__/routes/publish-zero-setup-end-to-end.test.ts:26  '#src/features/publish-trust/provisioning.node-io' -> '@jini-ai/cms/publish/trust/provisioning.node-io'
apps/website/src/server/runtime/composition/modules/publish-content.ts:23  '#src/features/publish-trust/provisioning.node-io' -> '@jini-ai/cms/publish/trust/provisioning.node-io'
apps/website/src/server/runtime/composition/publish-trust-grants.ts:6  '#src/features/publish-trust/provisioning.node-io' -> '@jini-ai/cms/publish/trust/provisioning.node-io'
apps/website/src/server/runtime/composition/tool-catalog-manifest.ts:12  '#src/features/publish-trust/provisioning.node-io' -> '@jini-ai/cms/publish/trust/provisioning.node-io'
apps/website/src/features/publish-trust/publish-trust-revocations.ts:8  '#src/features/publish-trust/revocations' -> '@jini-ai/cms/publish/trust/revocations'
apps/website/src/platform/db/repos/__tests__/publish-trust-revocations.dialects.test.ts:7  '#src/features/publish-trust/revocations' -> '@jini-ai/cms/publish/trust/revocations'
apps/website/src/server/inbound/admin-http/publish-trust-auth.ts:12  '#src/features/publish-trust/revocations' -> '@jini-ai/cms/publish/trust/revocations'
apps/website/src/server/routes/types.ts:134  '#src/features/publish-trust/revocations' -> '@jini-ai/cms/publish/trust/revocations'
apps/website/src/server/runtime/composition/__tests__/publish-trust-sources.unit.test.ts:7  '#src/features/publish-trust/revocations' -> '@jini-ai/cms/publish/trust/revocations'
apps/website/src/server/runtime/composition/memory-deps/route-deps/trash-and-content.ts:7  '#src/features/publish-trust/revocations' -> '@jini-ai/cms/publish/trust/revocations'
apps/website/src/server/runtime/composition/publish-trust-revocations.ts:1  '#src/features/publish-trust/revocations' -> '@jini-ai/cms/publish/trust/revocations'
```

## Tovu tests that must stay green (15; import lines are repointed above, assertions untouched)
- `apps/website/src/features/publish-content/__tests__/disconnect-tool.test.ts`
- `apps/website/src/features/publish-content/__tests__/publish-agent-tools.test.ts`
- `apps/website/src/features/publish-content/ui/__tests__/sections.test.ts`
- `apps/website/src/features/publish-trust/__tests__/challenge.unit.test.ts`
- `apps/website/src/features/publish-trust/__tests__/frozen-values.pins.test.ts`
- `apps/website/src/features/publish-trust/__tests__/grant-backstop.test.ts`
- `apps/website/src/features/publish-trust/__tests__/handshake.test.ts`
- `apps/website/src/platform/db/repos/__tests__/publish-trust-revocations.dialects.test.ts`
- `apps/website/src/server/__tests__/routes/publish-trust-gate-predicates.characterization.test.ts`
- `apps/website/src/server/__tests__/routes/publish-trust-gate.test.ts`
- `apps/website/src/server/__tests__/routes/publish-trust-revocation-gate.test.ts`
- `apps/website/src/server/__tests__/routes/publish-zero-setup-end-to-end.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/destination.routes.test.ts`
- `apps/website/src/server/inbound/public-http/routes/publish-trust/__tests__/handshake-keyless.unit.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/publish-trust-sources.unit.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/features/publish-trust/grant.ts` (2)
- `apps/website/src/features/publish-trust/provisioning.ts` (4)
- `apps/website/src/features/publish-trust/provisioning.node-io.ts` (9)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/website/src/features/publish-trust/provisioning.node-io.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/website/src/features/publish-trust/provisioning.ts:38: export const PUBLISH_TRUST_ENV_VAR = "TOVU_PUBLISH_TRUST";
apps/website/src/features/publish-trust/provisioning.node-io.ts:43: return env.TOVU_REPO_ROOT || process.cwd();
```

## Named mutation
in the Jini copy of `provisioning.ts`, negate the first `if (` condition of its first exported function; `provisioning.file-port.characterization.test.ts` must go red, then revert
