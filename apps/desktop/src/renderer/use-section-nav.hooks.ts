/**
 * @file Which Runner section is showing: the section/Appearance/create-form state, agent-driven
 * navigation over the desktop bridge, and a `NavLink`'s click handler. Split out of `App.hooks.ts`
 * (which still re-exports all of it) with no behaviour change.
 */
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { runnerInventoryBridge, type BridgeLookup } from './runner-api.js';
import type { RunnerSectionId } from '../contracts/sections.js';

/**
 * `desktop.navigate` is a tool the fleet chat can actually call, so the nav is agent-movable and
 * not only user-movable. Nothing else in main pushes on this channel. It also pulls focus back
 * to the sites home tab — navigating to a Runner section while a site's admin fills the screen would
 * otherwise change something the operator cannot see.
 *
 * Takes the RAW `setActiveId`, deliberately not `useSectionNav`'s `selectSection`. Agent
 * navigation therefore does not close the Appearance page or cancel a half-filled create form the
 * way a click on the nav does. That asymmetry is pre-existing and preserved here unchanged, but it
 * is worth knowing about: with Appearance open, a `desktop.navigate` call moves `activeId` and the
 * operator sees nothing happen, because `MainArea` renders Appearance ahead of the section. Fixing
 * it means deciding what the agent is allowed to dismiss on the operator's behalf, which is a
 * product question, not a refactor.
 */
export function useRunnerNavigation(
  setActiveId: Dispatch<SetStateAction<RunnerSectionId>>,
  setActiveTab: Dispatch<SetStateAction<string | null>>,
  { getBridge = runnerInventoryBridge }: { getBridge?: BridgeLookup<'onNavigate'> } = {},
): void {
  useEffect(() => {
    const bridge = getBridge();
    return bridge?.onNavigate((section) => {
      setActiveId(section);
      setActiveTab(null);
    });
  }, [setActiveId, setActiveTab, getBridge]);
}

export interface SectionNavState {
  activeId: RunnerSectionId;
  /**
   * The raw setter, exposed only for `useRunnerNavigation`. Agent navigation deliberately moves
   * `activeId` WITHOUT running `selectSection`'s other three resets — see the note on that hook.
   */
  setActiveId: Dispatch<SetStateAction<RunnerSectionId>>;
  appearanceOpen: boolean;
  isCreating: boolean;
  selectSection: (id: RunnerSectionId) => void;
  openAppearance: () => void;
  closeAppearance: () => void;
  startCreating: () => void;
  stopCreating: () => void;
}

/**
 * Which Runner screen is showing: the current section, whether the Appearance page is layered over
 * it, and whether the create-website form has replaced the sites grid.
 *
 * These three used to be raw `useState` calls in `App`, kept there on the argument that they cross
 * sibling subtrees and are written together by coordinated callbacks. That argument is about
 * architecture and answers the wrong question — `selectSection` writes four pieces of state at
 * once, and "does moving section also cancel a half-filled create form" is exactly the kind of
 * thing worth pinning down without standing up a component tree. Owning them here makes that one
 * function the unit under test; `App` still does the wiring, it just no longer holds the setters.
 *
 * `setActiveTab` arrives as an argument rather than being owned here because tabs are a separate
 * concern with a separate hook (`useProjectTabs`) — but dropping to the sites home tab is genuinely part
 * of every section-level move, so the call belongs inside these callbacks rather than duplicated at
 * each `App` call site. That ordering constraint (tabs hook first, this one second) is why the
 * `activeId`/`appearanceOpen` half of the old `useProjectTabs` became `deriveSitesHomeView` below.
 */
export function useSectionNav(
  setActiveTab: Dispatch<SetStateAction<string | null>>,
): SectionNavState {
  const [activeId, setActiveId] = useState<RunnerSectionId>('projects');
  // TEMPORARY SCAFFOLD — this is not a real `RunnerSectionId` page, just enough state to judge
  // whether "Settings dropdown → its own page" feels right before building a real
  // Appearance/Settings screen against the contract. See `AppearancePage` in `App.tsx`.
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Moving section is a full reset of everything layered over the section's own screen: an
  // in-progress create form, the Appearance page, and any project tab all belong to where you
  // were, not where you are going.
  const selectSection = (id: RunnerSectionId) => {
    setActiveId(id);
    setIsCreating(false);
    setActiveTab(null);
    setAppearanceOpen(false);
  };

  // Appearance covers the whole content area. Dropping the active tab means closing Appearance
  // returns to the sites grid rather than to a workspace the operator has not seen for a while.
  const openAppearance = () => {
    setAppearanceOpen(true);
    setActiveTab(null);
  };

  const closeAppearance = () => setAppearanceOpen(false);
  const startCreating = () => setIsCreating(true);
  const stopCreating = () => setIsCreating(false);

  return {
    activeId,
    setActiveId,
    appearanceOpen,
    isCreating,
    selectSection,
    openAppearance,
    closeAppearance,
    startCreating,
    stopCreating,
  };
}

/**
 * `NavLink`'s `onClick`: selects its section unless the link is disabled, in which case the click
 * does nothing. `NavLink` disables through `aria-disabled` rather than the native attribute (see its
 * doc), so a disabled button still receives clicks and this guard is what makes it inert.
 *
 * @param input.disabled `NavLink`'s own optional flag; `undefined` means enabled.
 * @complexity O(1).
 */
export function navLinkClick(input: {
  disabled: boolean | undefined;
  id: RunnerSectionId;
  onSelectSection: (id: RunnerSectionId) => void;
}): () => void {
  return () => {
    if (input.disabled) return;
    input.onSelectSection(input.id);
  };
}
