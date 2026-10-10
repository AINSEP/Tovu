import { lazy, Suspense, type ComponentType, type CSSProperties } from "react";
import type { Translate } from "@jini-ai/ui/panel-kit";

// Creating this lazy component downloads nothing. SettingsDialogShell mounts only its
// selected panel, so this import runs only when an authorized TanStack host opens Queries.
// The default package entry returns null in production; the explicit production export
// provides the same embeddable panel there, using the nearest live QueryClient context.
const QueryDevtoolsPanel = lazy(() => import("@tanstack/react-query-devtools/production")
  .then(module => ({ default: module.ReactQueryDevtoolsPanel })));

/** Embeds the live cache panel; an injected component keeps UI tests vendor-free. */
export function QueriesPanel({ readOnly, t, Panel = QueryDevtoolsPanel }: {
  readOnly: boolean;
  t: Translate;
  Panel?: ComponentType<{ style?: CSSProperties; theme?: "light" | "dark" }>;
}) {
  return <section className="jini-settings-section" aria-label={t("Queries")}>
    {readOnly && <p className="jini-field-hint">{t("Live cache overview. Interaction is disabled in production.")}</p>}
    {/* TanStack has no read-only option. Native inert blocks both pointer and keyboard
        actions (including clear/refetch/offline), while subscriptions keep the view live.
        Production detail inspection/filtering needs an owner-approved read-only adapter. */}
    <div className="observability-queries-scroll" inert={readOnly}>
      <Suspense fallback={<p role="status">{t("Loading queries…")}</p>}>
        <Panel theme="light" style={{ width: "100%" }} />
      </Suspense>
    </div>
  </section>;
}
