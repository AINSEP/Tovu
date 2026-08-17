import { agentHandle } from "@jini-ai/agentic";

import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { navigate } from "../../lib/router";
import { TabBar, type TabBarTab } from "../../components/TabBar";
import { t } from "./security-i18n";
import { AccessTokensTab } from "./AccessTokensTab";
import { AccessTokensIcon } from "./security-visuals";
import { useWiredAccessTokens } from "./hooks/use-access-tokens.hooks";

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
 * Page shell mirrors `SourceControl.tsx`/`Deployment.tsx` exactly: `page-header` + `TabBar`, one real
 * tab today ("Access Tokens") — not padded with a disabled placeholder for a second tab nothing here
 * asks for yet (Activity Log and Roles & Permissions already have their own top-level Operations/
 * People nav entries, not sibling tabs of this page).
 */

const SECURITY_TAB_IDS = ["access-tokens"] as const;
type SecurityTabId = (typeof SECURITY_TAB_IDS)[number];

/** Falls back to the one tab for an absent or unrecognized `?tab=` value — same guard
 *  `Deployment.tsx`'s/`SourceControl.tsx`'s own `resolveActiveTabId` apply.
 *  @complexity O(1) — fixed-size id list, not caller-controlled. */
function resolveActiveTabId(tabId: string | null | undefined): SecurityTabId {
  return tabId && (SECURITY_TAB_IDS as readonly string[]).includes(tabId) ? (tabId as SecurityTabId) : "access-tokens";
}

export interface SecurityProps {
  /** The `?tab=` query value from `panels.tsx`'s `security` route. See {@link resolveActiveTabId}. */
  tabId?: string | null;
  /** DI seam for tests, threaded through to {@link AccessTokensTab} — same convention
   *  `SourceControlProps.useSourceControlCredentialsHook` follows. */
  useAccessTokensHook?: typeof useWiredAccessTokens;
}

export function Security(props: SecurityProps) {
  const locale = useAdminLocale();
  const activeTabId = resolveActiveTabId(props.tabId);

  const tabs: TabBarTab[] = [
    {
      id: "access-tokens",
      label: t(locale, "Access Tokens"),
      icon: <AccessTokensIcon size={16} />,
      handle: "security-tab-access-tokens",
      handleLabel: "Switch to the Access Tokens tab — every access token and other saved credential this install holds, in one place",
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
          label: "Security panel header — every saved access token in this install, in one place",
        })}
      >
        <div className="page-header-text">
          <p className="page-kicker">{t(locale, "Operations")}</p>
          <h1 className="page-title">{t(locale, "Security")}</h1>
          <p className="page-description">
            {t(
              locale,
              "One place to see every access token this install holds, and create, rotate, or remove one without hunting across the screens that created it."
            )}
          </p>
        </div>
      </div>
      <TabBar
        ariaLabel={t(locale, "Security")}
        tabs={tabs}
        activeId={activeTabId}
        onChange={handleTabChange}
        containerHandle="security-tab-bar"
      />
      {activeTabId === "access-tokens" ? <AccessTokensTab useAccessTokensHook={props.useAccessTokensHook} /> : null}
    </div>
  );
}
