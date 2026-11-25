import { Database as JiniDatabase } from "@jini-ai/admin/screens/database/Database";
import { ServerLabel } from "@/components/status-labels";
import type { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import type { useWiredMigrateForwardSection } from "./hooks/migrate-forward-section-dependencies.hooks";
import type { useWiredSchemaStateSection } from "./hooks/schema-state-section-dependencies.hooks";
import type { useWiredTimelineSection } from "./hooks/timeline-section-dependencies.hooks";

/**
 * @file Host binding for the `/admin/database` screen: the markup, tab handling and drift banner
 * live in `@jini-ai/admin/screens/database/Database`; this file only hands it this app's
 * collaborators — the wired section hooks (live ports, locale, error wording) and the admin locale
 * hook, all injected as REQUIRED props by `panels.tsx`, plus the `ServerLabel` status label.
 */

export interface DatabaseProps {
  /** The `?tab=` query value from `panels.tsx`'s `database` route (`URLSearchParams.get` returns
   *  `null` when the param is absent). */
  tabId?: string | null;
  useAdminLocaleHook: typeof useAdminLocale;
  useTimelineSectionHook: typeof useWiredTimelineSection;
  useMigrateForwardSectionHook: typeof useWiredMigrateForwardSection;
  useSchemaStateSectionHook: typeof useWiredSchemaStateSection;
}

export function Database(props: DatabaseProps) {
  return (
    <JiniDatabase
      tabId={props.tabId}
      ServerLabel={ServerLabel}
      useAdminLocaleHook={props.useAdminLocaleHook}
      useTimelineSectionHook={props.useTimelineSectionHook}
      useMigrateForwardSectionHook={props.useMigrateForwardSectionHook}
      useSchemaStateSectionHook={props.useSchemaStateSectionHook}
    />
  );
}
