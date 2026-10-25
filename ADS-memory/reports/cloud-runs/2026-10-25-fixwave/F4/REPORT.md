# F4 — Jini cms (Stryker L4) + commerce / capability-providers / integrations (Stryker L6)

Jini branch **`cloud/fixwave-1025-F4`** (from `origin/cloud/overnight-1024-jini` @ 3e2fbae8). All code pushes succeeded (no 403). Tests-only except ONE minimal source fix.

## 1. Headline
- **SOURCE BUG (fixed):** `integrations/src/webhooks/signing.ts` `verifySignature` accepted a non-canonical signature — a valid hex digest **plus one trailing hex char** (`"<digest>a"`) verified, because `Buffer.from(hex)` silently drops an odd trailing nibble. Failing test `f5565f8c` → fix `55b2630c` (candidate hex length must equal the digest's). Not a forgery (needs a valid digest), but signature malleability — matters to any replay/dedupe keyed on the signature string. Grep found no other copy of the pattern in Jini.
- **Tests added:** ~154 new test declarations (many `it.each` tables → several hundred executed cases) in 29 files; 0 tests removed/skipped/weakened. Executed counts after: see §3.
- **Lane musts:** all done — jwt length guard (short/long forged sig → `null`, never RangeError; guard-removal verified to fail 5 tests), `isSecureProtocol` loopback both ways (3 guard mutants verified killed), `NOT_ASSESSED_RISK.fallback` asserted (+ REPLAY_RISK), catalog `repo.ts` 0 % → 100 % lines (in-memory SQLite, all 5 repos), cms `*/agent-tools.ts` + `widgets/registry.ts` inline contract pins.
- **Coverage (touched non-UI files):** every touched file at 100 % lines; 100 % branches except 4 documented branches (§3). Package totals after: capability-providers 100/100, cms 100 L / 99.93 B (was 99.98/99.84), commerce payments+money 100/100 (vitest), integrations touched files 100/100.
- **CCN > 10 (source, eslint `complexity` 10):** 0 → 0 in all four packages (only test helpers exceed; not refactored).
- **Stryker (StrykerJS 9.6.1, same lane config: vitest runner, perTest, StringLiteral excluded, type checks off, `--force`, mutate = touched files):** see §3 table. Biggest moves: catalog `repo.ts` 0 → 100, `comments/tokens.ts` 0 → 100, `visitor-auth/lifecycle.ts` 75.1 → 99.7, `ops/common.ts` 93.7 → 100, cms agent-tools/registry (see §3).
- **Methodology finding:** Stryker records a mutant as *Survived* when it is killed only by a **test-collection crash** (fixtures built at `describe` level). `lifecycle.ts`'s 75 L6 "survivors" were largely this; moving fixtures into `beforeAll` (same 128 tests) took it 82.4 → 97.7 with no new assertions. Same artefact applies to module-level constants (`visitor-auth/definitions.ts` 3 "survivors" are load-crash kills).
- Wall 1 h 20 m (21:34–22:54 UTC); rough tokens ≈ 0.5M. Well inside both caps.

## 2. Source bugs
| # | file | failing test | fix | note |
|---|---|---|---|---|
| 1 | `packages/integrations/src/webhooks/signing.ts:54` | `f5565f8c` `signing.edges.test.ts` "one trailing hex char (odd length) is refused" | `55b2630c` | hex length check before decode |

Not bugs (checked, by design): trailing whitespace on a signature value is trimmed (header tolerance); uncategorised inline first-party scripts run ungated in consent (necessary by design); Stripe error class defines `stripeType` as an own `undefined` property (class-field semantics).
Noted, not fixed (low value): `jwt-auth` base64url decoding is lenient (non-canonical base64 of a valid signature verifies — standard JWT malleability; revocation is by `jti`, so no bypass).

## 3. Per-file table (before → after)
| pkg | file | Stryker before (L4/L6) | after | coverage L/B after | note |
|---|---|---|---|---|---|
| capability-providers | `adapters/jwt-auth/index.ts` | 77.6 | 86.9 | 100/100 | 14 left, all equivalent (Buffer base64 tolerance, `{ok:false}`→`{}`) |
| capability-providers | `visitor-auth/lifecycle.ts` | 75.1 | 99.7 | 100/100 | 1 equivalent (issuer check subsumed) |
| capability-providers | `visitor-auth/definitions.ts` | 59.3 | 88.9 | 100/100 | 3 = module-load crash kills recorded as survived |
| capability-providers | `comments/tokens.ts` | 0.0 | 100.0 | 100/100 |  |
| capability-providers | `adapters/stripe/index.ts` | 87.7 | 91.8* | 100/100 | *before the last stripe follow-up commit |
| capability-providers | `adapters/ws/index.ts` | 83.3 | 85.2* | 100/100 | *before ws follow-ups; rest equivalent |
| commerce | `payments/ops/common.ts` | 93.7 | 100.0 | 100/100 |  |
| commerce | `payments/state/status.ts` | 89.3 | 91.1 | 100/100 | 5 equivalent (impossible status string) |
| commerce | `catalog/repo.ts` | 0.0 (85 nocov) | 100.0 | 100 L / 98.78 B | see §3 note |
| commerce | `catalog/storefront.ts` | 97.0 | n/a (node:test) | 100/100 (node) | tie-break mutant verified killed manually |
| integrations | `webhooks/signing.ts` | 80.9 | 87.0 | 100/100 | source fixed; anchors now subsumed by length check |
| integrations | `media-providers/dispatch/ssrf-guard.ts` | 85.6 | 89.4 | 100/100 | bracket-strip equivalent |
| integrations | `saved-requests/execute.ts` | 87.1 | 91.4 | 100/100 |  |
| integrations | `saved-requests/schema.ts` | 91.3 | 94.4 | 96.87 B → 100/100 |  |
| integrations | `credentialed-http/credentialed-request.ts` | 94.9 | 96.1 | 99.66/99.4 → 100/100 |  |
| cms | `entries/agent-tools.ts` | 28.2 | 97.4 | 100/100 | 1 prose-only |
| cms | `media/agent-tools.ts` | 33.3 | 98.0 | 100/100 | 1 prose-only |
| cms | `widgets/registry.ts` | 43.1 | 100.0 | 100/100 |  |
| cms | `navigation/agent-tools.ts` | 60.5 | 100.0 | 100/100 |  |
| cms | `taxonomy/agent-tools.ts` | 71.4 | 100.0 | 100/100 |  |
| cms | `content-types/agent-tools.ts` | 82.1 | 100.0 | 100/100 |  |
| cms | `workspace/agent-tools.ts` | 90.0 | 100.0 | 100/100 |  |
| cms | `media/sanitize-svg.ts` | 76.3 | 88.1 | 100/100 | rest mostly DOMPurify-equivalent |
| cms | `media/content-type-sniffer.ts` | 86.7 | 96.8 | 100/100 |  |
| cms | `consent/html/gate.ts` | 87.2 | 88.9 | 100 L / 99.15 B | §3 |
| cms | `consent/express/index.ts` | 89.9 | 89.9 | 100 L / 99.15 B | only receipt-id + gpc paths targeted |
| cms | `consent/css.ts` | 87.2 | 88.8 | 98.58 B → 100/100 |  |
| cms | `navigation/tool-registrations.ts` | 88.3 | 91.4 | 98.57 L → 100/100 |  |
| cms | `redirects/path-key.ts` | 91.3 | 91.3 | 85.71 B → 100/100 |  |
| cms | `widgets/html/plugin-export.ts` | 85.2 | 88.8 | 91.54 B → 100 L / 97.26 B | §3 |

Executed tests after (counted, not assumed): capability-providers 361 passed; integrations 2047 passed; commerce node:test 47 + jsdom 4 + kernel 735 passed (1 pre-existing skip); cms 4346 passed + 1 failed = the known pre-existing `subpath-isolation.contract.test.ts` (COMMON.md known-failing list), unrelated to this lane. Stryker scores use StringLiteral-excluded, type-check-off configs — message text and type-invalid mutants are not scored.

Files still < 100 % coverage, with reason:
- `cms/consent/express/index.ts:147` `options.cookieName ?? DEFAULT` — the only caller always passes `cookieName`; the default arm is unreachable (would need a signature refactor the brief does not allow).
- `cms/consent/html/gate.ts:148` content-entry arm for a fetching script without `src` — no inline script both "fetches" and lacks `src` under `scriptFetches`; unreachable via public API.
- `cms/widgets/html/plugin-export.ts:79,95` — `url && props` is pre-empted by `HOST_URL_SLOT` (whole-host-slot check); parse5 always provides attribute source locations.
- `commerce/catalog/repo.ts:271` `numInsertedOrUpdatedRows ?? 0` — Kysely leaves it `undefined` only on dialects this package does not drive.

## 4. Anti-patterns seen most (feed AI Dev Shop)
1. **Collection-time fixtures** (NEW, not in TEST-ANTIPATTERNS.md): `const tx = plan()` at `describe` level — a regression crashes collection; Stryker/perTest counts it *survived* and vitest reports a file error, not N failing tests. Rule: build fixtures in `beforeAll`/per test; tables use literals.
2. **AP5 unasserted declarative contracts** — cms tool catalogs, widget registry, visitor-auth definitions, DI tokens: fixed with inline `toEqual` pins (descriptions stripped only when string-valued).
3. **AP4 happy-string regex / AP9 limit±1** — PKCE/state/nonce anchors, receipt-id `{16,128}`, sniffer windows, ftyp box end, 2xx/300 boundaries.
4. **AP3 type-blind validators** — ws inbound messages, stripe JSON shapes, credentialed-request non-string label/url.
5. **AP7/AP8 guard negatives per clause** — consent runtime exemption (one conjunct per case), loopback exception, SVG sanitizer clauses with safe twins.
6. **Defence-in-depth looks like survivors**: `sanitize-svg` on*/xml:base/trim and `<image>`-only data URIs are also enforced by DOMPurify → equivalent mutants; don't chase.

## 5. NOT done
- `commerce/payments/ops/reconciler.ts` (10 surv), `ledger/repo.memory.ts` (21), `accounting/apply-evidence.ts` (15): need deep ledger scenarios; not started.
- integrations `vault-token-store.ts`, `operation-runtime.ts`, `media-provider-registry.ts`, `media-providers/ui-defaults.ts`/`seed.ts` (data tables): not started.
- cms forms `write-service`/`deliver-job`/`notify-subscriber`, `seo/feed`, `widgets/resolver-service`, `consent/html/resources.ts` (52 surv): not started (no-coverage ranges were already covered on this base except those closed above).
- `catalog/storefront.ts` re-score: node:test-only, invisible to the vitest Stryker runner; tie-break mutant `<`→`<=` verified killed manually (1 failing test).
- Remaining survivors in touched files classified (equivalent unless noted): jwt base64 padding/regex (Buffer tolerant), `{ok:false}`→`{}` (only `.ok` read); stripe optional-field guards; ws catch/else blocks and size>0; ssrf IPv6 bracket strip (`includes(':')` already true), trailing-slash regex; execute `[]` policy arrays (non-origin strings) and signal pass-through; status.ts terminal `[]` (impossible status string); signing anchors after the length fix.

## 6. Commits (Jini `cloud/fixwave-1025-F4`)
```
6b665ec7 test(integrations): survivor follow-ups — unknown-key digest, NaN-timestamp signature, multi-digit IP literals, non-string asset URL/label/url, probe 199/300, schema min==max
354117fd test(cms): invalid host pageOrigin fails closed in the consent gate
7d892db3 test(capability-providers): stripe null/odd error bodies, ws wrong-case type, duplicate subscribers, stale unsubscribe
2f145ba0 test(capability-providers): jwt claim-shape/header/iat/exp/id pins; visitor-auth artifact regex anchors, TTL max, no stray identity keys
44b71ea5 test(capability-providers): build visitor-auth fixtures in beforeAll, not at collection
4035d732 test(cms): close remaining coverage gaps — consent shadow bounds, untrusted/necessary-script edges, empty redirect key, menu-update hook collision guard, plugin-export refusals
c6d440cb test(integrations): cover corrupt stored baseUrl in verification and integer enums in saved-request schemas (both files → 100% branches)
3d04bf20 test(commerce): storefront equal-price tie keeps the first candidate
5d21b716 test(commerce): exhaustive intent/refund/dispute transition matrices, derived status and refund totals boundaries
f89a523d test(capability-providers): inline contracts for built-in visitor-auth providers and comments DI tokens
86a76087 test(capability-providers): ws adapter inbound-message guards (every malformed shape), OPEN-only send, close/unsubscribe bookkeeping
410d8363 test(capability-providers): stripe status mapping table, error-envelope type guards, refund failure codes, apiBase/id encoding
4fb362c1 test(cms): consent receipt-id bounds (15/16/128/129, junk chars) never reach storage and deny
c49d8a8b test(cms): consent runtime-script exemption — one test per conjunct (tag, token, exact text)
d48e6da3 test(cms): content-type sniffer exact-length/one-short, ftyp box-end, brand-scan bound, MPEG header bits, 512-byte text window
3f934148 test(cms): sanitize-svg one payload per unsafe CSS/reference clause, with safe twins and exact refusal messages
07795887 test(integrations): credentialed-request refuses username-only/password-only/non-http/relative URLs and unsupported methods with exact messages
4c4a61ab test(integrations): saved-request 2xx/media-type boundaries, forbidden-origin + token CR/LF refusals
2bccb4fc test(integrations): ssrf-guard edges — literal-lookalike DNS names, multi-address answers, credential/protocol refusals
55b2630c fix(integrations): verifySignature refuses non-canonical hex (digest + trailing nibble)
f5565f8c test(integrations): webhook signature edges — FAILING: a valid signature + 1 trailing hex char verifies
571d1a4f test(cms): inline contract pins for every agent-tool catalog + widget registry (inputSchema/required/additionalProperties/authorization)
f09a40e2 test(commerce): catalog SQL repos on in-memory SQLite (repo.ts 0% → 100% lines)
fcad10a5 test(commerce): pin NOT_ASSESSED/REPLAY risk (fallback:false), onUniqueRace rethrow kinds, dispatch unreadable outcomes
ec678f01 test(capability-providers): visitor-auth loopback-http exception both ways, URL/claims security edges
c05b8aeb test(capability-providers): jwt-auth wrong-length forged signature → null, never RangeError
```
Remote `cloud/fixwave-1025-F4` = `6b665ec7` (verified with ls-remote).


## RUN LOG (append-only)
## 2026-10-25T21:34Z — STARTED
Jini base 3e2fbae8 (origin/cloud/overnight-1024-jini) → branch cloud/fixwave-1025-F4. Node 24.22, pnpm install + `pnpm -r build` green. Plan: lane musts (jwt length guard, isSecureProtocol, NOT_ASSESSED fallback, catalog repo.ts, cms schema assertions).
## 2026-10-25T21:44Z — PROGRESS
Lane musts done + pushed to Jini cloud/fixwave-1025-F4: jwt length guard (c05b8aeb..), visitor-auth loopback both ways, NOT_ASSESSED fallback, catalog repo.ts SQLite tests, cms catalog/widget contract pins. Next: integrations signing/ssrf-guard/saved-requests/credentialed-request, cms sanitize-svg/sniffer.
## 2026-10-25T21:51Z — PROGRESS
SOURCE BUG found+fixed: integrations webhooks/signing.ts verifySignature accepted "<valid digest>" + 1 trailing hex char (Buffer.from(hex) drops odd nibble) — failing test f5565f8c, fix 55b2630c. Also pushed: ssrf-guard, saved-requests, credentialed-request edges; cms sanitize-svg, sniffer, consent gate runtime exemption, receipt-id bounds. Jini HEAD 4fb362c1.
## 2026-10-25T22:31Z — PROGRESS
Coverage measured: capability-providers 100/100 (whole pkg), integrations touched files 100/100 (credentialed-request + saved-requests/schema closed), commerce payments+money 100/100 (vitest), catalog repo.ts 100 L / 98.78 B. CCN>10 source functions: 0 in all four packages (eslint complexity 10). Stryker re-score capability-providers: lifecycle 75.1→99.7, jwt 77.6→86.9, definitions 59.3→88.9, tokens 0→100, stripe 87.7→91.8, ws 83.3→85.2 (rest classified equivalent). FINDING: describe-level fixtures make a killed mutant look "survived" under Stryker (collection crash) — fixed in visitor-auth tests.

## 2026-10-25T22:54Z — DONE
All steps 1–6 run; NOT-done list in §5.

F4 DONE 2026-10-25T22:54Z — wall 1 h 20 m, rough tokens ≈ 0.5M
