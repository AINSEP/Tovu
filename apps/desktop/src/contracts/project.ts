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

export interface SiteRecord {
  id: string;
  slug: string;
  displayName: string;
  installDir: string;
  port: number;
  /**
   * This project's own Electron session-partition string (`desktop-auth.ts`'s `sitePartition`,
   * keyed off `installDir`). The embedded-tab renderer (`App.tsx`'s `SiteWorkspace`) sets this
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
   * What `SITE_IPC_CHANNELS.delete` will actually DO to this project's folder: `true` erases
   * the install directory, `false` only drops the row and leaves every byte where it is.
   *
   * Main decides it (`project-delete-guard.ts`) and sends the ANSWER, never the inputs, so the
   * renderer cannot re-derive the rule and drift from the one main enforces. The renderer's only job
   * is to say which of the two a click will do — see `SiteGrid.hooks.ts`'s `deleteActionCopy`.
   */
  deleteErasesFiles: boolean;
  /**
   * A version token for this site's cached preview image — its capture's mtime, or `null` when no
   * capture exists yet. NEVER the image itself.
   *
   * This record is polled every 4s (`useSitesPolling`) because sites crash and finish booting with
   * no user action, so a byte payload here would re-serialize every open card's screenshot across
   * IPC 15 times a minute for images that have not changed — at 50 sites, roughly 1.25 MB per poll,
   * forever. A POLLED RECORD CARRIES REFERENCES, NOT PAYLOADS: the renderer fetches the actual
   * `data:` URL on demand (`SITE_IPC_CHANNELS.preview`) only when this number CHANGES, not when it
   * increases — a restored backup or a clock-skewed capture can move an mtime backward as easily as
   * forward, and a "did it grow" check would silently ignore that case. See `site-preview-store.ts`.
   */
  previewVersion: number | null;
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
  siteId: string;
  view: SiteSurface;
}

/**
 * A site's new display name. `id` is the record's own id (its install dir), never a path the
 * renderer composed — same discipline every other channel here follows.
 *
 * `name` is the RAW operator input, untrimmed: main trims and validates it against the same
 * 1..200-chars-after-trim rule `tovu serve` re-applies at every boot
 * (`platform/site-dir/read-site-dir.ts`'s `validateConfig`). The renderer checks it too, so a
 * disabled Save is the first line — but a renderer's check is a courtesy, never the guarantee,
 * and this one has teeth: a name that fails that rule makes the site refuse to BOOT next time,
 * long after the dialog is gone.
 */
export interface RenameSiteInput {
  id: string;
  name: string;
}

export const SITE_IPC_CHANNELS = {
  list: 'runner:sites:list',
  create: 'runner:sites:create',
  /**
   * A project tab's own answer to "not running yet": ensure the site's `tovu serve` is up
   * (spawning it, or reusing it if another tab already has it open), then return its fresh
   * `SiteRecord`. Real (`project-ipc.js`'s `handleStart`/`openSiteServer`) — not a stub — as
   * of the embedded-tab model; nothing here creates a `BrowserWindow`.
   */
  start: 'runner:sites:start',
  /**
   * Look for Tovu sites on disk that this shell is not tracking, adopt the ones the operator has
   * no stored answer about, and return the refreshed list. Real (`project-ipc.js`'s
   * `rescanSites`); `main.js` runs the same pass once at boot.
   *
   * A project the operator REMOVED is never brought back by this, however many times it is
   * pressed — see `adoptDiscoveredSites` in `tracked-sites.js`. Their way back is the
   * folder dialog, which is them asking explicitly.
   */
  rescan: 'runner:sites:rescan',
  /**
   * "Add Tovu Website" — the operator picks ONE folder that already holds a Tovu site, and it
   * becomes a tracked row. Real (`project-ipc.js`'s `handleAddSite` over
   * `add-site-pointer.ts`'s `addSitePointer`).
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
   * @returns the new `SiteRecord`, so the grid can render the card without a second `list`
   *   round trip.
   * @throws when the operator cancels the dialog, or when the folder is not already a complete
   *   Tovu site — the message is operator-facing and names the fix, so a renderer must surface it
   *   verbatim rather than paraphrasing it.
   */
  addSite: 'runner:sites:add-site',
  /**
   * Change a site's display name — `config.json`'s `name`, which is where `readSiteName`
   * (`main.js`) gets every card's `displayName`. Real (`project-ipc.js`'s `handleRename`).
   *
   * **Why this writes a file that `repairSite` refuses to overwrite.** `repairSite`
   * (`apps/website/src/platform/site-dir/repair-site.ts`) writes `config.json` too, and refuses
   * outright when either marker file already exists. That refusal protects the OTHER marker:
   * `.site-meta.json` carries `{schemaVersion, schemaTag}`, which `tovu serve` compares against
   * its bundled migration identity before the database is ever opened, so a wrong stamp makes
   * `serve` silently skip a migration the database still needs. `config.json` is inside that
   * refusal only because `repairSite` writes the PAIR as one commit marker. A rename touches one
   * string in `config.json`, never `.site-meta.json`, and so cannot cause that harm at all — a
   * different operation, not a way around the invariant. It carries its own guard instead; see
   * `handleRename`.
   *
   * @returns the refreshed `SiteRecord`, so the card can re-render without a second `list`.
   * @throws when the row is unknown, the directory is no longer a Tovu site, the recorded identity
   *   no longer matches, or the name is empty/blank/over 200 chars after trimming. Every message
   *   is operator-facing.
   */
  rename: 'runner:sites:rename',
  /** Not implemented yet — no control in the per-project bar calls it. Closing the app
   *  (`before-quit`) or deleting the project are the two ways a sites-home-opened site stops today. */
  stop: 'runner:sites:stop',
  /** Irreversible: stops the process, removes the install dir, drops the row. Returns nothing. */
  delete: 'runner:sites:delete',
  /**
   * Opens one of a project's surfaces in the operator's default browser. Carries an id and a
   * view, never a url: main builds the url from the registry row, so the renderer has no way to
   * name a destination and main has nothing to validate on arrival.
   */
  openExternal: 'runner:sites:open-external',
  /**
   * A site's cached preview as a `data:` URL — the on-demand fetch `SiteRecord.previewVersion`
   * exists to trigger. Carries an id, never a path: main derives the cache file from the tracked
   * row's own directory (`site-preview-store.ts`'s digest), so the renderer names nothing on disk.
   *
   * @returns the URL, or `null` when no capture exists yet — the ordinary state for a site that has
   *   never been opened, not an error to surface.
   */
  preview: 'runner:sites:preview',
} as const;

/** One step through a project tab's own history. */
export type SiteHistoryCommand = 'back' | 'forward';

/**
 * push (main → renderer): the app menu's History > Back or Forward (Cmd+[ / Cmd+]), carrying a
 * {@link SiteHistoryCommand}. Main does not know which tab is on screen; the visible project tab is
 * the only subscriber. A push, not an `invoke` target, so it has no handler or stub. Inlined in
 * `site-history-menu.ts`, which tests that the two match.
 */
export const SITE_HISTORY_CHANNEL = 'runner:sites:history';
