import { IntegrationsTab } from "@jini-ai/ui";
import "@jini-ai/ui/settings-dialog.css";
import { agentHandle } from "@jini-ai/agentic";

import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { navigate } from "../../lib/router";
import { resolveActiveTabId } from "../../lib/resolve-active-tab-id";
import { TabBar, type TabBarTab } from "../../components/TabBar";
import { t } from "./integrations-i18n";
import { Integrations } from "./Integrations";
import { useWiredIntegrations } from "./hooks/use-integrations.hooks";

/**
 * @file The APIs & Webhooks page (`/admin/integrations`) — the two surfaces where OTHER TOOLS talk
 * to this Tovu install, under one nav row.
 *
 * ## Why these two are one page (owner call, 2026-09-10)
 *
 * The new "Integrations" nav group splits on direction of travel: `providers` is every outside
 * service Tovu CONSUMES (a credential goes out), and this page is the reverse — other tools talking
 * to Tovu. "MCP Server" is an MCP client connecting TO Tovu (inbound — Tovu exposing an API);
 * "Webhooks" is Tovu pushing OUT to a subscriber's endpoint (outbound). Both answer "how does
 * another tool talk to this install", which is why they stopped being a Settings tab and an
 * Operations row respectively.
 *
 * The MCP Server tab moved here verbatim from `features/settings/SettingsUi.tsx`'s own `mcp` tab
 * (same `IntegrationsTab` component, same `serverName`, same `agentHandle`), so the surface an
 * operator sees is unchanged — only its address is. Its own subtitle still says plainly that it is
 * showing sample output rather than a live server: `IntegrationsTab` defaults to an in-memory fake
 * port, and wiring a real `McpIntegrationsPort` to Tovu's daemon remains its own piece of work.
 * Moving it did not make it more real, and this file does not imply it did.
 *
 * ## Naming
 *
 * The nav row is "APIs & Webhooks", never "MCP" — the owner's explicit call that the protocol name
 * appears only on a TAB, where the page around it supplies the context an operator needs to know
 * what MCP is. This row's own label went through two wrong answers first: "Developer API" (shipped
 * twice), which named only the inbound half (MCP Server) and mischaracterized the outbound Webhooks
 * tab as if it were "Tovu's API" from the receiving service's point of view; and "External APIs",
 * considered and rejected as backwards — it reads as Tovu CONSUMING outside APIs, which is
 * `providers`' job, not this row's. "APIs & Webhooks" names both halves this row actually holds.
 * The panel id stays `integrations` (see `panels.tsx`'s own entry): the id is the URL
 * and the `agent-pages.ts` key, and every relabel above is a label change, not a route change.
 *
 * ## Route shape
 *
 * `?tab=` deep-linked via the shared `../../lib/resolve-active-tab-id` guard, the same idiom
 * `Security.tsx`/`Deployment.tsx`/`SourceControl.tsx`/`Database.tsx`/`Themes.tsx` use. The default
 * is the webhooks tab, NOT the new MCP one, so a bookmark on the bare `/admin/integrations` opens
 * on exactly the screen it opened on before this page existed.
 *
 * `/integrations/:subscriptionId` is unchanged and is NOT a tab: it renders `IntegrationDeliveries`
 * as its own full screen (see `panels.tsx`'s `integration-deliveries` view). It is a drill-down
 * from one webhook row, not a peer of these two tabs.
 */

/** Tab ids are independent of tab LABELS here, the same way panel ids are independent of nav labels
 *  throughout `panels.tsx`. `webhooks` names what the tab actually holds — webhook subscriptions —
 *  rather than the panel's own route id (`integrations`), which would make `?tab=integrations`
 *  inside `/integrations` read as a tautology. */
const DEVELOPER_API_TAB_IDS = ["webhooks", "mcp-server"] as const;
type DeveloperApiTabId = (typeof DEVELOPER_API_TAB_IDS)[number];

/** Falls back to the webhooks tab for an absent or unrecognized `?tab=` value — see this file's
 *  header for why the default is deliberately the pre-existing screen and not the new tab. */
function resolveDeveloperApiTabId(tabId: string | null | undefined): DeveloperApiTabId {
  return resolveActiveTabId(tabId, DEVELOPER_API_TAB_IDS, "webhooks");
}

/** Shared 16px icon frame, so a tab's glyph can be written as bare path data — same helper shape
 *  `SettingsUi.tsx` uses for its own tab icons. */
function TabIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
      {children}
    </svg>
  );
}

export interface DeveloperApiProps {
  /** The `?tab=` query value from `panels.tsx`'s `integrations` route (`URLSearchParams.get`
   *  returns `null` when the param is absent). See {@link resolveDeveloperApiTabId}. */
  tabId?: string | null;
  /** DI seam for tests, threaded through to the embedded {@link Integrations} — same convention
   *  `SecurityProps.useAccessTokensHook` follows for its own tab body. */
  useIntegrationsHook?: typeof useWiredIntegrations;
}

export function DeveloperApi(props: DeveloperApiProps) {
  const locale = useAdminLocale();
  const activeTabId = resolveDeveloperApiTabId(props.tabId);

  const tabs: TabBarTab[] = [
    {
      id: "webhooks",
      label: t(locale, "Webhooks"),
      icon: (
        <TabIcon>
          <path d="M6 6l-3 3 3 3M12 6l3 3-3 3M10 4l-2 10" />
        </TabIcon>
      ),
      handle: "developer-api-tab-webhooks",
      handleLabel: "Switch to the Webhooks tab — outbound webhooks this site sends when its content changes",
    },
    {
      id: "mcp-server",
      label: t(locale, "MCP Server"),
      icon: (
        <TabIcon>
          <path d="M4 6.5h10M4 11.5h10" />
          <circle cx="6.5" cy="6.5" r="1.5" />
          <circle cx="11.5" cy="11.5" r="1.5" />
        </TabIcon>
      ),
      handle: "developer-api-tab-mcp-server",
      handleLabel: "Switch to the MCP Server tab — connect an MCP client to this Tovu install",
    },
  ];

  function handleTabChange(nextTabId: string) {
    navigate(`/integrations?tab=${nextTabId}`, { replace: true });
  }

  return (
    <div className="page">
      <div
        className="page-header"
        {...agentHandle("developer-api-header", {
          role: "region",
          label: "APIs & Webhooks panel header — the two ways another tool can talk to this Tovu install",
        })}
      >
        <div className="page-header-text">
          <p className="page-kicker">{t(locale, "Integrations")}</p>
          <h1 className="page-title">{t(locale, "APIs & Webhooks")}</h1>
          <p className="page-description">
            {t(locale, "How other tools talk to this site — outbound webhooks, and connecting an MCP client.")}
          </p>
        </div>
      </div>
      <TabBar
        ariaLabel={t(locale, "APIs & Webhooks")}
        tabs={tabs}
        activeId={activeTabId}
        onChange={handleTabChange}
        containerHandle="developer-api-tab-bar"
      />
      {activeTabId === "webhooks" ? <Integrations useIntegrationsHook={props.useIntegrationsHook} /> : null}
      {activeTabId === "mcp-server" ? (
        // `data-theme="light"` is REQUIRED, not cosmetic — the same trap `Media.tsx`,
        // `AiAssistant.tsx` and `PlaceholderTabs.tsx` each document at their own mounts of
        // `@jini-ai/ui/settings-dialog.css` content: with no `data-theme` ancestor the stylesheet
        // falls through to its `@media (prefers-color-scheme: dark)` variant, so this tab would
        // render dark on any OS set to dark mode while the rest of the (light-only) admin shell
        // stays light. Carried over from the Settings page this tab moved off, where the pinned
        // `data-theme="light"` on the whole `settings-page` wrapper was doing the same job.
        <div className="developer-api-mcp-panel" data-theme="light">
          <IntegrationsTab serverName="tovu" agentHandle="settings-mcp-server" />
        </div>
      ) : null}
    </div>
  );
}
