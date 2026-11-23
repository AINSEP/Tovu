import { AllSitesTab as AllSitesTabScreen } from "@jini-ai/admin/screens/sites/AllSitesTab";
import { SiteTrashTab as SiteTrashTabScreen } from "@jini-ai/admin/screens/sites/SiteTrashTab";
import type { AllSitesPolicy, SitesCardKit, SitesListEntry, SiteTrashPolicy } from "@jini-ai/admin/screens/sites/sites-screen-ports";
import {
  SiteCard, SiteCardPin, SiteCardStatus, SiteListToolbar, useSiteCardPreview, useSiteListView,
  type SiteListController, type SiteListPrefs, type SiteListPrefsController,
} from "@jini-ai/ui/site-card";
import type { Translate } from "@jini-ai/core/text";

import type { AdminSiteListEntry, AdminSitesSnapshot } from "./api/sites-api.types";
import type { LocalSitesController } from "./hooks/use-local-sites.hooks";
import {
  resolveSiteListItems, resolveSiteSubtitle, resolveSitesEmpty, resolveSitesRowHandles, resolveTrashCardActions,
} from "@jini-ai/admin/screens/sites/sites-list-rules";
import {
  buildSiteCardMenuItems, resolveSiteCardMeta, resolveSiteCardTitle, resolveSiteCardView, resolveSiteIsDefault,
  resolveSiteRegistrationBadge, resolveSiteRunningTitle, resolveSiteStatusPill,
} from "./Sites.hooks";
import { adminSitePreviewUrl } from "@/lib/admin-http/urls";

/**
 * @file Binds the shared Sites list tabs (`@jini-ai/admin/screens/sites/*`) to this admin: the card
 * rules from `Sites.hooks.tsx` plus the shared list/trash rules from `@jini-ai/admin/screens/sites/sites-list-rules`,
 * the shared site-card kit and hooks, the preview address,
 * and the empty-state copy. Markup lives in the package; this file only chooses collaborators.
 */

type SitesListController = SiteListController<SitesListEntry>;

const ALL_SITES_POLICY: AllSitesPolicy = {
  resolveSitesEmpty, resolveSitesRowHandles, resolveSiteListItems, resolveSiteCardView, buildSiteCardMenuItems,
  resolveSiteStatusPill, resolveSiteRunningTitle, resolveSiteCardMeta, resolveSiteIsDefault, resolveSiteCardTitle,
  resolveSiteSubtitle, resolveSiteRegistrationBadge,
};
const SITE_TRASH_POLICY: SiteTrashPolicy = { resolveSiteSubtitle, resolveTrashCardActions };
const SITE_CARD_KIT: SitesCardKit<SitesListController> = { SiteCard, SiteCardPin, SiteCardStatus, SiteListToolbar };
const SITES_EMPTY_STATE = { leadKey: "A folder appears here once Tovu has created it.", newSiteHref: "/admin/sites?tab=new" };

export interface AllSitesTabProps {
  sites: AdminSiteListEntry[];
  snapshot: AdminSitesSnapshot;
  switchingEnabled: boolean;
  activatingName: string | null;
  createdName: string | null;
  createdAdminLogin?: string | null;
  createdTokens?: { names: string[]; note: string } | null;
  onActivate: (name: string) => void;
  localSites?: LocalSitesController;
  listPrefs: SiteListPrefsController;
  t: Translate;
  useSiteListViewHook?: typeof useSiteListView;
}

/** The All sites tab with this admin's rules, card kit, hooks, preview address and copy. */
export function AllSitesTab({ useSiteListViewHook = useSiteListView, ...props }: AllSitesTabProps) {
  return (
    <AllSitesTabScreen<SiteListPrefs, SitesListController>
      {...props}
      policy={ALL_SITES_POLICY}
      cardKit={SITE_CARD_KIT}
      useSiteListViewHook={useSiteListViewHook}
      useSiteCardPreviewHook={useSiteCardPreview}
      previewUrlFor={adminSitePreviewUrl}
      emptyState={SITES_EMPTY_STATE}
    />
  );
}

/** Site Trash with this admin's trash rules. */
export function SiteTrashTab(props: { snapshot: AdminSitesSnapshot; controller?: LocalSitesController; t: Translate }) {
  return <SiteTrashTabScreen {...props} policy={SITE_TRASH_POLICY} />;
}
