import { bindSecurity } from "@jini-ai/admin/security/react/live/Security";
import { useWiredSiteKeyRecovery } from "./hooks/site-key-dependencies.hooks";
import { useRevealedKeyCopy } from "@jini-ai/admin/security/host/SiteKeyTab.hooks";
import { SecretInput } from "@jini-ai/admin/shell/components/SecretInput/SecretInput";
import { siteKeyStatusBadgeLabel } from "@jini-ai/admin/security/host/hooks/site-key-status.rules";
import { siteKeyGenerateErrorMessage } from "@jini-ai/admin/security/security-i18n";
import { navigateSecurityTab } from "@jini-ai/admin/security/host/Security.hooks";
import { PasskeySettings } from '@jini-ai/user-management/react';
import { ownerPasskeySettingsPort } from '../../lib/owner-clients';
import { TotpSettings } from "@jini-ai/user-management/react";
import { ownerMfaPort } from "../../lib/owner-clients";
import { RecoveryCodesCard } from "./RecoveryCodesCard";

import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";

import { TabBar } from "@jini-ai/ui/tab-strip";
import { tSecurity as t } from "../../lib/i18n-common";
import { AccessTokensTab } from "./AccessTokensTab";
import { SiteKeyTab } from "@jini-ai/integrations/react/site-key/SiteKeyTab";
import { AccessTokensIcon, SiteKeyIcon } from "../../integrations/jini-admin/security-visuals";
import { useWiredAccessTokens } from "./hooks/use-access-tokens.hooks";
import { useWiredOtherCredentials } from "./hooks/use-other-credentials.hooks";
import { useWiredSiteKey } from "./hooks/site-key-dependencies.hooks";
import { useWiredSecurityPermissions } from "./hooks/security-permissions-dependencies.hooks";


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
 * `OTHER_CREDENTIAL_STORES` (Tier 2: the four single-row/per-item sealed-credential stores — BYOK x2,
 * media providers, external MCP) are ALL read and
 * rendered in one flat list, filtered by one search box and one category row
 * (`AccessTokensTab.tsx`'s own header has the ruling in full: "a Cloudinary key and a GitHub token
 * are the same kind of thing"). The tier split survives only as a per-row capability difference —
 * Tier 1 keeps `[+ Add]` and multiple named rows; Tier 2 gets Replace/Remove and a deep link, never a
 * second Create — not as two separate surfaces, and there is no partial-inventory disclosure left to
 * show once every store is read.
 *
 * Page shell mirrors `SourceControl.tsx`/`Deployment.tsx` exactly: `page-header` + `TabBar`. Two
 * real tabs as of 2026-09-09 — "Access Tokens" (above) and "site key" (`SiteKeyTab.tsx`) — not
 * padded with a disabled placeholder for a THIRD tab nothing here asks for yet (Activity Log and
 * Roles & Permissions already have their own top-level Operations/People nav entries, not sibling
 * tabs of this page).
 *
 * Page renamed "Security" -> "Secrets" the same day (owner naming decision, not this agent's
 * call): the most accurate label for what's actually here — access tokens, the site key,
 * credentials — matching what hosting and git providers already call the same thing. The rename is cosmetic
 * (nav label + `<h1>` only, per `translateAdminNavLabel`'s "copy string is its own i18n key"
 * convention — `panels.tsx`'s nav entry and this file's own `t(locale, "Secrets")` calls are the
 * only two places the old "Security" literal lived); the module/file names, the route id
 * (`/admin/access-tokens`, independent of the label — see `panels.tsx`'s own comment), and every
 * internal identifier below (`SECURITY_TAB_IDS`, `security-i18n.ts`, `SecurityProps`, …) are
 * UNCHANGED — renaming those is a bigger, separate move this pass does not make.
 *
 * "site key" joined the same day: not another saved credential this page reads, but the ONE key
 * that (partially — see `SiteKeyTab.tsx`'s own header) protects every credential Access Tokens
 * lists. `admin.security.site-key.manage`-gated separately from every verb above (`features/
 * identity/site-key-permission.ts`) — a narrower trust boundary than ordinary content admin,
 * deliberately not reusing this page's existing permission checks.
 *
 * ## The site key tab is affordance-hidden, not just protected server-side (2026-09-10)
 *
 * Every site-key route already re-checks `admin.security.site-key.manage` server-side
 * (`site-key-permission.ts`'s own header) — that gate was never the gap. Until this pass, the
 * TAB itself rendered for every logged-in admin-panel user regardless of role, so an editor/viewer
 * saw a tab that would 403 on every action inside it. `useWiredSecurityPermissions` (`hooks/
 * use-security-permissions.hooks.ts`) reads the same permission client-side, UX-only
 * (`Jini packages/ui/src/features/panel-kit/helpers/permissions.ts`'s `hasPermission` — its own header states plainly this is not the security
 * boundary): the tab entry, the rendered `<SiteKeyTab />`, and a direct `?tab=site-key` link all
 * fall back to Access Tokens for a principal who does not hold it. `resolveSecurityTabId` treats a
 * still-loading permission read as "not permitted" (`hasPermission` naturally returns `false` for
 * empty/absent permissions), so the tab never flashes into view before disappearing.
 */

export const Security = bindSecurity({
  hooks: {
    useAdminLocaleHook: useAdminLocale,
    useSecurityPermissionsHook: useWiredSecurityPermissions,
    useAccessTokensHook: useWiredAccessTokens,
    useSiteKeyHook: useWiredSiteKey,
  },
  kit: { TabBar, AccessTokensIcon, SiteKeyIcon },
  deps: {
    createPanels: ({ useAccessTokensHook, useSiteKeyHook, useAdminLocaleHook }) => ({
      AccessTokens: () => <AccessTokensTab useAccessTokensHook={useAccessTokensHook} useOtherCredentialsHook={useWiredOtherCredentials} />,
      SiteKey: () => <SiteKeyTab useSiteKeyHook={useSiteKeyHook} useSiteKeyRecoveryHook={useWiredSiteKeyRecovery} useRevealedKeyCopyHook={useRevealedKeyCopy} useAdminLocaleHook={useAdminLocaleHook} kit={{ SecretInput }} copy={{
        siteKeyEnvVarName: "TOVU_SITE_KEY",
        scope: "This key protects the passwords, API keys, and other credentials you've saved in Tovu — including on your live site.",
        invalidEnv: "A key is set up for this install, but it's not in a usable format, so Tovu can't use it. Fix the value stored in the TOVU_SITE_KEY environment variable to resolve this.",
        invalidFileSuffix: "isn't in a usable format, so Tovu can't use it. It will need to be replaced by hand on the server — this tab can't do that yet.",
        siteKeyStatusBadgeLabel,
        siteKeyGenerateErrorMessage,
      }} />,
      Totp: ({ translate }) => <TotpSettings port={ownerMfaPort} translate={translate} />,
      RecoveryCodes: RecoveryCodesCard,
      Passkeys: ({ translate }) => <PasskeySettings port={ownerPasskeySettingsPort} translate={translate} />,
    }),
    copy: { t, headerHandleLabel: "Secrets panel header — every saved access token and the site key that protects them, in one place", accessTokensHandleLabel: "Switch to the Access Tokens tab — every access token and other saved credential this install holds, in one place" },
    onTabChange: ({ nextTabId }) => navigateSecurityTab({ nextTabId }),
  },
});
