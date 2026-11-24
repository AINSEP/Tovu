import type { PublishCriteria, PublishRequestResult, PublishScope } from "@jini-ai/cms/publish/content/ui";
import { createPublishRequestStore } from "@jini-ai/admin/publish-content/screen/hooks/publish-request.store";

import { isPublishToLiveAvailable } from "./publish-availability.store";

/**
 * @file This admin's ONE publish-request store instance (`@jini-ai/admin`'s
 * `createPublishRequestStore`; the store's rules and their rationale live in that module's header),
 * bound to this admin's publish-content dialog contract and fed its publish-to-live flag. `App.tsx`
 * mounts `PublishContentDialog` from `usePublishRequest`; the Dashboard, the chat capability relayed
 * through `App.hooks.ts` and the WebMCP projection open it through `requestPublish`. The flag is
 * read through a call, not captured, so the live-site check runs on every ask.
 */

/** What a request that never got planned resolves with — a superseded request, or one the operator
 *  closed before anything plans. `opened: true` is accurate either way: the dialog DID mount, however
 *  briefly; it is `planned` that stayed `false`. */
function unplannedResult(): PublishRequestResult {
  return {
    opened: true,
    planned: false,
    site: null,
    willPublish: [],
    willOverwrite: [],
    leftAlone: [],
    unmatchedItems: [],
    unknownTypes: [],
    nextStep: "The Publish dialog was closed before it could work out what would be published.",
  };
}

/** What any ask to publish resolves with on the live site — the dialog never opens there. */
function liveSiteResult(): PublishRequestResult {
  return {
    ...unplannedResult(),
    opened: false,
    nextStep:
      "This is the live site, so there is nowhere to publish to. Publish from your local copy of the site instead.",
  };
}

export const { requestPublish, closePublishRequest, usePublishRequest } = createPublishRequestStore<
  PublishCriteria,
  PublishScope,
  PublishRequestResult
>({ isPublishToLiveAvailable: () => isPublishToLiveAvailable(), unplannedResult, liveSiteResult });
