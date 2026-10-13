import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import { dropDatabase, freshPostgresDatabase } from "../postgres-database.js";
import { openPostgresKernel } from "../../kernel/drivers/postgres.js";
import { CURRENT_SRC, GOLDEN_PATH, READ_GROUPS, countingKernel, expectedTranscript, explainPlan, knownIssue, loadParityModules,
  migratedParityFixture, parityDeps, readTranscript, unordered, type ParityModules, type Transcript } from "./parity-harness.js";

/** Query parity on REAL Postgres (DBMERGE-PLAN §2d `vault-read-parity.postgres`): the read loop of
 * `vault-read-parity.test.ts` plus the two hot paths a pooled server can plan differently from
 * PGlite (vendor default lookup, MCP list statement count). Same legacy rows, the real pinned 0012
 * step and the boot re-seal, compared with the pre-vault golden after `PARITY_DELTAS`. Needs the
 * local server (`pg_ctl -D /usr/local/var/postgresql@14 start`); fails, never skips, when it is down.
 */
const DATABASE = "tovu_vault_parity";
const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as { read: Transcript };
const expected = expectedTranscript(golden.read, "read");
const keys = Object.keys(golden.read);
function pick(transcript: Transcript, selected: string[], ordered: boolean) {
  return Object.fromEntries(selected.map(key => [key, ordered ? transcript[key] : unordered(transcript[key])]));
}

type Fixture = Awaited<ReturnType<typeof migratedParityFixture>>;
let mods: ParityModules;
let fixture: Fixture;
let actual: Transcript;
before(async () => {
  mods = await loadParityModules(CURRENT_SRC);
  const kernel = openPostgresKernel<unknown>({ connectionString: freshPostgresDatabase(DATABASE) });
  fixture = await migratedParityFixture("pglite", { kernel });
  actual = await readTranscript(mods, fixture);
});
after(async () => {
  await fixture?.kernel.close();
  dropDatabase({ database: DATABASE });
});

describe("vault read parity [postgres]", () => {
  test("the transcript covers every golden key and nothing else", () => {
    assert.deepEqual(Object.keys(actual).sort(), [...keys].sort());
  });

  for (const group of READ_GROUPS) {
    const selected = keys.filter(group.select);
    const blocking = (key: string) => { const issue = knownIssue("read", key); return issue !== undefined && (!issue.orderOnly || group.ordered); };
    const clean = selected.filter(key => !blocking(key));
    if (clean.length > 0) {
      test(group.name, () => assert.deepEqual(pick(actual, clean, group.ordered), pick(expected, clean, group.ordered)));
    }
    for (const id of new Set(selected.filter(blocking).map(key => knownIssue("read", key)!.id))) {
      const issueKeys = selected.filter(key => blocking(key) && knownIssue("read", key)!.id === id);
      test(`${group.name} — ${id}`, { todo: knownIssue("read", issueKeys[0])!.note },
        () => assert.deepEqual(pick(actual, issueKeys, group.ordered), pick(expected, issueKeys, group.ordered)));
    }
  }
});

describe("vault hot paths [postgres]", () => {
  let counting: ReturnType<typeof countingKernel<unknown>>;
  let d: ReturnType<typeof parityDeps>;
  before(() => {
    counting = countingKernel(fixture.kernel);
    d = parityDeps(mods, { ...fixture, kernel: counting.kernel });
  });
  const measure = async (call: () => Promise<unknown>) => { counting.statements.length = 0; await call(); return [...counting.statements]; };

  // Same real difference as vault-hot-path.test.ts (2026-10-12): the secrets_vault_default partial
  // index is keyed on (principal_id IS NULL, coalesce(...)) while the query filters
  // `principal_id is null and provider = ?`, so the planner cannot use it.
  test("vendor default lookup: one LIMIT 1 read on the default index, no group scan", { todo: "default partial index unused: group read filtered on is_default" }, async () => {
    const statements = await measure(() => mods.publish.resolveDefaultForPublish(d.vendor, { workspaceId: "ws", providerId: "tie-host" }));
    assert.equal(statements.length, 1, statements.map(s => s.sql).join("\n"));
    assert.match(statements[0].sql, /limit/i);
    // A pool hands each statement any connection: the plan runs in one transaction so the
    // `SET enable_seqscan = off` in explainPlan applies to the EXPLAIN that follows it.
    const plan = await fixture.kernel.transaction(() => explainPlan(fixture.kernel, statements[0]));
    assert.doesNotMatch(plan, /"Node Type":"Seq Scan"[^}]*"Relation Name":"secrets_vault"/, plan);
    assert.match(plan, /secrets_vault_default/, plan);
  });

  test("MCP server list: statement count does not grow with the number of servers", async () => {
    const before = await measure(() => mods.mcp.listExternalMcpServerViews(d.mcp, "ws"));
    for (const serverId of ["extra-one", "extra-two"]) {
      await mods.mcp.saveExternalMcpServer(d.mcp, { workspaceId: "ws", serverId, label: serverId, transport: "stdio", authMode: "static_env",
        enabled: true, command: "mcp-extra", args: "", allowedToolNames: "", writeAllowedToolNames: "", env: "KEY=value" });
    }
    const grown = await measure(() => mods.mcp.listExternalMcpServerViews(d.mcp, "ws"));
    assert.equal(grown.length, before.length, `4 servers: ${before.length} statements, 6 servers: ${grown.length}`);
    // One raw LEFT JOIN onto secrets_vault by primary key (external-mcp-repo.ts `read`): no N+1.
    assert.deepEqual(grown.map(statement => statement.kind), ["Raw"]);
  });
});
