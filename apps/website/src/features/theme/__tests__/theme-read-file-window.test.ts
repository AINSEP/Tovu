/** @file t02: ranged reads preserve file text, merge search windows and retain read safety. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ToolInputError, type ToolExecutionContext } from "@jini-ai/core";
import { discoverAllBuiltInThemes } from "../index.js";
import { buildThemesRegistrations } from "../tool-registrations.js";
import { applyBatchInputs, type BatchResult } from "../../../assistant/batch-tool-inputs.js";
import { getThemesAgentToolCatalog } from "../agent-tools.js";
import { executeRegisteredTool } from "../../../assistant/__tests__/fixtures/execute-registered-tool.js";

function fixture(t: test.TestContext, content: string | Buffer, allow = true, names: { themeId?: string; filePath?: string } = {}) {
  const themeId = names.themeId ?? "plain";
  const filePath = names.filePath ?? "sample.txt";
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-theme-window-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, themeId);
  fs.mkdirSync(path.join(dir, "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "theme.json"),
    JSON.stringify({ id: themeId, name: "Plain", version: "1.0.0", tier: "declarative", engine: 1 }),
  );
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}");
  fs.writeFileSync(path.join(dir, "styles.css"), "body{}");
  for (const name of ["home", "entry"])
    fs.writeFileSync(path.join(dir, "templates", `${name}.json`), '{"type":"doc","content":[]}');
  fs.mkdirSync(path.dirname(path.join(dir, filePath)), { recursive: true });
  fs.writeFileSync(path.join(dir, filePath), content);
  const registration = buildThemesRegistrations({
    resolveActiveThemeId: async () => "",
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
        input: { themeId, path: filePath, ...params },
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

test('s5: an 80 KB single-line CSS read is bounded and nextOffset recovers every byte', async t => {
  const content = 'a'.repeat(3999) + '😀' + 'body{color:red}'.repeat(6000);
  const { read } = fixture(t, content, true, { filePath: 'large.css' });
  let offset: number | undefined;
  let recovered = '';
  do {
    const result = await read(offset === undefined ? {} : { offset }) as {
      content: string; offset: number; nextOffset: number | null; totalBytes: number; truncated: boolean;
    };
    assert.ok(Buffer.byteLength(result.content) <= 4000);
    assert.equal(result.offset, offset ?? 0);
    assert.equal(result.totalBytes, Buffer.byteLength(content));
    assert.equal(result.truncated, result.nextOffset !== null);
    assert.ok(!result.content.includes('�'));
    recovered += result.content;
    if (result.nextOffset === null) break;
    assert.ok(result.nextOffset > result.offset);
    offset = result.nextOffset;
  } while (true);
  assert.equal(recovered, content);
});

test('s5: a line window containing a minified line is also paged without losing its range', async t => {
  const { read } = fixture(t, 'header\n' + 'x'.repeat(80000) + '\nfooter');
  const first = await read({ startLine: 2, lineCount: 1 }) as { content: string; nextOffset: number; returned: unknown };
  assert.equal(first.content, 'x'.repeat(4000));
  assert.equal(first.nextOffset, 4000);
  assert.deepEqual(first.returned, { startLine: 2, endLine: 2 });
  const next = await read({ startLine: 2, lineCount: 1, offset: first.nextOffset }) as { content: string; offset: number };
  assert.equal(next.content, 'x'.repeat(4000));
  assert.equal(next.offset, 4000);
});

test('s5: byte cursors reject invalid positions before returning content', async t => {
  const { read } = fixture(t, 'é'.repeat(3000));
  for (const offset of [-1, 0.5, 1, 7000]) await assert.rejects(read({ offset }), /offset/);
  await assert.rejects(read({ offset: 0, find: 'é' }), /offset.*find/);
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
      returned: { matches: 50, truncated: count > 50,
        ...(count > 50 ? { hint: "Search results were truncated; narrow the find pattern and reduce context." } : {}),
      },
    });
  }
});

test("find caps a minified single line while retaining a match away from the start", async (t) => {
  const content = "x".repeat(980_000) + "needle" + "y".repeat(10_000);
  const result = await fixture(t, content).read({ find: "needle" }) as {
    content: string; totalLines: number; totalBytes: number;
    returned: { truncated: boolean; hint: string };
  };
  assert.ok(result.content.length <= 2_000);
  assert.ok(result.content.includes("needle"));
  assert.equal(result.totalLines, 1);
  assert.equal(result.totalBytes, content.length);
  assert.equal(result.returned.truncated, true);
  assert.match(result.returned.hint, /narrow the find pattern/);
});

test("find distinguishes an exact window cap from omitted text", async (t) => {
  for (const length of [2_000, 2_001]) {
    const result = await fixture(t, "needle" + "x".repeat(length - 6)).read({ find: "needle" }) as {
      content: string; returned: { truncated: boolean };
    };
    assert.equal(result.content.length, 2_000);
    assert.equal(result.returned.truncated, length > 2_000);
  }
});

test("find caps all windows per item and all find content in a maximum-sized batch", async (t) => {
  const content = ("x".repeat(3_000) + "needle" + "y".repeat(3_000) + "\nspacer\n").repeat(3);
  const { registration } = fixture(t, content);
  const [batched] = applyBatchInputs({ registrations: [registration] });
  assert.ok(batched);
  const { executeRegisteredTool } = await import('../../../assistant/__tests__/fixtures/execute-registered-tool.js');
  const execution = await executeRegisteredTool({ registration: batched,
    input: { themeId: "plain", find: "needle", context: 0,
      items: Array.from({ length: 20 }, () => ({ path: "sample.txt" })),
    },
  });
  assert.equal(execution.status, 'completed');
  const result = execution.output as BatchResult;
  assert.equal(result.succeeded, 20);
  let totalChars = 0;
  for (const item of result.results) {
    assert.equal(item.ok, true);
    if (!item.ok) continue;
    const read = item.result as { content: string; returned: { truncated: boolean; hint: string } };
    assert.equal(read.content.length, 4_000);
    assert.equal(read.returned.truncated, true);
    assert.match(read.returned.hint, /narrow the find pattern/);
    totalChars += read.content.length;
  }
  assert.ok(totalChars <= 80_000);
  const refused = await executeRegisteredTool({ registration: batched,
    input: { items: Array.from({ length: 21 }, () => ({ themeId: "plain", path: "sample.txt", find: "needle" })) },
  });
  assert.equal(refused.errorKind, 'validation');
  assert.match(refused.error!, /most one call takes is 20/);
});

test("theme file descriptions make find discoverable as the existing text search", (t) => {
  const { registration } = fixture(t, "one");
  assert.match(registration.descriptor.description ?? "", /search or grep text inside theme files.*theme_read_file with find/);
  assert.match(registration.descriptor.description ?? "", /returned\.truncated.*returned\.hint.*narrow the find pattern/);
  const listing = getThemesAgentToolCatalog().find((tool) => tool.name === "theme_list_files");
  assert.match(listing?.description ?? "", /search text inside theme files.*theme_read_file with find/);
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

test("t02: find accepts either window param and confines matches and context to the range", async (t) => {
  const { read } = fixture(t, "one\ntwo\none\n");
  for (const window of [{ startLine: 1 }, { lineCount: 1 }]) {
    const result = await read({ find: "one", ...window }) as { content: string; returned: { matches: number } };
    assert.equal(result.returned.matches, "lineCount" in window ? 1 : 2);
    assert.equal(result.content, "lineCount" in window ? "one\n" : "one\ntwo\none\n");
  }
  const result = await read({ find: "one", startLine: 2, lineCount: 1 }) as { content: string; returned: { matches: number } };
  assert.equal(result.content, "");
  assert.equal(result.returned.matches, 0);
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
    [{ context: 1.5 }, "theme_read_file: context must be an integer from 0 to 20."],
    [{ find: "x".repeat(201) }, "theme_read_file: find must be a string of at most 200 characters."],
    [{ find: 3 }, "theme_read_file: find must be a string of at most 200 characters."],
  ] as const)
    await assert.rejects(
      read(input),
      (error: unknown) => error instanceof ToolInputError && error.message === message,
    );
});

test('find context above twenty is clamped with a note on only that batch item', async t => {
  const lines = Array.from({ length: 70 }, (_, i) => i === 35 ? 'function attachDeckViewer' : `line ${i + 1}`);
  const { registration } = fixture(t, lines.join('\n'));
  const batched = applyBatchInputs({ registrations: [registration] })[0]!;
  const input = { themeId: 'plain', path: 'sample.txt', items: [
    { find: 'function attachDeckViewer', context: 25 },
    { find: 'function attachDeckViewer', context: 20 },
    { find: 'function attachDeckViewer', context: -1 },
    { find: 'function attachDeckViewer', context: 25.5 },
  ] };
  const execution = await executeRegisteredTool({ registration: batched, input }, { principalId: 'owner' });
  assert.ok('output' in execution);
  const output = execution.output as BatchResult;
  assert.deepEqual(output.results.map(item => item.ok), [true, true, false, false]);
  const first = output.results[0]!;
  const second = output.results[1]!;
  assert.ok(first.ok && second.ok);
  const clamped = first.result as { content: string; normalizationNotes: string[] };
  const unchanged = second.result as { content: string; normalizationNotes?: string[] };
  assert.equal(clamped.content, unchanged.content);
  assert.equal(clamped.content.trimEnd().split('\n').length, 41);
  assert.ok(clamped.normalizationNotes.some(note => /context.*clamp.*20/i.test(note)));
  assert.equal(unchanged.normalizationNotes, undefined);
  assert.equal(input.items[0]!.context, 25);
  const schema = registration.descriptor.inputSchema as { properties: { context: { description: string } } };
  assert.match(schema.properties.context.description, /20/);
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

test('normalization: real find plus startLine searches to EOF; ambiguous find spelling fails', async t => {
  const { executeRegisteredTool } = await import('../../../assistant/__tests__/fixtures/execute-registered-tool.js');
  const { registration } = fixture(t, Array.from({ length: 2100 }, (_, index) => index === 2099 ? 'padding: 8px 0\n' : `line ${index}\n`).join(''), true, { themeId: 'open-heart', filePath: 'css/theme.css' });
  const input = { themeId: 'open-heart', path: 'css/theme.css', find: 'padding: 8px 0', startLine: 1 };
  const result = await executeRegisteredTool({ registration, input });
  assert.equal(result.status, 'completed');
  const output = result.output as { content: string; returned: { matches: number } };
  assert.equal(output.returned.matches, 1);
  assert.match(output.content, /padding: 8px 0/);
  const ambiguous = await executeRegisteredTool({ registration, input: { ...input, FIND: 'line' } });
  assert.equal(ambiguous.errorKind, 'validation');
  assert.match(ambiguous.error!, /Send only 'find'/);
});

test('delegated normalization: find with a string startLine reaches EOF through the real theme registration', async t => {
  const { executeDelegatedRegisteredTool, delegatedText } = await import('../../../assistant/__tests__/fixtures/execute-registered-tool.js');
  const { registration } = fixture(t, Array.from({ length: 2100 }, (_, index) => index === 2099 ? 'padding: 8px 0\n' : `line ${index}\n`).join(''), true, { themeId: 'open-heart', filePath: 'css/theme.css' });
  const input = { theme_id: 'open-heart', path: 'css/theme.css', find: 'padding: 8px 0', start_line: '1' };
  const reply = await executeDelegatedRegisteredTool({ registration, input });
  const visible = JSON.parse(delegatedText(reply));
  assert.equal(visible.status, 'completed');
  assert.equal(visible.output.returned.matches, 1);
  assert.match(visible.output.content, /padding: 8px 0/);
  assert.match(delegatedText(reply), /start_line→startLine/);
  const refused = await executeDelegatedRegisteredTool({ registration, input: { ...input, FIND: 'line' } });
  assert.equal(refused.isError, true);
  assert.match(delegatedText(refused), /Send only 'find'/);
});
