import { useWiredAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t as translateDashboard } from "../../dashboard/dashboard-i18n";
import { PUBLISH_SECTION_LABEL_KEYS } from "../publish-scope";
import { requestPublish } from "./publish-request.store";

/**
 * @file `plan-publish-sections-2026-09-25.md` §2 S3 — the hook behind each list page's own
 * "Publish <type>" button (Pages/Posts/Media/Menus/Redirects/Themes). Kept out of
 * `PublishSectionButton.tsx` per the house rule that component logic belongs in a hook, not the
 * `.tsx` — the component only reads `{ label, onClick }` back.
 *
 * Reuses S2's `PUBLISH_SECTION_LABEL_KEYS`/`dashboard-i18n` rather than adding a second copy of the
 * six section labels, and opens the SAME dialog S1/S2 already wired (`requestPublish`) — a section
 * button never plans or publishes anything itself, it only narrows what the dialog opens scoped to.
 */

/** The registry's own publishable entity types — the only keys `PUBLISH_SECTION_LABEL_KEYS` defines.
 *  Forms has no publish contributor and is not one of these (plan §0). */
export type PublishSectionEntityType = keyof typeof PUBLISH_SECTION_LABEL_KEYS;

export interface PublishSectionButtonController {
  /** The section's own label, e.g. "Publish pages" — resolved against the caller's locale through
   *  the same `dashboard-i18n` dictionary the dialog's title reads from S2, so a locale only has to
   *  carry the six keys once. */
  readonly label: string;
  /** Opens the Publish dialog scoped to this section: `requestPublish({}, {entityTypes: [type]})`.
   *  `{}` criteria means "start with nothing ticked and let the dialog's own auto-plan populate it"
   *  — the same starting shape the Dashboard's unscoped button already uses. */
  readonly onClick: () => void;
}

/**
 * @param entityType Which publishable section this button opens the dialog scoped to.
 * @complexity O(1).
 */
export function usePublishSectionButton(entityType: PublishSectionEntityType): PublishSectionButtonController {
  const locale = useWiredAdminLocale();
  return {
    label: translateDashboard(locale, PUBLISH_SECTION_LABEL_KEYS[entityType]),
    onClick: () => {
      requestPublish({}, { entityTypes: [entityType] });
    },
  };
}
