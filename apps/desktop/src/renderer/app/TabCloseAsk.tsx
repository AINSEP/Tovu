/**
 * @file The bar that asks whether a closing tab's site should stop too. See
 * `use-tab-close-ask.hooks.ts` for when it shows and what each answer does.
 */
import type { SiteRecord } from '../../contracts/project.js';
import { tabCloseCopy } from '../use-tab-close-ask.hooks.js';
import { codeSpans } from '../use-site-power.hooks.js';

/** Nothing is drawn with no `project` to ask about. Focus starts on Keep running, the answer that
 *  changes least, so a stray Enter stops nothing. */
export function TabCloseAsk({ project, stopping, error, onStop, onKeepRunning, onCancel }: {
  project: SiteRecord | null;
  stopping: boolean;
  error: string | null;
  onStop: () => void;
  onKeepRunning: () => void;
  onCancel: () => void;
}) {
  if (project === null) return null;
  const copy = tabCloseCopy({ project });
  return (
    <div className="projects-feedback tab-close-ask" role="alertdialog" aria-label={copy.title}>
      <div className="tab-close-ask__text">
        <p>{copy.title}</p>
        {copy.body !== null && <p>{codeSpans(copy.body).map((part, index) => (part.code ? <code key={index}>{part.text}</code> : part.text))}</p>}
        {error !== null && <p className="card__confirmerror" role="alert">{error}</p>}
      </div>
      <div className="tab-close-ask__actions">
        <button type="button" className="button button--quiet" onClick={onCancel} disabled={stopping}>{copy.cancel}</button>
        <button type="button" className="button" onClick={onKeepRunning} disabled={stopping} autoFocus>{copy.keepRunning}</button>
        <button type="button" className="button button--primary" onClick={onStop} disabled={stopping}>{stopping ? copy.stopping : copy.stop}</button>
      </div>
    </div>
  );
}
