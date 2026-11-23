/**
 * @file Two small presentational pieces under the visitor chat's `ChatPane`: which model answered, and a
 * "Try again" bar after a failed send. Pure props in, markup out — state lives in
 * `SiteAssistantWidget.hooks.ts`, copy comes from the injected `t` (English fallback for locales
 * without these strings yet).
 */

/** "Answered by <model>"; renders nothing while the model is unknown (before a reply, after a reload). */
export function SiteAssistantModelLabel({ model, t }: { model: string | null; t: (key: string) => string }, _options = {}) {
  if (!model) return null;
  // Not a live region: the streamed reply already announces itself, and a second announcement for a
  // footnote would talk over it.
  return <p className="tovu-site-assistant__model">{`${t('Answered by')} ${model}`}</p>;
}

/**
 * Shown after a send failed for good (the transport has already retried once). `ChatPane` has no resend
 * API, so the button puts the failed question back in the composer for one more Send.
 */
export function SiteAssistantRetryBar({ prompt, onRetry, t }: { prompt: string | null; onRetry: () => void; t: (key: string) => string }, _options = {}) {
  if (!prompt) return null;
  return (
    <div className="tovu-site-assistant__retry" role="group" aria-label={t('Try again')}>
      <button type="button" className="tovu-site-assistant__retry-go" onClick={onRetry} title={t('Put your question back in the box so you can send it again')}>{t('Try again')}</button>
    </div>
  );
}
