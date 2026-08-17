# Vendor-Credentials Phase 3: Dual-Read Resolver + Admin CRUD Route

**Date:** 2026-08-16
**Agent:** Programmer (Sonnet), dispatched by team-lead
**Commits:** `04cf0747` (route + dual-read + report), `d4d941d0` (composition-root wiring +
HTTP tests) on `general-work`

## UPDATE: composition-root wiring landed (`d4d941d0`)

The gaps flagged below as "not this pass" are now closed. Team-lead cleared
`server/deps.ts`/`server/routes/types.ts` (`arch-export-edge`'s second refactor had
landed and committed); both files were re-read fresh before editing, per the corrected
git protocol (scoped `git commit <paths> -F <msgfile>`, not stage-then-check-then-commit).

- `server/routes/types.ts`: `RouteDeps` now carries `vendorCredentialSetRepo:
  VendorCredentialSetRepoPort`, added right after the two legacy credential repos it will
  eventually replace — additive, both legacy repos stay wired and live.
- `server/deps.ts`: constructs the real `SqliteVendorCredentialSetRepo(db)`, sealed via
  the same shared sealer/keyring every other credential repo here reuses.
- `server/app.ts`: constructs the hermetic `InMemoryVendorCredentialSetRepo()` for
  `createRouteDeps()`, and registers `registerAdminVendorCredentialsRoutes` right after
  the two legacy credential routes.
- `src/server/routes/admin/system/vendor-credentials.ts`: `AdminVendorCredentialsDeps`
  collapsed from the temporary `RouteDeps & {vendorCredentialSetRepo}` intersection to
  plain `RouteDeps`, now that the field is real.
- **New:** `src/server/__tests__/routes/vendor-credentials-route.test.ts` — 8 HTTP-level
  tests through the real composition root (`createApp`/`createRouteDeps`), closing the
  test gap this report originally flagged. Covers auth gating (bare-principal 403,
  workspace-id 404), empty-list GET, full CRUD round trip (asserts `tokenTail` is present
  but the full token never reaches the wire), idempotent DELETE, `NOT_FOUND` on a bad PUT
  id, `VALIDATION` on a bad connection shape (including bitbucket's username
  requirement), and `DUPLICATE_LABEL` on a repeat `(vendorId, label)`. All 8 passed on
  the first run once the wiring made the route reachable — that first-run green, on a
  route that was unregistered and unreachable moments before, IS this slice's RED-to-GREEN
  proof.

Regression check after the wiring pass: 34/34 vendor-credentials feature tests, 12/12
`publish-credentials-route` tests, 8/8 `source-control-credentials-route` tests, 22/22
`route-async-guards` tests all still green. `tsc --noEmit` and `eslint` clean across
every touched file (the `daemon-supervisor.ts` error flagged below has since cleared —
that was the other agent's own in-flight WIP settling, not anything this pass did).

Everything in the original "Next steps" list below is now done EXCEPT step 5 (agent-tool
cutover) and step 6 (the `deployment_propose_custom_provider_credential` second cutover
point) — both remain explicitly out of scope for this dispatch.

---

## Original report (route + dual-read resolver, pre-wiring)

## Scope delivered

Per the dispatch brief's sequencing instruction ("do everything you can WITHOUT
`server/deps.ts` first ... then check in before the `deps.ts` wiring"), this pass
delivered exactly the pre-clearance slice:

1. **`src/features/vendor-credentials/dual-read.ts`** — `resolveDefaultForVendorDualRead`.
   Reads `vendor_credential_sets` first; if that vendor's group is empty, falls back to
   whichever legacy table (`publish_credential_sets` / `source_control_credential_sets`)
   used to carry it. Returns `{source: "vendor" | "legacy-publish" |
   "legacy-source-control", id, label, connection}` or `null` (honest "not configured").
   - Never re-derives an AAD across lineages: delegates to `resolveDefaultForVendor` /
     `resolveDefaultForPublish` / `resolveDefaultForSourceControl`, each of which derives
     its own table's AAD internally. This module's only job is "which table has a row"
     plus reshaping whichever `PublishConnectionInput`/`SourceControlConnectionInput` came
     back into `VendorConnectionInput` (field-for-field identical except the discriminant
     key — confirmed by reading `backfill-vendor-credentials.ts`'s own `deriveTokenTail`,
     which relies on the same parity).
   - `github` precedence (publish table checked before source-control table when both have
     a default row) matches `backfill-vendor-credentials.ts`'s own `loadSourceRows`
     ordering, so a workspace read through dual-read and the same workspace read after a
     real backfill resolve to the identical row.
   - The `VENDOR_TO_PUBLISH_PROVIDER` / `VENDOR_TO_SOURCE_CONTROL_PROVIDER` reverse maps
     are derived by inverting `types.ts`'s existing forward maps (never hand-duplicated) —
     avoids adding a THIRD place a vendor/provider association could drift, on top of the
     two the handoff doc already flagged (`resolveLabel` vs. `decideCreateDefault`).

2. **`src/features/vendor-credentials/__tests__/dual-read.unit.test.ts`** — 7 cases, all
   green:
   - new table populated -> reads new, proven to ignore a colliding legacy row entirely
   - new table empty -> falls back to legacy publish table, returns the working credential
   - new table empty -> falls back to legacy source-control table (source-control-only
     vendor)
   - both empty -> `null`, not a thrown error
   - a vendor with no legacy counterpart on one table resolves cleanly (no crash on the
     missing map entry)
   - `github` with rows in BOTH legacy tables prefers the publish table
   - **adversarial case:** a corrupt/undecryptable NEW-table row throws its own typed
     `VendorCredentialSecretStoreUnconfiguredError` and does **not** silently fall back to
     a legacy row — a real data-corruption signal must never be masked by stale legacy data
     that happens to still work.

3. **`src/features/vendor-credentials/index.ts`** — public barrel, did not exist yet
   (Phase 2 left it out). Added to match the `publish-credentials`/`source-control`
   sibling features' own ADR-009 shape, and because the new route file needs an import
   surface.

4. **`src/server/routes/admin/system/vendor-credentials.ts`** — thin CRUD route
   (`GET`/`POST`/`PUT :id`/`DELETE :id`) over the new table only, mirroring
   `publish-credentials.ts`'s "auth check, shape request, map typed errors to status
   codes" discipline. Gated on a new, dedicated `vendor-credentials.write` permission
   (not a reuse of `system.publish` or `source-control.credentials.write` — this table now
   serves both domains, so either predecessor's permission would over- or
   under-authorize). No `POST :id/verify` endpoint — no reviewed, provider-agnostic
   "verify this connection" mechanism exists yet across all 7 vendors; building one is
   separate work, not silently approximated.

## The deliberate gap: `AdminVendorCredentialsDeps`, not `RouteDeps`

`RouteDeps` (`server/routes/types.ts`) does not have a `vendorCredentialSetRepo` field yet.
That file is owned by `arch-export-edge` this session, and `server/deps.ts` (where the real
`SqliteVendorCredentialSetRepo` would be constructed) is the explicitly-gated file per the
brief. So the route is typed against:

```ts
export type AdminVendorCredentialsDeps = RouteDeps & { vendorCredentialSetRepo: VendorCredentialSetRepoPort };
```

This compiles standalone (confirmed: `tsc --noEmit` clean) without touching `types.ts`. It
means the route **cannot yet be registered** in `server/app.ts` — no real `RouteDeps` object
satisfies this intersection type until `vendorCredentialSetRepo` is added there. That's the
next, coordinated step, not done in this pass.

## What is explicitly NOT done in this pass (and why)

- **No HTTP-level test for the new route.** Every existing route test in this codebase
  (`src/server/__tests__/routes/publish-credentials-route.test.ts` etc.) goes through the
  real composition root (`createApp(deps)` / `createRouteDeps()` from `server/app.ts` +
  `server/deps.ts`) — there is no lighter-weight convention to test a route in isolation
  here. Building a bespoke non-standard harness just for this one route would diverge from
  repo convention and still land in directory territory (`src/server/__tests__/routes/**`)
  owned by `routes-coverage` this session. The route's own logic is a mechanical,
  low-risk mirror of `publish-credentials.ts`'s already-well-tested shape, and the
  `store.ts` CRUD it delegates to has 42 passing tests from Phase 2. The route's HTTP-level
  test should land in the same follow-up pass as the `deps.ts`/`app.ts`/`types.ts` wiring,
  once a real `RouteDeps` can satisfy it.
- **No `server/deps.ts`, `server/app.ts`, or `server/routes/types.ts` changes.** Per brief
  sequencing — holding for clearance.
- **No agent-tool cutover** (`deployment_get_static_publish_capabilities` in
  `publish-agent-tools.ts` still reads only the old `publish_credential_sets` table, exactly
  as before this pass). Its "NEVER a token, ciphertext, or masked tail" comment is **still
  true today** — `PublishCredentialSummary` has no `tokenTail` field, unlike
  `VendorCredentialSetSummary`. That comment only becomes false once THIS tool is cut over
  to read the new table and starts returning `tokenTail` in its `savedCredentials` array —
  which requires the same `deps.ts`/`types.ts` wiring this pass deliberately held off on.
  **Flagging this explicitly so the "rewrite the contract text" acceptance criterion isn't
  lost**: it applies at cutover time, not to this pass, and should be done in the SAME
  change that adds `tokenTail` to what that tool returns, not before or after.
- **No admin UI.** Owned by `admin-vendor-ui`.

## Verification

- `node --import tsx --test "src/features/vendor-credentials/__tests__/*.test.ts"` — 34/34
  green (27 Phase-2 store tests + 7 new dual-read tests).
- `node --import tsx --test "src/features/deployments/publish-credentials/__tests__/*.test.ts" "src/features/source-control/__tests__/*.test.ts"` —
  150/150 green, unaffected (sanity check since dual-read imports both features' stores).
- `npx tsc --noEmit -p .` — clean on every file this pass touched. One pre-existing,
  unrelated error in `src/assistant/daemon-supervisor.ts` (`SpawnedDaemonProcess` type
  mismatch) — that file is untracked (`git status` shows `??`), i.e. another agent's
  in-flight WIP this session, not something this pass introduced or is responsible for.
- `npx eslint` — clean on all four changed/added files.

## Next steps (not this pass)

1. Team-lead clears `server/deps.ts` / `server/routes/types.ts` for edits.
2. Add `vendorCredentialSetRepo: VendorCredentialSetRepoPort` to `RouteDeps`
   (`server/routes/types.ts`), construct `new SqliteVendorCredentialSetRepo(db)` in
   `server/deps.ts` (mirrors the existing `publishCredentialSetRepo` /
   `sourceControlCredentialSetRepo` construction there almost exactly).
3. Register `registerAdminVendorCredentialsRoutes` in `server/app.ts`.
4. Add the deferred HTTP-level route test (now possible through the real composition
   root).
5. Cut `deployment_get_static_publish_capabilities` over to
   `resolveDefaultForVendorDualRead` (and/or a new non-decrypting dual-read
   list/readiness function this pass did NOT build — only the decrypting
   "resolve the default credential" shape was in scope, since that's what the brief's
   three required test cases describe). Rewrite the "NEVER a token, ciphertext, or masked
   tail" contract text in the same change that adds `tokenTail` to its output.
6. `deployment_propose_custom_provider_credential` is a second, separate unscheduled
   cutover point (still writes through the OLD `publish-credentials/store.ts`) — noted in
   the original brief, not touched here, not forgotten.
