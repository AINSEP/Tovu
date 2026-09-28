import assert from "node:assert/strict";
import { test } from "node:test";

import { sql } from "kysely";

import type { ContentKernel } from "#src/platform/db/content-kernel";
import { describeEachDialect, heldUntil } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { listColumns } from "#src/platform/db/kernel/dialect";
import type { HttpClientPort } from "#src/platform/http/index";
import { activateDeploy, InMemoryDeployTokenKeyring } from "../deploy-plugin.js";

/**
 * @file The deploy plugin's data paths on every dialect (storage plan P2): declaring its table and
 * recording/listing deploy history, one body on SQLite and PGlite. `make` drops the tables this
 * file creates first, since the PGlite instance is shared across the file.
 */

const OWN_TABLES = ["p_deploy__deploys", "_plugin_migrations", "_plugin_migration_journal", "_plugin_identity"];

function fresh(base: ContentKernel): ContentKernel {
  const pending = OWN_TABLES.reduce(
    (chain, table) => chain.then(() => base.execute(sql`DROP TABLE IF EXISTS ${sql.table(table)}`)),
    Promise.resolve()
  );
  pending.catch(() => {});
  return heldUntil(base, pending);
}

const noHttp: HttpClientPort = {
  send: async () => {
    throw new Error("no HTTP expected");
  },
};

describeEachDialect<ContentKernel>("deploy plugin data", { tables: [], make: fresh }, (makeKernel, dialect) => {
  test("declares p_deploy__deploys with the manifest's columns", async () => {
    const kernel = makeKernel();
    await activateDeploy({ db: kernel, dbPath: ":memory:", httpClient: noHttp, tokenPort: new InMemoryDeployTokenKeyring() });

    const columns = await listColumns(kernel, "p_deploy__deploys");
    const text = "text";
    const integer = dialect === "sqlite" ? "integer" : "bigint";
    assert.deepEqual(
      columns.map((c) => [c.name, c.type]),
      [
        ["id", text],
        ["target", text],
        ["status", text],
        ["triggered_at", integer],
        ["result_summary", text],
      ]
    );
  });

  test("records every failed deploy and lists history newest first, capped by limit", async () => {
    const kernel = makeKernel();
    const api = await activateDeploy({ db: kernel, dbPath: ":memory:", httpClient: noHttp, tokenPort: new InMemoryDeployTokenKeyring() });

    await api.deploy("netlify", {});
    await new Promise((resolve) => setTimeout(resolve, 2));
    await api.deploy("vercel", { projectId: "p", ref: "main" }); // no token -> failed, no HTTP

    const history = await api.listHistory();
    assert.deepEqual(
      history.map((h) => [h.target, h.status]),
      [
        ["vercel", "failed"],
        ["netlify", "failed"],
      ]
    );
    assert.equal(typeof history[0].triggeredAt, "number");
    assert.match(history[0].resultSummary, /no Vercel deploy token/);
    assert.equal((await api.listHistory(1)).length, 1);
  });
});
