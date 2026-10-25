import assert from "node:assert/strict";
import test from "node:test";

import Ajv from "ajv";

import { siteBackupAgentToolCatalog, siteBackupDerivedRisk } from "../tool-registrations.js";

/**
 * @file Inline contract for the site-backup/import/share tool catalog (Stryker lane L14: 79.6 %, 33
 * declarative survivors at L92, AP5). Import needs `system.write`; backup push and every share tool
 * need `site-backup.push`; every schema is closed. `site_import_backup` takes EXACTLY one of url or
 * uploadId (oneOf).
 */

const EXPECTED = [
  {
    name: "site_import_backup",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "system.write" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      oneOf: [
        { required: ["url"] },
        { required: ["uploadId"] },
      ],
      properties: {
        url: { type: "string" },
        uploadId: { type: "string" },
        displayName: { type: "string", maxLength: 200 },
        requestId: { type: "string", maxLength: 128 },
      },
    },
  },
  {
    name: "site_import_list",
    sideEffects: "none",
    authorization: { permission: "system.read" },
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
  },
  {
    name: "site_backup_plan",
    sideEffects: "none",
    authorization: { permission: "site-backup.push" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["owner", "repo"],
      properties: {
        credential: { type: "string" },
        owner: { type: "string" },
        repo: { type: "string" },
        branch: { type: "string" },
        folder: { type: "string" },
        include: {
          type: "object",
          additionalProperties: false,
          properties: {
            database: { type: "boolean" },
            media: { type: "boolean" },
            themes: { type: "boolean" },
            plugins: { type: "boolean" },
            settings: { type: "boolean" },
          },
        },
        commitMessage: { type: "string" },
      },
    },
  },
  {
    name: "site_backup_push",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "site-backup.push" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["planId"],
      properties: { planId: { type: "string" } },
    },
  },
  {
    name: "site_share_create",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "site-backup.push" },
    inputSchema: { type: "object", additionalProperties: false, properties: { jobId: { type: "string" } } },
  },
  {
    name: "site_share_list",
    sideEffects: "none",
    authorization: { permission: "site-backup.push" },
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
  },
  {
    name: "site_share_revoke",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "site-backup.push" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["shareId"],
      properties: { shareId: { type: "string" } },
    },
  },
];

const strip = (v: unknown): unknown => JSON.parse(JSON.stringify(v, (k, x) => (k === "description" ? undefined : x)));

test("site-backup catalog matches the inline contract, in order", () => {
  assert.deepEqual(strip(siteBackupAgentToolCatalog), EXPECTED);
});

test("site-backup derived risk agrees with every declared side effect", () => {
  assert.deepEqual([...siteBackupDerivedRisk].sort(), siteBackupAgentToolCatalog.map((t) => [t.name, t.sideEffects]).sort());
});

test("site_import_backup: exactly one of url / uploadId, bounded displayName/requestId, no extra keys", () => {
  const validate = new Ajv().compile(siteBackupAgentToolCatalog.find((t) => t.name === "site_import_backup")!.inputSchema!);
  const cases: Array<[Record<string, unknown>, boolean]> = [
    [{ url: "https://x" }, true], [{ uploadId: "u" }, true], [{ url: "https://x", uploadId: "u" }, false], [{}, false],
    [{ url: "https://x", displayName: "d".repeat(200) }, true], [{ url: "https://x", displayName: "d".repeat(201) }, false],
    [{ uploadId: "u", requestId: "r".repeat(128) }, true], [{ uploadId: "u", requestId: "r".repeat(129) }, false],
    [{ url: "https://x", extra: 1 }, false],
  ];
  for (const [input, ok] of cases) assert.equal(validate(input), ok, JSON.stringify(input).slice(0, 60));
});
