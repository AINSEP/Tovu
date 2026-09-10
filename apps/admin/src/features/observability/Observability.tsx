import { I18nProvider, SETTINGS_DIALOG_DICTIONARIES, SettingsDialogShell, type SettingsDialogTab } from "@jini-ai/ui";
import "@jini-ai/ui/settings-dialog.css";
import { agentHandle } from "@jini-ai/agentic";

import { GaugeIcon, PulseIcon } from "./observability-visuals";
import { useWiredObservabilityStatus, type ObservabilityStatusController } from "./hooks/use-observability-status.hooks";
import type { Translate } from "@/lib/dictionary-translator";

const OTEL_DOCS_URL = "https://opentelemetry.io/docs/";

/**
 * Overview tab: explains OpenTelemetry in plain language for an operator who does not already
 * know what it is, then reports this install's REAL current state — read from
 * `platform/observability/config.ts` via `GET .../system/observability-status`
 * (`useWiredObservabilityStatus`), never a mock. See that hook's own header for the one GET this
 * makes on mount.
 */
function OverviewPanel({ controller }: { controller: ObservabilityStatusController }) {
  const { status, error, t } = controller;

  return (
    <section className="jini-settings-section" aria-label={t("Observability Overview")}>
      <p className="observability-lede">
        {t(
          "OpenTelemetry is the open standard Tovu uses to report what the server is doing — how long requests take, and which ones fail — to a monitoring tool you run or subscribe to. Tovu never sends this data anywhere on its own.",
        )}
      </p>
      <p className="observability-lede">
        {t(
          'A "provider" is that monitoring tool — for example Datadog or Grafana. Turning this on means pointing Tovu at the provider’s own collector address (and, for most providers, a key) so it knows where to send what it records. Until that is configured, Tovu keeps recording nothing, at no cost.',
        )}
      </p>

      {error ? (
        <p className="observability-alert" role="alert">
          {error}
        </p>
      ) : null}
      {!status && !error ? <p role="status">{t("Checking current status…")}</p> : null}

      {status ? (
        <div
          className={`observability-status-card observability-status-card--${status.enabled ? "on" : "off"}`}
          role="status"
          {...agentHandle("observability-status", { role: "status", label: "Current OpenTelemetry status" })}
        >
          <span className="observability-status-dot" aria-hidden="true" />
          <div>
            <p className="observability-status-headline">
              {status.enabled
                ? t("OpenTelemetry is ON — traces are being recorded.")
                : t("OpenTelemetry is OFF (the default) — nothing is being recorded.")}
            </p>
            <p className="jini-field-hint">
              {status.enabled
                ? `${t("Reporting under the service name")} "${status.serviceName}".`
                : t(
                    "No provider endpoint is configured on this server, so Tovu is running its safe, no-op default: requests are handled normally and nothing is sent anywhere.",
                  )}
            </p>
          </div>
        </div>
      ) : null}

      <p className="jini-field-hint">
        <a
          href={OTEL_DOCS_URL}
          target="_blank"
          rel="noreferrer"
          {...agentHandle("observability-otel-docs-link", { role: "link", label: "Open the OpenTelemetry documentation" })}
        >
          {t("Read the OpenTelemetry documentation")}
        </a>
      </p>
    </section>
  );
}

/**
 * Providers tab: an honest not-yet-built state, explicitly modeled on `AgentPlugins.tsx`'s own
 * `MarketplacePanel` (same designed-empty-state tone, same reasoning) — see that component's own
 * header for why a plain "not built yet" beats a functional-looking form that does nothing.
 *
 * Deliberately no input, no "Connect" button, and no saved-credential list: nothing in Tovu can
 * fetch, save, or send to a Datadog/Grafana endpoint yet (owner's own words, `development/
 * todos.md` 2026-09-09: "let's set that up with another subagent"). Building the appearance of
 * that feature here would be worse than stating plainly that it isn't built.
 */
function ProvidersPanel({ t }: { t: Translate }) {
  return (
    <section className="jini-settings-section" aria-label={t("Observability Providers")}>
      <div className="observability-providers-empty" role="note">
        <span className="observability-providers-glyph">
          <GaugeIcon size={28} />
        </span>
        <h3>{t("No provider connected yet")}</h3>
        <p>{t("Datadog and Grafana are planned. Tovu does not fetch, configure, or send data to any provider yet.")}</p>
        <p className="jini-field-hint">{t("Until then, the Overview tab reports whether OpenTelemetry itself is on or off.")}</p>
      </div>
    </section>
  );
}

export interface ObservabilityProps {
  /** Dependency injection seam for tests — the same convention `AgentPluginsProps.useAgentPluginsHook`
   *  uses. Defaulted to the real hook, so production callers pass nothing and behave exactly as
   *  before. */
  useObservabilityStatusHook?: typeof useWiredObservabilityStatus;
}

/**
 * Operations > Observability. A `SettingsDialogShell`-shaped page with two tabs: Overview (real,
 * API-backed OpenTelemetry status) and Providers (an honest not-yet-built placeholder) — see
 * `development/todos.md`'s "Observability admin page" entry (owner, 2026-09-09) for the scope this
 * first pass deliberately stops at.
 */
export function Observability({ useObservabilityStatusHook = useWiredObservabilityStatus }: ObservabilityProps = {}) {
  const controller = useObservabilityStatusHook();
  const { t, locale } = controller;

  const tabs: SettingsDialogTab[] = [
    {
      id: "overview",
      label: t("Overview"),
      icon: <PulseIcon />,
      title: t("Observability"),
      subtitle: t("What OpenTelemetry is, and whether it's on right now."),
      panel: <OverviewPanel controller={controller} />,
    },
    {
      id: "providers",
      label: t("Providers"),
      icon: <GaugeIcon />,
      title: t("Observability"),
      subtitle: t("Where a Datadog/Grafana connection will live."),
      panel: <ProvidersPanel t={t} />,
    },
  ];

  return (
    <I18nProvider initialLocale={locale} dictionaries={SETTINGS_DIALOG_DICTIONARIES} fallbackLocale="en" syncDocumentAttributes={false}>
      <div className="settings-ui-section observability-section" data-theme="light">
        <SettingsDialogShell
          tabs={tabs}
          presentation="inline"
          className="jini-tabbed-dialog--inline"
          fullscreenEnabled={false}
          labels={{ kicker: t("Operations") }}
        />
      </div>
    </I18nProvider>
  );
}
