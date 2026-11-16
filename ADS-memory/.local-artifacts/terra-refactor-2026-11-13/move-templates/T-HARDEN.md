# T-HARDEN: the Jini survivor gains Tovu's missing behaviour, then Tovu dedupes or deletes

Template for kind HARDEN (KINDS.md §5): survey `DEDUPE-AFTER-HARDENING` / `DELETE-AFTER-PARITY`. No pilot recipe; it is T-DEDUPE with a behaviour-changing Jini commit in front. Executor: Sonnet 5.5 high when the sheet carries a complete parity list (≤ 4 files / 900 lines); the parity list itself comes from Opus when the survivor is a legacy twin with wire drift.

## Sheet (filled per slice)
```
id: {ID}                                   # HD-<feature-slug>-<n>
feature: {FEATURE}
tovu_files:
  - {path} | blob {sha} | {delete-and-repoint | reduce-to-binding}
jini_survivor: {@jini-ai/pkg/subpath | @jini-ai/pkg (barrel)} {names} at {jini file} | blob {sha}   # "(barrel)" when the name is exported only from the package root; cite the barrel file:line
parity:                                    # one row per behaviour Tovu has and Jini lacks (or does differently)
  - P1: {behaviour} | Tovu {file:line} | Jini {file:line or "absent"} | generic? {yes -> Jini | no -> Tovu option {field}}
wire_drift:                                # routes, permission names, cookie/header/storage keys, event names; or -
  - {kind} Tovu "{value}" / Jini "{value}" | keep {which} because {saved data / clients / tests}
jini_failing_tests: |                      # one per generic parity row, written BEFORE the Jini fix
  {test file path + code}
jini_change: |                             # the minimal Jini edit per parity row: exact old -> new, or new function bodies
  {…}
new_options:                               # Tovu-only policy injected into Jini, in the optional object
  - {optional.field}: {type} default {value that keeps every other Jini caller unchanged}
changeset: {pkg}: {patch | minor} | "{sentence}"
tovu_binding_or_repoint: |
  {as T-DEDUPE: binding body, or importer old -> new list}
tovu_tests: {move to Jini (covered by jini_failing_tests) | repoint | delete}, per file
census: {cmd} | allowed: [...]
jini_msg: "{fix(pkg): …}" | tovu_msg: "{refactor(area): use hardened @jini-ai/…}"
```

## Steps
0. Branch rule; blobs; every parity row's Jini anchor exists (or is marked absent).
   - Empty parity: if `parity` has no row (Jini already has every behaviour, and the only differences are Tovu product policy or a narrower Tovu type), STOP this template: the row is a DEDUPE with a binding that narrows the Jini type (T-DEDUPE, `type-narrowing` variant). Report the label as wrong (W0: `contracts/core/tool-metadata`, classifier `DEDUPE-AFTER-HARDENING` at similarity 0.8, had no parity row).
   - Import specifiers: COMMON rule 5 (own package leaf, core, protocol only; never a barrel) binds Jini-side imports only. Tovu may import a Jini package barrel (`@jini-ai/core`) when the name has no subpath; the sheet then writes `(barrel)`.
### Jini (commit 1)
1. Add `jini_failing_tests` first (not run; report RED-expected on the parent).
2. Apply `jini_change` + `new_options`. Every other Jini caller must behave as before: defaults reproduce today's Jini behaviour, and the sheet says so per option.
3. Changeset; rule checks (COMMON rules 2–9 on edited Jini files); eslint; commit.
### Tovu (commit 2)
4. Apply `tovu_binding_or_repoint` passing the Tovu `new_options` values; keep wire values per `wire_drift` (the Tovu side passes its own literal where the sheet says "keep Tovu").
5. Tests per `tovu_tests`; census; `git rm -q` deleted files; eslint; commit.

## STOP specific to HARDEN
- A parity row is security-relevant (auth, permissions, secrets, CSRF, rate limits) and the sheet has no failing test for it.
- A Jini default would change behaviour for an existing Jini caller.
- `wire_drift` changes a value that saved data or a deployed client reads, without the sheet naming the migration (then: SKIP, owner/Opus).
- Owner-decided rows (e.g. retiring Tovu `admin/features/security` for Jini `admin/security`, 11-10) still follow this template; the decision does not waive the failing tests.
