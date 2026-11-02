/**
 * @file The sites-home mutations `App` offers — open the create form, create, delete, cancel a
 * create. Split out of `App.hooks.ts` (which still re-exports it) with no behaviour change.
 */
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { readyNoticeStillTrue } from './site-shell-policy.js';
import { runnerInventoryBridge } from './runner-api.js';
import type { BridgeLookup } from './bridge-lookup.js';
import type { CreateSiteInput, CreatedSiteRecord, SiteRecord } from '../contracts/project.js';

export interface SiteMutationsState {
  /**
   * The created record, not just its name: the notice reports the port and template version the
   * provisioner actually produced, which is the only place those are known to be true.
   */
  lastCreated: CreatedSiteRecord | null;
  openCreateWebsite: () => void;
  handleCreate: (input: CreateSiteInput) => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
  /** Cancel's handler, not `stopCreating` directly — see `cancelCreate` below for why the two
   *  differ. */
  cancelCreate: () => void;
  /** Bumped on every deliberate exit from the create form. `App` passes it as the form's `key`,
   *  so the ONLY thing that resets the form's typed fields is this counter changing — ordinary
   *  navigation away and back must not. */
  createFormKey: number;
}

/**
 * The sites-home mutations `App` offers — open the create form, create, delete, cancel a create — plus
 * the record the last successful create produced and the counter that clears the create form.
 *
 * These lived inline in `App` on the argument that `handleCreate` needs `setProjects` from the
 * polling hook and `stopCreating` from the nav hook in the same function, so it is composition and
 * composition is what the component is for. That reasoning does not hold: needing two values from
 * two places is a reason to take them as ARGUMENTS, which is what this hook does. What it actually
 * bought was async handlers, each with a bridge-missing branch and an ordering rule, that could
 * not be exercised without mounting `App` and stubbing `window.tovuRunner`.
 *
 * `createFormKey` lives here rather than in `useSectionNav` alongside `isCreating`, for the same
 * reason `lastCreated` does: its writers are `handleCreate` and `cancelCreate`, both defined here,
 * and both need to distinguish a deliberate exit (clear the form) from `isCreating` simply going
 * false as a side effect of navigating elsewhere (do not clear it) — a distinction `useSectionNav`
 * has no way to make, since it does not know why `stopCreating` was called.
 *
 * `lastCreated` moves here with them rather than staying behind, because `handleCreate` and
 * `openCreateWebsite` are its only writers — state separated from its only writers is the split
 * this extraction exists to undo, not one to introduce.
 *
 * Every dependency arrives as an argument and nothing is closed over, so a test calls this with
 * four spies and asserts the orderings that matter: that a missing bridge throws BEFORE any state
 * is touched, that delete drops the row locally AND closes its tab, and that `openCreateWebsite`
 * clears a stale notice before the form opens rather than after.
 */
export function useProjectMutations(deps: {
  setProjects: Dispatch<SetStateAction<readonly SiteRecord[]>>;
  closeProjectTab: (id: string) => void;
  stopCreating: () => void;
  startCreating: () => void;
  projects?: readonly SiteRecord[];
}, { getBridge = runnerInventoryBridge }: { getBridge?: BridgeLookup<'createSite' | 'deleteSite'> } = {}): SiteMutationsState {
  const [lastCreated, setLastCreated] = useState<CreatedSiteRecord | null>(null);
  useEffect(() => {
    if (deps.projects && lastCreated && !readyNoticeStillTrue({ created: lastCreated, projects: deps.projects })) setLastCreated(null);
  }, [deps.projects, lastCreated]);
  // See `createFormKey` on `SiteMutationsState`. Starts at 0 and only ever goes up; the actual
  // number carries no meaning beyond "changed since the form last mounted".
  const [createFormKey, setCreateFormKey] = useState(0);

  // Clear first, open second. The notice names a specific site on a specific port; carrying the
  // previous one into a fresh form would caption the new site with the old site's facts.
  //
  // Bumping `createFormKey` here is what makes "+ Create website" mean what it says. The form
  // survives being HIDDEN — Appearance, a project tab, `desktop.navigate` — because those leave
  // `isCreating` true and the operator returns to the same instance with their typing intact.
  // But a path that ends the creation outright (`selectSection` resets `isCreating` on a TopNav
  // click) makes this button the only way back, and it should open an empty form: the operator
  // asked to create a website, not to resume one. Without this, that route would re-present a
  // stale half-filled form — including whatever was typed into the credential inputs, which no
  // longer has an owner on screen.
  const openCreateWebsite = () => {
    setLastCreated(null);
    setCreateFormKey((key) => key + 1);
    deps.startCreating();
  };

  const handleCreate = async (input: CreateSiteInput) => {
    const bridge = getBridge();
    if (bridge === undefined) {
      throw new Error('Runner desktop connection required to create a website.');
    }
    const result = await bridge.createSite(input);
    if (result === null) return; // Cancelling the picker keeps the form and its name intact.
    // The token outcome is for the notice only; the grid keeps plain records.
    const { agentPluginTokens: _tokens, ...record } = result;
    deps.setProjects((current) => [...current, record]);
    setLastCreated(result);
    deps.stopCreating();
    // A successful create is a deliberate exit exactly like Cancel: bumping the key here is what
    // remounts the form empty rather than leaving the just-submitted site's name and credential
    // sitting in fields the operator is about to open again for a second site.
    setCreateFormKey((key) => key + 1);
  };

  // Distinct from `deps.stopCreating` rather than a second name for it: Cancel is the ONE exit
  // that must also clear typed state (see `createFormKey`). Every other way the form stops being
  // visible — a project tab, Appearance, a different section — is incidental and must NOT clear
  // it, which is the entire point of keeping the form mounted instead of unmounting it on those.
  const cancelCreate = () => {
    deps.stopCreating();
    setCreateFormKey((key) => key + 1);
  };

  const handleDelete = async (id: string) => {
    const bridge = getBridge();
    if (bridge === undefined) {
      throw new Error('Runner desktop connection required to delete a website.');
    }
    await bridge.deleteSite(id);
    // Dropped locally rather than left to the 4s poll: the card the operator just confirmed
    // against would otherwise sit there looking untouched for up to four seconds. Its tab goes
    // too — a tab pointing at a deleted project has nothing left to render.
    deps.setProjects((current) => current.filter((project) => project.id !== id));
    deps.closeProjectTab(id);
  };

  return { lastCreated, openCreateWebsite, handleCreate, handleDelete, cancelCreate, createFormKey };
}
