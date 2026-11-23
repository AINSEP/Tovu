/**
 * @file The project grid's delete-confirm flow: this app's failure copy bound into Jini's
 * `useDeleteConfirmation` (which owns the pending/deleting/error state and the Escape listener).
 * `App.hooks.ts` still re-exports it, so `SiteGrid` keeps calling it with `{ onDelete }` alone.
 */
import { useDeleteConfirmation as useJiniDeleteConfirmation, type DeleteConfirmationState, type EscapeTarget } from '@jini-ai/ui/app-shell';
import { humanSiteError } from './site-shell-policy.js';

const describeDeleteError = ({ error }: { error: unknown }) =>
  humanSiteError({ error, fallback: 'Could not delete this website. Its card has been kept so you can try again.' });

/**
 * @param options.doc where the Escape listener goes while a card is pending; `document` by default.
 */
export function useDeleteConfirmation(
  { onDelete }: { onDelete: (id: string) => Promise<void> }, options: { doc?: EscapeTarget } = {},
): DeleteConfirmationState {
  return useJiniDeleteConfirmation({ onDelete, describeError: describeDeleteError }, options);
}
