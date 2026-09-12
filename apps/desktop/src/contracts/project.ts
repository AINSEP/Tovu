/**
 * Browser-safe project-registry contract shared by the Electron main process and
 * renderer. Mirrors runtime-inventory.ts's shape: types + IPC channel constants only,
 * no logic. DTOs here are deliberately redacted — no vendor DB credential or
 * connection-string field ever crosses this boundary in either direction.
 */
export type SiteLifecycleStatus =
  | 'provisioning'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'failed'
  | 'blocked';

export type SiteDesiredState = 'running' | 'stopped';

export type DatabaseProviderKind = 'sqlite' | 'supabase' | 'custom';

export interface SiteDatabaseSummary {
  kind: DatabaseProviderKind;
  /** Custom-provider display name (e.g. "Neon"). Absent for sqlite/supabase. */
  label?: string;
}

export interface ProjectRecord {
  id: string;
  slug: string;
  displayName: string;
  installDir: string;
  port: number;
  /**
   * This project's own Electron session-partition string (`desktop-auth.js`'s `sitePartition`,
   * keyed off `installDir`). The embedded-tab renderer (`App.tsx`'s `ProjectWorkspace`) sets this
   * as its `<webview partition>` so the guest's cookie jar is the exact one main seeded with a
   * signed-in session — see that function's own header, property 2, on why one jar per site is a
   * correctness requirement (cookies ignore port) and not a hardening nicety.
   */
  partition: string;
  templateId: string;
  templateVersion: string | null;
  database: SiteDatabaseSummary;
  desiredState: SiteDesiredState;
  status: SiteLifecycleStatus;
  /** Human-readable detail for the current status (e.g. a failure reason). Never a secret. */
  statusDetail: string | null;
  /**
   * What `RUNNER_PROJECT_CHANNELS.delete` will actually DO to this project's folder: `true` erases
   * the install directory, `false` only drops the row and leaves every byte where it is.
   *
   * Main decides it (`project-delete-guard.js`) and sends the ANSWER, never the inputs, so the
   * renderer cannot re-derive the rule and drift from the one main enforces. The renderer's only job
   * is to say which of the two a click will do — see `SiteGrid.hooks.ts`'s `deleteActionCopy`.
   */
  deleteErasesFiles: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSiteDatabaseInput {
  kind: DatabaseProviderKind;
  /** Custom-provider display name. Required (and meaningful) only when kind === 'custom'. */
  label?: string;
  /** Connection string or API endpoint. Required when kind is 'supabase' or 'custom'. */
  endpoint?: string;
  /** Vendor credential/API key. Optional even for hosted providers. Never persisted in plain form. */
  credential?: string;
}

export interface CreateSiteInput {
  displayName: string;
  database: CreateSiteDatabaseInput;
}

/** Which of a project's two web surfaces a workspace is showing: its admin, or its public site. */
export type SiteSurface = 'admin' | 'site';

export interface OpenSiteSurfaceInput {
  projectId: string;
  view: SiteSurface;
}

export const RUNNER_PROJECT_CHANNELS = {
  list: 'runner:projects:list',
  create: 'runner:projects:create',
  /**
   * A project tab's own answer to "not running yet": ensure the site's `tovu serve` is up
   * (spawning it, or reusing it if another tab already has it open), then return its fresh
   * `ProjectRecord`. Real (`project-ipc.js`'s `handleStart`/`openSiteServer`) — not a stub — as
   * of the embedded-tab model; nothing here creates a `BrowserWindow`.
   */
  start: 'runner:projects:start',
  /**
   * Look for Tovu sites on disk that this shell is not tracking, adopt the ones the operator has
   * no stored answer about, and return the refreshed list. Real (`project-ipc.js`'s
   * `rescanSites`); `main.js` runs the same pass once at boot.
   *
   * A project the operator REMOVED is never brought back by this, however many times it is
   * pressed — see `adoptDiscoveredSites` in `project-registry.js`. Their way back is the
   * folder dialog, which is them asking explicitly.
   */
  rescan: 'runner:projects:rescan',
  /**
   * "Add Tovu Website" — the operator picks ONE folder that already holds a Tovu site, and it
   * becomes a tracked row. Real (`project-ipc.js`'s `handleAddSite` over
   * `add-site-pointer.js`'s `addSitePointer`).
   *
   * **Pointer semantics, and the whole reason this is not `create`.** The folder is never moved,
   * copied, renamed, or written to, and no site is ever created: a folder that is empty, is
   * half-initialized, or holds unrelated files is REFUSED with the reason. `create` is the
   * opposite deal — it takes an empty folder and runs `tovu init` into it — so the two cannot be
   * one channel, however similar the dialog looks.
   *
   * Takes no argument: main owns the folder dialog, the same way `create` does, so the renderer
   * never names a filesystem path and main has nothing to validate on arrival.
   *
   * @returns the new `ProjectRecord`, so the grid can render the card without a second `list`
   *   round trip.
   * @throws when the operator cancels the dialog, or when the folder is not already a complete
   *   Tovu site — the message is operator-facing and names the fix, so a renderer must surface it
   *   verbatim rather than paraphrasing it.
   */
  addSite: 'runner:projects:add-site',
  /** Not implemented yet — no control in the per-project bar calls it. Closing the app
   *  (`before-quit`) or deleting the project are the two ways a sites-home-opened site stops today. */
  stop: 'runner:projects:stop',
  /** Irreversible: stops the process, removes the install dir, drops the row. Returns nothing. */
  delete: 'runner:projects:delete',
  /**
   * Opens one of a project's surfaces in the operator's default browser. Carries an id and a
   * view, never a url: main builds the url from the registry row, so the renderer has no way to
   * name a destination and main has nothing to validate on arrival.
   */
  openExternal: 'runner:projects:open-external',
} as const;
