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
      { clean: "a", higgsfield: "generate_image" },
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
