import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import { sql } from "kysely";
import { dropDatabase, freshPostgresDatabase } from "../postgres-database.js";
import { openPostgresKernel } from "../../kernel/drivers/postgres.js";
import { CURRENT_SRC, GOLDEN_PATH, READ_GROUPS, assertPostgresVaultPlanIndexed, countingKernel, expectedTranscript, explainPlan, knownIssue, loadParityModules,
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

  // Same lookup as vault-hot-path.test.ts: the query restates the group in the
  // secrets_vault_default index expressions with a literal is_default (2026-10-12), so a pooled
  // server plans it on that index; before, it used secrets_vault_group_label without the provider.
  test("vendor group default repository lookup: one LIMIT 1 read on the default index, no group scan", async () => {
    const statements = await measure(() => d.vendor.repo.findDefaultByVendor({ workspaceId: "ws", vendorId: "vendor-tie" }));
    assert.equal(statements.length, 1, statements.map(s => s.sql).join("\n"));
    assert.match(statements[0].sql, /limit/i);
    // Unanalyzed, this index and secrets_vault_group_label cost the same (vault-hot-path.test.ts).
    await fixture.kernel.execute(sql`ANALYZE secrets_vault`);
    // A pool hands each statement any connection: the plan runs in one transaction so the
    // `SET enable_seqscan = off` in explainPlan applies to the EXPLAIN that follows it.
    const plan = await fixture.kernel.transaction(() => explainPlan(fixture.kernel, statements[0]));
    assertPostgresVaultPlanIndexed(plan, plan);
    assert.match(plan, /secrets_vault_default/, plan);
  });

  // 1d96267e3 requires compatibility selection across both stored credential kinds.
  test("publish compatibility selection: one inventory per kind and one selected row read", async () => {
    const statements = await measure(() => mods.publish.resolveDefaultForPublish(d.vendor, { workspaceId: "ws", providerId: "tie-host" }));
    assert.equal(statements.length, 3, statements.map(s => s.sql).join("\n"));
    assert.deepEqual(statements.map(s => s.parameters), [["ws", "vendor", "tovu"], ["ws", "custom", "tovu"], ["ws", "tie-b"]]);
    assert.ok(statements.every(s => s.kind === "SelectQueryNode"));
    for (const statement of statements) {
      const plan = await fixture.kernel.transaction(() => explainPlan(fixture.kernel, statement));
      assertPostgresVaultPlanIndexed(plan, `${statement.sql}\n${plan}`);
    }
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
