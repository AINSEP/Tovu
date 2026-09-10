import { ConnectorsBrowser, I18nProvider, MediaProvidersTab, SETTINGS_DIALOG_DICTIONARIES } from "@jini-ai/ui";
import "@jini-ai/ui/settings-dialog.css";
import { agentHandle } from "@jini-ai/agentic";

import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { navigate } from "../../lib/router";
import { resolveActiveTabId } from "../../lib/resolve-active-tab-id";
import { TabBar, type TabBarTab } from "../../components/TabBar";
import { ComposioKeyField } from "../settings/ComposioKeyField";
import { ExternalMcpSettingsPanel } from "../settings/ExternalMcpSettingsPanel";
import { connectorsDependencies } from "../settings/connectors-port";
import { t as tCapability } from "../settings/settings-capabilities-i18n";
import { t } from "./providers-i18n";
import { useProviders } from "./hooks/use-providers.hooks";
import { MEDIA_PROVIDER_CATALOG, PINNED_MEDIA_PROVIDER_IDS } from "./media-provider-catalog";
import { mediaProvidersPort } from "./media-providers-port";

/**
 * @file The Providers page (`/admin/providers`) — every outside service this install CONSUMES,
 * each one configured with a credential, in one place.
 *
 * ## Why these belong together (owner call, 2026-09-10)
 *
 * Composio and External MCP were two of the Settings page's thirteen tabs, reachable only by
 * knowing to open Settings and scroll a sidebar of unrelated concerns (Instructions, Privacy,
 * Dialog appearance, About). They are not settings in the sense the rest of that page is — they are
 * connections to third-party systems, each holding a credential, each able to fail independently of
 * anything Tovu itself does. That is one job, and it is the mirror image of `DeveloperApi.tsx`'s:
 * this page is Tovu reaching OUT, that one is other tools reaching IN. The new "Integrations" nav
 * group holds both directions, which is what makes the pair legible as a group at all.
 *
 * Media joined the same day from a different origin: not a Settings tab, but its own tab on the
 * Media screen (`features/media/Media.tsx`, `?tab=media-providers`) — a REAL, persisted surface
 * (`media_provider_credentials`, not a fake), unlike Connectors/External MCP which were genuinely
 * inert on Settings before this move. It belongs here for the same reason Composio and External MCP
 * do — a credentialed connection to an outside service — even though it never lived on Settings.
 * `media-provider-catalog.ts`/`media-providers-port.ts` moved here verbatim from `features/media/`;
 * see those files' own headers for why the catalog is keyed off the generation engine's spellings,
 * not `@jini-ai/ui`'s sample one.
 *
 * ## Naming
 *
 * The nav row is "Providers", never "MCP" or "Connectors" — the owner's call. "MCP" appears only as
 * a TAB label here, where the page around it supplies the context an operator needs. "Connectors"
 * was the old Settings tab label for what is really just Composio, so the tab now says the vendor's
 * name outright rather than a generic word that told an operator nothing about what they were
 * configuring.
 *
 * ## The `I18nProvider` below is load-bearing, not decoration
 *
 * `ExternalMcpSettingsPanel` and `ConnectorsBrowser` both resolve their own copy through
 * `@jini-ai/ui`'s `useT()`, which reads `I18nContext` from an ANCESTOR. On the Settings page that
 * ancestor was `SettingsUi`'s own `<I18nProvider>`. Mounting these components here WITHOUT one
 * would not throw and would not warn — `useI18n` falls through to `PASSTHROUGH_CONTEXT`, so every
 * string silently renders its raw English key and the regression is invisible in every non-English
 * locale until an operator reports it. Hence the provider, fed the same dictionaries and the same
 * `core.language.locale` value the Settings page fed it.
 *
 * `initialLocale` comes from `useAdminLocale()` rather than a `useSettingsSlice` mount: it reads
 * the same `core.language.locale` key, re-fetches on the same settings-refresh bus, and does not
 * drag in the five unrelated namespaces `useSettingsUi` would (see `hooks/use-providers.hooks.ts`).
 * `syncDocumentAttributes={false}` for the same reason `SettingsUi` sets it — only these tab bodies
 * are translated through this dictionary, so claiming a document-wide `<html lang>` here would
 * misinform assistive tech about the rest of the admin shell.
 */

/** Tab ids are independent of tab LABELS, the same way panel ids are independent of nav labels
 *  throughout `panels.tsx`. `composio` names the vendor rather than the old "Connectors" wording so
 *  a deep link says what it opens. `media` first, matching the owner-approved tab order (Media |
 *  Composio | External MCP) and this file's own default (see {@link resolveProvidersTabId}). */
const PROVIDERS_TAB_IDS = ["media", "composio", "external-mcp"] as const;
type ProvidersTabId = (typeof PROVIDERS_TAB_IDS)[number];

/** Falls back to the Media tab (first in {@link PROVIDERS_TAB_IDS}) for an absent or unrecognized
 *  `?tab=` value — same "fall back to the first tab" convention `DeveloperApi.tsx`'s own resolver
 *  follows, delegating to the shared `../../lib/resolve-active-tab-id` guard `Security.tsx`/
 *  `Deployment.tsx`/`Database.tsx`/`Themes.tsx` all use — a stale bookmark or a typo must open on a
 *  real tab, never a blank panel. */
function resolveProvidersTabId(tabId: string | null | undefined): ProvidersTabId {
  return resolveActiveTabId(tabId, PROVIDERS_TAB_IDS, "media");
}

/** Shared 16px icon frame, so a tab's glyph can be written as bare path data — same helper shape
 *  `SettingsUi.tsx` and `DeveloperApi.tsx` both use for their own tab icons. */
function TabIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
      {children}
    </svg>
  );
}

export interface ProvidersProps {
  /** The `?tab=` query value from `panels.tsx`'s `providers` route (`URLSearchParams.get` returns
   *  `null` when the param is absent). See {@link resolveProvidersTabId}. */
  tabId?: string | null;
  /** DI seam for tests — same convention `SecurityProps.useAccessTokensHook` follows. */
  useProvidersHook?: typeof useProviders;
}

/** Resolved separately rather than as a default parameter value inside {@link Providers}'s own body
 *  — same complexity-ceiling idiom `SettingsUi.tsx`'s own resolver group uses: ESLint counts a
 *  default inside a function's OWN body as one of that function's branches, a call out to a
 *  separately-scoped resolver does not. */
function resolveProvidersHook(override: typeof useProviders | undefined): typeof useProviders {
  return override ?? useProviders;
}

export function Providers(props: ProvidersProps) {
  const locale = useAdminLocale();
  const useProvidersHook = resolveProvidersHook(props.useProvidersHook);
  const p = useProvidersHook();
  const activeTabId = resolveProvidersTabId(props.tabId);

  const tabs: TabBarTab[] = [
    {
      id: "media",
      label: t(locale, "Media"),
      // A cloud — the generic shape of "hosted elsewhere". No vendor mark: this admin draws zero
      // brand logos (see `source-control-visuals.tsx`'s header), and this tab lists several.
      icon: (
        <TabIcon>
          <path d="M5.5 13.5h7a2.75 2.75 0 0 0 .35-5.48A3.75 3.75 0 0 0 5.9 6.3 2.75 2.75 0 0 0 5.5 13.5z" />
        </TabIcon>
      ),
      handle: "providers-tab-media",
      handleLabel: "Switch to the Media tab — API keys for image, video, and audio generation providers",
    },
    {
      id: "composio",
      // The vendor's own name, not the old Settings tab's generic "Connectors" label — see this
      // file's header. No dictionary entry for it in `providers-i18n.ts`, deliberately: it is a
      // brand, so every locale falling through to the English string is the correct rendering.
      label: t(locale, "Composio"),
      icon: (
        <TabIcon>
          <path d="M4 5h10M4 9h10M4 13h10" />
          <circle cx="7" cy="5" r="1.4" />
          <circle cx="11" cy="9" r="1.4" />
          <circle cx="6" cy="13" r="1.4" />
        </TabIcon>
      ),
      handle: "providers-tab-composio",
      handleLabel: "Switch to the Composio tab — third-party accounts and APIs connected through Composio",
    },
    {
      id: "external-mcp",
      label: t(locale, "External MCP"),
      icon: (
        <TabIcon>
          <path d="M6 3v4M12 3v4M4.5 7h9v2a4.5 4.5 0 0 1-9 0z" />
          <path d="M9 13.5V16" />
        </TabIcon>
      ),
      handle: "providers-tab-external-mcp",
      handleLabel: "Switch to the External MCP tab — MCP tool servers this install connects out to",
    },
  ];

  function handleTabChange(nextTabId: string) {
    navigate(`/providers?tab=${nextTabId}`, { replace: true });
  }

  return (
    <I18nProvider
      initialLocale={locale}
      dictionaries={SETTINGS_DIALOG_DICTIONARIES}
      fallbackLocale="en"
      syncDocumentAttributes={false}
    >
      {/* `data-theme="light"` is REQUIRED, not cosmetic — the same trap `Media.tsx`,
          `AiAssistant.tsx` and `PlaceholderTabs.tsx` each document at their own mounts of
          `@jini-ai/ui/settings-dialog.css` content: with no `data-theme` ancestor the stylesheet
          falls through to its `@media (prefers-color-scheme: dark)` variant, so these tab bodies
          would render dark on any OS set to dark mode while the rest of the (light-only) admin
          shell stays light. Carried over from the Settings page these tabs moved off, whose whole
          `settings-page` wrapper is pinned the same way for the same reason. */}
      <div className="page providers-page" data-theme="light">
        <div
          className="page-header"
          {...agentHandle("providers-header", {
            role: "region",
            label: "Providers panel header — every outside service this site connects to, and the credential each one needs",
          })}
        >
          <div className="page-header-text">
            <p className="page-kicker">{t(locale, "Integrations")}</p>
            <h1 className="page-title">{t(locale, "Providers")}</h1>
            <p className="page-description">
              {t(
                locale,
                "Outside services this site connects to — media generation, third-party accounts, and external MCP tool servers.",
              )}
            </p>
          </div>
        </div>
        <TabBar
          ariaLabel={t(locale, "Providers")}
          tabs={tabs}
          activeId={activeTabId}
          onChange={handleTabChange}
          containerHandle="providers-tab-bar"
        />

        {activeTabId === "media" ? (
          // `media-providers-panel` is the class `styles.css`'s "Media providers tab: neutralize
          // Jini's warm 'paper' tokens" section overrides `--jini-bg-panel`/`--jini-bg-elevated` on
          // (owner report: the cards and their fields sat on a warm cream tone, not this admin's own
          // neutral white) — kept byte-for-byte from `Media.tsx`'s own mount so that CSS, a pure
          // class-name selector, keeps applying unmoved. `MediaProvidersTab`/the catalog/the port are
          // all verbatim from `Media.tsx`'s old "Media providers" tab too — same real backend
          // (`media_provider_credentials`), only the address changed.
          <div className="media-providers-panel" data-theme="light">
            <MediaProvidersTab port={mediaProvidersPort} catalog={MEDIA_PROVIDER_CATALOG} pinnedProviderIds={PINNED_MEDIA_PROVIDER_IDS} />
          </div>
        ) : null}

        {activeTabId === "composio" ? (
          <>
            {/* Both mounts are verbatim from the Settings page's old "Connectors" tab — same
                component, same real `ConnectorsPort` over the `/connectors` admin routes, same
                `unlocked` gate driven by whether a Composio API key is actually saved, same
                `agentHandle`. Only the address changed. */}
            <ComposioKeyField composio={p.composio} />
            <ConnectorsBrowser
              unlocked={p.composio.unlocked}
              dependencies={connectorsDependencies}
              catalogRefreshKey={p.composio.catalogRefreshKey}
              gate={{
                title: "Add your Composio API key to continue",
                body: "Paste your key above to load available integrations.",
                ctaLabel: "Get API Key",
                ctaHref: "https://app.composio.dev",
              }}
              agentHandle="settings-connectors"
            />
          </>
        ) : null}

        {activeTabId === "external-mcp" ? (
          // Verbatim from the Settings page's old "External MCP" tab. `saveStatusLabel` still
          // carries the restart notice rather than "All changes saved", for the reason that tab's
          // own comment gave: a saved row is persisted but NOT live, because the admitted tool set
          // is frozen at connect (`mcp-federation/trust.ts` R5). Telling an operator their change
          // is saved, while the running assistant still cannot see the server, would be true and
          // useless.
          <ExternalMcpSettingsPanel
            dependencies={p.externalMcp.dependencies}
            saveStatusLabel={
              p.externalMcp.restartRequired
                ? tCapability(locale, "Saved — restart Tovu to connect")
                : tCapability(locale, "Changes apply when Tovu restarts")
            }
          />
        ) : null}
      </div>
    </I18nProvider>
  );
}
