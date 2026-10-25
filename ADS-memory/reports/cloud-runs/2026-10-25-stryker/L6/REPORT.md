# L6 — Jini money + providers (StrykerJS 9.6, measure-only)

Jini @ `cloud/overnight-1024-jini` (cloned at run start). Node 22.22, 4 cores, concurrency 3, `coverageAnalysis perTest`, StringLiteral excluded, type checks off. No source or test edits. Configs and per-file tables are next to this file.

## 1. Headline
| Package | Runner | Files mutated | Mutants valid (killed+surv+nocov) | Killed (incl. timeout) | Survived | No-cov | Score | Mutation wall |
|---|---|---|---|---|---|---|---|---|
| `commerce` payments+money+http | vitest (kernel config) | 39 (44 instrumented, 4550 mutants) | 3622 | 3493 | 129 | 0 | **96.4 %** | 17 m 54 s |
| `commerce` catalog | **tap-runner works** (node:test via tsx) | 6 with mutants | 283 | 197 | 1 | 85 | **69.6 %** (99.5 % of covered) | 29 s |
| `capability-providers` | vitest | 18 (1343 mutants) | 1049 | 875 | 174 | 0 | **83.4 %** | 2 m 46 s |
| `integrations` | vitest | 76 (7606 mutants) | 6016 | 5449 (7 timeout) | 566 | 1 | **90.6 %** | 16 m 42 s |

Total wall for the lane ≈ 1 h 10 m (15:57–17:05 UTC), dominated by waiting; rough tokens ≈ 0.15M. Well inside both caps. Everything planned was run — nothing was cut for time.

tap-runner finding (asked for in the brief): it DOES work for `commerce/src/catalog` node:test files. Config: `testRunner tap`, `tap.testFiles ["src/catalog/__tests__/unit/*.test.ts"]`, `tap.nodeArgs ["--import","tsx","--test-reporter=tap"]` (do NOT add `--test-isolation=none` — "bad option" without `--test`). Granularity is per test *file* (9 "tests"), so perTest coverage is file-level and kills are coarse.

Things that needed a workaround (all logged, nothing hidden):
- `commerce/src/payments/ledger/migrations/**` excluded from `mutate`: test "every step's pinned checksum matches its source" hashes the source file, so any instrumentation fails the dry run. Those mutants are therefore NOT measured (see §6).
- `commerce/src/payments/testkit/**` excluded (test fixtures, not product code).

## 2. Suspected source bugs
None found. Closest candidates (all need a human look, none is clearly wrong):
- `commerce/src/payments/ops/common.ts:37` `NOT_ASSESSED_RISK.fallback: false → true` survives: no test asserts the `fallback` flag of the "not assessed" risk decision. If `fallback` gates a policy decision this is a real gap, not just a test gap.
- `capability-providers/src/adapters/jwt-auth/index.ts:97`: `actualSignature.length !== expectedSignature.length` → `false` survives. `timingSafeEqual` throws RangeError on unequal lengths, so the guard is what turns a short/long forged signature into `{ok:false}` instead of an exception. Not asserted (a malformed-signature-length test is missing).
- `capability-providers/src/visitor-auth/lifecycle.ts:67` (`isSecureProtocol`, loopback-HTTP exception for OAuth URLs) — 5 mutants survive including `allowLoopbackHttp && … → ||` and `url.protocol === 'http:' → true`. Either the loopback exception is untested or tests cannot tell it apart from "any http host allowed". Highest-priority security gap in this lane.

## 3. Per-file tables (worst first)
Full tables (every file): `commerce-vitest-table.txt`, `commerce-catalog-table.txt`, `capability-providers-table.txt`, `integrations-table.txt`. Columns: valid|killed|surv|nocov|timeout|ignored(StringLiteral)|score.

Worst per package (score < 90 % or ≥ 10 survivors):

**commerce payments/money/http** — everything ≥ 85 %.
`contract/tokens.ts` 66.7 % (3 mutants, 1 surv), `tools/catalog.ts` 85.7 %, `state/status.ts` 89.3 %, `tools/read-tools.ts` 91.7 %, `ops/reconciler.ts` 93.0 % (10 surv), `ledger/repo.memory.ts` 95.5 % (21 surv), `accounting/apply-evidence.ts` 95.2 % (15 surv), `ops/common.ts` 93.7 % (9 surv). `money/money.ts` 98.3 %, `http/payments-webhook.ts` 97.5 %.

**commerce catalog (tap)** — `repo.ts` **0 % (85/85 no coverage)**; `storefront.ts` 97.0 %; `checkout.ts`, `errors.ts`, `repo.rows.ts`, `status.ts` 100 %.

**capability-providers** — `comments/tokens.ts` 0 % (5/5 surv), `visitor-auth/definitions.ts` 59.3 % (11 surv), `visitor-auth/lifecycle.ts` 75.1 % (**75 surv**), `adapters/jwt-auth/index.ts` 77.6 % (24 surv), `adapters/ws/index.ts` 83.3 % (18), `comments/definitions.ts` 83.9 %, `adapters/stripe/index.ts` 87.7 % (18).

**integrations** — `media-providers/ui-defaults.ts` 0 % (41/41 surv), `media-providers/seed.ts` 46.7 % (24), `api-connections/token-store/errors.ts` 56.0 % (11), `dispatch/media-provider-registry.ts` 66.3 % (55), `api-connections/errors.ts` 80.0 %, `webhooks/signing.ts` 80.9 % (17), `dispatch/providers/imagerouter.ts` 81.6 %, `media-providers/providers.ts` 82.2 %, `media-providers/staging.ts` 82.5 % (22), `dispatch/stub.ts` 82.8 %, `dispatch/providers/custom-image.ts` 83.3 %, `dispatch/ssrf-guard.ts` 85.6 % (19), `dispatch/providers/openrouter.ts` 86.0 %, `dispatch/operation-runtime.ts` 86.4 % (28), `saved-requests/execute.ts` 87.1 % (15), `credentialed-http/credentialed-request.ts` 94.9 % (17), `token-store/vault-token-store.ts` 93.2 % (15, 4 timeouts).

## 4. Triaged survivors (a = real test gap, b = equivalent, c = noise/low-value)
Raw survivor lines with locations: `commerce-survivors.txt`, `capability-providers-survivors.txt`, `integrations-survivors-triaged-files.txt` (first 10–12 per triaged file shown there; the rest summarised here).

### commerce — payments (96.4 %)
- `state/status.ts:122` `intent !== "succeeded" || refundedMinor <= 0 → false`: (a) no test where a succeeded intent has `refundedMinor ≤ 0` and must stay "succeeded".
- `state/status.ts:33,38,47,52,53` empty terminal-transition arrays → `["Stryker was here"]`: (a) no test asserting terminal states (`succeeded`/`canceled`/`failed`/`won`/`lost`) accept NO further transitions beyond what is already tested.
- `ops/reconciler.ts:80` (3 mutants, refund-binding condition `candidate.correlationId === row.id || (providerRefundRef … )`): (a) the "bind by providerRefundRef when correlationId absent" path is unproven. `:81` boundElsewhere, `:92` settled status, `:109` reserved refund, `:132/:137` pagination cursor and scope spreads, `:154` ObjectLiteral: (a) cursor/pagination and "settled" branches not pinned.
- `ledger/repo.memory.ts:131` tie-break sort (4 equality/conditional mutants): (a) no test with equal `createdAt`/order keys expecting id order; `:237` provider/account scoping predicate (3): (a) cross-provider-account isolation not asserted for that query; `:272,321,331,386,403,439` `() => undefined` ordering key fns (6): (a) list order by createdAt/recordedAt never asserted; `:381` outbox seq `+1 → −1`: (b)/(a) ordering only, likely equivalent for in-memory single-writer; `:57` null-column check: (a).
- `accounting/apply-evidence.ts:134,161` `plan.write === "update" → true`: (a) both "insert" and "update" write paths must be exercised with the other plan kind; `:221` next-action carry (3): (a) `evidence.next` present with different `status` not tested; `:225` failed-refund ordering (2): (a); `:253/:413` outbox payload `{} ` objects: (a) outbox payload amount/currency not asserted; `:341` empty-result literal: (a)/(c).
- `ops/common.ts:63` blank-field check, `:112-113` outcome optional chaining (3), `:197` unique-violation rethrow (3), `:37` NOT_ASSESSED fallback (see §2): (a) – a non-unique `LedgerConstraintError` must rethrow, and non-"unique" kinds are untested.
- Remaining survivors (~60 across 25 small files): ArrayDeclaration/ObjectLiteral in tool schemas (`tools/catalog.ts` `required` lists never asserted), mostly (a)-cheap contract assertions.

### commerce — catalog (tap)
- `storefront.ts:93` `<` → `<=` (cheapest price tie-break): (a) no test with two equal-priced candidates (tie → first one wins).
- `repo.ts` 85 mutants no coverage — see §5.

### capability-providers
- `visitor-auth/lifecycle.ts` (75 survivors: ConditionalExpression 21, BooleanLiteral 16, Regex 12, EqualityOperator 9, ArithmeticOperator 5, BlockStatement 5, LogicalOperator 3, ObjectLiteral 3, ArrayDeclaration 1):
  - `:67` loopback-http (5 mutants) (a), see §2.
  - `:162` reserved authorization parameter check `→ true` (a): no test that a reserved param key is rejected vs allowed.
  - `:313,342` `safeProviderError` block/`providerError` spread (a); Regex mutants (12) on `SAFE_PROVIDER_ERROR` anchors/quantifier/char-class (a): no test for provider errors of length 65 or containing `/`.
  - `:392` ID-token clock skew bounds `skew < 0 → <= 0`, `skew > 300 → >= 300` (a): boundary values 0 and 300 never tested.
  - `:407` multi-audience requires `azp === clientId` → `true` (a): no multi-audience token with wrong `azp`.
  - `:420` expiry `now − skew` → `now + skew` (a): skew direction never asserted.
- `adapters/jwt-auth/index.ts`: `:27` base64url padding-strip regex (2) and `:32` pad-length (5) — (a) only inputs with 0 padding tested; `:52` `stored.slice → stored` (a) hex salt parse; `:72,88` header/ok:false literals (c); `:97` length guard (see §2).
- `adapters/ws/index.ts`: `:56,63` swallow-block mutants (a): malformed/non-JSON message handling not asserted; `:66,68` message-shape guards (4) (a) — non-object / wrong `type` / non-string `channel` each need a rejected-message test; `:108,125,134,148` empty-set cleanup branches (6) (a)/(b).
- `adapters/stripe/index.ts`: `:38/:39` optional stripeType/stripeCode (a); `:67` status-mapping `||` chain (a) – only some of succeeded/pending/failed tested; `:102` apiBase trailing-slash regex `/+$` → `/$` (a): double-slash base URL; `:150` refund-failed error ctor (a); `:176,183` JSON-shape guards (5) (a).
- `visitor-auth/definitions.ts` (11): `required: true → false` for provider credential fields (Google/Facebook/LinkedIn client id/secret) and `defaultScopes → []` (a): no test asserting each provider definition's required fields and default scopes.
- `comments/tokens.ts` (5/5) and `src` token declarations `ObjectLiteral → {}`: (b)/(c) token options object replaced by `{}` – likely equivalent unless token `id` is used; DI token ids are not asserted.

### integrations
- `webhooks/signing.ts` (17): `:41` tolerance validity guard (a); `:52` hex-signature regex anchors (2) (a) – signature candidates with trailing/leading non-hex untested; `:64-69` header part parsing (`trim`/`slice` MethodExpression, `eq === -1` skip) (a); `:84` non-finite timestamp → return false flipped (a). Webhook signature verification is a security boundary.
- `dispatch/ssrf-guard.ts` (19): `:60` IPv6 bracket stripping (5) (a) – bracketed IPv6 hosts untested; `:61` dotted-quad IPv4 regex anchors/quantifiers (4+) (a) – 4-octet numeric host forms only partially tested; `:55` `.map({address,family})` ObjectLiteral (a). SSRF guard is a security boundary.
- `credentialed-http/credentialed-request.ts` (17): `:50` unsupported-method guard (a); `:60` blank path (a); `:69` protocol allowlist → `true` (a); `:72` `username || password → &&` (a): a URL with only username/only password must be refused; `:356` `status >= 200 && < 300` boundary (`<= 300`) (a): 300 not tested; `:396` path validation regex (3) (a): scheme-relative `//host` / `\\host` paths untested.
- `api-connections/token-store/vault-token-store.ts` (15, +4 timeouts): `:76,81` load-observation window pruning (9) (a): window boundary not tested; `:133` stale-generation compare `→ true` (a). Timeouts: mutants in retry/poll loops — treated as killed, but indicate slow-path tests.
- `api-connections/token-store/errors.ts` (11): `TEXT[code].message` ObjectLiteral entries (c) – message text; `:42` `isRetryable`-style predicate `&&` flip (a).
- `media-providers/dispatch/media-provider-registry.ts` (55; first reads): sort tie-break `:105` (a), `:145` audio kind default (a), registry-id helpers `:47-61` BlockStatement/ObjectLiteral (a): large block of registry helpers have no direct assertion; (c) for several return-object literals.
- `media-providers/ui-defaults.ts` (41/41) and `seed.ts` (24): static catalog data (models, aspect ratios, durations, `generateAudio`, `seed` flags) — (c)/(b): data tables; a snapshot/contract test would kill all but they carry no logic.
- `dispatch/operation-runtime.ts` (28 + 1 no-cov at `:155`): retry/backoff `attempt === retryDelaysMs.length` (a), `catch {}` swallow (a), `suggestedExt` propagation (a), `allowPrivateNetwork`/`outboundMessages` forwarding `=== undefined` (a): options pass-through not asserted. `:155` BooleanLiteral no coverage — the final `return false` after retry exhaustion never runs.
- `saved-requests/execute.ts` (15): `:24` `responseReceived` flag (a); `:44` `&&→||` error classification (a); `:75,82` `additionalHosts: []`/`devHostAllowlist: []` → non-empty (a) – the hard-coded locked-down policy for saved-request execution (denyPrivateAddresses, maxRedirects 0, allowedSchemes https) is not pinned by a test that would fail if loosened; `:86` signal pass-through (a); `:94` 2xx check (a).
- Remaining ~330 survivors in ~55 files: dominated by ConditionalExpression/ObjectLiteral/ArrayDeclaration option pass-through and provider adapter request-shape details (`providers/*.ts`), mostly (a) cheap.

## 5. No-coverage ranges
- `commerce/src/catalog/repo.ts` — 85 mutants, all lines (SQL repo classes `SqlCommerceProductRepo`, `…ImageRepo`, `…PriceRepo`, `…OrderRepo`, `…WebhookEventRepo`). No test executes them under the node:test suite; the vitest suites in this package don't import them either (no test file references `src/catalog/repo.ts` except via `repo.rows`). Largest untested money-adjacent surface in the lane. Note: the tap suite only covers `repo.rows.ts`.
- `integrations/src/media-providers/dispatch/operation-runtime.ts:155` — final `return false` after retry exhaustion.
- Everything else: 0 no-coverage (commerce payments, capability-providers).

## 6. NOT RUN
- `commerce/src/payments/ledger/migrations/0001_payments_ledger.ts` (200 lines, ~hundreds of mutants): checksum-pin test makes the instrumented source fail the dry run. Not measured. A run would need that test excluded.
- `commerce/src/payments/testkit/**` (fixtures), `src/react/**` and any `.tsx` (UI), `index.ts`/barrel and pure-type files (no mutants anyway), `integrations/src/**/types.ts` (type-only).
- `commerce`'s third script segment (jsdom `src/react/**` vitest) — UI, out of scope.
- tap runner against `src/payments/**` was unnecessary (those suites are vitest).

## 7. What these numbers do NOT catch
- StringLiteral mutants excluded: ignored counts — commerce 928 + 120, capability-providers 294, integrations 1590. Error/message text and string-keyed identifiers (event names, header names, SQL strings, status strings) are not scored; for SQL-heavy `ledger/repo.sql.ts` and `rows.ts` this hides a lot (189/100 ignored there).
- Type checks off: type-invalid mutants count as killed/survived normally; no checker-based filtering.
- Indirect kills: "killed" means some test in the whole kernel suite failed, not necessarily the file's own tests (perTest narrowing, but cross-file kills are credited). The tap runner is file-granular.
- Tap catalog score of 69.6 % is dominated by the untested `repo.ts`; covered code is 99.5 %.
- Live DB behaviour: postgres/sqlite ledger tests were included only as the existing suites ran them; no mutation of real I/O adapters beyond what unit tests exercise.
- No `.tsx`/React/UI; no e2e; equivalent mutants are not auto-detected, my (b) calls were by reading, not proven.
- Timeouts (7 in integrations) counted as killed.

## 8. Top 10 tests to write first (risk-ranked)
1. `capability-providers/visitor-auth/lifecycle.ts` `isSecureProtocol`: https accepted; `http://localhost`/`127.0.0.1`/`[::1]` accepted only with `allowLoopbackHttp: true`; `http://evil.example` rejected both ways; `ftp:` rejected.
2. `integrations/webhooks/signing.ts`: tampered signature with non-hex chars / extra prefix/suffix rejected; malformed header (`k` without `=`, whitespace); timestamp NaN rejected; tolerance NaN/negative rejected.
3. `integrations/dispatch/ssrf-guard.ts`: bracketed IPv6 loopback/ULA/link-local hosts denied; dotted-quad edge forms (`1.2.3`, `1.2.3.4.5`, `999.1.1.1`); DNS result mapping returns exactly `{address,family}`.
4. `integrations/saved-requests/execute.ts`: pin the hard-coded policy (denyPrivateAddresses, maxRedirects 0, allowedSchemes https, no additional/dev hosts, 10 s / 64 KiB bounds); a request leaking credentials to another host must fail; responseReceived classification.
5. `integrations/credentialed-http/credentialed-request.ts`: URL with username-only or password-only rejected; non-http(s) protocol rejected; `//host` and `\\host` paths rejected; status 300 is not ok.
6. `capability-providers/visitor-auth/lifecycle.ts` ID-token validation: skew=0 and skew=300 accepted, 301/-1 rejected; expired exactly at `now-skew`; multi-audience token with `azp !== clientId` rejected; provider error string of length 65 / with `/` dropped; reserved authorization parameters rejected.
7. `capability-providers/adapters/jwt-auth`: forged signature of wrong length returns `{ok:false}` (no throw); base64url inputs needing 1/2/3 pad chars; password-hash salt parse.
8. `commerce/catalog/repo.ts`: any test at all (sqlite in-memory) for the five SQL repos — currently 0 % covered; plus `storefront.ts` equal-price tie-break.
9. `commerce/payments/state/status.ts` + `ops/reconciler.ts`: succeeded intent with `refundedMinor ≤ 0` stays succeeded; terminal states reject all transitions; refund bound by `providerRefundRef` when `correlationId` absent; reconciler pagination cursor/scope; settled vs reserved refund handling.
10. `commerce/payments/ops/common.ts` + `accounting/apply-evidence.ts`: non-unique `LedgerConstraintError` rethrows; `NOT_ASSESSED_RISK.fallback` asserted; apply-evidence insert vs update paths; outbox payload amount/currency asserted; in-memory ledger tie-break ordering and provider-account scoping.

L6 DONE 2026-10-25T17:10Z — wall ≈ 1 h 13 m, ≈ 0.15M tokens (rough)
