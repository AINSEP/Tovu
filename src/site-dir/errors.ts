/**
 * @file SPEC-003 — typed domain errors for the `site-dir` install-dir domain.
 *
 * Purpose:
 * One class per error `site-dir` originates; `cli/errors.ts` maps these 1:1 to the
 * `errors.spec.md` exit-code registry. Mirrors this codebase's established convention
 * (`widgets/errors.ts`, `features/entries/errors.ts`): `class X extends Error {}` does NOT
 * give an instance a `.name` of `"X"` on this runtime unless the constructor sets `this.name`
 * explicitly, so every class below sets it.
 *
 * Architectural role:
 * `site-dir` domain logic. No dependency on `cli/**` or `express` (INV-06, enforced by
 * `.dependency-cruiser.cjs`'s `site-dir-no-server-express-or-cli-imports` rule).
 */

/** `SITE_CORRUPT` (exit 5) — workspace-row-count violation or an unreadable/locked `content.db` (state.spec.md §5, EC-05). */
export class SiteCorruptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SiteCorruptError";
  }
}

/** `SITE_DIR_INVALID` (exit 3) — missing/corrupt/oversized `config.json` or `.site-meta.json` (state.spec.md §5, EC-03). */
export class SiteDirInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SiteDirInvalidError";
  }
}

/** `SITE_NEWER_THAN_RUNTIME` (exit 4) — site `schemaVersion`/`schemaTag` is newer than, or diverges from, the runtime's (REQ-05, RT-005). */
export class SiteNewerThanRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SiteNewerThanRuntimeError";
  }
}

/** `INIT_DIR_NOT_EMPTY` (exit 3) — the init target exists and is neither absent nor an empty directory (AC-04, EC-01, EC-02). */
export class InitDirNotEmptyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InitDirNotEmptyError";
  }
}

/** `VALIDATION` (exit 2) — bad/missing arguments (empty `--name`, out-of-range `--port`, etc.). */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** `INTERNAL` (exit 1) — unexpected failure; `initSite` performs best-effort cleanup first (INV-02). */
export class InternalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InternalError";
  }
}
