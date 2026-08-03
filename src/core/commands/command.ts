/**
 * @file The single mutation write path (ADR-008 §4) — re-exported from `@jini-ai/cms/core`.
 *
 * Moved into the package on 2026-08-02. See `../ports.ts` for why the re-export shim exists rather
 * than rewriting every importer.
 *
 * `ForbiddenError` and `DuplicateCommandError` are re-exported as **values**, not types, and that
 * matters: callers catch them with `instanceof`. Because this file re-exports rather than
 * redefines, there is exactly one class object for each — the package's. A local re-declaration
 * would produce a second constructor that every existing `instanceof` check would silently fail
 * against, turning a handled domain error into an unhandled 500.
 */
export type {
  AuthorizeFn,
  CommandActor,
  CommandEnvelope,
  CommandMutation,
  ExecuteCommandDeps,
  ExecuteCommandOptional,
  ExecuteCommandRequired,
} from "@jini-ai/cms/core";

export { DuplicateCommandError, ForbiddenError, executeCommand } from "@jini-ai/cms/core";
