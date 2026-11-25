import { onTeardown } from "#src/__tests__/fixtures/teardown";
import { bindSiteImportBackfill } from "#src/server/runtime/composition/site-import-backfill";
import fs from "node:fs";
import path from "node:path";
import type { TestContext } from "node:test";
import type { ImportHistoryPolicy } from "@jini-ai/core/contracts/site/site-import-history";
import { createImportIndexIntegrityMemo, openImportIndex } from "@jini-ai/devops/backup/site/import-index/open";
import { sweepExpired } from "@jini-ai/devops/backup/site/import-index/sweep";
import { IMPORT_INDEX_STATE_SCHEMA, indexStatePaths, type ImportIndexState } from "@jini-ai/devops/backup/site/import-index/mode";
import { openNativeSqlite } from "#src/platform/db/kernel/drivers/sqlite";
import { bindSiteImportIndexState } from "#src/server/runtime/composition/site-import-index-state";
import { SiteImportRegistry } from "../import-registry.js";
import { createSiteImportBackend } from "../import-backend.js";
import { importFixture } from "./import.fixture.js";

/** Writes `<root>/import-index.state.json` directly (0600), as a crash or an earlier run would leave it. */
export function seedIndexState({ root, mode, dbId, cutoverAt }: { root: string; mode: ImportIndexState["mode"]; dbId: string | null; cutoverAt: number }, _optional: Record<string, never> = {}): ImportIndexState {
  const state = (mode === "legacy"
    ? { schema: IMPORT_INDEX_STATE_SCHEMA, mode, dbId: null, cutoverAt: 0, firstIndexedWriteAt: 0, legacyRetiredAt: 0 }
    : { schema: IMPORT_INDEX_STATE_SCHEMA, mode, dbId, cutoverAt, firstIndexedWriteAt: mode === "indexed" ? cutoverAt : 0, legacyRetiredAt: 0 }) as ImportIndexState;
  fs.writeFileSync(indexStatePaths({ root }).state, JSON.stringify(state), { mode: 0o600 });
  return state;
}

/** Creates the monotonic `<root>/.history-indexed-v1` witness (0600). */
export function seedWitness({ root }: { root: string }, _optional: Record<string, never> = {}): string {
  const file = indexStatePaths({ root }).witness;
  fs.writeFileSync(file, "", { mode: 0o600 });
  return file;
}

export async function importHistoryIndexFixture({ t }: { t: TestContext }, _optional: Record<string, never> = {}) {
  const h = await importFixture(t);
  const policy: ImportHistoryPolicy = { cutoverPolicy: "rollback", historyVisibleMs: 2_592_000_000, replayFenceMs: 31_536_000_000, legacyRetireMs: 2_592_000_000, sweepOnClockRollback: false };
  const file = path.join(h.registry.directory, "site-imports.db");
  const clock = h.payload.clock;
  const open = ({ file, options }: { file: string; options: { readonly?: boolean; fileMustExist?: boolean } }, _optional: Record<string, never> = {}) => openNativeSqlite(file, options);
  const integrityMemo = createImportIndexIntegrityMemo({});
  const openCandidate = (_required: Record<string, never>, _optional: Record<string, never> = {}) => {
    if (!fs.existsSync(file)) fs.closeSync(fs.openSync(file, "wx", 0o600));
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || (process.platform !== "win32" && (stat.mode & 0o077) !== 0)) throw new Error("Import index must be a private regular file.");
    return openImportIndex({ file, open: (file, options) => open({ file, options }), clock, policy, integrityMemo,
      checkIntegrity: ({ db }, _optional = {}) => {
        if (db.pragma("quick_check(1)", { simple: true }) !== "ok") throw Object.assign(new Error("Import history failed integrity check."), { code: "SQLITE_CORRUPT" });
      },
    });
  };
  const handle = await h.registry.exclusive({ run: async () => openCandidate({}) });
  onTeardown({ t, step: () => handle.close({}) });
  const { db, store } = handle;
  const session = { kind: "index" as const, db, store, policy,
    beforeWrite: (_required: Record<string, never>, _optional: Record<string, never> = {}) => {},
    expireHistory: (_required: Record<string, never>, _optional: Record<string, never> = {}) => {
      for (const row of store.dueOwnerSetups({ now: clock.nowMs() })) {
        store.put({ row: { ...row, status: "failed", error: "Owner setup expired" }, beforeWrite: session.beforeWrite });
        fs.rmSync(registry.stagePath(row), { recursive: true, force: true });
      }
    },
    sweep: (_required: Record<string, never>, _optional: Record<string, never> = {}) => sweepExpired({ db, clock, policy }),
  };
  // The real-driver fixture does not select production authority.
  const registry = new SiteImportRegistry({ directory: h.registry.directory, payload: h.payload, history: {
    read: ({ run }, _optional = {}) => run(session, {}),
    locked: async ({ run }, _optional = {}) => run(session, {}),
  } });
  const backendPorts = { ...h.backendPorts, registry };
  const backfill = bindSiteImportBackfill({ directory: registry.directory, fs: h.payload.fs, clock, policy, openCandidate, log: () => {} });
  const root = registry.directory;
  return { ...h, backfill, registry,
    seedIndexState: (state: Omit<Parameters<typeof seedIndexState>[0], "root">, _optional: Record<string, never> = {}) => seedIndexState({ root, ...state }),
    seedWitness: (_required: Record<string, never>, _optional: Record<string, never> = {}) => seedWitness({ root }),
    backendPorts, backend: createSiteImportBackend(backendPorts), db, store, policy, clock, file, openCandidate };
}

/**
 * The production authority binding (`bindSiteImportIndexState`) over an import fixture's directory, with a
 * real registry and backend in front: what `composeSiteImportBackend` wires, minus the network. Tests may
 * pass `cutoverPolicy: "enable"` to reach cutover/indexed; production stays on rollback.
 */
export function hostBoundBackend({ h, cutoverPolicy = "rollback", clock = h.payload.clock }: { h: Awaited<ReturnType<typeof importFixture>>; cutoverPolicy?: ImportHistoryPolicy["cutoverPolicy"]; clock?: { nowMs(): number } }, _optional: Record<string, never> = {}) {
  const directory = h.registry.directory;
  const policy: ImportHistoryPolicy = { cutoverPolicy, historyVisibleMs: 2_592_000_000, replayFenceMs: 31_536_000_000, legacyRetireMs: 2_592_000_000, sweepOnClockRollback: false };
  const file = path.join(directory, "site-imports.db");
  const open = ({ file, options }: { file: string; options: { readonly?: boolean; fileMustExist?: boolean } }, _optional: Record<string, never> = {}) => openNativeSqlite(file, options);
  const checkIntegrity = ({ db }: { db: ReturnType<typeof openNativeSqlite>; file: string }, _optional: Record<string, never> = {}) => {
    if (db.pragma("quick_check(1)", { simple: true }) !== "ok") throw Object.assign(new Error("Import history failed integrity check."), { code: "SQLITE_CORRUPT" });
  };
  const integrityMemo = createImportIndexIntegrityMemo({});
  const backfill = bindSiteImportBackfill({ directory, fs: h.payload.fs, clock, policy, log: () => {},
    openCandidate: (_required, _optional = {}) => {
      if (!fs.existsSync(file)) fs.closeSync(fs.openSync(file, "wx", 0o600));
      return openImportIndex({ file, open: (file, options) => open({ file, options }), clock, policy, integrityMemo, checkIntegrity });
    } });
  const authority = bindSiteImportIndexState({ directory, policy, clock, fs, open, checkIntegrity, backfill, log: () => {} });
  const registry = new SiteImportRegistry({ directory, payload: { ...h.payload, clock }, history: authority.history });
  const backend = createSiteImportBackend({ ...h.backendPorts, registry, authority });
  return { authority, registry, backend, policy, directory };
}
