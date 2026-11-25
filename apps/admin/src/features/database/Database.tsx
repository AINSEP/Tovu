import { Database as JiniDatabase } from "@jini-ai/admin/screens/database/Database";
import { ServerLabel } from "@/components/status-labels";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { useWiredMigrateForwardSection } from "./hooks/migrate-forward-section-dependencies.hooks";
import { useWiredSchemaStateSection } from "./hooks/schema-state-section-dependencies.hooks";
import { useWiredTimelineSection } from "./hooks/timeline-section-dependencies.hooks";

/**
 * @file Host binding for the `/admin/database` screen: the markup, tab handling and drift banner
 * live in `@jini-ai/admin/screens/database/Database`; this file only hands it this app's
 * collaborators — the wired section hooks (live ports, locale, error wording), the admin locale
 * hook, and the `ServerLabel` status label.
 */

export interface DatabaseProps {
  /** The `?tab=` query value from `panels.tsx`'s `database` route (`URLSearchParams.get` returns
   *  `null` when the param is absent). */
  tabId?: string | null;
}

export function Database(props: DatabaseProps) {
  return (
    <JiniDatabase
      tabId={props.tabId}
      ServerLabel={ServerLabel}
      useAdminLocaleHook={useAdminLocale}
      useTimelineSectionHook={useWiredTimelineSection}
      useMigrateForwardSectionHook={useWiredMigrateForwardSection}
      useSchemaStateSectionHook={useWiredSchemaStateSection}
    />
  );
}
