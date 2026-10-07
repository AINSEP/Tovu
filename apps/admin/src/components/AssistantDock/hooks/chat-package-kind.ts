/** ZIP names are a routing hint, never install validation. Read only the bounded central directory:
 * deflated payloads need no decompression, and malformed/ZIP64 archives remain ordinary attachments.
 * Generic ZIP name inspection is tracked for Jini extraction (Jini is read-only in this dispatch).
 */
export async function chatPackageKind(
  { file }: { file: File },
  _optional: Record<string, never> = {},
): Promise<"skill" | "site-plugin" | "agent-plugin" | "attachment"> {
  if (file.name === "SKILL.md") return "skill";
  if (!file.name.toLowerCase().endsWith(".zip")) return "attachment";
  try {
    const tailStart = Math.max(0, file.size - 65557);
    const tail = new Uint8Array(await file.slice(tailStart).arrayBuffer());
    const end = new DataView(tail.buffer);
    let eocd = tail.length - 22;
    for (; eocd >= 0; eocd--) {
      if (end.getUint32(eocd, true) === 0x06054b50 && eocd + 22 + end.getUint16(eocd + 20, true) === tail.length) break;
    }
    if (eocd < 0 || end.getUint16(eocd + 4, true) !== 0 || end.getUint16(eocd + 6, true) !== 0) return "attachment";
    const count = end.getUint16(eocd + 10, true);
    const size = end.getUint32(eocd + 12, true), offset = end.getUint32(eocd + 16, true);
    if (count > 4096 || count !== end.getUint16(eocd + 8, true) || size > 1024 * 1024 || offset + size !== tailStart + eocd) return "attachment";
    const bytes = new Uint8Array(await file.slice(offset, offset + size).arrayBuffer());
    const view = new DataView(bytes.buffer), names = new Set<string>();
    let cursor = 0;
    for (let i = 0; i < count; i++) {
      if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) return "attachment";
      const length = view.getUint16(cursor + 28, true);
      const next = cursor + 46 + length + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
      if (next > bytes.length) return "attachment";
      const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + length)).replaceAll("\\", "/").replace(/^\.\//, "");
      if (/^(?:[^/]+\/)?(?:SKILL\.md|tovu\.plugin\.json|plugin\.json)$/.test(name) && !name.startsWith("__MACOSX/")) names.add(name.split("/").at(-1)!);
      cursor = next;
    }
    if (cursor !== bytes.length) return "attachment";
    // A plugin may bundle skills. Its manifest takes precedence so it can reach the assistant.
    if (names.has("tovu.plugin.json")) return "site-plugin";
    if (names.has("plugin.json")) return "agent-plugin";
    return names.has("SKILL.md") ? "skill" : "attachment";
  } catch {
    return "attachment";
  }
}

/** Jini annotates expanded browser folders with relativePath. Keep a skill's companion files
 * together, but let a plugin manifest at that folder root override all its bundled SKILL.md files. */
export async function partitionChatPackages(
  { files }: { files: readonly File[] },
  _optional: Record<string, never> = {},
): Promise<{ skills: File[]; attachments: File[] }> {
  const paths = files.map(file => ((file as File & { relativePath?: string }).relativePath || file.webkitRelativePath || "").replaceAll("\\", "/"));
  const roots = paths.map(value => value.includes("/") ? value.slice(0, value.indexOf("/") + 1) : "");
  const pluginRoots = new Set(roots.filter((root, index) => root && (paths[index] === `${root}plugin.json` || paths[index] === `${root}tovu.plugin.json`)));
  const skillRoots = new Set(roots.filter((root, index) => root && files[index]!.name === "SKILL.md" && !pluginRoots.has(root)));
  const kinds = await Promise.all(files.map(file => chatPackageKind({ file })));
  const skills: File[] = [], attachments: File[] = [];
  files.forEach((file, index) => {
    const root = roots[index]!;
    const isSkill = root && pluginRoots.has(root) ? false : (root && skillRoots.has(root)) || kinds[index] === "skill";
    (isSkill ? skills : attachments).push(file);
  });
  return { skills, attachments };
}
