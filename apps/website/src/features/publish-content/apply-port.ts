import type { PublishContentApplyPort } from "./gated-hooks.js";
import { applyPublishContentReport } from "./apply-report.js";
import type { CreatePublishContentApplyPortInput } from "./apply-run.js";
import type { PublishContentDeps } from "./type-registry.js";
import type { TovuPublishPorts } from "./tovu-publish-ports.js";

/**
 * Every port some registered type's `apply()` needs, with `ports` made EXHAUSTIVE (every registered
 * type's own port, not just the ones a particular caller happens to use) — the apply bag is the one
 * bag that has to be complete.
 *
 * `ports` stays `Partial` on {@link PublishContentDeps} because an export/plan caller genuinely has
 * no use for every type's ports, and each type degrades quietly when its own port is absent. That is
 * right for `pack` and catastrophic for `apply`: an incomplete bag reaches a handler's `apply()` and
 * throws a bare `Error`, which `applyOneRow` cannot downgrade to a row outcome, so it aborts the
 * whole run.
 *
 * This type exists so that failure is impossible to ship. A composition root that forgets a type's
 * port now fails to COMPILE at {@link toPublishContentApplyDeps} instead of failing at run time —
 * which is what happened when `media` landed: both roots kept building a bag from the fields `post`
 * needed, media's `pack()` silently returned nothing, and the type could not travel at all.
 */
export type PublishContentApplyDeps = Omit<PublishContentDeps, "ports"> &
  Required<Pick<PublishContentDeps, "outbox" | "changeSets" | "authorize">> & {
    readonly ports: TovuPublishPorts;
  };

/**
 * The composition roots' one way to build {@link createPublishContentApplyPort}'s deps bag.
 *
 * Identity in behaviour, load-bearing in TYPE: it is the single place the apply bag's completeness
 * contract is stated, so `server/runtime/composition/deps.ts` (SQLite) and
 * `server/runtime/composition/app.ts` (in-memory) cannot drift apart or silently skip a type's
 * ports. Adding a port to {@link PublishContentApplyDeps} makes every root that has not supplied it
 * a compile error — the whole point.
 *
 * @complexity O(1) — no work; the type checking is the function.
 */
export function toPublishContentApplyDeps(required: PublishContentApplyDeps): PublishContentApplyDeps {
  return required;
}

/**
 * Builds the real {@link PublishContentApplyPort} — Task 8's apply loop. See `apply-row.ts`'s header for
 * the apply-time race guards and the authorship-id disclosed deviation.
 *
 * @complexity O(n) in the report's row count (one `inspect`/`apply`/baseline call per writing row,
 * one baseline call per `unchanged` row), plus one bundle reload and one contributor-registry read
 * per call — dominated by whatever I/O those individually cost, not by this function's own control
 * flow.
 */
export function createPublishContentApplyPort(input: CreatePublishContentApplyPortInput): PublishContentApplyPort {
  return {
    applyReport: ({ report, principalId, bundleId, restorePointId, authorize, backstop }) =>
      applyPublishContentReport({ input, report, principalId, bundleId, restorePointId, authorize, backstop }),
  };
}
