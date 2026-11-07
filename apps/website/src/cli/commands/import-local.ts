import { randomBytes } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { leaveSavedKeysOut } from "#src/features/site-backup/saved-keys";
import { SHARE_LIMITS, SiteShareRefusal } from "#src/features/site-backup/share-policy";
import type { SiteImportBackend, SiteImportSource, SiteImportView } from "#src/features/site-backup/import-backend";
import { createSitesWorkspace, ValidationError, type SitesWorkspace } from "#src/platform/site-dir/index";
import { composeSiteImportBackend } from "#src/server/runtime/composition/site-import-backend";

/** One local operator with one registry folder: this host has no accounts and no site of its own. */
const LOCAL_PRINCIPAL = "local-operator";
const LOCAL_WORKSPACE = "local";

const NOT_A_ZIP = "That file is not a usable .tovu.zip. It is damaged, cut short, or not a zip file. No website was created.";

export interface ImportLocalResult { dir: string; name: string; siteId: string; warnings: readonly string[] }
interface ImportLocalRequest { file?: string; url?: string; tidy?: true }
/** What this command needs of stdin. `unref` is absent when stdin is a file rather than a pipe. */
type RequestStream = Pick<NodeJS.ReadableStream, "on" | "once"> & { unref?: () => unknown };

const MAX_REQUEST_BYTES = 16 * 1024;
const STOPPED = "The import was stopped. No website was created.";

/**
 * `tovu import-local`: makes a NEW site from a .tovu.zip or share link with no running server, for
 * the desktop app. The same backend the admin routes serve does the verification, staging, restore
 * and rollback; this only supplies what those routes get from a session.
 *
 * The request arrives as the first line of bounded stdin, because a share link's token must not
 * become argv. The desktop keeps stdin open afterwards and closes it to stop the import: that works
 * on every platform and also fires when the app crashes. `{"tidy":true}` only clears leftovers.
 *
 * Bytes: the verifier takes a whole buffered archive (300 MiB cap, refused before any read here),
 * so this runs in its own short-lived process rather than the app's. Peak memory is the archive
 * plus its expanded files, both capped by `SHARE_LIMITS`, and is gone when the process exits.
 *
 * @returns the new site, or `null` for a tidy request.
 * @throws {ValidationError} for an unusable request or an archive the importer refuses, in its words.
 * @complexity O(archive bytes + expanded bytes); two reads of the archive and one private copy.
 */
export async function runImportLocalCommand(
  _required: Record<string, never> = {},
  optional: {
    readRequest?: () => Promise<string>;
    workspace?: SitesWorkspace;
    backend?: SiteImportBackend;
    mintOwnerPassword?: () => string;
    writeStdout?: (text: string) => void;
    /** Aborts the import; the backend then removes its stage and any half-made site, as for any failure. */
    signal?: AbortSignal;
  } = {},
): Promise<ImportLocalResult | null> {
  const stop = new AbortController();
  const text = await (optional.readRequest ?? (() => readRequestLine({ input: process.stdin, stop })))();
  const request = parseRequest({ text });
  const workspace = optional.workspace ?? createSitesWorkspace({});
  const backend = optional.backend ?? composeSiteImportBackend({ workspaceId: LOCAL_WORKSPACE, workspace, savedKeys: { restore: leaveSavedKeysOut },
    // The desktop starts the new site itself once it has the result.
    startSite: async () => ({ adminUrl: null, status: "stopped" }),
  });
  if (request.tidy) { await backend.tidy({}); return null; }
  const signal = optional.signal ?? terminationSignal({ stop });
  const done = await inPlainWords(async () => {
    const source = await resolveSource({ request, backend });
    const staged = await backend.importBackup({ principalId: LOCAL_PRINCIPAL, source }, { signal });
    return backend.completeOwner({ principalId: LOCAL_PRINCIPAL, importId: staged.importId, adminPassword: (optional.mintOwnerPassword ?? mintOwnerPassword)() }, { signal });
  });
  const result = localResult({ view: done, home: workspace.home({}) });
  (optional.writeStdout ?? ((line: string) => process.stdout.write(line)))(`${JSON.stringify(result)}\n`);
  return result;
}

/**
 * Aborts on SIGTERM. The backend's own failure path then discards the stage and the half-made site.
 * Without this handler SIGTERM would end the process mid-write and leave that partial site on disk.
 * The desktop stops this process through stdin instead, see {@link readRequestLine}.
 */
function terminationSignal({ stop }: { stop: AbortController }): AbortSignal {
  process.once("SIGTERM", () => stop.abort(new ValidationError(STOPPED)));
  return stop.signal;
}

/**
 * The first line of stdin, then keeps watching: stdin ending after that line aborts `stop`. Input
 * that ends with no newline is still a request, with nothing left to watch. Later bytes are dropped.
 * `unref` lets the process exit once its work is done, with the stream still open.
 * @throws {ValidationError} when the request is over {@link MAX_REQUEST_BYTES}.
 * @complexity O(request bytes); holds at most one chunk past the cap.
 */
export function readRequestLine({ input, stop }: { input: RequestStream; stop: AbortController }, _optional: Record<string, never> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    let received: Buffer = Buffer.alloc(0), finishedReading = false, lineSeen = false;
    input.on("data", (chunk: string | Buffer) => {
      if (finishedReading) return;
      received = Buffer.concat([received, Buffer.from(chunk)]);
      const newline = received.indexOf(10);
      if ((newline === -1 ? received.length : newline) > MAX_REQUEST_BYTES) {
        finishedReading = true;
        reject(new ValidationError("import-local: the request on stdin is too large."));
      } else if (newline !== -1) {
        finishedReading = lineSeen = true;
        input.unref?.();
        resolve(received.subarray(0, newline).toString("utf8"));
      }
    });
    const ended = () => {
      if (lineSeen) stop.abort(new ValidationError(STOPPED));
      else resolve(received.toString("utf8"));
    };
    input.once("end", ended);
    input.once("close", ended);
    input.once("error", ended);
  });
}

/**
 * The new owner's password. An archive carries no accounts, and the importer rightly refuses the
 * shipped default, so the site gets a strong password nobody knows. Nobody needs it on this host:
 * the desktop signs in with its one-time boot token, and `tovu reset-owner` sets a known one for
 * anyone who later serves the site elsewhere. It replaces nothing, and is never printed or stored.
 */
function mintOwnerPassword(): string {
  return randomBytes(32).toString("base64url");
}

function parseRequest({ text }: { text: string }): ImportLocalRequest {
  let raw: ImportLocalRequest & { [key: string]: unknown };
  try {
    raw = JSON.parse(text) as typeof raw;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("shape");
  } catch { throw new ValidationError("import-local: stdin must contain one JSON request object."); }
  if (raw.tidy === true && Object.keys(raw).length === 1) return { tidy: true };
  if (Object.keys(raw).some(key => !["file", "url"].includes(key)) || (raw.file === undefined) === (raw.url === undefined)) {
    throw new ValidationError("import-local: provide exactly one of file or url.");
  }
  if (raw.file !== undefined && (typeof raw.file !== "string" || !path.isAbsolute(raw.file))) throw new ValidationError("import-local: file must be an absolute path.");
  return raw;
}

async function resolveSource({ request, backend }: { request: ImportLocalRequest; backend: SiteImportBackend }): Promise<SiteImportSource> {
  if (request.file === undefined) return { url: request.url! };
  const archive = await readBoundedArchive({ file: request.file });
  return { uploadId: (await backend.upload({ principalId: LOCAL_PRINCIPAL, archive })).uploadId };
}

/** Reads exactly the size it checked, so a file that grows after the check still cannot pass the cap. */
async function readBoundedArchive({ file }: { file: string }): Promise<Buffer> {
  let handle: fsp.FileHandle;
  try { handle = await fsp.open(file, "r"); }
  catch (error) { throw new ValidationError(`That file could not be opened (${(error as NodeJS.ErrnoException).code ?? "unknown error"}). No website was created.`); }
  try {
    const { size } = await handle.stat();
    if (size > SHARE_LIMITS.maxArchiveBytes) throw new ValidationError("That file is over the 300 MiB import limit. No website was created.");
    const archive = Buffer.allocUnsafe(size);
    const { bytesRead } = await handle.read(archive, 0, size, 0);
    return archive.subarray(0, bytesRead);
  } finally { await handle.close(); }
}

/** The importer's refusals are already written for a person; anything else keeps its raw text for details. */
async function inPlainWords<T>(run: () => Promise<T>): Promise<T> {
  try { return await run(); }
  catch (error) {
    if (error instanceof SiteShareRefusal) throw new ValidationError(error.message);
    // The zip reader's own sentence for a file that is not a zip; the person gets words they can act on.
    if (error instanceof Error && /end of central directory|not a zip file/i.test(error.message)) throw new ValidationError(NOT_A_ZIP);
    throw error;
  }
}

function localResult({ view, home }: { view: SiteImportView; home: string }): ImportLocalResult {
  const credentials = view.credentialWarnings.length;
  return {
    dir: path.join(home, view.newSiteName!),
    name: view.newSiteName!,
    siteId: view.newSiteId!,
    warnings: [...(view.warnings ?? []), ...(credentials ? [`${credentials} imported ${credentials === 1 ? "item looks" : "items look"} like saved credentials. Check them before publishing.`] : [])],
  };
}
