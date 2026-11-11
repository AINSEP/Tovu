import { startThenNotify, useSiteStart } from '../App.hooks.js';
import { sitePortPresentation } from '../site-port.rules.js';
import type { SiteRecord } from '../../contracts/project.js';
import { Spinner } from './Spinner.js';
import { useEffect, useRef } from 'react';

/**
 * What a project tab shows when its process is not up — or when it is up but just failed to
 * answer the guest (`SiteWorkspace`'s `did-fail-load` branch). `body` and `onStarted` are what
 * let the second case share this panel instead of duplicating it: the registry status text this
 * panel shows by default would read "Running", which is true and explains nothing, so the wedge
 * caller overrides it; and that caller's `running` never flips on its own the way a genuinely
 * stopped project's does, so it needs telling when to give the guest another try.
 *
 * Starting from here rather than only from the grid matters because this is where the operator
 * already is when they find out — the tab was opened expecting a site. Nothing is set locally on
 * success for a stopped project: `App`'s 4s poll flips `status` to `running`, which swaps this
 * panel for the webview on its own.
 */
export function SiteStartPanel({
  project,
  body,
  onStarted,
  onSiteUpdated,
  wakeOnOpen = false,
}: {
  project: SiteRecord;
  body?: string;
  onStarted?: () => void;
  /** Applies main's refreshed record the instant a start resolves — see `useSiteStart`'s own doc
   *  on why this panel needs it as much as the grid card's Start/Stop does. Optional so the three
   *  test-only/incidental call sites this component has never needed a stub for it keep compiling;
   *  every real call site (`SiteWorkspace`, `app/SiteWorkspace.tsx`) passes it. */
  onSiteUpdated?: (record: SiteRecord) => void;
  /** Only the visible workspace wakes automatically; hidden tabs still report presence. */
  wakeOnOpen?: boolean;
}) {
  const { starting: ownStart, error, start } = useSiteStart(project, onSiteUpdated);
  // Also true while another path (an import's own start) has the site booting.
  const starting = ownStart || project.status === 'starting';

  const handleStart = startThenNotify(start, onStarted);
  useWakeOnOpen({ status: project.status, wakeOnOpen, handleStart });

  return (
    <div className="workspace__idle">
      {/* Immediate, visible feedback for the click itself — the 40-75s server boot this button
          kicks off, not the (usually much shorter) admin load `SiteWorkspace`'s own overlay covers
          once the guest mounts. Shown ONLY while `starting`: a spinner sitting beside an already-
          idle "Start site" button would read as the page being broken, not as progress. */}
      {starting && <Spinner />}
      <h2 className="empty__title">{project.displayName}</h2>
      <p className="empty__body">
        {starting
          ? 'Starting the server. This can take up to a minute.'
          : (body ?? sitePortPresentation(project).statusDescription)}
      </p>
      {/* A blocked project is waiting on database-provider support Tovu does not have, so the
          only honest affordance is none — starting it would fail every time. Every project this
          shell tracks is sqlite today (`buildSiteRecord`), so this branch is currently dead in
          practice; kept because `SiteLifecycleStatus` still declares `'blocked'` as a real
          value the contract allows a future provider to reach. */}
      {project.status !== 'blocked' && (
        <button
          type="button"
          className="button button--create"
          onClick={() => void handleStart()}
          disabled={starting}
        >
          {startButtonLabel({ starting, status: project.status })}
        </button>
      )}
      {error && <p className="workspace__error">{error}</p>}
      <SiteFailureDetails project={project} />
    </div>
  );
}

/** Wakes a sleeping site once per sleep when this is the visible workspace; hidden tabs never wake it. */
function useWakeOnOpen({ status, wakeOnOpen, handleStart }: {
  status: SiteRecord['status'];
  wakeOnOpen: boolean;
  handleStart: () => Promise<unknown>;
}) {
  const wakeAttempted = useRef(false);
  useEffect(() => {
    if (status !== 'sleeping') { wakeAttempted.current = false; return; }
    if (!wakeOnOpen || wakeAttempted.current) return;
    // Claim the attempt before starting: re-renders and StrictMode must not start a second boot.
    wakeAttempted.current = true;
    void handleStart();
  }, [status, wakeOnOpen, handleStart]);
}

/** The Start button's words: progress while booting, otherwise the verb that fits the state. */
function startButtonLabel({ starting, status }: { starting: boolean; status: SiteRecord['status'] }): string {
  if (starting) return 'Starting…';
  return status === 'sleeping' ? 'Wake site' : 'Start site';
}

/** Selectable diagnostics belong only to the terminal error; sleep and manual stops stay neutral. */
function SiteFailureDetails({ project }: { project: SiteRecord }) {
  if (project.status !== 'failed' || !project.statusDetail) return null;
  return <pre className="workspace__error">{project.statusDetail}</pre>;
}
