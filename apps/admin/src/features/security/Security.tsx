import { agentHandle } from "@jini-ai/agentic";

import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { navigate } from "../../lib/router";
import { resolveActiveTabId } from "../../lib/resolve-active-tab-id";
import { TabBar, type TabBarTab } from "../../components/TabBar";
import { t } from "./security-i18n";
import { AccessTokensTab } from "./AccessTokensTab";
import { SiteTokenTab } from "./SiteTokenTab";
import { AccessTokensIcon, SiteTokenIcon } from "./security-visuals";
import { useWiredAccessTokens } from "./hooks/use-access-tokens.hooks";
import { useWiredSiteToken } from "./hooks/use-site-token.hooks";

/**
 * @file The Security page (`/admin/access-tokens`) — a consolidation, not a new store: every token
 * here already lives in `publish_credential_sets` (Static Site tab) or
 * `source_control_credential_sets` (Source Control page); this page is one central place to see,
 * name, replace, and remove them, per `development/todos.md:1208`'s original spec and its
 * 2026-08-16 supersession recorded in `ADS-memory/reports/continuity/2026-08-16-session-6-handoff.md`.
 *
 * ## Create lives HERE too — the third and final word on a decision that moved twice
 *
 * The 2026-08-15 spec: Security is READ + REMOVE only, Create stays on the feature flow. The
 * 2026-08-16 session-6 handoff superseded that once: Replace/rotate joins Security too (the owner's
 * rotation argument — a revoked token needs ONE place to put the new one). The owner then superseded
 * it a SECOND time, same session: Create belongs here as well, in their own words, "you have to
 * create the access token and paste it and then save it, or you can replace it, or you can just
 * remove it so other people who are logging in don't have it."
 *
 * This is NOT a contradiction of the original "two entry points is the which-row-is-authoritative
 * bug" objection, once what "Create" means on each screen is made precise (`AccessTokensTab.tsx`'s
 * own header works through this in full): Static Site/Source Control each create exactly ONE thing
 * per provider — the DEFAULT connection, via a flat always-visible row with no label picker. This
 * page's own Create is a DIFFERENT capability neither of those forms exposes at all: a SECOND,
 * THIRD, differently-named token for a provider that already has one (a 30-day test token alongside
 * a production token — the owner's own example). There is exactly one place that capability can live
 * — it does not duplicate what Static Site/Source Control already do, it is the thing neither of
 * them does. Static Site and Source Control are UNCHANGED by this page's existence: same one-row
 * accordion, same `isDefault` row they always wrote and still write, still reachable and functional
 * throughout — this page's writes go through the exact same two HTTP endpoints those pages already
 * use (`hooks/access-tokens-dependencies.hooks.ts`), never a new one.
 *
 * ## Scope: all eight credential stores, one list — the 2026-08-16 owner ruling
 *
 * `rules.ts`'s `ACCESS_TOKEN_PROVIDERS` (Tier 1: `publish_credential_sets`, `source_control_
 * credential_sets` — both label + `isDefault`, both full CRUD, multi-row per provider) and
 * `OTHER_CREDENTIAL_STORES` (Tier 2: the six single-row/per-item sealed-credential stores — BYOK x2,
 * media providers, Composio project key + connector accounts, external MCP) are ALL read and
 * rendered in one flat list, filtered by one search box and one category row
 * (`AccessTokensTab.tsx`'s own header has the ruling in full: "a Cloudinary key and a GitHub token
 * are the same kind of thing"). The tier split survives only as a per-row capability difference —
 * Tier 1 keeps `[+ Add]` and multiple named rows; Tier 2 gets Replace/Remove and a deep link, never a
 * second Create — not as two separate surfaces, and there is no partial-inventory disclosure left to
 * show once every store is read.
 *
 * Page shell mirrors `SourceControl.tsx`/`Deployment.tsx` exactly: `page-header` + `TabBar`. Two
 * real tabs as of 2026-09-09 — "Access Tokens" (above) and "Site Token" (`SiteTokenTab.tsx`) — not
 * padded with a disabled placeholder for a THIRD tab nothing here asks for yet (Activity Log and
 * Roles & Permissions already have their own top-level Operations/People nav entries, not sibling
 * tabs of this page).
 *
 * Page renamed "Security" -> "Secrets" the same day (owner naming decision, not this agent's
 * call): the most accurate label for what's actually here — access tokens, the site/root key,
 * credentials — matching what Fly/GitHub already call the same thing. The rename is cosmetic
 * (nav label + `<h1>` only, per `translateAdminNavLabel`'s "copy string is its own i18n key"
 * convention — `panels.tsx`'s nav entry and this file's own `t(locale, "Secrets")` calls are the
 * only two places the old "Security" literal lived); the module/file names, the route id
 * (`/admin/access-tokens`, independent of the label — see `panels.tsx`'s own comment), and every
 * internal identifier below (`SECURITY_TAB_IDS`, `security-i18n.ts`, `SecurityProps`, …) are
 * UNCHANGED — renaming those is a bigger, separate move this pass does not make.
 *
 * "Site Token" joined the same day: not another saved credential this page reads, but the ONE key
 * that (partially — see `SiteTokenTab.tsx`'s own header) protects every credential Access Tokens
 * lists. `admin.security.tokens.manage`-gated separately from every verb above (`features/
 * identity/site-token-permission.ts`) — a narrower trust boundary than ordinary content admin,
 * deliberately not reusing this page's existing permission checks.
 */

const SECURITY_TAB_IDS = ["access-tokens", "site-token"] as const;
type SecurityTabId = (typeof SECURITY_TAB_IDS)[number];

/** Falls back to the Access Tokens tab for an absent or unrecognized `?tab=` value. Delegates to
 *  the shared `../../lib/resolve-active-tab-id` guard `Deployment.tsx`/`SourceControl.tsx`/
 *  `Database.tsx`/`Themes.tsx` all use. */
function resolveSecurityTabId(tabId: string | null | undefined): SecurityTabId {
  return resolveActiveTabId(tabId, SECURITY_TAB_IDS, "access-tokens");
}

export interface SecurityProps {
  /** The `?tab=` query value from `panels.tsx`'s `security` route. See {@link resolveSecurityTabId}. */
  tabId?: string | null;
  /** DI seam for tests, threaded through to {@link AccessTokensTab} — same convention
   *  `SourceControlProps.useSourceControlCredentialsHook` follows. */
  useAccessTokensHook?: typeof useWiredAccessTokens;
  /** DI seam for tests, threaded through to {@link SiteTokenTab} — same convention. */
  useSiteTokenHook?: typeof useWiredSiteToken;
}

export function Security(props: SecurityProps) {
  const locale = useAdminLocale();
  const activeTabId = resolveSecurityTabId(props.tabId);

  const tabs: TabBarTab[] = [
    {
      id: "access-tokens",
      label: t(locale, "Access Tokens"),
      icon: <AccessTokensIcon size={16} />,
      handle: "security-tab-access-tokens",
      handleLabel: "Switch to the Access Tokens tab — every access token and other saved credential this install holds, in one place",
    },
    {
      id: "site-token",
      label: t(locale, "Site Token"),
      icon: <SiteTokenIcon size={16} />,
      handle: "security-tab-site-token",
      handleLabel: "Switch to the Site Token tab — view and generate the root key file that decrypts webhook signing and newsletter tokens on a local install",
    },
  ];

  function handleTabChange(nextTabId: string) {
    navigate(`/access-tokens?tab=${nextTabId}`, { replace: true });
  }

  return (
    <div className="page">
      <div
        className="page-header"
        {...agentHandle("security-header", {
          role: "region",
          label: "Secrets panel header — every saved access token and the root key that protects them, in one place",
        })}
      >
        <div className="page-header-text">
          <p className="page-kicker">{t(locale, "Operations")}</p>
          <h1 className="page-title">{t(locale, "Secrets")}</h1>
          <p className="page-description">
            {t(
              locale,
              "One place to see every access token this install holds, and create, rotate, or remove one without hunting across the screens that created it."
            )}
          </p>
        </div>
      </div>
      <TabBar
        ariaLabel={t(locale, "Secrets")}
        tabs={tabs}
        activeId={activeTabId}
        onChange={handleTabChange}
        containerHandle="security-tab-bar"
      />
      {activeTabId === "access-tokens" ? <AccessTokensTab useAccessTokensHook={props.useAccessTokensHook} /> : null}
      {activeTabId === "site-token" ? <SiteTokenTab useSiteTokenHook={props.useSiteTokenHook} /> : null}
    </div>
  );
}
