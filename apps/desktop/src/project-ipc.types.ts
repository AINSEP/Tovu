import type { SitesWorkspace } from "./shared-sites.ts";
import type { SiteIdentityOptions } from "./site-directory-identity.ts";
import type { ResourcesSnapshot } from "./contracts/resources.ts";
import type { removeSiteTree } from "./remove-site-tree.ts";
import type { OpenSiteEntry, ServerExitLike, SiteRuntime } from "./project-ipc.site-lifecycle.ts";
import type { SiteFoldersPort } from "./site-folders.ts";
import type { ExternalSiteStopper } from "./external-site-stop.ts";
import type { TokenSignInPlugin } from "@jini-ai/agent-plugins/connect";
import type { SitePresence, PresenceSender } from "./project-ipc.presence.ts";


/**
 * A tracked-project row as {@link buildSiteRecord} and its siblings need it — loosened from
 * `tracked-sites.ts`'s own `TrackedSiteRow` (not exported) in exactly the two fields a caller here
 * can hand in without one: `origin` and `siteId` are optional, because {@link mayEraseDirectory}
 * already treats an absent `origin` as "not created" (refuse) and {@link identityHasChanged} already
 * treats an absent `siteId` as "nothing recorded" — this type describes that existing tolerance
 * rather than inventing it. Deliberately no index signature: a real `TrackedSiteRow` (also no index
 * signature) must flow into this type at every real call site. The erase guard receives a projection
 * of the row's directory, provenance and identity instead of a cast to an indexed type.
 */
export interface SiteRow {
  siteDir: string;
  createdAt: string;
  origin?: string;
  siteId?: string | null;
  displayName?: string;
  displayNameAlias?: string;
}

export interface ProjectSiteLifecycle extends SitePresence<PresenceSender & { getURL(): string }> {
  onServerExit(input: { siteDir: string; exit: ServerExitLike; server: OpenSiteEntry["server"] }, options?: {}): void;
  maintain(input: { snapshot: ResourcesSnapshot }, options?: {}): Promise<void>;
  /** Keep running in background: no idle sleep until this launch ends. Memory restarts still run. */
  keepAwake(): void;
  manualStart(input: { siteDir: string }, options?: {}): void;
  cancel(input: { siteDir: string; forget?: boolean }, options?: {}): void;
  onBootFailure(input: { siteDir: string; error: unknown }, options?: {}): void;
}

/** `deps.openSites` — `Map`-compatible, per {@link registerSiteIpcHandlers}'s own doc; in production
 *  it is `@jini-ai/sidecar/supervisor`'s supervisor, which adds {@link OpenSites.lastExitOf}. This file's own
 *  handlers only ever call `get`/`delete`, but `set`/`has` are part of the type because the
 *  documented "Map-compatible" contract is what callers (this file's own tests, and `main.ts`) build
 *  entries with before a handler ever sees them. */
export interface OpenSites {
  get(siteDir: string): OpenSiteEntry | undefined;
  set(siteDir: string, entry: OpenSiteEntry): unknown;
  has(siteDir: string): boolean;
  delete(siteDir: string): boolean;
  lastExitOf?({ key }: { key: string }, optional?: {}): ServerExitLike | null;
}

/** `deps.transitions` — `@jini-ai/sidecar/supervisor`'s store, as the two readers here need it. Structural
 *  rather than an import of its own type, for the same reason {@link OpenSites} is a duck type:
 *  this file's handlers stay callable from plain `node --test` against a two-line fake. */
export interface SiteTransitionsLike {
  get({ key }: { key: string }, optional?: {}): "starting" | "stopping" | null;
  during<T>({ key, transition, body }: { key: string; transition: "starting" | "stopping"; body: () => Promise<T> }, optional?: {}): Promise<T>;
}

/** A crash-safety registry row, as {@link liveForeignServers} needs it — mirrors
 *  `site-child-registry.ts`'s own `SiteProcessRow`, duplicated rather than imported for the same
 *  reason `readRegistry`/`isLiveServeRow` arrive on `deps` rather than as a direct import: every
 *  handler here stays callable from plain `node --test` against fakes. */
export interface RegistryRow {
  siteDir: string;
  port: number;
  workspaceId: string;
  pid: number;
  updatedAt: number;
}

/** `deps.dialog.showOpenDialog`'s options — the subset of Electron's `OpenDialogOptions` every
 *  caller here actually passes. */
interface OpenDialogOptions {
  title: string;
  message?: string;
  buttonLabel: string;
  properties: Array<"openDirectory" | "createDirectory" | "openFile">;
  filters?: Array<{ name: string; extensions: string[] }>;
}

/** Electron's `dialog.showOpenDialog` resolution — the subset read here. */
interface OpenDialogResult {
  canceled: boolean;
  filePaths: string[];
}

/** `deps.dialog` — injected so existing-folder/settings handlers are testable without a real native
 *  dialog. */
interface DialogLike {
  showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogResult>;
}

/** `deps.shell` — injected so {@link handleOpenExternal} is testable without a real browser launch.
 *  Typed to return `Promise<unknown>` rather than Electron's own `Promise<void>`: this file only
 *  ever awaits the call, and several tests report what they opened by returning their own array
 *  length from the fake. */
interface ShellLike {
  openExternal(url: string): Promise<unknown>;
}

/** `deps.ipcMain` — Electron's own `ipcMain.handle` listener signature is itself
 *  `(event: any, ...args: any[]) => any` (see Electron's `ipcMain.d.ts`): the per-channel
 *  payload/return shape is not something this generic registration API can express, so each
 *  `deps.ipcMain.handle(...)` call below still gives its own listener a real, specific parameter
 *  type at the point that matters — the handler function it delegates to. */
interface IpcMainLike {
  handle(channel: string, listener: (event: any, ...args: any[]) => any): void; // Mirrors Electron's own ipcMain.handle signature.
  removeHandler?(channel: string): void;
}

/** `deps.serializer` — `@jini-ai/sidecar/supervisor`'s per-key promise chain, loosened from that file's own
 *  exported `KeyedSerializer` type (`run<T>(...): Promise<T>`) to `T | PromiseLike<T>`: this file
 *  only ever `await`s the result, and the plain synchronous fakes several tests use return `fn()`'s
 *  own value rather than a wrapped `Promise`. The real `createKeyedSerializer({})` still satisfies
 *  this — `Promise<T>` is one of the two arms. */
interface Serializer {
  run<T>(required: { key: string; fn: () => T | PromiseLike<T> }, optional?: {}): T | PromiseLike<T>;
}

/** {@link handleCreate}'s input — mirrors `contracts/project.ts`'s `CreateSiteInput`, kept local for
 *  the same reason {@link SITE_IPC_CHANNELS} is inlined rather than imported: see this file's
 *  header. */
export interface CreateSiteInput {
  displayName: string;
  adminPassword?: string;
  database?: { kind: string };
  /** Optional "Connect services" tokens, `{ [pluginId]: token }` — see `agent-plugin-tokens.ts`. */
  agentPluginTokens?: unknown;
}

/** {@link handleRename}'s input — mirrors `contracts/project.ts`'s `RenameSiteInput`. */
export interface RenameSiteInput {
  id?: string;
  name?: string;
}

/** {@link handleOpenExternal}'s input — mirrors `contracts/project.ts`'s `OpenSiteSurfaceInput`. */
export interface OpenSiteSurfaceInput {
  siteId: string;
  view: "site" | "admin";
}

/** {@link handleCreate}/{@link rescanSites}'s own `adoptSiteDir` shape — loosened from
 *  `site-dir-store.ts`'s own `AdoptSiteDirInput` (not exported) since this field arrives on `deps`,
 *  injected rather than imported, for the same testability reason as every other collaborator here. */
interface AdoptSiteDirInput {
  dir: string;
  repoRoot: string;
  statePath: string;
  name?: string;
  adminPassword?: string;
  cliMode?: "source" | "compiled";
  agentPluginTokens?: Readonly<Record<string, string>>;
  onInitOutput?: (input: { output: string }, options?: Record<string, never>) => void;
}

/** {@link handleAddSite}'s own `addSitePointer` shape — mirrors `add-site-pointer.ts`'s real
 *  `addSitePointer`, duplicated rather than imported for the same reason as {@link AdoptSiteDirInput}. */
interface AddSitePointerLike {
  (input: { siteDir: string; projectsPath: string }, options?: SiteIdentityOptions): { siteDir: string; alreadyTracked: boolean; alreadyDismissed: boolean };
}

/**
 * The full `deps` bag {@link registerSiteIpcHandlers} needs — every individual handler above takes
 * only the `Pick` of this it actually reads, so a caller wiring one handler in isolation (as this
 * file's own tests do) never has to fabricate the fields it does not touch.
 */
export interface ProjectIpcDeps<TCtx = unknown> {
  /** Main owns the canonical shell URL. Missing authority rejects presence/preferences IPC. */
  isPresenceShell?: (sender: PresenceSender & { getURL(): string }) => boolean;
  /** Native site windows need the same final plain-words error as the shell's SiteRecord. */
  onRestartStopped?: (input: { siteDir: string; detail: string }) => void;
  /** Repoint an existing own-site window after authentication of a replacement server. */
  onServerRestarted?: (input: { siteDir: string }) => Promise<void>;
  /** Internal live status belongs to this registration, never persisted with tracked sites. */
  siteRuntime?: ReadonlyMap<string, SiteRuntime>;
  /** Automatic starts recheck revoked intent after acquiring the existing serializer. */
  startAllowed?: () => boolean;
  ipcMain: IpcMainLike;
  dialog: DialogLike;
  shell: ShellLike;
  openSites: OpenSites;
  serializer: Serializer;
  projectsPath: string;
  registryPath: string;
  repoRoot: string;
  statePath: string;
  cliMode: "source" | "compiled";
  readSiteName: (required: { siteDir: string }) => string;
  writeSiteName: (input: { siteDir: string; rawName: unknown }) => string;
  readPreviewVersion: (required: { siteDir: string }) => number | null;
  readPreviewDataUrl: (required: { id: string }) => string | null;
  deletePreview: (required: { id: string }) => void;
  removeSiteTree?: typeof removeDirectoryTree;
  /** Stop/Restart must withdraw pending hidden-window work before the server drains. */
  cancelPreviewCapture?: (required: { siteDir: string }, optional: {}) => void;
  /** Jini's existing shutdown tracker: Quit must also await Stops removed from openSites. */
  pendingTeardowns?: { track(required: { promise: PromiseLike<unknown> }): Promise<void> };
  adoptSiteDir: (input: AdoptSiteDirInput) => Promise<string>;
  addSitePointer: AddSitePointerLike;
  /** `site-archive-import.ts`'s real runner. */
  importSiteArchive: typeof import("./site-archive-import.ts").importSiteArchive;
  stopRunningImports: typeof import("./site-archive-import.ts").stopRunningImports;
  /** Injected for tests; defaults to `agent-plugin-tokens.ts`'s CLI-backed lister. */
  listTokenSignInPlugins?: (input: { repoRoot: string; cliMode?: "source" | "compiled" }) => Promise<TokenSignInPlugin[]>;
  // `classifySiteDirSafely`'s verdicts, spelled out because `site-dir-store.ts` does not export its
  // `SiteClassification`. The throwing `classifySiteDir` and the tests' fakes return a subset.
  classifySiteDir: (input: { dir: string }) => "site" | "incomplete" | "empty" | "occupied" | "unreadable";
  openSiteServer: (required: { siteDir: string; ctx: TCtx }) => Promise<unknown>;
  /**
   * `@jini-ai/sidecar/supervisor`'s store — which sites are mid-start or mid-stop right now, the fact
   * `openSites` cannot express. `main.ts` wires the real one (`main-project-wiring.test.ts` holds
   * it there); `buildSiteRecord` and the two lifecycle handlers are its only readers.
   *
   * Optional so every existing test bag stays valid: a handler asked to build a record without one
   * reports the same two-valued `running`/`stopped` it always did, which is exactly right for a
   * test that is not exercising a transition.
   */
  transitions?: SiteTransitionsLike;
  recordSiteClosed: (required: { registryDir: string; siteDir: string }, options?: { pid?: number }) => void;
  readRegistry: (required: { registryDir: string }, optional?: {}) => { sites: RegistryRow[]; unreadable: string[] };
  isLiveServeRow: (row: RegistryRow) => boolean;
  siteScanRoots: string[];
  /** Profile-bound, read fresh at boot and Rescan; optional for older hosts and handler fakes. */
  siteFolders?: SiteFoldersPort;
  /** Production discovery runs filesystem probes off-thread; results grant no deletion authority. */
  discoverSites?: (required: { scanRoots?: string[] }, options?: {}) => Promise<string[]>;
  recentSiteDirs: () => string[];
  sharedSites?: SitesWorkspace;
  /** Stops a site another process serves (`external-site-stop.ts`). Absent: such a Stop is refused. */
  externalSites?: Pick<ExternalSiteStopper, "launcherOf" | "stop">;
  ctx: TCtx;
}
