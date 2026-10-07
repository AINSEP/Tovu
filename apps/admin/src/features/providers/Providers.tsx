import { I18nProvider, IntegrationsTab, SETTINGS_DIALOG_DICTIONARIES } from "@jini-ai/ui";
import "@jini-ai/ui/settings-dialog.css";
import { agentHandle } from "@jini-ai/agentic";

import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { navigate } from "../../lib/router";
import { resolveActiveTabId } from "../../lib/resolve-active-tab-id";
import { TabBar, type TabBarTab } from "../../components/TabBar";
import { ComingSoonPanel } from "../../components/ComingSoonPanel";
import { ExternalMcpSettingsPanel } from "../settings/ExternalMcpSettingsPanel";
import { AlwaysAllowPanel } from "./AlwaysAllowPanel";
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
 * External MCP was one of the Settings page's thirteen tabs, reachable only by knowing to open
 * Settings and scroll a sidebar of unrelated concerns (Instructions, Privacy, Dialog appearance,
 * About). It is not a setting in the sense the rest of that page is — it is connections to
 * third-party systems, each holding a credential, each able to fail independently of anything Tovu
 * itself does. (A Composio tab lived here too until 2026-09-27, when Composio became the `composio`
 * agent plugin, connected through External MCP like any other remote server.)
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
 * as a TAB label here, where the page around it supplies the context an operator needs.
 *
 * ## The `I18nProvider` below is load-bearing, not decoration
 *
 * `ExternalMcpSettingsPanel` and `IntegrationsTab` both resolve their own copy
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
 * drag in the six unrelated namespaces `useSettingsUi` would (see `hooks/use-providers.hooks.ts`).
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
 *  throughout `panels.tsx`. `webhooks`/`mcp-server` are carried over unchanged from
 *  `DeveloperApi.tsx`'s own `DEVELOPER_API_TAB_IDS` — see this file's header for why those two tabs
 *  are here now. Order is the owner's explicit call (2026-09-10, second pass): External MCP first,
 *  then the two absorbed tabs in their original relative order (MCP Server,
 *  Webhooks) — see {@link resolveProvidersTabId} for the default. "Always allow" (2026-09-28, owner
 *  call) sits right after External MCP: it lists that tab's servers' tools the chat approval card no
 *  longer asks about. */
const PROVIDERS_TAB_IDS = ["external-mcp", "always-allow", "mcp-server", "webhooks"] as const;
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
      id: "always-allow",
      label: t(locale, "Always allow"),
      icon: (
        <TabIcon>
          <path d="M9 2.5l5.5 2v4.2c0 3.3-2.3 5.9-5.5 6.8-3.2-.9-5.5-3.5-5.5-6.8V4.5z" />
          <path d="M6.5 9l1.8 1.8L11.5 7.5" />
        </TabIcon>
      ),
      handle: "providers-tab-always-allow",
      handleLabel: "Switch to the Always allow tab — external tools that run without asking, each with a Revoke button",
    },
    {
      // Absorbed from `DeveloperApi.tsx`'s own `mcp-server` tab (2026-09-10, second pass) — same id,
      // same label source (`integrations-i18n.tsx`'s own `t`, reused rather than re-translated), same
      // icon, same body (`IntegrationsTab`, now `ComingSoonPanel`-wrapped — see the render block
      // below).
      id: "mcp-server",
      label: tIntegrations(locale, "MCP Server"),
      // Not wired to a real McpIntegrationsPort yet (see the render block below) — the tag says so
      // from the tab strip itself, before an operator clicks in. Tab stays fully clickable; see
      // `TabBarTab.tag`'s own doc for why this isn't `disabled` instead.
      tag: tIntegrations(locale, "Soon"),
      icon: (
        <TabIcon>
          <path d="M4 6.5h10M4 11.5h10" />
          <circle cx="6.5" cy="6.5" r="1.5" />
          <circle cx="11.5" cy="11.5" r="1.5" />
        </TabIcon>
      ),
      handle: "providers-tab-mcp-server",
      handleLabel: "Switch to the MCP Server tab — connect an MCP client to this Tovu install (soon)",
    },
    {
      // Absorbed from `DeveloperApi.tsx`'s own `webhooks` tab — see the `mcp-server` tab above for
      // the shape of this move.
      id: "webhooks",
      label: tIntegrations(locale, "Webhooks"),
      // Same "Soon" tag as MCP Server (2026-09-19, owner call): firing a webhook needs an event
      // checklist that doesn't exist yet. Confirmed no saved endpoints exist to hide behind the
      // wash (owner's own screenshot: "No webhooks yet").
      tag: tIntegrations(locale, "Soon"),
      icon: (
        <TabIcon>
          <path d="M6 6l-3 3 3 3M12 6l3 3-3 3M10 4l-2 10" />
        </TabIcon>
      ),
      handle: "providers-tab-webhooks",
      handleLabel: "Switch to the Webhooks tab — outbound webhooks this site sends when its content changes (soon)",
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
          {...agentHandle({ handle: "providers-header" }, {
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
                "Outside connections in both directions — external MCP tool servers, this install's own MCP server, and outbound webhooks.",
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

        {activeTabId === "external-mcp" ? (
          // Verbatim from the Settings page's old "External MCP" tab, plus one addition
          // (2026-09-10): `showTitle={false}`. The panel's own `<h3>External MCP servers</h3>`
          // duplicated the TabBar tab above it once this became a sub-tab here rather than a
          // standalone Settings tab — see `ExternalMcpSettingsPanel.tsx`'s own `showTitle` doc for
          // why the subtitle stays regardless. `saveStatusLabel` still carries the restart notice
          // rather than "All changes saved", for the reason that tab's own comment gave: a saved
          // row is persisted but NOT live, because the admitted tool set is frozen at connect
          // (`mcp-federation/trust.ts` R5). Telling an operator their change is saved, while the
          // running assistant still cannot see the server, would be true and useless.
          <ExternalMcpSettingsPanel
            dependencies={p.externalMcp.dependencies}
            showTitle={false}
            saveStatusLabel={
              p.externalMcp.restartRequired
                ? tCapability(locale, "Saved — restart Tovu to connect")
                : tCapability(locale, "Changes apply when Tovu restarts")
            }
          />
        ) : null}

        {activeTabId === "always-allow" ? <AlwaysAllowPanel /> : null}

        {activeTabId === "mcp-server" ? (
          // `<IntegrationsTab>` with no `port` prop falls back to `createFakeMcpIntegrationsPort()`,
          // whose demo install command (`{command: "node", args: ["/path/to/cli.js", "mcp"]}`) is
          // not a real path on any install. Found 2026-09-19. First fix deleted the setup card
          // outright; the owner's follow-up call was to keep it VISIBLE (so an operator can see
          // what's coming) but genuinely inert — `ComingSoonPanel` (own file, full reasoning there)
          // is the shared wash+`inert` wrapper for that, reused below for Webhooks too. Wiring a
          // real `McpIntegrationsPort` (see `development/todos.md`'s "make the MCP Server real"
          // item) is a one-line change: drop this wrapper and pass a live `port`.
          <ComingSoonPanel
            label={tIntegrations(locale, "Coming soon")}
            note={tIntegrations(locale, "Nothing below is connected to anything yet.")}
          >
            <IntegrationsTab serverName="tovu" agentHandle="settings-mcp-server" />
          </ComingSoonPanel>
        ) : null}

        {activeTabId === "webhooks" ? (
          // Same treatment as MCP Server above (owner call, 2026-09-19): firing a webhook needs an
          // event checklist that isn't built. `Integrations` (the webhooks list) renders no
          // `page`/`page-header` of its own — see that component's own doc comment for why: it was
          // built to be a tab body under a single page shell, first `DeveloperApi.tsx`'s, now this
          // one.
          <ComingSoonPanel
            label={tIntegrations(locale, "Coming soon")}
            note={tIntegrations(locale, "Webhooks can't fire yet — nothing here is wired up.")}
          >
            <Integrations useIntegrationsHook={props.useIntegrationsHook} />
          </ComingSoonPanel>
        ) : null}
      </div>
    </I18nProvider>
  );
}
