import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSiteCapabilities,
  MAX_TOOL_SUMMARY_CHARS,
  SITE_CAPABILITIES_SECTION_NAMES,
  SITE_CAPABILITIES_SECTION_PERMISSIONS,
  summarizeToolDescription,
  type SiteCapabilitiesDeps,
  type SiteCapabilityToolRow,
} from "../site-capabilities.js";

/**
 * @file `buildSiteCapabilities()` against fake ports: per-section authorization (the same shape
 * `site-profile.unit.test.ts` pins for `buildSiteProfile`), that the tools section is read from the
 * injected registry reader at CALL time rather than captured into a second index, and that tool
 * summaries stay one short line.
 */

const WORKSPACE_ID = "ws-site-capabilities";
const PRINCIPAL_ID = "principal-under-test";

const ADMIN_SCREENS = [
  { id: "dashboard", label: "Overview", path: "/" },
  { id: "posts", label: "Posts", path: "/posts" },
];

function toolRows(): SiteCapabilityToolRow[] {
  return [
    {
      id: "site_get_profile",
      source: "site",
      description: "Returns one structured snapshot of how this site is currently CONFIGURED. Call this first.",
    },
    { id: "forms_update_definition", source: "forms", description: "Updates an existing form definition." },
    {
      id: "forms_create_definition",
      source: "forms",
      description: "Creates a new form definition.\n   Use forms_update_definition to change one.",
    },
    { id: "content_read.post", source: "content", description: "Reads posts." },
  ];
}

/** Records which permission each section asked for, and which section reads actually ran. */
interface Logs {
  permissions: { permission: string; entityId?: string | undefined; principalId: string; workspaceId: string }[];
  reads: string[];
}

function makeDeps(
  overrides: {
    allow?: (permission: string) => boolean;
    logs?: Logs;
    tools?: SiteCapabilityToolRow[];
    withoutToolReader?: boolean;
    contentTypesError?: Error;
  } = {},
): SiteCapabilitiesDeps {
  const allow = overrides.allow ?? (() => true);
  const logs = overrides.logs;
  const tools = overrides.tools ?? toolRows();
  const deps: SiteCapabilitiesDeps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => "2026-09-15T00:00:00.000Z" },
    authorize: async (params) => {
      logs?.permissions.push({
        permission: params.permission,
        entityId: params.entityId,
        principalId: params.principalId,
        workspaceId: params.workspaceId,
      });
      return allow(params.permission) ? { allowed: true, reason: "matched" } : { allowed: false, reason: "no-grant" };
    },
    listAdminScreens: () => {
      logs?.reads.push("adminScreens");
      return ADMIN_SCREENS;
    },
    listContentTypes: async () => {
      logs?.reads.push("contentTypes");
      if (overrides.contentTypesError) throw overrides.contentTypesError;
      return [
        { key: "recipe", label: "Recipe" },
        { key: "event", label: "Event", tombstonedAt: null },
        { key: "retired", label: "Retired", tombstonedAt: "2026-01-01T00:00:00.000Z" },
      ];
    },
  };
  if (!overrides.withoutToolReader) {
    deps.listCatalogTools = () => {
      logs?.reads.push("tools");
      return tools;
    };
  }
  return deps;
}

test("site capabilities: a fully granted principal gets every section, each authorized against its own permission", async () => {
  const logs: Logs = { permissions: [], reads: [] };
  const result = await buildSiteCapabilities(makeDeps({ logs }), { principalId: PRINCIPAL_ID });

  assert.equal(result.schemaVersion, "1");
  assert.equal(result.capturedAt, "2026-09-15T00:00:00.000Z");
  assert.equal(result.completeness, "complete");
  assert.deepEqual(Object.keys(result.sections), [...SITE_CAPABILITIES_SECTION_NAMES]);
  for (const name of SITE_CAPABILITIES_SECTION_NAMES) {
    assert.equal(result.sections[name]?.status, "ok", `${name} should be ok`);
  }
  assert.deepEqual(
    logs.permissions.map((call) => `${call.entityId}:${call.permission}`).sort(),
    SITE_CAPABILITIES_SECTION_NAMES.map((name) => `${name}:${SITE_CAPABILITIES_SECTION_PERMISSIONS[name]}`).sort(),
  );
  for (const call of logs.permissions) {
    assert.equal(call.principalId, PRINCIPAL_ID);
    assert.equal(call.workspaceId, WORKSPACE_ID);
  }
});

test("site capabilities: section permissions reuse the existing vocabulary rather than minting a new one", () => {
  assert.deepEqual(SITE_CAPABILITIES_SECTION_PERMISSIONS, {
    tools: "admin.assistant.use",
    adminScreens: "admin.assistant.use",
    contentTypes: "admin.collections.read",
  });
});

test("tools section: grouped by the reader's source, sorted, counted, and pointing at describe_tool/search_tools", async () => {
  const result = await buildSiteCapabilities(makeDeps(), { principalId: PRINCIPAL_ID });
  const data = result.sections.tools?.data;
  assert.ok(data);

  assert.equal(data.total, 4);
  assert.equal(data.domainCount, 3);
  assert.deepEqual(
    data.domains.map((domain) => [domain.domain, domain.count]),
    [
      ["content", 1],
      ["forms", 2],
      ["site", 1],
    ],
  );
  assert.deepEqual(data.domains[1]?.tools, [
    { id: "forms_create_definition", summary: "Creates a new form definition." },
    { id: "forms_update_definition", summary: "Updates an existing form definition." },
  ]);
  assert.match(data.note, /describe_tool/);
  assert.match(data.note, /search_tools/);
});

test("tools section: read from the injected registry reader on every call — nothing is captured into a second index", async () => {
  const rows = toolRows();
  const deps = makeDeps({ tools: rows });

  const first = await buildSiteCapabilities(deps, { principalId: PRINCIPAL_ID }, { sections: ["tools"] });
  assert.equal(first.sections.tools?.data?.total, 4);

  // A tool registered after the deps were built (a federated MCP reload, an Agent Plugin install)
  // must show up on the very next call.
  rows.push({ id: "media_list_assets", source: "media", description: "Lists media assets." });
  const second = await buildSiteCapabilities(deps, { principalId: PRINCIPAL_ID }, { sections: ["tools"] });
  assert.equal(second.sections.tools?.data?.total, 5);
  assert.ok(second.sections.tools?.data?.domains.some((domain) => domain.domain === "media"));
});

test("tools section: no injected registry reader is 'unavailable'/'not-wired' — never an empty catalog", async () => {
  const result = await buildSiteCapabilities(makeDeps({ withoutToolReader: true }), { principalId: PRINCIPAL_ID });

  assert.deepEqual(result.sections.tools, { status: "unavailable", reason: "not-wired" });
  assert.equal(result.sections.adminScreens?.status, "ok");
  assert.equal(result.completeness, "partial");
});

test("admin screens section: id, label and route path exactly as the injected list gives them", async () => {
  const result = await buildSiteCapabilities(makeDeps(), { principalId: PRINCIPAL_ID });
  const data = result.sections.adminScreens?.data;
  assert.ok(data);

  assert.equal(data.total, 2);
  assert.deepEqual(data.screens, ADMIN_SCREENS);
  assert.match(data.note, /\/admin/);
});

test("content types section: key and label only, tombstoned types excluded", async () => {
  const result = await buildSiteCapabilities(makeDeps(), { principalId: PRINCIPAL_ID });

  assert.deepEqual(result.sections.contentTypes?.data, {
    total: 2,
    contentTypes: [
      { key: "recipe", label: "Recipe" },
      { key: "event", label: "Event" },
    ],
  });
});

test("a denied section is 'forbidden', performs no read, and leaves the other sections intact", async () => {
  const logs: Logs = { permissions: [], reads: [] };
  const result = await buildSiteCapabilities(
    makeDeps({ logs, allow: (permission) => permission !== "admin.collections.read" }),
    { principalId: PRINCIPAL_ID },
  );

  assert.deepEqual(result.sections.contentTypes, { status: "forbidden", reason: "no-grant" });
  assert.ok(!logs.reads.includes("contentTypes"), "a forbidden section must not read");
  assert.equal(result.sections.tools?.status, "ok");
  assert.equal(result.sections.adminScreens?.status, "ok");
  assert.equal(result.completeness, "partial");
});

test("a failing read is 'unavailable' with the error CLASS name only, and the other sections still return", async () => {
  const result = await buildSiteCapabilities(
    makeDeps({ contentTypesError: new TypeError("row data CANARY_CT_ERROR_77aa") }),
    { principalId: PRINCIPAL_ID },
  );

  assert.deepEqual(result.sections.contentTypes, { status: "unavailable", reason: "TypeError" });
  assert.ok(!JSON.stringify(result).includes("CANARY_CT_ERROR_77aa"), "an error message must never reach the output");
  assert.equal(result.sections.tools?.status, "ok");
});

test("sections limits the call to the requested ones, in vocabulary order, reading nothing else", async () => {
  const logs: Logs = { permissions: [], reads: [] };
  const result = await buildSiteCapabilities(
    makeDeps({ logs }),
    { principalId: PRINCIPAL_ID },
    { sections: ["contentTypes", "tools"] },
  );

  assert.deepEqual(Object.keys(result.sections), ["tools", "contentTypes"]);
  assert.deepEqual([...logs.reads].sort(), ["contentTypes", "tools"]);
  assert.equal(result.completeness, "complete");
});

test("summarizeToolDescription: first sentence, whitespace collapsed, capped at MAX_TOOL_SUMMARY_CHARS", () => {
  assert.equal(summarizeToolDescription("Creates a thing. Then explains more."), "Creates a thing.");
  assert.equal(summarizeToolDescription("  Lists\n   every   row.  "), "Lists every row.");
  assert.equal(summarizeToolDescription("No terminal punctuation here"), "No terminal punctuation here");
  assert.equal(summarizeToolDescription(""), "");

  const summary = summarizeToolDescription(`${"word ".repeat(80).trim()}.`);
  assert.ok(summary.length <= MAX_TOOL_SUMMARY_CHARS, `summary is ${summary.length} chars`);
  assert.ok(summary.endsWith("…"));
});

test("summarizeToolDescription: an over-long sentence is cut at the last whole word, not mid-word", () => {
  // The 120-char cap lands inside "beta" ("alpha bet|a"): a mid-word cut would end "alpha bet…".
  assert.equal(summarizeToolDescription(`${"alpha beta ".repeat(20)}.`), `${"alpha beta ".repeat(10)}alpha…`);
});

test("summarizeToolDescription: 'e.g.' and a decimal point do not end the first sentence", () => {
  assert.equal(
    summarizeToolDescription("Creates one, e.g. custom_credential_create. Next."),
    "Creates one, e.g. custom_credential_create.",
  );
  assert.equal(summarizeToolDescription("Scales rows by 1.5 at once. Next."), "Scales rows by 1.5 at once.");
});

test("tools section: a long description is still one capped line in the output", async () => {
  const rows = [{ id: "site_get_profile", source: "site", description: `${"Returns a very long description ".repeat(20)}.` }];
  const result = await buildSiteCapabilities(makeDeps({ tools: rows }), { principalId: PRINCIPAL_ID }, { sections: ["tools"] });

  const summary = result.sections.tools?.data?.domains[0]?.tools[0]?.summary ?? "";
  assert.ok(summary.length > 0 && summary.length <= MAX_TOOL_SUMMARY_CHARS, `summary is ${summary.length} chars`);
});
