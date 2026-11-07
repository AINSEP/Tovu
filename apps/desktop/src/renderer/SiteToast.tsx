import type { SiteToast as SiteToastValue } from './use-site-toast.hooks.js';

/** The "new site" toast. It renders over a site's tab too, which is where an import lands. */
export function SiteToast({ toast, onDismiss }: { toast: SiteToastValue | null; onDismiss: () => void }) {
  if (toast === null) return null;
  return (
    <div className="site-toast" role="status">
      <div>
        <p className="site-toast__message">{toast.message}</p>
        {toast.note && <p className="site-toast__note">{toast.note}</p>}
        {toast.items && (
          <details className="site-toast__items">
            <summary>Show list</summary>
            <ul>{toast.items.map((item) => <li key={item}>{item}</li>)}</ul>
          </details>
        )}
      </div>
      <button type="button" className="button button--quiet" aria-label="Dismiss" onClick={onDismiss}>×</button>
    </div>
  );
}
