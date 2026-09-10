import { ConnectorsBrowser, I18nProvider, IntegrationsTab, SETTINGS_DIALOG_DICTIONARIES } from "@jini-ai/ui";
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
import { Integrations } from "../integrations/Integrations";
import { useWiredIntegrations } from "../integrations/hooks/use-integrations.hooks";
import { t as tIntegrations } from "../integrations/integrations-i18n";
import { t } from "./providers-i18n";
import { useProviders } from "./hooks/use-providers.hooks";

/**
 * @file The Integrations page (`/admin/providers`) — every outside connection this install has,
 * in both directions, in one place.
 *
 * ## Why these belong together (owner call, 2026-09-10)
 *
 * Composio and External MCP were two of the Settings page's thirteen tabs, reachable only by
 * knowing to open Settings and scroll a sidebar of unrelated concerns (Instructions, Privacy,
 * Dialog appearance, About). They are not settings in the sense the rest of that page is — they are
 * connections to third-party systems, each holding a credential, each able to fail independently of
 * anything Tovu itself does.
 *
 * MCP Server and Webhooks joined this SAME screen on 2026-09-10 (second pass, owner call) — moved
 * here verbatim from `features/integrations/DeveloperApi.tsx`, which this change retires. That page
 * used to be its own nav row ("APIs & Webhooks") holding the mirror-image direction: OTHER TOOLS
 * reaching Tovu (MCP Server, an MCP client connecting IN) or Tovu reaching OUT to a subscriber
 * (Webhooks). The owner's call was that four rows under one "Add-Ons" group had grown one row too
 * many for what is really one concern — "this install's outside connections" — split only by
 * direction of travel, not by whether the connection needs its own top-level nav slot. Collapsing
 * the two rows into one, with direction expressed as tabs instead of nav rows, is what this file
 * does. `panels.tsx`'s own comment on the `providers`/`integrations` panels has the full history;
 * `DeveloperApi.tsx`'s retirement (its render logic moved here, its own file deleted) is recorded on
 * the `integrations` panel entry there, including what happens to its old bare `/admin/integrations`
 * URL.
 *
 * Media joined this screen once already (2026-09-10, first pass) and LEFT it the same day (second
 * pass) — not a Settings tab originally, but its own tab on the Media screen
 * (`features/media/Media.tsx`, `?tab=media-providers`), moved here briefly, then moved to the Media
 * screen for good as "External Providers" (owner call: media generation credentials belong beside
 * the media they generate, not beside MCP/webhook plumbing). See `features/media/Media.tsx`'s own
 * header for where it lives now — `media-provider-catalog.ts`/`media-providers-port.ts` moved WITH
 * it, into `features/media/`.
 *
 * ## Naming
 *
 * The nav row is "Integrations", never "MCP" or "Connectors" — the owner's call. "MCP" appears only
 * as a TAB label here, where the page around it supplies the context an operator needs. "Connectors"
 * was the old Settings tab label for what is really just Composio, so the tab now says the vendor's
 * name outright rather than a generic word that told an operator nothing about what they were
 * configuring.
 *
 * ## The `I18nProvider` below is load-bearing, not decoration
 *
 * `ExternalMcpSettingsPanel`, `ConnectorsBrowser` and `IntegrationsTab` all resolve their own copy
 * through `@jini-ai/ui`'s `useT()`, which reads `I18nContext` from an ANCESTOR. On the Settings page
 * that ancestor was `SettingsUi`'s own `<I18nProvider>`; on the old `/admin/integrations` page it was
 * `DeveloperApi.tsx`'s own copy of this same provider. Mounting these components here WITHOUT one
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
 *
 * `data-theme="light"` on this file's own page root (below) covers every tab body mounted under it,
 * including the MCP Server tab's `IntegrationsTab` — `DeveloperApi.tsx` needed its OWN nested
 * `data-theme="light"` wrapper around that one tab specifically because its page root had none; this
 * page's root already sets it for the whole screen, so that per-tab wrapper does not need to be
 * carried over.
 */

/** Tab ids are independent of tab LABELS, the same way panel ids are independent of nav labels
 *  throughout `panels.tsx`. `composio` names the vendor rather than the old "Connectors" wording so
 *  a deep link says what it opens. `webhooks`/`mcp-server` are carried over unchanged from
 *  `DeveloperApi.tsx`'s own `DEVELOPER_API_TAB_IDS` — see this file's header for why those two tabs
 *  are here now. Order is the owner's explicit call (2026-09-10, second pass): External MCP first,
 *  Composio second, then the two absorbed tabs in their original relative order (MCP Server,
 *  Webhooks) — see {@link resolveProvidersTabId} for the default. */
const PROVIDERS_TAB_IDS = ["external-mcp", "composio", "mcp-server", "webhooks"] as const;
type ProvidersTabId = (typeof PROVIDERS_TAB_IDS)[number];

/** Falls back to the External MCP tab (first in {@link PROVIDERS_TAB_IDS}) for an absent or
 *  unrecognized `?tab=` value — same "fall back to the first tab" convention `DeveloperApi.tsx`'s
 *  own resolver followed, delegating to the shared `../../lib/resolve-active-tab-id` guard
 *  `Security.tsx`/`Deployment.tsx`/`Database.tsx`/`Themes.tsx` all use — a stale bookmark or a typo
 *  must open on a real tab, never a blank panel. The retired `/admin/integrations` page's own
 *  redirect (`panels.tsx`'s `integrations` panel) points at `?tab=webhooks` explicitly, so that
 *  URL's pre-merge default screen is preserved regardless of what this function's own default is. */
function resolveProvidersTabId(tabId: string | null | undefined): ProvidersTabId {
  return resolveActiveTabId(tabId, PROVIDERS_TAB_IDS, "external-mcp");
}

/** Shared 16px icon frame, so a tab's glyph can be written as bare path data — same helper shape
 *  `SettingsUi.tsx` and `DeveloperApi.tsx` both used for their own tab icons. */
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
  /** DI seam for the Webhooks tab's own list/create/delete state — carried over from
   *  `DeveloperApiProps.useIntegrationsHook`, same convention. Threaded straight through to
   *  `Integrations` below; this component has no reason to see its return value itself. */
  useIntegrationsHook?: typeof useWiredIntegrations;
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
      // Absorbed from `DeveloperApi.tsx`'s own `mcp-server` tab (2026-09-10, second pass) — same id,
      // same label source (`integrations-i18n.tsx`'s own `t`, reused rather than re-translated), same
      // icon, same body (`IntegrationsTab`). Only the address and its position in a four-tab row
      // changed.
      id: "mcp-server",
      label: tIntegrations(locale, "MCP Server"),
      icon: (
        <TabIcon>
          <path d="M4 6.5h10M4 11.5h10" />
          <circle cx="6.5" cy="6.5" r="1.5" />
          <circle cx="11.5" cy="11.5" r="1.5" />
        </TabIcon>
      ),
      handle: "providers-tab-mcp-server",
      handleLabel: "Switch to the MCP Server tab — connect an MCP client to this Tovu install",
    },
    {
      // Absorbed from `DeveloperApi.tsx`'s own `webhooks` tab — see the `mcp-server` tab above for
      // the shape of this move.
      id: "webhooks",
      label: tIntegrations(locale, "Webhooks"),
      icon: (
        <TabIcon>
          <path d="M6 6l-3 3 3 3M12 6l3 3-3 3M10 4l-2 10" />
        </TabIcon>
      ),
      handle: "providers-tab-webhooks",
      handleLabel: "Switch to the Webhooks tab — outbound webhooks this site sends when its content changes",
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
          shell stays light. Now covers the MCP Server tab too (see this file's header) — one
          ancestor for every themed tab body on this page. */}
      <div className="page providers-page" data-theme="light">
        <div
          className="page-header"
          {...agentHandle("providers-header", {
            role: "region",
            label: "Integrations panel header — this install's outside connections in both directions: services it connects out to, and tools that connect in",
          })}
        >
          <div className="page-header-text">
            <p className="page-kicker">{t(locale, "Add-Ons")}</p>
            <h1 className="page-title">{t(locale, "Integrations")}</h1>
            <p className="page-description">
              {t(
                locale,
                "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.",
              )}
            </p>
          </div>
        </div>
        <TabBar
          ariaLabel={t(locale, "Integrations")}
          tabs={tabs}
          activeId={activeTabId}
          onChange={handleTabChange}
          containerHandle="providers-tab-bar"
        />

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

        {activeTabId === "mcp-server" ? (
          // Verbatim from `DeveloperApi.tsx`'s own "MCP Server" tab, itself verbatim from the
          // Settings page's old `mcp` tab before that — same `IntegrationsTab` component, same
          // `serverName`, same `agentHandle`. Its own subtitle still says plainly that it is showing
          // sample output rather than a live server: `IntegrationsTab` defaults to an in-memory fake
          // port, and wiring a real `McpIntegrationsPort` to Tovu's daemon remains its own piece of
          // work. Moving it (twice, now) did not make it more real, and this file does not imply it
          // did.
          <IntegrationsTab serverName="tovu" agentHandle="settings-mcp-server" />
        ) : null}

        {activeTabId === "webhooks" ? (
          // `Integrations` (the webhooks list) renders no `page`/`page-header` of its own — see that
          // component's own doc comment for why: it was built to be a tab body under a single page
          // shell, first `DeveloperApi.tsx`'s, now this one.
          <Integrations useIntegrationsHook={props.useIntegrationsHook} />
        ) : null}
      </div>
    </I18nProvider>
  );
}
