# `apps/website/src/cli` — the `tovu` bin

Tovu's command tree (`program.ts`), exit-code registry and domain classifiers (`errors.ts`), and
the command bodies under `commands/`. The bin path `src/cli/main.ts` is pinned by `package.json`
and desktop staging, so it stays the composition root.

## Wiring

- `main.ts` binds `process.stdout`, `process.stderr` and `process.exit` into `@jini-ai/cli`
  `runCliProgram` (bare `tovu` → usage on stdout, exit 0; any rejection → one mapped stderr line).
- `errors.ts` builds `mapErrorToCliOutcome` with `@jini-ai/cli` `createCliOutcomeMapper`; classifier
  order is plugin-install → commander parser (`createParserClassifier`) → `site-dir`, then the coded
  classes, then INTERNAL. `createTovuCliOutcomeMapper({}, { siteDirClassifier })` exists so tests can
  prove that order.
- `program.ts`'s `introspect` action calls `@jini-ai/cli/introspection` `printIntrospection` with the
  live manifest, `TOVU_TOOL_PREFIX` (`introspect.ts`), a stdout output port and a `ValidationError`
  factory; the `--format` refusal text is built by Jini and asserted by Tovu's unit test.
