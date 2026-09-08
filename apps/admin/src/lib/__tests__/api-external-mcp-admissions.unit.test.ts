import { afterEach, expect, test, vi } from "vitest";

import { api } from "../api";

/**
 * @file Regression coverage for `api.getExternalMcpAdmissions()` (ADM-003) — the crash reported live
 * against `<ExternalMcpSettingsPanel>`:
 *
 * ```
 * TypeError: Cannot read properties of undefined (reading 'length')
 *     at connectionLevelEntry (external-mcp-admissions-rules.ts:305:36)
 * ```
 *
 * `GET .../mcp-servers/admissions` (C-008, `admin-http/routes/external-mcp/admissions.ts`)
 * deliberately treats the daemon's payload as `unknown` and relays it VERBATIM — proven by
 * `admin-external-mcp-admissions-routes.test.ts`'s "a live daemon's real report is relayed
 * verbatim" test, which is certified and stays exactly as it is. What the daemon actually sends
 * (`federation-admissions-route.ts`'s own `FederationAdmissionsRouteDeps.reports` shape) nests
 * every admission field one level deeper than the client expects: `{ connectionId, isPreset,
 * report: { admitted, refused, allowlistedButAbsent, writeAllowedButNotAllowlisted } }`, not the
 * flat `AdminFederatedAdmissionEntry` (`lib/api.ts`) every downstream reader — starting with
 * `external-mcp-admissions-rules.ts` — was written against.
 *
 * So `entry.admitted` (and every sibling field) was `undefined` for EVERY connection the daemon
 * ever reported, and `external-mcp-admissions-rules.ts`'s several unguarded reads of it
 * (`connectionLevelEntry`, `liveOnlyEntries`, `describeConnectionDrift`,
 * `removedButStillRunningEntry`, `refusalEntries`, `driftEntries`) is where that surfaced as a
 * crash. The fix sits at this ONE boundary instead: `api.getExternalMcpAdmissions()` is the place
 * "the response enters the client," so this is where the wire's nested shape gets turned into the
 * flat contract every consumer already assumes — no consumer downstream of this function needed to
 * change, and none of the existing `AdminFederatedAdmissionEntry`-based unit tests for
 * `external-mcp-admissions-rules.ts` needed to change either, because that file's contract was
 * always correct; only this adapter was silently violating it.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

/** The real wire body `admin-external-mcp-admissions-routes.test.ts` pins as "relayed verbatim" —
 *  one roster connection with an admitted tool, a refusal, and both drift lists populated, plus one
 *  preset connection with nothing admitted, so every field this function must unwrap is exercised
 *  at least once. */
const WIRE_BODY = {
  connections: [
    {
      connectionId: "higgsfield",
      isPreset: false,
      report: {
        admitted: [{ remoteName: "list_styles", writeAuthorized: false }],
        refused: [{ remoteName: "generate_image", reason: "remote-declares-not-read-only" }],
        allowlistedButAbsent: ["typo_name"],
        writeAllowedButNotAllowlisted: ["list_styles"],
      },
    },
    {
      connectionId: "supabase-preset",
      isPreset: true,
      report: { admitted: [], refused: [], allowlistedButAbsent: [], writeAllowedButNotAllowlisted: [] },
    },
  ],
};

test("getExternalMcpAdmissions flattens the daemon's report-nested wire shape into AdminFederatedAdmissionEntry", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => okJson(WIRE_BODY)));

  const result = await api.getExternalMcpAdmissions();

  expect(result.connections).toEqual([
    {
      connectionId: "higgsfield",
      isPreset: false,
      admitted: [{ remoteName: "list_styles", writeAuthorized: false }],
      refused: [{ remoteName: "generate_image", reason: "remote-declares-not-read-only" }],
      allowlistedButAbsent: ["typo_name"],
      writeAllowedButNotAllowlisted: ["list_styles"],
    },
    {
      connectionId: "supabase-preset",
      isPreset: true,
      admitted: [],
      refused: [],
      allowlistedButAbsent: [],
      writeAllowedButNotAllowlisted: [],
    },
  ]);
});

test("getExternalMcpAdmissions omits isPreset rather than inventing it, for an older daemon build that predates the field", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      okJson({
        connections: [
          {
            connectionId: "legacy",
            report: { admitted: [], refused: [], allowlistedButAbsent: [], writeAllowedButNotAllowlisted: [] },
          },
        ],
      }),
    ),
  );

  const result = await api.getExternalMcpAdmissions();

  expect(Object.prototype.hasOwnProperty.call(result.connections[0], "isPreset")).toBe(false);
});
