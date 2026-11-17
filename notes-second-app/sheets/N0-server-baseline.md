# N0: notes-app baseline, origin guard, cookie fix, function split, gap ledger

Inherits `COMMON.md`. Repo: Jini. Branch: `feat/notes-n0-baseline`. Touches only `examples/notes-app/**`.
Prerequisites: none (examples-only; file-disjoint from every xpkg lane). Estimate: ~60k Sonnet.

## Goal

Make the existing `examples/notes-app` a safe base for an admin API and an assistant: mutations refuse
cross-site callers, the reference adapter keeps multiple cookies, every function is <= 50 lines, and the
app-owned generic code is listed in a ledger with a line budget.

## Inventory (run first; expected on `integ/merge-b-2026-11-16@674a19ea`)

```sh
wc -l examples/notes-app/src/*.ts examples/notes-app/scripts/smoke.ts     # app.ts 140, node-server.ts 182, notes-repo.ts 58, db.ts 74, ports.ts 50, pages.ts 52
rg -n "GAP:" examples/notes-app/src                                      # 6 markers: ports.ts x2, db.ts x2, notes-repo.ts x2
rg -n "setHeader|getSetCookie" examples/notes-app/src/node-server.ts      # one forEach(...setHeader), no getSetCookie
sed -n 1,60p packages/core/src/contracts/server/origin.ts                 # read guardSameOrigin + RequestWithOriginHeaders
sed -n 1,60p packages/core/src/contracts/server/middleware.ts             # read withServerMiddleware
sed -n 1,80p packages/core/src/contracts/server/testing.ts                # read createInMemoryServer and how it dispatches a Request
```

## Tests first

All with `node --test` in `examples/notes-app/src/*.test.ts` (the example's existing convention; keep it).

| # | Test (file) | Must fail when |
|---|---|---|
| T1 | `routes.characterization.test.ts`: through `createInMemoryServer`, with `InMemoryEntryRepo`-backed deps where the app allows injection, else a temp SQLite file: for each of the 8 existing routes assert status, `content-type`, redirect `location`, and body key fields (create -> 303/302 to `/notes/<slug>`; edit with stale `version` -> 409; publish -> status `published`; unknown slug -> 404; form submit invalid -> 422 with the error text; valid -> redirect `?sent=1`). Written **before** the split and green on the unsplit code. | a route is dropped, re-ordered so `/notes/:slug` shadows another, or a status code changes during the split |
| T2 | `origin-guard.test.ts`: one fully valid request; then one case per broken clause only: foreign `Origin` on POST -> 403; `Host` not `127.0.0.1:<port>`/`localhost:<port>` -> 403 (GET too); missing `Origin` on POST from a same-`Host` request -> allowed (non-browser client) **only if** `Sec-Fetch-Site` is absent or `same-origin`/`none`; `Sec-Fetch-Site: cross-site` -> 403. Assert the status **and** a JSON `error.code` (`ORIGIN_REJECTED` / `HOST_REJECTED`). | the middleware is removed, or any single clause is deleted (run each mutation by hand once and note it in the report) |
| T3 | add to `node-server.test.ts`: a handler returning two `Set-Cookie` headers yields two separate `set-cookie` header lines on the wire. | the adapter joins them (current behaviour: this test is red before the fix) |
| T4 | `scripts/check-gaps.ts` self-test in `check-gaps.test.ts`: a ledger entry whose file is over budget, missing, or lacks the `// GAP: G<n>` header makes the checker return a named problem; a clean ledger returns none. The checker is a pure function `findGapProblems({ ledger, readLines })` so the test passes fake file contents. | the checker stops reporting any of the three problems |

## Steps (commit each)

1. **Characterization.** Add T1. If `registerNotesApp` cannot take an injected repo, test against a temp SQLite
   file exactly as `scripts/smoke.ts` does. Green on unmodified code.
2. **Split `registerNotesApp`** (`src/app.ts`, ~105 lines) into `src/routes/notes-pages.ts`,
   `src/routes/notes-api.ts`, `src/routes/contact-form.ts`, each exporting
   `register…({ app, deps }, optional = {}): void`, plus `src/app-deps.ts` building the shared deps object once
   (`createAppDeps({ kernel })`). `app.ts` keeps `registerNotesApp` as the composition of those. Route
   registration order stays exactly as today (literal paths before `:slug` where both exist). T1 stays green
   with no edit to T1.
3. **Cookie fix** in `src/node-server.ts`: skip `set-cookie` in the header loop and write
   `response.headers.getSetCookie()` as an array. T3 green.
4. **Origin guard.** Decision rule: if `guardSameOrigin` accepts an object with only `headers` readable from a
   web `Request` and returns a decision you can map to a `Response`, wire it through `withServerMiddleware`
   in `src/origin-guard.ts` (plain wiring, not a gap). Otherwise write `src/gaps/origin-guard.ts`
   (`// GAP: G-ORIGIN core guard does not fit a web Request`, <= 60 lines) as a `ServerMiddleware`, and state in
   the report exactly which parameter did not fit. The allowed host list is built once from the real bound
   port (`app.listen` result), never from a request header. Apply to **every** route. T2 green.
5. **Gap ledger.** Add `GAPS.json` (`[{ "file", "gap", "maxLines" }]`) with: `src/node-server.ts` G1,
   `src/notes-repo.ts` G2, `src/db.ts` G2, `src/ports.ts` G17, and the origin glue if step 4 created it;
   `maxLines` = the file's line count at this commit. Add `scripts/check-gaps.ts` + package script
   `"gaps": "node scripts/check-gaps.ts"`. Add the `// GAP: G<n>` first-comment line to each listed file. T4 green.
6. **README**: add "Gaps" section pointing at `GAPS.json`, and the guard behaviour.

## Acceptance

- Gates: example server row of COMMON, plus `pnpm --filter @jini-example/notes-app run gaps`.
- `awk`-check or by reading: no function over 50 lines in `examples/notes-app/src`.
- `scripts/smoke.ts` prints PASS (restart proof unchanged).
- No new dependency in `examples/notes-app/package.json`.

## Not verified by the planner

`guardSameOrigin`'s parameter shape; `createInMemoryServer`'s dispatch method name; whether
`scripts/check-size.mjs` scans `examples/`.
