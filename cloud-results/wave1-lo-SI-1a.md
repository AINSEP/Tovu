# wave1 lo-SI-1a — site inspection: characterize the published-page guard (kind TESTS, Tovu only)

Status: **DONE** for the sheet's test work; the repo ratchets (V2 S-LIM tail) are red on the base itself, unrelated (see Gates).
Branch: `wave1/lo-SI-1a` (Tovu). Base: `origin/integ/merge-final-2026-11-16` = 232764af5 in Tovu; Jini 65d73b0d5 (linked, built, **no Jini change, nothing pushed to Jini**).
Plan read from `origin/plan/left-out-areas-2026-11-16`: `left-out-areas/INDEX.md`, `COMMON-LO.md`, `sheets/DC-SI-ML-small-areas.md` (section SI-1a), `sheets/SI-1a.{files,importers}.tsv`.

## Steps and SHAs
| step | SHA | what |
|---|---|---|
| SI-1a | 16bea2420b23b576f19c2fd2f7978b9c0d7b691d | +22 tests in `apps/website/src/features/site-inspection/__tests__/published-page.unit.test.ts` (25 -> 47 tests; the 1 deleted line is the `node:http` import widened). Test file only; `published-page.ts` untouched. |
| report | (this commit) | this file |

## Gates (Node 24.22.3; Tovu `npm ci` at root; `link-jini` to Jini checkout `Jini`, Jini SHA 65d73b0d5a430749ab2b5f4c7b0b2c3a616d96de)
- S-BLOB: `published-page.ts` blob 1877aafb... matches the sidecar; prints nothing. S-PRE: none for SI-1a.
- V1 baseline (unmodified tree): `tsc -p tsconfig.json --noEmit` EXIT 0; `typecheck:tests` (tsconfig.tests.json) EXIT 0; sheet test file: tests 25, pass 25, fail 0. Jini guard baseline not needed (no Jini edit).
- V2 after the commit: both tsc EXIT 0; sheet test file tests 47 / pass 47 / fail 0; `npx eslint <test file>`: 0 errors, 1 warning (`sonarjs/no-nested-incdec` at the existing `chunks[pulls++]`, present on the base; I fixed the same pattern in my own helper).
- S-LIM: production-file list is empty (test-only diff), so nothing to compare; informational run of the same limits on the test file: identical finding set before and after (only the pre-existing `no-nested-incdec`), no new function over 50 lines / complexity 10.
- S-SUPPRESS, S-MOCK, S-FORWARD, S-BOOT, S-DELETE, S-SCHEMA: print nothing. S-NET: one hit, `http://evil.example:53142/x`, a string asserted on (refused by the path guard), never fetched.
- **Repo ratchets `npm run check:size` / `check:complexity`: exit 1 — also exit 1 with the base version of the test file swapped back in, and the two logs are byte-identical to the one after my commit.** Violations are in files this commit does not touch (e.g. `server/runtime/composition/deps.ts`, `admin-http/routes/members/list.ts`, `external-mcp/tool-registrations.ts`). Pre-existing on this base in this environment; not fixed (outside the sheet).
- No `node --test`/`tsc` child left running (checked with `pgrep`).

## V3 — proof each group can fail (mutation applied to `published-page.ts`, run, restored with `git show HEAD:<path> > <path>`, `git diff --quiet` clean each time)
| group | mutation | RED tests |
|---|---|---|
| path shape: length | `raw.length > MAX_PATH_LENGTH` -> `>=` | "length is bounded by MAX_PATH_LENGTH (2047 and 2048 pass, 2049 is refused)" |
| path shape: one decode pass | `decodeURIComponent(segment)` -> decoded twice | "a double-encoded traversal is ACCEPTED as a literal filename" |
| host-policy binding | `checkSitePathname({ url: resolved })` replaced by `{ kind: "ok" }` | "refuses the authenticated API surface", "the host policy refuses /admin and /api in every spelling, naming the surface", "a decoded backslash or control character is refused through the host check", plus 4 existing fetchPublishedPage tests (7 red, "Missing expected exception (PublishedPagePathError)") |
| order | validate the path BEFORE `openLoopbackSiteServer` | "an invalid path still opens the loopback server first, then closes it exactly once" (+ the existing "closes the server after ... validation rejection" test) |
| readBoundedBody boundary | `value.byteLength > remaining` -> `>=` | "maxBytes-1 truncates, maxBytes and maxBytes+1 return the body whole", "same boundary ... several chunks" |
| readBoundedBody cancel swallow | drop the `.catch` on `reader.cancel()` | "a cancel failure after overflow is swallowed ..." |
| readBoundedBody cancel on overflow | remove `reader.cancel()` | "a single chunk larger than the cap ... cancelled once" (+ existing "stops at the cap") |
| toCookieShapes | `indexOf("=")` -> `lastIndexOf("=")`; and name := whole `name=value` pair | "no cookie VALUE survives, whatever shape the value has" (and, for the 2nd, 3 more cookie tests) |

## Sheet cases -> tests (new = added here; existing = already on the base, kept unedited)
- Raw `..`, `%2e%2e`, `%2E%2E` refused: existing "refuses traversal, raw and percent-encoded"; new "raw and singly-encoded traversal name the '..' rule" pins the message.
- Double-encoded `%252e%252e` ACCEPTED (source comment quoted in the test): new.
- Malformed percent-encoding: existing `/a/%zz` refusal; new "malformed percent-encoding ... own message" pins the wording.
- Decoded backslash / control through the host check: new ("a decoded backslash or control character is refused through the host check").
- Absolute URL other origin / protocol-relative: existing; new "absolute URL to another origin ... leading-slash rule" and the wording test.
- Length 2047 / 2048 / 2049: new. Query kept: existing + new "only the path is validated, so the query is kept verbatim". Fragment as today: new (dropped from output; a `..` inside a fragment is still refused because the traversal scan runs before the fragment is stripped).
- Host policy: `/admin`, `/Admin`, `/api`, `/api/x`, `/%61dmin` refused with the surface named: new (12 spellings) + existing fetchPublishedPage message tests; look-alike slugs stay fetchable: new.
- Order: new, see Deviations.
- readBoundedBody maxBytes-1 / maxBytes / maxBytes+1, stream error, reader cancelled on overflow: new (existing "stops at the cap" kept). Multi-byte split and empty body added too.
- toCookieShapes sentinel: existing sentinel test kept; new test uses a sentinel in plain, `=`-containing, quoted, `Expires`-with-comma and bare cookies.

## STOPs hit
None. No blob drift, no prerequisite for SI-1a, no baseline red (tsc, tests). The ratchet red above is a pre-existing environment/base fact, recorded not fixed.

## Deviations from the sheet
1. **Order case seam.** The sheet names a recording `openLoopbackSiteServer` seam in `FetchPublishedPageDeps`. That function is a module-level export, not a dep; the dep seam that exists is `deps.createServer` (native server factory) plus `deps.createSiteApp`. The test records `app-built, created, listening, closed` through a recording `createServer` wrapper around the real loopback server, and asserts the app never receives a request. No `mock.module`. The sheet's wording about the "seam" should say `createServer`.
2. The sheet says "report existing cases by name" — done above. The pre-existing test uses `t.mock.method(Server.prototype, "close", ...)`; it was left untouched.
3. Cases not requested but added because they pin real behavior: wording of the non-slash/protocol-relative/backslash/control/empty refusals, `..` in a fragment, query not validated, whole-segment host comparison.
4. A characterization finding for SI-1b: the `..` scan runs on the raw string up to the first `?`, so a `..` after a `#` is refused (see fragment test). Keep it when the guard moves.

## Next step
SI-1b (SEAM+MOVE) can start: its precondition (`rg -n "%61dmin" <test file>`) is met. It needs the owner decision gates in its own sheet and a Jini `@jini-ai/diagnostics` change; not started in this run.
