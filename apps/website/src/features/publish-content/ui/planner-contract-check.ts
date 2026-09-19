import type {
  PublishContentOutcomeKind as PlannerOutcomeKind,
  PublishContentOutcomeRow as PlannerOutcomeRow,
  PublishContentReport as PlannerReport,
} from "../planner.js";
import type {
  PublishContentOutcomeKind as UiOutcomeKind,
  PublishContentOutcomeRow as UiOutcomeRow,
  PublishContentReport as UiReport,
} from "./contract.js";

/**
 * @file Task 11 — the compile-time guard that keeps `ui/contract.ts`'s re-declared report shapes
 * honest against `planner.ts`'s real ones.
 *
 * ## Why this is a separate file, and why nothing imports it
 *
 * `ui/` is compiled by TWO TypeScript programs: the repo root's (`tsconfig.json`, which includes
 * `apps/website/src/**` and excludes `__tests__`) and `apps/admin`'s (which includes exactly
 * `ui/index.ts` and whatever that file's imports reach). `planner.ts` transitively imports
 * `node:crypto` and `#src/...` subpath specifiers, neither of which `apps/admin`'s tsconfig can
 * resolve — so this file must stay **unreachable from `index.ts`**, or the admin build breaks.
 *
 * Nothing imports it on purpose. The root typecheck still compiles it because it sits under
 * `apps/website/src/**` and is not a test, which is the whole point: it is checked where the server
 * types live and invisible where they are not welcome.
 *
 * Adding an outcome kind or a report field on either side without mirroring it on the other is a
 * typecheck error here. Deleting this file re-opens the drift `ui/contract.ts`'s header describes.
 */

/** Fails to compile unless `T` and `U` are mutually assignable. */
type MutuallyAssignable<T extends U, U extends V, V = T> = true;

/* eslint-disable @typescript-eslint/no-unused-vars -- these aliases exist to be typechecked, not read. */
type OutcomeKindsMatch = MutuallyAssignable<UiOutcomeKind, PlannerOutcomeKind>;
type OutcomeRowsMatch = MutuallyAssignable<UiOutcomeRow, PlannerOutcomeRow>;
type ReportsMatch = MutuallyAssignable<UiReport, PlannerReport>;
/* eslint-enable @typescript-eslint/no-unused-vars */

/**
 * A value export so the module is never elided as type-only, and so an accidental `import` of this
 * file from `index.ts` shows up as a real runtime edge in the boundary test rather than vanishing.
 */
export const PUBLISH_CONTENT_UI_CONTRACT_CHECKED = true;
