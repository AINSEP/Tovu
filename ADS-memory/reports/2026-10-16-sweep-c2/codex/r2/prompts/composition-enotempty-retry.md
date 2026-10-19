# Retry: composition-served-site-dir.integration.test.ts after() still hits ENOTEMPTY

Repos: Tovu (/Users/la/Programming/Tovu, cwd). Jini (/Users/la/Programming/Jini) is READ-ONLY.

RULES: do NOT run tests, typecheck, builds or any package scripts. Do NOT commit or touch git state
(no stash/checkout/reset). Edit code only, then report `CHANGED FILES:` (absolute paths) + `NOT DONE:`
+ `ROOT CAUSE:` (what keeps writing into the dir, file:line). REUSE before you write. Smallest change.
Move "why" comments with code, never delete them. Do NOT edit non-test files under
apps/website/src/assistant/** or apps/website/src/server/runtime/composition/** (another agent owns
them tonight); if the real fix is there, give the exact patch under NOT DONE.

## State
apps/website/src/server/__tests__/integration/composition-served-site-dir.integration.test.ts has an
uncommitted change from the previous round (see `git diff -- <file>`): each fixture now captures the
store via `onStoreOpened` and awaits `store.close()` after `settleBoot(deps)`, and the env restore is in
a `finally`. Keep the `finally`. It is NOT enough — the describe-level after() still fails:

```
✖ a site composed with an explicit binding, while env/cwd name another site (2048.860427ms)
  Error: ENOTEMPTY, Directory not empty: /var/folders/7_/.../T/tovu-served-site-a-6PCan1 '/var/folders/7_/.../T/tovu-served-site-a-6PCan1'
      at Object.rmSync (node:fs:1229:18)
      at SuiteContext.<anonymous> (.../composition-served-site-dir.integration.test.ts:107:10)
      at async TestHook.run (node:internal/test_runner/test:1069:7)
    errno: 66, code: 'ENOTEMPTY', syscall: 'rm'
```
(80/80 tests pass; only this hook fails.) ENOTEMPTY from a recursive rm means something created a new
entry inside the tree while rm was walking it.

## Do
Find every background writer the composition starts for this site dir that store.close() does not
stop (candidates: plugin/theme/skill directory watchers, chokidar/fs.watch, sweeps/intervals,
fire-and-forget boot tasks such as seed hydration, search-index or blob work, log/journal writers, the
agent-plugins activations lock file, a WAL/SHM checkpoint from a DB handle that `deps` opened outside
the store). Await or stop each through its EXISTING close/dispose/stop API in the test teardown, in
the right order. If none exists for one of them, use `fs.rmSync(dir, { recursive: true, force: true,
maxRetries: 5, retryDelay: 50 })` only as the last resort and say why. Test-file change preferred.
