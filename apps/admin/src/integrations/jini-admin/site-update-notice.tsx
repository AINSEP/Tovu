import type { ReactNode } from "react";
import { SiteUpdateNotice } from "@jini-ai/devops/deploy/react/site-update-notice";
import { requestOnce } from "@/lib/admin-http/request";
import { adminKit } from "../jini-kits";
import { t as tApp } from "../../app-i18n";
import type { ReadSiteUpdateStatus, useTovuSiteUpdateStatus } from "./site-update-notice.hooks";

/**
 * @file The admin "site update available" notice: the Jini view over Tovu's kit, copy and status
 * client. Mounted only inside the authenticated shell, so login and boot screens cause no
 * release-feed traffic. Informational only: the assistant's approval card stays the one write path.
 */

/** GET the status route once; `requireJson` so a proxy page is a failure, not a status. */
export const readTovuSiteUpdateStatus: ReadSiteUpdateStatus = ({ workspaceId }, optional = {}) =>
  requestOnce({
    path: `/workspaces/${encodeURIComponent(workspaceId)}/system/site-update/status`,
    init: { method: "GET", ...(optional.signal ? { signal: optional.signal } : {}) },
  }, { requireJson: true, ...(optional.signal ? { signal: optional.signal } : {}) });

const NOTICE_KIT = { components: { Notice: adminKit.components.Notice } };

/** The injected status hook closed over this identity and the real client, in the zero-argument
 *  shape the Jini view calls once per render. @complexity O(1). */
function bindStatusHook(
  required: { statusHook: typeof useTovuSiteUpdateStatus; workspaceId: string; principalId: string },
  _optional: Record<string, never> = {},
): () => ReturnType<typeof useTovuSiteUpdateStatus> {
  const { statusHook, workspaceId, principalId } = required;
  return () => statusHook({ workspaceId, principalId, readStatus: readTovuSiteUpdateStatus });
}

/** The Jini notice bound to this principal/workspace and the admin dictionary. */
export function TovuSiteUpdateNotice(
  required: { workspaceId: string; principalId: string; locale: string; useSiteUpdateStatusHook: typeof useTovuSiteUpdateStatus },
  _optional: Record<string, never> = {},
): ReactNode {
  const { workspaceId, principalId, locale, useSiteUpdateStatusHook } = required;
  const copy = {
    updateAvailable: ({ latest, runningVersion }: { latest: string; runningVersion: string }) =>
      tApp({ locale, key: "Version {latest} of the site software is available. This site runs {runningVersion}." })
        .replace("{latest}", latest).replace("{runningVersion}", runningVersion),
    releaseNotes: tApp({ locale, key: "What changed" }),
  };
  return (
    <SiteUpdateNotice
      kit={NOTICE_KIT}
      useSiteUpdateStatusHook={bindStatusHook({ statusHook: useSiteUpdateStatusHook, workspaceId, principalId })}
      copy={copy}
    />
  );
}

/**
 * The shell's mount decision: a signed-in user whose loaded permissions include `system.read`.
 * Unknown permissions (`undefined`) mount nothing, unlike the nav, which shows everything meanwhile.
 * @complexity O(permissions).
 */
export function siteUpdateNoticeSlot(
  required: {
    user: { id: string } | null | undefined;
    effectivePermissions: readonly string[] | undefined;
    workspaceId: string;
    locale: string;
    useSiteUpdateStatusHook: typeof useTovuSiteUpdateStatus;
  },
  _optional: Record<string, never> = {},
): ReactNode {
  const { user, effectivePermissions } = required;
  if (!user || effectivePermissions === undefined || !effectivePermissions.includes("system.read")) return null;
  return <TovuSiteUpdateNotice workspaceId={required.workspaceId} principalId={user.id} locale={required.locale} useSiteUpdateStatusHook={required.useSiteUpdateStatusHook} />;
}
