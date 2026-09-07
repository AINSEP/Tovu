import { describe, expect, it } from "vitest";

import type { AdminFederatedAdmissionEntry } from "@/lib/api";

import {
  describeAdmissionDrift,
  describeConnectionDrift,
  grantWriteFieldValue,
  parseSavedToolNames,
} from "../external-mcp-admissions-rules";

/**
 * @file The operator half of the refusal channel, as pure decisions.
 *
 * The incident these encode: an operator allowlisted Higgsfield's `generate_image`, the admission
 * gate refused it because the tool declares `readOnlyHint: false` and the operator had not ALSO
 * named it in the second `writeAllowedToolNames` list, and the refusal reached only the daemon's
 * stderr. Two sessions lost hours to it. Every case below asks "would the operator now know?"
 */

function entry(overrides: Partial<AdminFederatedAdmissionEntry> = {}): AdminFederatedAdmissionEntry {
  return {
    connectionId: "higgsfield",
    admitted: [],
    refused: [],
    allowlistedButAbsent: [],
    writeAllowedButNotAllowlisted: [],
    ...overrides,
  };
}

describe("describeConnectionDrift", () => {
  it("names the refused write tool AND the field that fixes it", () => {
    const drift = describeConnectionDrift(
      entry({
        admitted: [{ remoteName: "list_styles", writeAuthorized: false }],
        refused: [{ remoteName: "generate_image", reason: "remote-declares-not-read-only" }],
      }),
      "list_styles, generate_image",
    );

    expect(drift).not.toBeNull();
    expect(drift?.entries).toHaveLength(1);
    expect(drift?.entries[0]?.remoteName).toBe("generate_image");
    expect(drift?.entries[0]?.kind).toBe("needs-write-grant");
    // The exact translated key from `external-mcp-i18n.ts`, not a paraphrase — a different string
    // is a different i18n key, and a different key renders English in all 21 locales.
    expect(drift?.entries[0]?.messageKey).toBe("Tick 'may write' to enable this tool.");
  });

  it("states saved-vs-live, so 'I ticked it and nothing happened' has a visible answer", () => {
    const drift = describeConnectionDrift(
      entry({ admitted: [{ remoteName: "list_styles", writeAuthorized: false }] }),
      "list_styles, generate_image, edit_image",
    );

    expect(drift?.liveToolCount).toBe(1);
    expect(drift?.savedToolCount).toBe(3);
    expect(drift?.notLoaded).toEqual(["generate_image", "edit_image"]);
  });

  it("returns null when the running assistant and the saved roster agree — the banner must not exist in the normal case", () => {
    const drift = describeConnectionDrift(
      entry({ admitted: [{ remoteName: "list_styles", writeAuthorized: false }] }),
      "list_styles",
    );

    expect(drift).toBeNull();
  });

  it("never reports not-in-operator-allowlist — the routine default-deny that would bury everything else", () => {
    const drift = describeConnectionDrift(
      entry({
        admitted: [{ remoteName: "list_styles", writeAuthorized: false }],
        refused: [
          { remoteName: "execute_sql", reason: "not-in-operator-allowlist" },
          { remoteName: "apply_migration", reason: "not-in-operator-allowlist" },
          { remoteName: "delete_branch", reason: "not-in-operator-allowlist" },
        ],
      }),
      "list_styles",
    );

    expect(drift).toBeNull();
  });

  it("reports a destructive refusal as having no fix rather than offering a tick that would do nothing", () => {
    const drift = describeConnectionDrift(
      entry({ refused: [{ remoteName: "wipe_account", reason: "remote-declares-destructive" }] }),
      "wipe_account",
    );

    expect(drift?.entries[0]?.kind).toBe("destructive");
    expect(drift?.entries[0]?.kind).not.toBe("needs-write-grant");
  });

  it("reports an allowlisted name the server never advertised, and an inert write grant, as distinct rows", () => {
    const drift = describeConnectionDrift(
      entry({ allowlistedButAbsent: ["generate_vidoe"], writeAllowedButNotAllowlisted: ["edit_image"] }),
      "generate_vidoe",
    );

    expect(drift?.entries.map((row) => [row.kind, row.remoteName])).toEqual([
      ["not-offered", "generate_vidoe"],
      ["inert-write-grant", "edit_image"],
    ]);
    // The parameterized key carries its own token value, or `interpolate` would render `{name}`.
    expect(drift?.entries[1]?.messageVars).toEqual({ name: "edit_image" });
  });

  it("still reports a refusal reason this build does not recognise — an unknown reason must never vanish", () => {
    const drift = describeConnectionDrift(
      // Deliberately outside the union: a daemon one version ahead can send a reason this admin
      // build has no copy for, and silently dropping it is the exact defect this module closes.
      entry({ refused: [{ remoteName: "surprise", reason: "some-future-reason" as never }] }),
      "surprise",
    );

    expect(drift?.entries).toHaveLength(1);
    expect(drift?.entries[0]?.remoteName).toBe("surprise");
    expect(drift?.entries[0]?.messageKey.length).toBeGreaterThan(10);
  });
});

describe("describeAdmissionDrift", () => {
  it("returns nothing at all when the daemon could not be asked (undefined snapshot)", () => {
    expect(describeAdmissionDrift(undefined, {})).toEqual([]);
  });

  it("keeps only the connections with something to say", () => {
    const drifted = describeAdmissionDrift(
      {
        connections: [
          entry({ connectionId: "clean", admitted: [{ remoteName: "a", writeAuthorized: false }] }),
          entry({ connectionId: "higgsfield", refused: [{ remoteName: "generate_image", reason: "remote-declares-not-read-only" }] }),
        ],
      },
      { clean: { allowedToolNames: "a", enabled: true }, higgsfield: { allowedToolNames: "generate_image", enabled: true } },
    );

    expect(drifted.map((connection) => connection.connectionId)).toEqual(["higgsfield"]);
  });

  it("treats a connection with no matching roster card as having saved nothing rather than throwing", () => {
    const drifted = describeAdmissionDrift(
      { connections: [entry({ connectionId: "env-preset", refused: [{ remoteName: "x", reason: "remote-declares-destructive" }] })] },
      {},
    );

    expect(drifted).toHaveLength(1);
    expect(drifted[0]?.savedToolCount).toBe(0);
  });
});

describe("grantWriteFieldValue — the one-click fix", () => {
  it("adds the name to an empty write list", () => {
    expect(grantWriteFieldValue("", "generate_image")).toBe("generate_image");
    expect(grantWriteFieldValue(undefined, "generate_image")).toBe("generate_image");
  });

  it("appends without disturbing grants already there", () => {
    expect(grantWriteFieldValue("edit_image, upscale", "generate_image")).toBe("edit_image, upscale, generate_image");
  });

  it("is idempotent, so a double click cannot write a duplicate the store would have to dedupe", () => {
    expect(grantWriteFieldValue("edit_image, generate_image", "generate_image")).toBe("edit_image, generate_image");
  });
});

describe("parseSavedToolNames", () => {
  it("drops blanks and whitespace so an empty field is zero names, not one", () => {
    expect(parseSavedToolNames("")).toEqual([]);
    expect(parseSavedToolNames("  ")).toEqual([]);
    expect(parseSavedToolNames("a ,, b ,")).toEqual(["a", "b"]);
  });
});

/**
 * ADM-001 (2026-09-07) — the comparison was one-directional.
 *
 * The file's own header promises "every place the operator's own intent and the gate's decision
 * disagree". It computed `saved − live` only, so two real disagreements produced no row at all:
 * a tool REMOVED from the allowlist that the running daemon is still serving, and a whole
 * connection the operator saved (or switched off) that the boot-frozen daemon knows nothing about.
 * In both cases the operator's next move is the same — restart — and the banner said nothing.
 *
 * The negative cases in this block are the load-bearing half. `bootstrap.ts` merges ROSTER
 * connections with env-registered PRESET connections (`resolveRegisteredPresets`, e.g. the Supabase
 * MCP plugin) into one report list, and a preset has no roster card by design. A `live − saved`
 * rule that treated "no saved entry" as "the operator allowlisted nothing" would report every
 * preset tool as removed-but-still-running, on every boot, forever.
 */
describe("ADM-001 — the reverse direction", () => {
  it("reports a tool the daemon is still serving after the operator removed it from the allowlist", () => {
    const drift = describeConnectionDrift(
      entry({
        admitted: [
          { remoteName: "list_styles", writeAuthorized: false },
          { remoteName: "generate_image", writeAuthorized: true },
        ],
      }),
      "list_styles",
    );

    expect(drift?.entries.map((row) => [row.kind, row.remoteName])).toEqual([
      ["still-live-after-removal", "generate_image"],
    ]);
  });

  it("says nothing about a connection with no roster card — an env preset is not an empty allowlist", () => {
    const drift = describeConnectionDrift(
      entry({ connectionId: "supabase-preset", admitted: [{ remoteName: "list_tables", writeAuthorized: false }] }),
      undefined,
    );

    expect(drift).toBeNull();
  });

  it("DOES report every live tool when the card exists and its allowlist was cleared to empty", () => {
    // The distinction the case above rests on: `undefined` is "no operator intent recorded here",
    // `""` is "the operator recorded an intent, and it was none".
    const drift = describeConnectionDrift(
      entry({ admitted: [{ remoteName: "list_styles", writeAuthorized: false }] }),
      "",
    );

    expect(drift?.entries.map((row) => [row.kind, row.remoteName])).toEqual([
      ["still-live-after-removal", "list_styles"],
    ]);
  });

  it("reports a saved, enabled connection the running daemon has never heard of", () => {
    const drifted = describeAdmissionDrift(
      { connections: [] },
      { higgsfield: { allowedToolNames: "generate_image, list_styles", enabled: true } },
    );

    expect(drifted).toHaveLength(1);
    expect(drifted[0]?.connectionId).toBe("higgsfield");
    expect(drifted[0]?.liveToolCount).toBe(0);
    expect(drifted[0]?.savedToolCount).toBe(2);
    expect(drifted[0]?.notLoaded).toEqual(["generate_image", "list_styles"]);
    expect(drifted[0]?.entries.map((row) => [row.kind, row.remoteName])).toEqual([["not-running", null]]);
  });

  it("says nothing about a saved connection the operator switched OFF and the daemon is not running", () => {
    // Intent and reality agree. A row here would be the banner crying wolf about the one thing the
    // operator most deliberately did.
    const drifted = describeAdmissionDrift({ connections: [] }, { higgsfield: { allowedToolNames: "generate_image", enabled: false } });

    expect(drifted).toEqual([]);
  });

  it("reports a connection the operator switched OFF that the daemon is STILL running", () => {
    const drifted = describeAdmissionDrift(
      { connections: [entry({ connectionId: "higgsfield", admitted: [{ remoteName: "generate_image", writeAuthorized: false }] })] },
      { higgsfield: { allowedToolNames: "generate_image", enabled: false } },
    );

    expect(drifted).toHaveLength(1);
    expect(drifted[0]?.entries.map((row) => row.kind)).toEqual(["disabled-but-running"]);
  });

  it("still returns nothing at all when the daemon could not be asked, however much is saved", () => {
    // `undefined` means "the daemon did not answer", which the hook renders as its own sentence.
    // Inventing "not running" rows from a failed read would put a wrong diagnosis under a right one.
    expect(describeAdmissionDrift(undefined, { higgsfield: { allowedToolNames: "generate_image", enabled: true } })).toEqual([]);
  });

  it("does not report a live, agreeing connection twice — the two passes must not both claim it", () => {
    const drifted = describeAdmissionDrift(
      { connections: [entry({ connectionId: "higgsfield", admitted: [{ remoteName: "generate_image", writeAuthorized: false }] })] },
      { higgsfield: { allowedToolNames: "generate_image", enabled: true } },
    );

    expect(drifted).toEqual([]);
  });
});
