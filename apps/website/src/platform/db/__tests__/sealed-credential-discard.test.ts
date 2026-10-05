import assert from "node:assert/strict";
import test from "node:test";

import { sql } from "kysely";

import type { UUID } from "@jini-ai/core/primitives";

import { buildExternalMcpEnvAad, buildExternalMcpOAuthAad } from "#src/assistant/external-mcp-aad";
import { buildCustomCredentialAad } from "#src/features/custom-credentials/aad";
import { buildMediaProviderCredentialAad } from "#src/features/media/aad";
import { InMemoryKeyring } from "../../../features/webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../../features/webhooks/secret-sealer.aesgcm.js";
import { seedPrincipals } from "../kernel/__tests__/content-seeds.js";
import { type ContentKernel, eachDialect } from "../kernel/__tests__/dialect-matrix.js";
import { SEALED_COLUMN_DESCRIPTORS } from "#src/server/runtime/composition/sealed-credential-descriptors";
import { countSealedCredentialsOpening, discardSealedCredentialsNotOpening, resealCredentialsOpeningUnder } from "../sealed-credential-discard.js";

/**
 * @file The site key tab's "Start fresh" discard and "Paste your old token" check
 * (`sealed-credential-discard.ts`): sealed values that do not open under a given key are removed —
 * a row whose sealed value is its whole point is deleted, a nullable sealed value is cleared with
 * the columns its shape check ties to it — and values that DO open are never touched.
 */

const WS = "ws-discard";
const NOW = "2026-09-29T00:00:00.000Z";
const TABLES = ["custom_credential_sets", "media_provider_credentials", "external_mcp_servers"];

type Sealer = AesGcmSecretSealer;

async function insertRow(kernel: ContentKernel, table: string, row: Record<string, unknown>): Promise<void> {
  const columns = sql.join(Object.keys(row).map((column) => sql.id(column)));
  await kernel.execute(sql`INSERT INTO ${sql.id(table)} (${columns}) VALUES (${sql.join(Object.values(row))})`);
}

async function sealedQuad(sealer: Sealer, keyring: InMemoryKeyring, aad: string, prefix = "") {
  const sealed = await sealer.seal({ plaintext: `secret:${aad}`, key: await keyring.activeKey(), aad });
  return { [`${prefix}sealed_key_id`]: sealed.keyId, [`${prefix}sealed_ciphertext`]: sealed.ciphertext, [`${prefix}sealed_nonce`]: sealed.nonce, [`${prefix}sealed_alg`]: sealed.alg };
}

/** `custom-right` and media `fal` open under `right`; `custom-wrong`, media `openai` and the MCP
 *  server's OAuth blob were sealed under another key; the MCP env blob opens under `right`. */
async function seed(kernel: ContentKernel, right: { sealer: Sealer; keyring: InMemoryKeyring }, wrong: { sealer: Sealer; keyring: InMemoryKeyring }): Promise<void> {
  await seedPrincipals(kernel, WS, ["principal-1"]);
  const stamps = { created_at: NOW, updated_at: NOW };
  for (const [id, key] of [["custom-right", right], ["custom-wrong", wrong]] as const) {
    await insertRow(kernel, "custom_credential_sets", {
      id, workspace_id: WS, label: id, category: "email", base_url: "https://mail.example.test", ...stamps,
      ...(await sealedQuad(key.sealer, key.keyring, buildCustomCredentialAad({ workspaceId: WS as UUID, id: id as UUID }))),
    });
  }
  for (const [providerId, key] of [["fal", right], ["openai", wrong]] as const) {
    await insertRow(kernel, "media_provider_credentials", {
      workspace_id: WS, provider_id: providerId, key_tail: "tail", aad_version: 1, ...stamps,
      ...(await sealedQuad(key.sealer, key.keyring, buildMediaProviderCredentialAad({ workspaceId: WS as UUID, providerId }))),
    });
  }
  await insertRow(kernel, "external_mcp_servers", {
    workspace_id: WS, server_id: "linear", transport: "http", auth_mode: "oauth", enabled: 1, url: "https://mcp.example.test", aad_version: 1, oauth_aad_version: 1, ...stamps,
    ...(await sealedQuad(right.sealer, right.keyring, buildExternalMcpEnvAad({ workspaceId: WS, serverId: "linear" }))),
    ...(await sealedQuad(wrong.sealer, wrong.keyring, buildExternalMcpOAuthAad({ workspaceId: WS, serverId: "linear" }), "oauth_")),
  });
}

async function credentialRows(kernel: ContentKernel): Promise<Record<string, Array<Record<string, unknown>>>> {
  const keys: Record<string, string> = {
    custom_credential_sets: "id",
    media_provider_credentials: "provider_id",
    external_mcp_servers: "server_id",
  };
  const result: Record<string, Array<Record<string, unknown>>> = {};
  for (const table of TABLES) {
    result[table] = await kernel.query<Record<string, unknown>>(
      sql`SELECT * FROM ${sql.id(table)} ORDER BY ${sql.id(keys[table]!)}`
    );
  }
  return result;
}

async function openStored(sealer: Sealer, row: Record<string, unknown>, aad: string, prefix = ""): Promise<string> {
  return sealer.open({
    sealed: {
      keyId: row[`${prefix}sealed_key_id`] as string,
      ciphertext: row[`${prefix}sealed_ciphertext`] as string,
      nonce: row[`${prefix}sealed_nonce`] as string,
      alg: row[`${prefix}sealed_alg`] as string,
    },
    aad,
  });
}

function keyPair(): { sealer: Sealer; keyring: InMemoryKeyring } {
  const keyring = new InMemoryKeyring();
  return { keyring, sealer: new AesGcmSecretSealer(keyring) };
}

for (const each of eachDialect({ tables: TABLES, make: (kernel) => kernel })) {
  test(`unknown or throwing AAD selection and incomplete sealed siblings count as unreadable [${each.name}]`, async () => {
    const kernel = each.make();
    const right = keyPair();
    await seed(kernel, right, keyPair());
    await kernel.execute(sql`CREATE TABLE p_discard_test__incomplete (id text PRIMARY KEY, sealed_ciphertext text)`);
    try {
      await kernel.execute(sql`INSERT INTO p_discard_test__incomplete (id, sealed_ciphertext) VALUES ('incomplete', 'opaque')`);
      let openCalls = 0;
      const sealer = { open: async () => { openCalls += 1; return "unexpected"; } };
      const unknown = SEALED_COLUMN_DESCRIPTORS.map((descriptor) => ({
        ...descriptor, aadFor: () => ({ kind: "unrecognized-aad-version" as const }),
      }));
      assert.deepEqual(await countSealedCredentialsOpening({ kernel, sealer, descriptors: unknown }), { sealed: 7, opens: 0 });
      const throwing = SEALED_COLUMN_DESCRIPTORS.map((descriptor) => ({
        ...descriptor, aadFor: () => { throw new Error("descriptor failure"); },
      }));
      assert.deepEqual(await countSealedCredentialsOpening({ kernel, sealer, descriptors: throwing }), { sealed: 7, opens: 0 });
      assert.equal(openCalls, 0);
    } finally {
      await kernel.execute(sql`DROP TABLE p_discard_test__incomplete`);
    }
  });

  test(`a later credential write failure rolls back every earlier discard or reseal [${each.name}]`, async () => {
    for (const action of ["discard", "reseal"] as const) {
      const kernel = each.make();
      const right = keyPair();
      const previous = keyPair();
      await seed(kernel, right, previous);
      const before = await credentialRows(kernel);
      let writes = 0;
      const failing: ContentKernel = {
        ...kernel,
        execute: async (statement) => {
          writes += 1;
          if (writes === 2) throw new Error("injected second credential write");
          return kernel.execute(statement);
        },
      };
      const common = { kernel: failing, descriptors: SEALED_COLUMN_DESCRIPTORS, sealer: right.sealer };
      const mutation = action === "discard"
        ? discardSealedCredentialsNotOpening(common)
        : resealCredentialsOpeningUnder({ ...common, key: await right.keyring.activeKey(), previous: previous.sealer });
      await assert.rejects(mutation, /injected second credential write/);
      assert.equal(writes, 2);
      assert.deepEqual(await credentialRows(kernel), before);
    }
  });

  test(`a credential replaced after the snapshot survives both stale mutation paths [${each.name}]`, async () => {
    for (const action of ["discard", "reseal"] as const) {
      const kernel = each.make();
      const right = keyPair();
      const previous = keyPair();
      await seed(kernel, right, previous);
      const aad = buildCustomCredentialAad({ workspaceId: WS as UUID, id: "custom-wrong" as UUID });
      const replacement = await sealedQuad(right.sealer, right.keyring, aad);
      let changed = false;
      const sealer = {
        seal: right.sealer.seal.bind(right.sealer),
        open: async (input: Parameters<Sealer["open"]>[0]) => {
          if (!changed && input.aad === aad) {
            changed = true;
            await kernel.execute(sql`UPDATE custom_credential_sets
              SET sealed_key_id = ${replacement.sealed_key_id},
                  sealed_ciphertext = ${replacement.sealed_ciphertext},
                  sealed_nonce = ${replacement.sealed_nonce},
                  sealed_alg = ${replacement.sealed_alg}
              WHERE id = 'custom-wrong' AND workspace_id = ${WS}`);
          }
          return right.sealer.open(input);
        },
      };
      const common = { kernel, descriptors: SEALED_COLUMN_DESCRIPTORS, sealer };
      if (action === "discard") {
        await discardSealedCredentialsNotOpening(common);
      } else {
        await resealCredentialsOpeningUnder({ ...common, key: await right.keyring.activeKey(), previous: previous.sealer });
      }
      assert.equal(changed, true);
      const [row] = await kernel.query<Record<string, unknown>>(sql`SELECT * FROM custom_credential_sets WHERE id = 'custom-wrong' AND workspace_id = ${WS}`);
      assert.ok(row);
      for (const [column, value] of Object.entries(replacement)) assert.equal(row[column], value);
      assert.equal(await openStored(right.sealer, row, aad), `secret:${aad}`);
    }
  });

  test(`countSealedCredentialsOpening counts every sealed value and how many open under the given sealer [${each.name}]`, async () => {
    const kernel = each.make();
    const right = keyPair();
    await seed(kernel, right, keyPair());

    const counts = await countSealedCredentialsOpening({ kernel, sealer: right.sealer, descriptors: SEALED_COLUMN_DESCRIPTORS });

    assert.deepEqual(counts, { sealed: 6, opens: 3 });
  });

  test(`discardSealedCredentialsNotOpening deletes unreadable whole-row credentials, clears unreadable nullable ones, keeps readable ones [${each.name}]`, async () => {
    const kernel = each.make();
    const right = keyPair();
    await seed(kernel, right, keyPair());

    const result = await discardSealedCredentialsNotOpening({ kernel, sealer: right.sealer, descriptors: SEALED_COLUMN_DESCRIPTORS });

    assert.deepEqual(result, { discarded: 3, kept: 3 });
    const custom = await kernel.query<{ id: string }>(sql`SELECT id FROM custom_credential_sets ORDER BY id`);
    assert.deepEqual(custom.map((row) => row.id), ["custom-right"], "the unreadable custom credential row is deleted");
    const media = await kernel.query<{ provider_id: string; sealed_ciphertext: string | null; key_tail: string | null }>(
      sql`SELECT provider_id, sealed_ciphertext, key_tail FROM media_provider_credentials ORDER BY provider_id`
    );
    assert.equal(media.length, 2, "a nullable sealed value is cleared, its row kept");
    assert.notEqual(media[0]!.sealed_ciphertext, null, "the readable media key is untouched");
    assert.equal(media[1]!.sealed_ciphertext, null);
    assert.equal(media[1]!.key_tail, null, "the tail tied to the cleared value by the shape check is cleared too");
    const [server] = await kernel.query<{ sealed_ciphertext: string | null; oauth_sealed_ciphertext: string | null; oauth_sealed_key_id: string | null }>(
      sql`SELECT sealed_ciphertext, oauth_sealed_ciphertext, oauth_sealed_key_id FROM external_mcp_servers`
    );
    assert.notEqual(server!.sealed_ciphertext, null, "the readable env blob on the same row is kept");
    assert.equal(server!.oauth_sealed_ciphertext, null, "only the unreadable OAuth blob is cleared");
    assert.equal(server!.oauth_sealed_key_id, null);

    assert.deepEqual(await countSealedCredentialsOpening({ kernel, sealer: right.sealer, descriptors: SEALED_COLUMN_DESCRIPTORS }), { sealed: 3, opens: 3 }, "everything left opens");
  });

  test(`resealCredentialsOpeningUnder moves values sealed under the previous key onto the new one, leaves the rest alone [${each.name}]`, async () => {
    const kernel = each.make();
    const right = keyPair();
    const previous = keyPair();
    await seed(kernel, right, previous);
    const other = keyPair();
    const strandedAad = buildCustomCredentialAad({ workspaceId: WS as UUID, id: "custom-other" as UUID });
    await insertRow(kernel, "custom_credential_sets", {
      id: "custom-other", workspace_id: WS, label: "custom-other", category: "email", base_url: "https://mail.example.test", created_at: NOW, updated_at: NOW,
      ...(await sealedQuad(other.sealer, other.keyring, strandedAad)),
    });
    const [strandedBefore] = await kernel.query<{ sealed_ciphertext: string }>(sql`SELECT sealed_ciphertext FROM custom_credential_sets WHERE id = 'custom-other'`);
    const beforeRows = await credentialRows(kernel);

    const result = await resealCredentialsOpeningUnder({
      kernel, descriptors: SEALED_COLUMN_DESCRIPTORS, sealer: right.sealer, key: await right.keyring.activeKey(), previous: previous.sealer,
    });

    assert.deepEqual(result, { resealed: 3, unreadable: 1 });
    assert.deepEqual(await countSealedCredentialsOpening({ kernel, sealer: right.sealer, descriptors: SEALED_COLUMN_DESCRIPTORS }), { sealed: 7, opens: 6 }, "every value the previous key opened now opens under the new one");
    const [moved] = await kernel.query<{ sealed_key_id: string; sealed_ciphertext: string; sealed_nonce: string; sealed_alg: string }>(
      sql`SELECT sealed_key_id, sealed_ciphertext, sealed_nonce, sealed_alg FROM custom_credential_sets WHERE id = 'custom-wrong'`
    );
    const plaintext = await right.sealer.open({
      sealed: { keyId: moved!.sealed_key_id, ciphertext: moved!.sealed_ciphertext, nonce: moved!.sealed_nonce, alg: moved!.sealed_alg },
      aad: buildCustomCredentialAad({ workspaceId: WS as UUID, id: "custom-wrong" as UUID }),
    });
    assert.equal(plaintext, `secret:${buildCustomCredentialAad({ workspaceId: WS as UUID, id: "custom-wrong" as UUID })}`, "the same secret, under the same AAD, now under the new key");
    const afterRows = await credentialRows(kernel);
    for (const row of afterRows.custom_credential_sets!) {
      const id = row.id as UUID;
      const aad = buildCustomCredentialAad({ workspaceId: WS as UUID, id });
      assert.equal(await openStored(id === "custom-other" ? other.sealer : right.sealer, row, aad), `secret:${aad}`);
      if (id !== "custom-wrong") {
        assert.deepEqual(row, beforeRows.custom_credential_sets!.find((before) => before.id === id));
      }
    }
    for (const row of afterRows.media_provider_credentials!) {
      const providerId = row.provider_id as string;
      const aad = buildMediaProviderCredentialAad({ workspaceId: WS as UUID, providerId });
      assert.equal(await openStored(right.sealer, row, aad), `secret:${aad}`);
      if (providerId === "fal") {
        assert.deepEqual(row, beforeRows.media_provider_credentials!.find((before) => before.provider_id === providerId));
      }
    }
    const server = afterRows.external_mcp_servers![0]!;
    const envAad = buildExternalMcpEnvAad({ workspaceId: WS, serverId: "linear" });
    const oauthAad = buildExternalMcpOAuthAad({ workspaceId: WS, serverId: "linear" });
    assert.equal(await openStored(right.sealer, server, envAad), `secret:${envAad}`);
    assert.equal(await openStored(right.sealer, server, oauthAad, "oauth_"), `secret:${oauthAad}`);
    for (const column of ["sealed_key_id", "sealed_ciphertext", "sealed_nonce", "sealed_alg"]) {
      assert.equal(server[column], beforeRows.external_mcp_servers![0]![column]);
    }
    const [strandedAfter] = await kernel.query<{ sealed_ciphertext: string }>(sql`SELECT sealed_ciphertext FROM custom_credential_sets WHERE id = 'custom-other'`);
    assert.equal(strandedAfter!.sealed_ciphertext, strandedBefore!.sealed_ciphertext, "a value neither key opens is left as it was");
  });
}
