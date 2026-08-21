# Sol (gpt-5.6-sol, xhigh) — independent audit of the 2026-08-20/21 overnight session

Dispatched by the Coordinator. Range audited: `3fec3ab8..ea0eb5e4` (pinned; HEAD kept moving).
Read-only, no files changed. 248 shell commands, 10 web searches, ~16 min wall time.

Verbatim final report follows.

---

Sol(Audit): Audited `3fec3ab8..ea0eb5e48cbd5aa351f2ac0c1e6f2e502f64f4a4`, pinned because `HEAD` continued moving. No files changed.

## CONFIRMED

1. **High — [coverage root-cause report:21](</Users/la/Programming/Tovu/ADS-memory/reports/2026-08-21-coverage-dual-instantiation-root-cause.md:21>) — the report incorrectly ruled out the strongest root-cause path.**

The statement at lines 28–30 that no test constructs SQLite deps and then exports is false. The full coverage glob includes this exact sequence:

`export-command.integration.test.ts:35` spawns a coverage-inheriting CLI child  
→ [export.ts:104](</Users/la/Programming/Tovu/src/cli/commands/export.ts:104>) constructs `createSqliteRouteDeps`  
→ [export.ts:112](</Users/la/Programming/Tovu/src/cli/commands/export.ts:112>) calls `exportSite`  
→ [site-exporter.ts:738](</Users/la/Programming/Tovu/src/export/site-exporter.ts:738>) invokes `routeDeps.createSiteApp()`  
→ [deps.ts:926](</Users/la/Programming/Tovu/src/server/deps.ts:926>) invokes `createSiteAppLazily`  
→ [deps.ts:1048](</Users/la/Programming/Tovu/src/server/deps.ts:1048>) performs `require("./app.js")`.

`app.ts` then imports `deps.ts` again through the CJS graph; `deps.ts` imports the media adapter, which imports `provider-credential-store.ts`. This is the exact ESM-plus-tsx-CJS dual-instantiation shape associated with the helper markers.

The repository itself documents that test-runner children inherit `NODE_V8_COVERAGE` at [init-site-fault-injection.integration.test.ts:64](</Users/la/Programming/Tovu/src/site-dir/__tests__/integration/init-site-fault-injection.integration.test.ts:64>). Unlike that test, the CLI helper supplies no redirected `env`.

Concrete scenario: combine `src/media/**/*.test.ts` with `src/cli/__tests__/integration/export-command.integration.test.ts`. The export child should introduce the CJS shadow and reproduce the provider-store marker/LH drop. This is the first bisect I would run.

2. **High — [ingest.ts:189](</Users/la/Programming/Tovu/src/analytics/ingest.ts:189>) — IPv4-mapped addresses now all collapse into one visitor bucket.**

`::ffff:192.168.1.1` expands to six zero groups followed by `ffff` and the dotted tail. Truncating the first three groups therefore returns `0:0:0::`. Every IPv4-mapped address gets the same result.

This is realistically reachable: both production entrypoints omit the listen host at [index.ts:291](</Users/la/Programming/Tovu/src/index.ts:291>) and [serve.ts:92](</Users/la/Programming/Tovu/src/cli/commands/serve.ts:92>). Node documents that omitted-host servers normally bind IPv6 and may accept IPv4 through the same dual-stack socket. [Node net documentation](https://nodejs.org/download/release/latest/docs/api/net.html)

Concrete scenario: on a dual-stack host reporting IPv4 peers as `::ffff:a.b.c.d`, visitors `::ffff:192.168.1.1` and `::ffff:203.0.113.77` receive the same daily visitor hash. The old code distinguished them but leaked the entire embedded IPv4 address into the pre-hash bucket; neither behavior meets the intended IPv4 `/24` contract.

Other forms behave as follows:

| Input | Result/behavior |
|---|---|
| `::` | Correctly becomes `0:0:0::` |
| `::1` | Correctly becomes `0:0:0::` |
| `2001:db8:1::` | Correct `/48`: `2001:db8:1::` |
| `2001:db8::1` | Correct `/48`: `2001:db8:0::` |
| No `::` | Unchanged from the old implementation |
| `fe80::1%eth0` | Zone lies beyond `/48` and disappears; no validation |
| `[::1]` | Garbage bucket `[:0:0::` |
| More than 8 groups | Accepted silently; only the first three matter |
| `2001::db8::1` | Second shorthand tail is discarded; returns `2001:0:0::` |
| Case/leading-zero variants | Not canonicalized and may hash differently |

The fix changes compressed addresses only when expansion affects the first three groups; those old buckets were incorrect. It also creates the mapped-address discontinuity above.

The IP is currently not sourced from arbitrary `X-Forwarded-For`: [analytics-ingest.ts:74](</Users/la/Programming/Tovu/src/server/routes/site/analytics-ingest.ts:74>) uses `req.ip`/socket address, and the repository confirms there is no Express `trust proxy` configuration at [rate-limit.ts:308](</Users/la/Programming/Tovu/src/core/rate-limit/rate-limit.ts:308>). Thus malformed header input is not attacker-reachable today. If trusted-proxy handling is later enabled, the parser will accept malformed attacker input without throwing and silently create collisions.

3. **Medium — [ingest.test.ts:140](</Users/la/Programming/Tovu/src/analytics/__tests__/ingest.test.ts:140>) — the iPad regression test overclaims what the fix can detect.**

The reorder is correct for token-bearing iPhone/iPad UAs. However, the comments say “every genuine mobile Safari UA” carries the mobile token and describe the test as covering real iPad traffic generally. Since iPadOS 13, desktop-mode iPad Safari presents as a Mac specifically to prevent iPad identification. Apple explicitly describes that limitation. [Apple WWDC19](https://developer.apple.com/videos/play/wwdc2019/203/?time=206)

Concrete scenario: an iPad sending the standard desktop `Macintosh; Intel Mac OS X...` UA is classified `desktop`/`macos`, identically to a Mac. No reordering can fix that. The suite should document and assert that limitation rather than imply full “is this an iPad?” coverage.

Edge verdicts:

- iPod touch: normally correct because its UA includes `CPU iPhone OS`.
- Chrome/Firefox on iPhone: OS classification is correct because `iPhone`, `CriOS`, or `FxiOS` matches `/ios/i`.
- macOS Safari: remains correctly `macos`.
- Windows plus Mac tokens: `windows` wins.
- Nonstandard Android plus `Macintosh`/`Mac OS`: incorrectly `macos`; bare `"mac"` does not match.
- Vision Pro: there is no `visionos` classification. A Mac-like UA becomes `macos`; otherwise `other`. UA-only device identification is inherently unreliable here.

Also, lines 125–129 retain a stale comment describing the old macOS-first ordering.

4. **Medium — [ingest.ts:143](</Users/la/Programming/Tovu/src/analytics/ingest.ts:143>) — Chrome and Firefox on iOS are reported as Safari.**

The OS result is correct, but browser classification checks only `chrome/` and `firefox/`. Real iOS product tokens are `CriOS/` and `FxiOS/`, while their UAs also carry `Safari/`; the Safari branch therefore wins. Chromium and Mozilla document those exact forms. [Chromium’s iOS UA documentation](https://blog.chromium.org/2020/09/changing-chrome-on-ios-user-agent-for.html), [Mozilla’s Firefox UA reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/User-Agent/Firefox)

Concrete scenario: an iPhone Chrome UA containing `CriOS/… Mobile/… Safari/…` is recorded as browser family `safari`.

5. **Medium — [combined coverage report:28](</Users/la/Programming/Tovu/ADS-memory/reports/2026-08-21-repo-wide-combined-coverage-map.md:28>) — the monotonicity argument is compelling here, but not logically airtight by itself.**

A larger test selection can legitimately execute fewer lines if shared external state changes behavior, a worker crashes, tests skip, or resource contention triggers a timeout. Cross-file module caching is not a plausible explanation because Node test files run in isolated workers.

If the same scoped tests complete successfully in both runs and the collector correctly unions process coverage, hits should be monotonic. The unchanged denominator, 63-line loss, inflated functions, and new CJS helpers make this specific evidence very strong; collector failure is far more plausible than legitimate execution differences.

The marker heuristic also has limits:

- False positive for “dual-instantiated”: a file loaded only once through a CJS transform can contain helpers.
- `__toESM`/`__copyProps` may arise from ordinary interop; `__toCommonJS` is more diagnostic.
- False negative: duplicate ESM identities, symlink/query-path duplication, or a CJS transform without these named helpers.
- Therefore `681 marker-positive/suspect` is supported; `681 proven dual-instantiated and line-corrupt` is not.

6. **Medium — [ci-local.sh:25](</Users/la/Programming/Tovu/development/scripts/ci-local.sh:25>) — the drift gate is absent from GitHub CI.**

The local gate is blocking and exact, but the file explicitly says `.github/workflows/ci.yml` was not updated.

Concrete scenario: after Actions is restored, a PR edits `seed.ts` without regenerating JSON; remote CI passes unless someone also runs `ci-local.sh`.

7. **Low — [generate-seed-content.ts:60](</Users/la/Programming/Tovu/development/scripts/generate-seed-content.ts:60>) — `--check` has one narrow semantic false-pass class.**

`JSON.stringify` omits object properties whose value is `undefined`. `PostRecord` has optional properties such as `ext`, and `exactOptionalPropertyTypes` is not enabled.

Concrete scenario: changing a seeded post from an absent `ext` property to `ext: undefined` leaves the generated bytes unchanged, so `--check` passes even though the live seed object and parsed JSON differ structurally. The existing deep-equality template test should catch this if the full tests run.

For current data, generation is otherwise deterministic: stable object insertion order, spec-defined number formatting, no time/random/environment input, Unicode preserved without normalization, and an explicit trailing newline. The exact string comparison catches all representable textual drift. No tracked writer other than this generator modifies the JSON.

8. **Low — test quality findings.**

- [ingest.test.ts:285](</Users/la/Programming/Tovu/src/analytics/__tests__/ingest.test.ts:285>): the same-input determinism test still passes with the original IPv6 bug and adds no invariant beyond the new equivalence test. This one is coverage-only; lines 295–334 are load-bearing.
- [phase-handler.repo-identity-binding.security.test.ts:68](</Users/la/Programming/Tovu/src/redirects/__tests__/phase-handler.repo-identity-binding.security.test.ts:68>): accurately pins construction-time object identity, but that is an implementation detail rather than a security invariant. A safe refactor to a live getter would fail this test despite unchanged external security behavior.
- [generate-seed-content.ts:91](</Users/la/Programming/Tovu/development/scripts/generate-seed-content.ts:91>): claims `generate()` is imported by “this script’s own unit test”; no such test exists.

## SUSPECTED

1. **High — the CLI export child is the actual cause of the 89% coverage contamination.**

The path and coverage inheritance are confirmed; causal attribution needs the focused run. It explains all distinctive facts: CJS helpers, broad app-graph reach, clean `src/cli`, and why export tests using memory deps failed to reproduce it.

Minimal discriminator: run the media tests plus only `export-command.integration.test.ts`. If markers appear, then redirecting `NODE_V8_COVERAGE` for that CLI child—or excluding descendant profiles—is the root-cause fix.

## Checks that passed

- `classifyOsFamily`’s reorder is correct for standard token-bearing Apple mobile UAs and does not invert macOS Safari.
- The seed output is deterministic for the current JSON-safe seed values, and `seed.ts` is the genuine runtime source of truth.
- [site-exporter.test.ts:236](</Users/la/Programming/Tovu/src/export/__tests__/site-exporter.test.ts:236>) uses a legitimate HTTP fixture seam around the real app, not a second renderer; its byte, discovery, failure, and dedup assertions are load-bearing.
- [redirects-site-serving.test.ts:85](</Users/la/Programming/Tovu/src/server/__tests__/routes/redirects-site-serving.test.ts:85>) genuinely pins fail-closed HTTP behavior: real request, 404, and no `Location`.
- [test-agent-mock-module.test.ts:45](</Users/la/Programming/Tovu/src/server/routes/admin/assistant/__tests__/test-agent-mock-module.test.ts:45>) meaningfully proves the route invokes mocked discovery and validates the response.
- The four admin-test non-null assertions are sound at those concrete call sites. The concrete objects visibly implement the optional methods, and omission would fail loudly at runtime. Better concrete typing could avoid `!`, but this is not masking a production bug.
