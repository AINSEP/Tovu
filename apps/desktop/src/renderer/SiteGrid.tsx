/**
 * The site grid: one card per website, and each card's inline delete-confirm overlay. Split out
 * of `App.tsx` as its own module — this family has a small, self-contained props surface
 * (`projects`, `onOpen`, `onDelete`) and no dependency on anything else `App.tsx` renders, which is
 * what makes it a real ownership boundary rather than just a line-count split.
 *
 * **The dashed add-tile that used to lead this grid is gone, and it was redundant rather than
 * merely surplus.** Its `onClick` was the same zero-argument `openCreateWebsite` the header's
 * primary button already calls — the identical handler, from the identical props chain — so the two
 * controls did exactly one thing between them. Its subtitle described the CREATE path too, which
 * made it read as a third, distinct option when it was really a duplicate of one. The header row is
 * now the single place those actions live: Rescan, then add-an-existing-website, then create.
 *
 * The tile was also the de-facto empty state, so removing it alone would have left an operator with
 * no websites looking at nothing at all. `ProjectsBody` (`App.tsx`) renders an explicit empty state
 * instead — this grid is only ever asked to draw cards.
 *
 * **Every action a card carries lives in one always-visible row at the bottom of it**, not overlaid
 * on the preview image and not revealed by hover. The ⋮ and the trash used to sit on the screenshot
 * and appear on hover; an operator could not see what a card could do without pointing at it, and
 * on a touchpad or by keyboard that is a control you have to go looking for. They are toolbar
 * buttons in the info block now, beside the site's own Start/Stop.
 *
 * The three do not overlap: Start/Stop is the lifecycle, the trash is the one destructive action
 * (still behind its own confirm overlay), and ⋮ holds what is neither — Rename, and Open in
 * browser. Nothing is reachable two ways, which is the rule that keeps the row readable as it grows.
 */
import { useDeleteConfirmation, useDismissibleDropdown } from './App.hooks.js';
import { useSiteRename, renameInputKeyDown, showsInvalidNameHint } from './use-site-rename.hooks.js';
import { useSiteActions } from './use-site-actions.hooks.js';
import { powerControl, useSitePower } from './use-site-power.hooks.js';
import { useSitePreview } from './use-site-preview.hooks.js';
import { cardDeleteClick, cardOpenProps, cardOverlay, closeMenuThen, databaseLabel, deleteActionCopy, isCardOpenable, type CardOverlayMode, type DeleteActionCopy } from './SiteGrid.hooks.js';
import { STATUS_LABEL } from './site-status.js';
import type { SiteRecord } from '../contracts/project.js';
import type { SiteRenameState } from './use-site-rename.hooks.js';
import type { SiteActions } from './use-site-actions.hooks.js';
import type { SitePower } from './use-site-power.hooks.js';

/**
 * `useDeleteState` is the delete-confirm hook itself, defaulted to the real one — the function,
 * never its result. Written as `useDeleteState = useDeleteConfirmation(onDelete)` it would only
 * run when a caller omitted the prop, so hook order would vary by call site; as written it is
 * called unconditionally below and the order is fixed.
 *
 * Worth injecting here because this grid has three visually distinct states — idle, confirming,
 * and deleting-with-an-error — and only the first is reachable without driving an async delete to
 * completion. A stub renders any of them directly. `typeof useDeleteConfirmation` is the type on
 * purpose: a stub that forgets `deletingId`, or takes no `onDelete`, fails `npm run typecheck`.
 *
 * The private components below (`SiteCard`, `CardConfirmOverlay`) take no hooks of their own
 * and are not exported, so there is nothing to inject into them and no way for a test to mount
 * them directly — they are exercised through this grid, which is the boundary that owns them.
 */
export function SiteGrid({
  projects,
  onOpen,
  onDelete,
  onRenamed,
  onSiteUpdated,
  useDeleteState = useDeleteConfirmation,
  useRenameState = useSiteRename,
  useActions = useSiteActions,
  usePower = useSitePower,
}: {
  projects: readonly SiteRecord[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  /** Called with main's refreshed record after a rename, so the caller can refresh its list. */
  onRenamed?: (record: SiteRecord) => void;
  /** Called with main's refreshed record after a start or a stop, for the same reason `onRenamed`
   *  exists: the 4s poll would get there eventually, and "eventually" is up to four seconds of a
   *  stopped site still reading `Running`. See `use-site-power.hooks.ts`. */
  onSiteUpdated?: (record: SiteRecord) => void;
  useDeleteState?: typeof useDeleteConfirmation;
  useRenameState?: typeof useSiteRename;
  /** The ⋮ menu's Open-in-browser implementation. Injectable for the same reason `useDeleteState`
   *  is — see `use-site-actions.hooks.ts` on why it calls the bridge directly rather than arriving
   *  as a prop from `App.tsx`. */
  useActions?: typeof useSiteActions;
  /** The card's Start/Stop. Injectable for the same reason, and the one a test reaches for to
   *  render a mid-transition card without driving a real site's boot. */
  usePower?: typeof useSitePower;
}) {
  const { pendingId, deletingId, deleteError, requestDelete, cancelDelete, confirmDelete } =
    useDeleteState(onDelete);
  const rename = useRenameState(onRenamed);
  const actions = useActions();
  const power = usePower(onSiteUpdated);

  return (
    <div className="grid">
      {projects.map((project) => (
        <SiteCard
          key={project.id}
          project={project}
          overlay={cardOverlay(project.id, pendingId, rename.renamingId)}
          deleting={deletingId === project.id}
          deleteError={deleteError}
          rename={rename}
          onOpen={onOpen}
          actions={actions}
          power={power}
          onRequestDelete={requestDelete}
          onCancelDelete={cancelDelete}
          onConfirmDelete={confirmDelete}
        />
      ))}
    </div>
  );
}

function SiteCard({
  project,
  overlay,
  deleting,
  deleteError,
  rename,
  onOpen,
  actions,
  power,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  project: SiteRecord;
  overlay: CardOverlayMode;
  deleting: boolean;
  deleteError: string | null;
  rename: SiteRenameState;
  onOpen: (id: string) => void;
  actions: SiteActions;
  power: SitePower;
  onRequestDelete: (id: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (id: string) => Promise<void>;
}) {
  // ANY overlay makes the card inert, which is why the two are one value rather than two booleans:
  // the click that commits or dismisses an overlay must not also open the site underneath it, and
  // that is true of the rename form for exactly the reason it is true of the delete confirmation.
  const openable = isCardOpenable(project, overlay !== null);
  // All five open-affordance attributes from one decision — see `cardOpenProps`.
  const openProps = cardOpenProps(openable, () => onOpen(project.id));
  // What this card's destructive control means for THIS project — a delete that erases the folder,
  // or a removal that only drops the card. See `deleteActionCopy`'s own doc on why one word for
  // both would be a lie in whichever direction the operator happened to read it.
  const copy = deleteActionCopy(project);
  // `null` until main has actually captured this site once (or the fetch is still in flight) — see
  // `use-site-preview.hooks.ts`.
  const previewUrl = useSitePreview(project.id, project.previewVersion);
  // The polled status, or the transition THIS window started and is still waiting on — see
  // `use-site-power.hooks.ts` on why the local half exists and why it is never the whole answer.
  const status = power.statusOf(project);
  const powerError = power.errorOf(project.id);

  return (
    <article className={`card is-${status} ${openable ? 'is-openable' : ''}`} {...openProps}>
      <div className="card__tile">
        {/* A capture exists once this site has been opened at least once, this run or a prior one.
            Until then — and forever as the fallback if a capture ever failed — the tile carries the
            port instead: the project's real address, the thing you would type to reach it, which is
            more useful than a placeholder glyph. See `use-site-preview.hooks.ts` and
            `site-preview-store.ts` for why the record carries only a version token, never bytes. */}
        {previewUrl ? (
          <img className="card__preview" src={previewUrl} alt="" />
        ) : (
          <span className="card__port">{project.port}</span>
        )}
      </div>
      <div className="card__body">
        <h3 className="card__name">{project.displayName}</h3>
        <p className="card__meta">
          <span className="state">
            <span className="state__dot" aria-hidden="true" />
            {STATUS_LABEL[status]}
          </span>
          {project.statusDetail && (
            <span className="card__detail" title={project.statusDetail}>
              {project.statusDetail}
            </span>
          )}
        </p>
        <p className="card__details">
          {databaseLabel(project)}
          {project.templateVersion && <> · Tovu {project.templateVersion}</>}
        </p>
        {project.status === 'provisioning' && <span className="card__draft">Provisioning setup</span>}
        {/* Main's own sentence, verbatim, when a start or a stop was refused. In the body rather
            than an overlay: nothing is pending, the card is still openable, and the failure is one
            fact about it rather than a question to answer. */}
        {powerError && <p className="card__actionerror">{powerError}</p>}
        <CardActions
          project={project}
          status={status}
          copy={copy}
          rename={rename}
          actions={actions}
          power={power}
          onRequestDelete={onRequestDelete}
        />
      </div>

      {overlay === 'rename' && <CardRenameOverlay project={project} rename={rename} />}
      {overlay === 'confirm' && (
        <CardConfirmOverlay
          project={project}
          copy={copy}
          deleting={deleting}
          deleteError={deleteError}
          onCancel={onCancelDelete}
          onConfirm={onConfirmDelete}
        />
      )}
    </article>
  );
}

/**
 * `role="group"` rather than left as a static `<div>`: this element carries its own click/keydown
 * handlers (to stop them bubbling — see below), and a static element with interactive handlers is
 * exactly what `noStaticElementInteractions` flags. A group of controls is what this actually is,
 * so the role also tells assistive tech the truth about it, not only the linter.
 *
 * Stops both handlers rather than only onClick: the card is a keyboard-activated open target too,
 * so Enter or Space inside the confirmation would otherwise open the project underneath it.
 */
function CardConfirmOverlay({
  project,
  copy,
  deleting,
  deleteError,
  onCancel,
  onConfirm,
}: {
  project: SiteRecord;
  copy: DeleteActionCopy;
  deleting: boolean;
  deleteError: string | null;
  onCancel: () => void;
  onConfirm: (id: string) => Promise<void>;
}) {
  return (
    <div
      className="card__confirm"
      role="group"
      aria-label={copy.confirmTitle}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <p className="card__confirmtitle">{copy.confirmTitle}</p>
      <p className="card__confirmbody">{copy.confirmBody}</p>
      {deleteError && <p className="card__confirmerror">{deleteError}</p>}
      <div className="card__confirmacts">
        <button type="button" className="button button--quiet" onClick={onCancel} disabled={deleting}>
          Cancel
        </button>
        <button
          type="button"
          className={copy.confirmButtonClass}
          onClick={() => void onConfirm(project.id)}
          disabled={deleting}
        >
          {deleting ? copy.confirmButtonBusyLabel : copy.confirmButtonLabel}
        </button>
      </div>
    </div>
  );
}

/**
 * A card's action row: Start/Stop, then ⋮, then the trash — always visible, in the info block,
 * never on the preview image.
 *
 * **Always visible is the whole point.** These were hover-revealed overlays on the screenshot, and
 * the operator's own words for why that was wrong are "that way you see it whether you hover or
 * not". A hover-revealed control is invisible to anyone reading the screen rather than pointing at
 * it, and on a trackpad it is a control you have to go hunting for.
 *
 * **`role="group"` with both event handlers stopped**, the identical contract `CardConfirmOverlay`
 * and `SiteCardMenu` document and for the identical reason: the card is an open target for clicks
 * AND for keys, so every event that starts in this row must stop in it, or pressing Start would
 * also open the site in a tab.
 *
 * The three controls are deliberately non-overlapping. Start/Stop is the site's lifecycle and is a
 * LABELLED button rather than a glyph — it is the one control here whose meaning changes with the
 * site's state, and an icon cannot say "Stopping…". The trash keeps its own confirm overlay
 * untouched: making it permanently visible raises the odds of a misclick, so the confirmation is
 * more load-bearing than it was, not less.
 *
 * @complexity O(1) — one conditional button plus two fixed ones.
 */
function CardActions({
  project,
  status,
  copy,
  rename,
  actions,
  power,
  onRequestDelete,
}: {
  project: SiteRecord;
  status: SiteRecord['status'];
  copy: DeleteActionCopy;
  rename: SiteRenameState;
  actions: SiteActions;
  power: SitePower;
  onRequestDelete: (id: string) => void;
}) {
  // `null` for `provisioning`/`blocked` — a site with nothing to start yet, or ever. See
  // `powerControl`'s own doc on why that is no button rather than a disabled one.
  const control = powerControl(status);

  return (
    <div
      className="card__actions"
      role="group"
      aria-label={`Actions for ${project.displayName}`}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {control && (
        <button
          type="button"
          className="card__power"
          // Disabled mid-transition rather than hidden: a row that reflows under the pointer is how
          // a second click lands on the trash.
          disabled={control.action === null}
          aria-label={`${control.label} ${project.displayName}`}
          onClick={() => void power.toggle(project)}
        >
          {control.label}
        </button>
      )}
      <SiteCardMenu project={project} status={status} onRename={() => rename.startRename(project)} actions={actions} />
      <button
        type="button"
        className="card__delete"
        title={copy.cardButtonLabel}
        aria-label={copy.cardButtonLabel}
        // Stops the click first: the card itself is the open target. See `cardDeleteClick`. Kept
        // even though this row already stops both — the row's handler is the general rule, this is
        // the one control where a leak would erase a site directory.
        onClick={cardDeleteClick(onRequestDelete, project.id)}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
          <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8h5.8l.6-8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

/**
 * A card's ⋮ overflow menu.
 *
 * **Its own component, following `CardConfirmOverlay`'s precedent rather than the complexity
 * gate.** Two independent reasons, both structural. First, it carries the identical event contract
 * `CardConfirmOverlay` documents: the card is a click target AND a keyboard-activated open target,
 * so a click inside this menu would otherwise open the site underneath it — the same swallowing
 * problem, and the same fix. Second, `SiteCard` holds no local state at all; every flag it renders
 * arrives as a prop from the grid's hooks. A menu needs open/closed state, and introducing this
 * component's first `useState` for a concern that is not the card's job is the smell, independent
 * of any number.
 *
 * `useDismissibleDropdown` rather than a hand-rolled outside-click listener: the top nav's two
 * dropdowns already share it, and it was extracted precisely because that behaviour was duplicated.
 * Re-implementing it here is the difference between a menu and a menu bug.
 *
 * Markup matches `SettingsControl`'s contract (`App.tsx`) — `aria-expanded`, `aria-haspopup`,
 * `role="menu"` with `role="menuitem"` children — so the app has one menu pattern, not two.
 *
 * Entries render only when their action is both possible and meaningful: `openInBrowser` for a
 * running site only. An entry that is present but inert teaches the operator that this menu's items
 * sometimes do nothing, which is worse than a shorter menu.
 *
 * **Start and Stop are deliberately absent, and this is the whole reason the card has an action
 * row.** Start used to live here, because a stopped site had no other way up; it is now a labelled
 * button two elements to the left (`CardActions`). The same action in a menu AND on a button is the
 * duplicate affordance a coherent card cannot have — an operator would have two places to look for
 * one thing, and the menu's copy would have to restate what the button already says.
 *
 * `status` rather than `project.status`: while THIS window's start or stop is in flight the record
 * has not caught up yet, and a menu offering "Open in browser" for a site that is mid-stop would
 * hand the browser a port about to close. See `use-site-power.hooks.ts`.
 *
 * @complexity O(1) — one hook, one fixed entry plus one conditional.
 */
function SiteCardMenu({
  project,
  status,
  onRename,
  actions,
}: {
  project: SiteRecord;
  status: SiteRecord['status'];
  onRename: () => void;
  actions: SiteActions;
}) {
  const { open, setOpen, containerRef } = useDismissibleDropdown<HTMLDivElement>();
  const running = status === 'running';

  // Every entry closes the menu first, then acts. See `closeMenuThen`.
  const choose = closeMenuThen(setOpen);

  return (
    <div
      className="card__menu"
      ref={containerRef}
      // The card is the open target for BOTH clicks and keys, so every event that starts in here
      // must stop here. See `CardConfirmOverlay` below, which carries the identical pair.
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="card__menubutton"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="true"
        title={`More actions for ${project.displayName}`}
        aria-label={`More actions for ${project.displayName}`}
      >
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="8" cy="3.25" r="1.35" />
          <circle cx="8" cy="8" r="1.35" />
          <circle cx="8" cy="12.75" r="1.35" />
        </svg>
      </button>
      {open && (
        <div className="card__menulist" role="menu">
          <button type="button" role="menuitem" className="card__menuitem" onClick={choose(onRename)}>
            Rename…
          </button>
          {running && (
            <button
              type="button"
              role="menuitem"
              className="card__menuitem"
              onClick={choose(() => void actions.openInBrowser(project.id))}
            >
              Open in browser
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The inline rename form, shown in place of the card's own content.
 *
 * An overlay on the card rather than a `window.prompt`, for the reason `useDeleteConfirmation`
 * documents for the delete flow: a native modal blocks the whole renderer, and in Electron that
 * also freezes the IPC this window answers on.
 *
 * Save is disabled for a name Tovu would reject, but that is the courtesy half only — main
 * re-applies the identical rule (`site-config.ts`), because a bad name does not break the running
 * site, it stops the NEXT boot. See `isValidSiteName`'s own doc.
 *
 * `role="group"` and both event handlers stopped, identical to `CardConfirmOverlay` and for the
 * identical reason — including Escape and Enter, which a text field must own here rather than let
 * the card interpret as "open me".
 *
 * @complexity O(1).
 */
function CardRenameOverlay({ project, rename }: { project: SiteRecord; rename: SiteRenameState }) {
  const invalid = showsInvalidNameHint(rename.draft);

  return (
    <div
      className="card__confirm"
      role="group"
      aria-label={`Rename ${project.displayName}`}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <p className="card__confirmtitle">Rename website</p>
      <label className="card__renamelabel" htmlFor={`rename-${project.id}`}>
        Display name
      </label>
      <input
        id={`rename-${project.id}`}
        className="card__renameinput"
        type="text"
        value={rename.draft}
        maxLength={200}
        autoComplete="off"
        // Autofocused because the overlay exists only to take this one input, and it replaced a
        // control the operator just clicked — landing focus anywhere else would cost them a tab.
        autoFocus
        onChange={(event) => rename.setDraft(event.target.value)}
        // Escape cancels, Enter submits when Save is enabled. See `renameInputKeyDown`.
        onKeyDown={renameInputKeyDown(rename, project.id)}
        disabled={rename.saving}
      />
      {invalid && <p className="card__confirmerror">A name must be 1 to 200 characters, not counting spaces at either end.</p>}
      {/* Main's own sentence, verbatim — every refusal it raises names the fix. */}
      {rename.renameError && <p className="card__confirmerror">{rename.renameError}</p>}
      <div className="card__confirmacts">
        <button type="button" className="button button--quiet" onClick={rename.cancelRename} disabled={rename.saving}>
          Cancel
        </button>
        <button
          type="button"
          className="button button--contrast"
          onClick={() => void rename.submitRename(project.id)}
          disabled={!rename.canSave}
        >
          {rename.saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
