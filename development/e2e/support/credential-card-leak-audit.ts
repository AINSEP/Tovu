import { createReadStream } from "node:fs";
import { lstat, readdir, readFile, readlink, realpath, rm, symlink } from "node:fs/promises";
import { createGunzip } from "node:zlib";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { fromBuffer } from "yauzl";
import { expect, type APIResponse, type ConsoleMessage, type Page, type Response, type TestInfo, type WebError } from "@playwright/test";

/** Todo 18's exact-byte oracle. Reuse decision: the product/Jini scanners recognize secret
 * shapes; this journey needs arbitrary canary bytes, including SQLite binary pages. Node's
 * Buffer.indexOf owns that operation. Site/process/reset ownership stays in bug-pin-fixtures.
 * Never include source contents, canaries, URLs or exception bodies in failure diagnostics.
 */
export async function createCredentialLeakAudit(
  { page, testInfo, canaries }: { page: Page; testInfo: TestInfo; canaries: readonly string[] }, _options = {},
) {
  const needles = canaries.map(value => Buffer.from(value, "utf8"));
  const overlap = Math.max(...needles.map(value => value.length)) - 1;
  const leaks = new Set<string>();
  const failures = new Set<string>();
  const scannedFiles = new Set<string>();
  const pending = new Set<Promise<void>>();
  const counts = { bodies: 0, streamBytes: 0, console: 0, files: 0, sqlValues: 0 };
  const cliRoot = path.resolve(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"));
  const projectRoot = path.join(cliRoot, "projects");

  async function entries({ dir, optional = false }: { dir: string; optional?: boolean }, _options = {}) {
    try { return await readdir(dir, { withFileTypes: true }); }
    catch (error) {
      if (optional && (error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw new Error("Canary scan could not enumerate an evidence directory");
    }
  }
  const priorProjects = new Set((await entries({ dir: projectRoot, optional: true })).map(entry => entry.name));
  const latestDebugLink = path.join(cliRoot, "debug", "latest");
  const priorDebugLink = await readlink(latestDebugLink).catch(error => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error("Could not record CLI debug link ownership");
  });

  function contains({ bytes }: { bytes: Buffer }, _options = {}) {
    return needles.some(needle => bytes.indexOf(needle) !== -1);
  }
  function scan({ source, bytes }: { source: string; bytes: Buffer | string }, _options = {}) {
    if (contains({ bytes: typeof bytes === "string" ? Buffer.from(bytes, "utf8") : bytes })) leaks.add(source);
  }
  function track({ work, source }: { work: Promise<void>; source: string }, _options = {}) {
    const guarded = work.catch(() => { failures.add(source); }).finally(() => pending.delete(guarded));
    pending.add(guarded);
  }
  async function drain(_required = {}, _options = {}) {
    while (pending.size) await Promise.all([...pending]);
  }
  async function scanApiResponse({ response }: { response: APIResponse }, _options = {}) {
    scan({ source: "API response URL", bytes: response.url() });
    scan({ source: "API response headers", bytes: JSON.stringify(response.headers()) });
    scan({ source: "API response body", bytes: await response.body() });
    counts.bodies++;
  }
  async function assertClean(_required = {}, _options = {}) {
    await drain();
    expect(failures.size, "all response/log captures completed").toBe(0);
    expect(leaks.size, "canary hits across responses, logs, transcripts and persistence").toBe(0);
  }

  // A binary positive control, with each canary split over two chunks, prevents F5.2/F5.6:
  // a vacuous negative check or a scanner that cannot see binary/chunk-boundary occurrences.
  for (const needle of needles) {
    const split = Math.floor(needle.length / 2);
    const left = Buffer.concat([Buffer.from([0, 255]), needle.subarray(0, split)]);
    const right = Buffer.concat([needle.subarray(split), Buffer.from([0, 254])]);
    expect(contains({ bytes: Buffer.concat([left.subarray(-overlap), right]) }), "binary scan positive control").toBe(true);
  }

  const cdp = await page.context().newCDPSession(page);
  const streams = new Map<string, { tail: Buffer; chunksBeforeBuffer: Buffer[]; ready: boolean }>();
  await cdp.send("Network.enable");
  function streamChunk({ id, bytes }: { id: string; bytes: Buffer }, _options = {}) {
    const stream = streams.get(id)!;
    const combined = Buffer.concat([stream.tail, bytes]);
    scan({ source: "HTTP event stream", bytes: combined });
    stream.tail = combined.subarray(-overlap);
    counts.streamBytes += bytes.length;
  }
  cdp.on("Network.dataReceived", event => {
    const stream = streams.get(event.requestId);
    if (!stream || !event.data) return;
    const bytes = Buffer.from(event.data, "base64");
    if (stream.ready) streamChunk({ id: event.requestId, bytes });
    else stream.chunksBeforeBuffer.push(bytes);
  });
  cdp.on("Network.responseReceived", event => {
    if (event.response.mimeType !== "text/event-stream") return;
    const stream = { tail: Buffer.alloc(0), chunksBeforeBuffer: [] as Buffer[], ready: false };
    streams.set(event.requestId, stream);
    track({ source: "capture HTTP event stream", work: (async () => {
      // Unlike response.body(), CDP exposes bytes while an SSE response is still open.
      const buffered = await cdp.send("Network.streamResourceContent", { requestId: event.requestId });
      streamChunk({ id: event.requestId, bytes: Buffer.from(buffered.bufferedData, "base64") });
      for (const bytes of stream.chunksBeforeBuffer) streamChunk({ id: event.requestId, bytes });
      stream.chunksBeforeBuffer.length = 0;
      stream.ready = true;
    })() });
  });
  const responseListener = (response: Response) => {
    track({ source: "capture HTTP response", work: (async () => {
      scan({ source: "HTTP response URL", bytes: response.url() });
      scan({ source: "HTTP response headers", bytes: JSON.stringify(await response.allHeaders()) });
      const mime = (await response.headerValue("content-type")) ?? "";
      if (mime.includes("text/event-stream")) return; // scanned incrementally above
      if ([204, 205, 304].includes(response.status()) || response.request().method() === "HEAD"
        || (response.status() >= 300 && response.status() < 400)) return; // no response body
      scan({ source: "HTTP response body", bytes: await response.body() });
      counts.bodies++;
    })() });
  };
  const consoleListener = (message: ConsoleMessage) => {
    counts.console++;
    scan({ source: "browser console", bytes: message.text() });
    for (const arg of message.args()) track({ source: "capture console argument", work: (async () => {
      scan({ source: "browser console argument", bytes: JSON.stringify(await arg.jsonValue()) ?? "" });
    })() });
  };
  const errorListener = (webError: WebError) => {
    const error = webError.error();
    scan({ source: "browser error", bytes: error.stack ?? error.message });
  };
  page.context().on("response", responseListener);
  page.context().on("console", consoleListener);
  page.context().on("weberror", errorListener);
  page.on("websocket", socket => {
    let tail = Buffer.alloc(0);
    socket.on("framereceived", event => {
      const bytes = Buffer.concat([tail, Buffer.from(event.payload)]);
      scan({ source: "WebSocket response", bytes });
      tail = bytes.subarray(-overlap);
    });
  });

  async function scanReadable({ stream, source }: { stream: AsyncIterable<Buffer | string>; source: string }, _options = {}) {
    let tail = Buffer.alloc(0);
    for await (const chunk of stream) {
      const bytes = Buffer.concat([tail, Buffer.from(chunk)]);
      scan({ source, bytes });
      tail = bytes.subarray(-overlap);
    }
  }
  async function scanZip({ file }: { file: string }, _options = {}) {
    // Use the installed archive reader rather than treating compressed evidence as plaintext.
    const bytes = await readFile(file);
    await new Promise<void>((resolve, reject) => fromBuffer(bytes, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) { reject(new Error("Could not open archived evidence")); return; }
      zip.on("error", reject); zip.on("end", resolve);
      zip.on("entry", entry => {
        if (entry.fileName.endsWith("/")) { zip.readEntry(); return; }
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) { zip.close(); reject(new Error("Could not read archived evidence")); return; }
          void scanReadable({ stream, source: "decompressed archive entry" }).then(() => zip.readEntry(), error => {
            zip.close(); reject(error);
          });
        });
      });
      zip.readEntry();
    }));
  }
  async function scanTree({ dir, optional = false }: { dir: string; optional?: boolean }, _options = {}): Promise<void> {
    const visited = new Set<string>();
    async function walk({ dir, optional = false }: { dir: string; optional?: boolean }, _options = {}): Promise<void> {
      const children = await entries({ dir, optional });
      if (optional && children.length === 0) return;
      const canonical = await realpath(dir);
      if (visited.has(canonical)) return;
      visited.add(canonical);
      for (const entry of children) {
        const file = path.join(dir, entry.name);
        const target = entry.isSymbolicLink() ? await realpath(file) : file;
        const stat = entry.isSymbolicLink() ? await lstat(target) : entry;
        if (stat.isDirectory()) await walk({ dir: target });
        else if (stat.isFile()) {
          try {
            await scanReadable({ stream: createReadStream(target), source: "persisted file" });
            if (/\.(?:gz|tgz)$/i.test(target)) {
              await scanReadable({ stream: createReadStream(target).pipe(createGunzip()), source: "decompressed gzip evidence" });
            } else if (/\.zip$/i.test(target)) await scanZip({ file: target });
            scannedFiles.add(file); counts.files++;
          } catch { throw new Error("Canary scan could not read an evidence file"); }
        }
      }
    }
    await walk({ dir, optional });
  }

  async function scanDatabase({ file }: { file: string }, _options = {}) {
    const db = new Database(file, { fileMustExist: true }); // SELECT-only; WAL readers need SHM access
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>;
      for (const { name } of tables) {
        const identifier = '"' + name.replaceAll('"', '""') + '"';
        for (const row of db.prepare<[], Record<string, unknown>>(`SELECT * FROM ${identifier}`).iterate()) {
          for (const value of Object.values(row)) {
            if (typeof value === "string" || Buffer.isBuffer(value)) {
              scan({ source: "SQLite field", bytes: value });
              counts.sqlValues++;
            }
          }
        }
      }
    } finally { db.close(); }
  }

  async function browserSnapshot(_required = {}, _options = {}) {
    for (const frame of page.frames()) {
      scan({ source: "rendered transcript/card HTML", bytes: await frame.content() });
      const sandbox = frame.parentFrame() ? await (await frame.frameElement()).getAttribute("sandbox") : null;
      const opaque = sandbox !== null && !sandbox.split(/\s+/).includes("allow-same-origin");
      const state = await frame.evaluate(async opaque => {
        const mirrors = (window as unknown as { __tovuAssistantMessages?: unknown }).__tovuAssistantMessages;
        // Credential iframes have an opaque sandbox origin: storage is unavailable there.
        if (opaque || globalThis.origin === "null" || !/^https?:$/.test(location.protocol)) return { mirrors };
        const stores: string[] = [];
        const binary: number[][] = [];
        const visitedValues = new WeakSet<object>();
        async function collectBinary(value: unknown): Promise<void> {
          if (typeof value === "string") { stores.push(value); return; }
          if (!value || typeof value !== "object" || visitedValues.has(value)) return;
          visitedValues.add(value);
          if (value instanceof Blob) binary.push([...new Uint8Array(await value.arrayBuffer())]);
          else if (value instanceof ArrayBuffer) binary.push([...new Uint8Array(value)]);
          else if (ArrayBuffer.isView(value)) binary.push([...new Uint8Array(value.buffer, value.byteOffset, value.byteLength)]);
          else if (value instanceof Map) { for (const [key, entry] of value) { await collectBinary(key); await collectBinary(entry); } }
          else if (value instanceof Set) { for (const entry of value) await collectBinary(entry); }
          else { for (const [key, entry] of Object.entries(value)) { stores.push(key); await collectBinary(entry); } }
        }
        for (const info of await indexedDB.databases()) {
          if (!info.name) continue;
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const opening = indexedDB.open(info.name!);
            opening.onsuccess = () => resolve(opening.result); opening.onerror = () => reject(opening.error);
          });
          try {
            for (const name of db.objectStoreNames) {
              const values = await new Promise((resolve, reject) => {
                const transaction = db.transaction(name, "readonly");
                const request = transaction.objectStore(name).getAll();
                request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
              });
              await collectBinary(values);
              const keys = await new Promise((resolve, reject) => {
                const request = db.transaction(name, "readonly").objectStore(name).getAllKeys();
                request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
              });
              await collectBinary(keys);
            }
          } finally { db.close(); }
        }
        const cachesContent: string[] = [];
        for (const name of await caches.keys()) {
          const cache = await caches.open(name);
          for (const request of await cache.keys()) {
            const response = await cache.match(request);
            if (response) cachesContent.push(JSON.stringify({ url: request.url, headers: [...response.headers], body: await response.text() }));
          }
        }
        return { mirrors, local: { ...localStorage }, session: { ...sessionStorage }, stores, cachesContent, binary };
      }, opaque);
      scan({ source: "browser persisted chat stores/mirror/cache", bytes: JSON.stringify(state) });
      for (const bytes of state.binary ?? []) scan({ source: "browser persisted binary value", bytes: Buffer.from(bytes) });
    }
    scan({ source: "browser storage state", bytes: JSON.stringify(await page.context().storageState({ indexedDB: true })) });
  }

  async function finishAfterSiteCleanup({ siteDir }: { siteDir: string }, _options = {}) {
    // This runs in a WORKER fixture, after bug-pin-fixtures stopped its daemon and attached
    // stdout/stderr. Read everything reachable in Claude's config, but delete only fresh
    // project/session artifacts whose transcript establishes this test's unique cwd.
    const ownedProjects: string[] = [];
    const sessionIds = new Set<string>();
    try {
      for (const entry of await entries({ dir: projectRoot })) {
        if (!entry.isDirectory() || priorProjects.has(entry.name)) continue;
        const dir = path.join(projectRoot, entry.name);
        const transcripts = (await entries({ dir })).filter(file => file.isFile() && file.name.endsWith(".jsonl"));
        let owned = false;
        for (const transcript of transcripts) {
          const lines = (await readFile(path.join(dir, transcript.name), "utf8")).split("\n").filter(Boolean);
          for (const line of lines) {
            const record = JSON.parse(line) as { cwd?: string; sessionId?: string };
            // macOS may canonicalize /var and /tmp to /private before Claude records cwd.
            const cwd = record.cwd?.replace(/^\/(var|tmp)\//, "/private/$1/");
            const expected = siteDir.replace(/^\/(var|tmp)\//, "/private/$1/");
            if (cwd === expected) { owned = true; if (record.sessionId) sessionIds.add(record.sessionId); }
          }
        }
        if (owned) ownedProjects.push(dir);
      }
      await scanTree({ dir: cliRoot });
      expect(ownedProjects.length, "a real Local CLI transcript was scanned").toBeGreaterThan(0);
      const log = testInfo.attachments.find(attachment => attachment.name === "pin-server.log");
      expect(log, "harness stdout/stderr evidence must exist after site teardown").toBeDefined();
      for (const attachment of testInfo.attachments) {
        if (attachment.body) scan({ source: "test attachment", bytes: attachment.body });
        if (attachment.path) scan({ source: "test attachment file", bytes: await readFile(attachment.path) });
      }
      await scanTree({ dir: testInfo.outputDir });
      expect(counts.bodies, "response scan is nonempty").toBeGreaterThan(0);
      expect(counts.streamBytes, "raw SSE response bytes were scanned").toBeGreaterThan(0);
      expect(counts.sqlValues, "persisted SQLite values were scanned").toBeGreaterThan(0);
      await assertClean();
    } finally {
      // Only uniquely owned, newly created project directories and UUID-named CLI artifacts.
      for (const dir of ownedProjects) await rm(dir, { recursive: true, force: true });
      for (const id of sessionIds) {
        if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Unexpected owned CLI session identity");
        for (const relative of [`debug/${id}.txt`, `session-env/${id}`, `file-history/${id}`, `tasks/${id}`]) {
          await rm(path.join(cliRoot, relative), { recursive: true, force: true });
        }
        for (const entry of await entries({ dir: path.join(cliRoot, "todos"), optional: true })) {
          if (entry.name.startsWith(`${id}-agent-`)) await rm(path.join(cliRoot, "todos", entry.name), { force: true });
        }
      }
      const currentDebugLink = await readlink(latestDebugLink).catch(error => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw new Error("Could not check CLI debug link ownership");
      });
      if (currentDebugLink && sessionIds.has(path.basename(currentDebugLink, ".txt"))) {
        await rm(latestDebugLink);
        if (priorDebugLink !== undefined) await symlink(priorDebugLink, latestDebugLink);
      }
      for (const dir of ownedProjects) {
        const remaining = await lstat(dir).then(() => true, error => {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
          throw new Error("Could not verify owned CLI artifact deletion");
        });
        expect(remaining, "owned CLI transcript directory deleted").toBe(false);
      }
    }
  }

  return { scan, scanApiResponse, scanTree, scanDatabase, browserSnapshot, assertClean, scannedFiles, finishAfterSiteCleanup, async detach(_required = {}, _options = {}) {
    await drain();
    page.context().off("response", responseListener);
    page.context().off("console", consoleListener);
    page.context().off("weberror", errorListener);
    await cdp.detach();
  } };
}

export type CredentialLeakAudit = Awaited<ReturnType<typeof createCredentialLeakAudit>>;
