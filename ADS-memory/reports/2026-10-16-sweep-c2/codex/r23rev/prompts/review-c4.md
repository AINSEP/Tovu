# Tovu: read-only review of fixes-c4's commits (test coverage + two small source fixes)

Repos: Tovu (/Users/la/Programming/Tovu, cwd). READ-ONLY review: do NOT edit any file, do NOT run tests, typecheck, builds or
package scripts, do NOT touch git state (read with `git show` / `git log` only).

Review these local commits: 74380981c 4b2d30453 807adf4e7 528bc047e 566378aab b440318a2 476a544fb 2240333fd
(`git show <hash>`), plus the UNCOMMITTED diffs of:
- apps/website/src/server/runtime/composition/peer-site-reads.ts and __tests__/peer-site-reads.test.ts (cross-site pages_read_html
  gets a peer resolveActiveThemeId; schema-refusal test now deletes the newest TS migration ledger row)
- apps/admin/src/integrations/chart-providers/use-chart-registry.hooks.ts (new optional importModule DI seam)

Look for: (1) tests that assert nothing real (tautologies, asserting fakes return what the test planted, snapshot-only checks);
(2) weakened or deleted assertions, or deleted "why" comments; (3) tests that write the real home (~/Documents/Tovu,
~/Library/Application Support/Tovu, ~/.tovu) or leave temp dirs/handles/globals/stubs behind; (4) module mocks where an injected
port exists; (5) in the two source diffs: correctness bugs, especially anything that could let site A's data/theme/settings be used
when reading site B, or change a dependency array so a hook re-runs every render.

Report: `FINDINGS:` numbered, each with file:line, severity (bug | test-gap | nit), and a one-line fix. Then `CLEAN:` the commits with
no findings. Be concrete; skip style nits unless they hide a bug.
