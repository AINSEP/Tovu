/**
 * The project grid: the "Add project" tile, one card per project, and each card's inline
 * delete-confirm overlay. Split out of `App.tsx` as its own module — this family has a small,
 * self-contained props surface (`projects`, `onCreate`, `onOpen`, `onDelete`) and no dependency on
 * anything else `App.tsx` renders, which is what makes it a real ownership boundary rather than
 * just a line-count split.
 */
import { useDeleteConfirmation } from './App.hooks.js';
import { databaseLabel, deleteActionCopy, isCardOpenable, type DeleteActionCopy } from './ProjectGrid.hooks.js';
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
  onCreate,
  onOpen,
  onDelete,
  useDeleteState = useDeleteConfirmation,
}: {
  projects: readonly ProjectRecord[];
  onCreate: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  useDeleteState?: typeof useDeleteConfirmation;
}) {
  const { pendingId, deletingId, deleteError, requestDelete, cancelDelete, confirmDelete } =
    useDeleteState(onDelete);

  return (
    <div className="grid">
      <button type="button" className="card card--add" onClick={onCreate}>
        <span className="card__plus" aria-hidden="true">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 4.5v11M4.5 10h11" strokeLinecap="round" />
          </svg>
        </span>
        <span className="card__addlabel">Add project</span>
        <span className="card__addhint">New site on its own port</span>
      </button>

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
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpen(project.id);
              }
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
