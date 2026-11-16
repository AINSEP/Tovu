# website/cli/commands — 2 slices (W1 #15). Written 2026-11-16 from Tovu `b28d38c6` / Jini `b7666092` (refactor/terra).
Skeleton: `make-sheet.py website/cli/commands --kind all`. KIND-SUSPECT: none. Kinds kept (MOVE integrity.ts, SPLIT import-local.ts).
Slice order: MV-commands-1, then SP-commands-1. Owner decisions needed: none.
untangle_overlap: C5.repoint.tsv:240 (`import-local.ts`: `FileLockTimeoutError` from `@jini-ai/platform/fs/file-lock` -> `@jini-ai/core/contracts/runtime`). SP-commands-1: **execute after wave B merge** (the C5 row edits line 4 of the same file; this sheet guards that file by blob, so run it after the C5 repoint lands and re-take the blob — the only expected diff is line 4). MV-commands-1 has no overlap and may run now.

---------------------------------------------------------------------------------------------------
## Slice MV-commands-1 (template T-MOVE)
```
id: MV-commands-1
feature: website/cli/commands
precondition: -
tovu_files:
  - apps/website/src/cli/commands/plugin/integrity.ts | blob 97cb5f2fc0acbffb41a4793c9bc07dbb6f640013 | delete
tovu_tests:
  - apps/website/src/cli/__tests__/unit/plugin-command.unit.test.ts | blob b48241e6afe6851dd2ae9347bb4263381aaae5a0 | keep-repointed
  - apps/website/src/cli/__tests__/unit/plugin-install-real-site.unit.test.ts | blob 13fe750153b899dc527f2ed8f5304010af7c755a | keep-repointed
other_guards:
  - apps/website/src/cli/program.ts | blob 08fde1b77cdb37dfcb3e1ca6a6ed12d700ddb408
jini_target: plugins ./host/node packages/plugins/src/host/node/integrity-command.ts
jini_guards:
  - packages/plugins/src/host/node/integrity-command.ts must not exist
  - packages/plugins/src/host/node/index.ts blob 234cf02e0252f03ac5beb9afe00435c9375ed909
  - rg -n "runPluginIntegrityCommand" packages/plugins/src -> prints nothing
symbol_map:
  - runPluginIntegrityCommand -> @jini-ai/plugins/host/node runPluginIntegrityCommand (shape already (required, optional = {}); unchanged)
values_injected: -     # no Tovu value: stdout default is generic, manifest names come from Jini plugin-format
leaf_import_rewrites:
  - 'import { computePluginIntegrity } from "@jini-ai/plugins/host/node";' -> "import { computePluginIntegrity } from './install.js';"
  - 'import { PLUGIN_MANIFEST_FILENAME, PLUGIN_MANIFEST_FILENAMES } from "@jini-ai/plugins/host";' -> "import { PLUGIN_MANIFEST_FILENAME, PLUGIN_MANIFEST_FILENAMES } from '../plugin-format.js';"
header_rewrite: |
  insert as line 1 (above `import path from "node:path";`), the file has no @file block today:
  /** Plugin authoring helper: prints (and with `write`, stores into the manifest) the integrity map of a plugin folder. */
  (keep the existing line-7 comment "/** Authoring helper: hashes bytes only; never imports the package's entry point. */" unchanged above the function)
why_moves: -
deletions_in_copy: -
entry: -   # existing subpath ./host/node; index edit below
jini_index: packages/plugins/src/host/node/index.ts: after "export * from './runtime-core.js';" insert "export * from './integrity-command.js';"
census:
  cmd: rg -n --no-heading -F "commands/plugin/integrity" apps content development --glob '!**/node_modules/**'
  allowed: [apps/website/src/cli/program.ts:4, apps/website/src/cli/__tests__/unit/plugin-command.unit.test.ts:12, apps/website/src/cli/__tests__/unit/plugin-install-real-site.unit.test.ts:11]
importer_edits:
  - apps/website/src/cli/program.ts:4: 'import { runPluginIntegrityCommand } from "./commands/plugin/integrity.js";' -> 'import { runPluginIntegrityCommand } from "@jini-ai/plugins/host/node";'
  - apps/website/src/cli/__tests__/unit/plugin-command.unit.test.ts:12: 'import { runPluginIntegrityCommand } from "../../commands/plugin/integrity.js";' -> 'import { runPluginIntegrityCommand } from "@jini-ai/plugins/host/node";'
  - apps/website/src/cli/__tests__/unit/plugin-install-real-site.unit.test.ts:11: 'import { runPluginIntegrityCommand } from "../../commands/plugin/integrity.js";' -> 'import { runPluginIntegrityCommand } from "@jini-ai/plugins/host/node";'
test_edits: none; no test moves (both Tovu test files also exercise Tovu install/real-site code; they keep every assertion and only the import line changes)
changeset: .changeset/plugins-integrity-command.md: '---\n"@jini-ai/plugins": minor\n---\n\nAdd `runPluginIntegrityCommand` to `@jini-ai/plugins/host/node`: prints a plugin folder''s integrity map and optionally writes it into the manifest atomically.\n'
jini_msg: "feat(plugins): runPluginIntegrityCommand authoring helper in host/node" | body "Moved from a host CLI; it only hashes bytes and rewrites the manifest through a staged rename."
tovu_msg: "refactor(cli): plugin integrity command from @jini-ai/plugins/host/node" | body "The command body moved to Jini unchanged; program.ts and the tests import it from there."
extra_stops: if `rg -n "integrity" packages/plugins/src/host/node/index.ts` prints a line, STOP (someone added it).
```
Copy check: the Jini file after edits is the Tovu file (22 lines) + 1 header line, with only the two import lines changed. `process.stdout.write` is the default output (not `console.*`, not env) and is allowed.

---------------------------------------------------------------------------------------------------
## Slice SP-commands-1 (template T-SPLIT) — execute after wave B merge (C5 row 240)
```
id: SP-commands-1
feature: website/cli/commands
tovu_files:
  - apps/website/src/cli/commands/import-local.ts | blob e75c1bf5cd217b000bda1135f9405a571471530b (pre-C5; after the C5 merge re-take the blob and check `git diff b28d38c6 -- <file>` changes only line 4)
split:
  - LOCAL_PRINCIPAL, LOCAL_WORKSPACE, IMPORT_BUSY, NOT_A_ZIP, MAX_REQUEST_BYTES, STOPPED | STAY-PRODUCT
  - ImportLocalResult | STAY-PRODUCT
  - ImportLocalRequest | STAY-PRODUCT
  - RequestStream (type, line 21) | DELETE (replaced by Jini `RequestLineStream`)
  - runImportLocalCommand | STAY-PRODUCT
  - terminationSignal | STAY-PRODUCT
  - readRequestLine | MOVE -> packages/cli/src/stdin-line.ts as `readStdinRequestLine`; Tovu keeps `readRequestLine` as a binding (STAY-WIRING) that passes its byte cap and its two ValidationError builders
  - mintOwnerPassword, parseRequestObject, parseRequest, resolveSource, readBoundedArchive, inPlainWords, localResult | STAY-PRODUCT
ports: -   (no port: the two error builders and the cap are plain optional values)
shape_changes: - (Tovu `readRequestLine` keeps its exact signature; all 9 test calls and line 56 stay unchanged)
jini_code: |
  NEW packages/cli/src/stdin-line.ts, exactly:
  /**
   * @module stdin-line
   *
   * Reads a one-line request from a stream (normally stdin) and then keeps watching that stream.
   * A secret sent this way (for example a link token) never becomes argv. A parent process that
   * keeps the stream open after the line and closes it to cancel gets cancellation on every
   * platform, and also when the parent crashes.
   */
  import { PayloadTooLargeError } from './prompt.js';

  /** What this reader needs of the stream. `unref` is absent when stdin is a file rather than a pipe. */
  export type RequestLineStream = Pick<NodeJS.ReadableStream, 'on' | 'once'> & { unref?: () => unknown };

  export interface ReadStdinRequestLineOptions {
    /** Longest accepted line in bytes, newline excluded. Default 16 KiB. */
    maxBytes?: number;
    /** The rejection when the line is over `maxBytes`. Default: a `PayloadTooLargeError`. */
    tooLarge?: () => Error;
    /** The abort reason set on `stop` when the stream ends after the line was read. */
    stopped?: () => unknown;
  }

  const DEFAULT_MAX_BYTES = 16 * 1024;

  /**
   * The first line of `input`, then keeps watching: the stream ending after that line aborts `stop`.
   * Input that ends with no newline is still a request, with nothing left to watch. Later bytes are dropped.
   * `unref` lets the process exit once its work is done, with the stream still open.
   * @throws {PayloadTooLargeError} (or the error `tooLarge` builds) when the line is over `maxBytes`.
   * @complexity O(request bytes); holds at most one chunk past the cap.
   */
  export function readStdinRequestLine(
    { input, stop }: { input: RequestLineStream; stop: AbortController },
    optional: ReadStdinRequestLineOptions = {},
  ): Promise<string> {
    const maxBytes = optional.maxBytes ?? DEFAULT_MAX_BYTES;
    const tooLarge = optional.tooLarge ?? (() => new PayloadTooLargeError({ message: 'The request line is too large.' }));
    const stopped = optional.stopped ?? (() => new Error('The input ended, so the operation was stopped.'));
    return new Promise((resolve, reject) => {
      let received: Buffer = Buffer.alloc(0), finishedReading = false, lineSeen = false;
      input.on('data', (chunk: string | Buffer) => {
        if (finishedReading) return;
        received = Buffer.concat([received, Buffer.from(chunk)]);
        const newline = received.indexOf(10);
        if ((newline === -1 ? received.length : newline) > maxBytes) {
          finishedReading = true;
          reject(tooLarge());
        } else if (newline !== -1) {
          finishedReading = lineSeen = true;
          input.unref?.();
          resolve(received.subarray(0, newline).toString('utf8'));
        }
      });
      const ended = () => {
        if (lineSeen) stop.abort(stopped());
        else resolve(received.toString('utf8'));
      };
      input.once('end', ended);
      input.once('close', ended);
      input.once('error', ended);
    });
  }
jini_index: packages/cli/src/index.ts: after "export * from './prompt.js';" insert "export * from './stdin-line.js';"
jini_guards:
  - packages/cli/src/stdin-line.ts must not exist; packages/cli/src/__tests__/stdin-line.test.ts must not exist
  - packages/cli/src/index.ts blob be766abb51e94c25f798ccdb98d469d38933fa84
  - rg -n "readStdinRequestLine|RequestLineStream" packages/cli/src -> prints nothing
tovu_reduced: |
  apps/website/src/cli/commands/import-local.ts:
  (a) after line 4 (the FileLockTimeoutError import, whatever its specifier is after C5) insert:
      import { readStdinRequestLine, type RequestLineStream } from "@jini-ai/cli";
  (b) delete the two lines
      /** What this command needs of stdin. `unref` is absent when stdin is a file rather than a pipe. */
      type RequestStream = Pick<NodeJS.ReadableStream, "on" | "once"> & { unref?: () => unknown };
  (c) replace from "/**\n * The first line of stdin, then keeps watching" (the doc block above readRequestLine) through the
      closing "}" of readRequestLine (the line after `  });` that ends the Promise) with exactly:
  /**
   * The request line on stdin with this command's cap and wording; reading and the stop-on-close watch
   * are `readStdinRequestLine` in `@jini-ai/cli`.
   * @throws {ValidationError} when the request is over {@link MAX_REQUEST_BYTES}.
   */
  export function readRequestLine({ input, stop }: { input: RequestLineStream; stop: AbortController }, _optional: Record<string, never> = {}): Promise<string> {
    return readStdinRequestLine({ input, stop }, {
      maxBytes: MAX_REQUEST_BYTES,
      tooLarge: () => new ValidationError({ message: "import-local: the request on stdin is too large." }),
      stopped: () => new ValidationError({ message: STOPPED }),
    });
  }
  Nothing else in the file changes (line 56 call and the `{@link readRequestLine}` at line 78 stay valid).
binding_edits: -
tests_split:
  - apps/website/src/cli/__tests__/integration/import-local.integration.test.ts | blob ddee2eae466c04094d351e01afae1c454a4152d0: stays in Tovu, NO edit (it calls the Tovu binding `readRequestLine`, which keeps the ValidationError name/messages and the 16 KiB cap it asserts).
  - NEW Jini packages/cli/src/__tests__/stdin-line.test.ts, exactly:
    import { EventEmitter } from 'node:events';
    import { PassThrough } from 'node:stream';
    import { describe, expect, it } from 'vitest';
    import { PayloadTooLargeError } from '../prompt.js';
    import { readStdinRequestLine } from '../stdin-line.js';

    describe('readStdinRequestLine', () => {
      it('returns the first line without waiting for the stream to end', async () => {
        const input = new PassThrough();
        const stop = new AbortController();
        const line = readStdinRequestLine({ input, stop });
        input.write('{"file":');
        input.write('"/a.zip"}\nignored later bytes');
        expect(await line).toBe('{"file":"/a.zip"}');
        expect(stop.signal.aborted).toBe(false);
      });

      it('aborts stop with the stopped() reason when the stream ends after the line, and unrefs it', async () => {
        const input = Object.assign(new PassThrough(), { unrefCalls: 0, unref() { this.unrefCalls += 1; } });
        const stop = new AbortController();
        const reason = new Error('stopped by the parent');
        const line = readStdinRequestLine({ input, stop }, { stopped: () => reason });
        input.write('{"file":"/a.zip"}\n');
        await line;
        expect(input.unrefCalls).toBe(1);
        const aborted = new Promise(resolve => stop.signal.addEventListener('abort', resolve));
        input.end();
        await aborted;
        expect(stop.signal.reason).toBe(reason);
      });

      for (const [name, finish] of [['closed', (i: EventEmitter) => i.emit('close')], ['broken', (i: EventEmitter) => i.emit('error', new Error('EPIPE'))]] as const) {
        it(`aborts when the stream is ${name} after the line`, async () => {
          const input = new EventEmitter();
          const stop = new AbortController();
          const line = readStdinRequestLine({ input: input as never, stop });
          input.emit('data', Buffer.from('{"file":"/a.zip"}\n'));
          await line;
          finish(input);
          expect(stop.signal.aborted).toBe(true);
        });
      }

      it('treats input that ends with no newline as the request, with nothing to stop', async () => {
        const input = new PassThrough();
        const stop = new AbortController();
        const line = readStdinRequestLine({ input, stop });
        input.end('{"file":"/a.zip"}');
        expect(await line).toBe('{"file":"/a.zip"}');
        await new Promise(resolve => setTimeout(resolve, 5));
        expect(input.destroyed).toBe(true);
        expect(stop.signal.aborted).toBe(false);
      });

      for (const [name, chunk] of [['with no newline', 'x'.repeat(16 * 1024 + 1)], ['whose newline comes past the cap', 'x'.repeat(16 * 1024 + 1) + '\n']] as const) {
        it(`rejects a line ${name} with PayloadTooLargeError by default`, async () => {
          const input = new PassThrough();
          const line = readStdinRequestLine({ input, stop: new AbortController() });
          input.write(chunk);
          await expect(line).rejects.toBeInstanceOf(PayloadTooLargeError);
        });
      }

      it('reads a line exactly at the cap, and honours maxBytes and tooLarge', async () => {
        const exact = new PassThrough();
        const line = readStdinRequestLine({ input: exact, stop: new AbortController() });
        exact.write('x'.repeat(16 * 1024) + '\n');
        expect((await line).length).toBe(16 * 1024);
        const small = new PassThrough();
        const refused = readStdinRequestLine({ input: small, stop: new AbortController() }, { maxBytes: 3, tooLarge: () => new RangeError('custom') });
        small.write('abcd\n');
        await expect(refused).rejects.toThrow(RangeError);
      });
    });
changeset: .changeset/cli-stdin-request-line.md: '---\n"@jini-ai/cli": minor\n---\n\nAdd `readStdinRequestLine` (and `RequestLineStream`): read a bounded one-line request from stdin, then abort a controller when the stream ends.\n'
census: rg -n --no-heading "readRequestLine|RequestStream" apps --glob '!**/node_modules/**' | allowed: import-local.ts lines (the binding, its call at 56, the {@link} at 78) and import-local.integration.test.ts:13,131,141,156,167,179,187,195
jini_msg: "feat(cli): readStdinRequestLine, a bounded one-line stdin request reader with stop-on-close" | tovu_msg: "refactor(cli): import-local reads its request with @jini-ai/cli readStdinRequestLine" | body "Tovu keeps the 16 KiB cap and its two ValidationError messages as options."
extra_stops: if `import-local.ts` (after the C5 merge) differs from b28d38c6 anywhere except line 4, SKIP. If packages/cli/tsconfig lacks node types (`rg -n '"types"' packages/cli/tsconfig*.json` shows a list without "node"), STOP.
```
Expected cloud run: Jini `npm --prefix packages/cli run test -- stdin-line`, plugins typecheck; Tovu typecheck, `import-local.integration.test.ts`, `plugin-command.unit.test.ts`, `plugin-install-real-site.unit.test.ts`.
