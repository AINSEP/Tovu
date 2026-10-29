import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { describe, test } from "node:test";

import { sql } from "kysely";
import type { Product, StoreApi } from "#src/features/plugins/store/store-plugin";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { buildRouteManifest } from "#src/features/site-export/route-manifest";
import { collectTransferTables } from "#src/features/database-transfer/table-catalog";
import { classifyAllCoreColumns } from "#src/platform/db/migration/manifest";
import { SqlUserPurge } from "#src/features/identity/user-purge";
import { buildTrashRegistry } from "#src/features/trash/registry";
import { createTableTrashAdapter } from "#src/features/trash/table-adapter";
import { createMemberTrashAdapter } from "#src/features/trash/adapters/member";
import { createUserTrashAdapter } from "#src/features/trash/adapters/user";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { resolveStorefrontProducts } from "../products.js";
import { createCommerceSiteTestApp, type CommerceSiteTestDeps } from "./commerce-site-app.js";

/**
 * @file Commerce-strip parity (DBMERGE-PLAN §2d): step 0011 (57291a25b) dropped the six empty core
 * `commerce_*` tables, the optional core-catalog path in `resolveStorefrontProducts` and the
 * `commerce_orders` blocker on member Trash. Pre-strip, the production composition never wired the
 * core catalog (`createRouteDeps()` at 4570fce9d sets no `commerceProductRepo`/`commercePriceRepo`),
 * so the store plugin was always what rendered; and the blocker counted rows in a table no site ever
 * filled. These tests pin that every outcome stayed the same, and that the transfer catalog and the
 * manifest's classification lost exactly the six tables, allowing the explicitly pinned later
 * schema additions below. The pre-strip catalog and classification
 * are `__fixtures__/commerce-strip-parity.golden.json` (`capture-commerce-strip-golden.ts`).
 */
const COMMERCE = ["commerce_order_items", "commerce_orders", "commerce_prices", "commerce_product_images", "commerce_products", "commerce_webhook_events"];
/** Folded into `secrets_vault` by 0012 (9b20083b6), after the strip; pinned by `vault-boundary-parity.test.ts`. */
const VAULT_RETIRED = ["site_assistant_credentials", "admin_execution_credentials", "media_provider_credentials", "custom_credential_sets",
  "publish_content_peers", "database_transfer_destinations", "vendor_credential_sets", "source_control_credential_sets", "publish_credential_sets",
  "oauth_pending_authorizations"];
/** 0012 moved the MCP server's sealed columns into the vault, leaving two pointers behind. */
const MCP_SEALED = ["sealed_key_id", "sealed_ciphertext", "sealed_nonce", "sealed_alg", "aad_version",
  "oauth_sealed_key_id", "oauth_sealed_ciphertext", "oauth_sealed_nonce", "oauth_sealed_alg", "oauth_aad_version"];
const MCP_POINTERS = ["env_secret_id", "oauth_secret_id"];

// Preserve the historical golden: these later migrations add columns, never exemptions from parity.
// f6de81431 (0014), 14f5085fd (0015), c29687fd7 (0016/0017).
const LATER_COLUMNS: Record<string, { before: string; classes: Record<string, string> }> = {
  asset_blobs: { before: "content_type", classes: { document_owned: "boolean-flag" } },
  media: { before: "title", classes: { kind: "plain-text", original_filename: "plain-text" } },
  publish_history: { before: "published_at", classes: { credential_id: "plain-text", config_fields_json: "json-text", kind: "plain-text" } },
};

// Later migrations' whole tables, pinned column by column the same way: copied tables enter the
// transfer catalog in copy order before `before`; `form_receiver_pulls` is classified but never
// copied (`database-transfer/exclusions.ts` says why). a8bce53c8 (0018), 6bee1800b (0019).
const LATER_TABLES: Record<string, { before: string | null; classes: Record<string, string> }> = {
  form_delivery_jobs: { before: "form_submissions", classes: { job_id: "plain-text", workspace_id: "plain-text", submission_id: "plain-text",
    binding_id: "plain-text", adapter_id: "plain-text" } },
  form_delivery_plans: { before: "form_submissions", classes: { workspace_id: "plain-text", submission_id: "plain-text", form_id: "plain-text" } },
  form_receiver_pulls: { before: null, classes: { workspace_id: "plain-text", receiver_key: "plain-text", lease_token: "plain-text",
    lease_expires_at: "utc-timestamp-text", last_started_at: "utc-timestamp-text" } },
  form_submission_remote_receipts: { before: "form_submissions", classes: { workspace_id: "plain-text", destination_key: "plain-text",
    remote_id: "plain-text", submission_id: "plain-text", imported_at: "utc-timestamp-text" } },
  // 8bfa8b040 (0035): provider subject associations, with no bearer credentials.
  member_external_identities: { before: "member_revisions", classes: { id: "plain-text", workspace_id: "plain-text",
    member_id: "plain-text", provider_id: "plain-text", issuer: "plain-text", subject: "plain-text",
    linked_at: "utc-timestamp-text", unlinked_at: "utc-timestamp-text" } },
};

// Classified but never copied (`member_magic_tokens` is a login table in `database-transfer/exclusions.ts`),
// so only the classification parity sees it. 0032 (new-address sign-in challenge email).
// b9d3b37b3 (0034) adds member passwords and code challenges; members now stays behind in a copy.
const LATER_UNCOPIED_COLUMNS: Record<string, Record<string, string>> = {
  members: { password_hash: "plain-text" },
  member_magic_tokens: { email: "plain-text", code_hash: "plain-text", failed_attempts: "plain-integer" },
};

const golden = JSON.parse(readFileSync(join(import.meta.dirname, "__fixtures__/commerce-strip-parity.golden.json"), "utf8")) as {
  transfer: Record<string, string[]>; classes: Record<string, Record<string, string>>;
};

const products: Product[] = [
  { id: "prod-1", slug: "classic-boxy-tee", title: "Classic Boxy Tee", price: 3500, stock: 5, version: 1 },
  { id: "prod-2", slug: "canvas-tote", title: "Canvas Tote", price: 1800, stock: 2, version: 3 },
];
const store: StoreApi = { listProducts: async () => products, checkout: async () => ({ ok: false, reason: "not-found", retries: 0 }) };

describe("storefront under the production composition", () => {
  async function startServer() {
    const server = createServer(createCommerceSiteTestApp({ ...createRouteDeps(), store }));
    server.listen(0);
    await once(server, "listening");
    return { server, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
  }

  test("/products renders exactly the store plugin's products, the pre-strip fallback", async (t) => {
    const deps = createRouteDeps();
    assert.equal("commerceProductRepo" in deps || "commercePriceRepo" in deps, false, "the core catalog was never wired");
    assert.deepEqual(await resolveStorefrontProducts({ ...deps, store }), products);
    const { server, baseUrl } = await startServer();
    t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
    const res = await fetch(`${baseUrl}/products`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Classic Boxy Tee/);
    assert.match(html, /Canvas Tote/);
  });

  test("/products/:id finds a store product by id or slug; an unknown one is a 404", async (t) => {
    const { server, baseUrl } = await startServer();
    t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
    for (const path of ["/products/prod-2", "/products/canvas-tote"]) {
      const res = await fetch(`${baseUrl}${path}`);
      assert.equal(res.status, 200, path);
      assert.match(await res.text(), /Canvas Tote/, path);
    }
    const missing = await fetch(`${baseUrl}/products/not-a-product`);
    assert.equal(missing.status, 404);
    assert.match(await missing.text(), /product not found/);
  });

  test("the static-export route manifest lists the same product routes", async () => {
    // `resolveStorefrontProducts` is a closure over the composed object: mutate it, never spread it.
    const deps = createRouteDeps() as ReturnType<typeof createRouteDeps> & CommerceSiteTestDeps;
    deps.store = store;
    const { routes } = await buildRouteManifest(deps);
    assert.deepEqual(routes.filter(route => route.kind === "product-list" || route.kind === "product"), [
      { path: "/products", kind: "product-list", label: "products" },
      { path: "/products/classic-boxy-tee", kind: "product", label: "Classic Boxy Tee" },
      { path: "/products/canvas-tote", kind: "product", label: "Canvas Tote" },
    ]);
  });
});

const WS = "ws-commerce-strip";
const T0 = "2026-09-01T00:00:00.000Z";
const AT = "2026-10-11T12:00:00.000Z";
const EXPIRES = "2027-01-01T00:00:00.000Z";
const TABLES = ["workspaces", "members", "member_sessions", "member_magic_tokens", "principals", "identity_users", "sessions",
  "principal_roles", "principal_policies", "api_keys", "setting_values_user", "outbox_events"];

async function count(kernel: ContentKernel, table: string): Promise<number> {
  const [row] = await kernel.query<{ n: number | string }>(sql`SELECT count(*) AS n FROM ${sql.table(table)}`);
  return Number(row.n);
}

async function seed(kernel: ContentKernel): Promise<void> {
  await kernel.execute(sql`INSERT INTO workspaces (id, name, slug, created_at) VALUES (${WS}, ${WS}, ${WS}, ${T0})`);
  await kernel.execute(sql`INSERT INTO members (id, workspace_id, email, status, fields_json, created_at, updated_at, version)
    VALUES ('member-1', ${WS}, 'member-1@example.test', 'active', '{}', ${T0}, ${T0}, 1)`);
  await kernel.execute(sql`INSERT INTO member_sessions (id, workspace_id, member_id, token_hash, created_at, expires_at)
    VALUES ('session-1', ${WS}, 'member-1', 'hash-member-1', ${T0}, ${EXPIRES})`);
  await kernel.execute(sql`INSERT INTO member_magic_tokens (id, workspace_id, member_id, token_hash, purpose, created_at, expires_at)
    VALUES ('link-1', ${WS}, 'member-1', 'link-hash-1', 'sign_in', ${T0}, ${EXPIRES})`);
  await kernel.execute(sql`INSERT INTO principals (id, workspace_id, kind, display_name, status, disabled_at, created_at)
    VALUES ('u-1', ${WS}, 'user', 'Departing', 'active', NULL, ${T0})`);
  await kernel.execute(sql`INSERT INTO identity_users (principal_id, workspace_id, username, password_hash) VALUES ('u-1', ${WS}, 'departing', 'x')`);
  await kernel.execute(sql`INSERT INTO sessions (id, workspace_id, principal_id, token_hash, created_at, expires_at)
    VALUES ('sess-u-1', ${WS}, 'u-1', 'hash-u-1', ${T0}, ${EXPIRES})`);
}

describeEachDialect("trash and purge on a database migrated past 0011", { tables: TABLES, make: (kernel: ContentKernel) => kernel }, (make) => {
  test("a member with live credentials moves to Trash and purges, as it did with no orders before the strip", async () => {
    const kernel = make();
    await seed(kernel);
    // The table the old blocker counted is gone: keeping that blocker would now fail every purge.
    await assert.rejects(kernel.query(sql`SELECT count(*) AS n FROM commerce_orders`));
    const entry = buildTrashRegistry().get("member")!;
    assert.equal(entry.blocker, undefined);
    const member = createMemberTrashAdapter({ adapter: createTableTrashAdapter({ entry, db: kernel }), db: kernel });

    const hidden = await member.hide({ workspaceId: WS, entityId: "member-1", at: AT, expectedVersion: 1 });
    assert.equal(hidden.ok, true);
    assert.equal(hidden.ok && hidden.version, 2);
    assert.equal(await member.purge({ workspaceId: WS, entityId: "member-1", expectedVersion: 2 }), "purged");
    assert.deepEqual(await Promise.all(["members", "member_sessions", "member_magic_tokens"].map(table => count(kernel, table))), [0, 0, 0]);
  });

  test("a user moves to Trash and purges with its login and sessions, as before the strip", async () => {
    const kernel = make();
    await seed(kernel);
    let n = 0;
    const user = createUserTrashAdapter({ db: kernel, purge: new SqlUserPurge(kernel), idGen: { next: () => `evt-${++n}` }, clock: { nowIso: () => AT } });

    assert.equal((await user.hide({ workspaceId: WS, entityId: "u-1", at: AT, expectedVersion: null })).ok, true);
    assert.equal(await user.purge({ workspaceId: WS, entityId: "u-1", expectedVersion: null }), "purged");
    assert.deepEqual(await Promise.all(["principals", "identity_users", "sessions"].map(table => count(kernel, table))), [0, 0, 0]);
    assert.equal(await count(kernel, "members"), 1, "a user purge leaves members alone");
  });
});

describe("catalogs against the pre-strip tree (4570fce9d)", () => {
  const without = <T>(record: Record<string, T>, names: string[]) => Object.fromEntries(Object.entries(record).filter(([name]) => !names.includes(name)));

  test("the transfer catalog loses exactly the six commerce tables and gains the named later columns", () => {
    for (const name of COMMERCE) assert.ok(name in golden.transfer, `pre-strip copied ${name}`);
    const actual = Object.fromEntries(collectTransferTables().map(table => [table.name, table.columns.map(column => column.name)]));
    const expected = without(golden.transfer, [...COMMERCE, "members"]);
    for (const [table, addition] of Object.entries(LATER_COLUMNS)) {
      const columns = [...expected[table]];
      const at = columns.indexOf(addition.before);
      assert.notEqual(at, -1, `${table}: the pre-strip insertion anchor must exist`);
      columns.splice(at, 0, ...Object.keys(addition.classes));
      expected[table] = columns;
    }
    // 0037 (cloud snapshot 2a0c60ac): per-media source metadata follows the source hash.
    const sourceAt = expected.media.indexOf("source_sha256");
    assert.notEqual(sourceAt, -1, "media: the pre-strip source hash anchor must exist");
    expected.media.splice(sourceAt + 1, 0, "source_metadata_json");
    let entries = Object.entries(expected);
    for (const [table, addition] of Object.entries(LATER_TABLES)) {
      if (addition.before === null) continue;
      const at = entries.findIndex(([name]) => name === addition.before);
      assert.notEqual(at, -1, `${table}: the pre-strip insertion anchor must exist`);
      entries = [...entries.slice(0, at), [table, Object.keys(addition.classes)], ...entries.slice(at)];
    }
    // Entries compare in copy order: dropping six leaf tables must not reorder the rest.
    assert.deepEqual(Object.entries(actual), entries);
  });

  test("the manifest classifies every other table's columns as before", () => {
    const actual: Record<string, Record<string, string>> = {};
    for (const { sqlTableName, sqlColumnName, columnClass } of classifyAllCoreColumns()) {
      const growthClass = "growthClass" in columnClass ? columnClass.growthClass : undefined;
      (actual[sqlTableName] ??= {})[sqlColumnName] = growthClass ? `${columnClass.kind}:${growthClass}` : columnClass.kind;
    }
    for (const name of COMMERCE) assert.equal(name in actual, false, name);
    const expected = without(golden.classes, [...COMMERCE, ...VAULT_RETIRED]);
    for (const [table, addition] of Object.entries(LATER_COLUMNS)) {
      expected[table] = { ...expected[table], ...addition.classes };
    }
    expected.media = { ...expected.media, source_metadata_json: "json-text" };
    for (const [table, addition] of Object.entries(LATER_TABLES)) expected[table] = addition.classes;
    for (const [table, classes] of Object.entries(LATER_UNCOPIED_COLUMNS)) expected[table] = { ...expected[table], ...classes };
    expected.external_mcp_servers = without(expected.external_mcp_servers, MCP_SEALED);
    const current = without(actual, ["secrets_vault"]);
    current.external_mcp_servers = without(current.external_mcp_servers, MCP_POINTERS);
    assert.deepEqual(current, expected);
  });
});
