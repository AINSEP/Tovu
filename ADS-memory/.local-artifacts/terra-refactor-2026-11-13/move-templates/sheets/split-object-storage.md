# website/features/object-storage — 2 slices (W1 #27). Written 2026-11-16 from Tovu `b28d38c6` / Jini `b7666092` (refactor/terra), group D. Replaces the NOT FILLED triage sheet.
Paths: TOVU_CLONE=/Users/la/Programming/tovu-codex-trial-terra  JINI_CLONE=/Users/la/Programming/jini-terra-base. Run `scripts/census.py` from the Tovu root.

## Decisions (read first)
- `registry.ts` (MIXED): only `parseObjectStoresFile` is not wiring. It is a pure pass-through to `@jini-ai/platform/object-store` `parseObjectStoresFile` (same name, same signature). -> **DL-object-storage-1** (T-DELETE, in-file fold): the wrapper goes, the file's own 2 calls use the Jini function it already imports, 2 tests + the barrel repoint. The rest of `registry.ts` STAYS-WIRING (`defineProviderContribution`, the `tovu-object-stores.json` filename, the SigV4 host, bundled-source loading).
- `media-store.ts` (MIXED): the selection logic (env override -> site setting -> local, loud failures, private-bucket guard) is generic and moves; the env NAME (`TOVU_MEDIA_BLOB_STORE`), the setting NAME (`core.storage.mediaObjectStore`) and the local-disk store are Tovu values. **Target changed from the survey's `@jini-ai/platform` to `@jini-ai/cms/media`** (rule 5): the result is a `BlobStorePort` built with `blobStoreFromObjectStore`, both in `cms/media`; platform may not import cms. The local store comes in as a port (`local: () => ObjectStore`), so cms never imports platform; `ObjectStoreEnvDeclaration` is restated structurally in cms (identical 6 fields). Tovu keeps `createMediaBlobStore`/`readMediaStoreEnv`/`MEDIA_OBJECT_STORE_ENV` with their exact signatures as bindings, so `deps.ts`, the 457-line unit test, the barrel identity test and the two s3 overlay tests (`content/agent-plugin-overlays/s3-compatible/__tests__/*.mjs`, one imports `media-store.ts` by path) are untouched and keep exercising every moved branch. -> **SP-object-storage-1** (T-SPLIT).
- Order: DL-object-storage-1, then SP-object-storage-1 (independent files; any order works).
- untangle_overlap: none (no `*.repoint.tsv` row names an object-storage file; `deps.ts` is not edited). Both slices may run now, blob-guarded.
- blocked: no. Owner decisions: none. Tier: DL Sonnet; SP Sonnet + Opus review of the Jini file (ports + generic H).

---------------------------------------------------------------------------------------------------
## Slice DL-object-storage-1 (template T-DELETE, keep-only in-file fold)
```
id: DL-object-storage-1
tovu_file: apps/website/src/features/object-storage/registry.ts | blob db65c94137bfc9c1695417ff49905f215ab027b0
non_reexport_statements: 9 -> all kept except `parseObjectStoresFile` (the forwarder)
why_dead: forwarder: parseObjectStoresFile only calls @jini-ai/platform/object-store parseObjectStoresFile (imported here as parseObjectStoreDescriptors) with no host value
tovu_file_after: keep only: everything except the parseObjectStoresFile function and its doc block
file_after: today's file with exactly these 4 edits (each OLD occurs once):
  F1 OLD: '/** The file a plugin ships at its root to contribute object-store providers. */'
     NEW: '/** The file a plugin ships at its root to contribute object-store providers: `{ schemaVersion: 1, providers: [{ id, module, label? }] }`,\n * parsed by `@jini-ai/platform/object-store`; ids are checked against the shared grammar before any module is imported. */'
  F2 OLD: '  parse: ({ raw }) => parseObjectStoresFile({ raw }),'
     NEW: '  parse: ({ raw }) => parseObjectStoreDescriptors({ raw }),'
  F3 delete the 10 lines from '/**\n * Parses `tovu-object-stores.json`: `{ schemaVersion: 1, providers: [{ id, module, label? }] }`. Ids' through
     'export function parseObjectStoresFile(required: { readonly raw: string }, _optional: Record<string, never> = {}): ReturnType<typeof parseObjectStoreDescriptors> {\n  return parseObjectStoreDescriptors(required);\n}\n' plus the blank line after it (today lines 90-99).
  F4 OLD: '    const parsed = parseObjectStoresFile({ raw: readFileSync(path.join(plugin.packageRoot, OBJECT_STORES_FILENAME), "utf8") });'
     NEW: '    const parsed = parseObjectStoreDescriptors({ raw: readFileSync(path.join(plugin.packageRoot, OBJECT_STORES_FILENAME), "utf8") });'
  (the import alias `parseObjectStoresFile as parseObjectStoreDescriptors` on line 7 stays)
moved_bodies: -
census: python3 scripts/census.py {TOVU_CLONE} apps/website/src/features/object-storage/registry.ts -> importers of the NAME parseObjectStoresFile (rg -n "parseObjectStoresFile" apps content --glob '!**/node_modules/**'):
  - apps/website/src/features/object-storage/index.ts:2 | reexport
  - apps/website/src/features/object-storage/__tests__/registry.unit.test.ts:11 | static | "../registry.js"
  - apps/website/src/features/object-storage/__tests__/env-declarations.contract.test.ts:6 | static | "../registry.js"
  (other census lines of registry.ts import other names and are unchanged: media-store.ts:1,6, media-store.unit.test.ts:14, artifact-provider.ts, deps via index. Any OTHER file naming parseObjectStoresFile from a Tovu path: SKIP.)
reach_check: rg -n --no-heading "parseObjectStoresFile" apps content --glob '!**/node_modules/**' -> after: registry.ts:7 (the aliased Jini import), the two tests' new Jini imports and their call lines. Nothing from "../registry.js" or "./registry.js".
importers:
  - apps/website/src/features/object-storage/index.ts (blob 36324215751370d345595c28e15f6b78dd2d08f2) | "loadObjectStoreRegistry, parseObjectStoresFile, OBJECT_STORES_FILENAME," -> "loadObjectStoreRegistry, OBJECT_STORES_FILENAME,"
  - apps/website/src/features/object-storage/__tests__/registry.unit.test.ts (blob 8ed335b4a7389ed8cb0c381b62fc9bdbcc0d2d96) | 'import { loadBundledObjectStoreRegistry, loadObjectStoreRegistry, OBJECT_STORES_FILENAME, parseObjectStoresFile, type TovuObjectStoreProvider } from "../registry.js";'
      -> 'import { parseObjectStoresFile } from "@jini-ai/platform/object-store";\nimport { loadBundledObjectStoreRegistry, loadObjectStoreRegistry, OBJECT_STORES_FILENAME, type TovuObjectStoreProvider } from "../registry.js";'
  - apps/website/src/features/object-storage/__tests__/env-declarations.contract.test.ts (blob cadefebb28a8b62ee71e6baee651ec8c762cf0e0) | 'import { parseObjectStoresFile, readBundledObjectStoreEnvDeclarations } from "../registry.js";'
      -> 'import { parseObjectStoresFile } from "@jini-ai/platform/object-store";\nimport { readBundledObjectStoreEnvDeclarations } from "../registry.js";'
folds: - | comment_refs: - | path_literals: - | relocations: - | baselines: - (no json/yml hit) | jini_commit: - | untangle_followup: -
tests: registry.unit.test.ts and env-declarations.contract.test.ts | repoint import only; every parseObjectStoresFile assertion stays (it now runs on the Jini function the wrapper forwarded to: identical results)
  index.unit.test.ts (blob 6b4e4a6ad03d2a2e4ca20272a83b66e1a237b4a2) | NO edit: it compares the barrel to the union of the modules' values; the name leaves both sides together.
why_moves: "Parses `tovu-object-stores.json` ... Ids are checked against the shared grammar by the loader before any module is imported." -> F1 (onto OBJECT_STORES_FILENAME). "The parser lives in `@jini-ai/platform/object-store`; this keeps the host's name and signature." -> deleted (tracking pointer).
tovu_msg: "refactor(object-storage): drop the parseObjectStoresFile forwarder" | body "registry.ts and its tests call @jini-ai/platform/object-store directly."
Commit paths (4): registry.ts, index.ts, registry.unit.test.ts, env-declarations.contract.test.ts
est_executor_tokens: ~20k Sonnet
```

---------------------------------------------------------------------------------------------------
## Slice SP-object-storage-1 (template T-SPLIT)
```
id: SP-object-storage-1
feature: website/features/object-storage
tovu_files:
  - apps/website/src/features/object-storage/media-store.ts | blob de1332cd7295d4df35118a655b7acb39d7105c61
split:
  - MEDIA_OBJECT_STORE_ENV | STAY-PRODUCT (env name; COMMON 8)
  - Credential (local type) | MOVE -> packages/cms/src/media/blob-store.selection.ts as `MediaStoreCredential`
  - MediaStoreEnvChoice | MOVE (same name); Tovu drops its own name (only the barrel exported it; no importer)
  - MediaObjectStorePorts | MOVE as generic `MediaObjectStorePorts<H>`; Tovu keeps `export type MediaObjectStorePorts = JiniMediaObjectStorePorts<ObjectStoreHost>;` (STAY-WIRING: binds the SigV4 host; deps.ts:1134 and the unit test use this name)
  - readMediaStoreEnv | MOVE as `readMediaStoreEnvChoice` (env name injected); Tovu keeps `readMediaStoreEnv` (same signature) as a binding passing MEDIA_OBJECT_STORE_ENV
  - createMediaBlobStore | MOVE as `selectMediaBlobStore` (env name, setting name, local store injected); Tovu keeps `createMediaBlobStore` (same signature) as the binding
  - settingProviderId, loadMediaObjectStore, privateMediaBucket, createFrom (internal) | MOVE verbatim, generic over the host type H; loadMediaObjectStore gains `settingName`
ports:
  - local: () => ObjectStore | Tovu binds `() => createLocalFsObjectStore({ rootDir: required.uploadsDir })` in media-store.ts
      why: the local-disk store is `@jini-ai/platform/object-store`, which cms may not import (COMMON 5)
  - (values, not ports) envName: string = "TOVU_MEDIA_BLOB_STORE"; settingName: string = "core.storage.mediaObjectStore" (the only Tovu text in the error messages; every message stays byte-identical)
  - the existing MediaObjectStorePorts<H> (host, loadBundledRegistry, loadSiteRegistry, readSetting, resolveSharedCredential) move unchanged as a type; Tovu's deps.ts keeps building them
shape_changes: - (Tovu's two exported functions keep their signatures; the Jini functions are new names in (required, optional = {}) shape)
jini_code: |
  NEW packages/cms/src/media/blob-store.selection.ts, exactly:
  /**
   * @file Where media bytes live: an operator env override, else a stored site setting, else local
   * disk — the one seam behind a host's media blob store, so no read/write path changes when the
   * provider does.
   *
   * Fails LOUD, not silently: an unknown env value or an incomplete remote env config throws here,
   * synchronously at boot — an operator who typos the opt-in must see a startup error, not have the
   * install quietly write local files nobody expected (which would look like "media works" until the
   * next deploy wipes the ephemeral disk). A setting choice that cannot be honoured (provider not
   * installed, credential missing) rejects every media call with the reason, for the same reason: it
   * never falls back to local disk.
   *
   * Keys never change: every provider is handed `computeBlobStorageKey`'s `ws/...` key (plus the
   * operator's key prefix for a remote store), so no stored storage key needs migrating.
   */
  import { deferObjectStore, type ObjectStore, type ObjectStoreCreateInput, type ObjectStoreProvider } from "@jini-ai/core/object-store";
  import type { ProviderRegistry } from "@jini-ai/core/provider-registry";

  import { blobStoreFromObjectStore } from "./blob-store.object-store.js";
  import type { BlobStorePort } from "./ports.js";

  export type MediaStoreCredential = NonNullable<ObjectStoreCreateInput["credential"]>;

  /** One env selector a bundled provider declares (structurally `@jini-ai/platform/object-store`'s
   *  `ObjectStoreEnvDeclaration`): `required` lists the variables in their operator-facing order. */
  export interface MediaStoreEnvDeclaration {
    readonly providerId: string;
    readonly selector: string;
    readonly settings: Readonly<Record<string, string>>;
    readonly credentialFields: Readonly<Record<string, string>>;
    readonly secret: string;
    readonly required: readonly string[];
  }

  /** The env override, resolved synchronously: unset, local, or a complete config for the provider
   *  whose declaration owns the selector. */
  export type MediaStoreEnvChoice =
    | { readonly kind: "unset" }
    | { readonly kind: "local" }
    | { readonly kind: "remote"; readonly providerId: string; readonly settings: Readonly<Record<string, string | undefined>>; readonly credential: MediaStoreCredential };

  export interface LoadedMediaStoreRegistry<H> {
    readonly registry: ProviderRegistry<ObjectStoreProvider<H>>;
    /** Log-safe, one line per provider that was not loaded and why. */
    readonly refusals: readonly string[];
  }

  /** Late-bound boot ports: read on first media use, after the composition root has built them. */
  export interface MediaObjectStorePorts<H> {
    readonly host: H;
    /** Bundled-source providers for the env override (no activation gate). */
    loadBundledRegistry(): Promise<LoadedMediaStoreRegistry<H>>;
    /** This workspace's installed providers for the site setting. */
    loadSiteRegistry(): Promise<LoadedMediaStoreRegistry<H>>;
    readSetting(): Promise<string>;
    /** The site's saved connection shared with backup shares, for a remote provider id. */
    resolveSharedCredential(required: { readonly providerId: string }): Promise<MediaStoreCredential | undefined>;
  }

  export interface ReadMediaStoreEnvOptions {
    readonly envDeclarations?: readonly MediaStoreEnvDeclaration[];
  }

  /**
   * Reads and validates the env override named `envName`. Error texts are the ones operators already
   * know: the declaration supplies the selector and the required variables in their original order,
   * so the messages stay byte-identical.
   * @throws {Error} Unknown backend, or a declared selector without every required variable.
   * @complexity O(1).
   */
  export function readMediaStoreEnvChoice(required: { readonly env: Readonly<Record<string, string | undefined>>; readonly envName: string }, optional: ReadMediaStoreEnvOptions = {}): MediaStoreEnvChoice {
    const { env, envName } = required;
    const backend = env[envName];
    if (backend === undefined) return { kind: "unset" };
    if (backend === "local") return { kind: "local" };
    const declarations = optional.envDeclarations ?? [];
    const declaration = declarations.find(entry => entry.selector === backend);
    if (!declaration) {
      const expected = ["local", ...declarations.map(entry => entry.selector)].map(selector => `'${selector}'`).join(" or ");
      throw new Error(`Unknown ${envName} '${backend}' — expected ${expected}.`);
    }
    // Each entry pairs the env var name with its value, so a missing one is reported by its real name.
    const requiredVars = declaration.required;
    const missing = requiredVars.filter(name => !env[name]);
    if (missing.length > 0) {
      throw new Error(`${envName}=${backend} requires ${requiredVars.join(", ")} — missing: ${missing.join(", ")}.`);
    }
    const map = (mapping: Readonly<Record<string, string>>) => Object.fromEntries(Object.entries(mapping).map(([field, name]) => [field, env[name]]));
    return {
      kind: "remote", providerId: declaration.providerId,
      settings: map(declaration.settings),
      credential: { fields: map(declaration.credentialFields), secret: env[declaration.secret] as string },
    };
  }

  /**
   * Builds the media blob store. Synchronous so boot can fail loud before any background work starts;
   * the provider itself is resolved on first media use through `ports()`.
   * @returns The store; whether media is known remote at boot (`mediaIsRemoteByEnv`, env override
   *   only); and `isMediaRemote`, the EFFECTIVE answer (env override, else the site setting) read
   *   when asked — backups use it so a setting-selected remote provider never makes them walk the
   *   unused local folder and omit the "media is not in this backup" note.
   * @throws {Error} See {@link readMediaStoreEnvChoice}.
   * @complexity O(1) now; first media call does one setting read and at most one registry load.
   */
  export function selectMediaBlobStore<H>(
    required: {
      readonly env: Readonly<Record<string, string | undefined>>;
      readonly envName: string;
      /** Named in the "no saved connection" error so an operator knows what to clear. */
      readonly settingName: string;
      readonly local: () => ObjectStore;
      readonly ports: () => MediaObjectStorePorts<H>;
    },
    optional: ReadMediaStoreEnvOptions = {}
  ): { readonly blobStore: BlobStorePort; readonly mediaIsRemoteByEnv: boolean; readonly isMediaRemote: () => Promise<boolean> } {
    const { local, settingName } = required;
    const choice = readMediaStoreEnvChoice({ env: required.env, envName: required.envName }, optional);
    const store = choice.kind === "local" ? local() : deferObjectStore({ load: () => loadMediaObjectStore({ choice, ports: required.ports(), local, settingName }) });
    const isMediaRemote = async () => (choice.kind === "unset" ? (await settingProviderId({ ports: required.ports() })) !== "local" : choice.kind === "remote");
    return { blobStore: blobStoreFromObjectStore({ store }), mediaIsRemoteByEnv: choice.kind === "remote", isMediaRemote };
  }

  /** The site setting's provider id, blank meaning the registry default `local`. @complexity One setting read. */
  async function settingProviderId<H>(required: { readonly ports: MediaObjectStorePorts<H> }): Promise<string> {
    return (await required.ports.readSetting()) || "local";
  }

  /**
   * Resolves the provider for an env-remote or setting-driven choice.
   * @throws {Error} The chosen provider is not available or refused its configuration.
   * @complexity One setting read, at most one registry load and one credential read.
   */
  async function loadMediaObjectStore<H>(required: { readonly choice: Exclude<MediaStoreEnvChoice, { kind: "local" }>; readonly ports: MediaObjectStorePorts<H>; readonly local: () => ObjectStore; readonly settingName: string }): Promise<ObjectStore> {
    const { choice, ports } = required;
    if (choice.kind === "remote") {
      return createFrom({ loaded: await ports.loadBundledRegistry(), providerId: choice.providerId, settings: choice.settings, credential: choice.credential, host: ports.host });
    }
    const providerId = await settingProviderId({ ports });
    if (providerId === "local") return required.local();
    const credential = await ports.resolveSharedCredential({ providerId });
    if (!credential) throw new Error(`Media storage '${providerId}' has no saved connection — connect it first, or clear ${required.settingName}.`);
    const bucket = privateMediaBucket({ providerId, credential });
    return createFrom({ loaded: await ports.loadSiteRegistry(), providerId, settings: { bucket, keyPrefix: credential.fields.mediaKeyPrefix }, credential, host: ports.host });
  }

  (then privateMediaBucket and createFrom: copy today's media-store.ts lines 126-160 verbatim, doc comments included, with exactly these edits:
   - every `Credential` -> `MediaStoreCredential` (2 occurrences: privateMediaBucket's and createFrom's parameter types)
   - 'function createFrom(required: { readonly loaded: LoadedObjectStoreRegistry; readonly providerId: string; readonly credential: Credential } & ObjectStoreCreateInput<ObjectStoreHost>): ObjectStore {'
     -> 'function createFrom<H>(required: { readonly loaded: LoadedMediaStoreRegistry<H>; readonly providerId: string; readonly credential: MediaStoreCredential } & ObjectStoreCreateInput<H>): ObjectStore {'
   - ' * Both callers always hold a credential (env `s3` validates it at boot; the setting path refuses' -> ' * Both callers always hold a credential (a remote env choice validates it at boot; the setting path refuses')
  Line-count check: selectMediaBlobStore body 6 lines, readMediaStoreEnvChoice 21, loadMediaObjectStore 10 — all ≤ 50; complexity unchanged from today's Tovu functions plus 0 branches.
jini_index: packages/cms/src/media/index.ts: after 'export { blobStoreFromObjectStore } from "./blob-store.object-store.js";' insert 'export * from "./blob-store.selection.js";'
jini_guards:
  - packages/cms/src/media/blob-store.selection.ts must not exist; packages/cms/src/media/__tests__/blob-store.selection.test.ts must not exist
  - packages/cms/src/media/index.ts blob 57ff8140622fd366c801c1df5a2a182fe3780391
  - rg -n "selectMediaBlobStore|readMediaStoreEnvChoice|MediaStoreEnvChoice|MediaObjectStorePorts|MediaStoreEnvDeclaration|LoadedMediaStoreRegistry|MediaStoreCredential" packages/cms/src -> prints nothing
  - after creation: rg -n -i "tovu|TOVU_|core\.storage|s3|process\.env|console\.|@jini-ai/platform" packages/cms/src/media/blob-store.selection.ts -> nothing (the word "s3" must not survive: see the last edit above)
tovu_reduced: |
  apps/website/src/features/object-storage/media-store.ts: overwrite the whole file with exactly:
  import { readMediaStoreEnvChoice, selectMediaBlobStore, type BlobStorePort, type MediaObjectStorePorts as JiniMediaObjectStorePorts, type MediaStoreEnvChoice } from "@jini-ai/cms/media";
  import { createLocalFsObjectStore } from "@jini-ai/platform/object-store";

  import type { ObjectStoreEnvDeclaration, ObjectStoreHost } from "./registry.js";

  /**
   * @file Tovu's binding of `selectMediaBlobStore` (`@jini-ai/cms/media`): the one seam behind
   * `RouteDeps.blobStore`. Every read/write path (`/m/...` rendition serving, admin upload/purge,
   * static export's asset crawl) goes through the store this returns.
   *
   * Precedence: the operator env override `TOVU_MEDIA_BLOB_STORE` (`local` | `s3`), then the site
   * setting `core.storage.mediaObjectStore`, then the registry default `local` (the site's uploads
   * folder). Keys are `computeBlobStorageKey`'s `ws/...` keys (plus the operator's key prefix for S3),
   * so no stored `asset_blobs.storage_key` needs migrating.
   */

  export const MEDIA_OBJECT_STORE_ENV = "TOVU_MEDIA_BLOB_STORE";
  const MEDIA_OBJECT_STORE_SETTING = "core.storage.mediaObjectStore";

  /** The boot ports, bound to Tovu's object-store host (SigV4 signing + optional request tracing). */
  export type MediaObjectStorePorts = JiniMediaObjectStorePorts<ObjectStoreHost>;

  /**
   * Reads and validates `TOVU_MEDIA_BLOB_STORE`; messages are the ones operators already know.
   * @throws {Error} Unknown backend, or a declared selector without every required variable.
   */
  export function readMediaStoreEnv(required: { readonly env: Readonly<Record<string, string | undefined>> }, optional: { readonly envDeclarations?: readonly ObjectStoreEnvDeclaration[] } = {}): MediaStoreEnvChoice {
    return readMediaStoreEnvChoice({ env: required.env, envName: MEDIA_OBJECT_STORE_ENV }, optional);
  }

  /**
   * Builds the media blob store rooted at `uploadsDir` for the local choice.
   * @throws {Error} See {@link readMediaStoreEnv}.
   */
  export function createMediaBlobStore(
    required: { readonly uploadsDir: string; readonly env: Readonly<Record<string, string | undefined>>; readonly ports: () => MediaObjectStorePorts },
    optional: { readonly envDeclarations?: readonly ObjectStoreEnvDeclaration[] } = {}
  ): { readonly blobStore: BlobStorePort; readonly mediaIsRemoteByEnv: boolean; readonly isMediaRemote: () => Promise<boolean> } {
    return selectMediaBlobStore({
      env: required.env, envName: MEDIA_OBJECT_STORE_ENV, settingName: MEDIA_OBJECT_STORE_SETTING,
      local: () => createLocalFsObjectStore({ rootDir: required.uploadsDir }),
      ports: required.ports,
    }, optional);
  }
  (Behaviour note: today `createMediaBlobStore` builds the local store once per call for `kind: "local"` and lazily per load otherwise; the Jini code calls `local()` at exactly the same points, so the same number of local stores is created.)
binding_edits:
  - apps/website/src/features/object-storage/index.ts: OLD 'export { createMediaBlobStore, readMediaStoreEnv, MEDIA_OBJECT_STORE_ENV, type MediaObjectStorePorts, type MediaStoreEnvChoice } from "./media-store.js";'
      NEW 'export { createMediaBlobStore, readMediaStoreEnv, MEDIA_OBJECT_STORE_ENV, type MediaObjectStorePorts } from "./media-store.js";'
    (MediaStoreEnvChoice: 0 importers outside media-store.ts — `rg -n "MediaStoreEnvChoice" apps content --glob '!**/node_modules/**'` shows only media-store.ts and index.ts:1; if anything else, STOP)
tests_split:
  - apps/website/src/features/object-storage/__tests__/media-store.unit.test.ts | stays in Tovu, NO edit: it calls the two bindings with the Tovu env name and asserts the exact messages (incl. `core.storage.mediaObjectStore`), which the bindings pass through unchanged.
  - apps/website/src/features/object-storage/__tests__/index.unit.test.ts | NO edit (value identities: media-store.ts still exports the same 3 values).
  - content/agent-plugin-overlays/s3-compatible/__tests__/env-declaration.test.mjs and media-store.integration.test.mjs | NO edit (same exports, same path).
  - NEW Jini packages/cms/src/media/__tests__/blob-store.selection.test.ts, exactly:
    import { describe, expect, it } from "vitest";
    import type { ObjectStore } from "@jini-ai/core/object-store";
    import { readMediaStoreEnvChoice, selectMediaBlobStore, type MediaObjectStorePorts } from "../blob-store.selection.js";

    const declaration = { providerId: "example_store", selector: "example", settings: { bucket: "EX_BUCKET" }, credentialFields: { accessKeyId: "EX_KEY" }, secret: "EX_SECRET", required: ["EX_BUCKET", "EX_KEY", "EX_SECRET"] };
    const localStore = {} as ObjectStore;
    const ports = (setting: string, credential?: { fields: Record<string, string | undefined>; secret: string }): (() => MediaObjectStorePorts<null>) => () => ({
      host: null,
      loadBundledRegistry: async () => { throw new Error("not used"); },
      loadSiteRegistry: async () => { throw new Error("not used"); },
      readSetting: async () => setting,
      resolveSharedCredential: async () => credential,
    });

    describe("readMediaStoreEnvChoice", () => {
      it("reads the env name it is given", () => {
        expect(readMediaStoreEnvChoice({ env: {}, envName: "MEDIA_STORE" })).toEqual({ kind: "unset" });
        expect(readMediaStoreEnvChoice({ env: { MEDIA_STORE: "local" }, envName: "MEDIA_STORE" })).toEqual({ kind: "local" });
      });
      it("names that env in its errors and maps a complete remote config", () => {
        expect(() => readMediaStoreEnvChoice({ env: { MEDIA_STORE: "nope" }, envName: "MEDIA_STORE" }, { envDeclarations: [declaration] })).toThrow("Unknown MEDIA_STORE 'nope' — expected 'local' or 'example'.");
        expect(() => readMediaStoreEnvChoice({ env: { MEDIA_STORE: "example", EX_BUCKET: "b" }, envName: "MEDIA_STORE" }, { envDeclarations: [declaration] })).toThrow("MEDIA_STORE=example requires EX_BUCKET, EX_KEY, EX_SECRET — missing: EX_KEY, EX_SECRET.");
        expect(readMediaStoreEnvChoice({ env: { MEDIA_STORE: "example", EX_BUCKET: "b", EX_KEY: "k", EX_SECRET: "s" }, envName: "MEDIA_STORE" }, { envDeclarations: [declaration] }))
          .toEqual({ kind: "remote", providerId: "example_store", settings: { bucket: "b" }, credential: { fields: { accessKeyId: "k" }, secret: "s" } });
      });
    });

    describe("selectMediaBlobStore", () => {
      it("uses the injected local store for an explicit local override, never touching the ports", () => {
        let localCalls = 0;
        const result = selectMediaBlobStore({ env: { MEDIA_STORE: "local" }, envName: "MEDIA_STORE", settingName: "media.store", local: () => { localCalls += 1; return localStore; }, ports: () => { throw new Error("ports must not be read"); } });
        expect(localCalls).toBe(1);
        expect(result.mediaIsRemoteByEnv).toBe(false);
      });
      it("names the setting when a remote setting has no saved connection", async () => {
        const { isMediaRemote, blobStore } = selectMediaBlobStore({ env: {}, envName: "MEDIA_STORE", settingName: "media.store", local: () => localStore, ports: ports("example_store") });
        expect(await isMediaRemote()).toBe(true);
        await expect(blobStore.get({ storageKey: "ws/a/blobs/aa/aa" } as never)).rejects.toThrow("Media storage 'example_store' has no saved connection — connect it first, or clear media.store.");
      });
      it("refuses a mediaBucket that names the public bucket", async () => {
        const { blobStore } = selectMediaBlobStore({ env: {}, envName: "MEDIA_STORE", settingName: "media.store", local: () => localStore, ports: ports("example_store", { fields: { bucket: "pub", mediaBucket: " PUB " }, secret: "s" }) });
        await expect(blobStore.get({ storageKey: "ws/a/blobs/aa/aa" } as never)).rejects.toThrow("needs a 'mediaBucket' different from the connection's public 'bucket'");
      });
    });
    (Executor check before commit: `rg -n "^\s+(get|read|exists)\(" packages/cms/src/media/ports.ts` around `interface BlobStorePort` shows the read method's real name and argument; if it is not `get({ storageKey })`, replace `blobStore.get({ storageKey: ... } as never)` in the two tests with that method called with the same `as never` argument — the only allowed edit. If BlobStorePort has no method that loads the store, STOP.)
changeset: .changeset/cms-media-blob-store-selection.md: '---\n"@jini-ai/cms": minor\n---\n\nAdd `selectMediaBlobStore` and `readMediaStoreEnvChoice` to `@jini-ai/cms/media`: pick a media object store from an env override, a stored setting or local disk, failing loudly instead of falling back.\n'
census: python3 scripts/census.py {TOVU_CLONE} apps/website/src/features/object-storage/media-store.ts -> exactly the 4 hits (index.ts:1, index.unit.test.ts:6, media-store.unit.test.ts:13, content/agent-plugin-overlays/s3-compatible/__tests__/env-declaration.test.mjs:5); unchanged after (same exported names).
jini_msg: "feat(cms): selectMediaBlobStore, env-override/setting/local media store selection" | tovu_msg: "refactor(object-storage): media store selection from @jini-ai/cms/media" | body "Tovu keeps TOVU_MEDIA_BLOB_STORE, the core.storage.mediaObjectStore setting name and the local uploads store as values; createMediaBlobStore and readMediaStoreEnv keep their signatures."
extra_stops: if `packages/cms/package.json` has no `@jini-ai/core` dependency (it has one today, line 438), STOP. If `ProviderRegistry` is not exported by `@jini-ai/core/provider-registry` (`rg -n "export (interface|type) ProviderRegistry" {JINI_CLONE}/packages/core/src` prints nothing), STOP.
Commit paths: Jini 4 (blob-store.selection.ts, its test, media/index.ts, changeset). Tovu 2 (media-store.ts, index.ts).
```
Expected cloud run: Jini `npm --prefix packages/cms run test -- blob-store.selection`, cms typecheck + subpath isolation (./media is a `node` entry; the new file has no node import anyway); Tovu typecheck, `media-store.unit.test.ts`, `index.unit.test.ts`, `registry.unit.test.ts`, `env-declarations.contract.test.ts`, the two s3 overlay tests. No RED test (no behaviour change).
est_executor_tokens: DL ~20k, SP ~60k (Sonnet) + ~15k Opus review.
