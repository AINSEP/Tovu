import { createPortal } from "react-dom";
import { Sidebar, useSidebar } from "@jini-ai/admin/react";
import type { AdminNavGroup } from "@jini-ai/core/contracts/site/nav";
import type { SitesPort } from "@jini-ai/core/contracts/site/hooks-sites-port-hooks";
import { useSitesSidebarNav, type SitesSidebarNavOptions } from "@jini-ai/admin/shell/hooks/use-sites-sidebar-nav.hooks";
import { translateAdminNavLabel } from "@/lib/admin-nav-i18n";
import { defaultSitesPort } from "@/features/sites/hooks/sites-dependencies.hooks";
import { useSitesSnapshot } from "@/features/sites/hooks/use-sites-snapshot.hooks";

/** The shared sidebar renders the row; only its visible Sites label is supplied by this adapter.
 *  The Jini hook takes every host collaborator as a required field; this host adapter binds them. */
export function SitesSidebarNav({
  useSitesSidebarNavHook = useSitesSidebarNav, ...props }: { groups: readonly AdminNavGroup[]; locale: string; soonLabel?: string;
  options?: SitesSidebarNavOptions & { port?: Pick<SitesPort, "listSites"> };
  useSitesSidebarNavHook?: typeof useSitesSidebarNav; }) {
  const { port = defaultSitesPort, ...options } = props.options ?? {};
  const view = useSitesSidebarNavHook(
    { groups: props.groups, locale: props.locale, port, useSitesSnapshot, translateNavLabel: translateAdminNavLabel, useSidebar },
    options,
  );
  return <>
    <Sidebar.Nav groups={view.groups} soonLabel={props.soonLabel} />
    {view.target && view.siteName ? createPortal(
      // The shared span retains the complete accessible name; this split duplicate is visual only.
      <span className="cms-sites-label" aria-hidden="true">
        <span className="cms-sites-prefix">{view.prefix}</span>
        <span className="cms-sites-name" ref={view.nameRef} title={view.title}>{view.siteName}</span>
        <span className="cms-sites-suffix">{view.suffix}</span>
      </span>, view.target,
    ) : null}
  </>;
}
