# Common rules (pasted verbatim at the end of EVERY assembled recipe; read before editing)

Assembly: `cat T-<KIND>.md <sheet>.md COMMON.md > <job>.md`. A recipe must be self-contained: never write "same rules as …" (a cross-reference cost 41 eslint-disables on 10-29).

## Session
- HARD RULE: stop before 300k tokens of context. Near 250k: start nothing new, restore any half-done file, report what is done and what is left.
- Clones: Tovu `{TOVU_CLONE}`, Jini `{JINI_CLONE}`. Both must report `{BRANCH}` from `git branch --show-current`; else STOP.
- Bootstrap files (AI-Dev-Shop/AGENTS.md, CLAUDE.md startup) do not apply; expected. Proceed.
- Run NO tests, tsc, builds, installs, lockfile commands, formatters, `--fix`/`--write`. Leave no process running.
- Edit only the files the sheet names. Never touch node_modules, ADS-memory, `*.sql`, lockfiles, package versions.

## STOP-on-mismatch (a SKIP is a good outcome)
- Every file the sheet guards must match its blob (`git hash-object <path>`). A sheet that guards by text instead: every OLD text must occur exactly once (or the stated count) at the moment you apply it.
- Any census hit the sheet does not list, any missing Jini name the sheet assumes, any step that would need a decision the sheet did not make: restore only the files you changed (`git show HEAD:<path> > <path>`; `rm` files you created), report SKIPPED + the reason. Never improvise a fix.

## Owner rules every move obeys
1. Generic code goes to Jini; one-site/product code stays in Tovu. A Jini package states a contract (interface/port); Tovu wires it. No package sits above the domain packages.
2. Jini never imports Tovu, and holds no Tovu text: after the Jini edits, `rg -n -i "tovu|site-chat|apps/(admin|website|desktop)" <every Jini file you created or edited>` prints nothing.
3. No server framework in Jini: no `express` import, type or `req/res/next` handler shape. Jini takes `{ app: Server }` (the `@jini-ai/core/contracts/server` contract) or a plain function; Express stays in Tovu.
4. No vendor code in core or in a domain package: a vendor SDK/endpoint goes to its provider plugin/adapter. Plugins never import each other.
5. Moved Jini code imports only (a) its own package, from the declaring LEAF file, never the package barrel, (b) `@jini-ai/core`, and (c) `@jini-ai/protocol`. NOTHING else, even if `package.json` already depends on it (owner 11-15 "untangle everything": every other cross-package need is a port the host wires). Exceptions: the host-preset packages `server` and `cli`; tests may import another package's `/testing` and `/conformance` subpaths. A moved file that needs any other `@jini-ai/*` import = STOP. This rule binds Jini-side imports only: Tovu code may import a Jini package barrel (`@jini-ai/core`) when the name has no subpath.
6. No Jini React code imports another UI package (`@jini-ai/ui`, `@jini-ai/ui-kit/react`), including ui→ui-kit: the kit is injected through the package's own `src/react/kit.tsx` slots (owner 11-15, design in KIT-INJECTION.md).
7. No `console.*` in Jini: inject a `report` port; if it can carry errors, the host binding redacts (failing leak test first).
8. Never read `process.env` in Jini: the env NAME stays in Tovu; Jini takes the value.
9. A new third-party dependency in a Jini package = STOP (declare-never-lazy rule + lockfile; the coordinator adds it). Never `await import()` to dodge a missing dep.
10. Exported functions take `(required, optional = {})`. Never `_optional?: Record<string, never>` and never drop the outer `= {}` (owner 11-15): if `= {}` pushes complexity past the limit, extract a helper. Convert every caller in the same commit.
11. Functions ≤ 50 lines (CI error at 80; blank lines and comments not counted); cyclomatic and cognitive complexity ≤ 10 (admin ≤ 9/9). A moved function that breaks a limit is split in the move, never exempted.
12. "Why" comments MOVE with the code (onto the Jini declaration, reworded neutral), never deleted. Tovu-specific why (product names, env names, routes, ADR numbers) stays in Tovu next to the binding. Tracking pointers ("Jini candidate: see …") are deleted, not moved.
13. Behaviour change = failing test FIRST, in the same commit, not run here: the batched cloud run must show it RED on the parent and GREEN on the commit. Pure moves change no behaviour.
14. Jini changes are additive: never remove or rename an export Tovu (or another package) still imports.
15. New CSS classes in Jini carry the `jini-` prefix; Tovu renames its selectors and test selectors in the same Tovu commit.
16. Jini packages publish as one fixed changeset group: each Jini commit that changes shipped code adds ONE `.changeset/<pkg>-<slug>.md` (`minor` for a new export/subpath, `patch` for a fix; test/doc-only commits add none). All `@jini-ai/*` bump together at the single coordinated publish (D1 default: no prerelease).
17. A new subpath = `exports` entry + `jini.entries` runtime tag (`universal` | `node` | `browser`) + README line; a `universal` entry never reaches `node:` built-ins.
18. Both repos are public: commit messages and code comments never describe a vulnerability's exploit.
19. No re-export shells, deprecations or forwarders (owner 11-15, no external users): when code moves, delete the old Tovu file and repoint every importer in the same Tovu commit.
20. Never remove assertions, test injections or overrides to make a call fit (a P2 agent did; tests passed vacuously). A test that no longer fits = STOP.
21. Kysely (or any library type) never enters `@jini-ai/core` contracts (owner 11-15); pure side-effect-free helpers may go in core, I/O/state/timers/Node built-ins may not.

## Checks (only these)
- `node_modules/.bin/eslint -f json <touched .ts/.tsx files>` from each clone root. Fail only on errors whose rule is an import/unused/resolve rule (`import/*`, `n/no-missing-import`, `@typescript-eslint/no-unused-vars`, `no-unused-vars`, unresolved) or that sit on a line your diff changed (`git diff -U0`). Pre-existing errors on untouched lines (`max-lines`, `complexity`, `sonarjs/cognitive-complexity`, …) are the gate debt list: record their count, never fix them, never STOP for them.
- `node --check` for touched `.js/.mjs`; `node -e 'JSON.parse(require("fs").readFileSync("<package.json>","utf8"))'` for an edited package.json.
- In Tovu, an unresolved-import error for a NEW Jini specifier is expected until the Tovu clone is linked to the Jini clone (D1): record it, do not fix. Any other eslint error your edit causes: fix only if it is a literal consequence (unused import, import order); otherwise STOP.

## Git
- Jini commit FIRST, then Tovu. New file: `git add -- <path>`. Deleted file: `git rm -q -- <path>`, AND list it in the commit pathspec. Commit: `git commit -F <msgfile> -- <every path, deleted ones included>`; verify with `git show --stat HEAD` that every edited, added and deleted path is in it. A `gc.log` warning printed on commit is harmless. Never `add -A`/`add .`, stash, checkout, reset, rebase, push, amend.
- Message files in `{SCRATCH}/`; each message ends with a blank line then `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Report
DONE or SKIPPED (+ reason, + the step), Jini SHA, Tovu SHA, every path changed, eslint result, any RED test to verify in the cloud run, anything that differed from the sheet, tokens used.
