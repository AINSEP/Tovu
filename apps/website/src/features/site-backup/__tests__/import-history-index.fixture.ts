import { onTeardown } from "#src/__tests__/fixtures/teardown";
import { bindSiteImportBackfill } from "#src/server/runtime/composition/site-import-backfill";
import fs from "node:fs";
import path from "node:path";
import type { TestContext } from "node:test";
import type { ImportHistoryPolicy } from "@jini-ai/core/contracts/site/site-import-history";
import { createImportIndexIntegrityMemo, openImportIndex } from "@jini-ai/devops/backup/site/import-index/open";
import { sweepExpired } from "@jini-ai/devops/backup/site/import-index/sweep";
import { openNativeSqlite } from "#src/platform/db/kernel/drivers/sqlite";
import { SiteImportRegistry } from "../import-registry.js";
import { createSiteImportBackend } from "../import-backend.js";
import { importFixture } from "./import.fixture.js";

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
  return { ...h, backfill, registry, backendPorts, backend: createSiteImportBackend(backendPorts), db, store, policy, clock, file, openCandidate };
}
