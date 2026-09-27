import { publishSectionById, type PublishSectionId } from "@tovu/publish-content-ui";

import { useWiredAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t as translateDashboard } from "../../dashboard/dashboard-i18n";
import { usePublishToLiveAvailable } from "./publish-availability.store";
import { requestPublish } from "./publish-request.store";

/**
 * @file `plan-publish-sections-2026-09-25.md` §2 S3 / plan G1 — the hook behind each list page's own
 * "Publish <section>" button. Kept out of `PublishSectionButton.tsx` per the house rule that component
 * logic belongs in a hook, not the `.tsx` — the component only reads `{ label, onClick }` back.
 *
 * Label and scope both come from the one section table (`@tovu/publish-content-ui`'s
 * `PUBLISH_SECTIONS`), and a click opens the SAME dialog the Dashboard wired (`requestPublish`) — a
 * section button never plans or publishes anything itself, it only narrows what the dialog opens
 * scoped to.
 */

export type { PublishSectionId };

export interface PublishSectionButtonController {
  /** `false` on the live site, where there is nowhere to publish to — see
   *  `publish-availability.store.ts`. The button renders nothing then. */
  readonly visible: boolean;
  /** The section's own label, e.g. "Publish pages" — resolved against the caller's locale through
   *  the same `dashboard-i18n` dictionary the dialog's title reads from. */
  readonly label: string;
  /** Opens the Publish dialog scoped to this section's WHOLE `entityTypes` (e.g. collections sends
   *  `["content-type", "collection-entry"]`). `{}` criteria means "start with nothing ticked and let
   *  the dialog's own auto-plan populate it" — the Dashboard's unscoped button's starting shape. */
  readonly onClick: () => void;
}

/**
 * @param section Which publishable section this button opens the dialog scoped to.
 * @complexity O(sections).
 */
export function usePublishSectionButton(section: PublishSectionId): PublishSectionButtonController {
  const locale = useWiredAdminLocale();
  // `PublishSectionId` is derived from the table itself, so the lookup cannot miss.
  const entry = publishSectionById(section)!;
  const visible = usePublishToLiveAvailable();
  return {
    visible,
    label: translateDashboard(locale, entry.labelKey),
    onClick: () => {
      requestPublish({}, { entityTypes: [...entry.entityTypes] });
    },
  };
}
