import { createRawRowContributor } from "@jini-ai/cms/publish/content/raw-row-contributor";
import { BACKSTOP_LIMITS, BACKSTOP_RAW_POLICY } from "./backstop-policy.js";
import type { TovuPublishPorts } from "./tovu-publish-ports.js";

/**
 * @file Host binding of the engine's raw-row ("send by hand") publish type. The engine owns the
 * pack/precheck/apply/undo mechanics; this module supplies only Tovu's values: the immutable
 * table/value policy, the row limit, and the refusal copy that states it.
 */
export const { contributeRawRowPublish, undoRawRow } = createRawRowContributor<TovuPublishPorts>({
  policy: BACKSTOP_RAW_POLICY,
  limits: BACKSTOP_LIMITS,
  copy: { tooManyRows: "Choose at most 200 rows per send." },
});
