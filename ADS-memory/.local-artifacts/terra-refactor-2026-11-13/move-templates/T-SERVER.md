# T-SERVER: framework-free logic moves to Jini; Express wiring stays in Tovu

Template for kind SERVER (KINDS.md §8). Worked example: `../sonnet-extract-pilot/E05-trust-proxy.md` (decision function, same Tovu API). Route modules need the `{ app: Server }` contract (`@jini-ai/core/contracts/server`, design d2 `server-port.md`, O1–O7) merged into Jini first; until then only the decision-function form (form A) is allowed. Sheets: Opus until 3 form-B sheets have landed clean, then Sonnet draft + Opus review per route group.

## Forms
- A. Decision function (E05): a pure function of plain values moves; Tovu keeps the middleware/route and calls it. Allowed now.
- B. Route module: a generic handler registers on `{ app: Server }`; Tovu passes its Express app through the adapter. Allowed only after server-port has landed in Jini (the step 0 rg proves it).

## Sheet (filled per slice)
```
id: {ID}                                   # SV-<feature-slug>-<n>
feature: {FEATURE}
form: {A | B}
server_contract_check: {B only: rg -n "export interface Server\b" {JINI}/packages/core/src/contracts/server* -> one hit}
tovu_files:
  - {path} | blob {sha} | {keep (same exported Tovu API) | reduce | delete}
jini_target: {pkg} {subpath} {file}        # usually http-kit or the owning domain package
moves:                                     # function bodies / handler bodies that become framework-free
  - {name}: {what goes}; inputs {plain values}; outputs {plain value | {status, headers, body}}
tovu_keeps: {env names, product wording, host signals, req/res adaptation, auth middleware order}
wire_contract:                             # must stay byte-identical
  - {status codes | header names | cookie names/attrs | JSON field names | error codes | body limits}
values_injected: {Tovu value -> optional/required field}
jini_code: |
  {full new file; no express, no req/res; errors as typed results or Error with neutral wording + injected names}
jini_tests: |
  {vitest cases for the pure part, incl. every wire_contract item}
tovu_edits: |
  {exact old -> new; keep the Tovu exported API so composition files stay untouched}
tovu_tests: {which Tovu tests keep pinning the Express integration (unchanged) and which pure cases moved}
changeset: {pkg}: minor | "{sentence}"
census: {cmd} | allowed: [...]   # usually: every importer is unchanged
jini_msg / tovu_msg: {…}
```

## Steps
0. Branch rule; blobs; Jini guards; for form B the `server_contract_check` must hit, else SKIP "server-port not landed".
### Jini (commit 1)
1. Write `jini_code` + `jini_tests` + index export + changeset.
2. Rule checks: `rg -n "express|Request\b|Response\b|NextFunction|req\.|res\.|process\.env|console\." <new files>` prints nothing (Fetch-API `Response` is allowed only if the sheet says so); COMMON 2–9; eslint; commit.
### Tovu (commit 2)
3. Census (expected: importers unchanged); `tovu_edits`; keep every why-comment and the Tovu header, append the pointer line ("The <decision> lives in `@jini-ai/…`; this file binds <env/host/Express>").
4. eslint; commit.

## STOP specific to SERVER
- Any `wire_contract` item would change.
- A handler body reads `req`/`res` beyond what `moves.inputs` lists (cookies, raw body, `res.locals` keys are wire keys: dossier `format-couplings.jsonl`).
- The Tovu exported API would change and the sheet does not list every importer edit.
- A handler argument list falls under the framework-signature exemption question (still open with the owner): keep the Tovu signature, convert only the moved Jini function.
