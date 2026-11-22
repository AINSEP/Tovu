# xpkg-r12b (Tovu half; the full report is `cloud-results/xpkg-r12b.md` on Jini branch `wave3/xpkg-c12obs-r12`)

**Status: R12b DONE (Tovu part is one repin).** Branch `wave3/xpkg-c12obs-r12`, base `12260fdb`, pushed fast-forward, `3403c518` (pre-push hook passed on its own; no `--no-verify`). Jini commits: `d3997a51`, `4cb9cc01`, `46bb0ff6` (+ report `36c3efe8`).

## Done
- Tovu never calls `onState`/`grant` on a consent adapter (`gatedConsentAdapter` only forwards the plugin's `consentAdapter({path})`), so no source edit is needed.
- The cookie-consent client bundle changed (it now hands adapters their storage purge), so its content-hashed route name changed: `apps/website/src/server/runtime/composition/__tests__/fixtures/create-app-route-table.snapshot.json` `client-9a0e4e8f65a9.min.js` -> `client-795b803dc863.min.js` (checked against Jini `46bb0ff6`). The sheet did not list this file.

## Gates
Setup: Node 24.11.1; `npm ci --ignore-scripts` (a plain `npm ci` fails in `packages/contracts`'s prepare build against the npm copy of core, which lacks `contracts/observability`); `link-jini.mjs` to the local Jini; built `packages/contracts` and `packages/sdk`.
- `npm run typecheck`: exit 0, linked to Jini `46bb0ff6`.
- 17 consent-related test files (`rg -l "cookie-consent|consent-adapter|consentAdapter"`): first run 1 fail (the route-table pin above, RED for the stated reason), after the repin `tests 271, pass 271, fail 0`.
- `check:hooks` 0, `check:errors` 0. `check:why-comments` exit 1 with one line (`provider-contracts.ts:12`, the `metric is not required` comment): it is from R12c's commit `196cb5fc` (already on the base; its new home is diagnostics `provider-contract.ts:11`), not from this run: BASE-RED, no new line.
- Not run: full Tovu suite, check:size, check:complexity.

## Overlaps
Any lane that changes the cookie-consent client bundle changes the same snapshot line.
