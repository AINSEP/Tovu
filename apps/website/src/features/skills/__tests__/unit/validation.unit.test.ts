import assert from "node:assert/strict";
import test from "node:test";
import { decodeSkillBase64, SkillInputError, validateSkillFiles, validateSkillMarkdown, validateSkillPath } from "../../validation.js";

// Direct tests for the skill package validator. install-service.unit.test.ts covers a handful of
// refusals end to end; these pin every rule, its exact message and the accepted shapes.
const MD = "---\nname: incident-response\ndescription: Respond to outages.\n---\nBody\n";
const b64 = (content: string | Buffer) => Buffer.from(content).toString("base64");
const file = (path: string, content: string | Buffer = "text") => ({ path, contentBase64: b64(content) });
const refuses = (fn: () => unknown, message: string) => assert.throws(fn, (error: unknown) => error instanceof SkillInputError && error.message === message);

test("decodeSkillBase64 returns the exact bytes of canonical base64", () => {
  assert.equal(decodeSkillBase64("aGVsbG8=").toString("utf8"), "hello");
  assert.equal(decodeSkillBase64("aGk=").toString("utf8"), "hi");
  assert.equal(decodeSkillBase64("").length, 0);
});

test("decodeSkillBase64 refuses malformed encodings instead of decoding them to something else", () => {
  for (const value of ["aGVsbG8", "aGVsbG8*", "aGVs bG8=", "aGVsbG8==", "a===", "aGVsbG8=\n"]) refuses(() => decodeSkillBase64(value), "Skill upload must use valid base64.");
});

test("decodeSkillBase64 enforces the byte limit on both the encoded length and the decoded bytes", () => {
  refuses(() => decodeSkillBase64("aGVsbG8=", 3), "Skill upload exceeds its size limit.");
  // 8 characters are allowed for 4 bytes, but they decode to 5.
  refuses(() => decodeSkillBase64("aGVsbG8=", 4), "Skill upload exceeds its size limit.");
  assert.equal(decodeSkillBase64("aGVsbG8=", 5).toString("utf8"), "hello");
  refuses(() => decodeSkillBase64(42 as unknown as string), "Skill upload exceeds its size limit.");
});

test("validateSkillPath accepts plain relative paths up to 240 characters", () => {
  for (const path of ["SKILL.md", "references/a-b_c.md", "a".repeat(240)]) assert.doesNotThrow(() => validateSkillPath(path), path);
});

test("validateSkillPath refuses absolute, traversal, hidden, empty-segment, control and drive-like paths", () => {
  for (const path of ["", "a".repeat(241), "/etc/passwd", "a//b", "a/", "./a", "a/../b", "..", ".hidden", "refs/.git/config", "a\\b", "a\u0000b", "a\nb", "a\u007fb", "C:/x"]) {
    refuses(() => validateSkillPath(path), `Unsafe skill file path: ${path}`);
  }
  refuses(() => validateSkillPath(7 as unknown as string), "Unsafe skill file path: 7");
});

test("validateSkillMarkdown returns the name and whitespace-collapsed description", () => {
  assert.deepEqual(validateSkillMarkdown(MD), { name: "incident-response", description: "Respond to outages." });
  assert.deepEqual(validateSkillMarkdown("---\r\nname: a1-b2\r\ndescription: |\r\n  Line one\r\n    line two\r\n---"), { name: "a1-b2", description: "Line one line two" });
  assert.deepEqual(validateSkillMarkdown(`---\nname: ${"a".repeat(64)}\ndescription: ${"d".repeat(1024)}\n---\n`), { name: "a".repeat(64), description: "d".repeat(1024) });
});

test("validateSkillMarkdown refuses missing, invalid or incomplete frontmatter", () => {
  const missing = "SKILL.md must have YAML frontmatter with a name and description.";
  for (const markdown of ["name: a\ndescription: b\n", "--- \nname: a\n---\n", "---\njust a scalar\n---\n", "---\nname: [a]\ndescription: b\n---\n", "---\nname: a\n---\n", "---\nname: a\ndescription: '  '\n---\n", "---\n---\n"]) refuses(() => validateSkillMarkdown(markdown), missing);
  refuses(() => validateSkillMarkdown("---\nname: [unclosed\ndescription: b\n---\n"), "SKILL.md must have valid YAML frontmatter.");
});

test("validateSkillMarkdown enforces the skill name grammar and the description limit", () => {
  const nameRule = "Skill name must use lowercase letters, digits and single hyphens (1–64 characters).";
  for (const name of ["a".repeat(65), "Bad", "a_b", "a--b", "-a", "a-", "''"]) refuses(() => validateSkillMarkdown(`---\nname: ${name}\ndescription: ok\n---\n`), nameRule);
  refuses(() => validateSkillMarkdown(`---\nname: a\ndescription: ${"d".repeat(1025)}\n---\n`), "Skill description exceeds 1024 characters.");
});

test("validateSkillFiles strips the selected folder prefix and returns the decoded files", () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
  const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP")]);
  const jpeg = Buffer.from([255, 216, 255, 0]);
  const result = validateSkillFiles([
    file("pkg/SKILL.md", MD), file("pkg/README.md", "# Read"), file("pkg/LICENSE", "MIT"), file("pkg/references/check.md", "Check"),
    file("pkg/scripts/run.sh", "echo"), file("pkg/assets/a.png", png), file("pkg/assets/b.WEBP", webp), file("pkg/assets/c.JPEG", jpeg), file("pkg/assets/d.jpg", jpeg), file("pkg/assets/e.svg", "<svg/>"),
  ]);
  assert.equal(result.name, "incident-response");
  assert.equal(result.description, "Respond to outages.");
  assert.deepEqual([...result.files.keys()], ["SKILL.md", "README.md", "LICENSE", "references/check.md", "scripts/run.sh", "assets/a.png", "assets/b.WEBP", "assets/c.JPEG", "assets/d.jpg", "assets/e.svg"]);
  assert.equal(result.files.get("references/check.md")!.toString("utf8"), "Check");
  assert.deepEqual(result.files.get("assets/a.png"), png);
});

test("validateSkillFiles requires 1..256 files and exactly one SKILL.md folder", () => {
  for (const upload of [[], "nope", Array.from({ length: 257 }, (_, i) => file(`references/${i}.md`))]) refuses(() => validateSkillFiles(upload as never), "A skill must contain 1–256 files.");
  refuses(() => validateSkillFiles([file("references/a.md")]), "Choose one skill folder containing a single SKILL.md.");
  refuses(() => validateSkillFiles([file("a/SKILL.md", MD), file("b/SKILL.md", MD)]), "Choose one skill folder containing a single SKILL.md.");
  refuses(() => validateSkillFiles([file("a/SKILL.md", MD), file("a/SKILL.md", MD)]), "Duplicate skill file path: a/SKILL.md");
  refuses(() => validateSkillFiles([file("a/SKILL.md", MD), file("../x.md")]), "Unsafe skill file path: ../x.md");
  refuses(() => validateSkillFiles([file("pkg/SKILL.md", MD), file("other/references/a.md")]), "All files must belong to the selected skill folder.");
  refuses(() => validateSkillFiles([file("SKILL.md", MD), file("references/a.md"), file("references/a.md")]), "Duplicate skill file path: references/a.md");
});

test("validateSkillFiles allows only the documented locations and file types", () => {
  refuses(() => validateSkillFiles([file("SKILL.md", MD), file("notes.md")]), "Unsupported skill file location: notes.md");
  refuses(() => validateSkillFiles([file("SKILL.md", MD), file("src/a.md")]), "Unsupported skill file location: src/a.md");
  refuses(() => validateSkillFiles([file("SKILL.md", MD), file("scripts/run.exe")]), "Unsupported skill file type: scripts/run.exe");
  refuses(() => validateSkillFiles([file("SKILL.md", MD), file("references/pic.png", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))]), "Unsupported skill file type: references/pic.png");
  refuses(() => validateSkillFiles([file("SKILL.md", MD), file("references/NOTICE")]), "Unsupported skill file type: references/NOTICE");
});

test("validateSkillFiles checks asset magic bytes and text encoding", () => {
  for (const [path, bytes] of [["assets/a.png", Buffer.from("not a png")], ["assets/a.webp", Buffer.from("RIFF0000WEBX")], ["assets/b.webp", Buffer.from("RIFX0000WEBP")], ["assets/a.jpg", Buffer.from([255, 216, 0])]] as const) {
    refuses(() => validateSkillFiles([file("SKILL.md", MD), file(path, bytes)]), `Skill asset content does not match its file type: ${path}`);
  }
  refuses(() => validateSkillFiles([file("SKILL.md", MD), file("references/a.md", Buffer.from([0xc3, 0x28]))]), "Skill text file must be valid UTF-8 without null bytes: references/a.md");
  refuses(() => validateSkillFiles([file("SKILL.md", MD), file("LICENSE", Buffer.from([0xff]))]), "Skill text file must be valid UTF-8 without null bytes: LICENSE");
  refuses(() => validateSkillFiles([file("SKILL.md", MD), file("scripts/a.py", "ok\u0000")]), "Skill text file must be valid UTF-8 without null bytes: scripts/a.py");
});

test("validateSkillFiles enforces the per-file and SKILL.md size limits", () => {
  refuses(() => validateSkillFiles([file("SKILL.md", MD), file("references/big.md", "a".repeat(1024 * 1024 + 1))]), "Skill upload exceeds its size limit.");
  assert.doesNotThrow(() => validateSkillFiles([file("SKILL.md", MD), file("references/max.md", "a".repeat(1024 * 1024))]));
  assert.doesNotThrow(() => validateSkillFiles([file("SKILL.md", MD + "a".repeat(128 * 1024 - Buffer.byteLength(MD)))]));
  refuses(() => validateSkillFiles([file("SKILL.md", MD + "a".repeat(128 * 1024 - Buffer.byteLength(MD) + 1))]), "SKILL.md exceeds 128 KiB.");
});

test("validateSkillFiles refuses packages over 8 MiB combined even when each file fits", () => {
  const files = [file("SKILL.md", MD), ...Array.from({ length: 8 }, (_, i) => file(`references/${i}.md`, "a".repeat(1024 * 1024)))];
  refuses(() => validateSkillFiles(files), "Skill files exceed 8 MiB combined.");
  assert.doesNotThrow(() => validateSkillFiles(files.slice(0, 8)));
});

test("validateSkillFiles validates the SKILL.md frontmatter after the package checks", () => {
  refuses(() => validateSkillFiles([file("SKILL.md", "no frontmatter")]), "SKILL.md must have YAML frontmatter with a name and description.");
});
