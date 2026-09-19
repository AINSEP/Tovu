/**
 * @file Zero-setup publishing auth — the Fly adapter, which is a CODEC and not a branch.
 *
 * Fly carries the grant in `fly.toml`'s committed `[env]` table. That is the entire difference
 * between Fly and everything else in this feature: same port, same merge semantics, same document,
 * different quoting. Nothing here imports a Fly SDK or shells out to `flyctl` — provisioning edits
 * a file the operator commits, and the existing CI deploy (`.github/workflows/fly-deploy.yml`, which
 * already holds the only Fly token anywhere in this system) does the deploying. That is what keeps
 * the no-vendor-CLI-on-the-dev-machine rule true rather than merely intended.
 *
 * Why `[env]` and not `fly secrets set`: the grant is public-key material and policy bounds, with no
 * secret in it. Putting it in `[env]` means it is versioned, reviewable in a diff, and restored by a
 * redeploy — where a secret store would make it invisible, hand-managed, and lost on a fresh app.
 * `fly.toml`'s own comment reserves that block for non-secrets, which this satisfies exactly.
 *
 * The edit is SURGICAL, never a regeneration. `features/deployments/deploy-config.ts` renders whole
 * config files from a descriptor; using that here would overwrite an operator's hand-tuned
 * `fly.toml` as a side effect of connecting a laptop. This codec changes one assignment and leaves
 * every byte around it alone.
 */

import type { ProvisioningCodec } from "./provisioning.js";
import { PUBLISH_TRUST_ENV_VAR } from "./provisioning.js";

/** A TOML table header, e.g. `[env]` or `[[mounts]]`, which ends the preceding table's span. */
const TABLE_HEADER = /^\s*\[/;

const ENV_TABLE_HEADER = /^\s*\[env\]\s*$/;

const ASSIGNMENT = new RegExp(`^\\s*${PUBLISH_TRUST_ENV_VAR}\\s*=`);

/** Any `key = value` line, used to place a new assignment beside its siblings. */
const ANY_ASSIGNMENT = /^\s*[A-Za-z_][A-Za-z0-9_-]*\s*=/;

/** TOML basic strings may not carry raw control characters. `JSON.stringify` never emits one, so
 *  seeing one means the document did not come from this feature — refuse rather than emit a file
 *  that no TOML parser will accept. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

/**
 * Escapes a value for a TOML basic string.
 *
 * @complexity O(n) in the value length.
 */
function escapeBasicString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Reverses {@link escapeBasicString}.
 *
 * A single left-to-right scan, because an escape sequence is decided by the character that follows
 * a backslash and nothing else. Two chained `replace` passes happen to agree with this one for
 * everything {@link escapeBasicString} emits — that was checked, not assumed — but only because of
 * how backslash runs pair up, which is an argument that has to be re-derived every time someone
 * reads it. The scan needs no such argument.
 *
 * @complexity O(n) in the value length.
 */
function unescapeBasicString(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === "\\" && i + 1 < value.length) {
      i += 1;
      out += value[i];
      continue;
    }
    out += char;
  }
  return out;
}

/**
 * Locates the `[env]` table's body.
 *
 * @returns `[start, end)` line indices of the table's contents, or `null` when the file has no
 *   `[env]` table. `start` is the line after the header.
 * @complexity O(n) in the line count.
 */
function envTableSpan(lines: readonly string[]): { readonly start: number; readonly end: number } | null {
  const header = lines.findIndex((line) => ENV_TABLE_HEADER.test(line));
  if (header < 0) return null;
  let end = header + 1;
  while (end < lines.length && !TABLE_HEADER.test(lines[end])) end += 1;
  return { start: header + 1, end };
}

/**
 * Reads the grant document out of `fly.toml`.
 *
 * Only an assignment INSIDE `[env]` counts. A same-named key in another table belongs to that
 * table, and treating it as ours would read a value the deployed process never sees.
 *
 * @complexity O(n) in the file's line count.
 */
function decode(fileContents: string | null): string | null {
  if (fileContents === null) return null;
  const lines = fileContents.split("\n");
  const span = envTableSpan(lines);
  if (span === null) return null;

  for (let i = span.start; i < span.end; i += 1) {
    if (!ASSIGNMENT.test(lines[i])) continue;
    const quoted = lines[i].match(/=\s*"((?:[^"\\]|\\.)*)"/);
    return quoted === null ? null : unescapeBasicString(quoted[1]);
  }
  return null;
}

/**
 * Writes the grant document into `fly.toml`, replacing the existing assignment or appending one.
 *
 * A file with no `[env]` table gets one — a `fly.toml` without that block is valid, and refusing
 * would strand an operator over a section they can be handed instead.
 *
 * @complexity O(n) in the file's line count.
 */
function encode(input: { readonly fileContents: string | null; readonly document: string }) {
  if (CONTROL_CHARACTER.test(input.document)) {
    return { ok: false as const, reason: "grant document holds a control character and cannot be written to TOML" };
  }
  const assignment = `  ${PUBLISH_TRUST_ENV_VAR} = "${escapeBasicString(input.document)}"`;
  const lines = (input.fileContents ?? "").split("\n");
  const span = envTableSpan(lines);
  if (span === null) {
    const base = input.fileContents === null ? [] : [...lines];
    return { ok: true as const, contents: [...base, "[env]", assignment, ""].join("\n") };
  }

  for (let i = span.start; i < span.end; i += 1) {
    if (!ASSIGNMENT.test(lines[i])) continue;
    const next = [...lines];
    next[i] = assignment;
    return { ok: true as const, contents: next.join("\n") };
  }
  const next = [...lines];
  next.splice(insertionPoint(lines, span), 0, assignment);
  return { ok: true as const, contents: next.join("\n") };
}

/**
 * Where a NEW assignment goes inside `[env]`: straight after the last existing one.
 *
 * Not at the end of the table's span, which is what a first version did — and what the real
 * `fly.toml` exposed. Comments trailing a table belong to it syntactically, so a key appended at
 * the span's end lands underneath the `[[mounts]]` explanation and reads as part of it. TOML does
 * not care; the next person to edit that comment block does.
 *
 * @returns The line index to splice at. An `[env]` table holding only comments gets the assignment
 *   directly under its header.
 * @complexity O(n) in the table's line count.
 */
function insertionPoint(lines: readonly string[], span: { readonly start: number; readonly end: number }): number {
  for (let i = span.end - 1; i >= span.start; i -= 1) {
    if (ANY_ASSIGNMENT.test(lines[i])) return i + 1;
  }
  return span.start;
}

/** Fly: the grant lives in `fly.toml`'s committed `[env]` table, on one line. */
export const FLY_TOML_CODEC: ProvisioningCodec = {
  kind: "fly-toml",
  defaultPath: "fly.toml",
  pretty: false,
  nextStep:
    "Commit fly.toml and push — the deploy workflow carries the connection to the site. It holds public keys only; there is nothing secret in it.",
  decode,
  encode,
};
