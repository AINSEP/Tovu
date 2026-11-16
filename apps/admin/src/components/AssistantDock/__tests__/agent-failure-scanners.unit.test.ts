import { expect, it } from "vitest";
import {
  redactCredentialShapes, redactSecretAssignments, stripControlCharacters, stripCsiSequences, stripOscSequences,
} from "../agent-failure-scanners";

/** The scanners promise to behave exactly like the regexes in their docs; each case is checked against that oracle AND a literal expectation. */
const OSC_RE = /(?:\x1b\]|\x9d)[\s\S]*?(?:\x07|\x1b\\)/g;
const CSI_RE = /[\x1b\x9b][[\]()#;?]*(?:(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nq-uy=><~])/g;
const CONTROL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g;
const ASSIGN_RE = /((?:[\w-]*(?:api[ _-]?key|access[ _-]?token|refresh[ _-]?token|auth[ _-]?token|secret|password)|token)["']?\s*[:=]\s*["']?)([^\s"'&,;}]+)/gi;

it("strips OSC strings ended by BEL, by ESC-backslash, 8-bit intro, picks the nearer terminator, and keeps an unterminated one", () => {
  const cases: Array<[string, string]> = [
    ["a\u001b]0;title\u0007b", "ab"],
    ["a\u001b]8;;http://x\u001b\\link", "alink"],
    ["a\u009d0;t\u0007b", "ab"],
    ["\u001b]1;x\u001b\\y\u0007z", "y\u0007z"],
    ["\u001b]1;x\u0007y\u001b\\z", "y\u001b\\z"],
    ["keep \u001b]0;never ends", "keep \u001b]0;never ends"],
    ["lone \u001b not osc", "lone \u001b not osc"],
  ];
  for (const [input, expected] of cases) {
    expect(stripOscSequences({ text: input })).toBe(expected);
    expect(stripOscSequences({ text: input })).toBe(input.replace(OSC_RE, ""));
  }
});

it("strips CSI colour and cursor sequences, including 8-bit CSI, prefix chars and regex-backtracking edges", () => {
  const cases: Array<[string, string]> = [
    ["\u001b[31mred\u001b[0m", "red"],
    ["\u001b[1;32;4mx", "x"],
    ["\u009b2Jclear", "clear"],
    ["\u001b[?25hshown", "shown"],
    ["\u001bMgone", "gone"],
    ["\u001bXstay", "\u001bXstay"],
    ["\u001b[12345", ""],
    ["\u001b[1;;;", "\u001b[1;;;".replace(CSI_RE, "")],
    ["\u001b[1;2;", "\u001b[1;2;".replace(CSI_RE, "")],
    ["\u001b[;;;", "\u001b[;;;".replace(CSI_RE, "")],
    ["\u001b[1;23;45;;", "\u001b[1;23;45;;".replace(CSI_RE, "")],
    ["\u001bZ done", " done"],
    ["\u001b", "\u001b"],
    ["\u001b[", "\u001b["],
    ["\u001b[X", "\u001b[X"],
    ["\u001b[Rq", "q"],
  ];
  for (const [input, expected] of cases) {
    expect(stripCsiSequences({ text: input })).toBe(expected);
    expect(stripCsiSequences({ text: input })).toBe(input.replace(CSI_RE, ""));
  }
});

it("removes control characters but keeps tab, newline, carriage return and printable text", () => {
  const input = "a\u0000b\tc\nd\re\u0007f\u007fg\u0085h\u009fi j世";
  expect(stripControlCharacters({ text: input })).toBe("ab\tc\nd\refghi j世");
  expect(stripControlCharacters({ text: input })).toBe(input.replace(CONTROL_RE, ""));
});

it("redacts word-initial provider credential shapes and leaves look-alikes inside a word untouched", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln";
  expect(redactCredentialShapes({ text: "key AIzaSyA-1234567890abcdef ok" })).toBe("key [REDACTED] ok");
  expect(redactCredentialShapes({ text: `bearer ${jwt}` })).toBe("bearer [REDACTED]");
  expect(redactCredentialShapes({ text: "xAIzaSyA-1234567890abcdef" })).toBe("xAIzaSyA-1234567890abcdef");
  expect(redactCredentialShapes({ text: "nothing secret here" })).toBe("nothing secret here");
  expect(redactCredentialShapes({ text: "" })).toBe("");
});

it("redacts the assigned value but keeps the name, across separators, quotes and bare token names", () => {
  const cases: Array<[string, string]> = [
    ["apiKey=abc123 next", "apiKey=[REDACTED] next"],
    ['{"access_token": "abc.def", "x": 1}', '{"access_token": "[REDACTED]", "x": 1}'],
    ["password: hunter2;", "password: [REDACTED];"],
    ["token=abc", "token=[REDACTED]"],
    ["mytoken: abc", "mytoken: [REDACTED]"],
    ["client_secret=s3 refresh-token = r4", "client_secret=[REDACTED] refresh-token = [REDACTED]"],
    ["password=", "password="],
    ["secret only", "secret only"],
    ["no assignments", "no assignments"],
    ["", ""],
  ];
  for (const [input, expected] of cases) {
    expect(redactSecretAssignments({ text: input })).toBe(expected);
    expect(redactSecretAssignments({ text: input })).toBe(input.replace(ASSIGN_RE, "$1[REDACTED]"));
  }
});
