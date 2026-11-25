import type { UseAdminLocaleHook } from "@jini-ai/admin/react/kit";
import { Routines, type ConversationLinkBuilder, type RoutinesKit, type SchedulePickerHook } from "./Routines";
import type { RoutinesController } from "./Routines.hooks";
import { t } from "./routines-i18n";

/**
 * @file Mounts the screen with the host locale and the rollout switch. Why: the screen is dark until
 * the one Tovu release flag is on, so the mount (not the screen) is where "flag off renders nothing"
 * lives; the flag is a required prop (React passes components no second argument), tests inject `true`. Every hook is a required prop so no live hook is imported here.
 */
export function RoutinesMount({ useAdminLocaleHook, useRoutinesController, useSchedulePicker, useConversationDeepLink, kit, releaseEnabled, theme, visible }: {
  useAdminLocaleHook: UseAdminLocaleHook; useRoutinesController: (required: { visible: boolean }) => RoutinesController;
  useSchedulePicker: SchedulePickerHook; useConversationDeepLink: ConversationLinkBuilder; kit: RoutinesKit; releaseEnabled: boolean; theme: string; visible: boolean;
}, _optional: Record<string, never> = {}) {
  const locale = useAdminLocaleHook({}, {});
  if (!releaseEnabled) return null;
  return <Routines useRoutinesController={useRoutinesController} useSchedulePicker={useSchedulePicker}
    useConversationDeepLink={useConversationDeepLink} kit={kit} locale={locale} theme={theme} t={t} visible={visible} />;
}
