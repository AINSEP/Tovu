import {
  usePublishSectionButton as usePublishSectionButtonWithHost,
  type PublishSectionButtonController,
  type PublishSectionButtonHost,
} from "@jini-ai/admin/publish-content/screen/hooks/use-publish-section-button.hooks";
import { publishSectionById, type PublishSectionId } from "@tovu/publish-content-ui";

import { useWiredAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t as translateDashboard } from "../../dashboard/dashboard-i18n";
import { usePublishToLiveAvailable } from "./publish-availability.store";
import { requestPublish } from "./publish-request.store";

/**
 * @file This admin's binding of `@jini-ai/admin`'s section-button hook: label and scope from the one
 * section table (`@tovu/publish-content-ui`'s `PUBLISH_SECTIONS`), the label through the same
 * `dashboard-i18n` dictionary the dialog's title reads from, and a click through this admin's
 * `requestPublish` (the SAME dialog the Dashboard wired).
 *
 * `requestPublish` is called through the import, not captured into `host`, so a test spying on the
 * store module's export still sees the call.
 */
const host: PublishSectionButtonHost = {
  useLocale: useWiredAdminLocale,
  usePublishToLiveAvailable,
  sectionById: publishSectionById,
  translate: translateDashboard,
  requestPublish: (criteria, scope) => requestPublish(criteria, scope),
};

/**
 * @param section Which publishable section this button opens the dialog scoped to.
 * @complexity O(sections).
 */
export function usePublishSectionButton(section: PublishSectionId): PublishSectionButtonController {
  return usePublishSectionButtonWithHost({ section, host });
}
