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
 */
import { useDeleteConfirmation, useDismissibleDropdown } from './App.hooks.js';
import { useSiteRename, isValidSiteName } from './use-site-rename.hooks.js';
import { useSiteActions } from './use-site-actions.hooks.js';
import { useSitePreview } from './use-site-preview.hooks.js';
import { cardOpenProps, cardOverlay, databaseLabel, deleteActionCopy, isCardOpenable, type CardOverlayMode, type DeleteActionCopy } from './SiteGrid.hooks.js';
import { STATUS_LABEL } from './site-status.js';
import type { SiteRecord } from '../contracts/project.js';
import type { SiteRenameState } from './use-site-rename.hooks.js';
import type { SiteActions } from './use-site-actions.hooks.js';

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
  useDeleteState = useDeleteConfirmation,
  useRenameState = useSiteRename,
  useActions = useSiteActions,
}: {
  projects: readonly SiteRecord[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  /** Called with main's refreshed record after a rename, so the caller can refresh its list. */
  onRenamed?: (record: SiteRecord) => void;
  useDeleteState?: typeof useDeleteConfirmation;
  useRenameState?: typeof useSiteRename;
  /** The ⋮ menu's Start / Open-in-browser implementations. Injectable for the same reason
   *  `useDeleteState` is — see `use-site-actions.hooks.ts` on why these call the bridge directly
   *  rather than arriving as props from `App.tsx`. */
  useActions?: typeof useSiteActions;
}) {
  const { pendingId, deletingId, deleteError, requestDelete, cancelDelete, confirmDelete } =
    useDeleteState(onDelete);
  const rename = useRenameState(onRenamed);
  const actions = useActions();

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

  return (
    <article className={`card is-${project.status} ${openable ? 'is-openable' : ''}`} {...openProps}>
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
        <SiteCardMenu
          project={project}
          onRename={() => rename.startRename(project)}
          actions={actions}
        />
        <button
          type="button"
          className="card__delete"
          title={copy.cardButtonLabel}
          aria-label={copy.cardButtonLabel}
          onClick={(event) => {
            // The card itself is the open target, so without this every delete click
            // would also open the project it is about to remove.
            event.stopPropagation();
            onRequestDelete(project.id);
          }}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
            <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8h5.8l.6-8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <div className="card__body">
        <h3 className="card__name">{project.displayName}</h3>
        <p className="card__meta">
          <span className="state">
            <span className="state__dot" aria-hidden="true" />
            {STATUS_LABEL[project.status]}
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
 * Entries render only when their action is both possible and meaningful: `onStart` for a stopped
 * site, `onOpenExternal` for a running one. An entry that is present but inert teaches the operator
 * that this menu's items sometimes do nothing, which is worse than a shorter menu.
 *
 * **"Stop" is deliberately absent** — `runner:sites:stop` is a throwing stub with no registered
 * handler (`project-ipc.js`), so there is nothing to call. A disabled entry would imply it is
 * coming; leaving it out states the truth.
 *
 * @complexity O(1) — one hook, at most three conditional entries.
 */
function SiteCardMenu({
  project,
  onRename,
  actions,
}: {
  project: SiteRecord;
  onRename: () => void;
  actions: SiteActions;
}) {
  const { open, setOpen, containerRef } = useDismissibleDropdown<HTMLDivElement>();
  const running = project.status === 'running';

  // Every entry closes the menu first, then acts — the same order `SettingsControl` uses. Acting
  // first would leave an open menu floating over whatever the action changed.
  const choose = (act: () => void) => () => {
    setOpen(false);
    act();
  };

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
          {!running && (
            <button
              type="button"
              role="menuitem"
              className="card__menuitem"
              onClick={choose(() => void actions.startSite(project.id))}
            >
              Start
            </button>
          )}
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
  const invalid = rename.draft.length > 0 && !isValidSiteName(rename.draft);

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
        onKeyDown={(event) => {
          if (event.key === 'Escape') rename.cancelRename();
          if (event.key === 'Enter' && rename.canSave) void rename.submitRename(project.id);
        }}
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
