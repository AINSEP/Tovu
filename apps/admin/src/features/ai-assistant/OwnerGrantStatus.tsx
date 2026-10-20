/**
 * The busy status and the load/save alerts that close both owner-grant panels (Full CLI access and
 * permanent deletes). Rendered as a fragment so each panel keeps its exact former markup; the busy
 * copy is translated only while it shows.
 */
export function OwnerGrantStatus({ t, busyKey, busy, loadError, saveError }: {
  t: (key: string) => string; busyKey: string; busy: boolean; loadError: string | null; saveError: string | null;
}) {
  return <>
    {busy && <p role="status">{t(busyKey)}</p>}
    {loadError && <p className="save-error" role="alert">{loadError}</p>}
    {saveError && <p className="save-error" role="alert">{saveError}</p>}
  </>;
}
