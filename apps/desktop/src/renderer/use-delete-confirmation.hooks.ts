/**
 * @file The project grid's delete-confirm flow. Split out of `App.hooks.ts` (which still
 * re-exports it) with no behaviour change; the document its Escape listener goes on is now an
 * injected port defaulting to `document`.
 */
import { useEffect, useState } from 'react';
import { dismissOnEscape, humanSiteError } from './site-shell-policy.js';

/**
 * The project grid's delete-confirm flow: which card (if any) is asking to be confirmed, which
 * one is mid-delete, and the error from the last failed attempt.
 *
 * Confirmation lives on the card rather than in a `window.confirm`: a native modal dialog blocks
 * the whole renderer, and in Electron that also freezes the IPC this window answers on.
 *
 * @param options.doc where the Escape listener goes while a card is pending; `document` by default.
 */
export function useDeleteConfirmation(
  onDelete: (id: string) => Promise<void>,
  { doc = document }: { doc?: Pick<Document, 'addEventListener' | 'removeEventListener'> } = {},
): {
  pendingId: string | null;
  deletingId: string | null;
  deleteError: string | null;
  requestDelete: (id: string) => void;
  cancelDelete: () => void;
  confirmDelete: (id: string) => Promise<void>;
} {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const requestDelete = (id: string) => {
    setDeleteError(null);
    setPendingId(id);
  };

  const cancelDelete = () => setPendingId(null);
  useEffect(() => {
    if (!pendingId) return undefined;
    const onEscape = (event: KeyboardEvent) => dismissOnEscape({ event, dismiss: cancelDelete, busy: deletingId !== null });
    doc.addEventListener('keydown', onEscape, true);
    return () => doc.removeEventListener('keydown', onEscape, true);
  }, [pendingId, deletingId, doc]);

  const confirmDelete = async (id: string) => {
    setDeletingId(id);
    setDeleteError(null);
    try {
      await onDelete(id);
      setPendingId(null);
    } catch (err) {
      setDeleteError(humanSiteError({ error: err, fallback: 'Could not delete this website. Its card has been kept so you can try again.' }));
    } finally {
      setDeletingId(null);
    }
  };

  return { pendingId, deletingId, deleteError, requestDelete, cancelDelete, confirmDelete };
}
