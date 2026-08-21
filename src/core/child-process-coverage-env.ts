/**
 * @file Shared env-builder for any test that spawns a real Node child process while
 * `--experimental-test-coverage` is active in the parent.
 *
 * Under that flag the test runner exports `NODE_V8_COVERAGE=<aggregation-dir>` in its own
 * process env and collects every `coverage-*.json` written there. A spawned child that inherits
 * the parent's env inherits that variable too, and dumps its own V8 coverage profile into the
 * SAME aggregation directory at exit — producing a second (sometimes third) instantiation image
 * for source files the child also loaded. The merge across those images corrupts the resulting
 * `FN:`/`FNDA:` tables and deflates `LH:` line-hit counts for every affected file, not just the
 * child's own; if the child's write is truncated (e.g. a resource limit hit mid-process) the
 * leftover file can be malformed JSON, which makes the runner emit an EMPTY lcov for the entire
 * run.
 *
 * Deleting the variable from the child's env does NOT fix this — Node re-injects
 * `NODE_V8_COVERAGE` into descendant processes from its own coverage state, so it survives
 * `delete env.NODE_V8_COVERAGE` (verified directly: a child spawned with the key deleted still
 * saw the parent's aggregation directory). Overriding the value to a different, already-inert
 * directory is the only redirect that holds: the child's profile lands somewhere nobody
 * aggregates, and the parent's own coverage is unaffected because the parent's env is untouched.
 *
 * `coverageDir` need not already exist — Node creates it on first write, the same way it creates
 * the parent runner's own aggregation directory. Callers are still responsible for cleaning it up
 * (or pointing it inside a directory they already clean up) so temp coverage output doesn't leak.
 */

/**
 * Builds a child-process env that is a copy of the current process env with `NODE_V8_COVERAGE`
 * redirected to `coverageDir`, so a spawned Node child's own coverage profile lands there instead
 * of merging into the parent test runner's aggregation directory.
 *
 * @param coverageDir - Directory the child's V8 coverage profile should be written to. Does not
 *   need to exist yet.
 * @returns A `NODE_V8_COVERAGE`-redirected copy of `process.env`, suitable for `spawn`/`spawnSync`'s
 *   `env` option.
 * @complexity O(n) in the number of env vars on the current process — a single shallow copy.
 */
export function childProcessCoverageEnv(coverageDir: string): NodeJS.ProcessEnv {
  return { ...process.env, NODE_V8_COVERAGE: coverageDir };
}
