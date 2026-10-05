/**
 * @file Minimal typings for the slice of `yazl` that `build-zip.ts` uses.
 *
 * `yazl` ships no declarations and `@types/yazl` is not installed (the root `npm install` cannot
 * currently add it: npm rejects the `workspace:*` specifiers in this repo's manifests). Without this
 * file the fixture's `import * as yazl` is an implicit `any` (TS7016) and every call below goes
 * unchecked. Shapes follow node_modules/yazl/README.md; extend this file, never cast, if a test needs
 * more of the API. Swap it for `@types/yazl` once that package can be installed.
 */
declare module "yazl" {
  /** The per-entry options `build-zip.ts` passes (README: `addBuffer`/`addEmptyDirectory` options). */
  export interface EntryOptions {
    mtime?: Date;
    mode?: number;
    compress?: boolean;
    forceZip64Format?: boolean;
  }

  export class ZipFile {
    constructor();
    addBuffer(buffer: Buffer, metadataPath: string, options?: EntryOptions): void;
    addEmptyDirectory(metadataPath: string, options?: Pick<EntryOptions, "mtime" | "mode">): void;
    end(): void;
    readonly outputStream: NodeJS.ReadableStream;
  }
}
