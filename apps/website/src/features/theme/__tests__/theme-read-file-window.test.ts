/** @file t02: ranged reads preserve file text, merge search windows and retain read safety. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ToolInputError, type ToolExecutionContext } from "@jini-ai/core";
import { discoverAllBuiltInThemes } from "../index.js";
import { buildThemesRegistrations } from "../tool-registrations.js";

function fixture(t: test.TestContext, content: string | Buffer, allow = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-theme-window-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, "plain");
  fs.mkdirSync(path.join(dir, "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "theme.json"),
    JSON.stringify({ id: "plain", name: "Plain", version: "1.0.0", tier: "declarative", engine: 1 }),
  );
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}");
  fs.writeFileSync(path.join(dir, "styles.css"), "body{}");
  for (const name of ["home", "entry"])
    fs.writeFileSync(path.join(dir, "templates", `${name}.json`), '{"type":"doc","content":[]}');
  fs.writeFileSync(path.join(dir, "sample.txt"), content);
  const registration = buildThemesRegistrations({
    workspaceId: "ws",
    themesDir: root,
    themes: discoverAllBuiltInThemes({ dir: root, source: "built-in" }),
    authorize: async () => ({ allowed: allow, reason: allow ? "matched" : "insufficient_permission" }),
  }).find((r) => r.descriptor.id === "theme_read_file");
  assert.ok(registration);
  return {
    registration,
    read: (params: Record<string, unknown> = {}) => {
      const ctx: ToolExecutionContext = {
        executionId: "exec",
        principal: { id: "owner" },
        run: { id: "run" },
        input: { themeId: "plain", path: "sample.txt", ...params },
        signal: new AbortController().signal,
      };
      return registration.handler(ctx);
    },
  };
}

test("t02: no params retains the pinned complete response and bytes", async (t) => {
  const content = "é first\r\nsecond\r\nlast";
  const result = await fixture(t, content).read();
  const expected = { themeId: "plain", path: "sample.txt", content };
  assert.deepEqual(result, expected);
  assert.equal(JSON.stringify(result), JSON.stringify(expected));
});

test("t02: line window is one-based, preserves CRLF and reports UTF-8 bytes", async (t) => {
  const content = "é first\r\nsecond\r\nthird\r\nlast";
  assert.deepEqual(await fixture(t, content).read({ startLine: 2, lineCount: 2 }), {
    themeId: "plain",
    path: "sample.txt",
    content: "second\r\nthird\r\n",
    totalLines: 4,
    totalBytes: 29,
    returned: { startLine: 2, endLine: 3 },
  });
});

test("t02: lineCount alone starts at one and a window clamps at EOF", async (t) => {
  const { read } = fixture(t, "one\ntwo\nthree\n");
  assert.deepEqual(await read({ lineCount: 1 }), {
    themeId: "plain",
    path: "sample.txt",
    content: "one\n",
    totalLines: 3,
    totalBytes: 14,
    returned: { startLine: 1, endLine: 1 },
  });
  assert.deepEqual(await read({ startLine: 3, lineCount: 20 }), {
    themeId: "plain",
    path: "sample.txt",
    content: "three\n",
    totalLines: 3,
    totalBytes: 14,
    returned: { startLine: 3, endLine: 3 },
  });
});

test("t02: startLine alone uses a bounded 2000-line default", async (t) => {
  const content = "x\n".repeat(2005);
  assert.deepEqual(await fixture(t, content).read({ startLine: 2 }), {
    themeId: "plain",
    path: "sample.txt",
    content: "x\n".repeat(2000),
    totalLines: 2005,
    totalBytes: 4010,
    returned: { startLine: 2, endLine: 2001 },
  });
});

test("t02: find uses a literal case-sensitive substring and merges overlapping context windows", async (t) => {
  const content = "zero\npre\n[a.b]\nbetween\n[a.b] again\npost\nskip\nA.B\n";
  assert.deepEqual(await fixture(t, content).read({ find: "[a.b]", context: 1 }), {
    themeId: "plain",
    path: "sample.txt",
    content: "pre\n[a.b]\nbetween\n[a.b] again\npost\n",
    totalLines: 8,
    totalBytes: 49,
    returned: { matches: 2, truncated: false },
  });
});

test("t02: find defaults to three context lines and returns disjoint windows in file order", async (t) => {
  const content = "pre\nneedle\n2\n3\n4\n5\n6\n7\n8\n9\n10\nneedle";
  assert.deepEqual(await fixture(t, content).read({ find: "needle" }), {
    themeId: "plain",
    path: "sample.txt",
    content: "pre\nneedle\n2\n3\n4\n8\n9\n10\nneedle",
    totalLines: 12,
    totalBytes: 36,
    returned: { matches: 2, truncated: false },
  });
});

test("t02: find counts matching lines once and context zero includes only those lines", async (t) => {
  assert.deepEqual(await fixture(t, "needle needle\nother\nneedle").read({ find: "needle", context: 0 }), {
    themeId: "plain",
    path: "sample.txt",
    content: "needle needle\nneedle",
    totalLines: 3,
    totalBytes: 26,
    returned: { matches: 2, truncated: false },
  });
});

test("t02: find caps at 50 matching lines and distinguishes exactly 50 from overflow", async (t) => {
  for (const count of [50, 51]) {
    const content = "hit\n".repeat(count);
    assert.deepEqual(await fixture(t, content).read({ find: "hit", context: 0 }), {
      themeId: "plain",
      path: "sample.txt",
      content: "hit\n".repeat(50),
      totalLines: count,
      totalBytes: count * 4,
      returned: { matches: 50, truncated: count > 50 },
    });
  }
});

test("t02: find without a match returns empty content and zero matches", async (t) => {
  assert.deepEqual(await fixture(t, "Needle\nother").read({ find: "needle" }), {
    themeId: "plain",
    path: "sample.txt",
    content: "",
    totalLines: 2,
    totalBytes: 12,
    returned: { matches: 0, truncated: false },
  });
});

test("t02: empty files and windows beyond EOF return no text with full-file totals", async (t) => {
  const { read } = fixture(t, "");
  assert.deepEqual(await read({ startLine: 1, lineCount: 1 }), {
    themeId: "plain",
    path: "sample.txt",
    content: "",
    totalLines: 0,
    totalBytes: 0,
    returned: { startLine: 1, endLine: 0 },
  });
  assert.deepEqual(await read({ find: "anything" }), {
    themeId: "plain",
    path: "sample.txt",
    content: "",
    totalLines: 0,
    totalBytes: 0,
    returned: { matches: 0, truncated: false },
  });
  assert.deepEqual(await fixture(t, "one\ntwo").read({ startLine: 9 }), {
    themeId: "plain",
    path: "sample.txt",
    content: "",
    totalLines: 2,
    totalBytes: 7,
    returned: { startLine: 9, endLine: 2 },
  });
});

test("t02: totalBytes counts on-disk bytes even when UTF-8 decoding replaces an invalid byte", async (t) => {
  assert.deepEqual(await fixture(t, Buffer.from([0xff, 0x0a, 0x78])).read({ startLine: 1 }), {
    themeId: "plain",
    path: "sample.txt",
    content: "\ufffd\nx",
    totalLines: 2,
    totalBytes: 3,
    returned: { startLine: 1, endLine: 2 },
  });
});

test("t02: find and context accept their upper bounds and empty find is a plain substring", async (t) => {
  const { read } = fixture(t, "x".repeat(200));
  assert.deepEqual(await read({ find: "x".repeat(200), context: 20 }), {
    themeId: "plain",
    path: "sample.txt",
    content: "x".repeat(200),
    totalLines: 1,
    totalBytes: 200,
    returned: { matches: 1, truncated: false },
  });
  assert.deepEqual(await read({ find: "", context: 0 }), {
    themeId: "plain",
    path: "sample.txt",
    content: "x".repeat(200),
    totalLines: 1,
    totalBytes: 200,
    returned: { matches: 1, truncated: false },
  });
});

test("t02: find and either window param refuse with the exact conflict text", async (t) => {
  const { read } = fixture(t, "one");
  for (const window of [{ startLine: 1 }, { lineCount: 1 }]) {
    await assert.rejects(
      read({ find: "one", ...window }),
      (error: unknown) =>
        error instanceof ToolInputError &&
        error.message === "theme_read_file: pass either find or startLine/lineCount, not both.",
    );
  }
});

test("t02: numeric bounds and find length/types are validated with ToolInputError", async (t) => {
  const { read } = fixture(t, "one");
  for (const [input, message] of [
    [{ startLine: 0 }, "theme_read_file: startLine must be an integer >= 1."],
    [{ startLine: 1.5 }, "theme_read_file: startLine must be an integer >= 1."],
    [{ startLine: "1" }, "theme_read_file: startLine must be an integer >= 1."],
    [{ startLine: Infinity }, "theme_read_file: startLine must be an integer >= 1."],
    [{ lineCount: 0 }, "theme_read_file: lineCount must be an integer from 1 to 2000."],
    [{ lineCount: 2001 }, "theme_read_file: lineCount must be an integer from 1 to 2000."],
    [{ lineCount: 1.5 }, "theme_read_file: lineCount must be an integer from 1 to 2000."],
    [{ lineCount: null }, "theme_read_file: lineCount must be an integer from 1 to 2000."],
    [{ context: -1 }, "theme_read_file: context must be an integer from 0 to 20."],
    [{ context: 21 }, "theme_read_file: context must be an integer from 0 to 20."],
    [{ context: 1.5 }, "theme_read_file: context must be an integer from 0 to 20."],
    [{ find: "x".repeat(201) }, "theme_read_file: find must be a string of at most 200 characters."],
    [{ find: 3 }, "theme_read_file: find must be a string of at most 200 characters."],
  ] as const)
    await assert.rejects(
      read(input),
      (error: unknown) => error instanceof ToolInputError && error.message === message,
    );
});

test("t02: ranged reads still enforce permission, containment and the 1 MB file limit", async (t) => {
  await assert.rejects(fixture(t, "one", false).read({ startLine: 1 }), {
    message: "principal 'owner' is not authorized for 'theme.set' (insufficient_permission)",
  });
  await assert.rejects(
    fixture(t, "one").read({ path: "../outside.txt", find: "one" }),
    /escapes|outside|relative/,
  );
  await assert.rejects(
    fixture(t, "x".repeat(1_000_001)).read({ lineCount: 1 }),
    /exceeds the 1000000-byte readable limit/,
  );
});

test("t02: published schema exposes optional bounded selectors and keeps reads readOnly", (t) => {
  const { registration } = fixture(t, "one");
  const schema = registration.descriptor.inputSchema as {
    properties: Record<string, Record<string, unknown>>;
    required: string[];
  };
  assert.deepEqual(schema.properties.startLine, {
    type: "integer",
    minimum: 1,
    description: "First line to return (1-based). Defaults to 1 when lineCount is given.",
  });
  assert.equal(schema.properties.lineCount?.maximum, 2000);
  assert.equal(schema.properties.find?.maxLength, 200);
  assert.equal(schema.properties.context?.maximum, 20);
  assert.equal(schema.properties.context?.default, 3);
  assert.deepEqual(schema.required, ["themeId", "path"]);
  assert.equal(registration.descriptor.readOnly, true);
});
