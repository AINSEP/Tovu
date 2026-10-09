import { createPortal } from "react-dom";
import { Sidebar } from "@jini-ai/admin/react";
import type { AdminNavGroup } from "@/nav";
import { useSitesSidebarNav, type SitesSidebarNavOptions } from "@/hooks/use-sites-sidebar-nav.hooks";

/** The shared sidebar renders the row; only its visible Sites label is supplied by this adapter. */
export function SitesSidebarNav(props: { groups: readonly AdminNavGroup[]; locale: string; soonLabel?: string; options?: SitesSidebarNavOptions }) {
  const view = useSitesSidebarNav(props, props.options);
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
