import { createPlanPublishToPeer } from "@jini-ai/cms/publish/content/push-plan";
import { entryPublicPath } from "#src/platform/routing/index";
import { pushBundleToPeer } from "./peer-transport-binding.js";
import type { TovuPublishPorts } from "./tovu-publish-ports.js";
import { buildPublishContentCatalog } from "./type-registry.js";

/**
 * @file Tovu's binding of the outbound plan builder owned by `@jini-ai/cms/publish/content/push-plan`:
 * this site's publishable-type registry, its bound peer transport (`peer-transport-binding.ts`) and
 * its public-address routing. The HTTP dialog and the assistant's publish tool share this one plan
 * builder.
 */
export const planPublishToPeer = createPlanPublishToPeer<TovuPublishPorts>({
  catalog: { build: buildPublishContentCatalog },
  pushBundleToPeer,
  entryPublicPath,
});
