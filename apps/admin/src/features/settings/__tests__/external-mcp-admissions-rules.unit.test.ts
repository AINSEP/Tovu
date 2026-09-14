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
      {
        // `isPreset: true` — a genuine env preset, not the "operator deleted the card" case the
        // block below this `describe` exercises. Without it this fixture would now (correctly,
        // 2026-09-07) resolve as `removed-but-still-running` instead, which is a different property
        // than the one this test names.
        connections: [entry({ connectionId: "env-preset", isPreset: true, refused: [{ remoteName: "x", reason: "remote-declares-destructive" }] })],
      },
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

/**
 * A gap ADM-001 left open (2026-09-07): it fixed `live − saved`, but "no roster card" was still
 * read as one thing — an env preset, silent by design. That is right for a REAL preset and wrong
 * for a roster connection the operator just deleted: `external-mcp/delete.ts` only removes the DB
 * row, and `trust.ts` R5 freezes the admitted set at connect, so the daemon keeps the deleted
 * server's session open and its tools callable until the next restart — exactly the case the banner
 * exists to surface, and it said nothing.
 *
 * `AdminFederatedAdmissionEntry.isPreset` (threaded from `mcp-federation/bootstrap.ts`, which is the
 * one place that still has the preset list and the roster list separate) is what makes the two cases
 * distinguishable. The preset case (`isPreset: true`) MUST keep behaving exactly as ADM-001 left it —
 * that is the negative control below, and the line it protects is the SAME assertion as
 * `describeConnectionDrift`'s own "an env preset is not an empty allowlist" test above, now exercised
 * through the public `describeAdmissionDrift` entry point with the flag set.
 */
/**
 * The Integrations banner's generic "The assistant isn't running this server at all. Restart the
 * assistant to load it." was misleading for one specific saved-and-enabled connection: one whose
 * sealed env failed to decrypt (`external-mcp-store.ts`'s `openExternalMcpEnv`, most commonly
 * because the site token is not available). Restarting does not fix that — the decrypt fails again
 * on the very next boot — but the operator had no way to learn the real reason short of reading the
 * daemon's own stderr. `describeAdmissionDrift`'s `snapshot.configFailures` (2026-09-13) carries that
 * boot-time reason across the same two-hop relay `isPreset` already crosses, and this file gives it
 * a dedicated, plain-language message instead of the generic guess.
 */
describe("decrypt-failed — a saved connection that never reached admission", () => {
  it("reports the site-token message, not the generic 'not running' guess, when the boot-time failure names a decrypt problem", () => {
    const drifted = describeAdmissionDrift(
      { connections: [], configFailures: [{ connectionId: "higgsfield", reason: "stored credentials could not be decrypted: Unsupported state or unable to authenticate data" }] },
      { higgsfield: { allowedToolNames: "generate_image", enabled: true } },
    );

    expect(drifted).toHaveLength(1);
    expect(drifted[0]?.entries).toHaveLength(1);
    expect(drifted[0]?.entries[0]?.kind).toBe("decrypt-failed");
    expect(drifted[0]?.entries[0]?.messageKey).toBe(
      "This server's saved credentials can't be unlocked because the site token isn't available. Add or restore it on the Secrets page's Site Token tab, then restart the assistant.",
    );
    // The generic guess must not also be present — this is a REPLACEMENT, not an addition.
    expect(drifted[0]?.entries[0]?.messageKey).not.toBe("The assistant isn't running this server at all. Restart the assistant to load it.");
  });

  it("never lets the raw error text — the part that could theoretically vary — reach the rendered message", () => {
    const rawReason = "stored credentials could not be decrypted: bad auth tag for key v3-9f8e7d6c5b4a";
    const drifted = describeAdmissionDrift(
      { connections: [], configFailures: [{ connectionId: "higgsfield", reason: rawReason }] },
      { higgsfield: { allowedToolNames: "generate_image", enabled: true } },
    );

    const message = drifted[0]?.entries[0]?.messageKey ?? "";
    expect(message).not.toContain("bad auth tag");
    expect(message).not.toContain("v3-9f8e7d6c5b4a");
    expect(message).not.toContain(rawReason);
  });

  it("falls back to the generic not-running message for a config failure that is not a decrypt problem", () => {
    const drifted = describeAdmissionDrift(
      { connections: [], configFailures: [{ connectionId: "higgsfield", reason: "no command is configured to launch it" }] },
      { higgsfield: { allowedToolNames: "generate_image", enabled: true } },
    );

    expect(drifted[0]?.entries[0]?.kind).toBe("not-running");
    expect(drifted[0]?.entries[0]?.messageKey).toBe("The assistant isn't running this server at all. Restart the assistant to load it.");
  });

  it("ignores a config failure for a DIFFERENT connection id", () => {
    const drifted = describeAdmissionDrift(
      { connections: [], configFailures: [{ connectionId: "some-other-server", reason: "stored credentials could not be decrypted: x" }] },
      { higgsfield: { allowedToolNames: "generate_image", enabled: true } },
    );

    expect(drifted[0]?.entries[0]?.kind).toBe("not-running");
  });

  it("behaves exactly as before when configFailures is absent — an older daemon build, or nothing failed to resolve", () => {
    const drifted = describeAdmissionDrift({ connections: [] }, { higgsfield: { allowedToolNames: "generate_image", enabled: true } });

    expect(drifted[0]?.entries[0]?.kind).toBe("not-running");
  });
});

describe("a deleted roster connection is not a preset", () => {
  it("reports a live connection with no roster card AND isPreset:false as removed-but-still-running", () => {
    const drifted = describeAdmissionDrift(
      {
        connections: [
          entry({ connectionId: "old-server", isPreset: false, admitted: [{ remoteName: "list_tables", writeAuthorized: false }] }),
        ],
      },
      // Empty roster: the operator deleted "old-server"'s card entirely, so there is no entry for it
      // here at all — not even a disabled one.
      {},
    );

    expect(drifted).toHaveLength(1);
    expect(drifted[0]?.connectionId).toBe("old-server");
    expect(drifted[0]?.liveToolCount).toBe(1);
    expect(drifted[0]?.entries.map((row) => [row.kind, row.remoteName])).toEqual([["removed-but-still-running", null]]);
  });

  it("still says nothing for a REAL preset with no roster card and isPreset:true — ADM-001 must not regress", () => {
    const drifted = describeAdmissionDrift(
      {
        connections: [
          entry({ connectionId: "supabase-preset", isPreset: true, admitted: [{ remoteName: "list_tables", writeAuthorized: false }] }),
        ],
      },
      {},
    );

    expect(drifted).toEqual([]);
  });

  it("a whole-connection removal supersedes per-tool rows, the same way not-running/disabled-but-running already do", () => {
    // Two admitted tools plus a routine refusal — none of that should survive alongside the one
    // connection-level row once the whole card is gone, matching `describeLiveConnection`'s own
    // "a whole-connection disagreement supersedes the per-tool rows" rule for its other two kinds.
    const drifted = describeAdmissionDrift(
      {
        connections: [
          entry({
            connectionId: "old-server",
            isPreset: false,
            admitted: [
              { remoteName: "list_tables", writeAuthorized: false },
              { remoteName: "get_advisors", writeAuthorized: false },
            ],
            refused: [{ remoteName: "execute_sql", reason: "not-in-operator-allowlist" }],
          }),
        ],
      },
      {},
    );

    expect(drifted).toHaveLength(1);
    expect(drifted[0]?.entries).toHaveLength(1);
    expect(drifted[0]?.entries[0]?.kind).toBe("removed-but-still-running");
  });
});
