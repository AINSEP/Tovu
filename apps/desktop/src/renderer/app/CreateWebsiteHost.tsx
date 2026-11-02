import { CreateWebsiteOnboarding } from '../CreateWebsiteOnboarding.js';
import type { CreateSiteInput } from '../../contracts/project.js';

/**
 * The create-website form's permanent home. Mounted once, for the life of `App`, and never torn
 * down by navigation — hidden with the exact same CSS-only technique (`is-hidden` → `display:
 * none`, plus `aria-hidden` for anything that ignores CSS) rather than by conditionally rendering
 * `<CreateWebsiteOnboarding>` out of the tree.
 *
 * That used to be exactly backwards: `isCreating` looked like it gated the form, but `MainArea`
 * returns `<AppearancePage>` or `null` before it ever consults `isCreating`, so Settings →
 * Appearance unmounted the form regardless of that flag — silently destroying everything typed,
 * including a half-entered credential, with no confirmation. See
 * `development/notes/agent-navigation-dismissal.md` for the full trace. Keeping the form mounted
 * here and only hiding it fixes that for every incidental exit at once, human or agent-driven.
 *
 * `display: none` is what actually satisfies "hidden means unreachable": a hidden host is pulled
 * out of the accessibility tree, out of tab order, and out of reach of an Enter key pressed
 * anywhere else on the page.
 *
 * `key={createFormKey}` (`App`, sourced from `useProjectMutations`) is the deliberate-exit
 * boundary: Cancel and a successful create both bump it, which remounts this subtree fresh. That
 * is what actually empties the two uncontrolled credential inputs — they hold no React state a
 * setter could reset, so nothing short of a new DOM node clears them. Ordinary navigation away and
 * back never touches the key, so the same instance — and everything typed into it — survives.
 */
export function CreateWebsiteHost({
  hidden,
  onBack,
  onCreate,
}: {
  hidden: boolean;
  onBack: () => void;
  onCreate: (input: CreateSiteInput) => Promise<void>;
}) {
  return (
    <div className={`create-website-host ${hidden ? 'is-hidden' : ''}`} aria-hidden={hidden}>
      <CreateWebsiteOnboarding onBack={onBack} onCreate={onCreate} />
    </div>
  );
}
