/**
 * The project grid: one card per website, and each card's inline delete-confirm overlay. Split out
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
import { useDeleteConfirmation } from './App.hooks.js';
import { databaseLabel, deleteActionCopy, isCardOpenKey, isCardOpenable, type DeleteActionCopy } from './ProjectGrid.hooks.js';
import { STATUS_LABEL } from './project-status.js';
import type { ProjectRecord } from '../contracts/project.js';

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
 * The private components below (`ProjectCard`, `CardConfirmOverlay`) take no hooks of their own
 * and are not exported, so there is nothing to inject into them and no way for a test to mount
 * them directly — they are exercised through this grid, which is the boundary that owns them.
 */
export function ProjectGrid({
  projects,
  onOpen,
  onDelete,
  useDeleteState = useDeleteConfirmation,
}: {
  projects: readonly ProjectRecord[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  useDeleteState?: typeof useDeleteConfirmation;
}) {
  const { pendingId, deletingId, deleteError, requestDelete, cancelDelete, confirmDelete } =
    useDeleteState(onDelete);

  return (
    <div className="grid">
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          confirming={pendingId === project.id}
          deleting={deletingId === project.id}
          deleteError={deleteError}
          onOpen={onOpen}
          onRequestDelete={requestDelete}
          onCancelDelete={cancelDelete}
          onConfirmDelete={confirmDelete}
        />
      ))}
    </div>
  );
}

function ProjectCard({
  project,
  confirming,
  deleting,
  deleteError,
  onOpen,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  project: ProjectRecord;
  confirming: boolean;
  deleting: boolean;
  deleteError: string | null;
  onOpen: (id: string) => void;
  onRequestDelete: (id: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (id: string) => Promise<void>;
}) {
  const openable = isCardOpenable(project, confirming);
  // What this card's destructive control means for THIS project — a delete that erases the folder,
  // or a removal that only drops the card. See `deleteActionCopy`'s own doc on why one word for
  // both would be a lie in whichever direction the operator happened to read it.
  const copy = deleteActionCopy(project);

  return (
    <article
      className={`card is-${project.status} ${openable ? 'is-openable' : ''}`}
      role={openable ? 'button' : undefined}
      tabIndex={openable ? 0 : undefined}
      onClick={openable ? () => onOpen(project.id) : undefined}
      onKeyDown={
        openable
          ? (event) => {
              // `isCardOpenKey`, not an inline key check: it also refuses a keydown that started on
              // a descendant. See its own doc — an unguarded card handler swallowed the delete
              // button's keyboard activation and opened the project instead.
              if (!isCardOpenKey(event)) return;
              event.preventDefault();
              onOpen(project.id);
            }
          : undefined
      }
    >
      {/* No screenshots exist yet, so the tile carries the port instead of a
          preview. It is the project's real address — the thing you would type
          to reach it — which makes it more useful than a placeholder image. */}
      <div className="card__tile">
        <span className="card__port">{project.port}</span>
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

      {confirming && (
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
  project: ProjectRecord;
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
