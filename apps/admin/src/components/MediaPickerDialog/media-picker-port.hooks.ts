import type { AdminMedia } from "../../lib/api";

/**
 * @file What `MediaPickerDialog.hooks.tsx` needs from the outside world, as an interface rather
 * than a direct `lib/api` import.
 *
 * Follows the `useX(dependencies)` / `useWiredX()` pair documented in
 * `development/docs/architecture/wired-hooks-convention.md` and `redirects-port.hooks.ts` (the
 * canonical reference). This port is deliberately its own file rather than reusing
 * `features/media/hooks/media-port.hooks.ts`'s (larger) `MediaPort`: `components/` sits below
 * every feature and must not import from one (the same "nothing outside this feature needs it"
 * boundary `media-port.hooks.ts` itself states, just enforced in the other direction here) — a
 * reusable dialog depending on a specific feature's port would be a back-edge into the composition
 * root's dependency graph (see `project_tovu_architecture_metrics`). Scoped to the one route this
 * dialog actually calls.
 *
 * `describeApiError` stays a direct import in the hook — pure error-classification, no I/O, same
 * reasoning as `redirects-port.hooks.ts`'s own exclusion of it.
 */
export interface MediaPickerPort {
  listMedia(): Promise<{ media: AdminMedia[] }>;
}
