# Security fixes from the 2026-11-16 review (items A1, A2/B07, A3/A37, C)

Unattended cloud run, 2026-11-16. Source of truth for what to fix:
`plan/security-review-2026-11-16:ADS-memory/.local-artifacts/terra-refactor-2026-11-13/security/REVIEW.md` (revision 2).
The repositories are public, so every item below is class, location and fix only.

Each fix was done red-first: the test was run and seen failing before the fix, then passing, then the fix
was mutated one line at a time and the test was seen failing again. Every mutation was reverted; the
working trees are clean. "Baselined" below means I ran the same tests on the untouched base and compared.

## Branches and commits (all pushed, none force-pushed)

| Item | Repo | Branch | Base | Commits |
|---|---|---|---|---|
| 1 | Jini | `fix/sec-audit-x1` | `moves/audit-x1` `8cab4e0f` | `9f19eeb9` |
| 1 | Tovu | `fix/sec-audit-x1` | `moves/audit-x1` `022e1d5b` | `08d4d826` |
| 2 | Jini | `fix/sec-b07` | `moves/audit2-a` `b5e48106` | `afe6152a`, `f8964b70` |
| 2 | Tovu | `fix/sec-b07` | `refactor/terra` `80b00f5b` | `d071ae5d`, `49623287` |
| 3 | Jini | `fix/sec-a37` | `moves/audit2-desktop` `d78fb1c6` | `515baa14` |
| 3 | Tovu | `fix/sec-a37` | `refactor/terra` `80b00f5b` | `1ef5cdab`, plus this report and the desktop patch |
| 4 | Jini | `fix/sec-mcp-isolation` | `cloud/small-fixes-2026-11-15` `2bf74b9f` | `a619ab3b` |

Pair rule: Tovu `d071ae5d` and `49623287` name Jini `afe6152a` / `f8964b70`; Tovu `1ef5cdab` names Jini
`515baa14`; Tovu `08d4d826` names Jini `9f19eeb9`. The Tovu halves of items 2 and 3 do not type-check
against a Jini without their pair.

## Decisions an owner should look at first

1. **Item 2, review finding A2-F3 is NOT done, on purpose.** I first moved the open-back check into the
   vault service's `seal` so that `put`, `prepare` and copy-overwrite get it too (as the review
   recommends), and pushed it (`afe6152a`). Run against Tovu, it changed how many times every save opens
   an envelope, and four Tovu suites pin those counts or use a sealer double that does not open what it
   seals: `extract-s8-c1-second-host.test.ts`, `external-mcp-frozen-db.test.ts`,
   `hosted-store-seams.test.ts` ("H0 per-row counts"), `suppressions-feedback.unit.test.ts`. One extra
   open per save is a cost someone pinned deliberately, so I narrowed the check back to `rotate` only
   (`f8964b70`) and withdrew the two tests I had written for the wider check. The copy-overwrite path is
   therefore still unverified, exactly as the review found it.
2. **Item 4 is the revert, not the fix.** The full fix needs the isolation stamp to name a CLI version on
   which the behaviour was verified. There is no CLI in this environment, so that cannot be done honestly
   here.
3. **Item 3 desktop hunk is a patch file**, not a commit: `cloud-results/security-a37-desktop.patch`
   (source change plus four new desktop tests). It applies cleanly on `1ef5cdab`.

## Item 1 - A1: bound visitor confirmations

**Jini `9f19eeb9`** - `packages/daemon/src/bound-confirmations.ts`
- A1-F5 (owner check depended on value truthiness): presence is now tested explicitly in a named helper
  (`ownerMayAnswer`), so an owner of `0`, `''` or `false` must match like any other. A `null` owner means
  "bound to nobody" and the prompt is refused before anything is emitted. `createBoundConfirmations` did
  not grow (the helper is outside it).
- A1-F3 and A1-F6 as doc notes on the types (unguessable ID generator; immutable owner value).
- A1-F2: the six missing gate tests, plus "digests only through the injected crypto port".
- Tests in `bound-confirmations.test.ts`: 4 -> 20.
- Red: 4 failed before the fix (owner matrix for the empty string, zero and `false`; the `null` owner).
- Mutations: 12 of 12 caught (presence back to truthiness; `null` not refused; approval never true;
  single-use delete removed; each of the three abort checks removed; deny still prompts; delivery moved
  out of `finally`; quota slot not released; run slot not released; digest read from the global).
- Changeset: `.changeset/daemon-bound-confirmation-owner-presence.md` (patch).
- Whole daemon suite, baselined: 381 failing on the base and the same 381 on the branch (identical list,
  all outside this file); passing went from 3990 to 4006. `pnpm guard`: 153 violations, none in the
  touched files (the base is not green). Daemon type-check: 9 errors, none in the touched files. ESLint
  clean on the touched files.

**Tovu `08d4d826`** - `apps/website/src/assistant/site/visitor-confirmation-gate.ts:39`
- A1-F1: the character class is escapes again, byte-identical to the line before the move.
- New `apps/website/src/__tests__/no-raw-bidi-controls.boundary.test.ts`: fails when any file under
  `apps/website/src` holds a raw character in U+200E-200F, U+202A-202E or U+2066-2069, and reports
  file, line, column and code point. The copy test now covers all eleven code points (was six).
- Red: the guard listed the six raw characters at line 39 before the fix.
- Mutations: 4 of 4 caught (raw characters put back; class emptied; each range narrowed to its two ends -
  the last two would have survived the old six-code-point test).
- Site confirmation suites plus the guard, against the fixed Jini: 585 of 586. The one failure,
  `mcp-ui-allowlist-completeness.test.ts` "every surfaceExchanges.open(...) call names a toolId constant",
  is the one the move's own report says also fails on its base; I did not baseline it myself.
  Type-check: 58 errors, none in the touched files.

Remains for item 1:
1. A1-F4 (a Tovu test that the admin reply route cannot deliver to a visitor exchange) - not done.
2. Raw bidi characters also exist outside the guard's scope: `apps/admin/src/features/sites/sites-i18n.ts`
   (1) and `apps/admin/src/features/plugins/plugins-i18n.ts` (2). They may be intended (translations); I
   did not touch them and the guard does not scan `apps/admin`.

## Item 2 - A2: B07 vault rotate and the key-switch recovery

**Jini `afe6152a` + `f8964b70`** - `packages/platform/src/secrets/credential-sets/vault.service.ts`
- A2-F1: `rotate(input, { sourceOpener })`. The source opener reads the stored row once; the service's own
  `sealer` seals the new envelope and verifies it, so `deps.sealer.open` always means "open with the
  current keyring".
- A2-F2: a refused re-seal throws `VaultResealRefusedError` (new file `vault.reseal-refused.ts`). It is
  still a `VaultError` with the name `VaultError` and the code `invalid-record`. It adds the failing step,
  the key generation, and the sealer error's name and code when those are plain identifiers. It never
  carries an envelope, a binding string, a plaintext or the original error's message, and says in words
  that the stored secret was not changed.
- A2-F4: tests for a key store failure on open and for an active key the opener does not know.
- Sealer contract suite: `secretSealerContractViolations({ sealer, keyring })` in
  `packages/platform/src/secrets/sealer-contract.ts`, exported from `@jini-ai/platform/secrets/testing`.
  Runner-agnostic; returns the violated rules. Run in Jini against both keyring bindings, and shown to
  report a split binding, a lossy binding and a binding that ignores the binding string.
- Changeset: `.changeset/platform-vault-rotate-source-opener.md` (patch).
- Red: 9 new tests failed before the fix. Mutations: 13 of 13 caught (source opener ignored; source opener
  also used to verify; check removed; plaintext comparison removed; cause dropped; bare `invalid-record`
  again; check under the wrong binding; identifier filter removed; original error kept; "not changed"
  sentence removed; three on the contract suite).
- Platform suite: 3111 pass, 2 fail. `exports.test.ts` fails the same way on the base (baselined);
  `integration-contracts.test.ts` fails on a runtime tag in `package.json` that this change does not
  touch (not baselined). Platform type-check: 0 errors. Integrations 2051 of 2051, server 472 of 472.
  `db`: 853 pass, 8 fail, all in `loads-without-driver.test.ts` across subpaths that do not import the
  vault service (not baselined). `pnpm guard`: 153 violations, none in the touched files.
- One pin test changed on purpose: `entry-barrels.test.ts` now names the third export of the testing entry.

**Tovu `d071ae5d` + `49623287`** - `apps/website/src/server/runtime/composition/site-key-recovery.ts`
- The vault service gets the new key's sealer for both halves; the previous key is `rotate`'s
  `sourceOpener`. The duplicate seal-then-open check is removed (the engine does it).
- `sealed-credential-discard.test.ts` builds its own copy of that binding; it now mirrors the production
  one. Its assertions are unchanged.
- Red, run for real (the review could only read it): `site-key-recovery.unit.test.ts` is **10 of 12
  against unmodified B07** (the row move and the plugin-state recovery both refused) and **14 of 14** with
  the pair (two tests added: the sealer contract for the recovery binding, and a neither-key row).
- Mutations: 3 of 3 caught (source opener not passed; sealer bound to the previous key again; source
  opener set to the new key).
- The six suites the wider check had touched: 70 of 70. All 204 Tovu test files that mention the vault:
  3224 pass, 51 fail; none of the 51 mentions a seal, an open or the new error (they are a missing
  PostgreSQL server and optional packages that are not built here). I did not baseline those 51 one by
  one. Type-check: 21 errors, none in the touched files.

Remains for item 2:
1. A2-F3 (open-back check on `put` and copy-overwrite) - see "Decisions" above.
2. The contract suite is run for the recovery binding only. The other Tovu bindings
   (`vendor-credentials/vault-adapter.ts`, `platform/secrets/vault-kinds.ts`, `owner-store.ts`,
   `other-site-keys.ts`, `publish-content/peers.ts`, `api-connections/vault-stores.ts`,
   `database-transfer/destination-store.ts`) each need one line.
3. Tovu-Runner and Zana were not checked for a split sealer binding.

## Item 3 - A3: A37 pinned capability and bearer handoff

**Jini `515baa14`** - `packages/mcp/src/federation/hosted/pinned-capability.ts`
- A3-F1: `capability()` is gone. `endpointUrl({})` returns the pinned URL as a string; the token is
  reachable only through `bearerToken` for that exact URL. The pin is a detached, frozen copy of `url`
  and `token` read once, so a later change to the environment object or to a delivered object cannot
  move it (this also closes A3-F6).
- A3-F2: the doc says to pass the live environment object, and the runtime returns `scrubbed` (the names
  it deleted).
- A3-F4: `onUnavailable` receives `{ error }`; a refused delivery names the HTTP status only.
- A3-F5: documented (the handoff token format is fixed); not made injectable.
- A3-F3: delivery tests - redirect mode, abort on disconnect during a POST, disconnect before the host
  resolves, timeout - plus malformed values still scrubbed and the handoff-only bearer before and after.
- Tests in `pinned-capability.test.ts`: 5 -> 17. Three existing assertions that called `capability({})`
  now read the URL through `endpointUrl` and the token through the bearer supplier.
- Changeset: `.changeset/mcp-pinned-capability-url-only.md` (patch; it narrows an API that is not
  published yet).
- Red: 9 of 17 failed before the fix. Mutations: 14 of 15 caught. The survivor replaces "pin once" with
  "assign again" after the replacement check has already proven the value identical; it is an equivalent
  mutant, not a gap.
- Hosted tests 24 of 24; `packages/mcp` type-check clean for the touched files. Whole `mcp` suite: 1670
  pass, 2 fail in 3 files (`serve.test.ts`, `mcp-federation.registrations.test.ts`,
  `tool-server.wire.test.ts`) - baselined, the same three fail with the module untouched.

**Tovu `1ef5cdab`** - `apps/website/src/assistant/desktop-mcp-runtime.ts`, per the review's list:
- `isDesktopMcpCapability` and `isDesktopMcpUrl` are unchanged (no diff line touches them) and are passed
  as the endpoint policy. The three variable names are passed as `names`.
- `connection()` stays in Tovu, built from the pinned URL only, `headers` empty, the same three allowlists.
- `runtimeForProcess` is unchanged: the startup-secret snapshot plus the explicit delete of the URL key.
  `TOVU_DESKTOP_MCP_TOKEN` and `TOVU_DESKTOP_MCP_HANDOFF_TOKEN` stay in `STARTUP_SECRET_KEYS`.
- The `DesktopMcpRuntime` interface is the same five members; nothing of the engine runtime is re-exported.
- `desktop-mcp-handoff.ts`: no change.
- Red: "a delivered object that answers differently on a later read pins only what the endpoint policy
  saw" failed on the old runtime. The other four new tests are regression guards that passed before and
  after; each is proven by mutation.
- Mutations: 7 of 7 caught (live URL scrub removed; token put on the connection; engine runtime
  re-exported; endpoint policy loosened; write allowlist widened; each of the two startup-secret keys
  removed).
- The tests the earlier attempt could not load now run: they needed `packages/sdk` built (`tsc` in that
  package), nothing else. `desktop-mcp-runtime.integration`, `desktop-mcp-capability.unit`,
  `startup-secrets.unit`, `daemon-startup-secrets.unit` and the two new files: 16 of 16.
- Importer tests and type-check: see "Late results" at the end of this file.

**Desktop hunk: `cloud-results/security-a37-desktop.patch`** (not committed; `apps/desktop` is untouched
on the branch). `connectSite` keeps, in order: the stopped check; `assertLoopbackAdminUrl` before the
endpoint is built; the fixed path; registration in the disconnect set and with `onExit`; only then
`startCapabilityDelivery`. An exit signalled while connecting starts no delivery. The handoff token is
minted as before and the warning texts are the same fixed strings.
- With the patch applied: `desktop-mcp-http.test.ts`, `desktop-mcp-http-runtime.test.ts` and
  `tovu-server.desktop-mcp.test.ts` are 15 of 15 (11 existing + 4 new). The 4 new tests also pass on the
  desktop code as it is today, so the move changes no behaviour they can see.
- Mutations on the patched file: 5 caught (loopback assertion removed; path taken from the admin URL;
  stopped check removed; exit during connect ignored; both quit checks removed from `environment`).
  2 survived: removing only the first of the two quit checks in `environment` (the second still returns
  `{}`, so it is equivalent), and a warning that quotes its cause. That warning branch runs only when the
  engine's `subscribe` throws, which the desktop adapter's ports cannot make happen, so I did not write a
  fake test for it; the fixed string is visible in the patch.

Remains for item 3:
1. Apply the desktop patch and push it through the desktop hooks.
2. The receiving route's own refusals (origin, non-loopback peer, wrong bearer, no token configured,
   oversized body, second different capability) were not re-checked here; the route is unchanged.
3. Tovu-Runner and Zana were not checked for a second consumer of the removed accessor.

## Item 4 - C: the `mcpIsolation` claim

**Jini `a619ab3b`** - reverts `10605caf` on `fix/sec-mcp-isolation`, and adds
`packages/agent-runtime/src/__tests__/mcp-isolation-claim.unit.test.ts`.
- The Claude definition makes no per-run isolation claim again, so the planner asks for the personal-MCP
  consent whenever that switch is off or unset. The reverted changeset went with it.
- The new test is the matrix the review asked for, on built arguments: capability (on, off, unset) x
  config staged or not x parity with bypass or not x folder limit or none = 24 cells. For every definition
  in the registry that makes a per-run claim, each cell where the plan says "runs and loads no MCP sources
  of its own" must have the isolation flag in the arguments the definition really builds. It also checks
  the stamp format (`<name>@<cli version>@<date>`), pins that the Claude definition makes no claim, and
  records the three cells where the Claude argument builder leaves the flag out.
- Red: on the branch head the matrix failed in exactly those three cells (capability unset and no folder
  limit: nothing staged, or staged with parity and bypass), and the stamp test failed (date only).
- Mutations: 3 of 3 caught (claim re-added as it was; claim re-added with a version-shaped stamp and no
  builder change; builder drops the flag for a locked run with nothing staged).
- `agent-runtime` suite: 4490 pass, 6 fail - baselined, the same 6 fail on the untouched branch
  (`index.test.ts`, `amr.test.ts`, `oauth-tokens.test.ts`). Type-check: 0 errors.

Remains for item 4 (the real fix, C-F1 and C-F2):
1. Resolve the personal-MCP capability once (unset -> off) and make the planner, the argument builder and
   the config stager read that one value.
2. Make the daemon check that the built arguments carry the flag and that the staged config was built
   without inheritance whenever the plan says "does not load its own sources", and fail before spawn
   otherwise.
3. Verify the flag's real behaviour on a named CLI version (plugin-contributed servers, account
   connectors, managed configuration) and put that version in the stamp.
4. The stager half of the matrix (inheritance off) - the test here covers built arguments only.
5. C-F4 (npm version not pinned for the Tovu release-age gate) - not in scope here.

## Things about the environment that affect how to read the numbers

- No base is green. `pnpm -r build` reports failures in 11 or 12 packages on every Jini base used here
  (type errors in test files; `dist` is still emitted). `pnpm guard` reports 153 violations on the
  `audit-x1` and `audit2-a` bases. That is why results above are given as "same failures as the base"
  rather than "green".
- Tovu was linked to the local Jini checkout for each item (`npm run link:jini`); nothing was built or
  published from a linked tree.
- Skipped as instructed: A06, A50, A51.

## Late results

- Item 3, Tovu importer tests (37 test files that import the capability runtime, the handoff module, the
  tool surface or the federation presets/bootstrap), against Jini `515baa14`: 501 of 503. Neither failure
  touches this change: `assistant-byok-routes.test.ts` cannot load because an optional Jini package
  (`provider-plugins`) does not build on that Jini base; `agent-daemon-import-graph.unit.test.ts` reports
  a forbidden import chain through `tool-access-lowering-route.ts` and `site-share-errors.ts`, which this
  branch does not edit. I did not baseline either on the untouched branch.
- Item 3, Tovu type-check: 9 errors, none in the capability runtime or its tests.
- Item 3, Jini `pnpm guard` on `fix/sec-a37`: 153 violations, none in the touched files (same count as the
  other bases).
- Mutation totals across all items: 64 run, 61 caught, 3 survived (two equivalent mutants and the one
  unreachable warning branch, each described under item 3). The phone notification for this run said
  "59 of 62"; 61 of 64 is the correct figure.
- Item 4, Jini `pnpm guard` on `fix/sec-mcp-isolation`: 132 violations. One names a file this branch
  touches, `packages/agent-runtime/src/defs/claude.ts`, but for a different reason (its fallback model
  list is behind the locally cached model list); the revert does not touch that list. Not baselined on
  the untouched branch.
